/* ============================================================
   Universe OS · 软件层 · registry.js
   应用注册表：可见/隐藏、多实例、图标、渐变、构建器
   build 在运行时才调用（应用类在后续文件定义），窗口管理器通过它挂载应用
   ============================================================ */
(function (G) {
  'use strict';
  const NS = (G.UniverOS = G.UniverOS || {});
  NS.apps = NS.apps || {};
  const I = NS.render.icons.APPS;

  const APPS = {
    settings: {
      id: 'settings', name: '设置', withSidebar: true, icon: I.settings,
      bg: 'linear-gradient(150deg,#9a9aa4,#48484f)', fg: '#fff',
      build: (body, sidebar) => new NS.apps.SettingsApp().mount(body, sidebar)
    },
    calculator: {
      id: 'calculator', name: '计算器', icon: I.calculator,
      bg: 'linear-gradient(150deg,#ffb340,#f07a00)', fg: '#fff',
      build: (body) => new NS.apps.CalculatorApp().mount(body)
    },
    notes: {
      id: 'notes', name: '备忘录', withSidebar: true, icon: I.notes,
      bg: 'linear-gradient(150deg,#ffe27a,#f5c518)', fg: '#5c4300',
      build: (body, sidebar) => new NS.apps.NotesApp().mount(body, sidebar)
    },
    clock: {
      id: 'clock', name: '时钟', icon: I.clock,
      bg: 'linear-gradient(150deg,#4a4a54,#17171c)', fg: '#fff',
      build: (body) => new NS.apps.ClockApp().mount(body)
    },
    browser: {
      id: 'browser', name: '浏览器', withSidebar: true, icon: I.browser,
      bg: 'linear-gradient(150deg,#5ac8fa,#0a84ff)', fg: '#fff',
      build: (body, sidebar) => new NS.apps.BrowserApp().mount(body, sidebar)
    },
    files: {
      id: 'files', name: '文件', withSidebar: true, icon: I.files,
      bg: 'linear-gradient(150deg,#5a8bff,#3a5bd9)', fg: '#fff',
      build: (body, sidebar) => new NS.apps.FilesApp().mount(body, sidebar)
    },
    texteditor: {
      id: 'texteditor', name: '文本编辑', hidden: true, multi: true, icon: I.texteditor,
      bg: 'linear-gradient(150deg,#9a9aa4,#48484f)', fg: '#fff',
      build: (body, args) => new NS.apps.TextEditorApp({ path: args && args.path }).mount(body)
    },
    imageviewer: {
      id: 'imageviewer', name: '图片', hidden: true, multi: true, icon: I.imageviewer,
      bg: 'linear-gradient(150deg,#e26ff0,#9c27b0)', fg: '#fff',
      build: (body, args) => new NS.apps.ImageViewerApp({ path: args && args.path }).mount(body)
    },
    trash: {
      id: 'trash', name: '废纸篓', hidden: true, icon: NS.render.icons.UI.trash,
      bg: 'linear-gradient(150deg,#8e8e98,#3a3a42)', fg: '#fff',
      build: (body) => new NS.apps.TrashApp().mount(body)
    }
  };

  NS.apps.APPS = APPS;
})(window);
