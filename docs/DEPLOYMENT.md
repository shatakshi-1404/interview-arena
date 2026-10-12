# Deploying InterviewArena

This guide puts the whole app (database, API, website) on one cheap Linux server with free HTTPS. It takes about
30 minutes the first time. Nothing here needs a paid service beyond the server and a domain name.

## What you need

- A Linux server with at least 2 GB RAM (for example a DigitalOcean droplet, AWS Lightsail or EC2, Hetzner, or
  Oracle Cloud free tier). Ubuntu 22.04 or 24.04 is assumed below.
- A domain name, with an **A record** pointing at the server's public IP (for example `arena.yourname.com`).
- Ports 80 and 443 open in the server's firewall or security group.

## 1. Install Docker on the server

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER      # log out and back in afterwards
docker compose version             # should print v2.24 or newer
```

## 2. Copy the project to the server

From your own computer, in the folder that contains `interviewarena/`:

```bash
scp -r interviewarena user@YOUR_SERVER_IP:~/
# (or push it to a private GitHub repo and `git clone` it on the server)
```

## 3. Write the production `.env`

On the server, in the project folder, edit `.env`. **Do not reuse the development values.**

```
POSTGRES_USER=interviewarena
POSTGRES_PASSWORD=<long random password, letters and digits only>
POSTGRES_DB=interviewarena

DATABASE_URL=postgresql+psycopg://interviewarena:<same password>@postgres:5432/interviewarena
TEST_DATABASE_URL=postgresql+psycopg://interviewarena:<same password>@postgres:5432/interviewarena_test

JWT_SECRET=<output of: python3 -c "import secrets; print(secrets.token_urlsafe(48))">

ENVIRONMENT=production
CORS_ORIGINS=["https://arena.yourname.com"]
FRONTEND_URL=https://arena.yourname.com

ADMIN_EMAIL=you@yourname.com
ADMIN_PASSWORD=<a strong password, at least 8 characters>

CODE_RUNNER=disabled   # or judge0 (+ JUDGE0_URL ...) to run coding questions: see the README, "Running code"
ML_ENABLED=true
RATE_LIMIT_ENABLED=true

DOMAIN=arena.yourname.com
```

Generate the random password the same way as the JWT secret. The password inside the two URLs must match
`POSTGRES_PASSWORD` exactly.

## 4. Start it

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
docker compose ps
docker compose logs -f backend      # Ctrl+C to stop watching
```

Naming both files matters. It skips `docker-compose.override.yml` (the development one), so the database and API
ports are not opened to the internet. Only Caddy listens, on 80 and 443, and it gets a free HTTPS certificate from
Let's Encrypt automatically the first time you visit the domain.

On first start the backend applies the database migration and loads the sample questions and assessments, and
creates your admin account from `ADMIN_EMAIL` / `ADMIN_PASSWORD`.

Open `https://arena.yourname.com`, sign in as the admin, and take your screenshots.

## 5. Updating later

```bash
git pull                                   # or copy the new files over
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

Database migrations run automatically on each start. The data lives in the `pgdata` Docker volume and survives
rebuilds.

## 6. Backups

```bash
docker compose exec -T postgres pg_dump -U interviewarena interviewarena | gzip > backup-$(date +%F).sql.gz
```

Run it from cron daily and copy the files off the server. To restore:
`gunzip -c backup.sql.gz | docker compose exec -T postgres psql -U interviewarena interviewarena`.

## Things to know before sharing the link publicly

- **Password reset emails are not sent.** There is no SMTP provider wired in; the reset link is printed in the
  backend logs (`docker compose logs backend`). Implement `EmailSender` in `backend/app/core/email.py` with your
  provider (Resend, SES, Brevo) before real users depend on it.
- **Coding questions need Judge0 in production.** `CODE_RUNNER=local` refuses to start when `ENVIRONMENT=production`
  because it is not a security boundary. Point `CODE_RUNNER=judge0` at a Judge0 service (hosted, or your own
  container) to run code safely. Until then MCQ, SQL and short-answer questions all work.
- **AI features are optional.** Set `LLM_PROVIDER`, `LLM_MODEL` and `LLM_API_KEY` (see the README) to enable hints,
  AI feedback and the admin question generator.
- **Rate limiting is per IP.** Behind Caddy, the API sees Caddy's address unless you tell nginx to trust it. Open
  `frontend/nginx.conf` and uncomment the three `set_real_ip_from` / `real_ip_header` / `real_ip_recursive` lines,
  setting `set_real_ip_from` to your Docker network range (`172.16.0.0/12`). The rate limiter also keeps its counters
  in memory, so run a single backend container (the default).
- **Change the admin password** after first login if you used a simple one to test.
- **Keep `.env` private.** It is in `.gitignore`; never commit it.

## Alternative: free-tier platforms

If you do not want to manage a server you can split the app: the React site on Vercel or Netlify (build with
`VITE_API_URL=https://your-api-host` and set `CORS_ORIGINS` to the site's address), the API as a Docker service on
Render, Railway or Fly.io, and a managed PostgreSQL (Neon, Supabase Postgres, Railway). Set `DATABASE_URL`,
`JWT_SECRET`, `CORS_ORIGINS`, `ADMIN_EMAIL` and `ADMIN_PASSWORD` as environment variables there, and run
`alembic upgrade head && python -m scripts.seed` as the release or start command. The SQL practice sandbox creates a
role and temporary schemas, so the database user needs `CREATEROLE` (most managed providers allow this on the
default admin user). I have not tested these platforms; the single-server route above is the one this repo is set
up for.
