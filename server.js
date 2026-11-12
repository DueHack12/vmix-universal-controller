'use strict';
/**
 * Broadcast Console server.
 *   node server.js [--port 8790] [--data <dir>] [--vmix host:port] [--no-osc]
 * Pages:   /            start
 *          /control?layout=vertical|horizontal
 *          /link        Link to vMix + settings
 * API:     GET /api/state, GET /api/events (SSE), POST /api/cmd {cmd, args}
 *          GET /osc/<path>?value=  (same routes as OSC on UDP 9600)
 *          GET /api/fb  (feedback values as JSON, for Companion)
 *          POST /api/upload?folder=&name=  (raw file body -> <Drive>\Videos\<folder>)
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const dgram = require('dgram');
const os = require('os');
const { Store } = require('./src/store');
const { Engine } = require('./src/engine');
const osc = require('./src/osc');
const { slug } = require('./src/features/graphics');

const args = process.argv.slice(2);
const arg = (name, d) => { const i = args.indexOf('--' + name); return i >= 0 ? args[i + 1] : d; };
const dataDir = path.resolve(arg('data', path.join(__dirname, 'data')));
const store = new Store(dataDir);
if (arg('port')) store.config.port = Number(arg('port'));
if (arg('vmix')) { const [h, p] = arg('vmix').split(':'); store.config.vmix = { host: h, port: Number(p) || 8088 }; }
if (arg('drive')) store.config.driveRoot = arg('drive');
if (arg('osc')) store.config.oscPort = Number(arg('osc'));
if (arg('ose')) store.config.oseUrl = arg('ose');
const engine = new Engine(store);
engine.makeFolders = engine.makeFolders.bind(engine);
engine.cmd('drive.makeFolders', () => engine.makeFolders());

const PUBLIC = path.join(__dirname, 'public');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.json': 'application/json' };
const PAGES = { '/': 'index.html', '/control': 'control.html', '/link': 'master.html', '/master': 'master.html', '/remote': 'remote.html' };

function send(res, code, body, type = 'application/json') {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}
function readBody(req, limit = 1e6) {
  return new Promise((resolve, reject) => {
    let b = ''; req.setEncoding('utf8');
    req.on('data', (d) => { b += d; if (b.length > limit) { reject(new Error('Too big')); req.destroy(); } });
    req.on('end', () => resolve(b)); req.on('error', reject);
  });
}

/* ---------- SSE ---------- */
const clients = new Set();
let lastJson = '';
setInterval(() => {
  if (!clients.size) return;
  const json = JSON.stringify(engine.state());
  if (json === lastJson) return;
  lastJson = json;
  for (const res of clients) res.write('data: ' + json + '\n\n');
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

/* ---------- HTTP ---------- */
async function handle(req, res) {
  const u = new URL(req.url, 'http://x');
  const p = u.pathname;
  try {
    if (p === '/api/state') return send(res, 200, engine.state());
    if (p === '/api/events') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
      res.write('retry: 1000\n\n');
      res.write('data: ' + JSON.stringify(engine.state()) + '\n\n');
      clients.add(res); req.on('close', () => clients.delete(res));
      return;
    }
    if (p === '/api/cmd' && req.method === 'POST') {
      const body = JSON.parse((await readBody(req)) || '{}');
      const r = await engine.run(body.cmd, body.args || {});
      return send(res, r.ok ? 200 : 400, r);
    }
    if (p === '/api/fb') return send(res, 200, feedback());
    if (p.startsWith('/osc/')) {
      const qa = u.searchParams.has('value') ? [isNaN(Number(u.searchParams.get('value'))) ? u.searchParams.get('value') : Number(u.searchParams.get('value'))] : [];
      const r = osc.route(p.slice(4), qa);
      if (!r) return send(res, 404, { ok: false, error: 'Unknown OSC path' });
      return send(res, 200, await engine.run(r[0], r[1]));
    }
    if (p.startsWith('/api/snap/')) {
      const name = p.slice(10).replace(/[^a-z]/g, '');
      const f = engine.features.previews.file(name);
      if (!fs.existsSync(f)) return send(res, 404, 'no snapshot', 'text/plain');
      res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Cache-Control': 'no-store' });
      return fs.createReadStream(f).pipe(res);
    }
    if (p === '/api/thumb') {
      const file = u.searchParams.get('path') || '';
      const t = engine.media.thumbPath(file);
      if (!fs.existsSync(t)) return send(res, 404, 'no thumb', 'text/plain');
      res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Cache-Control': 'max-age=3600' });
      return fs.createReadStream(t).pipe(res);
    }
    if (p === '/api/upload' && req.method === 'POST') {
      const target = engine.features.videos.uploadTarget(u.searchParams.get('folder'), u.searchParams.get('name'));
      const tmp = target + '.uploading';
      const out = fs.createWriteStream(tmp);
      req.pipe(out);
      out.on('finish', async () => { fs.renameSync(tmp, target); engine.log('Uploaded ' + path.basename(target)); await engine.features.videos.rescan(); send(res, 200, { ok: true, file: path.basename(target) }); });
      out.on('error', (e) => send(res, 500, { ok: false, error: e.message }));
      return;
    }
    // static
    let file = PAGES[p] || p;
    file = path.normalize(path.join(PUBLIC, file));
    if (!file.startsWith(PUBLIC)) return send(res, 403, 'forbidden', 'text/plain');
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
  console.log('Broadcast Console running');
  console.log('  This PC:     http://localhost:' + store.config.port + '/');
  for (const ip of ips) console.log('  On network:  http://' + ip + ':' + store.config.port + '/');
  console.log('  vMix:        ' + store.config.vmix.host + ':' + store.config.vmix.port);
  console.log('  Companion:   OSC UDP ' + store.config.oscPort + '   (or HTTP GET /osc/...)');
  console.log('  Data:        ' + dataDir);
  if (args.includes('--open')) {
    const url = 'http://localhost:' + store.config.port + '/';
    const { spawn } = require('child_process');
    const o = process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]] : process.platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]];
    try { const c = spawn(o[0], o[1], { stdio: 'ignore', detached: true }); c.on('error', () => {}); c.unref(); } catch { /* no browser */ }
  }
});
server.on('error', (e) => { console.log(e.code === 'EADDRINUSE' ? 'Port ' + store.config.port + ' is busy: is Broadcast Console already running?' : e.message); process.exit(1); });
engine.start();

/* ---------- OSC (UDP) ---------- */
if (!args.includes('--no-osc')) {
  const sock = dgram.createSocket({ type: 'udp4', reuseAddr: true });
  sock.on('message', async (msg) => {
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

function shutdown() { engine.save(true); engine.media.flush(); process.exit(0); }
process.on('SIGINT', shutdown); process.on('SIGTERM', shutdown);

module.exports = { server, engine };
