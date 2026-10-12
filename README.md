<div align="center">

# InterviewArena

### Practice smarter. Perform better.

A full-stack technical interview preparation platform. Practice real question types, take timed assessments and
mock interviews, and see exactly where you are weak and what to practice next.

`React` · `TypeScript` · `Vite` · `Tailwind` · `FastAPI` · `PostgreSQL` · `scikit-learn` · `Docker`

<!-- Replace with your deployed link -->
**Live demo:** _add your URL here_

</div>

---

## Screenshots

> Add your own screenshots to `docs/screenshots/` after you deploy, then keep the file names below (or edit the
> paths). A good set is a 1440 px wide browser window, light theme, with some practice data filled in.

| Landing page | Dashboard |
|:---:|:---:|
| ![Landing page](docs/screenshots/landing.png) | ![Dashboard](docs/screenshots/dashboard.png) |

| Practice (MCQ) | SQL practice |
|:---:|:---:|
| ![Practice question](docs/screenshots/practice-mcq.png) | ![SQL question](docs/screenshots/practice-sql.png) |

| Timed assessment | Assessment result |
|:---:|:---:|
| ![Timed assessment](docs/screenshots/assessment.png) | ![Assessment result](docs/screenshots/assessment-result.png) |

| Mock interview report | Progress and skill heatmap |
|:---:|:---:|
| ![Mock interview report](docs/screenshots/mock-report.png) | ![Progress](docs/screenshots/progress.png) |

| Practice Readiness | Recommendations |
|:---:|:---:|
| ![Practice readiness](docs/screenshots/readiness.png) | ![Recommendations](docs/screenshots/recommendations.png) |

| Leaderboard | Admin console |
|:---:|:---:|
| ![Leaderboard](docs/screenshots/leaderboard.png) | ![Admin console](docs/screenshots/admin.png) |

---

## What it does

Most interview-prep sites tell you whether an answer was right. InterviewArena also records **every answer as a
structured event** (topic, difficulty, question type, time taken, score) and turns that history into topic accuracy,
trends, weak-spot detection and explainable next-question recommendations.

Two kinds of "smart" live side by side. The analytics, recommendations, readiness estimate and short-answer scoring
are deterministic code or small classical ML models you can read in `backend/app/ml/`. On top of that sit three
**optional generative-AI features** (hints, AI feedback on short answers, and an admin question generator) that call
an LLM of your choice and are switched off unless you configure one. The app is fully usable without them.

### For learners

| Feature | What you get |
|---|---|
| **Practice questions** | Four question types across eight topics (DSA, SQL, DBMS, OS, Computer Networks, OOP, Programming, System Design) and three difficulty levels. Filter by topic, difficulty, type and tag, search by title, and see which questions you have solved or attempted. |
| **MCQ** | Single-answer and multi-answer questions. After you check your answer you see the correct options and an explanation. |
| **SQL practice** | Write a query against a small built-in dataset. It runs in an isolated, read-only sandbox, is compared with the reference result, and you can **Run** to preview or **Submit** to be graded. |
| **Short answers** | Type a free-text answer. It is scored against a model answer and a list of key concepts (TF-IDF similarity plus concept matching), and you get feedback on which concepts you hit and missed. With AI enabled you can also request **LLM feedback** that appears beside that score. |
| **Coding questions** | A Monaco code editor (Python or Java) with starter code, **Run** (sample tests) and **Submit** (all hidden tests). Code runs in a sandbox (Judge0) or, on your own machine, a resource-limited local Python runner. See "Running code" below. |
| **Hints (AI)** | A "Give me a hint" button on every question. Hints escalate over three levels (nudge, stronger, outline), never reveal the answer, and are refused during a live assessment or mock interview. |
| **Timed assessments** | Curated tests with a countdown. The deadline is enforced by the server, answers autosave as you type, and the test submits itself at zero. You get a score, a breakdown by topic and difficulty, and a question-by-question review. |
| **Mock interviews** | Pick a role (Backend, Full-Stack, Generalist, Data Engineer), a level (Beginner, Intermediate, Advanced) and a length (15 to 60 minutes). A mixed interview is built for you, leaning on your weakest topics, and ends with a report: score band, strengths, focus areas, pace and next steps. |
| **Progress analytics** | Accuracy, average score, consistency, current and longest streak, a performance-over-time chart, weekly activity, a difficulty breakdown, an activity calendar and a skill heatmap by topic. |
| **Practice Readiness** | After 10 answers, a transparent estimate of how prepared you are, shown with the factors that raise or lower it and honest caveats. |
| **Recommendations** | "Do this next" questions, each with a reason built from your own numbers (for example "Your recent OS accuracy is 20%"). You can dismiss any of them. |
| **Achievements and streaks** | Five achievements (First 10 Problems, SQL Beginner, 7 Day Streak, 100 Questions, Graph Explorer) and a daily streak. |
| **Leaderboard** | Weekly and monthly rankings: 10, 20 or 30 points for the first correct answer to an Easy, Medium or Hard question. Re-solving never earns points again, and you can opt out of appearing at any time. |
| **Notifications and profile** | In-app notifications (such as unlocked achievements), and a profile where you change your name and leaderboard visibility. |
| **Accounts** | Register, sign in, sign out, forgot and reset password. |

