# PLC 业务域指南

PLC 指南只讲 PLC 业务域里的扩展位置和落地方式。平台通用机制（commands、menus、views、when 语法）参见[核心能力](03-core-capabilities.md)。

**推荐阅读顺序：**
1. [PLC 贡献点](#plc-贡献点)
2. [PLC When 子句上下文](#plc-when-子句上下文)
3. [项目树菜单](#plc-项目树菜单)
4. [编辑区菜单](#plc-编辑区菜单)
5. [顶部菜单栏](../03-core-capabilities.md#菜单能力)

---

## PLC 与核心指南的边界

| 核心指南负责 | PLC 指南负责 |
|-------------|-------------|
| commands、menus、views 是什么 | PLC 项目树有哪些菜单位 |
| when、group、submenu 怎么写 | PU 的 Head / Body 如何区分 |
| package.json 通用结构 | LD、ST、Monaco 各用什么菜单点 |

---

## PLC 贡献点

### 项目树菜单

#### 元素节点

| 菜单位置 | 说明 |
|----------|------|
| `tree/pu/element` | PU 对象节点，单个程序组织单元 |
| `tree/gvs/element` | GVS 对象节点，单个全局变量表 |
| `tree/iomapping/element` | IO Mapping 对象节点 |
| `tree/udt/element` | UDT 对象节点 |
| `tree/task/element` | Task 对象节点 |
| `tree/chart/element` | Chart 对象节点 |
| `tree/localModule/element` | 本地模块节点 |
| `tree/remoteModule/element` | 远程模块节点 |

#### 文件夹节点

| 菜单位置 | 说明 |
|----------|------|
| `tree/gvs/folder` | GVS 文件夹 |
| `tree/iomapping/folder` | IO Mapping 文件夹 |
| `tree/udt/folder` | UDT 文件夹 |
| `tree/pu/folder` | PU 文件夹 |
| `tree/chart/folder` | Chart 文件夹 |
| `tree/remoteIOSystem/folder` | 远程 IO 系统 |
| `tree/remoteIODevice/folder` | 远程 IO 设备 |
| `tree/unassignedDevice/folder` | 未分配设备 |

#### 分类节点

| 菜单位置 | 说明 |
|----------|------|
| `tree/pu/category` | PU 分类节点 |
| `tree/gvs/category` | GVS 分类节点 |
| `tree/iomapping/category` | IO Mapping 分类节点 |
| `tree/udt/category` | UDT 分类节点 |
| `tree/plc/category` | PLC 分类节点 |
| `tree/task/category` | Task 分类节点 |
| `tree/software/category` | Software 分类节点 |
| `tree/chart/category` | Chart 分类节点 |
| `tree/localConfig/category` | 本地配置分类节点 |
| `tree/localRack/category` | 本地 Rack 分类节点 |
| `tree/remoteConfig/category` | 远程配置分类节点 |

### 编辑区菜单

| 区域 | 菜单位置 | 说明 |
|------|----------|------|
| 表头 | `table/head/context` | 声明表格或映射表格列头 |
| 单元格 | `table/cell/context` | 表格内部单元格 |
| IO 映射头 | `io-mapping/head/context` | IO 映射头部 |
| Monaco 文本 | `monaco/context` | 文本类编辑器 |
| PU LD 程序段编辑 | `pu/ld/segment/edit` | 复制、粘贴、剪切、删除 |
| PU LD 程序段操作 | `pu/ld/segment/process` | 插入、注释等段级处理 |
| PU LD 程序段折叠 | `pu/ld/segment/fold` | 折叠与展开 |
| PU LD 单节点 | `pu/ld/singleNode/edit` | 简单节点本体 |
| PU LD 功能块更新 | `pu/ld/boxNode/update` | 更新管脚或刷新结构 |
| PU LD 功能块编辑 | `pu/ld/boxNode/edit` | 复制、粘贴、删除 |
| PU LD 功能块交叉引用 | `pu/ld/boxNode/crossReference` | 交叉引用入口 |
| PU LD 连线 | `pu/ld/connection/edit` | 节点之间连线 |
| PU LD 桥 | `pu/ld/bridge/edit` | LD 图中的桥元素 |
| PU LD 引脚更新 | `pu/ld/pin/update` | 添加管脚等更新 |
| PU LD 引脚编辑 | `pu/ld/pin/edit` | 引脚编辑类操作 |
| PU LD 操作数 | `pu/ld/operand/*` | define / goto / edit / crossReference |
| PU LD 编辑框 | `pu/ld/editor/*` | define / goto / edit / crossReference |
| PU LD FB 实例 | `pu/ld/instance/*` | define / goto / edit / crossReference |
| PU LD 标签 | `pu/ld/label/edit` | 标签元素 |
| PU LD STCode | `pu/ld/stcode/*` | open / goto / edit / process / fold / crossReference |
| PU ST 正文 | `pu/st/body` | ST 类型 PU 正文编辑区域 |

### 顶部菜单栏

| 菜单位置 | 适合用途 |
|----------|----------|
| `menubar/help/document` | 帮助文档菜单 |
| `menubar/project` | 项目菜单 |
| `menubar/edit` | 编辑菜单 |
| `menubar/tool` | 工具菜单 |
| `menubar/view` | 视图菜单 |
| `menubar/online` | 在线菜单 |
| `menubar/option` | 选项菜单 |
| `menubar/help` | 帮助菜单 |
| `menubar/plugin` | 插件菜单 |

### 组的排序

Baosky IDE 当前已知开放给插件的 `group` 分组统一是以下六类：

```jsonc
// 1_common: [1-10]    — 常规组（添加、打开、重命名）
// 2_node_edit: [11-20] — 编辑组（复制、粘贴、删除）
// 3_node_diff          — 比较组
// 4_dir_actions: [21-30] — 目录操作组
// 5_tools: [30-]        — 工具组（编译、下载、交叉引用）
// 6_properties: [30-]   — 属性组
```

组内顺序通过 `group@order` 表达：

```json
{
  "contributes": {
    "menus": {
      "tree/pu/element": [
        { "command": "plc.openSomething", "group": "1_common@1" },
        { "command": "plc.copySomething", "group": "2_node_edit@12" },
        { "command": "plc.buildSomething", "group": "5_tools@31" }
      ]
    }
  }
}
```

### contributes.usermanual

PLC 插件常使用 `contributes.usermanual` 挂载操作手册、规则说明和对象说明文档。

结构为"按语言分组的对象"：

```jsonc
{
  "contributes": {
    "usermanual": {
      "zh-Hans": [
        {
          "title": "操作手册",
          "children": [
            { "path": "./docs/ZH/analysis/entrance.md", "title": "代码分析入口" }
          ]
        }
      ],
      "en": [
        {
          "title": "Operating Manual",
          "children": [
            { "path": "./docs/EN/analysis/entrance.md", "title": "Code Analysis Entrance" }
          ]
        }
      ]
    }
  }
}
```

#### 帮助文档 Markdown 规则

| 规则 | 说明 |
|------|------|
| **图片** | 使用普通 Markdown 相对路径 |
| **标题锚点** | 使用标题末尾 `{#AnchorId}` 写法 |
| **跨文档链接** | 按目标文档**标题**跳转，不按文件名 |
| **容器语法** | 支持 `:::info` / `:::tip` / `:::warning` / `:::danger` / `:::note` |

#### "跳转到帮助文档"按钮

插件详情页是否展示此按钮，取决于当前语言下 `usermanual` 数组的第一个元素类型：

- 第一个元素直接带 `path` → 显示按钮，点击进入该文档页面
- 第一个元素是目录节点（只有 `title` 和 `children`）→ 不显示按钮

---

## PLC When 子句上下文

### 常用上下文键

| 上下文键 | 说明 | 常见值 |
|----------|------|--------|
| `activeEditor` | 当前激活的编辑器类型 | `PU`、`ENCRYPT_PU`、`GVS`、`GVS_LIST`、`C_LIB`、`UDT` |
| `objBizType` | 当前项目树选中对象的业务类型 | `pu`、`pu_encrypt`、`gvs`、`udt`、`task` |
| `objExt` | 当前对象的扩展名 | `.st`、`.ldg`、`.gvl` |

### 常见组合

```jsonc
// 只在 ST 类型的 PU 上显示
"when": "objBizType == 'pu' && objExt == '.st'"

// 只在 LD 类型的 PU 上显示
"when": "objBizType == 'pu' && objExt == '.ldg'"

// 只在 PU 编辑器中显示
"when": "activeEditor == 'PU'"

// 配合 in 使用动态白名单
"when": "objExt in plc.allowedExts"
```

### 设置自定义上下文键

```typescript
baosky.commands.executeCommand('setContext', 'plc.canOpenCrossReference', true);
baosky.commands.executeCommand('setContext', 'plc.allowedExts', ['.st', '.ldg']);
```

### 编写建议

- `objBizType` 适合区分对象类别
- `objExt` 适合区分同类对象里的具体文件类型
- `activeEditor` 适合控制编辑器工具栏和编辑区右键菜单
- 复杂判断优先在代码里用 `setContext` 计算好，`when` 只消费结果

---

## PLC 项目树菜单

### 最小示例

```json
{
  "contributes": {
    "commands": [{
      "command": "plc.openCustomTool",
      "title": "打开自定义工具"
    }],
    "menus": {
      "tree/pu/element": [{
        "command": "plc.openCustomTool",
        "when": "objBizType == 'pu'",
        "group": "1_common@1"
      }]
    }
  }
}
```

### 完整示例

```json
{
  "contributes": {
    "commands": [{
      "command": "plc.openCrossReference",
      "title": "打开交叉引用",
      "category": "PLC"
    }],
    "menus": {
      "tree/pu/element": [{
        "command": "plc.openCrossReference",
        "when": "objBizType == 'pu' && objExt == '.st'",
        "group": "5_tools@31"
      }]
    }
  }
}
```

```typescript
export function activate(context: baosky.ExtensionContext) {
  const disposable = baosky.commands.registerCommand('plc.openCrossReference', async (...args) => {
    // 根据当前树节点或业务对象执行处理
  });
  context.subscriptions.push(disposable);
}
```

### 位置选择建议

- `element` → 命令作用于单个对象
- `folder` → 命令作用于目录或目录下集合
- `category` → 命令作用于分类节点或分类入口

---

## PLC 编辑区菜单

### 最小示例

```json
{
  "contributes": {
    "commands": [{
      "command": "plc.findCrossReference",
      "title": "交叉引用"
    }],
    "menus": {
      "pu/ld/operand/crossReference": [{
        "command": "plc.findCrossReference",
        "when": "activeEditor == 'PU'",
        "group": "5_tools@31"
      }]
    }
  }
}
```

### 选择建议

- 文本正文 → `monaco/context`
- 表格或声明区 → `table/*` / `io-mapping/*`
- LD 编辑区 → 按命中对象挂到更细的 `pu/ld/*` 位置
- ST 正文 → `pu/st/body`

---

## PLC API 参考

`@baosky/plugin-plc` 提供 PLC 业务域可直接调用的接口：

| 命名空间/函数 | 说明 |
|--------------|------|
| `bsdl.*` | onSelect、dispatch（search/select/create/update/patch） |
| `event.*` | 系统事件监听（onEvent） |
| `library.*` | 库元素操作（getAllLibraryElements、addToRefLibByLibSet、libraryToBoxNode 等） |
| `apply / get / getCurrent / setCurrent / list` | 协议级数据读写 |
| `doRefactor` / `refactorSymbol` | 重构操作 |
| `executeCrossReference` | 交叉引用查询 |
| `exportPLCopen` / `importPLCopen` | PLCopen 导入导出 |
| `isPLC` / `getPLCParamsByPath` | 路径/设备判断 |
| `getAllDeviceKeys` / `getAvailableSlots` | 硬件配置 |
| `getLanguageStatus` / `getLanguageVersion` | 语言服务状态 |
| `provideQuickFixAction` | 快速修复 |
