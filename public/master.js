/* Broadcast Console: Master (settings & management). */
'use strict';
(() => {
  const { esc, attr, mmss, cmd, patch } = BC;
  const PAGES = [
    ['setup', '⚙', 'Setup'], ['graphics', '▣', 'Graphics'], ['ads', '$', 'Ads'], ['music', '♪', 'Music'], ['mixer', '≡', 'Mixer'],
    ['stream', '◉', 'Stream'], ['layout', '▯', 'Layout'], ['companion', '⌗', 'Companion'], ['shows', '☰', 'Shows'],
  ];
  let page = (location.hash || '#setup').slice(1); if (!PAGES.some((p) => p[0] === page)) page = 'setup';
  let S = null; let gsel = '';
  const $ = (id) => document.getElementById(id);
  const btn = (label, c, args, cls = '', extra = '') => `<button class="${cls}" data-cmd="${c}" data-args="${attr(args)}" ${extra}>${label}</button>`;
  const input = (c, args, key, value, extra = '') => `<input value="${esc(value ?? '')}" data-cmd="${c}" data-args="${attr(args)}" data-key="${key}" ${extra}>`;
  const select = (c, args, key, options, value, extra = '') => `<select data-cmd="${c}" data-args="${attr(args)}" data-key="${key}" ${extra}>${options.map((o) => { const [v, l] = Array.isArray(o) ? o : [o, o]; return `<option value="${esc(v)}" ${String(v) === String(value) ? 'selected' : ''}>${esc(l)}</option>`; }).join('')}</select>`;
  const panel = (title, body, note = '') => `<section class="panel"><div class="row"><h2 class="grow">${title}</h2>${note ? `<span class="small muted">${note}</span>` : ''}</div>${body}</section>`;

  function nav() {
    patch($('nav'), PAGES.map(([k, i, l]) => `<button class="${k === page ? 'on' : ''}" data-page="${k}"><span class="i">${i}</span>${l}</button>`).join(''));
  }

  /* ---------- Setup ---------- */
  function setup() {
    const jobsOpts = (key) => [['', '— not linked —'], ...S.inputs.map((i) => [i.key, i.number + '. ' + i.title + ' (' + i.type + ')'])];
    const ST = { ok: ['✓ linked', 'ok'], guess: ['check: best guess', 'warn'], missing: ['not linked', 'bad'], gone: ['input missing in vMix', 'bad'] };
    const jobs = S.links.jobs.map((j) => `<tr class="r"><td><b>${esc(j.label)}</b><div class="tiny muted">${esc(j.hint)}</div></td>
      <td>${select('link.set', { job: j.id }, 'key', jobsOpts(j.key), j.key, 'style="width:100%"')}</td>
      <td class="small ${ST[j.status][1]}">${S.links.picking === j.id ? '<span style="color:var(--blue-text)">◎ waiting… click the input in vMix so it goes to Preview</span>' : ST[j.status][0]}</td>
      <td style="white-space:nowrap">${S.links.picking === j.id ? (S.links.previewTitle ? btn('Use “' + esc(S.links.previewTitle) + '” (already in Preview)', 'link.usePreview', { job: j.id }, 'b-sm') + ' ' : '') + btn('Cancel', 'link.cancelPick', {}, 'b-sm') : btn('◎ Pick in vMix', 'link.pick', { job: j.id }, 'b-sm b-dash')} ${j.key ? btn('Identify', 'link.identify', { key: j.key }, 'b-sm', 'title="Puts it in vMix Preview (never Program)"') : ''}</td></tr>`).join('');
    return panel('1 · Find vMix', `<div class="muted small">vMix needs one setting: <b>Settings › Web Controller › on</b> (port 8088). On the vMix PC the address is 127.0.0.1.</div>
        <div class="row wrap"><span class="pill"><span class="dot" style="background:${S.vmix.connected ? '#3FB950' : '#FF6B6B'}"></span>${S.vmix.connected ? 'Connected · vMix ' + esc(S.vmix.edition + ' ' + S.vmix.version) + ' · ' + S.inputs.length + ' inputs' : 'Not connected: ' + esc(S.vmix.error)}</span>
        <input id="vhost" style="width:170px" value="${esc(S.vmix.host)}"><input id="vport" style="width:90px" value="${esc(S.vmix.port)}"><button data-act="vmix">Connect</button></div>
        <div class="row wrap"><span class="small muted">Only if you set a password in vMix › Web Controller:</span><input id="vuser" style="width:140px" placeholder="user name" value="${esc(S.vmix.user)}"><input id="vpass" type="password" style="width:140px" placeholder="password" value="${S.vmix.hasPassword ? '••••••••' : ''}"></div>`)
      + panel('2 · Assign jobs', `<div class="muted small">Matched automatically. Easiest fix: <b>◎ Pick in vMix</b>, then click the input in vMix so it goes to <b style="color:#3FB950">Preview</b>. Links use vMix's permanent input ID, so renaming inputs later is fine.</div>
        <table class="t"><thead><tr><th>Job</th><th>vMix input</th><th>Status</th><th></th></tr></thead><tbody>${jobs}</tbody></table><div class="row">${btn('⟳ Auto-match again', 'link.auto', {})}</div>`)
      + panel('3 · Drive folders', `<div class="muted small">Read and copy only: nothing on the Drive is ever moved, renamed or deleted.</div>
        <div class="row"><input id="drive" class="grow" value="${esc(S.config.driveRoot)}"><button data-act="drive">Save</button>${btn('Create missing folders', 'drive.makeFolders', {}, '', 'data-confirm="Create any missing Broadcast Console folders? Nothing existing is touched."')}</div>
        <div class="small">${S.config.driveFound ? '<span class="ok">✓ Folder found</span>' : '<span class="bad">Folder not found: check Google Drive for desktop, or press Create missing folders.</span>'}</div>
        <div class="row wrap"><span class="small muted">Record drive (space left)</span><input id="recdrive" style="width:120px" placeholder="D:\\" value="${esc(S.health.disk ? S.health.disk.drive : '')}"><button class="b-sm" data-act="recdrive">Save</button></div>`)
      + panel('4 · Your other tools', `<div class="row wrap"><span class="small muted" style="width:160px">OpenStatsEngine</span><input id="ose" class="grow" placeholder="http://192.168.50.21:8080" value="${esc(S.ose.url)}"><button data-act="ose">Save</button>${btn('⟳', 'ose.refresh', {}, 'b-sm')}
          <span class="small ${S.ose.ok ? 'ok' : S.ose.url ? 'bad' : 'muted'}">${S.ose.ok ? '✓ ' + esc((S.ose.scoreboard && (S.ose.scoreboard.AwayName + ' at ' + S.ose.scoreboard.HomeName)) || 'connected') + ' · rosters ' + S.ose.rosters.home.length + ' / ' + S.ose.rosters.away.length : S.ose.url ? 'not reachable: ' + esc(S.ose.error) : 'not set'}</span></div>
        <div class="row wrap"><span class="small muted" style="width:160px">NDI Audio Bridge (OSC)</span><input id="bhost" style="width:170px" placeholder="IP of the announcer computer" value="${esc(S.bridge.host)}"><input id="bport" style="width:90px" value="${esc(S.bridge.port)}"><button data-act="bridge">Save</button>
          <span class="small muted">${S.bridge.heard !== null ? 'last reply ' + S.bridge.heard + ' s ago' : 'cough buttons appear on mixer channels that have a Bridge mic (Mixer page)'}</span></div>`)
      + panel('5 · YouTube, previews, help', `<div class="small muted">YouTube check uses a free <b>YouTube Data API key</b> (Google Cloud console › APIs › YouTube Data API v3 › Credentials › API key) and your channel ID (YouTube Studio › Settings › Channel › Advanced, starts with UC…). Or paste tonight's watch link.</div>
        <div class="row wrap"><input id="ytkey" style="width:300px" placeholder="API key" value="${esc(S.youtube.configured ? '••••••••' : '')}"><input id="ytchan" style="width:250px" placeholder="Channel ID (UC…)" value="${esc(S.youtube.channelId)}"><input id="ytvid" class="grow" placeholder="or tonight's watch link (optional)" value="${esc(S.youtube.videoIdSetting)}"><button data-act="yt">Save</button>${btn('Check now', 'youtube.check', {}, 'b-sm')}</div>
        <div class="small">${S.youtube.configured ? (S.youtube.live ? `<span class="ok">✓ LIVE · ${S.youtube.viewers ?? '?'} watching · ${esc(S.youtube.title)}</span>` : `<span class="muted">${esc(S.youtube.error || 'No live video right now.')}</span>`) : '<span class="muted">Not set up.</span>'}</div>
        <div class="row wrap"><label class="small"><input type="checkbox" ${S.previews.enabled ? 'checked' : ''} data-cmd="previews.set" data-key="enabled"> Monitor pictures from vMix snapshots (about 1 per second${S.previews.local ? '' : '; only works when vMix is on this PC'})</label></div>
        <div class="row wrap"><label class="small"><input type="checkbox" ${S.config.beginner ? 'checked' : ''} data-cmd="ui.set" data-key="beginner"> Beginner mode: hover any button on the control page to see what it does</label></div>
        <div class="small muted">iPad / phone remotes: open <span class="mono">http://${esc(S.config.host)}:${S.config.port}/remote</span> (tabs) or <span class="mono">/remote?view=mixer</span> · <span class="mono">ads</span> · <span class="mono">music</span> · <span class="mono">graphics</span> · <span class="mono">videos</span> on the school network, then “Add to Home Screen”.</div>`)
      + panel('6 · Security', `<div class="small muted">With a PIN, iPads, phones and other computers must enter it once before they can use the controller. This PC never needs it. Companion over HTTP: add <span class="mono">?pin=…</span> to the URL.</div>
        <div class="row wrap"><span class="small muted" style="width:160px">PIN (4–8 digits)</span><input id="pin" type="password" inputmode="numeric" style="width:140px" placeholder="${S.config.pin ? 'PIN is set' : 'no PIN'}"><button data-act="pin">Save PIN</button>${S.config.pin ? '<button data-act="pinOff" data-confirm="Turn the PIN off? Anyone on the network can then use the controller.">Turn off</button><span class="small ok">✓ PIN on</span>' : '<span class="small warn">No PIN: anyone on this network can use the controller</span>'}</div>
        <div class="row wrap"><span class="small muted" style="width:160px">OSC (UDP) only from</span><input id="oscAllow" class="grow" placeholder="anyone, or Companion's IP (e.g. 192.168.1.20)" value="${esc((S.config.oscAllow || []).join(', '))}"><button data-act="oscAllow">Save</button></div>
        <div class="small muted">These can only be changed on the vMix PC itself.</div>`)
      + panel('Log', `<div class="small muted">Also saved to <span class="mono">${esc(S.config.logFile)}</span> · <a href="/api/log" style="color:var(--blue-text)">download today's log</a> (send it along when something goes wrong)</div><pre class="small mono" style="white-space:pre-wrap;color:var(--muted);margin:0">${esc(S.log.slice().reverse().join('\n') || 'Nothing yet.')}</pre>`);
  }

  /* ---------- Graphics ---------- */
  function graphics() {
    const G = S.graphics; const items = G.items;
    if (!items.find((g) => g.key === gsel)) gsel = items[0] ? items[0].key : '';
    const g = items.find((x) => x.key === gsel);
    const listNames = Object.keys(G.lists || {});
    const left = `<div class="gl">${items.map((x) => `<button data-gsel="${esc(x.key)}" class="${x.key === gsel ? 'b-sel' : ''}"><span class="grow ellipsis">${esc(x.name)}</span><span class="tiny muted">${esc(x.group)} · ${x.overlay}</span>${x.statpop ? '<span class="badge" style="background:#2F5FB3">STAT</span>' : ''}</button>`).join('') || '<span class="small muted">No GT titles in vMix.</span>'}
      ${G.hiddenItems.map((h) => `<div class="row small muted"><span class="grow">${esc(h.name)} (hidden)</span>${btn('Show', 'gfx.config', { key: h.key, hidden: false }, 'b-sm')}</div>`).join('')}</div>`;
    let right = '<span class="muted">Pick a graphic.</span>';
    if (g) {
      const srcOpts = [['typed', 'Typed by operator'], ['list', 'Pick from a list'], ['fixed', 'Fixed text'], ['ose', 'OpenStatsEngine value'], ['logo', 'Team logo (Drive › Graphics › Logos)']];
      const rows = g.fields.concat(/* hidden fields are filtered on the control page only */[]).map((f) => {
        let detail = '';
        if (f.source === 'list') detail = select('gfx.field', { key: g.key, name: f.name }, 'list', [['', '— choose list —'], ...listNames], f.list);
        else if (f.source === 'fixed') detail = input('gfx.field', { key: g.key, name: f.name }, 'value', f.fixed, 'placeholder="text" style="width:100%"');
        else if (f.source === 'ose') detail = select('gfx.field', { key: g.key, name: f.name }, 'ose', [['', '— field —'], ...S.ose.fields], f.ose);
        else if (f.source === 'logo') detail = select('gfx.field', { key: g.key, name: f.name }, 'logo', [['home', 'Home team'], ['away', 'Away team']], f.logo || 'home');
        return `<tr class="r"><td class="mono small">${esc(f.name)}<div class="tiny muted">${esc(f.kind)}</div></td>
          <td>${input('gfx.field', { key: g.key, name: f.name }, 'label', f.label, 'style="width:100%"')}</td>
          <td>${select('gfx.field', { key: g.key, name: f.name }, 'mode', [['edit', 'Editable'], ['locked', 'Locked'], ['hidden', 'Hidden']], f.mode)}</td>
          <td>${select('gfx.field', { key: g.key, name: f.name }, 'source', srcOpts, f.source)}</td><td style="min-width:180px">${detail}</td></tr>`;
      }).join('');
      const fieldNames = [['', '— none —'], ...g.fields.map((f) => [f.name, f.name])];
      const sp = g.statpop || {};
      right = `<div class="grid2" style="grid-template-columns:repeat(3,minmax(0,1fr))">
          <label class="lab">Name in the console${input('gfx.config', { key: g.key }, 'name', g.name)}</label>
          <label class="lab">Group${select('gfx.config', { key: g.key }, 'group', ['Lower thirds', 'Full screen', 'Scorebug', 'Other'], g.group)}</label>
          <label class="lab">Overlay channel${select('gfx.config', { key: g.key }, 'overlay', [1, 2, 3, 4], g.overlay)}</label>
          <label class="lab">Auto-out after (s, 0 = never)${input('gfx.config', { key: g.key }, 'autoOut', g.autoOut, 'type="number" min="0"')}</label>
          <label class="lab">vMix title<input value="${esc(g.title)}" disabled></label>
          <label class="lab">Companion<input value="/console/gfx/${esc(g.id)}/take" readonly></label></div>
        <div class="row">${btn('Hide from the dropdown', 'gfx.config', { key: g.key, hidden: true }, 'b-sm', 'data-confirm="Hide this graphic? You can show it again here."')}</div>
        <h2 style="margin-top:6px">Fields</h2>
        <div class="small muted">Give each field a friendly label and say where its content comes from. Fixed, OpenStatsEngine and logo fields are filled automatically when you TAKE (and scoreboard values keep updating while it's on air).</div>
        <table class="t"><thead><tr><th>vMix field</th><th>Label for operator</th><th>Shown as</th><th>Filled from</th><th></th></tr></thead><tbody>${rows || '<tr><td class="muted small">This title has no fields.</td></tr>'}</tbody></table>
        <h2 style="margin-top:6px">Stat pop</h2>
        <div class="row wrap"><label class="small"><input type="checkbox" ${g.statpop ? 'checked' : ''} data-cmd="gfx.statpopConfig" data-args="${attr({ key: g.key })}" data-key="enabled"> Use this graphic for stat pops (team + player from OpenStatsEngine + event)</label></div>
        ${g.statpop ? `<div class="grid2" style="grid-template-columns:repeat(4,minmax(0,1fr))">
          <label class="lab">Text field${select('gfx.statpopConfig', { key: g.key }, 'lineField', fieldNames, sp.lineField || '')}</label>
          <label class="lab">Logo field${select('gfx.statpopConfig', { key: g.key }, 'logoField', fieldNames, sp.logoField || '')}</label>
          <label class="lab">Color field${select('gfx.statpopConfig', { key: g.key }, 'colorField', fieldNames, sp.colorField || '')}</label>
          <label class="lab">Format${input('gfx.statpopConfig', { key: g.key }, 'format', sp.format || '{EVENT} – #{NUM} {NAME}')}</label></div>` : ''}`;
    }
    const lists = Object.entries(G.lists || {}).map(([n, items]) => `<div class="card col"><div class="row"><b class="grow">${esc(n)}</b>${btn('Delete', 'list.set', { name: n, items: null }, 'b-sm', `data-confirm="Delete the list ${esc(n)}?"`)}</div>
        <textarea data-list="${esc(n)}" placeholder="One item per line">${esc(items.join('\n'))}</textarea><div class="row"><button class="b-sm" data-act="saveList" data-name="${esc(n)}">Save list</button></div></div>`).join('');
    return panel('Graphics', `<div class="grid2" style="grid-template-columns:280px minmax(0,1fr)"><div>${left}</div><div class="col" style="gap:10px">${right}</div></div>`, 'every GT title in vMix')
      + panel('Pick-from lists', `<div class="small muted">For fields set to “Pick from a list” (e.g. Announcers). The operator gets a dropdown instead of typing.</div><div class="grid2">${lists}</div><div class="row"><input id="newList" placeholder="New list name (e.g. Announcers)"><button data-act="newList" class="b-dash">+ New list</button></div>`)
      + panel('Stat pop events · ' + esc(G.sport), `<div class="small muted">Event buttons for this show's sport (set the sport on the Shows page). One per line.</div><textarea id="events">${esc((G.events || []).join('\n'))}</textarea><div class="row"><button data-act="events">Save events</button></div>`);
  }

  /* ---------- Ads ---------- */
  function ads() {
    const A = S.ads;
    const bucketRows = A.folders.map((f, i) => `<div class="row" data-bucket="${i}"><input class="grow" value="${esc(f.name)}" data-f="name"><input type="number" style="width:90px" value="${f.seconds}" data-f="seconds"><span class="small muted">s</span><button class="b-sm" data-act="delBucket" data-i="${i}">✕</button></div>`).join('');
    const sponsorRows = A.sponsorFolders.map((f, i) => `<div class="row wrap" data-sponsor="${i}"><input class="grow" value="${esc(f.name)}" data-f="name"><span class="small muted">every</span><input type="number" style="width:70px" value="${f.every || 0}" data-f="every"><span class="small muted">breaks (0 = no)</span>
      <label class="small"><input type="checkbox" ${f.oncePerGame ? 'checked' : ''} data-f="oncePerGame"> once per game</label><label class="small"><input type="checkbox" ${f.inBuckets ? 'checked' : ''} data-f="inBuckets"> also in random fill</label><button class="b-sm" data-act="delSponsor" data-i="${i}">✕</button></div>`).join('');
    const breaks = A.breaks.map((b, i) => `<tr class="r"><td>${input('ads.renameBreak', { id: b.id }, 'name', b.name, 'style="width:100%"')}</td>
      <td>${input('ads.target', { id: b.id }, 'seconds', b.target, 'type="number" style="width:90px"')}</td><td class="mono small">${b.count} ads · ${mmss(b.total)}</td>
      <td><label class="small"><input type="checkbox" ${b.played ? 'checked' : ''} data-cmd="ads.markPlayed" data-args="${attr({ id: b.id })}" data-key="value"> played</label></td>
      <td style="white-space:nowrap">${btn('↑', 'ads.moveBreak', { id: b.id, to: Math.max(0, i - 1) }, 'b-sm')}${btn('↓', 'ads.moveBreak', { id: b.id, to: i + 1 }, 'b-sm')}${btn('⟳ Refill', 'ads.fill', { id: b.id }, 'b-sm')}${btn('✕', 'ads.removeBreak', { id: b.id }, 'b-sm', `data-confirm="Remove the ${esc(b.name)} break playlist? (Ad videos stay on the Drive.)"`)}</td></tr>`).join('');
    const byFolder = {}; for (const l of A.library) (byFolder[l.folder] = byFolder[l.folder] || []).push(l);
    const lib = Object.entries(byFolder).map(([f, L]) => `<details><summary class="small"><b>${esc(f)}</b> · ${L.length} ads${L.some((x) => x.estimated) ? ' · <span class="warn">' + L.filter((x) => x.estimated).length + ' estimated</span>' : ''}</summary><div class="small muted">${L.map((x) => esc(x.name) + ' · <span class="mono" style="color:' + (x.estimated ? 'var(--amber)' : 'inherit') + '">' + (x.estimated ? '~' : '') + (x.seconds ? mmss(x.seconds) : '?') + '</span>').join('<br>')}</div></details>`).join('');
    return panel('Break playlists', `<table class="t"><thead><tr><th>Name</th><th>Length (s)</th><th>Filled</th><th></th><th></th></tr></thead><tbody>${breaks}</tbody></table>
        <div class="row"><input id="nbName" placeholder="New break name (e.g. Q2 break)"><input id="nbSecs" type="number" placeholder="seconds" style="width:110px"><button class="b-dash" data-act="newBreak">+ New break playlist</button>${btn('New game (reset played)', 'ads.newGame', {}, '', 'data-confirm="Start a new game? Every break is marked not played and sponsor rules reset."')}</div>`, 'names per sport: halves, quarters, periods')
      + `<div class="grid2">` + panel('Ad library', `<div class="row"><input id="adsBase" class="grow" placeholder="blank = Broadcast Console\\Ads (or your ADS 25-26 folder)" value="${esc(A.basePathSetting)}"><button data-act="adsBase">Save</button>${btn('↺ Rescan', 'ads.rescan', {}, 'b-sm')}</div>
          <div class="small">${A.status.found ? `<span class="ok">✓ ${A.library.length} ads in ${esc(A.status.basePath)}</span>` : `<span class="bad">Not found: ${esc(A.status.basePath)}</span>`}${A.status.missing.length ? ' · <span class="warn">missing: ' + esc(A.status.missing.join(', ')) + '</span>' : ''}</div>${lib}`)
      + panel('Folders & sponsor rules', `<div class="small muted">Bucket folders: their nominal length is used for the fill (like your Ad Manager). Real lengths are shown everywhere else.</div><div class="col" id="buckets">${bucketRows}</div><div class="row"><button class="b-sm b-dash" data-act="addBucket">+ Bucket folder</button></div>
          <div class="row"><span class="small muted">Loose folder</span><input id="loose" value="${esc(A.looseFolder)}"></div>
          <div class="small muted">Sponsor folders</div><div class="col" id="sponsors">${sponsorRows}</div><div class="row"><button class="b-sm b-dash" data-act="addSponsor">+ Sponsor folder</button><span class="grow"></span><button data-act="saveFolders">Save folders</button></div>`) + `</div>`
      + panel('GO / BACK TO GAME', `<div class="row wrap"><span class="small muted">Countdown (s)</span>${input('ads.settings', {}, 'countdown', A.countdown, 'type="number" style="width:80px"')}<span class="small muted">Skip ads played in the last</span>${input('ads.settings', {}, 'skipRecentBreaks', A.skipRecentBreaks, 'type="number" style="width:70px"')}<span class="small muted">breaks</span></div>
        <div class="row wrap"><span class="small muted">BACK TO GAME puts <b style="color:var(--text)">${esc(A.gameCam || 'the game camera')}</b> in</span>${select('ads.settings', {}, 'backAction', [['preview', 'Preview (director cuts)'], ['cut', 'Program (cut straight to it)']], A.backToGame.action)}<span class="small muted">and brings music back to</span>${input('ads.settings', {}, 'backMusicLevel', A.backToGame.musicLevel, 'type="number" style="width:80px"')}<span class="small muted">%</span><span class="small muted">(camera: Setup › Assign jobs)</span></div>`)
      + panel('Played tonight', `<div class="small muted">Also saved on the Drive: <span class="mono">Exports\\ads-played-YYYY-MM-DD.csv</span></div><div class="small">${A.played.slice().reverse().map((p) => esc(p.time + ' · ' + p.name + ' · ' + p.break)).join('<br>') || '<span class="muted">Nothing yet.</span>'}</div>`);
  }

  /* ---------- Music ---------- */
  function music() {
    const M = S.music;
    return panel('Defaults', `<div class="row wrap"><span class="small muted">Fade time</span>${select('music.fadeTime', {}, 'ms', [[0, 'Cut'], [1000, '1 s'], [2000, '2 s'], [3000, '3 s'], [4000, '4 s']], M.fadeMs)}
        <span class="small muted">Level</span>${select('music.level', {}, 'value', [25, 50, 75, 100], M.level)}
        <span class="small muted">When a song stops</span>${select('music.after', {}, 'value', [['next', 'Cue next track'], ['restart', 'Reset to start']], M.after)}
        <span class="small muted">Mode</span>${select('music.mode', {}, 'value', [['single', 'Single song'], ['playlist', 'Playlist · back-to-back']], M.mode)}
        <label class="small"><input type="checkbox" ${M.duck ? 'checked' : ''} data-cmd="music.duck" data-key="value"> duck music under videos</label></div>`)
      + panel('Playlists', `<div class="small muted">Folder playlists = sub-folders of <span class="mono">Broadcast Console\\Music</span> (add a folder on the Drive, then ⟳). Saved playlists are made from the queue on the control page (“Save as playlist…”), e.g. a replay roll.</div>
        <div class="col">${M.playlists.map((p) => `<div class="row card"><b class="grow">${esc(p.name)}</b><span class="tiny muted">${p.kind === 'saved' ? 'saved playlist' : 'Drive folder'}</span>${p.kind === 'saved' ? btn('Delete', 'music.deletePlaylist', { name: p.name }, 'b-sm', `data-confirm="Delete the saved playlist ${esc(p.name)}? (Songs stay on the Drive.)"`) : ''}</div>`).join('') || '<span class="muted small">No playlists yet.</span>'}</div><div class="row">${btn('⟳ Rescan', 'music.rescan', {})}</div>`);
  }

  /* ---------- Mixer ---------- */
  function mixer() {
    const X = S.mixer;
    const srcOpts = [...S.inputs.map((i) => [i.key, i.number + '. ' + i.title]), ['master', 'Master bus']];
    const rows = X.channels.map((c, i) => `<tr class="r"><td class="mono muted">${i + 1}</td><td>${input('mix.config', { id: c.id }, 'name', c.name, 'style="width:100%"')}</td>
      <td>${select('mix.config', { id: c.id }, 'ref', srcOpts, c.ref, 'style="width:100%"')}</td>
      <td>${c.master ? '' : input('mix.config', { id: c.id }, 'mic', c.mic, 'placeholder="e.g. 1/1" style="width:90px"')}</td>
      <td class="mono tiny muted">/console/mix/${esc(c.name)}/mute</td>
      <td style="white-space:nowrap">${btn('↑', 'mix.move', { id: c.id, to: Math.max(0, i - 1) }, 'b-sm')}${btn('↓', 'mix.move', { id: c.id, to: i + 1 }, 'b-sm')}${btn('✕', 'mix.remove', { id: c.id }, 'b-sm', `data-confirm="Remove the ${esc(c.name)} slider?"`)}</td></tr>`).join('');
    return panel('Channels', `<div class="small muted">Name channels the way your crew talks (Announcer 1, Reporter…). <b>Bridge mic</b> = the NDI Audio Bridge interface/input (e.g. 1/1) to show a COUGH button on that channel.</div>
        <table class="t"><thead><tr><th>#</th><th>Name</th><th>vMix input</th><th>Bridge mic</th><th>Companion</th><th></th></tr></thead><tbody>${rows}</tbody></table>
        <div class="row"><select id="addRef" class="grow">${X.available.map((i) => `<option value="${esc(i.key)}">${esc(i.title)}</option>`).join('')}<option value="master">Master bus</option></select><input id="addName" placeholder="Name"><button class="b-dash" data-act="addCh">+ Add slider</button>${btn('Reset to defaults', 'mix.reset', {}, '', 'data-confirm="Rebuild the mixer from the linked inputs?"')}</div>`)
      + panel('How MUTE works', `<div class="row wrap"><span class="small muted">Live buses (what “on the stream” means)</span>${input('mix.liveBuses', {}, 'buses', X.liveBuses.join(','), 'style="width:120px"')}<span class="small muted">e.g. <span class="mono">M</span> or <span class="mono">M,A</span> if Bus A also feeds the stream</span></div>
        <div class="small muted">MUTE turns the input's audio off. LISTEN = vMix Solo (headphones). MUTE + LISTEN keeps the audio on but takes it off the live buses, so you hear it and the stream doesn't.</div>`);
  }

  /* ---------- Stream ---------- */
  function stream() {
    const B = [['vmix', 'vMix link'], ['stream', 'Stream on/off'], ['recording', 'Recording + time'], ['disk', 'Record drive space'], ['cpu', 'This PC CPU'], ['audio', 'Program audio + silence'], ['sources', 'Linked inputs present'], ['youtube', 'YouTube live + viewers'], ['alerts', 'Alerts']];
    const on = new Set(S.health.blocks);
    return panel('Stream health blocks', `<div class="small muted">Which tiles show in the Stream health section (9 fits a 3×3 grid).</div>
      <div class="grid2" style="grid-template-columns:repeat(3,minmax(0,1fr))">${B.map(([k, l]) => `<label class="card small"><input type="checkbox" data-block="${k}" ${on.has(k) ? 'checked' : ''}> ${l}</label>`).join('')}</div>`)
      + panel('Alerts', `<div class="small muted">Turns red on the control page and Stream Deck (/fb/health/ok) when: vMix disconnects · silence over 5 s while streaming · streaming but not recording · record drive under 1 hour · a linked input is missing.</div>`);
  }

  /* ---------- Layout ---------- */
  const SEC = { stream: 'Stream health', gfx: 'Graphics', video: 'Videos', ads: 'Ads', music: 'Music', mix: 'Mixer' };
  function layout() {
    const one = (k, title) => {
      const L = (S.layout && S.layout[k]) || {}; const order = (L.order && L.order.length ? L.order : Object.keys(SEC)).filter((x) => SEC[x]);
      for (const x of Object.keys(SEC)) if (!order.includes(x)) order.push(x);
      const hidden = new Set(L.hidden || []); const open = new Set(L.open || []);
      return panel(title, `<table class="t"><thead><tr><th>#</th><th>Section</th><th>Show</th><th>Starts open</th><th></th></tr></thead><tbody>${order.map((x, i) => `<tr class="r"><td class="mono muted">${i + 1}</td><td><b>${SEC[x]}</b></td>
        <td><input type="checkbox" ${hidden.has(x) ? '' : 'checked'} data-lay="${k}" data-sec="${x}" data-what="show"></td><td><input type="checkbox" ${open.has(x) ? 'checked' : ''} data-lay="${k}" data-sec="${x}" data-what="open"></td>
        <td><button class="b-sm" data-lay-move="${k}" data-sec="${x}" data-dir="-1">↑</button><button class="b-sm" data-lay-move="${k}" data-sec="${x}" data-dir="1">↓</button></td></tr>`).join('')}</tbody></table>`, k === 'horizontal' ? 'first rows go in the left column (graphics + videos by default)' : 'monitors are always on top');
    };
    return one('vertical', 'Vertical control page (1080×1920 monitor)') + one('horizontal', 'Horizontal control page (1920×1080)') + panel('Note', '<div class="small muted">Each computer remembers which sections it has open; “Starts open” is used the first time a page opens (or after Reset view on the control page).</div>');
  }

  /* ---------- Companion ---------- */
  function companion() {
    return panel('Companion / Stream Deck', `<div class="small muted">In Companion add <b>Generic: OSC</b> → this PC, port <b class="mono">${S.config.oscPort}</b> (UDP). Or <b>Generic: HTTP</b>: <span class="mono">GET http://${esc(S.config.host)}:${S.config.port}/osc/console/…</span>. Button text values: <span class="mono">/api/fb</span>.</div>
        <div class="row wrap"><span class="small muted">Send feedback to Companion at</span><input id="fbhost" style="width:170px" placeholder="Companion IP" value="${esc(S.config.oscFeedback.host || '')}"><input id="fbport" style="width:90px" placeholder="port" value="${esc(S.config.oscFeedback.port || '')}"><button data-act="fb">Save</button></div>`)
      + panel('Your ids', `<div class="small"><b>Graphics:</b> ${S.graphics.items.map((g) => `<span class="mono">${esc(g.id)}</span>`).join(' · ')}</div><div class="small"><b>Mixer channels:</b> ${S.mixer.channels.map((c) => `<span class="mono">${esc(c.name)}</span>`).join(' · ')}</div><div class="small"><b>Break playlists:</b> ${S.ads.breaks.map((b) => `<span class="mono">${esc(b.id)}</span> (${esc(b.name)})`).join(' · ')}</div>`)
      + panel('Commands', `<pre class="small mono" style="white-space:pre-wrap;color:var(--soft);margin:0">/console/gfx/{id}/take | out | toggle [1|0]      /console/gfx/{id}/field/{Field.Text} "text"      /console/gfx/allout
/console/video/next | playpause | restart
/console/ads/go | cancel | back | skip | reshuffle | newgame      /console/ads/break/{id}  /console/ads/break/{id}/go      /console/ads/length {s}
/console/music/toggle | play | pause | next | prev | kill      /console/music/fade/out [ms]   /console/music/fade/in   /console/music/level {0-100} [ms]   /console/music/playlist/{name}
/console/mix/{channel}/mute [1|0]   /listen [1|0]   /cough [1|0]   /level {0-100 | "+5" | "-5"}
Stream Deck + dials: /console/music/level "+5" | "-5"   /console/mix/select "+1" | "-1"   /console/mix/selected/level "+2" | "-2"   /console/mix/selected/mute   /console/video/jog "+1" | "-1" (seconds)   /console/ads/prev   /console/ads/fade/in | out
/console/statpop/{home|away}/{number}/{EVENT}
/console/rec [1|0]    /console/stream

Feedback: /fb/youtube/live · /fb/youtube/viewers · /fb/mix/selected · /fb/mix/selected/level · /fb/gfx/{id}/onair · /fb/music/playing · /fb/music/song · /fb/music/remaining · /fb/music/next · /fb/ads/phase · /fb/ads/countdown · /fb/ads/adleft · /fb/ads/remaining · /fb/video/remaining · /fb/mix/{name}/mode · /fb/rec · /fb/rec/time · /fb/stream · /fb/health/ok</pre>`);
  }

  /* ---------- Shows ---------- */
  function shows() {
    return panel('Shows', `<div class="small muted">A show keeps its own links, graphics setup, mixer, playlists and break playlists. Make one per sport.</div>
        <div class="col">${S.show.list.map((n) => `<div class="row card"><b class="grow">${esc(n)}</b>${n === S.show.name ? '<span class="ok small" style="font-weight:700">● loaded</span>' : btn('Load', 'show.load', { name: n }, 'b-sm') + btn('Delete', 'show.delete', { name: n }, 'b-sm', `data-confirm="Delete the show ${esc(n)}?"`)}</div>`).join('')}</div>
        <div class="row"><input id="newShow" placeholder="New show name (e.g. Football)" class="grow"><select id="copyFrom"><option value="">blank</option>${S.show.list.map((n) => `<option value="${esc(n)}">copy settings from ${esc(n)}</option>`).join('')}</select><button class="b-dash" data-act="newShow">+ New show</button></div>`)
      + panel('This show', `<div class="row wrap"><span class="small muted">Name</span>${input('show.rename', {}, 'name', S.show.name)}<span class="small muted">Sport (stat pop events)</span>${select('show.sport', {}, 'sport', [['', 'from the name'], 'Soccer', 'Football', 'Basketball', 'Lacrosse', 'Hockey', 'Baseball'], S.sport)}</div>`);
  }

  async function setSecurity(url, body) {
    try {
      const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const j = await r.json(); BC.toast(j.ok ? 'Saved' : j.error || 'Not saved');
      if (j.ok && $('pin')) $('pin').value = '';
    } catch (e) { BC.toast('Not saved: ' + e.message); }
  }

  const R = { setup, graphics, ads, music, mixer, stream, layout, companion, shows };
  function render() {
    if (!S) return;
    nav();
    $('title').textContent = 'Master · ' + (PAGES.find((p) => p[0] === page) || [])[2] + ' · ' + S.show.name;
    $('conn').innerHTML = `<span class="dot" style="background:${S.vmix.connected ? '#3FB950' : '#FF6B6B'}"></span>vMix ${S.vmix.connected ? 'connected' : 'offline'}`;
    patch($('page'), R[page]());
  }
  BC.onState((s) => { if (s) { S = s; render(); } });
  BC.connect(); BC.wire();
  window.addEventListener('hashchange', () => { page = location.hash.slice(1) || 'setup'; render(); });

  document.addEventListener('click', (e) => {
    const p = e.target.closest('[data-page]'); if (p) { location.hash = p.dataset.page; return; }
    const gs = e.target.closest('[data-gsel]'); if (gs) { gsel = gs.dataset.gsel; render(); return; }
    const mv = e.target.closest('[data-lay-move]');
    if (mv) {
      const k = mv.dataset.layMove; const L = (S.layout && S.layout[k]) || {}; const order = (L.order && L.order.length ? L.order.slice() : Object.keys(SEC));
      for (const x of Object.keys(SEC)) if (!order.includes(x)) order.push(x);
      const i = order.indexOf(mv.dataset.sec); const j = i + Number(mv.dataset.dir);
      if (j >= 0 && j < order.length) { [order[i], order[j]] = [order[j], order[i]]; cmd('layout.set', { layout: k, order }); }
      return;
    }
    const a = e.target.closest('[data-act]'); if (!a) return;
    const v = (id) => ($(id) ? $(id).value : '');
    switch (a.dataset.act) {
      case 'vmix': { const pw = v('vpass'); cmd('config.set', { vmixHost: v('vhost'), vmixPort: v('vport'), vmixUser: v('vuser'), ...(pw.startsWith('•') ? {} : { vmixPassword: pw }) }); break; }
      case 'pin': setSecurity('/api/pin', { pin: v('pin') }); break;
      case 'pinOff': if (confirm(a.dataset.confirm)) setSecurity('/api/pin', { pin: '' }); break;
      case 'oscAllow': setSecurity('/api/osc-allow', { list: v('oscAllow') }); break;
      case 'drive': cmd('config.set', { driveRoot: v('drive') }); break;
      case 'recdrive': cmd('config.set', { recordDrive: v('recdrive') }); break;
      case 'ose': cmd('ose.set', { url: v('ose') }); break;
      case 'bridge': cmd('bridge.set', { host: v('bhost'), port: v('bport') }); break;
      case 'yt': { const k = v('ytkey'); cmd('youtube.set', { ...(k && !k.startsWith('•') ? { apiKey: k } : {}), channelId: v('ytchan'), videoId: v('ytvid') }); break; }
      case 'fb': cmd('config.set', { oscFeedbackHost: v('fbhost'), oscFeedbackPort: v('fbport') }); break;
      case 'adsBase': cmd('ads.settings', { basePath: v('adsBase') }).then(() => cmd('ads.rescan')); break;
      case 'newBreak': if (v('nbName')) cmd('ads.addBreak', { name: v('nbName'), seconds: Number(v('nbSecs')) || 120 }); break;
      case 'newShow': if (v('newShow')) cmd('show.new', { name: v('newShow'), copyFrom: v('copyFrom') }); break;
      case 'newList': if (v('newList')) cmd('list.set', { name: v('newList'), items: [] }); break;
      case 'saveList': { const t = document.querySelector(`textarea[data-list="${CSS.escape(a.dataset.name)}"]`); cmd('list.set', { name: a.dataset.name, items: t.value }); break; }
      case 'events': cmd('sport.events', { sport: S.graphics.sport, items: v('events') }); break;
      case 'addCh': { const ref = v('addRef'); if (ref) cmd('mix.add', { ref, name: v('addName') || undefined }); break; }
      case 'addBucket': case 'addSponsor': case 'delBucket': case 'delSponsor': case 'saveFolders': {
        const buckets = [...document.querySelectorAll('[data-bucket]')].map((r) => ({ name: r.querySelector('[data-f=name]').value, seconds: r.querySelector('[data-f=seconds]').value }));
        const sponsors = [...document.querySelectorAll('[data-sponsor]')].map((r) => ({ name: r.querySelector('[data-f=name]').value, every: r.querySelector('[data-f=every]').value, oncePerGame: r.querySelector('[data-f=oncePerGame]').checked, inBuckets: r.querySelector('[data-f=inBuckets]').checked }));
        if (a.dataset.act === 'addBucket') buckets.push({ name: prompt('Bucket folder name (inside the Ads folder):', '45Second') || '', seconds: Number(prompt('Nominal length in seconds:', '45')) || 45 });
        if (a.dataset.act === 'addSponsor') sponsors.push({ name: prompt('Sponsor folder (e.g. Sponsors\\Booster Club):', 'Sponsors\\') || '', every: 0, oncePerGame: true });
        if (a.dataset.act === 'delBucket') buckets.splice(Number(a.dataset.i), 1);
        if (a.dataset.act === 'delSponsor') sponsors.splice(Number(a.dataset.i), 1);
        cmd('ads.folders', { folders: buckets, looseFolder: v('loose'), sponsorFolders: sponsors }); break;
      }
      default: break;
    }
  });
  document.addEventListener('change', (e) => {
    const el = e.target;
    if (el.dataset.block) cmd('health.blocks', { blocks: [...document.querySelectorAll('[data-block]')].filter((x) => x.checked).map((x) => x.dataset.block) });
    if (el.dataset.lay) {
      const k = el.dataset.lay; const L = (S.layout && S.layout[k]) || {};
      const set = new Set(el.dataset.what === 'show' ? L.hidden || [] : L.open || []);
      const want = el.dataset.what === 'show' ? !el.checked : el.checked;
      if (want) set.add(el.dataset.sec); else set.delete(el.dataset.sec);
      cmd('layout.set', { layout: k, [el.dataset.what === 'show' ? 'hidden' : 'open']: [...set] });
    }
  });
})();
