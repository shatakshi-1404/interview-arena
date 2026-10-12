from tests.test_assessments import create_assessment, save, start
from tests.test_ml_evaluation import CONCEPTS, GOOD, MODEL
from tests.test_questions import correct_and_wrong_ids, create_q
from app.core.config import settings

SHORT = dict(
    title="Explain deadlock", question_type="SHORT_ANSWER", options=[],
    reference_answer={"model_answer": MODEL, "concepts": CONCEPTS},
)


def test_good_and_bad_short_answers(client, admin_h, user_h):
    q = create_q(client, admin_h, **SHORT)
    url = f"/api/questions/{q['id']}/submit"
    good = client.post(url, json={"text_answer": GOOD}, headers=user_h).json()
    assert good["is_correct"] is True and good["score"] >= 0.8
    assert good["evaluation"]["dimensions"]["coverage"] == 1.0 and good["model_answer"] == MODEL
    bad = client.post(url, json={"text_answer": "It is when the computer is slow."}, headers=user_h).json()
    assert bad["is_correct"] is False and len(bad["evaluation"]["missing_concepts"]) == 4
    assert bad["attempt_number"] == 2


def test_blank_short_answer_rejected(client, admin_h, user_h):
    q = create_q(client, admin_h, **SHORT)
    assert client.post(f"/api/questions/{q['id']}/submit", json={"text_answer": ""}, headers=user_h).status_code == 422
    assert client.post(f"/api/questions/{q['id']}/submit", json={}, headers=user_h).status_code == 422


def test_learner_view_hides_reference(client, admin_h, user_h):
    q = create_q(client, admin_h, **SHORT)
    text = client.get(f"/api/questions/{q['id']}", headers=user_h).text
    assert "reference_answer" not in text and "circular wait" not in text


def test_short_answers_are_graded_inside_assessments(client, admin_h, user_h):
    q1, q2 = create_q(client, admin_h, title="MCQ part"), create_q(client, admin_h, **SHORT)
    aid = start(client, user_h, create_assessment(client, admin_h, [(q1, 1), (q2, 2)]))["attempt_id"]
    c1, _ = correct_and_wrong_ids(q1)
    save(client, user_h, aid, q1["id"], selected_option_ids=c1)
    save(client, user_h, aid, q2["id"], text_answer=GOOD)
    res = client.post(f"/api/attempts/{aid}/submit", headers=user_h).json()
    assert res["ungraded_count"] == 0 and res["max_score"] == 3.0 and res["percentage"] > 90
    short = next(x for x in res["questions"] if x["question_id"] == q2["id"])
    assert short["evaluation"]["passed"] is True and short["model_answer"] == MODEL


def test_disabled_ml_blocks_short_answer_but_not_mcq(client, admin_h, user_h, monkeypatch):
    q = create_q(client, admin_h, **SHORT)
    m = create_q(client, admin_h, title="Plain MCQ")
    monkeypatch.setattr(settings, "ML_ENABLED", False)
    assert client.post(f"/api/questions/{q['id']}/submit", json={"text_answer": GOOD}, headers=user_h).status_code == 503
    c, _ = correct_and_wrong_ids(m)
    assert client.post(f"/api/questions/{m['id']}/submit", json={"selected_option_ids": c}, headers=user_h).status_code == 200
