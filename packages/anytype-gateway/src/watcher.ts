/**
 * Anytype 任务监控器
 *
 * 本模块提供 AnytypeWatcher 类，用于定期轮询 MockAnytypeClient 中的待处理
 * AgentTask 对象，通过 AcpMapper 转换为 ACP 消息并分发至 ACP 总线。
 *
 * @packageDocumentation
 * @module @aimen/anytype-gateway/watcher
 */

import type { MockAnytypeClient } from './mock-client.js';
import type { AnytypeTaskObject } from './types.js';
import type { AcpMapper } from './object-mapper.js';
import type { AcpMessageEnvelope } from '@aimen/acp-bus';

// ---------------------------------------------------------------------------
// 辅助类型
// ---------------------------------------------------------------------------

/**
 * AnytypeWatcher 配置项
 */
export interface AnytypeWatcherOptions {
  /**
   * 轮询间隔（毫秒）
   * @default 5000
   */
  pollIntervalMs?: number;
}

// ---------------------------------------------------------------------------
// 辅助函数
// ---------------------------------------------------------------------------

/**
 * 按 createdAt 字段升序排列任务
 *
 * 用于确保任务以先创建先处理的有序方式分发。
 *
 * @param a - 第一个任务对象
 * @param b - 第二个任务对象
 * @returns 排序比较值（负数表示 a 应排在 b 前面）
 */
export function taskSorter(
  a: AnytypeTaskObject,
  b: AnytypeTaskObject,
): number {
  const dateA = new Date(a.properties.createdAt).getTime();
  const dateB = new Date(b.properties.createdAt).getTime();
  return dateA - dateB;
}

// ---------------------------------------------------------------------------
// AnytypeWatcher 类
// ---------------------------------------------------------------------------

/**
 * Anytype 任务监控器
 *
 * 定期轮询 Anytype 客户端（MockAnytypeClient），查找状态为 'pending' 的
 * AgentTask 对象，通过 AcpMapper 转换为 ACP TaskSubmit 消息，并通过
 * onNewTask 回调发送至 ACP 总线。发送后自动将任务状态更新为 'running'。
 *
 * 内部维护已处理的 task ID 集合，确保同一任务不会被重复分发。
 *
 * @example
 * ```ts
 * const watcher = new AnytypeWatcher(client, mapper, {
 *   pollIntervalMs: 3000,
 * });
 * watcher.onNewTask = async (msg) => {
 *   await bus.send(msg);
 * };
 * watcher.start();
 * // ... later ...
 * watcher.stop();
 * ```
 */
export class AnytypeWatcher {
  private client: MockAnytypeClient;
  private mapper: AcpMapper;
  private seenIds: Set<string>;
  private intervalId: ReturnType<typeof setInterval> | null;
  private pollIntervalMs: number;

  /**
   * 当检测到新任务时调用的回调函数
   *
   * 回调接收已转换完成的 ACP TaskSubmit 消息信封，
   * 使用者应在此回调中将消息发送至 ACP 总线。
   */
  public onNewTask: ((msg: AcpMessageEnvelope) => Promise<void>) | null;

  /**
   * 创建 AnytypeWatcher 实例
   *
   * @param client  - MockAnytypeClient 实例，用于查询任务
   * @param mapper  - AcpMapper 实例，用于 Anytype ↔ ACP 转换
   * @param options - 可选的配置项（pollIntervalMs 等）
   */
  constructor(
    client: MockAnytypeClient,
    mapper: AcpMapper,
    options: AnytypeWatcherOptions = {},
  ) {
    this.client = client;
    this.mapper = mapper;
    this.seenIds = new Set();
    this.intervalId = null;
    this.pollIntervalMs = options.pollIntervalMs ?? 5000;
    this.onNewTask = null;
  }

  /**
   * 启动轮询
   *
   * 开始以配置的间隔定期检查 Anytype 客户端中的待处理任务。
   * 如果监控器已在运行，调用此方法不会产生任何效果。
   */
  start(): void {
    if (this.intervalId !== null) {
      return;
    }

    this.intervalId = setInterval(
      () => this.poll(),
      this.pollIntervalMs,
    );
  }

  /**
   * 停止轮询
   *
   * 停止定期检查并清理内部定时器。
   * 如果监控器未在运行，调用此方法不会产生任何效果。
   */
  stop(): void {
    if (this.intervalId === null) {
      return;
    }

    clearInterval(this.intervalId);
    this.intervalId = null;
  }

  /**
   * 执行一轮轮询操作
   *
   * 1. 通过 client.listObjects() 获取所有 Anytype 对象
   * 2. 筛选出 type 为 AgentTask 且 status 为 'pending' 的任务
   * 3. 按 createdAt 升序排序
   * 4. 对每个未处理的任务进行转换和分发
   * 5. 分发后将任务状态更新为 'running'
   *
   * 内部错误会被捕获并记录到控制台，不会中断后续轮询。
   */
  private async poll(): Promise<void> {
    try {
      const objects = this.client.listObjects();
      const pendingTasks: AnytypeTaskObject[] = [];

      for (const obj of objects) {
        if (
          obj.type === 'AgentTask' &&
          obj.properties?.status === 'pending'
        ) {
          pendingTasks.push(obj as AnytypeTaskObject);
        }
      }

      pendingTasks.sort(taskSorter);

      for (const task of pendingTasks) {
        if (this.seenIds.has(task.id)) {
          continue;
        }

        this.seenIds.add(task.id);

        if (this.onNewTask === null) {
          continue;
        }

        const message = this.mapper.anytypeTaskToAcpMessage(task);
        await this.onNewTask(message);

        // 分发成功后，将任务状态更新为 'running'
        try {
          this.client.updateObject(task.id, {
            properties: {
              ...task.properties,
              status: 'running',
            },
          });
        } catch (updateError) {
          console.error(
            `[AnytypeWatcher] 更新任务 ${task.id} 状态为 'running' 失败:`,
            updateError,
          );
        }
      }
    } catch (error) {
      console.error('[AnytypeWatcher] 轮询过程中发生错误:', error);
    }
  }
}