'use strict';
/**
 * Fake vMix for development and tests. Speaks the same HTTP API as vMix:
 *   GET /api                -> XML state
 *   GET /api/?Function=...  -> runs a function, returns "Function completed successfully."
 * Extra test helpers: GET /_calls (JSON log of functions), GET /_reset
 *
 * Run:  node test/mock-vmix.js [port]     (default 8088)
 */
const http = require('http');
const { encode } = require('../src/xml');

function makeState() {
  let n = 0;
  const key = () => 'mock-' + (++n).toString(16).padStart(4, '0') + '-0000-4000-8000-000000000000';
  const inp = (type, title, extra = {}) => ({
    key: key(), type, title, state: 'Paused', position: 0, duration: 0, loop: false, muted: false, volume: 100,
    balance: 0, solo: false, audiobusses: 'M', fields: [], list: [], selectedIndex: 0, level: 0.3, ...extra,
  });
  const inputs = [
    inp('Capture', 'Cam 1 · Game', { muted: true, audiobusses: '' }),
    inp('Capture', 'Cam 2 · Wide', { muted: true, audiobusses: '' }),
    inp('Capture', 'Cam 3 · Booth', { muted: true, audiobusses: '' }),
    inp('GT', 'GenL3.gtzip', { muted: true, fields: [{ kind: 'text', name: 'Top.Text', value: '' }, { kind: 'text', name: 'Lower.Text', value: '' }] }),
    inp('GT', 'StatPop.gtzip', { muted: true, fields: [{ kind: 'text', name: 'PopLine.Text', value: '' }, { kind: 'image', name: 'PopLogo.Source', value: '' }] }),
    inp('GT', 'Scorebug.gtzip', { muted: true, fields: [{ kind: 'text', name: 'Half.Text', value: '1st' }] }),
    inp('GT', 'Breakboard.gtzip', { muted: true, fields: [{ kind: 'text', name: 'TopText.Text', value: '' }, { kind: 'text', name: 'Time.Text', value: '' }] }),
    inp('GT', 'Announcers.gtzip', { muted: true, fields: [{ kind: 'text', name: 'Name1.Text', value: '' }, { kind: 'text', name: 'Name2.Text', value: '' }] }),
    inp('VideoList', 'MUSIC'),
    inp('VideoList', 'ADS'),
    inp('VideoList', 'VIDEOS'),
    inp('NDI', 'NDI BRIDGE (John)', { level: 0.5 }),
    inp('NDI', 'NDI BRIDGE (Jane)', { level: 0.45 }),
    inp('NDI', 'NDI BRIDGE (Sideline)', { level: 0.3 }),
    inp('Audio', 'Crowd mic (Shotgun)', { level: 0.35 }),
  ];
  inputs.forEach((x, i) => (x.number = i + 1));
  return {
    inputs, overlays: [0, 0, 0, 0], preview: 2, active: 1,
    recording: false, recStart: 0, streaming: false,
    master: { volume: 100, muted: false }, calls: [], durations: {},
  };
}

let S = makeState();

function findInput(ref) {
  if (ref === undefined || ref === '') return null;
  const s = String(ref);
  return S.inputs.find((i) => i.key === s) || S.inputs.find((i) => String(i.number) === s) || S.inputs.find((i) => i.title === s || i.title.toLowerCase() === s.toLowerCase()) || null;
}
function durFor(path) {
  if (S.durations[path]) return S.durations[path];
  try { // real files (demo drive): read the true length
    const media = require('../src/media');
    const ext = require('path').extname(path).toLowerCase();
    const d = ext === '.mp3' ? media.mp3Duration(path) : ext === '.wav' ? media.wavDuration(path) : media.mp4Duration(path);
    if (d) return Math.round(d * 1000);
  } catch { /* not a real file */ }
  const m = String(path).match(/(\d+)\s*s(?:ec)?\b/i);
  return m ? Number(m[1]) * 1000 : 30000;
}
function selectItem(i, idx) {
  if (!i.list.length) return;
  idx = Math.max(1, Math.min(i.list.length, idx));
  i.list.forEach((it, k) => (it.selected = k === idx - 1));
  i.selectedIndex = idx; i.position = 0; i.duration = durFor(i.list[idx - 1].path);
}

