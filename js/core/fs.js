/* ============================================================
   Universe OS · 系统层 · core/fs.js
   文件系统抽象：OPFS（持久化）优先，内存 FS 回退；含软配额 StorageQuota
   ============================================================ */
(function (G) {
  'use strict';
  const NS = (G.UniverOS = G.UniverOS || {});
  NS.core = NS.core || {};
  const store = NS.core.store;

  const StorageQuota = (() => {
    const DEF = 512 * 1024 * 1024;
    let cached = null, t = 0;
    function getLimit() { return store.get('storage.limit', DEF); }
    function setLimit(n) { store.set('storage.limit', n); invalidate(); }
    function invalidate() { cached = null; t = 0; }
    async function getUsage() {
      const now = Date.now();
      if (cached != null && now - t < 3000) return cached;
      try { const u = await FS.usage(); cached = u.used; t = now; return cached; } catch (e) { return 0; }
    }
    async function canGrow(b) { const u = await getUsage(); return u + b <= getLimit(); }
    return { getLimit, setLimit, getUsage, canGrow, invalidate };
  })();

  const FS = (() => {
    let backend = null, backendPromise = null, rootPromise = null;
    const memFS = new Map();

    async function detect() {
      if (backend) return backend;
      if (backendPromise) return backendPromise;
      backendPromise = (async () => {
        try {
          if (navigator.storage && navigator.storage.getDirectory) {
            await navigator.storage.getDirectory();
            backend = 'opfs';
            return backend;
          }
        } catch (e) {}
        backend = 'memory';
        return backend;
      })();
      return backendPromise;
    }

    async function getRoot() {
      if (!rootPromise) rootPromise = navigator.storage.getDirectory();
      return rootPromise;
    }

    async function opfsDirOf(path, create) {
      const parts = path.split('/').filter(Boolean);
      const name = parts.pop();
      let dir = await getRoot();
      for (const seg of parts) dir = await dir.getDirectoryHandle(seg, { create });
      return { dir, name };
    }

    /* 目录路径 → 目录句柄（path 为空时返回根） */
    async function opfsDir(path, create) {
      let dir = await getRoot();
      if (!path) return dir;
      for (const seg of path.split('/').filter(Boolean)) dir = await dir.getDirectoryHandle(seg, { create });
      return dir;
    }

    function memEnsureDirs(parts) {
      let cur = '';
      for (const p of parts) {
        cur = cur ? cur + '/' + p : p;
        if (!memFS.has(cur)) memFS.set(cur, { type: 'dir' });
      }
    }

    const api = {
      async backend() { return await detect(); },

      async write(path, data) {
        const be = await detect();
        const delta = await api._delta(path, data);
        if (delta > 0 && !(await StorageQuota.canGrow(delta))) throw new Error('存储空间不足');
        if (be === 'opfs') {
          const { dir, name } = await opfsDirOf(path, true);
          const fh = await dir.getFileHandle(name, { create: true });
          const w = await fh.createWritable();
          await w.write(data);
          await w.close();
        } else {
          const parts = path.split('/').filter(Boolean);
          parts.pop();
          memEnsureDirs(parts);
          const blob = data instanceof Blob ? data : new Blob([data]);
          memFS.set(path, { type: 'file', blob, size: blob.size, lastModified: Date.now() });
        }
        StorageQuota.invalidate();
        return true;
      },

      async read(path) {
        const be = await detect();
        if (be === 'opfs') {
          const { dir, name } = await opfsDirOf(path, false);
          const fh = await dir.getFileHandle(name);
          return await (await fh.getFile()).text();
        }
        const e = memFS.get(path);
        if (!e || e.type !== 'file') throw new Error('文件不存在');
        return await e.blob.text();
      },

      async readBlob(path) {
        const be = await detect();
        if (be === 'opfs') {
          const { dir, name } = await opfsDirOf(path, false);
          const fh = await dir.getFileHandle(name);
          return await fh.getFile();
        }
        const e = memFS.get(path);
        if (!e || e.type !== 'file') throw new Error('文件不存在');
        return e.blob;
      },

      async remove(path) {
        const be = await detect();
        if (be === 'opfs') {
          const { dir, name } = await opfsDirOf(path, false);
          await dir.removeEntry(name, { recursive: true });
        } else {
          memFS.delete(path);
          const p = path + '/';
          for (const k of Array.from(memFS.keys())) if (k.startsWith(p)) memFS.delete(k);
        }
        StorageQuota.invalidate();
      },

      async mkdir(path) {
        const be = await detect();
        if (be === 'opfs') {
          const { dir, name } = await opfsDirOf(path, true);
          await dir.getDirectoryHandle(name, { create: true });
        } else {
          memEnsureDirs(path.split('/').filter(Boolean));
        }
      },

      async rename(o, n) {
        const b = await api.readBlob(o);
        await api.write(n, b);
        await api.remove(o);
      },

      /* 移动/重命名，支持目录递归（文件走 rename 快速路径） */
      async moveEntry(from, to) {
        let isFile = false;
        try { await api.readBlob(from); isFile = true; } catch (e) {}
        if (isFile) { await api.rename(from, to); return; }
        await api.mkdir(to);
        const items = await api.list(from);
        for (const it of items) await api.moveEntry(from + '/' + it.name, to + '/' + it.name);
        await api.remove(from);
      },

      async list(path) {
        const be = await detect();
        if (be === 'opfs') {
          let dir;
          try { dir = await opfsDir(path, false); } catch (e) { return []; }
          const out = [];
          for await (const [name, h] of dir.entries()) {
            const it = { name, kind: h.kind };
            if (h.kind === 'file') {
              try { const f = await h.getFile(); it.size = f.size; it.lastModified = f.lastModified; } catch (e) {}
            }
            out.push(it);
          }
          return out;
        }
        const prefix = path ? path + '/' : '', out = [], seen = new Set();
        for (const [p, v] of memFS) {
          if (prefix && !p.startsWith(prefix)) continue;
          const rel = p.slice(prefix.length);
          if (!rel || rel.includes('/') || seen.has(rel)) continue;
          seen.add(rel);
          if (v.type === 'file') out.push({ name: rel, kind: 'file', size: v.size || 0, lastModified: v.lastModified || 0 });
          else out.push({ name: rel, kind: 'directory' });
        }
        return out;
      },

      async persist() {
        const be = await detect();
        if (be !== 'opfs') return false;
        if (!navigator.storage.persist) return false;
        if (await navigator.storage.persisted()) return true;
        return await navigator.storage.persist();
      },

      async usage() {
        const be = await detect();
        if (be === 'opfs') {
          const e = await navigator.storage.estimate();
          return { used: e.usage || 0, quota: e.quota || 0 };
        }
        let used = 0;
        for (const v of memFS.values()) if (v.type === 'file' && v.blob) used += v.blob.size;
        return { used, quota: 10 * 1024 * 1024 * 1024 };
      },

      async _delta(path, data) {
        let n = 0;
        if (typeof data === 'string') n = new Blob([data]).size;
        else if (data instanceof Blob) n = data.size;
        else if (data instanceof ArrayBuffer) n = data.byteLength;
        let o = 0;
        try { const b = await api.readBlob(path); o = b.size; } catch (e) {}
        return Math.max(0, n - o);
      }
    };

    return api;
  })();

  document.addEventListener('pointerdown', function () { FS.persist().catch(() => {}); }, { once: true });

  NS.core.fs = FS;
  NS.core.quota = StorageQuota;
})(window);
