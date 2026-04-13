---
name: chrome-reconnect-logs
description: Show recent chrome-reconnect log entries
allowed-tools: Bash
---

# Chrome Reconnect Logs

Display the most recent entries from the chrome-reconnect log file.

Run the following steps:

1. Check whether the log file exists:
   ```bash
   [ -f ~/.claude/logs/chrome-reconnect.log ] && echo "exists" || echo "missing"
   ```

2. If the file is missing, report:
   ```
   No log file found at ~/.claude/logs/chrome-reconnect.log
   The hook has not fired yet, or logging failed.
   ```

3. If the file exists, show the last 50 lines:
   ```bash
   tail -50 ~/.claude/logs/chrome-reconnect.log
   ```

4. Also report the total number of entries and the date range:
   ```bash
   TOTAL=$(wc -l < ~/.claude/logs/chrome-reconnect.log)
   FIRST=$(head -1 ~/.claude/logs/chrome-reconnect.log)
   LAST=$(tail -1 ~/.claude/logs/chrome-reconnect.log)
   echo "Total entries: $TOTAL"
   echo "First entry:   $FIRST"
   echo "Last entry:    $LAST"
   ```

5. Present the output in a clean format:
   ```
   ── chrome-reconnect log (~/.claude/logs/chrome-reconnect.log) ──
   Total entries: <N>
   Range: <first timestamp> → <last timestamp>

   ── Last 50 entries ─────────────────────────────
   <log lines>
   ```
