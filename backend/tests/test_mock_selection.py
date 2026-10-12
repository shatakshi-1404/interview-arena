import random
from typing import get_args

from app.ml import features as F
from app.ml import interview as I
from app.ml.recommender import Candidate
from app.schemas.mock import MockStart
from tests.test_ml_features import ev


def cand(i, cat="DSA", diff="EASY", typ="MCQ", tags=()):
    return Candidate(i, f"Q{i}", cat, diff, typ, tuple(tags))


def big_pool(per=4):
    """per x 3 difficulties x 8 categories of MCQ, plus two each of SQL / SHORT_ANSWER / CODING."""
    out, i = [], 0
    for cat in F.CATEGORIES:
        for diff in F.DIFFICULTIES:
            for _ in range(per):
                i += 1
                out.append(cand(i, cat, diff))
    specials = [("SQL", "SQL"), ("SQL", "DBMS"), ("SHORT_ANSWER", "OS"), ("SHORT_ANSWER", "CN"),
                ("CODING", "DSA"), ("CODING", "PROGRAMMING")]
    out += [cand(1000 + k, cat, "MEDIUM", typ) for k, (typ, cat) in enumerate(specials)]
    return out


def pick(role="BACKEND_ENGINEER", level="INTERMEDIATE", count=10, seed=1, **kw):
    return I.select_questions(big_pool(), role=role, level=level, count=count, rng=random.Random(seed), **kw)


def ids(sel):
    return [s.candidate.id for s in sel]


def test_question_count_by_duration():
    assert [I.question_count(m) for m in I.DURATIONS] == [5, 10, 15, 20]


def test_tables_are_consistent_with_the_api_schema():
    for role in I.ROLES.values():
        assert set(role.weights) == set(F.CATEGORIES)
    for level in I.LEVELS.values():
        assert abs(sum(level.mix.values()) - 1.0) < 1e-9
    assert set(get_args(MockStart.model_fields["role"].annotation)) == set(I.ROLES)
    assert set(get_args(MockStart.model_fields["level"].annotation)) == set(I.LEVELS)
    assert get_args(MockStart.model_fields["duration_minutes"].annotation) == I.DURATIONS


def test_selection_is_unique_sized_and_seeded():
    a = pick(seed=3)
    assert len(a) == 10 and len(set(ids(a))) == 10
    assert ids(a) == ids(pick(seed=3))
    assert len({tuple(ids(pick(seed=s))) for s in range(6)}) > 1  # different seeds give different interviews
    assert all(s.points == I.POINTS[s.candidate.difficulty] for s in a)


def test_interview_flows_from_warmup_to_coding():
    keys = [(I.TYPE_ORDER[s.candidate.question_type], I.DIFF_ORDER[s.candidate.difficulty]) for s in pick()]
    assert keys == sorted(keys)


def test_real_interviews_mix_formats():
    for seed in range(5):
        types = {s.candidate.question_type for s in pick(seed=seed, count=10)}
        assert {"SQL", "SHORT_ANSWER", "CODING"} <= types


def test_allowed_types_are_respected():
    for s in pick(count=20, allowed_types={"MCQ", "SQL"}):
        assert s.candidate.question_type in {"MCQ", "SQL"}
    assert I.select_questions(big_pool(), role="BACKEND_ENGINEER", level="BEGINNER", count=5,
                              allowed_types={"NOPE"}) == []


def test_role_changes_the_topic_mix():
    def sql_count(role):
        return sum(sum(1 for s in pick(role=role, count=20, seed=sd) if s.candidate.category == "SQL")
                   for sd in range(4))
    assert sql_count("DATA_ENGINEER") > sql_count("SOFTWARE_ENGINEER")


def test_level_changes_the_difficulty_mix():
    def mix(level):
        sel = [s.candidate.difficulty for sd in range(4) for s in pick(level=level, count=20, seed=sd)]
        return sel.count("EASY"), sel.count("HARD")
    (beg_easy, beg_hard), (adv_easy, adv_hard) = mix("BEGINNER"), mix("ADVANCED")
    assert adv_hard > beg_hard and beg_easy > adv_easy


def test_weak_topics_get_more_questions():
    weak = [ev(i, False, cat="OS", qid=9000 + i) for i in range(5)]

    def os_total(focus):
        return sum(sum(1 for s in pick(role="SOFTWARE_ENGINEER", count=20, seed=sd, events=weak, focus_weak=focus)
                       if s.candidate.category == "OS") for sd in range(5))
    assert os_total(True) > os_total(False)


def test_solved_questions_are_avoided_when_alternatives_exist():
    solved = [ev(i, True, cat="DSA", qid=i) for i in range(1, 13)]
    for sd in range(3):
        assert not set(range(1, 13)) & set(ids(pick(count=10, seed=sd, events=solved)))


def test_small_pool_falls_back_to_solved_questions():
    pool = [cand(i) for i in range(1, 7)]
    solved = [ev(i, True, qid=i) for i in range(1, 7)]
    sel = I.select_questions(pool, role="BACKEND_ENGINEER", level="BEGINNER", count=5, events=solved,
                             rng=random.Random(1))
    assert len(sel) == 5
    assert I.select_questions([], role="BACKEND_ENGINEER", level="BEGINNER", count=5) == []


def test_report_helpers():
    assert [I.performance_band(p) for p in (90, 75, 60, 55, 54.9, 0)] == [
        "Strong", "Strong", "Solid", "Solid", "Needs more practice", "Needs more practice"]
    rows = [
        {"key": "DSA", "correct": 3, "total": 3, "percentage": 100.0},
        {"key": "OS", "correct": 0, "total": 2, "percentage": 0.0},
        {"key": "SQL", "correct": 1, "total": 1, "percentage": 100.0},  # one question is not yet a "strength"
    ]
    strengths, focus = I.analyse_categories(rows)
    assert strengths == ["DSA"]
    assert focus == [{"category": "OS", "label": "OS",
                      "reason": "You answered 0 of 2 OS questions correctly in this interview."}]
