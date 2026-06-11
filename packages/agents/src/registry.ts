/**
 * @aimen/agents — AgentManager（代理注册管理器）
 *
 * 封装 @aimen/acp-bus 的 AgentRegistry，提供更高级的注册接口。
 * 负责将 AimenAgent 实例注册到 ACP 总线，并根据消息目标路由到正确的代理。
 *
 * @packageDocumentation
 * @module @aimen/agents/registry
 */

import {
  AgentRegistry,
  AcpMessageType,
  createMessage,
  type AcpMessageEnvelope,
  type AcpTaskPayload,
  type AcpAgentInfo,
} from '@aimen/acp-bus';

import type { AimenAgent } from './aimen-agent.js';

// ---------------------------------------------------------------------------
// AgentManager
// ---------------------------------------------------------------------------

/**
 * 代理注册管理器
 *
 * 包装 {@link AgentRegistry}，提供与 AimenAgent 实例集成的便捷接口。
 * 支持按角色注册/注销代理，并通过 handleTask() 方法将 ACP 消息路由到对应代理。
 *
 * @remarks
 * AgentManager 持有内部 AgentRegistry 的引用（如果未传入则自动创建），
 * 注册时同时更新注册信息和代理 handleMessage 映射。
 *
 * @example
 * ```ts
 * const manager = new AgentManager();
 *
 * const architect = new ArchitectAgent('arch-1', '架构师');
 * const coder = new CoderAgent('coder-1', '编码者');
 *
 * manager.registerAgent(architect, 'architect');
 * manager.registerAgent(coder, 'coder');
 *
 * // 路由一条任务消息
 * const response = await manager.handleTask(envelope);
 * ```
 */
export class AgentManager {
  /** 底层 AgentRegistry 实例 */
  readonly registry: AgentRegistry;

  /** 代理 ID → AimenAgent 实例的映射 */
  #agents: Map<string, AimenAgent> = new Map();

  /** 角色 → 代理 ID 列表的映射（一个角色可对应多个代理） */
  #roles: Map<string, string[]> = new Map();

  /**
   * @param registry - 可选的 AgentRegistry 实例。未传入则创建新的。
   */
  constructor(registry?: AgentRegistry) {
    this.registry = registry ?? new AgentRegistry();
  }

  /**
   * 注册一个代理
   *
   * 将 AimenAgent 注册到内部映射表和 AgentRegistry 中。
   * 注册后该代理可被 handleTask() 路由到。
   *
   * @param agent - 要注册的 AimenAgent 实例
   * @param role  - 代理角色（覆盖 agent.role，用于基于角色的路由）
   *
   * @throws 如果 agentId 已被注册则抛出错误
   */
  registerAgent(agent: AimenAgent, role: string): void {
    if (this.#agents.has(agent.agentId)) {
      throw new Error(`代理 "${agent.agentId}" 已被注册`);
    }

    this.#agents.set(agent.agentId, agent);

    // 按角色索引
    const existing = this.#roles.get(role) ?? [];
    existing.push(agent.agentId);
    this.#roles.set(role, existing);

    // 同步到 AgentRegistry
    const info: AcpAgentInfo = {
      id: agent.agentId,
      name: agent.name,
      role,
      status: 'online',
      capabilities: agent.capabilities,
      lastHeartbeat: new Date().toISOString(),
    };

    this.registry.register(info);
  }

  /**
   * 注销一个代理
   *
   * 从内部映射表和 AgentRegistry 中移除指定代理。
   *
   * @param agentId - 要注销的代理 ID
   * @returns 如果代理存在并成功注销则返回 true，否则返回 false
   */
  unregisterAgent(agentId: string): boolean {
    const agent = this.#agents.get(agentId);
    if (!agent) {
      return false;
    }

    // 从角色索引中移除
    for (const [role, ids] of this.#roles.entries()) {
      const idx = ids.indexOf(agentId);
      if (idx !== -1) {
        ids.splice(idx, 1);
        if (ids.length === 0) {
          this.#roles.delete(role);
        }
        break;
      }
    }

    this.#agents.delete(agentId);
    this.registry.unregister(agentId);

    return true;
  }

  /**
   * 根据代理 ID 获取已注册的 AimenAgent 实例
   *
   * @param agentId - 代理 ID
   * @returns AimenAgent 实例，未找到返回 undefined
   */
  getAgent(agentId: string): AimenAgent | undefined {
    return this.#agents.get(agentId);
  }

  /**
   * 根据角色查找代理
   *
   * @param role - 角色名
   * @returns 匹配的 AimenAgent 实例数组
   */
  getAgentsByRole(role: string): AimenAgent[] {
    const ids = this.#roles.get(role) ?? [];
    return ids.map((id) => this.#agents.get(id)).filter(Boolean) as AimenAgent[];
  }

  /**
   * 获取所有已注册的代理列表
   *
   * @returns AimenAgent 实例数组
   */
  listAgents(): AimenAgent[] {
    return Array.from(this.#agents.values());
  }

  /**
   * 处理一条 ACP 任务消息
   *
   * 根据信封的 targetId 查询已注册的代理，并将消息分发给对应代理的 handleMessage()。
   * 路由策略：
   * - 优先按 targetId 精确匹配
   * - 若匹配失败，按 targetId 作为角色名查找
   * - 若仍匹配失败，返回 Error 响应
   *
   * @param envelope - 待处理的 ACP 消息信封
   * @returns 处理后的响应信封
   */
  async handleTask(envelope: AcpMessageEnvelope): Promise<AcpMessageEnvelope> {
    // 查找目标代理
    let target = this.#agents.get(envelope.targetId);

    // 按角色查找（取第一个匹配）
    if (!target) {
      const roleIds = this.#roles.get(envelope.targetId);
      if (roleIds && roleIds.length > 0) {
        target = this.#agents.get(roleIds[0]);
      }
    }

    if (!target) {
      return createMessage(
        AcpMessageType.Error,
        'agent-manager',
        envelope.senderId,
        {
          code: 'AGENT_NOT_FOUND',
          message: `未找到目标代理: ${envelope.targetId}`,
        },
      );
    }

    // 分发给代理处理
    const response = await target.handleMessage(envelope);
    if (response) {
      return response;
    }

    // 代理不处理此消息类型
    return createMessage(
      AcpMessageType.Error,
      target.agentId,
      envelope.senderId,
      {
        code: 'UNSUPPORTED_MESSAGE_TYPE',
        message: `代理 "${target.agentId}" 不支持消息类型: ${envelope.messageType}`,
      },
    );
  }

  /**
   * 获取当前已注册的代理数量
   */
  get size(): number {
    return this.#agents.size;
  }

  /**
   * 清空所有注册信息（主要用于测试）
   */
  clear(): void {
    this.#agents.clear();
    this.#roles.clear();
    this.registry.clear();
  }
}