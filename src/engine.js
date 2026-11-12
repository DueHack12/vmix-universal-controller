'use strict';
/**
 * The engine: polls vMix, keeps the current show, routes commands to features,
 * and builds the state the pages, remotes and Companion see.
 */
const path = require('path');
const fs = require('fs');
const os = require('os');
const { VmixClient } = require('./vmix');
const { Media } = require('./media');

const FEATURES = ['links', 'ose', 'bridge', 'graphics', 'videos', 'music', 'ads', 'mixer', 'health', 'youtube', 'previews'];

class Engine {
  constructor(store) {
    this.store = store;
    this.vmix = new VmixClient(store.config.vmix);
    this.media = new Media(store);
    this.show = store.loadShow(store.config.currentShow);
    this.snap = null;
    this.commands = {};
    this.listeners = new Set();
    this.logLines = [];
    this.features = {};
    this.version = 0;
    this.pollSeq = 0;
    for (const f of FEATURES) {
      const mod = require('./features/' + f)(this);
      this.features[f] = mod;
    }
    this.cmd('show.save', () => { this.save(true); return { ok: true }; });
    this.cmd('show.load', ({ name }) => this.loadShow(name));
    this.cmd('show.new', ({ name, copyFrom }) => this.newShow(name, copyFrom));
    this.cmd('config.set', (a) => this.setConfig(a));
    this.cmd('rec.toggle', () => this.fn('StartStopRecording'));
    this.cmd('rec.start', () => this.fn('StartRecording'));
    this.cmd('rec.stop', () => this.fn('StopRecording'));
    this.cmd('stream.toggle', () => this.fn('StartStopStreaming'));
    this.cmd('show.sport', ({ sport }) => { this.show.sport = String(sport || ''); this.save(); return { ok: true }; });
    this.cmd('show.rename', ({ name }) => {
      if (!name) return { ok: false, error: 'Name needed' };
      const old = this.show.name; this.show.name = String(name).trim(); this.save(true);
      this.store.deleteShow(old); this.store.config.currentShow = this.show.name; this.store.saveConfig(); return { ok: true };
    });
    this.cmd('show.delete', ({ name }) => { if (name === this.show.name) return { ok: false, error: 'Load another show first' }; this.store.deleteShow(name); return { ok: true }; });
    this.cmd('layout.set', ({ layout, order, hidden, open }) => {
      const L = (this.show.layout = this.show.layout || {}); const k = layout === 'horizontal' ? 'horizontal' : 'vertical';
      L[k] = { ...(L[k] || {}), ...(order ? { order } : {}), ...(hidden ? { hidden } : {}), ...(open ? { open } : {}) };
      this.save(); return { ok: true };
    });
    this.cmd('ui.set', ({ beginner, value }) => { const b = beginner ?? value; if (b !== undefined) this.store.config.beginner = b === true || Number(b) === 1; this.store.saveConfig(); return { ok: true }; });
    this.cmd('health.blocks', ({ blocks }) => { this.show.health.blocks = Array.isArray(blocks) ? blocks : []; this.save(); return { ok: true }; });
    this.media.onThumb = () => this.changed();
  }

  /* ---------- helpers for features ---------- */
  cmd(name, handler) { this.commands[name] = handler; }
  log(msg) { const line = new Date().toLocaleTimeString() + '  ' + msg; this.logLines.push(line); if (this.logLines.length > 200) this.logLines.shift(); if (process.env.BC_VERBOSE) console.log(line); }
  async fn(name, params = {}) {
    try { await this.vmix.fn(name, params); return { ok: true }; } catch (e) { this.log('vMix ' + name + ' failed: ' + e.message); return { ok: false, error: e.message }; }
  }
  inputs() { return this.snap ? this.snap.inputs : []; }
  /** re-read vMix now (use before decisions that depend on state a previous call just changed) */
  async refresh() { const seq = ++this.pollSeq; try { const snap = await this.vmix.poll(); if (seq === this.pollSeq) this.snap = snap; } catch { /* keep last */ } return this.snap; }
  inputByKey(key) { return key ? this.inputs().find((i) => i.key === key) || null : null; }
  inputByNumber(n) { return n ? this.inputs().find((i) => i.number === n) || null : null; }
  /** linked input for a job, falling back to the title it had when it was linked */
  input(job) {
    const key = this.show.links[job];
    let i = this.inputByKey(key);
    if (!i && this.show.linkTitles[job]) i = this.inputs().find((x) => x.title === this.show.linkTitles[job]) || null;
    return i;
  }
  driveDir(...parts) { return path.join(this.store.config.driveRoot, ...parts); }
  changed() { this.version++; }
  save(now = false) {
    clearTimeout(this.saveTimer);
    const run = () => { try { this.store.saveShow(this.show); } catch (e) { this.log('Save failed: ' + e.message); } };
    if (now) run(); else this.saveTimer = setTimeout(run, 400);
  }

