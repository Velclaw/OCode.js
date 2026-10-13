# Repository Source Protection

These rules protect existing OCode.js code and repository resources.

## Change boundaries

- Do not replace, delete, rename, or move existing source files unless the approved task explicitly names that change.
- Inspect the repository structure, current file contents, branch, and diff before making changes.
- Make changes on a dedicated branch; never commit directly to `main`.
- Prefer additive changes and new files. Preserve public exports, APIs, and runtime behavior unless a change is explicitly approved.
- Keep each change limited to its approved scope. Do not include unrelated refactors or formatting changes.
- Never commit credentials, tokens, private keys, production environment files, or user data.
- Do not delete databases, data, secrets, or deployment resources; do not create paid resources without explicit approval.
- Stop and ask for approval if a change risks data loss or exceeds the approved scope.

## Verification

For library changes, run and report:

1. `npm test`
2. `npm run build` (the current test script also runs the build)
3. `npm pack --dry-run`

Report all files added or modified, checks run and their results, and known limitations. Do not claim a test passed unless it was actually executed.

## Pull requests and releases

- Use a branch and pull request for review; do not merge automatically.
- Review the complete diff and verify that no unrelated files changed.
- Do not publish to npm or create a release tag without explicit release approval.
- Never print or expose the value of `NPM_TOKEN`.
- CI success does not itself authorize merging or releasing.
