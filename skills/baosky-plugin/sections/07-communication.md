# Extension ↔ Webview 通信

## 基本消息模式（postMessage）

**Extension 端**（在 Provider 内部）：

```typescript
// 发送消息到 Webview
view.webview.postMessage({ action: "some-action", payload: data });

// 接收 Webview 消息
view.webview.onDidReceiveMessage(async (message) => {
  if (message.action === "dispatch") {
    const result = await doSomething(message.payload);
    view.webview.postMessage({ status: "SUCCESS", payload: result });
  }
});
```

**Webview 端**（通信层封装）：

```typescript
// packages/webview/src/api.ts
declare function acquireVsCodeApi(): {
  postMessage: (message: any) => void;
};

const vscode = acquireVsCodeApi();

export function dispatch(message: any) {
  vscode.postMessage(message);
}

export function addMessageListener(callback: (message: any) => void): () => void {
  const handler = (event: MessageEvent) => callback(event.data);
  window.addEventListener("message", handler);
  return () => window.removeEventListener("message", handler);
}
```

## 高级 RPC 模式（postbridge）

当消息交互复杂时，可使用 `postbridge` 库建立双向 RPC：

**Extension 端：**

```typescript
import { bridge, actor, vscodeExtensionTransport } from "postbridge";
import * as baosky from "@baosky/plugin";

const extensionBridge = bridge();

// 注册 Actor（extension 端暴露的 API）
extensionBridge.register(actor<ContractType>("extension", {
  async doSomething(_ctx, params) {
    return result;
  },
}));

// 在 resolveWebviewView 中连接 transport
transport = vscodeExtensionTransport(view.webview);
disposeTransport = extensionBridge.connect(transport);
view.onDidDispose(() => { disposeTransport(); });
```

**Webview 端：**

```typescript
// 使用 postbridge 的 webviewTransport
// 调用 extension 端 Actor：await call("extension.doSomething", params)
```
