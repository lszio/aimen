/**
 * @aimen/anytype-gateway — Anytype 网关模块
 *
 * 本包提供与 Anytype 存储服务交互的网关、对象映射器、任务监控器
 * 以及内存模拟客户端。
 *
 * @packageDocumentation
 * @module @aimen/anytype-gateway
 */

// 类型导出
export type {
  AnytypeConfig,
  AnytypeObject,
  AnytypeTaskObject,
  AnytypeTaskStatus,
  AnytypeJournalObject,
  AnytypeGatewayConfig,
  AnytypeClient,
} from './types.js';

// 网关主入口
export { AnytypeGateway } from './gateway.js';

// Mock 客户端
export { MockAnytypeClient } from './mock-client.js';
export type { MockAnytypeClientOptions } from './mock-client.js';

// 对象映射器
export { DefaultAcpMapper } from './object-mapper.js';
export type { AcpMapper } from './object-mapper.js';

// 任务监控器
export { AnytypeWatcher, taskSorter } from './watcher.js';
export type { AnytypeWatcherOptions } from './watcher.js';

// 日志处理器
export { JournalHandler } from './journal-handler.js';
export type { JournalEntryObject } from './journal-handler.js';