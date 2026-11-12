'use strict';
/**
 * Media helpers: folder scans, real durations (MP4/MOV mvhd, MP3, WAV, ffprobe fallback,
 * file-name fallback) with a cache, and video thumbnails via ffmpeg when it is installed.
 * Reads only. Never moves, renames or deletes anything.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFile } = require('child_process');

const VIDEO_EXT = ['.mp4', '.mov', '.m4v', '.avi', '.wmv', '.mkv', '.mxf', '.3gp'];
const AUDIO_EXT = ['.mp3', '.wav', '.m4a', '.aac', '.flac', '.ogg', '.wma'];

function readAt(fd, pos, len) {
  const b = Buffer.alloc(len);
  const n = fs.readSync(fd, b, 0, len, pos);
  return b.subarray(0, n);
}

/** MP4/MOV/M4V/3GP/M4A: duration in seconds from the moov/mvhd atom. */
function mp4Duration(file) {
  const fd = fs.openSync(file, 'r');
  try {
    const size = fs.fstatSync(fd).size;
    let pos = 0;
    while (pos + 8 <= size) {
      const h = readAt(fd, pos, 16);
      let len = h.readUInt32BE(0); const type = h.toString('latin1', 4, 8); let hdr = 8;
      if (len === 1) { len = Number(h.readBigUInt64BE(8)); hdr = 16; } else if (len === 0) len = size - pos;
      if (len < 8) return null;
      if (type === 'moov') {
        let p = pos + hdr; const end = pos + len;
        while (p + 8 <= end) {
          const c = readAt(fd, p, 8); const clen = c.readUInt32BE(0); const ctype = c.toString('latin1', 4, 8);
          if (clen < 8) return null;
          if (ctype === 'mvhd') {
            const b = readAt(fd, p + 8, 32); const ver = b[0];
            const ts = ver === 1 ? b.readUInt32BE(20) : b.readUInt32BE(12);
            const du = ver === 1 ? Number(b.readBigUInt64BE(24)) : b.readUInt32BE(16);
            return ts ? du / ts : null;
          }
          p += clen;
        }
        return null;
      }
      pos += len;
    }
    return null;
  } finally { fs.closeSync(fd); }
}

const MP3_BITRATES = {
  V1L3: [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320],
  V2L3: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
};
const MP3_RATES = { 3: [44100, 48000, 32000], 2: [22050, 24000, 16000], 0: [11025, 12000, 8000] };

/** MP3: Xing/Info or VBRI frame count, else constant-bitrate estimate. */
function mp3Duration(file) {
  const fd = fs.openSync(file, 'r');
  try {
    const size = fs.fstatSync(fd).size;
    let start = 0;
    const id3 = readAt(fd, 0, 10);
    if (id3.toString('latin1', 0, 3) === 'ID3') start = 10 + ((id3[6] & 0x7f) << 21 | (id3[7] & 0x7f) << 14 | (id3[8] & 0x7f) << 7 | (id3[9] & 0x7f));
    const buf = readAt(fd, start, 64 * 1024);
    for (let i = 0; i + 4 < buf.length; i++) {
      if (buf[i] !== 0xff || (buf[i + 1] & 0xe0) !== 0xe0) continue;
      const ver = (buf[i + 1] >> 3) & 3; const layer = (buf[i + 1] >> 1) & 3;
      const bri = (buf[i + 2] >> 4) & 15; const sri = (buf[i + 2] >> 2) & 3; const mode = (buf[i + 3] >> 6) & 3;
      if (ver === 1 || layer !== 1 || bri === 0 || bri === 15 || sri === 3) continue; // layer 3 only
      const sr = MP3_RATES[ver][sri];
      const kbps = (ver === 3 ? MP3_BITRATES.V1L3 : MP3_BITRATES.V2L3)[bri];
      const spf = ver === 3 ? 1152 : 576;
      const side = ver === 3 ? (mode === 3 ? 17 : 32) : (mode === 3 ? 9 : 17);
      const x = buf.toString('latin1', i + 4 + side, i + 8 + side);
      if (x === 'Xing' || x === 'Info') {
        const flags = buf.readUInt32BE(i + 8 + side);
        if (flags & 1) return (buf.readUInt32BE(i + 12 + side) * spf) / sr;
      }
      if (buf.toString('latin1', i + 36, i + 40) === 'VBRI') return (buf.readUInt32BE(i + 36 + 14) * spf) / sr;
      return ((size - start - i) * 8) / (kbps * 1000);
    }
    return null;
  } finally { fs.closeSync(fd); }
}

