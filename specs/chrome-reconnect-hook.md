---
title: Chrome MCP Auto-Reconnect Plugin — Phase 1 Implementation Spec
version: 1.0
date_created: 2026-04-13
last_updated: 2026-04-13
tags: [tool, infrastructure, plugin, hooks, browser-automation]
---

# Introduction

The `chrome-reconnect` Claude Code plugin detects when the Claude in Chrome
MCP extension disconnects during browser automation sessions and automatically
restores the connection — without manual intervention or session interruption.

Chrome's Manifest V3 architecture kills idle Service Workers after ~30 seconds,
silently dropping the WebSocket bridge between Claude Code and the extension.
This plugin hooks into the `PostToolUse` event, identifies disconnect failures
by their error signatures, and programmatically toggles the MCP to force
reconnection.

## 1. Purpose & Scope

**Purpose:** Automate recovery from Claude in Chrome MCP disconnections via a
Claude Code plugin that reacts to browser tool failures.

**Audience:** Claude Code plugin developers and power users running browser
automation workflows on Linux (Ubuntu).

**Scope — Phase 1 (this spec):**
- PostToolUse hook that detects chrome extension disconnects
- Automatic MCP disable/enable toggle with debounce and retry logic
- File-based state tracking and plain-text logging
- Three slash commands: `status`, `test`, `logs`
- Env-var-based configuration
- Plugin packaging for user-level and project-level installation

**Out of scope — Phase 1:**
- Proactive keepalive / ping loop (Phase 3)
- JSON structured logs (Phase 2)
- Post-reconnect MCP health verification ping (Phase 2)
- macOS support (Linux/Ubuntu only)

## 2. Definitions

| Term | Definition |
|------|------------|
| MCP | Model Context Protocol — Claude Code's plugin system for integrating external tools |
| PostToolUse | Claude Code hook event that fires after every tool execution |
| chrome-in-chrome | The MCP server name for the Claude in Chrome browser extension |
| Debounce | Suppressing redundant reconnect attempts within a time window |
| Cooldown | Deliberate pause between MCP disable and re-enable |
| Dry-run | Execution mode that logs actions without performing MCP toggles |
| Publisher | The plugin registry namespace — `slamb2k` |
| User-level install | Plugin installed globally for the user (`~/.claude/plugins/`) |
| Project-level install | Plugin installed for a single project (`.claude/plugins/`) |
| State file | `/tmp/chrome-reconnect.state` — stores last reconnect Unix timestamp |
| Log file | `~/.claude/logs/chrome-reconnect.log` — append-only reconnect log |

## 3. Requirements, Constraints & Guidelines

### Functional Requirements

- **REQ-001**: The hook MUST fire on every `PostToolUse` event for tools
  matching `mcp__claude-in-chrome__*`.
- **REQ-002**: On a matching tool failure, the hook MUST check the tool output
  for disconnect signatures before triggering reconnection.
- **REQ-003**: The hook MUST NOT trigger reconnection on successful tool calls
  (exit code 0 with no disconnect signature). It MUST exit 0 immediately.
- **REQ-004**: The hook MUST debounce reconnect attempts: skip if the state
  file records a successful attempt within `CHROME_RECONNECT_DEBOUNCE_SECS`
  seconds (default: 30).
- **REQ-005**: The reconnect cycle MUST disable the MCP, wait for
  `CHROME_RECONNECT_COOLDOWN_SECS` (default: 3), then re-enable.
- **REQ-006**: On failure, the hook MUST retry up to `CHROME_RECONNECT_MAX_RETRIES`
  times (default: 3) with exponential backoff: 3s, 6s, 12s.
- **REQ-007**: When all retries are exhausted, the hook MUST write a human-readable
  failure message to stderr (visible in the Claude Code UI).
- **REQ-008**: The hook MUST be silent during reconnect attempts — no stdout or
  stderr output unless reconnection fails.
