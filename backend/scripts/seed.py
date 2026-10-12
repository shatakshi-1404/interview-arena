"""Idempotent seed: promotes/creates the first admin from env, then loads starter MCQs.

Run:  docker compose run --rm backend python -m scripts.seed
Needs ADMIN_EMAIL and ADMIN_PASSWORD in .env to create the admin (no passwords are hardcoded).
"""
from app.core import security
from app.core.config import settings
from app.core.database import SessionLocal
from app.models.question import Category as C
from app.models.question import Difficulty as D
from app.models.question import Question, QuestionType
from app.models.user import Role
from app.repositories.user_repository import UserRepository
from app.schemas.question import OptionIn, QuestionCreate
from app.services.question_service import build_question
from app.services.achievement_service import AchievementService
from scripts.seed_extra import EXTRA_QUESTIONS, seed_assessments
from sqlalchemy import select


def mcq(title, cat, diff, text, options, correct, explanation, tags, time_limit=60) -> QuestionCreate:
    return QuestionCreate(
        title=title,
        description=text,
        category=cat,
        difficulty=diff,
        question_type=QuestionType.MCQ,
        time_limit=time_limit,
        tags=tags,
        explanation=explanation,
        options=[OptionIn(text=o, is_correct=(i == correct)) for i, o in enumerate(options)],
    )


SEED: list[QuestionCreate] = [
    # ---- DSA
    mcq("Binary search complexity", C.DSA, D.EASY,
        "What is the worst-case time complexity of binary search on a sorted array of n elements?",
        ["O(1)", "O(log n)", "O(n)", "O(n log n)"], 1,
        "Each comparison halves the search range, so at most log2(n) steps are needed.",
        ["searching", "binary-search", "arrays"]),
    mcq("BFS data structure", C.DSA, D.EASY,
        "Which data structure does an iterative breadth-first search use to track nodes to visit?",
        ["Stack", "Queue", "Priority queue", "Hash set only"], 1,
        "BFS visits nodes level by level, which needs first-in-first-out order: a queue.",
        ["graphs", "bfs", "queue"]),
    mcq("Quicksort worst case", C.DSA, D.MEDIUM,
        "What is the worst-case time complexity of quicksort?",
        ["O(n log n)", "O(n)", "O(n^2)", "O(log n)"], 2,
        "With consistently unbalanced partitions (e.g. already sorted input and a bad pivot rule) "
        "the recursion depth becomes n and total work is O(n^2).",
        ["sorting", "quicksort"]),
    mcq("Cycle detection in a linked list", C.DSA, D.MEDIUM,
        "Which technique detects a cycle in a singly linked list in O(n) time and O(1) extra space?",
        ["Hash set of visited nodes", "Floyd's tortoise and hare", "Recursion with memoization", "Sorting the nodes"], 1,
        "Two pointers moving at different speeds must meet inside a cycle, and need no extra storage.",
        ["linked-list", "two-pointers"]),
    mcq("When does dynamic programming apply", C.DSA, D.MEDIUM,
        "Which pair of properties makes a problem suitable for dynamic programming?",
        ["Greedy choice and sorted input", "Overlapping subproblems and optimal substructure",
         "Independent subproblems and randomness", "Graph structure and positive weights"], 1,
        "Optimal substructure lets you build solutions from subsolutions; overlapping subproblems make caching them worthwhile.",
        ["dynamic-programming"]),
    mcq("Dijkstra's limitation", C.DSA, D.MEDIUM,
        "Dijkstra's shortest path algorithm gives incorrect results on graphs that contain:",
        ["Cycles", "Negative edge weights", "Disconnected components", "Parallel edges"], 1,
        "Dijkstra assumes that once a node is finalized no shorter path exists, which negative edges can violate. "
        "Use Bellman-Ford instead.",
        ["graphs", "shortest-path"]),
    mcq("Building a heap", C.DSA, D.HARD,
        "What is the time complexity of building a binary heap from n unsorted elements using bottom-up heapify?",
        ["O(n log n)", "O(n)", "O(log n)", "O(n^2)"], 1,
        "Most nodes sit near the leaves and sift down very little; the sum of work across levels converges to O(n).",
        ["heap", "complexity"], time_limit=90),
    # ---- SQL
    mcq("Filtering groups", C.SQL, D.EASY,
        "Which SQL clause filters groups after aggregation has been applied?",
        ["WHERE", "HAVING", "GROUP BY", "ORDER BY"], 1,
        "WHERE filters rows before grouping; HAVING filters the aggregated groups.",
        ["aggregation", "having"]),
    mcq("LEFT JOIN semantics", C.SQL, D.EASY,
        "What does a LEFT JOIN return?",
        ["Only rows with matches in both tables", "All rows from the left table, with NULLs where the right has no match",
         "All rows from both tables", "Only rows from the left table with no match"], 1,
        "Every left-table row is kept; right-table columns are NULL when there is no matching row.",
        ["joins"]),
    mcq("COUNT and NULL", C.SQL, D.MEDIUM,
        "Which expression counts only the non-NULL values in column c?",
        ["COUNT(*)", "COUNT(c)", "SUM(c)", "COUNT(DISTINCT *)"], 1,
        "COUNT(*) counts rows; COUNT(c) skips rows where c is NULL.",
        ["aggregation", "null"]),
    # ---- DBMS
    mcq("Normal forms", C.DBMS, D.MEDIUM,
        "Which normal form is concerned with removing transitive dependencies of non-key attributes on the key?",
        ["1NF", "2NF", "3NF", "None of these"], 2,
        "2NF removes partial dependencies on part of a composite key; 3NF removes transitive ones.",
        ["normalization"]),
    mcq("Isolation levels", C.DBMS, D.MEDIUM,
        "Which isolation level prevents dirty reads but still allows non-repeatable reads?",
        ["Read Uncommitted", "Read Committed", "Repeatable Read", "Serializable"], 1,
        "Read Committed only returns committed data, but a re-read in the same transaction can see newer commits.",
        ["transactions", "isolation"]),
    # ---- OS
    mcq("Coffman conditions", C.OS, D.MEDIUM,
        "Which of the following is NOT one of the four necessary conditions for deadlock?",
        ["Mutual exclusion", "Hold and wait", "Preemption", "Circular wait"], 2,
        "The condition is NO preemption: resources cannot be forcibly taken away. Preemption itself breaks deadlock.",
        ["deadlock", "concurrency"]),
    mcq("Scheduling and starvation", C.OS, D.MEDIUM,
        "Which scheduling algorithm can starve long processes if short ones keep arriving?",
        ["First-Come First-Served", "Round Robin", "Shortest Job First", "Lottery scheduling"], 2,
        "SJF always prefers the shortest job, so a long job may wait indefinitely. Aging is a common fix.",
        ["scheduling"]),
    # ---- CN
    mcq("TCP vs UDP", C.CN, D.EASY,
        "Which transport protocol provides reliable, ordered delivery?",
        ["UDP", "TCP", "IP", "ICMP"], 1,
        "TCP uses sequence numbers, acknowledgements and retransmission; UDP does not.",
        ["transport", "tcp"]),
    mcq("OSI routing layer", C.CN, D.EASY,
        "At which OSI layer does routing between networks occur?",
        ["Data link", "Network", "Transport", "Session"], 1,
        "The network layer (IP) selects paths between networks.",
        ["osi"]),
    # ---- OOP
    mcq("Method overriding", C.OOP, D.EASY,
        "Method overriding is an example of:",
        ["Compile-time polymorphism", "Runtime polymorphism", "Encapsulation", "Abstraction only"], 1,
        "Which override runs is decided at runtime from the object's actual type (dynamic dispatch).",
        ["polymorphism"]),
    mcq("Liskov Substitution Principle", C.OOP, D.MEDIUM,
        "Which SOLID principle states that subclasses should be usable wherever their base class is expected?",
        ["Single Responsibility", "Open/Closed", "Liskov Substitution", "Dependency Inversion"], 2,
        "LSP: objects of a subtype must be substitutable for the base type without breaking correctness.",
        ["solid", "inheritance"]),
    # ---- Programming
    mcq("Negative indexing in Python", C.PROGRAMMING, D.EASY,
        "What does [1, 2, 3][-1] evaluate to in Python?",
        ["1", "2", "3", "IndexError"], 2,
        "Negative indices count from the end; -1 is the last element.",
        ["python", "lists"], time_limit=45),
    mcq("Preventing overriding in Java", C.PROGRAMMING, D.EASY,
        "Which Java keyword prevents a method from being overridden by subclasses?",
        ["static", "final", "abstract", "sealed"], 1,
        "A final method cannot be overridden (a final class cannot be extended at all).",
        ["java"], time_limit=45),
]

