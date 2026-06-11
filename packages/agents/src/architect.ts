/**
 * @aimen/agents — ArchitectAgent（架构师代理）
 *
 * 继承 AimenAgent，用于系统架构分析与设计。
 * 加载 skills/architect/SKILL.md 作为指令上下文，
 * 提供 readArchitectSkill()、analyzeArchitecture()、formatOutput() 三个工具，
 * 遵循"可演化、可组合、可观察、可理解"的架构哲学。
 *
 * @packageDocumentation
 * @module @aimen/agents/architect
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AimenAgent, AgentStatus } from './aimen-agent.js';

// ---------------------------------------------------------------------------
// 常量
// ---------------------------------------------------------------------------

/**
 * 架构师 SKILL.md 文件的默认路径
 * 从当前文件位置向上回溯到仓库根目录下的 skills/architect/SKILL.md
 */
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/** 默认 SKILL.md 路径：从 packages/agents/src/ 回溯到 .agents/ 根 */
const DEFAULT_SKILL_PATH = resolve(__dirname, '..', '..', '..', 'skills', 'architect', 'SKILL.md');

// ---------------------------------------------------------------------------
// 工具结果类型
// ---------------------------------------------------------------------------

/**
 * 架构分析结果
 *
 * 包含分析路径、分析结论、发现的模式列表、以及风险警告列表。
 */
export interface ArchitectureAnalysis {
  /** 被分析的代码根路径 */
  path: string;
  /** 架构分析结论描述 */
  analysis: string;
  /** 识别到的架构模式列表 */
  patterns: string[];
  /** 潜在风险或问题警告 */
  risks: string[];
}

/**
 * 格式化后的架构计划
 *
 * 包含计划标题、正文内容、以及遵循的架构原则列表。
 */
export interface FormattedArchitectPlan {
  /** 计划标题 */
  title: string;
  /** 计划正文（Markdown 格式） */
  body: string;
  /** 遵循的架构原则 */
  principles: string[];
}

// ---------------------------------------------------------------------------
// ArchitectAgent
// ---------------------------------------------------------------------------

/**
 * 架构师代理
 *
 * 继承 AimenAgent，专注于系统架构分析、技术方案评审和设计建议。
 * 加载仓库 skills/architect/SKILL.md 文件作为系统指令上下文，
 * 利用"可演化、可组合、可观察、可理解"的架构哲学进行分析。
 *
 * @remarks
 * - 当前为**模拟模式**，工具方法返回预定义结构而非真实 LLM 调用结果
 * - execute() 实现基于架构师哲学进行模拟分析
 *
 * @example
 * ```ts
 * const architect = new ArchitectAgent('arch-1', '架构师', router);
 * const result = await architect.execute('分析 /src 的架构', {});
 * console.log(result);
 * ```
 */
export class ArchitectAgent extends AimenAgent {
  /** 缓存的 SKILL.md 内容 */
  #skillContent: string | null = null;

  /** SKILL.md 文件路径 */
  readonly skillPath: string;

  /** 当前是否已加载 skill 内容 */
  #skillLoaded = false;

  /**
   * @param agentId    - 代理唯一标识
   * @param name       - 代理显示名称
   * @param router     - 可选的 ACP MessageRouter 引用
   * @param skillPath  - SKILL.md 文件路径（默认从 repo 根目录查找）
   */
  constructor(
    agentId: string,
    name: string = 'Architect',
    router?: import('./aimen-agent.js').AimenAgent['router'],
    skillPath: string = DEFAULT_SKILL_PATH,
  ) {
    super(agentId, name, 'architect', ['architecture', 'design', 'review', 'system-design'], router);
    this.skillPath = skillPath;
  }

