/* vMix Universal Controller: control page (vertical 1080x1920 or horizontal 1920x1080). */
'use strict';
(() => {
  const { esc, attr, mmss, hms, meterPct, cmd, patch } = BC;
  const params = new URLSearchParams(location.search);
  const layout = params.get('layout') === 'horizontal' ? 'horizontal' : 'vertical';
  const LS = 'bc.ui.' + layout;
  const ui = Object.assign({ open: {}, gfx: '', mon: 'pgm', chk: '' }, (() => { try { return JSON.parse(localStorage.getItem(LS)) || {}; } catch { return {}; } })());
  const saveUi = () => { try { localStorage.setItem(LS, JSON.stringify(ui)); } catch { /* private mode */ } };
  let S = null;

  /* ---------- layout ---------- */
  const SECS = { stream: 'Stream health', gfx: 'Graphics', video: 'Videos', ads: 'Ads', music: 'Music', mix: 'Mixer' };
  const colsEl = document.getElementById('cols');
  colsEl.style.gridTemplateColumns = layout === 'horizontal' ? 'minmax(0, 1.2fr) minmax(0, 1fr)' : 'minmax(0, 1fr)';
  let layoutSig = ''; let LAY = { order: Object.keys(SECS), hidden: [], open: [] };
  function buildCols() {
    const L = (S && S.layout && S.layout[layout]) || {};
    const order = (L.order && L.order.length ? L.order : (layout === 'horizontal' ? ['gfx', 'video', 'stream', 'ads', 'music', 'mix'] : Object.keys(SECS))).filter((k) => SECS[k]);
    for (const k of Object.keys(SECS)) if (!order.includes(k)) order.push(k);
    LAY = { order, hidden: L.hidden || [], open: L.open || [] };
    const sig = JSON.stringify(LAY); if (sig === layoutSig) return; layoutSig = sig;
    const vis = order.filter((k) => !LAY.hidden.includes(k));
    const COLS = layout === 'horizontal' ? [['mon', ...vis.slice(0, 2)], vis.slice(2)] : [['mon', ...vis]];
    colsEl.innerHTML = COLS.map((c) => '<div class="colbox">' + c.map((k) => (k === 'mon' ? '<div id="mon"></div>' : `<section class="sec" id="sec-${k}"></section>`)).join('') + '</div>').join('');
  }

  /* ---------- small pieces ---------- */
  const TIPS = {
    'gfx.take': 'Puts this graphic on air (T)', 'gfx.out': 'Takes this graphic off air (O)', 'gfx.allout': 'Hold: takes every graphic off air',
    'video.next': 'Loads the next queued clip into vMix Preview for the director (C)', 'video.playpause': 'Play / pause the clip (P)', 'video.restart': 'Back to the start of the clip',
    'video.queue': 'Adds this clip to the end of the queue', 'video.cue': 'Loads this clip into vMix Preview now',
    'ads.go': '5-second countdown, then the music fades and the ads go to Preview', 'ads.back': 'Stops the ads, music back in, game camera to Preview', 'ads.skip': 'Jump to the next ad', 'ads.cancel': 'Stop the countdown',
    'ads.fill': 'New random set of ads for this break', 'music.toggle': 'Play / pause the music (Space)', 'music.fadein': 'Start the song from silence and fade up to the level (or bring the level back up) (I)', 'music.fadeout': 'Fade the music to silence (F)', 'music.kill': 'Stop the music right now',
    'music.next': 'Next song (N)', 'music.level': 'Fade the music to this level', 'music.queue': 'Play this song after the current one',
    'mix.mute': 'Take this channel off the stream', 'mix.listen': 'Hear this channel in your headphones', 'mix.cough': 'Cough: silence this mic for a moment', 'rec.start': 'Start recording', 'rec.stop': 'Hold to stop recording',
  };
  const tip = (c) => (TIPS[c] ? ` data-tip="${esc(TIPS[c])}"` : '');
  const btn = (label, c, args, cls = '', extra = '') => `<button class="${cls}" data-cmd="${c}" data-args="${attr(args)}"${tip(c)} ${extra}>${label}</button>`;
  const hold = (label, c, args, cls = '') => `<button class="hold ${cls}" data-hold data-cmd="${c}" data-args="${attr(args)}"${tip(c)} title="Press and hold">${label}<span class="hint">hold</span></button>`;
  const ui_ = (label, key, cls = '') => `<button class="${cls}" data-ui="${esc(key)}">${label}</button>`;
  const head = (k, summary, color) => `<button class="sec-head" data-ui="toggle:${k}" aria-expanded="true"><span class="chev">▾</span><span class="sec-title">${SECS[k]}</span>${tdot(secTally(k))}<span class="help" title="${esc(HELP[k])}">?</span><span class="grow ellipsis small" style="text-align:right;color:${color || 'var(--muted)'}">${esc(summary || '')}</span></button>`;
  const barTitle = (k) => `<button class="bar-title" data-ui="toggle:${k}" aria-expanded="false"><span class="chev">▸</span><span class="sec-title">${k === 'stream' ? 'STREAM' : SECS[k]}</span>${tdot(secTally(k))}</button>`;
  const HELP = {
    stream: 'Is the show healthy? vMix link, streaming, recording, drive space, program audio, linked inputs.',
    gfx: 'Pick a graphic, edit its text, TAKE it on air or take it OUT. Red means vMix confirms it is on air.',
    video: 'Highlights and packages. CUE puts a clip in Preview for the director. Queue clips to cue them in order.',
    ads: 'Break playlists (Pregame, Halftime...). GO counts down 5 s, fades the music and cues the ads to Preview. BACK TO GAME brings the music and camera back.',
    music: 'Bumps and beds. Green = playing. FADE OUT fades to silence, KILL stops now. Queue songs or play a playlist back-to-back.',
    mix: 'MUTE takes a channel off the stream. LISTEN puts it in your headphones. Both = hear it, not live.',
  };
  const isOpen = (k) => (k in ui.open ? !!ui.open[k] : LAY.open.includes(k));
  const ring = BC.ring;
  /* tally dot: red = on Program / on air, green = in Preview */
  const tdot = (t) => (t ? `<span class="tdot ${t}" title="${t === 'pgm' ? 'On Program (on air)' : 'In Preview'}"></span>` : '');
  function secTally(k) {
    if (!S) return '';
    if (k === 'gfx') return S.graphics.items.some((x) => x.onAir) ? 'pgm' : '';
    if (k === 'video') return S.videos.onAir ? 'pgm' : S.videos.inPreview ? 'pvw' : '';
    if (k === 'ads') return S.ads.phase === 'break' ? 'pgm' : S.ads.phase === 'cued' ? 'pvw' : '';
    return '';
  }

  /* ---------- header + banners ---------- */
  /** opens the vMix Graphics Controller; 127.0.0.1/localhost become this page's host so it works from other computers */
  function gcLink() {
    if (!S.gc || !S.gc.url) return '';
    return `<a class="pill" href="${esc(BC.gcHref(S.gc.editorUrl || S.gc.url))}" target="vmixgc" rel="noopener" title="${S.gc.ok ? 'vMix Graphics Controller (its editor opens only on the computer it runs on)' : 'vMix Graphics Controller (not running)'}"><span class="dot" style="background:${S.gc.ok ? 'var(--green)' : 'var(--muted)'}"></span>Graphics</a>`;
  }
  function renderTop() {
    const t = S.tally || {};
    const conn = S.vmix.connected;
    const rec = t.recording ? hold('● REC ' + hms(t.recordingDuration), 'rec.stop', {}, 'b-red b-sm') : btn('○ REC', 'rec.start', {}, 'b-sm');
    patch(document.getElementById('top'), `
      <div class="logo">UC</div>
      <div class="grow ellipsis" style="font-weight:700">${esc(S.show.name)}</div>
      <span class="pill ${conn ? 'ok' : 'bad'}"><span class="dot" style="background:${conn ? 'var(--green)' : 'var(--red)'}"></span>vMix ${conn ? esc(S.vmix.version || '') : 'offline'}</span>
      <span class="calm-hide row" style="gap:8px">${gcLink()}<a class="pill" href="/master" style="text-decoration:none">⚙ Master</a><button class="pill" data-ui="resetView" title="Back to the show's default open/closed sections">Reset view</button>
      <a class="pill" href="/control?layout=${layout === 'vertical' ? 'horizontal' : 'vertical'}" style="text-decoration:none">${layout === 'vertical' ? '⇆ Horizontal' : '⇅ Vertical'}</a></span>
      <button class="pill ${ui.focus ? 'focus-on' : ''}" data-ui="focus" title="Focus: hide setup links and help, quieter sections">${ui.focus ? '◉ Focus' : '○ Focus'}</button>
      ${BC.netPill(S.netid)}<span class="${t.streaming ? 'tag-live' : 'tag-off'}">${t.streaming ? '● LIVE' : 'OFF AIR'}</span>
      ${rec}
      <span class="clock" id="clock"></span>`);
  }
  /** the live scoreboard from ScoreReader (Master › Setup › 4), so the operator sees what the board says */
  function renderScoreStrip() {
    const el = document.getElementById('sbstrip'); const b = S.scoreboard;
    if (!b || !b.url) { if (el.innerHTML) el.innerHTML = ''; return; }
    const d = b.data || {};
    const nm = (side) => d[side + '_abbr'] || d[side + '_name'] || (side === 'home' ? 'HOME' : 'GUEST');
    const light = b.live ? 'var(--green)' : b.ok ? 'var(--amber)' : 'var(--red)';
    const why = !b.ok ? 'ScoreReader not reachable' : !b.live ? (b.status ? (b.status.detail || b.status.state || 'no data from the scoreboard') : 'no data from the scoreboard') : (b.status && b.status.source === 'demo' ? 'DEMO data' : 'live');
    const bits = [];
    if (d.period_ordinal || d.period) bits.push(`<span class="sb-k">PER</span><b class="mono">${esc(d.period_ordinal || d.period)}</b>`);
    if (d.clock !== undefined) bits.push(`<span class="sb-k">CLOCK</span><b class="mono" style="color:${d.clock_running === '1' ? 'var(--green)' : 'var(--text)'}">${esc(d.clock || '--:--')}</b>`);
    if (d.down_distance) bits.push(`<b class="mono">${esc(d.down_distance)}</b>${d.ball_on ? `<span class="sb-k">ON</span><b class="mono">${esc(d.ball_on)}</b>` : ''}`);
    if (d.play_clock) bits.push(`<span class="sb-k">PLAY</span><b class="mono">${esc(d.play_clock)}</b>`);
    if (d.shot_clock) bits.push(`<span class="sb-k">SHOT</span><b class="mono">${esc(d.shot_clock)}</b>`);
    if (d.home_timeouts || d.guest_timeouts) bits.push(`<span class="sb-k">TO</span><b class="mono">${esc(d.home_timeouts || '-')}·${esc(d.guest_timeouts || '-')}</b>`);
    patch(el, `<div class="sbstrip" title="Live from ScoreReader (${esc(b.url)}) · ${esc(why)}">
      <span class="dot" style="background:${light}"></span><span class="sb-k">SCOREBOARD</span>
      ${b.ok ? `<b class="sb-team">${esc(nm('home'))}${d.home_poss === '1' ? ' ◂' : ''}</b><b class="mono sb-score">${esc(d.home_score || '0')}</b><span class="muted">–</span><b class="mono sb-score">${esc(d.guest_score || '0')}</b><b class="sb-team">${d.guest_poss === '1' ? '▸ ' : ''}${esc(nm('guest'))}</b>${bits.map((x) => `<span class="sb-bit">${x}</span>`).join('')}` : `<span class="small muted">${esc(why)}: ${esc(b.error)}</span>`}
      <span class="grow"></span><span class="tiny ${b.live ? 'ok' : 'muted'}">${esc(why)}</span><a class="pill" href="${esc(BC.gcHref(b.url))}/" target="scorereader" rel="noopener" title="Open ScoreReader's dashboard">ScoreReader ↗</a></div>`);
  }

  function renderBanners() {
    const out = [];
    if (S.ads.phase === 'count') out.push(`<div class="banner count" role="status"><span style="font-size:18px;letter-spacing:1px">AD BREAK IN</span>${ring(S.ads.count / Math.max(1, S.ads.countdown), '<b class="mono">' + S.ads.count + '</b>', 'var(--amber)', 58)}<span class="small">music is fading · ads go to Preview at 0</span><span class="grow"></span>${btn('CANCEL', 'ads.cancel', {}, '', '')}</div>`);
    if (!S.vmix.connected) out.push(`<div class="banner bad" role="alert">⚠ vMix NOT CONNECTED: buttons won't do anything until it's back <span class="grow"></span><span class="small" style="font-weight:600">${esc(S.vmix.host + ':' + S.vmix.port)} · ${esc(S.vmix.error || '')}</span></div>`);
    if (S.graphics.warn) out.push(`<div class="banner warn">⚠ ${esc(S.graphics.warn)}</div>`);
    patch(document.getElementById('banners'), out.join(''));
  }

  /* ---------- monitors: Program, Preview and the selected graphic, as pictures saved by vMix ----------
     After a failed picture (vMix on another PC, or a moment's hiccup) that monitor shows text and retries in 15 s. */
  const snapFail = {};
  const snapOk = (k) => !snapFail[k] || Date.now() - snapFail[k] > 15000;
  const snapPic = {};    // monitor key -> blob: URL of the last picture that loaded (shown until the next one is ready)
  const snapWant = {};   // monitor key -> the address to fetch it from
  let snapBusy = false;
  /* every 1.5 s fetch the pictures the monitors show; swap each one in only when it has loaded, so nothing flickers */
  setInterval(async () => {
    if (!S || snapBusy || document.hidden) return;
    snapBusy = true;
    try {
      await Promise.all(Object.entries(snapWant).map(async ([k, url]) => {
        if (!snapOk(k)) return;
        try {
          const r = await fetch(url + '&t=' + Date.now(), { cache: 'no-store' });
          if (!r.ok) throw new Error('HTTP ' + r.status);
          const u = URL.createObjectURL(await r.blob());
          const old = snapPic[k]; snapPic[k] = u;
          for (const img of document.querySelectorAll('img[data-snapk="' + CSS.escape(k) + '"]')) img.src = u;
          if (old) setTimeout(() => URL.revokeObjectURL(old), 2000);
        } catch { snapFail[k] = Date.now(); delete snapPic[k]; renderMon(); }
      }));
    } finally { snapBusy = false; }
  }, 1500);
  function monitor(kind, label, sub, src, failKey, fallback) {
    snapWant[failKey] = src;
    const pic = snapOk(failKey) && snapPic[failKey]
      ? `<img class="snap" alt="${esc(label)}" data-snapk="${esc(failKey)}" src="${snapPic[failKey]}">`
      : snapOk(failKey) ? `<img class="snap" alt="" data-snapk="${esc(failKey)}">` + fallback : fallback;
    return `<div class="monbox ${kind}"><div class="mon-cap"><span class="mon-label">${esc(label)}</span>${kind === 'pgm' ? tdot('pgm') : kind === 'pvw' ? tdot('pvw') : kind.includes('on') ? tdot('pgm') : ''}<span class="tiny muted ellipsis">${esc(sub || '')}</span></div><div class="mon snapmon ${kind}">${pic}</div></div>`;
  }
  function renderMon() {
    for (const k of Object.keys(snapWant)) delete snapWant[k];   // only fetch what is on screen now
    const items = S.graphics.items;
    const g = items.find((x) => x.id === ui.gfx) || items[0]; // same graphic as the Graphics section
    const t = S.tally || {};
    const textMon = (txt) => `<div class="mon-text">${esc(txt || '—')}</div>`;
    let gfxMon = '';
    if (g) {
      const tf = g.fields.filter((f) => f.kind === 'text' && f.mode !== 'hidden');
      const lines = tf.slice(0, 3).map((f, k) => (k && !f.value ? '' : `<div class="${k ? 'b' : 'a'}">${esc(f.value || g.name)}</div>`)).join('') || `<div class="a">${esc(g.name)}</div>`;
      gfxMon = monitor(g.onAir ? 'gfx on' : 'gfx', 'Graphic', g.onAir ? '● on air' : 'not live', '/api/snap/input?key=' + encodeURIComponent(g.key), g.key, `<div class="mock-in"><div class="l3">${lines}</div></div>`);
    }
    const mons = ui.mons !== false;
    const head = g ? `<div class="row" style="gap:8px"><span class="mon-label">GRAPHIC</span><select class="grow" data-ui-select="gfx" aria-label="Graphic to show">${items.map((x) => `<option value="${esc(x.id)}" ${x.id === g.id ? 'selected' : ''}>${x.onAir ? '🔴 ' : ''}${esc(x.name)}</option>`).join('')}</select>
        <span class="tiny" style="font-weight:800;color:${g.onAir ? 'var(--red-text)' : 'var(--muted)'}">${g.onAir ? '● ON AIR' : 'not live'}</span>
        <button class="pill calm-hide" data-ui="mons" title="Program / Preview pictures from vMix">${ui.mons === false ? '▢ PGM / PVW' : '▣ PGM / PVW'}</button></div>` : '';
    patch(document.getElementById('mon'), `<div class="monitors one">${head}
      <div class="monrow ${mons ? '' : 'solo'}">
        ${mons ? monitor('pgm', 'Program', t.program, '/api/snap/pgm?x=1', 'pgm', textMon(t.program)) + monitor('pvw', 'Preview', t.preview, '/api/snap/pvw?x=1', 'pvw:' + (t.preview || ''), textMon(t.preview)) : ''}
        ${gfxMon}
      </div></div>`);
  }

  /* ---------- stream health ---------- */
  function renderStream() {
    const h = S.health;
    const light = h.ok ? '<span class="ok" style="font-weight:800">● HEALTHY</span>' : `<span class="bad" style="font-weight:800">● ${esc(h.alerts[0] || 'CHECK')}</span>`;
    const yt = S.youtube.configured ? `<span class="muted">YouTube</span> <b class="${S.youtube.live ? 'ok' : 'bad'}">${S.youtube.live ? '✓ LIVE · ' + (S.youtube.viewers ?? '?') + ' watching' : 'not live'}</b> · ` : '';
    const short = yt + `<span class="muted">Stream</span> <b>${h.streaming ? 'LIVE' : 'off'}</b> · <span class="muted">REC</span> <b class="mono">${h.recording ? hms(h.recordingSecs) : 'off'}</b> · <span class="muted">Disk</span> <b>${h.recHours !== null ? h.recHours + ' h' : '?'}</b> · <span class="muted">CPU</span> <b>${h.cpu}%</b> · <span class="muted">Audio</span> <b class="mono">${h.audioDb > -99 ? h.audioDb + ' dB' : 'silent'}</b>`;
    if (!isOpen('stream')) return `<div class="sec-body"><div class="bar">${barTitle('stream')}${light}<div class="grow small ellipsis">${short}</div></div></div>`;
    const blocks = new Set(h.blocks || []);
    const tile = (k, v, sub, cls = '') => `<div class="tile"><span class="k">${k}</span><span class="v ${cls}">${v}</span><span class="small muted">${sub}</span></div>`;
    return head('stream', h.ok ? 'Healthy' : h.alerts.join(' · '), h.ok ? 'var(--green)' : 'var(--red-text)') + `<div class="sec-body">
      <div class="tiles">${[
        ['vmix', tile('VMIX', S.vmix.connected ? 'CONNECTED' : 'OFFLINE', esc((S.vmix.edition || '') + ' ' + (S.vmix.version || '')), S.vmix.connected ? 'ok' : 'bad')],
        ['stream', tile('STREAM', h.streaming ? 'LIVE' : 'OFF', h.streaming ? hold('STOP STREAM', 'stream.toggle', {}, 'b-sm b-red-soft') : hold('START STREAM', 'stream.toggle', {}, 'b-sm'), h.streaming ? 'ok' : 'warn')],
        ['recording', tile('RECORDING', h.recording ? hms(h.recordingSecs) : 'STOPPED', h.recording ? hold('STOP REC', 'rec.stop', {}, 'b-sm b-red-soft') : btn('START REC', 'rec.start', {}, 'b-sm'), h.recording ? 'ok' : h.streaming ? 'bad' : 'warn')],
        ['disk', tile('RECORD DRIVE', h.disk ? h.disk.freeGB + ' GB' : '?', h.disk ? esc(h.disk.drive) + ' · about ' + h.recHours + ' h of recording' : 'set the drive in Setup', h.recHours !== null && h.recHours < 1 ? 'bad' : 'ok')],
        ['cpu', tile('THIS PC', 'CPU ' + h.cpu + '%', 'vMix PC load', h.cpu > 85 ? 'bad' : h.cpu > 70 ? 'warn' : 'ok')],
        ['audio', tile('PROGRAM AUDIO', h.audioDb > -99 ? h.audioDb + ' dB' : 'SILENT', h.silentSecs ? 'silent for ' + h.silentSecs + ' s' : 'master bus level', h.silentSecs >= 5 && h.streaming ? 'bad' : 'ok')],
        ['sources', tile('SOURCES', h.sources.ok + ' / ' + h.sources.total + ' OK', 'linked vMix inputs', h.sources.ok < h.sources.total ? 'bad' : 'ok')],
        ['youtube', S.youtube.configured ? tile('YOUTUBE', S.youtube.live ? '✓ LIVE' : 'NOT LIVE', S.youtube.live ? (S.youtube.viewers ?? '?') + ' watching · peak ' + S.youtube.peak : esc(S.youtube.error || 'no live video found'), S.youtube.live ? 'ok' : h.streaming ? 'bad' : 'warn') : tile('YOUTUBE', '—', 'add an API key in Master › Setup')],
        ['alerts', tile('ALERTS', h.alerts.length ? String(h.alerts.length) : 'NONE', h.alerts.length ? esc(h.alerts.join(' · ')) : 'all good', h.alerts.length ? 'bad' : 'ok')],
      ].filter(([k]) => blocks.has(k)).map(([, t]) => t).join('')}</div></div>`;
  }

  /* ---------- graphics ---------- */
  function gfxSel() { const L = S.graphics.items; return L.find((g) => g.id === ui.gfx) || L[0] || null; }
  function renderGfx() {
    const L = S.graphics.items; const g = gfxSel();
    const on = L.filter((x) => x.onAir);
    const opts = L.map((x) => `<option value="${esc(x.id)}" ${g && x.id === g.id ? 'selected' : ''}>${x.onAir ? '🔴 ' : ''}${esc(x.group + ' › ' + x.name + (x.gc ? '  · GC' : '') + (x.onAir ? '   ON AIR' : ''))}</option>`).join('');
    const sel = `<select class="grow" style="font-weight:700;font-size:14px" data-ui-select="gfx">${opts || '<option>No GT titles found in vMix</option>'}</select>`;
    const takeBtn = g ? `<button class="${g.onAir ? 'take-on' : 'take'}" data-cmd="gfx.take" data-args="${attr({ id: g.id })}">${g.onAir ? '● ON AIR' : 'TAKE'}</button>` : '';
    const outBtn = g ? btn('OUT', 'gfx.out', { id: g.id }) : '';
    const checkBtn = g ? ui_('CHECK', 'check:' + g.id, 'k2') : '';
    const editBtn = g && g.gc ? BC.gcEdit(g.gc, 'Edit ↗', 'pill k2') : '';
    const chips = on.map((x) => `<button class="chip-on" data-cmd="gfx.out" data-args="${attr({ id: x.id })}" title="Click to take it out${x.autoOut ? ' (goes out by itself in ' + Math.max(0, x.autoOut - x.onAirSecs) + ' s)' : ''}">${esc(x.name)} ${x.autoOut ? ring(1 - x.onAirSecs / x.autoOut, '', 'var(--red)', 18) : ''}<span class="mono" style="font-weight:600">${mmss(x.onAirSecs)}</span> ✕</button>`).join('');
    const tallyLine = `<div class="row wrap"><span class="tiny" style="font-weight:800;letter-spacing:1px;color:${on.length ? 'var(--red-text)' : 'var(--muted)'}">${on.length ? '● ON AIR' : 'NOTHING ON AIR'}</span>${chips}<span class="grow"></span><span class="tiny" style="color:${on.length ? 'var(--red-text)' : 'var(--muted)'}">✓ vMix tally</span></div>`;
    if (!isOpen('gfx')) return `<div class="sec-body"><div class="tally ${on.length ? 'on' : ''}"><div class="bar">${barTitle('gfx')}${sel}${editBtn}${checkBtn}${takeBtn}${outBtn}</div>${tallyLine}</div></div>`;
    let meta = '';
    if (g) meta = g.onAir ? 'On air now' : g.replaces ? '⚠ Taking this will replace: ' + g.replaces : 'Goes on top of what is on air now';
    const lists = S.graphics.lists || {};
    const spFields = g && g.statpop ? [g.statpop.lineField, g.statpop.logoField, g.statpop.colorField].filter(Boolean) : [];
    const fields = g ? g.fields.filter((f) => f.mode !== 'hidden' && !spFields.includes(f.name)).map((f) => {
      const a = attr({ id: g.id, field: f.name });
      if (f.mode === 'locked' || (f.source !== 'typed' && f.source !== 'list')) {
        const note = { fixed: 'fixed', ose: 'from OpenStatsEngine', logo: 'team logo', gc: 'game info', gcowned: 'from Graphics Controller', liveowned: 'from the scoreboard', sb: 'live scoreboard' }[f.source] || 'locked';
        return `<label class="field">${esc(f.label)}<span class="row"><input value="${esc(f.value)}" disabled class="grow"><span class="tiny muted">${note}</span></span></label>`;
      }
      if (f.source === 'list') {
        const items = lists[f.list] || [];
        const opts = (items.includes(f.value) || !f.value ? '' : `<option selected>${esc(f.value)}</option>`) + '<option value="">— pick —</option>' + items.map((x) => `<option ${x === f.value ? 'selected' : ''}>${esc(x)}</option>`).join('');
        return `<label class="field">${esc(f.label)}<select data-cmd="gfx.set" data-args="${a}" data-key="value">${opts}</select></label>`;
      }
      return `<label class="field">${esc(f.label)}<input value="${esc(f.value)}" data-cmd="gfx.set" data-args="${a}" data-key="value" data-live></label>`;
    }).join('') : '';
    let statpop = '';
    if (g && g.statpop) {
      const sp = ui.sp || {}; const side = sp.side === 'away' ? 'away' : 'home';
      const sb = S.ose.scoreboard; const roster = S.ose.rosters[side] || [];
      const teamName = (k) => (sb ? sb[k === 'away' ? 'AwayShort' : 'HomeShort'] || sb[k === 'away' ? 'AwayName' : 'HomeName'] : k === 'away' ? 'AWAY' : 'HOME');
      const line = (g.statpop.format || '{EVENT} – #{NUM} {NAME}').replace('{EVENT}', sp.event || 'EVENT').replace('{NUM}', sp.num || '?').replace('{NAME}', sp.name || '');
      statpop = `<div class="card col" style="gap:8px"><div class="row"><b class="grow">Stat pop</b><span class="tiny muted">${S.ose.ok ? 'roster from OpenStatsEngine' : 'OpenStatsEngine not connected'}</span>
          <button class="b-sm ${side === 'home' ? 'b-red' : ''}" data-ui="spSide:home">${esc(teamName('home'))}</button><button class="b-sm ${side === 'away' ? 'b-sel' : ''}" data-ui="spSide:away">${esc(teamName('away'))}</button></div>
        <div class="row wrap">${roster.map((p) => `<button class="b-sm ${p.number === sp.num ? 'b-sel' : ''}" data-ui="spPlayer:${esc(p.number + '|' + p.name)}"><b class="mono">#${esc(p.number)}</b> ${esc(p.name)}</button>`).join('') || '<span class="small muted">No roster.</span>'}</div>
        <div class="row wrap">${(S.graphics.events || []).map((ev) => `<button class="b-sm ${ev === sp.event ? 'b-sel' : ''}" data-ui="spEvent:${esc(ev)}" style="border-radius:999px">${esc(ev)}</button>`).join('')}</div>
        <div class="row"><span class="grow" style="font-weight:700">${esc(line)}</span><button class="b-red" data-ui="spTake:${esc(g.id)}">TAKE STAT POP</button></div></div>`;
    }
    return head('gfx', on.length ? 'ON AIR: ' + on.map((x) => x.name).join(', ') : 'Nothing on air', on.length ? 'var(--red-text)' : '') + `<div class="sec-body">
      <div class="row">${sel}${editBtn}<a class="pill calm-hide" href="/master#graphics" style="text-decoration:none">⚙ Manage</a></div>
      ${g && g.gc ? `<div class="tiny muted">Graphics Controller title <b style="color:var(--soft)">${esc(g.gc.name)}</b>: its fields are filled there. Edit opens it in the Graphics Controller.</div>` : ''}
      <div class="small" style="color:${g && g.replaces ? 'var(--amber)' : 'var(--muted)'}">${esc(meta)}</div>
      ${statpop}${fields}
      <div class="row">${checkBtn.replace('<button ', '<button style="flex:1" ')}${takeBtn.replace('<button ', '<button style="flex:1.4;padding:12px" ')}${outBtn.replace('<button ', '<button style="flex:1" ')}</div>
      <div class="tally ${on.length ? 'on' : ''}">${tallyLine}<div class="row">${hold('ALL OUT', 'gfx.allout', {}, 'b-sm')}</div></div></div>`;
  }

  /* ---------- videos ---------- */
  function renderVideo() {
    const v = S.videos;
    const status = v.now ? `<span style="font-weight:700;color:${v.running ? 'var(--red-text)' : 'var(--text)'}">${v.running ? '▶' : v.inPreview ? 'CUED' : '■'} ${esc(v.now)} · ${mmss(v.remaining)} left</span>` : '<span class="muted">Nothing cued</span>';
    const nextName = v.queue[0] ? v.queue[0].name : 'nothing queued';
    const controls = `${btn('CUE NEXT', 'video.next', {}, 'b-green', v.queue.length ? '' : 'disabled')}${btn(v.running ? '❚❚' : '▶', 'video.playpause', {})}${btn('⟲', 'video.restart', {}, 'k2', 'title="Restart"')}`;
    if (!isOpen('video')) return `<div class="sec-body"><div class="bar">${barTitle('video')}<div class="grow col" style="gap:2px">${status}<span class="small muted ellipsis">Next: <b style="color:var(--text)">${esc(nextName)}</b> · ${v.queue.length} queued${v.pendingCue ? ' · waiting to cue ' + esc(v.pendingCue) : ''}</span></div>${controls}</div></div>`;
    const clips = v.clips.map((c) => {
      const col = c.status === 'playing' || c.status === 'on air' ? 'rgba(255,59,48,.6)' : c.status === 'cued' ? 'rgba(48,209,88,.55)' : c.status === 'queued' ? 'rgba(10,132,255,.55)' : 'var(--line)';
      const bg = c.status === 'playing' || c.status === 'on air' ? 'var(--red)' : c.status === 'cued' ? 'var(--green)' : c.status === 'queued' ? 'var(--accent)' : 'rgba(0,0,0,.55)';
      return `<div class="card" style="padding:0;border:1px solid ${col};overflow:hidden;display:flex;flex-direction:column">
        <div class="thumb" style="${c.thumb ? `background-image:url('${esc(c.thumb)}')` : ''}"><span class="badge" style="background:${bg}">${esc(c.status.toUpperCase())}</span><span class="dur">${c.seconds ? mmss(c.seconds) : '?'}</span></div>
        <div class="clip-name ellipsis" title="${esc(c.name)}">${esc(c.name)}</div>
        <div class="row" style="padding:0 6px 6px;gap:4px">${btn('+ Queue', 'video.queue', { path: c.path }, 'b-sm grow')}${btn('Cue', 'video.cue', { path: c.path }, 'b-sm b-green grow')}</div></div>`;
    }).join('');
    const q = v.queue.map((x, i) => `<div class="qrow" style="background:${i === 0 ? 'var(--blue-soft)' : 'transparent'}"><span class="mono muted">${i + 1}</span><span class="ellipsis">${esc(x.name)}${x.folder !== v.folder ? ` <span class="tiny muted">· ${esc(x.folder)}</span>` : ''}</span><span class="mono muted">${x.seconds ? mmss(x.seconds) : ''}</span>${btn('✕', 'video.unqueue', { index: i }, 'b-sm', 'aria-label="Remove from queue"')}</div>`).join('') || '<span class="small muted">Queue is empty. Use “+ Queue” on a clip.</span>';
    return head('video', v.now ? (v.running ? 'Playing: ' : 'Cued: ') + v.now + ' · ' + mmss(v.remaining) + ' left · ' + v.queue.length + ' queued' : v.queue.length + ' queued', v.running ? 'var(--red-text)' : '') + `<div class="sec-body">
      <div class="row"><span class="small muted">Folder</span><select class="grow" data-cmd="video.folder" data-key="name">${v.folders.map((f) => `<option ${f === v.folder ? 'selected' : ''}>${esc(f)}</option>`).join('') || '<option>No folders in Videos</option>'}</select>
        <label class="pill calm-hide" style="cursor:pointer">⇪ Upload<input type="file" accept="video/*" multiple class="hide" data-upload></label>${btn('⟳', 'video.rescan', {}, 'b-sm', 'title="Rescan folder"')}</div>
      ${v.autoNextWarn ? '<div class="banner warn note small" role="alert">⚠ vMix moved to the next clip by itself. In vMix, right-click the VIDEOS input › Edit Items and turn OFF <b>Auto Next</b>.</div>' : ''}
      ${v.listPending ? '<div class="small muted">The vMix VIDEOS list switches to this folder once the video is off air.</div>' : ''}
      <div class="drop calm-hide" data-drop>Drop videos here to copy them into <b>Videos › ${esc(v.folder || '?')}</b> on the Drive</div>
      <div class="grid4">${clips || '<span class="small muted">No videos in this folder.</span>'}</div>
      <div class="card col" style="gap:6px"><div class="row small"><b>PLAYLIST (${v.queue.length}${v.queueSeconds ? ' · ' + mmss(v.queueSeconds) : ''})</b><span class="muted grow">${v.autoCueNext ? 'when a clip ends, the next one plays (on air) or is cued to Preview (off air)' : 'auto-next is off: use CUE NEXT'}</span>
        <label class="small"><input type="checkbox" ${v.autoCueNext ? 'checked' : ''} data-cmd="video.autoCue" data-key="value"> auto-next</label>${v.queue.length ? btn('Clear', 'video.clearQueue', {}, 'b-sm') : ''}</div>
        <span class="tiny muted">Queue clips from any folder: pick another folder above and press “+ Queue”.</span>${q}
        <div class="row">${controls.replace(/<button /g, '<button style="flex:1" ')}</div>
        ${v.onAir ? '<span class="tiny" style="color:var(--red-text)">Video is on air: cueing waits until the director cuts away.</span>' : ''}</div></div>`;
  }

  /* ---------- ads ---------- */
  /** the break as a strip of blocks sized by length: played dimmed, the current one filling up */
  function timeline(items, segs) {
    if (!items || !items.length) return '';
    return `<div class="timeline">${items.map((i, k) => {
      const f = segs ? segs[k] || 0 : 0;
      return `<div class="tl-blk ${i.state}" style="flex:${Math.max(5, i.seconds || 15)} 1 0" title="${esc(i.name)} · ${i.seconds ? mmss(i.seconds) : '?'}"><span class="tl-fill" style="width:${Math.round(f * 100)}%"></span><span class="tl-name ellipsis">${esc(i.name)}</span><span class="tl-len mono">${i.seconds ? mmss(i.seconds) : ''}</span></div>`;
    }).join('')}</div>`;
  }
  function renderAds() {
    const a = S.ads; const b = a.breaks.find((x) => x.id === a.selected);
    const bname = b ? b.name : 'No break playlist';
    const goBack = `<div class="col" style="gap:6px">${btn('GO TO AD BREAK', 'ads.go', {}, 'b-orange b-big', a.linked ? '' : 'disabled')}${btn('BACK TO GAME', 'ads.back', {}, 'b-green b-sm')}</div>`;
    let barBody;
    if (a.phase === 'count') barBody = `<div class="grow" style="font-weight:800;color:var(--orange-text)">Starting in ${a.count}…</div>${btn('CANCEL', 'ads.cancel', {})}`;
    else if (a.phase === 'cued') barBody = `<div class="grow col" style="gap:2px"><b style="color:var(--orange-text)">ADS IN PREVIEW · ${esc(bname)}</b><span class="small muted">Waiting for the director to take it. They start playing as soon as it's on Program.</span></div>${btn('BACK TO GAME', 'ads.back', {}, 'b-green')}`;
    else if ((a.phase === 'break' || a.phase === 'done') && a.timer) {
      const t = a.timer;
      const cur = t.segments[t.index - 1] || 0;
      barBody = `<div class="grow col" style="gap:6px"><b style="color:var(--amber)">${a.phase === 'done' ? '✓ BREAK DONE' : '▶ AD ' + t.index + ' OF ' + t.count + ' · ' + esc(t.name)}</b>
        ${timeline(a.items, t.segments)}
        <span class="small">${a.phase === 'done' ? 'Press BACK TO GAME' : 'Next: <b>' + esc(t.next || 'back to game') + '</b>'}</span></div>
        <div class="row" style="text-align:right;gap:14px"><div class="col" style="align-items:center;gap:2px"><div class="tiny muted" style="font-weight:800;letter-spacing:1px">THIS AD</div>${ring(a.phase === 'done' ? 0 : 1 - cur, '<b class="mono">' + mmss(t.adLeft) + '</b>', 'var(--amber)', 64)}</div>
        <div><div class="tiny muted" style="font-weight:800;letter-spacing:1px">BREAK LEFT</div><div class="timer-big" style="color:var(--orange-text)">${mmss(t.breakLeft)}</div></div></div>
        <div class="col" style="gap:6px">${btn('SKIP AD ⏭', 'ads.skip', {}, 'b-sm')}${btn('BACK TO GAME', 'ads.back', {}, 'b-green b-sm')}</div>`;
    } else barBody = `<div class="grow col" style="gap:2px"><b>${esc(bname)} playlist · ${b ? b.count : 0} ads · ${mmss(b ? b.total : 0)}</b>${a.items.length ? timeline(a.items, null) : '<span class="small ellipsis" style="color:var(--soft)">empty: open to fill it</span>'}<span class="tiny muted">${a.countdown} s countdown, then music fades and ads go to Preview</span></div>${goBack}`;
    if (!isOpen('ads')) return `<div class="sec-body"><div class="bar">${barTitle('ads')}${barBody}</div></div>`;

    const chips = a.breaks.map((x) => `<span class="chipgrp ${x.id === a.selected ? 'sel' : ''}"><button data-cmd="ads.select" data-args="${attr({ id: x.id })}">${esc(x.name)} · ${mmss(x.target)}${x.played ? ' ✓' : ''}</button><button data-cmd="ads.removeBreak" data-args="${attr({ id: x.id })}" data-confirm="Remove the ${esc(x.name)} break playlist? (Ad videos stay on the Drive.)" aria-label="Remove ${esc(x.name)}" style="color:var(--muted);border-left:1px solid var(--line2)">✕</button></span>`).join('');
    const lens = [30, 60, 120, 180, 300].map((s) => btn(s < 60 ? s + 's' : s / 60 + 'm', 'ads.target', { id: a.selected, seconds: s }, 'b-sm ' + (b && b.target === s ? 'b-sel' : ''))).join('');
    const pct = b && b.target ? Math.min(100, Math.round((b.total / b.target) * 100)) : 0;
    const rows = a.items.map((i) => `<div class="adrow ${i.state}"><span class="mono muted">${i.index + 1}</span><span class="ellipsis"><b class="tiny" style="color:${i.state === 'now' ? 'var(--orange-text)' : i.state === 'done' ? 'var(--green)' : 'var(--blue-text)'}">${{ now: '▶ NOW', next: 'NEXT', done: '✓', queued: '' }[i.state]}</b> ${esc(i.name)}</span>
      <span class="badge" style="background:${i.kind === 'sponsor' ? 'rgba(255,159,10,.12)' : 'rgba(255,255,255,.06)'};color:${i.kind === 'sponsor' ? 'var(--amber)' : 'var(--soft)'}">${esc(i.folder)}</span>
      <span class="mono" style="color:${i.estimated ? 'var(--amber)' : 'var(--soft)'}" title="${i.estimated ? 'estimated length' : ''}">${i.estimated ? '~' : ''}${i.seconds ? mmss(i.seconds) : '?'}</span>
      ${btn('↑', 'ads.moveItem', { id: a.selected, from: i.index, to: Math.max(0, i.index - 1) }, 'b-sm', 'aria-label="Move up"')}${btn('⟳', 'ads.swapItem', { id: a.selected, index: i.index }, 'b-sm', 'title="Swap for another ad"')}${btn('✕', 'ads.removeItem', { id: a.selected, index: i.index }, 'b-sm', 'aria-label="Remove ad"')}</div>`).join('') || '<span class="small muted">Empty. Pick a length or press Reshuffle to fill it.</span>';
    const lib = `<select class="grow" data-cmd="ads.addItem" data-args="${attr({ id: a.selected })}" data-key="path"><option value="">+ Add an ad from the library…</option>${a.library.map((l) => `<option value="${esc(l.path)}">${esc(l.folder + ' › ' + l.name + (l.seconds ? ' (' + mmss(l.seconds) + ')' : ''))}</option>`).join('')}</select>`;
    const missing = a.status.found ? (a.status.missing.length ? 'Missing folders: ' + a.status.missing.join(', ') : '') : 'Ads folder not found: ' + a.status.basePath;
    return head('ads', bname + ' playlist · ' + mmss(b ? b.total : 0) + (a.phase !== 'idle' ? ' · ' + a.phase.toUpperCase() : ''), 'var(--amber)') + `<div class="sec-body">
      ${a.phase !== 'idle' ? `<div class="boxed bar">${barBody}</div>` : ''}
      <div class="row wrap"><span class="small muted">Break playlist</span>${chips}<button class="b-sm b-dash" data-ui="addBreak">+ New</button>${btn('New game', 'ads.newGame', {}, 'b-sm', 'data-confirm="Start a new game? Every break is marked not played and sponsor rules reset."')}</div>
      <div class="row wrap"><span class="small muted">Length</span>${lens}<button class="b-sm" data-ui="customLen">Custom</button>${btn('⟳ Reshuffle', 'ads.fill', { id: a.selected }, 'b-sm')}</div>
      <div class="col" style="gap:4px"><div class="row small"><span class="grow">Filled <b class="mono">${mmss(b ? b.total : 0)}</b> of <b class="mono">${mmss(b ? b.target : 0)}</b></span><span class="muted">${b && b.target - b.total > 0 ? mmss(b.target - b.total) + ' short' : ''}</span></div>
        <div class="seg" style="height:6px"><span style="width:${pct}%;height:6px"></span></div></div>
      <div class="col" style="gap:5px">${rows}</div>
      <div class="row">${lib}</div>
      <div class="boxed row small"><span class="dot" style="background:${a.listMatches ? 'var(--green)' : 'var(--amber)'}"></span><span class="grow">vMix ads list: ${a.vmixCount} item(s) · ${a.listMatches ? 'matches ' + esc(bname) : 'different from ' + esc(bname) + ' (GO sends it)'}</span>${btn('Send · Replace', 'ads.send', { id: a.selected, mode: 'replace' }, 'b-sm')}${btn('Append', 'ads.send', { id: a.selected, mode: 'append' }, 'b-sm')}</div>
      ${missing ? `<span class="small warn">${esc(missing)}</span>` : ''}
      <div class="row">${btn('GO TO AD BREAK', 'ads.go', {}, 'b-orange b-big grow', a.linked ? '' : 'disabled')}${btn('BACK TO GAME', 'ads.back', {}, 'b-green b-big')}</div>
      <span class="tiny muted">GO counts down ${a.countdown} s (CANCEL stops it), fades the music and cues the ads to Preview. They play when the director takes them. BACK TO GAME stops the ads, fades the music back in and puts <b style="color:var(--text)">${esc(a.gameCam || 'the game camera')}</b> in ${a.backToGame.action === 'cut' ? 'Program' : 'Preview'}.</span>
      ${a.played.length ? `<details><summary class="small muted">Played tonight (${a.played.length})</summary><div class="small muted">${a.played.slice().reverse().map((p) => esc(p.time + ' · ' + p.name + ' · ' + p.break)).join('<br>')}</div></details>` : ''}</div>`;
  }

  /* ---------- music ---------- */
  function renderMusic() {
    const m = S.music;
    const status = m.playing ? '▶ PLAYING' : m.now ? (m.after === 'restart' ? '■ STOPPED · reset to start' : '■ STOPPED · next track cued') : '■ STOPPED';
    const levels = (list) => list.map((v) => btn(v + '%', 'music.level', { value: v }, (m.level === v ? 'b-amber ' : '') + 'k2')).join('');
    const playBtn = btn(m.playing ? '❚❚' : '▶', 'music.toggle', {}, m.playing ? 'b-green' : '', 'style="font-size:15px;min-width:46px" aria-label="Play or pause"');
    const nextTxt = m.nextIsRestart ? 'same song from 0:00' : m.next || '—';
    if (!isOpen('music')) {
      const pct = m.duration ? Math.min(100, (m.position / m.duration) * 100) : 0;
      return `<div class="sec-body"><div class="bar music-bar ${m.playing ? 'playing' : ''}">${barTitle('music')}
        ${m.duration ? ring(m.remaining / m.duration, '', m.playing ? 'var(--green)' : 'var(--muted)', 30) : ''}
        <div class="grow col" style="gap:2px"><span class="ellipsis" style="font-weight:700" class="${m.playing ? 'playing-text' : ''}"><span class="${m.playing ? 'playing-text' : ''}">${m.playing ? '▶' : '■'} ${esc(m.now || 'Nothing loaded')}</span></span>
        <span class="small muted ellipsis"><b class="${m.playing ? 'playing-text' : ''}">${status}</b> · <span class="mono">${mmss(m.position)} / ${mmss(m.duration)} · -${mmss(m.remaining)}</span> · next: ${esc(nextTxt)}</span></div>
        <span class="bar-keys">${playBtn}${btn('FADE IN', 'music.fadein', {}, 'b-sm')}${btn('FADE OUT', 'music.fadeout', {}, 'b-sm')}${levels([25, 50, 100])}${btn('NEXT', 'music.next', {})}${btn('KILL', 'music.kill', {}, 'b-red-soft')}</span>
        <div class="mprog" aria-hidden="true"><span style="width:${pct.toFixed(1)}%"></span></div></div></div>`;
    }
    const pl = `<select class="grow" style="font-weight:700" data-cmd="music.playlist" data-key="name">${m.playlists.map((p) => `<option value="${esc(p.name)}" ${p.name === m.playlist ? 'selected' : ''}>${esc(p.name)}${p.kind === 'saved' ? ' (saved)' : ''}</option>`).join('') || '<option>No folders in Music</option>'}</select>`;
    const songs = m.songs.map((s) => `<div class="row"><button class="grow row" style="justify-content:space-between;font-weight:400;padding:7px 9px;${s.now ? 'border-color:var(--green)' : ''}" data-cmd="music.play" data-args="${attr({ path: s.path })}" title="Play now"><span class="ellipsis">${esc(s.name)}</span><span class="mono muted small">${s.now ? (m.playing ? 'PLAYING' : 'LOADED') : s.queued ? 'QUEUED' : s.seconds ? mmss(s.seconds) : ''}</span></button>${btn('+ Queue', 'music.queue', { path: s.path }, 'b-sm')}</div>`).join('') || '<span class="small muted">No songs in this playlist.</span>';
    const q = m.queue.map((x, i) => `<div class="qrow" style="grid-template-columns:22px 1fr auto;background:${i === 0 ? 'var(--blue-soft)' : 'transparent'}"><span class="mono muted">${i + 1}</span><span class="ellipsis">${esc(x.name)}</span>${x.local ? btn('✕', 'music.unqueue', { index: i - (m.queue.length - m.queue.filter((y) => y.local).length) }, 'b-sm') : '<span class="tiny muted">in vMix</span>'}</div>`).join('') || '<span class="small muted">Nothing queued. Use “+ Queue” on a song.</span>';
    const pos = m.duration ? Math.round((m.position / m.duration) * 100) : 0;
    const chip = (label, c, args, on) => btn(label, c, args, 'b-sm ' + (on ? 'b-sel' : ''));
    return head('music', (m.playing ? '▶ PLAYING · ' : '■ STOPPED · ') + (m.now || '') + ' · ' + m.level + '%', m.playing ? 'var(--green)' : '') + `<div class="sec-body">
      <div class="row"><span class="small muted">Playlist</span>${pl}${btn('⟳', 'music.rescan', {}, 'b-sm', 'title="Rescan"')}</div>
      ${m.autoNextWarn ? '<div class="banner warn note small" role="alert">⚠ vMix moved to the next song by itself. In vMix, right-click the MUSIC input › Edit Items and turn OFF <b>Auto Next</b>.</div>' : ''}
      ${m.listPending ? '<div class="small muted">The vMix MUSIC list switches to this playlist when the current song stops (or when you play a song from it).</div>' : ''}
      <div class="music-bar ${m.playing ? 'playing' : ''} col" style="gap:6px"><div class="row small"><b class="${m.playing ? 'playing-text' : 'muted'} grow">${status}</b><span class="mono">-${mmss(m.remaining)}</span></div>
        <div style="font-weight:700;font-size:15px" class="${m.playing ? 'playing-text' : ''}">${esc(m.now || 'Nothing loaded')}</div>
        <div class="seg" style="height:5px;background:var(--well)"><span style="width:${pos}%;height:5px;background:var(--text)"></span></div></div>
      <div class="row wrap small muted">Mode ${chip('Single song', 'music.mode', { value: 'single' }, m.mode === 'single')}${chip('Playlist · back-to-back', 'music.mode', { value: 'playlist' }, m.mode === 'playlist')}
        <span style="margin-left:10px">When a song stops</span>${chip('Reset to start', 'music.after', { value: 'restart' }, m.after === 'restart')}${chip('Cue next track', 'music.after', { value: 'next' }, m.after === 'next')}</div>
      <div class="card col" style="gap:6px"><div class="row small"><b>UP NEXT (${m.queue.length})</b><span class="muted grow">${m.mode === 'playlist' ? 'when a song ends, the next one starts' : 'one song at a time'}</span><button class="b-sm" data-ui="savePlaylist">Save as playlist…</button>${btn('Clear', 'music.clearQueue', {}, 'b-sm')}</div>${q}</div>
      <div class="col" style="gap:4px;max-height:260px;overflow-y:auto">${songs}</div>
      <div class="row">${levels([25, 50, 75, 100]).replace(/<button /g, '<button style="flex:1;padding:12px" ')}</div>
      <div class="row wrap small muted">Fade ${[['Cut', 0], ['1s', 1000], ['2s', 2000], ['4s', 4000]].map(([l, ms]) => chip(l, 'music.fadeTime', { ms }, m.fadeMs === ms)).join('')}<span class="grow"></span><span>Auto-duck under videos: on${m.ducked ? ' (ducked now)' : ''}</span></div>
      <div class="row">${playBtn.replace('<button ', '<button style="flex:.8" ')}${btn('◀ PREV', 'music.prev', {}, '', 'style="flex:.8"')}${btn('NEXT ▶', 'music.next', {}, '', 'style="flex:.8"')}${btn('FADE IN', 'music.fadein', {}, '', 'style="flex:1"')}${btn('FADE OUT', 'music.fadeout', {}, '', 'style="flex:1"')}${btn('KILL', 'music.kill', {}, 'b-red-soft', 'style="flex:1"')}</div></div>`;
  }

  /* ---------- mixer ---------- */
  const STATE_TXT = { live: 'LIVE', mute: 'MUTED · off stream', listen: 'LISTENING · headphones', mutelisten: 'LISTEN ONLY · not live' };
  const STATE_COL = { live: 'var(--green)', mute: 'var(--red)', listen: 'var(--amber)', mutelisten: 'var(--blue-text)' };
  function renderMix() {
    const X = S.mixer;
    const open = isOpen('mix');
    // only what changes rarely goes in the HTML; meters / faders / levels are updated in place (BC.mixLive)
    const strips = X.channels.map((c, k) => {
      const muted = c.mode === 'mute' || c.mode === 'mutelisten'; const lis = c.mode === 'listen' || c.mode === 'mutelisten';
      const mc = muted ? 'background:#3A3A40' : '';
      const id = esc(c.id);
      return `<div class="strip ${c.mode}">
        <div class="ellipsis sname" title="${esc(c.source || c.name)}">${esc(c.name)}</div>
        <div class="st" style="color:${c.missing ? 'var(--red)' : STATE_COL[c.mode]}">${c.missing ? 'INPUT MISSING' : STATE_TXT[c.mode]}</div>
        <div class="meters" title="Ticks: −20, −6 and 0 dB · the thin line holds the peak"><div class="meter"><span data-meter-l="${id}" style="${mc}"></span><i class="pk" data-peak-l="${id}"></i></div><div class="meter"><span data-meter-r="${id}" style="${mc}"></span><i class="pk" data-peak-r="${id}"></i></div>
          <input class="vfader" type="range" orient="vertical" min="0" max="100" step="1" data-fader="${id}" aria-label="${esc(c.name)} level"></div>
        <div class="mono tiny muted"><span data-vol="${id}"></span> · <span data-db="${id}"></span></div>
        <div class="mbtns">${c.master ? `<button class="${muted ? 'm-on' : ''}" data-cmd="mix.mute" data-args="${attr({ id: c.id })}" style="grid-column:span 2">MUTE</button>` : `<button class="${muted ? 'm-on' : ''}" data-cmd="mix.mute" data-args="${attr({ id: c.id })}">MUTE</button><button class="${lis ? 'l-on' : ''}" data-cmd="mix.listen" data-args="${attr({ id: c.id })}">LISTEN</button>`}</div>
        ${c.mic ? `<button class="${c.cough ? 'b-red-soft' : ''}" style="font-size:10px;padding:6px 0;width:100%" data-cmd="mix.cough" data-args="${attr({ id: c.id })}" title="NDI Audio Bridge cough (mic ${esc(c.mic)})">${c.cough ? 'COUGHED' : 'COUGH'}</button>` : ''}
        ${open ? `<div class="row calm-hide" style="gap:3px;width:100%">${btn('◀', 'mix.move', { id: c.id, to: k - 1 }, 'b-sm grow', k ? `aria-label="Move ${esc(c.name)} left"` : 'disabled')}${btn('✕', 'mix.remove', { id: c.id }, 'b-sm', `data-confirm="Remove the ${esc(c.name)} slider?" aria-label="Remove ${esc(c.name)}"`)}${btn('▶', 'mix.move', { id: c.id, to: k + 1 }, 'b-sm grow', k < X.channels.length - 1 ? `aria-label="Move ${esc(c.name)} right"` : 'disabled')}</div>` : ''}</div>`;
    }).join('');
    const legend = '<span class="tiny muted calm-hide"><b style="color:var(--red)">MUTE</b> off the stream · <b style="color:var(--amber)">LISTEN</b> in headphones · both = <b style="color:var(--accent)">listen, not live</b></span>';
    const mutedCount = X.channels.filter((c) => c.mode === 'mute' || c.mode === 'mutelisten').length;
    if (!open) return `<div class="sec-body"><div class="bar">${barTitle('mix')}<span class="grow"></span>${legend}</div><div class="strips">${strips}</div></div>`;
    return head('mix', X.channels.length + ' channels · ' + mutedCount + ' muted') + `<div class="sec-body">${legend}<div class="strips big">${strips}</div>
      <div class="row"><select class="grow" id="mixAdd">${X.available.map((i) => `<option value="${esc(i.key)}">${esc(i.title)} (${esc(i.type)})</option>`).join('')}<option value="master">Master bus</option></select><button class="b-dash" data-ui="mixAdd">+ Add slider</button>${btn('Reset to defaults', 'mix.reset', {}, 'b-sm', 'data-confirm="Rebuild the mixer from the linked inputs?"')}</div></div>`;
  }

  /* ---------- render loop ---------- */
  const R = { stream: renderStream, gfx: renderGfx, video: renderVideo, ads: renderAds, music: renderMusic, mix: renderMix };
  function render() {
    if (!S) return;
    buildCols();
    document.body.classList.toggle('beginner', !!S.config.beginner);
    document.body.classList.toggle('focus', !!ui.focus);
    // on-air glow: something this page controls is on Program (a graphic, a video, the ads)
    const onAir = S.graphics.items.some((x) => x.onAir) || !!S.videos.onAir || S.ads.phase === 'break';
    document.body.classList.toggle('onair', onAir);
    renderTop(); renderScoreStrip(); renderBanners(); renderMon();
    for (const k of Object.keys(R)) { const el = document.getElementById('sec-' + k); if (el) patch(el, R[k]()); }
    BC.mixLive(document.getElementById('sec-mix'), S.mixer.channels);
  }
  BC.onState((s) => { if (s) { S = s; render(); } });
  BC.connect(); BC.wire();
  setInterval(() => { const c = document.getElementById('clock'); if (c) c.textContent = new Date().toLocaleTimeString([], { hour12: false }); }, 500);

  /* ---------- local-only buttons ---------- */
  document.addEventListener('click', async (e) => {
    const el = e.target.closest('[data-ui]'); if (!el) return;
    const [k, v] = el.dataset.ui.split(':');
    if (k === 'toggle') { ui.open[v] = !isOpen(v); saveUi(); render(); }
    else if (k === 'resetView') { ui.open = {}; saveUi(); render(); }
    else if (k === 'focus') { ui.focus = !ui.focus; saveUi(); render(); }
    else if (k === 'mons') { ui.mons = ui.mons === false; saveUi(); render(); }
    else if (k === 'spSide') { ui.sp = { ...(ui.sp || {}), side: v, num: '', name: '' }; saveUi(); render(); }
    else if (k === 'spPlayer') { const [num, ...nm] = v.split('|'); ui.sp = { ...(ui.sp || {}), num, name: nm.join('|') }; saveUi(); render(); }
    else if (k === 'spEvent') { ui.sp = { ...(ui.sp || {}), event: v }; saveUi(); render(); }
    else if (k === 'spTake') { const sp = ui.sp || {}; cmd('gfx.statpop', { id: v, side: sp.side || 'home', number: sp.num || '', name: sp.name || '', event: sp.event || '' }); }
    else if (k === 'check') { ui.gfx = v; saveUi(); render(); }
    else if (k === 'addBreak') { const name = prompt('Name for the new break playlist (e.g. Q2 break):'); if (name) { const sec = Number(prompt('Length in seconds:', '120')) || 120; cmd('ads.addBreak', { name, seconds: sec }); } }
    else if (k === 'customLen') { const sec = Number(prompt('Break length in seconds:', '150')); if (sec > 0) cmd('ads.target', { id: S.ads.selected, seconds: sec }); }
    else if (k === 'savePlaylist') { const name = prompt('Save the current song + up next as a playlist named:', 'Replay roll'); if (name) cmd('music.savePlaylist', { name }); }
    else if (k === 'mixAdd') { const sel = document.getElementById('mixAdd'); if (sel && sel.value) cmd('mix.add', { ref: sel.value, name: sel.value === 'master' ? 'Master' : (prompt('Name for this slider:', sel.options[sel.selectedIndex].text.replace(/ \([^)]*\)$/, '')) || undefined) }); }
  });
  document.addEventListener('change', (e) => {
    const el = e.target;
    if (el.dataset.uiSelect === 'gfx') { ui.gfx = el.value; saveUi(); el.blur(); render(); }
    if (el.dataset.uiSelect === 'chk') { ui.chk = el.value; saveUi(); el.blur(); render(); }
    if (el.type === 'range' && !el.dataset.fader) el.blur();
    if (el.matches('input[data-upload]')) { upload([...el.files]); el.value = ''; }
  });
  // live typing for graphic fields: send after a short pause
  let typeTimer = null;
  document.addEventListener('input', (e) => {
    const el = e.target; if (!el.matches('input[data-live]')) return;
    clearTimeout(typeTimer);
    typeTimer = setTimeout(() => cmd(el.dataset.cmd, { ...JSON.parse(el.dataset.args), value: el.value }), 400);
  });

  /* ---------- uploads ---------- */
  async function upload(files) {
    for (const f of files) {
      BC.toast('Copying ' + f.name + ' to the Drive…', 'info');
      const r = await fetch('/api/upload?folder=' + encodeURIComponent(S.videos.folder || '') + '&name=' + encodeURIComponent(f.name), { method: 'POST', body: f });
      const j = await r.json().catch(() => ({}));
      BC.toast(j.ok ? 'Added ' + j.file : 'Upload failed: ' + (j.error || r.status), j.ok ? 'ok' : 'bad');
    }
  }
  document.addEventListener('dragover', (e) => { const d = e.target.closest('[data-drop]'); if (d) { e.preventDefault(); d.classList.add('over'); } });
  document.addEventListener('dragleave', (e) => { const d = e.target.closest('[data-drop]'); if (d) d.classList.remove('over'); });
  document.addEventListener('drop', (e) => { const d = e.target.closest('[data-drop]'); if (d) { e.preventDefault(); d.classList.remove('over'); upload([...e.dataTransfer.files]); } });

  // keyboard shortcuts (not while typing)
  document.addEventListener('keydown', (e) => {
    if (e.repeat || e.target.matches('input, select, textarea') || e.ctrlKey || e.metaKey || e.altKey) return; // holding a key must not repeat TAKE
    const g = S && (S.graphics.items.find((x) => x.id === ui.gfx) || S.graphics.items[0]);
    const map = { ' ': ['music.toggle'], i: ['music.fadein'], f: ['music.fadeout'], n: ['music.next'], t: g ? ['gfx.take', { id: g.id }] : null, o: g ? ['gfx.out', { id: g.id }] : null, c: ['video.next'], p: ['video.playpause'] };
    const a = map[e.key.toLowerCase()];
    if (a) { e.preventDefault(); cmd(a[0], a[1] || {}); }
  });
})();
