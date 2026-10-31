/* ============================================================
   Universe OS · 渲染层 · svg-icons.js
   图标注册表：应用图标（8 个）+ 设置侧栏图标（8 个），与原版逐字节一致
   ============================================================ */
(function (G) {
  'use strict';
  const NS = (G.UniverOS = G.UniverOS || {});
  NS.render = NS.render || {};

  const wrap = inner => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' + inner + '</svg>';

  NS.render.icons = {
    /* 应用图标 */
    APPS: {
      settings: wrap('<circle cx="12" cy="12" r="3.1"/><path d="M19.4 14.6a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1.08-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1.08 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>'),
      calculator: wrap('<rect x="4.5" y="2.5" width="15" height="19" rx="2.5"/><path d="M8 7h8"/><circle cx="8.2" cy="12" r=".9" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r=".9" fill="currentColor" stroke="none"/><circle cx="15.8" cy="12" r=".9" fill="currentColor" stroke="none"/><circle cx="8.2" cy="15.6" r=".9" fill="currentColor" stroke="none"/><circle cx="12" cy="15.6" r=".9" fill="currentColor" stroke="none"/><circle cx="15.8" cy="15.6" r=".9" fill="currentColor" stroke="none"/><circle cx="8.2" cy="19" r=".9" fill="currentColor" stroke="none"/><circle cx="12" cy="19" r=".9" fill="currentColor" stroke="none"/><circle cx="15.8" cy="19" r=".9" fill="currentColor" stroke="none"/>'),
      notes: wrap('<path d="M5.5 3h10L19 6.5V20a1 1 0 0 1-1 1H5.5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/><path d="M15.5 3v3.5H19"/><path d="M8.5 11h7M8.5 14.5h7M8.5 18h4.5"/>'),
      clock: wrap('<circle cx="12" cy="12" r="8.5"/><path d="M12 7.2V12l3.2 2"/>'),
      browser: wrap('<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17"/><path d="M12 3.5c2.2 2.4 3.3 5.4 3.3 8.5s-1.1 6.1-3.3 8.5c-2.2-2.4-3.3-5.4-3.3-8.5S9.8 5.9 12 3.5z"/>'),
      files: wrap('<path d="M3.5 6.5A1.5 1.5 0 0 1 5 5h4.6l1.9 2h7.5A1.5 1.5 0 0 1 20.5 8.5v9A1.5 1.5 0 0 1 19 19H5a1.5 1.5 0 0 1-1.5-1.5z"/>'),
      texteditor: wrap('<path d="M5.5 3h10L19 6.5V20a1 1 0 0 1-1 1H5.5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/><path d="M15.5 3v3.5H19"/>'),
      imageviewer: wrap('<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="m4 17 5-5 4 4 3-3 4 4"/>')
    },

    /* 设置侧栏导航图标 */
    NAV: {
      appearance: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/>',
      storage: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v6c0 1.66 3.58 3 8 3s8-1.34 8-3V5M4 11v6c0 1.66 3.58 3 8 3s8-1.34 8-3v-6"/>',
      display: '<rect x="3" y="4" width="18" height="14" rx="2"/><path d="M8 21h8M12 18v3"/>',
      files: '<path d="M3.5 6.5A1.5 1.5 0 0 1 5 5h4.6l1.9 2h7.5A1.5 1.5 0 0 1 20.5 8.5v9A1.5 1.5 0 0 1 19 19H5a1.5 1.5 0 0 1-1.5-1.5z"/>',
      notes: '<path d="M5.5 3h10L19 6.5V20a1 1 0 0 1-1 1H5.5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/><path d="M8.5 11h7M8.5 14.5h7M8.5 18h4.5"/>',
      default: '<circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 1 0 18M3 12h18"/>',
      developer: '<path d="M6 10l-4 2 4 2M18 10l4 2-4 2M14 4l-4 16"/>',
      about: '<circle cx="12" cy="12" r="9"/><path d="M12 8h.01M11 12h1v5h1"/>'
    },

    /* 通用 UI 图标（线性描边，供文件/备忘录/浏览器/控制中心等使用） */
    UI: {
      home: wrap('<path d="M4 11.5 12 4l8 7.5"/><path d="M6.5 10v9.5h11V10"/>'),
      download: wrap('<path d="M12 4v11"/><path d="m7 11 5 5 5-5"/><path d="M4.5 19.5h15"/>'),
      note: wrap('<path d="M5.5 3.5h13a1 1 0 0 1 1 1v15a1 1 0 0 1-1 1h-13a1 1 0 0 1-1-1v-15a1 1 0 0 1 1-1z"/><path d="M8.5 8h7M8.5 11.5h7M8.5 15h4"/>'),
      doc: wrap('<path d="M6 3.5h8l4 4V20a.5.5 0 0 1-.5.5h-11A.5.5 0 0 1 6 20V4a.5.5 0 0 1 .5-.5z"/><path d="M14 3.5v4h4"/>'),
      pen: wrap('<path d="M12 20h9"/><path d="M16.5 3.8a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>'),
      eraser: wrap('<path d="m7 20 11.5-11.5a2.8 2.8 0 0 0-4-4L3 15.5A2.8 2.8 0 0 0 7 20z"/><path d="M7 20h13"/>'),
      undo: wrap('<path d="M9 7 4 12l5 5"/><path d="M4 12h11a5 5 0 0 1 5 5v.5"/>'),
      globe: wrap('<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17"/><path d="M12 3.5c2.2 2.4 3.3 5.4 3.3 8.5s-1.1 6.1-3.3 8.5c-2.2-2.4-3.3-5.4-3.3-8.5S9.8 5.9 12 3.5z"/>'),
      grid: wrap('<rect x="4" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5"/>'),
      list: wrap('<path d="M8.5 6h11M8.5 12h11M8.5 18h11"/><circle cx="4.5" cy="6" r=".9" fill="currentColor" stroke="none"/><circle cx="4.5" cy="12" r=".9" fill="currentColor" stroke="none"/><circle cx="4.5" cy="18" r=".9" fill="currentColor" stroke="none"/>'),
      sun: wrap('<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5 5l1.4 1.4M17.6 17.6 19 19M19 5l-1.4 1.4M6.4 17.6 5 19"/>'),
      volume: wrap('<path d="M4 9.5h3l4-3.5v12l-4-3.5H4z"/><path d="M15.5 9.2a3.8 3.8 0 0 1 0 5.6"/>'),
      import: wrap('<path d="M12 14V4"/><path d="m7.5 8.5 4.5-4.5 4.5 4.5"/><path d="M4.5 14.5v4.5h15v-4.5"/>'),
      trash: wrap('<path d="M4.5 6.5h15"/><path d="M9 6.5V4.5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/><path d="M6.5 6.5 7.3 20a1 1 0 0 0 1 .9h7.4a1 1 0 0 0 1-.9l.8-13.5"/>'),
      folder: wrap('<path d="M3.5 6.5A1.5 1.5 0 0 1 5 5h4.6l1.9 2h7.5A1.5 1.5 0 0 1 20.5 8.5v9A1.5 1.5 0 0 1 19 19H5a1.5 1.5 0 0 1-1.5-1.5z"/>'),
      plus: wrap('<path d="M12 5v14M5 12h14"/>'),
      left: wrap('<path d="M15 5l-7 7 7 7"/>'),
      right: wrap('<path d="m9 5 7 7-7 7"/>'),
      refresh: wrap('<path d="M20.5 12a8.5 8.5 0 1 1-2.4-5.9"/><path d="M20.5 3.5V8H16"/>'),
      search: wrap('<circle cx="10.5" cy="10.5" r="6.5"/><path d="m20 20-4.5-4.5"/>')
    }
  };
})(window);
