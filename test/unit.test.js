'use strict';
const test = require('node:test');
const assert = require('node:assert');
const xml = require('../src/xml');
const osc = require('../src/osc');
const { buildBreak, fillSize } = require('../src/adlogic');
const { durationFromName } = require('../src/media');
const { snapshot } = require('../src/vmix');
const { autoMatch } = require('../src/features/links');

test('xml: parses vMix-style document with entities and self-closing tags', () => {
  const doc = xml.parse('<?xml version="1.0"?><vmix><version>29</version><inputs><input key="a" number="1" type="GT" title="L3 &amp; Co">L3<text index="0" name="Top.Text">Tom &lt;3</text></input></inputs><overlays><overlay number="1">1</overlay><overlay number="2" /></overlays></vmix>');
  const inp = xml.child(xml.child(doc, 'inputs'), 'input');
  assert.equal(inp.attrs.title, 'L3 & Co');
  assert.equal(xml.child(inp, 'text').text, 'Tom <3');
  assert.equal(xml.children(xml.child(doc, 'overlays'), 'overlay').length, 2);
});

test('vmix snapshot: inputs, lists, overlays, recording duration', () => {
  const s = snapshot('<vmix><version>29</version><edition>4K</edition><inputs><input key="k1" number="1" type="VideoList" title="ADS" state="Running" position="1000" duration="30000" muted="False" volume="80" solo="True" audiobusses="M,A" meterF1="0.5" meterF2="0.25" selectedIndex="2">ADS<list><item>C:\\a.mp4</item><item selected="true">C:\\b.mp4</item></list></input></inputs><overlays><overlay number="1">1</overlay></overlays><preview>1</preview><active>1</active><recording duration="65">True</recording><streaming>False</streaming><audio><master volume="90" muted="False" meterF1="0.1" meterF2="0.1"/></audio></vmix>');
  assert.equal(s.inputs[0].list.length, 2);
  assert.equal(s.inputs[0].list[1].selected, true);
  assert.equal(s.inputs[0].solo, true);
  assert.equal(s.recording, true); assert.equal(s.recordingDuration, 65);
  assert.equal(s.overlays[0].input, 1);
  assert.equal(s.audio.master.volume, 90);
});

test('osc: encode/decode round trip and bundles', () => {
  const b = osc.encode('/console/music/level', [50, 2000.5, 'x', true]);
  const [m] = osc.decode(b);
  assert.equal(m.address, '/console/music/level');
  assert.equal(m.args[0], 50); assert.ok(Math.abs(m.args[1] - 2000.5) < 0.01); assert.equal(m.args[2], 'x'); assert.equal(m.args[3], true);
  const bundle = Buffer.concat([Buffer.from('#bundle\0'), Buffer.alloc(8), (() => { const x = Buffer.alloc(4); x.writeInt32BE(b.length); return x; })(), b]);
  assert.equal(osc.decode(bundle)[0].address, '/console/music/level');
});

test('osc: routes', () => {
  assert.deepEqual(osc.route('/console/gfx/genl3/take', []), ['gfx.take', { id: 'genl3', value: undefined }]);
  assert.deepEqual(osc.route('/console/gfx/genl3/field/Top.Text', ['Hi']), ['gfx.set', { id: 'genl3', field: 'Top.Text', value: 'Hi' }]);
  assert.deepEqual(osc.route('/console/music/level', [50, 1000]), ['music.level', { value: 50, ms: 1000 }]);
  assert.deepEqual(osc.route('/console/music/fade/out', []), ['music.fadeout', { ms: undefined }]);
  assert.deepEqual(osc.route('/console/ads/go', []), ['ads.go', {}]);
  assert.deepEqual(osc.route('/console/ads/break/half/go', []), ['ads.go', { id: 'half' }]);
  assert.deepEqual(osc.route('/console/mix/John/mute', [1]), ['mix.mute', { id: 'John', value: 1 }]);
  assert.deepEqual(osc.route('/console/mix/Crowd/level', ['+5']), ['mix.level', { id: 'Crowd', step: 5 }]);
  assert.deepEqual(osc.route('/console/rec', [0]), ['rec.stop', {}]);
  assert.equal(osc.route('/console/nope', []), null);
});

test('ad fill never goes over the target and uses bucket sizes', () => {
  const ads = [];
  for (let i = 0; i < 10; i++) ads.push({ path: 'b30-' + i, kind: 'bucket', folder: '30Second', folderSeconds: 30, actualSeconds: 29 });
  for (let i = 0; i < 4; i++) ads.push({ path: 'b15-' + i, kind: 'bucket', folder: '15Second', folderSeconds: 15, actualSeconds: 15 });
  ads.push({ path: 'loose', kind: 'loose', folder: 'Unsorted', folderSeconds: 0, actualSeconds: 44.6 });
  for (let n = 0; n < 50; n++) {
    const target = [60, 90, 120, 135, 300][n % 5];
    const pick = buildBreak(ads, target);
    const total = pick.reduce((s, a) => s + fillSize(a), 0);
    assert.ok(total <= target, 'over target: ' + total + ' > ' + target);
    const unpicked = ads.filter((a) => !pick.includes(a)).map(fillSize);
    assert.ok(!unpicked.some((sz) => sz <= target - total), 'an unpicked ad still fits: ' + total + ' of ' + target);
    assert.equal(new Set(pick.map((a) => a.path)).size, pick.length, 'duplicate ad');
  }
});

