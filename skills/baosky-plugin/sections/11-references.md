# 参考

## 支持的贡献点

| 贡献点 | 用途 |
|--------|------|
| `commands` | 声明命令存在、名称、分类、图标 |
| `grammars` | 注册 TextMate 语法高亮 |
| `keybindings` | 声明快捷键规则 |
| `languages` | 声明语言识别信息（ID、扩展名、文件名） |
| `menus` | 把命令挂到上下文菜单位置 |
| `semanticTokenModifiers` | 补充语义标记修饰符 |
| `semanticTokenScopes` | 语义标记映射到 TextMate scope |
| `semanticTokenTypes` | 声明新的语义标记类型 |
| `snippets` | 注册代码片段文件 |
| `submenus` | 声明可复用子菜单占位符 |
| `views` | 声明自定义视图 |
| `viewsContainers` | 声明视图容器 |
| `usermanual` | 声明插件帮助文档结构 |
| `localizations` | 语言包插件提供的翻译资源 |

---

## 激活事件

| 事件 | 触发时机 |
|------|----------|
| `onStartupFinished` | 启动完成后激活（推荐） |
| `*` | 立即激活 |
| `onCommand:<commandId>` | 指定命令被触发时 |
| `onView:<viewId>` | 指定视图可见时 |
| `onLanguage:<language>` | 指定语言文件打开时 |

---

## When 子句上下文（通用）

| 键 | 类型 | 说明 |
|----|------|------|
| `resourceExtname` | string | 当前文件扩展名 |
| `resourceLangId` | string | 当前文件语言 ID |
| `activeEditor` | string | 当前激活的编辑器类型 |

PLC 专用上下文键见 [PLC When 子句上下文](09-plc-guides.md#plc-when-子句上下文)。

---

## 常见陷阱

| # | 陷阱 | 说明 |
|---|------|------|
| 1 | **`module` 配置** | Extension 用 `format: cjs`，Webview 用 `format: esm`（或 `target: browser`） |
| 2 | **`@baosky/plugin` 必须 external** | 构建 extension 时加 `--external @baosky/plugin --external @baosky/plugin-plc` |
| 3 | **CSP 策略** | Webview HTML 中的 Content-Security-Policy 必须允许 `script-src` + nonce，否则脚本不执行 |
| 4 | **`retainContextWhenHidden: true`** | 不设置的话切换 Tab 回来 Webview 会被重建，状态丢失 |
| 5 | **`localResourceRoots`** | 引用本地资源（图片、字体）时必须设置正确的 root |
| 6 | **Nonce 每次重新生成** | 每次 `resolveWebviewView` 都要生成新的 nonce，不能复用上一次的 |
| 7 | **Webview 构建产物拷贝** | 记得把 webview dist 拷贝到 `assets/webview/` 下，HTML 引用的是 assets 下的路径 |
| 8 | **PLC 菜单位置** | 不要把正文区命令挂到项目树菜单，不要把 LD 细粒度命令挂到 `pu/st/body` |
| 9 | **菜单 `when` 条件** | 复杂业务判断优先用 `setContext` 收敛成布尔键，别塞进一条很长的 `when` |
| 10 | **帮助文档标题** | 跨文档链接按目标文档标题写，不按文件名写；文档标题尽量稳定 |

---

## 参考项目

| 项目 | 特点 | 最佳实践 |
|------|------|----------|
| `bsdl-test/` | 简洁 Webview 插件 | 作为起步模板：React + DSL 操作 + 清晰的构建流水线 |
| `bridge/` | 复杂插件完整示例 | 多包、postbridge RPC、MCP 集成、多服务管理 |
| `ai-assist/` | 大型插件 | 国际化（l10n）、复杂菜单体系、RAG 集成 |
| `ai-plc/` | PLC 领域插件 | 丰富的上下文菜单位（`table/*`、`pu/*`、`tree/*`）、`submenus` 嵌套子菜单、`extensionDependencies`、独立 `build-webview.mjs` 脚本 |
