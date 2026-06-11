# aimen — Agent Orchestration Hub 架构规划

> **日期**: 2026-06-11
> **项目**: lszio/aimen (`.agents` submodule in labry)
> **目标**: 将 aimen 从纯技能库升级为完整的 Agent 编排中心

---

## 1. 本质问题与目标

**本质问题**: AI Agent 生态碎片化 — 不同框架/运行时上的 Agent 无法相互发现、通信和委派任务。同时，用户缺少一个可持久化、本地优先的**思考伴侣**（Think Companion）——一个能记录 Agent 发出的指令、Agent 的回执、以及人机对话历史的外脑。

**架构目标**: 构建一个：
- **Anytype 驱动** — Anytype 是主交互面（下达任务、查看状态、记录对话历史）
- **ACP/A2A 协议** — Agent 之间通过统一协议通信
- **Mastra 构建 Agent** — Agent 运行时基于 Mastra framework
- **Astro Dashboard 为副屏** — Web 端只读渲染 Anytype 中的状态

---

## 2. 核心模型与关键协议

### 2.1 系统架构

```
                         用户
                      ┌──┴──┐
                      │     │
               ┌──────▼┐ ┌──▼──────────┐
               │Anytype│ │ Astro       │
               │(主界面)│ │ Dashboard   │
               │       │ │ (副屏/只读)  │
               └───┬───┘ └─────────────┘
                   │ MCP (stdio)
           ┌───────▼──────────┐
           │  anytype-gateway  │
           │  (MCP Server)    │
           │  监听 Anytype     │
           │  对象 CRUD → 事件  │
           └───────┬──────────┘
                   │ Internal Events
           ┌───────▼──────────┐
           │     ACP Bus      │
           │  (Message Router) │
           │   Agent Registry  │
           └───────┬──────────┘
                   │ ACP (REST/JSON)
        ┌──────────┼──────────┬──────────┐
        │          │          │          │
   ┌────▼───┐ ┌───▼────┐ ┌──▼────┐ ┌───▼────┐
   │Mastra  │ │Mastra  │ │Hermes │ │External│
   │Agent A │ │Agent B │ │Agent  │ │Agent   │
   │(搜索)  │ │(编码)  │ │       │ │(via ACP)│
   └────────┘ └────────┘ └───────┘ └────────┘
```

### 2.2 Anytype 作为"Think Companion"

这是设计中最关键的部分。Anytype 不仅是一个控制面板，它是**人机协同的思维外脑**：

```
Anytype 中的对象模型 (Object Types)
─────────────────────────────────────

┌──────────────────────────────┐
│ AgentTask                    │ ← 用户创建 → 网关检测 → Agent 执行 → 回写
│ ├─ id: Text (系统生成)       │
│ ├─ goal: Text               │
│ ├─ agentRole: Select         │ ← architect / coder / researcher / etc.
│ ├─ status: Select            │ ← pending / running / completed / failed
│ ├─ result: Text (系统回写)   │
│ ├─ error: Text (系统回写)    │
│ └─ createdAt: Date           │
├──────────────────────────────┤
│ AgentJournal                 │ ← 系统和用户的聊天流
│ ├─ id: Text                 │
│ ├─ title: Text               │ ← 对话标题
│ ├─ entries: Relation[Entry] │ ← 有序的消息列表
│ └─ createdAt: Date           │
├──────────────────────────────┤
│ JournalEntry                 │ ← 单条对话记录
│ ├─ id: Text                 │
│ ├─ role: Select              │ ← user / agent / system
│ ├─ content: Text             │
│ ├─ agentId: Text             │ ← 发言的 agent 标识
│ └─ timestamp: Date           │
├──────────────────────────────┤
│ AgentStatus                  │ ← Agent 心跳/状态（系统自动维护）
│ ├─ name: Text               │
│ ├─ role: Text                │
│ ├─ status: Select            │ ← idle / busy / error / offline
│ ├─ lastHeartbeat: Date       │
│ └─ currentTask: Relation     │ → AgentTask
└──────────────────────────────┘
```

**工作流举例**:

1. 用户在 Anytype 创建一个 `AgentTask` object，填写 `goal: "分析 layerc 的架构"`, `agentRole: "architect"`
2. `anytype-gateway` 通过 MCP 的 `listObjects` 或 webhook 检测到变化
3. 网关将任务转换为 ACP `TaskSubmit` 消息，发给 ACP Bus
4. ACP Bus 路由到 matching Mastra agent（按 `agentRole` 匹配）
5. Agent 执行，完成后写回 `result` + 更新 `status`
6. 网关同步写回到 Anytype Object，用户看到结果
7. 用户可以在 Anytype 中创建 `AgentJournal` + `JournalEntry` 来与 Agent 对话

### 2.3 ACP/A2A 协议核心

```
ACP Message Envelope (REST/JSON)
─────────────────────────────────

POST /acp/task          ← 提交任务
POST /acp/message       ← 发送消息/对话
GET  /acp/agents        ← 发现可用 Agent
GET  /acp/agents/:id    ← 查询 Agent 状态
POST /acp/agents/:id/cancel  ← 取消任务

标准消息体:
{
  "protocol": "acp-v1",
  "messageId": "uuid",
  "senderId": "agent-uuid-or-user",
  "targetId": "agent-uuid-or-role-anycast",
  "messageType": "TaskSubmit | TaskResult | Message | Ping | Error",
  "payload": {
    "taskId": "uuid",
    "goal": "string",
    "context": { ... },
    "tools": ["web_search", "file_read", ...]
  },
  "timestamp": "ISO8601"
}
```

---

## 3. 项目结构

```
.agents/                          ← lszio/aimen repo root
├── apps/
│   └── dashboard/                ← Astro SSR (只读副屏)
│       ├── src/
│       │   ├── pages/
│       │   │   ├── index.astro   ← 总览 (从 Anytype 读取)
│       │   │   ├── tasks.astro   ← 任务列表
│       │   │   └── journal.astro ← 对话历史
│       │   └── lib/
│       │       └── anytype.ts    ← Anytype API client
│       ├── astro.config.mjs
│       └── package.json
│
├── packages/
│   ├── anytype-gateway/          ← MCP Server (核心)
│   │   ├── src/
│   │   │   ├── index.ts          ← MCP server entry
│   │   │   ├── watcher.ts        ← 监听 Anytype 对象变化
│   │   │   ├── object-mapper.ts  ← Anytype ↔ ACP 转换
│   │   │   └── journal-handler.ts ← AgentJournal 读写
│   │   └── package.json
│   │
│   ├── acp-bus/                  ← ACP 协议路由核心
│   │   ├── src/
│   │   │   ├── index.ts          ← Bus/Router entry
│   │   │   ├── router.ts         ← 消息路由、Agent Registry
│   │   │   ├── types.ts          ← ACP 消息类型定义
│   │   │   ├── transport-http.ts ← HTTP/REST Transport
│   │   │   └── transport-mcp.ts  ← MCP Transport (for gateway)
│   │   └── package.json
│   │
│   ├── agents/                   ← 内置 Mastra Agents
│   │   ├── src/
│   │   │   ├── index.ts          ← Agent 注册工厂
│   │   │   ├── architect.ts      ← architect agent
│   │   │   ├── coder.ts          ← 编码 agent
│   │   │   ├── researcher.ts     ← 研究 agent
│   │   │   └── hermes-bridge.ts  ← 桥接 Hermes Agent (通过 ACP)
│   │   └── package.json
│   │
│   └── auth/                     ← Auth 层
│       ├── src/
│       │   ├── index.ts
│       │   ├── jwt.ts
│       │   └── middleware.ts
│       └── package.json
│
├── skills/                       ← 保持现有结构（architect 等）
│   └── architect/
│       └── SKILL.md
│
├── package.json                  ← Bun workspace root
├── README.md
└── .env.example
```

---

## 4. 分阶段实施路径

### Phase 1 🥇 — 基础设施（推荐优先做）

建立项目骨架 + ACP 核心 + Anytype 网关单向读