/** WAV: data size / byte rate. */
function wavDuration(file) {
  const fd = fs.openSync(file, 'r');
  try {
    const h = readAt(fd, 0, 12);
    if (h.toString('latin1', 0, 4) !== 'RIFF' || h.toString('latin1', 8, 12) !== 'WAVE') return null;
    let pos = 12; let byteRate = 0; const size = fs.fstatSync(fd).size;
    while (pos + 8 <= size) {
      const c = readAt(fd, pos, 16); const id = c.toString('latin1', 0, 4); const len = c.readUInt32LE(4);
      if (id === 'fmt ') byteRate = c.readUInt32LE(8 + 8);
      if (id === 'data') return byteRate ? len / byteRate : null;
      pos += 8 + len + (len & 1);
    }
    return null;
  } finally { fs.closeSync(fd); }
}

/** "Promo 1min47sec.mp4" -> 107, "30sec" -> 30, "15s" -> 15 */
function durationFromName(name) {
  const s = String(name).toLowerCase();
  let m = s.match(/(\d+)\s*min(?:ute)?s?\s*(\d+)\s*s(?:ec(?:ond)?s?)?/);
  if (m) return Number(m[1]) * 60 + Number(m[2]);
  m = s.match(/(\d+)\s*min(?:ute)?s?\b/); if (m) return Number(m[1]) * 60;
  m = s.match(/(\d+)\s*s(?:ec(?:ond)?s?)?\b/); if (m) return Number(m[1]);
  return null;
}

function findTool(name, configured) {
  const exe = process.platform === 'win32' ? name + '.exe' : name;
  const cands = [];
  if (configured) cands.push(configured);
  for (const d of (process.env.PATH || '').split(path.delimiter)) if (d) cands.push(path.join(d, exe));
  if (process.platform === 'win32') {
    const pf = [process.env.ProgramFiles, process.env['ProgramFiles(x86)'], process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Microsoft', 'WinGet', 'Links')];
    cands.push(path.join('C:\\ffmpeg\\bin', exe), path.join(__dirname, '..', 'tools', exe));
    for (const p of pf) if (p) cands.push(path.join(p, 'ffmpeg', 'bin', exe));
    if (process.env.USERPROFILE) cands.push(path.join(process.env.USERPROFILE, 'scoop', 'shims', exe));
    cands.push(path.join('C:\\ProgramData\\chocolatey\\bin', exe));
  }
  return cands.find((c) => { try { return fs.statSync(c).isFile(); } catch { return false; } }) || null;
}

function ffprobeDuration(ffprobe, file) {
  return new Promise((resolve) => {
    if (!ffprobe) return resolve(null);
    execFile(ffprobe, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file], { timeout: 15000, windowsHide: true }, (err, out) => {
      const v = parseFloat(String(out || '').trim());
      resolve(err || !isFinite(v) ? null : v);
    });
  });
}

class Media {
  constructor(store) {
    this.store = store;
    this.cacheFile = store.cachePath('durations.json');
    try { this.cache = JSON.parse(fs.readFileSync(this.cacheFile, 'utf8')); } catch { this.cache = {}; }
    this.dirty = false;
    this.thumbQueue = []; this.thumbBusy = 0; this.thumbFails = new Set(); this.thumbsKnown = new Set();
  }
  get ffprobe() { return findTool('ffprobe', this.store.config.ffprobePath); }
  get ffmpeg() { return findTool('ffmpeg', this.store.config.ffmpegPath); }
  flush() {
    if (!this.dirty) return;
    this.dirty = false;
    try { fs.writeFileSync(this.cacheFile, JSON.stringify(this.cache)); } catch { /* ignore */ }
  }

