from app.ml import evaluation
from scripts.seed_extra import SHORT_QUESTIONS


def test_seeded_short_answers_accept_their_own_model_answer_and_reject_nonsense():
    assert len(SHORT_QUESTIONS) >= 6
    for q in SHORT_QUESTIONS:
        ref = q.reference_answer
        concepts = [c.model_dump() for c in ref.concepts]
        good = evaluation.evaluate_answer(ref.model_answer, ref.model_answer, concepts)
        bad = evaluation.evaluate_answer("It is something to do with computers and speed.", ref.model_answer, concepts)
        assert good.passed, q.title
        assert not bad.passed and bad.score < good.score, q.title
