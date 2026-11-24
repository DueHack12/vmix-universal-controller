/* vMix Universal Controller: shared browser helpers (no build step). */
'use strict';
window.BC = (() => {
  let state = null; const subs = [];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const attr = (o) => esc(JSON.stringify(o || {}));
  const mmss = (s) => { s = Math.max(0, Math.round(s || 0)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
  const hms = (s) => { s = Math.max(0, Math.round(s || 0)); return String(Math.floor(s / 3600)).padStart(2, '0') + ':' + String(Math.floor(s / 60) % 60).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); };
  const meterPct = (db) => Math.max(0, Math.min(100, Math.round(((db + 60) / 60) * 100)));

  /* toasts the Graphics Controller way: frosted glass, bottom centre, a status light.
     kind: 'info' | 'ok' | 'bad'. Errors stay until dismissed (✕); the same message again just counts up. */
  function toast(msg, kind = 'info') {
    let box = document.querySelector('.toasts');
    if (!box) { box = document.createElement('div'); box.className = 'toasts'; box.setAttribute('role', 'status'); document.body.appendChild(box); }
    msg = String(msg || '');
    const same = [...box.children].find((t) => t._msg === msg && !t.classList.contains('gone'));
    if (same) { same._n = (same._n || 1) + 1; same.querySelector('.tn').textContent = '×' + same._n; arm(same); return; }
    const t = document.createElement('div');
    t.className = 'toast ' + kind; t._msg = msg; t._kind = kind;
    t.innerHTML = `<span class="tl"></span><span class="tm"></span><span class="tn"></span>${kind === 'bad' ? '<button class="tx" aria-label="Dismiss">✕</button>' : ''}`;
    t.querySelector('.tm').textContent = msg;
    const x = t.querySelector('.tx'); if (x) x.onclick = () => drop(t);
    box.appendChild(t);
    while (box.children.length > 4) drop(box.firstElementChild, true);
    arm(t);
  }
  function arm(t) { clearTimeout(t._h); if (t._kind !== 'bad') t._h = setTimeout(() => drop(t), 3500); }
  function drop(t, now) { if (!t) return; t.classList.add('gone'); setTimeout(() => t.remove(), now ? 0 : 220); }

  /* a pressed key lights up when vMix UC answers: green ring = done, red = refused (the reason comes as a toast).
     Kept across re-renders: sections are redrawn often, so the light is put back on the new button. */
  const flashes = new Map();   // "cmd|args" -> { kind, until }
  const flashKey = (c, a) => c + '|' + (a || '{}');
  function flash(c, a, kind) {
    const k = flashKey(c, a); flashes.set(k, { kind, until: Date.now() + 700 });
    reflash(document); setTimeout(() => { flashes.delete(k); for (const el of document.querySelectorAll('.flash-ok, .flash-bad')) if (!flashes.has(flashKey(el.dataset.cmd, el.dataset.args))) el.classList.remove('flash-ok', 'flash-bad'); }, 720);
  }
  function reflash(root) {
    if (!flashes.size || !root.querySelectorAll) return;
    for (const el of root.querySelectorAll('[data-cmd]')) {
      const f = flashes.get(flashKey(el.dataset.cmd, el.dataset.args));
      if (f && f.until > Date.now()) el.classList.add(f.kind === 'ok' ? 'flash-ok' : 'flash-bad');
    }
  }

  async function cmd(name, args) {
    try {
      const r = await fetch('/api/cmd', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cmd: name, args: args || {} }) });
      if (r.status === 401) { toLogin(); return { ok: false }; }
      const j = await r.json().catch(() => ({ ok: false, error: 'Bad reply' }));
      if (!j.ok && j.error) toast(j.error, 'bad');
      if (j.note) toast(j.note, 'info');
      return j;
    } catch (e) { toast('vMix UC not reachable: ' + e.message, 'bad'); return { ok: false }; }
  }

  /* live state: first message { full }, then { set, merge } with only what changed (see src/statediff.js) */
  function apply(msg) {
    if (msg.full) return msg.full;
    const s = { ...(state || {}) };
    for (const [k, v] of Object.entries(msg.set || {})) s[k] = v;
    for (const [k, v] of Object.entries(msg.merge || {})) s[k] = { ...(s[k] || {}), ...v };
    return s;
  }
  function toLogin() { location.href = '/login?next=' + encodeURIComponent(location.pathname + location.search + location.hash); }
  function connect() {
    const es = new EventSource('/api/events');
    es.onmessage = (e) => { state = apply(JSON.parse(e.data)); for (const f of subs) f(state); };
    es.onerror = () => {
      for (const f of subs) f(null);
      fetch('/api/state', { method: 'HEAD' }).then((r) => { if (r.status === 401) toLogin(); }).catch(() => {});
    };
  }
  function onState(f) { subs.push(f); if (state) f(state); }

  /* delegated controls:
     data-cmd + data-args          -> click runs the command
     data-hold                      -> must be pressed ~0.6 s
     <select|input data-cmd data-key="value"> -> change runs the command with args[key] = value */
  function wire(root = document) {
    let holdTimer = null; let holdEl = null;
    const run = (el) => {
      const args = el.dataset.args ? JSON.parse(el.dataset.args) : {};
      if (el.dataset.key) args[el.dataset.key] = el.type === 'checkbox' ? (el.checked ? 1 : 0) : el.value;
      if (el.dataset.confirm && !confirm(el.dataset.confirm)) return;
      const c = el.dataset.cmd; const a = el.dataset.args;
      cmd(c, args).then((r) => { if (el.tagName === 'BUTTON') flash(c, a, r && r.ok ? 'ok' : 'bad'); });
    };
    root.addEventListener('click', (e) => {
      const el = e.target.closest('[data-cmd]');
      if (!el || el.tagName === 'SELECT' || el.tagName === 'INPUT' || el.dataset.hold !== undefined) return;
      run(el);
    });
    root.addEventListener('change', (e) => { const el = e.target.closest('select[data-cmd], input[data-cmd]'); if (el) run(el); });
    root.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.matches('input[data-cmd]')) { e.target.blur(); } });
    const start = (e) => {
      const el = e.target.closest('[data-hold]'); if (!el) return;
      e.preventDefault(); holdEl = el; el.classList.add('holding');
      const cmdName = el.dataset.cmd; const args = el.dataset.args ? JSON.parse(el.dataset.args) : {};
      const a = el.dataset.args;
      holdTimer = setTimeout(() => { holdTimer = null; el.classList.remove('holding'); cmd(cmdName, args).then((r) => flash(cmdName, a, r && r.ok ? 'ok' : 'bad')); }, 600);
    };
    const stop = () => { if (holdTimer) { clearTimeout(holdTimer); holdTimer = null; } if (holdEl) holdEl.classList.remove('holding'); holdEl = null; };
    root.addEventListener('pointerdown', start);
    root.addEventListener('pointerup', stop); root.addEventListener('pointercancel', stop); root.addEventListener('pointerleave', stop, true);
  }

  /**
   * Replace innerHTML only when it changed, and never under the operator's finger: not while they
   * type in a field inside, and not between pointer-down and the click (a section with a running
   * timer is redrawn every second; replacing the button mid-tap used to lose the tap).
   */
  const pending = new Set();
  let pressed = null;
  const busy = (el) => (pressed && el.contains(pressed)) || (el.contains(document.activeElement) && document.activeElement.matches('input, textarea, select'));
  function patch(el, html) {
    if (!el || el._html === html) return;
    if (busy(el)) { el._pending = html; pending.add(el); return; }
    el._html = html; el._pending = null; pending.delete(el); el.innerHTML = html;
    reflash(el);
  }
  function flush() { for (const el of [...pending]) if (!busy(el)) patch(el, el._pending); }
  document.addEventListener('pointerdown', (e) => { pressed = e.target; }, true);
  const release = () => setTimeout(() => { pressed = null; flush(); }, 0); // after the click event
  document.addEventListener('pointerup', release, true);
  document.addEventListener('pointercancel', release, true);
  document.addEventListener('focusout', () => { setTimeout(flush, 50); });

  /* ---------- mixer faders and meters ----------
     The mixer's HTML only changes when channels or their modes change. Meters, fader positions and
     level labels are updated in place (mixLive), so the page never rebuilds the mixer several times
     a second, which used to swallow taps and feel laggy.
     <input type="range" data-fader="id">  sends mix.level while you drag (at most every 60 ms) and
     on release; while held (and 1.2 s after) the server's value doesn't move it.
     [data-meter="id"] (height %), [data-meter-l / -r="id"], [data-vol="id"], [data-db="id"] */
  const held = {}; // channel id -> { down, at, timer, last }
  const fmtDb = (d) => (d === null || d === undefined ? '-∞ dB' : (d > 0 ? '+' : '') + d.toFixed(1) + ' dB');
  function sendFader(el, final) {
    const id = el.dataset.fader; const h = held[id] || (held[id] = {});
    h.at = Date.now(); h.down = !final;
    const v = Number(el.value);
    if (final) { clearTimeout(h.timer); h.timer = null; if (h.last !== v) { h.last = v; cmd('mix.level', { id, value: v }); } return; }
    if (h.timer) return;
    h.timer = setTimeout(() => { h.timer = null; const x = Number(el.value); if (h.last !== x) { h.last = x; cmd('mix.level', { id, value: x }); } }, 60);
  }
  document.addEventListener('input', (e) => { if (e.target.matches && e.target.matches('input[data-fader]')) sendFader(e.target, false); });
  document.addEventListener('change', (e) => { if (e.target.matches && e.target.matches('input[data-fader]')) { sendFader(e.target, true); e.target.blur(); } });
  document.addEventListener('pointerdown', (e) => { const el = e.target.closest && e.target.closest('input[data-fader]'); if (el) { const h = held[el.dataset.fader] || (held[el.dataset.fader] = {}); h.down = true; h.at = Date.now(); } }, true);
  const isHeld = (id) => { const h = held[id]; return !!h && (h.down || Date.now() - h.at < 1200); };
  /* peak hold: the highest level of the last second stays as a thin line, then falls */
  const peaks = {};   // "id|side" -> { pct, at }
  function peakOf(key, pct) {
    const now = Date.now(); const p = peaks[key];
    if (!p || pct >= p.pct) { peaks[key] = { pct, at: now }; return pct; }   // new peak
    if (now - p.at < 1000) return p.pct;                                      // hold for a second
    const fall = Math.max(pct, p.pct - 3);                                    // then fall gently
    peaks[key] = { pct: fall, at: now - 1000 }; return fall;
  }
  function mixLive(root, channels) {
    if (!root) return;
    for (const c of channels) {
      const sel = (a) => root.querySelectorAll('[' + a + '="' + CSS.escape(c.id) + '"]');
      for (const m of sel('data-meter')) m.style.height = meterPct(Math.max(c.dbL, c.dbR)) + '%';
      for (const m of sel('data-meter-l')) m.style.height = meterPct(c.dbL) + '%';
      for (const m of sel('data-meter-r')) m.style.height = meterPct(c.dbR) + '%';
      for (const [side, db] of [['l', c.dbL], ['r', c.dbR]]) {
        const pk = peakOf(c.id + '|' + side, meterPct(db));
        for (const m of sel('data-peak-' + side)) { m.style.bottom = pk + '%'; m.classList.toggle('hot', pk >= 95); m.style.opacity = pk > 1 ? 1 : 0; }
      }
      const faders = sel('data-fader');
      if (!isHeld(c.id)) for (const f of faders) if (Number(f.value) !== c.volume) f.value = c.volume;
      const v = isHeld(c.id) && faders[0] ? Number(faders[0].value) : c.volume;
      for (const t of sel('data-vol')) t.textContent = v;
      for (const t of sel('data-db')) t.textContent = fmtDb(v > 0 ? Math.round(80 * Math.log10(v / 100) * 10) / 10 : null); // vMix's fader dB
    }
  }

  /** a Graphics Controller address as seen from this browser: 127.0.0.1/localhost become this page's host */
  function gcHref(url) { try { const u = new URL(url); if (/^(127\.0\.0\.1|localhost)$/.test(u.hostname)) u.hostname = location.hostname; return u.href; } catch { return url || ''; } }
  /** "Edit ↗" key that opens a title in the Graphics Controller's editor */
  function gcEdit(gc, label = 'Edit ↗', cls = 'pill') {
    if (!gc || !gc.editUrl) return '';
    return `<a class="${cls}" href="${esc(gcHref(gc.editUrl))}" target="vmixgc" rel="noopener" title="Edit ${esc(gc.name)} in the Graphics Controller (opens only on the computer it runs on)">${esc(label)}</a>`;
  }
  /** a countdown ring: frac = part left (0..1); label inside */
  function ring(frac, label, color = 'var(--text)', size = 44) {
    const r = (size - 6) / 2; const c = 2 * Math.PI * r; const f = Math.max(0, Math.min(1, frac || 0));
    return `<span class="ring" style="width:${size}px;height:${size}px"><svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" aria-hidden="true"><circle cx="${size / 2}" cy="${size / 2}" r="${r}" class="ring-bg"/><circle cx="${size / 2}" cy="${size / 2}" r="${r}" class="ring-fg" style="stroke:${color};stroke-dasharray:${c.toFixed(1)};stroke-dashoffset:${(c * (1 - f)).toFixed(1)}"/></svg><span class="ring-l">${label}</span></span>`;
  }
  return { esc, attr, mmss, hms, meterPct, cmd, connect, onState, wire, patch, toast, mixLive, fmtDb, gcHref, gcEdit, ring, get state() { return state; } };
})();
