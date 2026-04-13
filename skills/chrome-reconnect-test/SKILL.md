---
name: chrome-reconnect-test
description: Test the chrome-reconnect hook with a synthetic disconnect payload (dry-run)
allowed-tools: Bash
---

# Chrome Reconnect Test

Run the chrome-reconnect hook in dry-run mode with a synthetic disconnect payload to verify it is working correctly.

Execute the following steps:

1. Locate the hook script. Try these paths in order:
   - `${CLAUDE_PLUGIN_ROOT}/chrome-reconnect/hooks/chrome-reconnect.cjs`
   - `$HOME/.claude/plugins/marketplaces/slamb2k/chrome-reconnect/hooks/chrome-reconnect.cjs`
   - `$HOME/work/chrome-reconnect/hooks/chrome-reconnect.cjs`

2. Run the hook with a synthetic disconnect payload, capturing stdout and stderr separately:
   ```bash
   PAYLOAD='{"tool_name":"mcp__claude-in-chrome__tabs_context_mcp","tool_input":{},"tool_response":{"type":"tool_result","content":"Browser extension is not connected","is_error":true}}'

   HOOK_PATH="${CLAUDE_PLUGIN_ROOT:-$HOME/.claude/plugins/marketplaces/slamb2k/chrome-reconnect}/hooks/chrome-reconnect.cjs"
   [ ! -f "$HOOK_PATH" ] && HOOK_PATH="$HOME/work/chrome-reconnect/hooks/chrome-reconnect.cjs"
   STDOUT=$(echo "$PAYLOAD" | CHROME_RECONNECT_DRY_RUN=1 node "$HOOK_PATH" 2>/tmp/cr-test-stderr.txt)
   STDERR=$(cat /tmp/cr-test-stderr.txt)
   ```

3. Display both outputs clearly labelled:
   ```
   ── stdout ───────────────────────────────────────
   <stdout content>

   ── stderr ───────────────────────────────────────
   <stderr content>
   ```

4. Verify the following and report pass/fail for each:
   - stdout contains `hookSpecificOutput` — hook fired correctly
   - stdout contains `additionalContext` — context message returned
   - stderr contains `[chrome-reconnect]` — user alert was emitted
   - exit code is 0 — hook never crashes

5. Show the last 5 lines of `~/.claude/logs/chrome-reconnect.log` to confirm the log entry was written:
   ```bash
   tail -5 ~/.claude/logs/chrome-reconnect.log 2>/dev/null || echo "(log file not found)"
   ```

6. Report overall: PASS if all checks pass, FAIL with details otherwise.
