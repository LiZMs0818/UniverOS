/* ============================================================
   Universe OS · 渲染层 · controls.js
   通用表单控件（声明式）：Switch / Slider / Seg / MiniButton / KVRow / SectionTitle / ListItem / ActionButton
   所有应用复用的控件都从这里取，消灭重复模板
   ============================================================ */
(function (G) {
  'use strict';
  const NS = (G.UniverOS = G.UniverOS || {});
  NS.render = NS.render || {};
  const h = NS.render.h;

  const cls = (...args) => args.filter(Boolean).join(' ');

  /* 开关（label.st-switch > input + span.track） */
  function Switch(value, onChange) {
    return h('label', { className: 'st-switch' }, [
      h('input', { type: 'checkbox', checked: !!value, onchange: e => onChange(e.target.checked) }),
      h('span', { className: 'track' })
    ]);
  }

  /* 滑块 + 可选数值标签（st-row .ctrl 内嵌） */
  function Slider(opts) {
    const out = [h('input', {
      type: 'range', className: cls('st-slider', opts.className),
      min: opts.min, max: opts.max, step: opts.step || 1, value: opts.value,
      oninput: e => opts.onInput && opts.onInput(parseFloat(e.target.value), e),
      onchange: e => opts.onChange && opts.onChange(parseFloat(e.target.value), e)
    })];
    if (opts.showVal) out.push(h('span', { className: 'st-slider-val' }, opts.format ? opts.format(opts.value) : String(opts.value)));
    return h('div', { className: cls('st-row-ctrl', opts.wrapClass) }, out);
  }

  /* 分段选择（st-seg） */
  function Seg(options, value, onChange) {
    return h('div', { className: 'st-seg' }, options.map(o =>
      h('button', { className: o.id === value ? 'active' : '', onclick: () => onChange(o.id, o) }, o.label)));
  }

  /* 迷你按钮 */
  function MiniButton(opts) {
    return h('button', {
      className: cls('mini-btn', opts.primary && 'primary', opts.danger && 'danger', opts.className),
      onclick: opts.onClick,
      disabled: opts.disabled,
      title: opts.title
    }, opts.label);
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

  NS.render.controls = { cls, Switch, Slider, Seg, MiniButton, KVRow, SectionTitle, ListItem, ActionButton };
})(window);
