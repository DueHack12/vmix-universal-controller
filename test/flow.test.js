'use strict';
/**
 * End-to-end flows: the real engine against test/mock-vmix.js and a demo Drive folder.
 * Needs ffmpeg for the demo media (skips the media tests without it).
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const mock = require('./mock-vmix');
const { Store } = require('../src/store');
const { Engine } = require('../src/engine');

let hasFfmpeg = true; try { execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' }); } catch { hasFfmpeg = false; }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms = 4000) { const t = Date.now(); while (Date.now() - t < ms) { if (await fn()) return true; await sleep(50); } return false; }

let server; let engine; let drive; let data;
const calls = () => mock.state().calls.map((c) => c.fn);
const inputBy = (title) => mock.state().inputs.find((i) => i.title === title);

test.before(async () => {
  data = fs.mkdtempSync(path.join(os.tmpdir(), 'vuc-data-'));
  drive = fs.mkdtempSync(path.join(os.tmpdir(), 'vuc-test-drive-'));
  if (hasFfmpeg) require('../scripts/make-demo-drive').build(drive); else fs.mkdirSync(drive, { recursive: true });
  mock.reset();
  server = mock.createServer();
  await new Promise((r) => server.listen(0, r));
  const store = new Store(data);
  store.config.vmix = { host: '127.0.0.1', port: server.address().port };
  store.config.driveRoot = drive; store.config.pollMs = 50;
  engine = new Engine(store);
  engine.start();
  assert.ok(await until(() => engine.vmix.connected && engine.show.links.ads), 'engine connects and auto-links');
  await sleep(300);
});
test.after(() => { engine.stop(); server.closeAllConnections(); server.close(); setTimeout(() => process.exit(0), 300).unref(); });

test('auto-links jobs to the right inputs', () => {
  const j = Object.fromEntries(engine.state().links.jobs.map((x) => [x.id, x.title]));
  assert.equal(j.music, 'MUSIC'); assert.equal(j.ads, 'ADS'); assert.equal(j.videos, 'VIDEOS'); assert.equal(j.gameCam, 'Cam 1 · Game');
});

test('graphics: take, tally confirmed from vMix, field edit, out', async () => {
  let r = await engine.run('gfx.take', { id: 'genl3' }); assert.ok(r.ok);
  assert.ok(await until(() => engine.state().graphics.items.find((g) => g.id === 'genl3').onAir), 'on air via tally');
  await engine.run('gfx.set', { id: 'genl3', field: 'Top.Text', value: '#1 JOE' });
  assert.equal(inputBy('GenL3.gtzip').fields[0].value, '#1 JOE');
  // a second lower third on the same overlay warns what it replaces
  const ann = engine.state().graphics.items.find((g) => g.id === 'announcers');
  assert.equal(ann.replaces, 'GenL3');
  r = await engine.run('gfx.out', { id: 'genl3' }); assert.ok(r.ok);
  assert.ok(await until(() => !engine.state().graphics.items.find((g) => g.id === 'genl3').onAir));
});

test('mixer: mute, listen, and mute+listen = listen not live', async () => {
  await engine.run('mix.mute', { id: 'Jane' });
  assert.ok(await until(() => engine.state().mixer.channels.find((c) => c.name === 'Jane').mode === 'mute'));
  await engine.run('mix.listen', { id: 'Jane' });
  assert.ok(await until(() => engine.state().mixer.channels.find((c) => c.name === 'Jane').mode === 'mutelisten'));
  const j = inputBy('NDI BRIDGE (Jane)');
  assert.equal(j.muted, false, 'audio on so it can be heard'); assert.equal(j.solo, true); assert.ok(!j.audiobusses.includes('M'), 'off the master bus');
  await engine.run('mix.listen', { id: 'Jane' });
  assert.ok(await until(() => engine.state().mixer.channels.find((c) => c.name === 'Jane').mode === 'mute'));
  assert.ok(inputBy('NDI BRIDGE (Jane)').audiobusses.includes('M'), 'back on master (muted normally)');
  await engine.run('mix.mute', { id: 'Jane' });
  assert.ok(await until(() => engine.state().mixer.channels.find((c) => c.name === 'Jane').mode === 'live'));
  await engine.run('mix.level', { id: 'John', value: 40 });
  assert.equal(inputBy('NDI BRIDGE (John)').volume, 40);
});

test('music: play, level, fade out cues next track, queue', { skip: !hasFfmpeg }, async () => {
  assert.ok(await until(() => engine.state().music.songs.length === 3), 'songs scanned');
  await engine.run('music.fadeTime', { ms: 200 });
  await engine.run('music.toggle');
  assert.ok(await until(() => engine.state().music.playing));
  const first = engine.state().music.now;
  await engine.run('music.level', { value: 75 });
  assert.equal(engine.show.music.level, 75);
  await engine.run('music.after', { value: 'next' });
  await engine.run('music.fadeout');
  assert.ok(await until(() => !engine.state().music.playing && engine.state().music.now !== first), 'stopped with next track loaded');
  assert.equal(inputBy('MUSIC').volume, 75, 'volume restored for the next play');
  // queue + playlist mode: back-to-back in the vMix list
  const songs = engine.state().music.songs;
  await engine.run('music.mode', { value: 'playlist' });
  await engine.run('music.queue', { path: songs[2].path });
  await engine.run('music.play', { path: songs[0].path });
  assert.equal(inputBy('MUSIC').list.length, 2, 'queue handed to vMix');
  await engine.run('music.kill');
  await engine.run('music.after', { value: 'restart' });
  await engine.run('music.mode', { value: 'single' });
});

test('ads: fill, GO countdown, cued to Preview, plays on Program, timers, back to game', { skip: !hasFfmpeg }, async () => {
  assert.ok(await until(() => engine.state().ads.library.length >= 5), 'ad library scanned');
  engine.show.ads.countdown = 1;
  await engine.run('ads.fill', { id: 'q1', seconds: 60 });
  let a = engine.state().ads;
  assert.equal(a.selected, 'q1'); assert.ok(a.items.length >= 2);
  await engine.run('music.play');
  await engine.run('ads.go');
  assert.equal(engine.state().ads.phase, 'count');
  assert.ok(await until(() => engine.state().ads.phase === 'cued', 3000), 'cued after countdown');
  const ads = inputBy('ADS');
  assert.equal(mock.state().preview, ads.number, 'ads in Preview');
  assert.equal(ads.list.length, a.items.length, 'break sent to vMix');
  // director takes it
  mock.state().active = ads.number;
  assert.ok(await until(() => engine.state().ads.phase === 'break'), 'plays once on Program');
  assert.ok(await until(() => engine.state().ads.timer && engine.state().ads.timer.breakLeft > 0));
  a = engine.state().ads;
  assert.equal(a.items[0].state, 'now');
  await engine.run('ads.skip');
  assert.ok(await until(() => engine.state().ads.timer.index === 2));
  await engine.run('ads.back');
  a = engine.state().ads;
  assert.equal(a.phase, 'idle');
  assert.ok(a.breaks.find((b) => b.id === 'q1').played, 'marked played');
  assert.equal(mock.state().preview, inputBy('Cam 1 · Game').number, 'game camera to Preview');
  assert.ok(engine.state().ads.played.length >= 2, 'played log');
  assert.ok(await until(() => fs.existsSync(path.join(drive, 'Exports')) && fs.readdirSync(path.join(drive, 'Exports')).some((f) => f.startsWith('ads-played-'))), 'log file on the Drive');
});

test('ads: cancel countdown, add and remove break playlists', async () => {
  engine.show.ads.countdown = 3;
  await engine.run('ads.go'); assert.equal(engine.state().ads.phase, 'count');
  await engine.run('ads.cancel'); assert.equal(engine.state().ads.phase, 'idle');
  const r = await engine.run('ads.addBreak', { name: 'OT break', seconds: 60 });
  assert.ok(engine.state().ads.breaks.some((b) => b.name === 'OT break'));
  await engine.run('ads.removeBreak', { id: r.id });
  assert.ok(!engine.state().ads.breaks.some((b) => b.name === 'OT break'));
});

test('videos: cue to Preview, queue, never replaces an on-air clip', { skip: !hasFfmpeg }, async () => {
  assert.ok(await until(() => engine.state().videos.clips.length === 3, 10000));
  const [c1, c2] = engine.state().videos.clips;
  await engine.run('video.cue', { path: c1.path });
  const v = inputBy('VIDEOS');
  assert.equal(mock.state().preview, v.number); assert.equal(v.list[0].path, c1.path);
  await engine.run('video.queue', { path: c2.path });
  mock.state().active = v.number; await engine.refresh();
  const r = await engine.run('video.next');
  assert.ok(r.waiting, 'waits while on air');
  assert.equal(inputBy('VIDEOS').list[0].path, c1.path);
  mock.state().active = 1;
  assert.ok(await until(() => inputBy('VIDEOS').list[0].path === c2.path), 'cues once off air');
});

test('upload target never overwrites', () => {
  if (!hasFfmpeg) return;
  const t = engine.features.videos.uploadTarget('Highlights', 'Doe goal.mp4');
  assert.ok(t.endsWith('Doe goal (2).mp4'));
});

test('show save and reload keeps links and break playlists', async () => {
  engine.save(true);
  const s2 = new Store(data).loadShow(engine.show.name);
  assert.equal(s2.links.ads, engine.show.links.ads);
  assert.equal(s2.ads.breaks.length, engine.show.ads.breaks.length);
});

/* ---------- Phase 2 ---------- */
const mockOse = require('./mock-ose');
const dgram = require('dgram');
const oscLib = require('../src/osc');

