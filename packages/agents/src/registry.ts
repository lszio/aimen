/**
 * @aimen/agents — AgentManager（代理注册管理器）
 *
 * 封装 @aimen/acp-bus 的 AgentRegistry 和 MessageRouter，提供注册接口。
 * 构造时自动将自身注册为 MessageRouter 的 handler，不再维护独立的路由逻辑。
 * 所有消息路由统一走 MessageRouter.route()。
 *
 * @packageDocumentation
 * @module @aimen/agents/registry
 */

import {
  AgentRegistry,
  AcpMessageType,
  createMessage,
  MessageRouter,
  type AcpMessageEnvelope,
  type AcpAgentInfo,
  AcpBusEvent,
} from '@aimen/acp-bus';

import type { AimenAgent } from './aimen-agent.js';

// ---------------------------------------------------------------------------
// RemoteAgent — 远程代理适配器
// ---------------------------------------------------------------------------

/**
 * 远程代理占位适配器
 *
 * 当 AgentRegistry 收到远程 AgentAnnounce 时，AgentManager 自动创建一个 RemoteAgent
 * 实例加入 #agents 映射。所有目标为该远程 agent 的消息通过 MessageRouter 的 HTTP 转发处理，
 * RemoteAgent 的 handleMessage 仅做记录。
 */
class RemoteAgent implements AimenAgent {
  readonly agentId: string;
  readonly name: string;
  readonly role: string;
  readonly capabilities: string[];
  readonly isRemote: boolean = true;
  protected router?: MessageRouter;

  constructor(info: AcpAgentInfo, router?: MessageRouter) {
    this.agentId = info.id;
    this.name = info.name;
    this.role = info.role;
    this.capabilities = [...info.capabilities];
    this.router = router;
  }

  connect(_router: MessageRouter): void {
    // Remote 不需要本地 connect
  }

  getStatus(): { agentId: string; name: string; role: string; status: string; capabilities: string[] } {
    return {
      agentId: this.agentId,
      name: this.name,
      role: this.role,
      status: 'online',
      capabilities: [...this.capabilities],
    };
  }

  async handleMessage(_envelope: AcpMessageEnvelope): Promise<AcpMessageEnvelope | null> {
    // Remote agent handles via HTTP transport, not local
    return null;
  }

  async execute(_goal: string, _context: Record<string, unknown>): Promise<unknown> {
    return { status: 'forwarded', note: '远程代理 — 结果由远程处理' };
  }
}

// ---------------------------------------------------------------------------
// AgentManager
// ---------------------------------------------------------------------------

/**
 * 代理注册管理器
 *
 * 包装 {@link AgentRegistry} 和 {@link MessageRouter}，提供与 AimenAgent 实例集成的便捷接口。
 * 构造时自动将 handleTask 注册为 MessageRouter 的 handler，确保 HTTP /acp/task 路由到对应 agent。
 *
 * @example
 * ```ts
 * const router = new MessageRouter(registry);
 * const manager = new AgentManager(registry, router);
 * manager.registerAgent(architect, 'architect');
 *
 * // HTTP POST /acp/task → router.route() → AgentManager.handleTask() → architect.handleMessage()
 * ```
 */
export class AgentManager {
  /** 底层 AgentRegistry 实例 */
  readonly registry: AgentRegistry;

  /** 代理 ID → AimenAgent 实例的映射 */
  #agents: Map<string, AimenAgent> = new Map();

  /** 角色 → 代理 ID 列表的映射 */
  #roles: Map<string, string[]> = new Map();

  /** 取消注册 MessageRouter handler 的函数 */
  #unsubscribe: (() => void) | null = null;