test('ad fill: sponsor every 2nd break, once per game, and skip recent', () => {
  const ads = [
    { path: 'nfhs', kind: 'sponsor', folder: 'Sponsors\\NFHS', actualSeconds: 30 },
    { path: 'daf', kind: 'sponsor', folder: 'Sponsors\\DAF', actualSeconds: 30 },
    ...Array.from({ length: 6 }, (_, i) => ({ path: 'a' + i, kind: 'bucket', folder: '30Second', folderSeconds: 30, actualSeconds: 30 })),
  ];
  const rules = [{ folder: 'Sponsors\\NFHS', every: 2 }, { folder: 'Sponsors\\DAF', oncePerGame: true }];
  const b1 = buildBreak(ads, 120, { breakNumber: 1, sponsorRules: rules, sponsorsPlayed: new Set() });
  assert.ok(!b1.some((a) => a.path === 'nfhs')); assert.equal(b1[0].path, 'daf');
  const b2 = buildBreak(ads, 120, { breakNumber: 2, sponsorRules: rules, sponsorsPlayed: new Set(['Sponsors\\DAF']) });
  assert.equal(b2[0].path, 'nfhs'); assert.ok(!b2.some((a) => a.path === 'daf'));
  const recent = new Set(['a0', 'a1', 'a2']);
  const b3 = buildBreak(ads, 90, { breakNumber: 3, recent });
  assert.ok(b3.every((a) => !recent.has(a.path)));
});

test('durations from file names', () => {
  assert.equal(durationFromName('Promo 1min47sec.mp4'), 107);
  assert.equal(durationFromName('Spot 30sec.mp4'), 30);
  assert.equal(durationFromName('Spot 15s.mp4'), 15);
  assert.equal(durationFromName('2min.mp4'), 120);
  assert.equal(durationFromName('nothing.mp4'), null);
});

test('links: auto-match by name and type', () => {
  const inputs = [
    { key: 'c1', title: 'Cam 1 · Game', type: 'Capture' }, { key: 'm', title: 'MUSIC', type: 'VideoList' },
    { key: 'a', title: 'ADS', type: 'VideoList' }, { key: 'v', title: 'Highlights', type: 'VideoList' },
  ];
  const g = autoMatch(inputs, {});
  assert.equal(g.music.key, 'm'); assert.equal(g.ads.key, 'a'); assert.equal(g.videos.key, 'v'); assert.equal(g.gameCam.key, 'c1');
});

/* ---------- PIN / request checks (src/auth.js) ---------- */
const { createAuth } = require('../src/auth');
const fakeStore = () => ({ config: { pin: '', oscAllow: [] }, saveConfig() {} });
const fakeReq = (ip, headers = {}) => ({ socket: { remoteAddress: ip }, headers: { host: '192.168.1.5:8790', ...headers } });

test('PIN: off = everyone; on = other devices need the PIN cookie; this PC never does', () => {
  const store = fakeStore(); const a = createAuth(store);
  const ipad = fakeReq('192.0.2.44');
  assert.ok(a.allowed(ipad), 'no PIN set');
  assert.equal(a.setPin('12').ok, false);
  assert.ok(a.setPin('2468').ok);
  assert.ok(!a.allowed(ipad), 'PIN needed now');
  assert.ok(a.allowed(fakeReq('127.0.0.1')) && a.allowed(fakeReq('::ffff:127.0.0.1')), 'this PC');
  assert.equal(a.login(ipad, '1111').ok, false);
  const ok = a.login(ipad, '2468'); assert.ok(ok.ok && ok.cookie.includes('HttpOnly'));
  const c = ok.cookie.split(';')[0];
  assert.ok(a.allowed(fakeReq('192.0.2.44', { cookie: c })), 'cookie works');
  assert.ok(a.allowed(fakeReq('192.0.2.50'), '2468'), 'Companion ?pin=');
  a.setPin('1357');
  assert.ok(!a.allowed(fakeReq('192.0.2.44', { cookie: c })), 'changing the PIN signs devices out');
});

test('PIN: five wrong tries lock that device for a while', () => {
  const a = createAuth(fakeStore()); a.setPin('2468');
  const r = fakeReq('192.0.2.9');
  for (let i = 0; i < 5; i++) a.login(r, '0000');
  const res = a.login(r, '2468');
  assert.equal(res.ok, false); assert.match(res.error, /Too many/);
  assert.ok(a.login(fakeReq('192.0.2.10'), '2468').ok, 'other devices unaffected');
});

