'use strict';
/**
 * vMix HTTP API client.
 *  - poll() reads /api (XML) and returns a parsed snapshot
 *  - fn(name, params) calls /api/?Function=name&...
 * Only Node built-ins. Works against real vMix or test/mock-vmix.js.
 */
const http = require('http');
const { parse, child, children, text } = require('./xml');

function get(host, port, path, timeout = 1500) {
  return new Promise((resolve, reject) => {
    const req = http.get({ host, port, path, timeout, headers: { Connection: 'keep-alive' } }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (d) => (body += d));
      res.on('end', () => (res.statusCode >= 200 && res.statusCode < 300 ? resolve(body) : reject(new Error('vMix HTTP ' + res.statusCode + ': ' + body.slice(0, 120)))));
    });
    req.on('timeout', () => req.destroy(new Error('vMix timeout')));
    req.on('error', reject);
  });
}

const bool = (v) => String(v).toLowerCase() === 'true';
const num = (v, d = 0) => (v === undefined || v === '' ? d : Number(v));

/** Turn the vMix XML tree into a plain snapshot object. */
function snapshot(xmlText) {
  const root = parse(xmlText);
  const inputs = children(child(root, 'inputs'), 'input').map((n) => {
    const a = n.attrs;
    const inp = {
      key: a.key, number: num(a.number), type: a.type || '', title: a.title || text(n), shortTitle: a.shortTitle || a.title || '',
      state: a.state || '', position: num(a.position), duration: num(a.duration), loop: bool(a.loop),
      muted: bool(a.muted), volume: num(a.volume, 100), balance: num(a.balance), solo: bool(a.solo),
      audiobusses: a.audiobusses || '', meterF1: num(a.meterF1), meterF2: num(a.meterF2),
      selectedIndex: num(a.selectedIndex, 0),
      fields: [], list: [],
    };
    for (const c of n.children) {
      if (c.name === 'text' || c.name === 'image' || c.name === 'color') {
        inp.fields.push({ kind: c.name, index: num(c.attrs.index), name: c.attrs.name || '', value: c.text });
      } else if (c.name === 'list') {
        inp.list = children(c, 'item').map((it, i) => ({ index: i + 1, path: text(it), selected: bool(it.attrs.selected) }));
      }
    }
    return inp;
  });
  const overlays = children(child(root, 'overlays'), 'overlay').map((o) => ({ number: num(o.attrs.number), input: text(o) ? Number(text(o)) : 0, preview: o.attrs.preview ? Number(o.attrs.preview) : 0 }));
  const audioN = child(root, 'audio');
  const audio = {};
  if (audioN) for (const b of audioN.children) {
    audio[b.name] = { volume: num(b.attrs.volume, 100), muted: bool(b.attrs.muted), meterF1: num(b.attrs.meterF1), meterF2: num(b.attrs.meterF2), solo: bool(b.attrs.solo), headphonesVolume: num(b.attrs.headphonesVolume, 0) };
  }
  const rec = child(root, 'recording');
  const str = child(root, 'streaming');
  return {
    version: text(child(root, 'version')), edition: text(child(root, 'edition')),
    inputs, overlays, audio,
    preview: num(text(child(root, 'preview'))), active: num(text(child(root, 'active'))),
    recording: bool(text(rec)), recordingDuration: rec ? num(rec.attrs.duration, 0) : 0,
    streaming: bool(text(str)), external: bool(text(child(root, 'external'))),
    fadeToBlack: bool(text(child(root, 'fadeToBlack'))),
  };
}

class VmixClient {
  constructor({ host = '127.0.0.1', port = 8088 } = {}) {
    this.host = host; this.port = port;
    this.connected = false; this.lastError = ''; this.snap = null; this.calls = 0;
  }
  setAddress(host, port) { this.host = host; this.port = Number(port) || 8088; }
  async poll() {
    try {
      const body = await get(this.host, this.port, '/api');
      this.snap = snapshot(body);
      this.connected = true; this.lastError = '';
      return this.snap;
    } catch (e) {
      this.connected = false; this.lastError = e.message;
      throw e;
    }
  }
  /** Call a vMix function. params: { Input, Value, SelectedName, Duration, ... } */
  async fn(name, params = {}) {
    const q = new URLSearchParams({ Function: name });
    for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') q.set(k, String(v));
    this.calls++;
    return get(this.host, this.port, '/api/?' + q.toString());
  }
}

module.exports = { VmixClient, snapshot };