  /* ---------- shows / config ---------- */
  loadShow(name) {
    this.save(true);
    this.show = this.store.loadShow(name);
    this.store.config.currentShow = this.show.name; this.store.saveConfig();
    for (const f of Object.values(this.features)) if (f.onShow) f.onShow();
    this.changed();
    return { ok: true, show: this.show.name };
  }
  newShow(name, copyFrom) {
    if (!name) return { ok: false, error: 'Name needed' };
    const base = copyFrom ? this.store.loadShow(copyFrom) : this.store.loadShow(name);
    base.name = name;
    this.store.saveShow(base);
    return this.loadShow(name);
  }
  setConfig(a) {
    const c = this.store.config;
    if (a.vmixHost !== undefined) c.vmix.host = String(a.vmixHost).trim() || '127.0.0.1';
    if (a.vmixPort !== undefined) c.vmix.port = Number(a.vmixPort) || 8088;
    if (a.driveRoot !== undefined) c.driveRoot = String(a.driveRoot).trim();
    if (a.oscFeedbackHost !== undefined) c.oscFeedback.host = String(a.oscFeedbackHost).trim();
    if (a.oscFeedbackPort !== undefined) c.oscFeedback.port = Number(a.oscFeedbackPort) || 0;
    if (a.recordDrive !== undefined) c.recordDrive = String(a.recordDrive).trim();
    if (a.ffmpegPath !== undefined) c.ffmpegPath = String(a.ffmpegPath).trim();
    if (a.ffprobePath !== undefined) c.ffprobePath = String(a.ffprobePath).trim();
    this.vmix.setAddress(c.vmix.host, c.vmix.port);
    this.store.saveConfig();
    for (const f of Object.values(this.features)) if (f.onConfig) f.onConfig();
    this.changed();
    return { ok: true };
  }

  /** Create the Broadcast Console folder tree on the Drive (mkdir only). */
  makeFolders() {
    const root = this.store.config.driveRoot;
    const tree = ['Videos\\Highlights', 'Videos\\Pregame', 'Videos\\Packages', 'Music\\Bumps', 'Music\\Highlights', 'Music\\Pregame', 'Music\\Timeouts', 'Music\\Walk-out',
      'Ads\\15Second', 'Ads\\30Second', 'Ads\\1Minute', 'Ads\\2Minutes+', 'Ads\\Unsorted', 'Ads\\Sponsors\\NFHS', 'Ads\\Sponsors\\DAF',
      'Graphics\\Logos', 'Graphics\\Backgrounds', 'Shows', 'Exports', '_Archive'];
    const made = [];
    for (const t of tree) {
      const p = path.join(root, ...t.split('\\'));
      if (!fs.existsSync(p)) { fs.mkdirSync(p, { recursive: true }); made.push(t); }
    }
    return { ok: true, made };
  }

  /* ---------- commands ---------- */
  async run(name, args = {}) {
    const h = this.commands[name];
    if (!h) return { ok: false, error: 'Unknown command: ' + name };
    try {
      const r = await h(args || {});
      this.changed();
      return r && typeof r === 'object' && 'ok' in r ? r : { ok: true, ...(r && typeof r === 'object' ? r : {}) };
    } catch (e) {
      this.log('Command ' + name + ' failed: ' + e.message);
      return { ok: false, error: e.message };
    }
  }

  /* ---------- polling ---------- */
  start() {
    const tick = async () => {
      const prev = this.snap;
      const seq = ++this.pollSeq;
      try { await this.vmix.poll(); } catch { /* connected=false */ }
      if (seq === this.pollSeq) this.snap = this.vmix.connected ? this.vmix.snap : prev && { ...prev, stale: true };
      for (const f of Object.values(this.features)) {
        if (f.onPoll && this.vmix.connected) { try { await f.onPoll(this.snap, prev); } catch (e) { this.log(f.name + ' poll error: ' + e.message); } }
      }
      this.changed();
      this.pollTimer = setTimeout(tick, this.store.config.pollMs || 250);
    };
    tick();
    for (const f of Object.values(this.features)) if (f.init) f.init();
  }
  stop() { clearTimeout(this.pollTimer); for (const f of Object.values(this.features)) if (f.stop) f.stop(); }

  state() {
    const s = {
      v: this.version,
      show: { name: this.show.name, list: this.store.listShows() },
      vmix: { connected: this.vmix.connected, host: this.vmix.host, port: this.vmix.port, error: this.vmix.lastError, version: this.snap ? this.snap.version : '', edition: this.snap ? this.snap.edition : '' },
      config: { beginner: !!this.store.config.beginner, driveRoot: this.store.config.driveRoot, driveFound: fs.existsSync(this.store.config.driveRoot), oscPort: this.store.config.oscPort, oscFeedback: this.store.config.oscFeedback, port: this.store.config.port, host: os.hostname() },
      tally: this.snap ? { preview: this.inputName(this.snap.preview), program: this.inputName(this.snap.active), recording: this.snap.recording, recordingDuration: this.snap.recordingDuration, streaming: this.snap.streaming } : null,
      inputs: this.inputs().map((i) => ({ key: i.key, number: i.number, title: i.title, type: i.type })),
      layout: this.show.layout || {}, sport: this.show.sport || '',
      log: this.logLines.slice(-30),
    };
    for (const [k, f] of Object.entries(this.features)) s[k] = f.state();
    return s;
  }
  inputName(n) { const i = this.inputByNumber(n); return i ? i.title : ''; }
}

module.exports = { Engine };
