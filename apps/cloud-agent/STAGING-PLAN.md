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
- [ ] Confirm login rate limiting is suitable for public exposure.
- [ ] Confirm worker crash recovery/leases are implemented or document manual recovery for staging.
- [ ] Confirm CSRF/origin protection and automated tests pass in CI.
- [ ] Obtain explicit approval before creating a service/database or triggering a deployment.

## Smoke test after separate approval

- `GET /api/health` returns HTTP 200 and reports PostgreSQL mode.
- Login works over HTTPS; session cookie is HttpOnly and Secure.
- Requests with missing or mismatched Origin are rejected for chat mutations.
- Submit `/status`; confirm the worker completes the task and chat history persists after a web/worker restart.
- Verify logs do not contain secrets. Test backup restoration before any migration.

## Current limitations

The MVP does not yet provide distributed rate limiting or automatic recovery for tasks stranded in `running` after a worker crash. A healthy database response does not prove the worker is alive. Do not advertise this staging plan as a deployed service.