### For admins

An admin console (only visible to admin accounts, and enforced on the server) with:

- **Overview:** users, activity, questions, assessments, submissions, overall accuracy, and the lowest-accuracy topics.
- **Users:** search, filter, activate or deactivate accounts, and change roles.
- **Question editor:** a form that changes with the question type (options for MCQ, dataset and reference query for
  SQL, model answer and concepts for short answers, test cases for coding). SQL reference solutions are verified
  against their dataset before they can be saved.
- **Assessment builder:** pick questions, reorder them, set points and duration, publish or unpublish.
- **Submissions:** browse and filter every submission and open the details.
- **Audit log:** who created, changed or deleted what, and when.
- **Categories:** question counts by topic, difficulty and type.
- **AI question generator:** describe a topic, category, difficulty and type, and an LLM drafts questions. Every draft
  is validated like a hand-written question, saved **unpublished**, and goes live only when you press Approve
  (or you delete it).

---

## Honest limits

These are stated in the app as well, and worth knowing before you show it to anyone.

- **Running code needs a sandbox, and the safe one is external.** The API never runs untrusted code in production.
  It talks to [Judge0](https://github.com/judge0/judge0) (hosted or self-hosted). The Judge0 client is tested here
  against a mocked Judge0 only: you need your own Judge0 URL/key to see it work for real. The `local` runner (Python
  only, `ulimit`-style limits, own process group) is for your own machine and **refuses to start when
  `ENVIRONMENT=production`**, because it is not a security boundary. With `CODE_RUNNER=disabled`, coding questions
  can be read but not run, and the app says so.
- **The AI features are advisory and call a third-party model.** Hints and feedback can be wrong. The hint guard
  (below) catches an answer being copied out, not every possible leak. The LLM text never changes a score.
  The LLM integration is tested against fake and mocked providers; you supply a real key to use it.
- **The readiness model uses synthetic training data.** It is a rubric plus a logistic-regression classifier trained
  on generated examples, not on real hiring outcomes. The API returns `validated_against_real_outcomes: false` and
  the UI shows a disclaimer. Treat it as practice guidance, not a prediction.
- **Password-reset emails are logged, not sent**, until you plug an email provider into `backend/app/core/email.py`.
- **How much of it is "AI":** the readiness model and short-answer scoring are classical ML (logistic regression,
  TF-IDF). The generative-AI part is the three LLM features above, each wrapped in validation and limits. There is no
  fine-tuned model and no chatbot.

---

## Architecture

```mermaid
flowchart LR
  B[Browser] --> N["nginx :8080"]
  N -->|static files| SPA[React SPA]
  N -->|/api| API[FastAPI]
  API --> R[Routes + auth dependencies] --> S[Services] --> Repo[Repositories] --> PG[(PostgreSQL)]
  S --> ML["ml/ package (pure Python)"]
  S --> CR["CodeRunner: Judge0 | local (dev) | disabled"]
  S --> AI["AI service (hints, feedback, generator)"] --> L["LLM provider (optional)"]
  S --> SQL["SQL sandbox (isolated schema, read-only)"]
```

The backend is layered: routes handle HTTP and authorization, services hold the business rules, repositories are the
only code that touches the database, and `app/ml/` is pure Python with no HTTP or database imports, so it is easy to
test and read.

### Key design decisions

- **Auth:** passwords hashed with argon2. Short-lived access tokens (15 minutes) plus rotating, database-backed
  refresh tokens; reusing a revoked refresh token revokes all of that user's sessions. Reset links are single-use.
  Role checks happen on the server; the UI only hides things.
- **Timed tests:** the server owns the deadline and expires overdue attempts itself, so closing the tab or changing
  the clock cannot extend a test. Submitting twice is safe (idempotent). A user can only have one active attempt per
  assessment, enforced by a database index.
- **No answer leakage:** learners never receive correct options, SQL solutions, hidden tests or explanations before
  they have answered.
- **SQL sandbox:** one validated `SELECT`, run in a throwaway schema, in a read-only transaction, as a role with no
  privileges, with a 3 second timeout and a 200 row cap.
- **Autosave that does not lose work:** debounced saves with retries, and a clear "saved / saving / failed" indicator.
- **Rate limiting** on login, register, password reset, run and submit.

### Generative-AI features and how they are kept honest

| Feature | Where | Safeguards |
|---|---|---|
| Hints | `POST /api/questions/{id}/hint` | Three escalating levels. The model sees the question but never the hidden tests; for MCQ/SQL/short answers it gets a *private* reference and the output is run through `ai/guard.py`, which rejects a hint that contains the correct option, 6-8 consecutive tokens of the reference query/answer, or a long code block. One automatic retry, then a clear error. Learner text is passed inside delimiters as data. Disabled for questions in a live assessment or mock interview. |
| AI feedback | `POST /api/questions/{id}/ai-feedback` | Only after you have submitted an answer. Returned **next to** the TF-IDF evaluation, never replacing it. Cached per answer, so asking again costs nothing. |
| Question generator | `POST /api/admin/ai/generate-questions` | Admin only. Output is parsed into the same schema as hand-written questions and runs the same validation. SQL drafts must execute and reproduce their own reference result (dataset SQL is limited to CREATE TABLE / INSERT). Coding drafts must pass **all** generated test cases when their reference solution is executed. Drafts are saved unpublished (`ai_generated=true`); `POST /api/admin/questions/{id}/approve` publishes and is audit-logged. Learners see an "AI-drafted, admin-reviewed" badge. |
| All of them | `ai_interactions` table | Every call is logged (user, question, model, output, latency). Per-user daily cap (`AI_DAILY_LIMIT_PER_USER`) plus a per-minute rate limit. Provider failures return a 503 with a friendly message; the rest of the app is unaffected. |

Providers: `openai_compatible` (OpenAI, Groq, Gemini's OpenAI-compatible endpoint, OpenRouter, Ollama, ...) or
`anthropic`. Set `LLM_PROVIDER`, `LLM_MODEL`, `LLM_API_KEY` (and `LLM_BASE_URL` for openai_compatible).

### Running code

| `CODE_RUNNER` | Use it for | Notes |
|---|---|---|
| `local` | Your own machine / `docker compose` | Python only. Subprocess with CPU, memory, file-size and process limits, scrubbed environment, no shell. **Not a security boundary.** Refuses to run in production. This is what the Docker quick start uses. |
| `judge0` | Any public deployment | Python and Java. Set `JUDGE0_URL` (+ `JUDGE0_API_KEY`, and `JUDGE0_API_HOST` for RapidAPI). The sandboxing is Judge0's. |
| `disabled` | When you do not want code run | Coding questions are read-only. |

Coding questions use stdin/stdout: read input from standard input, print the answer. Java solutions must be
`public class Main`.

### The ML pipeline

| Piece | How it works |
|---|---|
| Features | Per-topic accuracy, recent trend, speed, consistency, coverage, difficulty mix (`ml/features.py`). |
| Readiness | A rubric gives a score; a logistic regression trained on synthetic data gives a category and the factors behind it (`ml/readiness.py`). Deterministic: same history, same result. |
| Short-answer grading | TF-IDF similarity to a model answer plus concept matching with weights (`ml/evaluation.py`). |
| Recommender | Ranks questions by weakness, difficulty fit and freshness, and stores the reason with each recommendation (`ml/recommender.py`). |
| Mock-interview builder | Selects questions by role weights, level difficulty mix and your weak topics (`ml/interview.py`). |

---

## Tech stack

| Layer | Tools |
|---|---|
| Frontend | React 18, TypeScript, Vite, Tailwind CSS, TanStack Query, React Router, Recharts, Monaco editor |
| Backend | FastAPI, Pydantic v2, SQLAlchemy 2, Alembic, PyJWT, argon2 |
| Database | PostgreSQL 16 |
| ML | scikit-learn, NumPy, pandas |
| Testing | pytest (215 tests), Vitest and Testing Library (152 tests), axe accessibility checks |
| Infra | Docker, Docker Compose, nginx, GitHub Actions CI |

---

## Quick start (Docker)

1. Install and start Docker Desktop.
2. In this folder run:
   ```bash
   docker compose up -d --build
   ```
   The first build takes several minutes.
3. Open **http://localhost:8080** and sign in with `admin@interviewarena.com` / `abcd1234`, or register a normal
   learner account.

The `.env` in this folder has working local-development values. On every start the backend container applies the
database migration and loads the sample data (27 questions and 2 assessments; safe to repeat).

- API documentation: http://localhost:8000/docs
- Stop: `docker compose down`
- Stop and delete all data: `docker compose down -v`
- If you change `POSTGRES_PASSWORD` after the first start, run `docker compose down -v` first, because Postgres only
  reads that password when it first creates the database.

### Configuration (`.env`)

| Variable | Meaning |
|---|---|
| `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` | Database credentials created on first start. |
| `DATABASE_URL` | How the API connects. The password in it **must equal** `POSTGRES_PASSWORD`. Host is `postgres` inside Docker, `localhost` if you run the API on your own machine. |
| `TEST_DATABASE_URL` | Database used by the backend tests. |
| `JWT_SECRET` | Long random string used to sign tokens. Required; the app will not start without it. |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | The first admin account, created or promoted by the seed script. |
| `CORS_ORIGINS`, `FRONTEND_URL` | Allowed browser origins and the site's public address. |
| `CODE_RUNNER` | `local` (default in `.env.example`), `judge0` or `disabled`. See "Running code". |
| `JUDGE0_URL`, `JUDGE0_API_KEY`, `JUDGE0_API_HOST` | Only for `CODE_RUNNER=judge0`. |
| `LLM_PROVIDER`, `LLM_BASE_URL`, `LLM_MODEL`, `LLM_API_KEY` | Turn on hints, AI feedback and the generator. `LLM_PROVIDER=disabled` (default) turns them off. |
| `AI_DAILY_LIMIT_PER_USER` | Cap on AI requests per user per day (default 30). |
| `ML_ENABLED` | `false` turns off readiness, recommendations and short-answer grading; everything else still works. |
| `RATE_LIMIT_ENABLED` | Turn the rate limiter on or off. |

### Run without Docker (development)

```bash
# 1. Database: any PostgreSQL 16 whose user may create roles; put its URL in backend/.env
cd backend
pip install -r requirements.txt -r requirements-dev.txt
alembic upgrade head
python -m scripts.seed
uvicorn app.main:app --reload            # http://localhost:8000

# 2. Frontend, in a second terminal
cd frontend
npm install
npm run dev                              # http://localhost:5173
```

`backend/.env` needs `DATABASE_URL` (with `localhost`), `JWT_SECRET`, and optionally `ADMIN_EMAIL` and
`ADMIN_PASSWORD`.

### Tests

```bash
# backend: create the test database once, then
docker compose exec postgres createdb -U interviewarena interviewarena_test
cd backend && TEST_DATABASE_URL=postgresql+psycopg://interviewarena:dbpass123@localhost:5432/interviewarena_test pytest

# frontend
cd frontend && npm test
```

---

## Deploying

Two supported routes:

- **Frontend on Vercel, API (Docker) + PostgreSQL on Render**: **[docs/DEPLOY_VERCEL_RENDER.md](docs/DEPLOY_VERCEL_RENDER.md)**.
  Includes `render.yaml` (a Render Blueprint) and `frontend/vercel.json`. Free tiers work for a demo; the guide lists
  their limits (sleeping API, free database expiry).
- **One server with Docker Compose and automatic HTTPS (Caddy)**: **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)**.

---

## Project structure

```
interviewarena/
├── backend/
│   ├── app/
│   │   ├── api/          routes and dependencies (auth, roles, rate limits)
│   │   ├── services/     business rules (practice, attempts, grading, achievements, admin)
│   │   ├── repositories/ all database queries
│   │   ├── ml/           features, readiness, recommender, answer evaluation, interview builder
│   │   ├── ai/           LLM client, prompts and the answer-leak guard
│   │   ├── sandbox/      SQL sandbox and code runners (Judge0, local)
│   │   ├── models/       SQLAlchemy tables
│   │   └── schemas/      request and response shapes
│   ├── alembic/          database migrations
│   ├── scripts/          seed data
│   └── tests/
├── frontend/
│   └── src/
│       ├── pages/        one file per screen (admin screens in pages/admin)
│       ├── components/   UI kit, charts, practice, exam, admin pieces
│       ├── lib/          API client, queries, autosave, helpers
│       └── auth/         sign-in state and route guards
├── docs/                 deployment guides and screenshots/
├── render.yaml                   Render Blueprint (API + PostgreSQL)
├── docker-compose.yml            base setup
├── docker-compose.override.yml   development extras (loaded automatically)
└── docker-compose.prod.yml       production add-on with HTTPS
```

## Ideas for next steps

- Self-host Judge0 so code execution has no third-party dependency.
- Stream hints and feedback; let admins edit the generator prompts.
- An email provider for password resets.
- Retrain the readiness model on real, consented outcome data and publish its validation.
- Evaluate hint quality (a small labelled set of "leaks / does not leak") and track it in CI.

## License

Add the license you prefer (MIT is common for portfolio projects).
