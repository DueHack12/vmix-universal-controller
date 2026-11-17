'use strict';
/** Fake ScoreReader (github.com/DueHack12/scorereader): /data.obj.json, /data.json, /api/state; a running football clock. */
const http = require('http');
function createServer() {
  const t0 = Date.now();
  const s = http.createServer((req, res) => {
    const p = req.url.split('?')[0];
    const left = Math.max(0, 12 * 60 - Math.floor((Date.now() - t0) / 1000));
    const d = Object.assign({ sport: 'football', home_name: 'PREP', guest_name: 'HAND', home_abbr: 'FP', guest_abbr: 'DHH',
      home_score: '14', guest_score: '7', period: '2', period_ordinal: '2nd', clock: Math.floor(left / 60) + ':' + String(left % 60).padStart(2, '0'),
      clock_running: '1', down: '3rd', to_go: '7', ball_on: '35', down_distance: '3rd & 7', play_clock: '25',
      home_timeouts: '3', guest_timeouts: '2', possession: 'H', home_poss: '1', guest_poss: '0' }, s.over);
    const json = (o) => { res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }); res.end(JSON.stringify(o)); };
    if (p === '/data.obj.json') return json(d);
    if (p === '/data.json') return json([d]);
    if (p === '/api/state') return json({ source: 'demo', source_state: 'connected', source_detail: 'fake ScoreReader (vMix UC demo)', packet_age: 0.2, sport: 'football' });
    if (p === '/') { res.writeHead(200, { 'Content-Type': 'text/html' }); return res.end('<h1>Fake ScoreReader</h1><pre>' + JSON.stringify(d, null, 1) + '</pre>'); }
    res.writeHead(404); res.end('not found');
  });
  s.over = {};
  return s;
}
module.exports = { createServer };
if (require.main === module) createServer().listen(Number(process.argv[2]) || 8765, () => console.log('Fake ScoreReader on :' + (Number(process.argv[2]) || 8765)));
