'use strict';
/**
 * Ads: the Ad Manager built in.
 * Library from <Drive>\Ads (bucket folders, loose folder, sponsor folders), named break
 * playlists (Pregame, Q1, Halftime...), random fill, the vMix ADS list, GO TO AD BREAK
 * (countdown -> music fades -> ads cued to Preview -> plays when the director takes it),
 * timers, SKIP, BACK TO GAME and a played-ads log for sponsors.
 */
const fs = require('fs');
const path = require('path');
const { buildBreak, fillSize } = require('../adlogic');

const norm = (p) => String(p || '').replace(/\//g, '\\').toLowerCase().trim();

module.exports = (engine) => {
  const cfg = () => engine.show.ads;
  let library = [];       // [{ path, name, folder, kind, folderSeconds, actualSeconds, source, inBuckets }]
  let status = { basePath: '', found: false, missing: [] };
  let scanning = false;
  let sel = null;         // selected break id
  let phase = 'idle';     // idle | count | cued | break | done
  let count = 0; let countTimer = null;
  let current = null;     // { id, startedAt, lastIndex }
  let history = [];       // [[paths of a played break], ...] newest last
  let sponsorsPlayed = new Set();
  let played = [];        // [{ time, name, break }]
  let csvQueue = Promise.resolve();

  const basePath = () => cfg().basePath || engine.driveDir('Ads');
  const adsInput = () => engine.input('ads');
  const breaks = () => cfg().breaks;
  const findBreak = (id) => breaks().find((b) => b.id === id) || null;
  const selBreak = () => findBreak(sel) || breaks().find((b) => !b.played) || breaks()[0] || null;
  const libByPath = (p) => library.find((a) => norm(a.path) === norm(p));
  const secsOf = (p) => { const a = libByPath(p); return a ? (a.actualSeconds || a.folderSeconds || 0) : 0; };

  async function rescan() {
    if (scanning) return; scanning = true;
    try {
      const base = basePath(); const out = []; const missing = [];
      const add = async (folder, kind, folderSeconds, inBuckets) => {
        let dir = path.join(base, ...folder.split(/[\\/]/));
        // old Ad Manager layout keeps sponsor folders at the top (ADS 25-26\NFHS)
        if (!fs.existsSync(dir) && kind === 'sponsor') dir = path.join(base, folder.split(/[\\/]/).pop());
        if (!fs.existsSync(dir)) { missing.push(folder); return; }
        for (const f of await engine.media.scan(dir, 'video')) {
          out.push({ path: f.path, name: f.name, folder, kind, folderSeconds: folderSeconds || Math.round(f.seconds || 30), actualSeconds: f.seconds ? Math.round(f.seconds * 10) / 10 : null, source: f.source, inBuckets: !!inBuckets });
        }
      };
      for (const f of cfg().folders) await add(f.name, 'bucket', f.seconds, true);
      if (cfg().looseFolder) await add(cfg().looseFolder, 'loose', 0, true);
      for (const s of cfg().sponsorFolders) await add(s.name, 'sponsor', 0, s.inBuckets);
      library = out;
      status = { basePath: base, found: fs.existsSync(base), missing };
      if (library.length) for (const b of breaks()) if (!b.items.length && !b.played) fill(b); // first run: fill empty break playlists
    } finally { scanning = false; engine.changed(); }
  }

  function recentSet() {
    const n = cfg().skipRecentBreaks || 0;
    return new Set(history.slice(-n).flat().map(norm).map((p) => (libByPath(p) || {}).path).filter(Boolean));
  }
  function fill(b, target) {
    const idx = breaks().indexOf(b) + 1;
    const rules = cfg().sponsorFolders.map((s) => ({ folder: s.name, every: s.every, oncePerGame: s.oncePerGame }));
    const picked = buildBreak(library, target || b.target, { breakNumber: idx, sponsorRules: rules, sponsorsPlayed, recent: recentSet() });
    b.items = picked.map((a) => a.path);
    if (target) b.target = target;
    engine.save();
  }

  async function sendToVmix(b, mode = 'replace') {
    const i = adsInput(); if (!i) return { ok: false, error: 'Ads player not linked' };
    if (mode === 'replace') await engine.fn('ListRemoveAll', { Input: i.key });
    for (const p of b.items) { await engine.fn('ListAdd', { Input: i.key, Value: p }); await new Promise((r) => setTimeout(r, 80)); }
    await engine.fn('SelectIndex', { Input: i.key, Value: 1 });
    return { ok: true };
  }
  function listMatches(b) {
    const i = adsInput(); if (!i || !b) return false;
    const a = i.list.map((x) => norm(x.path)); const w = b.items.map(norm);
    return a.length === w.length && a.every((x, k) => x === w[k]);
  }

  function logPlayed(p, b) {
    const time = new Date();
    played.push({ time: time.toLocaleTimeString(), name: path.basename(p).replace(/\.[^.]+$/, ''), break: b ? b.name : '' });
    if (played.length > 300) played.shift();
    const a = libByPath(p);
    if (a && a.kind === 'sponsor') sponsorsPlayed.add(a.folder);
    // CSV on the Drive, written in the background and in order (a slow Drive must not freeze the break)
    const dir = engine.driveDir('Exports');
    const file = path.join(dir, 'ads-played-' + time.toISOString().slice(0, 10) + '.csv');
    const line = [time.toISOString(), engine.show.name, b ? b.name : '', path.basename(p), a ? a.folder : ''].map((v) => '"' + String(v).replace(/"/g, '""') + '"').join(',') + '\r\n';
    csvQueue = csvQueue.then(async () => {
      if (!(await fs.promises.stat(dir).then((st) => st.isDirectory(), () => false))) return;
      const isNew = await fs.promises.access(file).then(() => false, () => true);
      await fs.promises.appendFile(file, (isNew ? 'time,show,break,file,folder\r\n' : '') + line);
    }).catch((e) => engine.log('Could not write ads log: ' + e.message));
  }

  async function startBreak() {
    const b = selBreak(); if (!b) return;
    const i = adsInput(); if (!i) { phase = 'idle'; engine.log('GO TO AD BREAK: ads player not linked'); return; }
    const music = engine.features.music;
    if (music && music.state().playing) await music.fadeOut(cfg().musicOnGo.fadeMs);
    if (!b.items.length) fill(b);
    if (!listMatches(b)) await sendToVmix(b);
    await engine.fn('SelectIndex', { Input: i.key, Value: 1 });
    await engine.fn('PreviewInput', { Input: i.key });
    current = { id: b.id, startedAt: 0, lastIndex: 0 };
    phase = 'cued';
    engine.changed();
  }

  engine.cmd('ads.go', ({ id } = {}) => {
    if (phase === 'count' || phase === 'cued' || phase === 'break') return { ok: false, error: 'A break is already running' };
    if (id) sel = id;
    if (!selBreak()) return { ok: false, error: 'No break playlist' };
    count = Number(cfg().countdown) || 0;
    clearInterval(countTimer);
    if (count <= 0) { startBreak(); return { ok: true }; }
    phase = 'count';
    countTimer = setInterval(() => {
      count--;
      if (count <= 0) { clearInterval(countTimer); startBreak(); }
      engine.changed();
    }, 1000);
    return { ok: true };
  });
  engine.cmd('ads.cancel', () => { clearInterval(countTimer); if (phase === 'count') phase = 'idle'; return { ok: true }; });
  engine.cmd('ads.skip', async () => {
    const i = adsInput(); if (!i) return { ok: false };
    if ((i.selectedIndex || 1) >= i.list.length) { await engine.fn('Pause', { Input: i.key }); phase = 'done'; return { ok: true }; }
    return engine.fn('NextItem', { Input: i.key });
  });
  engine.cmd('ads.back', async () => {
    clearInterval(countTimer);
    const i = adsInput(); const btg = cfg().backToGame || {};
    if (i && btg.stopAds !== false) await engine.fn('Pause', { Input: i.key });
    const cam = engine.input('gameCam');
    if (cam) await engine.fn(btg.action === 'cut' ? 'CutDirect' : 'PreviewInput', { Input: cam.key });
    const music = engine.features.music;
    if (music) await music.fadeIn(btg.musicLevel ?? engine.show.music.level);
    const b = current ? findBreak(current.id) : null;
    if (b && (phase === 'break' || phase === 'done')) {
      b.played = true; history.push(b.items.slice()); engine.save();
      const nextB = breaks().find((x) => !x.played); if (nextB) sel = nextB.id;
    }
    phase = 'idle'; current = null;
    return { ok: true };
  });
  engine.cmd('ads.prev', () => { const i = adsInput(); return i ? engine.fn('PreviousItem', { Input: i.key }) : { ok: false }; });
  engine.cmd('ads.fade', ({ dir, ms }) => {
    const i = adsInput(); if (!i) return { ok: false };
    return engine.fn('SetVolumeFade', { Input: i.key, Value: (dir === 'out' ? 0 : 100) + ',' + (Number(ms) || 1500) });
  });
  engine.cmd('ads.select', ({ id }) => { if (findBreak(id)) sel = id; return { ok: true }; });
  engine.cmd('ads.fill', ({ id, seconds }) => { const b = findBreak(id) || selBreak(); if (!b) return { ok: false }; sel = b.id; fill(b, seconds ? Number(seconds) : undefined); return { ok: true }; });
  engine.cmd('ads.target', ({ id, seconds }) => { const b = findBreak(id) || selBreak(); if (!b) return { ok: false }; sel = b.id; fill(b, Number(seconds)); return { ok: true }; });
  engine.cmd('ads.addBreak', ({ name, seconds }) => {
    const id = 'b' + Date.now().toString(36);
    breaks().push({ id, name: name || 'New break', target: Number(seconds) || 120, items: [], played: false });
    sel = id; fill(findBreak(id)); return { ok: true, id };
  });
  engine.cmd('ads.removeBreak', ({ id }) => {
    cfg().breaks = breaks().filter((b) => b.id !== id);
    if (sel === id) sel = null; engine.save(); return { ok: true };
  });
  engine.cmd('ads.renameBreak', ({ id, name }) => { const b = findBreak(id); if (b && name) { b.name = name; engine.save(); } return { ok: true }; });
  engine.cmd('ads.moveBreak', ({ id, to }) => {
    const L = breaks(); const i = L.findIndex((b) => b.id === id); if (i < 0) return { ok: false };
    const [b] = L.splice(i, 1); L.splice(Math.max(0, Math.min(L.length, Number(to))), 0, b); engine.save(); return { ok: true };
  });
  engine.cmd('ads.markPlayed', ({ id, value }) => { const b = findBreak(id); if (b) { b.played = !!value; engine.save(); } return { ok: true }; });
  engine.cmd('ads.newGame', () => { for (const b of breaks()) b.played = false; sponsorsPlayed = new Set(); history = []; sel = null; engine.save(); return { ok: true }; });
  engine.cmd('ads.addItem', ({ id, path: p }) => { const b = findBreak(id) || selBreak(); if (b && p) { b.items.push(p); engine.save(); } return { ok: true }; });
  engine.cmd('ads.removeItem', ({ id, index }) => { const b = findBreak(id) || selBreak(); if (b) { b.items.splice(Number(index), 1); engine.save(); } return { ok: true }; });
  engine.cmd('ads.moveItem', ({ id, from, to }) => {
    const b = findBreak(id) || selBreak(); if (!b) return { ok: false };
    const [x] = b.items.splice(Number(from), 1); if (x) b.items.splice(Number(to), 0, x); engine.save(); return { ok: true };
  });
  engine.cmd('ads.swapItem', ({ id, index }) => {
    const b = findBreak(id) || selBreak(); if (!b) return { ok: false };
    const old = libByPath(b.items[Number(index)]); if (!old) return { ok: false };
    const size = fillSize(old);
    const pool = library.filter((a) => a.kind !== 'sponsor' && !b.items.some((p) => norm(p) === norm(a.path)) && fillSize(a) <= size);
    if (!pool.length) return { ok: false, error: 'No other ad fits' };
    pool.sort((x, y) => fillSize(y) - fillSize(x));
    const best = pool.filter((a) => fillSize(a) === fillSize(pool[0]));
    b.items[Number(index)] = best[Math.floor(Math.random() * best.length)].path; engine.save(); return { ok: true };
  });
  engine.cmd('ads.send', async ({ id, mode }) => { const b = findBreak(id) || selBreak(); if (!b) return { ok: false }; return sendToVmix(b, mode === 'append' ? 'append' : 'replace'); });
  engine.cmd('ads.rescan', async () => { await rescan(); return { ok: true }; });
  engine.cmd('ads.folders', ({ folders, looseFolder, sponsorFolders }) => {
    if (Array.isArray(folders)) cfg().folders = folders.filter((f) => f && f.name).map((f) => ({ name: String(f.name).trim(), seconds: Number(f.seconds) || 30 }));
    if (looseFolder !== undefined) cfg().looseFolder = String(looseFolder).trim();
    if (Array.isArray(sponsorFolders)) cfg().sponsorFolders = sponsorFolders.filter((f) => f && f.name).map((f) => ({ name: String(f.name).trim(), inBuckets: !!f.inBuckets, every: Number(f.every) || 0, oncePerGame: !!f.oncePerGame }));
    engine.save(); return rescan().then(() => ({ ok: true }));
  });
  engine.cmd('ads.settings', (a) => {
    if (a.countdown !== undefined) cfg().countdown = Math.max(0, Number(a.countdown) || 0);
    if (a.skipRecentBreaks !== undefined) cfg().skipRecentBreaks = Math.max(0, Number(a.skipRecentBreaks) || 0);
    if (a.backAction) cfg().backToGame.action = a.backAction === 'cut' ? 'cut' : 'preview';
    if (a.backMusicLevel !== undefined) cfg().backToGame.musicLevel = Number(a.backMusicLevel);
    if (a.basePath !== undefined) cfg().basePath = String(a.basePath).trim();
    engine.save(); return { ok: true };
  });

  return {
    name: 'ads',
    init() { rescan(); },
    onShow() { phase = 'idle'; sel = null; rescan(); },
    onConfig() { rescan(); },
    onPoll(snap) {
      const i = adsInput(); if (!i) return;
      const b = current ? findBreak(current.id) : null;
      if (phase === 'cued' && snap.active === i.number) {
        engine.fn('Play', { Input: i.key });
        phase = 'break'; current.startedAt = Date.now(); current.lastIndex = 0;
      }
      if (phase === 'break') {
        const idx = i.selectedIndex || 1;
        if (idx !== current.lastIndex && i.list[idx - 1]) { current.lastIndex = idx; logPlayed(i.list[idx - 1].path, b); }
        const atEnd = idx >= i.list.length && i.state !== 'Running' && i.duration > 0 && i.position >= i.duration - 400;
        if (atEnd) phase = 'done';
      }
    },
    state() {
      const b = selBreak();
      const i = adsInput();
      let timer = null;
      if ((phase === 'break' || phase === 'done' || phase === 'cued') && i && b) {
        const idx = Math.max(1, i.selectedIndex || 1);
        const items = i.list.map((x) => x.path);
        const adLeft = phase === 'done' ? 0 : Math.max(0, Math.round((i.duration - i.position) / 1000));
        const rest = items.slice(idx).reduce((s, p) => s + secsOf(p), 0);
        timer = {
          index: idx, count: items.length, name: items[idx - 1] ? path.basename(items[idx - 1]).replace(/\.[^.]+$/, '') : '',
          next: items[idx] ? path.basename(items[idx]).replace(/\.[^.]+$/, '') : '',
          adLeft, breakLeft: Math.round(adLeft + rest),
          segments: items.map((p, k) => (k < idx - 1 ? 1 : k > idx - 1 ? 0 : i.duration ? Math.min(1, i.position / i.duration) : 0)),
        };
      }
      return {
        phase, count, timer, scanning, status,
        selected: b ? b.id : null,
        listMatches: listMatches(b),
        vmixCount: i ? i.list.length : 0,
        linked: !!i,
        folders: cfg().folders, looseFolder: cfg().looseFolder, sponsorFolders: cfg().sponsorFolders,
        countdown: cfg().countdown, skipRecentBreaks: cfg().skipRecentBreaks, basePathSetting: cfg().basePath || '',
        backToGame: cfg().backToGame,
        gameCam: (engine.input('gameCam') || {}).title || '',
        breaks: breaks().map((x) => ({ id: x.id, name: x.name, target: x.target, played: x.played, count: x.items.length, total: Math.round(x.items.reduce((s, p) => s + secsOf(p), 0)) })),
        items: b ? b.items.map((p, k) => {
          const a = libByPath(p);
          let st = 'queued';
          if (current && current.id === b.id && (phase === 'break' || phase === 'done') && i) {
            const idx = i.selectedIndex || 1;
            st = k < idx - 1 || phase === 'done' ? 'done' : k === idx - 1 ? 'now' : k === idx ? 'next' : 'queued';
          }
          return { index: k, path: p, name: a ? a.name : path.basename(p).replace(/\.[^.]+$/, ''), folder: a ? a.folder : '?', kind: a ? a.kind : 'missing', seconds: a ? a.actualSeconds : null, estimated: !a || a.source === 'filename' || a.source === 'none', state: st };
        }) : [],
        library: library.map((a) => ({ path: a.path, name: a.name, folder: a.folder, kind: a.kind, seconds: a.actualSeconds, estimated: a.source === 'filename' || a.source === 'none' })),
        played: played.slice(-50),
      };
    },
  };
};
