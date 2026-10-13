# OCodejs Framework Runtime

This directory is the framework workstream, separate from the existing OCode.js utility toolkit at the repository root.

## Current implementation snapshot

The v0.2.0 runtime scaffold includes three npm workspace packages:

- `@ocodejs/cli`: `dev` and static `build` commands; starts app runtime when `src/app` exists.
- `@ocodejs/router`: scans `src/app`, generates a route manifest, matches static and `[param]` routes, and tracks layout/loading/error conventions.
- `@ocodejs/core`: Node.js HTTP runtime, page/layout module loading, and ordered middleware pipeline.

## Requirements and known limits

- Node.js 18+, npm workspaces.
- Run `npm test` in the extracted framework bundle.
- The runtime currently loads JavaScript page/layout modules returning HTML strings or a `Response`.
- TypeScript/JSX compilation, HMR, active loading/error boundaries, API routes, hydration, and production bundling are not yet implemented.
- The original utility toolkit at the repository root remains untouched.

The source snapshot and historical ZIPs were produced in the ChatGPT development workspace. This documentation commit does not claim those binary archives have been uploaded to this Git branch yet.