---
name: chrome-reconnect-status
description: Show the last Chrome MCP disconnect detection — timestamp, time ago
allowed-tools: Bash
---

# Chrome Reconnect Status

Check when the Chrome MCP disconnect hook last fired.

Run the following steps:

1. Check whether the state file exists:
   ```bash
   [ -f /tmp/chrome-reconnect.state ] && echo "exists" || echo "missing"
   ```

2. If the file is missing, report: "No disconnects recorded yet. The state file `/tmp/chrome-reconnect.state` does not exist."

3. If the file exists, read the timestamp and display it in a human-readable form:
   ```bash
   TS=$(cat /tmp/chrome-reconnect.state)
   echo "Last disconnect epoch: $TS"
   date -d "@$TS" 2>/dev/null || date -r "$TS" 2>/dev/null || echo "(could not convert timestamp)"
   NOW=$(date +%s)
   DIFF=$((NOW - TS))
   echo "Seconds ago: $DIFF"
   ```

4. Convert seconds-ago into a friendly string (e.g. "2 minutes ago", "1 hour 4 minutes ago") and display it clearly.

5. Present the result as:
   ```
   Last Chrome MCP disconnect: <human-readable date>
   Time since detection:       <friendly duration>
   ```

   If the state file is missing, display:
   ```
   No Chrome MCP disconnects recorded.
   State file: /tmp/chrome-reconnect.state (not found)
   ```
