/* ============================================================
   Universe OS · 软件层 · text-editor.js
   文本编辑器（声明式 Component）：读取文件、Ctrl+S 保存
   ============================================================ */
(function (G) {
  'use strict';
  const NS = (G.UniverOS = G.UniverOS || {});
  NS.apps = NS.apps || {};
  const h = NS.render.h;
  const Component = NS.render.Component;
  const { fs } = NS.core;
  const { escapeHtml } = NS.core.utils;
  const { toast } = NS.render;

  class TextEditorApp extends Component {
    constructor(props) {
      super(props);
      this.initialState = { error: null, ready: false };
      this.taRef = null;
      this.saveBtnRef = null;
    }

    componentDidMount() {
      const path = (this.props && this.props.path) || '';
      fs.read(path).then(content => {
        this.setState({ ready: true, content });
        setTimeout(() => {
          if (this.taRef) this.taRef.focus();
        }, 100);
      }).catch(err => {
        this.setState({ error: err.message || String(err), path });
      });
    }

    render() {
      const s = this.state;
      if (s.error != null) {
        return h('div', { style: 'padding:20px;color:var(--danger);font-size:13px' }, [
          '无法读取「' + escapeHtml(s.path || '') + '」',
          h('br'),
          escapeHtml(s.error)
        ]);
      }
      const path = (this.props && this.props.path) || '';
      return h('div', { className: 'editor' }, [
        h('div', { className: 'editor-bar' }, [
          h('span', { className: 'editor-path' }, '/' + escapeHtml(path)),
          h('button', { className: 'mini-btn primary', ref: el => (this.saveBtnRef = el), onclick: () => this.save() }, '保存')
        ]),
        h('textarea', {
          className: 'editor-body', spellcheck: 'false',
          ref: el => (this.taRef = el),
          value: s.ready ? s.content : '',
          onkeydown: e => {
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
              e.preventDefault();
              this.save();
            }
          }
        })
      ]);
    }

    save() {
      const path = (this.props && this.props.path) || '';
      fs.write(path, this.taRef ? this.taRef.value : '').then(() => toast('已保存'))
        .catch(err => toast('保存失败：' + err.message));
    }
  }

  NS.apps.TextEditorApp = TextEditorApp;
  NS.apps.buildTextEditor = (body, args) => new TextEditorApp({ path: args && args.path }).mount(body);
})(window);
