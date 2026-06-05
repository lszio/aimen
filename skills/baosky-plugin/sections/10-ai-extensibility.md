# AI 可扩展性

Baosky 提供多种 AI 可扩展方式，帮助插件创建定制的 AI 体验。

---

## 扩展方式对比

| 方式 | 适用场景 | API 访问 | 分发方式 |
|------|----------|----------|----------|
| **语言模型工具（LM Tool）** | Agent 模式下的领域特定功能 | ✅ 可访问 Baosky API | Marketplace |
| **MCP 工具** | 跨平台的外部服务集成 | ❌ 在 Baosky 之外运行 | 用户配置 |
| **聊天参与者（Chat Participant）** | 领域特定的端到端聊天助手 | ✅ 可访问 Baosky API | Marketplace |
| **语言模型 API（LM API）** | 直接编程控制 AI 模型 | ✅ 可访问 Baosky API | Marketplace |

---

## 语言模型工具（LM Tool）

在 Agent 模式下根据用户聊天提示自动调用，执行专门任务或检索信息。

**主要优势：**
- 作为自主编码工作流程的领域特定功能
- 在插件宿主进程中运行，可访问 Baosky API
- 通过 Marketplace 分发

**实现：**[Language Model Tools API](/api/extension-guides/ai/tools)

---

## MCP 工具

通过标准化协议将外部服务与语言模型集成，在 Baosky 之外运行。

**主要优势：**
- 本地和远程部署选项
- 可在其他 MCP 客户端中重用

**主要局限：**
- 无法访问 Baosky 插件 API
- 需要用户设置 MCP 服务器

---

## 聊天参与者（Chat Participant）

专门的助手，用户通过 `@` 提及并传入自然语言提示来调用。

**主要优势：**
- 控制端到端交互流程
- 可访问 Baosky API
- 通过 Marketplace 分发

**实现：**[Chat API](/api/extension-guides/ai/chat)

---

## 语言模型 API（LM API）

对 AI 模型的直接编程访问，用于创建自定义 AI 驱动功能。

**主要优势：**
- 将 AI 集成到现有插件功能中
- 可访问 Baosky API
- 通过 Marketplace 分发

**实现：**[Language Model API](/api/extension-guides/ai/language-model)

---

## 选择建议

| 场景 | 推荐方案 |
|------|----------|
| 需要在 Agent 模式下自动调用的专门功能 | **LM Tool** |
| 需要跨环境（非 Baosky）工作且不依赖 Baosky API | **MCP Tool** |
| 需要控制完整聊天交互流程 | **Chat Participant** |
| 需要在现有插件功能中集成 AI | **LM API** |
