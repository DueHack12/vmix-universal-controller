'use strict';
/**
 * Music: plays from the linked vMix List input ("music" job).
 * Playlists = sub-folders of <Drive>\Music plus playlists saved in the show.
 *
 * The vMix MUSIC list holds every song of the chosen playlist; UC selects the song to play
 * (SelectIndex) instead of loading one file at a time. vMix's "Auto Next" must be OFF on that
 * list: UC decides what comes next.
 *  - Single mode: a song plays once. After it ends (or FADE OUT / KILL): 'restart' (same song
 *    back to 0:00) or 'next' (next song selected, paused).
 *  - Playlist mode: when a song ends, UC starts the next one (the queue first, then the list).
 * Songs queued from another playlist are added to the end of the vMix list.
 * Switching playlist while a song plays changes the vMix list when that song stops.
 */
const path = require('path');
const L = require('../vmixlist');

module.exports = (engine) => {
  const cfg = () => engine.show.music;
  let songs = [];            // scanned songs of the current playlist
  let scanning = false;
  let queue = [];            // paths waiting (UC side)
  let now = '';              // path selected in vMix
  let fadeTimer = null;
  let ducked = false;
  let lastScan = 0;
  let wasRunning = false;
  let listPending = false;   // the vMix list still holds the previous playlist (a song was playing)
  let advancing = false;
  const sel = new L.Selection();

  const musicRoot = () => engine.driveDir('Music');
  const inp = () => engine.input('music');
  const isSaved = (name) => !!(cfg().playlists || {})[name];

  /** folder playlists are cached and refreshed in the background (Drive can be slow); rescan() reads them fresh */
  function playlists(folders = engine.cached('musicFolders:' + musicRoot(), 10000, () => engine.media.subfoldersAsync(musicRoot()), [])) {
    const saved = Object.keys(cfg().playlists || {});
    return [...folders.map((n) => ({ name: n, kind: 'folder' })), ...saved.map((n) => ({ name: n, kind: 'saved' }))];
  }
  async function rescan() {
    if (scanning) return; scanning = true;
    try {
      let name = cfg().folder;
      const fresh = await engine.media.subfoldersAsync(musicRoot());
      engine.setCached('musicFolders:' + musicRoot(), fresh);
      const pls = playlists(fresh);
      if (!name || !pls.some((p) => p.name === name)) name = cfg().folder = pls.length ? pls[0].name : '';
      if (isSaved(name)) {
        const paths = cfg().playlists[name];
        songs = [];
        for (const p of paths) { const d = await engine.media.duration(p); songs.push({ path: p, name: path.basename(p).replace(/\.[^.]+$/, ''), seconds: d.seconds }); }
        engine.media.flush();
      } else songs = name ? await engine.media.scan(path.join(musicRoot(), name), 'audio') : [];
      lastScan = Date.now();
    } finally { scanning = false; engine.changed(); }
    await syncList();
  }

  const nameOf = (p) => (p ? path.basename(p).replace(/\.[^.]+$/, '') : '');
  const songPaths = () => songs.map((s) => s.path);
  function nextInFolder(from) {
    if (!songs.length) return '';
    const i = songs.findIndex((s) => L.norm(s.path) === L.norm(from));
    return songs[(i + 1) % songs.length].path;
  }
  function prevInFolder(from) {
    if (!songs.length) return '';
    const i = songs.findIndex((s) => L.norm(s.path) === L.norm(from));
    return songs[(i - 1 + songs.length) % songs.length].path;
  }
  const playing = () => { const i = inp(); return !!(i && i.state === 'Running'); };

  /** put the current playlist into the vMix list (later, if a song is playing and `force` is false) */
  async function syncList(force = false) {
    const i = inp(); if (!i || !songs.length) return;
    const r = await L.sync(engine, i, songPaths(), { canRebuild: force || !playing() });
    listPending = r === 'deferred';
    if (r === 'appended' || r === 'rebuilt') {
      await engine.refresh();
      if (r === 'rebuilt') { // keep the same song selected if it is in the new list
        const cur = inp(); const k = L.indexOf(cur, now);
        if (k) { sel.expect(k); await engine.fn('SelectIndex', { Input: cur.key, Value: k }); } else now = songs[0].path;
        await engine.refresh();
      }
    }
  }
  /** select a song in the vMix list (adding it at the end if it isn't there); returns the input */
  async function select(p) {
    let i = inp(); if (!i) return null;
    if (listPending && !playing()) await syncList(true);
    i = inp();
    let k = L.indexOf(i, p);
    if (!k) { await engine.fn('ListAdd', { Input: i.key, Value: p }); await engine.refresh(); i = inp(); k = L.indexOf(i, p); }
    if (!k) return null;
    sel.expect(k); await engine.fn('SelectIndex', { Input: i.key, Value: k }); // always: the snapshot may be a moment old
    now = p;
    return i;
  }

  async function playTrack(p, { fadeIn = false } = {}) {
    if (!inp()) return { ok: false, error: 'Music player not linked' };
    if (!p) return { ok: false, error: 'No song to play' };
    clearTimeout(fadeTimer);
    queue = queue.filter((q) => L.norm(q) !== L.norm(p));
    if (listPending) await syncList(true); // the operator picked a song: switch to the new playlist now
    const i = await select(p); if (!i) return { ok: false, error: 'Could not find that song in the vMix list' };
    await engine.fn('SetVolume', { Input: i.key, Value: fadeIn ? 0 : cfg().level });
    await engine.fn('Play', { Input: i.key });
    if (fadeIn) await engine.fn('SetVolumeFade', { Input: i.key, Value: cfg().level + ',' + cfg().fadeMs });
    return { ok: true };
  }
  function candidate() { return queue[0] || nextInFolder(now) || (songs[0] && songs[0].path) || ''; }

  /** after a stop/fade/kill or the end of a song in Single mode */
  async function afterStop() {
    const i = inp(); if (!i) return;
    if (listPending) await syncList(true);
    if (cfg().after === 'restart' || !candidate()) {
      await engine.fn('SetPosition', { Input: inp().key, Value: 0 });
    } else {
      const c = candidate(); queue = queue.filter((q) => L.norm(q) !== L.norm(c));
      await select(c);
    }
    await engine.fn('SetVolume', { Input: inp().key, Value: cfg().level });
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
    if (!i.list.length || !L.indexOf(i, now)) return playTrack(candidate(), { fadeIn: true });
    await engine.fn('SetVolume', { Input: i.key, Value: 0 });
    await engine.fn('Play', { Input: i.key });
    await engine.fn('SetVolumeFade', { Input: i.key, Value: cfg().level + ',' + cfg().fadeMs });
    return { ok: true };
  }
  /** play what is selected now (or the next candidate when nothing usable is selected) */
  async function resume() {
    const i = inp(); if (!i) return { ok: false, error: 'Music player not linked' };
    if (!i.list.length || !L.indexOf(i, now) || listPending) return playTrack(now && L.indexOf(i, now) && !listPending ? now : candidate());
    await engine.fn('SetVolume', { Input: i.key, Value: cfg().level });
    return engine.fn('Play', { Input: i.key });
  }

  engine.cmd('music.toggle', async () => {
    const i = inp(); if (!i) return { ok: false, error: 'Music player not linked' };
    if (playing()) { clearTimeout(fadeTimer); return engine.fn('Pause', { Input: i.key }); }
    return resume();
  });
  engine.cmd('music.play', async ({ path: p } = {}) => {
    if (p) return playTrack(p);
    if (!inp()) return { ok: false, error: 'Music player not linked' };
    if (playing()) return { ok: true };
    return resume();
  });
  engine.cmd('music.pause', () => { const i = inp(); return i ? engine.fn('Pause', { Input: i.key }) : { ok: false }; });
  engine.cmd('music.fadeout', ({ ms } = {}) => fadeOut(ms !== undefined ? Number(ms) : undefined));
  engine.cmd('music.fadein', ({ level } = {}) => fadeIn(level));
  engine.cmd('music.kill', async () => { const i = inp(); if (!i) return { ok: false }; clearTimeout(fadeTimer); await engine.fn('Pause', { Input: i.key }); await afterStop(); return { ok: true }; });
  engine.cmd('music.next', async () => {
    if (!inp()) return { ok: false };
    const c = candidate();
    if (playing()) return playTrack(c);
    queue = queue.filter((q) => L.norm(q) !== L.norm(c));
    await select(c); return { ok: true };
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
  engine.cmd('music.queue', ({ path: p }) => { if (p && !queue.some((q) => L.norm(q) === L.norm(p))) queue.push(p); return { ok: true }; });
  engine.cmd('music.unqueue', ({ index }) => { queue.splice(Number(index), 1); return { ok: true }; });
  engine.cmd('music.moveQueue', ({ from, to }) => { const [x] = queue.splice(Number(from), 1); if (x) queue.splice(Number(to), 0, x); return { ok: true }; });
  engine.cmd('music.clearQueue', () => { queue = []; return { ok: true }; });
  engine.cmd('music.savePlaylist', ({ name }) => {
    if (!name) return { ok: false, error: 'Name needed' };
    const items = [now, ...queue].filter(Boolean);
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
    onLinks(job) { if (job === 'music') syncList(); },
    async onPoll(snap) {
      if (Date.now() - lastScan > 120000) rescan();
      const i = inp(); if (!i) return;
      const selItem = i.list.find((it) => it.selected);
      if (selItem && !advancing) now = selItem.path;
      const firstWarn = !sel.autoNextSeen;
      if (sel.check(i) && firstWarn) engine.log('Music: vMix moved to the next song by itself. Turn OFF "Auto Next" on the MUSIC list in vMix (right-click › Edit Items).');
      const running = i.state === 'Running';
      const ended = wasRunning && !running && i.duration > 0 && i.position >= i.duration - 400;
      wasRunning = running;
      if (ended && !advancing) {
        advancing = true;
        try {
          if (cfg().mode === 'playlist' && candidate()) await playTrack(candidate());
          else await afterStop();
        } finally { advancing = false; }
      } else if (listPending && !running && !advancing) await syncList();
      // auto-duck under videos
      const vid = engine.input('videos');
      const videoLive = cfg().duck !== false && !!(vid && snap.active === vid.number && vid.state === 'Running');
      if (videoLive && !ducked && running) { ducked = true; await engine.fn('SetVolumeFade', { Input: i.key, Value: '0,500' }); }
      else if (!videoLive && ducked) { ducked = false; if (playing()) await engine.fn('SetVolumeFade', { Input: i.key, Value: cfg().level + ',' + cfg().fadeMs }); }
    },
    state() {
      const i = inp();
      const pos = i ? i.position : 0; const dur = i ? i.duration : 0;
      const upNext = queue.slice();
      const next = upNext[0] || (cfg().after === 'restart' && cfg().mode !== 'playlist' ? '' : nextInFolder(now));
      return {
        linked: !!i, playing: playing(), now: nameOf(now), nowPath: now,
        position: Math.round(pos / 1000), duration: Math.round(dur / 1000), remaining: Math.max(0, Math.round((dur - pos) / 1000)),
        level: cfg().level, duck: cfg().duck !== false, savedPlaylists: Object.keys(cfg().playlists || {}), volume: i ? Math.round(engine.faderOf(i.volume)) : 0, fadeMs: cfg().fadeMs, after: cfg().after, mode: cfg().mode, ducked,
        playlist: cfg().folder, playlists: playlists(), scanning,
        vmixCount: i ? i.list.length : 0, listPending, autoNextWarn: sel.autoNextSeen,
        songs: songs.map((s) => ({ path: s.path, name: s.name, seconds: s.seconds, queued: queue.some((q) => L.norm(q) === L.norm(s.path)), now: L.norm(s.path) === L.norm(now) })),
        queue: upNext.map((p) => ({ path: p, name: nameOf(p), local: true })),
        next: nameOf(next), nextIsRestart: cfg().after === 'restart' && cfg().mode !== 'playlist' && !upNext.length,
      };
    },
  };
};
