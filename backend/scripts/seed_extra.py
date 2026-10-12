"""Phase 3 seed content: SQL + coding questions and two assessments."""
from sqlalchemy import select

from app.models.assessment import Assessment, AssessmentQuestion
from app.models.question import Category as C
from app.models.question import Difficulty as D
from app.models.question import Question, QuestionType
from app.schemas.question import CodingTestCaseIn, ConceptIn, QuestionCreate, ReferenceAnswerIn, SqlChallengeIn

EMP_SCHEMA = """CREATE TABLE employees (
  id integer PRIMARY KEY, name text NOT NULL, department text NOT NULL, salary integer NOT NULL);"""
EMP_SEED = """INSERT INTO employees VALUES
  (1,'Asha','Eng',90000),(2,'Ben','Eng',120000),(3,'Chen','Ops',75000),
  (4,'Dia','Ops',120000),(5,'Eli','HR',60000);"""
EMP_DOC = "Table `employees(id, name, department, salary)`."

SHOP_SCHEMA = """CREATE TABLE customers (id integer PRIMARY KEY, name text NOT NULL);
CREATE TABLE orders (id integer PRIMARY KEY, customer_id integer NOT NULL REFERENCES customers(id), amount integer NOT NULL);"""
SHOP_SEED = """INSERT INTO customers VALUES (1,'Asha'),(2,'Ben'),(3,'Chen'),(4,'Dia');
INSERT INTO orders VALUES (1,1,250),(2,1,100),(3,3,400);"""


def sql_q(title, diff, text, schema, seed, solution, order=False, tags=()):
    return QuestionCreate(
        title=title,
        description=text,
        category=C.SQL,
        difficulty=diff,
        question_type=QuestionType.SQL,
        time_limit=600,
        tags=list(tags),
        explanation=f"Reference solution:\n\n{solution}",
        sql_challenge=SqlChallengeIn(schema_sql=schema, seed_sql=seed, solution_query=solution, order_matters=order),
    )


STARTER = {
    "python": "import sys\n\n\ndef main():\n    data = sys.stdin.read().split()\n    # TODO: solve and print the answer\n\n\nmain()\n",
    "java": "import java.util.*;\n\npublic class Main {\n    public static void main(String[] args) {\n        Scanner sc = new Scanner(System.in);\n        // TODO: solve and print the answer\n    }\n}\n",
}


def code_q(title, diff, text, constraints, examples, cases, tags):
    return QuestionCreate(
        title=title,
        description=text,
        category=C.DSA,
        difficulty=diff,
        question_type=QuestionType.CODING,
        time_limit=1200,
        tags=tags,
        starter_code=STARTER,
        examples=examples,
        constraints=constraints,
        test_cases=[CodingTestCaseIn(input_data=i, expected_output=o, is_sample=s) for i, o, s in cases],
    )


def short_q(title, cat, diff, text, model, concepts, tags):
    return QuestionCreate(
        title=title,
        description=text,
        category=cat,
        difficulty=diff,
        question_type=QuestionType.SHORT_ANSWER,
        time_limit=300,
        tags=list(tags),
        explanation="Compare your answer with the model answer and the concepts you covered or missed.",
        reference_answer=ReferenceAnswerIn(
            model_answer=model,
            concepts=[ConceptIn(concept=c, keywords=k, weight=w) for c, k, w in concepts],
        ),
    )


