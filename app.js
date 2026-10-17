'use strict';

// The configuration rules live in engine.js. No remote specification is loaded.
const VERSION = '1.4.0';
const CONTENT_SCRIPT_ID = 'flow-helper';
const REGISTRATION = {
  id: CONTENT_SCRIPT_ID,
  matches: ['https://flow.google.com/*'],
  js: ['engine.js'],
  runAt: 'document_start',
  world: 'MAIN',
  persistAcrossSessions: true
};
const PAGE_PATHS = new Set(['/panel.html', '/info.html']);
let queue = Promise.resolve();
let lastState = {
  ok: false, enabled: null, registered: null, version: VERSION,
  error: 'The helper is initializing.', errorCode: 'initializing'
};

function serialize(operation) {
  const result = queue.then(operation, operation);
  // A failed operation must not block future toggles or produce an unhandled rejection.
  queue = result.catch(() => {});
  return result;
}

function failure(code) {
  const descriptions = {
    'settings-read-failed': 'Chrome could not read the saved helper setting.',
    'settings-write-failed': 'Chrome could not save the helper setting.',
    'registration-read-failed': 'Chrome could not inspect the helper registration.',
    'registration-update-failed': 'Chrome could not update the helper registration.',
    'registration-add-failed': 'Chrome could not register the helper.',
    'registration-remove-failed': 'Chrome could not remove the helper registration.'
  };
  lastState = { ...lastState, ok: false, errorCode: code, error: descriptions[code] };
  return { ...lastState };
}

async function reconcile(requestedEnabled) {
  let saved;
  try {
    saved = await chrome.storage.local.get('enabled');
  } catch {
    return failure('settings-read-failed');
  }
  let scripts;
  try {
    scripts = await chrome.scripting.getRegisteredContentScripts({ ids: [CONTENT_SCRIPT_ID] });
  } catch {
    return failure('registration-read-failed');
  }
  const registered = scripts.some(script => script.id === CONTENT_SCRIPT_ID);
  // v1.3.1 had no saved preference. Existing registration means enabled. If it
  // is absent, disabled and broken installation are indistinguishable, so the
  // documented migration default is enabled. A saved false always wins.
  const enabled = typeof requestedEnabled === 'boolean'
    ? requestedEnabled
    : typeof saved.enabled === 'boolean' ? saved.enabled : true;
  lastState = { ok: true, enabled, registered, version: VERSION, error: null, errorCode: null };
  if (saved.enabled !== enabled) {
    try {
      // Save intent first: a temporary scripting failure must not lose the choice.
      await chrome.storage.local.set({ enabled });
    } catch {
      lastState.enabled = typeof saved.enabled === 'boolean' ? saved.enabled : null;
      return failure('settings-write-failed');
    }
  }
  if (enabled) {
    if (registered) {
      try {
        await chrome.scripting.updateContentScripts([{ ...REGISTRATION }]);
      } catch {
        return failure('registration-update-failed');
      }
    } else {
      try {
        await chrome.scripting.registerContentScripts([{ ...REGISTRATION }]);
        lastState.registered = true;
      } catch {
        return failure('registration-add-failed');
      }
    }
  } else if (registered) {
    try {
      await chrome.scripting.unregisterContentScripts({ ids: [CONTENT_SCRIPT_ID] });
      lastState.registered = false;
    } catch {
      return failure('registration-remove-failed');
    }
  }
  return { ...lastState };
}

function isOwnPage(sender) {
  if (sender?.id !== chrome.runtime.id || sender.tab || typeof sender.url !== 'string') return false;
  try {
    const url = new URL(sender.url);
    return url.protocol === 'chrome-extension:' && url.hostname === chrome.runtime.id && PAGE_PATHS.has(url.pathname);
  } catch {
    return false;
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const respond = value => { try { sendResponse(value); } catch { /* The popup may have closed. */ } };
  if (message?.type !== 'getState' && message?.type !== 'setEnabled') return false;
  if (!isOwnPage(sender)) {
    respond({ ok: false, error: 'This message is not authorized.', errorCode: 'unauthorized-sender' });
    return false;
  }
  if (message.type === 'setEnabled' && typeof message.enabled !== 'boolean') {
    respond({ ok: false, error: 'The helper setting must be true or false.', errorCode: 'invalid-setting' });
    return false;
  }
  serialize(() => reconcile(message.type === 'setEnabled' ? message.enabled : undefined))
    .then(respond, () => respond({ ...lastState, ok: false, error: 'The helper could not update its state.', errorCode: 'internal-error' }));
  return true;
});

const repairRegistration = () => { void serialize(() => reconcile()).catch(() => {}); };
chrome.runtime.onInstalled.addListener(repairRegistration);
chrome.runtime.onStartup.addListener(repairRegistration);
// A service worker may wake without either event; repair stale/missing registration then too.
repairRegistration();
