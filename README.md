# Universe OS

浏览器端桌面 OS 模拟，v2.0.0 · 多文件 · 纯原生（零依赖、无构建工具）。

> 原单文件版本重构而来：由"每个应用各写一套命令式 DOM"改为 **声明式渲染 + 三层工程**。

## 运行

三处均可直接运行，路径已按相对路径编写：

| 方式 | 说明 |
| --- | --- |
| 双击 `index.html` | `file://` 协议直接可用（全部传统 `<script>`，无 ES Module / fetch 依赖） |
| 本地 http 服务 | `python -m http.server 8000` 后访问 `/index.html`，或从上级目录起服访问 `/univeros/index.html` 模拟子路径 |
| GitHub Pages | 仓库根放本目录内容，开启 Pages 后 `https://<user>.github.io/<repo>/` 即可（相对路径兼容子路径） |

## 目录结构

```
univeros/
├── index.html          # 入口：静态骨架 + 按序加载 4 CSS + 32 JS
├── css/
│   ├── tokens.css      # 变量 / 重置 / 滚动条
│   ├── layout.css      # 桌面 / 状态栏 / 图标 / 窗口 / Dock / 启动台 / 控制中心
│   ├── ui.css          # 菜单 / 弹窗 / toast / 按钮 / 侧栏通用
│   └── apps.css        # 各应用样式
└── js/
    ├── core/           # 系统核心：store / config / theme / fs / utils
    ├── render/         # 声明式引擎 + 组件基类 + UI 部件
    ├── apps/           # 应用层：registry + 8 个应用
    └── system/         # 系统外壳：layout / window-manager / dock / launcher / ...
```

## 架构

- **渲染层（render/）**：`h()` 虚拟节点 + `createElement` + 全量重建（等价原"清空重插"），
  `Component` 基类提供 `state` / `render()` / `renderSidebar()` / `mount()` 生命周期；
  应用只声明视图，不再手写 DOM。
- **软件层（apps/）**：每个应用一个文件、一个 `Component` 子类；注册表 `registry.js` 声明
  name / icon / build / withSidebar / multi，运行时由窗口管理器调用挂载。
- **系统层（system/）**：窗口管理、桌面、Dock、启动台、控制中心、快捷键等外壳逻辑，
  通过 `window.UniverOS.{core,render,system,apps}` 命名空间解耦协作。

### 兼容约束（file:// 与子路径双模式）

- 全部脚本用传统 `<script src="js/...">` 按序引用（ES Module 在 `file://` 下会被 CORS 拦截）；
- `index.html` 只写相对路径 `css/`、`js/`，无绝对根路径、无 CDN，因此
  `file://` 双击 与 `https://user.github.io/repo/` 子路径下均正常；
- 固定数据（壁纸、文件模板、书签）内联进 JS，不依赖 fetch 本地数据文件。

## 行为保持

与原单文件版 1:1：状态栏 / 桌面图标拖拽 / Dock 拖拽重排 / 窗口拖拽缩放与级联 /
启动台与快捷键 / 控制中心 / 文件管理（剪贴板、导入、右键菜单）/ 备忘录（含 canvas 绘画）/
计算器 / 时钟 / 浏览器（书签 + iframe）/ 设置（8 面板，含存储配额与 OPFS 持久化提示）。

本地验证已通过：32 个 JS `node --check` 全过；子路径（http）与 `file://` 双模式下
首屏、设置、计算器、浏览器、备忘录、文件应用均实测正常，无控制台错误。
