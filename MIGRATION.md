# Migration Guide — v2.x → v3.0.0

This guide covers upgrading an existing vibecode-pro-max-kit install from v2.x to v3.0.0.

## What Changed

v3.0.0 is a major release that extends the RIPER-5 workflow with two new phases (SPEC and VALIDATE), adds 3 agents, adds 13 skills, removes 11 deprecated skills, and introduces 14 CI-enforced behavior validators.

Full change list: [CHANGELOG.md](CHANGELOG.md)

---

## Prerequisites

1. **Clean git working tree** — commit or stash any outstanding changes before running `vc-update`. The update replaces `.claude/` and `.codex/` directories.
2. **Node.js >= 22** — required by install.sh and the validator scripts.
3. **Git access** to the kit repo (the install.sh clones from the remote).

---

## Upgrade Steps

### Step 1 — Run vc-update

In your project root, open Codex and run:

```
/vc-update
```

Claude Code fallback:

```
Run vc-update
```

`vc-update` will:
1. Clone the latest kit to a temp directory
2. Show you a dry-run diff of what changes
3. Wait for your confirmation
4. Apply: copy updated files, remove deprecated files, apply legacyDeletions
5. Write `.vc-installed-files` snapshot and `.vc-version`

### Step 2 — Verify the upgrade

After `vc-update` completes, run the core validators to confirm green:

```bash
# Run these from your project root (not a subdirectory or parent monorepo).
node .agents/skills/vc-audit-vc/scripts/validate-agent-parity.mjs
node .agents/skills/vc-audit-vc/scripts/validate-skills.mjs
node .agents/skills/vc-audit-vc/scripts/validate-kit-portability.mjs
node .agents/skills/vc-audit-context/scripts/validate-context-discovery.mjs
```

Expected: all 4 exit 0 (these are structural validators — non-zero = failure).

To inspect the skill catalog (informational, not a pass/fail validator):

```bash
node .agents/skills/vc-context-discovery/scripts/discover-skills.mjs
```

Expected output: lists 33 skills grouped by layer.

### Step 3 — Migrate process/ layout (existing users)

v3.0.0 changed how plan artifacts are stored. The new layout uses task-folder
convention (`active/{slug}_{date}/{slug}_PLAN_{date}.md`) and deprecates
`reports/` and `references/` sibling dirs (artifacts now colocate inside the
task folder). `vc-update` does **not** migrate your existing plan folders — it
only updates harness files under `.claude/`, `.codex/`, and `.agents/`.

**To migrate your existing `process/` layout**, run vc-setup in your project:

```
/vc-setup
```

Claude Code fallback:

```
Run vc-setup
```

vc-setup detects an existing project (Flow B / Merge mode) and:
1. Shows you a LAYOUT CHANGES summary listing old-layout folders it found.
2. Waits for your approval before moving anything.
3. Migrates flat `*_PLAN_*.md` files in `active/` into `{slug}_{date}/` task
   folders, moving completed plans to `completed/` and active ones to `active/`.
   Also normalizes ISO-format date folders to the canonical `dd-mm-yy` format
   (e.g. `something_2025-01-01/` → `something_01-01-25/`).
4. Notes any `reports/` or `references/` sibling dirs — these are not
   auto-migrated. Move their contents into the nearest task folder manually, or
   leave them in place (they are read-only legacy artifacts and do not break the
   harness).

If you prefer to skip vc-setup, the harness still works with the old flat layout
— the legacy shapes are read-only compatible. Only new plans need to use the
task-folder convention.

### Step 4 — Run validators

Run the four core structural validators after the upgrade and after any layout migration:

```bash
# Run these from your project root (not a subdirectory or parent monorepo).
node .agents/skills/vc-audit-vc/scripts/validate-agent-parity.mjs
node .agents/skills/vc-audit-vc/scripts/validate-skills.mjs
node .agents/skills/vc-audit-vc/scripts/validate-kit-portability.mjs
node .agents/skills/vc-audit-context/scripts/validate-context-discovery.mjs
```

All four must exit 0 before you start using the upgraded harness.

To inspect the skill catalog (informational — prints a grouped list, not a structural pass/fail check):

```bash
node .agents/skills/vc-context-discovery/scripts/discover-skills.mjs
```

Expected output: lists 33 skills grouped by layer. This script exits non-zero when the catalog is missing or the count is too low — treat that as a signal to re-run `vc-update`, not as a structural validator failure on its own.

---

## What vc-update Removes (legacyDeletions)

