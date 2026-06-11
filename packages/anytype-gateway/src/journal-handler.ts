/**
 * Anytype 会话日志处理器
 *
 * 本模块提供 JournalHandler 类，用于在内存模拟客户端中维护代理与用户
 * 之间的会话日志。日志（Journal）包含多个条目（JournalEntry），
 * 每个条目记录一条角色消息。
 *
 * @packageDocumentation
 * @module @aimen/anytype-gateway/journal-handler
 */

import type { AnytypeObject } from './types.js';
import type { MockAnytypeClient } from './mock-client.js';

// ---------------------------------------------------------------------------
// 类型定义
// ---------------------------------------------------------------------------

/**
 * 日志条目对象接口
 *
 * 表示一条会话消息记录，包含消息角色、内容以及可选的代理标识。
 */
export interface JournalEntryObject extends AnytypeObject {
  type: 'JournalEntry';
  properties: {
    /** 所属日志 ID */
    journalId: string;
    /** 消息角色：user（用户）、agent（代理）、system（系统） */
    role: 'user' | 'agent' | 'system';
    /** 消息正文 */
    content: string;
    /** 可选的发送方代理 ID */
    agentId?: string;
    /** 条目创建时间（ISO 8601） */
    createdAt: string;
    /** 其他任意属性 */
    [key: string]: unknown;
  };
}

// ---------------------------------------------------------------------------
// JournalHandler 类
// ---------------------------------------------------------------------------

/**
 * 会话日志处理器
 *
 * 封装与 Anytype 会话日志相关的所有操作，包括日志的创建、查询
 * 以及条目的添加、列举。
 *
 * 日志对象（AnytypeJournalObject）通过 properties.entries 字段
 * 维护一个日志条目 ID 列表，实现一对多的关联结构。
 */
export class JournalHandler {
  private client: MockAnytypeClient;

  /**
   * 创建 JournalHandler 实例
   *
   * @param client - MockAnytypeClient 实例，用于 CRUD 操作
   */
  constructor(client: MockAnytypeClient) {
    this.client = client;
  }

  /**
   * 创建新的会话日志
   *
   * 在存储中创建一条 AnytypeJournalObject，其 properties.entries
   * 初始化为空数组，后续通过 addEntry() 填充。
   *
   * @param title  - 日志标题
   * @returns 新创建的 AnytypeJournalObject
   */
  async createJournal(title: string): Promise<AnytypeJournalExtended> {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    const journal: AnytypeJournalExtended = {
      id,
      spaceId: 'default',
      type: 'Journal',
      properties: {
        title,
        content: '',
        entries: [],
        createdAt: now,
        updatedAt: now,
      },
      createdAt: now,
      updatedAt: now,
    };

    this.client.setObject(id, journal);
    return journal;
  }

  /**
   * 向指定日志添加条目
   *
   * 创建一个 JournalEntryObject，将其 ID 追加到日志的 properties.entries 列表末尾，
   * 并更新日志的时间戳。
   *
   * @param journalId - 目标日志 ID
   * @param role      - 消息角色（'user' | 'agent' | 'system'）
   * @param content   - 消息正文
   * @param agentId   - 可选的发送方代理 ID
   * @returns 新创建的 JournalEntryObject
   * @throws 当指定日志不存在时抛出错误
   */
  async addEntry(
    journalId: string,
    role: 'user' | 'agent' | 'system',
    content: string,
    agentId?: string,
  ): Promise<JournalEntryObject> {
    const journal = this.client.getObject(journalId) as
      | AnytypeJournalExtended
      | undefined;

    if (!journal) {
      throw new Error(`未找到日志: ${journalId}`);
    }

    const entryId = crypto.randomUUID();
    const now = new Date().toISOString();

    const entry: JournalEntryObject = {
      id: entryId,
      spaceId: journal.spaceId,
      type: 'JournalEntry',
      properties: {
        journalId,
        role,
        content,
        agentId,
        createdAt: now,
      },
      createdAt: now,
      updatedAt: now,
    };

    this.client.setObject(entryId, entry);

    // 将条目 ID 追加到日志的 entries 列表
    const updatedJournal: AnytypeJournalExtended = {
      ...journal,
      properties: {
        ...journal.properties,
        entries: [...(journal.properties.entries ?? []), entryId],
        updatedAt: now,
      },
      updatedAt: now,
    };

    this.client.setObject(journalId, updatedJournal);

    return entry;
  }

  /**
   * 列出指定日志的所有条目
   *
   * 通过日志的 properties.entries 列表依次获取每条 JournalEntryObject，
   * 若某条条目不存在则跳过。
   *
   * @param journalId - 目标日志 ID
   * @returns 日志条目对象数组
   * @throws 当指定日志不存在时抛出错误
   */
  async listEntries(journalId: string): Promise<JournalEntryObject[]> {
    const journal = this.client.getObject(journalId) as
      | AnytypeJournalExtended
      | undefined;

    if (!journal) {
      throw new Error(`未找到日志: ${journalId}`);
    }

    const entryIds = journal.properties.entries ?? [];
    const entries: JournalEntryObject[] = [];

    for (const id of entryIds) {
      const obj = this.client.getObject(id) as
        | JournalEntryObject
        | undefined;
      if (obj) {
        entries.push(obj);
      }
    }

    return entries;
  }

  /**
   * 获取所有会话日志
   *
   * 遍历存储中所有 type 为 'Journal' 的对象并返回。
   *
   * @returns 所有 AnytypeJournalExtended 对象数组
   */
  async getJournals(): Promise<AnytypeJournalExtended[]> {
    const all = this.client.listObjects();
    return all.filter(
      (obj): obj is AnytypeJournalExtended =>
        obj.type === 'Journal',
    );
  }
}

// ---------------------------------------------------------------------------
// 内部辅助类型
// ---------------------------------------------------------------------------

/**
 * 扩展后的 Anytype 日志对象接口
 *
 * 在基础 AnytypeJournalObject 的 properties 上增加了 title 和 entries 字段，
 * 用于支持会话日志的标题和条目关联。
 *
 * @internal
 */
interface AnytypeJournalExtended extends AnytypeObject {
  type: 'Journal';
  properties: {
    /** 日志标题 */
    title: string;
    /** 日志内容 */
    content: string;
    /** 日志条目 ID 列表 */
    entries: string[];
    /** 日志创建时间（ISO 8601） */
    createdAt: string;
    /** 日志最后修改时间（ISO 8601） */
    updatedAt: string;
    /** 其他任意属性 */
    [key: string]: unknown;
  };
}