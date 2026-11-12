'use strict';
/**
 * OpenStatsEngine (read only): scoreboard + both rosters from its /vmix/live XML feeds.
 * Used by the stat pop builder and by graphic fields linked to a scoreboard value.
 */
const http = require('http');
const { parse, children, text } = require('../xml');

function getText(url, timeout = 1500) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, { timeout }, (res) => {
      let b = ''; res.setEncoding('utf8');
      res.on('data', (d) => (b += d));
      res.on('end', () => (res.statusCode === 200 ? resolve(b) : reject(new Error('HTTP ' + res.statusCode))));
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
  });
}
/** <Doc><Row><A>1</A>..</Row>..</Doc> -> [{A:'1'}] */
function rows(xmlText) {
  const doc = parse(xmlText);
  return children(doc, 'Row').map((r) => Object.fromEntries(r.children.map((c) => [c.name, text(c)])));
}

module.exports = (engine) => {
  let scoreboard = null; let rosters = { home: [], away: [] };
  let ok = false; let error = ''; let lastRoster = 0; let busy = false;
  const base = () => String(engine.store.config.oseUrl || '').replace(/\/+$/, '');

  async function refresh(force = false) {
    if (!base() || busy) { if (!base()) { ok = false; error = ''; } return; }
    busy = true;
    try {
      const sb = rows(await getText(base() + '/vmix/live/scoreboard.xml'));
      scoreboard = sb[0] || null;
      if (force || Date.now() - lastRoster > 30000) {
        lastRoster = Date.now();
        for (const side of ['home', 'away']) {
          rosters[side] = rows(await getText(base() + '/vmix/live/roster.xml?side=' + side)).map((r) => ({ number: r.Number, name: r.Name, pos: r.Pos, year: r.Year }));
        }
      }
      ok = true; error = '';
    } catch (e) { ok = false; error = e.message; }
    finally { busy = false; engine.changed(); }
  }

  let timer = null;
  engine.cmd('ose.refresh', async () => { await refresh(true); return { ok, error }; });
  engine.cmd('ose.set', async ({ url }) => { engine.store.config.oseUrl = String(url || '').trim(); engine.store.saveConfig(); await refresh(true); return { ok: true }; });

  return {
    name: 'ose',
    init() { refresh(true); timer = setInterval(() => refresh(), 2000); timer.unref(); },
    stop() { clearInterval(timer); },
    value(field) { return scoreboard && scoreboard[field] !== undefined ? scoreboard[field] : ''; },
    team(side) {
      const p = side === 'away' ? 'Away' : 'Home';
      return scoreboard ? { name: scoreboard[p + 'Name'], short: scoreboard[p + 'Short'], abbrev: scoreboard[p + 'Abbrev'], color: scoreboard[p + 'Color'] } : null;
    },
    state() {
      return {
        url: base(), ok, error,
        fields: scoreboard ? Object.keys(scoreboard) : ['HomeName', 'HomeShort', 'HomeAbbrev', 'HomeScore', 'HomeColor', 'AwayName', 'AwayShort', 'AwayAbbrev', 'AwayScore', 'AwayColor', 'PeriodLabel', 'Clock', 'ScoreLine', 'Sport'],
        scoreboard, rosters,
      };
    },
  };
};
module.exports.rows = rows;
