'use strict';
/**
 * Monitor thumbnails without NDI: vMix saves snapshots to disk (vMix "Snapshot" = program output
 * with overlays, "SnapshotInput" = one input), the console serves them about once a second.
 * Works only when the console runs on the vMix PC (vMix writes to its own disk). Off by default.
 */
const fs = require('fs');

module.exports = (engine) => {
  const cfg = () => engine.store.config.previews || (engine.store.config.previews = { enabled: false, everyMs: 1000 });
  const file = (name) => engine.store.cachePath('snap-' + name + '.jpg');
  let check = '';          // input key for the "check a graphic" monitor
  let timer = null; let busy = false; const stamp = {};

  async function shoot() {
    if (!cfg().enabled || busy || !engine.vmix.connected || !engine.snap) return;
    const local = ['127.0.0.1', 'localhost', '::1'].includes(String(engine.vmix.host).toLowerCase());
    if (!local) return;
    busy = true;
    try {
      await engine.fn('Snapshot', { Value: file('pgm') });
      const pv = engine.inputByNumber(engine.snap.preview);
      if (pv) await engine.fn('SnapshotInput', { Input: pv.key, Value: file('pvw') });
      if (check && engine.inputByKey(check)) await engine.fn('SnapshotInput', { Input: check, Value: file('chk') });
      for (const n of ['pgm', 'pvw', 'chk']) { try { stamp[n] = Math.round(fs.statSync(file(n)).mtimeMs); } catch { /* not yet */ } }
    } finally { busy = false; }
  }
  function restart() { clearInterval(timer); timer = setInterval(shoot, Math.max(500, Number(cfg().everyMs) || 1000)); timer.unref(); }

  engine.cmd('previews.set', ({ enabled, everyMs }) => {
    if (enabled !== undefined) cfg().enabled = enabled === true || Number(enabled) === 1;
    if (everyMs !== undefined) cfg().everyMs = Math.max(500, Number(everyMs) || 1000);
    engine.store.saveConfig(); restart(); return { ok: true };
  });
  engine.cmd('previews.check', ({ key }) => { check = key || ''; return { ok: true }; });

  return {
    name: 'previews',
    file,
    init() { restart(); },
    stop() { clearInterval(timer); },
    state() {
      const local = ['127.0.0.1', 'localhost', '::1'].includes(String(engine.vmix.host).toLowerCase());
      return { enabled: !!cfg().enabled, everyMs: cfg().everyMs, local, stamp: { ...stamp }, check };
    },
  };
};
