// Facebook Messenger integration: webhook receive, recent-messages poll, outbound send,
// plus scrape-ingest for the messenger-watch headless watcher.
// Loaded from server.js via require('./messenger').register(app, getDatabase, requireAuth).
//
// DEPLOY: this file is the canonical source. deploy.bat from messenger-watch
//   scp's it to /var/www/3ks.afkcube.com/api/messenger.js on Kali and restarts pos-sync-api.
const crypto = require('crypto');
const https = require('https');
const fs = require('fs');
const path = require('path');
const express = require('express');
const { Readable } = require('stream');

const MEDIA_DIR = path.join(__dirname, 'media');
// Public base for stored attachments. nginx proxies /api/* to this Express server,
// so /api/media/<file> is reachable from clients and is a stable URL.
const MEDIA_PUBLIC_BASE = 'https://3ks.afkcube.com/api/media';

function ensureMediaDir() {
  try { fs.mkdirSync(MEDIA_DIR, { recursive: true }); } catch (e) { console.error('[messenger] mkdir media failed:', e.message); }
}

// Normalize Graph API attachment shape ({ data: [{ image_data: { url } | video_data | file_url, ... }] })
// into the same webhook shape we already store: [{ type, payload: { url, ... } }].
// Returns null when there are no attachments so we keep storing NULL for text-only messages.
function normalizeGraphAttachments(att) {
  const arr = (att && att.data) || [];
  if (!arr.length) return null;
  const out = arr.map((a) => {
    if (a.image_data && a.image_data.url) {
      return { type: 'image', payload: { url: a.image_data.url, preview_url: a.image_data.preview_url || null, mime_type: a.mime_type || null, name: a.name || null } };
    }
    if (a.video_data && a.video_data.url) {
      return { type: 'video', payload: { url: a.video_data.url, preview_url: a.video_data.preview_url || null, mime_type: a.mime_type || null, name: a.name || null } };
    }
    if (a.file_url) {
      return { type: 'file', payload: { url: a.file_url, mime_type: a.mime_type || null, name: a.name || null } };
    }
    return { type: 'unknown', payload: { mime_type: a.mime_type || null, name: a.name || null } };
  });
  return out;
}

// Read a row's attachments JSON and return an array regardless of whether it was
// stored as a bare array (webhook + normalized Graph) or as { data: [...] }
// (legacy webhook rows from very early on). Returns [] when missing/invalid.
function readAttachmentsArray(jsonText) {
  if (!jsonText) return [];
  try {
    const parsed = JSON.parse(jsonText);
    if (Array.isArray(parsed)) return parsed;
    if (parsed && Array.isArray(parsed.data)) return parsed.data;
    return [];
  } catch {
    return [];
  }
}

function extFromContentType(ct) {
  if (!ct) return 'bin';
  const m = String(ct).toLowerCase().split(';')[0].trim();
  if (m === 'image/jpeg' || m === 'image/jpg') return 'jpg';
  if (m === 'image/png') return 'png';
  if (m === 'image/gif') return 'gif';
  if (m === 'image/webp') return 'webp';
  if (m === 'video/mp4') return 'mp4';
  if (m === 'video/quicktime') return 'mov';
  if (m === 'application/pdf') return 'pdf';
  return 'bin';
}

function safeIdForFilename(id) {
  return String(id).replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 80);
}

function loadConfig() {
  try {
    return JSON.parse(fs.readFileSync(__dirname + '/messenger-config.json', 'utf8'));
  } catch (e) {
    console.error('[messenger] failed to load messenger-config.json:', e.message);
    return null;
  }
}

function ensureTable(getDatabase) {
  try {
    const db = getDatabase();
    db.exec(`
      CREATE TABLE IF NOT EXISTS messenger_messages (
        id TEXT PRIMARY KEY,
        psid TEXT NOT NULL,
        direction TEXT NOT NULL,
        text TEXT,
        attachments TEXT,
        created_at TEXT NOT NULL,
        raw_json TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_messenger_psid ON messenger_messages(psid);
      CREATE INDEX IF NOT EXISTS idx_messenger_created ON messenger_messages(created_at);

      CREATE TABLE IF NOT EXISTS messenger_profiles (
        psid TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        first_name TEXT,
        last_name TEXT,
        profile_pic TEXT,
        fetched_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS messenger_sync_state (
        k TEXT PRIMARY KEY,
        v TEXT NOT NULL
      );
    `);
    console.log('[messenger] tables ready');
  } catch (e) {
    console.error('[messenger] failed to create tables:', e.message);
  }
}