test('stat pop: roster from OpenStatsEngine, text + take, auto-out; OSC route', async () => {
  const oseSrv = mockOse.createServer(); await new Promise((r) => oseSrv.listen(0, r));
  await engine.run('ose.set', { url: 'http://127.0.0.1:' + oseSrv.address().port });
  assert.ok(await until(() => engine.state().ose.ok && engine.state().ose.rosters.home.length === 6), 'OSE connected');
  const g = engine.state().graphics.items.find((x) => x.id === 'statpop');
  await engine.run('gfx.statpopConfig', { key: g.key, enabled: 1, lineField: 'PopLine.Text' });
  await engine.run('gfx.config', { key: g.key, autoOut: 1 });
  const r = await engine.run('gfx.statpop', { side: 'home', number: '30', event: 'GOAL' });
  assert.equal(r.line, 'GOAL – #30 John Doe');
  assert.equal(inputBy('StatPop.gtzip').fields[0].value, 'GOAL – #30 John Doe');
  assert.ok(await until(() => engine.state().graphics.items.find((x) => x.id === 'statpop').onAir), 'on air');
  assert.ok(await until(() => !engine.state().graphics.items.find((x) => x.id === 'statpop').onAir, 3000), 'auto-out after 1 s');
  assert.deepEqual(oscLib.route('/console/statpop/away/10/yellow-card', []), ['gfx.statpop', { side: 'away', number: '10', event: 'YELLOW CARD' }]);
  await engine.run('gfx.config', { key: g.key, autoOut: 0 });
  oseSrv.closeAllConnections(); oseSrv.close();
});

