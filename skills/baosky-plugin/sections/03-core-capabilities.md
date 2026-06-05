# 核心能力

Baosky 插件的核心能力来自三层：

- **声明式能力** — `package.json` 声明（激活、入口、命令、菜单、视图、国际化、帮助文档）
- **运行时能力** — `@baosky/plugin` API（ExtensionContext、commands、window、workspace、env、plugins、lm）
- **BSDL 对象协议** — 描述对象、匹配对象和操作对象（Action、Match/Rule、DataPath/Anchor/Hunk）

---

## 声明式能力

声明式能力解决"插件还没运行之前，平台怎样知道这个插件要做什么"。

| 声明项 | 作用 |
|--------|------|
| `main` / `browser` / `headless` | 入口文件 |
| `activationEvents` | 激活时机 |
| `contributes.commands` | 命令声明 |
| `contributes.menus` / `contributes.submenus` | 菜单挂载 |
| `contributes.keybindings` | 快捷键 |
| `contributes.views` / `contributes.viewsContainers` / `contributes.viewsWelcome` | 视图与容器 |
| `contributes.usermanual` | 帮助文档目录 |
| `l10n` / `contributes.localizations` / `package.nls*.json` | 国际化 |
| `contributes.grammars` / `contributes.languages` / `contributes.snippets` | 语言与语法支持 |
| `contributes.semanticToken*` | 语义标记 |

---

## 运行时通用能力

```ts
import * as baosky from '@baosky/plugin';
```

| API / 对象 | 用途 |
|------------|------|
| `ExtensionContext` | 生命周期资源释放、状态存储（workspaceState/globalState/secrets/storageUri） |
| `commands` | 注册/执行命令、setContext |
| `window` | 通知消息、输出通道、状态栏、快速选择、文件选择器、进度 |
| `workspace` | 项目目录、已打开文档、文件搜索、配置读取与变化监听 |
| `env` | 运行环境、语言/宿主信息 |
| `plugins` | 检测依赖插件安装、获取其他插件公开 API |
| `l10n` | 运行时文案本地化 |
| `lm` | 语言模型 API |

### 数据存储

| 方式 | 范围 | 用途 |
|------|------|------|
| `workspaceState` | 工作区级 | 键/值对，重新打开同一工作区时恢复 |
| `globalState` | 全局 | 键/值对，支持跨机器同步（`setKeysForSync`） |
| `secrets` | 全局加密 | 敏感信息，桌面版用 safeStorage，Web 版用 DKE |
| `storageUri` | 工作区级 | 大文件本地目录 |
| `globalStorageUri` | 全局 | 跨工作区大文件本地目录 |

#### setKeysForSync 示例

```typescript
// on activate
const versionKey = 'shown.version';
context.globalState.setKeysForSync([versionKey]);

// later on show page
const currentVersion = context.extension.packageJSON.version;
const lastVersionShown = context.globalState.get(versionKey);
if (isHigher(currentVersion, lastVersionShown)) {
    context.globalState.update(versionKey, currentVersion);
}
```

---

## 命令系统

命令是 Baosky 插件最基础的能力。大多数用户可见能力最终都收敛成命令，再由菜单、快捷键、工具栏等入口触发。

**两层结构：**

- **声明层** — `package.json` 中 `contributes.commands` 告诉平台命令存在
- **运行时层** — `activate()` 中 `commands.registerCommand` 绑定处理函数

### 一个命令被多个入口复用

```ts
import * as baosky from '@baosky/plugin';
import { platform } from '@baosky/plugin';

export async function activate(context: baosky.ExtensionContext) {
  const runDisposable = baosky.commands.registerCommand('demo.runAgent', async () => {
    await baosky.commands.executeCommand('demo.agent.internalRun');
  });

  const [toolbarDisposable] = await platform.registerToolbar([
    { id: 'demo.runAgent.toolbar', title: '运行 Agent', command: 'demo.runAgent' }
  ]);

  const internalDisposable = baosky.commands.registerCommand('demo.agent.internalRun', async () => {
    // 真正的 Agent 逻辑
  });

  context.subscriptions.push(runDisposable, toolbarDisposable, internalDisposable);
}
```

### 设计建议

- 命令 ID 保持稳定、可读、可复用
- 一个核心能力尽量只保留一个主命令
- 用户可见命令和内部命令要分开设计

---

## 菜单能力

菜单能力负责把插件命令挂到平台已经开放的位置上。

**三个关键问题：**

1. **放在哪** — 菜单位置由 `contributes.menus` 的 key 决定
2. **什么时候显示** — 由 `when` 表达式决定
3. **和其他动作怎么排** — 由 `group` 控制分组和顺序

### 顶部菜单栏位置

