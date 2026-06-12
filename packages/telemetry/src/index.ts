/**
 * @aimen/telemetry — 可观测性子系统
 *
 * 零外部依赖的结构化日志、时序计数器和事件缓冲。
 * 所有组件共享同一个 AimenTelemetry 单例，通过 export 的全局实例访问。
 *
 * @packageDocumentation
 * @module @aimen/telemetry
 */

// ---------------------------------------------------------------------------
// 日志级别
// ---------------------------------------------------------------------------

export enum LogLevel {
  Debug = 'debug',
  Info = 'info',
  Warn = 'warn',
  Error = 'error',
}

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  [LogLevel.Debug]: 0,
  [LogLevel.Info]: 1,
  [LogLevel.Warn]: 2,
  [LogLevel.Error]: 3,
};

// ---------------------------------------------------------------------------
// 日志条目类型
// ---------------------------------------------------------------------------

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  module: string;
  message: string;
  /** 可选的 JSON 元数据（自动序列化） */
  meta?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// 指标类型
// ---------------------------------------------------------------------------

export interface MetricCounter {
  name: string;
  value: number;
  labels: Record<string, string>;
}

export interface MetricGauge {
  name: string;
  value: number;
  labels: Record<string, string>;
}

export interface MetricTimer {
  name: string;
  /** 毫秒 */
  durationMs: number;
  labels: Record<string, string>;
}

// ---------------------------------------------------------------------------
// 事件类型（业务可观测事件）
// ---------------------------------------------------------------------------

export interface TelemetryEvent {
  timestamp: string;
  type: string;
  /** traceId 用于跨组件追踪请求链路 */
  traceId?: string;
  data: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// AimenTelemetry — 主类
// ---------------------------------------------------------------------------

export class AimenTelemetry {
  /** 当前日志级别 — 低于此级别的日志被丢弃 */
  minLevel: LogLevel = LogLevel.Info;

  /** 最大保留事件数量 */
  maxEvents = 500;

  /** 最大保留日志数量 */
  maxLogs = 1000;

  readonly #logs: LogEntry[] = [];
  readonly #events: TelemetryEvent[] = [];
  readonly #counters: Map<string, number> = new Map();
  readonly #gauges: Map<string, number> = new Map();

  /** 日志回调（可用于输出到文件、发送到远端等） */
  onLog: ((entry: LogEntry) => void) | null = null;

  /** 事件回调 */
  onEvent: ((event: TelemetryEvent) => void) | null = null;

  // -----------------------------------------------------------------------
  // 日志
  // -----------------------------------------------------------------------

  log(level: LogLevel, module: string, message: string, meta?: Record<string, unknown>): void {
    if (LOG_LEVEL_PRIORITY[level] < LOG_LEVEL_PRIORITY[this.minLevel]) return;

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      module,
      message,
      meta,
    };

    this.#logs.push(entry);
    if (this.#logs.length > this.maxLogs) this.#logs.shift();

    this.onLog?.(entry);
  }

  debug(module: string, message: string, meta?: Record<string, unknown>): void {
    return this.log(LogLevel.Debug, module, message, meta);
  }

  info(module: string, message: string, meta?: Record<string, unknown>): void {
    return this.log(LogLevel.Info, module, message, meta);
  }

  warn(module: string, message: string, meta?: Record<string, unknown>): void {
    return this.log(LogLevel.Warn, module, message, meta);
  }

  error(module: string, message: string, meta?: Record<string, unknown>): void {
    return this.log(LogLevel.Error, module, message, meta);
  }

  getLogs(): readonly LogEntry[] {
    return this.#logs;
  }

  clearLogs(): void {
    this.#logs.length = 0;
  }

  // -----------------------------------------------------------------------
  // 计数器
  // -----------------------------------------------------------------------

  /** 递增一个计数器 */
  inc(name: string, labels?: Record<string, string>, delta = 1): void {
    const key = this.#metricKey(name, labels);
    this.#counters.set(key, (this.#counters.get(key) ?? 0) + delta);
  }

  /** 获取计数器值 */
  getCounter(name: string, labels?: Record<string, string>): number {
    return this.#counters.get(this.#metricKey(name, labels)) ?? 0;
  }

  /** 所有计数器 */
  listCounters(): MetricCounter[] {
    const result: MetricCounter[] = [];
    for (const [key, value] of this.#counters) {
      const { name, labels } = this.#parseMetricKey(key);
      result.push({ name, value, labels });
    }
    return result;
  }

  // -----------------------------------------------------------------------
  // 仪表盘
  // -----------------------------------------------------------------------

  setGauge(name: string, value: number, labels?: Record<string, string>): void {
    this.#gauges.set(this.#metricKey(name, labels), value);
  }

  getGauge(name: string, labels?: Record<string, string>): number {
    return this.#gauges.get(this.#metricKey(name, labels)) ?? 0;
  }

