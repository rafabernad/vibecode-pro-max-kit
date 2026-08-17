---
name: protocol:tracker-native-planning
description: "How to run planning and progress tracking with an external tracker while keeping only minimal execution artifacts in the repo."
date: 09-08-26
metadata:
  node_type: memory
  type: protocol
  read_order: 8
  required: false
  read_when: "planning work, decomposing initiatives, deciding where RIPER state lives, or running tracker-native projects"
---

# Tracker-Native Planning

## Purpose

This protocol defines the tracker-native operating mode.

In tracker-native mode:

- the external tracker is the source of truth for work decomposition and progress
- RIPER runs inside each tracked work block
- the repository keeps only minimal execution-oriented artifacts when they are truly needed
- durable context should default to an external surface, preferably the GitHub wiki attached to the tracked repository when `tracker.provider` is `github`

This is the preferred mode for mature teams that want a clean repository and durable operational
tracking outside the codebase.

## Config Contract

Project-level config lives in `/.vc-project.json`.

Relevant fields:

```json
{
  "planning": {
    "mode": "tracker-native",
    "repoExecutionContracts": "allowed",
    "repoBacklog": "forbidden"
  },
  "tracker": {
    "mode": "external",
    "provider": "github",
    "owner": "your-org",
    "repository": "your-repo",
    "projectNumber": "12",
    "phaseField": "Block",
    "riperField": "RIPER State"
  }
}
```

Rules:

- `planning.mode`
  - `repo` -> repository-centric plan artifacts are allowed as the default
  - `tracker-native` -> tracker is the default source of truth for active work management
- `planning.repoExecutionContracts`
  - `allowed` -> compact repo-local execution contracts are permitted when needed
  - `forbidden` -> even execution contracts should stay out of the repo unless explicitly approved
- `planning.repoBacklog`
  - `compatibility-only` -> legacy backlog dirs may exist but should not grow
  - `forbidden` -> do not create new repo backlog artifacts
- `tracker.mode`
  - `none` -> no tracker contract declared
  - `external` -> tracker is expected to exist outside the repo
- `tracker.provider`
  - current documented target is `github`

## Work-Object Mapping

For GitHub-native teams, use this mapping:

- initiative / whole plan -> parent issue
- block / tranche / phase-like executable chunk -> child issue
- concrete executable task -> sub-issue
- status, owner, sequencing, risk, and RIPER state -> project fields
- milestone -> only real delivery gate or external checkpoint

Do not model the plan primarily as a giant markdown file when the tracker can hold the structure
directly.

## RIPER Placement

RIPER is a workflow, not the main storage hierarchy.

Therefore:

- do not create one tracker object per RIPER phase by default
- do keep RIPER state on the relevant issue or tracker card
- do run RIPER inside each bounded work block

Recommended field values for `RIPER State`:

- `Research`
- `Spec`
- `Innovate`
- `Plan`
- `Validate`
- `Execute`
- `Update Process`
- `Blocked`
- `Done`

Recommended field values for `Block`:

- initiative-defined slices such as `Reference Surfaces`, `Catalog Foundation`, `Quality Gates`
- not generic RIPER labels

## Repo-Local Exceptions

Tracker-native mode still allows narrow repo-local artifacts when they materially help execution.

Allowed examples:

- compact execution contract for a risky tranche
- validate-contract or evidence pack for high-risk work
- repo-local technical decision note that has immediate implementation consequences

Not allowed as defaults:

- backlog markdown
- phase trackers
- long progress reports
- decomposition documents that simply restate issue hierarchy
- long-lived active plan files whose primary job is coordination
- committed context markdown in the product repository when `context.mode` is `github-wiki`

## vc-generate-plan Behavior

When `planning.mode` is `tracker-native`, `vc-generate-plan` should default to:

1. produce a tracker structure recommendation or tracker-ready decomposition
2. keep any repo artifact minimal and execution-oriented
3. avoid creating repo backlog or long status-heavy markdown plans unless explicitly requested or
   clearly required by risk

The burden of proof is on the repo artifact, not on the external tracker.

## Minimal Repo Execution Contract

When a repo-local artifact is required in tracker-native mode, keep it compact.

It should answer only:

- what code or surfaces will change
- what public contract or risk is in play
- what proof is required before the work is considered safe
- what exact next execution step a fresh agent should take

If a section exists only to mirror tracker state, remove it.

## Operational Surface

Tracker-native mode is not fully enforced unless the tracker is an operationally accessible surface.

For GitHub-backed projects, the harness now provides a local adapter:

```bash
node scripts/vc-tracker-github.mjs status --json
node scripts/vc-tracker-github.mjs next --json
node scripts/vc-tracker-github.mjs set-riper --issue 123 --state Execute
node scripts/vc-tracker-github.mjs comment --issue 123 --body-file /tmp/closeout.md
node scripts/vc-tracker-github.mjs create-followup --title "Follow-up task" --body "..."
```

Expected behavior:

- `status` and `next` are the first read surfaces for active work in `tracker-native` mode
- `set-riper` updates the configured GitHub Project single-select field named by `tracker.riperField`
- `comment` attaches closeout or evidence back to the issue instead of inventing repo-local progress logs
- `create-followup` creates deferred work in the tracker instead of `process/.../backlog`

Operational precedence in `tracker-native` mode:

1. read the tracker adapter
2. use repo-local execution contracts only when explicitly present or required by risk
3. hydrate durable context from the configured external surface before substantial work
4. do not recreate tracker state or durable context in repo-local markdown just because the repo is easier to scan

## GitHub Wiki Context

When `planning.mode` is `tracker-native` and `tracker.provider` is `github`, the preferred durable
context surface is the repository wiki.

Recommended config:

```json
{
  "context": {
    "mode": "github-wiki",
    "githubWiki": {
      "ref": "master",
      "subpath": "process/context",
      "syncInto": "process/context"
    }
  }
}
```

Rules:

- run `node scripts/vc-sync-external-context.mjs pull` before substantial work
- treat the hydrated `process/context/` tree as local cache, not durable repo content
- run `node scripts/vc-sync-external-context.mjs push` after durable context edits
- do not commit context markdown changes into the product repository when the wiki is authoritative

## Migration Rule

When moving from markdown-plan mode to tracker-native mode:

1. create the tracker hierarchy first
2. preserve existing repo plans only until the tracker state is complete
3. reduce surviving repo artifacts to compact execution contracts or eliminate them
4. stop creating new backlog or progress markdown in the repo

## Current Limitation

The GitHub adapter provides a real operational surface, but enforcement is still partial until every
plan/audit/resume helper reads it before falling back to repo-local artefacts. Any surface that still
assumes local plan inventory is primary can reintroduce repo-centric drift.
