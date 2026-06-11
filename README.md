# aimen

A collection of professional AI agents and skills for **AI-assisted development workflows**.

`aimen` (AI Men) 是一个旨在增强各类 AI CLI 工具能力的资源库，包含了一系列经过精心设计的技能（Skills）和智能体（Agents），帮助开发者在复杂的软件架构、系统设计和日常开发任务中获得更专业的辅助。

支持平台：**Claude Code**、**Copilot CLI** 等主流 AI 命令行工具。

## 📦 快速开始（30 秒安装）

```bash
npx skills@latest add lszio/aimen
```

选择你想要的技能，以及你想要安装这些技能的 AI 编程助手。

## 🛠️ 包含组件

### 技能 (Skills)

- **architect**: **系统架构专家**。专注于构建可演化、可组合且可观察的长期系统。它超越了简单的功能实现，提供深度的架构规划、模型设计与技术方案评审。
- *（更多技能持续添加中）*

### 智能体 (Agents)

- *（当前版本以技能为主，智能体正在持续增加中）*

|## 📁 目录结构
|
|```
|aimen/
|├── apps/             # 应用层
|│   └── dashboard/    # Astro SSR dashboard (stub)
|├── packages/         # 共享包 (Bun workspace)
|│   ├── acp-bus/        # ACP protocol router
|│   ├── anytype-gateway/# MCP server for Anytype
|│   ├── agents/         # Agent orchestration
|│   └── auth/           # JWT authentication
|├── skills/           # 技能定义文件
|│   └── architect/    # 示例：架构师技能
|├── package.json      # Bun workspace root
|├── tsconfig.json     # TypeScript config
|└── .env.example      # Environment variables
|```

## 🤝 贡献

欢迎提交 Pull Request 来增加更多的技能或智能体。请确保遵循现有的目录结构和 Markdown 格式规范。