  /**
   * @param registry - 可选的 AgentRegistry 实例。未传入则创建新的。
   * @param router   - 可选的 MessageRouter 实例。传入后自动注册 handler。
   */
  constructor(registry?: AgentRegistry, router?: MessageRouter) {
    this.registry = registry ?? new AgentRegistry();
    if (router) {
      this.#unsubscribe = router.onMessage((envelope) => this.#handleAsHandler(envelope));
    }

    // 监听 registry 事件：远程 agent 自动注册到本地映射
    this.#registryListener = (e: Event) => {
      const event = e as AcpBusEvent<{ agent: AcpAgentInfo }>;
      const agentInfo = event.detail?.agent;
      if (!agentInfo) return;

      // 跳过已注册的本地 agent
      if (this.#agents.has(agentInfo.id)) return;

      // 自动创建 RemoteAgent 占位
      const remote = new RemoteAgent(agentInfo, router);
      this.#agents.set(agentInfo.id, remote);

      const existing = this.#roles.get(agentInfo.role) ?? [];
      if (!existing.includes(agentInfo.id)) {
        existing.push(agentInfo.id);
        this.#roles.set(agentInfo.role, existing);
      }
    };
    this.registry.addEventListener('agent:register', this.#registryListener);
  }

  #registryListener: ((e: Event) => void) | null = null;

  /**
   * 作为 MessageRouter handler 处理消息
   *
   * 仅处理 TaskSubmit 类型，其他类型返回 null（让 router 继续尝试其他 handler）。
   */
  async #handleAsHandler(envelope: AcpMessageEnvelope): Promise<AcpMessageEnvelope | null> {
    if (envelope.messageType !== AcpMessageType.TaskSubmit) {
      return null;
    }
    return this.handleTask(envelope);
  }

  /**
   * 注册一个代理
   *
   * 将 AimenAgent 注册到内部映射表和 AgentRegistry 中。
   */
  registerAgent(agent: AimenAgent, role: string): void {
    if (this.#agents.has(agent.agentId)) {
      throw new Error(`代理 "${agent.agentId}" 已被注册`);
    }

    this.#agents.set(agent.agentId, agent);

    const existing = this.#roles.get(role) ?? [];
    existing.push(agent.agentId);
    this.#roles.set(role, existing);

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
   */
  unregisterAgent(agentId: string): boolean {
    const agent = this.#agents.get(agentId);
    if (!agent) return false;

    for (const [role, ids] of this.#roles.entries()) {
      const idx = ids.indexOf(agentId);
      if (idx !== -1) {
        ids.splice(idx, 1);
        if (ids.length === 0) this.#roles.delete(role);
        break;
      }
    }

    this.#agents.delete(agentId);
    this.registry.unregister(agentId);
    return true;
  }

  /**
   * 根据代理 ID 获取已注册的 AimenAgent 实例
   */
  getAgent(agentId: string): AimenAgent | undefined {
    return this.#agents.get(agentId);
  }

  /**
   * 根据角色查找代理
   */
  getAgentsByRole(role: string): AimenAgent[] {
    const ids = this.#roles.get(role) ?? [];
    return ids.map((id) => this.#agents.get(id)).filter(Boolean) as AimenAgent[];
  }

  /**
   * 获取所有已注册的代理列表
   */
  listAgents(): AimenAgent[] {
    return Array.from(this.#agents.values());
  }

  /**
   * 处理一条 ACP 任务消息
   *
   * 按 targetId → role 顺序查找匹配的 agent，分发给对应 agent 的 handleMessage()。
   */
  async handleTask(envelope: AcpMessageEnvelope): Promise<AcpMessageEnvelope> {
    let target = this.#agents.get(envelope.targetId);

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
        { code: 'AGENT_NOT_FOUND', message: `未找到目标代理: ${envelope.targetId}` },
      );
    }

    const response = await target.handleMessage(envelope);
    if (response) return response;

    return createMessage(
      AcpMessageType.Error,
      target.agentId,
      envelope.senderId,
      { code: 'UNSUPPORTED_MESSAGE_TYPE', message: `代理 "${target.agentId}" 不支持消息类型: ${envelope.messageType}` },
    );
  }

  /** 获取当前已注册的代理数量 */
  get size(): number {
    return this.#agents.size;
  }

  /** 清空所有注册信息 */
  clear(): void {
    this.#agents.clear();
    this.#roles.clear();
    this.registry.clear();
    if (this.#unsubscribe) {
      this.#unsubscribe();
      this.#unsubscribe = null;
    }
    if (this.#registryListener) {
      this.registry.removeEventListener('agent:register', this.#registryListener);
      this.#registryListener = null;
    }
  }
}