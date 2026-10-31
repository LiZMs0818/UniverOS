/* ============================================================
   Universe OS · 系统层 · control-center.js
   控制中心：Wi-Fi/蓝牙/勿扰/深色切换、亮度/音量滑块
   ============================================================ */
(function (G) {
  'use strict';
  const NS = (G.UniverOS = G.UniverOS || {});
  NS.system = NS.system || {};
  const $ = NS.core.utils.$;

  const ccEl = $('#control-center');
  let ccOpen = false;

  function toggleControlCenter() {
    ccOpen = !ccOpen;
    ccEl.classList.toggle('open', ccOpen);
  }

  const sbControl = $('#sbControl');
  if (sbControl) sbControl.addEventListener('click', function (e) {
    e.stopPropagation();
    toggleControlCenter();
  });

  document.addEventListener('pointerdown', function (e) {
    if (!ccOpen) return;
    if (e.target.closest('#control-center') || e.target.closest('#sbControl')) return;
    ccOpen = false;
    ccEl.classList.remove('open');
  }, true);

  const ccState = {
    wifi: true, bluetooth: false, dnd: false, dark: NS.core.theme.colorMode === 'dark'
  };
  function syncCCUI() {
    ccEl.querySelectorAll('[data-cc]').forEach(tile => {
      const k = tile.dataset.cc;
      const active = (k === 'dark') ? (NS.core.theme.colorMode === 'dark') : ccState[k];
      tile.classList.toggle('active', active);
    });
    $('#ccWifiSub').textContent = ccState.wifi ? '已连接' : '关闭';
    $('#ccBtSub').textContent = ccState.bluetooth ? '开启' : '关闭';
    $('#ccDndSub').textContent = ccState.dnd ? '开启' : '关闭';
    $('#ccDarkSub').textContent = NS.core.theme.colorMode === 'dark' ? '开启' : '关闭';
  }
  ccEl.querySelectorAll('[data-cc]').forEach(tile => {
    tile.addEventListener('click', () => {
      const k = tile.dataset.cc;
      if (k === 'dark') NS.core.theme.applyColorMode(NS.core.theme.colorMode === 'dark' ? 'light' : 'dark');
      else ccState[k] = !ccState[k];
      syncCCUI();
    });
  });
  const ccBrightness = $('#ccBrightness');
  if (ccBrightness) ccBrightness.addEventListener('input', function (e) {
    const v = e.target.value;
    document.documentElement.style.filter = 'brightness(' + (v / 100) + ')';
  });
  const ccVolume = $('#ccVolume');
  if (ccVolume) ccVolume.addEventListener('input', function () {});

  syncCCUI();

  NS.system.controlCenter = { toggleControlCenter, ccOpen, syncCCUI };
})(window);
