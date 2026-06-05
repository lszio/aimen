# 基础概念

## 插件权限与生命周期

插件系统采用 **权限分级机制**：

| 类型 | 安装者 | 可见范围 | 权限 |
|------|--------|----------|------|
| **系统级插件** | 管理员（Admin） | 所有用户 | 较高 |
| **用户级插件** | 普通用户 | 仅当前用户 | 受限制 |

**优先级规则：** 用户级插件 > 系统级插件。同一插件在两层同时存在时，仅加载优先级更高的版本。

**生命周期：** 安装 →（更新）→ 卸载。插件更新本质上是"安装 + 覆盖"，不会改变所属层级。

**数据绑定：** 插件数据与插件层级绑定。用户级插件卸载时数据一并移除；若回退至系统级版本，则使用系统级插件的数据环境。

---

## 项目结构

### 多包模式（推荐）

```
<plugin-name>/
├── package.json              # 插件元数据、贡献点、工作区配置、构建脚本
├── tsconfig.json             # 根 TS 配置
├── README.md                 # 插件功能描述
├── CHANGELOG.md              # 插件更新日志
├── INSTALL.txt               # 插件安装条款
├── src/
│   └── extension.ts          # 入口：activate() / deactivate()
├── assets/
│   └── webview/              # Webview 构建产物（build 后拷贝到此）
│       └── main.js
├── packages/
│   └── webview/              # Webview 子包（React / Solid / 纯 HTML）
│       ├── package.json
│       ├── tsconfig.json
│       └── src/
│           ├── main.tsx      # React 入口
│           └── api.ts        # 与 Extension 的通信封装
├── dist/                     # extension.ts 构建产物
└── out/                      # 另一种常见的构建输出目录
```

### 单包模式

```
<plugin-name>/
├── package.json
├── tsconfig.json
├── src/
│   ├── extension.ts
│   └── webview/              # Webview 代码直接放在 src 下
│       ├── main.tsx
│       └── api.ts
├── assets/
│   └── webview/              # 构建产物
└── dist/
```

---

## 插件清单（package.json）

```jsonc
{
  "name": "<plugin-name>",                // 插件 ID（如 "bridge", "bsdl-test"）
  "displayName": "显示名称",
  "publisher": "baosky",                  // 发布者，与 Marketplace 一致
  "version": "0.1.0",
  "private": true,
  "main": "./dist/extension.js",          // 入口（编译后）
  "browser": "./dist/browser.js",         // Web 端入口（可选）
  "headless": "./dist/headless.js",       // 无头模式入口（可选）
  "icon": "assets/icon.png",              // 建议 128x128 PNG，不应使用 SVG
  "engines": {
    "baosky": "^1.0.0"                    // 目标平台必须是 baosky
  },
  "categories": ["Other"],
  "activationEvents": [
    "onStartupFinished"                   // 推荐：启动完成后激活
  ],
  "files": [
    "dist", "assets", "package.json", "README.md"
  ],
  "workspaces": ["packages/*"]            // 多包模式需要工作区
}
```

### 关键字段说明

- `name` + `publisher`：Baosky 使用 `<publisher>.<name>` 作为插件的唯一 ID
- `main` / `browser` / `headless`：不同运行环境的入口点
- `icon`：建议使用至少 128x128 像素的 PNG/JPG，不应使用 SVG
- `engines.baosky`：指定依赖的 Baosky API 最低版本，且值不应为 `*`
- `activationEvents` 和 `contributes`：激活事件和贡献点

---

## 贡献点 (contributes)

```jsonc
"contributes": {
  "viewsContainers": {
    "right": [{
      "id": "<plugin>-sidebar",
      "title": "<插件侧边栏标题>",
      "icon": "assets/<icon>.svg"
    }]
  },
  "views": {
    "<plugin>-sidebar": [{
      "type": "webview",
      "id": "<VIEW_ID>",
      "name": "Webview 显示名",
      "icon": "assets/<icon>.svg"
    }]
  },
  "commands": [{
    "command": "<PREFIX>.showSidebar",
    "title": "<前缀>: 打开侧边栏"
  }],
  "menus": {
    "menubar/plugin": [{ "command": "<PREFIX>.openXxx", "group": "<group>" }],
    "view/title": [{ "command": "<PREFIX>.openSettings", "when": "view == <VIEW_ID>", "group": "navigation" }],
    "editor/context": [{ "command": "<PREFIX>.doSomething", "group": "0_xxx@1" }]
  },
  "keybindings": [{
    "command": "<PREFIX>.openXxx",
    "key": "ctrl+l",
    "mac": "cmd+l"
  }]
}
```

完整贡献点列表见 [参考章节](11-references.md)。

---

## 国际化 (l10n)

```jsonc
// package.json 中添加
"l10n": "./l10n",

// l10n/package.nls.json（中文）
{ "pluginName": "插件名" }

// l10n/package.nls.en.json（英文）
{ "pluginName": "Plugin Name" }
```

使用时用 `%key%` 引用：

```jsonc
"displayName": "%pluginName%"
```

---

## tsconfig 配置

### 根 tsconfig.json

```jsonc
{
  "compilerOptions": {
    "lib": ["ESNext", "DOM"],
    "target": "ESNext",
    "module": "Preserve",
    "moduleDetection": "force",
    "jsx": "react-jsx",
    "allowJs": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "verbatimModuleSyntax": true,
    "noEmit": true,
    "strict": true,
    "skipLibCheck": true
  }
}
```

### Webview 子包 tsconfig.json

```jsonc
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ESNext", "DOM"],
    "jsx": "react-jsx",
    "strict": true,
    "skipLibCheck": true,
    "noEmit": true,
    "isolatedModules": true
  },
  "include": ["src"]
}
```