| 任务 | 产出 | 预估 |
|------|------|------|
| 1.1 初始化 Bun monorepo workspace | `package.json`, `bun.lock`，所有的 `packages/*` 骨架 | 15 min |
| 1.2 定义 ACP 核心类型 + Message Envelope | `packages/acp-bus/src/types.ts` | 15 min |
| 1.3 实现 ACP Router（内存注册 + 路由） | `packages/acp-bus/src/router.ts` | 30 min |
| 1.4 实现 HTTP Transport | `packages/acp-bus/src/transport-http.ts`（Express/Fastify 基础） | 20 min |
| 1.5 搭建 `anytype-gateway` MCP Server | 连接 `@anyproto/anytype-mcp`，暴露内部 API | 30 min |
| 1.6 Anytype → ACP 对象映射 | `packages/anytype-gateway/src/object-mapper.ts` | 20 min |
| 1.7 实现 Anytype Watcher（轮询变化） | `packages/anytype-gateway/src/watcher.ts` | 25 min |
| 1.8 基础 Auth（JWT） | `packages/auth/` | 20 min |
| 1.9 集成测试：任务在 Anytype 创建 → 网关检测 → ACP 路由 | E2E test | 30 min |

**Phase 1 总估**: ~3.5h，产出是**可 E2E 工作的基础闭环**

### Phase 2 🥈 — Agent 运行时 + 双向通信

Mastra agents 接入 + Anytype 回写

| 任务 | 产出 |
|------|------|
| 2.1 Mastra agent 基础设施（初始化 Mastra project） | `packages/agents/` |
| 2.2 实现 architect agent（skill → Mastra tool） | `packages/agents/src/architect.ts` |
| 2.3 实现 coder agent | `packages/agents/src/coder.ts` |
| 2.4 实现 researcher agent | `packages/agents/src/researcher.ts` |
| 2.5 实现 Anytype 回写（Agent 执行结果写回 Anytype Object） | `object-mapper.ts` 扩展 |
| 2.6 实现 AgentJournal + JournalEntry 对话流 | `journal-handler.ts` |
| 2.7 集成测试：创建 AgentTask → 执行 → 结果写回 Anytype | E2E |

### Phase 3 🥉 — Dashboard + 高级功能

| 任务 | 产出 |
|------|------|
| 3.1 初始化 Astro SSR project | `apps/dashboard/` |
| 3.2 Dashboard 总览页（读 Anytype API） | `pages/index.astro` |
| 3.3 任务列表页 | `pages/tasks.astro` |
| 3.4 对话历史页 | `pages/journal.astro` |
| 3.5 Auth 集成到 Dashboard | login/logout flow |
| 3.6 Hermes Agent 桥接（通过 ACP 与本地 Hermes 通信） | `agents/hermes-bridge.ts` |
| 3.7 外部 Agent 注册（通过 ACP 加入其他 Agent） | `router.ts` 扩展 |

### Phase 4 🏁 — 生产加固

| 任务 | 产出 |
|------|------|
| 4.1 Skill Store API（skills/ 目录元数据管理） | `packages/skill-store/` |
| 4.2 ACP Hub 状态持久化（SQLite） | `acp-bus` 扩展 |
| 4.3 Webhook/SSE 推送（Anytype 事件实时通知） | `anytype-gateway` 扩展 |
| 4.4 错误处理 + 重试机制 | 所有 packages |
| 4.5 文档 + CLI 工具 | `README.md`, CLI entry |

---

## 5. 技术栈

| 层 | 选型 | 理由 |
|----|------|------|
| 运行时 | Bun v1.x | 与 labry monorepo 一致，workspace 原生支持 |
| Agent 框架 | Mastra (`@mastra/core`) | TS-native，MCP 支持开箱，workflow 引擎 |
| Agent 协议 | ACP (REST/JSON) | 轻量，可扩展，与 A2A 兼容 |
| 协议核心 | Express/Fastify + Zod | ACP 消息校验 + HTTP 路由 |
| Anytype 网关 | `@anyproto/anytype-mcp` (npm) | 官方维护，使用 OpenAPI-2-MCP |
| 网关开发 | 自定义 MCP Server | 扩展 `@anyproto/anytype-mcp` 或自建 |
| Dashboard | Astro (SSR) + React | 与巴适康/DevHub 技术栈一致 |
| Auth | JWT (轻量) | 无需第三方依赖 |
| 存储 | SQLite + Anytype | Agent 状态持久化用 SQLite，用户数据用 Anytype |
| 包管理 | Bun workspace | 与 labry 统一 |

