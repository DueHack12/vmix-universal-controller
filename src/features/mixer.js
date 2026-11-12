'use strict';
/**
 * Mixer: named channels on vMix inputs (or the master bus).
 * MUTE  = off the stream.  LISTEN = in the headphones (vMix Solo).
 * MUTE + LISTEN = hear it in headphones, NOT live: the input stays on but is taken off the
 * live buses (default: Master), with Solo on.
 */
const db = (amp) => (amp > 0 ? 20 * Math.log10(amp) : -Infinity);

module.exports = (engine) => {
  const live = () => engine.show.liveBuses || ['M'];
  let nextId = 1;

  function defaults() {
    const ch = [];
    const add = (name, ref) => { if (ref && !ch.some((c) => c.ref === ref)) ch.push({ id: 'c' + (nextId++), name, ref }); };
    for (const i of engine.inputs()) {
      if (i.type === 'NDI' || i.type === 'Audio') {
        const m = i.type === 'NDI' && /\(([^)]+)\)/.exec(i.title); add(m ? m[1] : i.title.replace(/\s*\([^)]*\)\s*$/, ''), i.key);
      }
    }
    const m = engine.input('music'); if (m) add('Music', m.key);
    const a = engine.input('ads'); if (a) add('Ads', a.key);
    const v = engine.input('videos'); if (v) add('Video', v.key);
    add('Master', 'master');
    return ch;
  }
  function channels() {
    if (!engine.show.mixer && engine.inputs().length) { engine.show.mixer = defaults(); engine.save(); }
    const L = engine.show.mixer || [];
    for (const c of L) { const n = Number(String(c.id).slice(1)); if (n >= nextId) nextId = n + 1; }
    return L;
  }
  const findCh = (id) => channels().find((c) => c.id === id || c.name.toLowerCase() === String(id).toLowerCase()) || null;

  function modeOf(i) {
    const buses = (i.audiobusses || '').split(',').filter(Boolean);
    const offLive = live().every((b) => !buses.includes(b));
    const muted = i.muted || offLive;
    return muted && i.solo ? 'mutelisten' : muted ? 'mute' : i.solo ? 'listen' : 'live';
  }

  async function setMute(c, want) {
    await engine.refresh();
    if (c.ref === 'master') return engine.fn(want ? 'MasterAudioOff' : 'MasterAudioOn');
    const i = engine.inputByKey(c.ref); if (!i) return { ok: false, error: 'Input missing' };
    const m = modeOf(i); const isMuted = m === 'mute' || m === 'mutelisten';
    if (want === isMuted) return { ok: true };
    if (want) {
      if (i.solo) { for (const b of live()) await engine.fn('AudioBusOff', { Input: i.key, Value: b }); }
      else await engine.fn('AudioOff', { Input: i.key });
    } else {
      await engine.fn('AudioOn', { Input: i.key });
      for (const b of live()) if (!(i.audiobusses || '').split(',').includes(b)) await engine.fn('AudioBusOn', { Input: i.key, Value: b });
    }
    return { ok: true };
  }
  async function setListen(c, want) {
    await engine.refresh();
    if (c.ref === 'master') return { ok: false, error: 'Master has no listen' };
    const i = engine.inputByKey(c.ref); if (!i) return { ok: false, error: 'Input missing' };
    if (want === i.solo) return { ok: true };
    if (want) {
      if (i.muted) { // muted -> listen, not live
        for (const b of live()) await engine.fn('AudioBusOff', { Input: i.key, Value: b });
        await engine.fn('AudioOn', { Input: i.key });
      }
      await engine.fn('SoloOn', { Input: i.key });
    } else {
      await engine.fn('SoloOff', { Input: i.key });
      if (modeOf(i) === 'mutelisten') { // back to a normal mute
        await engine.fn('AudioOff', { Input: i.key });
        for (const b of live()) await engine.fn('AudioBusOn', { Input: i.key, Value: b });
      }
    }
    return { ok: true };
  }

  const boolArg = (value, current) => (value === undefined || value === '' ? !current : !!Number(value));
  engine.cmd('mix.mute', async ({ id, value }) => {
    await engine.refresh();
    const c = findCh(id); if (!c) return { ok: false, error: 'No such channel' };
    const i = c.ref === 'master' ? null : engine.inputByKey(c.ref);
    const cur = c.ref === 'master' ? !!(engine.snap && engine.snap.audio.master && engine.snap.audio.master.muted) : !!(i && ['mute', 'mutelisten'].includes(modeOf(i)));
    return setMute(c, boolArg(value, cur));
  });
  engine.cmd('mix.listen', async ({ id, value }) => {
    await engine.refresh();
    const c = findCh(id); if (!c) return { ok: false, error: 'No such channel' };
    const i = engine.inputByKey(c.ref);
    return setListen(c, boolArg(value, !!(i && i.solo)));
  });
  engine.cmd('mix.level', async ({ id, value, step }) => {
    if (step !== undefined) await engine.refresh();
    const c = findCh(id); if (!c) return { ok: false, error: 'No such channel' };
    const i = c.ref === 'master' ? null : engine.inputByKey(c.ref);
    const cur = c.ref === 'master' ? (engine.snap && engine.snap.audio.master ? engine.snap.audio.master.volume : 100) : (i ? i.volume : 0);
    const v = Math.max(0, Math.min(100, step !== undefined ? cur + Number(step) : Number(value)));
    return c.ref === 'master' ? engine.fn('SetMasterVolume', { Value: v }) : engine.fn('SetVolume', { Input: c.ref, Value: v });
  });
  engine.cmd('mix.add', ({ ref, name }) => {
    if (!ref) return { ok: false, error: 'Pick an input' };
    const i = engine.inputByKey(ref);
    channels().push({ id: 'c' + (nextId++), name: name || (i ? i.title : 'Master'), ref });
    engine.save(); return { ok: true };
  });
  engine.cmd('mix.remove', ({ id }) => { engine.show.mixer = channels().filter((c) => c.id !== id); engine.save(); return { ok: true }; });
  engine.cmd('mix.rename', ({ id, name }) => { const c = findCh(id); if (c && name) { c.name = name; engine.save(); } return { ok: true }; });
  engine.cmd('mix.move', ({ id, to }) => {
    const L = channels(); const k = L.findIndex((c) => c.id === id); if (k < 0) return { ok: false };
    const [c] = L.splice(k, 1); L.splice(Math.max(0, Math.min(L.length, Number(to))), 0, c); engine.save(); return { ok: true };
  });
  engine.cmd('mix.config', ({ id, ...patch }) => {
    const c = findCh(id); if (!c) return { ok: false, error: 'No such channel' };
    for (const k of ['name', 'ref', 'mic']) if (patch[k] !== undefined) c[k] = String(patch[k]).trim();
    engine.save(); return { ok: true };
  });
  engine.cmd('mix.cough', ({ id, value }) => {
    const c = findCh(id); if (!c || !c.mic) return { ok: false, error: 'No Audio Bridge mic set for this channel (Master › Mixer)' };
    return engine.run('bridge.cough', { mic: c.mic, value });
  });
  engine.cmd('mix.liveBuses', ({ buses }) => { engine.show.liveBuses = String(buses || 'M').split(/[ ,]+/).filter(Boolean); engine.save(); return { ok: true }; });
  let selected = 0;
  engine.cmd('mix.select', ({ step, value }) => {
    const n = channels().length; if (!n) return { ok: false };
    selected = value !== undefined && step === undefined ? Math.max(0, Math.min(n - 1, Number(value))) : ((selected + (Number(step) || 1)) % n + n) % n;
    return { ok: true, channel: channels()[selected].name };
  });
  const selId = () => (channels()[selected] || {}).id;
  engine.cmd('mix.selectedLevel', ({ step, value }) => engine.run('mix.level', { id: selId(), step, value }));
  engine.cmd('mix.selectedMute', ({ value }) => engine.run('mix.mute', { id: selId(), value }));
  engine.cmd('mix.reset', () => { engine.show.mixer = null; channels(); return { ok: true }; });

  return {
    name: 'mixer',
    state() {
      const out = channels().map((c) => {
        if (c.ref === 'master') {
          const m = engine.snap && engine.snap.audio.master;
          return { id: c.id, name: c.name, ref: c.ref, master: true, mode: m && m.muted ? 'mute' : 'live', volume: m ? m.volume : 0, dbL: m ? db(m.meterF1) : -Infinity, dbR: m ? db(m.meterF2) : -Infinity, missing: !m };
        }
        const i = engine.inputByKey(c.ref);
        if (!i) return { id: c.id, name: c.name, ref: c.ref, missing: true, mode: 'live', volume: 0, dbL: -Infinity, dbR: -Infinity };
        const bm = c.mic && engine.features.bridge ? engine.features.bridge.mic(c.mic) : null;
        return { id: c.id, name: c.name, ref: c.ref, source: i.title, mode: modeOf(i), volume: i.volume, dbL: db(i.meterF1), dbR: db(i.meterF2), mic: c.mic || '', cough: bm ? !!bm.cough : false };
      });
      for (const c of out) { c.dbL = isFinite(c.dbL) ? Math.round(c.dbL * 10) / 10 : -99; c.dbR = isFinite(c.dbR) ? Math.round(c.dbR * 10) / 10 : -99; }
      return { liveBuses: live(), selected: (channels()[selected] || {}).name || '', channels: out, available: engine.inputs().filter((i) => !channels().some((c) => c.ref === i.key)).map((i) => ({ key: i.key, title: i.title, type: i.type })) };
    },
  };
};
