/* ============================================================
   Universe OS · 软件层 · browser.js
   浏览器（声明式 Component）：书签、URL 规范化、iframe 嵌入、侧栏书签
   ============================================================ */
(function (G) {
  'use strict';
  const NS = (G.UniverOS = G.UniverOS || {});
  NS.apps = NS.apps || {};
  const h = NS.render.h;
  const Component = NS.render.Component;
  const { escapeHtml } = NS.core.utils;

  const BOOKMARKS = [
    { name: 'Example', url: 'https://example.com' },
    { name: 'Bing', url: 'https://www.bing.com' },
    { name: 'Wikipedia', url: 'https://zh.wikipedia.org' },
    { name: 'MDN', url: 'https://developer.mozilla.org' }
  ];

  class BrowserApp extends Component {
    constructor(props) {
      super(props);
      this.initialState = { url: '', showHome: true };
      this.frameRef = null;
      this.urlRef = null;
    }

    normalize(raw) {
      let u = (raw || '').trim();
      if (!u) return '';
      if (/^https?:\/\//i.test(u)) return u;
      if (/^[\w-]+(\.[\w-]+)+([\/?#].*)?$/.test(u)) return 'https://' + u;
      return 'https://www.bing.com/search?q=' + encodeURIComponent(u);
    }

    load(raw) {
      const u = this.normalize(raw);
      if (!u) return;
      this.setState({ url: u, showHome: false });
    }

    goHome() {
      this.setState({ url: '', showHome: true });
    }

    componentDidUpdate() {
      if (!this.state.showHome && this.frameRef) {
        this.frameRef.src = this.state.url;
      }
      if (this.urlRef) this.urlRef.value = this.state.url;
    }

    render() {
      const I = NS.render.icons.UI;
      return h('div', { className: 'br' }, [
        h('div', { className: 'br-bar' }, [
          h('button', { dataset: { br: 'home' }, onclick: () => this.goHome(), html: I.home }),
          h('button', { dataset: { br: 'reload' }, onclick: () => this.reload(), html: I.refresh }),
          h('input', {
            className: 'br-url', placeholder: '输入网址或搜索', autocomplete: 'off', spellcheck: 'false',
            ref: el => (this.urlRef = el),
            value: this.state.url,
            onkeydown: e => {
              if (e.key === 'Enter') {
                e.preventDefault();
                this.load(this.urlRef.value);
              }
            }
          })
        ]),
        h('div', { className: 'br-view' }, [
          this.state.showHome
            ? h('div', { className: 'br-home' }, [
                h('div', { className: 'br-tip' }, '部分网站禁止被嵌入（X-Frame-Options / CSP），可能显示空白。'),
                h('div', { className: 'br-grid' }, BOOKMARKS.map(b =>
                  h('button', { className: 'br-card', dataset: { url: b.url }, onclick: () => this.load(b.url) }, [
                    h('span', { className: 'br-card-ic', html: I.globe }),
                    h('span', null, b.name)
                  ])
                ))
              ])
            : null,
          h('iframe', {
            className: 'br-frame', referrerpolicy: 'no-referrer', ref: el => (this.frameRef = el),
            style: this.state.showHome ? 'display:none' : 'display:block'
          })
        ])
      ]);
    }

    reload() {
      if (!this.state.showHome && this.frameRef && this.frameRef.src) this.frameRef.src = this.frameRef.src;
    }

    renderSidebar() {
      const I = NS.render.icons.UI;
      return h('div', null, [
        h('div', { className: 'sidebar-section-title' }, '书签'),
        BOOKMARKS.map(b =>
          h('button', { className: 'sidebar-list-item', dataset: { url: b.url }, onclick: () => this.load(b.url) }, [
            h('span', { className: 'sli-icon', html: I.globe }),
            h('span', { className: 'sli-text' }, b.name)
          ])
        )
      ]);
    }
  }

  NS.apps.BrowserApp = BrowserApp;
  NS.apps.buildBrowser = (body, sidebar) => new BrowserApp().mount(body, sidebar);
})(window);
