'use strict';
/**
 * The HTTP server as a separate process (like on the vMix PC) against test/mock-vmix.js:
 * uploads, cross-site and host checks, show rename, live state patches, PIN endpoints.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');
const mock = require('./mock-vmix');
const { apply } = require('../src/statediff');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let vmix; let proc; let port; let tmp; let drive;

function req(method, p, { body, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const r = http.request({ host: '127.0.0.1', port, path: p, method, headers }, (res) => {
      let b = ''; res.setEncoding('utf8'); res.on('data', (d) => (b += d));
      res.on('end', () => { let j = null; try { j = JSON.parse(b); } catch { /* text */ } resolve({ status: res.statusCode, headers: res.headers, body: b, json: j }); });
    });
    r.on('error', reject);
    if (body !== undefined) r.write(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
    r.end();
  });
}
const cmd = (c, args, headers = {}) => req('POST', '/api/cmd', { body: { cmd: c, args }, headers: { 'Content-Type': 'application/json', ...headers } });

test.before(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vuc-server-'));
  drive = path.join(tmp, 'drive');
  fs.mkdirSync(path.join(drive, 'Videos', 'Highlights'), { recursive: true });
  mock.reset();
  vmix = mock.createServer(); await new Promise((r) => vmix.listen(0, r));
  port = 20000 + Math.floor(Math.random() * 20000);
  proc = spawn(process.execPath, [path.join(__dirname, '..', 'server.js'), '--port', String(port), '--data', path.join(tmp, 'data'), '--vmix', '127.0.0.1:' + vmix.address().port, '--drive', drive, '--no-osc'], { stdio: 'ignore' });
  for (let i = 0; i < 100; i++) { try { if ((await req('GET', '/api/state')).status === 200) return; } catch { /* starting */ } await sleep(100); }
  throw new Error('server did not start');
});
test.after(() => { proc.kill(); vmix.closeAllConnections(); vmix.close(); });

test('upload: cannot leave the Videos folders, only video files, no overwrite', async () => {
  let r = await req('POST', '/api/upload?folder=' + encodeURIComponent('../../escaped') + '&name=evil.bat', { body: 'x' });
  assert.equal(r.status, 400);
  r = await req('POST', '/api/upload?folder=' + encodeURIComponent('..\\..\\escaped') + '&name=clip.mp4', { body: 'x' });
  assert.equal(r.status, 400);
  assert.ok(!fs.existsSync(path.join(tmp, 'escaped')) && !fs.existsSync(path.join(drive, 'escaped')), 'nothing written outside');
  r = await req('POST', '/api/upload?folder=Highlights&name=evil.bat', { body: 'x' });
  assert.equal(r.status, 400); assert.match(r.json.error, /Only video files/);
  r = await req('POST', '/api/upload?folder=Highlights&name=' + encodeURIComponent('..\\..\\goal.mp4'), { body: 'x' });
  assert.equal(r.status, 200); assert.equal(r.json.file, 'goal.mp4');
  r = await req('POST', '/api/upload?folder=Highlights&name=goal.mp4', { body: 'y' });
  assert.equal(r.json.file, 'goal (2).mp4');
  assert.equal(fs.readFileSync(path.join(drive, 'Videos', 'Highlights', 'goal.mp4'), 'utf8'), 'x', 'first file kept');
});

test('upload: a cancelled upload leaves no half file behind', async () => {
  await new Promise((resolve) => {
    const r = http.request({ host: '127.0.0.1', port, path: '/api/upload?folder=Highlights&name=half.mp4', method: 'POST', headers: { 'Content-Length': 1000000 } });
    r.on('error', () => resolve());
    r.write(Buffer.alloc(1000));
    setTimeout(() => { r.destroy(); resolve(); }, 200);
  });
  await sleep(300);
  const left = fs.readdirSync(path.join(drive, 'Videos', 'Highlights'));
  assert.ok(!left.some((f) => f.includes('half')), 'no leftovers: ' + left.join(', '));
});

test('requests from another website are refused; our own pages and Companion work', async () => {
  let r = await req('POST', '/api/cmd', { body: '{"cmd":"show.save"}', headers: { 'Content-Type': 'text/plain', Origin: 'http://evil.example' } });
  assert.equal(r.status, 403);
  r = await req('GET', '/osc/console/rec', { headers: { 'Sec-Fetch-Site': 'cross-site' } });
  assert.equal(r.status, 403);
  r = await cmd('show.save', {}, { Origin: 'http://127.0.0.1:' + port, 'Sec-Fetch-Site': 'same-origin' });
  assert.equal(r.status, 200);
  r = await req('GET', '/osc/console/music/fade/in'); // Companion: no browser headers
  assert.notEqual(r.status, 403);
});

