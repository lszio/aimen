/**
 * @aimen/acp-bus — 错误处理与重试机制
 *
 * 本模块提供 AimenError 自定义错误类、错误码枚举以及 retryWithBackoff
 * 重试工具函数。所有 aimen 包应统一使用此模块中的错误处理和重试逻辑。
 *
 * @packageDocumentation
 * @module @aimen/acp-bus/errors
 */

// ---------------------------------------------------------------------------
// 错误码枚举
// ---------------------------------------------------------------------------

/**
 * Aimen 系统错误码枚举
 *
 * 涵盖 ACP 总线、代理、路由、网关、认证、任务执行等所有子系统。
 */
export enum AimenErrorCode {
  /** ACP 总线内部错误 */
  ACP_BUS_ERROR = 'ACP_BUS_ERROR',
  /** 未找到指定代理 */
  AGENT_NOT_FOUND = 'AGENT_NOT_FOUND',
  /** 未找到消息路由 */
  ROUTE_NOT_FOUND = 'ROUTE_NOT_FOUND',
  /** Anytype 网关通信错误 */
  GATEWAY_ERROR = 'GATEWAY_ERROR',
  /** 认证/鉴权失败 */
  AUTH_ERROR = 'AUTH_ERROR',
  /** 任务执行失败 */
  TASK_EXECUTION_ERROR = 'TASK_EXECUTION_ERROR',
  /** 参数验证失败 */
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  /** 操作超时 */
  TIMEOUT = 'TIMEOUT',
}

// ---------------------------------------------------------------------------
// AimenError 自定义错误类
// ---------------------------------------------------------------------------

/**
 * aimen 系统的标准错误类
 *
 * 继承自 Error，附加了错误码、HTTP 状态码、错误详情和发生时间戳。
 * 方便各子系统（ACP 总线、agent、gateway、auth）统一捕获和序列化错误。
 *
 * @example
 * ```ts
 * throw new AimenError(
 *   AimenErrorCode.AGENT_NOT_FOUND,
 *   '未找到指定代理: agent-xyz',
 *   { agentId: 'agent-xyz' },
 *   404,
 * );
 * ```
 */
export class AimenError extends Error {
  /** 机器可读的错误码（来自 AimenErrorCode 枚举） */
  readonly code: string;

  /** HTTP 状态码（用于 API 响应），默认 500 */
  readonly statusCode: number;

  /** 附加的错误详情（如无效参数、上下文对象等） */
  readonly details: unknown;

  /** 错误发生时间戳（ISO 8601 格式） */
  readonly timestamp: string;

  /**
   * @param code       - 错误码，通常来自 AimenErrorCode 枚举
   * @param message    - 人类可读的错误描述
   * @param details    - 可选的附加错误信息（对象、字符串等）
   * @param statusCode - HTTP 状态码，默认 500
   */
  constructor(
    code: string,
    message: string,
    details?: unknown,
    statusCode = 500,
  ) {
    super(message);
    this.name = 'AimenError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    this.timestamp = new Date().toISOString();

    // 确保 instanceof 在继承链中正常工作
    Object.setPrototypeOf(this, AimenError.prototype);
  }

  /**
   * 将错误序列化为纯对象（方便 JSON 序列化 / API 响应）
   *
   * @returns 包含 code、message、details、timestamp、statusCode 的普通对象
   *
   * @example
   * ```ts
   * const err = new AimenError('VALIDATION_ERROR', '参数无效', { field: 'name' }, 400);
   * console.log(err.toJSON());
   * // { code: 'VALIDATION_ERROR', message: '参数无效', details: { field: 'name' }, timestamp: '...', statusCode: 400 }
   * ```
   */
  toJSON(): Record<string, unknown> {
    return {
      code: this.code,
      message: this.message,
      details: this.details,
      timestamp: this.timestamp,
      statusCode: this.statusCode,
    };
  }
}

// ---------------------------------------------------------------------------
// 重试配置
// ---------------------------------------------------------------------------

/**
 * retryWithBackoff 的配置选项
 *
 * @example
 * ```ts
 * // 指数退避，最多重试 5 次，初始延迟 1 秒，最大延迟 30 秒
 * const options: AimenRetryOptions = {
 *   maxAttempts: 5,
 *   delayMs: 1000,
 *   backoff: 'exponential',
 *   maxDelayMs: 30000,
 * };
 * ```
 */
export interface AimenRetryOptions {
  /** 最大重试次数（包含首次尝试），必须 >= 1 */
  maxAttempts: number;
  /** 基础延迟毫秒数（首次重试的等待时间） */
  delayMs: number;
  /**
   * 退避策略：
   * - `'linear'`（默认）：每次重试延迟递增 delayMs
   * - `'exponential'`：每次重试延迟翻倍，上限 maxDelayMs
   */
  backoff?: 'linear' | 'exponential';
  /**
   * 最大延迟毫秒数（仅 exponential 退避有效）
   * 默认值为 delayMs * 16
   */
  maxDelayMs?: number;
}

// ---------------------------------------------------------------------------
// retryWithBackoff — 带退避的重试工具
// ---------------------------------------------------------------------------

/**
 * 使用退避策略重试异步函数
 *
 * 支持线性退避（每次增加固定延迟）和指数退避（每次延迟翻倍，上限 maxDelayMs）。
 * 所有重试耗尽后抛出最后一次尝试的错误。
 *
 * @param fn      - 需要重试的异步函数，返回 Promise<T>
 * @param options - 重试配置选项
 * @returns 函数成功执行后的结果
 * @throws 所有重试均失败时，抛出最后一次产生的错误（原始错误类型得以保留）
 *
 * @example
 * ```ts
 * // 指数退避重试
 * const result = await retryWithBackoff(
 *   () => fetch('https://api.example.com/data'),
 *   { maxAttempts: 3, delayMs: 500, backoff: 'exponential' },
 * );
 * ```
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: AimenRetryOptions,
): Promise<T> {
  const {
    maxAttempts,
    delayMs,
    backoff = 'linear',
    maxDelayMs = delayMs * 16,
  } = options;

  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;

      // 最后一次尝试失败后不再等待，直接抛出
      if (attempt === maxAttempts) {
        break;
      }

      // 计算本次重试的延迟时间
      let waitMs: number;
      if (backoff === 'exponential') {
        // 指数退避：delayMs * 2^(attempt-1)，上限 maxDelayMs
        waitMs = Math.min(delayMs * Math.pow(2, attempt - 1), maxDelayMs);
      } else {
        // 线性退避：delayMs * attempt
        waitMs = delayMs * attempt;
      }

      console.log(
        `[retryWithBackoff] 第 ${attempt}/${maxAttempts} 次尝试失败，${waitMs}ms 后重试...`,
      );

      await sleep(waitMs);
    }
  }

  // 所有重试耗尽，抛出最后一次错误
  throw lastError;
}

/**
 * Promise 化的 setTimeout
 *
 * @param ms - 等待毫秒数
 * @returns 延迟结束后 resolve 的 Promise
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}