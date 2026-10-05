# InterviewArena

**Practice smarter. Perform better.**

InterviewArena is a full-stack technical-interview preparation platform. Learners practice MCQ, SQL, short-answer and
coding questions, take timed assessments and mock interviews, and see exactly where they are weak. Recommendations and
a "Practice Readiness" estimate come from their own history by deterministic code, not from a chatbot. The platform is
fully useful with the ML layer switched off.

> **Status:** a portfolio-grade build. Code execution is intentionally disabled by default (see
> [Code execution](#code-execution)), and the readiness model is trained on synthetic data (see
> [ML pipeline](#ml-pipeline)). Both are stated plainly in the UI too.

## Problem

Interview prep tools tell you whether an answer was right, not what to do next. InterviewArena records every answer as a
structured event (topic, difficulty, type, time, score) and turns that into topic accuracy, trends, weak-spot detection
and explainable next-question recommendations.

## Features

- **Practice:** MCQ (single and multi-answer), SQL against controlled datasets, short answers with structured
  feedback, and coding challenges in a Monaco editor (Python and Java).
- **Timed assessments:** server-enforced deadlines, autosave, auto-submit on timeout, per-topic reports.
- **Mock interviews:** pick a role, level and duration; a mixed interview is built (emphasising your weak topics) and
  ends with a performance report.
- **Analytics:** accuracy, consistency, streaks, daily and weekly activity, a topic skill heatmap, difficulty
  breakdown.
- **Practice Readiness:** a transparent rubric plus a logistic-regression classifier, shown with its drivers and caveats.
- **Recommendations:** each one carries a reason with real numbers ("Your recent OS accuracy is 20%").
- **Light gamification:** daily streak, five achievements, an opt-out leaderboard (weekly and monthly).
- **Admin console:** stats, users, a type-aware question editor, an assessment builder, submissions, an audit log.

## Architecture

```mermaid
flowchart LR
  B[Browser] --> N["nginx :8080"]
  N -->|static files| SPA[React SPA]
  N -->|/api| API[FastAPI]
  API --> R[Routes + auth deps] --> S[Services] --> Repo[Repositories] --> PG[(PostgreSQL)]
  S --> ML["ml/ package (pure Python)"]
  S -.->|interface| CR[CodeRunner]
  S --> SQL["SQL sandbox (isolated schema)"]
