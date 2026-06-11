/**
 * @aimen/agents — 主入口
 *
 * 导出所有代理模块：基础类、具体代理实现、以及注册管理器。
 *
 * @packageDocumentation
 * @module @aimen/agents
 */

// 基础类
export { AimenAgent, AgentStatus } from './aimen-agent.js';
export type { AgentStatusInfo } from './aimen-agent.js';

// 架构师代理
export { ArchitectAgent } from './architect.js';
export type { ArchitectureAnalysis, FormattedArchitectPlan } from './architect.js';

// 编码代理
export { CoderAgent } from './coder.js';
export type { CodeAnalysis, RefactorSuggestion } from './coder.js';

// 研究代理
export { ResearcherAgent } from './researcher.js';
export type { SearchResult, SynthesizedReport } from './researcher.js';

// Hermes 桥接代理
export { HermesBridgeAgent } from './hermes-bridge.js';

// 注册管理器
export { AgentManager } from './registry.js';

// 重导出 acp-bus 类型（方便消费者）
export type { AcpMessageEnvelope, AcpTaskPayload, AcpTaskResultPayload } from '@aimen/acp-bus';