SHORT_QUESTIONS: list[QuestionCreate] = [
    short_q("Explain deadlock", C.OS, D.MEDIUM,
            "What is a deadlock, when can it occur, and how can it be prevented?",
            "A deadlock is a state where a set of processes are each waiting for a resource held by another process in the "
            "set, so none can proceed. It requires four conditions together: mutual exclusion, hold and wait, no preemption "
            "and circular wait. It can be prevented by breaking one condition, for example by acquiring resources in a fixed "
            "global order, which removes circular wait.",
            [("mutual exclusion", ["mutual exclusion", "exclusive"], 1), ("hold and wait", ["hold and wait", "holding"], 1),
             ("no preemption", ["no preemption", "preempt"], 1), ("circular wait", ["circular wait", "cycle", "circular"], 2),
             ("prevention", ["prevent", "lock ordering", "resource ordering", "fixed order"], 2)],
            ["deadlock", "concurrency"]),
    short_q("What does ACID mean", C.DBMS, D.EASY,
            "Explain the ACID properties of a database transaction.",
            "ACID stands for atomicity, consistency, isolation and durability. Atomicity means a transaction either fully "
            "happens or not at all. Consistency means it moves the database from one valid state to another and respects "
            "constraints. Isolation means concurrent transactions do not see each other's partial work. Durability means "
            "once committed, the changes survive crashes, usually via a write-ahead log.",
            [("atomicity", ["atomic", "all or nothing", "rollback"], 2), ("consistency", ["consistent", "constraints", "valid state"], 1),
             ("isolation", ["isolation", "concurrent", "isolated"], 2), ("durability", ["durab", "survive", "crash", "write-ahead", "log"], 2)],
            ["transactions", "acid"]),
    short_q("Process versus thread", C.OS, D.EASY,
            "What is the difference between a process and a thread?",
            "A process is an independent program in execution with its own address space and resources. A thread is a unit of "
            "execution inside a process; threads of the same process share its memory and open files but have their own stack "
            "and registers. Threads are cheaper to create and switch between, but sharing memory means they need "
            "synchronization to avoid race conditions.",
            [("separate address space", ["address space", "own memory", "isolated", "independent"], 2),
             ("threads share memory", ["share", "same memory", "shared"], 2), ("own stack", ["stack", "registers"], 1),
             ("cost", ["cheaper", "lightweight", "context switch", "overhead"], 1),
             ("synchronization", ["synchroniz", "race condition", "lock", "mutex"], 1)],
            ["processes", "threads"]),
    short_q("Why use a database index", C.DBMS, D.MEDIUM,
            "What is a database index, and what are the trade-offs of adding one?",
            "An index is an auxiliary data structure, commonly a B-tree, that lets the database find rows by a column's "
            "value without scanning the whole table, so reads and joins on that column get much faster. The costs are extra "
            "storage and slower writes, since every insert, update or delete must also maintain the index. Indexes help most "
            "on selective columns that are queried often.",
            [("faster lookups", ["faster", "lookup", "avoid scanning", "full table scan", "seek"], 2),
             ("b-tree", ["b-tree", "btree", "tree", "hash"], 1), ("storage cost", ["storage", "space", "memory"], 1),
             ("write cost", ["slower write", "insert", "update", "maintain", "overhead"], 2),
             ("selectivity", ["selective", "frequently queried", "cardinality"], 1)],
            ["indexing", "performance"]),
    short_q("TCP versus UDP", C.CN, D.EASY,
            "Compare TCP and UDP and say when you would choose each.",
            "TCP is connection-oriented and reliable: it uses a handshake, acknowledgements, retransmission, ordering and "
            "flow and congestion control, at the cost of latency and overhead. UDP is connectionless and gives no delivery or "
            "ordering guarantees, but is lightweight and low-latency. Use TCP for web pages, file transfer and email; use UDP "
            "for live video, voice, gaming and DNS lookups where speed matters more than perfect delivery.",
            [("tcp reliable", ["reliable", "acknowledg", "retransmi", "handshake"], 2), ("ordering", ["order", "sequence"], 1),
             ("udp connectionless", ["connectionless", "no guarantee", "lightweight", "datagram"], 2),
             ("latency tradeoff", ["latency", "fast", "overhead", "speed"], 1),
             ("use cases", ["video", "voice", "gaming", "dns", "streaming", "web", "file transfer"], 1)],
            ["tcp", "udp", "transport"]),
    short_q("What is polymorphism", C.OOP, D.EASY,
            "Explain polymorphism in object-oriented programming with an example.",
            "Polymorphism lets code treat objects of different types through a common interface while each type supplies its "
            "own behavior. Runtime polymorphism comes from overriding: a Shape reference can call area() and the Circle or "
            "Square implementation runs, chosen at runtime by dynamic dispatch. Compile-time polymorphism comes from overloading "
            "methods with different parameters. It reduces conditionals and makes code easier to extend.",
            [("common interface", ["interface", "base class", "parent", "common"], 2),
             ("overriding", ["overrid", "dynamic dispatch", "runtime", "virtual"], 2),
             ("overloading", ["overload", "compile-time", "compile time"], 1),
             ("example", ["shape", "circle", "animal", "example", "area"], 1),
             ("benefit", ["extend", "flexib", "reduce", "maintain"], 1)],
            ["oop", "polymorphism"]),
]

