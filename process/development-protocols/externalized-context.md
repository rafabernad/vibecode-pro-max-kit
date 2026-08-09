---
description: "How to keep project context outside the product repo while preserving the existing process/context contract for agents."
---

# Externalized Context

This protocol supports a thin-repo setup where the harness still runs locally, but the
durable project context is stored in a separate Git repository.

The goal is operational compatibility, not a new routing model:

- Agents still read `process/context/` locally.
- The product repo keeps only a small pointer/config surface.
- The authoritative context content lives elsewhere and is synced into the working tree on demand.

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
- `context.external.repository`
  - Required in external mode.
- `context.external.ref`
  - Branch or other Git ref to sync.
- `context.external.subpath`
  - Path inside the external repository that contains the context tree.
- `context.external.syncInto`
  - Local materialization target. Default is `process/context`.

## Sync Mechanism

Use:

```bash
node scripts/vc-sync-external-context.mjs
```

Behavior:

1. Reads `/.vc-project.json`
2. Clones or fetches the external context repository into `.git/vc-external-context/`
3. Materializes the configured context subtree into the local `process/context/`
4. Records sync state under `.git/vc-external-context/.../state.json`
5. Adds the hydrated context path to `.git/info/exclude` so the synced files do not pollute normal `git status`

Important constraints:

- This keeps the existing agent contract intact because the final local path is still `process/context/`.
- Tracked kit files already present under `process/context/`, such as `generated-skills-catalog.json`, are preserved.
- The external repository becomes the authority for the hydrated files, not the product repo.

## Recommended Layout

Use a dedicated context repository, not GitHub Packages, for project knowledge.

Recommended split:

- Harness distribution: package, release artifact, or kit repository
- Project context: separate Git repository
- Product repo: code + minimal pointer config only

Why:

- Git handles Markdown/doc diffs, review, branching, and history better than Packages.
- Packages are better for shipping reusable artifacts than for maintaining evolving operational knowledge.

## Operational Notes

- Run the sync before starting substantial work when `context.mode` is `external`.
- If the external context repo changes, re-run the sync to refresh the local mirror.
- If you change the local target path away from `process/context`, update root contracts and discovery scripts in the same patch. The default protocol assumes `process/context/`.

## Current Scope

This is a thin-repo compatibility layer, not a full remote-context platform.

Current tranche includes:

- config contract
- local sync script
- root-contract documentation

Future work, if needed:

- automatic preflight sync in setup/update flows
- optional push-back workflow for context edits
- support for a repo-local context stub that can switch between multiple external sources