test('field sources: fixed and scoreboard values are pushed on TAKE; lists', async () => {
  const g = engine.state().graphics.items.find((x) => x.id === 'breakboard');
  await engine.run('gfx.field', { key: g.key, name: 'TopText.Text', source: 'fixed', value: 'CIAC Second-Round Playoffs' });
  await engine.run('gfx.field', { key: g.key, name: 'Time.Text', source: 'ose', ose: 'PeriodLabel' });
  await engine.run('gfx.take', { id: 'breakboard' });
  const f = Object.fromEntries(inputBy('Breakboard.gtzip').fields.map((x) => [x.name, x.value]));
  assert.equal(f['TopText.Text'], 'CIAC Second-Round Playoffs');
  assert.equal(f['Time.Text'], '2nd');
  await engine.run('gfx.out', { id: 'breakboard' });
  await engine.run('list.set', { name: 'Announcers', items: "Jane Doe '26\nJohn Q. Public '27" });
  assert.deepEqual(engine.state().graphics.lists.Announcers, ["Jane Doe '26", "John Q. Public '27"]);
});

test('mixer cough goes to NDI Audio Bridge over OSC', async () => {
  const sock = dgram.createSocket('udp4'); const got = [];
  sock.on('message', (m, rinfo) => { const d = oscLib.decode(m)[0]; got.push(d.address); sock.send(oscLib.encode('/bridge/in/1/2/cough', [1]), rinfo.port, rinfo.address); });
  await new Promise((r) => sock.bind(0, r));
  await engine.run('bridge.set', { host: '127.0.0.1', port: sock.address().port });
  const ch = engine.state().mixer.channels.find((c) => c.name === 'Jane');
  await engine.run('mix.config', { id: ch.id, mic: '1/2' });
  await engine.run('mix.cough', { id: 'Jane' });
  assert.ok(await until(() => got.includes('/bridge/in/1/2/cough/toggle')), 'command sent');
  assert.ok(await until(() => engine.state().mixer.channels.find((c) => c.name === 'Jane').cough === true), 'reply understood');
  sock.close();
});

