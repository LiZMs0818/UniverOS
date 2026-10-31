/* ============================================================
   Universe OS · 软件层 · image-viewer.js
   图片查看器（声明式 Component）：blob → objectURL
   ============================================================ */
(function (G) {
  'use strict';
  const NS = (G.UniverOS = G.UniverOS || {});
  NS.apps = NS.apps || {};
  const h = NS.render.h;
  const Component = NS.render.Component;
  const { fs } = NS.core;
  const { escapeHtml } = NS.core.utils;

  class ImageViewerApp extends Component {
    constructor(props) {
      super(props);
      this.initialState = { error: null, url: null };
    }

    componentDidMount() {
      const path = (this.props && this.props.path) || '';
      fs.readBlob(path).then(blob => {
        const url = URL.createObjectURL(blob);
        this.setState({ url });
      }).catch(() => {
        this.setState({ error: true });
      });
    }

    render() {
      if (this.state.error) {
        return h('div', { style: 'padding:20px;color:var(--danger);font-size:13px' }, '无法读取「' + escapeHtml((this.props && this.props.path) || '') + '」');
      }
      return h('div', { className: 'iviewer' }, this.state.url ? [h('img', { src: this.state.url, alt: '' })] : []);
    }
  }

  NS.apps.ImageViewerApp = ImageViewerApp;
  NS.apps.buildImageViewer = (body, args) => new ImageViewerApp({ path: args && args.path }).mount(body);
})(window);
