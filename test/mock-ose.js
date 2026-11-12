'use strict';
/** Fake OpenStatsEngine: /vmix/live/scoreboard.xml and /vmix/live/roster.xml?side=home|away */
const http = require('http');
const { encode } = require('../src/xml');

const state = {
  scoreboard: { Sport: 'Soccer', PeriodLabel: '2nd', Clock: '20:03', HomeName: 'Fairfield Prep', HomeShort: 'Prep', HomeAbbrev: 'FP', HomeColor: '#C8102E', HomeScore: '2', AwayName: 'Manchester', AwayShort: 'Manchester', AwayAbbrev: 'MAN', AwayColor: '#1D4ED8', AwayScore: '1' },
  rosters: {
    home: [['1', 'Joe Bloggs'], ['7', 'Jack Doe'], ['27', 'Jack Doe Jr.'], ['30', 'John Doe'], ['9', 'Jim Doe'], ['11', 'Jake Doe']],
    away: [['4', 'Richard Roe'], ['10', 'Jane Roe'], ['22', 'Mary Major']],
  },
};
const row = (o) => '<Row>' + Object.entries(o).map(([k, v]) => `<${k}>${encode(v)}</${k}>`).join('') + '</Row>';

function createServer() {
  return http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    res.setHeader('Content-Type', 'text/xml');
    if (u.pathname === '/vmix/live/scoreboard.xml') return res.end('<?xml version="1.0"?><Scoreboard>' + row(state.scoreboard) + '</Scoreboard>');
    if (u.pathname === '/vmix/live/roster.xml') {
      const side = u.searchParams.get('side') === 'away' ? 'away' : 'home';
      return res.end('<?xml version="1.0"?><Roster>' + state.rosters[side].map(([n, name]) => row({ Side: side, Number: n, Name: name, NumberName: '#' + n + ' ' + name })).join('') + '</Roster>');
    }
    res.statusCode = 404; res.end('<x/>');
  });
}
module.exports = { createServer, state };
if (require.main === module) createServer().listen(Number(process.argv[2]) || 18080, () => console.log('Fake OpenStatsEngine on :' + (Number(process.argv[2]) || 18080)));
