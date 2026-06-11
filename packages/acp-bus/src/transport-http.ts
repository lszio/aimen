/**
 * @aimen/acp-bus — ACP HTTP 传输层
 *
 * 本模块提供基于 Bun.serve 的 HTTP 传输层实现。
 * HttpTransport 类封装了 HTTP 服务器的生命周期管理和请求路由逻辑，
 * 将 HTTP 请求转换为 ACP 内部消息进行路由，并返回标准化的 JSON 响应。
 *
 * @packageDocumentation
 * @module @aimen/acp-bus/transport-http
 */

import {
  AcpMessageType,
  type AcpMessageEnvelope,
  type AcpAgentInfo,
} from './types.js';
import type { AgentRegistry, MessageRouter } from './router.js';

// ---------------------------------------------------------------------------
// 类型定义
// ---------------------------------------------------------------------------

/**
 * HttpTransport 构造选项
 */
export interface HttpTransportOptions {
  /** 服务器监听端口号 */
  port: number;
  /** 代理注册中心实例 */
  registry: AgentRegistry;
  /** 消息路由器实例 */
  router: MessageRouter;
}

// ---------------------------------------------------------------------------
// 辅助函数
// ---------------------------------------------------------------------------

/**
 * 获取 URL 路径参数
 *
 * 根据路由模式匹配实际路径并提取命名参数。
 * 例如：模式 `/acp/agents/:id` 匹配 `/acp/agents/foo` → { id: 'foo' }
 *
 * @param pattern - 路由模式（支持 :param 占位符）
 * @param urlPath - 实际请求路径
 * @returns 匹配成功返回参数对象，失败返回 null
 */
function matchPath(
  pattern: string,
  urlPath: string,
): Record<string, string> | null {
  const patternParts = pattern.split('/');
  const pathParts = urlPath.split('/');

  if (patternParts.length !== pathParts.length) {
    return null;
  }

  const params: Record<string, string> = {};

  for (let i = 0; i < patternParts.length; i++) {
    if (patternParts[i].startsWith(':')) {
      const paramName = patternParts[i].slice(1);
      params[paramName] = decodeURIComponent(pathParts[i]);
    } else if (patternParts[i] !== pathParts[i]) {
      return null;
    }
  }

  return params;
}

/**
 * 构建标准化的 JSON 响应
 *
 * @param data   - 成功时的响应数据
 * @param status - HTTP 状态码，默认 200
 * @returns Response 对象
 */
function jsonSuccess(data: unknown, status = 200): Response {
  return jsonResponse({ success: true, data }, status);
}

/**
 * 构建标准化的 JSON 错误响应
 *
 * @param error  - 错误描述信息
 * @param status - HTTP 状态码，默认 400
 * @returns Response 对象
 */
function jsonError(error: string, status = 400): Response {
  return jsonResponse({ success: false, error }, status);
}

/**
 * 构建带 CORS 头的 JSON Response
 *
 * @param body   - 响应体对象
 * @param status - HTTP 状态码
 * @returns Response 对象
 */
function jsonResponse(body: object, status: number): Response {
  const headers = corsHeaders();
  headers.set('Content-Type', 'application/json; charset=utf-8');
  return new Response(JSON.stringify(body), { status, headers });
}

/**
 * 构建 CORS 响应头
 *
 * 允许所有来源的跨域请求，支持 Astro 控制台的集成。
 *
 * @returns Headers 对象
 */
function corsHeaders(): Headers {
  const headers = new Headers();
  headers.set('Access-Control-Allow-Origin', '*');
  headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  headers.set('Access-Control-Max-Age', '86400');
  return headers;
}

/**
 * 处理 OPTIONS 预检请求
 *
 * @returns 带 CORS 头的空响应
 */
function handleOptions(): Response {
  return new Response(null, { status: 204, headers: corsHeaders() });
}

// ---------------------------------------------------------------------------
// HttpTransport — HTTP 传输层
// ---------------------------------------------------------------------------

/**
 * 判断 JSON 解析结果是否为有效的 AcpMessageEnvelope
 *
 * 校验所有必需字段存在且类型正确，校验通过后 TS 类型收窄为 AcpMessageEnvelope。
 */
