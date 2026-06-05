# Extension 端开发

## 生命周期

```typescript
import * as baosky from "@baosky/plugin";

export async function activate(context: baosky.PluginContext): Promise<void> {
  // 注册 Provider、命令、事件监听
  // context.subscriptions.push(...)
}

export function deactivate(): void {
  // 清理工作
}
```

## WebviewViewProvider（完整模板）

```typescript
import * as baosky from "@baosky/plugin";

const VIEW_ID = "<PREFIX>";
const COMMAND_ID = "<PREFIX>.showSidebar";

export async function activate(context: baosky.PluginContext): Promise<void> {
  const provider = new MyViewProvider(context);

  context.subscriptions.push(
    // 1. 注册 Webview Provider
    baosky.window.registerWebviewViewProvider(VIEW_ID, provider, {
      webviewOptions: { retainContextWhenHidden: true },   // 切换 Tab 保留状态
    }),
    // 2. 注册打开侧边栏命令
    baosky.commands.registerCommand(
      { id: COMMAND_ID, label: "Open Sidebar" },
      async () => {
        await baosky.commands
          .executeCommand(`${VIEW_ID}.focus`)
          .then(undefined, () =>
            baosky.commands
              .executeCommand(`workbench.view.extension.<sidebar-id>`)
              .then(undefined, () => undefined),
          );
      },
    ),
  );
}

class MyViewProvider implements baosky.WebviewViewProvider {
  private view?: baosky.WebviewView;

  constructor(private readonly context: baosky.PluginContext) {}

  /** 外部向 Webview 发送消息 */
  public postMessage(message: unknown) {
    this.view?.webview.postMessage(message);
  }

  /** 确保侧边栏可见 */
  reveal(): void {
    if (this.view) {
      this.view.show?.();
      return;
    }
    void baosky.commands
      .executeCommand("workbench.view.extension.<sidebar-id>")
      .then(undefined, () => undefined);
  }

  resolveWebviewView(view: baosky.WebviewView): void {
    this.view = view;
    view.title = "显示标题";
    view.description = "描述";
    view.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        baosky.Uri.joinPath(this.context.extensionUri, "assets"),
      ],
    };

    view.webview.html = this.getHtmlForWebview(view.webview);

    // 接收来自 Webview 的消息
    view.webview.onDidReceiveMessage(
      async (message) => {
        // 处理 message.action / message.payload
      },
      undefined,
      this.context.subscriptions,
    );
  }

  private getHtmlForWebview(webview: baosky.Webview): string {
    const extensionUri = this.context.extensionUri;
    const scriptUri = webview.asWebviewUri(
      baosky.Uri.joinPath(extensionUri, "assets", "webview", "main.js"),
    );
    const nonce = this.createNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8" />
    <meta http-equiv="Content-Security-Policy"
          content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; img-src ${webview.cspSource} https:; font-src ${webview.cspSource};">
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>My Webview</title>
</head>
<body>
    <div id="app"></div>
    <script type="module" nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }

  private createNonce(): string {
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let value = "";
    for (let i = 0; i < 16; i++) {
      value += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
    }
    return value;
  }
}
```

## BSDL 集成

BSDL（Baosky DSL）是平台 DSL 语言，通过 `@baosky/bsdl` 库解析和执行：

```typescript
import { Action, parse, stringify } from "@baosky/bsdl";
import * as baosky from "@baosky/plugin";

// 监听 BSDL 选择事件
baosky.bsdl.onSelect((select: unknown) => {
  provider.postMessage({ action: "bsdl-select", payload: select });
});

// 分发 BSDL Action
const result = await baosky.bsdl.dispatch({
  actions: [Action.Search(args)],
});
```