// Simple GET helper for Graph API. Returns parsed JSON or throws.
function graphGet(pathWithQuery) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'graph.facebook.com',
      path: pathWithQuery,
      method: 'GET',
    }, (res) => {
      let chunks = '';
      res.on('data', (c) => { chunks += c; });
      res.on('end', () => {
        try {
          const json = JSON.parse(chunks);
          if (res.statusCode >= 200 && res.statusCode < 300) return resolve(json);
          const err = new Error(`graph ${res.statusCode}: ${chunks.slice(0, 300)}`);
          err.statusCode = res.statusCode;
          err.body = json;
          reject(err);
        } catch (e) {
          reject(new Error(`graph parse: ${e.message} body=${chunks.slice(0, 200)}`));
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

function getState(db, k) {
  const row = db.prepare('SELECT v FROM messenger_sync_state WHERE k = ?').get(k);
  return row ? row.v : null;
}
function setState(db, k, v) {
  db.prepare('INSERT INTO messenger_sync_state (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v').run(k, v);
}

function upsertProfile(db, p) {
  if (!p || !p.id || !p.name) return;
  db.prepare(`
    INSERT INTO messenger_profiles (psid, name, first_name, last_name, profile_pic, fetched_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(psid) DO UPDATE SET
      name = excluded.name,
      first_name = excluded.first_name,
      last_name = excluded.last_name,
      profile_pic = excluded.profile_pic,
      fetched_at = excluded.fetched_at
  `).run(p.id, p.name, p.first_name || null, p.last_name || null, p.profile_pic || null, new Date().toISOString());
}

// Returns the Page's own id (the "asset id"). Cached after first lookup.
async function getPageId(db, token) {
  let pageId = getState(db, 'page_id');
  if (pageId) return pageId;
  const me = await graphGet(`/v21.0/me?fields=id,name&access_token=${encodeURIComponent(token)}`);
  pageId = String(me.id);
  setState(db, 'page_id', pageId);
  if (me.name) upsertProfile(db, { id: pageId, name: me.name });
  console.log('[messenger-sync] discovered pageId =', pageId, 'name =', me.name);
  return pageId;
}

// Pull conversations from Graph API and upsert messages + profiles.
// When opts.backfill === true, paginate through ALL conversations and ALL
// their messages. Otherwise just scan the most-recent page and stop when
// updated_time falls below last_synced_at.
async function syncFromGraph(getDatabase, opts = {}) {
  const config = loadConfig();
  if (!config || !config.pageAccessToken) {
    console.warn('[messenger-sync] no pageAccessToken in config, skipping');
    return { ok: false, reason: 'no-token' };
  }
  const token = config.pageAccessToken;
  const db = getDatabase();
  const pageId = await getPageId(db, token);

  const backfill = !!opts.backfill;
  const lastSyncedAt = backfill ? null : getState(db, 'last_synced_at');
  const lastSyncedMs = lastSyncedAt ? Date.parse(lastSyncedAt) : 0;
  const startedAt = new Date().toISOString();

  let convsScanned = 0;
  let msgsInserted = 0;
  let pagesFollowed = 0;
  let convPath = `/v21.0/me/conversations?fields=id,updated_time,participants&limit=25&access_token=${encodeURIComponent(token)}`;

  const insertMsg = db.prepare(`
    INSERT OR IGNORE INTO messenger_messages
      (id, psid, direction, text, attachments, created_at, raw_json)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  while (convPath) {
    const convPage = await graphGet(convPath);
    const conversations = convPage.data || [];
    let reachedOldOne = false;

    for (const c of conversations) {
      convsScanned++;
      const updatedMs = c.updated_time ? Date.parse(c.updated_time) : 0;

      // In delta mode, since Graph returns newest-first we can break on the first
      // conversation that hasn't changed since last sync.
      if (!backfill && updatedMs <= lastSyncedMs) { reachedOldOne = true; break; }

      const participants = (c.participants && c.participants.data) || [];
      for (const p of participants) upsertProfile(db, { id: p.id, name: p.name });

      // The "customer" in this thread is the participant that is NOT the Page.
      const customer = participants.find((p) => p.id !== pageId);
      const customerPsid = customer ? customer.id : (participants[0] && participants[0].id) || c.id;

      let msgPath = `/v21.0/${c.id}/messages?fields=from,to,message,attachments,created_time&limit=100&access_token=${encodeURIComponent(token)}`;
      while (msgPath) {
        const mPage = await graphGet(msgPath);
        const msgs = mPage.data || [];
        let pageReachedOld = false;

        for (const m of msgs) {
          const msgMs = m.created_time ? Date.parse(m.created_time) : 0;
          if (!backfill && msgMs <= lastSyncedMs) { pageReachedOld = true; continue; }

          const fromId = m.from && m.from.id;
          const direction = fromId === pageId ? 'out' : 'in';
          if (m.from) upsertProfile(db, { id: m.from.id, name: m.from.name });

          const id = m.id || `graph-${c.id}-${msgMs}`;
          const text = m.message || '';
          const normAtt = normalizeGraphAttachments(m.attachments);
          const result = insertMsg.run(
            id, customerPsid, direction, text,
            normAtt ? JSON.stringify(normAtt) : null,
            m.created_time || startedAt,
            JSON.stringify({ source: 'graph', from: m.from, to: m.to })
          );
          if (result.changes > 0) msgsInserted += 1;
        }

        if (!backfill && pageReachedOld) break;
        msgPath = mPage.paging && mPage.paging.next ? mPage.paging.next.replace('https://graph.facebook.com', '') : null;
      }
    }

    if (!backfill && reachedOldOne) break;
    convPath = convPage.paging && convPage.paging.next ? convPage.paging.next.replace('https://graph.facebook.com', '') : null;
    pagesFollowed += 1;
    // Bound pagination so a runaway can't burn the quota.
    if (pagesFollowed >= (backfill ? 20 : 4)) break;
  }

  setState(db, 'last_synced_at', startedAt);
  if (backfill) setState(db, 'backfilled', '1');

  console.log(`[messenger-sync] ok backfill=${backfill} convsScanned=${convsScanned} msgsInserted=${msgsInserted} pages=${pagesFollowed}`);
  return { ok: true, convsScanned, msgsInserted, pagesFollowed };
}

// Kick off periodic polling of Graph API. On first launch, run a backfill if
// we've never synced before; otherwise just incremental.
async function startGraphPoller(getDatabase) {
  const POLL_INTERVAL_MS = 20_000;
  const db = getDatabase();
  const everBackfilled = getState(db, 'backfilled') === '1';

  // Important: await the first sync so the setInterval ticks don't fire while
  // backfill is still running (which would cause concurrent syncs racing on
  // last_synced_at and possibly skipping messages).
  try {
    await syncFromGraph(getDatabase, { backfill: !everBackfilled });
  } catch (e) {
    console.error('[messenger-sync] initial sync failed:', e.message);
  }

  // Serialize ticks: if one is still running when the timer fires, skip this tick.
  let syncing = false;
  setInterval(async () => {
    if (syncing) {
      console.log('[messenger-sync] tick skipped (previous still running)');
      return;
    }
    syncing = true;
    try {
      await syncFromGraph(getDatabase);
    } catch (e) {
      console.error('[messenger-sync] tick failed:', e.message);
    } finally {
      syncing = false;
    }
  }, POLL_INTERVAL_MS);
}

function verifySignature(req, appSecret) {
  if (!appSecret) return false;
  const sigHeader = req.get('x-hub-signature-256') || '';
  if (!sigHeader.startsWith('sha256=')) return false;
  const expected = 'sha256=' + crypto
    .createHmac('sha256', appSecret)
    .update(req.rawBody || Buffer.from(''))
    .digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(sigHeader), Buffer.from(expected));
  } catch (e) {
    return false;
  }
}

function register(app, getDatabase, requireAuth) {
  const config = loadConfig();
  ensureTable(getDatabase);
  ensureMediaDir();

  // Stored message attachments. Same-origin URL so the renderer always loads
  // them (Facebook CDN URLs expire after a while; rows whose payload.url was
  // rewritten by /attachment/store live here and remain viewable forever).
  // Long max-age is safe because filenames are content-addressed (msgId_index).
  app.use('/api/media', express.static(MEDIA_DIR, { maxAge: '365d', immutable: true }));

  // Webhook verification (Meta sends a GET when you click Confirm in the dev portal)
  app.get('/api/messenger/webhook', (req, res) => {
    if (!config) return res.status(500).send('config-missing');
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    if (mode === 'subscribe' && token === config.verifyToken) {
      console.log('[messenger] webhook verified');
      return res.status(200).send(challenge);
    }
    console.warn('[messenger] webhook verify failed', { mode, token });
    return res.status(403).send('forbidden');
  });

  // Incoming message webhook
  app.post('/api/messenger/webhook', (req, res) => {
    if (!config) return res.sendStatus(500);
    if (!verifySignature(req, config.appSecret)) {
      console.warn('[messenger] bad signature');
      return res.sendStatus(403);
    }
    const body = req.body;
    if (body.object !== 'page') return res.sendStatus(404);
    try {
      const db = getDatabase();
      const insert = db.prepare(`
        INSERT OR IGNORE INTO messenger_messages
          (id, psid, direction, text, attachments, created_at, raw_json)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      for (const entry of body.entry || []) {
        for (const evt of entry.messaging || []) {
          if (!evt.message) continue;
          const mid = evt.message.mid || (entry.id + ':' + (evt.timestamp || Date.now()));
          const psid = evt.sender && evt.sender.id ? evt.sender.id : 'unknown';
          const text = evt.message.text || '';
          const attachments = evt.message.attachments ? JSON.stringify(evt.message.attachments) : null;
          const ts = evt.timestamp ? new Date(evt.timestamp).toISOString() : new Date().toISOString();
          insert.run(mid, psid, 'in', text, attachments, ts, JSON.stringify(evt));
        }
      }
    } catch (e) {
      console.error('[messenger] store error:', e.message);
    }
    // Always 200 quickly so Meta does not retry
    return res.sendStatus(200);
  });

  // Ingest scraped messages from messenger-watch. Used when the official
  // Page webhook is unavailable. Authenticated via X-Scrape-Token header
  // set in messenger-config.json -> scrapeToken.
  app.post('/api/messenger/scrape-ingest', (req, res) => {
    if (!config || !config.scrapeToken) {
      return res.status(500).json({ success: false, error: 'scrape-token-not-configured' });
    }
    if (req.get('x-scrape-token') !== config.scrapeToken) {
      console.warn('[messenger] scrape-ingest bad token from', req.ip);
      return res.status(403).json({ success: false, error: 'forbidden' });
    }
    const { id, sender, text, timestamp, raw, source } = req.body || {};
    if (!id || !sender) {
      return res.status(400).json({ success: false, error: 'id and sender required' });
    }
    try {
      const db = getDatabase();
      const psid = 'scrape:' + sender;
      const ts = timestamp || new Date().toISOString();
      const result = db.prepare(`
        INSERT OR IGNORE INTO messenger_messages
          (id, psid, direction, text, attachments, created_at, raw_json)
        VALUES (?, ?, 'in', ?, NULL, ?, ?)
      `).run(id, psid, text || '', ts, JSON.stringify({ source: source || 'scrape', raw: raw || null }));
      return res.json({ success: true, inserted: result.changes > 0 });
    } catch (e) {
      console.error('[messenger] scrape-ingest store error:', e.message);
      return res.status(500).json({ success: false, error: e.message });
    }
  });

  // Recent incoming messages since a timestamp — used by the web app poller for notifications.
  // Joins messenger_profiles so the toast can show "New message from <Name>" instead of "<PSID>".
  app.get('/api/messenger/messages/recent', requireAuth, (req, res) => {
    try {
      const since = req.query.since || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const limit = Math.min(parseInt(req.query.limit || '50', 10) || 50, 200);
      const db = getDatabase();
      const rows = db.prepare(`
        SELECT m.id, m.psid, m.direction, m.text, m.created_at,
               COALESCE(p.name, '') AS display_name
        FROM messenger_messages m
        LEFT JOIN messenger_profiles p ON p.psid = m.psid
        WHERE m.direction = 'in' AND m.created_at > ?
        ORDER BY m.created_at ASC
        LIMIT ?
      `).all(since, limit);
      res.json({ success: true, messages: rows, server_time: new Date().toISOString() });
    } catch (e) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // List threads grouped by PSID. Includes display_name from messenger_profiles.
  app.get('/api/messenger/threads', requireAuth, (req, res) => {
    try {
      const db = getDatabase();
      const rows = db.prepare(`
        SELECT m1.psid,
               COALESCE(p.name, '') AS display_name,
               p.profile_pic AS profile_pic,
               MAX(m1.created_at) AS last_at,
               (SELECT text FROM messenger_messages m2 WHERE m2.psid = m1.psid ORDER BY created_at DESC LIMIT 1) AS last_text,
               (SELECT direction FROM messenger_messages m2 WHERE m2.psid = m1.psid ORDER BY created_at DESC LIMIT 1) AS last_direction,
               COUNT(*) AS message_count
        FROM messenger_messages m1
        LEFT JOIN messenger_profiles p ON p.psid = m1.psid
        GROUP BY m1.psid
        ORDER BY last_at DESC
        LIMIT 200
      `).all();
      res.json({ success: true, threads: rows });
    } catch (e) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // Full message history for a thread. Top-level display_name is the customer's
  // name; each message also has a from_name resolved through messenger_profiles.
  app.get('/api/messenger/thread/:psid', requireAuth, (req, res) => {
    try {
      const db = getDatabase();
      const customer = db.prepare(`SELECT name FROM messenger_profiles WHERE psid = ?`).get(req.params.psid);
      const rows = db.prepare(`
        SELECT m.id, m.psid, m.direction, m.text, m.attachments, m.created_at,
               COALESCE(json_extract(m.raw_json, '$.from.id'), '') AS from_psid,
               COALESCE(pf.name, '') AS from_name
        FROM messenger_messages m
        LEFT JOIN messenger_profiles pf ON pf.psid = json_extract(m.raw_json, '$.from.id')
        WHERE m.psid = ?
        ORDER BY m.created_at ASC
        LIMIT 500
      `).all(req.params.psid);
      res.json({ success: true, messages: rows, display_name: customer ? customer.name : '' });
    } catch (e) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // Admin: trigger an immediate Graph sync. Accepts ?backfill=1 for full backfill.
  // Same Bearer-auth as other admin endpoints.
  app.post('/api/messenger/sync', requireAuth, async (req, res) => {
    try {
      const backfill = req.query.backfill === '1' || req.body?.backfill === true;
      const result = await syncFromGraph(getDatabase, { backfill });
      res.json({ success: true, ...result });
    } catch (e) {
      console.error('[messenger-sync] manual sync failed:', e.message);
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // Download an attachment through the server. The renderer can't force-download
  // a cross-origin Facebook CDN URL via the <a download> attribute, so the
  // Download button calls this proxy. The server streams the bytes with
  // Content-Disposition so the client gets a save-as.
  app.get('/api/messenger/attachment/download', requireAuth, async (req, res) => {
    try {
      const id = req.query.id;
      const i = Math.max(0, parseInt(req.query.i || '0', 10) || 0);
      if (!id) return res.status(400).json({ success: false, error: 'id required' });
      const db = getDatabase();
      const row = db.prepare('SELECT attachments FROM messenger_messages WHERE id = ?').get(id);
      if (!row) return res.status(404).json({ success: false, error: 'not-found' });
      const arr = readAttachmentsArray(row.attachments);
      const a = arr[i];
      const url = a && a.payload && a.payload.url;
      if (!url) return res.status(404).json({ success: false, error: 'no-such-attachment' });

      const upstream = await fetch(url);
      if (!upstream.ok || !upstream.body) {
        return res.status(502).json({ success: false, error: `upstream ${upstream.status}` });
      }
      const ct = upstream.headers.get('content-type') || 'application/octet-stream';
      const ext = extFromContentType(ct);
      const filename = `${safeIdForFilename(id)}_${i}.${ext}`;
      res.setHeader('Content-Type', ct);
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      const len = upstream.headers.get('content-length');
      if (len) res.setHeader('Content-Length', len);
      Readable.fromWeb(upstream.body).pipe(res);
    } catch (e) {
      console.error('[messenger] attachment download error:', e.message);
      if (!res.headersSent) res.status(500).json({ success: false, error: e.message });
    }
  });

  // Persist an attachment to /api/media/<id>_<i>.<ext>, then rewrite the row's
  // attachments JSON so payload.url points at the stable URL. Subsequent loads
  // of this thread will display the stored copy instead of Facebook's
  // expiring CDN link. Idempotent: calling on an already-stored attachment
  // returns the existing record without re-downloading.
  app.post('/api/messenger/attachment/store', requireAuth, async (req, res) => {
    try {
      const { id, i } = req.body || {};
      const index = Math.max(0, parseInt(i, 10) || 0);
      if (!id) return res.status(400).json({ success: false, error: 'id required' });
      const db = getDatabase();
      const row = db.prepare('SELECT attachments FROM messenger_messages WHERE id = ?').get(id);
      if (!row) return res.status(404).json({ success: false, error: 'not-found' });
      const arr = readAttachmentsArray(row.attachments);
      const a = arr[index];
      if (!a || !a.payload || !a.payload.url) return res.status(404).json({ success: false, error: 'no-such-attachment' });
      if (a.payload.stored) {
        return res.json({ success: true, already: true, attachment: a });
      }

      const sourceUrl = a.payload.url;
      const upstream = await fetch(sourceUrl);
      if (!upstream.ok || !upstream.body) {
        return res.status(502).json({ success: false, error: `upstream ${upstream.status}` });
      }
      const ct = upstream.headers.get('content-type') || 'application/octet-stream';
      const ext = extFromContentType(ct);
      const filename = `${safeIdForFilename(id)}_${index}.${ext}`;
      const fullPath = path.join(MEDIA_DIR, filename);
      await new Promise((resolve, reject) => {
        const out = fs.createWriteStream(fullPath);
        out.on('finish', resolve);
        out.on('error', reject);
        Readable.fromWeb(upstream.body).on('error', reject).pipe(out);
      });

      a.payload.original_url = sourceUrl;
      a.payload.url = `${MEDIA_PUBLIC_BASE}/${filename}`;
      a.payload.stored = true;
      a.payload.stored_at = new Date().toISOString();
      arr[index] = a;
      db.prepare('UPDATE messenger_messages SET attachments = ? WHERE id = ?').run(JSON.stringify(arr), id);

      res.json({ success: true, attachment: a });
    } catch (e) {
      console.error('[messenger] attachment store error:', e.message);
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // Send a reply via Graph API
  app.post('/api/messenger/send', requireAuth, (req, res) => {
    if (!config || !config.pageAccessToken) {
      return res.status(500).json({ success: false, error: 'config-missing' });
    }
    const { psid, text } = req.body || {};
    if (!psid || !text) return res.status(400).json({ success: false, error: 'psid and text required' });
    // Scraped threads cannot be replied to via Graph API (no real PSID).
    if (typeof psid === 'string' && psid.startsWith('scrape:')) {
      return res.status(400).json({ success: false, error: 'scraped-thread-read-only', hint: 'Reply via Messenger / Business Suite directly. This thread has no Graph PSID.' });
    }
    const payload = JSON.stringify({
      recipient: { id: psid },
      messaging_type: 'RESPONSE',
      message: { text },
    });
    const opts = {
      hostname: 'graph.facebook.com',
      path: '/v21.0/me/messages?access_token=' + encodeURIComponent(config.pageAccessToken),
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
    };
    const fbReq = https.request(opts, (fbRes) => {
      let chunks = '';
      fbRes.on('data', (c) => { chunks += c; });
      fbRes.on('end', () => {
        try {
          const db = getDatabase();
          // Use Graph's returned message_id as the row id so the periodic
          // Graph poller doesn't re-insert this message under a different key.
          let id;
          try {
            const parsed = JSON.parse(chunks);
            id = parsed.message_id || ('out-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8));
          } catch {
            id = 'out-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
          }
          db.prepare(`
            INSERT OR IGNORE INTO messenger_messages (id, psid, direction, text, attachments, created_at, raw_json)
            VALUES (?, ?, 'out', ?, NULL, ?, ?)
          `).run(id, psid, text, new Date().toISOString(), chunks);
        } catch (e) { console.error('[messenger] store-out error:', e.message); }
        if (fbRes.statusCode >= 200 && fbRes.statusCode < 300) {
          res.json({ success: true, response: chunks });
        } else {
          res.status(fbRes.statusCode).json({ success: false, error: chunks });
        }
      });
    });
    fbReq.on('error', (e) => res.status(500).json({ success: false, error: e.message }));
    fbReq.write(payload);
    fbReq.end();
  });

  // Kick off background polling of Graph API. Runs a backfill on first start.
  // Delayed slightly so the DB is fully open before the first request.
  setTimeout(() => {
    startGraphPoller(getDatabase).catch((e) => console.error('[messenger-sync] poller crashed:', e.message));
  }, 5000);
}

module.exports = { register };
