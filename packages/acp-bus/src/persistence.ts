/**
 * @aimen/acp-bus — ACP 代理注册 SQLite 持久化
 *
 * 本模块提供 PersistedAgentRegistry 类，继承 AgentRegistry 并增加 SQLite 持久化支持。
 * 使用 Bun 内置的 bun:sqlite，无需额外依赖。
 *
 * @packageDocumentation
 * @module @aimen/acp-bus/persistence
 */

import { Database } from 'bun:sqlite';
import { type AcpAgentInfo } from './types.js';
import { AgentRegistry } from './router.js';

// ---------------------------------------------------------------------------
// 类型定义
// ---------------------------------------------------------------------------

/**
 * SQLite 查询返回的原始代理行数据
 *
 * capabilities 在数据库中存储为 JSON 字符串，需手动解析。
 */
interface AgentDbRow {
  id: string;
  name: string;
  role: string;
  status: string;
  capabilities: string;
  lastHeartbeat: string;
  registeredAt: string;
}

// ---------------------------------------------------------------------------
// PersistedAgentRegistry — 带 SQLite 持久化的代理注册中心
// ---------------------------------------------------------------------------

/**
 * 带 SQLite 持久化支持的代理注册中心
 *
 * 继承 {@link AgentRegistry}，在内存操作的基础上增加 SQLite 持久化层。
 * 所有注册、注销、状态变更操作都会同步写入 SQLite 数据库。
 * 启动时自动从数据库恢复已注册的代理。
 *
 * @example
 * ```ts
 * // 使用默认数据库路径
 * const registry = new PersistedAgentRegistry();
 *
 * // 指定自定义路径
 * const registry2 = new PersistedAgentRegistry('/path/to/custom.db');
 *
 * // 注册代理（自动持久化）
 * registry.register({
 *   id: 'agent-1',
 *   name: '助手甲',
 *   role: 'assistant',
 *   status: 'online',
 *   capabilities: ['chat', 'search'],
 *   lastHeartbeat: new Date().toISOString(),
 * });
 *
 * // 重新启动时，所有代理将从数据库自动恢复
 * ```
 */
export class PersistedAgentRegistry extends AgentRegistry {
  /** SQLite 数据库实例 */
  readonly #db: Database;

  /** 数据库文件路径 */
  readonly #dbPath: string;

