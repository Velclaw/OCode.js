# OCodejs framework acceptance checklist

## CLI
- [x] Help/version and invalid command diagnostics.
- [x] Root path and port validation.
- [x] Static server GET/HEAD, MIME types, nosniff and path traversal protection.
- [x] Static build copies public assets and emits a manifest.

## Router
- [x] Deterministic route manifest for root/nested pages.
- [x] Static segments, `[param]` segments and URL-neutral route groups.
- [x] Inherited layout/loading/error conventions.
- [x] Duplicate conventions and structural route collisions are detected.

## Core
- [x] Node.js HTTP server integrates route manifest.
- [x] JavaScript page/layout modules return HTML strings or Response.
- [x] Layouts wrap page output; middleware supports ordered execution and short-circuit.
- [x] 404, 405, malformed-path 400, and generic 500 behavior.

## Not implemented
- [ ] TypeScript/JSX compiler and type checking.
- [ ] HMR and development file watching.
- [ ] API route conventions, hydration and production bundling.
- [ ] Active loading/error boundaries and automatic middleware discovery.
- [ ] Catch-all and optional catch-all routes.
