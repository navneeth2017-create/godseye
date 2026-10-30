#!/usr/bin/env node
/**
 * The door in front of God's View, for Jarvis (navneeth2017-create/jarvis).
 *
 * God's View is a local-first dev server ("not a hardened production service", SECURITY.md), so on Railway it runs
 * on 127.0.0.1 inside the container and this gate is the only thing the internet reaches. Nobody gets past it without
 * the Jarvis key: Jarvis's console POSTs the key to /__jarvis (or you type it on the page there), the gate asks Jarvis
 * whether that key opens it, and on yes hands back a signed session cookie (30 days) and sends you on to the view
 * Jarvis asked for (#lat=…&lon=…&l=… — God's View's own share link).
 *
 * Proxying keeps the Host header (God's View allows it through GEV_ALLOWED_HOSTS) and drops the X-Forwarded-*
 * headers Railway adds, so God's View sees one trusted local browser — which also lets POWER UP → Provider Settings
 * take API keys from you once you're in.
 *
 * Env: PORT (Railway), JARVIS_URL (default https://jarvis7.up.railway.app), GATE_SECRET (signs sessions; set it so
 * sessions survive a restart), GATE_HOSTS (extra public hostnames, comma separated), GEV_INNER_PORT (default 4174).
 */
import http from 'node:http';
import fs from 'node:fs';
import net from 'node:net';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';

const PORT = Number.parseInt(process.env.PORT, 10) || 8080;
const INNER = Number.parseInt(process.env.GEV_INNER_PORT, 10) || 4174;
const JARVIS = String(process.env.JARVIS_URL || 'https://jarvis7.up.railway.app').replace(/\/+$/, '');
const SECRET = process.env.GATE_SECRET || crypto.randomBytes(32).toString('hex');
const DAYS = Number.parseInt(process.env.GATE_SESSION_DAYS, 10) || 30;
const COOKIE = 'gv_gate';
const HOSTS = [process.env.RAILWAY_PUBLIC_DOMAIN, ...String(process.env.GATE_HOSTS || '').split(',')].map((h) => String(h || '').trim()).filter(Boolean);
if (!process.env.GATE_SECRET) console.warn('gate: GATE_SECRET is not set — sessions end when the container restarts');

// ── God's View itself, on loopback only ─────────────────────────────────────────────────────────────────────────────
// GATE_INNER_SCRIPT is only for testing the gate against a stand-in
const child = spawn(process.execPath, [process.env.GATE_INNER_SCRIPT || 'scripts/docker-start.mjs'], {
  stdio: 'inherit',
  env: { ...process.env, HOST: '127.0.0.1', PORT: String(INNER), GEV_ALLOWED_HOSTS: HOSTS.join(','), GEV_KEY_SETUP_TRUSTED_PEERS: 'none' },
});
child.on('exit', (code, sig) => { console.error(`gate: God's View exited (${code ?? sig}) — stopping so Railway restarts us`); process.exit(code || 1); });
for (const s of ['SIGTERM', 'SIGINT']) process.on(s, () => { child.kill(s); process.exit(0); });

