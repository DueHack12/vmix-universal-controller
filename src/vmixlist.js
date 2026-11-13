'use strict';
/**
 * Helpers for vMix List inputs that UC drives (MUSIC, VIDEOS).
 * The vMix list holds everything (a whole playlist / folder); UC selects the item it needs
 * (SelectIndex) instead of emptying the list and loading one file at a time.
 * UC also notices when vMix moved to another item by itself ("Auto Next" on in vMix), which
 * would fight UC's own choice of what plays next.
 */
const norm = (p) => String(p || '').replace(/\//g, '\\').toLowerCase().trim();
const listPaths = (input) => (input && input.list ? input.list.map((x) => x.path) : []);
/** 1-based index of a file in the vMix list, 0 if missing */
function indexOf(input, p) { const n = norm(p); return listPaths(input).findIndex((x) => norm(x) === n) + 1; }
const sameList = (a, b) => a.length === b.length && a.every((x, k) => norm(x) === norm(b[k]));

/**
 * Make the vMix list hold `want`.
 *  - exact (default): the list must be exactly `want`, in order. If the current list is the start
 *    of `want`, the rest is added at the end (safe while playing); otherwise it is rebuilt.
 *  - not exact: files missing from the list are added at the end; extra files are left alone.
 * A rebuild empties the list, so it only happens when `canRebuild` (nothing playing / on air).
 * Returns 'same' | 'appended' | 'rebuilt' | 'deferred'.
 */
async function sync(engine, input, want, { canRebuild = true, exact = true } = {}) {
  const cur = listPaths(input);
  if (sameList(cur, want)) return 'same';
  const have = new Set(cur.map(norm));
  const missing = want.filter((p) => !have.has(norm(p)));
  const appendOnly = !exact || sameList(cur, want.slice(0, cur.length));
  if (appendOnly) {
    if (!missing.length) return 'same';
    for (const p of missing) await engine.fn('ListAdd', { Input: input.key, Value: p });
    return 'appended';
  }
  if (!canRebuild) return 'deferred';
  await engine.fn('ListRemoveAll', { Input: input.key });
  for (const p of want) await engine.fn('ListAdd', { Input: input.key, Value: p });
  return 'rebuilt';
}

/** Tracks which item UC selected, to tell UC's own moves from vMix's Auto Next. */
class Selection {
  constructor() { this.expected = 0; this.lastIndex = 0; this.autoNextSeen = false; }
  /** call right before UC selects item k (1-based) */
  expect(k) { this.expected = k; }
  /**
   * call on every poll; returns true when vMix moved to another item by itself while playing
   * (that is vMix's Auto Next)
   */
  check(input) {
    const idx = input ? input.selectedIndex || 0 : 0;
    let byVmix = false;
    if (idx !== this.lastIndex) {
      if (idx === this.expected) this.expected = 0;
      else byVmix = this.lastIndex > 0 && idx > 0 && input.state === 'Running';
    }
    this.lastIndex = idx;
    if (byVmix) this.autoNextSeen = true;
    return byVmix;
  }
}

module.exports = { norm, listPaths, indexOf, sameList, sync, Selection };
