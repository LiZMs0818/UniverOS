(function (G) {
  'use strict';
  const NS = (G.UniverOS = G.UniverOS || {});
  /* ============================================================
     M3 · App 运行时沙箱
     ------------------------------------------------------------
     动态应用在 <iframe sandbox="allow-scripts"> 内运行：
     - 无 allow-same-origin → opaque origin：用户代码拿不到父页面
       任何全局（window.UniverOS / NS / 父 DOM 均不可见），且同源
       请求也被 CORS 拦截；
     - 无 allow-top-navigation / allow-forms / allow-popups：
       不能改父页面地址、不能提交表单、不能弹窗；
     - 通信只走 postMessage 白名单：校验 e.source 必须是本 iframe
       的 contentWindow，且 data.uv === true、type 在枚举内。
     沙箱属性由浏览器强制，脚本层面没有 escape 路径。
     kill() 销毁 iframe 会终止其中所有脚本（包括死循环）。
     ============================================================ */

  /* ---------- 语法定位：结构扫描找未闭合处（V8 SyntaxError 不给行号） ---------- */
  function findSyntaxLine(code) {
    const lines = String(code).split('\n');
    const stack = [];
    let str = null, strLine = 0, blockCom = false, comLine = 0, lineNo = 1;
    for (const ln of lines) {
      let j = 0;
      while (j < ln.length) {
        const c = ln[j];
        if (blockCom) {
          if (c === '*' && ln[j + 1] === '/') { blockCom = false; j++; }
        } else if (str) {
          if (c === '\\') { j++; }
          else if (c === str) { str = null; }
        } else if (c === '/' && ln[j + 1] === '/') {
          break;
        } else if (c === '/' && ln[j + 1] === '*') {
          blockCom = true; comLine = lineNo; j++;
        } else if (c === '/' && !/[A-Za-z0-9_$)\]}]/.test(j > 0 ? ln[j - 1] : ' ')) {
          j++;
          while (j < ln.length) {
            if (ln[j] === '\\') j++;
            else if (ln[j] === '/') break;
            j++;
          }
        } else if (c === "'" || c === '"' || c === '`') {
          str = c; strLine = lineNo;
        } else if (c === '(' || c === '[' || c === '{') {
          stack.push({ ch: c, line: lineNo });
        } else if (c === ')' || c === ']' || c === '}') {
          const want = c === ')' ? '(' : c === ']' ? '[' : '{';
          const top = stack.pop();
          if (!top) return lineNo;
          if (top.ch !== want) return top.line;
        }
        j++;
      }
      lineNo++;
    }
    if (blockCom) return comLine;
    if (str) return strLine;
    if (stack.length) return stack[stack.length - 1].line;
    return 0;
  }

  /* ---------- iframe 内迷你运行时（独立作用域，零父系统引用） ---------- */
  const RUNTIME = `
'use strict';
function h(tag, attrs, children) {
  var el = document.createElement(tag);
  if (attrs) for (var k in attrs) {
    var v = attrs[k];
    if (k === 'className') el.className = v;
    else if (k === 'style' && typeof v === 'string') el.setAttribute('style', v);
    else if (k.slice(0, 2) === 'on' && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (v !== null && v !== undefined) el.setAttribute(k, v);
  }
  var ch = Array.isArray(children) ? children : (children === undefined || children === null ? [] : [children]);
  function append(c) {
    if (c === null || c === undefined) return;
    if (typeof c === 'string' || typeof c === 'number') el.appendChild(document.createTextNode(String(c)));
    else if (Array.isArray(c)) { for (var j = 0; j < c.length; j++) append(c[j]); }
    else if (c.nodeType) el.appendChild(c);
  }
  for (var i = 0; i < ch.length; i++) append(ch[i]);
  return el;
}
function Component(props) { this.props = props || {}; this.state = {}; this._root = null; }
Component.prototype.setState = function (patch) {
  var next = {}; for (var k in this.state) next[k] = this.state[k];
  if (typeof patch === 'function') patch = patch(next);
  for (var k2 in patch) next[k2] = patch[k2];
  this.state = next;
  if (this._root) { this._root.replaceChildren(this.render()); if (this.afterUpdate) this.afterUpdate(); }
  return this;
};
Component.prototype.mount = function (container) {
  /* 与父系统一致：initialState 在挂载时并入 state（子类 super() 之后才赋值） */
  if (this.initialState) { for (var k in this.initialState) this.state[k] = this.initialState[k]; }
  this._root = container;
  container.appendChild(this.render());
  if (this.afterMount) this.afterMount();
  return this;
};
function bridge(type, payload) { try { parent.postMessage({ uv: true, type: type, data: payload || {} }, '*'); } catch (e) {} }
function logLine(e) {
  var s = String(e && e.stack || '');
  var m = s.match(/<anonymous>:(\\d+):\\d+/);
  return m ? (Number(m[1]) - 2) : 0;
}
['log', 'warn', 'error', 'info'].forEach(function (lv) {
  var orig = console[lv];
  console[lv] = function () {
    var text = Array.prototype.map.call(arguments, function (a) {
      if (a instanceof Error) return a.message;
      var s;
      try { s = typeof a === 'string' ? a : JSON.stringify(a); } catch (e2) { s = undefined; }
      return s === undefined ? String(a) : s;
    }).join(' ');
    bridge('log', { level: lv, text: String(text) });
    if (orig) orig.apply(console, arguments);
  };
});
window.addEventListener('error', function (ev) {
  bridge('error', { level: 'error', text: String(ev && ev.message || 'runtime error'), line: (ev && ev.lineno) || 0 });
});
var AppCls;
try {
  AppCls = new Function('Component', 'h', '"use strict"; return (' + __UV_CODE__ + '\\n);')(Component, h);
} catch (e) {
  bridge('error', { level: 'error', text: String(e && e.message || e), line: logLine(e) });
  bridge('fatal', { message: String(e && e.message || e), line: logLine(e) });
}
if (AppCls) {
  try {
    if (typeof AppCls !== 'function') throw new Error('代码需定义并返回一个组件类');
    var inst = new AppCls();
    window.__uvInst = inst;
    inst.mount(document.getElementById('root'));
  } catch (e2) {
    bridge('error', { level: 'error', text: String(e2 && e2.message || e2), line: logLine(e2) });
    bridge('fatal', { message: String(e2 && e2.message || e2), line: logLine(e2) });
  }
}
`;

  function srcdocFor(code, theme) {
    const t = theme || {};
    const text = t.text || '#ffffff';
    const dim = t.dim || 'rgba(255,255,255,.55)';
    const accent = t.accent || '#4da3ff';
    return ''
      + '<!DOCTYPE html><html><head><meta charset="utf-8"><style>'
      + ':root{--text:' + text + ';--text-dim:' + dim + ';--accent:' + accent + ';}'
      + 'html,body{margin:0;height:100%;overflow:auto;background:transparent;color:var(--text);font:13px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif;}'
      + '#root{min-height:100%;box-sizing:border-box;}'
      + 'button{font:inherit;border:1px solid var(--text-dim);border-radius:8px;background:none;color:var(--text);padding:6px 16px;cursor:pointer;transition:background .12s;}'
      + 'button:hover{border-color:var(--accent);color:var(--accent);}'
      + 'input,textarea,select{font:inherit;background:none;border:1px solid var(--text-dim);border-radius:6px;color:var(--text);padding:4px 8px;}'
      + '.as-btn{border:1px solid var(--accent);border-radius:8px;background:none;color:var(--accent);padding:6px 16px;cursor:pointer;}'
      + '.as-btn:hover{background:rgba(77,163,255,.14);}'
      + '</style></head><body><div id="root"></div>'
      + '<script>var __UV_CODE__ = ' + JSON.stringify(code) + ';\n' + RUNTIME + '</script>'
      + '</body></html>';
  }

  /* ---------- 读取当前主题（深色/浅色切换时 iframe 内样式跟随） ---------- */
  function readTheme() {
    const cs = getComputedStyle(document.documentElement);
    return {
      text: cs.getPropertyValue('--text').trim() || '#ffffff',
      dim: cs.getPropertyValue('--text-dim').trim() || 'rgba(255,255,255,.55)',
      accent: cs.getPropertyValue('--accent').trim() || '#4da3ff'
    };
  }

  /* ---------- 挂载沙箱 ---------- */
  function mountApp(el, code, handlers, theme) {
    if (!el) return null;
    let msg = null, line = 0;
    try {
      new Function('Component', 'h', '"use strict"; return (' + code + '\n);'); /* 仅创建，不调用 */
    } catch (e) {
      msg = String(e && e.message || e);
      line = findSyntaxLine(code) || 1;
    }
    if (msg) {
      const item = { level: 'error', text: msg, line: line };
      if (handlers && handlers.error) handlers.error(item);
      if (handlers && handlers.fatal) handlers.fatal(item);
      return null;
    }

    const ifr = document.createElement('iframe');
    ifr.setAttribute('sandbox', 'allow-scripts');
    ifr.setAttribute('scrolling', 'yes');
    ifr.style.cssText = 'border:0;width:100%;height:100%;display:block;background:transparent;';
    ifr.srcdoc = srcdocFor(code, theme || readTheme());
    el.textContent = '';
    el.appendChild(ifr);

    const onMsg = function (e) {
      if (e.source !== ifr.contentWindow) return;
      const d = e.data;
      if (!d || d.uv !== true) return;
      if (d.type !== 'log' && d.type !== 'error' && d.type !== 'fatal') return;
      const data = d.data || {};
      if (data.text !== undefined && typeof data.text !== 'string') return;
      if (handlers && handlers[d.type]) handlers[d.type](data);
    };
    window.addEventListener('message', onMsg);

    return {
      kill: function () {
        window.removeEventListener('message', onMsg);
        try { ifr.remove(); } catch (e2) {}
        if (el) el.textContent = '';
      }
    };
  }

  NS.sandbox = {
    findSyntaxLine: findSyntaxLine,
    readTheme: readTheme,
    mountApp: mountApp
  };
})(window);
