'use strict';
/**
 * Who may use the web pages and HTTP API.
 *
 *  - Requests must name this PC by IP address, "localhost" or its computer name (blocks DNS-rebinding).
 *  - Commands must come from our own pages, not from another website (blocks cross-site requests).
 *  - Optional PIN (Master › Setup): other devices (iPads, phones, another PC) must enter it once;
 *    they then get a cookie. The vMix PC itself never needs the PIN.
 *    Companion's Generic HTTP can add ?pin=1234 to /osc/... URLs instead.
 *  - OSC over UDP can be limited to a list of IP addresses (Companion's PC).
 */
const crypto = require('crypto');
const os = require('os');
const net = require('net');

const COOKIE = 'vuc_auth';
const MAX_FAILS = 5;
const LOCK_MS = 30000;

function ownAddresses() {
  const set = new Set(['127.0.0.1', '::1']);
  for (const list of Object.values(os.networkInterfaces())) for (const n of list || []) set.add(n.address);
  return set;
}
const clean = (a) => String(a || '').replace(/^::ffff:/, '');

function createAuth(store) {
  const cfg = () => store.config;
  const fails = new Map(); // ip -> { n, until }

  function secret() {
    if (!cfg().authSecret) { cfg().authSecret = crypto.randomBytes(32).toString('hex'); store.saveConfig(); }
    return cfg().authSecret;
  }
  const enabled = () => !!cfg().pin;
  const token = () => crypto.createHmac('sha256', secret()).update('pin:' + cfg().pin).digest('hex');
  const same = (a, b) => {
    const x = crypto.createHash('sha256').update(String(a)).digest();
    const y = crypto.createHash('sha256').update(String(b)).digest();
    return crypto.timingSafeEqual(x, y);
  };

  /** the request comes from this PC (any of its own addresses) */
  function isLocal(req) { return ownAddresses().has(clean(req.socket.remoteAddress)); }

  /** Host header must be an IP, localhost, or this computer's name. */
  function hostOk(req) {
    const h = String(req.headers.host || '').toLowerCase().replace(/:\d+$/, '').replace(/^\[|\]$/g, '');
    if (!h) return true; // HTTP/1.0 clients
    if (net.isIP(h) || h === 'localhost') return true;
    const me = os.hostname().toLowerCase();
    const extra = (cfg().allowedHosts || []).map((x) => String(x).toLowerCase());
    return h === me || h === me + '.local' || extra.includes(h);
  }

  /** true when a browser says this request was started by another website */
  function crossSite(req) {
    const sfs = req.headers['sec-fetch-site'];
    if (sfs && sfs !== 'same-origin' && sfs !== 'none') return true;
    const origin = req.headers.origin;
    if (origin && origin !== 'null') { try { return new URL(origin).host !== req.headers.host; } catch { return true; } }
    return !!origin; // "null" origin (sandboxed frame, file://)
  }

  function cookie(req) {
    const m = String(req.headers.cookie || '').split(/;\s*/).find((c) => c.startsWith(COOKIE + '='));
    return m ? decodeURIComponent(m.slice(COOKIE.length + 1)) : '';
  }

  /** may this request use the console? (pin param only for /osc/ GETs from Companion) */
  function allowed(req, pinParam) {
    if (!enabled() || isLocal(req)) return true;
    const c = cookie(req);
    if (c && same(c, token())) return true;
    if (pinParam !== undefined && pinParam !== null && checkPin(req, pinParam)) return true;
    return false;
  }

  function locked(req) {
    const f = fails.get(clean(req.socket.remoteAddress));
    return f && f.until > Date.now() ? Math.ceil((f.until - Date.now()) / 1000) : 0;
  }
  function checkPin(req, pin) {
    const ip = clean(req.socket.remoteAddress);
    if (locked(req)) return false;
    if (same(String(pin), cfg().pin)) { fails.delete(ip); return true; }
    const f = fails.get(ip) || { n: 0, until: 0 };
    f.n++; if (f.n >= MAX_FAILS) { f.n = 0; f.until = Date.now() + LOCK_MS; }
    fails.set(ip, f);
    return false;
  }

  /** POST /api/login {pin} -> { ok, cookie } */
  function login(req, pin) {
    if (!enabled()) return { ok: true };
    const wait = locked(req);
    if (wait) return { ok: false, error: 'Too many wrong PINs. Try again in ' + wait + ' s.' };
    if (!checkPin(req, pin)) return { ok: false, error: 'Wrong PIN' };
    return { ok: true, cookie: `${COOKIE}=${token()}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${60 * 60 * 24 * 30}` };
  }

  /** Only from the vMix PC. '' turns the PIN off. Changing it signs every device out. */
  function setPin(pin) {
    const p = String(pin ?? '').trim();
    if (p && !/^\d{4,8}$/.test(p)) return { ok: false, error: 'The PIN must be 4 to 8 digits (or empty for no PIN)' };
    cfg().pin = p;
    cfg().authSecret = crypto.randomBytes(32).toString('hex');
    store.saveConfig();
    return { ok: true };
  }

  /** UDP OSC: allowed source addresses ([] = anyone on the network) */
  function oscAllowed(address) {
    const list = cfg().oscAllow || [];
    if (!list.length) return true;
    const a = clean(address);
    return a === '127.0.0.1' || a === '::1' || list.includes(a);
  }
  function setOscAllow(list) {
    const items = (Array.isArray(list) ? list : String(list || '').split(/[\s,;]+/)).map((s) => s.trim()).filter(Boolean);
    const bad = items.find((s) => !net.isIP(s));
    if (bad) return { ok: false, error: 'Not an IP address: ' + bad };
    cfg().oscAllow = items; store.saveConfig();
    return { ok: true };
  }

  return { enabled, isLocal, hostOk, crossSite, allowed, login, setPin, oscAllowed, setOscAllow };
}

module.exports = { createAuth };