---

## 6. 关键设计决策

### 6.1 Anytype 为主 vs Astro 为主

**选择**: Anytype 是主交互面，Astro 为只读 Dashboard。

原因: Anytype 提供本地优先、加密、可持久化的知识管理。用户已经在用 Anytype 做笔记，把 Agent 交互也集成进来，用户不需要切换工具。Anytype 的 Object 模型天然适合做"任务 → 执行 → 回写"的闭环。

Astro 提供 Web 友好的可视化（图表、表格、实时刷新），但只读。

### 6.2 Anytype Gateway 架构

```
                    ┌─────────────────────┐
                    │    anytype-gateway   │
                    │     (MCP Server)     │
                    ├─────────────────────┤
                    │  ┌─────────────────┐ │
                    │  │  MCP Transport  │◄──── MCP (stdio) ←→ Anytype 桌面
                    │  └────────┬────────┘ │
                    │           │          │
                    │  ┌────────▼────────┐ │
                    │  │ Object Mapper   │ │ ← AgentTask → ACP TaskSubmit
                    │  │ Journal Handler │ │ ← AgentJournal → 对话流
                    │  └────────┬────────┘ │
                    │           │          │
                    │  ┌────────▼────────┐ │
                    │  │ Internal Client │──── ACP (HTTP) → acp-bus
                    │  └─────────────────┘ │
                    └─────────────────────┘
```

关键点: Gateway 是**进程内 MCP 客户端**连接 Anytype 桌面，不是启动外部进程。它通过 ACP HTTP Transport 与 acp-bus 通信。

### 6.3 Agent Registry 设计

**先匹配 Agent Role，再 fallback 到任意可用 Agent**:

```typescript
interface AgentRegistration {
  id: string;
  name: string;
  role: string;        // "architect" | "coder" | "researcher" | "hermes"
  transport: ACPTransport;
  status: 'online' | 'offline' | 'busy';
  capabilities: string[];
}

// 路由逻辑:
// 1. AgentTask.agentRole = "architect"
// 2. Registry 查找 online + role=architect 的 Agent
// 3. 如果找到 → 转发
// 4. 如果没找到 → fallback 到任意 online Agent
// 5. 如果都没 online → 消息排队
```

### 6.4 Auth 架构

```
JWT-based:
- acp-bus 和 anytype-gateway 之间的内部通信: 内部 token (环境变量)
- Astro Dashboard 的用户访问: JWT (用户名/密码登录)
- Anytype → Gateway: 走 Anytype 自己的 API key 认证
```

---

## 7. 风险与演化路径

### 已知风险

| 风险 | 缓解 |
|------|------|
| Anytype MCP 轮询延迟（非实时） | Phase 4 加入 SSE/Webhook 推送；当前可接受<5s 延迟 |
| Anytype Object 模型需要手动创建 Type | 提供一键导入的 Type 模板 JSON |
| ACP 协议仍处于早期（A2A 合并进行中） | 自定义 Envelope，保持与 A2A 格式兼容 |
| Mastra 版本迭代快 | 锁定 `@mastra/core` 版本，依赖最小 API |
| Agent 长期运行导致 Anytype 对象爆炸 | AgentJournal 按时间分页，定期归档旧 entry |

### 12 个月演化路径

```
现在       ─→  Phase 1    ─→  Phase 2     ─→  Phase 3    ─→  Phase 4
技能库        Anytype↔ACP     Agent 运行时     Dashboard    生产加固
              E2E 闭环       可执行任务       Web 可视化    持久化/文档
```

远期方向:
- 支持多种 A2A 实现（Google A2A, BeeAI）的兼容层
- Agent Marketplace（技能 Store）
- 多人协作（Anytype Space 天然支持）

---

## 8. 下一步

**立即开始 Phase 1**:

确认方案后按顺序执行：
1. 初始化 Bun monorepo workspace
2. ACP 核心类型定义
3. ACP Router + HTTP Transport
4. anytype-gateway 骨架
5. Anytype → ACP 对象映射
6. Anytype Watcher
7. Auth 基础
8. E2E 集成测试

每个任务 2-10 分钟，TDD 模式。