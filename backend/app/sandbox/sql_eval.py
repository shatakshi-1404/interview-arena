"""Isolated SQL evaluation against a controlled dataset.

Layers (any one of them stops a write or an escape on its own):
  1. static validation: one SELECT/WITH statement, denylisted keywords and functions
  2. a throwaway schema per evaluation, destroyed by ROLLBACK
  3. READ ONLY transaction (cannot be flipped back after the first query)
  4. execution under the no-privilege `sql_sandbox` role
  5. statement timeout + server-side cursor row cap
Production hardening: point DATABASE_URL for evaluation at a separate, resource-limited database.
"""
import json
import logging
import math
import re
import time
import uuid
from dataclasses import dataclass, field
from datetime import date, datetime
from datetime import time as dtime
from decimal import Decimal
from typing import Any

import psycopg
from psycopg import errors as pg_errors

from app.core.config import settings

logger = logging.getLogger(__name__)

SANDBOX_ROLE = "sql_sandbox"
MAX_QUERY_CHARS = 5000
MAX_ROWS = 200
STATEMENT_TIMEOUT_MS = 3000

_FORBIDDEN_WORDS = re.compile(
    r"\b(insert|update|delete|drop|alter|create|truncate|grant|revoke|copy|call|do|set|reset|"
    r"vacuum|analyze|lock|listen|notify|into)\b",
    re.I,
)
_FORBIDDEN_FUNCS = re.compile(
    r"\b(pg_sleep\w*|set_config|pg_read\w*|pg_ls\w*|lo_\w+|dblink\w*|pg_terminate\w*|"
    r"pg_cancel\w*|pg_advisory\w*)",
    re.I,
)


class UnsafeQuery(ValueError):
    """The query was rejected before it ever reached the database."""


class MisconfiguredChallenge(RuntimeError):
    """The question's own dataset or reference solution is broken (an admin problem, not the user's)."""


@dataclass
class Table:
    columns: list[str]
    rows: list[list[Any]]
    truncated: bool = False


@dataclass
class SqlOutcome:
    correct: bool = False
    error: str | None = None
    timed_out: bool = False
    note: str | None = None
    expected: Table | None = None
    actual: Table | None = None
    execution_ms: int | None = None


# ----------------------------------------------------------- validation
def _blank(sql: str) -> str:
    """Same-length copy of `sql` with comments and quoted contents replaced by spaces."""
    out = list(sql)
    i, n = 0, len(sql)
    while i < n:
        c = sql[i]
        nx = sql[i + 1] if i + 1 < n else ""
        if c == "-" and nx == "-":
            j = sql.find("\n", i)
            j = n if j == -1 else j
            for k in range(i, j):
                out[k] = " "
            i = j
        elif c == "/" and nx == "*":
            j = sql.find("*/", i + 2)
            if j == -1:
                raise UnsafeQuery("Unterminated comment")
            if "/*" in sql[i + 2 : j]:
                raise UnsafeQuery("Nested comments are not supported")
            for k in range(i, j + 2):
                out[k] = " "
            i = j + 2
        elif c in ("'", '"'):
            j = i + 1
            while True:
                j = sql.find(c, j)
                if j == -1:
                    raise UnsafeQuery("Unterminated quoted string or identifier")
                if j + 1 < n and sql[j + 1] == c:  # doubled quote = escaped quote
                    j += 2
                    continue
                break
            for k in range(i + 1, j):
                out[k] = " "
            i = j + 1
        else:
            i += 1
    return "".join(out)


def validate_query(sql: str) -> str:
    """Returns the query without a trailing semicolon, or raises UnsafeQuery."""
    if not sql or not sql.strip():
        raise UnsafeQuery("Query is empty")
    if len(sql) > MAX_QUERY_CHARS:
        raise UnsafeQuery(f"Query is longer than {MAX_QUERY_CHARS} characters")
    if "\\" in sql or "\x00" in sql:
        raise UnsafeQuery("Backslashes are not allowed in queries")
    blanked = _blank(sql)
    if "$" in blanked:
        raise UnsafeQuery("Dollar-quoting and parameters are not allowed")
    end = len(blanked.rstrip())
    cut = end - 1 if end and blanked[end - 1] == ";" else len(sql)
    head = blanked[:cut]
    if ";" in head:
        raise UnsafeQuery("Only a single statement is allowed")
    if not re.match(r"\s*(select|with)\b", head, re.I):
        raise UnsafeQuery("Only SELECT queries are allowed")
    if _FORBIDDEN_WORDS.search(head) or _FORBIDDEN_FUNCS.search(head):
        raise UnsafeQuery("Query uses a statement or function that is not allowed")
    cleaned = sql[:cut].strip()
    if not cleaned:
        raise UnsafeQuery("Query is empty")
    return cleaned


# ------------------------------------------------------------- plumbing
_role_ready = False


def _dsn() -> str:
    return settings.DATABASE_URL.replace("postgresql+psycopg://", "postgresql://", 1)


