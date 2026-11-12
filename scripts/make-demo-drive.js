'use strict';
/**
 * Builds a small fake "Broadcast Console" Drive folder with real media files (needs ffmpeg),
 * for trying the console with test/mock-vmix.js. Never used on the real Drive.
 *   node scripts/make-demo-drive.js <folder>
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const vid = (file, secs, color) => {
  if (fs.existsSync(file)) return;
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', `color=c=${color}:s=640x360:r=30:d=${secs}`, '-f', 'lavfi', '-i', `sine=frequency=440:duration=${secs}`, '-shortest', '-c:v', 'libx264', '-preset', 'ultrafast', '-c:a', 'aac', file]);
};
const mp3 = (file, secs, freq) => {
  if (fs.existsSync(file)) return;
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', `sine=frequency=${freq}:duration=${secs}`, '-c:a', 'libmp3lame', '-b:a', '128k', file]);
};
function build(root) {
const dir = (...p) => { const d = path.join(root, ...p); fs.mkdirSync(d, { recursive: true }); return d; };

const V = dir('Videos', 'Highlights'); dir('Videos', 'Pregame'); dir('Videos', 'Packages');
vid(path.join(V, 'Doe goal.mp4'), 6, 'purple'); vid(path.join(V, 'PK save replay.mp4'), 4, 'gray');
vid(path.join(V, 'Pregame hype 2026.mp4'), 8, 'navy');
const M = dir('Music', 'Bumps'); dir('Music', 'Highlights'); dir('Music', 'Pregame'); dir('Music', 'Timeouts');
mp3(path.join(M, 'ES_Run for Cover - Sven Karlsson.mp3'), 20, 330); mp3(path.join(M, 'ES_Varg! (Instrumental).mp3'), 15, 392); mp3(path.join(M, 'Timeless.mp3'), 12, 523);
const A15 = dir('Ads', '15Second'); const A30 = dir('Ads', '30Second'); dir('Ads', '1Minute'); dir('Ads', '2Minutes+');
const AU = dir('Ads', 'Unsorted'); const NF = dir('Ads', 'Sponsors', 'NFHS'); dir('Ads', 'Sponsors', 'DAF');
vid(path.join(A15, 'Booster club 15sec.mp4'), 3, 'green'); vid(path.join(A30, 'Local Business Promo.mp4'), 5, 'red');
vid(path.join(A30, 'Innovation Camp 2025.mp4'), 5, 'teal'); vid(path.join(A30, 'Campus Fly-Thru.mp4'), 4, 'orange');
vid(path.join(AU, 'Sizzle Reel.mp4'), 4, 'maroon'); vid(path.join(NF, 'NFHS Network spot.mp4'), 5, 'blue');
for (const d of ['Graphics/Logos', 'Shows', 'Exports', '_Archive']) dir(...d.split('/'));
return root;
}
module.exports = { build };
if (require.main === module) { const root = build(path.resolve(process.argv[2] || path.join(__dirname, '..', 'demo-drive'))); console.log('Demo drive ready at ' + root); }
