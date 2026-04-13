'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

// Config
const DEBOUNCE_SECS = parseInt(process.env.CHROME_RECONNECT_DEBOUNCE_SECS || '30', 10);
const DRY_RUN = process.env.CHROME_RECONNECT_DRY_RUN === '1';
const STATE_FILE = '/tmp/chrome-reconnect.state';
const LOG_FILE = path.join(os.homedir(), '.claude', 'logs', 'chrome-reconnect.log');

// Disconnect signatures — case-insensitive
const DISCONNECT_SIGNATURES = [
  /browser extension is not connected/i,
  /please ensure the claude browser extension is installed and running/i,
  /no chrome extension connected/i,
];

function nowIso() {
  return new Date().toISOString();
}

function appendLog(level, message) {
  try {
    const logDir = path.dirname(LOG_FILE);
    fs.mkdirSync(logDir, { recursive: true });
    fs.appendFileSync(LOG_FILE, `[${nowIso()}] [${level}] ${message}\n`);
  } catch (_) {
    // log failures are silent — never crash the hook
  }
}

function readState() {
  try {
    const raw = fs.readFileSync(STATE_FILE, 'utf8').trim();
    const ts = parseInt(raw, 10);
    return isNaN(ts) ? 0 : ts;
  } catch (_) {
    return 0;
  }
}

function writeState() {
  try {
    if (!DRY_RUN) {
      fs.writeFileSync(STATE_FILE, String(Math.floor(Date.now() / 1000)));
    }
  } catch (err) {
    appendLog('WARN', `Failed to write state file: ${err.message}`);
  }
}

function isDisconnect(payload) {
  try {
    const response = payload.tool_response;
    const content = (typeof response?.content === 'string')
      ? response.content
      : JSON.stringify(response?.error ?? response ?? '');
    return DISCONNECT_SIGNATURES.some(re => re.test(content));
  } catch (_) {
    return false;
  }
}

async function main() {
  // Read stdin
  const chunks = [];
  await new Promise((resolve) => {
    process.stdin.on('data', chunk => chunks.push(chunk));
    process.stdin.on('end', resolve);
    process.stdin.resume();
  });

  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (!raw) {
    console.log(JSON.stringify({}));
    return;
  }

  let payload;
  try {
    payload = JSON.parse(raw);
  } catch (_) {
    appendLog('WARN', 'Failed to parse stdin JSON');
    console.log(JSON.stringify({}));
    return;
  }

  const toolName = payload.tool_name || 'unknown';

  // Check for disconnect signature
  if (!isDisconnect(payload)) {
    console.log(JSON.stringify({}));
    return;
  }

  // Debounce check
  const nowSecs = Math.floor(Date.now() / 1000);
  const lastTs = readState();
  if ((nowSecs - lastTs) < DEBOUNCE_SECS) {
    const remaining = DEBOUNCE_SECS - (nowSecs - lastTs);
    appendLog('INFO', `Disconnect detected on ${toolName} — debounced (${remaining}s remaining)`);
    console.log(JSON.stringify({}));
    return;
  }

  // Write state (debounce marker)
  writeState();

  const prefix = DRY_RUN ? '[DRY-RUN] ' : '';

  // Log the disconnect
  appendLog('INFO', `${prefix}Disconnect detected on ${toolName}. Chrome extension is not connected.`);

  // Alert the user via stderr
  const stderrMsg = `[chrome-reconnect] Chrome extension disconnected on ${toolName}.\nCheck ~/.claude/logs/chrome-reconnect.log for history. Please reconnect the extension.\n`;
  process.stderr.write(stderrMsg);

  // Return additionalContext to Claude
  const additionalContext = `Chrome extension disconnected during ${toolName}. The extension's Service Worker may have timed out. Please reconnect the Chrome extension and retry.`;
  console.log(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PostToolUseFailure',
      additionalContext,
    }
  }));
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    try {
      appendLog('ERROR', `Unhandled error: ${err.message}`);
    } catch (_) {}
    console.log(JSON.stringify({}));
    process.exit(0);
  });