function isValidEnvelope(body: unknown): body is AcpMessageEnvelope {
  if (typeof body !== 'object' || body === null) return false;
  const b = body as Record<string, unknown>;
  return (
    typeof b.protocol === 'string' &&
    typeof b.messageId === 'string' &&
    typeof b.senderId === 'string' &&
    typeof b.targetId === 'string' &&
    typeof b.messageType === 'string' &&
    typeof b.payload === 'object' &&
    b.payload !== null &&
    typeof b.timestamp === 'string'
  );
}

/**
 * 基于 Bun.serve 的 HTTP 传输层
 *
 * 将 ACP 消息协议映射到 RESTful HTTP 端点，提供：
 * - POST /acp/task               — 提交任务（TaskSubmit）
 * - POST /acp/message            — 路由任意类型的 ACP 消息
 * - POST /acp/announce           — 注册外部代理（AgentAnnounce）
 * - POST /acp/leave              — 外部代理离线注销（AgentLeave）
 * - POST /acp/ping               — 更新外部代理心跳
 * - GET  /acp/agents             — 获取所有代理列表
 * - GET  /acp/agents/:id         — 获取指定代理详情
 * - GET  /acp/agents/:id/heartbeat — 获取指定代理心跳时间戳
 * - POST /acp/agents/:id/cancel  — 取消指定代理的任务（TaskCancel）
 * - GET  /health                 — 健康检查
 *
 * 所有端点支持 CORS，返回标准化的 JSON 格式：{ success, data?, error? }
 *
 * @example
 * ```ts
 * const registry = new AgentRegistry();
 * const router   = new MessageRouter(registry);
 * const transport = new HttpTransport({ port: 4121, registry, router });
 *
 * await transport.start();
 * console.log('🚀 ACP HTTP 服务已启动');
 *
 * // 稍后停止
 * // await transport.stop();
 * ```
 */
export class HttpTransport {
  /** 服务器配置选项 */
  readonly #options: HttpTransportOptions;

  /** Bun.serve 返回的服务器实例 */
  #server: ReturnType<typeof Bun.serve> | null = null;

  /** 服务器启动时间戳（毫秒） */
  #startTime = 0;

  /** 默认请求超时时间（毫秒） */
  static readonly TIMEOUT_MS = 30_000;

  /**
   * @param options - 构造选项，包含端口号、代理注册中心和消息路由器
   */
  constructor(options: HttpTransportOptions) {
    this.#options = options;
  }

  /**
   * 获取服务器启动时长（秒）
   */
  get #uptime(): number {
    if (this.#startTime === 0) return 0;
    return Math.floor((Date.now() - this.#startTime) / 1000);
  }

  // -----------------------------------------------------------------------
  // 生命周期管理
  // -----------------------------------------------------------------------

  /**
   * 启动 HTTP 服务器
   *
   * 调用 Bun.serve 启动监听，返回的 Promise 在服务器就绪时 resolve。
   * 如果服务器已运行，则直接 resolve。
   *
   * @returns 当服务器成功启动并开始监听后 resolve
   */
  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.#server) {
        resolve();
        return;
      }

      try {
        this.#startTime = Date.now();

        this.#server = Bun.serve({
          port: this.#options.port,
          fetch: (request: Request): Response | Promise<Response> => {
            return this.#handleRequest(request);
          },
        });

