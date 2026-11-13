'use strict';
/**
 * vMix Universal Controller server.
 *   node server.js [--port 8790] [--data <dir>] [--vmix host:port] [--drive <dir>] [--osc 9600] [--no-osc] [--open]
 * Pages:   /            start
 *          /control?layout=vertical|horizontal
 *          /master      settings
 *          /remote      iPad / phone remotes
 *          /login       PIN (only when a PIN is set, only for other devices)
 * API:     GET /api/state, GET /api/events (SSE), POST /api/cmd {cmd, args}
 *          GET /osc/<path>?value=[&pin=]  (same routes as OSC on UDP 9600)
 *          GET /api/fb  (feedback values as JSON, for Companion)
 *          POST /api/upload?folder=&name=  (raw file body -> <Drive>\Videos\<folder>)
 *          POST /api/login {pin}, POST /api/pin {pin} and /api/osc-allow {list} (vMix PC only)
 *          GET /api/log  (today's log file)
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const dgram = require('dgram');
const os = require('os');
const crypto = require('crypto');
const { Store } = require('./src/store');
const { Engine } = require('./src/engine');
const { createAuth } = require('./src/auth');
const { flatten, diff } = require('./src/statediff');
const osc = require('./src/osc');
const { slug } = require('./src/features/graphics');

const pkg = require('./package.json');
const args = process.argv.slice(2);
const arg = (name, d) => { const i = args.indexOf('--' + name); return i >= 0 ? args[i + 1] : d; };
const dataDir = path.resolve(arg('data', path.join(__dirname, 'data')));
const store = new Store(dataDir);
if (arg('port')) store.config.port = Number(arg('port'));
if (arg('vmix')) { const [h, p] = arg('vmix').split(':'); store.config.vmix = { ...store.config.vmix, host: h, port: Number(p) || 8088 }; }
if (arg('drive')) store.config.driveRoot = arg('drive');
if (arg('osc')) store.config.oscPort = Number(arg('osc'));
if (arg('ose')) store.config.oseUrl = arg('ose');
const engine = new Engine(store);
const auth = createAuth(store);
engine.cmd('drive.makeFolders', () => engine.makeFolders());

/* A live show must not stop because of one bad callback: log it and keep running. */
process.on('unhandledRejection', (e) => engine.log('ERROR (unhandled): ' + (e && e.stack ? e.stack : e), true));
process.on('uncaughtException', (e) => {
  if (e && e.code === 'EADDRINUSE') return; // handled by server.on('error')
  engine.log('ERROR (uncaught): ' + (e && e.stack ? e.stack : e), true);
});

const PUBLIC = path.join(__dirname, 'public');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.json': 'application/json' };
const PAGES = { '/': 'index.html', '/control': 'control.html', '/link': 'master.html', '/master': 'master.html', '/remote': 'remote.html', '/login': 'login.html' };
const OPEN = new Set(['/login', '/login.html', '/styles.css', '/favicon.ico', '/api/login']); // reachable without the PIN

