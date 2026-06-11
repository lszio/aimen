#!/usr/bin/env bun
/**
 * @aimen/cli — aimen Agent 编排中枢命令行入口
 *
 * 提供 start（启动 ACP 总线服务）、status（检查服务状态）、
 * help（查看帮助）三个子命令。
 *
 * @packageDocumentation
 * @module @aimen/cli
 */

import { HttpTransport, MessageRouter, PersistedAgentRegistry } from '@aimen/acp-bus';
import { ArchitectAgent, CoderAgent, AgentManager } from '@aimen/agents';
import { AnytypeGateway } from '@aimen/anytype-gateway';

// ---------------------------------------------------------------------------
// 常量
// ---------------------------------------------------------------------------

/** 当前 CLI 版本号 */
const VERSION = '0.1.0';

/** ACP 服务默认端口 */
const DEFAULT_PORT = 4121;

// ---------------------------------------------------------------------------
// 辅助函数
// ---------------------------------------------------------------------------

/**
 * 打印彩色信息日志
 *
 * @param msg - 日志消息
 */
function info(msg: string): void {
  console.log(`\x1b[36mℹ\x1b[0m ${msg}`);
}

/**
 * 打印彩色成功日志
 *
 * @param msg - 日志消息
 */
function success(msg: string): void {
  console.log(`\x1b[32m✔\x1b[0m ${msg}`);
}

/**
 * 打印彩色错误日志
 *
 * @param msg - 日志消息
 */
function error(msg: string): void {
  console.log(`\x1b[31m✘\x1b[0m ${msg}`);
}

// ---------------------------------------------------------------------------
// 命令处理器
// ---------------------------------------------------------------------------

/**
 * 处理 `aimen start` 命令
 *
 * 创建 ACP 总线基础组件（注册中心、消息路由器、HTTP 传输层），
 * 注册内置智能体（ArchitectAgent, CoderAgent），
 * 若环境变量 ANYTYPE_API_KEY 存在则启动 AnytypeGateway。
 *
 * 注意：当前为同步启动（前台阻塞），生产环境应使用 daemon 模式。
 */
async function handleStart(): Promise<void> {
  const port = parseInt(process.env.ACP_PORT || String(DEFAULT_PORT), 10);

  console.log(`\x1b[1;34maimen CLI v${VERSION}\x1b[0m`);
  console.log('');

  // 1) 创建注册中心
  info('正在初始化代理注册中心...');
  const registry = new PersistedAgentRegistry();
  success(`代理注册中心已就绪 (${registry.size} 个已恢复的代理)`);

  // 2) 创建消息路由器
  info('正在初始化消息路由器...');
  const router = new MessageRouter(registry);
  success('消息路由器已就绪');

  // 3) 创建 HTTP 传输层
  info(`正在启动 ACP HTTP 服务 (端口 ${port})...`);
  const transport = new HttpTransport({ port, registry, router });
  await transport.start();
  success(`ACP HTTP 服务已启动 → http://localhost:${port}`);

  // 4) 创建 AgentManager 并注册内置智能体
  info('正在注册内置智能体...');
  const agentManager = new AgentManager(registry);

  const architect = new ArchitectAgent('architect-1', 'Architect', router);
  agentManager.registerAgent(architect, 'architect');
  success(`已注册: ${architect.name} (${architect.agentId})`);

  const coder = new CoderAgent('coder-1', 'Coder', router);
  agentManager.registerAgent(coder, 'coder');
  success(`已注册: ${coder.name} (${coder.agentId})`);

  success(`共 ${registry.size} 个代理在线`);

  // 5) 可选：启动 AnytypeGateway
  if (process.env.ANYTYPE_API_KEY) {
    info('正在连接 Anytype 网关...');
    const gateway = new AnytypeGateway(
      {
        apiKey: process.env.ANYTYPE_API_KEY,
        baseUrl: process.env.ANYTYPE_API_BASE_URL || 'http://127.0.0.1:31009',
      },
      async () => {
        // 从 Anytype 收到任务时的回调 —— 暂为空操作
      },
    );
    gateway.start();
    success('Anytype 网关已连接');
  } else {
    info('跳过 Anytype 网关（未设置 ANYTYPE_API_KEY）');
  }

  console.log('');
  console.log(`  \x1b[90mACP Bus  : http://localhost:${port}/health\x1b[0m`);
  console.log(`  \x1b[90mAgents   : http://localhost:${port}/acp/agents\x1b[0m`);
  console.log('');
  console.log('\x1b[32m aimen 已就绪，按 Ctrl+C 停止服务\x1b[0m');

  // 保持进程运行（生产环境请使用 daemon/PM2）
  await new Promise(() => {});
}