        // Bun.serve 是同步启动的，启动成功即可 resolve
        resolve();
      } catch (err) {
        this.#startTime = 0;
        reject(err);
      }
    });
  }

  /**
   * 停止 HTTP 服务器
   *
   * 调用 Bun.serve 的 stop() 方法优雅关闭服务器。
   * 如果服务器未运行，则无操作。
   */
  stop(): void {
    if (this.#server) {
      this.#server.stop();
      this.#server = null;
      this.#startTime = 0;
    }
  }

  /**
   * 获取当前服务器实例（仅用于调试/测试）
   */
  get server(): ReturnType<typeof Bun.serve> | null {
    return this.#server;
  }

  /**
   * 判断服务器是否正在运行
   */
  get running(): boolean {
    return this.#server !== null;
  }

  // -----------------------------------------------------------------------
  // 内部路由
  // -----------------------------------------------------------------------

  /**
   * 处理所有传入的 HTTP 请求
   *
   * 根据请求方法和路径分派到对应的内部处理方法。
   *
   * @param request - 传入的 HTTP 请求
   * @returns HTTP 响应
   */
  async #handleRequest(request: Request): Promise<Response> {
    const { method, url } = request;
    const urlObj = new URL(url);
    const path = urlObj.pathname;

    // OPTIONS 预检请求 — 直接返回 CORS 头
    if (method === 'OPTIONS') {
      return handleOptions();
    }

    try {
      // ---- POST /acp/task ----
      if (method === 'POST' && path === '/acp/task') {
        return await this.#handleTaskSubmit(request);
      }

      // ---- POST /acp/message ----
      if (method === 'POST' && path === '/acp/message') {
        return await this.#handleMessage(request);
      }

      // ---- POST /acp/announce ----
      if (method === 'POST' && path === '/acp/announce') {
        return await this.#handleAnnounce(request);
      }

      // ---- POST /acp/leave ----
      if (method === 'POST' && path === '/acp/leave') {
        return await this.#handleLeave(request);
      }

      // ---- POST /acp/ping ----
      if (method === 'POST' && path === '/acp/ping') {
        return await this.#handlePing(request);
      }

      // ---- GET /acp/agents ----
      if (method === 'GET' && path === '/acp/agents') {
        return this.#handleListAgents();
      }

      // ---- GET /acp/agents/:id ----
      const idMatch = matchPath('/acp/agents/:id', path);
      if (idMatch && method === 'GET') {
        // 检查是否有更具体的子路径
        const hbMatch = matchPath('/acp/agents/:id/heartbeat', path);
        if (hbMatch && method === 'GET') {
          return this.#handleHeartbeat(hbMatch.id);
        }
        return this.#handleGetAgent(idMatch.id);
      }

      // ---- POST /acp/agents/:id/cancel ----
      const cancelMatch = matchPath('/acp/agents/:id/cancel', path);
      if (cancelMatch && method === 'POST') {
        return await this.#handleCancelTask(request, cancelMatch.id);
      }

      // ---- GET /health ----
      if (method === 'GET' && path === '/health') {
        return this.#handleHealth();
      }

      // ---- 404 ----
      return jsonError('未找到请求的资源', 404);
    } catch (err) {
      const message = err instanceof Error ? err.message : '服务器内部错误';
      return jsonError(message, 500);
    }
  }

  // -----------------------------------------------------------------------
  // 端点处理器
  // -----------------------------------------------------------------------

  /**
   * 处理 POST /acp/task — 提交任务
   *
   * 解析请求体为 AcpMessageEnvelope，强制设置 messageType 为 TaskSubmit，
   * 然后通过 MessageRouter 进行路由。
   *
   * @param request - 传入的 HTTP 请求
   * @returns 路由结果或错误响应
   */
  async #handleTaskSubmit(request: Request): Promise<Response> {
    const body = await this.#parseBody(request);
    if (!body || !isValidEnvelope(body)) {
      return jsonError('请求体为空或 JSON 格式无效');
    }

    const envelope = body as unknown as AcpMessageEnvelope;
    envelope.messageType = AcpMessageType.TaskSubmit;

    const result = await this.#options.router.route(envelope);
    return result.success
      ? jsonSuccess(result.response)
      : jsonError(
          (result.response?.payload as { message?: string })?.message ?? '任务路由失败',
          502,
        );
  }

  /**
   * 处理 POST /acp/message — 路由任意类型的消息
   *
   * 解析请求体为 AcpMessageEnvelope，保留请求中原有的 messageType，
   * 然后通过 MessageRouter 进行路由。不再强制覆盖 messageType 为 Message。
   *
   * @param request - 传入的 HTTP 请求
   * @returns 路由结果或错误响应
   */
  async #handleMessage(request: Request): Promise<Response> {
    const body = await this.#parseBody(request);
    if (!body || !isValidEnvelope(body)) {
      return jsonError('请求体为空或 JSON 格式无效');
    }

    const envelope = body as unknown as AcpMessageEnvelope;

    const result = await this.#options.router.route(envelope);
    return result.success
      ? jsonSuccess(result.response)
      : jsonError(
          (result.response?.payload as { message?: string })?.message ?? '消息路由失败',
          502,
        );
  }

  /**
   * 处理 GET /acp/agents — 获取所有代理列表
   *
   * @returns 包含所有已注册代理信息数组的成功响应
   */
  #handleListAgents(): Response {
    const agents = this.#options.registry.list();
    return jsonSuccess(agents);
  }

  /**
   * 处理 GET /acp/agents/:id — 获取指定代理详情
   *
   * @param agentId - 代理 ID
   * @returns 代理信息或 404 错误
   */
  #handleGetAgent(agentId: string): Response {
    const agent = this.#options.registry.get(agentId);
    if (!agent) {
      return jsonError(`未找到代理: ${agentId}`, 404);
    }
    return jsonSuccess(agent);
  }

  /**
   * 处理 GET /health — 健康检查
   *
   * @returns 包含服务状态、代理数量和运行时长的成功响应
   */
  #handleHealth(): Response {
    return jsonSuccess({
      status: 'ok',
      agentCount: this.#options.registry.size,
      uptime: this.#uptime,
    });
  }

  /**
   * 处理 POST /acp/agents/:id/cancel — 取消指定代理的任务
   *
   * 构造一个 TaskCancel 类型的消息信封，通过 MessageRouter 进行路由。
   *
   * @param request - 传入的 HTTP 请求
   * @param agentId - 目标代理 ID
   * @returns 路由结果或错误响应
   */
  async #handleCancelTask(request: Request, agentId: string): Promise<Response> {
    const body = await this.#parseBody(request);
    const payload = body && typeof body === 'object'
      ? (body as Record<string, unknown>)
      : {};

    const envelope: AcpMessageEnvelope = {
      protocol: 'acp/1.0',
      messageId: crypto.randomUUID(),
      senderId: 'http-transport',
      targetId: agentId,
      messageType: AcpMessageType.TaskCancel,
      payload,
      timestamp: new Date().toISOString(),
    };

    const result = await this.#options.router.route(envelope);
    return result.success
      ? jsonSuccess(result.response)
      : jsonError(
          (result.response?.payload as { message?: string })?.message ?? '取消任务路由失败',
          502,
        );
  }

  // -----------------------------------------------------------------------
  // 外部代理注册端点
  // -----------------------------------------------------------------------

  /**
   * 处理 POST /acp/announce — 注册外部代理
   *
   * 接受 AgentAnnounce 消息信封，从 payload 中提取代理信息，
   * 通过 AgentRegistry.register() 将代理注册到注册中心。
   * 支持外部 ACP 兼容代理（如独立 Hermes 实例、Python 代理等）的自主上线。
   *
   * @param request - 传入的 HTTP 请求，需包含 AcpMessageEnvelope 格式的 JSON 体，
   *                  其中 messageType 应为 AgentAnnounce，payload 需包含 agent 字段
   * @returns 包含注册结果和代理信息的成功响应，或错误响应
   *
   * @example
   * ```json
   * POST /acp/announce
   * {
   *   "protocol": "acp/1.0",
   *   "messageId": "uuid",
   *   "senderId": "agent-xyz",
   *   "targetId": "router",
   *   "messageType": "AgentAnnounce",
   *   "payload": {
   *     "agent": {
   *       "id": "agent-xyz",
   *       "name": "助手甲",
   *       "role": "assistant",
   *       "status": "online",
   *       "capabilities": ["chat", "search"],
   *       "lastHeartbeat": "2025-01-01T00:00:00.000Z"
   *     }
   *   },
   *   "timestamp": "2025-01-01T00:00:00.000Z"
   * }
   * ```
   */
  async #handleAnnounce(request: Request): Promise<Response> {
    const body = await this.#parseBody(request);
    if (!body || !isValidEnvelope(body)) {
      return jsonError('请求体为空或 JSON 格式无效');
    }

    const envelope = body as unknown as AcpMessageEnvelope;

    // 通过 MessageRouter.route 自动处理 AgentAnnounce 注册
    const result = await this.#options.router.route(envelope);

    if (!result.success) {
      return jsonError(
        (result.response?.payload as { message?: string })?.message ?? '代理注册失败',
        502,
      );
    }

    // 返回已注册的代理信息（如果有）
    const agentInfo = envelope.payload?.agent as AcpAgentInfo | undefined;
    return jsonSuccess({
      agent: agentInfo,
    });
  }

  /**
   * 处理 POST /acp/leave — 外部代理离线注销
   *
   * 接受 { agentId, reason? } 格式的请求体，通过 AgentRegistry.unregister()
   * 从注册中心移除指定代理。调用后该代理将不再出现在 /acp/agents 列表中，
   * 且后续发往该代理的消息将路由失败。
   *
   * @param request - 传入的 HTTP 请求，JSON 体需包含 agentId 字段，可选 reason 字段
   * @returns 包含注销结果的成功响应，或错误响应
   *
   * @example
   * ```json
   * POST /acp/leave
   * {
   *   "agentId": "agent-xyz",
   *   "reason": "shutting down"
   * }
   * ```
   */
  async #handleLeave(request: Request): Promise<Response> {
    const body = await this.#parseBody(request);
    if (!body) {
      return jsonError('请求体为空或 JSON 格式无效');
    }

    const agentId = body.agentId as string | undefined;
    if (!agentId) {
      return jsonError('缺少必填字段: agentId');
    }

    const registry = this.#options.registry;
    const removed = registry.unregister(agentId);

    if (!removed) {
      return jsonError(`未找到代理: ${agentId}`, 404);
    }

    return jsonSuccess({
      agentId,
      unregistered: true,
      reason: (body.reason as string) ?? undefined,
    });
  }

  /**
   * 处理 POST /acp/ping — 更新外部代理心跳
   *
   * 接受 { agentId } 格式的请求体，通过 AgentRegistry.setStatus()
   * 将指定代理的状态保持为 "online" 并刷新 lastHeartbeat 时间戳。
   * 外部代理应定期调用此端点（如每 30 秒）以维持在线状态。
   *
   * @param request - 传入的 HTTP 请求，JSON 体需包含 agentId 字段
   * @returns 包含心跳更新时间戳的成功响应，或错误响应
   *
   * @example
   * ```json
   * POST /acp/ping
   * {
   *   "agentId": "agent-xyz"
   * }
   * ```
   */
  async #handlePing(request: Request): Promise<Response> {
    const body = await this.#parseBody(request);
    if (!body) {
      return jsonError('请求体为空或 JSON 格式无效');
    }

    const agentId = body.agentId as string | undefined;
    if (!agentId) {
      return jsonError('缺少必填字段: agentId');
    }

    const registry = this.#options.registry;
    const updated = registry.setStatus(agentId, 'online');

    if (!updated) {
      return jsonError(`未找到代理: ${agentId}，请先通过 POST /acp/announce 注册`, 404);
    }

    const agent = registry.get(agentId);
    return jsonSuccess({
      agentId,
      status: 'online',
      lastHeartbeat: agent?.lastHeartbeat,
    });
  }

  /**
   * 处理 GET /acp/agents/:id/heartbeat — 获取指定代理的心跳时间戳
   *
   * 查询 AgentRegistry 中指定代理的 lastHeartbeat 字段，
   * 返回代理 ID 和最近一次心跳更新时间戳。
   * 可用于监控组件判断代理是否超时失联。
   *
   * @param agentId - 代理 ID
   * @returns 包含代理心跳信息的成功响应，或 404 错误
   *
   * @example
   * ```json
   * GET /acp/agents/agent-xyz/heartbeat
   * → { "success": true, "data": { "agentId": "agent-xyz", "lastHeartbeat": "2025-01-01T00:00:00.000Z" } }
   * ```
   */
  #handleHeartbeat(agentId: string): Response {
    const agent = this.#options.registry.get(agentId);
    if (!agent) {
      return jsonError(`未找到代理: ${agentId}`, 404);
    }
    return jsonSuccess({
      agentId: agent.id,
      lastHeartbeat: agent.lastHeartbeat,
    });
  }

  // -----------------------------------------------------------------------
  // 工具方法
  // -----------------------------------------------------------------------

  /**
   * 解析 HTTP 请求的 JSON 体
   *
   * @param request - HTTP 请求
   * @returns 解析后的对象，解析失败返回 null
   */
  async #parseBody(request: Request): Promise<Record<string, unknown> | null> {
    try {
      const text = await request.text();
      if (!text) return null;
      return JSON.parse(text) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
}