  /** { seconds, source } with source = cache-able: mp4|mp3|wav|ffprobe|filename|none */
  async duration(file) {
    let st; try { st = await fs.promises.stat(file); } catch { return { seconds: null, source: 'missing' }; }
    const stamp = st.size + ':' + Math.round(st.mtimeMs);
    const c = this.cache[file];
    if (c && c.stamp === stamp) return { seconds: c.seconds, source: c.source };
    let seconds = null; let source = 'none';
    const ext = path.extname(file).toLowerCase();
    try {
      if (['.mp4', '.mov', '.m4v', '.3gp', '.m4a'].includes(ext)) { seconds = mp4Duration(file); source = 'mp4'; }
      else if (ext === '.mp3') { seconds = mp3Duration(file); source = 'mp3'; }
      else if (ext === '.wav') { seconds = wavDuration(file); source = 'wav'; }
    } catch { seconds = null; }
    if (!seconds) { seconds = await ffprobeDuration(this.ffprobe, file); source = 'ffprobe'; }
    if (!seconds) { seconds = durationFromName(path.basename(file)); source = seconds ? 'filename' : 'none'; }
    if (seconds) seconds = Math.round(seconds * 100) / 100;
    this.cache[file] = { stamp, seconds, source };
    this.dirty = true;
    return { seconds, source };
  }

  /** Top level of one folder. kind: 'video' | 'audio' | 'any' */
  async scan(dir, kind = 'any') {
    const exts = kind === 'video' ? VIDEO_EXT : kind === 'audio' ? AUDIO_EXT : VIDEO_EXT.concat(AUDIO_EXT);
    let names = [];
    try { names = (await fs.promises.readdir(dir, { withFileTypes: true })).filter((d) => d.isFile() && exts.includes(path.extname(d.name).toLowerCase())).map((d) => d.name); } catch { return []; }
    names.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    const out = [];
    const work = names.map((n) => async () => {
      const file = path.join(dir, n);
      const d = await this.duration(file);
      out.push({ path: file, name: n.replace(/\.[^.]+$/, ''), file: n, seconds: d.seconds, source: d.source });
    });
    // 8 at a time (Google Drive for desktop is slow per file)
    const runners = Array.from({ length: Math.min(8, work.length) }, async () => { while (work.length) await work.shift()(); });
    await Promise.all(runners);
    out.sort((a, b) => a.file.localeCompare(b.file, undefined, { numeric: true }));
    this.flush();
    return out;
  }

  subfolders(dir) {
    try { return fs.readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory() && !d.name.startsWith('_') && !d.name.startsWith('.')).map((d) => d.name).sort(); } catch { return []; }
  }
  /** same as subfolders(), without blocking the server while Google Drive is slow */
  async subfoldersAsync(dir) {
    try { return (await fs.promises.readdir(dir, { withFileTypes: true })).filter((d) => d.isDirectory() && !d.name.startsWith('_') && !d.name.startsWith('.')).map((d) => d.name).sort(); } catch { return []; }
  }

  thumbId(file) { return crypto.createHash('sha1').update(file).digest('hex').slice(0, 20); }
  thumbPath(file) { return this.store.cachePath('thumbs', this.thumbId(file) + '.jpg'); }
  hasThumb(file) {
    if (this.thumbsKnown.has(file)) return true;
    try { if (fs.statSync(this.thumbPath(file)).size > 0) { this.thumbsKnown.add(file); return true; } } catch { /* not yet */ }
    return false;
  }
  /** Queue a thumbnail; returns true if one already exists. */
  wantThumb(file) {
    if (this.hasThumb(file)) return true;
    if (!this.thumbQueue.includes(file) && !this.thumbFails.has(file)) { this.thumbQueue.push(file); this.pumpThumbs(); }
    return false;
  }
  pumpThumbs() {
    const ffmpeg = this.ffmpeg;
    if (!ffmpeg) { this.thumbQueue.length = 0; return; }
    while (this.thumbBusy < 2 && this.thumbQueue.length) {
      const file = this.thumbQueue.shift(); this.thumbBusy++;
      execFile(ffmpeg, ['-y', '-v', 'error', '-ss', '1', '-i', file, '-frames:v', '1', '-vf', 'scale=320:-2', this.thumbPath(file)], { timeout: 30000, windowsHide: true }, (err) => {
        this.thumbBusy--; if (err) this.thumbFails.add(file);
        if (this.onThumb && !err) this.onThumb(file);
        this.pumpThumbs();
      });
    }
  }
}

module.exports = { Media, mp4Duration, mp3Duration, wavDuration, durationFromName, findTool, VIDEO_EXT, AUDIO_EXT };
