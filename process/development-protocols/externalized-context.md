---
description: "How to keep project context outside the product repo while preserving the existing process/context contract for agents."
---

# Externalized Context

This protocol supports thin-repo setups where the harness still runs locally, but the
durable project context is stored outside the product repository.

The goal is operational compatibility, not a new routing model:

- agents still read `process/context/` locally
- the product repo keeps only a small pointer/config surface
- the authoritative context content lives elsewhere and is synced into a disposable local mirror on demand

## When To Use

Use externalized context when:

- You want the product repo to stay focused on code.
- You are comfortable with network dependency for context hydration.
- You want the same project context usable by multiple local agent hosts without repositing it in the app repo.

Do not use it when:

- Offline work is a hard requirement.
- The team expects context updates to travel with every normal application commit by default.

## Contract

Repository-local config file:

`/.vc-project.json`

Shape:

```json
{
  "planning": {
    "mode": "tracker-native"
  },
  "tracker": {
    "mode": "external",
    "provider": "github",
    "owner": "your-org",
    "repository": "your-repo"
  },
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

Alternate Git-repo-backed mode:

```json
{
  "context": {
    "mode": "external",
    "external": {
      "repository": "git@github.com:your-org/your-project-context.git",
      "ref": "main",
      "subpath": "process/context",
      "syncInto": "process/context"
    }
  }
}
```

Rules:

- `context.mode`
  - `repo` means the repo owns `process/context/` directly.
  - `external` means the repo hydrates `process/context/` from another Git repository.
- `github-wiki` means the repo hydrates `process/context/` from the GitHub wiki attached to the tracked repository and should publish durable context changes back there.
- `context.external.repository`
  - Required in external mode.
- `context.githubWiki`
  - Supported when `planning.mode` is `tracker-native`.
- `context.githubWiki.owner` / `context.githubWiki.repository`
  - Optional overrides. If omitted, the script reuses `tracker.owner` and `tracker.repository`.
- `context.githubWiki.remote`
  - Optional full clone URL override, mainly for nonstandard hosting or tests.
- `context.githubWiki.ref`
  - Wiki branch or ref. Default: `master`.
- `context.githubWiki.subpath`
  - Path inside the wiki repository that contains the context tree. Default: `process/context`.
- `context.githubWiki.syncInto`
  - Local materialization target. Default: `process/context`.
- `context.external.ref`
  - Branch or other Git ref to sync.
- `context.external.subpath`
  - Path inside the external repository that contains the context tree.
- `context.external.syncInto`
  - Local materialization target. Default is `process/context`.

## Sync Mechanism

Use:

```bash
node scripts/vc-sync-external-context.mjs pull
node scripts/vc-sync-external-context.mjs push
```

Behavior:

1. reads `/.vc-project.json`
2. clones or fetches the configured context source into `.git/vc-external-context/`
3. if the external source uses Git submodules, `pull` refreshes them with `git submodule update --init --recursive --remote`
4. `pull` materializes the configured subtree into local `process/context/`
5. `push` mirrors the local hydrated tree back into the external source and commits it there
6. records sync state under `.git/vc-external-context/.../state.json`
7. adds the hydrated context path to `.git/info/exclude` so the local mirror does not pollute normal `git status`

Important constraints:

- this keeps the existing agent contract intact because the final local path is still `process/context/`
- tracked kit files already present under `process/context/`, such as `generated-skills-catalog.json`, are preserved
- the external repository or wiki becomes the authority for the hydrated files, not the product repo
- in `tracker-native` + `github-wiki` mode, context markdown should be treated as disposable local cache, not as committed application source

## Recommended Layout

Use one of these durable homes for project knowledge:

- dedicated context Git repository
- GitHub wiki attached to the tracked repository when `planning.mode` is `tracker-native`

Recommended split:

- harness distribution: package, release artifact, or kit repository
- project context: separate Git repository or GitHub wiki
- product repo: code + minimal pointer config only

Why:

- git handles Markdown/doc diffs, review, branching, and history better than Packages
- the wiki path is especially useful when the team already operates in GitHub Projects/issues and wants tracker-native storage with no context markdown committed into the product repo
- Packages are better for shipping reusable artifacts than for maintaining evolving operational knowledge

## Operational Notes

- run `pull` before starting substantial work when `context.mode` is `external` or `github-wiki`
- when the external context source uses submodules, `pull` is also responsible for advancing them to the latest remote revision
- run `push` after durable context edits when the authoritative source is outside the product repo
- if the external context source changes, re-run `pull` to refresh the local mirror
- if you change the local target path away from `process/context`, update root contracts and discovery scripts in the same patch. The default protocol assumes `process/context/`

## Current Scope

This is a thin-repo compatibility layer, not a full remote-context platform.

Current tranche includes:

- config contract
- pull/push sync script
- GitHub wiki support for tracker-native projects
- root-contract documentation

Future work, if needed:

- automatic preflight sync in setup/update flows
- smarter conflict handling when both local cache and remote source changed
- support for a repo-local context stub that can switch between multiple external sources