function run(fn, p) {
  S.calls.push({ fn, ...p, t: Date.now() });
  const i = findInput(p.Input);
  const v = p.Value;
  const ov = /^OverlayInput([1-4])(In|Out|)$/.exec(fn);
  if (ov) {
    const k = Number(ov[1]) - 1;
    if (ov[2] === 'Out') S.overlays[k] = 0;
    else if (ov[2] === 'In') S.overlays[k] = i ? i.number : 0;
    else S.overlays[k] = S.overlays[k] && (!i || S.overlays[k] === i.number) ? 0 : (i ? i.number : 0);
    return;
  }
  switch (fn) {
    case 'OverlayInputAllOff': S.overlays = [0, 0, 0, 0]; return;
    case 'SetText': case 'SetImage': case 'SetColor': {
      const f = i && i.fields.find((x) => x.name === p.SelectedName);
      if (f) f.value = v ?? ''; return;
    }
    case 'PreviewInput': if (i) S.preview = i.number; return;
    case 'CutDirect': case 'ActiveInput': if (i) { S.active = i.number; } return;
    case 'Cut': case 'Fade': { const a = S.active; S.active = S.preview; S.preview = a; return; }
    case 'Play': if (i) i.state = 'Running'; return;
    case 'Pause': if (i) i.state = 'Paused'; return;
    case 'PlayPause': if (i) i.state = i.state === 'Running' ? 'Paused' : 'Running'; return;
    case 'Restart': if (i) i.position = 0; return;
    case 'SetPosition': if (i) i.position = Number(v) || 0; return;
    case 'ListAdd': if (i) { i.list.push({ path: v, selected: false }); if (i.list.length === 1) selectItem(i, 1); } return;
    case 'ListRemoveAll': if (i) { i.list = []; i.selectedIndex = 0; i.duration = 0; i.position = 0; i.state = 'Paused'; } return;
    case 'ListRemove': if (i) { i.list.splice(Number(v) - 1, 1); } return;
    case 'SelectIndex': if (i) selectItem(i, Number(v)); return;
    case 'NextItem': if (i) selectItem(i, (i.selectedIndex || 0) + 1); return;
    case 'PreviousItem': if (i) selectItem(i, (i.selectedIndex || 2) - 1); return;
    case 'SetVolume': if (i) i.volume = Number(v); else S.master.volume = Number(v); return;
    case 'SetMasterVolume': S.master.volume = Number(v); return;
    case 'SetVolumeFade': if (i) { const [vol] = String(v).split(','); i.volume = Number(vol); } return;
    case 'AudioOn': if (i) i.muted = false; return;
    case 'AudioOff': if (i) i.muted = true; return;
    case 'AudioToggle': if (i) i.muted = !i.muted; return;
    case 'SoloOn': if (i) i.solo = true; return;
    case 'SoloOff': if (i) i.solo = false; return;
    case 'AudioBusOn': if (i && !i.audiobusses.includes(v)) i.audiobusses = (i.audiobusses ? i.audiobusses + ',' : '') + v; return;
    case 'AudioBusOff': if (i) i.audiobusses = i.audiobusses.split(',').filter((b) => b && b !== v).join(','); return;
    case 'Snapshot': case 'SnapshotInput': {
      const JPG = '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFAEBAAAAAAAAAAAAAAAAAAAAAP/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/AKAP/9k=';
      try { require('fs').writeFileSync(v, Buffer.from(JPG, 'base64')); } catch { /* bad path */ }
      return;
    }
    case 'StartRecording': S.recording = true; S.recStart = Date.now(); return;
    case 'StopRecording': S.recording = false; return;
    case 'StartStopRecording': S.recording = !S.recording; S.recStart = Date.now(); return;
    case 'StartStreaming': S.streaming = true; return;
    case 'StopStreaming': S.streaming = false; return;
    case 'StartStopStreaming': S.streaming = !S.streaming; return;
    default: return;
  }
}

