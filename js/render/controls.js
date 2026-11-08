/* ============================================================
   Universe OS · 渲染层 · controls.js
   系统统一控件：Button / Switch / Slider / Seg / Select /
   KVRow / SectionTitle / ListItem / ActionButton
   全系统只用这一套外观与 API，不允许各应用自己再造按钮。
   ============================================================ */
(function (G) {
  'use strict';
  const NS = (G.UniverOS = G.UniverOS || {});
  NS.render = NS.render || {};
  const h = NS.render.h;

  const cls = (...args) => args.filter(Boolean).join(' ');

  /* 按钮（胶囊，统一规格）
     opts: { label, kind:'default'|'primary'|'danger'|'quiet', icon, iconOnly, size:'md', onClick, disabled, title, className } */
  function Button(opts) {
    const o = opts || {};
    const kind = o.kind || (o.primary ? 'primary' : o.danger ? 'danger' : '');
    const iconOnly = !!o.iconOnly;
    return h('button', {
      type: 'button',
      className: cls('ui-btn', kind, iconOnly && 'icon', o.className),
      onclick: o.onClick,
      disabled: o.disabled,
      title: o.title || (iconOnly ? o.label : null),
      'aria-label': iconOnly ? o.label : null
    }, [
      o.icon ? h('span', { className: 'ui-btn-ic', html: o.icon }) : null,
      iconOnly ? null : (o.label || '')
    ].filter(Boolean));
  }

  /* 开关（胶囊 44×26） */
  function Switch(value, onChange, opts) {
    const o = opts || {};
    return h('label', { className: cls('ui-sw', o.className) }, [
      h('input', { type: 'checkbox', checked: !!value, onchange: e => onChange(e.target.checked) }),
      h('span', { className: 'track' })
    ]);
  }

  /* 滑块（轨道 4px + 白色圆头 + 已选段填充）
     opts: { min, max, step, value, onInput, onChange, showVal, format, className, width } */
  function Slider(opts) {
    const o = opts || {};
    const min = Number(o.min);
    const max = Number(o.max);
    const pctOf = v => {
      const p = max === min ? 0 : (Number(v) - min) / (max - min);
      return Math.max(0, Math.min(100, p * 100));
    };
    const input = h('input', {
      type: 'range', className: cls('ui-range', o.className),
      min: o.min, max: o.max, step: o.step || 1, value: o.value,
      style: '--pct:' + pctOf(o.value).toFixed(1) + '%' + (o.width ? ';flex:1;width:auto;min-width:0' : ''),
      oninput: e => {
        const v = parseFloat(e.target.value);
        e.target.style.setProperty('--pct', pctOf(v).toFixed(1) + '%');
        if (valEl) valEl.textContent = o.format ? o.format(v) : String(v);
        o.onInput && o.onInput(v, e);
      },
      onchange: e => o.onChange && o.onChange(parseFloat(e.target.value), e)
    });
    let valEl = null;
    const out = [input];
    if (o.showVal) {
      valEl = h('span', { className: 'ui-range-val' }, o.format ? o.format(o.value) : String(o.value));
      out.push(valEl);
    }
    return h('div', {
      className: cls('ui-range-wrap', o.wrapClass),
      style: o.width ? 'width:' + o.width : null
    }, out);
  }

  /* 分段选择（st-seg） */
  function Seg(options, value, onChange) {
    return h('div', { className: 'st-seg' }, options.map(o =>
      h('button', { className: o.id === value ? 'active' : '', onclick: () => onChange(o.id, o) }, o.label)));
  }

  /* 下拉选择（走系统菜单渲染层，不用原生 <select>；options = [[值, 文案], …]） */
  function Select(options, value, onChange, opts) {
    const o = opts || {};
    const list = options || [];
    const cur = list.filter(x => x[0] === value)[0] || list[0];
    return h('button', {
      type: 'button',
      className: cls('ctx-select', o.className),
      disabled: o.disabled,
      onclick: e => NS.render.menu.dropdown(e.currentTarget, list, value, onChange)
    }, [
      h('span', { className: 'ctx-select-label' }, cur ? cur[1] : ''),
      h('span', { className: 'ctx-select-caret' })
    ]);
  }

  /* 兼容旧调用：MiniButton 现在就是统一按钮 */
  function MiniButton(opts) {
    return Button(opts);
  }

  /* 键值行（st-row） */
  function KVRow(lbl, hint, ctrlNodes) {
    return h('div', { className: 'st-row' }, [
      h('div', { className: 'lbl' }, [lbl].concat(hint ? [h('div', { className: 'hint' }, hint)] : [])),
      h('div', { className: 'ctrl' }, ctrlNodes)
    ]);
  }

  /* 小节标题（h3 / app-h） */
  function SectionTitle(text, className) {
    return h('h3', { className: className || 'app-h' }, text);
  }

  /* 侧栏条目（sidebar-list-item） */
  function ListItem(opts) {
    return h('button', {
      className: cls('sidebar-list-item', opts.active && 'active'),
      onclick: opts.onClick,
      dataset: opts.dataset || {}
    }, [
      h('span', { className: 'sli-icon', html: opts.icon }),
      h('span', { className: 'sli-text' }, opts.text)
    ]);
  }

  /* 侧栏主操作按钮 */
  function ActionButton(opts) {
    return h('button', {
      className: cls('sidebar-action-btn', opts.ghost && 'ghost'),
      onclick: opts.onClick,
      style: opts.ghost ? 'background:var(--bg-input);color:var(--text)' : null
    }, opts.label);
  }

  NS.render.controls = { cls, Button, Switch, Slider, Seg, Select, MiniButton, KVRow, SectionTitle, ListItem, ActionButton };
})(window);
