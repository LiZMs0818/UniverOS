/* ============================================================
   Universe OS · 软件层 · terminal.js
   终端：手动 DOM 流式输出（输入框不参与声明式重渲染，避免整树替换丢焦点），
   文件系统操作走 core.fs，open 打开应用；支持命令历史（↑/↓）、清屏
   ============================================================ */
(function (G) {
  'use strict';
  const NS = (G.UniverOS = G.UniverOS || {});
  NS.apps = NS.apps || {};

  const joinPath = (a, b) => (a ? a + '/' : '') + (b || '');

  class TerminalApp {
    constructor() { this._cwd = ''; this._hist = []; this._histIdx = -1; }

    mount(container) {
      container.textContent = '';
      const root = document.createElement('div');
      root.className = 'term';

      this._out = document.createElement('div');
      this._out.className = 'term-out';

      const inRow = document.createElement('div');
      inRow.className = 'term-in';
      this._promptEl = document.createElement('span');
      this._promptEl.className = 'term-prompt';
      const inp = document.createElement('input');
      inp.className = 'term-input';
      inp.spellcheck = false;
      inp.setAttribute('autocomplete', 'off');
      inp.addEventListener('keydown', e => this._onKey(e));
      inRow.appendChild(this._promptEl);
      inRow.appendChild(inp);

      root.appendChild(this._out);
      root.appendChild(inRow);
      container.appendChild(root);

      this._input = inp;
      this._print('UniverOS 终端 v1.0 — 输入 help 查看可用命令', 'term-dim');
      this._syncPrompt();
      inp.focus();
    }

    _prompt() { return 'univeros' + (this._cwd ? ':' + this._cwd : '') + '$'; }
    _syncPrompt() { this._promptEl.textContent = this._prompt(); }

    _print(text, cls) {
      const div = document.createElement('div');
      div.className = 'term-line' + (cls ? ' ' + cls : '');
      div.textContent = text == null ? '' : String(text);
      this._out.appendChild(div);
      this._out.scrollTop = this._out.scrollHeight;
    }

    _run(raw) {
      const cmd = (raw || '').trim();
      this._print(this._prompt() + ' ' + raw, 'term-cmd');
      if (cmd) this._hist.push(cmd);
      this._histIdx = -1;
      this._exec(cmd);
    }

    _onKey(e) {
      if (e.key === 'Enter') { const v = this._input.value; this._input.value = ''; this._run(v); return; }
      if (e.key === 'ArrowUp') {
        if (!this._hist.length) return;
        const idx = this._histIdx === -1 ? this._hist.length - 1 : Math.max(0, this._histIdx - 1);
        this._histIdx = idx;
        this._input.value = this._hist[idx];
        return;
      }
      if (e.key === 'ArrowDown') {
        if (this._histIdx === -1) return;
        const idx = this._histIdx + 1;
        if (idx >= this._hist.length) { this._histIdx = -1; this._input.value = ''; return; }
        this._histIdx = idx;
        this._input.value = this._hist[idx];
      }
    }

    _exec(cmd) {
      const fs = NS.core.fs;
      const out = (t, c) => this._print(t, c);
      const err = m => this._print(m, 'term-err');
      const full = p => (p && p !== '.' && p !== '~') ? joinPath(this._cwd, p) : this._cwd;
      const parts = cmd.split(/\s+/);
      const name = parts[0], args = parts.slice(1);

      switch (name) {
        case '': break;
        case 'help':
          out('可用命令：ls · cd · pwd · cat · echo · mkdir · touch · rm · mv · cp · open · clear · date · whoami · uname · uptime · history · help');
          break;
        case 'pwd': out(this._cwd || '/'); break;
        case 'whoami': out('user'); break;
        case 'uname': out('UniverOS 1.0'); break;
        case 'date': out(new Date().toString()); break;
        case 'uptime': out('up ' + (Math.floor(Math.random() * 999) + 1) + ' min'); break;
        case 'history': this._hist.forEach((x, i) => out((i + 1) + '  ' + x)); break;
        case 'clear': this._out.textContent = ''; break;
        case 'echo': out(args.join(' ')); break;
        case 'ls':
          fs.list(full(args[0] || '')).then(items => {
            if (!items.length) { out(''); return; }
            const dirs = items.filter(i => i.kind === 'directory').map(i => i.name + '/').join('   ');
            const files = items.filter(i => i.kind !== 'directory').map(i => i.name).join('   ');
            if (dirs) out(dirs, 'term-dir');
            if (files) out(files);
          }).catch(e => err('ls: ' + e.message));
          break;
        case 'cd':
          if (!args[0]) { this._cwd = ''; this._syncPrompt(); break; }
          fs.list(full(args[0])).then(() => { this._cwd = full(args[0]); this._syncPrompt(); })
            .catch(() => err('cd: 目录不存在: ' + args[0]));
          break;
        case 'cat':
          if (!args[0]) { err('用法: cat <文件>'); break; }
          fs.read(full(args[0])).then(t => out(t)).catch(e => err('cat: ' + e.message));
          break;
        case 'mkdir':
          if (!args[0]) { err('用法: mkdir <目录>'); break; }
          fs.mkdir(full(args[0])).then(() => out('已创建 ' + args[0])).catch(e => err(e.message));
          break;
        case 'touch':
          if (!args[0]) { err('用法: touch <文件>'); break; }
          fs.read(full(args[0])).then(() => out())
            .catch(() => fs.write(full(args[0]), '').then(() => out('已创建 ' + args[0])).catch(e => err(e.message)));
          break;
        case 'rm':
          if (!args[0]) { err('用法: rm <路径>'); break; }
          fs.remove(full(args[0])).then(() => out('已删除 ' + args[0])).catch(e => err(e.message));
          break;
        case 'mv':
          if (args.length < 2) { err('用法: mv <源> <目标>'); break; }
          fs.moveEntry(full(args[0]), full(args[1])).then(() => out('已移动')).catch(e => err(e.message));
          break;
        case 'cp':
          if (args.length < 2) { err('用法: cp <源> <目标>'); break; }
          fs.readBlob(full(args[0])).then(b => fs.write(full(args[1]), b)).then(() => out('已复制')).catch(e => err(e.message));
          break;
        case 'open': {
          const q = (args[0] || '').toLowerCase();
          const APPS = NS.apps.APPS;
          let id = q;
          if (!APPS[id]) {
            const hit = Object.entries(APPS).find(([k, a]) => !a.hidden && (a.name.toLowerCase() === q || a.name.toLowerCase().indexOf(q) >= 0));
            if (hit) id = hit[0];
          }
          if (!APPS[id]) { err('open: 未找到应用: ' + args[0] + '（可用：' + Object.keys(APPS).filter(k => !APPS[k].hidden).join(' ') + '）'); break; }
          NS.system.winman.openApp(id);
          out('正在打开 ' + APPS[id].name + ' …');
          break;
        }
        default: err('未找到命令: ' + name + '（输入 help 查看可用命令）');
      }
    }
  }

  NS.apps.TerminalApp = TerminalApp;
  NS.apps.buildTerminal = body => new TerminalApp().mount(body);
})(window);
