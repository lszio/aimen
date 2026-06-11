/**
 * @aimen/acp-bus — ACP 消息路由与代理注册
 *
 * 本模块提供 AgentRegistry（代理注册中心）和 MessageRouter（消息路由器）。
 * AgentRegistry 基于 EventTarget 实现事件驱动的代理信息存储。
 * MessageRouter 根据消息信封的 targetId/role 进行路由，并自动处理 Ping/Pong 和 AgentAnnounce。
 *
 * @packageDocumentation
 * @module @aimen/acp-bus/router
 */

import {
  AcpMessageEnvelope,
  AcpMessageType,
  AcpAgentInfo,
  AgentAnnouncePayload,
  AgentLeavePayload,
  AcpErrorPayload,
  createMessage,
  isAgentAnnouncePayload,
  isAgentLeavePayload,
} from './types.js';

// ---------------------------------------------------------------------------
// 自定义事件类型
// ---------------------------------------------------------------------------

/**
 * ACP 总线事件名称联合类型
 *
 * - `message` — 收到一条消息
 * - `agent:register` — 代理注册
 * - `agent:unregister` — 代理移除
 * - `agent:status` — 代理状态变更
 * - `route:success` — 路由成功
 * - `route:error` — 路由失败
 */
export type AcpBusEventType =
  | 'message'
  | 'agent:register'
  | 'agent:unregister'
  | 'agent:status'
  | 'route:success'
  | 'route:error';

/**
 * ACP 总线自定义事件
 *
 * @template T - 事件载荷的类型
 */
export class AcpBusEvent<T = unknown> extends Event {
  /** 事件附带数据 */
  public readonly detail: T;

  constructor(type: AcpBusEventType, detail: T) {
    super(type);
    this.detail = detail;
  }
}

// ---------------------------------------------------------------------------
// AgentRegistry — 代理注册中心
// ---------------------------------------------------------------------------

/**
 * 代理注册中心
 *
 * 基于 EventTarget 实现的**内存**代理存储，提供代理的注册、注销、查找和状态管理。
 * 支持通过事件监听器响应代理注册/注销/状态变更。
 *
 * @example
 * ```ts
 * const registry = new AgentRegistry();
 *
 * registry.addEventListener('agent:register', (e) => {
 *   console.log('代理上线:', e.detail.id);
 * });
 *
 * registry.register({
 *   id: 'agent-1',
 *   name: '助手甲',
 *   role: 'assistant',
 *   status: 'online',
 *   capabilities: ['chat', 'search'],
 *   lastHeartbeat: new Date().toISOString(),
 * });
 * ```
 */
export class AgentRegistry extends EventTarget {
  /** 代理 ID → AcpAgentInfo 的映射 */
  #agents: Map<string, AcpAgentInfo> = new Map();

  /**
   * 注册或更新一个代理
   *
   * 如果代理已存在，则合并更新其信息。触发 `agent:register` 事件。
   *
   * @param agent - 代理信息对象
   */
  register(agent: AcpAgentInfo): void {
    const existing = this.#agents.get(agent.id);
    if (existing) {
      this.#agents.set(agent.id, { ...existing, ...agent });
    } else {
      this.#agents.set(agent.id, { ...agent });
    }
    this.dispatchEvent(new AcpBusEvent('agent:register', { agent }));
  }

  /**
   * 注销一个代理
   *
   * 从注册表中移除指定代理。触发 `agent:unregister` 事件。
   *
   * @param agentId - 要移除的代理 ID
   * @returns 如果代理存在并被移除则返回 true，否则返回 false
   */
  unregister(agentId: string): boolean {
    const agent = this.#agents.get(agentId);
    if (!agent) {
      return false;
    }
    this.#agents.delete(agentId);
    this.dispatchEvent(new AcpBusEvent('agent:unregister', { agentId, agent }));
    return true;
  }

  /**
   * 根据代理 ID 获取代理信息
   *
   * @param agentId - 代理 ID
   * @returns 代理信息对象，未找到时返回 undefined
   */
  get(agentId: string): AcpAgentInfo | undefined {
    return this.#agents.get(agentId);
  }

  /**
   * 根据角色查询代理列表
   *
   * 返回所有 role 匹配的代理。不区分大小写。
   *
   * @param role - 角色名
   * @returns 匹配的代理信息数组
   */
  findByRole(role: string): AcpAgentInfo[] {
    const lowerRole = role.toLowerCase();
    const result: AcpAgentInfo[] = [];
    for (const agent of this.#agents.values()) {
      if (agent.role.toLowerCase() === lowerRole) {
        result.push(agent);
      }
    }
    return result;
  }

