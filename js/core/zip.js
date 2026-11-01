/* ============================================================
 * UniverseZip — 单文件 ZIP 压缩/解压模块
 * ------------------------------------------------------------
 * 后端：CompressionStream('deflate-raw') / DecompressionStream
 * 支持：UTF-8 文件名、目录条目、进度回调、FS 集成
 * 局限：不支持 Zip64（>4GB 单文件 / >65535 条目），不支持加密
 * ============================================================ */
const UniverseZip = (() => {
  'use strict';

  // ---------- CRC-32 ----------
  const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[i] = c >>> 0;
    }
    return t;
  })();
  function crc32(bytes) {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  // ---------- 压缩后端 ----------
  const HAS_CS = typeof CompressionStream !== 'undefined';
  const HAS_DS = typeof DecompressionStream !== 'undefined';
  async function deflateRaw(input) {
    if (!HAS_CS) throw new Error('浏览器不支持 CompressionStream');
    const s = new Blob([input]).stream().pipeThrough(new CompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(s).arrayBuffer());
  }
  async function inflateRaw(input) {
    if (!HAS_DS) throw new Error('浏览器不支持 DecompressionStream');
    const s = new Blob([input]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(s).arrayBuffer());
  }

  // ---------- 工具 ----------
  const te = new TextEncoder();
  const td = new TextDecoder('utf-8');

  function dosDateTime(d) {
    if (!(d instanceof Date) || isNaN(d)) d = new Date();
    let y = d.getFullYear(); if (y < 1980) y = 1980; if (y > 2107) y = 2107;
    return {
      time: ((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)) >>> 0,
      date: (((y - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) >>> 0
    };
  }
  function fromDosDateTime(t, d) {
    return new Date(
      1980 + ((d >> 9) & 0x7F), ((d >> 5) & 0x0F) - 1, d & 0x1F,
      (t >> 11) & 0x1F, (t >> 5) & 0x3F, (t & 0x1F) * 2
    );
  }

  // ---------- 二进制写入器 ----------
  class Writer {
    constructor() { this.chunks = []; this.size = 0; }
    push(data) {
      const b = data instanceof Uint8Array ? data
              : typeof data === 'string' ? te.encode(data)
              : new Uint8Array(data);
      this.chunks.push(b); this.size += b.byteLength;
    }
    u16(v) { const b = new Uint8Array(2); new DataView(b.buffer).setUint16(0, v >>> 0, true); this.push(b); }
    u32(v) { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, v >>> 0, true); this.push(b); }
    toBlob() { return new Blob(this.chunks); }
  }

  // ---------- 压缩 ----------
  /**
   * @param {Array<{name:string, data:any, lastModified?:number, compress?:boolean}>} entries
   * @returns {Promise<Blob>}
   */
  async function zip(entries, options) {
    options = options || {};
    const onProgress = options.onProgress || null;
    const w = new Writer();
    const c = new Writer();
    const total = entries.length;
    const FLAG_UTF8 = 0x0800;

    for (let i = 0; i < total; i++) {
      const e = entries[i];
      if (onProgress) onProgress(i, total, e.name);

      // 归一化数据
      let raw;
      if (e.data == null) raw = new Uint8Array(0);
      else if (typeof e.data === 'string') raw = te.encode(e.data);
      else if (e.data instanceof Uint8Array) raw = e.data;
      else if (e.data instanceof ArrayBuffer) raw = new Uint8Array(e.data);
      else if (e.data instanceof Blob) raw = new Uint8Array(await e.data.arrayBuffer());
      else throw new Error('UniverseZip: 不支持的数据类型 ' + typeof e.data);

      const isDir = e.name.endsWith('/');
      const dt = dosDateTime(e.lastModified ? new Date(e.lastModified) : null);
      const crc = crc32(raw);
      const nameBytes = te.encode(e.name);

      let method = 0, compressed = raw;
      if (!isDir && raw.length > 0 && e.compress !== false) {
        try {
          const d = await deflateRaw(raw);
          if (d.length < raw.length) { method = 8; compressed = d; }
        } catch (_) { /* 回退为存储 */ }
      }

      const offset = w.size;

      // 本地文件头
      w.u32(0x04034b50); w.u16(20); w.u16(FLAG_UTF8); w.u16(method);
      w.u16(dt.time); w.u16(dt.date); w.u32(crc);
      w.u32(compressed.length); w.u32(raw.length);
      w.u16(nameBytes.length); w.u16(0);
      w.push(nameBytes); w.push(compressed);

      // 中央目录
      c.u32(0x02014b50); c.u16(20); c.u16(20); c.u16(FLAG_UTF8); c.u16(method);
      c.u16(dt.time); c.u16(dt.date); c.u32(crc);
      c.u32(compressed.length); c.u32(raw.length);
      c.u16(nameBytes.length); c.u16(0); c.u16(0);
      c.u16(0); c.u16(0); c.u32(isDir ? 0x10 : 0); c.u32(offset);
      c.push(nameBytes);
    }

    // 中央目录 + EOCD
    const cdOffset = w.size;
    const cdBytes = new Uint8Array(c.chunks.reduce((n, ch) => n + ch.byteLength, 0));
    let o = 0;
    for (const ch of c.chunks) { cdBytes.set(ch, o); o += ch.byteLength; }
    w.push(cdBytes);

    w.u32(0x06054b50); w.u16(0); w.u16(0);
    w.u16(total); w.u16(total); w.u32(cdBytes.length); w.u32(cdOffset); w.u16(0);

    if (onProgress) onProgress(total, total, '');
    return w.toBlob();
  }

  // ---------- 解压 ----------
  /**
   * @returns {Promise<Array<{name,size,compressedSize,lastModified,isDirectory,method,data?:Uint8Array}>>}
   */
  async function unzip(input, options) {
    options = options || {};
    const onProgress = options.onProgress || null;
    const readData = options.readData !== false;

    let buf;
    if (input instanceof Blob) buf = await input.arrayBuffer();
    else if (input instanceof Uint8Array) buf = input.buffer.slice(input.byteOffset, input.byteOffset + input.byteLength);
    else if (input instanceof ArrayBuffer) buf = input;
    else throw new Error('UniverseZip: 不支持的输入类型');

    const view = new DataView(buf);
    const size = buf.byteLength;

    // 找 EOCD（从尾部倒查，最大 64KB 注释）
    let eocd = -1;
    for (let i = size - 22; i >= Math.max(0, size - 22 - 0xFFFF); i--) {
      if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error('UniverseZip: 无效的 ZIP 文件（未找到 EOCD）');

    const total = view.getUint16(eocd + 10, true);
    const cdSize = view.getUint32(eocd + 12, true);
    const cdOffset = view.getUint32(eocd + 16, true);

    // 解析中央目录
    const entries = [];
    let p = cdOffset;
    const cdEnd = cdOffset + cdSize;
    while (p < cdEnd) {
      if (view.getUint32(p, true) !== 0x02014b50) throw new Error('UniverseZip: 中央目录损坏');
      const flags = view.getUint16(p + 8, true);
      const method = view.getUint16(p + 10, true);
      const time = view.getUint16(p + 12, true);
      const date = view.getUint16(p + 14, true);
      const crc = view.getUint32(p + 16, true);
      const cs = view.getUint32(p + 20, true);
      const us = view.getUint32(p + 24, true);
      const nl = view.getUint16(p + 28, true);
      const el = view.getUint16(p + 30, true);
      const cl = view.getUint16(p + 32, true);
      const ext = view.getUint32(p + 38, true);
      const lo = view.getUint32(p + 42, true);
      const name = td.decode(new Uint8Array(buf, p + 46, nl));
      entries.push({
        name, method, crc,
        compressedSize: cs, uncompressedSize: us, size: us,
        lastModified: fromDosDateTime(time, date).getTime(),
        isDirectory: name.endsWith('/') || ((ext & 0x10) !== 0),
        localOffset: lo, flags
      });
      p += 46 + nl + el + cl;
    }

    // 读取数据
    if (readData) {
      for (let i = 0; i < entries.length; i++) {
        const e = entries[i];
        if (onProgress) onProgress(i, entries.length, e.name);
        if (e.isDirectory) { e.data = new Uint8Array(0); continue; }

        const lh = e.localOffset;
        if (view.getUint32(lh, true) !== 0x04034b50) throw new Error('UniverseZip: 本地文件头损坏 ' + e.name);
        const nl = view.getUint16(lh + 26, true);
        const el = view.getUint16(lh + 28, true);
        const start = lh + 30 + nl + el;
        const cdata = new Uint8Array(buf, start, e.compressedSize);

        if (e.method === 0) e.data = cdata;
        else if (e.method === 8) e.data = await inflateRaw(cdata);
        else throw new Error('UniverseZip: 不支持的压缩方法 ' + e.method);
      }
      if (onProgress) onProgress(entries.length, entries.length, '');
    }
    return entries;
  }

  // ---------- FS 集成 ----------
  let boundFS = null;
  function resolveFS(opts) {
    return (opts && opts.FS) || boundFS || (typeof window !== 'undefined' ? window.FS : null);
  }

  async function zipFromFS(paths, options) {
    options = options || {};
    const FS = resolveFS(options);
    if (!FS) throw new Error('UniverseZip: 未绑定 FS，请 bindFS(FS) 或传 options.FS');

    const entries = [];
    async function addPath(path, name) {
      let isFile = false, isDir = false;
      try { await FS.readBlob(path); isFile = true; } catch (_) {}
      if (!isFile) { try { await FS.list(path); isDir = true; } catch (_) {} }
      if (isDir) {
        entries.push({ name: name + '/', data: null, isDir: true });
        const list = await FS.list(path);
        for (const item of list) {
          await addPath(path + '/' + item.name, name + '/' + item.name);
        }
      } else {
        const blob = await FS.readBlob(path);
        entries.push({ name, data: blob });
      }
    }

    for (const p of paths) {
      const clean = p.replace(/\/+$/, '');
      const name = clean.split('/').filter(Boolean).pop() || 'unnamed';
      await addPath(clean, name);
    }
    return zip(entries, options);
  }

  async function unzipToFS(input, destPath, options) {
    options = options || {};
    const FS = resolveFS(options);
    if (!FS) throw new Error('UniverseZip: 未绑定 FS');

    const entries = await unzip(input, { readData: true });
    const total = entries.length;

    for (let i = 0; i < total; i++) {
      const e = entries[i];
      if (options.onProgress) options.onProgress(i, total, e.name);
      const full = destPath ? (destPath + '/' + e.name) : e.name;
      if (e.isDirectory) {
        await FS.mkdir(full.replace(/\/+$/, ''));
      } else {
        const parts = full.split('/');
        parts.pop();
        if (parts.length > 0) await FS.mkdir(parts.join('/'));
        await FS.write(full, new Blob([e.data]));
      }
    }
    if (options.onProgress) options.onProgress(total, total, '');
    return entries.length;
  }

  const api = {
    zip, unzip, zipFromFS, unzipToFS, crc32,
    HAS_CS, HAS_DS,
    bindFS(fs) { boundFS = fs; return api; }
  };
  return api;
})();

window.UniverseZip = UniverseZip;
// 注册进 UniverOS 命名空间（加载顺序：core 区，fs.js 之后）
if (window.UniverOS) { (window.UniverOS.core = window.UniverOS.core || {}).zip = UniverseZip; }
