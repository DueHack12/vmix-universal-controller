/* vMix Universal Controller: shared browser helpers (no build step). */
'use strict';
window.BC = (() => {
  let state = null; const subs = [];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const attr = (o) => esc(JSON.stringify(o || {}));
  const mmss = (s) => { s = Math.max(0, Math.round(s || 0)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
  const hms = (s) => { s = Math.max(0, Math.round(s || 0)); return String(Math.floor(s / 3600)).padStart(2, '0') + ':' + String(Math.floor(s / 60) % 60).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); };
  const meterPct = (db) => Math.max(0, Math.min(100, Math.round(((db + 60) / 60) * 100)));

  function toast(msg) {
    let t = document.querySelector('.toast');
    if (!t) { t = document.createElement('div'); t.className = 'toast'; document.body.appendChild(t); }
    t.textContent = msg; t.classList.remove('hide');
    clearTimeout(t._h); t._h = setTimeout(() => t.classList.add('hide'), 4000);
  }

  async function cmd(name, args) {
    try {
      const r = await fetch('/api/cmd', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cmd: name, args: args || {} }) });
      if (r.status === 401) { toLogin(); return { ok: false }; }
      const j = await r.json().catch(() => ({ ok: false, error: 'Bad reply' }));
      if (!j.ok && j.error) toast(j.error);
      if (j.note) toast(j.note);
      return j;
    } catch (e) { toast('Console not reachable: ' + e.message); return { ok: false }; }
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
      cmd(el.dataset.cmd, args);
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
      holdTimer = setTimeout(() => { holdTimer = null; el.classList.remove('holding'); cmd(cmdName, args); }, 600);
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
  function mixLive(root, channels) {
    if (!root) return;
    for (const c of channels) {
      const sel = (a) => root.querySelectorAll('[' + a + '="' + CSS.escape(c.id) + '"]');
      for (const m of sel('data-meter')) m.style.height = meterPct(Math.max(c.dbL, c.dbR)) + '%';
      for (const m of sel('data-meter-l')) m.style.height = meterPct(c.dbL) + '%';
      for (const m of sel('data-meter-r')) m.style.height = meterPct(c.dbR) + '%';
      const faders = sel('data-fader');
      if (!isHeld(c.id)) for (const f of faders) if (Number(f.value) !== c.volume) f.value = c.volume;
      const v = isHeld(c.id) && faders[0] ? Number(faders[0].value) : c.volume;
      for (const t of sel('data-vol')) t.textContent = v;
      for (const t of sel('data-db')) t.textContent = fmtDb(v > 0 ? Math.round(80 * Math.log10(v / 100) * 10) / 10 : null); // vMix's fader dB
    }
  }

  return { esc, attr, mmss, hms, meterPct, cmd, connect, onState, wire, patch, toast, mixLive, fmtDb, get state() { return state; } };
})();
