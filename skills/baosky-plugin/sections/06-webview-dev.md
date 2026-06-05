# Webview 端开发

## 子包配置

```jsonc
// packages/webview/package.json
{
  "name": "@<plugin>/webview",
  "version": "0.0.1",
  "main": "./dist/main.js",
  "scripts": {
    "build": "bun build ./src/main.tsx --outdir ./dist --target=browser --format esm --minify --sourcemap",
    "watch": "bun run build --watch"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@types/react": "^18.3.3",
    "@types/react-dom": "^18.3.0",
    "typescript": "^5"
  }
}
```

> **注意：** `build` 脚本使用 `bun build` 输出到 `dist/`，然后拷贝到根 `assets/webview/` 下供 HTML 引用（见构建章节）。

## React 入口

```tsx
// packages/webview/src/main.tsx
import React, { useState, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { dispatch, addMessageListener } from "./api";

function App() {
  // 1. 监听来自 extension 的消息
  useEffect(() => {
    const remove = addMessageListener((message: any) => {
      if (message.action === "some-event") {
        // handle
      }
    });
    return remove;
  }, []);

  // 2. 发送消息到 extension
  const handleSubmit = () => {
    dispatch({ action: "user-action", payload: { /* ... */ } });
  };

  return (
    <main>
      <h1>My Plugin</h1>
      <button onClick={handleSubmit}>Submit</button>
    </main>
  );
}

const container = document.getElementById("app");
if (container) {
  const root = createRoot(container);
  root.render(<App />);
}
```
