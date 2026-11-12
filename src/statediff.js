'use strict';
/**
 * Live state goes to every page several times a second. Instead of the whole state each time,
 * send what changed, two levels deep:  { set: { key: value }, merge: { key: { subKey: value } } }.
 * The pages apply it with apply() (same logic in public/common.js).
 */
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
/** two-level map of JSON strings: "k" for leaves, "k\0sub" for keys of plain objects */
function flatten(s) {
  const f = {};
  for (const [k, v] of Object.entries(s)) {
    if (isObj(v)) { f[k] = '{' + Object.keys(v).join('\0'); for (const [sk, sv] of Object.entries(v)) f[k + '\0' + sk] = JSON.stringify(sv); }
    else f[k] = JSON.stringify(v);
  }
  return f;
}
/** { set: {k: value}, merge: {k: {sub: value}} } or null when nothing changed */
function diff(prev, next, state) {
  const set = {}; const merge = {}; let any = false;
  for (const k of Object.keys(state)) {
    if (prev[k] !== next[k]) { set[k] = state[k]; any = true; continue; }
    if (!isObj(state[k])) continue;
    for (const sk of Object.keys(state[k])) {
      const fk = k + '\0' + sk;
      if (prev[fk] !== next[fk]) { (merge[k] = merge[k] || {})[sk] = state[k][sk]; any = true; }
    }
  }
  for (const k of Object.keys(prev)) if (!k.includes('\0') && !(k in next)) { set[k] = null; any = true; }
  return any ? { set, merge } : null;
}

/** apply a message ({ full } or { set, merge }) to a state object; returns the new state */
function apply(state, msg) {
  if (msg.full) return msg.full;
  const s = { ...(state || {}) };
  for (const [k, v] of Object.entries(msg.set || {})) s[k] = v;
  for (const [k, v] of Object.entries(msg.merge || {})) s[k] = { ...(s[k] || {}), ...v };
  return s;
}

module.exports = { flatten, diff, apply };