function send(res, code, body, type = 'application/json', headers = {}) {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store', ...headers });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}
function readBody(req, limit = 1e6) {
  return new Promise((resolve, reject) => {
    let b = ''; req.setEncoding('utf8');
    req.on('data', (d) => { b += d; if (b.length > limit) { reject(new Error('Too big')); req.destroy(); } });
    req.on('end', () => resolve(b)); req.on('error', reject);
  });
}
const json = async (req) => JSON.parse((await readBody(req)) || '{}');

/* ---------- SSE: full state once, then only the parts that changed ---------- */
const clients = new Set();
let base = null; // { state, flat } last state sent to everyone
setInterval(() => {
  if (!clients.size) { base = null; return; }
  const state = engine.state(); const flat = flatten(state);
  const d = base ? diff(base.flat, flat, state) : { full: state };
  base = { state, flat };
  if (!d) return;
  const line = 'data: ' + JSON.stringify(d) + '\n\n';
  for (const res of clients) res.write(line);
}, 150).unref();
setInterval(() => { for (const res of clients) res.write(': ping\n\n'); }, 15000).unref();

/* ---------- feedback for Companion ---------- */
const mmss = (s) => Math.floor((s || 0) / 60) + ':' + String(Math.floor(s || 0) % 60).padStart(2, '0');
function feedback() {
  const s = engine.state(); const fb = {};
  for (const g of s.graphics.items) fb['/fb/gfx/' + g.id + '/onair'] = g.onAir ? 1 : 0;
  fb['/fb/music/playing'] = s.music.playing ? 1 : 0;
  fb['/fb/music/song'] = s.music.now || '';
  fb['/fb/music/remaining'] = mmss(s.music.remaining);
  fb['/fb/music/next'] = s.music.next || '';
  fb['/fb/music/level'] = s.music.level;
  fb['/fb/ads/phase'] = s.ads.phase;
  fb['/fb/ads/countdown'] = s.ads.phase === 'count' ? s.ads.count : 0;
  fb['/fb/ads/current'] = s.ads.timer ? s.ads.timer.name : '';
  fb['/fb/ads/adleft'] = s.ads.timer ? mmss(s.ads.timer.adLeft) : '';
  fb['/fb/ads/remaining'] = s.ads.timer ? mmss(s.ads.timer.breakLeft) : '';
  fb['/fb/video/now'] = s.videos.now || '';
  fb['/fb/video/remaining'] = mmss(s.videos.remaining);
  fb['/fb/video/playing'] = s.videos.running ? 1 : 0;
  for (const c of s.mixer.channels) fb['/fb/mix/' + slug(c.name) + '/mode'] = c.mode;
  fb['/fb/rec'] = s.tally && s.tally.recording ? 1 : 0;
  fb['/fb/rec/time'] = s.tally ? mmss(s.tally.recordingDuration) : '';
  fb['/fb/stream'] = s.tally && s.tally.streaming ? 1 : 0;
  fb['/fb/health/ok'] = s.health.ok ? 1 : 0;
  fb['/fb/youtube/live'] = s.youtube.live ? 1 : 0;
  fb['/fb/youtube/viewers'] = s.youtube.viewers ?? 0;
  fb['/fb/mix/selected'] = s.mixer.selected || '';
  const selCh = s.mixer.channels.find((c) => c.name === s.mixer.selected);
  fb['/fb/mix/selected/level'] = selCh ? selCh.volume : 0;
  return fb;
}

/* ---------- uploads (never overwrite, never leave half files behind) ---------- */
function upload(req, res, u) {
  const videos = engine.features.videos;
  const folder = u.searchParams.get('folder'); const name = u.searchParams.get('name');
  let target;
  try { target = videos.uploadTarget(folder, name); } catch (e) { return send(res, 400, { ok: false, error: e.message }); }
  const tmp = target + '.' + crypto.randomBytes(4).toString('hex') + '.uploading';
  const out = fs.createWriteStream(tmp);
  let done = false;
  const fail = (code, msg) => {
    if (done) return; done = true;
    out.destroy(); fs.rm(tmp, { force: true }, () => {});
    engine.log('Upload of ' + path.basename(target) + ' failed: ' + msg);
    if (!res.headersSent && !res.writableEnded) send(res, code, { ok: false, error: msg });
  };
  req.on('close', () => { if (!req.complete) fail(400, 'Upload cancelled'); });
  req.on('error', (e) => fail(400, e.message));
  out.on('error', (e) => fail(500, e.message));
  out.on('finish', async () => {
    if (done) return; done = true;
    try {
      // another upload may have taken the name meanwhile: pick a free one again
      const final = fs.existsSync(target) ? videos.uploadTarget(folder, name) : target;
      fs.renameSync(tmp, final);
      engine.log('Uploaded ' + path.basename(final));
      await videos.rescan();
      send(res, 200, { ok: true, file: path.basename(final) });
    } catch (e) {
      fs.rm(tmp, { force: true }, () => {});
      send(res, 500, { ok: false, error: e.message });
    }
  });
  req.pipe(out);
}

/* ---------- HTTP ---------- */
async function handle(req, res) {
  const u = new URL(req.url, 'http://x');
  const p = u.pathname;
  try {
    if (!auth.hostOk(req)) return send(res, 403, 'Open this page with the PC\'s IP address (shown in the black window).', 'text/plain; charset=utf-8');
    const mutating = req.method === 'POST' || p.startsWith('/osc/');
    if (mutating && auth.crossSite(req)) return send(res, 403, { ok: false, error: 'Blocked: request came from another website' });
    if (!OPEN.has(p) && !auth.allowed(req, p.startsWith('/osc/') ? u.searchParams.get('pin') : null)) {
      if (p.startsWith('/api/') || p.startsWith('/osc/')) return send(res, 401, { ok: false, error: 'PIN needed', login: '/login' });
      return send(res, 302, '', 'text/plain', { Location: '/login?next=' + encodeURIComponent(p + u.search) });
    }

    if (p === '/api/login' && req.method === 'POST') {
      const r = auth.login(req, (await json(req)).pin);
      return send(res, r.ok ? 200 : 401, { ok: r.ok, error: r.error }, 'application/json', r.cookie ? { 'Set-Cookie': r.cookie } : {});
    }
    if ((p === '/api/pin' || p === '/api/osc-allow') && req.method === 'POST') {
      if (!auth.isLocal(req)) return send(res, 403, { ok: false, error: 'Security settings can only be changed on the vMix PC itself' });
      const body = await json(req);
      const r = p === '/api/pin' ? auth.setPin(body.pin) : auth.setOscAllow(body.list);
      if (r.ok) { engine.log(p === '/api/pin' ? (body.pin ? 'PIN set: other devices must sign in again' : 'PIN turned off') : 'OSC allow list saved'); engine.changed(); }
      return send(res, r.ok ? 200 : 400, r);
    }
    if (p === '/api/state') return send(res, 200, engine.state());
    if (p === '/api/events') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
      res.write('retry: 1000\n\n');
      // start from the same baseline the next patch is computed against
      if (!base) { const st = engine.state(); base = { state: st, flat: flatten(st) }; }
      res.write('data: ' + JSON.stringify({ full: base.state }) + '\n\n');
      clients.add(res); req.on('close', () => clients.delete(res));
      return;
    }
    if (p === '/api/cmd' && req.method === 'POST') {
      const body = await json(req);
      const r = await engine.run(body.cmd, body.args || {});
      return send(res, r.ok ? 200 : 400, r);
    }
    if (p === '/api/fb') return send(res, 200, feedback());
    if (p === '/api/log') {
      const f = engine.logFile();
      if (!fs.existsSync(f)) return send(res, 404, 'No log yet today', 'text/plain');
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Content-Disposition': `attachment; filename="${path.basename(f)}"`, 'Cache-Control': 'no-store' });
      return fs.createReadStream(f).pipe(res);
    }
    if (p.startsWith('/osc/')) {
      const raw = u.searchParams.get('value');
      const qa = u.searchParams.has('value') ? [isNaN(Number(raw)) || raw === '' ? raw : Number(raw)] : [];
      const r = osc.route(p.slice(4), qa);
      if (!r) return send(res, 404, { ok: false, error: 'Unknown OSC path' });
      return send(res, 200, await engine.run(r[0], r[1]));
    }
    if (p === '/api/thumb') {
      const file = u.searchParams.get('path') || '';
      const t = engine.media.thumbPath(file);
      if (!fs.existsSync(t)) return send(res, 404, 'no thumb', 'text/plain');
      res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Cache-Control': 'max-age=3600' });
      return fs.createReadStream(t).pipe(res);
    }
    if (p === '/api/upload' && req.method === 'POST') return upload(req, res, u);
    // static
    let file = PAGES[p] || p;
    file = path.normalize(path.join(PUBLIC, file));
    if (!file.startsWith(PUBLIC + path.sep)) return send(res, 403, 'forbidden', 'text/plain');
    fs.readFile(file, (err, data) => {
      if (err) return send(res, 404, 'Not found', 'text/plain');
      send(res, 200, data, TYPES[path.extname(file)] || 'application/octet-stream');
    });
  } catch (e) {
    send(res, 500, { ok: false, error: e.message });
  }
}

