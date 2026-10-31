/* ============================================================
   Universe OS · 系统层 · core/config.js
   常量配置：壁纸、文件模板、桌面网格、默认桌面/Dock 布局
   ============================================================ */
(function (G) {
  'use strict';
  const NS = (G.UniverOS = G.UniverOS || {});
  NS.core = NS.core || {};

  const Config = {
    WALLPAPERS: [
      'radial-gradient(120% 120% at 15% 8%, #4a3aff 0%, #1a1040 45%, #06030f 100%)',
      'radial-gradient(120% 120% at 82% 12%, #ff5f6d 0%, #7a1a4a 45%, #12040c 100%)',
      'linear-gradient(135deg,#0f2027 0%,#203a43 45%,#2c5364 100%)',
      'radial-gradient(110% 120% at 20% 82%, #00d2ff 0%, #1b3fa0 45%, #05060f 100%)',
      'radial-gradient(120% 120% at 72% 28%, #f7b733 0%, #b5471e 42%, #1a0c05 100%)',
      'radial-gradient(120% 120% at 30% 20%, #8e2de2 0%, #4a00e0 50%, #05010f 100%)',
      'radial-gradient(120% 120% at 60% 80%, #11998e 0%, #0d3b4a 45%, #04080a 100%)',
      'linear-gradient(135deg,#f5f6fa 0%,#e6e9f0 100%)',
      'linear-gradient(135deg,#ffecd2 0%,#fcb69f 100%)'
    ],
    /* 壁纸亮度：0=深色壁纸(桌面文字用白) 1=浅色壁纸(桌面文字用黑)，与 WALLPAPERS 一一对应 */
    WP_BRIGHT: [0, 0, 0, 0, 0, 0, 0, 1, 1],

    FILE_TEMPLATES: {
      txt: '',
      md: '# 新文档\n\n',
      html: '<!DOCTYPE html>\n<html lang="zh-CN">\n<head>\n<meta charset="UTF-8">\n<meta name="viewport" content="width=device-width,initial-scale=1">\n<title>新文档</title>\n</head>\n<body>\n\n</body>\n</html>\n',
      json: '{\n  \n}\n',
      js: '// 新文件\n',
      css: '/* 新样式 */\n',
      svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">\n\n</svg>\n'
    },

    /* 桌面图标网格 */
    GRID: { cw: 100, ch: 112, padX: 20, padY: 34, cols: 6, rows: 4 },

    DEFAULT_DESKTOP: function () {
      return [
        { appId: 'files', col: 0, row: 0 },
        { appId: 'browser', col: 1, row: 0 },
        { appId: 'clock', col: 2, row: 0 }
      ];
    },
    DEFAULT_DOCK: ['settings', 'calculator', 'notes', 'files']
  };

  NS.core.config = Config;
})(window);
