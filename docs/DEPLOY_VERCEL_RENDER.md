# Deploy: website on Vercel, API + PostgreSQL on Render

```
Browser ──► Vercel (static React site)
   │
   └──────► Render web service (Docker: FastAPI) ──► Render PostgreSQL
                        │
                        ├──► Judge0 (optional, runs coding questions)
                        └──► LLM provider (optional, hints / AI feedback / generator)
```

Sign-in uses bearer tokens (no cookies), so the two sites only need **CORS** set correctly and the website needs to
know the API's address. No Neon, no extra services: the database is Render's own PostgreSQL.

You need: a GitHub account, a Vercel account and a Render account. The free plans are enough for a demo.

## 0. Put the project on GitHub

Unzip it, then from the `interviewarena` folder:

```bash
git init && git add . && git commit -m "InterviewArena"
git branch -M main
git remote add origin https://github.com/<you>/interviewarena.git   # create the empty repo on GitHub first
git push -u origin main
```

`.env` is git-ignored, so your local passwords are not uploaded. Never commit real keys.

## 1. Render: database + API (one step, via the Blueprint)

1. Render dashboard → **New → Blueprint** → choose your repo. Render reads `render.yaml` and proposes a PostgreSQL
   database (`interviewarena-db`) and a Docker web service (`interviewarena-api`).
2. It asks for the values marked `sync: false`. For now enter:
   - `ADMIN_EMAIL` and `ADMIN_PASSWORD`: your admin login (8+ characters). Created on first start.
   - `CORS_ORIGINS` and `FRONTEND_URL`: put `https://placeholder.vercel.app` for now, you fix them in step 3.
   - `JUDGE0_API_KEY`, `LLM_API_KEY`: leave blank for now.
3. Click **Apply**. The first build takes a few minutes. When it is live, open
   `https://<your-service>.onrender.com/api/ready`. It should show `{"status":"ok"}`.
   (`/docs` shows the interactive API documentation.)

On every start the container runs the migrations, seeds the questions (safe to repeat) and starts the server on the
port Render provides (`backend/start.sh`).

## 2. Vercel: the website

1. Vercel → **Add New → Project** → import the same repo.
2. **Root Directory: `frontend`**. Framework preset: Vite (detected). `vercel.json` already sets the build output and
   the single-page-app rewrite.
3. **Environment Variables** → add `VITE_API_URL` = `https://<your-service>.onrender.com` (no trailing slash, no `/api`).
4. Deploy. Note the URL, for example `https://interviewarena.vercel.app`.

`VITE_API_URL` is baked in at **build** time. If you change it later, redeploy the site.

## 3. Connect them

In Render → your web service → **Environment**:

- `CORS_ORIGINS` = `https://interviewarena.vercel.app` (your real Vercel URL; several allowed, comma-separated)
- `FRONTEND_URL` = the same URL (used in password-reset links)

Save. Render redeploys. Now open the Vercel URL, register an account, and sign in with your admin email and
password to see the admin console.

## 4. Turn on running code (optional)

The API never runs untrusted code itself in production. Use Judge0:

1. Get a Judge0 endpoint. The easiest hosted option is **Judge0 CE on RapidAPI** (it has a free tier; check its current
   limits), or host Judge0 yourself.
2. In Render → Environment (RapidAPI example):
   - `CODE_RUNNER` = `judge0`
   - `JUDGE0_URL` = `https://judge0-ce.p.rapidapi.com`
   - `JUDGE0_API_HOST` = `judge0-ce.p.rapidapi.com`
   - `JUDGE0_API_KEY` = your RapidAPI key
   For self-hosted Judge0 set only `JUDGE0_URL` (and `JUDGE0_API_KEY` if you configured `AUTHN_TOKEN`).
3. Open a coding question and press **Run**. A bad key shows "not configured correctly", a busy service "try again".

Do **not** set `CODE_RUNNER=local` on Render: the local runner refuses to start in production on purpose.

## 5. Turn on the AI features (optional)

Pick any provider. Examples (check the provider for current model names and free-tier limits):

| Provider | `LLM_PROVIDER` | `LLM_BASE_URL` | `LLM_MODEL` |
|---|---|---|---|
| Groq | `openai_compatible` | `https://api.groq.com/openai/v1` | a model id from Groq's list |
| Google Gemini (OpenAI-compatible endpoint) | `openai_compatible` | `https://generativelanguage.googleapis.com/v1beta/openai` | a Gemini model id |
| OpenAI | `openai_compatible` | `https://api.openai.com/v1` | a model id |
| Anthropic | `anthropic` | (leave empty) | a Claude model id |

Set those three plus `LLM_API_KEY` in Render → Environment. Then:

- Every question shows **Give me a hint**.
- After submitting a short answer, **Get AI feedback** appears.
- Admin → **AI generator** drafts questions. Review each draft, then **Approve** (or delete). Drafts are never visible
  to learners until approved.

`AI_DAILY_LIMIT_PER_USER` (default 30) caps spend per user.

## Free-tier facts you should know

- **The API sleeps after about 15 minutes idle.** The next request takes roughly 30 to 60 seconds. Open the site once
  before showing it to someone, or use a paid instance.
- **Free Render PostgreSQL databases expire after 30 days** (check Render's current terms). For a long-lived demo
  upgrade the database or export/recreate it. The seed restores the questions; user accounts are lost.
- The free web instance has 512 MB RAM. If the API restarts with out-of-memory errors, set `ML_ENABLED=false`
  (readiness, recommendations and short-answer scoring turn off; everything else keeps working).
- Rate limits are kept in memory, which is right for one instance. Do not scale to several instances without moving
  them to Redis.
- SQL practice runs queries in a throwaway schema inside your Render database. If Render's database user cannot
  create roles, the app logs a warning and still applies the other protections (single read-only SELECT, read-only
  transaction, timeout, row cap, throwaway schema), only without the extra no-privilege role.
- Password-reset emails are written to the server log until you plug in an email provider.

## Troubleshooting

| Symptom | Cause and fix |
|---|---|
| Browser console: "blocked by CORS policy" | `CORS_ORIGINS` on Render does not exactly match the Vercel URL (scheme, no trailing slash). Fix it and wait for the redeploy. |
| Site loads but every request fails or hits Vercel's 404 | `VITE_API_URL` missing or wrong. Fix it in Vercel and **redeploy**. |
| First request hangs for a minute | The free API was asleep. Wait, then retry. |
| Render deploy fails on `alembic` | Check the log. The database must exist and `DATABASE_URL` must come from the Blueprint (`fromDatabase`). |
| Cannot sign in as admin | `ADMIN_EMAIL`/`ADMIN_PASSWORD` were empty on first start. Set them and redeploy: the seed creates or promotes the admin on every start. |
| "Code execution is not enabled" | `CODE_RUNNER` is still `disabled`. See step 4. |
| "AI features are not enabled" | `LLM_PROVIDER` is `disabled`, or `LLM_MODEL`/`LLM_API_KEY` is missing. See step 5. |

## What to say on a resume (truthfully)

- Full-stack: React + TypeScript SPA on Vercel, FastAPI on Render in Docker, PostgreSQL with Alembic migrations.
- Backend: layered architecture, JWT auth with rotating refresh tokens, role-based admin, rate limiting, a sandboxed
  SQL evaluator, a pluggable code-execution layer (Judge0 client), 400+ automated tests.
- AI/ML: TF-IDF + concept scoring and a logistic-regression readiness model (trained on synthetic data, stated as
  such), plus LLM features (hints with an answer-leak guard, AI feedback beside a deterministic score, an
  admin-approved question generator whose outputs are verified by execution).
