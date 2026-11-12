'use strict';
/**
 * Settings and saved shows, kept as JSON in <app>/data (or --data <dir>).
 * Shows are also copied into the Drive "Shows" folder as a backup when it exists.
 */
const fs = require('fs');
const path = require('path');

const DEFAULT_DRIVE = 'G:\\Shared drives\\Prep Sports Broadcasting\\Broadcast Console';

function defaultConfig() {
  return {
    port: 8790,
    oscPort: 9600,
    oscFeedback: { host: '', port: 0 },
    vmix: { host: '127.0.0.1', port: 8088, user: '', password: '' },   // user/password only if set in vMix › Web Controller
    driveRoot: DEFAULT_DRIVE,
    currentShow: 'Default',
    ffmpegPath: '',
    ffprobePath: '',
    recordDrive: '',
    pollMs: 250,
    oseUrl: '',
    bridge: { host: '', port: 9500 },
    pin: '',               // '' = no PIN; else other devices must enter it (Master › Setup)
    oscAllow: [],          // [] = OSC from anyone; else only these IPs (and this PC)
    allowedHosts: [],      // extra names this PC may be opened by (besides IP, localhost, computer name)
  };
}

function defaultShow(name = 'Default') {
  return {
    name,
    sport: '',
    links: {},            // job -> vMix input key  (music, ads, videos, gameCam)
    linkTitles: {},       // job -> title at link time (fallback if key disappears)
    graphics: null,       // null = every GT input; else [{ key, name, group, overlay, hidden, fields:[{name,label,mode}] }]
    mixer: null,          // null = build from links on first run; else [{ id, name, ref }]
    liveBuses: ['M'],
    music: { folder: '', fadeMs: 2000, level: 50, after: 'next', mode: 'single', playlists: {} },
    videos: { folder: '', autoCueNext: true },
    ads: {
      basePath: '',           // '' = <driveRoot>\Ads
      folders: [{ name: '15Second', seconds: 15 }, { name: '30Second', seconds: 30 }, { name: '1Minute', seconds: 60 }, { name: '2Minutes+', seconds: 120 }],
      looseFolder: 'Unsorted',
      sponsorFolders: [{ name: 'Sponsors\\NFHS', inBuckets: false, every: 2 }, { name: 'Sponsors\\DAF', inBuckets: false, oncePerGame: true }],
      skipRecentBreaks: 2,
      countdown: 5,
      breaks: [
        { id: 'pre', name: 'Pregame', target: 180, items: [], played: false },
        { id: 'q1', name: 'Q1 break', target: 120, items: [], played: false },
        { id: 'half', name: 'Halftime', target: 300, items: [], played: false },
        { id: 'q3', name: 'Q3 break', target: 120, items: [], played: false },
        { id: 'post', name: 'Postgame', target: 180, items: [], played: false },
      ],
      backToGame: { action: 'preview', musicLevel: 50, stopAds: true },
      musicOnGo: { fadeMs: 2000 },
    },
    health: { blocks: ['vmix', 'stream', 'recording', 'disk', 'cpu', 'audio', 'sources', 'youtube', 'alerts'] },
    lists: { Announcers: [] },
    statEvents: {},
    layout: {
      vertical: { order: ['stream', 'gfx', 'video', 'ads', 'music', 'mix'], hidden: [], open: [] },
      horizontal: { order: ['gfx', 'video', 'stream', 'ads', 'music', 'mix'], hidden: [], open: [] },
    },
  };
}

function merge(base, extra) {
  if (Array.isArray(base) || Array.isArray(extra) || typeof base !== 'object' || base === null || typeof extra !== 'object' || extra === null) return extra === undefined ? base : extra;
  const out = { ...base };
  for (const k of Object.keys(extra)) out[k] = k in base ? merge(base[k], extra[k]) : extra[k];
  return out;
}

const safeName = (s) => String(s || 'Default').replace(/[^\w .()-]+/g, '_').trim() || 'Default';

class Store {
  constructor(dataDir) {
    this.dir = dataDir;
    fs.mkdirSync(path.join(dataDir, 'shows'), { recursive: true });
    fs.mkdirSync(path.join(dataDir, 'cache', 'thumbs'), { recursive: true });
    this.config = merge(defaultConfig(), this.readJson('config.json', {}));
  }
  readJson(rel, fallback) {
    try { return JSON.parse(fs.readFileSync(path.join(this.dir, rel), 'utf8')); } catch { return fallback; }
  }
  writeJson(rel, obj) {
    const p = path.join(this.dir, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    const tmp = p + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(obj, null, 2));
    fs.renameSync(tmp, p);
  }
  saveConfig() { this.writeJson('config.json', this.config); }
  listShows() {
    try { return fs.readdirSync(path.join(this.dir, 'shows')).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)); } catch { return []; }
  }
  loadShow(name) {
    const saved = this.readJson(path.join('shows', safeName(name) + '.json'), null);
    return merge(defaultShow(name), saved || {});
  }
  saveShow(show) {
    this.writeJson(path.join('shows', safeName(show.name) + '.json'), show);
    this.backupToDrive(show);
  }
  /**
   * Backup copy on the Drive (copy only; never touches anything else). Done in the background:
   * Google Drive for desktop can stall, and that must never freeze the controller.
   */
  backupToDrive(show) {
    const dir = path.join(this.config.driveRoot, 'Shows');
    const file = path.join(dir, safeName(show.name) + '.json');
    const text = JSON.stringify(show, null, 2);
    this.pendingBackup = { file, text };
    if (this.backupBusy) return;
    this.backupBusy = true;
    const next = async () => {
      const job = this.pendingBackup; this.pendingBackup = null;
      if (!job) { this.backupBusy = false; return; }
      try { if ((await fs.promises.stat(path.dirname(job.file))).isDirectory()) await fs.promises.writeFile(job.file, job.text); } catch { /* Drive not available: fine */ }
      next();
    };
    next();
  }
  deleteShow(name) {
    try { fs.unlinkSync(path.join(this.dir, 'shows', safeName(name) + '.json')); } catch { /* gone */ }
  }
  cachePath(...p) { return path.join(this.dir, 'cache', ...p); }
}

module.exports = { Store, defaultConfig, defaultShow, merge, safeName, DEFAULT_DRIVE };
