# pr-pilot

A terminal UI for managing your PR lifecycle. Monitor authored and review-requested pull requests, trigger Copilot CLI to fix CI, triage comments, and run reviews -- all from one dashboard.

Built with [ink](https://github.com/vadimdemedes/ink) (React for CLIs) and the [gh CLI](https://cli.github.com/).

## Features

- **Two-tab dashboard** -- Authored PRs and Review-requested PRs
- **Live polling** -- auto-refreshes with change detection (new PRs, CI state changes, new comments)
- **Topic grouping** -- PRs grouped by configurable path-prefix topics (Infra, Services, UI, etc.)
- **Context-aware actions** -- keybindings light up when relevant (Fix CI glows red on failure, Triage glows when threads exist)
- **Copilot CLI integration** -- launch headless reviews, CI fixes, and triage via worktrees
- **PR body preview** -- sanitized markdown/HTML displayed cleanly in the terminal
- **Remote repo support** -- point at any repo with `--repo owner/repo`

## Prerequisites

- [Node.js](https://nodejs.org/) >= 18
- [gh CLI](https://cli.github.com/) authenticated (`gh auth login`)
- [GitHub Copilot CLI](https://docs.github.com/en/copilot/github-copilot-in-the-cli) (optional, for review/fix/triage actions)

## Install

```bash
git clone https://github.com/TruaShamu/pr-pilot.git
cd pr-pilot
npm install
```

## Usage

```bash
# PRs from the current repo
npm run dev

# PRs from a specific repo
npm run dev -- --repo orcasound/orcahello

# Or after building
npm run build
pr-pilot --repo owner/repo
```

## Keybindings

### List view

| Key | Action |
|-----|--------|
| `j` / `k` | Navigate up/down |
| `Tab` | Switch between Authored and Reviewing tabs |
| `Enter` | Open PR detail panel |
| `R` | Force refresh |
| `q` | Quit |

### Detail view

| Key | Action | Lights up when |
|-----|--------|----------------|
| `j` / `k` | Navigate to next/prev PR | Always |
| `Esc` | Back to list | Always |
| `r` | Review with Copilot | Always |
| `f` | Fix CI with Copilot | CI is failing (red) |
| `t` | Triage comments with Copilot | Unresolved threads (yellow) |
| `a` | Approve PR | Reviewing tab (green) |
| `m` | Merge PR | Authored + CI pass + approved (green) |
| `o` | Open in browser | Always |

## Configuration

Optional config file at `~/.config/pr-pilot/config.json`:

```json
{
  "topics": {
    "Infra": ["terraform/", "infra/", ".github/workflows/"],
    "Services": ["services/", "src/api/", "src/server/"],
    "UI": ["ui/", "src/components/", "src/pages/"],
    "Docs": ["docs/"]
  },
  "defaultTopic": "Other",
  "refreshInterval": 30
}
```

## Copilot CLI Skill

Includes a bundled PR review skill at `.github/skills/pr-review/` with:

- **Review workflow** -- senior-engineer review with 5 priority areas (correctness, performance, cleanness, scalability, security)
- **Triage workflow** -- classify reviewer comments as actionable, moot, or needs-clarification
- **Fix CI workflow** -- analyze and fix lint/test failures
- **Status check** -- quick PR health overview
- **Language-specific checklists** -- C#, TypeScript, Terraform, general patterns

## Project Structure

```
src/
  cli.tsx              Entry point, arg parsing
  components/
    App.tsx            Main app, tabs, detail panel, action dispatch
    PRList.tsx         Topic-grouped PR list with change highlights
    StatusBadge.tsx    CI/review status rendering
  core/
    types.ts           Shared interfaces
    github.ts          gh CLI wrapper
    classifier.ts      Path-based topic classification
    actions.ts         PR actions, worktrees, Copilot dispatch
    sanitize.ts        PR body sanitizer for terminal display
  hooks/
    usePRData.ts       Polling hook with change detection
```

## License

MIT
