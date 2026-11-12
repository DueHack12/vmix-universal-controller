'use strict';
/**
 * Videos: playout-server style. Folders under <Drive>\Videos, thumbnails, a queue,
 * CUE (load into the linked vMix List input and put it in Preview for the director),
 * play/pause/restart and time left. Never replaces the clip while the video input is on air.
 */
const fs = require('fs');
const path = require('path');

module.exports = (engine) => {
  const cfg = () => engine.show.videos;
  let clips = []; let scanning = false; let lastScan = 0;
  let queue = []; let cued = ''; let wasRunning = false; let pendingCue = '';

  const root = () => engine.driveDir('Videos');
  const vinp = () => engine.input('videos');
  const nameOf = (p) => (p ? path.basename(p).replace(/\.[^.]+$/, '') : '');
  const onAir = () => { const i = vinp(); return !!(i && engine.snap && engine.snap.active === i.number); };

  function folders() { return engine.media.subfolders(root()); }
  async function rescan() {
    if (scanning) return; scanning = true;
    try {
      const fl = folders();
      if (!cfg().folder || !fl.includes(cfg().folder)) cfg().folder = fl[0] || '';
      clips = cfg().folder ? await engine.media.scan(path.join(root(), cfg().folder), 'video') : [];
      for (const c of clips) engine.media.wantThumb(c.path);
      lastScan = Date.now();
    } finally { scanning = false; engine.changed(); }
  }

  async function cue(p) {
    const i = vinp(); if (!i) return { ok: false, error: 'Video clips input not linked' };
    if (!p) return { ok: false, error: 'Nothing to cue' };
    await engine.refresh(); // never decide "not on air" from a stale snapshot
    if (onAir()) { pendingCue = p; return { ok: true, waiting: true, note: 'Video is on air; it will cue when the director cuts away.' }; }
    await engine.fn('ListRemoveAll', { Input: i.key });
    await engine.fn('ListAdd', { Input: i.key, Value: p });
    await engine.fn('SelectIndex', { Input: i.key, Value: 1 });
    await engine.fn('PreviewInput', { Input: i.key });
    cued = p; pendingCue = '';
    queue = queue.filter((q) => q !== p);
    return { ok: true };
  }

  engine.cmd('video.cue', ({ path: p }) => cue(p));
  engine.cmd('video.next', () => cue(queue[0]));
  engine.cmd('video.queue', ({ path: p }) => { if (p && !queue.includes(p)) queue.push(p); return { ok: true }; });
  engine.cmd('video.unqueue', ({ index }) => { queue.splice(Number(index), 1); return { ok: true }; });
  engine.cmd('video.moveQueue', ({ from, to }) => { const [x] = queue.splice(Number(from), 1); if (x) queue.splice(Number(to), 0, x); return { ok: true }; });
  engine.cmd('video.playpause', ({ value } = {}) => {
    const i = vinp(); if (!i) return { ok: false };
    if (value === undefined) return engine.fn('PlayPause', { Input: i.key });
    return engine.fn(Number(value) ? 'Play' : 'Pause', { Input: i.key });
  });
  engine.cmd('video.jog', async ({ seconds, value }) => {
    const i = vinp(); if (!i) return { ok: false };
    await engine.refresh(); const cur = vinp();
    const d = Number(seconds ?? value) || 0;
    return engine.fn('SetPosition', { Input: cur.key, Value: Math.max(0, Math.min(cur.duration || 0, Math.round(cur.position + d * 1000))) });
  });
  engine.cmd('video.restart', () => { const i = vinp(); return i ? engine.fn('Restart', { Input: i.key }) : { ok: false }; });
  engine.cmd('video.folder', async ({ name }) => { cfg().folder = name; engine.save(); await rescan(); return { ok: true }; });
  engine.cmd('video.rescan', async () => { await rescan(); return { ok: true }; });
  engine.cmd('video.autoCue', ({ value }) => { cfg().autoCueNext = !!value; engine.save(); return { ok: true }; });

  /** Save an uploaded file into a Videos folder. Never overwrites: picks "name (2).mp4". */
  function uploadTarget(folder, fileName) {
    const dir = path.join(root(), folder || cfg().folder || 'Highlights');
    fs.mkdirSync(dir, { recursive: true });
    const base = path.basename(String(fileName || 'upload.mp4')).replace(/[<>:"/\\|?*]+/g, '_');
    const ext = path.extname(base); const stem = base.slice(0, base.length - ext.length);
    let target = path.join(dir, base); let n = 2;
    while (fs.existsSync(target)) target = path.join(dir, `${stem} (${n++})${ext}`);
    return target;
  }

  return {
    name: 'videos',
    uploadTarget, rescan,
    init() { rescan(); },
    onShow() { queue = []; cued = ''; rescan(); },
    onConfig() { rescan(); },
    async onPoll() {
      if (Date.now() - lastScan > 120000) rescan();
      const i = vinp(); if (!i) return;
      const sel = i.list.find((it) => it.selected);
      if (sel) cued = sel.path;
      const running = i.state === 'Running';
      const ended = wasRunning && !running && i.duration > 0 && i.position >= i.duration - 400;
      wasRunning = running;
      if (!onAir()) {
        if (pendingCue) await cue(pendingCue);
        else if (ended && cfg().autoCueNext && queue.length) await cue(queue[0]);
      }
    },
    state() {
      const i = vinp();
      const running = !!(i && i.state === 'Running');
      const live = onAir();
      return {
        linked: !!i, folder: cfg().folder, folders: folders(), scanning, autoCueNext: cfg().autoCueNext,
        now: nameOf(cued), nowPath: cued, running, onAir: live, inPreview: !!(i && engine.snap && engine.snap.preview === i.number),
        position: i ? Math.round(i.position / 1000) : 0, duration: i ? Math.round(i.duration / 1000) : 0,
        remaining: i ? Math.max(0, Math.round((i.duration - i.position) / 1000)) : 0,
        pendingCue: nameOf(pendingCue),
        clips: clips.map((c) => ({
          path: c.path, name: c.name, seconds: c.seconds, thumb: engine.media.hasThumb(c.path) ? '/api/thumb?path=' + encodeURIComponent(c.path) : '',
          status: c.path === cued ? (running ? 'playing' : live ? 'on air' : 'cued') : queue.includes(c.path) ? 'queued' : 'ready',
        })),
        queue: queue.map((p, k) => ({ index: k, path: p, name: nameOf(p), seconds: (clips.find((c) => c.path === p) || {}).seconds || null })),
      };
    },
  };
};