  /**
   * @param dbPath - SQLite 数据库文件路径，默认为 `.aimen/data/acp-bus.db`
   */
  constructor(dbPath: string = '.aimen/data/acp-bus.db') {
    super();

    this.#dbPath = dbPath;

    // 创建目录（如果不存在）
    const dir = this.#dbPath.split('/').slice(0, -1).join('/');
    if (dir && dir !== '.') {
      const proc = Bun.spawnSync(['mkdir', '-p', dir]);
      if (proc.exitCode !== 0) {
        throw new Error(
          `无法创建数据库目录 "${dir}": ${proc.stderr.toString()}`,
        );
      }
    }

    // 打开/创建数据库
    this.#db = new Database(this.#dbPath);

    // 启用 WAL 模式以获得更好的并发性能
    this.#db.run('PRAGMA journal_mode = WAL');

    // 创建表（如果不存在）
    this.#db.run(`
      CREATE TABLE IF NOT EXISTS agents (
        id            TEXT PRIMARY KEY,
        name          TEXT NOT NULL,
        role          TEXT NOT NULL,
        status        TEXT NOT NULL DEFAULT 'offline',
        capabilities  TEXT NOT NULL DEFAULT '[]',
        lastHeartbeat TEXT NOT NULL,
        registeredAt  TEXT NOT NULL
      )
    `);

    // 启动时从数据库恢复代理
    this.#loadFromDb();
  }

  // -------------------------------------------------------------------------
  // 公开重写方法
  // -------------------------------------------------------------------------

  /**
   * 注册或更新一个代理，并持久化到 SQLite
   *
   * @param agent - 代理信息对象
   */
  override register(agent: AcpAgentInfo): void {
    super.register(agent);
    this.#saveToDb(agent);
  }

  /**
   * 注销一个代理，并从 SQLite 中移除
   *
   * @param agentId - 要移除的代理 ID
   * @returns 如果代理存在并被移除则返回 true，否则返回 false
   */
  override unregister(agentId: string): boolean {
    const result = super.unregister(agentId);
    if (result) {
      this.#removeFromDb(agentId);
    }
    return result;
  }

  /**
   * 更新代理状态，并持久化到 SQLite
   *
   * @param agentId - 代理 ID
   * @param status  - 新的状态值
   * @returns 如果代理存在并成功更新则返回 true，否则返回 false
   */
  override setStatus(
    agentId: string,
    status: AcpAgentInfo['status'],
  ): boolean {
    const result = super.setStatus(agentId, status);
    if (result) {
      // 从父类获取更新后的代理信息并写入数据库
      const updated = super.get(agentId);
      if (updated) {
        this.#saveToDb(updated);
      }
    }
    return result;
  }

  /**
   * 关闭数据库连接
   *
   * 调用后不再对该实例执行任何操作。
   */
  close(): void {
    this.#db.close();
  }

  /**
   * 获取当前数据库文件路径
   */
  get dbPath(): string {
    return this.#dbPath;
  }

  // -------------------------------------------------------------------------
  // 内部方法
  // -------------------------------------------------------------------------

  /**
   * 从 SQLite 数据库恢复所有已注册的代理到内存
   *
   * 遍历数据库中所有记录，通过父类的 register() 方法逐一恢复。
   * 在构造函数末尾自动调用。
   */
  #loadFromDb(): void {
    const rows = this.#db
      .query('SELECT * FROM agents')
      .all() as AgentDbRow[];

    for (const row of rows) {
      const agent = this.#rowToAgent(row);
      if (agent) {
        // 直接调用父类的 register 以避免递归写入数据库
        super.register(agent);
      }
    }
  }

  /**
   * 将代理信息写入 SQLite（INSERT OR REPLACE）
   *
   * @param agent - 代理信息对象
   */
  #saveToDb(agent: AcpAgentInfo): void {
    const now = new Date().toISOString();
    this.#db
      .query(
        `INSERT OR REPLACE INTO agents (id, name, role, status, capabilities, lastHeartbeat, registeredAt)
         VALUES ($id, $name, $role, $status, $capabilities, $lastHeartbeat, COALESCE((SELECT registeredAt FROM agents WHERE id = $id), $registeredAt))`,
      )
      .run({
        $id: agent.id,
        $name: agent.name,
        $role: agent.role,
        $status: agent.status,
        $capabilities: JSON.stringify(agent.capabilities),
        $lastHeartbeat: agent.lastHeartbeat,
        $registeredAt: now,
      });
  }

  /**
   * 从 SQLite 中删除指定代理
   *
   * @param agentId - 要删除的代理 ID
   */
  #removeFromDb(agentId: string): void {
    this.#db.query('DELETE FROM agents WHERE id = $id').run({
      $id: agentId,
    });
  }

  /**
   * 将 SQLite 行数据转换为 AcpAgentInfo 对象
   *
   * @param row - 数据库行数据
   * @returns 代理信息对象，解析失败时返回 null
   */
  #rowToAgent(row: AgentDbRow): AcpAgentInfo | null {
    try {
      const capabilities: string[] = JSON.parse(row.capabilities);
      if (
        !Array.isArray(capabilities) ||
        !capabilities.every((c) => typeof c === 'string')
      ) {
        throw new Error('capabilities 字段格式无效');
      }

      return {
        id: row.id,
        name: row.name,
        role: row.role,
        status: row.status as AcpAgentInfo['status'],
        capabilities,
        lastHeartbeat: row.lastHeartbeat,
      };
    } catch (err) {
      console.error(
        `[PersistedAgentRegistry] 解析代理行数据失败 (id=${row.id}):`,
        err,
      );
      return null;
    }
  }
}