// ── sessions ────────────────────────────────────────────────────────────────────────────────────────────────────────
const sign = (v) => crypto.createHmac('sha256', SECRET).update(v).digest('base64url');
const newSession = () => { const exp = String(Date.now() + DAYS * 86400000); return `${exp}.${sign(exp)}`; };
function sessionOk(req) {
  const m = String(req.headers.cookie || '').match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`));
  if (!m) return false;
  const [exp, sig] = m[1].split('.');
  if (!exp || !sig || !(Number(exp) > Date.now())) return false;
  const want = sign(exp);
  return sig.length === want.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(want));
}
// Jarvis decides whether a key is the key: /voice answers 200 only with it. A yes is remembered (hashed) for 10
// minutes; wrong guesses are limited per address.
const goodKeys = new Map(), misses = new Map();
async function keyOk(key) {
  if (!key || key.length > 512) return false;
  const h = crypto.createHash('sha256').update(key).digest('hex');
  const seen = goodKeys.get(h); if (seen && seen > Date.now()) return true;
  try {
    const r = await fetch(`${JARVIS}/voice`, { headers: { authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(8000) });
    if (r.ok) { goodKeys.set(h, Date.now() + 10 * 60000); return true; }
  } catch (e) { console.warn('gate: could not reach Jarvis to check the key:', e.message); }
  return false;
}
const clientIp = (req) => String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
function tooMany(ip) {
  const now = Date.now(), list = (misses.get(ip) || []).filter((t) => now - t < 10 * 60000);
  misses.set(ip, list); return list.length >= 8;
}
// where to go after the door: God's View's share hash only (#lat=…&l=…), never another site
const safeTo = (to) => (/^#[A-Za-z0-9=&.,:%+_-]{0,600}$/.test(String(to || '')) ? String(to) : '');

// ── pages ───────────────────────────────────────────────────────────────────────────────────────────────────────────
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function doorPage(res, { status = 200, msg = '', to = '' } = {}) {
  res.writeHead(status, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-frame-options': 'DENY' });
  res.end(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>God's View</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#05070d;color:#cfe8ff;font:16px/1.5 ui-monospace,Menlo,monospace}
form{width:min(360px,calc(100vw - 32px));padding:28px;border:1px solid #1f3b57;border-radius:14px;background:#0a1220}h1{font-size:18px;letter-spacing:.2em;margin:0 0 6px}
p{margin:0 0 18px;color:#7fa3c4;font-size:13px}input,button{width:100%;box-sizing:border-box;padding:12px;border-radius:10px;font:inherit}
input{background:#05070d;color:#cfe8ff;border:1px solid #1f3b57;margin-bottom:12px}button{background:#1f3b57;color:#cfe8ff;border:0;font-weight:700;cursor:pointer}.err{color:#fca5a5}
.j{display:block;text-align:center;padding:14px;border-radius:10px;background:#38bdf8;color:#05070d;font-weight:700;text-decoration:none}.or{margin:16px 0 10px;text-align:center}</style></head>
<body><form method="post" action="/__jarvis"><h1>GOD'S VIEW</h1><p class="${msg ? 'err' : ''}">${esc(msg || 'Locked to your Jarvis.')}</p>
<a class="j" href="${esc(`${JARVIS}/console?world=${encodeURIComponent(to || '#')}`)}">Open with Jarvis</a>
<p class="or">or enter your Jarvis key</p>
<input type="password" name="key" placeholder="Jarvis key" autocomplete="current-password" required><input type="hidden" name="to" value="${esc(to)}">
<button>Enter</button></form></body></html>`);
}
function startingPage(res) {
  res.writeHead(503, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'retry-after': '10' });
  res.end('<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="8"><title>Starting…</title><body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#05070d;color:#cfe8ff;font:16px ui-monospace,monospace">God\'s View is starting up — this page refreshes itself.</body>');
}
function readForm(req) {
  return new Promise((resolve) => {
    let b = ''; req.on('data', (d) => { b += d; if (b.length > 4096) req.destroy(); });
    req.on('end', () => resolve(Object.fromEntries(new URLSearchParams(b))));
    req.on('error', () => resolve({}));
  });
}

const GO_JS = fs.readFileSync(new URL('./jarvis-go.js', import.meta.url), 'utf8');
const BACK = `<script src="/__jarvis-go.js" defer></script><a id="jarvis-back" href="${esc(JARVIS)}/console" title="Back to Jarvis" style="position:fixed;left:14px;bottom:14px;z-index:2147483000;display:inline-flex;align-items:center;gap:6px;padding:9px 14px;border-radius:999px;background:rgba(5,7,13,.88);border:1px solid #1f3b57;color:#cfe8ff;font:600 14px/1 ui-monospace,Menlo,monospace;letter-spacing:.08em;text-decoration:none;backdrop-filter:blur(6px)">&larr; JARVIS</a>`;