- **REQ-009**: All reconnect actions MUST be appended to the log file with
  ISO 8601 timestamps and level labels (`[INFO]`, `[WARN]`, `[ERROR]`).
- **REQ-010**: When `CHROME_RECONNECT_DRY_RUN=1` is set, the hook MUST log
  what it would do but MUST NOT execute MCP toggle CLI commands.
- **REQ-011**: The plugin MUST support both user-level and project-level
  installation. Hook registration is automatic based on install scope.

### Slash Command Requirements

- **REQ-012**: `/chrome-reconnect status` MUST display: last attempt timestamp,
  outcome (success/failure), and attempt count.
- **REQ-013**: `/chrome-reconnect test` MUST execute a full dry-run by injecting
  a synthetic disconnect JSON payload and running the hook with
  `CHROME_RECONNECT_DRY_RUN=1`. It validates hook wiring and detection logic
  without side effects.
- **REQ-014**: `/chrome-reconnect logs` MUST tail `~/.claude/logs/chrome-reconnect.log`,
  showing recent entries (default: last 50 lines).

### Configuration Requirements

- **REQ-015**: All tuneable parameters MUST have hardcoded defaults and MUST
  be overridable via environment variables without editing plugin files.

| Env var | Default | Description |
|---------|---------|-------------|
| `CHROME_RECONNECT_DEBOUNCE_SECS` | `30` | Minimum seconds between reconnect attempts |
| `CHROME_RECONNECT_COOLDOWN_SECS` | `3` | Seconds to wait between MCP disable and enable |
| `CHROME_RECONNECT_MAX_RETRIES` | `3` | Maximum reconnect attempts before giving up |
| `CHROME_RECONNECT_DRY_RUN` | unset | Set to `1` to log actions without executing them |

### Constraints

- **CON-001**: The hook MUST NOT crash the Claude Code session. All errors
  MUST be caught and logged. The hook MUST exit 0 on internal errors.
- **CON-002**: The hook MUST NOT directly modify `.mcp.json` or
  `settings.json` — MCP toggling MUST use Claude Code CLI commands only.
- **CON-003**: The hook MUST NOT use infinite retry loops. Retry count is
  capped by `CHROME_RECONNECT_MAX_RETRIES`.
- **CON-004**: The implementation MUST be pure Node.js (`.cjs`). No Bash
  scripts. No external runtime dependencies beyond Node.js.
- **CON-005**: Platform target is Linux (Ubuntu, Azure VM). macOS compatibility
  is not required for Phase 1.
- **CON-006**: Log format MUST be plain text for Phase 1:
  `[ISO8601_TIMESTAMP] [LEVEL] message`

### Guidelines

- **GUD-001**: Read the Claude Code PostToolUse hook event schema before
  implementation — verify the stdin JSON structure and available fields.
- **GUD-002**: Verify the exact CLI commands for MCP toggle before
  implementation: `claude mcp disable chrome-in-chrome` /
  `claude mcp enable chrome-in-chrome` (TBD — research required).
- **GUD-003**: Use `process.env.CLAUDE_PLUGIN_ROOT` to resolve plugin paths;
  fall back to `~/.claude/plugins/marketplaces/slamb2k`.
- **GUD-004**: The state file lives in `/tmp/` — assume it may not exist on
  first run or after a reboot.
- **GUD-005**: Create the log directory (`~/.claude/logs/`) if it does not
  exist before writing.

## 4. Interfaces & Data Contracts

### Plugin Manifest (`package.json`)

```json
{
  "name": "chrome-reconnect",
  "version": "1.0.0",
  "description": "Auto-reconnect Claude in Chrome MCP on disconnect",
  "author": "slamb2k",
  "files": ["skills/", "hooks/", ".claude-plugin/"],
  "engines": { "node": ">=18" }
}
```

### Plugin Metadata (`.claude-plugin/plugin.json`)