| 菜单位置 | 适合用途 |
|----------|----------|
| `menubar/help/document` | 插件文档、手册、帮助入口 |
| `menubar/project` | 项目级导入导出、初始化 |
| `menubar/edit` | 编辑类或对象修改类动作 |
| `menubar/tool` | 编译、分析、检查、转换等工具型入口 |
| `menubar/view` | 视图开关、显示控制 |
| `menubar/online` | 连接、下载、上传、在线调试 |
| `menubar/option` | 设置、偏好、环境选项 |
| `menubar/help` | 帮助页、版本信息、支持入口 |
| `menubar/plugin` | 插件自己的聚合入口 |

### 最小例子

```json
{
  "contributes": {
    "commands": [{ "command": "demo.openManual", "title": "打开插件文档" }],
    "menus": {
      "menubar/help": [{
        "command": "demo.openManual",
        "group": "1_common@1"
      }]
    }
  }
}
```

---

## 视图能力

视图能力负责把结构化内容挂到侧边栏、巡视窗口或其他视图容器中。

**适合的能力形态：** 对象浏览器、项目资源树、检查结果列表、搜索结果导航、辅助信息面板。

**典型组成：**
- `contributes.views` + `contributes.viewsContainers`（声明）
- `TreeDataProvider`（数据）
- 命令 + 菜单（节点动作）

### 最小例子

```json
{
  "contributes": {
    "views": {
      "explorer": [{
        "id": "demoView",
        "name": "Demo View"
      }]
    }
  }
}
```

```ts
class DemoProvider implements baosky.TreeDataProvider<string> {
  getTreeItem(element: string): baosky.TreeItem {
    return new baosky.TreeItem(element);
  }
  getChildren(element?: string): string[] {
    return element ? [] : ['A', 'B', 'C'];
  }
}

export function activate(context: baosky.ExtensionContext) {
  const provider = new DemoProvider();
  context.subscriptions.push(
    baosky.window.registerTreeDataProvider('demoView', provider)
  );
}
```

---

## Webview 能力

当树视图、菜单和状态栏不够用时，使用 Webview 提供完整的自定义界面。

**适合的场景：** 富表单、可视化结果页、复杂详情页、定制工作区页面。

详情见 [Webview 端开发](06-webview-dev.md) 和 [Extension ↔ Webview 通信](07-communication.md)。

---

## BSDL 扩展能力

BSDL 是 Baosky 用来描述对象和表达对象操作的 DSL。它不是界面能力，而是一层统一的数据表达方式。

**BSDL 主要包含三种形式：**
- **宏** — 描述对象规范（"这一类对象应该长什么样"）
- **数据** — 描述对象内容（具体对象的取值）
- **操作** — 描述要对对象做什么（创建、删除、搜索、更新）

### BSDL 示例

```bsdl
// 描述 PU 对象内容
{
  "$schema": "pu",
  "$version": "2.0",
  "name": "MotorStart",
  "namespace": "STD",
  "device": "PLC_1",
  "folder": "/Program",
  "type": "PRG",
  "language": "ST",
  "body": "IF Start THEN Motor := TRUE; END_IF;"
}

// 表达搜索动作
{
  "$schema": "$action",
  "type": "search",
  "target": { "$schema": "pu", "device": "PLC_1" }
}
```

### 插件中使用 BSDL 的路径

1. 明确要处理的对象（PU、GVS、Task 等）
2. 确定要表达的是对象内容还是对象操作
3. 用统一 BSDL 内容在插件内部或插件与平台之间传递
4. 把结果接回具体界面入口

### BSDL 的特点

- **可描述** — 把对象内容写成结构化文本
- **AI 友好** — 表达紧凑，适合生成、理解和传输
- **可扩展** — 可为不同对象类型继续扩展
- **宽松解析** — 不强依赖单一固定写法
- **可使用不同语法承载数据** — 例如 `csv`、`ld-dsl` 等

---

## 许可证能力

插件可以通过 IDE 现有的许可证体系授权能力。基本流程：

```
插件功能 → 资源 ID → 查询资源属性 → 控制功能
```

### 示例

```ts
import * as baosky from '@baosky/plugin';
import { platform } from '@baosky/plugin';

const AGENT_RESOURCE_ID = 'ai.agent';

export function activate(context: baosky.ExtensionContext) {
  const disposable = baosky.commands.registerCommand('demo.runAgent', async () => {
    const [resource] = await platform.getAttributesByIDEResource([AGENT_RESOURCE_ID]);
    if (!resource || !resource.attributes?.length) {
      return; // 未授权，阻断能力
    }
    await baosky.commands.executeCommand('demo.agent.internalRun');
  });
  context.subscriptions.push(disposable);
}
```

### 关键点

- 许可证判断单位不是"整个插件"，而是"插件里的某项资源能力"
- 展示层可以隐藏或禁用入口
- 执行层仍然需要再做一次真实校验
