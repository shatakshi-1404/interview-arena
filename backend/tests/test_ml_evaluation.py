from app.ml import evaluation as E

MODEL = ("A deadlock occurs when processes wait for each other in a circular wait while holding resources. "
         "It requires mutual exclusion, hold and wait, no preemption and circular wait.")
CONCEPTS = [
    {"concept": "circular wait", "keywords": ["circular wait", "cycle of waiting"], "weight": 2},
    {"concept": "mutual exclusion", "keywords": ["mutual exclusion"], "weight": 1},
    {"concept": "hold and wait", "keywords": ["hold and wait", "holding resources"], "weight": 1},
    {"concept": "no preemption", "keywords": ["no preemption", "cannot be preempted"], "weight": 1},
]
GOOD = ("A deadlock happens when processes hold resources while waiting for others, forming a circular wait. "
        "It needs mutual exclusion, hold and wait, and no preemption of resources.")


def run(answer):
    return E.evaluate_answer(answer, MODEL, CONCEPTS)


def test_stemming_is_consistent():
    assert E.stem("scheduling") == E.stem("schedule") == E.stem("scheduled")
    assert E.stem("processes") == E.stem("process") == E.stem("processing")
    assert E.stem("trees") == E.stem("tree") and E.stem("waiting") == E.stem("waits") == "wait"


def test_good_answer_passes_with_full_coverage():
    r = run(GOOD)
    assert r.passed and r.dimensions["coverage"] == 1.0 and r.score >= 0.8
    assert r.missing_concepts == []


def test_irrelevant_answer_fails_and_lists_what_is_missing():
    r = run("It is when the computer becomes very slow and stops responding.")
    assert not r.passed and r.dimensions["coverage"] == 0.0
    assert len(r.missing_concepts) == 4 and any("Consider mentioning" in f for f in r.feedback)


def test_partial_answer_gets_partial_credit_but_not_a_pass():
    r = run("Deadlock needs mutual exclusion, which means a resource can only be held by one process at a time.")
    assert r.matched_concepts == ["mutual exclusion"]
    assert r.dimensions["coverage"] == 0.2 and not r.passed and 0 < r.score < 0.6


def test_inflected_and_alternate_phrasings_match():
    r = run("Processes can be stuck in a cycle of waiting, and the resources cannot be preempted by the system.")
    assert set(r.matched_concepts) == {"circular wait", "no preemption"}


def test_word_order_slack():
    assert "hold and wait" in run("They hold resources and wait for more resources to be freed up here.").matched_concepts


def test_keyword_dump_is_penalised():
    r = run("circular wait mutual exclusion hold and wait no preemption")
    assert r.dimensions["coverage"] == 1.0
    assert not r.passed and any("list of keywords" in f for f in r.feedback)


def test_empty_answer():
    r = run("   ")
    assert r.score == 0.0 and not r.passed and r.feedback == ["Write an answer first."]


def test_brevity_is_flagged():
    r = run("Circular wait.")
    assert r.dimensions["completeness"] < 0.6 and any("brief" in f for f in r.feedback)


def test_to_dict_roundtrip_keys():
    assert set(run(GOOD).to_dict()) == {"score", "passed", "dimensions", "matched_concepts",
                                        "missing_concepts", "feedback"}
