# Render staging plan (no resources provisioned)

This plan is documentation only. It does not create, edit, restart, or deploy Render resources, and it does not change any database or secret.

## Safety gates

- Target workspace: VELCLAW.
- Use a dedicated staging database only after its owner, backup/restore path, TLS settings, and intended data scope are confirmed.
- Do not reuse `velclawsql-db`, which belongs to another project; do not revive the suspended `velclaw-db`.
- No paid instance, paid database, or paid add-on.
- No production deployment until the security checklist is complete and explicitly approved.

## Proposed layout

1. **Web service** from `Velclaw/OCode.js`, root directory `apps/cloud-agent`, Node runtime, build `npm install --no-audit --no-fund && npm run build`, start `npm run start`, health path `/api/health`.
2. **Worker process** from the same commit and root directory, start `npm run worker`. It must use the same staging `DATABASE_URL` as the web service and must not expose a public HTTP endpoint.
3. **PostgreSQL** dedicated to this staging app. Do not provision or attach it until free-tier eligibility, expiry/suspension behavior, backups, and access are verified in the Render dashboard and explicitly approved.
4. **Secrets** set only through the Render dashboard: `ADMIN_PASSWORD`, `SESSION_SECRET`, `DATABASE_URL`, `DATABASE_SSL`, `APP_ORIGIN`, `NODE_ENV=production`, and optional provider credentials if separately approved. Never commit or paste secret values into chat.

## Preflight before creating anything

- [ ] Confirm a free plan supports the required web and worker processes for this workspace; if not, stop rather than select a paid tier.
- [ ] Confirm a dedicated, approved PostgreSQL target and backup/restore process.
- [ ] Confirm the exact staging origin so `APP_ORIGIN` can be set before first login.
- [ ] Replace process-local login throttling with a shared rate-limit strategy and define which proxy headers are trusted before exposing the service publicly.
- [ ] Understand the worker's best-effort recovery behavior: it refreshes `updated_at` every 60 seconds and requeues `running` tasks older than five minutes, but this is not a distributed lease and may allow duplicate execution after a long stall.
- [ ] Confirm Origin protection is enabled for both login and chat mutation endpoints and automated tests pass in CI.
- [ ] Obtain explicit approval before creating a service/database or triggering a deployment.

## Smoke test after separate approval

- `GET /api/health` returns HTTP 200 and reports PostgreSQL mode. This does not confirm the worker is alive; inspect worker logs separately.
- Login works over HTTPS; the session cookie is HttpOnly and Secure.
- Login and chat mutation requests with missing or mismatched Origin are rejected.
- Submit `/status`; confirm the worker completes the task and chat history persists after a web/worker restart.
- Restart the worker during a queued/running task and verify the documented best-effort recovery behavior without assuming exactly-once execution.
- Verify logs do not contain secrets. Test backup restoration before any migration.

## Current limitations

- No LLM provider is connected; skills are deterministic demo behavior (`/status`, `/echo`, and a draft-plan fallback).
- Login rate limiting remains process-local and currently keys on the first `X-Forwarded-For` value. Do not treat this as adequate public abuse protection until trusted-proxy handling and shared rate limiting are addressed.
- Task recovery is best-effort rather than a distributed lease; a healthy database response does not prove the worker is alive.
- The in-memory store is demo-only and is not shared across service instances.

Do not advertise this plan as a deployed service. Provisioning, secrets, database attachment, and deployment each require separate explicit approval.
