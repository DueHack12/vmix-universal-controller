'use strict';
/** Fake vMix Graphics Controller: GET /api/game as in INTEGRATION.md v4 (real one: port 3001). game can be changed by tests. */
const http = require('http');
const game = {
  sport: 'Basketball', gender: 'Boys',
  home: { name: 'Fairfield Prep', fullName: 'Fairfield College Preparatory School', short: 'PREP', abbr: 'PREP', mascot: 'JESUITS', logo: 'G:\\Shared drives\\Prep Sports Broadcasting\\vMix Graphics Control\\Logos\\prep.png', color: '#C8102E', color2: null, record: '12-3', sccRecord: '8-1', classRank: 'LL #4' },
  visitor: { name: 'Hand', short: 'HAND', abbr: 'DHH', color: '#00205B', record: '9-6' },
  updatedAt: '2026-11-17T18:00:00Z',
};
const titles = [
  { id: 'breakboard', sport: 'Basketball', name: 'Breakboard', group: 'Breakboard', input: null, owns: ['TopText'], editUrl: '/#title=breakboard' },
  { id: 'bk-intro', sport: 'Basketball', name: 'BK INTRO', group: 'Intro', input: null, owns: ['HOME NAME', 'AWAY NAME'], editUrl: '/#title=bk-intro' },
  { id: 'fb-intro', sport: 'Football', name: 'INTRO L3 MNF', group: 'Intro', input: null, owns: [], editUrl: '/#title=fb-intro' },
];
function createServer() {
  const s = http.createServer((req, res) => {
    if (req.url.split('?')[0] === '/api/titles' && s.titles) { res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ titles: s.titles })); }
    if (req.url.split('?')[0] === '/api/game') { res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify(s.game)); }
    res.writeHead(404); res.end();
  });
  s.game = JSON.parse(JSON.stringify(game));
  s.titles = JSON.parse(JSON.stringify(titles));   // set to null to act like an older GC without /api/titles
  return s;
}
module.exports = { createServer, game, titles };
if (require.main === module) createServer().listen(Number(process.argv[2]) || 3001, () => console.log('Fake Graphics Controller on :' + (Number(process.argv[2]) || 3001)));