  /**
   * 根据能力标签查询代理列表
   *
   * 返回 capabilities 中包含指定能力的代理。
   *
   * @param capability - 能力标签
   * @returns 匹配的代理信息数组
   */
  findByCapability(capability: string): AcpAgentInfo[] {
    const result: AcpAgentInfo[] = [];
    for (const agent of this.#agents.values()) {
      if (agent.capabilities.includes(capability)) {
        result.push(agent);
      }
    }
    return result;
  }

  /**
   * 获取所有已注册代理的列表
   *
   * @returns 所有代理信息的数组（浅拷贝）
   */
  list(): AcpAgentInfo[] {
    return Array.from(this.#agents.values());
  }

  /**
   * 获取注册代理的总数
   */
  get size(): number {
    return this.#agents.size;
  }

  /**
   * 更新代理状态
   *
   * 仅更新 `status` 字段并刷新 `lastHeartbeat`。
   * 触发 `agent:status` 事件。
   *
   * @param agentId - 代理 ID
   * @param status  - 新的状态值
   * @returns 如果代理存在并成功更新则返回 true，否则返回 false
   */
  setStatus(
    agentId: string,
    status: AcpAgentInfo['status'],
  ): boolean {
    const agent = this.#agents.get(agentId);
    if (!agent) {
      return false;
    }
    const prevStatus = agent.status;
    agent.status = status;
    agent.lastHeartbeat = new Date().toISOString();
    this.dispatchEvent(
      new AcpBusEvent('agent:status', { agentId, prevStatus, status, agent }),
    );
    return true;
  }

  /**
   * 清空注册中心（主要用于测试）
   */
  clear(): void {
    this.#agents.clear();
  }
}

// ---------------------------------------------------------------------------
// MessageRouter — 消息路由器
// ---------------------------------------------------------------------------

/**
 * 消息处理函数类型
 *
 * @param envelope - 待处理的消息信封
 * @returns 返回响应消息信封，或 null 表示不处理
 */
export type MessageHandler = (
  envelope: AcpMessageEnvelope,
) => Promise<AcpMessageEnvelope | null>;

/**
 * 路由结果
 *
 * 包含路由是否成功的标记，以及可选的响应消息。
 */
export interface RouteResult {
  /** 是否成功找到目标并完成路由 */
  success: boolean;
  /** 路由产生的响应消息（如果有） */
  response: AcpMessageEnvelope | null;
}

/**
 * ACP 消息路由器
 *
 * 负责将 AcpMessageEnvelope 路由到正确的目标代理。
 *
 * 路由策略：
 * - 优先按 **targetId** 精确匹配（直接路由）
 * - 若匹配失败，尝试按 **role** 任意播（投递给第一个匹配的在线代理）
 * - 若仍匹配失败，返回错误响应
 *
 * 自动处理逻辑：
 * - `Ping` → 自动回复 `Pong`
 * - `AgentAnnounce` → 自动注册宣告的代理
 * - `AgentLeave` → 自动注销离线的代理
 *
 * @example
 * ```ts
 * const router = new MessageRouter();
 *
 * // 注册消息处理器
 * const unsub = router.onMessage(async (envelope) => {
 *   if (envelope.messageType === AcpMessageType.Message) {
 *     return createMessage(AcpMessageType.TaskResult, 'router', envelope.senderId, {
 *       taskId: '...',
 *       result: '已收到',
 *     });
 *   }
 *   return null;
 * });
 *
 * // 路由一条消息
 * const result = await router.route(someEnvelope);
 *
 * // 取消注册处理器
 * unsub();
 * ```
 */
export class MessageRouter extends EventTarget {
  /** 代理注册中心实例 */
  readonly registry: AgentRegistry;

  /** 已注册的消息处理器列表 */
  #handlers: MessageHandler[] = [];

  /**
   * @param registry - 可选的 AgentRegistry 实例。不传则创建新的实例。
   */
  constructor(registry?: AgentRegistry) {
    super();
    this.registry = registry ?? new AgentRegistry();
  }

  /**
   * 注册一个消息处理器
   *
   * 处理器按注册顺序依次尝试。第一个返回非 null 的结果将被作为响应返回。
   *
   * @param handler - 消息处理函数
   * @returns 一个取消注册函数，调用后移除该处理器
   */
  onMessage(handler: MessageHandler): () => void {
    this.#handlers.push(handler);
    return () => {
      const idx = this.#handlers.indexOf(handler);
      if (idx !== -1) {
        this.#handlers.splice(idx, 1);
      }
    };
  }

  /**
   * 获取当前注册的处理器数量
   */
  get handlerCount(): number {
    return this.#handlers.length;
  }

