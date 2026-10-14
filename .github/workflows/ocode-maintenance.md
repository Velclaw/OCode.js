---
emoji: 🛠️
description: Review OCodejs for bounded maintenance opportunities and report evidence-backed findings without changing source code.
on:
  schedule: weekly
  workflow_dispatch:
permissions:
  contents: read
  issues: read
  pull-requests: read
tools:
  github:
    mode: gh-proxy
    toolsets: [default]
network:
  allowed: []
safe-outputs:
  create-issue:
    title-prefix: "[maintenance] "
    labels: [maintenance]
---

# OCodejs Repository Maintenance Review

## Goal

Perform a bounded, evidence-based maintenance review of the OCodejs repository. Identify a small number of high-value issues involving failing or missing tests, stale documentation, obvious configuration inconsistencies, or security-relevant dependency/configuration concerns.

## Scope and guardrails

- Inspect repository files and recent merged pull requests using GitHub read tools only.
- Do not execute repository code, install packages, access external networks, or inspect secret values.
- Do not edit, delete, overwrite, commit, merge, deploy, or publish repository files.
- Do not claim a test or build passed unless a recorded CI result proves it.
- Separate verified findings from hypotheses; include file paths, line references where available, and the evidence for each finding.
- Select at most one bounded, actionable maintenance task per run.
- Before reporting a finding, check open issues for an existing issue with the same normalized finding. Avoid duplicate reports.

## Output

If a new, well-supported maintenance finding exists, use the configured `create-issue` safe output to open one concise issue. Include:
- Summary and impact
- Evidence and affected paths
- Reproduction or validation steps that do not require secrets
- A narrowly scoped suggested fix
- Explicitly unverified assumptions

If no actionable finding is supported by evidence, call `noop` with a short reason. Do not create an issue merely to report that the repository was inspected.

## Safety

All agent operations must remain read-only. Any source-code change must be made separately in a human-reviewed branch or pull request, never by this workflow.
