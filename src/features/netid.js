'use strict';
/**
 * Network ID: the station logo bug in the corner. Its vMix input is the "netId" job (Master › Setup › Assign jobs),
 * shown on an overlay channel (default 4). vMix UC shows whether it is up, toggles it, and warns when it is off
 * while the show is live or recording.
 */
module.exports = (engine) => {
  const cfg = () => { engine.show.netId = engine.show.netId || { overlay: 4, warn: true }; return engine.show.netId; };
  const inp = () => engine.input('netId');
  let since = 0;           // when it last went on air
  let offSince = 0;        // when it went off (or the show went live without it)
  const channels = () => { const i = inp(); return i && engine.snap ? engine.snap.overlays.filter((o) => o.input === i.number).map((o) => o.number) : []; };
  const onAir = () => channels().length > 0;
  const live = () => !!(engine.snap && (engine.snap.streaming || engine.snap.recording));

  async function on() {
    const i = inp(); if (!i) return { ok: false, error: 'No Network ID input linked (Master › Setup › Assign jobs)' };
    return engine.fn('OverlayInput' + (Number(cfg().overlay) || 4) + 'In', { Input: i.key });
  }
  async function off() {
    const i = inp(); if (!i) return { ok: false, error: 'No Network ID input linked (Master › Setup › Assign jobs)' };
    await engine.refresh();
    const ch = channels();
    for (const n of ch.length ? ch : [Number(cfg().overlay) || 4]) await engine.fn('OverlayInput' + n + 'Out');
    return { ok: true };
  }
  engine.cmd('netid.on', on);
  engine.cmd('netid.off', off);
  engine.cmd('netid.toggle', async ({ value } = {}) => {
    await engine.refresh();
    const want = value === undefined ? !onAir() : !!Number(value);
    return want ? on() : off();
  });
  engine.cmd('netid.settings', ({ overlay, warn }) => {
    if (overlay !== undefined && [1, 2, 3, 4].includes(Number(overlay))) cfg().overlay = Number(overlay);
    if (warn !== undefined) cfg().warn = warn === true || Number(warn) === 1;
    engine.save(); return { ok: true };
  });

  return {
    name: 'netid',
    onPoll() {
      const now = Date.now(); const up = onAir();
      if (up) { if (!since) since = now; offSince = 0; }
      else { since = 0; if (!offSince) offSince = now; }
    },
    state() {
      const i = inp(); const up = onAir();
      const offSecs = !up && offSince ? Math.floor((Date.now() - offSince) / 1000) : 0;
      return {
        linked: !!i, name: i ? i.title : '', onAir: up, overlay: Number(cfg().overlay) || 4, channels: channels(), warnOn: cfg().warn !== false,
        onAirSecs: up && since ? Math.floor((Date.now() - since) / 1000) : 0,
        // live or recording without the logo for 10 s: the page warns until it's back up
        missingWhileLive: !!i && !up && live() && offSecs >= 10 && cfg().warn !== false,
      };
    },
  };
};
