'use strict';
/**
 * Try the console without vMix: starts the fake vMix (port 18088), builds a demo Drive
 * folder (needs ffmpeg for the media; works without it, just with empty folders),
 * and runs the console on port 8791 with its own data folder.
 *   node scripts/demo.js
 */
const path = require('path');
const fs = require('fs');
const { spawn, execFileSync } = require('child_process');
const mock = require('../test/mock-vmix');
const ose = require('../test/mock-ose');

const root = path.join(__dirname, '..');
const drive = path.join(root, 'demo-drive');
try { execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' }); require('./make-demo-drive').build(drive); }
catch { fs.mkdirSync(drive, { recursive: true }); console.log('(ffmpeg not found: demo folders will be empty)'); }

mock.createServer().listen(18088, () => console.log('Fake vMix on 127.0.0.1:18088'));
ose.createServer().listen(18080, () => console.log('Fake OpenStatsEngine on 127.0.0.1:18080 (set http://127.0.0.1:18080 in Master › Setup)'));
const child = spawn(process.execPath, [path.join(root, 'server.js'), '--port', '8791', '--data', path.join(root, 'demo-data'), '--vmix', '127.0.0.1:18088', '--drive', drive, '--osc', '19601', '--ose', 'http://127.0.0.1:18080'], { stdio: 'inherit' });
setTimeout(() => {
  const url = 'http://localhost:8791/control?layout=vertical';
  console.log('\nOpen ' + url);
  const opener = process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]] : process.platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]];
  try { const c = spawn(opener[0], opener[1], { stdio: 'ignore', detached: true }); c.on('error', () => {}); c.unref(); } catch { /* no browser */ }
}, 1500);
process.on('SIGINT', () => { child.kill(); process.exit(0); });