test('cross-site and host checks', () => {
  const a = createAuth(fakeStore());
  assert.ok(a.crossSite(fakeReq('1.2.3.4', { origin: 'http://evil.example' })));
  assert.ok(a.crossSite(fakeReq('1.2.3.4', { 'sec-fetch-site': 'same-site' })));
  assert.ok(!a.crossSite(fakeReq('1.2.3.4', { origin: 'http://192.168.1.5:8790', 'sec-fetch-site': 'same-origin' })));
  assert.ok(!a.crossSite(fakeReq('1.2.3.4')), 'Companion sends no browser headers');
  assert.ok(a.hostOk(fakeReq('1.2.3.4')));
  assert.ok(a.hostOk(fakeReq('1.2.3.4', { host: 'localhost:8790' })));
  assert.ok(a.hostOk(fakeReq('1.2.3.4', { host: '[::1]:8790' })));
  assert.ok(!a.hostOk(fakeReq('1.2.3.4', { host: 'rebind.attacker.example:8790' })));
});

test('OSC allow list', () => {
  const a = createAuth(fakeStore());
  assert.ok(a.oscAllowed('192.0.2.1'), 'empty list = anyone');
  assert.equal(a.setOscAllow('192.0.2.20, nope').ok, false);
  assert.ok(a.setOscAllow('192.0.2.20, 192.0.2.21').ok);
  assert.ok(a.oscAllowed('192.0.2.21') && a.oscAllowed('127.0.0.1'));
  assert.ok(!a.oscAllowed('192.0.2.1'));
});

/* ---------- live state patches (src/statediff.js) ---------- */
const sd = require('../src/statediff');
test('state patches rebuild the same state', () => {
  const s1 = { v: 1, music: { level: 50, songs: [1, 2] }, tally: null, ads: { phase: 'idle', library: ['a'] } };
  const s2 = { v: 2, music: { level: 60, songs: [1, 2] }, tally: { rec: true }, ads: { phase: 'idle', library: ['a'], timer: 3 } };
  const d = sd.diff(sd.flatten(s1), sd.flatten(s2), s2);
  assert.deepEqual(d.merge.music, { level: 60 }, 'unchanged song list not resent');
  assert.ok(d.set.ads, 'new sub-key: whole section resent');
  assert.deepEqual(sd.apply(s1, d), s2);
  assert.equal(sd.diff(sd.flatten(s2), sd.flatten(s2), s2), null, 'no change, no message');
});

/* ---------- vMix list helper (src/vmixlist.js) ---------- */
const VL = require('../src/vmixlist');
function fakeList(paths) {
  const calls = [];
  const input = { key: 'k', list: paths.map((p) => ({ path: p })) };
  const engine = { fn: async (fn, a) => { calls.push(fn + (a.Value ? ' ' + a.Value : '')); if (fn === 'ListAdd') input.list.push({ path: a.Value }); if (fn === 'ListRemoveAll') input.list = []; return { ok: true }; } };
  return { input, engine, calls };
}
test('vMix list sync: same, append at the end, rebuild only when allowed', async () => {
  let f = fakeList(['C:\\a.mp3', 'C:\\b.mp3']);
  assert.equal(await VL.sync(f.engine, f.input, ['c:/A.mp3', 'C:\\b.mp3']), 'same', 'case and slashes ignored');
  assert.equal(await VL.sync(f.engine, f.input, ['C:\\a.mp3', 'C:\\b.mp3', 'C:\\c.mp3']), 'appended');
  assert.deepEqual(f.calls, ['ListAdd C:\\c.mp3']);
  f = fakeList(['C:\\a.mp3']);
  assert.equal(await VL.sync(f.engine, f.input, ['C:\\x.mp3'], { canRebuild: false }), 'deferred', 'never empties a playing list');
  assert.equal(f.calls.length, 0);
  assert.equal(await VL.sync(f.engine, f.input, ['C:\\x.mp3']), 'rebuilt');
  assert.deepEqual(f.calls, ['ListRemoveAll', 'ListAdd C:\\x.mp3']);
  f = fakeList(['C:\\old.mp4', 'C:\\a.mp4']);
  assert.equal(await VL.sync(f.engine, f.input, ['C:\\a.mp4', 'C:\\q.mp4'], { exact: false }), 'appended', 'not exact: extras stay');
  assert.equal(VL.indexOf(f.input, 'c:/q.mp4'), 3);
});
test('vMix list: tells UC moves from vMix Auto Next', () => {
  const s = new VL.Selection();
  s.check({ selectedIndex: 1, state: 'Running' });
  s.expect(3); assert.equal(s.check({ selectedIndex: 3, state: 'Running' }), false, 'UC asked for 3');
  assert.equal(s.check({ selectedIndex: 4, state: 'Running' }), true, 'vMix moved on by itself');
  assert.ok(s.autoNextSeen);
});

test('mixer fader dB and scale conversion', () => {
  const e = { store: { config: { vmix: { volumeScale: 'auto', volumeDetected: 'amplitude' } } } };
  const faderOf = require('../src/engine').Engine.prototype.faderOf.bind({ volumeScale: require('../src/engine').Engine.prototype.volumeScale.bind(e) });
  assert.equal(Math.round(faderOf(6.25)), 50);
  assert.equal(faderOf(0), 0);
  assert.equal(Math.round(faderOf(100)), 100);
  e.store.config.vmix.volumeScale = 'fader';
  assert.equal(faderOf(6.25), 6.25);
});
