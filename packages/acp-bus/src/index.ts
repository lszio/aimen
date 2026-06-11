/**
 * @aimen/acp-bus — ACP (Agent Communication Protocol) 核心模块
 *
 * ACP 协议是 aimen Agent 编排中枢的代理间通信协议。
 * 本包定义了协议的消息信封、载荷类型、辅助函数以及消息路由与代理注册。
 *
 * @packageDocumentation
 * @module @aimen/acp-bus
 */

export type { AcpMessageType as AcpMessageTypeEnum } from './types.js';

export {
  AcpMessageType,
  createMessage,
} from './types.js';

export type {
  AcpMessageEnvelope,
  AcpTaskPayload,
  AcpTaskResultPayload,
  AcpMessagePayload,
  AcpAgentInfo,
  AcpPingPayload,
  AgentAnnouncePayload,
  AgentLeavePayload,
  AcpErrorPayload,
} from './types.js';

export {
  AgentRegistry,
  MessageRouter,
  AcpBusEvent,
} from './router.js';

export type {
  AcpBusEventType,
  MessageHandler,
  RouteResult,
} from './router.js';

export { HttpTransport } from './transport-http.js';
export type { HttpTransportOptions } from './transport-http.js';

export { PersistedAgentRegistry } from './persistence.js';

// ---------------------------------------------------------------------------
// 错误处理与重试机制
// ---------------------------------------------------------------------------
export { AimenError, AimenErrorCode, retryWithBackoff } from './errors.js';
export type { AimenRetryOptions } from './errors.js';