// ── the proxy ───────────────────────────────────────────────────────────────────────────────────────────────────────
const HOP = new Set(['connection', 'keep-alive', 'proxy-connection', 'transfer-encoding', 'te', 'trailer', 'upgrade', 'forwarded', 'x-real-ip', 'cf-connecting-ip', 'true-client-ip']);
function innerHeaders(req) {
  const h = {};
  for (const [k, v] of Object.entries(req.headers)) if (!HOP.has(k) && !k.startsWith('x-forwarded-') && !k.startsWith('x-railway-')) h[k] = v;
  // Railway ends TLS before us and God's View speaks plain http, so a same-origin Origin (https://host) would
  // read as cross-origin to it: hand it the http form of our own origin.
  if (h.origin && h.host && h.origin === `https://${h.host}`) h.origin = `http://${h.host}`;
  // God's View never sees the gate's cookie
  if (h.cookie) { h.cookie = String(h.cookie).split(/;\s*/).filter((c) => !c.startsWith(`${COOKIE}=`)).join('; '); if (!h.cookie) delete h.cookie; }
  return h;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://gate');
  if (url.pathname === '/__health') { res.writeHead(200, { 'content-type': 'text/plain' }); return res.end('ok'); }
  if (url.pathname === '/__jarvis') {
    if (req.method === 'GET') return doorPage(res, { to: safeTo(url.searchParams.get('to')) });
    if (req.method !== 'POST') { res.writeHead(405); return res.end(); }
    const ip = clientIp(req);
    if (tooMany(ip)) return doorPage(res, { status: 429, msg: 'Too many tries. Wait ten minutes.' });
    const form = await readForm(req);
    const to = safeTo(form.to);
    if (!(await keyOk(String(form.key || '')))) { misses.get(ip)?.push(Date.now()) ?? misses.set(ip, [Date.now()]); return doorPage(res, { status: 401, msg: "That key doesn't open Jarvis.", to }); }
    res.writeHead(303, { location: `/${to}`, 'cache-control': 'no-store',
      'set-cookie': `${COOKIE}=${newSession()}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${DAYS * 86400}` });
    return res.end();
  }
  if (url.pathname === '/__logout') { res.writeHead(303, { location: '/__jarvis', 'set-cookie': `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0` }); return res.end(); }
  if (!sessionOk(req)) {
    if (req.method === 'GET' && /text\/html/.test(String(req.headers.accept || ''))) { res.writeHead(302, { location: '/__jarvis', 'cache-control': 'no-store' }); return res.end(); }
    res.writeHead(401, { 'content-type': 'application/json' }); return res.end('{"error":"open God\'s View from Jarvis"}');
  }
  // pages get a "← Jarvis" button; ask for them uncompressed so it can be added
  const page = req.method === 'GET' && /text\/html/.test(String(req.headers.accept || ''));
  const headers = innerHeaders(req);
  if (page) headers['accept-encoding'] = 'identity';
  if (url.pathname === '/__jarvis-go.js') { res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-cache' }); return res.end(GO_JS); }
  const up = http.request({ host: '127.0.0.1', port: INNER, method: req.method, path: req.url, headers }, (r) => {
    if (!page || !/text\/html/.test(String(r.headers['content-type'] || ''))) { res.writeHead(r.statusCode || 502, r.headers); return r.pipe(res); }
    const chunks = [];
    r.on('data', (c) => chunks.push(c));
    r.on('end', () => {
      const html = Buffer.concat(chunks).toString('utf8');
      const out = html.includes('</body>') ? html.replace('</body>', `${BACK}</body>`) : html + BACK;
      const h = { ...r.headers }; delete h['content-length']; delete h['content-encoding']; delete h.etag;
      res.writeHead(r.statusCode || 200, h); res.end(out);
    });
    r.on('error', () => res.destroy());
  });
  up.on('error', () => { if (!res.headersSent) startingPage(res); else res.destroy(); });
  req.pipe(up);
});
// websockets (Vite's live connection, live feeds): same door, then a raw pipe
server.on('upgrade', (req, socket, head) => {
  if (!sessionOk(req)) { socket.end('HTTP/1.1 401 Unauthorized\r\n\r\n'); return; }
  const inner = net.connect(INNER, '127.0.0.1', () => {
    const h = innerHeaders(req); h.connection = 'Upgrade'; h.upgrade = req.headers.upgrade;
    inner.write(`${req.method} ${req.url} HTTP/1.1\r\n${Object.entries(h).map(([k, v]) => `${k}: ${v}`).join('\r\n')}\r\n\r\n`);
    if (head && head.length) inner.write(head);
    inner.pipe(socket); socket.pipe(inner);
  });
  inner.on('error', () => socket.destroy()); socket.on('error', () => inner.destroy());
});
server.listen(PORT, '0.0.0.0', () => console.log(`gate: God's View behind the Jarvis key on :${PORT} (inner :${INNER}, hosts ${HOSTS.join(', ') || 'none set'})`));
