/* ============================================================
   Universe OS · 软件层 · vault.js
   Universe Vault —— 本地 AI 对话（WebLLM / WebGPU）
   模型 Qwen2.5-0.5B-Instruct-q4f16_1-MLC，权重不入库：
   首次使用时提示下载（系统级子窗口），缓存由 WebLLM 自己管。
   ============================================================ */
(function (G) {
  'use strict';
  const NS = (G.UniverOS = G.UniverOS || {});
  NS.apps = NS.apps || {};
  const h = NS.render.h;
  const Component = NS.render.Component;
  const { store } = NS.core;
  const { escapeHtml } = NS.core.utils;
  const { toast, confirmDialog, promptDialog, menu: Menu } = NS.render;

  const LIBS = 'https://fastly.jsdelivr.net/npm/@mlc-ai/web-llm@0.2.87/lib/index.js';
  const WASM_BASE = 'https://cdn.jsdelivr.net/gh/mlc-ai/binary-mlc-llm-libs@main/web-llm-models/v0_2_87/base/';

  /* f16 内核在 Maxwell 及更老的显卡上编不出来（缺 shader-f16），那种机器上换 f32 内核 */
  const MODEL = {
    name: 'Qwen2.5-0.5B',
    sizeMB: 265,
    lib: LIBS,
    variants: {
      f16: {
        id: 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC',
        wasm: WASM_BASE + 'Qwen2-0.5B-Instruct-q4f16_1_cs1k-webgpu.wasm'
      },
      f32: {
        id: 'Qwen2.5-0.5B-Instruct-q4f32_1-MLC',
        wasm: WASM_BASE + 'Qwen2-0.5B-Instruct-q4f32_1_cs1k-webgpu.wasm'
      }
    }
  };

  const weightsOf = id => 'https://modelscope.cn/models/mlc-ai/' + id + '/resolve/master/';

  function appConfigOf(v) {
    return {
      cacheBackend: 'cache',
      model_list: [{
        model_id: v.id,
        model: weightsOf(v.id),
        model_lib: v.wasm,
        vram_required_MB: 945,
        low_resource_required: true,
        overrides: { context_window_size: 4096 }
      }]
    };
  }

  const DEFAULT_SETTINGS = {
    system: '你是 Universe Vault 的本地助手。用简体中文回答，简洁、准确，必要时给步骤。',
    temperature: 0.8,
    maxTokens: 512,
    history: 12,
    think: false
  };

  const uid = () => 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  function phaseText(raw) {
    const t = String(raw || '').toLowerCase();
    if (!t) return '准备中';
    if (t.indexOf('fetch') >= 0) return '下载';
    if (t.indexOf('load') >= 0) return '加载';
    if (t.indexOf('shader') >= 0 || t.indexOf('compil') >= 0) return '编译';
    if (t.indexOf('finish') >= 0 || t.indexOf('ready') >= 0) return '完成';
    return '准备中';
  }

  function relTime(ts) {
    const d = Date.now() - ts;
    if (d < 60e3) return '刚刚';
    if (d < 3600e3) return Math.floor(d / 60e3) + ' 分钟前';
    if (d < 86400e3) return Math.floor(d / 3600e3) + ' 小时前';
    const t = new Date(ts);
    return (t.getMonth() + 1) + '/' + t.getDate();
  }

  /* 极简 Markdown：先转义，再只认标题/列表/粗体/行内码/代码块/链接 */
  function md(src) {
    let t = escapeHtml(String(src == null ? '' : src));
    const blocks = [];
    t = t.replace(/```([\s\S]*?)```/g, function (_, code) {
      blocks.push('<pre class="vault-code"><code>' + code.replace(/^\n/, '') + '</code></pre>');
      return '\u0000' + (blocks.length - 1) + '\u0000';
    });
    t = t.replace(/`([^`\n]+)`/g, '<code class="vault-inline">$1</code>');
    t = t.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
    t = t.replace(/^### (.+)$/gm, '<div class="vault-h3">$1</div>');
    t = t.replace(/^## (.+)$/gm, '<div class="vault-h2">$1</div>');
    t = t.replace(/^# (.+)$/gm, '<div class="vault-h1">$1</div>');
    t = t.replace(/^\s*[-*] (.+)$/gm, '<div class="vault-li">· $1</div>');
    t = t.replace(/^\s*(\d+)\. (.+)$/gm, '<div class="vault-li">$1. $2</div>');
    t = t.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    t = t.replace(/\n{2,}/g, '<div class="vault-gap"></div>');
    t = t.replace(/\n/g, '<br>');
    t = t.replace(/\u0000(\d+)\u0000/g, function (_, i) { return blocks[+i]; });
    return t;
  }

  /* 引擎与运行库常驻进程级：窗口关掉再开、组件重建都不用重新加载模型 */
  const RT = { engine: null, webllm: null, variant: null, kernel: '' };

  class VaultApp extends Component {
    constructor(props) {
      super(props);
      this.initialState = {
        chats: [], activeId: null, view: 'chat', query: '',
        model: RT.engine ? 'ready' : 'idle', pct: RT.engine ? 100 : 0, pctText: '', status: '', generating: false, rev: 0
      };
      this._settings = Object.assign({}, DEFAULT_SETTINGS, store.get('vault.settings', {}));
      /* 老版本存过 0.7 的默认温度：一次性抬到 0.8，之后用户自己调的值不再覆盖 */
      if (!store.get('vault.tempRaised', false)) {
        this._settings.temperature = 0.8;
        if (this._settings.think == null) this._settings.think = false;
        store.set('vault.settings', this._settings);
        store.set('vault.tempRaised', true);
      }
      this._draft = '';
      this._engine = RT.engine;
      this._webllm = RT.webllm;
      this._variant = RT.variant;
      this._kernel = RT.kernel;
      this._loading = null;
      this._pending = '';
      this._flushTimer = null;
      this._saveTimer = null;
      this._abort = false;
      this._startedAt = 0;
      this._lastTokens = 0;
      this._msgsEl = null;
      this._taEl = null;
      this._stickBottom = true;
    }

    /* ---------- 数据 ---------- */
    loadChats() {
      const arr = store.get('vault.chats', null);
      let chats = Array.isArray(arr) ? arr : [];
      chats = chats.filter(c => c && Array.isArray(c.messages)).map(c => ({
        id: c.id || uid(),
        title: c.title || '新对话',
        createdAt: c.createdAt || Date.now(),
        updatedAt: c.updatedAt || Date.now(),
        messages: c.messages.map(m => ({
          role: m.role, content: String(m.content || ''), ts: m.ts || 0, usage: m.usage || null, think: m.think || null
        }))
      }));
      /* 空对话只留一条，避免「新对话」堆成一片 */
      let blanks = 0;
      chats = chats.filter(c => (c.messages.length ? true : (blanks++, blanks === 1)));
      if (!chats.length) {
        chats = [{ id: uid(), title: '新对话', createdAt: Date.now(), updatedAt: Date.now(), messages: [] }];
      }
      chats.sort((a, b) => b.updatedAt - a.updatedAt);
      this.setState({ chats, activeId: chats[0].id });
    }

    scheduleSave() {
      clearTimeout(this._saveTimer);
      this._saveTimer = setTimeout(() => {
        store.set('vault.chats', this.state.chats);
      }, 200);
    }

    saveNow() {
      clearTimeout(this._saveTimer);
      store.set('vault.chats', this.state.chats);
      store.set('vault.settings', this._settings);
    }

    active() {
      const s = this.state;
      return s.chats.find(c => c.id === s.activeId) || null;
    }

    /* ---------- 模型 ---------- */
    async importLib() {
      if (RT.webllm) { this._webllm = RT.webllm; return RT.webllm; }
      const mod = await import(MODEL.lib);
      RT.webllm = mod;
      this._webllm = mod;
      return mod;
    }

    async pickVariant() {
      if (RT.variant) { this._variant = RT.variant; this._kernel = RT.kernel; return RT.variant; }
      let ad = null;
      try { ad = await G.navigator.gpu.requestAdapter(); } catch (e) {}
      const f16 = !!(ad && ad.features && ad.features.has && ad.features.has('shader-f16'));
      RT.variant = f16 ? MODEL.variants.f16 : MODEL.variants.f32;
      RT.kernel = f16 ? 'f16' : 'f32';
      this._variant = RT.variant;
      this._kernel = RT.kernel;
      return RT.variant;
    }

    async checkCached() {
      try {
        const w = await this.importLib();
        const v = await this.pickVariant();
        return !!(w.hasModelInCache && (await w.hasModelInCache(v.id, appConfigOf(v))));
      } catch (e) { return false; }
    }

    async askDownload() {
      const ok = await confirmDialog('需要下载 ' + MODEL.name + '（' + MODEL.sizeMB + ' MB）。', {
        title: '下载模型',
        okLabel: '下载',
        cancelLabel: '取消',
        danger: false,
        owner: 'vault'
      });
      return ok === true;
    }

    async ensureModel() {
      const s = this.state;
      if (RT.engine) {
        this._engine = RT.engine;
        if (s.model !== 'ready') this.setState({ model: 'ready', pct: 100, pctText: '', status: '' });
        return RT.engine;
      }
      if (s.model === 'ready') return this._engine;
      if (this._loading) return this._loading;
      if (!G.navigator || !G.navigator.gpu) {
        this.setState({ model: 'error', status: '这台设备的浏览器没有开放 WebGPU，跑不了本地模型。' });
        return null;
      }

      this._loading = (async () => {
        this.setState({ model: 'need', pct: 0, pctText: '', status: '' });
        let w;
        try { w = await this.importLib(); } catch (e) {
          this._loading = null;
          this.setState({ model: 'error', status: '运行库加载失败：' + (e && e.message || e) });
          return null;
        }
        let cached = false;
        const v = await this.pickVariant();
        const cfg = appConfigOf(v);
        try { cached = !!(w.hasModelInCache && await w.hasModelInCache(v.id, cfg)); } catch (e) {}
        if (!cached) {
          const ok = await this.askDownload();
          if (!ok) {
            this._loading = null;
            this.setState({ model: 'need', pct: 0, pctText: '', status: '' });
            return null;
          }
        }
        this.setState({ model: 'loading', pct: 0, pctText: '准备中', status: '' });
        let lastAt = 0;
        try {
          const engine = await w.CreateMLCEngine(v.id, {
            appConfig: cfg,
            initProgressCallback: (r) => {
              const now = Date.now();
              if (now - lastAt < 120 && (r.progress || 0) < 0.999) return;
              lastAt = now;
              this.setState({
                pct: Math.round((r.progress || 0) * 100),
                pctText: phaseText(r.text)
              });
            }
          });
          this._engine = engine;
          RT.engine = engine;
          this._loading = null;
          this.setState({ model: 'ready', pct: 100, pctText: '', status: '' });
          return engine;
        } catch (e) {
          this._loading = null;
          this.setState({ model: 'error', status: '模型加载失败：' + (e && e.message || e) });
          return null;
        }
      })();
      return this._loading;
    }

    async unloadCache() {
      const ok = await confirmDialog('清除本机缓存的模型文件？下次使用要重新下载 ' + MODEL.sizeMB + 'MB。', {
        title: '清除模型缓存', okLabel: '清除', danger: true, owner: 'vault'
      });
      if (!ok) return;
      try {
        const w = await this.importLib();
        for (const k in MODEL.variants) {
          const v = MODEL.variants[k];
          try { await w.deleteModelAllInfoInCache(v.id, appConfigOf(v)); } catch (e) {}
        }
        this._engine = null;
        RT.engine = null;
        this._loading = null;
        this.setState({ model: 'idle', pct: 0, pctText: '', status: '模型缓存已清除。' });
        toast('模型缓存已清除');
      } catch (e) {
        this.setState({ status: '清除失败：' + (e && e.message || e) });
      }
    }

    /* ---------- 对话 ---------- */
    newChat() {
      if (this.state.generating) this.stop();
      const cur = this.active();
      if (cur && !cur.messages.length) {
        this.setState({ view: 'chat', query: '' });
        setTimeout(() => this._taEl && this._taEl.focus(), 80);
        return;
      }
      const chat = { id: uid(), title: '新对话', createdAt: Date.now(), updatedAt: Date.now(), messages: [] };
      const chats = [chat].concat(this.state.chats);
      this.setState({ chats, activeId: chat.id, view: 'chat', query: '' });
      this.scheduleSave();
      setTimeout(() => this._taEl && this._taEl.focus(), 80);
    }

    openChat(id) {
      if (id === this.state.activeId) return;
      if (this.state.generating) this.stop();
      this.setState({ activeId: id, view: 'chat', query: '' });
      this._stickBottom = true;
    }

    renameChat(chat) {
      promptDialog('重命名对话', chat.title, { title: '重命名', owner: 'vault' }).then(v => {
        if (!v) return;
        chat.title = v.slice(0, 40);
        chat.updatedAt = Date.now();
        this.setState({ chats: this.state.chats.slice() });
        this.scheduleSave();
      });
    }

    deleteChat(chat) {
      confirmDialog('删除对话「' + chat.title + '」？', { title: '删除对话', okLabel: '删除', owner: 'vault' }).then(ok => {
        if (!ok) return;
        let chats = this.state.chats.filter(c => c.id !== chat.id);
        if (!chats.length) chats = [{ id: uid(), title: '新对话', createdAt: Date.now(), updatedAt: Date.now(), messages: [] }];
        const activeId = chats.some(c => c.id === this.state.activeId) ? this.state.activeId : chats[0].id;
        this.setState({ chats, activeId });
        this.scheduleSave();
      });
    }

    stop() {
      this._abort = true;
      try { this._engine && this._engine.interruptGenerate(); } catch (e) {}
    }

    async send(text) {
      const s = this.state;
      if (s.generating) return;
      const content = String(text == null ? this._draft : text).trim();
      if (!content) return;
      const chat = this.active();
      if (!chat) return;

      const engine = await this.ensureModel();
      if (!engine) {
        this.setState({ rev: s.rev + 1 });
        return;
      }

      this._draft = '';
      if (this._taEl) { this._taEl.value = ''; this._taEl.style.height = 'auto'; }
      this._stickBottom = true;

      chat.messages.push({ role: 'user', content, ts: Date.now(), usage: null });
      chat.messages.push({ role: 'assistant', content: '', ts: Date.now(), usage: null, streaming: true });
      if (chat.title === '新对话') chat.title = content.slice(0, 18) + (content.length > 18 ? '…' : '');
      chat.updatedAt = Date.now();
      const chats = this.state.chats.slice().sort((a, b) => b.updatedAt - a.updatedAt);
      this.setState({ chats, generating: true, rev: s.rev + 1, status: '' });
      this.scheduleSave();

      const cfg = this._settings;
      const msgs = [];
      if (cfg.system && cfg.system.trim()) msgs.push({ role: 'system', content: cfg.system.trim() });
      const hist = chat.messages.filter(m => (m.role === 'user' || m.role === 'assistant') && m.content && !m.streaming);
      const keep = Math.max(2, Math.min(40, Number(cfg.history) || 12)) + 1;
      hist.slice(-keep).forEach(m => msgs.push({ role: m.role, content: m.content }));

      this._abort = false;
      this._pending = '';
      this._lastTokens = 0;
      this._startedAt = Date.now();
      try {
        /* 深度思考：先用一次小预算的分析调用，把要点塞回上下文再正式作答 */
        if (cfg.think && !this._abort) {
          const lastMsg = chat.messages[chat.messages.length - 1];
          lastMsg.thinking = true;
          this.setState({ rev: this.state.rev + 1 });
          let plan = '';
          try {
            const a = await engine.chat.completions.create({
              messages: msgs.concat([{ role: 'user', content: '先分析上面的问题：列出关键点与解题思路，不超过 80 字，不要给出最终答案。' }]),
              temperature: 0.4,
              max_tokens: 96,
              stream: false
            });
            plan = ((a.choices && a.choices[0] && a.choices[0].message && a.choices[0].message.content) || '').trim();
          } catch (e) {}
          lastMsg.thinking = false;
          if (plan) {
            lastMsg.think = plan;
            /* system 必须是第一条，草稿并进开头那条 system，不能追加到对话末尾 */
            const note = '内部推理草稿（仅供你参考，不要复述）：\n' + plan + '\n直接据此给出最终回答。';
            if (msgs.length && msgs[0].role === 'system') {
              msgs[0] = { role: 'system', content: msgs[0].content + '\n\n' + note };
            } else {
              msgs.unshift({ role: 'system', content: note });
            }
          }
          this.setState({ rev: this.state.rev + 1 });
        }
        if (this._abort) {
          this.flushDelta(true);
          this.setState({ generating: false, rev: this.state.rev + 1 });
          return;
        }
        const stream = await engine.chat.completions.create({
          messages: msgs,
          temperature: Number(cfg.temperature) || 0.8,
          top_p: 0.9,
          repetition_penalty: 1.05,
          max_tokens: Math.max(32, Math.min(2048, Number(cfg.maxTokens) || 512)),
          stream: true,
          stream_options: { include_usage: true }
        });
        for await (const chunk of stream) {
          if (this._abort) break;
          const d = chunk && chunk.choices && chunk.choices[0] && chunk.choices[0].delta;
          const piece = d && d.content ? d.content : '';
          if (piece) this.pushDelta(piece);
          if (chunk && chunk.usage) this._lastTokens = chunk.usage.completion_tokens || 0;
        }
      } catch (e) {
        const msg = (e && e.message) || String(e);
        if (!this._abort) this.pushDelta('\n\n[出错了] ' + msg);
        this.setState({ status: '生成中断：' + msg });
      }
      this.flushDelta(true);
      const last = chat.messages[chat.messages.length - 1];
      if (last) {
        last.streaming = false;
        if (this._lastTokens) {
          last.usage = {
            tokens: this._lastTokens,
            tps: Math.round(this._lastTokens / Math.max(0.1, (Date.now() - this._startedAt) / 1000) * 10) / 10
          };
        }
      }
      chat.updatedAt = Date.now();
      this.setState({ generating: false, rev: this.state.rev + 1 });
      this.scheduleSave();
    }

    pushDelta(piece) {
      this._pending += piece;
      if (this._flushTimer) return;
      this._flushTimer = setTimeout(() => {
        this._flushTimer = null;
        this.flushDelta(false);
      }, 80);
    }

    flushDelta(final) {
      clearTimeout(this._flushTimer);
      this._flushTimer = null;
      if (this._pending) {
        const chat = this.active();
        const last = chat && chat.messages[chat.messages.length - 1];
        if (last && last.role === 'assistant') last.content += this._pending;
        this._pending = '';
      }
      this.setState({ rev: (this.state.rev || 0) + 1 });
    }

    regenerate() {
      const chat = this.active();
      if (!chat || this.state.generating) return;
      let i = chat.messages.length - 1;
      while (i >= 0 && chat.messages[i].role !== 'assistant') i--;
      if (i < 0) return;
      chat.messages.splice(i, 1);
      let q = '';
      for (let k = chat.messages.length - 1; k >= 0; k--) {
        if (chat.messages[k].role === 'user') { q = chat.messages[k].content; break; }
      }
      if (!q) return;
      chat.messages.pop();
      this.setState({ chats: this.state.chats.slice(), rev: this.state.rev + 1 });
      this.send(q);
    }

    copy(text) {
      const done = () => toast('已复制');
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(done, () => this.copyFallback(text, done));
          return;
        }
      } catch (e) {}
      this.copyFallback(text, done);
    }

    copyFallback(text, done) {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.cssText = 'position:fixed;left:-9999px;top:0;';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); done(); } catch (e) { toast('复制失败'); }
      ta.remove();
    }

    /* ---------- 渲染 ---------- */
    render() {
      const s = this.state;
      if (s.view === 'settings') return this.renderSettings();
      const chat = this.active();
      const msgs = chat ? chat.messages : [];
      return h('div', { className: 'vault' }, [
        this.renderHead(chat),
        h('div', {
          className: 'vault-body',
          ref: el => (this._msgsEl = el),
          onscroll: e => {
            const el = e.currentTarget;
            this._stickBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
          }
        }, msgs.length ? msgs.map((m, i) => this.renderMsg(m, i, msgs)) : this.renderEmpty()),
        this.renderCompose()
      ]);
    }

    renderHead(chat) {
      const s = this.state;
      const I = NS.render.icons;
      const stateText = {
        idle: '未加载', need: '未下载', loading: s.pct + '%',
        ready: '已就绪', error: '不可用'
      }[s.model] || '未加载';
      const ib = (svg, title, fn, cls) => h('button', {
        className: 'vault-ib' + (cls ? ' ' + cls : ''), title: title,
        onclick: fn, html: svg
      });
      return h('div', { className: 'vault-head' }, [
        h('div', { className: 'vault-title' }, chat ? chat.title : ''),
        h('div', { className: 'vault-grow' }),
        h('button', {
          className: 'vault-state' + (s.model === 'ready' ? ' ok' : '') + (s.model === 'error' ? ' bad' : ''),
          title: '模型状态',
          onclick: () => this.setState({ view: 'settings' })
        }, [h('span', { className: 'vault-dot' }), stateText]),
        ib(I.UI.plus, '新建对话', () => this.newChat()),
        ib(I.APPS.settings, '设置', () => this.setState({ view: 'settings' }))
      ]);
    }

    renderMsg(m, i, all) {
      const assistant = m.role === 'assistant';
      const streaming = !!m.streaming;
      const lastAssistant = assistant && i === all.length - 1;
      const I = NS.render.icons.UI;
      const ib = (svg, title, fn) => h('button', {
        className: 'vault-mib', title: title, onclick: fn, html: svg
      });
      const open = this._thinkOpen && this._thinkOpen[i];
      return h('div', { className: 'vault-msg' + (assistant ? ' bot' : ' user') }, [
        m.thinking
          ? h('div', { className: 'vault-think-t dim' }, '思考中…')
          : null,
        m.think
          ? h('div', { className: 'vault-think' + (open ? ' open' : '') }, [
              h('button', {
                className: 'vault-think-t', onclick: () => {
                  this._thinkOpen = this._thinkOpen || {};
                  this._thinkOpen[i] = !this._thinkOpen[i];
                  this.setState({ rev: this.state.rev + 1 });
                }
              }, [
                h('span', { className: 'vault-think-i', html: I.spark }),
                h('span', null, '思考过程'),
                h('span', { className: 'vault-think-c', html: I.right })
              ]),
              open ? h('div', { className: 'vault-think-b' }, m.think) : null
            ])
          : null,
        streaming || assistant
          ? h('div', { className: 'vault-text', html: streaming ? '<span class="vault-plain">' + escapeHtml(m.content) + '</span>' : md(m.content) })
          : h('div', { className: 'vault-text' }, m.content),
        h('div', { className: 'vault-meta' }, [
          assistant && m.usage
            ? h('span', null, m.usage.tokens + ' tokens · ' + m.usage.tps + ' tok/s')
            : null,
          assistant ? ib(I.copy, '复制', () => this.copy(m.content)) : h('button', {
            className: 'vault-mib', title: '复制', onclick: () => this.copy(m.content), html: I.copy
          }),
          lastAssistant && !this.state.generating
            ? ib(I.refresh, '重新生成', () => this.regenerate())
            : null
        ].filter(Boolean))
      ]);
    }

    renderEmpty() {
      const tips = ['用一句话解释什么是 WebGPU', '写一条匹配邮箱的正则', '把这段话改得更简洁：…'];
      return h('div', { className: 'vault-empty' }, [
        h('div', { className: 'vault-empty-t' }, '有什么可以帮你？'),
        h('div', { className: 'vault-tips' }, tips.map(t => h('button', {
          className: 'vault-tip',
          onclick: () => { this.send(t); }
        }, t)))
      ]);
    }

    renderSidebar() {
      const s = this.state;
      const I = NS.render.icons.UI;
      const q = s.query.trim().toLowerCase();
      const list = s.chats.filter(c => {
        if (!q) return true;
        if (c.title.toLowerCase().indexOf(q) >= 0) return true;
        return c.messages.some(m => m.content && m.content.toLowerCase().indexOf(q) >= 0);
      });
      return h('div', null, [
        h('input', {
          className: 'vault-search', placeholder: '搜索', value: s.query,
          oninput: e => this.setState({ query: e.target.value })
        }),
        h('div', { className: 'vault-side-t' }, '对话'),
        !list.length
          ? h('div', { className: 'sidebar-empty' }, q ? '没有匹配的对话' : '还没有对话')
          : h('div', { className: 'vault-chatlist' }, list.map(c => h('button', {
              className: 'sidebar-list-item' + (c.id === s.activeId ? ' active' : ''),
              onclick: () => this.openChat(c.id),
              oncontextmenu: ev => {
                ev.preventDefault();
                Menu.showMenu(ev.clientX, ev.clientY, [
                  { label: '打开', action: () => this.openChat(c.id) },
                  { label: '重命名', action: () => this.renameChat(c) },
                  { sep: true },
                  { label: '删除', danger: true, action: () => this.deleteChat(c) }
                ]);
              }
            }, [
              h('span', { className: 'sli-icon', html: I.note }),
              h('span', { className: 'sli-text' }, escapeHtml(c.title)),
              h('span', { className: 'sli-meta' }, relTime(c.updatedAt))
            ])))
      ]);
    }

    renderCompose() {
      const s = this.state;
      const I = NS.render.icons.UI;
      const loading = s.model === 'loading';
      return h('div', { className: 'vault-compose' }, [
        loading
          ? h('div', { className: 'vault-load' }, [
              h('div', { className: 'vault-load-t' }, (s.pctText || '正在加载') + ' · ' + s.pct + '%'),
              h('div', { className: 'vault-bar' }, [
                h('div', { className: 'vault-bar-fill', style: 'width:' + Math.max(2, s.pct) + '%' })
              ])
            ])
          : null,
        s.status ? h('div', { className: 'vault-status' }, s.status) : null,
        h('div', { className: 'vault-tools' }, [
          h('button', {
            className: 'vault-mode' + (this._settings.think ? ' on' : ''),
            title: '深度思考',
            onclick: () => {
              this._settings.think = !this._settings.think;
              store.set('vault.settings', this._settings);
              this.setState({ rev: s.rev + 1 });
            }
          }, [
            h('span', { className: 'vault-mode-i', html: I.spark }),
            h('span', null, '深度思考')
          ])
        ]),
        h('div', { className: 'vault-box' }, [
          h('textarea', {
            className: 'vault-input',
            rows: 1,
            placeholder: '发消息',
            spellcheck: 'false',
            value: this._draft,
            ref: el => {
              this._taEl = el;
              if (el && !el._vaultBound) {
                el._vaultBound = true;
                el.addEventListener('input', () => {
                  this._draft = el.value;
                  el.style.height = 'auto';
                  el.style.height = Math.min(el.scrollHeight, 160) + 'px';
                });
                el.addEventListener('keydown', ev => {
                  if (ev.key === 'Enter' && !ev.shiftKey && !ev.isComposing) {
                    ev.preventDefault();
                    this.send();
                  }
                });
              }
            }
          }),
          s.generating
            ? h('button', { className: 'vault-send stop', title: '停止', onclick: () => this.stop(), html: I.stop })
            : h('button', { className: 'vault-send', title: '发送', onclick: () => this.send(), html: I.up })
        ])
      ]);
    }

    renderSettings() {
      const cfg = this._settings;
      const s = this.state;
      const I = NS.render.icons.UI;
      const row = (l, v) => h('div', { className: 'vault-row' }, [
        h('div', { className: 'vault-row-l' }, l),
        h('div', { className: 'vault-row-v' }, v)
      ]);
      const stateText = {
        idle: '未加载', need: '未下载', loading: s.pct + '%',
        ready: '已就绪', error: '不可用'
      }[s.model] || '未加载';
      return h('div', { className: 'vault' }, [
        h('div', { className: 'vault-head' }, [
          h('button', {
            className: 'vault-ib', title: '返回',
            onclick: () => this.setState({ view: 'chat' }), html: I.left
          }),
          h('div', { className: 'vault-title' }, '设置'),
          h('div', { className: 'vault-grow' })
        ]),
        h('div', { className: 'vault-settings' }, [
          h('div', { className: 'vault-sec' }, [
            h('div', { className: 'vault-sec-t' }, '模型'),
            row('模型', MODEL.name),
            row('内核', this._kernel || '检测中'),
            row('状态', stateText),
            row('大小', MODEL.sizeMB + ' MB'),
            h('div', { className: 'vault-acts' }, [
              h('button', { className: 'mini-btn', onclick: () => this.unloadCache() }, '清除缓存')
            ])
          ]),
          h('div', { className: 'vault-sec' }, [
            h('div', { className: 'vault-sec-t' }, '对话'),
            h('label', { className: 'vault-field' }, [
              h('span', null, '系统提示词'),
              h('textarea', {
                className: 'vault-ta', rows: 3, value: cfg.system,
                oninput: e => { cfg.system = e.target.value; }
              })
            ]),
            h('div', { className: 'vault-field' }, [
              h('span', null, '温度'),
              NS.render.controls.Slider({
                min: 0, max: 1.5, step: 0.05, value: cfg.temperature, showVal: true, width: '100%',
                wrapClass: 'vault-range-wrap',
                onInput: v => { cfg.temperature = Number(v); }
              })
            ]),
            h('label', { className: 'vault-field' }, [
              h('span', null, '最大输出 tokens'),
              h('input', {
                className: 'vault-num', type: 'number', min: 32, max: 2048, step: 32, value: cfg.maxTokens,
                oninput: e => { cfg.maxTokens = Number(e.target.value); }
              })
            ]),
            h('label', { className: 'vault-field' }, [
              h('span', null, '上下文消息条数'),
              h('input', {
                className: 'vault-num', type: 'number', min: 2, max: 40, step: 2, value: cfg.history,
                oninput: e => { cfg.history = Number(e.target.value); }
              })
            ]),
            h('div', { className: 'vault-acts' }, [
              h('button', {
                className: 'mini-btn primary',
                onclick: () => {
                  this._settings.temperature = Number(cfg.temperature) || 0.7;
                  this._settings.maxTokens = Number(cfg.maxTokens) || 512;
                  this._settings.history = Number(cfg.history) || 12;
                  this.saveNow();
                  toast('设置已保存');
                  this.setState({ view: 'chat' });
                }
              }, '保存')
            ])
          ])
        ])
      ]);
    }

    /* ---------- 生命周期 ---------- */
    componentDidMount() {
      this.loadChats();
      const chip = () => {
        if (this._msgsEl && this._stickBottom) {
          this._msgsEl.scrollTop = this._msgsEl.scrollHeight;
        }
      };
      this._chip = chip;
    }

    componentDidUpdate() {
      if (this._msgsEl && this._stickBottom) this._msgsEl.scrollTop = this._msgsEl.scrollHeight;
      if (this._settings) store.set('vault.settings', this._settings);
    }

    componentWillUnmount() {
      this.stop();
      this.saveNow();
      clearTimeout(this._flushTimer);
      clearTimeout(this._saveTimer);
    }
  }

  NS.apps.VaultApp = VaultApp;
  NS.apps.buildVault = (body, sidebar) => new VaultApp().mount(body, sidebar);
})(window);
