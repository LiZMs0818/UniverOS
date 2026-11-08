/* ============================================================
   Universe OS · 软件层 · appstudio-ui.js
   M6 · 可视化 UI 构建器
   - 组件库 / 画布 / 属性面板 / 拖拽排序
   - 组件可挂交互逻辑（跳页 / 计数 / 写状态 / 自定义 JS）
   - 画布 ↔ 代码 双向：能从 h(...) 代码回读成组件树，
     读不出的片段原样保留为「自定义代码」节点，切换不清空任何东西。
   ============================================================ */
(function (G) {
  'use strict';
  const NS = (G.UniverOS = G.UniverOS || {});
  NS.apps = NS.apps || {};

  const TYPES = {
    title: { label: '标题', fields: ['text'], def: { text: '标题文字' } },
    text: { label: '文字', fields: ['text'], def: { text: '这是一段说明文字', bind: 'static' } },
    button: { label: '按钮', fields: ['text', 'tone'], def: { text: '按钮', tone: 'accent', on: 'none' } },
    input: { label: '输入', fields: ['sub'], def: { sub: '请输入内容', bind: 'none' } },
    card: { label: '卡片', fields: ['text', 'sub'], def: { text: '卡片标题', sub: '卡片内的说明文字' } },
    list: { label: '列表', fields: ['text'], def: { text: '第一项\n第二项\n第三项' } },
    divider: { label: '分割线', fields: [], def: {} },
    image: { label: '图片', fields: ['sub'], def: { sub: '图片占位' } },
    raw: { label: '自定义代码', fields: [], def: { code: '' } }
  };
  const ORDER = ['title', 'text', 'button', 'input', 'card', 'list', 'divider', 'image'];

  /* ---------- 样式 ---------- */
  function styleOf(n) {
    if (n.style) return n.style; /* 回读来的节点保留原样式 */
    switch (n.type) {
      case 'title':
        return 'margin:0 0 12px;font-size:22px;font-weight:600;line-height:1.3'
          + (n.tone === 'dim' ? ';color:var(--text-dim)' : '');
      case 'text':
        return 'margin:0 0 12px;line-height:1.62'
          + (n.tone === 'accent' ? ';color:var(--accent)' : ';color:var(--text-dim)');
      case 'button':
        return n.tone === 'plain'
          ? 'padding:6px 16px;border:1px solid var(--text-mute);border-radius:8px;background:none;color:var(--text);cursor:pointer'
          : '';
      case 'input':
        return 'width:100%;box-sizing:border-box;height:32px;margin:0 0 12px;padding:0 10px;border-radius:8px;'
          + 'border:1px solid var(--text-mute);background:var(--bg-input);color:var(--text);font:inherit;outline:none';
      case 'card':
        return 'margin:0 0 12px;padding:14px;border-radius:10px;background:var(--bg-panel);border:1px solid var(--text-mute)';
      case 'list':
        return 'margin:0 0 12px;padding-left:18px;line-height:1.75';
      case 'divider':
        return 'height:1px;margin:12px 0;background:var(--text-mute);opacity:.6';
      case 'image':
        return 'height:120px;margin:0 0 12px;border-radius:10px;border:1px dashed var(--text-mute);'
          + 'background:var(--bg-panel);display:flex;align-items:center;justify-content:center;color:var(--text-dim);font-size:12px';
      case 'raw':
        return 'margin:0 0 12px;padding:10px 12px;border-radius:8px;border:1px dashed var(--text-mute);'
          + 'color:var(--text-dim);font-size:11.5px;white-space:pre;overflow:hidden';
      default:
        return '';
    }
  }
  function itemsOf(n) {
    return String(n.text || '').split('\n').filter(s => s.trim()).map(s => s.trim());
  }

  /* ---------- 画布预览 ---------- */
  function previewNode(h, n) {
    const st = styleOf(n);
    switch (n.type) {
      case 'title': return h('h1', { style: st }, n.text || '标题');
      case 'text': {
        const label = n.bind === 'n' ? (n.prefix || '计数：') + '0' + (n.suffix || '')
          : n.bind === 'v' ? (n.prefix || '输入：') + '…' + (n.suffix || '')
            : (n.text || '');
        return h('p', { style: st }, label);
      }
      case 'button':
        return h('button', { className: n.tone === 'plain' ? '' : 'as-btn', style: n.tone === 'plain' ? st : (n.style || '') }, n.text || '按钮');
      case 'input':
        return h('input', { style: st, placeholder: n.sub || '' });
      case 'card':
        return h('div', { style: st }, [
          h('div', { style: 'font-weight:600;margin-bottom:6px' }, n.text || ''),
          h('div', { style: 'color:var(--text-dim);line-height:1.6' }, n.sub || '')
        ]);
      case 'list':
        return h('ul', { style: st }, itemsOf(n).map(t => h('li', { style: 'margin:3px 0' }, t)));
      case 'divider':
        return h('div', { style: st });
      case 'image':
        return h('div', { style: st }, n.sub || '图片占位');
      case 'raw':
        return h('div', { style: st }, String(n.code || '').trim().slice(0, 120) || '自定义代码');
      default:
        return h('div', { style: st });
    }
  }

  /* ---------- 代码生成 ---------- */
  function q(s) { return JSON.stringify(String(s == null ? '' : s)); }

  function handlerOf(n) {
    if (n.type !== 'button') return null;
    if (n.on === 'nav' && n.target) {
      return "() => { if (typeof navigate === 'function') navigate(" + q(n.target) + "); }";
    }
    if (n.on === 'count') return '() => this.setState({ n: (this.state.n || 0) + 1 })';
    if (n.on === 'js' && n.code && n.code.trim()) return '() => { ' + n.code.trim() + ' }';
    return null;
  }

  function emitNode(n) {
    if (n.type === 'raw') return String(n.code || 'null').trim() || 'null';
    const st = styleOf(n);
    const s = 'style: ' + q(st);
    const click = handlerOf(n);
    switch (n.type) {
      case 'title':
        return "h('h1', { " + s + " }, " + q(n.text || '') + ")";
      case 'text': {
        let child;
        if (n.bind === 'n') child = q(n.prefix || '计数：') + ' + (this.state.n || 0) + ' + q(n.suffix || '');
        else if (n.bind === 'v') child = q(n.prefix || '输入：') + ' + (this.state.v || \'\') + ' + q(n.suffix || '');
        else child = q(n.text || '');
        return "h('p', { " + s + " }, " + child + ")";
      }
      case 'button': {
        const attrs = (n.tone === 'plain' ? '' : "className: 'as-btn', ") + (st ? s : '')
          + (click ? (st ? ', onclick: ' + click : 'onclick: ' + click) : '');
        return "h('button', { " + attrs.replace(/^,\s*/, '') + " }, " + q(n.text || '按钮') + ")";
      }
      case 'input': {
        const attrs = s + ", placeholder: " + q(n.sub || '')
          + (n.bind === 'v' ? ', oninput: (e) => this.setState({ v: e.target.value })' : '');
        return "h('input', { " + attrs + " })";
      }
      case 'card':
        return "h('div', { " + s + " }, [\n"
          + "        h('div', { style: 'font-weight:600;margin-bottom:6px' }, " + q(n.text || '') + "),\n"
          + "        h('div', { style: 'color:var(--text-dim);line-height:1.6' }, " + q(n.sub || '') + ")\n"
          + "      ])";
      case 'list':
        return "h('ul', { " + s + " }, [\n"
          + itemsOf(n).map(t => "        h('li', { style: 'margin:3px 0' }, " + q(t) + ")").join(',\n') + '\n      ])';
      case 'divider': return "h('div', { " + s + " })";
      case 'image': return "h('div', { " + s + " }, " + q(n.sub || '') + ")";
      default: return "h('div', { " + s + " })";
    }
  }

  function needsState(nodes) {
    return nodes.some(n =>
      (n.type === 'text' && n.bind && n.bind !== 'static')
      || (n.type === 'input' && n.bind === 'v')
      || (n.type === 'button' && n.on === 'count'));
  }

  function genCode(page) {
    const nodes = Array.isArray(page.ui) ? page.ui : [];
    const src = page.uiSrc || null;
    const rootStyle = (src && src.rootStyle) || 'padding:22px;';
    let head, tail;
    if (src && typeof src.head === 'string' && typeof src.tail === 'string') {
      head = src.head;
      tail = src.tail;
    } else {
      head = '/* 页面「' + page.name + '」· 由可视化构建器生成（可切到「代码」查看或修改；再切回可视化会按代码重新解析，读不出的片段原样保留） */\n'
        + 'class Page extends Component {\n'
        + (needsState(nodes) ? '  constructor(props) {\n    super(props);\n    this.initialState = { n: 0, v: \'\' };\n  }\n' : '')
        + '  render() {\n    ';
      tail = ';\n  }\n}\n';
    }
    const items = nodes.length ? nodes.map(n => '      ' + emitNode(n)).join(',\n') : '';
    const expr = items
      ? "return h('div', { style: " + q(rootStyle) + " }, [\n" + items + '\n    ])'
      : "return h('div', { style: " + q(rootStyle) + " }, [])";
    const shown = tail.trim().startsWith(';') ? tail : (';' + tail);
    return head + expr + shown;
  }

  /* ============================================================
     反向解析：h(...) 代码 → 组件树（读不出的片段存为 raw 节点）
     ============================================================ */
  function unquote(raw) {
    const s = String(raw || '').trim();
    if (s.length < 2) return s;
    const quote = s[0];
    if (quote !== '"' && quote !== "'" && quote !== '`') return s;
    let inner = s.slice(1, -1);
    if (quote === '"') {
      try { return JSON.parse(s); } catch (e) { /* 继续手解 */ }
    }
    inner = inner.replace(/\\n/g, '\n').replace(/\\t/g, '\t')
      .replace(/\\"/g, '"').replace(/\\'/g, "'").replace(/\\\\/g, '\\');
    return inner;
  }

  function scanString(src, i) {
    const quote = src[i];
    let j = i + 1;
    while (j < src.length) {
      if (src[j] === '\\') { j += 2; continue; }
      if (src[j] === quote) return j + 1;
      j++;
    }
    return -1;
  }
  function scanBalanced(src, i) {
    const open = src[i];
    const close = open === '(' ? ')' : open === '[' ? ']' : '}';
    let depth = 0, j = i;
    while (j < src.length) {
      const c = src[j];
      if (c === '"' || c === "'" || c === '`') {
        const e = scanString(src, j);
        if (e < 0) return -1;
        j = e;
        continue;
      }
      if (c === open) depth++;
      else if (c === close) { depth--; if (depth === 0) return j + 1; }
      j++;
    }
    return -1;
  }
  /* 按顶层分隔符切分（默认逗号；也可传 '+' 之类） */
  function splitTop(src, chars) {
    const seps = chars || ',';
    const parts = [];
    let start = 0, j = 0;
    while (j < src.length) {
      const c = src[j];
      if (c === '"' || c === "'" || c === '`') {
        const e = scanString(src, j);
        if (e < 0) break;
        j = e;
        continue;
      }
      if (c === '(' || c === '[' || c === '{') {
        const e = scanBalanced(src, j);
        if (e < 0) break;
        j = e;
        continue;
      }
      if (seps.indexOf(c) >= 0) { parts.push(src.slice(start, j).trim()); start = j + 1; }
      j++;
    }
    const last = src.slice(start).trim();
    if (last) parts.push(last);
    return parts;
  }
  function parseCall(expr) {
    const s = String(expr || '').trim();
    if (!/^h\s*\(/.test(s)) return null;
    const openAt = s.indexOf('(');
    const end = scanBalanced(s, openAt);
    if (end !== s.length) return null;
    const args = splitTop(s.slice(openAt + 1, end - 1));
    if (!args.length) return null;
    const tag = unquote(args[0]);
    const hasAttrs = args.length > 1 && /^\{/.test(args[1]);
    return {
      tag: tag,
      attrs: hasAttrs ? args[1] : null,
      children: args.slice(hasAttrs ? 2 : 1),
      expr: s
    };
  }
  function getProp(attrs, name) {
    if (!attrs) return null;
    const re = new RegExp(name + '\\s*:\\s*');
    const m = re.exec(attrs);
    if (!m) return null;
    const from = m.index + m[0].length;
    const rest = attrs.slice(from);
    const first = rest[0];
    if (first === '"' || first === "'" || first === '`') {
      const e = scanString(attrs, from);
      return e < 0 ? null : attrs.slice(from, e);
    }
    /* 其它表达式：取到下一个顶层逗号 */
    let depth = 0, j = from;
    while (j < attrs.length) {
      const c = attrs[j];
      if (c === '"' || c === "'" || c === '`') {
        const e = scanString(attrs, j);
        if (e < 0) break;
        j = e;
        continue;
      }
      if (c === '(' || c === '[' || c === '{') { const e = scanBalanced(attrs, j); if (e < 0) break; j = e; continue; }
      if (c === ',' && depth === 0) break;
      j++;
    }
    return attrs.slice(from, j).trim();
  }

  function firstStringChild(child) {
    if (!child) return '';
    const s = String(child).trim();
    if (s[0] === '"' || s[0] === "'" || s[0] === '`') return unquote(s);
    return '';
  }

  /* 解析 '已点 ' + this.state.n + ' 次' 这类绑定表达式 → { key, prefix, suffix } */
  function parseBind(raw) {
    const parts = splitTop(String(raw), '+');
    let key = null, idx = -1;
    for (let i = 0; i < parts.length; i++) {
      const m = /this\.state\.([A-Za-z_$][\w$]*)/.exec(parts[i]);
      if (m) { key = m[1]; idx = i; break; }
    }
    if (idx < 0) return null;
    const prefix = parts.slice(0, idx).map(p => firstStringChild(p)).join('');
    const suffix = parts.slice(idx + 1).map(p => firstStringChild(p)).join('');
    return { key: key, prefix: prefix, suffix: suffix };
  }

  function classify(expr) {
    const call = parseCall(expr);
    const styleRaw = call ? getProp(call.attrs, 'style') : null;
    const style = styleRaw ? unquote(styleRaw) : null;
    if (!call) return { type: 'raw', code: String(expr).trim() };
    const tag = (call.tag || '').toLowerCase();
    const kids = call.children;
    const textOf = (k) => firstStringChild(k);

    if (tag === 'h1' || tag === 'h2') {
      return { type: 'title', text: textOf(kids[0]), style: style };
    }
    if (tag === 'p' || tag === 'span') {
      const raw = String(kids[0] || '');
      if (/this\.state\./.test(raw)) {
        const b = parseBind(raw);
        if (b) {
          return {
            type: 'text', bind: b.key === 'v' ? 'v' : 'n',
            prefix: b.prefix, suffix: b.suffix, style: style
          };
        }
      }
      return { type: 'text', text: textOf(kids[0]) || unquote(raw), style: style };
    }
    if (tag === 'button') {
      const cls = (getProp(call.attrs, 'className') || '').indexOf('as-btn') >= 0;
      const click = getProp(call.attrs, 'onclick') || '';
      const node = { type: 'button', text: textOf(kids[0]) || '按钮', tone: cls ? 'accent' : 'plain', style: style, on: 'none' };
      if (/navigate\s*\(\s*['"]/.test(click)) {
        node.on = 'nav';
        const m = /navigate\s*\(\s*(['"])(.*?)\1/.exec(click);
        node.target = m ? m[2] : '';
      } else if (/setState/.test(click) && /\bn\b/.test(click)) {
        node.on = 'count';
      } else if (click.trim()) {
        node.on = 'js';
        const body = /=>\s*\{([\s\S]*)\}/.exec(click) || /=>\s*([\s\S]*)/.exec(click);
        node.code = body ? body[1].trim().replace(/;$/, '') : click;
      }
      return node;
    }
    if (tag === 'input') {
      const node = { type: 'input', sub: unquote(getProp(call.attrs, 'placeholder') || '') , style: style };
      node.bind = /this\.state\.v/.test(call.attrs || '') ? 'v' : 'none';
      return node;
    }
    if (tag === 'ul') {
      const arr = kids[0] ? String(kids[0]).trim() : '';
      if (arr[0] !== '[') return { type: 'raw', code: call.expr };
      const inner = arr.slice(1, arr.lastIndexOf(']'));
      const items = splitTop(inner).map(function (t) {
        const c = parseCall(t);
        return c ? firstStringChild(c.children[0]) : '';
      }).filter(Boolean);
      return { type: 'list', text: items.join('\n'), style: style };
    }
    if (tag === 'div') {
      if (style && /height\s*:\s*1px/.test(style) && !kids.length) return { type: 'divider', style: style };
      if (style && /dashed/.test(style)) return { type: 'image', sub: textOf(kids[0]) || '', style: style };
      const k0 = kids[0] ? String(kids[0]).trim() : '';
      if (k0[0] === '[') {
        const parts = splitTop(k0.slice(1, k0.lastIndexOf(']')));
        const calls = parts.map(parseCall);
        if (calls.length === 2 && calls[0] && calls[1] && calls[0].tag === 'div' && calls[1].tag === 'div') {
          return {
            type: 'card',
            text: firstStringChild(calls[0].children[0]),
            sub: firstStringChild(calls[1].children[0]),
            style: style
          };
        }
      }
      return { type: 'raw', code: call.expr };
    }
    return { type: 'raw', code: call.expr };
  }

  /* 读回页面代码：保留 head / tail / 根样式，只把 render 里的内容变成节点 */
  function parseCode(code) {
    if (typeof code !== 'string' || !code.trim()) return { ok: true, nodes: [], uiSrc: null };
    const rIdx = /\breturn\s+(?=h\s*\()/.exec(code);
    if (!rIdx) return { ok: false, reason: '没有找到 render() 里直接 return h(...)' };
    const start = rIdx.index + rIdx[0].length;
    const openAt = code.indexOf('(', start);
    const end = scanBalanced(code, openAt);
    if (end < 0) return { ok: false, reason: 'h(...) 括号不完整' };
    const rootExpr = code.slice(start, end);
    const root = parseCall(rootExpr);
    if (!root) return { ok: false, reason: '根部不是 h(...) 调用' };
    const styleRaw = getProp(root.attrs, 'style');
    const rootStyle = styleRaw ? unquote(styleRaw) : 'padding:22px;';
    let nodes = [];
    const k0 = root.children[0] ? String(root.children[0]).trim() : '';
    if (k0[0] === '[') {
      const inner = k0.slice(1, k0.lastIndexOf(']'));
      nodes = splitTop(inner).map(classify);
    } else if (root.children.length) {
      nodes = root.children.map(classify);
    }
    return {
      ok: true,
      nodes: nodes,
      uiSrc: { head: code.slice(0, rIdx.index), tail: code.slice(end), rootStyle: rootStyle }
    };
  }

  /* ============================================================
     画布交互
     ============================================================ */
  let seq = 0;
  function nextId() { return 'n' + (++seq) + Date.now().toString(36).slice(-3); }

  function mount(host, ctx) {
    const h = NS.render.h;
    const page = ctx.page;
    if (!Array.isArray(page.ui)) page.ui = [];
    const pages = Array.isArray(ctx.pages) ? ctx.pages : [];
    let sel = -1;

    host.innerHTML = '';
    const box = document.createElement('div');
    box.className = 'ub';
    box.innerHTML =
      '<div class="ub-palette"><div class="ub-ph">组件</div><div class="ub-pal-items"></div></div>'
      + '<div class="ub-canvaswrap"><div class="ub-canvas"></div></div>'
      + '<div class="ub-insp"></div>';
    host.appendChild(box);

    const palBox = box.querySelector('.ub-pal-items');
    const canvas = box.querySelector('.ub-canvas');
    const insp = box.querySelector('.ub-insp');

    ORDER.forEach(function (key) {
      const t = TYPES[key];
      const b = document.createElement('button');
      b.className = 'ub-pal';
      b.dataset.type = key;
      b.textContent = t.label;
      b.addEventListener('click', function () { addNode(key); });
      palBox.appendChild(b);
    });

    function notify() {
      page.code = genCode(page);
      if (ctx.onChange) ctx.onChange(page);
    }
    function addNode(type) {
      const t = TYPES[type];
      const node = Object.assign({ id: nextId(), type: type }, JSON.parse(JSON.stringify(t.def)));
      const at = sel >= 0 ? sel + 1 : page.ui.length;
      page.ui.splice(at, 0, node);
      sel = at;
      render();
      notify();
    }
    function removeNode(i) {
      page.ui.splice(i, 1);
      if (sel >= i) sel = Math.max(-1, sel - 1);
      render();
      notify();
    }
    function moveNode(i, d) {
      const j = i + d;
      if (j < 0 || j >= page.ui.length) return;
      const t = page.ui[i];
      page.ui[i] = page.ui[j];
      page.ui[j] = t;
      sel = j;
      render();
      notify();
    }
    function dupNode(i) {
      const copy = JSON.parse(JSON.stringify(page.ui[i]));
      copy.id = nextId();
      page.ui.splice(i + 1, 0, copy);
      sel = i + 1;
      render();
      notify();
    }

    function badgeOf(n) {
      if (n.type === 'button') {
        if (n.on === 'nav') return ' · 跳转「' + (n.target || '未选') + '」';
        if (n.on === 'count') return ' · 计数 +1';
        if (n.on === 'js') return ' · 自定义 JS';
      }
      if (n.type === 'text' && n.bind === 'n') return ' · 绑定计数';
      if (n.type === 'text' && n.bind === 'v') return ' · 绑定输入值';
      if (n.type === 'input' && n.bind === 'v') return ' · 写入状态';
      return '';
    }

    function renderCanvas() {
      canvas.innerHTML = '';
      if (!page.ui.length) {
        const e = document.createElement('div');
        e.className = 'ub-empty';
        e.textContent = '从左侧添加组件';
        canvas.appendChild(e);
        return;
      }
      page.ui.forEach(function (n, i) {
        const wrap = document.createElement('div');
        wrap.className = 'ub-node' + (i === sel ? ' active' : '');
        wrap.dataset.i = String(i);

        const head = document.createElement('div');
        head.className = 'ub-nh';
        const grip = document.createElement('span');
        grip.className = 'ub-drag';
        grip.textContent = '⠿';
        const tag = document.createElement('span');
        tag.className = 'ub-nl';
        tag.textContent = (TYPES[n.type] ? TYPES[n.type].label : n.type) + badgeOf(n);
        head.appendChild(grip);
        head.appendChild(tag);
        wrap.appendChild(head);

        const bodyEl = document.createElement('div');
        bodyEl.className = 'ub-nb';
        try {
          bodyEl.appendChild(NS.render.createElement(previewNode(h, n)));
        } catch (e) {
          bodyEl.textContent = '无法预览';
        }
        wrap.appendChild(bodyEl);

        wrap.addEventListener('pointerdown', function (e) {
          if (e.target.closest('.ub-drag')) return;
          sel = i;
          render();
        });
        grip.addEventListener('pointerdown', function (e) {
          e.preventDefault();
          e.stopPropagation();
          startDrag(i, e);
        });
        canvas.appendChild(wrap);
      });
    }

    let dragFrom = -1, dragTo = -1, dragging = false;
    function startDrag(i, e) {
      dragFrom = i; dragTo = i; dragging = true;
      sel = i;
      render();
      document.addEventListener('pointermove', onMove);
      document.addEventListener('pointerup', onUp, { once: true });
    }
    function onMove(e) {
      if (!dragging) return;
      const nodes = Array.prototype.slice.call(canvas.querySelectorAll('.ub-node'));
      let idx = nodes.length;
      for (let i = 0; i < nodes.length; i++) {
        const r = nodes[i].getBoundingClientRect();
        if (e.clientY < r.top + r.height / 2) { idx = i; break; }
      }
      dragTo = idx;
      nodes.forEach(function (el, i) { el.classList.toggle('ub-before', i === idx); });
    }
    function onUp() {
      document.removeEventListener('pointermove', onMove);
      if (!dragging) return;
      dragging = false;
      canvas.querySelectorAll('.ub-node').forEach(el => el.classList.remove('ub-before', 'ub-after'));
      let from = dragFrom, to = dragTo;
      if (to > from) to -= 1;
      if (to >= 0 && to !== from && from >= 0) {
        const moved = page.ui.splice(from, 1)[0];
        page.ui.splice(to, 0, moved);
        sel = to;
        render();
        notify();
      } else {
        render();
      }
      dragFrom = dragTo = -1;
    }

    /* ---------- 属性面板 ---------- */
    function field(label, value, multiline, onChange, hint) {
      const row = document.createElement('div');
      row.className = 'ub-field';
      const lb = document.createElement('div');
      lb.className = 'ub-fl';
      lb.textContent = label;
      const inp = multiline ? document.createElement('textarea') : document.createElement('input');
      inp.className = 'ub-fi';
      if (multiline) inp.rows = 4; else inp.type = 'text';
      inp.value = value == null ? '' : value;
      if (hint) inp.placeholder = hint;
      inp.addEventListener('input', function () { onChange(inp.value); });
      row.appendChild(lb);
      row.appendChild(inp);
      return row;
    }
    function selectField(label, value, options, onChange) {
      const row = document.createElement('div');
      row.className = 'ub-field';
      const lb = document.createElement('div');
      lb.className = 'ub-fl';
      lb.textContent = label;
      const list = options.slice();
      const cur = list.filter(function (o) { return o[0] === value; })[0] || list[0];
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'ub-fi ub-fi-sel';
      const lbEl = document.createElement('span');
      lbEl.className = 'ctx-select-label';
      lbEl.textContent = cur ? cur[1] : '';
      const caret = document.createElement('span');
      caret.className = 'ctx-select-caret';
      b.appendChild(lbEl);
      b.appendChild(caret);
      b.addEventListener('click', function (e) {
        NS.render.menu.dropdown(e.currentTarget, list, value, onChange);
      });
      row.appendChild(lb);
      row.appendChild(b);
      return row;
    }

    function renderInsp() {
      insp.innerHTML = '';
      const selNode = page.ui[sel];
      if (!selNode) {
        const t = document.createElement('div');
        t.className = 'ub-empty2';
        t.textContent = '选中组件后可改属性';
        insp.appendChild(t);
        return;
      }
      const t = TYPES[selNode.type] || { fields: [] };
      const head = document.createElement('div');
      head.className = 'ub-insp-head';
      head.textContent = t.label;
      insp.appendChild(head);

      if (t.fields.indexOf('text') >= 0 && selNode.type !== 'text') {
        insp.appendChild(field(selNode.type === 'list' ? '每一项（一行一项）' : '文字', selNode.text, selNode.type === 'list', function (v) {
          selNode.text = v; render(); notify();
        }));
      }
      if (selNode.type === 'text') {
        insp.appendChild(selectField('内容', selNode.bind || 'static', [['static', '固定文字'], ['n', '显示计数'], ['v', '显示输入值']], function (v) {
          selNode.bind = v;
          if (v === 'static' && selNode.text == null) selNode.text = '说明文字';
          if (v === 'n' && !selNode.prefix) selNode.prefix = '计数：';
          if (v === 'v' && !selNode.prefix) selNode.prefix = '输入：';
          render(); notify();
        }));
        if (!selNode.bind || selNode.bind === 'static') {
          insp.appendChild(field('文字', selNode.text, false, function (v) { selNode.text = v; render(); notify(); }));
        } else {
          insp.appendChild(field('前缀', selNode.prefix, false, function (v) { selNode.prefix = v; render(); notify(); }));
          insp.appendChild(field('后缀', selNode.suffix, false, function (v) { selNode.suffix = v; render(); notify(); }));
        }
      }
      if (t.fields.indexOf('sub') >= 0) {
        insp.appendChild(field(selNode.type === 'input' ? '占位提示' : '说明文字', selNode.sub, false, function (v) {
          selNode.sub = v; render(); notify();
        }));
      }
      if (t.fields.indexOf('tone') >= 0) {
        const row = document.createElement('div');
        row.className = 'ub-field';
        const lb = document.createElement('div');
        lb.className = 'ub-fl';
        lb.textContent = '样式';
        const sw = document.createElement('div');
        sw.className = 'ub-seg';
        [['accent', '主按钮'], ['plain', '次按钮']].forEach(function (p) {
          const b = document.createElement('button');
          b.className = 'ub-segb' + ((selNode.tone || 'accent') === p[0] ? ' active' : '');
          b.textContent = p[1];
          b.addEventListener('click', function () { selNode.tone = p[0]; render(); notify(); });
          sw.appendChild(b);
        });
        row.appendChild(lb);
        row.appendChild(sw);
        insp.appendChild(row);
      }
      /* 逻辑：按钮点击动作 */
      if (selNode.type === 'button') {
        insp.appendChild(selectField('点击动作', selNode.on || 'none', [
          ['none', '无'], ['nav', '跳转到页面'], ['count', '计数 +1'], ['js', '自定义 JS']
        ], function (v) {
          selNode.on = v;
          if (v === 'nav' && !selNode.target && pages.length) selNode.target = pages[0].name;
          render(); notify();
        }));
        if (selNode.on === 'nav') {
          const opts = pages.map(p => [p.name, p.name]);
          if (!opts.length) opts.push(['', '（暂无其它页面）']);
          insp.appendChild(selectField('目标页面', selNode.target || '', opts, function (v) {
            selNode.target = v; render(); notify();
          }));
        }
        if (selNode.on === 'js') {
          insp.appendChild(field('点击时执行', selNode.code, true, function (v) {
            selNode.code = v; render(); notify();
          }, '如：this.setState({ n: 0 })'));
        }
      }
      /* 逻辑：输入框写入状态 */
      if (selNode.type === 'input') {
        insp.appendChild(selectField('输入值', selNode.bind === 'v' ? 'v' : 'none', [
          ['none', '不保存'], ['v', '写入 this.state.v']
        ], function (v) { selNode.bind = v; render(); notify(); }));
      }

      const ops = document.createElement('div');
      ops.className = 'ub-ops';
      [['上移', -1], ['下移', 1]].forEach(function (p) {
        const b = document.createElement('button');
        b.className = 'ub-op';
        b.textContent = p[0];
        b.addEventListener('click', function () { moveNode(sel, p[1]); });
        ops.appendChild(b);
      });
      const dup = document.createElement('button');
      dup.className = 'ub-op';
      dup.textContent = '复制';
      dup.addEventListener('click', function () { dupNode(sel); });
      ops.appendChild(dup);
      const del = document.createElement('button');
      del.className = 'ub-op ub-op-danger';
      del.textContent = '删除';
      del.addEventListener('click', function () { removeNode(sel); });
      ops.appendChild(del);
      insp.appendChild(ops);
    }

    function render() {
      renderCanvas();
      renderInsp();
    }

    render();
    return { render: function () { render(); } };
  }

  NS.apps.appstudioUI = {
    TYPES: TYPES, ORDER: ORDER, mount: mount, genCode: genCode,
    parseCode: parseCode, styleOf: styleOf, previewNode: previewNode
  };
})(window);
