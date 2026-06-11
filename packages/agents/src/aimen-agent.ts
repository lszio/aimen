/**
 * @aimen/agents — AimenAgent 基类
 *
 * 所有 aimen 代理的基类。包装一个 Mastra Agent，连接到 ACP Bus，
 * 处理 TaskSubmit → execute → TaskResult 生命周期。
 * 抽象方法 execute() 由子类实现，当前为模拟模式（无 LLM 调用）。
 *
 * @packageDocumentation
 * @module @aimen/agents/aimen-agent
 */

import type { AcpMessageEnvelope, AcpTaskPayload, AcpTaskResultPayload } from '@aimen/acp-bus';
import { AcpMessageType, createMessage, isAcpTaskPayload, isAcpTaskResultPayload } from '@aimen/acp-bus';
import type { MessageRouter } from '@aimen/acp-bus';

// ---------------------------------------------------------------------------
// 状态枚举
// ---------------------------------------------------------------------------

/**
 * 代理运行状态枚举
 *
 * - idle:  空闲，可以接受任务
 * - busy:  正在执行任务
 * - error: 发生不可恢复的错误
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
 *
 * 包含代理当前的运行状态、唯一标识和角色标签，
 * 用于 getStatus() 方法的返回值以及注册到 AgentRegistry 时的信息。
 */
export interface AgentStatusInfo {
  /** 代理唯一标识 */
  agentId: string;
  /** 代理显示名称 */
  name: string;
  /** 代理角色（如 architect、coder、researcher） */
  role: string;
  /** 当前运行状态 */
  status: AgentStatus;
  /** 代理具备的能力列表 */
  capabilities: string[];
}

// ---------------------------------------------------------------------------
// AimenAgent 基类
// ---------------------------------------------------------------------------

/**
 * 所有 aimen 代理的抽象基类
 *
 * 包装一个 Mastra Agent 实例，持有 ACP MessageRouter 引用，
 * 实现 TaskSubmit → execute → TaskResult 生命周期。
 *
 * @remarks
 * - execute() 为抽象方法，子类必须实现
 * - 当前为**模拟模式**（无 LLM 调用），后续阶段会接入真实模型
 * - 子类通过构造时传入的 router 向 ACP 总线注册自身
 *
 * @example
 * ```ts
 * class MyAgent extends AimenAgent {
 *   async execute(goal: string, context: Record<string, unknown>) {
 *     // 模拟执行
 *     return { status: 'done', result: `已完成: ${goal}` };
 *   }
 * }
 * ```
 */
export abstract class AimenAgent {
  /** 代理唯一标识 */
  readonly agentId: string;
  /** 代理显示名称 */
  readonly name: string;
  /** 代理角色标签 */
  readonly role: string;
  /** 代理具备的能力列表 */
  readonly capabilities: string[];
  /** ACP 消息路由器引用（可选） */
  protected router?: MessageRouter;

  /** 当前状态 */
  #status: AgentStatus = AgentStatus.Idle;

  /**
   * @param agentId    - 代理唯一标识
   * @param name       - 代理显示名称
   * @param role       - 代理角色标签
   * @param capabilities - 代理能力列表
   * @param router     - 可选的 ACP MessageRouter 引用
   */
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

  /**
   * 绑定到 ACP MessageRouter
   *
   * 在构造后调用，传入 router 实例，代理即可接收 ACP 消息。
   *
   * @param router - ACP MessageRouter 实例
   */
  connect(router: MessageRouter): void {
    this.router = router;
  }

  /**
   * 获取当前代理状态信息
   *
   * @returns AgentStatusInfo 对象，包含标识、名称、角色、状态和能力
   */
  getStatus(): AgentStatusInfo {
    return {
      agentId: this.agentId,
      name: this.name,
      role: this.role,
      status: this.#status,
      capabilities: [...this.capabilities],
    };
  }

  /**
   * 设置内部状态
   *
   * @param status - 新的状态值
   */
  protected setStatus(status: AgentStatus): void {
    this.#status = status;
  }

  /**
   * 处理一条 ACP 消息信封
   *
   * 根据 messageType 执行对应的生命周期逻辑：
   * - TaskSubmit：提取 goal 和 context，调用 execute()，返回 TaskResult
   * - 其他消息类型返回 null（不处理）
   *
   * @param envelope - 待处理的 ACP 消息信封
   * @returns 响应信封（TaskResult）或 null
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

    // 标记为忙碌
    this.#status = AgentStatus.Busy;

    try {
      // 执行任务（子类实现具体逻辑）
      const result = await this.execute(goal, context);

      // 构建 TaskResult 响应
      const resultPayload: AcpTaskResultPayload = {
        taskId,
        result,
      };

      this.#status = AgentStatus.Idle;

      return createMessage(
        AcpMessageType.TaskResult,
        this.agentId,
        envelope.senderId,
        resultPayload as Record<string, unknown>,
      );
    } catch (err) {
      this.#status = AgentStatus.Error;

      const errorPayload: AcpTaskResultPayload = {
        taskId,
        result: null,
        error: err instanceof Error ? err.message : String(err),
      };

      return createMessage(
        AcpMessageType.TaskResult,
        this.agentId,
        envelope.senderId,
        errorPayload as Record<string, unknown>,
      );
    }
  }

  /**
   * 抽象方法：执行代理的具体任务
   *
   * 子类必须实现此方法，根据 goal 和 context 执行逻辑并返回结果。
   * 当前为**模拟模式**，子类无需调用真实 LLM。
   *
   * @param goal    - 任务目标描述
   * @param context - 任务上下文信息（可选的状态、环境变量等）
   * @returns 任务执行结果（Promise）
   */
  abstract execute(goal: string, context: Record<string, unknown>): Promise<unknown>;
}