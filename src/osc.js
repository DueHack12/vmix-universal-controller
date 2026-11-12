'use strict';
/**
 * OSC for Bitfocus Companion / Stream Deck.
 *  - decode/encode OSC 1.0 messages and bundles (types i f s T F N)
 *  - route(path, args) maps /console/... paths to engine commands
 * The same routes work over HTTP:  GET /osc/console/gfx/genl3/take?value=1
 */

function pad4(n) { return (n + 3) & ~3; }
function readStr(buf, off) {
  let end = off; while (end < buf.length && buf[end] !== 0) end++;
  return [buf.toString('utf8', off, end), pad4(end + 1)];
}
function decode(buf) {
  if (buf.toString('utf8', 0, 7) === '#bundle') {
    const out = []; let off = 16;
    while (off + 4 <= buf.length) { const len = buf.readInt32BE(off); off += 4; out.push(...decode(buf.subarray(off, off + len))); off += len; }
    return out;
  }
  let [address, off] = readStr(buf, 0);
  let types = ',';
  if (off < buf.length && buf[off] === 44) [types, off] = readStr(buf, off);
  const args = [];
  for (const t of types.slice(1)) {
    if (t === 'i') { args.push(buf.readInt32BE(off)); off += 4; }
    else if (t === 'f') { args.push(buf.readFloatBE(off)); off += 4; }
    else if (t === 's') { let s; [s, off] = readStr(buf, off); args.push(s); }
    else if (t === 'T') args.push(true);
    else if (t === 'F') args.push(false);
    else if (t === 'N') args.push(null);
    else break;
  }
  return [{ address, args }];
}
function encStr(s) { const b = Buffer.from(String(s) + '\0', 'utf8'); const out = Buffer.alloc(pad4(b.length)); b.copy(out); return out; }
function encode(address, args = []) {
  let types = ','; const parts = [];
  for (const a of args) {
    if (typeof a === 'number' && Number.isInteger(a)) { types += 'i'; const b = Buffer.alloc(4); b.writeInt32BE(a); parts.push(b); }
    else if (typeof a === 'number') { types += 'f'; const b = Buffer.alloc(4); b.writeFloatBE(a); parts.push(b); }
    else if (typeof a === 'boolean') types += a ? 'T' : 'F';
    else { types += 's'; parts.push(encStr(a)); }
  }
  return Buffer.concat([encStr(address), encStr(types), ...parts]);
}

/** OSC path -> [command, args]. First argument (if any) becomes `value`. */
function route(addr, args = []) {
  const p = String(addr).replace(/^\/+|\/+$/g, '').split('/').map(decodeURIComponent);
  if (p[0] === 'console') p.shift();
  const v = args.length ? args[0] : undefined;
  const value = v === true ? 1 : v === false ? 0 : v;
  const [area, a1, a2, a3] = p;
  switch (area) {
    case 'gfx':
      if (a1 === 'allout') return ['gfx.allout', {}];
      if (a2 === 'field') return ['gfx.set', { id: a1, field: a3, value }];
      if (['take', 'out', 'toggle'].includes(a2)) return ['gfx.' + a2, { id: a1, value }];
      break;
    case 'video':
      if (['next', 'playpause', 'restart'].includes(a1)) return ['video.' + a1, { value }];
      if (a1 === 'jog') return ['video.jog', { seconds: Number(value) || 0 }];
      break;
    case 'ads':
      if (a1 === 'prev') return ['ads.prev', {}];
      if (a1 === 'fade' && (a2 === 'in' || a2 === 'out')) return ['ads.fade', { dir: a2, ms: value }];
      if (['go', 'cancel', 'back', 'skip', 'reshuffle', 'newgame'].includes(a1)) return [a1 === 'reshuffle' ? 'ads.fill' : a1 === 'newgame' ? 'ads.newGame' : 'ads.' + a1, {}];
      if (a1 === 'break' && a2) return a3 === 'go' ? ['ads.go', { id: a2 }] : ['ads.select', { id: a2 }];
      if (a1 === 'length') return ['ads.target', { seconds: value }];
      break;
    case 'music':
      if (a1 === 'level') return typeof value === 'string' && /^[+-]/.test(value) ? ['music.level', { step: Number(value) }] : ['music.level', { value: value ?? a2, ms: args[1] }];
      if (a1 === 'fade' && a2 === 'out') return ['music.fadeout', { ms: value }];
      if (a1 === 'fade' && a2 === 'in') return ['music.fadein', {}];
      if (a1 === 'playlist' && a2) return ['music.playlist', { name: a2 }];
      if (['play', 'pause', 'toggle', 'next', 'prev', 'kill'].includes(a1)) return ['music.' + a1, {}];
      break;
    case 'mix':
      if (a1 === 'select') return ['mix.select', { step: value === undefined ? 1 : Number(value) }];
      if (a1 === 'selected' && a2 === 'level') return ['mix.selectedLevel', typeof value === 'string' && /^[+-]/.test(value) ? { step: Number(value) } : { value }];
      if (a1 === 'selected' && a2 === 'mute') return ['mix.selectedMute', { value }];
      if (a2 === 'mute' || a2 === 'listen' || a2 === 'cough') return ['mix.' + a2, { id: a1, value }];
      if (a2 === 'level') return typeof value === 'string' && /^[+-]/.test(value) ? ['mix.level', { id: a1, step: Number(value) }] : ['mix.level', { id: a1, value }];
      break;
    case 'statpop': return ['gfx.statpop', { side: a1 === 'away' ? 'away' : 'home', number: a2 || '', event: String(a3 || '').toUpperCase().replace(/[-_]/g, ' ') }];
    case 'rec': return [value === undefined ? 'rec.toggle' : Number(value) ? 'rec.start' : 'rec.stop', {}];
    case 'stream': return ['stream.toggle', {}];
    default: break;
  }
  return null;
}

module.exports = { decode, encode, route };
