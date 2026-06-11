/**
 * @aimen/agents — HermesBridgeAgent（Hermes 桥接代理）
 *
 * 继承 AimenAgent，通过 ACP 总线连接本地运行中的 Hermes Agent 实例。
 * 接收 TaskSubmit，将目标任务转发至 Hermes Agent 的 REST API，
 * 在 Hermes 不可用时优雅降级为模拟响应。
 *
 * @packageDocumentation
 * @module @aimen/agents/hermes-bridge
 */

import { AimenAgent, AgentStatus } from './aimen-agent.js';

// ---------------------------------------------------------------------------
// 常量
// ---------------------------------------------------------------------------

/** Hermes Agent 默认 API 地址 */
const DEFAULT_HERMES_API_URL = 'http://localhost:3131';

// ---------------------------------------------------------------------------
// HermesBridgeAgent
// ---------------------------------------------------------------------------

/**
 * Hermes 桥接代理
 *
 * 继承 AimenAgent，将任务转发至本地的 Hermes Agent REST API。
 * Hermes Agent 接受自然语言提示并通过 REST 接口返回结果，
 * 本桥接层充当 aimen 系统与 Hermes 之间的适配器。
 *
 * @remarks
 * - 使用内置 fetch API（Bun 原生支持），不引入外部 HTTP 依赖
 * - 提供 healthCheck() 方法检测 Hermes Agent 是否可达
 * - 当 Hermes 不可达时自动降级为模拟（fallback）响应
 * - 通过 forwardToHermes() 工具方法发送提示词至 Hermes
 *
 * @example
 * ```ts
 * const bridge = new HermesBridgeAgent('hermes-1', 'Hermes 桥接');
 * const status = await bridge.healthCheck();
 * const result = await bridge.execute('分析当前项目结构', {});
 * console.log(result);
 * ```
 */
export class HermesBridgeAgent extends AimenAgent {
  /** Hermes Agent API 的基础 URL */
  readonly hermesApiUrl: string;

  /** 上一次健康检查的结果缓存 */
  #lastHealthCheck: { connected: boolean; status: string } | null = null;

  /**
   * @param agentId       - 代理唯一标识
   * @param name          - 代理显示名称（默认 "Hermes Bridge"）
   * @param hermesApiUrl  - Hermes Agent API 地址（默认 http://localhost:3131）
   * @param router        - 可选的 ACP MessageRouter 引用
   */
  constructor(
    agentId: string,
    name: string = 'Hermes Bridge',
    hermesApiUrl?: string,
    router?: import('./aimen-agent.js').AimenAgent['router'],
  ) {
    super(agentId, name, 'hermes', ['hermes-bridge', 'task-forwarding', 'api-gateway'], router);
    this.hermesApiUrl = hermesApiUrl ?? DEFAULT_HERMES_API_URL;
  }

  // -------------------------------------------------------------------------
  // 工具方法
  // -------------------------------------------------------------------------

  /**
   * Hermes Agent 健康检查
   *
   * 向 Hermes API 发送 GET 请求以检测服务是否可达。
   * 支持 HEAD 探测和 GET /api/health 两个端点。
   * 结果会被缓存以避免短时间内重复探测。
   *
   * @returns 包含连接状态和状态描述的对象
   *
   * @example
   * ```ts
   * const health = await bridge.hermesHealthCheck();
   * if (health.connected) {
   *   console.log('Hermes 在线:', health.status);
   * }
   * ```
   */
  async hermesHealthCheck(): Promise<{ connected: boolean; status: string }> {
    try {
      const baseUrl = this.hermesApiUrl.replace(/\/+$/, '');
      const endpoints = [
        `${baseUrl}/api/health`,
        `${baseUrl}/health`,
        `${baseUrl}/`,
      ];

      for (const url of endpoints) {
        const response = await fetch(url, {
          method: 'GET',
          signal: AbortSignal.timeout(3000),
        });

        if (response.ok) {
          const result = { connected: true, status: `Hermes Agent 在线 (${url} — ${response.status})` };
          this.#lastHealthCheck = result;
          return result;
        }
      }

      const result = { connected: false, status: 'Hermes Agent 响应非预期状态码' };
      this.#lastHealthCheck = result;
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const result = { connected: false, status: `Hermes Agent 不可达: ${message}` };
      this.#lastHealthCheck = result;
      return result;
    }
  }

  /**
   * 健康检查（别名 — 与 ACP Ping 协议兼容）
   *
   * 调用 hermesHealthCheck() 并返回结果。
   * 此方法用于 ACP 总线中的 Ping/Pong 探测流程。
   *
   * @returns 包含连接状态和状态描述的对象
   */
  async healthCheck(): Promise<{ connected: boolean; status: string }> {
    return this.hermesHealthCheck();
  }

