---
name: baosky-plugin
description: 天行 (Baosky) 插件开发 — 项目结构、核心能力、Extension/Webview 开发、PLC 域扩展、构建发布与常见陷阱
---

# 天行 (Baosky) 插件开发指南

天行（Baosky）插件类似于 VS Code 插件，运行在 Baosky 平台上。插件使用 `@baosky/plugin` SDK 开发，构建工具为 Bun 或 esbuild，打包工具为 `bsx`。

| 概念 | 说明 |
|------|------|
| **Extension** | Node.js 端，负责插件生命周期、命令注册、与平台 API 交互 |
| **Webview** | 前端 UI（React / Solid / 纯 HTML），运行在 iframe 沙箱中 |
| **通信** | Extension ↔ Webview 通过 `postMessage` 或 `postbridge` RPC 桥接 |
| **BSDL** | 天行 DSL 语言，描述对象和表达对象操作 |
| **能力来源** | `package.json` 声明 + `@baosky/plugin` 运行时 API + BSDL 对象协议 |

**两种工作区模式：**

| 模式 | 适用场景 | 构建方式 |
|------|----------|----------|
| **多包模式（推荐）** | 含 Webview 的插件 | `workspaces: ["packages/*"]`，分开构建 |
| **单包模式** | 纯 Node.js 或简单插件 | 统一放在根目录 |

---

## 目录

### [1. 快速开始](sections/01-quickstart.md)
创建项目、开发调试、最小插件工作流。适合第一次接触 Baosky 插件开发时阅读。

### [2. 基础概念](sections/02-basic-concepts.md)
插件权限分级与生命周期、项目结构（多包/单包）、package.json 清单配置、贡献点声明、国际化、tsconfig 配置。

### [3. 核心能力](sections/03-core-capabilities.md)
Baosky 插件的能力模型：声明式能力（入口/命令/菜单/视图/国际化/帮助文档）、运行时 API（ExtensionContext/commands/window/workspace）、命令系统、菜单能力、视图能力、BSDL 对象协议、许可证能力。

### [4. 用户体验指南](sections/04-ux-guidelines.md)
功能应该放在 IDE 的哪个区域：菜单栏、侧边栏、工作区域、巡视窗口、状态栏的选择建议。

### [5. Extension 端开发](sections/05-extension-dev.md)
插件生命周期、WebviewViewProvider 完整模板、BSDL 集成。

### [6. Webview 端开发](sections/06-webview-dev.md)
子包配置（bun build）、React 入口、构建产物拷贝约定。

### [7. Extension ↔ Webview 通信](sections/07-communication.md)
基本消息模式（postMessage）、高级 RPC 模式（postbridge）。

### [8. 构建与发布](sections/08-build-publish.md)
多包构建脚本（extension + webview + 资产拷贝）、bsx 打包发布。

### [9. PLC 业务域指南](sections/09-plc-guides.md)
PLC 项目树菜单、编辑区菜单（LD/ST/Monaco）、When 子句上下文（objBizType/objExt/activeEditor）、contributes.usermanual 帮助文档、分组排序体系、PLC API 参考。

### [10. AI 可扩展性](sections/10-ai-extensibility.md)
四种 AI 扩展方式：语言模型工具（LM Tool）、MCP 工具、聊天参与者（Chat Participant）、语言模型 API（LM API）。

### [11. 参考](sections/11-references.md)
支持的贡献点列表、激活事件、通用 When 子句上下文、常见陷阱（10 条）、参考项目。

---

## 文档源

本节内容基于 `docs/baosky-plugin/` 的官方文档整理，涵盖基础概念、核心能力、用户体验指南、PLC 业务域扩展和 AI 可扩展性。