const server = http.createServer(handle);
server.listen(store.config.port, () => {
  const ips = Object.values(os.networkInterfaces()).flat().filter((n) => n && n.family === 'IPv4' && !n.internal).map((n) => n.address);
  console.log('vMix Universal Controller ' + pkg.version + ' running');
  console.log('  This PC:     http://localhost:' + store.config.port + '/');
  for (const ip of ips) console.log('  On network:  http://' + ip + ':' + store.config.port + '/' + (auth.enabled() ? '   (PIN required)' : ''));
  console.log('  vMix:        ' + store.config.vmix.host + ':' + store.config.vmix.port);
  console.log('  Companion:   OSC UDP ' + store.config.oscPort + '   (or HTTP GET /osc/...)');
  console.log('  Data:        ' + dataDir);
  console.log('  Log file:    ' + engine.logFile());
  console.log('Leave this window open while you are on air.');
  engine.log('Started version ' + pkg.version + ' on port ' + store.config.port);
  if (args.includes('--open')) {
    const url = 'http://localhost:' + store.config.port + '/';
    const { spawn } = require('child_process');
    const o = process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]] : process.platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]];
    try { const c = spawn(o[0], o[1], { stdio: 'ignore', detached: true }); c.on('error', () => {}); c.unref(); } catch { /* no browser */ }
  }
});
server.on('error', (e) => { console.log(e.code === 'EADDRINUSE' ? 'Port ' + store.config.port + ' is busy: is vMix Universal Controller already running?' : e.message); process.exit(1); });
engine.start();

