/**
 * @aimen/agents — ArchitectAgent（架构师代理）
 *
 * 继承 AimenAgent，用于系统架构分析与设计。
 * 加载 skills/architect/SKILL.md 作为指令上下文。
 * - LLM 可用时：调用真实 LLM 进行架构分析
 * - LLM 不可用时：降级为模拟数据
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

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/** 默认 SKILL.md 路径：从 packages/agents/src/ 回溯到 .agents/ 根 */
const DEFAULT_SKILL_PATH = resolve(__dirname, '..', '..', '..', 'skills', 'architect', 'SKILL.md');

// ---------------------------------------------------------------------------
// 工具结果类型
// ---------------------------------------------------------------------------

export interface ArchitectureAnalysis {
  path: string;
  analysis: string;
  patterns: string[];
  risks: string[];
}

export interface FormattedArchitectPlan {
  title: string;
  body: string;
  principles: string[];
}

// ---------------------------------------------------------------------------
// ArchitectAgent
// ---------------------------------------------------------------------------

export class ArchitectAgent extends AimenAgent {
  #skillContent: string | null = null;
  readonly skillPath: string;
  #skillLoaded = false;

  constructor(
    agentId: string,
    name: string = 'Architect',
    router?: import('./aimen-agent.js').AimenAgent['router'],
    skillPath: string = DEFAULT_SKILL_PATH,
  ) {
    super(agentId, name, 'architect', ['architecture', 'design', 'review', 'system-design'], router);
    this.skillPath = skillPath;
  }

  readArchitectSkill(): string {
    if (this.#skillContent) return this.#skillContent;

    if (existsSync(this.skillPath)) {
      this.#skillContent = readFileSync(this.skillPath, 'utf-8');
      this.#skillLoaded = true;
    } else {
      this.#skillContent = '未找到 SKILL.md 文件，使用默认架构师指令。';
    }

    return this.#skillContent!;
  }

  analyzeArchitecture(path: string): ArchitectureAnalysis {
    this.readArchitectSkill();
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
   * 当 LLM 环境变量完整时调用真实 LLM 进行架构分析。
   * 加载 SKILL.md 作为系统提示词。无 LLM 配置或调用失败时降级为模拟。
   */
  async execute(goal: string, context: Record<string, unknown>): Promise<unknown> {
    this.setStatus(AgentStatus.Busy);

    const skill = this.readArchitectSkill();
    const targetPath = (context.path as string) || './';

    // LLM 模式
    if (this.llmAvailable) {
      try {
        const systemPrompt = `你是一位系统架构专家。你的核心哲学：构建可演化（Evolvable）、可组合（Composable）、可观察（Observable）且可理解（Understandable）的长期系统。

以下是你遵循的架构指令：
${skill.slice(0, 3000)}

请基于以上哲学进行分析。返回格式为 JSON：
{
  "analysis": "分析结论",
  "patterns": ["模式1", "模式2"],
  "risks": ["风险1", "风险2"],
  "recommendations": ["建议1", "建议2"]
}`;

        const userPrompt = `请分析以下代码路径的架构：${targetPath}

任务目标：${goal}

附加上下文：${JSON.stringify(context, null, 2)}`;

        const content = await this.callLLM(systemPrompt, userPrompt);

        let parsed: { analysis?: string; patterns?: string[]; risks?: string[]; recommendations?: string[] };
        try {
          parsed = JSON.parse(content);
        } catch {
          parsed = { analysis: content, patterns: [], risks: [], recommendations: [] };
        }

        this.setStatus(AgentStatus.Idle);

        return {
          status: 'completed',
          task: goal,
          source: 'llm',
          skillLoaded: this.#skillLoaded,
          llmAnalysis: {
            analysis: parsed.analysis ?? '',
            patterns: parsed.patterns ?? [],
            risks: parsed.risks ?? [],
            recommendations: parsed.recommendations ?? [],
          },
        };
      } catch (err) {
        console.warn(`[ArchitectAgent] LLM 调用失败，降级为模拟模式:`, err);
      }
    }

    // 模拟模式（LLM 不可用或调用失败）
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
      source: 'simulation',
      skillLoaded: this.#skillLoaded,
      skillExcerpt: this.#skillContent ? this.#skillContent.slice(0, 200) + '...' : undefined,
      analysis,
      formattedPlan: output,
    };
  }
}