'use strict';
/**
 * Ad library + break fill, ported from the vMix Ad Manager.
 *  - bucket folders have a nominal length (folderSeconds) used ONLY for filling
 *  - actualSeconds (real running time) is shown everywhere and used for loose/sponsor ads
 *  - fill: shuffle eligible ads, greedily add any ad that fits the remaining time; never over target
 * Additions: sponsor rules (every N breaks / once per game) and skipping recently played ads.
 */

function shuffle(arr, rng = Math.random) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

/** size used by the fill for one ad */
function fillSize(ad) {
  if (ad.kind === 'bucket') return ad.folderSeconds;
  return Math.round(ad.actualSeconds || ad.folderSeconds || 30);
}

/**
 * @param ads [{ path, name, folder, kind:'bucket'|'loose'|'sponsor', folderSeconds, actualSeconds, inBuckets }]
 * @param target seconds
 * @param opt { breakNumber (1-based), sponsorRules:[{folder, every, oncePerGame}], sponsorsPlayed:Set(folder), recent:Set(path), rng }
 */
function buildBreak(ads, target, opt = {}) {
  const rng = opt.rng || Math.random;
  const recent = opt.recent || new Set();
  const picked = [];
  let remaining = target;

  // sponsors that are due go first
  for (const rule of opt.sponsorRules || []) {
    const due = rule.oncePerGame ? !(opt.sponsorsPlayed || new Set()).has(rule.folder) : rule.every ? ((opt.breakNumber || 1) % rule.every === 0) : false;
    if (!due) continue;
    const pool = shuffle(ads.filter((a) => a.folder === rule.folder), rng);
    const fresh = pool.filter((a) => !recent.has(a.path));
    const ad = (fresh.length ? fresh : pool).find((a) => fillSize(a) <= remaining);
    if (ad) { picked.push(ad); remaining -= fillSize(ad); }
  }

  const eligible = ads.filter((a) => (a.kind !== 'sponsor' || a.inBuckets) && !picked.includes(a));
  const greedy = (pool) => {
    for (const ad of shuffle(pool, rng)) {
      const s = fillSize(ad);
      if (s > 0 && s <= remaining && !picked.includes(ad)) { picked.push(ad); remaining -= s; }
    }
  };
  greedy(eligible.filter((a) => !recent.has(a.path)));
  // not enough fresh ads? allow recent ones to top it up
  if (remaining >= 15) greedy(eligible.filter((a) => recent.has(a.path)));
  return picked;
}

const totalActual = (items) => items.reduce((s, a) => s + (a.actualSeconds || a.folderSeconds || 0), 0);

module.exports = { buildBreak, fillSize, shuffle, totalActual };
