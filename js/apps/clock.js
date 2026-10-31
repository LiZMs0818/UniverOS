/* ============================================================
   Universe OS · 软件层 · clock.js
   时钟（声明式 Component + 全局 200ms 时钟刷新，行为与原版一致：
   所有 [data-clock]/[data-date]/[data-ring] 由全局 interval 驱动）
   ============================================================ */
(function (G) {
  'use strict';
  const NS = (G.UniverOS = G.UniverOS || {});
  NS.apps = NS.apps || {};
  const h = NS.render.h;
  const Component = NS.render.Component;

  class ClockApp extends Component {
    render() {
      return h('div', { className: 'clock' }, [
        h('div', { className: 'clock-ring', dataset: { ring: '' } }, [
          h('div', { className: 'clock-ring-inner' }, '秒')
        ]),
        h('div', { className: 'clock-time', dataset: { clock: '' } }, '--:--:--'),
        h('div', { className: 'clock-date', dataset: { date: '' } })
      ]);
    }
  }

  setInterval(function () {
    const now = new Date();
    $$('[data-clock]').forEach(el => { el.textContent = now.toLocaleTimeString('zh-CN', { hour12: false }); });
    $$('[data-date]').forEach(el => { el.textContent = now.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' }); });
    $$('[data-ring]').forEach(el => {
      const s = now.getSeconds() + now.getMilliseconds() / 1000;
      el.style.background = 'conic-gradient(#5ac8fa ' + (s / 60 * 360) + 'deg, rgba(128,128,128,.15) 0deg)';
    });
  }, 200);

  NS.apps.ClockApp = ClockApp;
  NS.apps.buildClock = body => new ClockApp().mount(body);
})(window);