  /**
   * 将提示词转发至 Hermes Agent
   *
   * 向 Hermes REST API 发送 POST 请求，传递自然语言提示词。
   * 支持两种常见端点格式：/api/chat 和 /api/execute。
   *
   * @param prompt - 发送给 Hermes Agent 的自然语言提示词
   * @returns Hermes Agent 的响应文本
   *
   * @example
   * ```ts
   * const response = await bridge.forwardToHermes('分析 src/ 目录的结构');
   * console.log('Hermes 回复:', response);
   * ```
   */
  async forwardToHermes(prompt: string): Promise<string> {
    const baseUrl = this.hermesApiUrl.replace(/\/+$/, '');
    const body = JSON.stringify({
      prompt,
      message: prompt,
      input: prompt,
    });

    const endpoints = [
      { url: `${baseUrl}/api/chat`, body: JSON.stringify({ prompt }) },
      { url: `${baseUrl}/api/execute`, body: JSON.stringify({ prompt }) },
      { url: `${baseUrl}/api/v1/chat`, body: JSON.stringify({ message: prompt }) },
      { url: `${baseUrl}/api/run`, body: JSON.stringify({ input: prompt }) },
    ];

    let lastError: string | null = null;

    for (const endpoint of endpoints) {
      try {
        const response = await fetch(endpoint.url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: endpoint.body,
          signal: AbortSignal.timeout(30000),
        });

        if (response.ok) {
          const text = await response.text();
          return text || '(Hermes 返回空响应)';
        }

        lastError = `状态码 ${response.status}`;
      } catch {
        lastError = '连接失败';
        continue;
      }
    }

    throw new Error(`无法转发至 Hermes Agent (${this.hermesApiUrl}): ${lastError}`);
  }

  /**
   * Hermes 降级响应（模拟模式）
   *
   * 当 Hermes Agent 不可达时，生成模拟执行结果以确保系统仍可正常运转。
   * 模拟响应包含目标摘要、降级说明和占位结果。
   *
   * @param goal    - 原始任务目标
   * @param context - 原始任务上下文
   * @returns 模拟执行结果
   */
  hermesFallbackResponse(goal: string, context: Record<string, unknown>): Record<string, unknown> {
    const contextKeys = Object.keys(context);
    return {
      status: 'fallback',
      task: goal,
      source: 'hermes-bridge (模拟模式)',
      message: `Hermes Agent 不可达，使用模拟响应。目标: "${goal}"`,
      contextProvided: contextKeys.length > 0 ? contextKeys : '无',
      result: `[模拟执行] 已接收目标「${goal}」并完成模拟分析。${contextKeys.length > 0 ? `使用了上下文字段: ${contextKeys.join(', ')}` : '未提供额外上下文。'}`,
      hermesStatus: this.#lastHealthCheck?.status ?? '未检测',
    };
  }

  // -------------------------------------------------------------------------
  // AimenAgent 抽象方法实现
  // -------------------------------------------------------------------------

  /**
   * 执行代理任务
   *
   * 首先尝试通过 healthCheck() 检测 Hermes Agent 是否可达。
   * - 若 Hermes 在线，将 goal 作为提示词转发至 Hermes REST API 并返回结果
   * - 若 Hermes 不可达，调用 hermesFallbackResponse() 返回模拟结果
   *
   * @param goal    - 任务目标描述（将作为提示词发送给 Hermes）
   * @param context - 任务上下文信息（传递给 Hermes 的附加内容）
   * @returns Hermes 响应结果或模拟降级结果
   */
  async execute(goal: string, context: Record<string, unknown>): Promise<unknown> {
    this.setStatus(AgentStatus.Busy);

    try {
      const health = await this.healthCheck();
      console.log(`[HermesBridge] 健康检查: ${health.status}`);

      if (health.connected) {
        // 构造发送给 Hermes 的完整提示词
        const contextStr = Object.entries(context)
          .map(([key, value]) => `${key}: ${typeof value === 'string' ? value : JSON.stringify(value)}`)
          .join('\n');

        const fullPrompt = contextStr
          ? `任务目标: ${goal}\n\n上下文信息:\n${contextStr}`
          : goal;

        const hermesResponse = await this.forwardToHermes(fullPrompt);

        this.setStatus(AgentStatus.Idle);

        return {
          status: 'completed',
          task: goal,
          source: 'hermes-bridge (Hermes Agent)',
          hermesConnected: true,
          response: hermesResponse,
        };
      }

      // Hermes 不可达，使用降级模式
      console.warn('[HermesBridge] Hermes Agent 不可达，使用模拟降级模式');
      const fallback = this.hermesFallbackResponse(goal, context);

      this.setStatus(AgentStatus.Idle);

      return {
        ...fallback,
        hermesConnected: false,
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);

      console.error('[HermesBridge] 执行出错:', errorMessage);

      // 出错时也降级到模拟响应
      const fallback = this.hermesFallbackResponse(goal, context);

      this.setStatus(AgentStatus.Idle);

      return {
        ...fallback,
        status: 'error',
        error: errorMessage,
        hermesConnected: false,
      };
    }
  }
}