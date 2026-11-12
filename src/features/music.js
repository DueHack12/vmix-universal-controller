'use strict';
/**
 * Music: plays from the linked vMix List input ("music" job).
 * Playlists = sub-folders of <Drive>\Music plus playlists saved in the show.
 * Single mode: one song in the vMix list. Playlist mode: the queue goes into the vMix list
 * and vMix plays it back-to-back with no gaps.
 * After a stop/fade/kill: 'restart' (same song from 0:00) or 'next' (next track loaded, paused).
 */
const path = require('path');

module.exports = (engine) => {
  const cfg = () => engine.show.music;
  let songs = [];            // scanned songs of the current playlist
  let scanning = false;
  let queue = [];            // paths waiting (local)
  let now = '';              // path loaded in vMix
  let fadeTimer = null;
  let ducked = false;
  let lastScan = 0;

  const musicRoot = () => engine.driveDir('Music');
  const inp = () => engine.input('music');
  const isSaved = (name) => !!(cfg().playlists || {})[name];

  function playlists() {
    const folders = engine.media.subfolders(musicRoot());
    const saved = Object.keys(cfg().playlists || {});
    return [...folders.map((n) => ({ name: n, kind: 'folder' })), ...saved.map((n) => ({ name: n, kind: 'saved' }))];
  }
  async function rescan() {
    if (scanning) return; scanning = true;
    try {
      let name = cfg().folder;
      const pls = playlists();
      if (!name || !pls.some((p) => p.name === name)) name = cfg().folder = pls.length ? pls[0].name : '';
      if (isSaved(name)) {
        const paths = cfg().playlists[name];
        songs = [];
        for (const p of paths) { const d = await engine.media.duration(p); songs.push({ path: p, name: path.basename(p).replace(/\.[^.]+$/, ''), seconds: d.seconds }); }
        engine.media.flush();
      } else songs = name ? await engine.media.scan(path.join(musicRoot(), name), 'audio') : [];
      lastScan = Date.now();
    } finally { scanning = false; engine.changed(); }
  }

  const nameOf = (p) => (p ? path.basename(p).replace(/\.[^.]+$/, '') : '');
  function nextInFolder(from) {
    if (!songs.length) return '';
    const i = songs.findIndex((s) => s.path === from);
    return songs[(i + 1) % songs.length].path;
  }
  function prevInFolder(from) {
    if (!songs.length) return '';
    const i = songs.findIndex((s) => s.path === from);
    return songs[(i - 1 + songs.length) % songs.length].path;
  }
  const playing = () => { const i = inp(); return !!(i && i.state === 'Running'); };
  /** items after the current one inside the vMix list (playlist mode) */
  function vmixRest() {
    const i = inp(); if (!i || !i.list.length) return [];
    return i.list.filter((it) => it.index > (i.selectedIndex || 1)).map((it) => it.path);
  }

  async function loadList(paths) {
    const i = inp(); if (!i) return { ok: false, error: 'Music player not linked' };
    await engine.fn('ListRemoveAll', { Input: i.key });
    for (const p of paths) await engine.fn('ListAdd', { Input: i.key, Value: p });
    await engine.fn('SelectIndex', { Input: i.key, Value: 1 });
    now = paths[0] || '';
    return { ok: true };
  }
  async function playTrack(p, { fadeIn = false } = {}) {
    const i = inp(); if (!i) return { ok: false, error: 'Music player not linked' };
    if (!p) return { ok: false, error: 'No song to play' };
    clearTimeout(fadeTimer);
    queue = queue.filter((q) => q !== p);
    let items = [p];
    if (cfg().mode === 'playlist') { items = [p, ...queue]; queue = []; }
    await loadList(items);
    await engine.fn('SetVolume', { Input: i.key, Value: fadeIn ? 0 : cfg().level });
    await engine.fn('Play', { Input: i.key });
    if (fadeIn) await engine.fn('SetVolumeFade', { Input: i.key, Value: cfg().level + ',' + cfg().fadeMs });
    return { ok: true };
  }
  function candidate() { return queue[0] || nextInFolder(now) || (songs[0] && songs[0].path) || ''; }

  async function afterStop() {
    const i = inp(); if (!i) return;
    if (cfg().after === 'restart' || !candidate()) {
      await engine.fn('SetPosition', { Input: i.key, Value: 0 });
    } else {
      const c = candidate(); queue = queue.filter((q) => q !== c);
      await loadList([c]);
    }
    await engine.fn('SetVolume', { Input: i.key, Value: cfg().level });
  }
  async function fadeOut(ms) {
    const i = inp(); if (!i) return { ok: false, error: 'Music player not linked' };
    clearTimeout(fadeTimer);
    const dur = ms ?? cfg().fadeMs;
    if (!dur) { await engine.fn('Pause', { Input: i.key }); await afterStop(); return { ok: true }; }
    await engine.fn('SetVolumeFade', { Input: i.key, Value: '0,' + dur });
    fadeTimer = setTimeout(async () => { await engine.fn('Pause', { Input: i.key }); await afterStop(); engine.changed(); }, dur + 120);
    return { ok: true };
  }
  async function fadeIn(level) {
    const i = inp(); if (!i) return { ok: false, error: 'Music player not linked' };
    clearTimeout(fadeTimer);
    if (level !== undefined) cfg().level = Number(level);
    if (!i.list.length) return playTrack(candidate(), { fadeIn: true });
    await engine.fn('SetVolume', { Input: i.key, Value: 0 });
    await engine.fn('Play', { Input: i.key });
    await engine.fn('SetVolumeFade', { Input: i.key, Value: cfg().level + ',' + cfg().fadeMs });
    return { ok: true };
  }

  engine.cmd('music.toggle', async () => {
    const i = inp(); if (!i) return { ok: false, error: 'Music player not linked' };
    if (playing()) { clearTimeout(fadeTimer); return engine.fn('Pause', { Input: i.key }); }
    if (!i.list.length) return playTrack(candidate());
    await engine.fn('SetVolume', { Input: i.key, Value: cfg().level });
    return engine.fn('Play', { Input: i.key });
  });
  engine.cmd('music.play', async ({ path: p } = {}) => {
    if (p) return playTrack(p);
    const i = inp(); if (!i) return { ok: false, error: 'Music player not linked' };
    if (playing()) return { ok: true };
    if (!i.list.length) return playTrack(candidate());
    await engine.fn('SetVolume', { Input: i.key, Value: cfg().level });
    return engine.fn('Play', { Input: i.key });
  });
  engine.cmd('music.pause', () => { const i = inp(); return i ? engine.fn('Pause', { Input: i.key }) : { ok: false }; });
  engine.cmd('music.fadeout', ({ ms } = {}) => fadeOut(ms !== undefined ? Number(ms) : undefined));
  engine.cmd('music.fadein', ({ level } = {}) => fadeIn(level));
  engine.cmd('music.kill', async () => { const i = inp(); if (!i) return { ok: false }; clearTimeout(fadeTimer); await engine.fn('Pause', { Input: i.key }); await afterStop(); return { ok: true }; });
  engine.cmd('music.next', async () => {
    const i = inp(); if (!i) return { ok: false };
    if (cfg().mode === 'playlist' && vmixRest().length) return engine.fn('NextItem', { Input: i.key });
    const c = candidate(); return playTrack(c);
  });
  engine.cmd('music.prev', () => playTrack(prevInFolder(now) || now));
  engine.cmd('music.level', async ({ value, ms, step }) => {
    const rel = step !== undefined ? Number(step) : (typeof value === 'string' && /^[+-]/.test(value) ? Number(value) : null);
    const v = Math.max(0, Math.min(100, rel !== null ? cfg().level + rel : Number(value)));
    cfg().level = v; engine.save();
    const i = inp(); if (!i) return { ok: false };
    if (playing()) return engine.fn('SetVolumeFade', { Input: i.key, Value: v + ',' + (ms !== undefined ? Number(ms) : cfg().fadeMs) });
    return engine.fn('SetVolume', { Input: i.key, Value: v });
  });
  engine.cmd('music.fadeTime', ({ ms }) => { cfg().fadeMs = Math.max(0, Number(ms) || 0); engine.save(); return { ok: true }; });
  engine.cmd('music.after', ({ value }) => { cfg().after = value === 'restart' ? 'restart' : 'next'; engine.save(); return { ok: true }; });
  engine.cmd('music.mode', ({ value }) => { cfg().mode = value === 'playlist' ? 'playlist' : 'single'; engine.save(); return { ok: true }; });
  engine.cmd('music.playlist', async ({ name }) => { cfg().folder = name; engine.save(); await rescan(); return { ok: true }; });
  engine.cmd('music.queue', ({ path: p }) => { if (p && !queue.includes(p)) queue.push(p); return { ok: true }; });
  engine.cmd('music.unqueue', ({ index }) => { queue.splice(Number(index), 1); return { ok: true }; });
  engine.cmd('music.moveQueue', ({ from, to }) => { const [x] = queue.splice(Number(from), 1); if (x) queue.splice(Number(to), 0, x); return { ok: true }; });
  engine.cmd('music.clearQueue', () => { queue = []; return { ok: true }; });
  engine.cmd('music.savePlaylist', ({ name }) => {
    if (!name) return { ok: false, error: 'Name needed' };
    const items = [now, ...vmixRest(), ...queue].filter(Boolean);
    if (!items.length) return { ok: false, error: 'Queue is empty' };
    cfg().playlists = { ...(cfg().playlists || {}), [name]: [...new Set(items)] };
    engine.save(); return { ok: true };
  });
  engine.cmd('music.deletePlaylist', ({ name }) => { if (cfg().playlists) delete cfg().playlists[name]; engine.save(); return { ok: true }; });
  engine.cmd('music.duck', ({ value }) => { cfg().duck = !!Number(value) || value === true; engine.save(); return { ok: true }; });
  engine.cmd('music.rescan', async () => { await rescan(); return { ok: true }; });

  return {
    name: 'music',
    fadeOut, fadeIn,
    init() { rescan(); },
    onShow() { queue = []; now = ''; rescan(); },
    onConfig() { rescan(); },
    async onPoll(snap) {
      if (Date.now() - lastScan > 120000) rescan();
      const i = inp(); if (!i) return;
      const sel = i.list.find((it) => it.selected);
      if (sel && sel.path !== now) now = sel.path;
      // auto-duck under videos
      const vid = engine.input('videos');
      const videoLive = cfg().duck !== false && !!(vid && snap.active === vid.number && vid.state === 'Running');
      if (videoLive && !ducked && playing()) { ducked = true; await engine.fn('SetVolumeFade', { Input: i.key, Value: '0,500' }); }
      else if (!videoLive && ducked) { ducked = false; if (playing()) await engine.fn('SetVolumeFade', { Input: i.key, Value: cfg().level + ',' + cfg().fadeMs }); }
    },
    state() {
      const i = inp();
      const pos = i ? i.position : 0; const dur = i ? i.duration : 0;
      const upNext = cfg().mode === 'playlist' ? [...vmixRest(), ...queue] : queue.slice();
      const next = upNext[0] || (cfg().after === 'restart' ? '' : nextInFolder(now));
      return {
        linked: !!i, playing: playing(), now: nameOf(now), nowPath: now,
        position: Math.round(pos / 1000), duration: Math.round(dur / 1000), remaining: Math.max(0, Math.round((dur - pos) / 1000)),
        level: cfg().level, duck: cfg().duck !== false, savedPlaylists: Object.keys(cfg().playlists || {}), volume: i ? i.volume : 0, fadeMs: cfg().fadeMs, after: cfg().after, mode: cfg().mode, ducked,
        playlist: cfg().folder, playlists: playlists(), scanning,
        songs: songs.map((s) => ({ path: s.path, name: s.name, seconds: s.seconds, queued: queue.includes(s.path), now: s.path === now })),
        queue: upNext.map((p, k) => ({ path: p, name: nameOf(p), local: k >= upNext.length - queue.length })),
        next: nameOf(next), nextIsRestart: cfg().after === 'restart' && !upNext.length,
      };
    },
  };
};