// playback simulation
let last = Date.now();
const timer = setInterval(() => {
  const now = Date.now(); const dt = now - last; last = now;
  for (const i of S.inputs) {
    if (i.state !== 'Running' || !i.duration) continue;
    i.position += dt;
    if (i.position >= i.duration) {
      if (i.list.length && i.selectedIndex < i.list.length) selectItem(i, i.selectedIndex + 1);
      else { i.position = i.duration; i.state = 'Paused'; }
    }
  }
}, 50);
timer.unref();

function meter(i) {
  if (i.muted || i.type === 'GT' || i.type === 'Capture') return 0;
  const running = i.list.length ? i.state === 'Running' : true;
  if (!running) return 0;
  return Math.min(1, (i.level || 0.3) * (i.volume / 100) * (0.8 + Math.random() * 0.4));
}

function xml() {
  const a = (o) => Object.entries(o).map(([k, v]) => `${k}="${encode(v)}"`).join(' ');
  const inputs = S.inputs.map((i) => {
    const m1 = meter(i), m2 = meter(i);
    const attrs = a({ key: i.key, number: i.number, type: i.type, title: i.title, shortTitle: i.title, state: i.state, position: Math.round(i.position), duration: i.duration, loop: i.loop ? 'True' : 'False', muted: i.muted ? 'True' : 'False', volume: i.volume, balance: 0, solo: i.solo ? 'True' : 'False', audiobusses: i.audiobusses, meterF1: m1.toFixed(4), meterF2: m2.toFixed(4), selectedIndex: i.selectedIndex || 0 });
    let inner = encode(i.title);
    for (const f of i.fields) inner += `<${f.kind} index="0" name="${encode(f.name)}">${encode(f.value)}</${f.kind}>`;
    if (i.type === 'VideoList') inner += '<list>' + i.list.map((it) => `<item${it.selected ? ' selected="true"' : ''}>${encode(it.path)}</item>`).join('') + '</list>';
    return `<input ${attrs}>${inner}</input>`;
  }).join('');
  const ovs = S.overlays.map((v, k) => (v ? `<overlay number="${k + 1}">${v}</overlay>` : `<overlay number="${k + 1}" />`)).join('');
  const recDur = S.recording ? Math.floor((Date.now() - S.recStart) / 1000) : 0;
  const mlev = Math.min(1, S.inputs.reduce((s, i) => s + meter(i) * (i.audiobusses.includes('M') ? 1 : 0), 0));
  return `<vmix><version>29.0.0.0</version><edition>4K</edition><inputs>${inputs}</inputs><overlays>${ovs}</overlays><preview>${S.preview}</preview><active>${S.active}</active><fadeToBlack>False</fadeToBlack><recording duration="${recDur}">${S.recording ? 'True' : 'False'}</recording><external>False</external><streaming>${S.streaming ? 'True' : 'False'}</streaming><audio><master volume="${S.master.volume}" muted="False" meterF1="${mlev.toFixed(4)}" meterF2="${mlev.toFixed(4)}" headphonesVolume="74" /></audio></vmix>`;
}

function createServer() {
  return http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    if (u.pathname === '/_calls') { res.setHeader('Content-Type', 'application/json'); return res.end(JSON.stringify(S.calls)); }
    if (u.pathname === '/_reset') { S = makeState(); return res.end('ok'); }
    if (u.pathname === '/_durations' && req.method === 'POST') {
      let b = ''; req.on('data', (d) => (b += d)); req.on('end', () => { Object.assign(S.durations, JSON.parse(b || '{}')); res.end('ok'); }); return;
    }
    if (u.pathname === '/api' || u.pathname === '/api/') {
      const fn = u.searchParams.get('Function');
      if (fn) {
        const p = {}; for (const [k, v] of u.searchParams) if (k !== 'Function') p[k] = v;
        run(fn, p);
        return res.end('Function completed successfully.');
      }
      res.setHeader('Content-Type', 'text/xml');
      return res.end(xml());
    }
    res.statusCode = 404; res.end('not found');
  });
}

module.exports = { createServer, state: () => S, reset: () => { S = makeState(); } };

if (require.main === module) {
  const port = Number(process.argv[2]) || 8088;
  createServer().listen(port, () => console.log('Mock vMix listening on http://127.0.0.1:' + port + '/api'));
}
