'use strict';
/**
 * vMix Graphics Controller link (read only). See INTEGRATION.md.
 * Polls GET <gcUrl>/api/game every 5 s (gcUrl = http://<GC computer>:3001):
 *   { sport, gender, home: {name, short, abbr, logo, logoUrl, color, color2, record, sccRecord, classRank},
 *     visitor: {...}, updatedAt }
 * Every field is optional. If the Graphics Controller is not running, the last values are kept.
 * Used for: the show's sport (stat pop events), the "Game info" field source, team names/colours/logos.
 */
const http = require('http');

const TEAM_KEYS = ['name', 'fullName', 'short', 'abbr', 'mascot', 'logo', 'color', 'color2', 'record', 'sccRecord', 'classRank'];
const FIELDS = ['sport', 'gender', ...['home', 'visitor'].flatMap((s) => TEAM_KEYS.map((k) => s + '.' + k))];

function getJson(url, timeout = 1500) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, { timeout }, (res) => {
      let b = ''; res.setEncoding('utf8');
      res.on('data', (d) => { b += d; if (b.length > 1e6) req.destroy(new Error('too big')); });
      res.on('end', () => {
        if (res.statusCode !== 200) return reject(new Error('HTTP ' + res.statusCode));
        try { resolve(JSON.parse(b)); } catch { reject(new Error('not JSON (is that the Graphics Controller?)')); }
      });
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
  });
}

/** Accept a few spellings so small differences on the Graphics Controller side don't break us. */
function normalize(g) {
  if (!g || typeof g !== 'object') return null;
  const team = (t) => {
    if (!t || typeof t !== 'object') return {};
    const o = {};
    for (const k of TEAM_KEYS) if (t[k] !== undefined && t[k] !== null) o[k] = String(t[k]);
    if (!o.abbr && (t.abbrev || t.abbreviation)) o.abbr = String(t.abbrev || t.abbreviation);
    if (!o.color && t.primary) o.color = String(t.primary);
    if (t.logoUrl) o.logoUrl = String(t.logoUrl);
    return o;
  };
  return {
    sport: g.sport ? String(g.sport) : '',
    gender: g.gender ? String(g.gender) : '',
    home: team(g.home),
    visitor: team(g.visitor || g.away),
    updatedAt: g.updatedAt ? String(g.updatedAt) : '',
  };
}

/** GC's title list (GET /api/titles, INTEGRATION.md v6) -> [{id, name, sport, group, input, owns, editPath}] */
function normalizeTitles(r) {
  const arr = Array.isArray(r) ? r : (r && Array.isArray(r.titles) ? r.titles : null);
  if (!arr) return null;
  return arr.filter((t) => t && (t.id || t.name)).map((t) => ({
    id: String(t.id || t.name), name: String(t.name || t.id), sport: t.sport ? String(t.sport) : '', group: t.group ? String(t.group) : '',
    input: t.input ? String(t.input) : '', file: t.file ? String(t.file) : '',
    owns: Array.isArray(t.owns) ? t.owns.map(String) : [],
    editPath: t.editUrl ? String(t.editUrl) : '/#title=' + encodeURIComponent(String(t.id || t.name)),
  }));
}
/** same rule as GC's matchInputs: "BK SCOREBUG.gtzip" / "BK INTRO (Thermal - Normal logo).gtzip" -> "bk scorebug" / "bk intro" */
const normTitle = (s) => String(s || '').toLowerCase().replace(/\.gt(zip|xml)$/, '').replace(/\s*\((thermal|mesh|gradient)[^)]*\)/, '').replace(/[^a-z0-9]+/g, ' ').trim();

