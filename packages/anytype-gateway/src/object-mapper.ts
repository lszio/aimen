/**
 * Anytype 对象与 ACP 消息之间的映射器
 *
 * 本模块提供将 Anytype 的 AgentTask 对象转换为 ACP TaskSubmit 消息，
 * 以及将 ACP TaskResult 消息结果提取回 Anytype 任务更新字段的功能。
 *
 * @packageDocumentation
 * @module @aimen/anytype-gateway/object-mapper
 */

import type {
  AnytypeTaskObject,
  AnytypeTaskStatus,
} from './types.js';
import {
  AcpMessageType,
  createMessage,
} from '@aimen/acp-bus';
import type { AcpMessageEnvelope } from '@aimen/acp-bus';

// ---------------------------------------------------------------------------
// AcpMapper 接口
// ---------------------------------------------------------------------------

/**
 * ACP 映射器接口
 *
 * 定义了 Anytype 对象与 ACP 消息之间的双向转换契约。
 * 实现该接口的类负责将 Anytype 的 AgentTask 序列化为 ACP 协议消息，
 * 以及将 ACP 的执行结果反序列化回 Anytype 的更新字段。
 */
export interface AcpMapper {
  /**
   * 将 Anytype AgentTask 对象转换为 ACP TaskSubmit 消息信封
   *
   * @param task - Anytype 任务对象，必须包含 id、properties.goal 等字段
   * @returns 一个完整的 AcpMessageEnvelope，消息类型为 TaskSubmit
   */
  anytypeTaskToAcpMessage(task: AnytypeTaskObject): AcpMessageEnvelope;

  /**
   * 从 ACP TaskResult 消息中提取任务执行结果，返回 Anytype 任务的更新字段
   *
   * @param result       - ACP TaskResult 消息信封
   * @param existingTask - 原始 Anytype 任务对象，用于保留未变更字段
   * @returns 可直接应用于 Anytype 任务对象的 Partial 更新字段
   */
  acpResultToAnytypeTaskUpdate(
    result: AcpMessageEnvelope,
    existingTask: AnytypeTaskObject,
  ): Partial<AnytypeTaskObject>;
}

// ---------------------------------------------------------------------------
// DefaultAcpMapper 实现
// ---------------------------------------------------------------------------

/**
 * 默认的 ACP 映射器实现
 *
 * 将 Anytype 的 AgentTask 字段映射到 ACP 协议的标准 TaskSubmit 消息格式。
 * 任务的目标（goal）映射为 ACP 载荷中的 goal 字段，
 * 任务的 agentRole 属性用作 ACP 的目标路由（targetId）。
 */
export class DefaultAcpMapper implements AcpMapper {
  /**
   * 将 Anytype AgentTask 对象转换为 ACP TaskSubmit 消息
   *
   * 转换规则：
   * - senderId 固定为 'anytype-gateway'
   * - targetId 取 task.properties.agentRole（角色路由）
   * - payload.taskId 取 task.id
   * - payload.goal 取 task.properties.goal
   * - payload.context 传递 task.properties.context（如有）
   * - payload.tools 传递 task.properties.tools（如有）
   *
   * @param task - Anytype 任务对象
   * @returns ACP TaskSubmit 消息信封
   */
  anytypeTaskToAcpMessage(task: AnytypeTaskObject): AcpMessageEnvelope {
    const payload: Record<string, unknown> = {
      taskId: task.id,
      goal: task.properties.goal,
    };

    if (task.properties.context !== undefined) {
      payload.context = task.properties.context;
    }

    if (task.properties.tools !== undefined) {
      payload.tools = task.properties.tools;
    }

    return createMessage(
      AcpMessageType.TaskSubmit,
      'anytype-gateway',
      task.properties.agentRole,
      payload,
    );
  }

  /**
   * 从 ACP TaskResult 消息中提取结果，生成 Anytype 任务的更新字段
   *
   * 提取规则：
   * - 如果 result.payload 包含 result 字段 → status 置为 'completed'
   * - 如果 result.payload 包含 error 字段 → status 置为 'failed'
   * - 结果/错误信息写入 properties.result / properties.error
   *
   * @param result       - ACP TaskResult 消息信封
   * @param existingTask - 原始 Anytype 任务对象，用于继承未变更的属性
   * @returns Anytype 任务的部分更新字段
   */
  acpResultToAnytypeTaskUpdate(
    result: AcpMessageEnvelope,
    existingTask: AnytypeTaskObject,
  ): Partial<AnytypeTaskObject> {
    const payload = result.payload as Record<string, unknown>;
    const taskResult = payload.result;
    const taskError = payload.error;

    const status: AnytypeTaskStatus = taskError ? 'failed' : 'completed';

    const propertiesUpdate: AnytypeTaskObject['properties'] = {
      ...existingTask.properties,
      status,
    };

    if (taskResult !== undefined) {
      propertiesUpdate.result = taskResult;
      delete propertiesUpdate.error;
    }

    if (taskError !== undefined) {
      propertiesUpdate.error = taskError as string;
    }

    return {
      id: existingTask.id,
      spaceId: existingTask.spaceId,
      properties: propertiesUpdate,
    };
  }
}