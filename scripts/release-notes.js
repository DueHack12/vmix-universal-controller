'use strict';
/**
 * Print the CHANGELOG.md section for one version (used by the release workflow).
 *   node scripts/release-notes.js 0.1.0-beta.1
 */
const fs = require('fs');
const path = require('path');

const version = process.argv[2];
if (!version) { console.error('usage: node scripts/release-notes.js <version>'); process.exit(2); }
const text = fs.readFileSync(path.join(__dirname, '..', 'CHANGELOG.md'), 'utf8').replace(/\r\n/g, '\n');
const esc = version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const m = text.match(new RegExp('^## \\[' + esc + '\\][^\\n]*\\n([\\s\\S]*?)(?=^## \\[|^\\[[^\\]]+\\]:|(?![\\s\\S]))', 'm'));
if (!m) { console.error('No "## [' + version + ']" section in CHANGELOG.md'); process.exit(1); }
const zip = 'vmix-universal-controller-v' + version + '.zip';
process.stdout.write(m[1].trim() + '\n\n---\n**Install:** download `' + zip + '`, unzip it to `C:\\vMix Universal Controller`, and follow `SETUP.txt` inside.\n');