def _ensure_role() -> None:
    global _role_ready
    if _role_ready:
        return
    with psycopg.connect(_dsn(), autocommit=True, connect_timeout=5) as c:
        c.execute(
            f"""DO $$ BEGIN
                  CREATE ROLE {SANDBOX_ROLE} NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE;
                EXCEPTION WHEN duplicate_object THEN NULL; END $$"""
        )
    _role_ready = True


def _msg(e: psycopg.Error) -> str:
    diag = getattr(e, "diag", None)
    text = (diag.message_primary if diag and diag.message_primary else str(e)).strip()
    return text.splitlines()[0][:300] if text else "Query failed"


def _canon(v: Any) -> Any:
    if v is None or isinstance(v, (bool, str, int)):
        return v
    if isinstance(v, (float, Decimal)):
        f = float(v)
        if not math.isfinite(f):
            return str(f)
        f = round(f, 6)
        return int(f) if f.is_integer() else f
    if isinstance(v, (datetime, date, dtime)):
        return v.isoformat()
    if isinstance(v, (bytes, bytearray, memoryview)):
        return bytes(v).hex()
    if isinstance(v, (list, tuple)):
        return [_canon(x) for x in v]
    if isinstance(v, dict):
        return {str(k): _canon(x) for k, x in v.items()}
    return str(v)


def _key(row: list[Any]) -> str:
    return json.dumps(row, sort_keys=True, default=str)


def _fetch(conn: psycopg.Connection, query: str, cursor_name: str) -> tuple[Table, int]:
    start = time.perf_counter()
    with conn.cursor(name=cursor_name) as cur:  # server-side: never buffers more than MAX_ROWS+1 rows
        cur.execute(query)
        raw = cur.fetchmany(MAX_ROWS + 1)
        columns = [d.name for d in (cur.description or [])]
    ms = int((time.perf_counter() - start) * 1000)
    rows = [[_canon(v) for v in r] for r in raw[:MAX_ROWS]]
    return Table(columns, rows, truncated=len(raw) > MAX_ROWS), ms


def _compare(exp: Table, act: Table, order_matters: bool) -> tuple[bool, str | None]:
    if len(exp.columns) != len(act.columns):
        return False, f"Expected {len(exp.columns)} column(s) but your query returned {len(act.columns)}."
    if exp.truncated or act.truncated:
        return False, f"Results are limited to {MAX_ROWS} rows."
    ek, ak = [_key(r) for r in exp.rows], [_key(r) for r in act.rows]
    if not order_matters:
        ek.sort()
        ak.sort()
    if ek == ak:
        return True, None
    if len(ek) != len(ak):
        return False, f"Expected {len(ek)} row(s) but your query returned {len(ak)}."
    return False, None


# ------------------------------------------------------------- evaluate
def evaluate(
    *,
    schema_sql: str,
    seed_sql: str,
    solution_query: str,
    user_query: str,
    order_matters: bool,
) -> SqlOutcome:
    out = SqlOutcome()
    try:
        user_q = validate_query(user_query)
    except UnsafeQuery as e:
        out.error = str(e)
        return out
    try:
        solution_q = validate_query(solution_query)
    except UnsafeQuery as e:
        raise MisconfiguredChallenge(f"Reference solution rejected: {e}")

    _ensure_role()
    schema = f"sqleval_{uuid.uuid4().hex[:16]}"  # generated here, never user input

    with psycopg.connect(_dsn(), connect_timeout=5) as conn:
        try:
            conn.execute(f"SET LOCAL statement_timeout = {STATEMENT_TIMEOUT_MS}")
            conn.execute("SET LOCAL lock_timeout = 1000")
            conn.execute(f'CREATE SCHEMA "{schema}"')
            conn.execute(f'SET LOCAL search_path TO "{schema}", pg_catalog')
            try:
                conn.execute(schema_sql)
                conn.execute(seed_sql)
            except psycopg.Error as e:
                raise MisconfiguredChallenge(f"Dataset failed to load: {_msg(e)}")
            conn.execute(f'GRANT USAGE ON SCHEMA "{schema}" TO {SANDBOX_ROLE}')
            conn.execute(f'GRANT SELECT ON ALL TABLES IN SCHEMA "{schema}" TO {SANDBOX_ROLE}')
            conn.execute("SET LOCAL transaction_read_only = on")
            conn.execute(f"SET LOCAL ROLE {SANDBOX_ROLE}")

            try:
                out.expected, _ = _fetch(conn, solution_q, "sol")
            except psycopg.Error as e:
                raise MisconfiguredChallenge(f"Reference solution failed: {_msg(e)}")

            try:
                out.actual, out.execution_ms = _fetch(conn, user_q, "usr")
            except pg_errors.QueryCanceled:
                out.timed_out = True
                out.error = f"Query exceeded the {STATEMENT_TIMEOUT_MS // 1000}s time limit"
                return out
            except psycopg.Error as e:
                out.error = _msg(e)
                return out

            out.correct, out.note = _compare(out.expected, out.actual, order_matters)
            return out
        finally:
            try:
                conn.rollback()  # drops the schema and everything in it
            except psycopg.Error:
                pass
