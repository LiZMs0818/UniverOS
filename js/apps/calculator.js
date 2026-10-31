/* ============================================================
   Universe OS · 软件层 · calculator.js
   计算器（声明式 Component）：键盘二维数组 + 状态机 cur/acc/op/fresh
   ============================================================ */
(function (G) {
  'use strict';
  const NS = (G.UniverOS = G.UniverOS || {});
  NS.apps = NS.apps || {};
  const h = NS.render.h;
  const Component = NS.render.Component;

  const KEYS = [
    ['ac', 'AC', 'fn'], ['neg', '±', 'fn'], ['pct', '%', 'fn'], ['/', '÷', 'op'],
    ['7', '7', ''], ['8', '8', ''], ['9', '9', ''], ['*', '×', 'op'],
    ['4', '4', ''], ['5', '5', ''], ['6', '6', ''], ['-', '−', 'op'],
    ['1', '1', ''], ['2', '2', ''], ['3', '3', ''], ['+', '+', 'op'],
    ['0', '0', 'span2'], ['.', '.', ''], ['=', '=', 'eq']
  ];

  class CalculatorApp extends Component {
    constructor(props) {
      super(props);
      this.initialState = { cur: '0', acc: null, op: null, fresh: true };
    }

    render() {
      return h('div', { className: 'calc' }, [
        h('div', { className: 'calc-disp' }, this.displayText()),
        h('div', { className: 'calc-keys' }, KEYS.map(k =>
          h('button', { className: k[2], dataset: { k: k[0] }, onclick: () => this.press(k[0]) }, k[1])
        ))
      ]);
    }

    displayText() {
      let t = this.state.cur;
      if (t !== '错误' && t.length > 14) t = Number(t).toExponential(6);
      return t;
    }

    apply(a, b, o) {
      switch (o) {
        case '+': return a + b;
        case '-': return a - b;
        case '*': return a * b;
        case '/': return b === 0 ? NaN : a / b;
      }
      return b;
    }

    press(k) {
      const s = this.state;
      let { cur, acc, op, fresh } = s;
      if (/^[0-9]$/.test(k)) {
        if (cur === '错误') { cur = '0'; fresh = true; }
        if (fresh) { cur = k; fresh = false; } else cur = cur === '0' ? k : cur + k;
        if (cur.replace('-', '').replace('.', '').length > 12) cur = cur.slice(0, cur[0] === '-' ? 13 : 12);
      } else if (k === '.') {
        if (cur === '错误') { cur = '0'; fresh = true; }
        if (fresh) { cur = '0.'; fresh = false; } else if (!cur.includes('.')) cur += '.';
      } else if (k === 'ac') {
        cur = '0'; acc = null; op = null; fresh = true;
      } else if (k === 'neg') {
        if (cur !== '错误') cur = cur.startsWith('-') ? cur.slice(1) : '-' + cur;
      } else if (k === 'pct') {
        if (cur !== '错误') cur = String(parseFloat(cur) / 100);
      } else if ('+-*/'.indexOf(k) >= 0) {
        const v = parseFloat(cur) || 0;
        if (op !== null && !fresh) {
          const r = this.apply(acc, v, op);
          acc = isNaN(r) || !isFinite(r) ? 0 : r;
          cur = String(+acc.toFixed(10));
        } else {
          acc = v;
        }
        op = k; fresh = true;
      } else if (k === '=') {
        if (op !== null) {
          const r = this.apply(acc, parseFloat(cur) || 0, op);
          cur = isNaN(r) || !isFinite(r) ? '错误' : String(+r.toFixed(10));
          acc = null; op = null; fresh = true;
        }
      }
      this.setState({ cur, acc, op, fresh });
    }
  }

  NS.apps.CalculatorApp = CalculatorApp;
  NS.apps.buildCalculator = body => new CalculatorApp().mount(body);
})(window);
