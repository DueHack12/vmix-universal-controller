'use strict';
/**
 * YouTube live check + viewers (YouTube Data API v3 with an API key, read-only public data).
 *  - While vMix is streaming, look for the channel's live video (search, at most every 5 min)
 *    or use a video ID/URL pasted on the Master page.
 *  - Every 30 s: videos?part=liveStreamingDetails -> live / ended + concurrentViewers.
 * Quota: search = 100 units, videos = 1 unit; a 3-hour game uses well under the free 10,000/day.
 */
const https = require('https');
const http = require('http');

function getJson(url, timeout = 8000) {
  return new Promise((resolve, reject) => {
    const req = (url.startsWith('http:') ? http : https).get(url, { timeout }, (res) => {
      let b = ''; res.setEncoding('utf8');
      res.on('data', (d) => (b += d));
      res.on('end', () => { try { const j = JSON.parse(b); if (res.statusCode !== 200) reject(new Error((j.error && j.error.message) || 'HTTP ' + res.statusCode)); else resolve(j); } catch (e) { reject(e); } });
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
  });
}
function videoIdFrom(s) {
  const t = String(s || '').trim();
  const m = t.match(/(?:v=|youtu\.be\/|\/live\/|\/shorts\/|\/embed\/)([A-Za-z0-9_-]{11})/);
  if (m) return m[1];
  return /^[A-Za-z0-9_-]{11}$/.test(t) ? t : '';
}

module.exports = (engine) => {
  const cfg = () => engine.store.config.youtube || (engine.store.config.youtube = { apiKey: '', channelId: '', videoId: '' });
  const api = () => engine.store.config.youtubeApiBase || 'https://www.googleapis.com/youtube/v3';
  let st = { live: false, viewers: null, peak: 0, videoId: '', title: '', error: '', checked: 0, startedAt: '' };
  let lastSearch = 0; let timer = null; let busy = false; let running = null;

  function check() {
    if (running) return running;
    running = doCheck().finally(() => { running = null; });
    return running;
  }
  async function doCheck() {
    const c = cfg(); if (!c.apiKey || busy) return;
    busy = true;
    try {
      let id = videoIdFrom(c.videoId) || st.videoId;
      const streaming = !!(engine.snap && engine.snap.streaming);
      if (!videoIdFrom(c.videoId) && c.channelId && (streaming || !id) && (!id || !st.live) && Date.now() - lastSearch > 5 * 60000) {
        lastSearch = Date.now();
        const s = await getJson(`${api()}/search?part=snippet&channelId=${encodeURIComponent(c.channelId)}&eventType=live&type=video&maxResults=1&key=${encodeURIComponent(c.apiKey)}`);
        if (s.items && s.items[0]) id = s.items[0].id.videoId;
      }
      if (!id) { st = { ...st, live: false, viewers: null, videoId: '', error: streaming ? 'vMix is streaming but YouTube shows no live video yet' : '', checked: Date.now() }; return; }
      const v = await getJson(`${api()}/videos?part=liveStreamingDetails,snippet&id=${encodeURIComponent(id)}&key=${encodeURIComponent(c.apiKey)}`);
      const item = v.items && v.items[0];
      const d = item && item.liveStreamingDetails;
      const live = !!(d && d.actualStartTime && !d.actualEndTime);
      const viewers = d && d.concurrentViewers !== undefined ? Number(d.concurrentViewers) : null;
      st = { live, viewers, peak: Math.max(st.videoId === id ? st.peak : 0, viewers || 0), videoId: id, title: item ? item.snippet.title : '', error: item ? '' : 'Video not found', checked: Date.now(), startedAt: d ? d.actualStartTime || '' : '' };
    } catch (e) { st = { ...st, error: e.message, checked: Date.now() }; }
    finally { busy = false; engine.changed(); }
  }

  engine.cmd('youtube.set', ({ apiKey, channelId, videoId }) => {
    const c = cfg();
    if (apiKey !== undefined) c.apiKey = String(apiKey).trim();
    if (channelId !== undefined) c.channelId = String(channelId).trim();
    if (videoId !== undefined) { c.videoId = String(videoId).trim(); st.videoId = ''; }
    engine.store.saveConfig(); lastSearch = 0; check(); return { ok: true };
  });
  engine.cmd('youtube.check', async () => { lastSearch = 0; await check(); return { ok: !st.error, error: st.error || undefined }; });

  return {
    name: 'youtube',
    init() { timer = setInterval(check, 30000); timer.unref(); setTimeout(check, 2000).unref(); },
    stop() { clearInterval(timer); },
    state() {
      const c = cfg();
      return { configured: !!c.apiKey, channelId: c.channelId, videoIdSetting: c.videoId, ...st, ageSecs: st.checked ? Math.round((Date.now() - st.checked) / 1000) : null, watchUrl: st.videoId ? 'https://youtube.com/watch?v=' + st.videoId : '' };
    },
  };
};
module.exports.videoIdFrom = videoIdFrom;
