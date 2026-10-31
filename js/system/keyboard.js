/* ============================================================
   Universe OS · 系统层 · keyboard.js
   全局快捷键：Ctrl/Cmd+Space 启动台、Esc 层级退出、Alt+Tab 循环、
   Alt+Q 关闭、Alt+M 最小化
   ============================================================ */
(function (G) {
  'use strict';
  const NS = (G.UniverOS = G.UniverOS || {});
  NS.system = NS.system || {};

  /* 监听挂在 document 而非 window：真实键盘事件经 document 冒泡可达，
     自动化注入（window/document.dispatchEvent）也都覆盖，兼容性更稳 */
  document.addEventListener('keydown', function (e) {
    /* 键位说明（实体键盘实测结论）：
       Win/Ctrl+Space → 被 Windows 输入法占用（切中英文），页面收不到
       Alt+Space      → 被系统窗口菜单占用
       Ctrl+Tab       → 被浏览器标签页占用
       Alt+Tab / Ctrl+Alt+Tab / Win+Tab → 被系统任务切换占用
       因此全部改用下方这些无冲突组合（浏览器、Windows、输入法均不占用）。 */
    if (e.ctrlKey && e.altKey && e.code === 'Space') { e.preventDefault(); NS.system.spotlight.toggle(); return; }   /* Ctrl+Alt+Space → Spotlight */
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.code === 'Space') { e.preventDefault(); NS.system.launcher.toggleLauncher(); return; }   /* Ctrl+Shift+Space → 启动台 */
    if (e.key === 'Escape') {
      if (NS.system.spotlight.isOpen) { NS.system.spotlight.close(); return; }
      if (NS.system.launcher.launcherOpen) { NS.system.launcher.closeLauncher(); return; }
      if (NS.render.menu.isMenuOpen()) { NS.render.menu.hideMenu(); return; }
      if (NS.system.winman.activeWin && NS.system.winman.activeWin.fullscreen) { NS.system.winman.exitFullscreen(NS.system.winman.activeWin); return; }
      return;
    }
    /* Alt+`(反引号) → App 切换器（Windows 无占用）；Tab 系组合保留为尽力路径，实体键盘上可能被系统抢 */
    if (e.altKey && e.code === 'Backquote') { e.preventDefault(); NS.system.winman.openSwitcher(e.shiftKey); return; }
    if (e.ctrlKey && e.altKey && e.key === 'Tab') { e.preventDefault(); NS.system.winman.openSwitcher(e.shiftKey); return; }
    if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key === 'Tab') { e.preventDefault(); NS.system.winman.openSwitcher(e.shiftKey); return; }
    if (e.altKey && e.key === 'Tab') { e.preventDefault(); NS.system.winman.openSwitcher(e.shiftKey); return; }
    if (e.ctrlKey && e.altKey && e.code === 'KeyQ') { e.preventDefault(); const w = NS.system.winman.activeWin || (NS.system.winman.wins[NS.system.winman.wins.length - 1] || null); if (w) NS.system.winman.closeWin(w); return; }   /* Ctrl+Alt+Q → 关闭窗口（activeWin 为空时关最上层窗口；Alt+字母 会被浏览器菜单栏吞掉） */
    if (e.ctrlKey && e.altKey && e.code === 'KeyM') { e.preventDefault(); const w = NS.system.winman.activeWin || (NS.system.winman.wins[NS.system.winman.wins.length - 1] || null); if (w) NS.system.winman.minimizeWin(w); return; }   /* Ctrl+Alt+M → 最小化窗口 */
  });
})(window);
