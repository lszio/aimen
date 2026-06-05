# 构建与发布

## 多包构建（推荐）

```jsonc
// 根 package.json
"scripts": {
  "build:extension": "bun build ./src/extension.ts --outdir ./dist --target=node --format cjs --external @baosky/plugin --external @baosky/plugin-plc --sourcemap",
  "build:webview": "bun run --filter @<plugin>/webview build",
  "copy:assets": "mkdir -p assets/webview && cp -r packages/webview/dist/* assets/webview/",
  "build": "bun run build:webview && bun run copy:assets && bun run build:extension",
  "watch": "bun run --filter @<plugin>/webview watch & bun run build:extension --watch",
  "lint": "tsc --noEmit"
}
```

> 构建顺序：Webview（ESM）→ 拷贝资产 → Extension（CJS）

## 打包发布

```bash
# 1. 构建完整插件
bun run build

# 2. 使用 bsx 打包为 .bsx 文件
bsx package --skip-license --allow-missing-repository --out <plugin>_$(date +%s).bsx

# 3. 将 .bsx 文件放到 Baosky 的插件目录下即可安装
```
