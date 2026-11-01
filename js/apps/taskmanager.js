/* ============================================================
   Universe OS · 软件层 · taskmanager.js
   任务管理器（Activity Monitor 风格）：系统进程 + 窗口进程列表
   CPU 为实时模拟值，内存显示系统配额真实用量；应用进程可「结束」关闭
   ============================================================ */
(function (G) {
  'use strict';
  const NS = (G.UniverOS = G.UniverOS || {});
  NS.apps = NS.apps || {};
  const h = NS.render.h;
  const Component = NS.render.Component;
  const UI = NS.render.icons.UI;

  const SYS_PROCS = [
    { key: 'statusbar', name: '菜单栏', pid: 1, icon: UI.list },
    { key: 'dock', name: 'Dock', pid: 2, icon: UI.grid },
    { key: 'desktop', name: '桌面', pid: 3, icon: UI.home },
    { key: 'center', name: '控制中心', pid: 4, icon: UI.sun }
  ];

  const cpuMap = {};
  function simCpu(key, base) {
    if (cpuMap[key] == null) cpuMap[key] = base;
    cpuMap[key] = Math.max(0.5, Math.min(99.5, cpuMap[key] + (Math.random() - 0.5) * 16));
    return cpuMap[key];
  }
  function fmtMem(b) {
    if (!b) return '—';
    return (b / 1024 / 1024).toFixed(0) + ' MB';
  }

  class TaskManagerApp extends Component {
    componentDidMount() {
      this._mem = 0;
      const refresh = () => { NS.core.fs.usage().then(u => { this._mem = u.used; }).catch(() => {}); };
      refresh();
      this._t = setInterval(() => { refresh(); this.setState({ tick: Date.now() }); }, 1500);
    }
    componentWillUnmount() { clearInterval(this._t); }

    render() {
      const winman = NS.system.winman;
      const wins = (winman && winman.wins) || [];
      const rows = [];
      SYS_PROCS.forEach(p => rows.push({
        key: p.key, name: p.name, pid: p.pid, icon: p.icon, sys: true,
        cpu: simCpu(p.key, 2), w: null
      }));
      wins.forEach((w, i) => {
        const app = NS.apps.APPS[w.appId] || {};
        const icon = NS.render.icons.APPS[w.appId] || UI.default;
        rows.push({
          key: 'win' + i, name: app.name || w.appId, pid: 100 + i, icon, sys: false,
          cpu: simCpu('win' + i, 8), w
        });
      });
      let total = rows.reduce((s, r) => s + r.cpu, 0);
      total = Math.min(100, total * 0.6 + Math.random() * 8);
      const now = new Date().toLocaleTimeString('zh-CN', { hour12: false });
      return h('div', { className: 'tm' }, [
        h('div', { className: 'tm-head' }, [
          h('div', { className: 'tm-stats' }, [
            h('span', { className: 'tm-stat' }, 'CPU  ' + Math.round(total) + '%'),
            h('span', { className: 'tm-stat' }, '内存  ' + fmtMem(this._mem)),
            h('span', { className: 'tm-dim' }, '更新于 ' + now)
          ])
        ]),
        h('div', { className: 'tm-table' }, [
          h('div', { className: 'tm-row tm-th' }, [
            h('span', { className: 'tm-c-name' }, '进程'),
            h('span', { className: 'tm-c-cpu' }, 'CPU'),
            h('span', { className: 'tm-c-mem' }, '内存'),
            h('span', { className: 'tm-c-act' }, '')
          ]),
          rows.map(r => h('div', { className: 'tm-row' + (r.sys ? ' tm-sys' : '') }, [
            h('span', { className: 'tm-c-name' }, [
              h('span', { className: 'tm-ic', html: r.icon }),
              h('span', { className: 'tm-nm' }, r.name),
              h('span', { className: 'tm-pid' }, 'PID ' + r.pid)
            ]),
            h('span', { className: 'tm-c-cpu' }, [
              h('span', { className: 'tm-bar' }, [
                h('span', { className: 'tm-bar-fill' + (r.cpu > 60 ? ' tm-hot' : ''), style: 'width:' + Math.max(4, Math.min(100, r.cpu)) + '%' })
              ]),
              h('span', { className: 'tm-cpu-n' }, Math.round(r.cpu) + '%')
            ]),
            h('span', { className: 'tm-c-mem' }, r.sys ? '—' : Math.round(28 + r.cpu * 1.3) + ' MB'),
            h('span', { className: 'tm-c-act' }, r.sys
              ? h('span', { className: 'tm-nop' }, '—')
              : h('button', { className: 'tm-kill', onclick: () => { NS.system.winman.closeWin(r.w); } }, '结束'))
          ]))
        ])
      ]);
    }
  }

  NS.apps.TaskManagerApp = TaskManagerApp;
  NS.apps.buildTaskManager = body => new TaskManagerApp().mount(body);
})(window);