The following 11 skill directories will be **removed** from your project:

```
.claude/skills/vc-team
.claude/skills/vc-chrome-devtools
.claude/skills/vc-docs
.claude/skills/vc-repomix
.claude/skills/vc-preview
.claude/skills/vc-merge-worktree
.claude/skills/vc-tech-graph
.claude/skills/vc-watzup
.claude/skills/vc-xia
.claude/skills/vc-mcp-management
.claude/skills/vc-context-engineering
```

The following 5 protocol files will also be removed:

```
process/development-protocols/references/example-complex-prd.md
process/development-protocols/references/example-simple-prd.md
process/development-protocols/intent-clarification.md
process/development-protocols/parallel-fan-out.md
process/development-protocols/archive/vc-system-behavior-reference_ARCHIVED_09-06-26.md
```

Disposition per file:
- `references/example-complex-prd.md` — **moved** to `.agents/skills/vc-generate-plan/references/example-complex-prd.md` (canonical v3 location)
- `references/example-simple-prd.md` — **moved** to `.agents/skills/vc-generate-plan/references/example-simple-prd.md` (canonical v3 location)
- `intent-clarification.md` — **merged** into `orchestration.md` (content folded into §Intent Clarification)
- `parallel-fan-out.md` — **merged** into `orchestration.md` (content folded into §Parallel Fan-Out Checkpoints)
- `archive/vc-system-behavior-reference_ARCHIVED_09-06-26.md` — **deleted** (superseded by the 12-file `vc-system-behavior/` split; kept only as git history)

**If you had custom code inside any of the removed skills:** recover it from git history with `git show HEAD:.agents/skills/<skill-name>/SKILL.md` before running the upgrade.

---

## What vc-update Adds

**3 new agents:**
- `.agents/agents/vc-spec-agent.md`
- `.agents/agents/vc-validate-agent.md`
- `.agents/agents/vc-quick-fix-agent.md`
- (+ matching `.codex/agents/*.toml` for each)

**13 new skills:**
- `vc-agent-browser`, `vc-agent-strategy-compare`, `vc-autopilot`, `vc-autoresearch`
- `vc-feasibility-test`, `vc-generate-closeout`, `vc-generate-spec`
- `vc-intent-clarify`, `vc-plan-discovery`, `vc-review-situation`
- `vc-risk-evidence-pack`, `vc-security`, `vc-web-testing`

**New protocol files:**
- `process/development-protocols/autopilot.md`
- `process/development-protocols/communication-standards.md`
- `process/development-protocols/vc-autoresearch-spec.md`
- `process/development-protocols/vc-system-behavior/` (12-file behavior tree)

---

## Post-Migration: What to Re-check

### CLAUDE.md and AGENTS.md

These files are **updated** by vc-update (they are in the managed file set, not merge-protected in v3.0.0). If you had project-specific content in them, it may have been overwritten.

Recommendation: keep project-specific content in `process/context/all-context.md` and `process/context/` files — not in CLAUDE.md/AGENTS.md. The harness files are managed by the kit.

### `.claude/settings.json`

This file is **merge-protected** — vc-update skips it if it exists locally. Your custom settings are preserved. Review the updated template from the kit if you want to adopt new hook configurations.

### ⚠️ Action required: settings.json hooks

Because `.claude/settings.json` is merge-protected, any hooks added in v3.0.0 will **not** fire in your upgraded project until you manually add them. Your existing hooks are untouched — but new v3 hooks will be silently absent.

**Specifically missing after upgrade** (the four hooks most likely absent from a v2.x install):

| Hook | File | What it does |
|---|---|---|
| PostToolUse (Write) | `post-write-plan-check.mjs` | Validates plan artifact structure every time a plan file is written |
| PostToolUse (Bash) | `post-commit-lint.mjs` | Lints commit messages for conventional-commit prefix |
| Stop | `stop-validator-sweep.cjs` | Runs core validator suite on session end |
| SubagentStart | `subagent-init.cjs` | Injects compact context into every subagent |

**How to check:** diff your current file against the kit backup or the template:

```bash
diff .claude/settings.json .vibecode-backup/.claude/settings.json
```

**What to add (paste-ready):** The complete v3.0.0 `hooks` block is shown below. Merge any missing entries into your existing `.claude/settings.json`:

