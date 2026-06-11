/**
 * @aimen/agents — AimenAgent 基类
 *
 * 所有 aimen 代理的基类。包装 LLM 调用能力，连接到 ACP Bus，
 * 处理 TaskSubmit → execute → TaskResult 生命周期。
 * 抽象方法 execute() 由子类实现，子类可通过 callLLM() 获取真实 LLM 响应。
 * 无 LLM 环境变量时自动降级为模拟数据。
 *
 * @packageDocumentation
 * @module @aimen/agents/aimen-agent
 */

import type { AcpMessageEnvelope } from '@aimen/acp-bus';
import { AcpMessageType, createMessage, isAcpTaskPayload } from '@aimen/acp-bus';
import type { MessageRouter } from '@aimen/acp-bus';

// ---------------------------------------------------------------------------
// LLM 配置与调用
// ---------------------------------------------------------------------------

/**
 * LLM 配置，从环境变量读取
 */
export interface LLMConfig {
  /** API 基础 URL，默认读取 LLM_API_URL 环境变量 */
  apiUrl: string;
  /** API Key，默认读取 LLM_API_KEY 环境变量 */
  apiKey: string;
  /** 模型名称，默认读取 LLM_MODEL 环境变量 */
  model: string;
  /** 温度，默认 0.7 */
  temperature: number;
  /** 最大生成长度，默认 4096 */
  maxTokens: number;
}

/**
 * 从环境变量读取 LLM 配置
 *
 * 当环境变量不完整时返回 null，表示应使用模拟模式。
 */
function getLLMConfig(): LLMConfig | null {
  const apiUrl = process.env.LLM_API_URL;
  const apiKey = process.env.LLM_API_KEY;
  const model = process.env.LLM_MODEL;

  if (!apiUrl || !apiKey || !model) return null;

  return {
    apiUrl,
    apiKey,
    model,
    temperature: parseFloat(process.env.LLM_TEMPERATURE || '0.7'),
    maxTokens: parseInt(process.env.LLM_MAX_TOKENS || '4096', 10),
  };
}

/**
 * 调用 OpenAI 兼容的 LLM API
 *
 * @param system  - 系统提示词
 * @param prompt  - 用户提示词
 * @param config  - LLM 配置（可选，不传时从环境变量读取）
 * @returns LLM 响应文本
 * @throws 当配置缺失或 API 调用失败时抛出错误
 */
export async function callLLM(
  system: string,
  prompt: string,
  config?: LLMConfig,
): Promise<string> {
  const cfg = config ?? getLLMConfig();
  if (!cfg) {
    throw new Error('LLM 配置不完整 — 请设置 LLM_API_URL, LLM_API_KEY, LLM_MODEL 环境变量');
  }

  const body = {
    model: cfg.model,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: prompt },
    ],
    temperature: cfg.temperature,
    max_tokens: cfg.maxTokens,
  };

  const baseUrl = cfg.apiUrl.replace(/\/+$/, '');
  const url = baseUrl.includes('/chat/completions')
    ? baseUrl
    : `${baseUrl}/chat/completions`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${cfg.apiKey}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120_000),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`LLM API 错误 (${response.status}): ${text.slice(0, 200)}`);
  }

  const data = (await response.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error('LLM API 返回空内容');
  }

  return content;
}

/**
 * 判断 LLM 是否可用（环境变量是否完整）
 */
export function isLLMAvailable(): boolean {
  return !!(
    process.env.LLM_API_URL &&
    process.env.LLM_API_KEY &&
    process.env.LLM_MODEL
  );
}

// ---------------------------------------------------------------------------
// 状态枚举
// ---------------------------------------------------------------------------

/**
 * 代理运行状态枚举
 */
export enum AgentStatus {
  Idle = 'idle',
  Busy = 'busy',
  Error = 'error',
}

// ---------------------------------------------------------------------------
// 状态信息接口
// ---------------------------------------------------------------------------

/**
 * 代理状态信息
 */
export interface AgentStatusInfo {
  agentId: string;
  name: string;
  role: string;
  status: AgentStatus;
  capabilities: string[];
}

// ---------------------------------------------------------------------------
// AimenAgent 基类
// ---------------------------------------------------------------------------

