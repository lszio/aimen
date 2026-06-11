# aimen — Agent 编排中枢

A collection of professional AI agents and skills for **AI-assisted development workflows**.

`aimen` (AI Men) 是一个**Agent 编排中枢**，通过 ACP（Agent Communication Protocol）协议连接多个专业智能体，
支持任务路由、消息传递、持久化注册和任意存储网关。

支持平台：**Claude Code**、**Copilot CLI** 等主流 AI 命令行工具。

---

## 📦 快速开始

```bash
# 克隆仓库
git clone https://github.com/lszio/aimen.git
cd aimen

# 安装依赖（Bun workspace）
bun install

# 启动 ACP 服务
bun run packages/cli/src/index.ts start

# 在另一个终端检查服务状态
bun run packages/cli/src/index.ts status
```

**环境变量**（可选，参见 `.env.example`）：

| 变量名                 | 说明                         | 默认值                    |
| ---------------------- | ---------------------------- | ------------------------- |
| `ACP_PORT`             | ACP 总线 HTTP 服务端口       | `4121`                    |
| `ANYTYPE_API_KEY`      | Anytype API 密钥（可选）     | —                         |
| `ANYTYPE_API_BASE_URL` | Anytype 服务基础地址          | `http://127.0.0.1:31009`  |
| `AUTH_JWT_SECRET`      | JWT 签名密钥                 | —                         |
| `AUTH_ADMIN_PASSWORD`  | 管理员登录密码               | `admin`                   |

---

## 🏗️ 整体架构

```
┌─────────────────────────────────────────────────────┐
│                    aimen CLI                         │
│   @aimen/cli — 命令行启动器 & 状态检查               │
└──────────────────┬──────────────────────────────────┘
                   │
┌──────────────────▼──────────────────────────────────┐
│               ACP Bus (端口 4121)                     │
│   ┌─────────────┐  ┌──────────────┐  ┌───────────┐  │
│   │ HttpTransport│  │ MessageRouter│  │ HttpTransport│
│   │  (REST API)  │  │   路由引擎    │  │ 代理注册中心 │
│   └─────────────┘  └──────────────┘  └───────────┘  │
│                    │          ▲                      │
└────────────────────┼──────────┼──────────────────────┘
                     │          │
       ┌─────────────┼──────────┼─────────────┐
       │             │          │              │
┌──────▼──────┐ ┌───▼──────┐ ┌─▼──────┐ ┌────▼──────┐
│ Architect   │ │  Coder   │ │Research│ │ Hermes    │
│ Agent       │ │  Agent   │ │  Agent │ │ Bridge    │
└─────────────┘ └──────────┘ └────────┘ └───────────┘
                        │
          ┌─────────────┼─────────────┐
          │              │              │
   ┌──────▼──────┐ ┌────▼──────┐ ┌────▼──────┐
   │ Anytype     │ │ Auth      │ │ Skill     │
   │ Gateway     │ │ (JWT)     │ │ Store     │
   └─────────────┘ └───────────┘ └───────────┘
```

### 工作流程

1. **外部请求** 通过 REST API (`POST /acp/task`) 进入 ACP 总线
2. **HttpTransport** 将 HTTP 请求转换为 ACP 消息信封
3. **MessageRouter** 根据 `targetId` 或 `role` 路由到对应 Agent
4. **Agent** 执行任务并返回结果
5. **AnytypeGateway** 轮询 Anytype 中的待处理任务并推入 ACP 总线

---

## 📁 包概览

| 包名 | 路径 | 说明 |
|------|------|------|
| `@aimen/acp-bus` | `packages/acp-bus/` | ACP 协议核心：消息类型、路由引擎、HTTP 传输层、SQLite 持久化、错误处理与重试 |
| `@aimen/agents` | `packages/agents/` | 智能体实现：ArchitectAgent（架构师）、CoderAgent（编码者）、ResearcherAgent（研究员）、HermesBridgeAgent |
| `@aimen/anytype-gateway` | `packages/anytype-gateway/` | Anytype 存储网关：对象映射、任务监控、日志处理器 |
| `@aimen/auth` | `packages/auth/` | JWT 认证模块（无外部依赖） |
| `@aimen/skill-store` | `packages/skill-store/` | 技能存储与检索接口 |
| `@aimen/cli` | `packages/cli/` | 命令行入口：start / status / help |

