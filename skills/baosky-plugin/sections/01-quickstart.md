# 快速开始

## 创建项目

```bash
npx create-baosky --registry=http://10.25.7.18:4873
```

选择 `plugin templates` → `helloworld template` 或 `webview template`。

交互式填写示例：

```bash
# ? baosky project name: › baosky_project? baosky_project
# ? Select a framework: › plugin templates
# ? Select a variant: › helloworld template
# ✔ Project created successfully!

# Next steps:
#  cd baosky_project
#  npm run install
#  npm run dev
```

## 开发调试

```bash
cd <plugin-name>
npm run install
npm run dev       # 开发模式
npm run build     # 构建
```

## 插件基础工作流

一个最小插件由三部分组成：

1. **激活事件**（`activationEvents`）— 决定插件何时被加载
2. **贡献点**（`contributes`）— 在 `package.json` 中声明命令、菜单、视图等
3. **运行时代码**（`activate()`）— 使用 `@baosky/plugin` API 注册命令和事件处理

```json title="package.json"
{
  "main": "./dist/extension.js",
  "activationEvents": ["onCommand:demo.helloWorld"],
  "contributes": {
    "commands": [{
      "command": "demo.helloWorld",
      "title": "Hello World"
    }]
  }
}
```

```ts title="src/extension.ts"
import * as baosky from '@baosky/plugin';

export function activate(context: baosky.ExtensionContext) {
  const disposable = baosky.commands.registerCommand('demo.helloWorld', () => {
    baosky.window.showInformationMessage('Hello World!');
  });
  context.subscriptions.push(disposable);
}
```

## 下一步

- [基础概念](02-basic-concepts.md) — 插件权限、项目结构、清单配置
- [核心能力](03-core-capabilities.md) — 命令、菜单、视图、BSDL 等能力详解