module.exports = (engine) => {
  let titles = null; let titlesOk = false; let polls = 0;
  let game = null; let ok = false; let error = ''; let busy = false; let lastSport = null;
  // the first build defaulted to :3000, which only answers on the Graphics Controller's own computer
  if (/^http:\/\/(127\.0\.0\.1|localhost):3000\/?$/.test(engine.store.config.gcUrl || '')) { engine.store.config.gcUrl = 'http://127.0.0.1:3001'; engine.store.saveConfig(); }
  const base = () => String(engine.store.config.gcUrl || '').replace(/\/+$/, '');

  async function refresh() {
    if (!base()) { ok = false; error = ''; return; }
    if (busy) return;
    busy = true;
    try {
      const g = normalize(await getJson(base() + '/api/game'));
      if (!g) throw new Error('empty answer');
      const was = JSON.stringify(game);
      game = g; ok = true; error = '';
      if (JSON.stringify(game) !== was) engine.log('Graphics Controller: ' + [g.visitor.name, g.home.name].filter(Boolean).join(' at ') + (g.sport ? ' · ' + [g.gender, g.sport].filter(Boolean).join(' ') : ''));
      // follow the game's sport (picks the stat pop event buttons); only when it changes there
      if (polls++ % 3 === 0 || titles === null) await refreshTitles();
      if (g.sport && g.sport !== lastSport && engine.store.config.gcFollowSport !== false) {
        lastSport = g.sport;
        if (engine.show.sport !== g.sport) { engine.show.sport = g.sport; engine.save(); }
      }
    } catch (e) { ok = false; error = e.message; }
    finally { busy = false; engine.changed(); }
  }

  async function refreshTitles() {
    try { titles = normalizeTitles(await getJson(base() + '/api/titles')); titlesOk = !!titles; return; }
    catch (e) { titlesOk = false; if (!/HTTP 404/.test(e.message)) return; }   // 404 = this GC version has no title list yet
    // Fallback until GC serves /api/titles: its editor's own title list + vMix links. Only reachable when GC runs
    // on this same computer (its editor port answers on 127.0.0.1 only). Remove once every GC has /api/titles.
    try {
      const man = await getJson(editorUrl('/gt/manifest.json'));
      let links = {}; try { links = (await getJson(editorUrl('/api/gt/state'))).inputs || {}; } catch { /* no links yet */ }
      const LIVE = /SCORE|CLOCK|QUARTER|PERIOD|HALF|SHOT|PLAY CLOCK|\bTO\b|TIMEOUT|DOWN|DIST|POSS/i;   // GC never writes live fields
      titles = normalizeTitles((man.titles || []).map((t) => ({
        id: t.id, name: t.name, sport: t.sport, group: t.group, file: t.file, input: links[t.id] || '',
        owns: [...(t.texts || []).map((x) => x.name).filter((n) => !LIVE.test(n)), ...(t.layers || []).filter((l) => l.type === 'image').map((l) => l.name)],
      })));
    } catch { titles = null; }
  }
  /** editor address for a path: GC's editor is on port 3000 of the same computer (3001 is the read-only port) */
  function editorUrl(p = '/') {
    try { const u = new URL(base()); if (u.port === '3001') u.port = '3000'; return u.origin + (p.startsWith('/') ? p : '/' + p); } catch { return ''; }
  }

  let timer = null;
  engine.cmd('gc.refresh', async () => { polls = 0; await refresh(); return { ok, error }; });
  engine.cmd('gc.set', async ({ url, followSport }) => {
    if (url !== undefined) { engine.store.config.gcUrl = String(url || '').trim(); lastSport = null; polls = 0; if (!engine.store.config.gcUrl) { game = null; titles = null; } }
    if (followSport !== undefined) engine.store.config.gcFollowSport = followSport === true || Number(followSport) === 1;
    engine.store.saveConfig(); await refresh(); return { ok: true };
  });

  const side = (s) => (s === 'away' || s === 'visitor' ? 'visitor' : 'home');
  return {
    name: 'gc',
    init() { refresh(); timer = setInterval(() => refresh(), 5000); timer.unref(); },
    stop() { clearInterval(timer); },
    /** 'home.name' / 'sport' -> string ('' if unknown) */
    value(key) {
      if (!game || !key) return '';
      const [a, b] = String(key).split('.');
      if (!b) return game[a] !== undefined ? String(game[a]) : '';
      const t = game[side(a)] || {};
      return t[b] !== undefined ? String(t[b]) : '';
    },
    /** same shape as ose.team(): { name, short, abbrev, color, logo } or null */
    team(s) {
      const t = game && game[side(s)];
      return t && Object.keys(t).length ? { name: t.name, short: t.short, abbrev: t.abbr, color: t.color, logo: t.logo } : null;
    },
    /** the GC title for a vMix input {key, number, title}: GC's own link first, then the name */
    titleFor(input) {
      if (!titles || !input) return null;
      const it = normTitle(input.title);
      // GC's own link wins; then the exact name; then whole words ("bk score" must not match "bk scorebug")
      const t = titles.find((x) => x.input && (x.input === input.key || x.input === String(input.number)))
        || titles.find((x) => !x.input && normTitle(x.name) && normTitle(x.name) === it)
        || titles.find((x) => { const n = normTitle(x.name); return !x.input && n && it.startsWith(n + ' '); });
      return t ? { id: t.id, name: t.name, group: t.group, sport: t.sport, owns: t.owns, editUrl: editorUrl(t.editPath) } : null;
    },
    titles() { return titles; },
    state() {
      return { url: base(), ok, error, followSport: engine.store.config.gcFollowSport !== false, game, fields: FIELDS, editorUrl: base() ? editorUrl('/') : '', titlesKnown: titles !== null, titleCount: titles ? titles.length : 0 };
    },
  };
};
module.exports.normalize = normalize;
module.exports.normalizeTitles = normalizeTitles;
module.exports.normTitle = normTitle;
module.exports.FIELDS = FIELDS;
