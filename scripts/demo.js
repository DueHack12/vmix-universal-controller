'use strict';
/**
 * Try vMix UC without vMix: starts the fake vMix (port 18088), builds a demo Drive
 * folder (needs ffmpeg for the media; works without it, just with empty folders),
 * and runs vMix UC on port 8791 with its own data folder.
 *   node scripts/demo.js [--gc-dir <vMix Graphics Control app folder>]
 * With --gc-dir, the fake vMix also gets the Graphics Controller's GT titles (from its public/gt/manifest.json).
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

// the Graphics Controller's titles, so the demo shows them like a real vMix with its titles loaded
const gcArg = process.argv.indexOf('--gc-dir');
const gcDir = gcArg > 0 ? process.argv[gcArg + 1] : process.env.GC_DIR;
if (gcDir) {
  try {
    const man = JSON.parse(fs.readFileSync(path.join(gcDir, 'public', 'gt', 'manifest.json'), 'utf8'));
    for (const t of man.titles || []) {
      const fields = [...(t.texts || []).map((x) => ({ kind: 'text', name: x.name + '.Text', value: x.sample || '' })),
        ...(t.layers || []).filter((l) => l.type === 'image').map((l) => ({ kind: 'image', name: l.name + '.Source', value: '' }))];
      mock.addInput({ type: 'GT', title: path.basename(t.file || t.name + '.gtzip'), fields });
    }
    console.log('Fake vMix: added ' + (man.titles || []).length + ' Graphics Controller titles');
  } catch (e) { console.log('(Graphics Controller titles not loaded: ' + e.message + ')'); }
}
mock.createServer().listen(18088, () => console.log('Fake vMix on 127.0.0.1:18088'));
ose.createServer().listen(18080, () => console.log('Fake OpenStatsEngine on 127.0.0.1:18080 (set http://127.0.0.1:18080 in Master › Setup)'));
const child = spawn(process.execPath, [path.join(root, 'server.js'), '--port', '8791', '--data', path.join(root, 'demo-data'), '--vmix', '127.0.0.1:18088', '--drive', drive, '--osc', '19601', '--ose', 'http://127.0.0.1:18080'], { stdio: 'inherit' });
setTimeout(() => {
  const url = 'http://localhost:8791/control?layout=vertical';
  console.log('\nOpen ' + url);
  const opener = process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]] : process.platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]];
  try { const c = spawn(opener[0], opener[1], { stdio: 'ignore', detached: true }); c.on('error', () => {}); c.unref(); } catch { /* no browser */ }
}, 1500);
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => { child.kill(); process.exit(0); });
