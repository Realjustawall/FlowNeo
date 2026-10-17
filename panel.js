'use strict';

const FLOW_URL = 'https://flow.google.com/';
const STATES = {
  enabled: { dot: 'ok', strong: false, text: 'Helper is on. Reload an open Flow tab to apply.' },
  disabled: { dot: 'idle', strong: false, text: 'Helper is off. Reload Flow to remove any hooks already running in this tab.' },
  patched: { dot: 'ok', strong: true, text: 'Local client configuration changed. Access and generation still depend on Google’s server checks.' },
  supported: { dot: 'ok', strong: true, text: 'The observed client configuration already reports this country as supported.' },
  armed: { dot: 'armed', strong: false, text: 'Hooks are installed; waiting for a recognized Flow configuration response.' },
  bootstrap: { dot: 'armed', strong: false, text: 'Hooks are installed; checking the client bootstrap configuration.' },
  schema: { dot: 'bad', strong: true, text: 'The expected configuration field was not found. Flow may need a reviewed compatibility update.' },
  incompatible: { dot: 'warn', strong: true, text: 'The response could not be changed safely. Reload once; if it persists, inspect compatibility.' },
  hookError: { dot: 'bad', strong: true, text: 'A local hook could not be installed or applied. Reload once and check extension errors if this persists.' },
  reload: { dot: 'warn', strong: false, text: 'This tab has no current diagnostic listener. Reload it once to load the updated helper.' },
  unknown: { dot: 'warn', strong: false, text: 'No trustworthy current diagnostic was returned. Reload once, then check the status again.' },
  redirect: { dot: 'warn', strong: true, text: 'The unsupported-country page is still open. Use Reload Flow tab once to retry the home page; a local patch does not prove access.' },
  registration: { dot: 'bad', strong: true, text: 'Chrome could not apply the saved helper setting. Check the error below and try the switch again.' }
};
const toggle = document.getElementById('toggle');
const statusEl = document.getElementById('status');
const errorEl = document.getElementById('error');
const reload = document.getElementById('reload');
const diagnosticEl = document.getElementById('diagnostic');
let activeTab = null;

function flowURL(value) {
  try {
    const url = new URL(value);
    return url.origin === 'https://flow.google.com' ? url : null;
  } catch { return null; }
}

function setStatus(key) {
  const state = STATES[key] || STATES.unknown;
  statusEl.classList.toggle('is-strong', state.strong);
  statusEl.querySelector('.status-dot').className = 'status-dot status-dot--' + state.dot;
  statusEl.querySelector('.status-text').textContent = state.text;
}

function setEnabled(enabled) {
  toggle.setAttribute('aria-checked', String(enabled === true));
}

function displayDiagnostic(diagnostic) {
  diagnosticEl.textContent = '';
  diagnosticEl.hidden = true;
  if (!diagnostic || typeof diagnostic !== 'object') return;
  const count = value => Number.isSafeInteger(value) && value >= 0 ? Math.min(value, 1000000) : 0;
  const known = ['armed', 'patched', 'already-supported', 'schema-mismatch', 'incompatible-response', 'hook-error', 'bootstrap', 'not-loaded', 'unknown'];
  const state = known.includes(diagnostic.state) ? diagnostic.state : 'unknown';
  const transport = ['xhr', 'fetch', 'bootstrap'].includes(diagnostic.transport) ? diagnostic.transport : 'none';
  const error = typeof diagnostic.error === 'string' && /^[a-z][a-z0-9-]{0,63}$/.test(diagnostic.error) ? diagnostic.error : 'none';
  diagnosticEl.textContent = `Local diagnostic: ${state} · RPC ${count(diagnostic.rpcSeen)} · observed ${count(diagnostic.observed)} · changed ${count(diagnostic.changed)} · errors ${count(diagnostic.errors)} · transport ${transport} · code ${error}`;
  diagnosticEl.hidden = false;
}

async function refresh(backgroundState) {
  const state = backgroundState || await chrome.runtime.sendMessage({ type: 'getState' });
  if (!state || typeof state.enabled !== 'boolean') {
    setStatus('registration');
    throw new Error(state?.error || 'Chrome did not return the helper setting.');
  }
  setEnabled(state.enabled);
  if (!state.ok) {
    errorEl.textContent = state.error || 'Chrome could not apply the helper setting.';
    setStatus('registration');
    return;
  }
  [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const url = flowURL(activeTab?.url);
  reload.hidden = !url;
  displayDiagnostic(null);
  setStatus(state.enabled ? 'enabled' : 'disabled');
  if (!state.enabled || !url) return;
  let diagnostic;
  let hasListener = true;
  try {
    diagnostic = await chrome.tabs.sendMessage(activeTab.id, { type: 'status' });
  } catch {
    hasListener = false;
  }
  displayDiagnostic(diagnostic);
  // A changed client flag is not evidence that the redirect/server restriction is gone.
  if (/^\/unsupported-country\/?$/.test(url.pathname) || diagnostic?.unsupported === true) {
    setStatus('redirect');
    return;
  }
  if (!hasListener) { setStatus('reload'); return; }
  if (diagnostic?.state === 'not-loaded') { setStatus('reload'); return; }
  if (!diagnostic || diagnostic.version !== '1.4.0') { setStatus('unknown'); return; }
  const keys = {
    patched: 'patched', 'already-supported': 'supported', armed: 'armed',
    bootstrap: 'bootstrap', 'schema-mismatch': 'schema', 'incompatible-response': 'incompatible', 'hook-error': 'hookError',
    'not-loaded': 'reload'
  };
  setStatus(keys[diagnostic.state] || 'unknown');
}

toggle.addEventListener('click', async () => {
  const enabled = toggle.getAttribute('aria-checked') !== 'true';
  toggle.disabled = true;
  errorEl.textContent = '';
  try {
    const state = await chrome.runtime.sendMessage({ type: 'setEnabled', enabled });
    await refresh(state);
  } catch (error) {
    errorEl.textContent = error.message || 'The helper setting could not be saved.';
  } finally {
    toggle.disabled = false;
  }
});

document.getElementById('open').addEventListener('click', async () => {
  try { await chrome.tabs.create({ url: FLOW_URL }); } catch { errorEl.textContent = 'Chrome could not open Google Flow.'; }
});

reload.addEventListener('click', async () => {
  try {
    const current = await chrome.tabs.get(activeTab.id);
    const url = flowURL(current.url);
    if (!url) throw new Error('Switch to a Google Flow tab first.');
    if (/^\/unsupported-country\/?$/.test(url.pathname)) {
      url.pathname = '/';
      // Preserve search and hash while retrying only this exact Flow origin.
      await chrome.tabs.update(activeTab.id, { url: url.href });
    } else {
      await chrome.tabs.reload(activeTab.id);
    }
    window.close();
  } catch (error) {
    errorEl.textContent = error.message || 'Chrome could not reload this tab.';
  }
});

refresh().catch(error => {
  setStatus('registration');
  errorEl.textContent = error.message || 'The helper status could not be read.';
}).finally(() => { toggle.disabled = false; });