  /**
   * 路由一条消息
   *
   * 执行完整的路由流程：
   * 1. 自动处理 `AgentAnnounce`（注册代理）
   * 2. 自动处理 `AgentLeave`（注销代理）
   * 3. 自动回复 `Ping` → `Pong`
   * 4. 按 targetId 或 role 查找目标代理
   * 5. 将消息分发给已注册的处理器
   * 6. 未匹配处理器 → 返回错误响应
   *
   * @param envelope - 待路由的消息信封
   * @returns 路由结果，包含成功标记和可选的响应消息
   */
  async route(envelope: AcpMessageEnvelope): Promise<RouteResult> {
    // 触发 message 事件
    this.dispatchEvent(new AcpBusEvent('message', { envelope }));

    // ---- 自动处理 AgentAnnounce ----
    if (envelope.messageType === AcpMessageType.AgentAnnounce) {
      const payload = envelope.payload;
      if (isAgentAnnouncePayload(payload) && payload?.agent) {
        this.registry.register(payload.agent);
      }
      const response = createMessage(
        AcpMessageType.Message,
        'router',
        envelope.senderId,
        { result: 'registered', agentId: isAgentAnnouncePayload(payload) ? payload.agent.id : envelope.senderId },
      );
      return { success: true, response };
    }

    // ---- 自动处理 AgentLeave ----
    if (envelope.messageType === AcpMessageType.AgentLeave) {
      const payload = envelope.payload;
      const targetId = isAgentLeavePayload(payload) ? payload.agentId : envelope.senderId;
      this.registry.unregister(targetId);
      const response = createMessage(
        AcpMessageType.Message,
        'router',
        envelope.senderId,
        { result: 'unregistered', agentId: targetId },
      );
      return { success: true, response };
    }

    // ---- 自动回复 Ping → Pong ----
    if (envelope.messageType === AcpMessageType.Ping) {
      const response = createMessage(
        AcpMessageType.Pong,
        'router',
        envelope.senderId,
        {} as Record<string, never>,
      );
      return { success: true, response };
    }

    // ---- 查找目标代理 ----
    const targetAgent = this.#findTarget(envelope.targetId);

    if (!targetAgent) {
      const errorPayload: AcpErrorPayload = {
        code: 'ROUTE_NOT_FOUND',
        message: `未找到目标代理: ${envelope.targetId}`,
      };

      const response = createMessage(
        AcpMessageType.Error,
        'router',
        envelope.senderId,
        errorPayload as unknown as Record<string, unknown>,
      );

      this.dispatchEvent(new AcpBusEvent('route:error', { envelope, error: errorPayload }));
      return { success: false, response };
    }

    // ---- 分发给已注册的处理器 ----
    const result = await this.#dispatchToHandlers(envelope, targetAgent);

    if (result === null) {
      const errorPayload: AcpErrorPayload = {
        code: 'NO_HANDLER',
        message: `没有处理器可以处理消息类型: ${envelope.messageType}`,
      };

      const response = createMessage(
        AcpMessageType.Error,
        'router',
        envelope.senderId,
        errorPayload as unknown as Record<string, unknown>,
      );

      this.dispatchEvent(new AcpBusEvent('route:error', { envelope, error: errorPayload }));
      return { success: false, response };
    }

    this.dispatchEvent(new AcpBusEvent('route:success', { envelope, targetAgent, response: result }));
    return { success: true, response: result };
  }

  /**
   * 查找目标代理
   *
   * 优先按 targetId 精确匹配，找不到则按 role 任意播。
   *
   * @param targetId - 目标标识（代理 ID 或角色名）
   * @returns 匹配的代理信息，未找到返回 undefined
   */
  #findTarget(targetId: string): AcpAgentInfo | undefined {
    // 1) 精确匹配 ID
    const byId = this.registry.get(targetId);
    if (byId) {
      return byId;
    }

    // 2) 按角色任意播 — 取第一个在线代理
    const byRole = this.registry.findByRole(targetId);
    if (byRole.length > 0) {
      const online = byRole.find((a) => a.status === 'online')
        ?? byRole.find((a) => a.status === 'busy')
        ?? byRole[0];
      return online;
    }

    return undefined;
  }

  /**
   * 将消息分发给已注册的处理器
   *
   * 按注册顺序依次尝试，第一个返回非 null 的处理器结果作为响应。
   *
   * @param envelope - 消息信封
   * @param targetAgent - 目标代理信息
   * @returns 处理器的响应消息，或 null 表示无处理器处理
   */
  async #dispatchToHandlers(
    envelope: AcpMessageEnvelope,
    _targetAgent: AcpAgentInfo,
  ): Promise<AcpMessageEnvelope | null> {
    for (const handler of this.#handlers) {
      const result = await handler(envelope);
      if (result !== null) {
        return result;
      }
    }
    return null;
  }

  /**
   * 获取当前已注册的处理器（只读）
   */
  get handlers(): readonly MessageHandler[] {
    return this.#handlers;
  }
}