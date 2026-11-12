'use strict';
/**
 * NDI Audio Bridge: cough-mute announcer mics over its OSC port (default 9500).
 * Commands go out from our own socket, so the Bridge's replies (cough / live / name)
 * come back to us without changing where it sends Companion's feedback.
 */
const dgram = require('dgram');
const osc = require('../osc');

module.exports = (engine) => {
  const mics = {};   // "i/n" -> { cough, live, name }
  let sock = null; let lastReply = 0;
  const cfg = () => engine.store.config.bridge || { host: '', port: 9500 };

  function ensure() {
    if (sock) return sock;
    sock = dgram.createSocket('udp4');
    sock.on('message', (msg) => {
      try {
        for (const m of osc.decode(msg)) {
          const r = /^\/bridge\/in\/(\d+)\/(\d+)\/(cough|live|name)$/.exec(m.address);
          if (!r) continue;
          const id = r[1] + '/' + r[2]; mics[id] = mics[id] || {};
          mics[id][r[3]] = r[3] === 'name' ? String(m.args[0]) : !!Number(m.args[0]);
          lastReply = Date.now(); engine.changed();
        }
      } catch { /* ignore bad packets */ }
    });
    sock.on('error', (e) => engine.log('Audio Bridge socket: ' + e.message));
    sock.bind(0);
    if (sock.unref) sock.unref();
    return sock;
  }
  function send(address, args = []) {
    const c = cfg(); if (!c.host) return { ok: false, error: 'Set the NDI Audio Bridge address in Master › Setup' };
    ensure().send(osc.encode(address, args), Number(c.port) || 9500, c.host);
    return { ok: true };
  }

  engine.cmd('bridge.cough', ({ mic, value }) => {
    if (!/^\d+\/\d+$/.test(String(mic))) return { ok: false, error: 'Mic should look like 1/1 (interface/input)' };
    const tail = value === undefined || value === '' ? 'toggle' : Number(value) ? 'on' : 'off';
    const r = send('/bridge/in/' + mic + '/cough/' + tail);
    if (r.ok) { mics[mic] = mics[mic] || {}; if (tail !== 'toggle') mics[mic].cough = tail === 'on'; else mics[mic].cough = !mics[mic].cough; }
    return r;
  });
  engine.cmd('bridge.set', ({ host, port }) => { engine.store.config.bridge = { host: String(host || '').trim(), port: Number(port) || 9500 }; engine.store.saveConfig(); return { ok: true }; });

  return {
    name: 'bridge',
    stop() { try { if (sock) sock.close(); } catch { /* closed */ } },
    mic(id) { return mics[id] || null; },
    state() { const c = cfg(); return { host: c.host, port: c.port || 9500, heard: lastReply ? Math.round((Date.now() - lastReply) / 1000) : null, mics }; },
  };
};
