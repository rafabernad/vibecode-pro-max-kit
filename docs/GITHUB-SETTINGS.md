# GitHub Repository Settings

> Reference for maintainers. Apply these settings via the GitHub web UI at
> **Settings** tab of https://github.com/withkynam/vibecode-pro-max-kit

---

## Repository Description

```
RIPER-5 agent harness for Claude Code & Codex — 12 specialist agents, 31 skills, spec-driven development with phase-locked safety. Works with any codebase. Install in 30 seconds. Community skills & agents welcome.
```

## Website URL

`https://github.com/withkynam/vibecode-pro-max-kit`

## Topics

| # | Topic | Rationale |
|---|-------|-----------|
| 1 | `claude-code` | Primary platform — exact match for users searching |
| 2 | `codex` | Second platform — OpenAI Codex CLI users |
| 3 | `ai-agents` | Broad category, high search volume |
| 4 | `vibecoding` | Trending term in AI dev community |
| 5 | `vibe-coding` | Hyphenated variant — separate topic page on GitHub |
| 6 | `developer-tools` | Generic high-traffic category |
| 7 | `ai-coding-assistant` | Long-tail search phrase |
| 8 | `cursor` | High traffic — AI coding tool comparison searches |
| 9 | `claude` | Anthropic brand association |
| 10 | `anthropic` | Company name search |
| 11 | `openai` | Company name search (Codex users) |
| 12 | `coding-agents` | Alternative phrasing for ai-agents |
| 13 | `ai-development` | Broad AI dev category |
| 14 | `agentic` | Growing AI agent ecosystem term |
| 15 | `code-quality` | Appeals to quality-focused devs |
| 16 | `typescript` | Tech stack signal |
| 17 | `prompt-engineering` | Adjacent interest area |
| 18 | `ai-workflow` | Workflow automation searchers |
| 19 | `cli-tools` | Tool category |
| 20 | `llm` | Broad AI/ML audience, high search volume |

> **Note:** Replaced `specification-driven`, `riper`, `agent-harness`, `open-source` (near-zero GitHub search volume) with `cursor`, `agentic`, `llm`, `vibe-coding` based on GitHub topic search volume research.

## Social Preview Image

| Property | Value |
|----------|-------|
| Dimensions | 1280 x 640 px |
| Background | Dark (#0d1117 or similar GitHub dark) |
| Content | Logo (centered top) + tagline + key stats row |
| Stats row | "12 Agents" / "31 Skills" / "2 Platforms" in columns |
| Typography | Clean sans-serif, high contrast white on dark |
| Brand colors | Match README badge palette |
| File location | `assets/social-preview.png` |
| Primary tool | **[Socialify](https://socialify.git.ci/)** — generates 1280x640 social preview images from repo metadata in 3 clicks. Enter repo URL, customize theme/colors/stats, download PNG. |
| Alternatives | Figma, Canva, or equivalent for fully custom designs |
| Note | Placeholder file not created by this phase — design is manual |

## Repository Features

| Feature | Setting | Rationale |
|---------|---------|-----------|
| Issues | ENABLE | Templates configured in Phase 2 |
| Discussions | ENABLE | Community Q&A, announcements, show & tell |
| Sponsorship | ENABLE | Linked to `.github/FUNDING.yml` |
| Wiki | CONDITIONAL | Enable when using `tracker-native` + `context.mode=github-wiki`; otherwise disable and keep long-form docs in `docs/` |
| Projects | OPTIONAL | Enable if maintaining a public roadmap |
| Preserve this repository | OFF | Not needed for active repo |
| Merge button | Allow squash + merge, allow rebase + merge | Keep PR history clean |
| Auto-delete head branches | ENABLE | Clean up after merge |

## Branch Protection Rules

Apply to `main` branch:

| Rule | Setting | Rationale |
|------|---------|-----------|
| Require pull request reviews | ENABLE, 1 reviewer minimum | Credibility signal for open-source projects; prevents accidental direct pushes |
| Require status checks to pass | ENABLE, require `validate` workflow | Ensures CI passes before merge; builds contributor trust |
| Require branches to be up to date | ENABLE | Prevents merge conflicts from stale branches |
| Include administrators | OPTIONAL | Recommended ON for consistency, but maintainer may want override ability |

> **Why:** Branch protection is a credibility signal for open-source projects. Contributors and evaluators check for these as indicators of project maturity.

## Discussion Categories

| Category | Type | Purpose |
|----------|------|---------|
| Announcements | Announcement | Maintainer-only: releases, breaking changes |
| Q&A | Question/Answer | User questions, best-answer marking |
| Show & Tell | Open | Users share setups, customizations, workflows |
| Ideas | Open | Feature brainstorming, community prioritization |

### Pinned Welcome Discussion

After enabling Discussions and creating the 4 categories above, create and pin a welcome discussion:

| Property | Value |
|----------|-------|
| Category | Announcements |
| Title | Welcome to vibecode-pro-max-kit |
| Action | Pin to Discussions landing page |
| Content | Brief project intro (2-3 sentences), link to `CONTRIBUTING.md`, link to WhatsApp community, invitation to introduce themselves in Show & Tell |

## github/explore Submission

| Property | Value |
|----------|-------|
| Action | Open a PR to https://github.com/github/explore |
| Purpose | Get listed on curated GitHub topic pages |
| Target topics | `claude-code`, `ai-agents`, `developer-tools` (highest-value curated pages) |
| Effort | One-time, ~15 minutes |
| Process | Fork github/explore, add repo to relevant topic collections, submit PR with brief description |
| Note | This is a free discoverability lever — curated topic pages have high organic traffic |

## Setup Checklist

- [ ] Set repository description (copy from above)
- [ ] Add all 20 topics (copy from above, paste comma-separated)
- [ ] Generate social preview image via [Socialify](https://socialify.git.ci/) or custom design
- [ ] Upload social preview image (`assets/social-preview.png` once created)
- [ ] Enable Discussions and create 4 categories
- [ ] Pin welcome discussion in Announcements category
- [ ] Enable Sponsorship (requires `.github/FUNDING.yml` from Phase 2)
- [ ] Decide wiki policy: enable for `tracker-native` context storage, otherwise disable
- [ ] Enable "Auto-delete head branches"
- [ ] Configure merge button (squash + rebase allowed)
- [ ] Set up branch protection for `main` (require PR reviews, require status checks)
- [ ] Submit PR to github/explore for curated topic listing
- [ ] Verify description renders in search results
- [ ] Verify topics appear on repo page
