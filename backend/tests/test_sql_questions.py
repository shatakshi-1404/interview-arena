from app.models.attempt import Submission
from tests.conftest import TestSession
from tests.test_questions import create_q, mcq_payload

SQL_EXTRA = dict(
    title="Second highest salary",
    category="SQL",
    question_type="SQL",
    options=[],
    sql_challenge={
        "schema_sql": "CREATE TABLE employees (id int primary key, name text, salary int);",
        "seed_sql": "INSERT INTO employees VALUES (1,'A',100),(2,'B',200),(3,'C',200),(4,'D',50);",
        "solution_query": "SELECT MAX(salary) AS second_highest FROM employees WHERE salary < (SELECT MAX(salary) FROM employees)",
        "order_matters": False,
    },
)
GOOD = "SELECT DISTINCT salary FROM employees ORDER BY salary DESC LIMIT 1 OFFSET 1"
BAD = "SELECT MAX(salary) FROM employees"


def test_admin_rejects_broken_solution(client, admin_h):
    bad = {**SQL_EXTRA, "sql_challenge": {**SQL_EXTRA["sql_challenge"], "solution_query": "SELECT * FROM missing"}}
    r = client.post("/api/admin/questions", json=mcq_payload(**bad), headers=admin_h)
    assert r.status_code == 422 and "invalid" in r.json()["detail"]


def test_learner_view_hides_dataset_and_solution(client, admin_h, user_h):
    q = create_q(client, admin_h, **SQL_EXTRA)
    body = client.get(f"/api/questions/{q['id']}", headers=user_h).text
    assert "solution_query" not in body and "seed_sql" not in body and "MAX(salary)" not in body


def test_submit_correct_and_wrong_and_attempt_counter(client, admin_h, user_h):
    q = create_q(client, admin_h, **SQL_EXTRA)
    url = f"/api/questions/{q['id']}/submit"

    bad = client.post(url, json={"code": BAD}, headers=user_h).json()
    assert bad["is_correct"] is False and bad["status"] == "WRONG_ANSWER" and bad["explanation"] is None
    assert bad["run"]["sql"]["expected"]["rows"] == [[100]]
    assert bad["run"]["sql"]["actual"]["rows"] == [[200]]

    good = client.post(url, json={"code": GOOD}, headers=user_h).json()
    assert good["is_correct"] is True and good["status"] == "ACCEPTED" and good["explanation"]
    assert (bad["attempt_number"], good["attempt_number"]) == (1, 2)

    with TestSession() as db:
        subs = db.query(Submission).order_by(Submission.id).all()
    assert [s.status.value for s in subs] == ["WRONG_ANSWER", "ACCEPTED"]
    assert subs[1].language == "sql" and subs[1].attempt_number == 2


def test_destructive_query_is_refused_not_executed(client, admin_h, user_h):
    q = create_q(client, admin_h, **SQL_EXTRA)
    r = client.post(f"/api/questions/{q['id']}/submit", json={"code": "DROP TABLE employees"}, headers=user_h)
    assert r.status_code == 200
    body = r.json()
    assert body["is_correct"] is False and body["status"] == "RUNTIME_ERROR"
    assert "SELECT" in body["run"]["message"]


def test_run_does_not_persist(client, admin_h, user_h):
    q = create_q(client, admin_h, **SQL_EXTRA)
    r = client.post(f"/api/questions/{q['id']}/run", json={"code": GOOD}, headers=user_h)
    assert r.status_code == 200 and r.json()["status"] == "ACCEPTED"
    with TestSession() as db:
        assert db.query(Submission).count() == 0


def test_run_rejected_for_mcq(client, admin_h, user_h):
    q = create_q(client, admin_h)
    assert client.post(f"/api/questions/{q['id']}/run", json={"code": "x"}, headers=user_h).status_code == 422
