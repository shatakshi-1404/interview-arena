"""Deterministic checks that run on every model output, because a prompt is a request, not a guarantee."""
from __future__ import annotations

import re

from app.models.question import Question, QuestionType

_WORD = re.compile(r"[a-z0-9_]+")
NGRAM = 8  # copying 8 consecutive tokens of a private reference counts as leaking it


def _tokens(text: str) -> list[str]:
    return _WORD.findall(text.lower())


def _copies_ngram(reference: str, hint: str, n: int = NGRAM) -> bool:
    ref, hnt = _tokens(reference), _tokens(hint)
    if len(ref) < n or len(hnt) < n:
        return False
    grams = {tuple(ref[i : i + n]) for i in range(len(ref) - n + 1)}
    return any(tuple(hnt[i : i + n]) in grams for i in range(len(hnt) - n + 1))


def _fenced_lines(text: str) -> int:
    return max((len(b.strip().splitlines()) for b in re.findall(r"```(.*?)```", text, re.S)), default=0)


def leaks_answer(q: Question, hint: str) -> bool:
    """True if the hint gives away what a hint must not: the correct option, the SQL solution, the model answer,
    or a whole program."""
    t = q.question_type
    if t == QuestionType.MCQ:
        h = " ".join(_tokens(hint))
        for o in q.options:
            if o.is_correct:
                ot = " ".join(_tokens(o.text))
                if len(ot) >= 4 and re.search(rf"\b{re.escape(ot)}\b", h):
                    return True
        return False
    if t == QuestionType.SQL:
        return bool(q.sql_challenge and _copies_ngram(q.sql_challenge.solution_query, hint, 6)) or _fenced_lines(hint) > 6
    if t == QuestionType.SHORT_ANSWER:
        return bool(q.reference_answer and _copies_ngram(q.reference_answer.model_answer, hint))
    return _fenced_lines(hint) > 6  # CODING: a long code block is a solution, not a hint
