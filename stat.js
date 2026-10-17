'use strict';

// This isolated-world bridge reads only bounded, public diagnostic counters.
// Page-controlled attributes are untrusted and never become extension commands.
const DIAGNOSTIC_ATTRIBUTE = 'data-flow-local-diagnostic';
const STATES = new Set(['armed', 'patched', 'already-supported', 'schema-mismatch', 'incompatible-response', 'hook-error', 'bootstrap']);
const count = value => Number.isSafeInteger(value) && value >= 0 ? Math.min(value, 1000000) : 0;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (sender?.id !== chrome.runtime.id || message?.type !== 'status') return false;
  let diagnostic = null;
  const raw = document.documentElement?.getAttribute(DIAGNOSTIC_ATTRIBUTE);
  if (typeof raw === 'string' && raw.length <= 4096) {
    try { diagnostic = JSON.parse(raw); } catch { /* Missing/malformed state remains unknown. */ }
  }
  const valid = diagnostic !== null && typeof diagnostic === 'object' && !Array.isArray(diagnostic);
  const safeError = value => typeof value === 'string' && /^[a-z][a-z0-9-]{0,63}$/.test(value) ? value : null;
  sendResponse({
    state: valid ? STATES.has(diagnostic.state) ? diagnostic.state : 'unknown' : raw == null ? 'not-loaded' : 'unknown',
    version: valid && diagnostic.version === '1.4.0' ? diagnostic.version : null,
    changed: count(diagnostic?.changed),
    observed: count(diagnostic?.observed),
    before: typeof diagnostic?.before === 'boolean' ? diagnostic.before : null,
    transport: ['xhr', 'fetch', 'bootstrap'].includes(diagnostic?.transport) ? diagnostic.transport : null,
    errors: count(diagnostic?.errors),
    error: safeError(diagnostic?.error),
    rpcSeen: count(diagnostic?.rpcSeen),
    unsupported: location.origin === 'https://flow.google.com' && /^\/unsupported-country\/?$/.test(location.pathname)
  });
  return false;
});
