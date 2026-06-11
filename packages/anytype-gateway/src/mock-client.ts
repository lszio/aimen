/**
 * Anytype 内存模拟客户端
 *
 * 本模块提供 MockAnytypeClient 类，用于在内存中模拟 Anytype 存储服务。
 * 主要用于开发和测试场景，无需真实 Anytype 后端即可验证网关逻辑。
 *
 * @packageDocumentation
 * @module @aimen/anytype-gateway/mock-client
 */

import type { AnytypeObject } from './types.js';

/**
 * MockAnytypeClient 配置选项
 */
export interface MockAnytypeClientOptions {
  /** 初始对象列表 */
  initialObjects?: AnytypeObject[];
}

/**
 * Anytype 内存模拟客户端
 *
 * 使用 Map 存储 Anytype 对象，提供基础的 CRUD 操作。
 * 所有操作均在内存中完成，不会产生网络请求。
 */
export class MockAnytypeClient {
  private objects: Map<string, AnytypeObject>;

  /**
   * 创建 MockAnytypeClient 实例
   *
   * @param options - 可选的配置项（初始对象列表等）
   */
  constructor(options: MockAnytypeClientOptions = {}) {
    this.objects = new Map();
    if (options.initialObjects) {
      for (const obj of options.initialObjects) {
        this.objects.set(obj.id, obj);
      }
    }
  }

  /**
   * 列出所有存储的对象
   *
   * @returns 所有已存储的 Anytype 对象数组
   */
  listObjects(): AnytypeObject[] {
    return Array.from(this.objects.values());
  }

  /**
   * 根据 ID 获取单个对象
   *
   * @param id - 对象 ID
   * @returns 匹配的对象，未找到时返回 undefined
   */
  getObject(id: string): AnytypeObject | undefined {
    return this.objects.get(id);
  }

  /**
   * 添加或更新对象
   *
   * @param id  - 对象 ID
   * @param obj - 要存储的 Anytype 对象
   */
  setObject(id: string, obj: AnytypeObject): void {
    this.objects.set(id, obj);
  }

  /**
   * 更新对象的属性字段
   *
   * 合并更新，仅覆盖传入的属性字段，未指定的字段保持不变。
   *
   * @param id     - 对象 ID
   * @param update - 要更新的字段（Partial 方式合并）
   */
  updateObject(id: string, update: Partial<AnytypeObject>): void {
    const existing = this.objects.get(id);
    if (!existing) {
      throw new Error(`对象未找到: ${id}`);
    }
    this.objects.set(id, {
      ...existing,
      ...update,
      properties: {
        ...existing.properties,
        ...(update.properties as Record<string, unknown>),
      },
    });
  }

  /**
   * 根据 ID 删除对象
   *
   * @param id - 要删除的对象 ID
   */
  deleteObject(id: string): void {
    this.objects.delete(id);
  }

  /**
   * 清除所有存储的对象
   */
  clear(): void {
    this.objects.clear();
  }
}