EXTRA_QUESTIONS: list[QuestionCreate] = SHORT_QUESTIONS + [
    sql_q("Second highest salary", D.MEDIUM,
          f"{EMP_DOC}\n\nReturn the second highest distinct salary as a single column named `second_highest`.",
          EMP_SCHEMA, EMP_SEED,
          "SELECT MAX(salary) AS second_highest FROM employees WHERE salary < (SELECT MAX(salary) FROM employees)",
          tags=["subquery", "aggregation"]),
    sql_q("Departments with multiple employees", D.EASY,
          f"{EMP_DOC}\n\nReturn each department that has more than one employee, with its headcount (`department`, `headcount`).",
          EMP_SCHEMA, EMP_SEED,
          "SELECT department, COUNT(*) AS headcount FROM employees GROUP BY department HAVING COUNT(*) > 1",
          tags=["group-by", "having"]),
    sql_q("Customers with no orders", D.MEDIUM,
          "Tables `customers(id, name)` and `orders(id, customer_id, amount)`.\n\nReturn the names of customers who have never placed an order, sorted alphabetically.",
          SHOP_SCHEMA, SHOP_SEED,
          "SELECT c.name FROM customers c LEFT JOIN orders o ON o.customer_id = c.id WHERE o.id IS NULL ORDER BY c.name",
          order=True, tags=["joins", "anti-join"]),
    sql_q("Top earner per department", D.HARD,
          f"{EMP_DOC}\n\nReturn the highest-paid employee(s) in every department (`department`, `name`, `salary`). Ties must all be returned.",
          EMP_SCHEMA, EMP_SEED,
          "SELECT department, name, salary FROM (SELECT department, name, salary, "
          "RANK() OVER (PARTITION BY department ORDER BY salary DESC) AS rk FROM employees) t WHERE rk = 1",
          tags=["window-functions"]),

    code_q("Maximum subarray sum", D.MEDIUM,
           "Given an array of integers, print the largest sum of any non-empty contiguous subarray.\n\n"
           "Input: first line `n`, second line `n` integers.\nOutput: a single integer.",
           "1 <= n <= 10^5, |a[i]| <= 10^4",
           [{"input": "9\n-2 1 -3 4 -1 2 1 -5 4", "output": "6", "explanation": "[4, -1, 2, 1] has the largest sum."}],
           [("9\n-2 1 -3 4 -1 2 1 -5 4", "6", True), ("1\n1", "1", True),
            ("5\n5 4 -1 7 8", "23", False), ("4\n-3 -2 -1 -4", "-1", False)],
           ["arrays", "kadane", "dynamic-programming"]),
    code_q("Valid parentheses", D.EASY,
           "Given a string made only of `()[]{}`, print `true` if the brackets are balanced and correctly nested, otherwise `false`.\n\n"
           "Input: one line containing the string.",
           "1 <= length <= 10^4",
           [{"input": "()[]{}", "output": "true"}, {"input": "(]", "output": "false"}],
           [("()[]{}", "true", True), ("(]", "false", True), ("{[]}", "true", False),
            ("([)]", "false", False), ("((", "false", False)],
           ["stack", "strings"]),
    code_q("Second largest distinct element", D.EASY,
           "Print the second largest distinct value in the array, or `-1` if there is none.\n\n"
           "Input: first line `n`, second line `n` integers.",
           "1 <= n <= 10^5",
           [{"input": "5\n3 1 4 1 5", "output": "4"}, {"input": "3\n7 7 7", "output": "-1"}],
           [("5\n3 1 4 1 5", "4", True), ("3\n7 7 7", "-1", True), ("4\n10 9 9 8", "9", False),
            ("2\n1 2", "1", False), ("1\n5", "-1", False)],
           ["arrays", "sorting"]),
]

# title -> points
ASSESSMENTS = [
    dict(
        title="Backend Engineer Assessment",
        description="Core backend interview topics: algorithms, SQL, databases, operating systems and OOP.",
        duration_minutes=60,
        difficulty=D.MEDIUM,
        questions=[
            ("Binary search complexity", 1), ("Quicksort worst case", 1),
            ("When does dynamic programming apply", 1), ("Filtering groups", 1),
            ("Second highest salary", 3), ("Normal forms", 1), ("Isolation levels", 1),
            ("Coffman conditions", 1), ("Scheduling and starvation", 1),
            ("Liskov Substitution Principle", 1),
        ],
    ),
    dict(
        title="SQL Fundamentals Check",
        description="A short check of joins, aggregation and NULL handling.",
        duration_minutes=20,
        difficulty=D.EASY,
        questions=[
            ("Filtering groups", 1), ("LEFT JOIN semantics", 1), ("COUNT and NULL", 1),
            ("Departments with multiple employees", 2), ("Customers with no orders", 3),
        ],
    ),
]


def seed_assessments(db, admin_id: int | None) -> None:
    existing = set(db.scalars(select(Assessment.title)))
    by_title = {q.title: q.id for q in db.scalars(select(Question))}
    created = 0
    for spec in ASSESSMENTS:
        if spec["title"] in existing:
            continue
        missing = [t for t, _ in spec["questions"] if t not in by_title]
        if missing:
            print(f"Skipping '{spec['title']}': missing questions {missing}")
            continue
        a = Assessment(
            title=spec["title"], description=spec["description"], duration_minutes=spec["duration_minutes"],
            difficulty=spec["difficulty"], is_published=True, created_by=admin_id,
        )
        a.questions = [
            AssessmentQuestion(question_id=by_title[t], position=i, points=p)
            for i, (t, p) in enumerate(spec["questions"])
        ]
        db.add(a)
        created += 1
    print(f"Seeded {created} new assessments")
