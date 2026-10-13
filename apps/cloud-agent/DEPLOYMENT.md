# Cloud Agent deployment runbook

This is guidance only. It does not create cloud resources, change application code, or authorize a production deployment.

## Current deployment gate

Do not expose this MVP to the public internet yet. It is a restricted demo runtime, not a production-ready autonomous agent.

- Skills are deterministic (/status, /echo, and a draft-plan fallback); no LLM provider is connected.
- Durable cloud operation requires web and worker processes sharing the same existing PostgreSQL database.
- Login throttling remains process-local and trusts the first X-Forwarded-For value. It is not suitable as the only public abuse control behind arbitrary proxies; use a trusted-proxy policy and distributed rate limiting before public exposure.
- Chat and login mutation endpoints reject missing, malformed, or mismatched Origin headers. In production, configure APP_ORIGIN explicitly. Continue reviewing every future mutation endpoint for the same protection.
- The worker refreshes task timestamps every 60 seconds and requeues tasks left in running for more than five minutes, on startup and periodically. A prolonged worker/event-loop stall can still cause duplicate execution; this is best-effort recovery, not a distributed lease.
- Database schema setup is automatic at startup. Use a dedicated database role and back up any shared database before first run.
- The worker executes only allowlisted deterministic skills. Do not add shell, repository-write, deployment, or other side-effecting skills without an isolated sandbox and explicit approval workflow.

## Required environment variables

Configure these in the hosting dashboard; never commit real values:
- ADMIN_PASSWORD: at least 16 characters; use a unique random password.
- SESSION_SECRET: at least 32 random characters; changing it invalidates current sessions.
- DATABASE_URL: connection string for an existing PostgreSQL database shared by web and worker.
- DATABASE_SSL=true when the database provider requires TLS and presents a certificate trusted by the Node.js runtime.
- APP_ORIGIN: exact public origin, including scheme, e.g. https://agent.example.com, with no path.
- NODE_ENV=production.

Never disable certificate verification to make a database connection work. Follow the database provider's documented TLS/CA configuration.

## Hosting layout

Use two separate processes on the same reviewed repository revision:
1. Web service — root directory apps/cloud-agent; build command: npm install --no-audit --no-fund && npm run build; start command: npm run start; health check path: /api/health.
2. Worker service — same root directory and commit; start command: npm run worker; set the same DATABASE_URL and DATABASE_SSL. The worker must not receive a public HTTP endpoint.
3. PostgreSQL — use an already-existing database only unless provisioning has been explicitly approved. Confirm backups, TLS, connection limits, and least-privilege credentials first.

The health endpoint intentionally returns HTTP 503 in memory/demo mode. A successful health response confirms database connectivity mode, not that the worker is alive; monitor worker logs separately.

## Safe rollout checklist

- [ ] Confirm target account, service, region, billing tier, and whether this is staging or production.
- [ ] Confirm an existing PostgreSQL database is available and backed up; do not point the app at a business database without approval.
- [ ] Set secrets in the host dashboard; do not paste secrets into chat or commit them.
- [ ] Deploy web and worker from the same reviewed commit.
- [ ] Confirm GET /api/health returns HTTP 200 with database: postgres.
- [ ] Log in, submit /status, and confirm the task reaches completed in the UI.
- [ ] Restart the worker in staging and verify queued tasks are processed and stale running tasks are requeued.
- [ ] Check TLS, access logs, error handling, distributed rate limiting, backups, and restore procedure.
- [ ] Obtain explicit production approval before production deployment or any paid resource creation.

## Rollback

Rollback by redeploying the last known-good application revision. Do not drop tables or delete database records during rollback. Take a database backup before any schema or data migration. The MVP creates its tables and indexes idempotently; schema changes should use a reviewed migration plan.
