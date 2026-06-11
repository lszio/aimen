/**
 * @aimen/acp-bus — ACP (Agent Communication Protocol) 核心类型定义
 *
 * 本模块定义了 ACP 协议中使用的所有消息类型、载荷接口和辅助函数。
 * ACP 是一个基于 REST/JSON 的代理间通信协议，消息通过标准信封进行路由。
 *
 * @packageDocumentation
 * @module @aimen/acp-bus/types
 */

// ---------------------------------------------------------------------------
// 枚举
// ---------------------------------------------------------------------------

/**
 * ACP 消息类型枚举
 *
 * 定义了 ACP 协议支持的所有消息类型：
 * - TaskSubmit: 提交任务给目标代理
 * - TaskResult: 返回任务执行结果
 * - TaskCancel: 取消已提交的任务
 * - Message:   代理间会话消息
 * - Ping:      心跳探测
 * - Pong:      心跳响应
 * - Error:     错误消息
 * - AgentAnnounce: 代理上线宣告
 * - AgentLeave:    代理离线通知
 */
export enum AcpMessageType {
  TaskSubmit = 'TaskSubmit',
  TaskResult = 'TaskResult',
  TaskCancel = 'TaskCancel',
  Message = 'Message',
  Ping = 'Ping',
  Pong = 'Pong',
  Error = 'Error',
  AgentAnnounce = 'AgentAnnounce',
  AgentLeave = 'AgentLeave',
}

// ---------------------------------------------------------------------------
// 核心接口
// ---------------------------------------------------------------------------

/**
 * ACP 消息信封
 *
 * 所有 ACP 消息通过此信封进行包装，包含协议版本、路由信息、
 * 消息类型标识和实际载荷。
 *
 * 路由机制：消息通过 targetId 进行路由，可以是代理 ID 或角色名。
 * 
 * @example
 * ```ts
 * const envelope: AcpMessageEnvelope = {
 *   protocol: 'acp/1.0',
 *   messageId: crypto.randomUUID(),
 *   senderId: 'agent-alpha',
 *   targetId: 'agent-beta',
 *   messageType: AcpMessageType.Message,
 *   payload: { conversationId: 'conv-1', content: '你好', role: 'agent' },
 *   timestamp: new Date().toISOString(),
 * };
 * ```
 */
export interface AcpMessageEnvelope {
  /** 协议标识，固定为 "acp/1.0" */
  protocol: string;
  /** 消息唯一标识（UUID v4） */
  messageId: string;
  /** 发送方代理 ID */
  senderId: string;
  /** 目标代理 ID 或角色名（用于广播） */
  targetId: string;
  /** 消息类型，决定 payload 的结构 */
  messageType: AcpMessageType;
  /** 消息载荷，具体结构由 messageType 决定 */
  payload: Record<string, unknown>;
  /** 消息创建时间戳（ISO 8601 格式） */
  timestamp: string;
}

// ---------------------------------------------------------------------------
// 载荷接口
// ---------------------------------------------------------------------------

/**
 * 任务提交载荷
 *
 * 用于 TaskSubmit 消息类型，描述需要目标代理执行的任务。
 */
export interface AcpTaskPayload {
  /** 任务唯一标识 */
  taskId: string;
  /** 任务目标描述 */
  goal: string;
  /** 可选的上下文信息（如状态、环境变量等） */
  context?: Record<string, unknown>;
  /** 允许任务使用的工具列表 */
  tools?: string[];
}

/**
 * 任务结果载荷
 *
 * 用于 TaskResult 消息类型，返回代理执行任务后的结果。
 */
export interface AcpTaskResultPayload {
  /** 对应原始任务的任务标识 */
  taskId: string;
  /** 任务执行结果 */
  result: unknown;
  /** 可选的任务执行错误信息（成功时忽略） */
  error?: string;
}

/**
 * 代理间会话消息载荷
 *
 * 用于 Message 消息类型，表示代理之间的文本对话内容。
 */
export interface AcpMessagePayload {
  /** 会话唯一标识，用于关联同一次对话的多条消息 */
  conversationId: string;
  /** 消息正文 */
  content: string;
  /** 消息角色：user（用户）、agent（代理）、system（系统） */
  role: 'user' | 'agent' | 'system';
}

/**
 * 代理信息
 *
 * 描述一个 ACP 代理的基本信息，用于 AgentAnnounce 消息。
 */
export interface AcpAgentInfo {
  /** 代理唯一标识 */
  id: string;
  /** 代理显示名称 */
  name: string;
  /** 代理角色（如 "assistant"、"worker"、"router" 等） */
  role: string;
  /** 代理当前在线状态 */
  status: 'online' | 'offline' | 'busy';
  /** 代理具备的能力列表 */
  capabilities: string[];
  /** 最近一次心跳时间戳（ISO 8601 格式） */
  lastHeartbeat: string;
}

/**
 * Ping 消息载荷
 *
 * 用于 Ping 消息类型，表示心跳探测。
 * 当前不包含额外字段，仅用作信号。
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface AcpPingPayload extends Record<string, never> {}

/**
 * 代理宣告载荷
 *
 * 用于 AgentAnnounce 消息类型，代理上线时广播自身信息。
 */
export interface AgentAnnouncePayload {
  /** 宣告上线的代理信息 */
  agent: AcpAgentInfo;
}

/**
 * 代理离线载荷
 *
 * 用于 AgentLeave 消息类型，通知其他代理某个代理已离线。
 */
export interface AgentLeavePayload {
  /** 离线的代理 ID */
  agentId: string;
  /** 可选的离线原因 */
  reason?: string;
}

/**
 * 错误消息载荷
 *
 * 用于 Error 消息类型，携带错误码和描述信息。
 */
export interface AcpErrorPayload {
  /** 错误码，如 "ROUTE_NOT_FOUND"、"PARSE_FAILED" */
  code: string;
  /** 人类可读的错误描述 */
  message: string;
  /** 可选的附加错误信息 */
  details?: unknown;
}

// ---------------------------------------------------------------------------
// 辅助函数
// ---------------------------------------------------------------------------

/**
 * 创建一个完整的 ACP 消息信封
 *
 * 自动生成 messageId（UUID v4）和 timestamp（ISO 8601），
 * 设置 protocol 为 "acp/1.0"，简化消息构建过程。
 *
 * @param type    - 消息类型（AcpMessageType 枚举值）
 * @param senderId - 发送方代理 ID
 * @param targetId - 目标代理 ID 或角色名
 * @param payload  - 消息载荷，必须与消息类型匹配（类型安全由调用方保证）
 * @returns 一个完整的 AcpMessageEnvelope 对象
 *
 * @example
 * ```ts
 * const msg = createMessage(
 *   AcpMessageType.Message,
 *   'agent-alpha',
 *   'agent-beta',
 *   { conversationId: 'conv-1', content: '任务已完成', role: 'agent' }
 * );
 * ```
 */
export function createMessage(
  type: AcpMessageType,
  senderId: string,
  targetId: string,
  payload: Record<string, unknown>,
): AcpMessageEnvelope {
  return {
    protocol: 'acp/1.0',
    messageId: crypto.randomUUID(),
    senderId,
    targetId,
    messageType: type,
    payload,
    timestamp: new Date().toISOString(),
  };
}