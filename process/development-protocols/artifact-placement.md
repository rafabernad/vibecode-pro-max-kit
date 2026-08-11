---
name: protocol:artifact-placement
description: "What belongs in the repository, what belongs in external tracking, and what should not be persisted at all."
date: 09-08-26
metadata:
  node_type: memory
  type: protocol
  read_order: 7
  required: false
  read_when: "deciding where to store plans, backlog, progress tracking, operational notes, or non-code AI outputs"
---

# Artifact Placement

## Purpose

This protocol defines where work artifacts belong.

The core rule is simple:

- The repository is for working software and the minimum technical material required to build,
  verify, operate, and understand that software.
- Backlog, progress tracking, prioritization, and operational work management belong in an
  external tracking system.

This prevents the repo from filling up with AI-generated process documents that do not improve the
software itself.

## Source-Of-Truth Rule

Use exactly one primary home for each artifact class:

- **Repository**
  - source code
  - tests
  - fixtures
  - configuration
  - migration files
  - operational scripts
  - technical docs required to implement, run, validate, or maintain the software
  - durable repository context that agents must read locally to work correctly
- **External tracking system**
  - backlog
  - roadmap
  - initiative tracking
  - phase/block tracking
  - task status
  - prioritization
  - ownership
  - due dates and sequencing
  - progress notes
  - active plan hierarchy
- **Do not persist by default**
  - redundant AI scratch plans
  - repeated interim summaries
  - process-for-process artifacts with no execution consequence
  - large markdown status writeups that merely mirror issue tracker state

If an artifact's main purpose is "track work" rather than "ship or support software", it does not
belong in the repo.

If `/.vc-project.json` sets `planning.mode` to `tracker-native`, treat this rule as the default
operating mode rather than a preference.

## Repository-Allow List

Repository-resident markdown is allowed when it is one of these:

- a technical protocol the harness itself depends on
- durable project context needed by future sessions
- a code-adjacent design or decision record with implementation consequences
- a verification artifact that proves behavior, risk, or release-readiness
- a user-facing or operator-facing technical document that belongs with the code

Repository markdown is NOT justified merely because it is detailed, thoughtful, or expensive to
generate.

## Tracking-System Allow List

Move the artifact to a tracking system when it is primarily:

- a plan of future work
- a decomposition of work into blocks or phases
- a list of actionable tasks
- a progress ledger
- a coordination surface across people or sessions
- a backlog of deferred work
- a prioritization surface
- a delivery forecast

For GitHub-native teams, this usually means:

- parent issue for the initiative or plan
- child issues for major blocks
- sub-issues for executable tasks
- project fields/views for status, ownership, sequencing, and progress
- milestones only for real delivery gates or external checkpoints

## Default Handling Of Plans

Default policy for active implementation plans:

- Prefer the external tracking system as the operational source of truth.
- Keep only the minimum repo-local plan material required for execution when the tracker alone is
  insufficient.
- Do not create or retain long-lived markdown plans in the repo if their content is mainly backlog,
  sequencing, status, or task decomposition.

Allowed repo-local exceptions:

- a compact execution contract tightly coupled to a risky implementation tranche
- a validate-contract or evidence pack needed for high-risk execution
- a temporary migration bridge while moving an older repo from markdown plans to tracker-native work

Even in those exceptions, the artifact should be compact, execution-oriented, and short-lived.

## Backlog Rule

Backlog is not a repository artifact.

Therefore:

- do not create new backlog markdown files in the repo for normal work management
- do not keep large deferred-work sections inside plan markdown when that content belongs in issues
- do not treat `process/.../backlog/` as the preferred long-term home for active product backlog

Legacy backlog directories may still exist for compatibility. Treat them as migration surfaces, not
the target steady state.

## AI Output Rule

AI-generated output must earn its place in the repo.

Before writing any non-code artifact, ask:

1. Does this artifact directly help implement, verify, operate, or understand the software?
2. Is the repository the natural source of truth for it?
3. Will future maintainers need it locally even if the issue tracker disappears from view?

If any answer is "no", prefer the tracking system or do not persist it.

Examples that usually fail this test:

- expansive program plans
- status reports that restate issue state
- backlog decomposition documents
- phase trackers
- AI brainstorming transcripts

## Migration Guidance

When an existing repo already stores backlog or active-plan tracking in markdown:

1. Preserve the old artifact until the tracker equivalent exists.
2. Re-home the work structure into the tracking system.
3. Reduce the repo copy to one of:
   - a brief pointer to the tracker item
   - a compact execution contract
   - nothing, if no local artifact is needed
4. Avoid dual maintenance.

The goal is not "markdown everywhere plus issues too". The goal is one operational source of truth.

## Interaction With Externalized Context

This protocol is compatible with thin-repo mode.

- Harness protocol and required local context may still be hydrated into `process/context/`.
- That does not justify storing backlog or active work tracking in the repo.
- Durable technical context and operational work tracking remain separate concerns.

## Enforcement Heuristic

When deciding whether to write a repo artifact, classify it by primary job:

- **Build / run / verify / explain software** -> repository
- **Track / sequence / prioritize / coordinate work** -> external tracker
- **Neither** -> do not persist by default
