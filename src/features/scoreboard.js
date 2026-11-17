'use strict';
/**
 * ScoreReader (github.com/DueHack12/scorereader): the live scoreboard from the NUC by the scoreboard console.
 * Read only. Polls  <scoreboardUrl>/data.obj.json  (flat: clock, home_score, guest_score, period_ordinal,
 * down_distance, home_timeouts, …) twice a second, and  /api/state  every 3 s (is the ScoreBot sending?).
 * Used to show the feed (control page strip, Master › Setup) and as a graphic field source ("Scoreboard").
 */
const http = require('http');

function getJson(url, timeout = 1200) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, { timeout }, (res) => {
      let b = ''; res.setEncoding('utf8');
      res.on('data', (d) => { b += d; if (b.length > 5e5) req.destroy(new Error('too big')); });
      res.on('end', () => {
        if (res.statusCode !== 200) return reject(new Error('HTTP ' + res.statusCode));
        try { resolve(JSON.parse(b)); } catch { reject(new Error('not JSON (is that ScoreReader?)')); }
      });
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
  });
}

const DEFAULT_FIELDS = ['clock', 'clock_running', 'home_score', 'guest_score', 'period', 'period_ordinal', 'down_distance', 'down', 'to_go', 'ball_on',
  'play_clock', 'shot_clock', 'home_timeouts', 'guest_timeouts', 'possession', 'home_name', 'guest_name', 'home_abbr', 'guest_abbr', 'sport'];

module.exports = (engine) => {
  let data = null; let ok = false; let error = ''; let status = null; let busy = false; let last = ''; let lastStatus = 0; let at = 0;
  const base = () => String(engine.store.config.scoreboardUrl || '').replace(/\/+$/, '');

  async function refresh() {
    if (!base()) { if (ok || data) { ok = false; data = null; status = null; engine.changed(); } return; }
    if (busy) return;
    busy = true;
    try {
      let d = await getJson(base() + '/data.obj.json').catch(async (e) => {   // older versions: /data.json is [ {...} ]
        if (!/HTTP 404/.test(e.message)) throw e;
        const a = await getJson(base() + '/data.json'); return Array.isArray(a) ? a[0] : a;
      });
      if (!d || typeof d !== 'object') throw new Error('empty answer');
      d = Object.fromEntries(Object.entries(d).map(([k, v]) => [k, v === null || v === undefined ? '' : String(v)]));
      ok = true; error = ''; at = Date.now();
      if (Date.now() - lastStatus > 3000) {
        lastStatus = Date.now();
        try { const s = await getJson(base() + '/api/state'); status = { state: s.source_state || '', detail: s.source_detail || '', source: s.source || '', packetAge: s.packet_age ?? null, sport: s.sport || '' }; }
        catch { status = null; }
      }
      const j = JSON.stringify(d);
      if (j !== last) { last = j; data = d; engine.changed(); }
    } catch (e) {
      if (ok || error !== e.message) { ok = false; error = e.message; engine.changed(); }
    } finally { busy = false; }
  }

  let timer = null;
  engine.cmd('scoreboard.refresh', async () => { lastStatus = 0; await refresh(); return { ok, error }; });
  engine.cmd('scoreboard.set', async ({ url }) => {
    let u = String(url || '').trim();
    if (u && !/^https?:\/\//.test(u)) u = 'http://' + u;
    if (u && !/:\d+(\/|$)/.test(u.replace(/^https?:\/\//, ''))) u = u.replace(/\/+$/, '') + ':8765';   // ScoreReader's default port
    engine.store.config.scoreboardUrl = u; engine.store.saveConfig();
    data = null; last = ''; lastStatus = 0; await refresh(); return { ok: true };
  });

  return {
    name: 'scoreboard',
    init() { refresh(); timer = setInterval(() => refresh(), 500); timer.unref(); },
    stop() { clearInterval(timer); },
    value(key) { return data && key && data[key] !== undefined ? data[key] : ''; },
    state() {
      const live = !!(ok && status && /connect/i.test(status.state) && (status.packetAge === null || status.packetAge < 15));
      return { url: base(), ok, error, live, status, data, at, fields: data ? Object.keys(data) : DEFAULT_FIELDS };
    },
  };
};
module.exports.DEFAULT_FIELDS = DEFAULT_FIELDS;
