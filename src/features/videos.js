'use strict';
/**
 * Videos: playout-server style. Folders under <Drive>\Videos, thumbnails, a queue (a playlist that
 * can mix clips from any folder), CUE to Preview for the director, play/pause/restart, time left.
 *
 * The vMix VIDEOS list holds every clip of the current folder plus queued clips from other
 * folders; UC selects the clip it needs (SelectIndex). vMix's "Auto Next" must be OFF on that list.
 *  - CUE: select the clip and put the input in Preview. Never while the video input is on air:
 *    then it waits until the director cuts away.
 *  - Auto-next (the queue checkbox): when a clip ends, the next queued clip plays straight away if
 *    the video is on air (a playlist on air), or is cued to Preview if it isn't.
 * Switching folder while the video is on air changes the vMix list once it's off air.
 */
const fs = require('fs');
const path = require('path');
const { VIDEO_EXT } = require('../media');
const L = require('../vmixlist');

module.exports = (engine) => {
  const cfg = () => engine.show.videos;
  let clips = []; let scanning = false; let lastScan = 0;
  let queue = []; let cued = ''; let wasRunning = false; let pendingCue = '';
  let listPending = false; let advancing = false;
  const meta = new Map(); // norm(path) -> { name, seconds } for clips seen in any folder
  const sel = new L.Selection();

  const root = () => engine.driveDir('Videos');
  const vinp = () => engine.input('videos');
  const nameOf = (p) => (p ? path.basename(p).replace(/\.[^.]+$/, '') : '');
  const onAir = () => { const i = vinp(); return !!(i && engine.snap && engine.snap.active === i.number); };
  const inQueue = (p) => queue.some((q) => L.norm(q) === L.norm(p));
  const unqueue = (p) => { queue = queue.filter((q) => L.norm(q) !== L.norm(p)); };
  /** the vMix list: every clip of the folder, then queued clips from other folders */
  function wanted() {
    const out = clips.map((c) => c.path); const have = new Set(out.map(L.norm));
    for (const q of queue) if (!have.has(L.norm(q))) { out.push(q); have.add(L.norm(q)); }
    return out;
  }

  /** folder list for the pages: cached, refreshed in the background (Drive can be slow) */
  function folders() { return engine.cached('videoFolders:' + root(), 10000, () => engine.media.subfoldersAsync(root()), []); }
  async function rescan({ folderChanged = false } = {}) {
    if (scanning) return; scanning = true;
    try {
      const fl = await engine.media.subfoldersAsync(root());
      engine.setCached('videoFolders:' + root(), fl);
      if (!cfg().folder || !fl.includes(cfg().folder)) cfg().folder = fl[0] || '';
      clips = cfg().folder ? await engine.media.scan(path.join(root(), cfg().folder), 'video') : [];
      for (const c of clips) { engine.media.wantThumb(c.path); meta.set(L.norm(c.path), { name: c.name, seconds: c.seconds }); }
      lastScan = Date.now();
    } finally { scanning = false; engine.changed(); }
    await syncList({ exact: folderChanged || listPending });
  }

  /** bring the vMix list up to date; a full rebuild waits while the video is on air */
  async function syncList({ exact = false } = {}) {
    const i = vinp(); if (!i) return;
    const want = wanted(); if (!want.length) return;
    const r = await L.sync(engine, i, want, { exact, canRebuild: !onAir() });
    listPending = r === 'deferred';
    if (r === 'appended' || r === 'rebuilt') {
      await engine.refresh();
      if (r === 'rebuilt' && cued) { const cur = vinp(); const k = L.indexOf(cur, cued); if (k) { sel.expect(k); await engine.fn('SelectIndex', { Input: cur.key, Value: k }); } }
    }
  }
  /** select a clip in the vMix list, adding it at the end if needed; returns the input */
  async function select(p) {
    let i = vinp(); if (!i) return null;
    let k = L.indexOf(i, p);
    if (!k) { await engine.fn('ListAdd', { Input: i.key, Value: p }); await engine.refresh(); i = vinp(); k = L.indexOf(i, p); }
    if (!k) return null;
    sel.expect(k); await engine.fn('SelectIndex', { Input: i.key, Value: k });
    cued = p; unqueue(p);
    return i;
  }

  async function cue(p) {
    const i = vinp(); if (!i) return { ok: false, error: 'Video clips input not linked' };
    if (!p) return { ok: false, error: 'Nothing to cue' };
    await engine.refresh(); // never decide "not on air" from a stale snapshot
    if (onAir()) { pendingCue = p; return { ok: true, waiting: true, note: 'Video is on air; it will cue when the director cuts away.' }; }
    if (listPending) await syncList({ exact: true });
    if (!(await select(p))) return { ok: false, error: 'Could not find that clip in the vMix list' };
    await engine.fn('PreviewInput', { Input: i.key });
    pendingCue = '';
    return { ok: true };
  }
  /** a clip ended: play the next queued one on air, or cue it if the video isn't on air */
  async function autoNext() {
    const next = queue[0]; if (!next) return;
    const live = onAir();
    const i = await select(next); if (!i) return;
    if (live) { await engine.fn('Play', { Input: i.key }); engine.log('Video playlist: playing ' + nameOf(next)); }
    else await engine.fn('PreviewInput', { Input: i.key });
  }

  engine.cmd('video.cue', ({ path: p }) => cue(p));
  engine.cmd('video.next', () => cue(queue[0]));
  engine.cmd('video.queue', async ({ path: p }) => {
    if (p && !inQueue(p)) { queue.push(p); if (!meta.has(L.norm(p))) meta.set(L.norm(p), { name: nameOf(p), seconds: null }); await syncList(); }
    return { ok: true };
  });
  engine.cmd('video.unqueue', ({ index }) => { queue.splice(Number(index), 1); return { ok: true }; });
  engine.cmd('video.moveQueue', ({ from, to }) => { const [x] = queue.splice(Number(from), 1); if (x) queue.splice(Number(to), 0, x); return { ok: true }; });
  engine.cmd('video.clearQueue', () => { queue = []; return { ok: true }; });
  engine.cmd('video.playpause', ({ value } = {}) => {
    const i = vinp(); if (!i) return { ok: false };
    if (value === undefined) return engine.fn('PlayPause', { Input: i.key });
    return engine.fn(Number(value) ? 'Play' : 'Pause', { Input: i.key });
  });
  engine.cmd('video.jog', async ({ seconds, value }) => {
    const cur = vinp(); if (!cur) return { ok: false };
    const d = Number(seconds ?? value) || 0;
    return engine.fn('SetPosition', { Input: cur.key, Value: Math.max(0, Math.min(cur.duration || 0, Math.round(cur.position + d * 1000))) });
  });
  engine.cmd('video.restart', () => { const i = vinp(); return i ? engine.fn('Restart', { Input: i.key }) : { ok: false }; });
  engine.cmd('video.folder', async ({ name }) => { cfg().folder = name; engine.save(); await rescan({ folderChanged: true }); return { ok: true }; });
  engine.cmd('video.rescan', async () => { await rescan(); return { ok: true }; });
  engine.cmd('video.autoCue', ({ value }) => { cfg().autoCueNext = !!Number(value) || value === true; engine.save(); return { ok: true }; });

  /**
   * Where an uploaded file goes: an existing folder under <Drive>\Videos (or Highlights when there are none yet).
   * Only video files. Never overwrites: picks "name (2).mp4". Throws with a message the operator can read.
   */
  function uploadTarget(folder, fileName) {
    const existing = engine.media.subfolders(root());
    const name = String(folder || cfg().folder || existing[0] || 'Highlights');
    if (existing.length ? !existing.includes(name) : name !== 'Highlights') throw new Error('Unknown video folder: ' + name);
    const dir = path.join(root(), name);
    if (path.dirname(path.resolve(dir)) !== path.resolve(root())) throw new Error('Unknown video folder: ' + name);
    fs.mkdirSync(dir, { recursive: true });
    const base = path.basename(String(fileName || 'upload.mp4').replace(/\\/g, '/')).replace(/[<>:"/\\|?*\x00-\x1f]+/g, '_').replace(/^\.+/, '');
    const ext = path.extname(base); const stem = base.slice(0, base.length - ext.length);
    if (!stem || !VIDEO_EXT.includes(ext.toLowerCase())) throw new Error('Only video files can be uploaded (' + VIDEO_EXT.join(' ') + ')');
    let target = path.join(dir, base); let n = 2;
    while (fs.existsSync(target)) target = path.join(dir, `${stem} (${n++})${ext}`);
    return target;
  }

  return {
    name: 'videos',
    uploadTarget, rescan,
    init() { rescan({ folderChanged: true }); },
    onShow() { queue = []; cued = ''; rescan({ folderChanged: true }); },
    onConfig() { rescan({ folderChanged: true }); },
    onLinks(job) { if (job === 'videos') syncList({ exact: true }); },
    async onPoll() {
      if (Date.now() - lastScan > 120000) rescan();
      const i = vinp(); if (!i) return;
      const s = i.list.find((it) => it.selected);
      if (s && !advancing) cued = s.path;
      const firstWarn = !sel.autoNextSeen;
      if (sel.check(i) && firstWarn) engine.log('Videos: vMix moved to the next clip by itself. Turn OFF "Auto Next" on the VIDEOS list in vMix (right-click › Edit Items).');
      const running = i.state === 'Running';
      const ended = wasRunning && !running && i.duration > 0 && i.position >= i.duration - 400;
      wasRunning = running;
      if (ended && cfg().autoCueNext && queue.length && !advancing) {
        advancing = true;
        try { await autoNext(); } finally { advancing = false; }
        return;
      }
      if (!onAir()) {
        if (listPending) await syncList({ exact: true });
        if (pendingCue) await cue(pendingCue);
      }
    },
    state() {
      const i = vinp();
      const running = !!(i && i.state === 'Running');
      const live = onAir();
      const isCued = (p) => L.norm(p) === L.norm(cued);
      const q = queue.map((p, k) => { const m = meta.get(L.norm(p)) || {}; return { index: k, path: p, name: m.name || nameOf(p), seconds: m.seconds || null, folder: path.basename(path.dirname(p)) }; });
      return {
        linked: !!i, folder: cfg().folder, folders: folders(), scanning, autoCueNext: cfg().autoCueNext,
        now: nameOf(cued), nowPath: cued, running, onAir: live, inPreview: !!(i && engine.snap && engine.snap.preview === i.number),
        position: i ? Math.round(i.position / 1000) : 0, duration: i ? Math.round(i.duration / 1000) : 0,
        remaining: i ? Math.max(0, Math.round((i.duration - i.position) / 1000)) : 0,
        pendingCue: nameOf(pendingCue), listPending, vmixCount: i ? i.list.length : 0, autoNextWarn: sel.autoNextSeen,
        clips: clips.map((c) => ({
          path: c.path, name: c.name, seconds: c.seconds, thumb: engine.media.hasThumb(c.path) ? '/api/thumb?path=' + encodeURIComponent(c.path) : '',
          status: isCued(c.path) ? (running ? 'playing' : live ? 'on air' : 'cued') : inQueue(c.path) ? 'queued' : 'ready',
        })),
        queue: q, queueSeconds: Math.round(q.reduce((t, x) => t + (x.seconds || 0), 0)),
      };
    },
  };
};
