# CLAUDE.md

## Project

Chrome MCP Auto-Reconnect Hook: A Claude Code PostToolUse hook that detects Claude in Chrome extension disconnects and automatically toggles the MCP to restore the connection.

## Spec

Read `SPEC.md` for the full implementation specification. Follow it as the source of truth.

## Tech Stack

- Bash (hook scripts)
- Claude Code hooks system (PostToolUse event)
- File-based state tracking (`/tmp/chrome-mcp-reconnect.state`)
- File-based logging (`~/.claude/logs/chrome-reconnect.log`)

## Architecture Rules

- The hook must never crash the Claude Code session. Wrap everything in error handling.
- All MCP toggling is done via Claude Code CLI commands — do not directly manipulate config files.
- Debounce all reconnect attempts: skip if last attempt was within 30 seconds.
- The hook is purely reactive (Phase 1) — it responds to failures, not proactively keeps alive.
- Log every action. Silent failures are unacceptable.

## Code Conventions

- Shell scripts use `set -euo pipefail` with explicit error traps.
- All paths use `$HOME` expansion, not hardcoded `/home/slamb2k`.
- Log format: `[ISO8601_TIMESTAMP] [LEVEL] message` (plain text for Phase 1).
- State file is plain text with a single Unix timestamp.
- Script name: `chrome-mcp-reconnect.sh`, stored in `~/.claude/hooks/`.

## Patterns to Follow

- Read the Claude Code hooks documentation first — verify the PostToolUse event schema before writing code.
- Use `grep -qi` for case-insensitive matching of disconnect error strings.
- Use `date +%s` for Unix timestamps in state tracking.
- Test the MCP toggle commands manually before wiring them into the hook.

## Patterns to Avoid

- Do not modify Claude Code's `.mcp.json` or `settings.json` directly — use CLI commands only.
- Do not use infinite retry loops — cap at 3 attempts with exponential backoff.
- Do not assume the hook receives data via environment variables — check the docs, it may use stdin JSON.
- Do not trigger reconnect on non-browser tool failures.
- Do not run reconnect logic synchronously if it blocks Claude Code's main loop — check if hooks are async.

## Testing

- Manual testing: deliberately disconnect the Chrome extension and verify the hook fires and reconnects.
- Add a `--dry-run` flag to the reconnect script that logs what it would do without actually toggling.
- Verify debounce by triggering two failures in rapid succession — only one reconnect should fire.

## Environment

- Primary dev machine: Azure VM `vm-alwayson-dev-claude` (Ubuntu, accessed via Tailscale SSH)
- Claude Code with Claude in Chrome extension configured
- tmux prefix: `Ctrl+a`, theme: Catppuccin Mocha
- Existing hooks infra: `session-guard.sh` (SessionStart), `UserPromptSubmit` companion hook

## Current Phase

Start with **Phase 1** from `SPEC.md`. Before writing any code, verify the PostToolUse hook event schema and the CLI commands for toggling MCP servers. Resolve the open questions first.

## Project Structure

```
chrome-reconnect/
├── CLAUDE.md           This file
├── .gitignore          Ignores credentials, data, temp files
├── specs/              Specifications (/speccy output, /build input)
├── context/            Domain knowledge and references
└── .tmp/               Scratch work (gitignored)
```

## Development Workflow

```
/speccy → specs/{name}.md → /build specs/{name}.md → /ship
```

- `/speccy` interviews and writes a structured spec to `specs/`
- `/build` reads the spec, explores, designs, implements, reviews, tests
- `/ship` commits, creates PR, waits for CI, merges

## Memory

For persistent memory across sessions, install the **claude-mem** plugin:
```
claude plugin install claude-mem
```

claude-mem automatically captures context via lifecycle hooks and provides
MCP tools for search, timeline, and observation management. Claude Code's
built-in auto memory (`~/.claude/projects/<project>/memory/MEMORY.md`)
handles curated facts.

## Question & Assumption Accountability

Nothing gets silently dropped. Every open question, assumption, and deferred
decision must be explicitly recorded and revisited.

- When you make an assumption, **state it explicitly** and record it
- When a question cannot be answered immediately, log it as an open item
- When you defer a fix or skip an edge case, document why and what triggers it
- At the end of each task, review all assumptions and open questions
- Present unresolved items to the user with context and suggested actions
- Track unresolved items via persistent tasks (`TaskCreate`) or CLAUDE.md
  "Known Issues" for future session awareness
- At the start of new work, check for outstanding items from previous sessions
- Never close a task with unacknowledged open questions

## Branch Discipline

- **Always sync to main before starting new work** — run `/sync` or
  `git checkout main && git pull` before creating a feature branch
- **Never branch from a feature branch** — always branch from an up-to-date `main`
- **One feature per branch** — don't stack unrelated changes on the same branch
- **After shipping a PR, sync immediately** — checkout main and pull before
  starting the next task
- **If a PR is pending review**, switch to main before starting unrelated work —
  don't build on top of an unmerged branch

These rules prevent divergent branches that require complex rebases with risk
of silent conflict resolution.

## Guardrails

- Verify tool output format before chaining into another tool
- Do not assume APIs support batch operations — check first
- Preserve intermediate outputs when workflows fail mid-execution
- Use persistent tasks (`TaskCreate`/`TaskUpdate`) for cross-session tracking
- Temporary files go in `.tmp/` — never store important data there
- Don't build before designing — rewrites everything
- Don't skip connection validation — hours wasted on broken integrations
- Don't skip data modelling — schema changes cascade into UI rewrites
