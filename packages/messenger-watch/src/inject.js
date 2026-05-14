// Injected into the Business Suite inbox page.
// Watches the conversation list for new unread items and reports them
// to the Node side via window.__notifyMessage(payload).
//
// Selectors target Meta Business Suite's inbox layout. Meta obfuscates
// CSS class names, so we rely on aria-label, role, and visible text rather
// than class selectors. Re-validate when the inbox UI changes.

(() => {
  if (window.__messengerWatchActive) return;
  window.__messengerWatchActive = true;

  const seen = new Set();
  let initialScanDone = false;

  function log(...args) {
    // Prefix so the host can filter from console
    try { console.log('[messenger-watch]', ...args); } catch {}
  }

  // Try multiple strategies to find the inbox conversation list.
  function findInboxRows() {
    const candidates = [];
    document.querySelectorAll('[role="listitem"], [role="row"], [role="link"]').forEach((el) => {
      const aria = (el.getAttribute('aria-label') || '').toLowerCase();
      const txt = (el.textContent || '').trim();
      // Heuristic: rows that mention "unread" in aria-label, OR rows inside a
      // container that looks like an inbox list. Avoid huge containers.
      if (txt.length < 4 || txt.length > 500) return;
      if (aria.includes('unread') || el.querySelector('[aria-label*="Unread" i]')) {
        candidates.push(el);
      }
    });
    return candidates;
  }

  // Extract a stable-ish identity for an inbox row.
  function extractRow(el) {
    // Sender name: usually the first non-empty bold-ish text node, or aria-label
    const aria = el.getAttribute('aria-label') || '';
    let sender = '';
    let preview = '';
    // Best effort: first visible text line is the sender, second is the preview.
    const lines = (el.innerText || '').split('\n').map((s) => s.trim()).filter(Boolean);
    if (lines.length >= 1) sender = lines[0];
    if (lines.length >= 2) preview = lines.slice(1).join(' ').slice(0, 280);
    // Fall back to aria-label for sender when innerText is empty
    if (!sender && aria) sender = aria.replace(/unread/ig, '').trim().split(',')[0];
    return { sender: sender.slice(0, 120), preview, raw: aria };
  }

  function hash(s) {
    let h = 0;
    for (let i = 0; i < s.length; i++) { h = ((h << 5) - h + s.charCodeAt(i)) | 0; }
    return (h >>> 0).toString(36);
  }

  function rowKey(sender, preview) {
    return hash(sender + '|' + preview);
  }

  function reportRow(el) {
    const data = extractRow(el);
    if (!data.sender) return;
    const key = rowKey(data.sender, data.preview);
    if (seen.has(key)) return;
    seen.add(key);
    if (!initialScanDone) {
      // Snapshot whatever is unread at startup, but mark it as already seen
      // and DO NOT notify — we only want to fire on NEW unread items.
      log('initial snapshot:', data.sender);
      return;
    }
    log('new unread detected:', data.sender, '-', data.preview.slice(0, 60));
    try {
      window.__notifyMessage({
        sender: data.sender,
        preview: data.preview,
        raw: data.raw,
        ts: Date.now(),
        key,
      });
    } catch (e) {
      log('notify call failed:', e && e.message);
    }
  }

  function scan() {
    const rows = findInboxRows();
    rows.forEach(reportRow);
  }

  // Initial snapshot — seeds `seen` without firing notifications
  scan();
  initialScanDone = true;
  log('initial scan complete, seen=', seen.size);

  // Watch DOM changes. Throttle scans to at most once per 1.5s to keep this
  // cheap even when the page re-renders heavily.
  let pending = false;
  const obs = new MutationObserver(() => {
    if (pending) return;
    pending = true;
    setTimeout(() => { pending = false; scan(); }, 1500);
  });
  obs.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['aria-label', 'class'] });

  // Belt-and-suspenders safety scan every 30s in case the observer misses
  // a quiet re-render. Still cheap; still bounded by `seen` dedupe.
  setInterval(scan, 30_000);

  // Expose a health probe the Node side can call.
  window.__messengerWatchStatus = () => ({
    seen: seen.size,
    initialScanDone,
    href: location.href,
    title: document.title,
  });

  log('watcher installed');
})();