```json
{
  "name": "chrome-reconnect",
  "description": "PostToolUse hook that detects Chrome MCP disconnects and auto-reconnects",
  "version": "1.0.0",
  "author": "slamb2k",
  "repo": "https://github.com/slamb2k/chrome-reconnect",
  "license": "MIT",
  "keywords": ["chrome", "mcp", "reconnect", "hook", "browser-automation"]
}
```

### Hook Registration (`hooks/hooks.json`)

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "mcp__claude-in-chrome__*",
        "hooks": [
          {
            "type": "command",
            "command": "node ${CLAUDE_PLUGIN_ROOT}/chrome-reconnect/hooks/chrome-reconnect.cjs",
            "timeout": 60
          }
        ]
      }
    ]
  }
}
```

**Note:** The matcher glob pattern (`mcp__claude-in-chrome__*`) must be
verified against the current Claude Code hook schema — confirm that glob
matching is supported on the `matcher` field.

### PostToolUse Hook — stdin JSON Contract

The hook reads JSON from stdin. Expected structure (verify against docs):

```json
{
  "tool_name": "mcp__claude-in-chrome__tabs_context_mcp",
  "tool_input": {},
  "tool_response": {
    "type": "tool_result",
    "content": "Browser extension is not connected",
    "is_error": true
  }
}
```

**Fields used by the hook:**
- `tool_response.is_error` — boolean indicating tool failure
- `tool_response.content` — string scanned for disconnect signatures

### Disconnect Signatures

The hook scans `tool_response.content` case-insensitively for these strings:

```
"Browser extension is not connected"
"Please ensure the Claude browser extension is installed and running"
"No Chrome extension connected"
"not connected"
```

### State File Format (`/tmp/chrome-reconnect.state`)

Plain text, single line: Unix timestamp (seconds) of last reconnect attempt.

```
1744516800
```

### Log File Format (`~/.claude/logs/chrome-reconnect.log`)

Append-only plain text:

```
[2026-04-13T04:55:00Z] [INFO] Disconnect detected on mcp__claude-in-chrome__navigate. Attempt 1/3.
[2026-04-13T04:55:00Z] [INFO] Disabling chrome-in-chrome MCP...
[2026-04-13T04:55:03Z] [INFO] Re-enabling chrome-in-chrome MCP...
[2026-04-13T04:55:03Z] [INFO] Reconnect attempt 1 succeeded.
```

### Plugin Directory Structure

```
chrome-reconnect/
├── .claude-plugin/
│   └── plugin.json
├── hooks/
│   ├── hooks.json
│   └── chrome-reconnect.cjs    ← Main hook script (Node.js)
├── skills/
│   ├── chrome-reconnect-status/
│   │   └── SKILL.md
│   ├── chrome-reconnect-test/
│   │   └── SKILL.md
│   └── chrome-reconnect-logs/
│       └── SKILL.md
└── package.json
```

## 5. Acceptance Criteria

- **AC-001**: Given a `mcp__claude-in-chrome__*` tool call succeeds, when the
  hook fires, then it exits 0 with no output within 50ms.
- **AC-002**: Given a tool call fails with `"Browser extension is not connected"`,
  when the hook fires and debounce is not active, then the hook disables the MCP,
  waits 3s, re-enables it, and logs the attempt.
- **AC-003**: Given a reconnect attempt within the last 30 seconds, when another
  disconnect occurs, then the hook exits 0 immediately with no MCP toggle.
- **AC-004**: Given all 3 retry attempts fail, when the hook exhausts retries,
  then a human-readable error message is written to stderr and the hook exits 1.
- **AC-005**: Given `CHROME_RECONNECT_DRY_RUN=1` is set, when the hook fires
  on a disconnect, then it logs all actions but executes no MCP CLI commands.
- **AC-006**: Given `/chrome-reconnect test` is run, when the hook executes
  with a synthetic payload and DRY_RUN=1, then it completes without error and
  outputs what it would have done.
- **AC-007**: Given `/chrome-reconnect status` is run, when the state file
  exists, then it displays the last attempt time and outcome.
- **AC-008**: Given `/chrome-reconnect logs` is run, then the last 50 lines
  of the log file are displayed.
- **AC-009**: Given `CHROME_RECONNECT_MAX_RETRIES=1` is set, when a disconnect
  occurs and the reconnect fails, then only 1 attempt is made before giving up.
- **AC-010**: Given an internal error occurs in the hook (e.g., state file
  unreadable), when the hook catches the error, then it logs the error and
  exits 0 — the Claude Code session is never interrupted.
- **AC-011**: Given the plugin is installed at user level, when a disconnect
  occurs in any project, then the hook fires correctly.
- **AC-012**: Given the plugin is installed at project level, when a disconnect
  occurs in that project, then the hook fires correctly.

## 6. Test Automation Strategy

**Test Levels:** Manual functional tests only for Phase 1.

**Manual Test Cases:**

1. **Happy path** — Run any `mcp__claude-in-chrome__*` tool successfully.
   Verify: no hook output, no log entry.
2. **Disconnect detection** — Disconnect the Chrome extension. Run a browser
   tool. Verify: log shows detect → disable → enable, reconnect succeeds.
3. **Debounce** — Trigger two failures within 30 seconds. Verify: second
   attempt skipped in log.
4. **Exhaust retries** — Disconnect extension and keep it disconnected. Verify:
   stderr message after 3 attempts, log shows all 3 attempts.
5. **Dry-run** — Set `CHROME_RECONNECT_DRY_RUN=1`. Trigger a disconnect.
   Verify: log entries present, no actual MCP toggle occurs.
6. **`/chrome-reconnect test`** — Run the slash command. Verify: synthetic
   payload processed, dry-run output shown, no side effects.
7. **`/chrome-reconnect status`** — Run after a test. Verify: correct timestamp
   and outcome displayed.
8. **`/chrome-reconnect logs`** — Verify last 50 log lines displayed.
9. **Env var overrides** — Set `CHROME_RECONNECT_DEBOUNCE_SECS=5`. Verify
   reduced debounce window in effect.
10. **Internal error resilience** — Remove state file permissions. Verify hook
    logs error and exits 0.

**CI/CD:** No automated CI for Phase 1. Manual test gate before publishing.

## 7. Rationale & Context

**Why PostToolUse (reactive) instead of a keepalive loop?**
Chrome MV3 Service Workers cannot be kept alive indefinitely from outside the
extension. Reactive reconnect on failure is simpler, reliable, and avoids
the complexity of a background daemon. Phase 3 will explore proactive keepalive
once the reactive baseline is proven.

**Why pure Node.js instead of Bash?**
The PostToolUse hook receives structured JSON on stdin. Bash requires `jq`
for JSON parsing — an external dependency that may not be present. Node.js is
guaranteed available in Claude Code environments, handles JSON natively, and
is the convention for existing plugin hooks (`.cjs` files). The single-runtime
approach eliminates shell-to-subprocess overhead and makes the retry logic
testable in isolation.

**Why env var configuration instead of a config file?**
Env vars are the lowest-friction override mechanism — no file to locate,
parse, or document. They compose naturally with shell profiles and CI
environments. A config file adds schema complexity for minimal benefit at
Phase 1 scale.

**Why file-based state instead of in-memory?**
The hook process is stateless — each invocation is a new process. File-based
state in `/tmp/` (debounce timestamp) persists across invocations without
requiring a daemon.

**Why stderr for failure notification?**
Claude Code surfaces hook stderr to the user in the UI. This gives immediate
visibility into reconnect failures without requiring the user to check logs.
During successful reconnect, silence avoids interrupting the automation flow.

## 8. Dependencies & External Integrations

### External Systems

- **EXT-001**: Claude in Chrome browser extension — the MCP server being
  toggled. Must be installed and configured in Claude Code.

### Infrastructure Dependencies

- **INF-001**: Claude Code CLI (`claude`) — required for MCP toggle commands.
  Version compatibility with `claude mcp disable/enable` subcommands must be
  verified.
- **INF-002**: Node.js ≥18 — guaranteed present in the Claude Code runtime
  environment.
- **INF-003**: Linux (Ubuntu) — Phase 1 target platform. `date`, `/tmp/`,
  `~/.claude/` paths assumed.

### Technology Platform Dependencies

- **PLT-001**: Claude Code hooks system — `PostToolUse` event, `hooks.json`
  registration format, and matcher glob support. Schema must be verified
  against current Claude Code documentation before implementation.

## 9. Examples & Edge Cases

### Edge Case: State file missing (first run / reboot)

The hook treats a missing state file as "no prior attempt" — debounce check
passes, reconnect proceeds normally.

### Edge Case: Log directory missing

If `~/.claude/logs/` does not exist, the hook creates it (`fs.mkdirSync`
with `{ recursive: true }`) before writing the first log entry.

### Edge Case: Disconnect detected during an active reconnect

The debounce (30s default) prevents a second reconnect cycle from starting
while the first is in progress, since the state file is updated at the start
of the attempt.

### Edge Case: MCP toggle CLI command not found

If `claude mcp disable` fails with "command not found", the hook logs the
error, does not retry (the CLI is broken, not the connection), writes to
stderr, and exits 0.

### Edge Case: Non-disconnect browser tool failure

If a `mcp__claude-in-chrome__*` tool fails for a reason other than extension
disconnect (e.g., JS execution error, element not found), the disconnect
signature check fails to match and the hook exits 0 without reconnecting.

### Synthetic Test Payload (for `/chrome-reconnect test`)

```json
{
  "tool_name": "mcp__claude-in-chrome__tabs_context_mcp",
  "tool_input": {},
  "tool_response": {
    "type": "tool_result",
    "content": "Browser extension is not connected",
    "is_error": true
  }
}
```

## 10. Validation Criteria

The Phase 1 implementation is complete when:

1. All 10 manual test cases in §6 pass.
2. The hook installs cleanly at both user-level and project-level via
   `claude plugin install slamb2k/chrome-reconnect`.
3. Env var overrides are confirmed working for all 4 variables.
4. All three slash commands (`status`, `test`, `logs`) function correctly.
5. A real disconnect scenario (Chrome extension killed mid-session) triggers
   auto-reconnect within 15 seconds.
6. No Claude Code session crash observed in 5 consecutive disconnect tests.

## 11. Open Questions (pre-implementation research required)

- [ ] **OQ-001**: What is the exact stdin JSON schema for the `PostToolUse`
  event? Verify field names (`tool_name`, `tool_response`, `is_error`, `content`).
- [ ] **OQ-002**: Does the `hooks.json` `matcher` field support glob patterns
  (`mcp__claude-in-chrome__*`)? Or must each tool name be listed explicitly?
- [ ] **OQ-003**: What are the exact CLI commands to disable/re-enable a
  specific MCP server? (`claude mcp disable chrome-in-chrome`? verify syntax)
- [ ] **OQ-004**: Does the hook command in `hooks.json` have access to
  `CLAUDE_PLUGIN_ROOT` as an env var at execution time?
- [ ] **OQ-005**: Does toggling the MCP from within a PostToolUse hook cause
  re-entrancy issues (e.g., does the disable trigger another PostToolUse)?
- [ ] **OQ-006**: Is there a built-in `/chrome reconnect` command in Claude
  Code that could replace the manual MCP toggle approach?

## 11. Related Specifications / Further Reading

- `SPEC.md` — Original architecture draft (superseded by this spec for Phase 1)
- [Claude Code Hooks documentation](https://docs.anthropic.com/en/docs/claude-code/hooks)
- [Claude in Chrome extension](https://github.com/anthropics/claude-in-chrome)
