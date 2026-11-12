'use strict';
/**
 * Stream health (Phase 1): vMix link, streaming, recording + time, record-drive space,
 * this PC's CPU, program audio level with a silence alarm, and linked sources present.
 * YouTube checks come in Phase 3.
 */
const fs = require('fs');
const os = require('os');

module.exports = (engine) => {
  let cpu = 0; let lastCpu = null;
  let silentSince = 0; let disk = null; let lastDisk = 0;

  function sampleCpu() {
    const t = os.cpus().reduce((a, c) => { for (const k in c.times) a[k] = (a[k] || 0) + c.times[k]; return a; }, {});
    if (lastCpu) {
      const idle = t.idle - lastCpu.idle;
      const total = Object.keys(t).reduce((s, k) => s + (t[k] - (lastCpu[k] || 0)), 0);
      cpu = total > 0 ? Math.round(100 * (1 - idle / total)) : 0;
    }
    lastCpu = t;
  }
  function sampleDisk() {
    lastDisk = Date.now();
    const drive = engine.store.config.recordDrive || (process.platform === 'win32' ? 'C:\\' : '/');
    try {
      if (!fs.statfsSync) { disk = null; return; }
      const s = fs.statfsSync(drive);
      disk = { drive, freeGB: Math.round((s.bavail * s.bsize) / 1e9), totalGB: Math.round((s.blocks * s.bsize) / 1e9) };
    } catch { disk = null; }
  }
  let timer = null;

  return {
    name: 'health',
    init() { sampleCpu(); timer = setInterval(sampleCpu, 2000); timer.unref(); },
    stop() { clearInterval(timer); },
    onPoll(snap) {
      if (Date.now() - lastDisk > 30000) sampleDisk();
      const m = snap.audio && snap.audio.master;
      const lvl = m ? Math.max(m.meterF1, m.meterF2) : 0;
      if (lvl > 0.003) silentSince = 0; else if (!silentSince) silentSince = Date.now();
    },
    state() {
      const s = engine.snap; const c = engine.vmix.connected;
      const m = s && s.audio && s.audio.master;
      const lvl = m ? Math.max(m.meterF1, m.meterF2) : 0;
      const silentSecs = silentSince ? Math.floor((Date.now() - silentSince) / 1000) : 0;
      const jobs = engine.features.links.state().jobs;
      const sources = { total: jobs.length, ok: jobs.filter((j) => j.status === 'ok' || j.status === 'guess').length };
      const recHours = disk ? Math.round((disk.freeGB / 20) * 10) / 10 : null; // ~20 GB/hour for a typical 1080p MP4 record
      const alerts = [];
      if (!c) alerts.push('vMix not connected');
      if (c && s.streaming && silentSecs >= 5) alerts.push('No program audio for ' + silentSecs + ' s');
      if (c && s.streaming && !s.recording) alerts.push('Streaming but NOT recording');
      if (recHours !== null && s && s.recording && recHours < 1) alerts.push('Record drive under 1 hour left');
      const yt = engine.features.youtube && engine.features.youtube.state();
      if (yt && yt.configured && c && s.streaming && !yt.live && yt.checked && engine.vmix.connected) alerts.push('YouTube does not show the stream as live');
      if (sources.ok < sources.total) alerts.push((sources.total - sources.ok) + ' linked input(s) missing');
      return {
        ok: alerts.length === 0, alerts,
        vmix: c, streaming: !!(s && s.streaming), recording: !!(s && s.recording), recordingSecs: s ? s.recordingDuration : 0,
        disk, recHours, cpu, audioDb: lvl > 0 ? Math.round(20 * Math.log10(lvl)) : -99, silentSecs, sources,
        blocks: engine.show.health.blocks,
      };
    },
  };
};