/**
 * 处理 `aimen status` 命令
 *
 * 通过 HTTP GET /health 检查 ACP 总线服务是否运行。
 * 如果服务未启动，返回明确的提示信息。
 */
async function handleStatus(): Promise<void> {
  const port = parseInt(process.env.ACP_PORT || String(DEFAULT_PORT), 10);
  const url = `http://localhost:${port}/health`;

  console.log(`\x1b[1;34maimen CLI v${VERSION}\x1b[0m`);
  console.log('');

  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(3000) });

    if (!response.ok) {
      error(`健康检查失败 (HTTP ${response.status})`);
      process.exit(1);
    }

    const data = await response.json() as { success: boolean; data: { status: string; agentCount: number; uptime: number } };

    if (data.success && data.data.status === 'ok') {
      success(`ACP 服务运行中 - 端口 ${port}`);
      info(`在线代理: ${data.data.agentCount}`);
      info(`运行时长: ${data.data.uptime} 秒`);
    } else {
      error(`服务状态异常: ${JSON.stringify(data)}`);
      process.exit(1);
    }
  } catch (err) {
    if (err instanceof DOMException && err.name === 'TimeoutError') {
      error(`连接超时（${url}）`);
    } else if (err instanceof TypeError && (err as Error).message.includes('fetch')) {
      error(`无法连接到 ACP 服务（${url}）`);
      info('请先执行 "aimen start" 启动服务');
    } else {
      error(`健康检查失败: ${err instanceof Error ? err.message : String(err)}`);
    }
    process.exit(1);
  }
}

/**
 * 打印帮助信息
 */
function handleHelp(): void {
  console.log(`
\x1b[1;34maimen — Agent 编排中枢\x1b[0m  \x1b[90mv${VERSION}\x1b[0m

\x1b[1m用法:\x1b[0m
  bun run src/index.ts <command> [options]

\x1b[1m命令:\x1b[0m
  \x1b[32mstart\x1b[0m   启动 ACP 总线 HTTP 服务并注册内置智能体
  \x1b[32mstatus\x1b[0m  检查 ACP 服务运行状态
  \x1b[32mhelp\x1b[0m    显示此帮助信息

\x1b[1m选项:\x1b[0m
  --help, -h    显示帮助信息

\x1b[1m环境变量:\x1b[0m
  ACP_PORT              ACP 服务端口（默认 ${DEFAULT_PORT}）
  ANYTYPE_API_KEY       Anytype API 密钥
  ANYTYPE_API_BASE_URL  Anytype API 基础地址
  AUTH_JWT_SECRET       JWT 签名密钥
  AUTH_ADMIN_PASSWORD   管理员密码（默认 "admin"）

\x1b[1m示例:\x1b[0m
  bun run src/index.ts start
  ACP_PORT=8080 bun run src/index.ts start
  bun run src/index.ts status
  bun run src/index.ts help
`);
}

// ---------------------------------------------------------------------------
// CLI 入口
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0]?.toLowerCase() || 'help';

  // 处理 --help 或 -h
  if (command === '--help' || command === '-h') {
    handleHelp();
    return;
  }

  switch (command) {
    case 'start':
      await handleStart();
      break;

    case 'status':
      await handleStatus();
      break;

    case 'help':
      handleHelp();
      break;

    default:
      console.error(`\x1b[31m未知命令: ${command}\x1b[0m`);
      console.error('可用命令: start, status, help');
      process.exit(1);
  }
}

main().catch((err: unknown) => {
  console.error('\x1b[31m未捕获的错误:\x1b[0m', err);
  process.exit(1);
});