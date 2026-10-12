"""Mock-interview planning: role and level profiles, question selection, report helpers.
Pure Python: no DB, no HTTP, no ORM."""
from __future__ import annotations

import random
from collections import Counter
from collections.abc import Iterable
from dataclasses import dataclass

from app.ml import features as F
from app.ml import recommender
from app.ml.recommender import Candidate

DURATIONS = (15, 30, 45, 60)
MIN_QUESTIONS = 3
POINTS = {"EASY": 1, "MEDIUM": 2, "HARD": 3}
TYPE_ORDER = {"MCQ": 0, "SHORT_ANSWER": 1, "SQL": 2, "CODING": 3}
DIFF_ORDER = {d: i for i, d in enumerate(F.DIFFICULTIES)}
VARIETY_TYPES = ("SQL", "SHORT_ANSWER", "CODING")


@dataclass(frozen=True)
class RoleSpec:
    label: str
    weights: dict[str, float]  # relative emphasis per category (all 8 present)


@dataclass(frozen=True)
class LevelSpec:
    label: str
    description: str
    mix: dict[str, float]  # target share of each difficulty


ROLES: dict[str, RoleSpec] = {
    "BACKEND_ENGINEER": RoleSpec("Backend Engineer", {
        "DSA": 3, "SQL": 2, "DBMS": 2, "OS": 1.5, "OOP": 1.5, "CN": 1, "PROGRAMMING": 1, "SYSTEM_DESIGN": 1}),
    "FULL_STACK_ENGINEER": RoleSpec("Full-Stack Engineer", {
        "DSA": 3, "SQL": 1.5, "DBMS": 1, "OS": 0.5, "OOP": 2, "CN": 1, "PROGRAMMING": 2, "SYSTEM_DESIGN": 1}),
    "SOFTWARE_ENGINEER": RoleSpec("Software Engineer (generalist)", {
        "DSA": 3, "SQL": 1, "DBMS": 1.5, "OS": 1.5, "OOP": 1.5, "CN": 1.5, "PROGRAMMING": 1, "SYSTEM_DESIGN": 1}),
    "DATA_ENGINEER": RoleSpec("Data Engineer", {
        "DSA": 2, "SQL": 3, "DBMS": 2.5, "OS": 0.5, "OOP": 0.5, "CN": 0.5, "PROGRAMMING": 1.5, "SYSTEM_DESIGN": 1}),
}

LEVELS: dict[str, LevelSpec] = {
    "BEGINNER": LevelSpec("Beginner", "Mostly easy questions to build fundamentals.",
                          {"EASY": 0.7, "MEDIUM": 0.3, "HARD": 0.0}),
    "INTERMEDIATE": LevelSpec("Intermediate", "A balanced mix with a few stretch questions.",
                              {"EASY": 0.2, "MEDIUM": 0.6, "HARD": 0.2}),
    "ADVANCED": LevelSpec("Advanced", "Mostly medium and hard questions.",
                          {"EASY": 0.0, "MEDIUM": 0.4, "HARD": 0.6}),
}