| 应用 | 路径 | 说明 |
|------|------|------|
| Dashboard | `apps/dashboard/` | Astro SSR 管理面板 |

---

## 📋 CLI 命令

### `aimen start`

启动 ACP 总线 HTTP 服务，自动注册内置智能体，可选连接 Anytype 网关。

```bash
# 默认端口 4121
bun run packages/cli/src/index.ts start

# 自定义端口
ACP_PORT=8080 bun run packages/cli/src/index.ts start

# 带 Anytype 集成
ANYTYPE_API_KEY=your-key bun run packages/cli/src/index.ts start
```

### `aimen status`

检查 ACP 服务运行状态（通过 `/health` 端点）。

```bash
bun run packages/cli/src/index.ts status
```

成功输出示例：
```
aimen CLI v0.1.0

✔ ACP 服务运行中 - 端口 4121
ℹ 在线代理: 2
ℹ 运行时长: 42 秒
```

### `aimen help`

打印帮助信息。

```bash
bun run packages/cli/src/index.ts help
```

---

## 🔌 REST API 端点

所有端点返回 `{ success: boolean, data?: any, error?: string }` 格式。

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/health` | 健康检查 |
| `GET` | `/acp/agents` | 获取所有代理列表 |
| `GET` | `/acp/agents/:id` | 获取指定代理详情 |
| `POST` | `/acp/task` | 提交任务 |
| `POST` | `/acp/message` | 发送消息 |
| `POST` | `/acp/announce` | 外部代理注册 |
| `POST` | `/acp/leave` | 外部代理离线 |
| `POST` | `/acp/ping` | 代理心跳 |
| `POST` | `/acp/agents/:id/cancel` | 取消任务 |

---

## 🧪 开发命令

```bash
# 安装依赖
bun install

# 构建所有包
bun run build

# 类型检查（所有包）
bunx tsc --noEmit

# 开发模式（并行启动所有包和应用）
bun run dev

# 检查代码（占位）
bun run lint
```

---

## ⚠️ 错误处理

所有包统一使用 `@aimen/acp-bus` 导出的错误处理机制：

```ts
import { AimenError, AimenErrorCode, retryWithBackoff } from '@aimen/acp-bus';

// 抛出标准错误
throw new AimenError(AimenErrorCode.AGENT_NOT_FOUND, '代理未找到', { agentId }, 404);

// 带退避的重试（指数退避）
const result = await retryWithBackoff(
  () => someAsyncOperation(),
  { maxAttempts: 3, delayMs: 500, backoff: 'exponential' },
);
```

---

## 🧱 目录结构

```
aimen/
├── apps/
│   └── dashboard/       # Astro SSR 管理面板
├── packages/
│   ├── acp-bus/         # ACP 协议核心（消息、路由、HTTP 传输、持久化、错误处理）
│   ├── agents/          # 智能体实现（Architect、Coder、Researcher、HermesBridge）
│   ├── anytype-gateway/ # Anytype 存储网关
│   ├── auth/            # JWT 认证
│   ├── cli/             # 命令行入口
│   └── skill-store/     # 技能存储
├── skills/
│   └── architect/       # 架构师技能文件
├── package.json         # Bun workspace 根
├── tsconfig.json        # TypeScript 配置
├── tsconfig.base.json   # TypeScript 基础配置
└── .env.example         # 环境变量示例
```

---

## 🤝 贡献

欢迎提交 Pull Request。请确保：

1. 代码通过 `bunx tsc --noEmit` 类型检查
2. 遵循现有的代码风格（中文 JSDoc 注释）
3. 不引入新的外部依赖（仅使用 Bun 内置 API）