SEED = SEED + EXTRA_QUESTIONS


def _ensure_admin(db):
    if not settings.ADMIN_EMAIL or not settings.ADMIN_PASSWORD:
        print("ADMIN_EMAIL / ADMIN_PASSWORD not set: skipping admin creation")
        return None
    if len(settings.ADMIN_PASSWORD) < 8:
        raise SystemExit("ADMIN_PASSWORD must be at least 8 characters")
    users = UserRepository(db)
    user = users.get_by_email(settings.ADMIN_EMAIL)
    if user is None:
        user = users.create("Admin", settings.ADMIN_EMAIL, security.hash_password(settings.ADMIN_PASSWORD))
        print(f"Created admin {user.email}")
    if user.role != Role.ADMIN:
        user.role = Role.ADMIN
        print(f"Promoted {user.email} to ADMIN")
    return user


def main() -> None:
    with SessionLocal() as db:
        admin = _ensure_admin(db)
        existing = set(db.scalars(select(Question.title)))
        created = 0
        for data in SEED:
            if data.title in existing:
                continue
            db.add(build_question(data, admin.id if admin else None))
            created += 1
        db.commit()
        print(f"Seeded {created} new questions ({len(SEED) - created} already present)")
        seed_assessments(db, admin.id if admin else None)
        AchievementService(db).ensure_catalog()
        db.commit()


if __name__ == "__main__":
    main()