  listGauges(): MetricGauge[] {
    const result: MetricGauge[] = [];
    for (const [key, value] of this.#gauges) {
      const { name, labels } = this.#parseMetricKey(key);
      result.push({ name, value, labels });
    }
    return result;
  }

  // -----------------------------------------------------------------------
  // 计时器
  // -----------------------------------------------------------------------

  /** 创建一个计时器，返回结束函数 */
  startTimer(name: string, labels?: Record<string, string>): () => MetricTimer {
    const start = performance.now();
    return () => {
      const durationMs = Math.round(performance.now() - start);
      this.emit('timer', {
        name,
        durationMs,
        ...Object.fromEntries(Object.entries(labels ?? {})),
      });
      return { name, durationMs, labels: labels ?? {} };
    };
  }

  // -----------------------------------------------------------------------
  // 事件
  // -----------------------------------------------------------------------

  /** 记录业务事件 */
  emit(type: string, data: Record<string, unknown>, traceId?: string): TelemetryEvent {
    const event: TelemetryEvent = {
      timestamp: new Date().toISOString(),
      type,
      traceId,
      data,
    };

    this.#events.push(event);
    if (this.#events.length > this.maxEvents) this.#events.shift();

    this.onEvent?.(event);
    return event;
  }

  getEvents(): readonly TelemetryEvent[] {
    return this.#events;
  }

  clearEvents(): void {
    this.#events.length = 0;
  }

  // -----------------------------------------------------------------------
  // 内部
  // -----------------------------------------------------------------------

  /** 生成复合 key：name{labels} */
  #metricKey(name: string, labels?: Record<string, string>): string {
    if (!labels || Object.keys(labels).length === 0) return name;
    const labelStr = Object.entries(labels)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}="${v}"`)
      .join(',');
    return `${name}{${labelStr}}`;
  }

  /** 解析复合 key */
  #parseMetricKey(key: string): { name: string; labels: Record<string, string> } {
    const braceIdx = key.indexOf('{');
    if (braceIdx === -1) return { name: key, labels: {} };

    const name = key.slice(0, braceIdx);
    const labelStr = key.slice(braceIdx + 1, -1);
    const labels: Record<string, string> = {};
    for (const pair of labelStr.split(',')) {
      const eqIdx = pair.indexOf('=');
      if (eqIdx !== -1) {
        labels[pair.slice(0, eqIdx)] = pair.slice(eqIdx + 2, -1); // strip quotes
      }
    }
    return { name, labels };
  }

  /** 重置所有状态（主要用于测试） */
  reset(): void {
    this.#logs.length = 0;
    this.#events.length = 0;
    this.#counters.clear();
    this.#gauges.clear();
  }

  // -----------------------------------------------------------------------
  // Prometheus 序列化
  // -----------------------------------------------------------------------

  /** 将计数器 + 仪表盘序列化为 Prometheus 文本格式 */
  toPrometheus(): string {
    const lines: string[] = [];

    for (const counter of this.listCounters()) {
      const labels = Object.entries(counter.labels)
        .map(([k, v]) => `${k}="${v}"`)
        .join(',');
      const labelStr = labels ? `{${labels}}` : '';
      lines.push(`# HELP aimen_${counter.name} ${counter.name} counter`);
      lines.push(`# TYPE aimen_${counter.name} counter`);
      lines.push(`aimen_${counter.name}${labelStr} ${counter.value}`);
    }

    for (const gauge of this.listGauges()) {
      const labels = Object.entries(gauge.labels)
        .map(([k, v]) => `${k}="${v}"`)
        .join(',');
      const labelStr = labels ? `{${labels}}` : '';
      lines.push(`# HELP aimen_${gauge.name} ${gauge.name} gauge`);
      lines.push(`# TYPE aimen_${gauge.name} gauge`);
      lines.push(`aimen_${gauge.name}${labelStr} ${gauge.value}`);
    }

    return lines.join('\n') + '\n';
  }
}

// ---------------------------------------------------------------------------
// 全局单例
// ---------------------------------------------------------------------------

/** 全局 aimen 遥测实例 */
let _instance: AimenTelemetry | null = null;

/**
 * 获取全局 AimenTelemetry 实例（懒初始化）
 */
export function getTelemetry(): AimenTelemetry {
  if (!_instance) {
    _instance = new AimenTelemetry();
  }
  return _instance;
}

/**
 * 设置全局遥测实例（主要用于测试注入）
 */
export function setTelemetry(instance: AimenTelemetry): void {
  _instance = instance;
}

/**
 * 重置全局遥测实例
 */
export function resetTelemetry(): void {
  _instance = null;
}

// ---------------------------------------------------------------------------
// 便捷导出
// ---------------------------------------------------------------------------

/** 快捷获取 telemetry 实例 */
export const telemetry = getTelemetry();

export type { MetricTimer };