/* Broadcast Remotes: touch control for iPad / phone.  /remote  or  /remote?view=mixer|ads|music|graphics|videos */
'use strict';
(() => {
  const { esc, attr, mmss, meterPct, patch } = BC;
  const q = new URLSearchParams(location.search);
  const fixed = q.get('view');
  const TABS = [['mixer', 'Mixer'], ['ads', 'Ads'], ['music', 'Music'], ['graphics', 'Graphics'], ['videos', 'Videos']];
  let tab = fixed || (() => { try { return localStorage.getItem('bc.remote.tab'); } catch { return null; } })() || 'mixer';
  let S = null;
  const $ = (id) => document.getElementById(id);
  const b = (label, c, args, cls = '', extra = '') => `<button class="${cls}" data-cmd="${c}" data-args="${attr(args)}" ${extra}>${label}</button>`;

  function top() {
    const t = S.tally || {};
    patch($('top'), `<div class="logo">BC</div><b class="grow" style="font-size:16px">${fixed ? esc((TABS.find((x) => x[0] === fixed) || [, 'Remote'])[1]) : 'Broadcast Remotes'} <span class="muted small">· ${esc(S.show.name)}</span></b>
      ${fixed ? '' : `<span class="row tabs">${TABS.map(([k, l]) => `<button class="${k === tab ? 'b-sel' : ''}" data-tab="${k}">${l}</button>`).join('')}</span>`}
      <span class="pill"><span class="dot" style="background:${S.vmix.connected ? '#3FB950' : '#FF6B6B'}"></span>${S.vmix.connected ? 'vMix' : 'vMix offline'}</span>
      <span class="${t.streaming ? 'tag-live' : 'tag-off'}">${t.streaming ? '● LIVE' : 'OFF AIR'}</span>`);
    const ban = [];
    if (S.ads.phase === 'count') ban.push(`<div class="banner count"><span style="font-size:18px">AD BREAK IN</span><span class="n">${S.ads.count}</span><span class="grow"></span>${b('CANCEL', 'ads.cancel', {}, '', 'style="background:transparent;border:2px solid #111827;color:#111827;padding:14px 20px"')}</div>`);
    if (!S.vmix.connected) ban.push('<div class="banner bad">⚠ vMix NOT CONNECTED</div>');
    patch($('banner'), ban.join(''));
  }

  const STATE = { live: ['LIVE', '#3FB950'], mute: ['MUTED', '#FF6B6B'], listen: ['LISTENING', '#F2CC60'], mutelisten: ['LISTEN ONLY', '#B7CEFF'] };
  function mixer() {
    return `<div class="rstrips">${S.mixer.channels.map((c) => {
      const muted = c.mode === 'mute' || c.mode === 'mutelisten'; const lis = c.mode === 'listen' || c.mode === 'mutelisten';
      const col = muted ? '#3A3F48' : '#3FB950';
      return `<div class="rstrip ${c.mode}"><b style="font-size:15px">${esc(c.name)}</b><span class="tiny" style="font-weight:800;color:${STATE[c.mode][1]}">${STATE[c.mode][0]}</span>
        <div class="row" style="gap:10px"><div class="rmeter"><span style="height:${meterPct(Math.max(c.dbL, c.dbR))}%;background:${col}"></span></div>
          <input class="rfader" type="range" min="0" max="100" value="${c.volume}" data-cmd="mix.level" data-args="${attr({ id: c.id })}" data-key="value" aria-label="${esc(c.name)} level"></div>
        <input class="hfader grow" style="display:none;width:100%" type="range" min="0" max="100" value="${c.volume}" data-cmd="mix.level" data-args="${attr({ id: c.id })}" data-key="value" aria-label="${esc(c.name)} level">
        <span class="mono small muted">${c.volume}</span>
        <div class="col" style="gap:6px;width:100%">
          <button class="rbtn" style="background:${muted ? 'var(--red)' : '#3A4452'}" data-cmd="mix.mute" data-args="${attr({ id: c.id })}">MUTE</button>
          ${c.master ? '' : `<button class="rbtn" style="background:${lis ? 'var(--amber)' : '#3A4452'};color:${lis ? '#111827' : '#fff'}" data-cmd="mix.listen" data-args="${attr({ id: c.id })}">LISTEN</button>`}
          ${c.mic ? `<button class="rbtn" style="background:${c.cough ? 'var(--red-soft)' : '#3A4452'}" data-cmd="mix.cough" data-args="${attr({ id: c.id })}">${c.cough ? 'COUGHED' : 'COUGH'}</button>` : ''}</div></div>`;
    }).join('')}</div>`;
  }
  function ads() {
    const a = S.ads; const t = a.timer; const br = a.breaks.find((x) => x.id === a.selected);
    const now = t && (a.phase === 'break' || a.phase === 'done')
      ? `<div class="panel" style="border:2px solid #22C55E"><span class="small muted" style="font-weight:800;letter-spacing:1px">${esc(br ? br.name.toUpperCase() : '')} · AD ${t.index} OF ${t.count}</span><b style="font-size:22px">${a.phase === 'done' ? 'Break done' : esc(t.name)}</b>
          <div class="row"><span class="countdown" style="color:#22C55E">${mmss(t.adLeft)}</span><span class="grow"></span><div style="text-align:right"><div class="tiny muted" style="font-weight:800">BREAK LEFT</div><div class="countdown" style="font-size:40px;color:var(--orange-text)">${mmss(t.breakLeft)}</div></div></div>
          <div class="segs">${t.segments.map((f) => `<span class="seg"><span style="width:${Math.round(f * 100)}%"></span></span>`).join('')}</div></div>`
      : a.phase === 'cued' ? '<div class="panel"><b style="font-size:20px;color:var(--orange-text)">Ads in Preview: waiting for the director</b></div>'
        : `<div class="panel"><span class="small muted">NEXT BREAK</span><b style="font-size:22px">${esc(br ? br.name : '—')} · ${br ? br.count : 0} ads · ${mmss(br ? br.total : 0)}</b></div>`;
    return `${now}
      <div class="row wrap">${a.breaks.map((x) => b(esc(x.name) + (x.played ? ' ✓' : ''), 'ads.select', { id: x.id }, 'grow ' + (x.id === a.selected ? 'b-sel' : ''), 'style="padding:14px;font-size:15px"')).join('')}</div>
      <div class="rgrid" style="grid-template-columns:repeat(2,minmax(0,1fr))">${b('◀ PREV AD', 'ads.prev', {}, 'big')}${b('NEXT AD ▶', 'ads.skip', {}, 'big')}${b('ADS FADE IN', 'ads.fade', { dir: 'in' }, 'big')}${b('ADS FADE OUT', 'ads.fade', { dir: 'out' }, 'big')}</div>
      <div class="rgrid" style="grid-template-columns:1.5fr 1fr">${b('GO TO AD BREAK', 'ads.go', {}, 'huge b-orange')}${b('BACK TO GAME', 'ads.back', {}, 'huge b-green')}</div>
      <div class="col">${a.items.map((i) => `<div class="adrow ${i.state}" style="grid-template-columns:24px 1fr auto;font-size:16px;padding:12px"><span class="mono muted">${i.index + 1}</span><b class="ellipsis">${esc(i.name)}</b><span class="mono">${i.seconds ? mmss(i.seconds) : '?'}</span></div>`).join('')}</div>`;
  }
  function music() {
    const m = S.music;
    return `<div class="panel" style="border:2px solid ${m.playing ? 'var(--green)' : 'var(--line2)'};background:${m.playing ? 'var(--green-bg)' : 'var(--panel)'}">
        <span class="small" style="font-weight:800;letter-spacing:1px;color:${m.playing ? 'var(--green-text)' : 'var(--muted)'}">${m.playing ? '▶ PLAYING' : '■ STOPPED'} · ${esc(m.playlist)}</span>
        <div class="row"><b class="grow" style="font-size:22px;color:${m.playing ? 'var(--green-text)' : 'inherit'}">${esc(m.now || 'Nothing loaded')}</b><span class="countdown" style="font-size:44px;color:${m.playing ? 'var(--green-text)' : 'inherit'}">-${mmss(m.remaining)}</span></div>
        <span class="small muted">Next: ${esc(m.nextIsRestart ? 'same song from 0:00' : m.next || '—')}</span></div>
      <div class="rgrid" style="grid-template-columns:repeat(5,minmax(0,1fr))">${b('FADE OUT', 'music.fadeout', {}, 'big', 'style="font-size:15px"')}${[25, 50, 75, 100].map((v) => b(v + '%', 'music.level', { value: v }, 'big ' + (m.level === v ? 'b-amber' : ''))).join('')}</div>
      <div class="rgrid" style="grid-template-columns:repeat(4,minmax(0,1fr))">${b(m.playing ? '❚❚ PAUSE' : '▶ PLAY', 'music.toggle', {}, 'big ' + (m.playing ? 'b-green' : ''))}${b('◀ PREV', 'music.prev', {}, 'big')}${b('NEXT ▶', 'music.next', {}, 'big')}${b('KILL', 'music.kill', {}, 'big b-red-soft')}</div>
      <select data-cmd="music.playlist" data-key="name" style="font-size:18px;padding:14px">${m.playlists.map((p) => `<option ${p.name === m.playlist ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select>
      <div class="col">${m.songs.map((s) => `<div class="row">${b(`<span class="grow ellipsis" style="text-align:left">${esc(s.name)}</span><span class="mono muted">${s.now ? (m.playing ? 'PLAYING' : 'LOADED') : s.queued ? 'QUEUED' : ''}</span>`, 'music.play', { path: s.path }, 'grow row', 'style="padding:14px;font-size:16px;font-weight:600"')}${b('+ Queue', 'music.queue', { path: s.path }, '', 'style="padding:14px"')}</div>`).join('')}</div>`;
  }
  function graphics() {
    const G = S.graphics;
    return `<div class="tiles">${G.items.map((g) => `<button class="gtile ${g.onAir ? 'on' : ''}" data-cmd="gfx.toggle" data-args="${attr({ id: g.id })}"><span class="tiny" style="font-weight:800;letter-spacing:1px;opacity:.85">${g.onAir ? '● ON AIR · ' + mmss(g.onAirSecs) : esc(g.group.toUpperCase())}</span><span style="font-size:19px;font-weight:800">${esc(g.name)}</span><span class="tiny ellipsis" style="max-width:100%;opacity:.8">${esc((g.fields.find((f) => f.kind === 'text') || {}).value || '')}</span></button>`).join('')}
      <button class="gtile" style="background:var(--panel);color:var(--text);border-color:var(--line2)" data-hold data-cmd="gfx.allout" data-args="{}"><span class="tiny">HOLD</span><span style="font-size:19px;font-weight:800">ALL OUT</span><span></span></button></div>`;
  }
  function videos() {
    const v = S.videos;
    return `<div class="panel"><b style="font-size:20px">${v.now ? (v.running ? '▶ ' : v.inPreview ? 'CUED · ' : '') + esc(v.now) + ' · ' + mmss(v.remaining) + ' left' : 'Nothing cued'}</b><span class="small muted">Next: ${esc(v.queue[0] ? v.queue[0].name : 'nothing queued')}</span></div>
      <div class="rgrid" style="grid-template-columns:repeat(3,minmax(0,1fr))">${b('CUE NEXT', 'video.next', {}, 'big b-green')}${b(v.running ? '❚❚' : '▶', 'video.playpause', {}, 'big')}${b('⟲ RESTART', 'video.restart', {}, 'big')}</div>
      <div class="tiles">${v.clips.map((c) => `<button class="card" style="padding:0;overflow:hidden;border:2px solid ${c.status === 'cued' ? 'var(--green)' : c.status === 'queued' ? 'var(--blue)' : c.status === 'playing' || c.status === 'on air' ? 'var(--red)' : 'var(--line2)'}" data-cmd="video.cue" data-args="${attr({ path: c.path })}"><div class="thumb" style="${c.thumb ? `background-image:url('${esc(c.thumb)}')` : ''}"><span class="badge">${esc(c.status.toUpperCase())}</span><span class="dur">${c.seconds ? mmss(c.seconds) : ''}</span></div><div class="clip-name ellipsis">${esc(c.name)}</div></button>`).join('')}</div>`;
  }

  const V = { mixer, ads, music, graphics, videos };
  function render() { if (!S) return; top(); patch($('view'), (V[tab] || mixer)()); }
  BC.onState((s) => { if (s) { S = s; render(); } });
  BC.connect(); BC.wire();
  document.addEventListener('click', (e) => { const t = e.target.closest('[data-tab]'); if (t) { tab = t.dataset.tab; try { localStorage.setItem('bc.remote.tab', tab); } catch { /* */ } render(); } });
  document.addEventListener('change', (e) => { if (e.target.type === 'range') e.target.blur(); });
})();
