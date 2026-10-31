/* ============================================================
   Universe OS · 系统层 · core/theme.js
   主题状态：颜色模式、强制横屏、壁纸索引（状态为活引用）
   ============================================================ */
(function (G) {
  'use strict';
  const NS = (G.UniverOS = G.UniverOS || {});
  NS.core = NS.core || {};
  const store = NS.core.store;

  const theme = {
    colorMode: store.get('colorMode', 'dark'),
    forcedLandscape: store.get('forcedLandscape', false),
    wpIndex: store.get('wallpaper', 0)
  };

  function applyColorMode(m) {
    theme.colorMode = m;
    store.set('colorMode', m);
    document.documentElement.dataset.mode = m;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', m === 'light' ? '#f5f6fa' : '#0b0b12');
    /* 壁纸不随模式切换；壳层文字对比色由壁纸亮度决定（见 applyWallpaper） */
  }

  function applyForcedLandscape() {
    document.documentElement.classList.toggle('forced-landscape', theme.forcedLandscape);
  }

  function applyWallpaper() {
    const el = document.getElementById('wallpaper');
    if (!el) return;
    const list = NS.core.config.WALLPAPERS;
    el.style.background = list[theme.wpIndex % list.length];
    applyWpContrast();
  }

  /* 根据当前壁纸亮度设置壳层文字对比：深色壁纸 → 白字，浅色壁纸 → 黑字 */
  function applyWpContrast() {
    const bright = NS.core.config.WP_BRIGHT[theme.wpIndex % NS.core.config.WP_BRIGHT.length];
    document.documentElement.dataset.wp = bright ? 'light' : 'dark';
  }

  applyColorMode(theme.colorMode);
  applyForcedLandscape();

  /* 把活状态对象挂到命名空间：theme.colorMode / theme.forcedLandscape / theme.wpIndex 始终可读写 */
  NS.core.theme = theme;
  theme.applyColorMode = applyColorMode;
  theme.applyForcedLandscape = applyForcedLandscape;
  theme.applyWallpaper = applyWallpaper;
  theme.applyWpContrast = applyWpContrast;
})(window);
