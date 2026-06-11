/**
 * Anytype 网关类型定义
 *
 * 本模块定义了 Anytype 对象模型的核心类型，包括通用对象、任务对象、
 * 日志对象和网关配置。
 *
 * @packageDocumentation
 * @module @aimen/anytype-gateway/types
 */

// ---------------------------------------------------------------------------
// 枚举
// ---------------------------------------------------------------------------

/**
 * Anytype 对象类型枚举
 */
export enum AnytypeObjectType {
  AgentTask = 'AgentTask',
  Journal = 'Journal',
  Note = 'Note',
}

/**
 * Anytype 任务状态枚举
 */
export type AnytypeTaskStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled';

// ---------------------------------------------------------------------------
// 核心接口
// ---------------------------------------------------------------------------

/**
 * Anytype 通用对象接口
 *
 * 表示 Anytype 存储中的任意对象，包含基础元数据字段。
 */
export interface AnytypeObject {
  /** 对象唯一标识 */
  id: string;
  /** 所在空间 ID */
  spaceId: string;
  /** 对象类型 */
  type: string;
  /** 对象属性映射 */
  properties: Record<string, unknown>;
  /** 对象创建时间戳（ISO 8601） */
  createdAt: string;
  /** 对象最后修改时间戳（ISO 8601） */
  updatedAt: string;
}

/**
 * Anytype AgentTask 对象接口
 *
 * 表示 Anytype 中的可执行代理任务，包含目标、角色路由和状态信息。
 */
export interface AnytypeTaskObject extends AnytypeObject {
  type: 'AgentTask';
  properties: {
    /** 任务目标描述 */
    goal: string;
    /** 目标任务代理的角色名（用于 ACP 路由） */
    agentRole: string;
    /** 任务当前状态 */
    status: AnytypeTaskStatus;
    /** 任务创建时间（ISO 8601） */
    createdAt: string;
    /** 可选的上下文信息 */
    context?: Record<string, unknown>;
    /** 允许使用的工具列表 */
    tools?: string[];
    /** 执行结果（完成时填充） */
    result?: unknown;
    /** 错误信息（失败时填充） */
    error?: string;
    /** 其他任意属性 */
    [key: string]: unknown;
  };
}

/**
 * Anytype 日志对象接口
 *
 * 表示 Anytype 中的时间线日志条目。
 */
export interface AnytypeJournalObject extends AnytypeObject {
  type: 'Journal';
  properties: {
    /** 日志内容 */
    content: string;
    /** 日志标签 */
    tags?: string[];
    /** 其他任意属性 */
    [key: string]: unknown;
  };
}

/**
 * Anytype 网关精简配置接口（向后兼容别名）
 *
 * @deprecated 请使用 AnytypeGatewayConfig
 */
export type AnytypeConfig = AnytypeGatewayConfig;

/**
 * Anytype 网关配置接口
 */
export interface AnytypeGatewayConfig {
  /** API 密钥 */
  apiKey: string;
  /** Anytype 服务基础 URL */
  baseUrl: string;
  /** 轮询间隔（毫秒），默认 5000 */
  pollIntervalMs?: number;
}