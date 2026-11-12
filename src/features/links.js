'use strict';
/**
 * Link to vMix: which vMix input does each job use.
 * Stored by input key (GUID) so renaming/reordering in vMix doesn't break links.
 * Auto-match by name + type, or "Pick in vMix": put the input in vMix Preview and we grab it.
 */
const JOBS = [
  { id: 'music', label: 'Music player', hint: 'a List input for music', types: ['VideoList', 'AudioFile'], words: ['music', 'song', 'bump'] },
  { id: 'ads', label: 'Ads player', hint: 'a List input for ads', types: ['VideoList'], words: ['ads', 'ad ', 'commercial', 'sponsor'] },
  { id: 'videos', label: 'Video clips', hint: 'a List input for highlights / packages', types: ['VideoList', 'Video'], words: ['video', 'clip', 'highlight', 'playout', 'package'] },
  { id: 'gameCam', label: 'Back-to-game camera', hint: 'camera that goes to Preview on BACK TO GAME', types: ['Capture', 'NDI', 'SRT', 'Stream', 'VirtualSet'], words: ['game', 'cam 1', 'camera 1', 'main', 'wide'] },
];

function score(job, inp) {
  const t = (inp.title || '').toLowerCase();
  let s = 0;
  if (job.types.includes(inp.type)) s += 2;
  for (const w of job.words) if (t.includes(w.trim())) s += t.trim() === w.trim() ? 6 : 4;
  return s;
}

function autoMatch(inputs, existing = {}) {
  const out = {}; const used = new Set(Object.values(existing));
  for (const job of JOBS) {
    if (existing[job.id] && inputs.some((i) => i.key === existing[job.id])) { out[job.id] = { key: existing[job.id], confidence: 'linked' }; continue; }
    let best = null; let bestScore = 0;
    for (const i of inputs) {
      if (used.has(i.key)) continue;
      const s = score(job, i);
      if (s > bestScore) { best = i; bestScore = s; }
    }
    if (best && bestScore >= 2) { out[job.id] = { key: best.key, confidence: bestScore >= 6 ? 'matched' : 'guess' }; used.add(best.key); }
  }
  return out;
}

module.exports = (engine) => {
  let picking = null; // { job, fromPreview }
  let guesses = {};

  function setLink(job, key) {
    const inp = engine.inputByKey(key);
    if (!key) { delete engine.show.links[job]; delete engine.show.linkTitles[job]; }
    else { engine.show.links[job] = key; engine.show.linkTitles[job] = inp ? inp.title : ''; }
    engine.save();
    for (const f of Object.values(engine.features)) if (f.onLinks) f.onLinks(job);
  }

  engine.cmd('link.set', ({ job, key }) => { setLink(job, key); return { ok: true }; });
  engine.cmd('link.auto', ({ apply = true } = {}) => {
    guesses = autoMatch(engine.inputs(), apply ? {} : engine.show.links);
    if (apply) for (const [job, g] of Object.entries(guesses)) setLink(job, g.key);
    return { ok: true, guesses };
  });
  engine.cmd('link.pick', ({ job }) => { picking = { job, fromPreview: engine.snap ? engine.snap.preview : 0 }; return { ok: true }; });
  engine.cmd('link.cancelPick', () => { picking = null; return { ok: true }; });
  // the input you want may already be in Preview (clicking it again changes nothing in vMix): take it as is
  engine.cmd('link.usePreview', ({ job } = {}) => {
    const j = job || (picking && picking.job);
    const inp = engine.snap ? engine.inputByNumber(engine.snap.preview) : null;
    if (!j || !JOBS.some((x) => x.id === j)) return { ok: false, error: 'Which job?' };
    if (!inp) return { ok: false, error: 'Nothing in vMix Preview' };
    setLink(j, inp.key); picking = null;
    engine.log('Linked ' + j + ' to "' + inp.title + '" (already in Preview)');
    return { ok: true };
  });
  engine.cmd('link.identify', async ({ key }) => engine.fn('PreviewInput', { Input: key }));

  return {
    name: 'links',
    JOBS,
    onPoll(snap) {
      if (picking && snap.preview && snap.preview !== picking.fromPreview) {
        const inp = engine.inputByNumber(snap.preview);
        if (inp) { setLink(picking.job, inp.key); engine.log('Linked ' + picking.job + ' to "' + inp.title + '" (picked in vMix)'); }
        picking = null;
      }
      // first connection with nothing linked: auto-match quietly
      if (!this.didAuto && Object.keys(engine.show.links).length === 0 && snap.inputs.length) {
        this.didAuto = true;
        guesses = autoMatch(snap.inputs, {});
        for (const [job, g] of Object.entries(guesses)) setLink(job, g.key);
      }
    },
    state() {
      return {
        picking: picking ? picking.job : null,
        previewTitle: engine.snap ? (engine.inputByNumber(engine.snap.preview) || {}).title || '' : '',
        jobs: JOBS.map((j) => {
          const inp = engine.input(j.id);
          const key = engine.show.links[j.id] || '';
          return { id: j.id, label: j.label, hint: j.hint, key, title: inp ? inp.title : '', number: inp ? inp.number : 0, type: inp ? inp.type : '',
            status: !key ? 'missing' : !inp ? 'gone' : (guesses[j.id] && guesses[j.id].confidence === 'guess' && guesses[j.id].key === key) ? 'guess' : 'ok' };
        }),
      };
    },
  };
};

module.exports.autoMatch = autoMatch;
module.exports.JOBS = JOBS;
