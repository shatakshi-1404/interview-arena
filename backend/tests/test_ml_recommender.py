from app.ml import recommender as R
from tests.test_ml_features import ev


def cand(i, cat="DSA", diff="EASY", tags=()):
    return R.Candidate(i, f"Q{i}", cat, diff, "MCQ", tuple(tags))


def test_weak_topic_detected_with_numeric_reason():
    events = [ev(i, False, qid=i) for i in range(4)] + [ev(4, True, qid=4)]  # 1 of 5 correct
    weak = R.detect_weak_topics(events)
    assert [w.category for w in weak] == ["DSA"]
    assert weak[0].reasons[0] == "Your recent DSA accuracy is 20%."


def test_strong_and_thin_topics_are_not_weak():
    strong = [ev(i, True, cat="SQL") for i in range(5)]
    thin = [ev(10, False, cat="OS"), ev(11, False, cat="OS")]
    assert R.detect_weak_topics(strong + thin) == []


def test_falling_accuracy_is_flagged_even_when_overall_is_fine():
    events = [ev(i, True) for i in range(10)] + [ev(10 + i, False) for i in range(5)]
    weak = R.detect_weak_topics(events)
    assert any("fell from 100% to 0%" in r for r in weak[0].reasons)


def test_difficulty_adaptation():
    assert R.target_difficulty([ev(i, True, diff="EASY") for i in range(5)], [], "DSA") == (
        "MEDIUM", "You solved 5 of your last 5 DSA questions.")
    struggling = [ev(0, True, diff="MEDIUM")] + [ev(i, False, diff="MEDIUM") for i in range(1, 5)]
    assert R.target_difficulty(struggling, [], "DSA")[0] == "EASY"
    assert R.target_difficulty([ev(i, True, diff="HARD") for i in range(5)], [], "DSA")[0] == "HARD"  # cap
    assert R.target_difficulty([], [], "DSA") == ("EASY", None)
    strong_elsewhere = [ev(i, True, cat="SQL") for i in range(6)]
    assert R.target_difficulty([], strong_elsewhere, "OS")[0] == "MEDIUM"


def test_new_user_gets_an_honest_baseline():
    pool = [cand(1, "DSA", "MEDIUM"), cand(2, "DSA", "EASY"), cand(3, "SQL", "EASY"), cand(4, "OS", "HARD")]
    recs = R.recommend([], pool)
    assert [r.question_id for r in recs] == [2, 3, 4]  # easiest per category
    assert all(r.reason.startswith("Start here") for r in recs)
    assert [r.priority for r in recs] == [1, 2, 3]


def test_recommendations_are_explainable_and_filtered():
    events = [ev(i, False, qid=i) for i in range(1, 5)] + [ev(5, True, qid=5)]
    pool = [cand(1), cand(10), cand(11, diff="HARD"), cand(12, cat="SQL"), cand(5)]
    recs = R.recommend(events, pool)
    ids = [r.question_id for r in recs]
    assert 5 not in ids  # already solved
    assert 11 not in ids  # two levels above the target
    assert recs[0].question_id == 1  # weak topic + retry of an unsolved attempt
    assert "Your recent DSA accuracy is 20%." in recs[0].reason
    assert "attempted this one before" in recs[0].reason
    assert any(r.category == "SQL" and "haven't practiced SQL" in r.reason for r in recs)
    assert [r.priority for r in recs] == list(range(1, len(recs) + 1))


def test_dismissed_and_category_cap():
    events = [ev(i, False, qid=i) for i in range(5)]
    pool = [cand(100 + i) for i in range(6)]
    assert len(R.recommend(events, pool, per_category=2)) == 2
    out = R.recommend(events, pool, dismissed_ids={100, 101, 102})
    assert not {100, 101, 102} & {r.question_id for r in out}


def test_missed_tags_boost_related_questions():
    events = [ev(i, False, qid=i, tags=("graphs",)) for i in range(5)]
    recs = R.recommend(events, [cand(50, tags=("graphs",)), cand(51, tags=("arrays",))], limit=2)
    assert recs[0].question_id == 50 and "graphs" in recs[0].reason


def test_next_steps():
    assert R.next_steps([], [], 0)[0].startswith("Solve a few")
    weak = R.detect_weak_topics([ev(i, False) for i in range(5)])
    steps = R.next_steps(weak, ["SQL", "OS"], 5)
    assert steps[0].startswith("Focus on DSA") and "SQL, OS" in steps[1]
