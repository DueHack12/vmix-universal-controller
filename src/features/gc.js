'use strict';
/**
 * vMix Graphics Controller link (read only). See INTEGRATION.md.
 * Polls GET <gcUrl>/api/game every 5 s:
 *   { sport, gender, home: {name, short, abbr, logo, logoUrl, color, color2, record, sccRecord, classRank},
 *     visitor: {...}, updatedAt }
 * Every field is optional. If the Graphics Controller is not running, the last values are kept.
 * Used for: the show's sport (stat pop events), the "Game info" field source, team names/colours/logos.
 */
const http = require('http');

const TEAM_KEYS = ['name', 'short', 'abbr', 'logo', 'color', 'color2', 'record', 'sccRecord', 'classRank'];
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

module.exports = (engine) => {
  let game = null; let ok = false; let error = ''; let busy = false; let lastSport = null;
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
      if (g.sport && g.sport !== lastSport && engine.store.config.gcFollowSport !== false) {
        lastSport = g.sport;
        if (engine.show.sport !== g.sport) { engine.show.sport = g.sport; engine.save(); }
      }
    } catch (e) { ok = false; error = e.message; }
    finally { busy = false; engine.changed(); }
  }

  let timer = null;
  engine.cmd('gc.refresh', async () => { await refresh(); return { ok, error }; });
  engine.cmd('gc.set', async ({ url, followSport }) => {
    if (url !== undefined) { engine.store.config.gcUrl = String(url || '').trim(); lastSport = null; if (!engine.store.config.gcUrl) game = null; }
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
    state() {
      return { url: base(), ok, error, followSport: engine.store.config.gcFollowSport !== false, game, fields: FIELDS };
    },
  };
};
module.exports.normalize = normalize;
module.exports.FIELDS = FIELDS;