/**
 * 所有 aimen 代理的抽象基类
 *
 * 持有 ACP MessageRouter 引用，实现 TaskSubmit → execute → TaskResult 生命周期。
 * 子类可通过 callLLM() 方法调用真实 LLM API，或自行实现 execute() 逻辑。
 *
 * @remarks
 * - execute() 为抽象方法，子类必须实现
 * - 子类可通过 this.callLLM() 调用 LLM API（需要设置 LLM_API_URL 等环境变量）
 * - 无 LLM 环境变量时 callLLM() 抛出错误，子类应降级为模拟数据
 *
 * @example
 * ```ts
 * class MyAgent extends AimenAgent {
 *   async execute(goal: string, context: Record<string, unknown>) {
 *     if (isLLMAvailable()) {
 *       const result = await this.callLLM('你是助手', goal);
 *       return { status: 'completed', result };
 *     }
 *     return { status: 'completed', result: `模拟: ${goal}` };
 *   }
 * }
 * ```
 */
export abstract class AimenAgent {
  readonly agentId: string;
  readonly name: string;
  readonly role: string;
  readonly capabilities: string[];
  protected router?: MessageRouter;

  #status: AgentStatus = AgentStatus.Idle;

  /** 缓存的 LLM 配置 */
  #llmConfig: LLMConfig | null = null;

  constructor(
    agentId: string,
    name: string,
    role: string,
    capabilities: string[] = [],
    router?: MessageRouter,
  ) {
    this.agentId = agentId;
    this.name = name;
    this.role = role;
    this.capabilities = capabilities;
    this.router = router;
  }

  connect(router: MessageRouter): void {
    this.router = router;
  }

  getStatus(): AgentStatusInfo {
    return {
      agentId: this.agentId,
      name: this.name,
      role: this.role,
      status: this.#status,
      capabilities: [...this.capabilities],
    };
  }

  protected setStatus(status: AgentStatus): void {
    this.#status = status;
  }

  /**
   * 调用 LLM API
   *
   * 子类可以直接调用此方法获取真实 LLM 响应。
   *
   * @param system - 系统提示词
   * @param prompt - 用户提示词
   * @returns LLM 响应文本
   * @throws 当 LLM 配置缺失或 API 调用失败时抛出错误
   */
  protected async callLLM(system: string, prompt: string): Promise<string> {
    if (!this.#llmConfig) {
      this.#llmConfig = getLLMConfig();
    }
    return callLLM(system, prompt, this.#llmConfig ?? undefined);
  }

  /**
   * 判断 LLM 是否可用
   */
  protected get llmAvailable(): boolean {
    return isLLMAvailable();
  }

  /**
   * 处理一条 ACP 消息信封
   */
  async handleMessage(envelope: AcpMessageEnvelope): Promise<AcpMessageEnvelope | null> {
    if (envelope.messageType !== AcpMessageType.TaskSubmit) {
      return null;
    }

    const payload = envelope.payload;
    if (!isAcpTaskPayload(payload)) {
      return createMessage(
        AcpMessageType.Error,
        this.agentId,
        envelope.senderId,
        { code: 'INVALID_PAYLOAD', message: 'TaskSubmit 载荷格式无效' },
      );
    }

    const taskId = payload.taskId;
    const goal = payload.goal;
    const context = payload.context ?? {};

    this.#status = AgentStatus.Busy;

    try {
      const result = await this.execute(goal, context);

      const resultPayload = { taskId, result };

      this.#status = AgentStatus.Idle;

      return createMessage(
        AcpMessageType.TaskResult,
        this.agentId,
        envelope.senderId,
        resultPayload as Record<string, unknown>,
      );
    } catch (err) {
      this.#status = AgentStatus.Error;

      return createMessage(
        AcpMessageType.TaskResult,
        this.agentId,
        envelope.senderId,
        { taskId, result: null, error: err instanceof Error ? err.message : String(err) } as Record<string, unknown>,
      );
    }
  }

  /**
   * 抽象方法：执行代理的具体任务
   *
   * @param goal    - 任务目标描述
   * @param context - 任务上下文信息
   * @returns 任务执行结果（Promise）
   */
  abstract execute(goal: string, context: Record<string, unknown>): Promise<unknown>;
}