'use strict';
/**
 * Graphics: GT titles in vMix. TAKE/OUT on overlay channels, live field edits,
 * and a tally read back from vMix's own overlay state (not assumed from button presses).
 *
 * Per graphic (show.graphics[]): name, group, overlay, hidden, autoOut (s),
 *   fields: [{ name, label, mode: edit|locked|hidden, source: typed|list|fixed|ose|logo|gc|gcowned|sb, list, value, ose, gc, sb, logo: home|away }]
 *   sb = a ScoreReader scoreboard field (clock, home_score, …), kept updated while on air
 *   gc = "Game info" from the Graphics Controller, written by vMix UC; gcowned = the Graphics Controller writes it, vMix UC never does
 *   statpop: { enabled, lineField, logoField, colorField, format }
 * show.lists: { "Announcers": ["Jane Doe '26", ...] }
 */
const fs = require('fs');
const path = require('path');

const TITLE_TYPES = ['GT', 'Xaml', 'Title', 'Text'];
const slug = (s) => String(s).toLowerCase().replace(/\.(gtzip|gtxml|xaml)$/i, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'gfx';
const niceName = (title) => String(title).replace(/\.(gtzip|gtxml|xaml)$/i, '');
const fieldLabel = (n) => n.replace(/\.(Text|Source|Fill|Color)$/i, '');
function guessGroup(name) {
  const n = name.toLowerCase();
  if (/bug|score/.test(n)) return 'Scorebug';
  if (/break|board|poster|network|full|stand|bracket|card/.test(n)) return 'Full screen';
  return 'Lower thirds';
}
/** a Graphics Controller title's group -> ours. Scorebug add-ons (flag, timeouts, down box, popup, status) go to
 *  Other (overlay 4) so they don't replace the scorebug on its channel. */
function groupFromGc(t) {
  const g = String(t.group || '').toLowerCase(); const n = String(t.name || '').toLowerCase();
  if (g === 'scorebug') return /scorebug/.test(n) && !/popup/.test(n) ? 'Scorebug' : 'Other';
  if (/intro|breakboard|lineup|full|stand|bracket/.test(g)) return 'Full screen';
  if (/lower|announcer|coach|name|player|location/.test(g)) return 'Lower thirds';
  return guessGroup(t.name || '');
}
const DEFAULT_OVERLAY = { 'Lower thirds': 1, Scorebug: 2, 'Full screen': 3, Other: 4 };
const EVENTS = {
  soccer: ['GOAL', 'ASSIST', 'SAVE', 'SHOT', 'YELLOW CARD', 'RED CARD'],
  football: ['TOUCHDOWN', 'FIELD GOAL', 'INTERCEPTION', 'SACK', 'FUMBLE RECOVERY', '2-PT CONVERSION'],
  basketball: ['3-POINTER', 'AND-ONE', 'BLOCK', 'STEAL', 'DUNK', 'DOUBLE-DOUBLE'],
  lacrosse: ['GOAL', 'ASSIST', 'SAVE', 'GROUND BALL', 'FACEOFF WIN', 'CAUSED TURNOVER'],
  hockey: ['GOAL', 'ASSIST', 'SAVE', 'PENALTY', 'POWER-PLAY GOAL'],
  baseball: ['HOME RUN', 'RBI', 'STRIKEOUT', 'DOUBLE', 'TRIPLE', 'STOLEN BASE'],
};
function sportKey(s) {
  const t = String(s || '').toLowerCase();
  return Object.keys(EVENTS).find((k) => t.includes(k)) || (/softball/.test(t) ? 'baseball' : 'soccer');
}

module.exports = (engine) => {
  const since = {};      // key -> ms when it went on air
  let pending = null;    // { key, want:'on'|'off', at }
  let warn = '';
  const lastOse = {};    // key|field -> last value we pushed

  function configured(key) { return (engine.show.graphics || []).find((g) => g.key === key) || null; }
  function cfgFor(key) {
    if (!engine.show.graphics) engine.show.graphics = [];
    let c = configured(key);
    if (!c) { const i = engine.inputByKey(key); c = { key, title: i ? i.title : '' }; engine.show.graphics.push(c); }
    return c;
  }
  /** A title deleted and added again in vMix (or replaced at the same position) gets a new key. Its settings
   *  (name, group, overlay, fields, stat pop) follow it by its vMix title, so nothing has to be set up again. */
  function adoptByTitle(i) {
    const keys = new Set(engine.inputs().map((x) => x.key));
    const n = (t) => String(t || '').toLowerCase().replace(/\.gt(zip|xml)$/, '').trim();
    const orphan = (engine.show.graphics || []).find((c) => !keys.has(c.key) && c.title && n(c.title) === n(i.title));
    if (!orphan) return null;
    engine.log('Graphic settings for "' + i.title + '" moved to its new vMix input (it was added again)');
    orphan.key = i.key; engine.save();
    return orphan;
  }
  function list() {
    const out = [];
    for (const i of engine.inputs()) {
      if (!TITLE_TYPES.includes(i.type)) continue;
      if (engine.show.links && engine.show.links.netId === i.key) continue;   // the Network ID has its own light and switch
      let c = configured(i.key) || adoptByTitle(i) || {};
      if (c.key && c.title !== i.title) c.title = i.title;   // remember the current vMix title
      if (c.hidden) continue;
      const name = c.name || niceName(i.title);
      const gt = !c.group && engine.features.gc ? engine.features.gc.titleFor(i) : null;
      const group = c.group || (gt ? groupFromGc(gt) : guessGroup(name));
      out.push({ key: i.key, id: c.id || slug(name), name, group, overlay: Number(c.overlay) || DEFAULT_OVERLAY[group] || 1, input: i, cfg: c });
    }
    out.sort((a, b) => (a.group + a.name).localeCompare(b.group + b.name));
    return out;
  }
  function find(ref) {
    const L = list();
    return L.find((g) => g.key === ref) || L.find((g) => g.id === ref) || L.find((g) => g.name.toLowerCase() === String(ref).toLowerCase()) || null;
  }
  function overlaysShowing(key) {
    const i = engine.inputByKey(key);
    if (!i || !engine.snap) return [];
    return engine.snap.overlays.filter((o) => o.input === i.number).map((o) => o.number);
  }
  const isOn = (key) => overlaysShowing(key).length > 0;
  const fieldCfg = (g, name) => (g.cfg.fields || []).find((f) => f.name === name) || {};

  /** Logo file in <Drive>\Graphics\Logos matching a team (abbrev / short / name). */
  /** the Logos folder, read in the background and kept 10 s: a slow Google Drive must never hold up a TAKE */
  function logoFiles(dir = engine.driveDir('Graphics', 'Logos')) {
    return engine.cached('logos:' + dir, 10000, () => fs.promises.readdir(dir).then((l) => l.filter((f) => /\.(png|jpe?g|gif|svg|webp)$/i.test(f)), () => []), []);
  }
  function logoFor(side) {
    const gt = engine.features.gc && engine.features.gc.team(side);
    if (gt && gt.logo) return gt.logo;   // the Graphics Controller's own logo file (a Drive path vMix can load)
    const t = (engine.features.ose && engine.features.ose.team(side)) || gt;
    const dir = engine.driveDir('Graphics', 'Logos');
    const files = logoFiles(dir);
    const names = t ? [t.abbrev, t.short, t.name].filter(Boolean).map((x) => x.toLowerCase()) : [];
    const hit = files.find((f) => names.includes(f.replace(/\.[^.]+$/, '').toLowerCase())) || files.find((f) => names.some((n) => n && f.toLowerCase().startsWith(n)));
    return hit ? path.join(dir, hit) : '';
  }
  const gcTitle = (g) => (engine.features.gc ? engine.features.gc.titleFor(g.input) : null);
  /** GC lists owned fields as "HOME NAME.Text", "HOME BLOCK.Source"… or just "HOME NAME" */
  const inList = (list, field) => (list || []).some((o) => o === field || o + '.Text' === field || o + '.Source' === field || field.split('.')[0] === o);
  const gcOwns = (t, field) => inList(t.owns, field);
  const gcLive = (t, field) => inList(t.live, field);
  /** what fills a field when vMix UC hasn't been told: the Graphics Controller, the scoreboard, or the operator */
  const defaultSource = (t, field) => (t && gcOwns(t, field) ? 'gcowned' : t && gcLive(t, field) ? 'liveowned' : 'typed');
  /** stored source, else that default */
  const effSource = (g, fc) => fc.source || defaultSource(gcTitle(g), fc.name);
  const LOCKED = ['gcowned', 'liveowned'];
  function sourceValue(f) {
    if (f.source === 'fixed') return f.value ?? '';
    if (f.source === 'ose') return engine.features.ose ? String(engine.features.ose.value(f.ose)) : '';
    if (f.source === 'logo') return logoFor(f.logo === 'away' ? 'away' : 'home');
    if (f.source === 'gc') return engine.features.gc ? engine.features.gc.value(f.gc) : '';
    if (f.source === 'sb') return engine.features.scoreboard ? engine.features.scoreboard.value(f.sb) : '';
    return null; // typed / list: whatever the operator set; gcowned: the Graphics Controller writes it // typed / list: whatever the operator set
  }
  async function setField(g, fieldName, value) {
    const f = g.input.fields.find((x) => x.name === fieldName || fieldLabel(x.name) === fieldName);
    if (!f) return { ok: false, error: 'No such field: ' + fieldName };
    return engine.fn(f.kind === 'image' ? 'SetImage' : f.kind === 'color' ? 'SetColor' : 'SetText', { Input: g.key, SelectedName: f.name, Value: value ?? '' });
  }
  /** push fixed / scoreboard / logo values before a TAKE */
  async function applySources(g) {
    for (const fc of g.cfg.fields || []) {
      const v = sourceValue(fc);
      if (v === null) continue;
      await setField(g, fc.name, v); lastOse[g.key + '|' + fc.name] = v;
    }
  }

  const lastTake = {};   // key -> time of the last TAKE (an OUT check must not undo a newer TAKE)
  async function take(ref) {
    const g = find(ref); if (!g) return { ok: false, error: 'No such graphic' };
    lastTake[g.key] = Date.now();
    await applySources(g);
    pending = { key: g.key, want: 'on', at: Date.now() };
    return engine.fn('OverlayInput' + g.overlay + 'In', { Input: g.key });
  }
  async function out(ref) {
    const g = find(ref); if (!g) return { ok: false, error: 'No such graphic' };
    await engine.refresh();   // decide from what vMix shows now, not a snapshot from a moment ago
    const ovs = overlaysShowing(g.key);
    const i = engine.inputByKey(g.key);
    if (!ovs.length && i && engine.snap && engine.snap.active === i.number) {
      return { ok: false, error: g.name + ' is on Program (not an overlay): the director has to cut away from it' };
    }
    pending = { key: g.key, want: 'off', at: Date.now() };
    const chans = ovs.length ? ovs : [g.overlay];
    const outAt = Date.now();
    for (const n of chans) await engine.fn('OverlayInput' + n + 'Out');
    // a title whose out-animation doesn't finish (or a channel vMix didn't clear) is switched off instantly
    setTimeout(async () => {
      try {
        if ((lastTake[g.key] || 0) > outAt) return;   // taken again since: leave it on
        await engine.refresh();
        for (const n of overlaysShowing(g.key)) { engine.log(g.name + ' was still on overlay ' + n + ' after OUT: switched it off'); await engine.fn('OverlayInput' + n + 'Off'); }
      } catch (e) { engine.log('OUT check failed: ' + e.message); }
    }, 1200).unref();
    return { ok: true };
  }

  engine.cmd('gfx.take', ({ id }) => take(id));
  engine.cmd('gfx.out', ({ id }) => out(id));
  engine.cmd('gfx.toggle', async ({ id, value }) => {
    await engine.refresh();
    const g = find(id); if (!g) return { ok: false, error: 'No such graphic' };
    const on = value === undefined ? !isOn(g.key) : !!Number(value);
    return on ? take(id) : out(id);
  });
  engine.cmd('gfx.allout', async () => { await engine.refresh(); for (const g of list()) if (isOn(g.key)) await out(g.key); return { ok: true }; });
  engine.cmd('gfx.set', ({ id, field, value }) => {
    const g = find(id); if (!g) return { ok: false, error: 'No such graphic' };
    const f = g.input.fields.find((x) => x.name === field || fieldLabel(x.name) === field);
    const es = f && effSource(g, { ...fieldCfg(g, f.name), name: f.name });
    if (LOCKED.includes(es)) return { ok: false, error: field + (es === 'gcowned' ? ' is filled by the Graphics Controller' : ' is filled by the scoreboard') };
    return setField(g, field, value);
  });
  engine.cmd('gfx.config', ({ key, ...patch }) => {
    const c = cfgFor(key);
    if (patch.overlay !== undefined) patch.overlay = Number(patch.overlay);
    if (patch.autoOut !== undefined) patch.autoOut = Math.max(0, Number(patch.autoOut) || 0);
    if (patch.hidden !== undefined) patch.hidden = patch.hidden === true || patch.hidden === 'true' || patch.hidden === 1 || patch.hidden === '1';
    Object.assign(c, patch);
    engine.save(); return { ok: true };
  });
  engine.cmd('gfx.field', ({ key, name, ...patch }) => {
    const c = cfgFor(key); c.fields = c.fields || [];
    let f = c.fields.find((x) => x.name === name);
    if (!f) { f = { name }; c.fields.push(f); }
    Object.assign(f, patch);
    engine.save(); return { ok: true };
  });
  engine.cmd('gfx.statpopConfig', ({ key, ...patch }) => {
    const c = cfgFor(key);
    c.statpop = { enabled: true, format: '{EVENT} – #{NUM} {NAME}', ...(c.statpop || {}), ...patch };
    if (patch.enabled !== undefined) c.statpop.enabled = patch.enabled === true || Number(patch.enabled) === 1;
    engine.save(); return { ok: true };
  });
  engine.cmd('gfx.statpop', async ({ id, side = 'home', number = '', name = '', event = '', take: doTake = true }) => {
    const g = (id && find(id)) || list().find((x) => x.cfg.statpop && x.cfg.statpop.enabled);
    if (!g || !g.cfg.statpop) return { ok: false, error: 'No stat pop graphic set up (Master › Graphics)' };
    const sp = g.cfg.statpop;
    if (!name && number && engine.features.ose) { const p = (engine.features.ose.state().rosters[side] || []).find((r) => String(r.number) === String(number)); if (p) name = p.name; }
    let line = (sp.format || '{EVENT} – #{NUM} {NAME}').replace('{EVENT}', event).replace('{NUM}', number).replace('{NAME}', name);
    if (!number) line = line.replace(/#\s*/, '');
    line = line.replace(/\s+–\s*$/, '').replace(/\s{2,}/g, ' ').trim();
    if (sp.lineField) await setField(g, sp.lineField, line);
    if (sp.logoField) { const l = logoFor(side); if (l) await setField(g, sp.logoField, l); }
    if (sp.colorField) { const t = (engine.features.ose && engine.features.ose.team(side)) || (engine.features.gc && engine.features.gc.team(side)); if (t && t.color) await setField(g, sp.colorField, t.color); }
    if (doTake) { lastTake[g.key] = Date.now(); pending = { key: g.key, want: 'on', at: Date.now() }; await engine.fn('OverlayInput' + g.overlay + 'In', { Input: g.key }); }
    return { ok: true, line };
  });
  engine.cmd('list.set', ({ name, items }) => {
    if (!name) return { ok: false, error: 'Name needed' };
    engine.show.lists = { ...(engine.show.lists || {}) };
    if (items === null) delete engine.show.lists[name];
    else engine.show.lists[name] = (Array.isArray(items) ? items : String(items || '').split('\n')).map((s) => String(s).trim()).filter(Boolean);
    engine.save(); return { ok: true };
  });
  engine.cmd('sport.events', ({ sport, items }) => {
    engine.show.statEvents = { ...(engine.show.statEvents || {}), [sport]: (Array.isArray(items) ? items : String(items || '').split('\n')).map((s) => s.trim().toUpperCase()).filter(Boolean) };
    engine.save(); return { ok: true };
  });

  return {
    name: 'graphics',
    async onPoll() {
      const now = Date.now();
      for (const g of list()) {
        const on = isOn(g.key);
        if (on) { if (!since[g.key]) since[g.key] = now; } else delete since[g.key];
        if (on && g.cfg.autoOut && since[g.key] && now - since[g.key] > g.cfg.autoOut * 1000 && !(pending && pending.key === g.key)) await out(g.key);
        if (on) for (const fc of g.cfg.fields || []) {   // live scoreboard values while on air
          if (fc.source !== 'ose' && fc.source !== 'gc' && fc.source !== 'sb') continue;
          const v = sourceValue(fc); const k = g.key + '|' + fc.name;
          if (v !== lastOse[k]) { lastOse[k] = v; await setField(g, fc.name, v); }
        }
      }
      if (pending) {
        const ok = (pending.want === 'on') === isOn(pending.key);
        if (ok) { pending = null; warn = ''; }
        else if (now - pending.at > 1500) {
          const g = find(pending.key);
          warn = (g ? g.name : 'Graphic') + (pending.want === 'on' ? ' did not go on air in vMix' : ' is still on air in vMix');
          pending = null;
        }
      }
    },
    state() {
      logoFiles();   // keeps the logo list warm, so the first TAKE of the night already has it
      const now = Date.now();
      const L = list();
      const onAirKeys = new Set(L.filter((g) => isOn(g.key)).map((g) => g.key));
      const hiddenItems = (engine.show.graphics || []).filter((c) => c.hidden).map((c) => { const i = engine.inputByKey(c.key); return i ? { key: c.key, name: c.name || niceName(i.title) } : null; }).filter(Boolean);
      const sport = sportKey(engine.show.sport || engine.show.name);
      const gcAll = engine.features.gc ? engine.features.gc.titles() : null;
      const matched = new Set(L.map((g) => gcTitle(g)).filter(Boolean).map((t) => t.id));
      const gcSport = engine.features.gc && engine.features.gc.state().game ? engine.features.gc.state().game.sport : '';
      const gcMissing = gcAll ? gcAll.filter((t) => !matched.has(t.id) && (!gcSport || !t.sport || t.sport === gcSport)).map((t) => ({ id: t.id, name: t.name, group: t.group, sport: t.sport })) : [];
      return {
        warn, hiddenItems, lists: engine.show.lists || {}, gcMissing,
        sport, events: (engine.show.statEvents || {})[sport] || EVENTS[sport],
        items: L.map((g) => {
          const gcT = gcTitle(g);
          const on = onAirKeys.has(g.key);
          const blocker = !on && L.find((o) => o.key !== g.key && o.overlay === g.overlay && onAirKeys.has(o.key));
          return {
            key: g.key, id: g.id, name: g.name, group: g.group, overlay: g.overlay, onAir: on, title: g.input.title,
            onAirSecs: on && since[g.key] ? Math.floor((now - since[g.key]) / 1000) : 0,
            autoOut: g.cfg.autoOut || 0,
            replaces: blocker ? blocker.name : '',
            statpop: g.cfg.statpop && g.cfg.statpop.enabled ? g.cfg.statpop : null,
            gc: gcT ? { id: gcT.id, name: gcT.name, editUrl: gcT.editUrl } : null,
            fields: g.input.fields.map((f) => {
              const c = fieldCfg(g, f.name);
              // a field the Graphics Controller fills is "Filled by Graphics Controller" unless set otherwise here
              const source = c.source || defaultSource(gcT, f.name);
              return { name: f.name, kind: f.kind, value: f.value, label: c.label || fieldLabel(f.name), mode: c.mode || (source === 'typed' || source === 'list' ? 'edit' : 'locked'), source, list: c.list || '', fixed: c.value || '', ose: c.ose || '', gc: c.gc || '', sb: c.sb || '', logo: c.logo || '' };
            }),
          };
        }),
      };
    },
  };
};
module.exports.slug = slug;
module.exports.EVENTS = EVENTS;
