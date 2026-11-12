/* Broadcast Console: control page (vertical 1080x1920 or horizontal 1920x1080). */
'use strict';
(() => {
  const { esc, attr, mmss, hms, meterPct, cmd, patch } = BC;
  const params = new URLSearchParams(location.search);
  const layout = params.get('layout') === 'horizontal' ? 'horizontal' : 'vertical';
  const LS = 'bc.ui.' + layout;
  const ui = Object.assign({ open: {}, gfx: '', mon: 'pgm', chk: '' }, (() => { try { return JSON.parse(localStorage.getItem(LS)) || {}; } catch { return {}; } })());
  const saveUi = () => { try { localStorage.setItem(LS, JSON.stringify(ui)); } catch { /* private mode */ } };
  let S = null; let lastCheck = '';

  /* ---------- layout ---------- */
  const SECS = { stream: 'Stream health', gfx: 'Graphics', video: 'Videos', ads: 'Ads', music: 'Music', mix: 'Mixer' };
  const colsEl = document.getElementById('cols');
  colsEl.style.gridTemplateColumns = layout === 'horizontal' ? '1040px minmax(0, 1fr)' : 'minmax(0, 1fr)';
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
    'ads.fill': 'New random set of ads for this break', 'music.toggle': 'Play / pause the music (Space)', 'music.fadeout': 'Fade the music to silence (F)', 'music.kill': 'Stop the music right now',
    'music.next': 'Next song (N)', 'music.level': 'Fade the music to this level', 'music.queue': 'Play this song after the current one',
    'mix.mute': 'Take this channel off the stream', 'mix.listen': 'Hear this channel in your headphones', 'mix.cough': 'Cough: silence this mic for a moment', 'rec.start': 'Start recording', 'rec.stop': 'Hold to stop recording',
  };
  const tip = (c) => (TIPS[c] ? ` data-tip="${esc(TIPS[c])}"` : '');
  const btn = (label, c, args, cls = '', extra = '') => `<button class="${cls}" data-cmd="${c}" data-args="${attr(args)}"${tip(c)} ${extra}>${label}</button>`;
  const hold = (label, c, args, cls = '') => `<button class="hold ${cls}" data-hold data-cmd="${c}" data-args="${attr(args)}"${tip(c)} title="Press and hold">${label}<span class="hint">hold</span></button>`;
  const ui_ = (label, key, cls = '') => `<button class="${cls}" data-ui="${esc(key)}">${label}</button>`;
  const head = (k, summary, color) => `<button class="sec-head" data-ui="toggle:${k}" aria-expanded="true"><span class="chev">▾</span><span class="sec-title">${SECS[k]}</span><span class="help" title="${esc(HELP[k])}">?</span><span class="grow ellipsis small" style="text-align:right;color:${color || 'var(--muted)'}">${esc(summary || '')}</span></button>`;
  const barTitle = (k) => `<button class="bar-title" data-ui="toggle:${k}" aria-expanded="false"><span class="chev">▸</span><span class="sec-title">${k === 'stream' ? 'STREAM' : SECS[k]}</span></button>`;
  const HELP = {
    stream: 'Is the show healthy? vMix link, streaming, recording, drive space, program audio, linked inputs.',
    gfx: 'Pick a graphic, edit its text, TAKE it on air or take it OUT. Red means vMix confirms it is on air.',
    video: 'Highlights and packages. CUE puts a clip in Preview for the director. Queue clips to cue them in order.',
    ads: 'Break playlists (Pregame, Halftime...). GO counts down 5 s, fades the music and cues the ads to Preview. BACK TO GAME brings the music and camera back.',
    music: 'Bumps and beds. Green = playing. FADE OUT fades to silence, KILL stops now. Queue songs or play a playlist back-to-back.',
    mix: 'MUTE takes a channel off the stream. LISTEN puts it in your headphones. Both = hear it, not live.',
  };
  const isOpen = (k) => (k in ui.open ? !!ui.open[k] : LAY.open.includes(k));

  /* ---------- header + banners ---------- */
  function renderTop() {
    const t = S.tally || {};
    const conn = S.vmix.connected;
    const rec = t.recording ? hold('● REC ' + hms(t.recordingDuration), 'rec.stop', {}, 'b-red b-sm') : btn('○ REC', 'rec.start', {}, 'b-sm');
    patch(document.getElementById('top'), `
      <div class="logo">BC</div>
      <div class="grow ellipsis" style="font-weight:700">${esc(S.show.name)}</div>
      <span class="pill"><span class="dot" style="background:${conn ? '#3FB950' : '#FF6B6B'}"></span>vMix ${conn ? esc(S.vmix.version || '') : 'offline'}</span>
      <a class="pill" href="/master" style="text-decoration:none">⚙ Master</a><button class="pill" data-ui="resetView" title="Back to the show's default open/closed sections">Reset view</button>
      <a class="pill" href="/control?layout=${layout === 'vertical' ? 'horizontal' : 'vertical'}" style="text-decoration:none">${layout === 'vertical' ? '⇆ Horizontal' : '⇅ Vertical'}</a>
      <span class="${t.streaming ? 'tag-live' : 'tag-off'}">${t.streaming ? '● LIVE' : 'OFF AIR'}</span>
      ${rec}
      <span class="clock" id="clock"></span>`);
  }
  function renderBanners() {
    const out = [];
    if (S.ads.phase === 'count') out.push(`<div class="banner count" role="status"><span style="font-size:18px;letter-spacing:1px">AD BREAK IN</span><span class="n">${S.ads.count}</span><span class="small">music is fading · ads go to Preview at 0</span><span class="grow"></span>${btn('CANCEL', 'ads.cancel', {}, '', 'style="background:transparent;border:2px solid #111827;color:#111827"')}</div>`);
    if (!S.vmix.connected) out.push(`<div class="banner bad" role="alert">⚠ vMix NOT CONNECTED: buttons won't do anything until it's back <span class="grow"></span><span class="small" style="font-weight:600">${esc(S.vmix.host + ':' + S.vmix.port)} · ${esc(S.vmix.error || '')}</span></div>`);
    if (S.graphics.warn) out.push(`<div class="banner warn">⚠ ${esc(S.graphics.warn)}</div>`);
    patch(document.getElementById('banners'), out.join(''));
  }

  /* ---------- monitors ---------- */
  function renderMon() {
    const t = S.tally || {};
    const items = S.graphics.items;
    const chk = items.find((g) => g.id === (ui.chk || ui.gfx)) || items[0];
    const P = S.previews; const usePv = P && P.enabled && P.local;
    const img = (n) => (usePv && P.stamp[n] ? `background-image:url('/api/snap/${n}?t=${P.stamp[n]}');background-size:cover;background-position:center;` : '');
    const cap = (txt) => (usePv ? `<span style="position:absolute;left:8px;bottom:6px;font-size:12px;font-weight:700;background:#000a;padding:2px 6px;border-radius:4px">${esc(txt)}</span>` : `<div class="big">${esc(txt)}</div>`);
    if (ui.mon === 'chk' && chk && usePv && P.check !== chk.key && lastCheck !== chk.key) { lastCheck = chk.key; cmd('previews.check', { key: chk.key }); }
    let right;
    if (ui.mon === 'chk' && chk && usePv && P.stamp.chk && P.check === chk.key) {
      right = `<div class="mon chk" style="${img('chk')}">${cap('CHECK · ' + chk.name + ' (not live)')}</div>`;
    } else if (ui.mon === 'chk' && chk) {
      const tf = chk.fields.filter((f) => f.kind === 'text');
      right = `<div class="mon chk"><div class="l3"><div class="a">${esc((tf[0] || {}).value || chk.name)}</div>${tf[1] ? `<div class="b">${esc(tf[1].value)}</div>` : ''}</div></div>`;
    } else {
      const on = items.filter((g) => g.onAir).map((g) => esc(g.name)).join(' · ');
      right = usePv ? `<div class="mon pgm" style="${img('pgm')}">${cap((t.program || '—') + (on ? ' + ' + on : ''))}</div>` : `<div class="mon pgm"><div><div class="big">${esc(t.program || '—')}</div>${on ? `<div class="small" style="margin-top:6px;color:var(--red-text)">+ ${on}</div>` : ''}</div></div>`;
    }
    patch(document.getElementById('mon'), `<div class="monitors">
      <div class="col"><div class="row" style="height:30px"><span class="mon-label" style="color:#3FB950">PREVIEW</span><span class="muted small">from the hardware panel</span></div>
        <div class="mon pvw" style="${img('pvw')}">${cap(t.preview || '—')}</div></div>
      <div class="col"><div class="row" style="height:30px">${ui_('Program', 'mon:pgm', 'b-sm ' + (ui.mon !== 'chk' ? 'b-sel' : ''))}${ui_('Check a graphic', 'mon:chk', 'b-sm ' + (ui.mon === 'chk' ? 'b-sel' : ''))}
        ${ui.mon === 'chk' ? `<select class="grow" data-ui-select="chk">${items.map((g) => `<option value="${esc(g.id)}" ${chk && g.id === chk.id ? 'selected' : ''}>${esc(g.name)}</option>`).join('')}</select><span class="muted tiny">not live</span>` : ''}</div>
        ${right}</div></div>`);
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
    return head('stream', h.ok ? 'Healthy' : h.alerts.join(' · '), h.ok ? '#56D364' : '#FF9C9C') + `<div class="sec-body">
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
    const opts = L.map((x) => `<option value="${esc(x.id)}" ${g && x.id === g.id ? 'selected' : ''}>${esc(x.group + ' › ' + x.name + (x.onAir ? '   ● ON AIR' : ''))}</option>`).join('');
    const sel = `<select class="grow" style="font-weight:700;font-size:14px" data-ui-select="gfx">${opts || '<option>No GT titles found in vMix</option>'}</select>`;
    const takeBtn = g ? `<button class="${g.onAir ? 'take-on' : 'take'}" data-cmd="gfx.take" data-args="${attr({ id: g.id })}">${g.onAir ? '● ON AIR' : 'TAKE'}</button>` : '';
    const outBtn = g ? btn('OUT', 'gfx.out', { id: g.id }) : '';
    const checkBtn = g ? ui_('CHECK', 'check:' + g.id) : '';
    const chips = on.map((x) => `<button class="chip-on" data-cmd="gfx.out" data-args="${attr({ id: x.id })}" title="Click to take it out">${esc(x.name)} <span class="mono" style="font-weight:600">${mmss(x.onAirSecs)}</span> ✕</button>`).join('');
    const tallyLine = `<div class="row wrap"><span class="tiny" style="font-weight:800;letter-spacing:1px;color:${on.length ? 'var(--red-text)' : 'var(--muted)'}">${on.length ? '● ON AIR' : 'NOTHING ON AIR'}</span>${chips}<span class="grow"></span><span class="tiny" style="color:${on.length ? 'var(--red-text)' : 'var(--muted)'}">✓ vMix tally</span></div>`;
    if (!isOpen('gfx')) return `<div class="sec-body"><div class="tally ${on.length ? 'on' : ''}"><div class="bar">${barTitle('gfx')}${sel}${checkBtn}${takeBtn}${outBtn}</div>${tallyLine}</div></div>`;
    let meta = '';
    if (g) meta = g.onAir ? 'On air now' : g.replaces ? '⚠ Taking this will replace: ' + g.replaces : 'Goes on top of what is on air now';
    const lists = S.graphics.lists || {};
    const spFields = g && g.statpop ? [g.statpop.lineField, g.statpop.logoField, g.statpop.colorField].filter(Boolean) : [];
    const fields = g ? g.fields.filter((f) => f.mode !== 'hidden' && !spFields.includes(f.name)).map((f) => {
      const a = attr({ id: g.id, field: f.name });
      if (f.mode === 'locked' || (f.source !== 'typed' && f.source !== 'list')) {
        const note = { fixed: 'fixed', ose: 'from OpenStatsEngine', logo: 'team logo' }[f.source] || 'locked';
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
    return head('gfx', on.length ? 'ON AIR: ' + on.map((x) => x.name).join(', ') : 'Nothing on air', on.length ? '#FF9C9C' : '') + `<div class="sec-body">
      <div class="row">${sel}<a class="pill" href="/master#graphics" style="text-decoration:none">⚙ Manage</a></div>
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
    const controls = `${btn('CUE NEXT', 'video.next', {}, 'b-green', v.queue.length ? '' : 'disabled')}${btn(v.running ? '❚❚' : '▶', 'video.playpause', {})}${btn('⟲', 'video.restart', {}, '', 'title="Restart"')}`;
    if (!isOpen('video')) return `<div class="sec-body"><div class="bar">${barTitle('video')}<div class="grow col" style="gap:2px">${status}<span class="small muted ellipsis">Next: <b style="color:var(--text)">${esc(nextName)}</b> · ${v.queue.length} queued${v.pendingCue ? ' · waiting to cue ' + esc(v.pendingCue) : ''}</span></div>${controls}</div></div>`;
    const clips = v.clips.map((c) => {
      const col = c.status === 'playing' || c.status === 'on air' ? 'var(--red)' : c.status === 'cued' ? 'var(--green)' : c.status === 'queued' ? 'var(--blue)' : 'var(--line2)';
      const bg = c.status === 'playing' || c.status === 'on air' ? 'var(--red)' : c.status === 'cued' ? 'var(--green)' : c.status === 'queued' ? '#2F5FB3' : '#3A4452';
      return `<div class="card" style="padding:0;border:2px solid ${col};overflow:hidden;display:flex;flex-direction:column">
        <div class="thumb" style="${c.thumb ? `background-image:url('${esc(c.thumb)}')` : ''}"><span class="badge" style="background:${bg}">${esc(c.status.toUpperCase())}</span><span class="dur">${c.seconds ? mmss(c.seconds) : '?'}</span></div>
        <div class="clip-name ellipsis" title="${esc(c.name)}">${esc(c.name)}</div>
        <div class="row" style="padding:0 6px 6px;gap:4px">${btn('+ Queue', 'video.queue', { path: c.path }, 'b-sm grow')}${btn('Cue', 'video.cue', { path: c.path }, 'b-sm b-green grow')}</div></div>`;
    }).join('');
    const q = v.queue.map((x, i) => `<div class="qrow" style="background:${i === 0 ? 'var(--blue-soft)' : 'transparent'}"><span class="mono muted">${i + 1}</span><span class="ellipsis">${esc(x.name)}</span><span class="mono muted">${x.seconds ? mmss(x.seconds) : ''}</span>${btn('✕', 'video.unqueue', { index: i }, 'b-sm', 'aria-label="Remove from queue"')}</div>`).join('') || '<span class="small muted">Queue is empty. Use “+ Queue” on a clip.</span>';
    return head('video', v.now ? (v.running ? 'Playing: ' : 'Cued: ') + v.now + ' · ' + mmss(v.remaining) + ' left · ' + v.queue.length + ' queued' : v.queue.length + ' queued', v.running ? '#FF9C9C' : '') + `<div class="sec-body">
      <div class="row"><span class="small muted">Folder</span><select class="grow" data-cmd="video.folder" data-key="name">${v.folders.map((f) => `<option ${f === v.folder ? 'selected' : ''}>${esc(f)}</option>`).join('') || '<option>No folders in Videos</option>'}</select>
        <label class="pill" style="cursor:pointer">⇪ Upload<input type="file" accept="video/*" multiple class="hide" data-upload></label>${btn('⟳', 'video.rescan', {}, 'b-sm', 'title="Rescan folder"')}</div>
      <div class="drop" data-drop>Drop videos here to copy them into <b>Videos › ${esc(v.folder || '?')}</b> on the Drive</div>
      <div class="grid4">${clips || '<span class="small muted">No videos in this folder.</span>'}</div>
      <div class="card col" style="gap:6px"><div class="row small"><b>QUEUE</b><span class="muted grow">${v.autoCueNext ? 'auto-cues the next clip to Preview when one ends (only when the video is not on air)' : 'auto-cue is off'}</span>
        <label class="small"><input type="checkbox" ${v.autoCueNext ? 'checked' : ''} data-cmd="video.autoCue" data-key="value"> auto-cue</label></div>${q}
        <div class="row">${controls.replace(/<button /g, '<button style="flex:1" ')}</div>
        ${v.onAir ? '<span class="tiny" style="color:var(--red-text)">Video is on air: cueing waits until the director cuts away.</span>' : ''}</div></div>`;
  }

  /* ---------- ads ---------- */
  function renderAds() {
    const a = S.ads; const b = a.breaks.find((x) => x.id === a.selected);
    const bname = b ? b.name : 'No break playlist';
    const goBack = `<div class="col" style="gap:6px">${btn('GO TO AD BREAK', 'ads.go', {}, 'b-orange b-big', a.linked ? '' : 'disabled')}${btn('BACK TO GAME', 'ads.back', {}, 'b-green b-sm')}</div>`;
    let barBody;
    if (a.phase === 'count') barBody = `<div class="grow" style="font-weight:800;color:var(--orange-text)">Starting in ${a.count}…</div>${btn('CANCEL', 'ads.cancel', {})}`;
    else if (a.phase === 'cued') barBody = `<div class="grow col" style="gap:2px"><b style="color:var(--orange-text)">ADS IN PREVIEW · ${esc(bname)}</b><span class="small muted">Waiting for the director to take it. They start playing as soon as it's on Program.</span></div>${btn('BACK TO GAME', 'ads.back', {}, 'b-green')}`;
    else if ((a.phase === 'break' || a.phase === 'done') && a.timer) {
      const t = a.timer;
      barBody = `<div class="grow col" style="gap:6px"><b style="color:#F2CC60">${a.phase === 'done' ? '✓ BREAK DONE' : '▶ AD ' + t.index + ' OF ' + t.count + ' · ' + esc(t.name)}</b>
        <div class="segs">${t.segments.map((f) => `<span class="seg"><span style="width:${Math.round(f * 100)}%"></span></span>`).join('')}</div>
        <span class="small">${a.phase === 'done' ? 'Press BACK TO GAME' : 'Next: <b>' + esc(t.next || 'back to game') + '</b>'}</span></div>
        <div class="row" style="text-align:right;gap:14px"><div><div class="tiny muted" style="font-weight:800;letter-spacing:1px">THIS AD</div><div class="timer-big">${mmss(t.adLeft)}</div></div>
        <div><div class="tiny muted" style="font-weight:800;letter-spacing:1px">BREAK LEFT</div><div class="timer-big" style="color:var(--orange-text)">${mmss(t.breakLeft)}</div></div></div>
        <div class="col" style="gap:6px">${btn('SKIP AD ⏭', 'ads.skip', {}, 'b-sm')}${btn('BACK TO GAME', 'ads.back', {}, 'b-green b-sm')}</div>`;
    } else barBody = `<div class="grow col" style="gap:2px"><b>${esc(bname)} playlist · ${b ? b.count : 0} ads · ${mmss(b ? b.total : 0)}</b><span class="small ellipsis" style="color:var(--soft)">${esc(a.items.map((i) => i.name).join(' · ') || 'empty: open to fill it')}</span><span class="tiny muted">${a.countdown} s countdown, then music fades and ads go to Preview</span></div>${goBack}`;
    if (!isOpen('ads')) return `<div class="sec-body"><div class="bar">${barTitle('ads')}${barBody}</div></div>`;

    const chips = a.breaks.map((x) => `<span class="chipgrp ${x.id === a.selected ? 'sel' : ''}"><button data-cmd="ads.select" data-args="${attr({ id: x.id })}">${esc(x.name)} · ${mmss(x.target)}${x.played ? ' ✓' : ''}</button><button data-cmd="ads.removeBreak" data-args="${attr({ id: x.id })}" data-confirm="Remove the ${esc(x.name)} break playlist? (Ad videos stay on the Drive.)" aria-label="Remove ${esc(x.name)}" style="color:var(--muted);border-left:1px solid var(--line2)">✕</button></span>`).join('');
    const lens = [30, 60, 120, 180, 300].map((s) => btn(s < 60 ? s + 's' : s / 60 + 'm', 'ads.target', { id: a.selected, seconds: s }, 'b-sm ' + (b && b.target === s ? 'b-sel' : ''))).join('');
    const pct = b && b.target ? Math.min(100, Math.round((b.total / b.target) * 100)) : 0;
    const rows = a.items.map((i) => `<div class="adrow ${i.state}"><span class="mono muted">${i.index + 1}</span><span class="ellipsis"><b class="tiny" style="color:${i.state === 'now' ? 'var(--orange-text)' : i.state === 'done' ? '#3FB950' : 'var(--blue-text)'}">${{ now: '▶ NOW', next: 'NEXT', done: '✓', queued: '' }[i.state]}</b> ${esc(i.name)}</span>
      <span class="badge" style="background:${i.kind === 'sponsor' ? '#3A2E10' : '#232A35'};color:${i.kind === 'sponsor' ? '#F2CC60' : '#C9D1DC'}">${esc(i.folder)}</span>
      <span class="mono" style="color:${i.estimated ? 'var(--amber)' : 'var(--soft)'}" title="${i.estimated ? 'estimated length' : ''}">${i.estimated ? '~' : ''}${i.seconds ? mmss(i.seconds) : '?'}</span>
      ${btn('↑', 'ads.moveItem', { id: a.selected, from: i.index, to: Math.max(0, i.index - 1) }, 'b-sm', 'aria-label="Move up"')}${btn('⟳', 'ads.swapItem', { id: a.selected, index: i.index }, 'b-sm', 'title="Swap for another ad"')}${btn('✕', 'ads.removeItem', { id: a.selected, index: i.index }, 'b-sm', 'aria-label="Remove ad"')}</div>`).join('') || '<span class="small muted">Empty. Pick a length or press Reshuffle to fill it.</span>';
    const lib = `<select class="grow" data-cmd="ads.addItem" data-args="${attr({ id: a.selected })}" data-key="path"><option value="">+ Add an ad from the library…</option>${a.library.map((l) => `<option value="${esc(l.path)}">${esc(l.folder + ' › ' + l.name + (l.seconds ? ' (' + mmss(l.seconds) + ')' : ''))}</option>`).join('')}</select>`;
    const missing = a.status.found ? (a.status.missing.length ? 'Missing folders: ' + a.status.missing.join(', ') : '') : 'Ads folder not found: ' + a.status.basePath;
    return head('ads', bname + ' playlist · ' + mmss(b ? b.total : 0) + (a.phase !== 'idle' ? ' · ' + a.phase.toUpperCase() : ''), '#E3B341') + `<div class="sec-body">
      ${a.phase !== 'idle' ? `<div class="boxed bar">${barBody}</div>` : ''}
      <div class="row wrap"><span class="small muted">Break playlist</span>${chips}<button class="b-sm b-dash" data-ui="addBreak">+ New</button>${btn('New game', 'ads.newGame', {}, 'b-sm', 'data-confirm="Start a new game? Every break is marked not played and sponsor rules reset."')}</div>
      <div class="row wrap"><span class="small muted">Length</span>${lens}<button class="b-sm" data-ui="customLen">Custom</button>${btn('⟳ Reshuffle', 'ads.fill', { id: a.selected }, 'b-sm')}</div>
      <div class="col" style="gap:4px"><div class="row small"><span class="grow">Filled <b class="mono">${mmss(b ? b.total : 0)}</b> of <b class="mono">${mmss(b ? b.target : 0)}</b></span><span class="muted">${b && b.target - b.total > 0 ? mmss(b.target - b.total) + ' short' : ''}</span></div>
        <div class="seg" style="height:6px"><span style="width:${pct}%;height:6px"></span></div></div>
      <div class="col" style="gap:5px">${rows}</div>
      <div class="row">${lib}</div>
      <div class="boxed row small"><span class="dot" style="background:${a.listMatches ? '#3FB950' : '#E3B341'}"></span><span class="grow">vMix ads list: ${a.vmixCount} item(s) · ${a.listMatches ? 'matches ' + esc(bname) : 'different from ' + esc(bname) + ' (GO sends it)'}</span>${btn('Send · Replace', 'ads.send', { id: a.selected, mode: 'replace' }, 'b-sm')}${btn('Append', 'ads.send', { id: a.selected, mode: 'append' }, 'b-sm')}</div>
      ${missing ? `<span class="small warn">${esc(missing)}</span>` : ''}
      <div class="row">${btn('GO TO AD BREAK', 'ads.go', {}, 'b-orange b-big grow', a.linked ? '' : 'disabled')}${btn('BACK TO GAME', 'ads.back', {}, 'b-green b-big')}</div>
      <span class="tiny muted">GO counts down ${a.countdown} s (CANCEL stops it), fades the music and cues the ads to Preview. They play when the director takes them. BACK TO GAME stops the ads, fades the music back in and puts <b style="color:var(--text)">${esc(a.gameCam || 'the game camera')}</b> in ${a.backToGame.action === 'cut' ? 'Program' : 'Preview'}.</span>
      ${a.played.length ? `<details><summary class="small muted">Played tonight (${a.played.length})</summary><div class="small muted">${a.played.slice().reverse().map((p) => esc(p.time + ' · ' + p.name + ' · ' + p.break)).join('<br>')}</div></details>` : ''}</div>`;
  }

  /* ---------- music ---------- */
  function renderMusic() {
    const m = S.music;
    const status = m.playing ? '▶ PLAYING' : m.now ? (m.after === 'restart' ? '■ STOPPED · reset to start' : '■ STOPPED · next track cued') : '■ STOPPED';
    const levels = (list) => list.map((v) => btn(v + '%', 'music.level', { value: v }, m.level === v ? 'b-amber' : '')).join('');
    const playBtn = btn(m.playing ? '❚❚' : '▶', 'music.toggle', {}, m.playing ? 'b-green' : '', 'style="font-size:15px;min-width:46px" aria-label="Play or pause"');
    const nextTxt = m.nextIsRestart ? 'same song from 0:00' : m.next || '—';
    if (!isOpen('music')) {
      return `<div class="sec-body"><div class="bar music-bar ${m.playing ? 'playing' : ''}">${barTitle('music')}
        <div class="grow col" style="gap:2px"><span class="ellipsis" style="font-weight:700" class="${m.playing ? 'playing-text' : ''}"><span class="${m.playing ? 'playing-text' : ''}">${m.playing ? '▶' : '■'} ${esc(m.now || 'Nothing loaded')}</span></span>
        <span class="small muted ellipsis"><b class="${m.playing ? 'playing-text' : ''}">${status}</b> · <span class="mono">-${mmss(m.remaining)}</span> · next: ${esc(nextTxt)}</span></div>
        ${playBtn}${btn('FADE OUT', 'music.fadeout', {}, 'b-sm')}${levels([25, 50, 100])}${btn('NEXT', 'music.next', {})}${btn('KILL', 'music.kill', {}, 'b-red-soft')}</div></div>`;
    }
    const pl = `<select class="grow" style="font-weight:700" data-cmd="music.playlist" data-key="name">${m.playlists.map((p) => `<option value="${esc(p.name)}" ${p.name === m.playlist ? 'selected' : ''}>${esc(p.name)}${p.kind === 'saved' ? ' (saved)' : ''}</option>`).join('') || '<option>No folders in Music</option>'}</select>`;
    const songs = m.songs.map((s) => `<div class="row"><button class="grow row" style="justify-content:space-between;font-weight:400;padding:7px 9px;${s.now ? 'border-color:var(--green)' : ''}" data-cmd="music.play" data-args="${attr({ path: s.path })}" title="Play now"><span class="ellipsis">${esc(s.name)}</span><span class="mono muted small">${s.now ? (m.playing ? 'PLAYING' : 'LOADED') : s.queued ? 'QUEUED' : s.seconds ? mmss(s.seconds) : ''}</span></button>${btn('+ Queue', 'music.queue', { path: s.path }, 'b-sm')}</div>`).join('') || '<span class="small muted">No songs in this playlist.</span>';
    const q = m.queue.map((x, i) => `<div class="qrow" style="grid-template-columns:22px 1fr auto;background:${i === 0 ? 'var(--blue-soft)' : 'transparent'}"><span class="mono muted">${i + 1}</span><span class="ellipsis">${esc(x.name)}</span>${x.local ? btn('✕', 'music.unqueue', { index: i - (m.queue.length - m.queue.filter((y) => y.local).length) }, 'b-sm') : '<span class="tiny muted">in vMix</span>'}</div>`).join('') || '<span class="small muted">Nothing queued. Use “+ Queue” on a song.</span>';
    const pos = m.duration ? Math.round((m.position / m.duration) * 100) : 0;
    const chip = (label, c, args, on) => btn(label, c, args, 'b-sm ' + (on ? 'b-sel' : ''));
    return head('music', (m.playing ? '▶ PLAYING · ' : '■ STOPPED · ') + (m.now || '') + ' · ' + m.level + '%', m.playing ? '#56D364' : '') + `<div class="sec-body">
      <div class="row"><span class="small muted">Playlist</span>${pl}${btn('⟳', 'music.rescan', {}, 'b-sm', 'title="Rescan"')}</div>
      <div class="music-bar ${m.playing ? 'playing' : ''} col" style="gap:6px"><div class="row small"><b class="${m.playing ? 'playing-text' : 'muted'} grow">${status}</b><span class="mono">-${mmss(m.remaining)}</span></div>
        <div style="font-weight:700;font-size:15px" class="${m.playing ? 'playing-text' : ''}">${esc(m.now || 'Nothing loaded')}</div>
        <div class="seg" style="height:5px;background:#2C3440"><span style="width:${pos}%;height:5px;background:#E6EAF0"></span></div></div>
      <div class="row wrap small muted">Mode ${chip('Single song', 'music.mode', { value: 'single' }, m.mode === 'single')}${chip('Playlist · back-to-back', 'music.mode', { value: 'playlist' }, m.mode === 'playlist')}
        <span style="margin-left:10px">When a song stops</span>${chip('Reset to start', 'music.after', { value: 'restart' }, m.after === 'restart')}${chip('Cue next track', 'music.after', { value: 'next' }, m.after === 'next')}</div>
      <div class="card col" style="gap:6px"><div class="row small"><b>UP NEXT (${m.queue.length})</b><span class="muted grow">${m.mode === 'playlist' ? 'plays straight through, no gaps (replay rolls)' : 'one song at a time'}</span><button class="b-sm" data-ui="savePlaylist">Save as playlist…</button>${btn('Clear', 'music.clearQueue', {}, 'b-sm')}</div>${q}</div>
      <div class="col" style="gap:4px;max-height:260px;overflow-y:auto">${songs}</div>
      <div class="row">${levels([25, 50, 75, 100]).replace(/<button /g, '<button style="flex:1;padding:12px" ')}</div>
      <div class="row wrap small muted">Fade ${[['Cut', 0], ['1s', 1000], ['2s', 2000], ['4s', 4000]].map(([l, ms]) => chip(l, 'music.fadeTime', { ms }, m.fadeMs === ms)).join('')}<span class="grow"></span><span>Auto-duck under videos: on${m.ducked ? ' (ducked now)' : ''}</span></div>
      <div class="row">${playBtn.replace('<button ', '<button style="flex:.8" ')}${btn('◀ PREV', 'music.prev', {}, '', 'style="flex:.8"')}${btn('NEXT ▶', 'music.next', {}, '', 'style="flex:.8"')}${btn('FADE OUT', 'music.fadeout', {}, '', 'style="flex:1"')}${btn('KILL', 'music.kill', {}, 'b-red-soft', 'style="flex:1"')}</div></div>`;
  }

  /* ---------- mixer ---------- */
  const STATE_TXT = { live: 'LIVE', mute: 'MUTED · off stream', listen: 'LISTENING · headphones', mutelisten: 'LISTEN ONLY · not live' };
  const STATE_COL = { live: '#3FB950', mute: '#FF6B6B', listen: '#F2CC60', mutelisten: '#B7CEFF' };
  function renderMix() {
    const X = S.mixer;
    const open = isOpen('mix');
    const strips = X.channels.map((c) => {
      const muted = c.mode === 'mute' || c.mode === 'mutelisten'; const lis = c.mode === 'listen' || c.mode === 'mutelisten';
      const mc = muted ? '#3A3F48' : '#3FB950';
      return `<div class="strip ${c.mode}">
        <div class="ellipsis" style="font-size:12px;font-weight:800;max-width:100%" title="${esc(c.source || c.name)}">${esc(c.name)}</div>
        <div class="st" style="color:${c.missing ? '#FF6B6B' : STATE_COL[c.mode]}">${c.missing ? 'INPUT MISSING' : STATE_TXT[c.mode]}</div>
        <div class="meters"><div class="meter"><span style="height:${meterPct(c.dbL)}%;background:${mc}"></span></div><div class="meter"><span style="height:${meterPct(c.dbR)}%;background:${mc}"></span></div>
          <input class="vfader" type="range" min="0" max="100" value="${c.volume}" data-cmd="mix.level" data-args="${attr({ id: c.id })}" data-key="value" aria-label="${esc(c.name)} level"></div>
        <div class="mono tiny muted">${c.volume}</div>
        <div class="mbtns">${c.master ? `<button class="${muted ? 'm-on' : ''}" data-cmd="mix.mute" data-args="${attr({ id: c.id })}" style="grid-column:span 2">MUTE</button>` : `<button class="${muted ? 'm-on' : ''}" data-cmd="mix.mute" data-args="${attr({ id: c.id })}">MUTE</button><button class="${lis ? 'l-on' : ''}" data-cmd="mix.listen" data-args="${attr({ id: c.id })}">LISTEN</button>`}</div>
        ${c.mic ? `<button class="${c.cough ? 'b-red-soft' : ''}" style="font-size:10px;padding:6px 0;width:100%" data-cmd="mix.cough" data-args="${attr({ id: c.id })}" title="NDI Audio Bridge cough (mic ${esc(c.mic)})">${c.cough ? 'COUGHED' : 'COUGH'}</button>` : ''}
        ${open ? btn('✕', 'mix.remove', { id: c.id }, 'b-sm', `data-confirm="Remove the ${esc(c.name)} slider?" aria-label="Remove ${esc(c.name)}"`) : ''}</div>`;
    }).join('');
    const legend = '<span class="tiny muted"><b style="color:#FF6B6B">MUTE</b> off the stream · <b style="color:#E3B341">LISTEN</b> in headphones · both = <b style="color:#8AB4FF">listen, not live</b></span>';
    const mutedCount = X.channels.filter((c) => c.mode === 'mute' || c.mode === 'mutelisten').length;
    if (!open) return `<div class="sec-body"><div class="bar">${barTitle('mix')}<span class="grow"></span>${legend}</div><div class="strips">${strips}</div></div>`;
    return head('mix', X.channels.length + ' channels · ' + mutedCount + ' muted') + `<div class="sec-body">${legend}<div class="strips">${strips}</div>
      <div class="row"><select class="grow" id="mixAdd">${X.available.map((i) => `<option value="${esc(i.key)}">${esc(i.title)} (${esc(i.type)})</option>`).join('')}<option value="master">Master bus</option></select><button class="b-dash" data-ui="mixAdd">+ Add slider</button>${btn('Reset to defaults', 'mix.reset', {}, 'b-sm', 'data-confirm="Rebuild the mixer from the linked inputs?"')}</div></div>`;
  }

  /* ---------- render loop ---------- */
  const R = { stream: renderStream, gfx: renderGfx, video: renderVideo, ads: renderAds, music: renderMusic, mix: renderMix };
  function render() {
    if (!S) return;
    buildCols();
    document.body.classList.toggle('beginner', !!S.config.beginner);
    renderTop(); renderBanners(); renderMon();
    for (const k of Object.keys(R)) { const el = document.getElementById('sec-' + k); if (el) patch(el, R[k]()); }
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
    else if (k === 'spSide') { ui.sp = { ...(ui.sp || {}), side: v, num: '', name: '' }; saveUi(); render(); }
    else if (k === 'spPlayer') { const [num, ...nm] = v.split('|'); ui.sp = { ...(ui.sp || {}), num, name: nm.join('|') }; saveUi(); render(); }
    else if (k === 'spEvent') { ui.sp = { ...(ui.sp || {}), event: v }; saveUi(); render(); }
    else if (k === 'spTake') { const sp = ui.sp || {}; cmd('gfx.statpop', { id: v, side: sp.side || 'home', number: sp.num || '', name: sp.name || '', event: sp.event || '' }); }
    else if (k === 'mon') { ui.mon = v; saveUi(); render(); }
    else if (k === 'check') { ui.mon = 'chk'; ui.chk = v; saveUi(); render(); }
    else if (k === 'addBreak') { const name = prompt('Name for the new break playlist (e.g. Q2 break):'); if (name) { const sec = Number(prompt('Length in seconds:', '120')) || 120; cmd('ads.addBreak', { name, seconds: sec }); } }
    else if (k === 'customLen') { const sec = Number(prompt('Break length in seconds:', '150')); if (sec > 0) cmd('ads.target', { id: S.ads.selected, seconds: sec }); }
    else if (k === 'savePlaylist') { const name = prompt('Save the current song + up next as a playlist named:', 'Replay roll'); if (name) cmd('music.savePlaylist', { name }); }
    else if (k === 'mixAdd') { const sel = document.getElementById('mixAdd'); if (sel && sel.value) cmd('mix.add', { ref: sel.value, name: sel.value === 'master' ? 'Master' : (prompt('Name for this slider:', sel.options[sel.selectedIndex].text.replace(/ \([^)]*\)$/, '')) || undefined) }); }
  });
  document.addEventListener('change', (e) => {
    const el = e.target;
    if (el.dataset.uiSelect === 'gfx') { ui.gfx = el.value; saveUi(); el.blur(); render(); }
    if (el.dataset.uiSelect === 'chk') { ui.chk = el.value; saveUi(); el.blur(); render(); }
    if (el.type === 'range') el.blur();
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
      BC.toast('Copying ' + f.name + ' to the Drive…');
      const r = await fetch('/api/upload?folder=' + encodeURIComponent(S.videos.folder || '') + '&name=' + encodeURIComponent(f.name), { method: 'POST', body: f });
      const j = await r.json().catch(() => ({}));
      BC.toast(j.ok ? 'Added ' + j.file : 'Upload failed: ' + (j.error || r.status));
    }
  }
  document.addEventListener('dragover', (e) => { const d = e.target.closest('[data-drop]'); if (d) { e.preventDefault(); d.classList.add('over'); } });
  document.addEventListener('dragleave', (e) => { const d = e.target.closest('[data-drop]'); if (d) d.classList.remove('over'); });
  document.addEventListener('drop', (e) => { const d = e.target.closest('[data-drop]'); if (d) { e.preventDefault(); d.classList.remove('over'); upload([...e.dataTransfer.files]); } });

  // keyboard shortcuts (not while typing)
  document.addEventListener('keydown', (e) => {
    if (e.repeat || e.target.matches('input, select, textarea') || e.ctrlKey || e.metaKey || e.altKey) return; // holding a key must not repeat TAKE
    const g = S && (S.graphics.items.find((x) => x.id === ui.gfx) || S.graphics.items[0]);
    const map = { ' ': ['music.toggle'], f: ['music.fadeout'], n: ['music.next'], t: g ? ['gfx.take', { id: g.id }] : null, o: g ? ['gfx.out', { id: g.id }] : null, c: ['video.next'], p: ['video.playpause'] };
    const a = map[e.key.toLowerCase()];
    if (a) { e.preventDefault(); cmd(a[0], a[1] || {}); }
  });
})();