test('settings: layout, health blocks, ad folders, shows', async () => {
  await engine.run('layout.set', { layout: 'vertical', order: ['mix', 'gfx', 'video', 'ads', 'music', 'stream'], hidden: ['stream'], open: ['gfx'] });
  assert.deepEqual(engine.state().layout.vertical.hidden, ['stream']);
  await engine.run('health.blocks', { blocks: ['vmix', 'stream'] });
  assert.deepEqual(engine.state().health.blocks, ['vmix', 'stream']);
  await engine.run('ads.folders', { folders: [{ name: '30Second', seconds: 30 }], looseFolder: 'Unsorted', sponsorFolders: [] });
  assert.ok(await until(() => engine.state().ads.library.every((a) => a.folder !== '15Second')));
  await engine.run('show.new', { name: 'Football', copyFrom: engine.show.name });
  assert.equal(engine.state().show.name, 'Football');
  assert.ok(engine.state().show.list.includes('Default'));
  await engine.run('show.load', { name: 'Default' });
});

/* ---------- Phase 3 ---------- */
const http = require('http');

test('YouTube: finds the live video on the channel and reads viewers', async () => {
  let searches = 0;
  const api = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    res.setHeader('Content-Type', 'application/json');
    if (u.pathname.endsWith('/search')) { searches++; return res.end(JSON.stringify({ items: [{ id: { videoId: 'abcdefghijk' } }] })); }
    if (u.pathname.endsWith('/videos')) return res.end(JSON.stringify({ items: [{ snippet: { title: 'Prep vs Manchester' }, liveStreamingDetails: { actualStartTime: '2026-11-12T00:00:00Z', concurrentViewers: '142' } }] }));
    res.statusCode = 404; res.end('{}');
  });
  await new Promise((r) => api.listen(0, r));
  engine.store.config.youtubeApiBase = 'http://127.0.0.1:' + api.address().port;
  await engine.run('youtube.set', { apiKey: 'test-key', channelId: 'UCtest' });
  await engine.run('youtube.check');
  const y = engine.state().youtube;
  assert.equal(y.live, true); assert.equal(y.viewers, 142); assert.equal(y.videoId, 'abcdefghijk'); assert.equal(searches, 1);
  assert.equal(require('../src/features/youtube').videoIdFrom('https://www.youtube.com/live/abcdefghijk?si=x'), 'abcdefghijk');
  await engine.run('youtube.set', { apiKey: '' });
  api.closeAllConnections(); api.close();
});

test('previews: vMix snapshots become monitor pictures', async () => {
  await engine.run('previews.set', { enabled: 1, everyMs: 500 });
  assert.ok(await until(() => engine.state().previews.stamp.pgm && engine.state().previews.stamp.pvw, 3000), 'snapshots written');
  assert.ok(calls().includes('Snapshot') && calls().includes('SnapshotInput'));
  await engine.run('previews.set', { enabled: 0 });
});

test('dials: relative music level, mixer select + level, video jog', async () => {
  await engine.run('music.level', { value: 50 });
  await engine.run('music.level', { step: 5 });
  assert.equal(engine.show.music.level, 55);
  const r = await engine.run('mix.select', { value: 0 });
  assert.ok(r.channel);
  await engine.run('mix.selectedLevel', { value: 80 });
  const ch = engine.state().mixer.channels[0];
  assert.ok(await until(() => engine.state().mixer.channels[0].volume === 80), ch.name + ' level via dial');
  await engine.run('video.jog', { seconds: 2 });
  assert.ok(calls().includes('SetPosition'));
  assert.deepEqual(oscLib.route('/console/music/level', ['+5']), ['music.level', { step: 5 }]);
  assert.deepEqual(oscLib.route('/console/mix/selected/level', ['-2']), ['mix.selectedLevel', { step: -2 }]);
});