```json
{
  "$schema": "https://json.schemastore.org/claude-code-settings.json",
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node \"$CLAUDE_PROJECT_DIR\"/.claude/hooks/session-init.cjs"
          }
        ]
      }
    ],
    "SubagentStart": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": "node \"$CLAUDE_PROJECT_DIR\"/.claude/hooks/subagent-init.cjs"
          }
        ]
      }
    ],
    "PreToolUse": [
      {
        "matcher": "Write",
        "hooks": [
          {
            "type": "command",
            "command": "node \"$CLAUDE_PROJECT_DIR\"/.claude/hooks/descriptive-name.cjs"
          }
        ]
      },
      {
        "matcher": "Bash|Glob|Grep|Read|Edit|Write",
        "hooks": [
          {
            "type": "command",
            "command": "node \"$CLAUDE_PROJECT_DIR\"/.claude/hooks/scout-block.cjs"
          },
          {
            "type": "command",
            "command": "node \"$CLAUDE_PROJECT_DIR\"/.claude/hooks/privacy-block.cjs"
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Edit|Write|MultiEdit",
        "hooks": [
          {
            "type": "command",
            "command": "node \"$CLAUDE_PROJECT_DIR\"/.claude/hooks/session-state.cjs"
          },
          {
            "type": "command",
            "command": "node \"$CLAUDE_PROJECT_DIR\"/.claude/hooks/post-edit-simplify-reminder.cjs"
          }
        ]
      },
      {
        "matcher": "Write",
        "hooks": [
          {
            "type": "command",
            "command": "node \"$CLAUDE_PROJECT_DIR\"/.claude/hooks/post-write-plan-check.mjs"
          }
        ]
      },
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "node \"$CLAUDE_PROJECT_DIR\"/.claude/hooks/post-commit-lint.mjs"
          }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node \"$CLAUDE_PROJECT_DIR\"/.claude/hooks/stop-validator-sweep.cjs"
          }
        ]
      }
    ]
  }
}
```

Hook summary:
- **SessionStart** → `session-init.cjs` — detects stack, injects env, recovers approval gates after compaction
- **SubagentStart** → `subagent-init.cjs` — injects compact context into every subagent
- **PreToolUse (Write)** → `descriptive-name.cjs` — language-aware file naming guard
- **PreToolUse (Bash|Glob|Grep|Read|Edit|Write)** → `scout-block.cjs`, `privacy-block.cjs` — prevents wandering into `node_modules/`, blocks credential leaks
- **PostToolUse (Edit|Write|MultiEdit)** → `session-state.cjs`, `post-edit-simplify-reminder.cjs` — session metrics + simplifier nudge after 5+ edits
- **PostToolUse (Write)** → `post-write-plan-check.mjs` — validates plan artifact structure on every plan write
- **PostToolUse (Bash)** → `post-commit-lint.mjs` — lints commit messages for conventional-commit prefix
- **Stop** → `stop-validator-sweep.cjs` — runs core validator suite on session end

### Custom RIPER-5 workflow references

If your `process/context/` files or plans reference `parallel-fan-out.md` or `intent-clarification.md`, update those references to `orchestration.md` (these files were merged in). PRD example references should point to `.agents/skills/vc-generate-plan/references/` instead of `process/development-protocols/references/`.

---

## Very Old Installs (Pre-v2.0, No .vc-installed-files)

If your install predates the `.vc-installed-files` snapshot (no such file in your project root), `vc-update` cannot compute a diff. Use a fresh install instead:

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/withkynam/vibecode-pro-max-kit/main/install.sh)
```

`install.sh` v3.0.0 applies `legacyDeletions` automatically (removes deprecated skill dirs if present) and runs a post-install self-check.

---

## Troubleshooting

**`discover-skills.mjs` exits non-zero after upgrade**

The `generated-skills-catalog.json` may be absent or stale. Regenerate it:

```bash
node .agents/skills/vc-audit-context/scripts/generate-skills-catalog.mjs --write
```

**Validators fail with "agent count mismatch"**

Confirm 15 agents are present:

```bash
ls .agents/agents/*.md | wc -l
```

Expected: 15. If not, re-run `vc-update` or copy the missing agents from the kit.

**Dead references in CLAUDE.md / AGENTS.md**

Run the dead-ref check:

```bash
grep -oE '`process/development-protocols/[^`]+`' CLAUDE.md AGENTS.md | \
  while IFS=: read file ref; do
    path=$(echo $ref | tr -d '`')
    [ -f "$path" ] || echo "DEAD REF: $file -> $path"
  done
```

Fix any dead refs that point to removed protocol files by updating them to `orchestration.md`.
