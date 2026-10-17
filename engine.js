/* FlowNeo local repair. No remote configuration, credentials or telemetry. */
(function () {
  'use strict';
  const VERSION = '1.4.0';
  // Public Google frontend OfiZ0mUhm-Y.2018.O, verified 2026-10-17.
  // GetFlowAppConfig field 31 is geography. Field 32 (age) is untouched.
  const SPEC = Object.freeze({
    origin: 'https://flow.google.com',
    path: '/_/AiSandboxAngularFrontend/data/batchexecute',
    rpcid: 'cPZSdc', tag: 'wrb.fr', field: 31, flagIndex: 30,
  });
  const ATTRIBUTE = 'data-flow-local-diagnostic';
  const SENTINEL = '__flowNeoLocalV140';
  class ProtocolError extends Error {
    constructor(code) { super(code); this.code = code; }
  }
  function isBatchURL(value, base = SPEC.origin) {
    try {
      const url = new URL(value, base);
      return url.origin === SPEC.origin && url.pathname === SPEC.path;
    } catch { return false; }
  }
  function isConfigURL(value, base = SPEC.origin) {
    try {
      const url = new URL(value, base);
      return isBatchURL(url) && (url.searchParams.get('rpcids') || '').split(',').includes(SPEC.rpcid);
    } catch { return false; }
  }
  function countrySlot(payload) {
    if (!Array.isArray(payload)) throw new ProtocolError('schema-mismatch');
    const last = payload.length - 1;
    const tail = payload[last];
    const sparse = tail !== null && typeof tail === 'object' && !Array.isArray(tail);
    const hasSparse = sparse && Object.hasOwn(tail, String(SPEC.field));
    const hasDense = SPEC.flagIndex < (sparse ? last : payload.length);
    // Match Google's Kc array getter. Refuse dual representations to avoid ambiguity.
    if (hasSparse && hasDense) throw new ProtocolError('ambiguous-country-field');
    const owner = hasDense ? payload : hasSparse ? tail : null;
    const key = hasDense ? SPEC.flagIndex : String(SPEC.field);
    if (!owner) throw new ProtocolError('country-field-missing');
    const value = owner[key];
    // Google's Ab boolean decoder also accepts numeric wire values.
    if (!(value === null || typeof value === 'boolean' ||
          (typeof value === 'number' && Number.isFinite(value)))) {
      throw new ProtocolError('schema-mismatch');
    }
    return { owner, key, value, before: value === null ? null : Boolean(value) };
  }
  function patch(body) {
    if (typeof body !== 'string') throw new ProtocolError('non-text-response');
    const lines = body.split('\n');
    const frames = [];
    let found = 0;
    let before;
    for (let index = 0; index < lines.length; index++) {
      const raw = lines[index].replace(/\r$/, '');
      if (!raw.startsWith('[[')) continue;
      let rows;
      try { rows = JSON.parse(raw); } catch { continue; }
      if (!Array.isArray(rows)) continue;
      let changed = false;
      for (const row of rows) {
        if (!Array.isArray(row) || row[0] !== SPEC.tag || row[1] !== SPEC.rpcid) continue;
        found++;
        let payload;
        try { payload = JSON.parse(row[2]); }
        catch { throw new ProtocolError('invalid-config-json'); }
        const slot = countrySlot(payload);
        before = slot.before;
        if (!before) {
          slot.owner[slot.key] = true;
          row[2] = JSON.stringify(payload);
          changed = true;
        }
      }
      if (!changed) continue;
      const sizeLine = lines[index - 1] || '';
      if (!/^\d+\r?$/.test(sizeLine)) throw new ProtocolError('missing-frame-length');
      const size = Number(sizeLine.replace(/\r$/, ''));
      // Google's current streaming parser uses JS substr(): UTF-16 code units.
      // Preserve the original delimiter count (+0, +1 or +2), including CRLF.
      const utf8 = value => new TextEncoder().encode(value).length;
      const measure = [value => value.length, utf8].find(fn =>
        Number.isSafeInteger(size) && [0, 1, 2].includes(size - fn(raw)));
      if (!measure) throw new ProtocolError('invalid-frame-length');
      const next = JSON.stringify(rows);
      frames.push({ index, text: next + (lines[index].endsWith('\r') ? '\r' : ''),
        size: String(size + measure(next) - measure(raw)) + (sizeLine.endsWith('\r') ? '\r' : '') });
    }
    if (found !== 1) throw new ProtocolError(found ? 'ambiguous-config' : 'config-not-found');
    for (const frame of frames) {
      lines[frame.index - 1] = frame.size;
      lines[frame.index] = frame.text;
    }
    return { body: frames.length ? lines.join('\n') : body, before, changed: !before };
  }
  // Node imports expose only the pure parser and never install browser hooks.
  if (typeof module === 'object' && module.exports) {
    module.exports = { patch, isConfigURL, isBatchURL, SPEC, VERSION };
    return;
  }
  if (location.origin !== SPEC.origin || window[SENTINEL]) return;
  const diagnostic = window[SENTINEL] = {
    version: VERSION, state: 'armed', observed: 0, changed: 0, rpcSeen: 0,
    before: null, transport: null, error: null, errors: 0, hookErrors: 0,
  };
  function publish() {
    if (document.documentElement) document.documentElement.setAttribute(ATTRIBUTE, JSON.stringify(diagnostic));
  }
  function fail(error, transport) {
    diagnostic.state = error?.code === 'schema-mismatch' ? 'schema-mismatch' : 'incompatible-response';
    diagnostic.error = error instanceof ProtocolError ? error.code : 'response-processing-failed';
    diagnostic.errors++;
    diagnostic.transport = transport;
    publish();
  }
  function process(body, transport) {
    try {
      const result = patch(body);
      diagnostic.observed++;
      diagnostic.changed += Number(result.changed);
      diagnostic.before = result.before;
      diagnostic.transport = transport;
      diagnostic.state = result.changed ? 'patched' : 'already-supported';
      diagnostic.error = null;
      publish();
      return result.body;
    } catch (error) { fail(error, transport); return body; }
  }
  function hookError() {
    diagnostic.hookErrors++;
    diagnostic.error = 'hook-installation-failed';
    diagnostic.state = 'hook-error';
    publish();
  }
  // Install synchronously at document_start. No response waits for a remote spec.
  try {
    const prototype = XMLHttpRequest.prototype;
    const open = prototype.open;
    const requests = new WeakMap();
    const results = new WeakMap();
    prototype.open = function (method, url, ...rest) {
      const result = Reflect.apply(open, this, [method, url, ...rest]);
      // Let native open() perform any RequestInfo coercion exactly once. Its final
      // responseURL will identify non-string inputs when the response arrives.
      const target = typeof url === 'string' && isConfigURL(url, location.href);
      requests.set(this, { target, counted: target });
      results.delete(this); // Only a successful open() starts a new response.
      if (target) { diagnostic.rpcSeen++; publish(); }
      return result;
    };
    for (const name of ['responseText', 'response']) {
      const descriptor = Object.getOwnPropertyDescriptor(prototype, name);
      if (!descriptor?.get || !descriptor.configurable) { hookError(); continue; }
      Object.defineProperty(prototype, name, { ...descriptor, get() {
        const original = Reflect.apply(descriptor.get, this, []);
        const metadata = requests.get(this);
        if (!metadata || typeof original !== 'string') return original;
        const target = this.responseURL ? isConfigURL(this.responseURL, location.href) : metadata.target;
        if (!target) return original;
        if (!metadata.counted) { diagnostic.rpcSeen++; metadata.counted = true; publish(); }
        if (this.readyState === 3) return ''; // Incomplete config frames are not parseable yet.
        if (this.readyState !== 4) return original;
        if (!results.has(this)) {
          if (this.status < 200 || this.status >= 300) {
            fail(new ProtocolError(`http-${this.status || 'request-failed'}`), 'xhr');
            results.set(this, original);
          } else results.set(this, process(original, 'xhr'));
        }
        return results.get(this);
      } });
    }
  } catch { hookError(); }
  if (typeof window.fetch === 'function') {
    const originalFetch = window.fetch;
    function withMetadata(response, source) {
      Object.defineProperties(response, {
        url: { configurable: true, value: source.url },
        redirected: { configurable: true, value: source.redirected },
        type: { configurable: true, value: source.type },
      });
      const clone = response.clone;
      Object.defineProperty(response, 'clone', { configurable: true, value() {
        return withMetadata(Reflect.apply(clone, this, []), source);
      } });
      return response;
    }
    try {
      window.fetch = async function (input, options) {
        const response = await Reflect.apply(originalFetch, this, [input, options]);
        // Use the actual final response URL, including redirects. Native Request/URL
        // getters provide a brand-checked fallback for synthetic Response wrappers.
        // Never read arbitrary input.url getters or coerce an input a second time.
        let requestURL = typeof input === 'string' ? input : null;
        if (requestURL === null) {
          for (const [prototype, key] of [[Request.prototype, 'url'], [URL.prototype, 'href']]) {
            try {
              requestURL = Reflect.apply(Object.getOwnPropertyDescriptor(prototype, key).get, input, []);
              break;
            } catch { /* Not this native brand. */ }
          }
        }
        const target = isConfigURL(response.url || requestURL, location.href);
        if (!target) return response;
        diagnostic.rpcSeen++; publish();
        if (!response.ok) {
          fail(new ProtocolError(`http-${response.status || 'request-failed'}`), 'fetch');
          return response;
        }
        try {
          const original = await response.clone().text();
          const modified = process(original, 'fetch');
          if (modified === original) return response;
          const headers = new Headers(response.headers);
          headers.delete('content-length');
          headers.delete('content-encoding');
          return withMetadata(new Response(modified, {
            status: response.status, statusText: response.statusText, headers,
          }), response);
        } catch { fail(new ProtocolError('fetch-response-unreadable'), 'fetch'); return response; }
      };
    } catch { hookError(); }
  }
  if (!document.documentElement) document.addEventListener('DOMContentLoaded', publish, { once: true });
  publish();
})();