def question_count(duration_minutes: int) -> int:
    """About one question per three minutes, between 5 and 20."""
    return max(5, min(20, duration_minutes // 3))


def role_focus(role: str, n: int = 3) -> list[str]:
    weights = ROLES[role].weights
    top = sorted(weights, key=lambda c: (-weights[c], c))[:n]
    return [recommender.label(c) for c in top]


@dataclass(frozen=True)
class Selected:
    candidate: Candidate
    points: int


def select_questions(
    candidates: Iterable[Candidate],
    *,
    role: str,
    level: str,
    count: int,
    events: Iterable[F.Event] = (),
    focus_weak: bool = True,
    allowed_types: set[str] | None = None,
    rng: random.Random | None = None,
) -> list[Selected]:
    """Greedy, seeded selection. Deterministic for a given rng seed; returns [] if nothing is eligible."""
    rng = rng or random.Random()
    role_spec, level_spec = ROLES[role], LEVELS[level]
    events = list(events)
    solved = F.solved_question_ids(events)
    attempted = F.attempted_question_ids(events)

    pool = [c for c in candidates if allowed_types is None or c.question_type in allowed_types]
    fresh = [c for c in pool if c.id not in solved]
    if len(fresh) >= count:
        pool = fresh  # prefer questions the user has not solved; fall back only if the pool is too small
    count = min(count, len(pool))
    if count == 0:
        return []

    weights = dict(role_spec.weights)
    if focus_weak:
        for w in recommender.detect_weak_topics(events):
            if w.category in weights:
                weights[w.category] *= 1.5
    present = {c.category for c in pool}
    total = sum(weights.get(cat, 0.0) for cat in present)
    targets = (
        {cat: count * weights.get(cat, 0.0) / total for cat in present}
        if total > 0
        else {cat: count / len(present) for cat in present}
    )

    remaining = sorted(pool, key=lambda c: c.id)
    jitter = {c.id: rng.random() * 0.2 for c in remaining}  # tie-breaking variety, seeded
    chosen: list[Candidate] = []
    cat_n: Counter = Counter()
    diff_n: Counter = Counter()
    types: set[str] = set()

    def score(c: Candidate) -> float:
        cat_gap = max(-1.0, min(2.0, targets[c.category] - cat_n[c.category]))
        diff_gap = max(-1.0, min(2.0, level_spec.mix.get(c.difficulty, 0.0) * count - diff_n[c.difficulty]))
        variety = 0.6 if (c.question_type != "MCQ" and c.question_type not in types) else 0.0
        unseen = 0.3 if c.id not in attempted else 0.0
        return cat_gap + 0.5 * diff_gap + variety + unseen + jitter[c.id]

    while len(chosen) < count:
        best = max(remaining, key=lambda c: (score(c), -c.id))
        remaining.remove(best)
        chosen.append(best)
        cat_n[best.category] += 1
        diff_n[best.difficulty] += 1
        types.add(best.question_type)

    # Variety guarantee: a real interview mixes formats. Swap in a missing type for an over-represented MCQ.
    if count >= 6:
        for typ in VARIETY_TYPES:
            if any(c.question_type == typ for c in chosen):
                continue
            options = [c for c in remaining if c.question_type == typ]
            mcqs = [c for c in chosen if c.question_type == "MCQ"]
            if not options or not mcqs:
                continue
            counts = Counter(c.category for c in chosen)
            victim = max(mcqs, key=lambda c: (counts[c.category], c.id))
            pick = min(options, key=lambda c: (counts[c.category], c.id))
            chosen[chosen.index(victim)] = pick
            remaining.remove(pick)
            remaining.append(victim)

    chosen.sort(key=lambda c: (TYPE_ORDER.get(c.question_type, 9), DIFF_ORDER[c.difficulty], c.id))
    return [Selected(c, POINTS[c.difficulty]) for c in chosen]


# ----------------------------------------------------------------- report
def performance_band(percentage: float) -> str:
    return "Strong" if percentage >= 75 else "Solid" if percentage >= 55 else "Needs more practice"


def analyse_categories(rows: list[dict]) -> tuple[list[str], list[dict]]:
    """rows: [{key, correct, total, percentage}] -> (strength labels, focus areas with numeric reasons)."""
    strengths = [recommender.label(r["key"]) for r in rows if r["total"] >= 2 and r["percentage"] >= 75]
    focus = []
    for r in sorted(rows, key=lambda r: (r["percentage"], r["key"])):
        if r["percentage"] < 50:
            lab = recommender.label(r["key"])
            focus.append({
                "category": r["key"],
                "label": lab,
                "reason": f"You answered {r['correct']} of {r['total']} {lab} questions correctly in this interview.",
            })
    return strengths, focus
