# AI provider configuration

The Cloud Agent can optionally call one OpenAI-compatible chat-completions endpoint from its server-side worker. The original deterministic skills remain available when no AI configuration is present.

Configure these variables in the hosting environment (never commit real values):

- `AI_PROVIDER`: display/diagnostic label, for example `openrouter` or `groq`.
- `AI_BASE_URL`: trusted provider API base URL, for example `https://api.example.com/v1`.
- `AI_API_KEY`: server-only provider key.
- `AI_MODEL`: exact model identifier supported by that endpoint.

The adapter appends `/chat/completions` unless the supplied URL already ends with that path. Use the provider's documented base URL. HTTPS is required outside local development. Requests time out after 30 seconds; prompts and output are bounded; upstream response bodies and credentials are not copied into errors. Provider-side usage limits and account billing still apply.

Without all three required values (`AI_BASE_URL`, `AI_API_KEY`, `AI_MODEL`), the worker retains deterministic draft-plan behavior. Do not use in-memory demo mode for durable cloud operation. Configure the same environment values on the worker process, because model calls run there.

Verification: from `apps/cloud-agent`, run `npm test`, `npm run typecheck`, and `npm run build`. A live provider smoke test additionally requires valid credentials and may incur usage charges.