/* ---------- OSC (UDP) ---------- */
if (!args.includes('--no-osc')) {
  const sock = dgram.createSocket({ type: 'udp4', reuseAddr: true });
  sock.on('message', async (msg, rinfo) => {
    if (!auth.oscAllowed(rinfo.address)) return;
    try {
      for (const m of osc.decode(msg)) {
        const r = osc.route(m.address, m.args);
        if (r) await engine.run(r[0], r[1]); else engine.log('Unknown OSC ' + m.address);
      }
    } catch (e) { engine.log('Bad OSC packet: ' + e.message); }
  });
  sock.on('error', (e) => console.log('OSC port ' + store.config.oscPort + ' not available: ' + e.message));
  sock.bind(store.config.oscPort);
  // feedback: send changed values to Companion
  let lastFb = {}; let lastFull = 0;
  setInterval(() => {
    const t = store.config.oscFeedback; if (!t || !t.host || !t.port) return;
    const fb = feedback(); const full = Date.now() - lastFull > 5000; if (full) lastFull = Date.now();
    for (const [k, v] of Object.entries(fb)) {
      if (!full && lastFb[k] === v) continue;
      sock.send(osc.encode(k, [v]), t.port, t.host);
    }
    lastFb = fb;
  }, 250).unref();
}

/* Save before exit. SIGHUP = the console window was closed on Windows; SIGBREAK = Ctrl+Break. */
let stopping = false;
function shutdown() {
  if (stopping) return; stopping = true;
  try { engine.log('Stopping'); engine.save(true); engine.media.flush(); } finally { setTimeout(() => process.exit(0), 200); }
}
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP', 'SIGBREAK']) { try { process.on(sig, shutdown); } catch { /* not on this OS */ } }

module.exports = { server, engine };