test('pages must be opened by IP, localhost or computer name (DNS rebinding)', async () => {
  let r = await req('GET', '/api/state', { headers: { Host: 'attacker.example:' + port } });
  assert.equal(r.status, 403);
  r = await req('GET', '/', { headers: { Host: 'localhost:' + port } });
  assert.equal(r.status, 200);
  r = await req('GET', '/', { headers: { Host: os.hostname() + ':' + port } });
  assert.equal(r.status, 200);
});

test('show rename: same name or only capitals keeps the show; never overwrites another', async () => {
  const shows = path.join(tmp, 'data', 'shows');
  await cmd('show.save', {});
  const name = JSON.parse((await req('GET', '/api/state')).body).show.name;
  let r = await cmd('show.rename', { name });
  assert.equal(r.status, 200);
  assert.ok(fs.readdirSync(shows).includes(name + '.json'), 'still saved after renaming to the same name');
  r = await cmd('show.rename', { name: name.toUpperCase() });
  assert.deepEqual(fs.readdirSync(shows).filter((f) => f.toLowerCase() === name.toLowerCase() + '.json'), [name.toUpperCase() + '.json']);
  await cmd('show.new', { name: 'Soccer' });
  r = await cmd('show.rename', { name: 'soccer ' });
  assert.equal(r.status, 200, 'renaming the current show to its own name in other capitals is fine');
  await cmd('show.new', { name: 'Football' });
  r = await cmd('show.rename', { name: 'SOCCER' });
  assert.equal(r.status, 400); assert.match(r.json.error, /already exists/);
  r = await cmd('show.new', { name: 'football' });
  assert.equal(r.status, 400, 'new show cannot replace an existing one');
  assert.ok(fs.readdirSync(shows).includes('soccer.json'));
});

test('live state: one full message, then only changes, which add up to the real state', async () => {
  const msgs = await new Promise((resolve) => {
    const got = [];
    const r = http.get({ host: '127.0.0.1', port, path: '/api/events' }, (res) => {
      let buf = '';
      res.setEncoding('utf8');
      res.on('data', (d) => { buf += d; let i; while ((i = buf.indexOf('\n\n')) >= 0) { const chunk = buf.slice(0, i); buf = buf.slice(i + 2); const line = chunk.split('\n').find((l) => l.startsWith('data: ')); if (line) got.push(JSON.parse(line.slice(6))); } });
    });
    setTimeout(async () => { await cmd('music.level', { value: 37 }); }, 300);
    setTimeout(() => { r.destroy(); resolve(got); }, 1200);
  });
  assert.ok(msgs[0].full && msgs[0].full.music, 'first message is the full state');
  assert.ok(msgs.length > 1, 'patches follow');
  assert.ok(msgs.slice(1).every((m) => !m.full && (m.set || m.merge)), 'later messages are patches');
  let s = null; for (const m of msgs) s = apply(s, m);
  assert.equal(s.music.level, 37);
  const real = JSON.parse((await req('GET', '/api/state')).body);
  assert.deepEqual(Object.keys(s).sort(), Object.keys(real).sort());
  assert.equal(s.show.name, real.show.name);
});

test('security settings: only from this PC, PIN must be digits; log file download', async () => {
  let r = await req('POST', '/api/pin', { body: { pin: 'abc' }, headers: { 'Content-Type': 'application/json' } });
  assert.equal(r.status, 400);
  r = await req('POST', '/api/pin', { body: { pin: '2468' }, headers: { 'Content-Type': 'application/json' } });
  assert.equal(r.status, 200);
  r = await req('GET', '/api/state');
  assert.equal(r.status, 200, 'this PC never needs the PIN');
  assert.equal(r.json.config.pin, true);
  assert.ok(!r.body.includes('2468'), 'the PIN is never sent to pages');
  r = await req('POST', '/api/osc-allow', { body: { list: 'not-an-ip' }, headers: { 'Content-Type': 'application/json' } });
  assert.equal(r.status, 400);
  await req('POST', '/api/pin', { body: { pin: '' }, headers: { 'Content-Type': 'application/json' } });
  r = await req('GET', '/api/log');
  assert.equal(r.status, 200); assert.match(r.body, /Started version/);
});
