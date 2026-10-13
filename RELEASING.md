# Release checklist

OCode.js uses a Git tag beginning with `v` to trigger the npm publishing workflow.

## One-time setup

1. Confirm that the npm package name `ocode-js` is available and belongs to the intended publisher account: https://www.npmjs.com/package/ocode-js
2. Sign in to npm and create a publishing token suitable for GitHub Actions. Prefer npm's trusted publishing/OIDC setup where available; if using a token, store it only as a GitHub Actions repository secret named `NPM_TOKEN`.
3. Open the repository's **Settings → Secrets and variables → Actions** and add `NPM_TOKEN`. Never paste the token into a source file, issue, commit, or chat.
4. Ensure the account has permission to publish the package and that npm's 2FA/publishing policy is satisfied.

## Before each release

- [ ] Review changes and API compatibility.
- [ ] Update `version` in `package.json` and keep `OCODE_VERSION` in `src/index.ts` and its test in sync.
- [ ] Update the README and release notes.
- [ ] Verify locally with Node.js 18+: `npm install`, `npm test`, and `npm pack --dry-run`.
- [ ] Confirm the CI workflow is green on the exact commit to be released.
- [ ] Check that the target version has not already been published to npm.

## Publish

Create and push a tag that matches the version in `package.json`. Example only — use this after the checklist passes and the package name/credentials are confirmed:

```sh
git tag v0.1.0
git push origin v0.1.0
```

The GitHub Actions workflow at `.github/workflows/release.yml` runs the tests, checks the package contents, then publishes to npm with provenance. A tag is a real publication trigger; do not push one until the release is intentionally approved.

## Verify after publishing

- Confirm the workflow run succeeds: https://github.com/Velclaw/OCode.js/actions/workflows/release.yml
- Open https://www.npmjs.com/package/ocode-js and confirm the version and README.
- In a clean project, install the exact published version and smoke-test the root import and subpath exports.
- Create a GitHub Release with the same version and release notes: https://github.com/Velclaw/OCode.js/releases/new

## Current state

The release workflow and initial API documentation are committed, but npm publication has **not** been performed. The package name, npm publisher access, and repository secret must be verified before tagging a release.
