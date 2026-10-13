# Cloud Agent deployment runbook

This is guidance only. It does not create cloud resources, change application code, or authorize a production deployment.

## Current deployment gate

Do not expose this MVP as an autonomous production agent yet. It is a restricted runtime.

- GitHub OAuth login is restricted by the explicit GITHUB_ALLOWED_USERS allowlist. No password-based admin login remains.
- Skills are deterministic (/status, /echo, and a draft-plan fallback); no shell, repository-write, deployment or arbitrary command execution.
- Durable cloud operation requires web and worker processes sharing the same existing PostgreSQL database.
- Do not point the app at a business database without approval and a verified backup.
- Worker recovery is best-effort, not a distributed lease. Monitor worker logs separately.
- Database schema setup is automatic at startup; use a dedicated least-privilege database role.

## Required environment variables

Set in the hosting dashboard only; never commit real values:
- GITHUB_CLIENT_ID: GitHub OAuth App client ID.
- GITHUB_CLIENT_SECRET: GitHub OAuth App client secret.
- GITHUB_ALLOWED_USERS: comma-separated GitHub usernames allowed to sign in. Keep the list minimal.
- SESSION_SECRET: at least 32 random characters; changing it invalidates sessions.
- DATABASE_URL: existing PostgreSQL connection string shared by web and worker.
- DATABASE_SSL=true when the database provider requires TLS and presents a certificate trusted by Node.js.
- APP_ORIGIN: exact public origin including scheme, e.g. https://agent.example.com, no path.
- NODE_ENV=production.

## GitHub OAuth configuration

Create/configure a GitHub OAuth App with:
- Homepage URL: the exact APP_ORIGIN.
- Authorization callback URL: https://your-hostname.example/api/auth/callback (must exactly match APP_ORIGIN + /api/auth/callback).
- Add only approved GitHub usernames to GITHUB_ALLOWED_USERS.
Never expose GITHUB_CLIENT_SECRET or SESSION_SECRET in NEXT_PUBLIC variables, client code, commits, or chat messages.

## Hosting layout

Use two separate processes from the same reviewed repository revision:
1. Web service — root directory apps/cloud-agent; build command: npm install --no-audit --no-fund && npm run build; start command: npm run start; health check path: /api/health.
2. Worker service — same root directory and commit; start command: npm run worker; set the same DATABASE_URL and DATABASE_SSL. The worker must not receive a public HTTP endpoint.
3. PostgreSQL — use an existing database only unless provisioning is explicitly approved. Confirm backups, TLS, connection limits, and least-privilege credentials first.

Health returns HTTP 503 in memory/demo mode. A successful health response confirms database connectivity mode, not that the worker is alive; monitor worker logs separately.

## Safe rollout checklist

- [ ] Confirm target account, service, region, billing tier, and whether this is staging or production.
- [ ] Confirm an existing PostgreSQL database is available and backed up.
- [ ] Set OAuth and session secrets in the host dashboard; do not paste secrets into chat or commit them.
- [ ] Deploy web and worker from the same reviewed commit.
- [ ] Confirm GET /api/health returns HTTP 200 with database: postgres.
- [ ] Sign in with an allowlisted GitHub account, submit /status, and confirm the task reaches completed.
- [ ] Check TLS, access logs, error handling, distributed rate limiting, backups, and restore procedure.
- [ ] Obtain explicit production approval before production deployment or any paid resource creation.

## Rollback

Rollback by redeploying the last known-good application revision. Do not drop tables or delete database records during rollback. Take a database backup before any schema or data migration.