  /**
   * 读取架构师技能文件（SKILL.md）
   *
   * 从文件系统加载 SKILL.md 内容并缓存。如果文件不存在则返回默认提示。
   *
   * @returns SKILL.md 的完整文本内容
   */
  readArchitectSkill(): string {
    if (this.#skillContent) {
      return this.#skillContent;
    }

    if (existsSync(this.skillPath)) {
      this.#skillContent = readFileSync(this.skillPath, 'utf-8');
      this.#skillLoaded = true;
    } else {
      this.#skillContent = '未找到 SKILL.md 文件，使用默认架构师指令。';
    }

    return this.#skillContent!;
  }

  /**
   * 分析指定路径的架构
   *
   * 读取 SKILL.md 内容作为分析框架，对指定代码路径进行架构分析。
   * 当前为**模拟模式**，返回结构化占位结果。
   *
   * @param path - 要分析的目标文件或目录路径
   * @returns ArchitectureAnalysis 对象，包含分析结论、识别模式和风险列表
   */
  analyzeArchitecture(path: string): ArchitectureAnalysis {
    // 加载 skill 上下文（若尚未加载）
    this.readArchitectSkill();

    // 模拟分析逻辑
    return {
      path,
      analysis: `对 "${path}" 进行了架构分析。遵循可演化、可组合、可观察、可理解的设计原则，识别了当前系统的核心模型与边界。`,
      patterns: [
        '分层架构 — 关注点分离',
        '消息驱动 — 异步解耦',
        '信息模型优先 — 实体与关系建模',
      ],
      risks: [
        '模块间存在隐式耦合，建议明确定义协议边界',
        '缺少可观察性埋点，长期演化将面临诊断困难',
        '部分实现依赖具体框架，应抽象为稳定接口',
      ],
    };
  }

  /**
   * 格式化架构计划输出
   *
   * 将分析计划按照架构师输出标准格式化，包含本质问题、核心模型、风险与演化路径。
   *
   * @param plan - 架构计划文本
   * @returns FormattedArchitectPlan 对象
   */
  formatOutput(plan: string): FormattedArchitectPlan {
    return {
      title: '架构分析与设计方案',
      body: `## 本质问题\n\n当前核心冲突：需要评估系统设计的长期可持续性。\n\n## 核心模型与关键协议\n\n- 模型：领域实体、值对象、聚合根\n- 协议：事件驱动、消息通信、服务契约\n\n## 计划内容\n\n${plan}\n\n## 隐藏风险与演化路径\n\n- 风险：模块化程度不足，未来变更成本可能上升\n- 演化路径：逐步引入领域事件、统一协议层`,
      principles: [
        '可演化 (Evolvable) — 设计应面向未来变化',
        '可组合 (Composable) — 组件通过稳定协议连接',
        '可观察 (Observable) — 系统运行状态透明可回放',
        '可理解 (Understandable) — 概念简洁、抽象稳定',
      ],
    };
  }

  /**
   * 实现 AimenAgent 的抽象 execute() 方法
   *
   * 基于架构师哲学对任务目标进行模拟分析。
   * 自动加载 SKILL.md 作为分析上下文，返回结构化分析结果。
   *
   * @param goal    - 任务目标（例如 "分析项目架构"、"评审设计方案"）
   * @param context - 上下文信息（可包含 path、focus 等字段）
   * @returns 结构化分析结果或格式化计划
   */
  async execute(goal: string, context: Record<string, unknown>): Promise<unknown> {
    this.setStatus(AgentStatus.Busy);

    // 加载架构师技能上下文
    const skill = this.readArchitectSkill();
    const targetPath = (context.path as string) || './';

    // 模拟分析流程
    const analysis = this.analyzeArchitecture(targetPath);
    const output = this.formatOutput(
      `目标: ${goal}\n\n分析摘要: 代码路径 "${targetPath}" 的架构评估已完成。\n\n` +
      `识别模式: ${analysis.patterns.join('、')}\n\n` +
      `主要风险: ${analysis.risks.join('；')}`,
    );

    this.setStatus(AgentStatus.Idle);

    return {
      status: 'completed',
      task: goal,
      skillLoaded: this.#skillLoaded,
      skillExcerpt: skill.slice(0, 200) + '...',
      analysis,
      formattedPlan: output,
    };
  }
}