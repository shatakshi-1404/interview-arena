import pytest
from sqlalchemy import text

from app.sandbox import sql_eval
from app.sandbox.sql_eval import UnsafeQuery, evaluate, validate_query
from tests.conftest import engine

SCHEMA = "CREATE TABLE employees (id int primary key, name text, salary int);"
SEED = "INSERT INTO employees VALUES (1,'A',100),(2,'B',200),(3,'C',200),(4,'D',50);"
SOLUTION = "SELECT MAX(salary) AS second_highest FROM employees WHERE salary < (SELECT MAX(salary) FROM employees)"


def run(query, solution=SOLUTION, order=False):
    return evaluate(schema_sql=SCHEMA, seed_sql=SEED, solution_query=solution, user_query=query, order_matters=order)


# ------------------------------------------------------------ validation
@pytest.mark.parametrize(
    "sql",
    [
        "SELECT 1",
        "select 1;",
        "-- note\nSELECT 'a;b' AS \"x;y\"",
        "SELECT 'it''s; fine'",
        "WITH a AS (SELECT 1 AS n) SELECT * FROM a",
        "SELECT created_at, updated_at FROM t",
    ],
)
def test_valid_queries_pass(sql):
    assert validate_query(sql)


@pytest.mark.parametrize(
    "sql",
    [
        "",
        "   ",
        "DROP TABLE employees",
        "UPDATE employees SET salary = 0",
        "SELECT 1; DROP TABLE employees",
        "SELECT * INTO copy FROM employees",
        "SELECT pg_sleep(10)",
        "SELECT set_config('role', 'none', true)",
        "WITH x AS (DELETE FROM employees RETURNING *) SELECT * FROM x",
        "SELECT $$a$$",
        "SELECT E'\\'' ; DELETE FROM employees; SELECT '",
        "SELECT 1 FROM employees FOR UPDATE",
        "SELECT /* unterminated",
        "x" * 6000,
    ],
)
def test_unsafe_queries_rejected(sql):
    with pytest.raises(UnsafeQuery):
        validate_query(sql)


# ------------------------------------------------------------ evaluation
def test_correct_answer_with_different_alias_and_style():
    out = run("SELECT DISTINCT salary FROM employees ORDER BY salary DESC LIMIT 1 OFFSET 1")
    assert out.correct and out.error is None
    assert out.expected.rows == [[100]] and out.actual.rows == [[100]]
    assert out.execution_ms is not None


def test_wrong_answer():
    out = run("SELECT MAX(salary) FROM employees")
    assert not out.correct and out.error is None
    assert out.actual.rows == [[200]]


def test_column_count_mismatch_has_note():
    out = run("SELECT id, salary FROM employees")
    assert not out.correct and "column" in out.note


def test_row_order_only_matters_when_requested():
    sol = "SELECT name FROM employees ORDER BY name"
    reversed_q = "SELECT name FROM employees ORDER BY name DESC"
    assert run(reversed_q, solution=sol, order=False).correct
    assert not run(reversed_q, solution=sol, order=True).correct


def test_numeric_types_compare_by_value():
    out = run("SELECT AVG(salary)::numeric(10,4) FROM employees", solution="SELECT 137.5")
    assert out.correct


def test_syntax_and_missing_table_errors_are_reported():
    assert "syntax" in run("SELEC 1").error.lower()
    assert "does not exist" in run("SELECT * FROM nope").error


def test_cannot_read_application_tables():
    out = run("SELECT * FROM public.users")
    assert not out.correct and "permission denied" in out.error.lower()


def test_timeout():
    out = run("SELECT count(*) FROM generate_series(1, 100000000000)")
    assert out.timed_out and "time limit" in out.error


def test_result_row_cap():
    out = run("SELECT * FROM generate_series(1, 1000)", solution="SELECT * FROM generate_series(1, 1000)")
    assert out.actual.truncated and not out.correct  # oversized results never pass


def test_no_schemas_left_behind():
    run("SELECT 1")
    run("SELEC broken")
    with engine.connect() as c:
        n = c.execute(text("SELECT count(*) FROM pg_namespace WHERE nspname LIKE 'sqleval%'")).scalar()
    assert n == 0


def test_broken_dataset_is_a_challenge_error():
    with pytest.raises(sql_eval.MisconfiguredChallenge):
        evaluate(schema_sql="CREATE TABLE", seed_sql="", solution_query="SELECT 1", user_query="SELECT 1", order_matters=False)
