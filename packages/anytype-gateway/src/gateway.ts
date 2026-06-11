/**
 * Anytype 网关主入口
 *
 * 本模块提供 AnytypeGateway 类，作为 Anytype 存储服务的编排入口。
 * 协调客户端、映射器、监控器与 ACP 总线之间的数据流。
 *
 * @packageDocumentation
 * @module @aimen/anytype-gateway/gateway
 */

import type { AnytypeGatewayConfig } from './types.js';
import { MockAnytypeClient } from './mock-client.js';
import { DefaultAcpMapper } from './object-mapper.js';
import { AnytypeWatcher } from './watcher.js';
import type { AcpMessageEnvelope } from '@aimen/acp-bus';

/**
 * Anytype 网关
 *
 * 负责初始化和协调 Anytype 模拟客户端、ACP 映射器和任务监控器。
 * 提供简化的启动/停止接口。
 */
export class AnytypeGateway {
  public client: MockAnytypeClient;
  public watcher: AnytypeWatcher;
  private config: AnytypeGatewayConfig;

  /**
   * 创建 AnytypeGateway 实例
   *
   * @param config          - 网关配置项
   * @param sendToAcpBus    - 将 ACP 消息发送至总线的回调函数
   */
  constructor(
    config: AnytypeGatewayConfig,
    sendToAcpBus: (msg: AcpMessageEnvelope) => Promise<void>,
  ) {
    this.config = config;
    this.client = new MockAnytypeClient();
    this.watcher = new AnytypeWatcher(
      this.client,
      new DefaultAcpMapper(),
      {
        pollIntervalMs: config.pollIntervalMs,
      },
    );
    this.watcher.onNewTask = sendToAcpBus;
  }

  /**
   * 启动网关
   *
   * 开始轮询 Anytype 客户端中的待处理任务。
   */
  start(): void {
    this.watcher.start();
  }

  /**
   * 停止网关
   *
   * 停止任务轮询并清理资源。
   */
  stop(): void {
    this.watcher.stop();
  }
}