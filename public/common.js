/* Broadcast Console: shared browser helpers (no build step). */
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
      const j = await r.json().catch(() => ({ ok: false, error: 'Bad reply' }));
      if (!j.ok && j.error) toast(j.error);
      if (j.note) toast(j.note);
      return j;
    } catch (e) { toast('Console not reachable: ' + e.message); return { ok: false }; }
  }

  function connect() {
    const es = new EventSource('/api/events');
    es.onmessage = (e) => { state = JSON.parse(e.data); for (const f of subs) f(state); };
    es.onerror = () => { for (const f of subs) f(null); };
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

  /** Replace innerHTML only when it changed and the user isn't typing inside. */
  const pending = new Set();
  function patch(el, html) {
    if (!el || el._html === html) return;
    if (el.contains(document.activeElement) && document.activeElement.matches('input, textarea, select')) { el._pending = html; pending.add(el); return; }
    el._html = html; el.innerHTML = html;
  }
  document.addEventListener('focusout', () => {
    setTimeout(() => { for (const el of [...pending]) if (!el.contains(document.activeElement)) { const h = el._pending; el._pending = null; pending.delete(el); patch(el, h); } }, 50);
  });

  return { esc, attr, mmss, hms, meterPct, cmd, connect, onState, wire, patch, toast, get state() { return state; } };
})();
