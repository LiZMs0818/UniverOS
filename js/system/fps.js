/* ============================================================
   Universe OS · 系统层 · fps.js
   FPS 计数器（开发者选项）
   ============================================================ */
(function (G) {
  'use strict';
  const NS = (G.UniverOS = G.UniverOS || {});
  NS.system = NS.system || {};

  let fpsRunning = false, fpsFrames = 0, fpsLast = performance.now(), fpsEl = null;

  function startFpsCounter() {
    if (fpsRunning) return;
    fpsRunning = true;
    fpsFrames = 0;
    fpsLast = performance.now();
    if (!fpsEl) {
      fpsEl = document.createElement('div');
      fpsEl.style.cssText = 'position:fixed;right:20px;bottom:20px;z-index:99999;padding:6px 12px;border-radius:10px;background:rgba(16,18,24,.72);backdrop-filter:blur(14px);color:#7dffb4;font-size:11px;font-variant-numeric:tabular-nums;font-weight:600;pointer-events:none';
      document.body.appendChild(fpsEl);
    }
    function tick(now) {
      if (!fpsRunning) return;
      fpsFrames++;
      if (now - fpsLast >= 500) {
        fpsEl.textContent = Math.round(fpsFrames * 1000 / (now - fpsLast)) + ' FPS';
        fpsFrames = 0;
        fpsLast = now;
      }
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }
  function stopFpsCounter() {
    fpsRunning = false;
    if (fpsEl) fpsEl.textContent = '—';
  }

  NS.system.fps = { startFpsCounter, stopFpsCounter };
})(window);
