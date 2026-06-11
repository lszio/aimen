/**
 * @aimen/agents — CoderAgent（编码代理）
 *
 * 继承 AimenAgent，专注于代码分析、重构建议和代码生成。
 * 提供 analyzeCode()、suggestRefactor()、formatOutput() 三个工具，
 * 帮助用户提升代码质量和可维护性。
 *
 * @packageDocumentation
 * @module @aimen/agents/coder
 */

import { AimenAgent, AgentStatus } from './aimen-agent.js';

// ---------------------------------------------------------------------------
// 工具结果类型
// ---------------------------------------------------------------------------

/**
 * 代码分析结果
 *
 * 包含代码质量评分、发现的问题列表、以及改进建议。
 */
export interface CodeAnalysis {
  /** 代码质量评分（1-10） */
  score: number;
  /** 发现的问题列表 */
  issues: string[];
  /** 改进建议 */
  suggestions: string[];
}

/**
 * 重构建议结果
 *
 * 包含建议的重构方案、涉及的代码片段、以及预期收益。
 */
export interface RefactorSuggestion {
  /** 重构目标描述 */
  target: string;
  /** 建议方案描述 */
  suggestion: string;
  /** 预期收益 */
  benefits: string[];
  /** 风险提示 */
  risks: string[];
}

// ---------------------------------------------------------------------------
// CoderAgent
// ---------------------------------------------------------------------------

/**
 * 编码代理
 *
 * 继承 AimenAgent，专注于代码质量分析、重构建议和代码格式化输出。
 * 用于代码审查、技术债务识别和代码组织优化。
 *
 * @remarks
 * - 当前为**模拟模式**，工具方法返回预定义结构而非真实 LLM 调用结果
 * - execute() 返回代码分析结果和重构建议的组合
 *
 * @example
 * ```ts
 * const coder = new CoderAgent('coder-1', '编码者', router);
 * const result = await coder.execute('检查 src/main.ts 的代码质量', {});
 * console.log(result);
 * ```
 */
export class CoderAgent extends AimenAgent {
  /**
   * @param agentId - 代理唯一标识
   * @param name    - 代理显示名称
   * @param router  - 可选的 ACP MessageRouter 引用
   */
  constructor(
    agentId: string,
    name: string = 'Coder',
    router?: import('./aimen-agent.js').AimenAgent['router'],
  ) {
    super(agentId, name, 'coder', ['code-analysis', 'refactoring', 'code-generation'], router);
  }

  /**
   * 分析代码质量
   *
   * 对传入的代码字符串进行静态分析，评估代码质量并返回发现的问题和改进建议。
   * 当前为**模拟模式**，返回通用占位结果。
   *
   * @param code - 要分析的代码字符串
   * @returns CodeAnalysis 对象，包含评分、问题和建议
   */
  analyzeCode(code: string): CodeAnalysis {
    const lineCount = code.split('\n').length;
    const hasComments = code.includes('//') || code.includes('/*');
    const hasFunctions = code.includes('function ') || code.includes('=>');
    const hasClasses = code.includes('class ');

    const issues: string[] = [];
    const suggestions: string[] = [];

    if (!hasComments) {
      issues.push('缺少必要注释，建议在关键逻辑处添加注释');
      suggestions.push('为公共 API 和复杂逻辑添加 JSDoc 注释');
    }

    if (!hasFunctions && !hasClasses) {
      issues.push('未识别到函数或类定义，代码缺乏结构化组织');
      suggestions.push('考虑将代码按功能拆分为函数或类');
    }

    if (lineCount > 300) {
      issues.push(`文件过长（${lineCount} 行），建议拆分`);
      suggestions.push('将超过 300 行的文件按关注点拆分为多个模块');
    }

    const baseScore = hasFunctions || hasClasses ? 7 : 4;
    const score = Math.min(10, baseScore + (hasComments ? 1 : 0) + (lineCount < 100 ? 1 : 0));

    return {
      score,
      issues: issues.length > 0 ? issues : ['未发现明显问题'],
      suggestions: suggestions.length > 0 ? suggestions : ['保持当前代码组织方式'],
    };
  }

  /**
   * 建议重构方案
   *
   * 对传入的代码进行分析，给出重构建议方案。
   * 当前为**模拟模式**，返回通用占位结果。
   *
   * @param code - 要分析的代码字符串
   * @returns RefactorSuggestion 对象
   */
  suggestRefactor(code: string): RefactorSuggestion {
    const hasComplexLogic = code.includes('if') && code.includes('else');
    const hasAsync = code.includes('async') || code.includes('Promise');
    const hasLargeBlocks = code.split('\n').length > 100;

    const benefits: string[] = [
      '提升代码可读性和可维护性',
      '降低后续修改的出错概率',
    ];
    const risks: string[] = [
      '重构期间需确保测试覆盖',
      '可能引入回归问题',
    ];

    let target = '整体代码结构';
    let suggestion = '建议按职责拆分模块，提取公共逻辑为独立函数或工具类。';

    if (hasComplexLogic && hasLargeBlocks) {
      target = '条件逻辑块';
      suggestion = '建议使用策略模式或状态模式替代复杂的 if/else 链，并将大型函数拆分为多个专注的小函数。';
    }

    if (hasAsync) {
      suggestion += ' 对异步逻辑，建议统一错误处理模式，考虑使用 async/await 替代回调链。';
      benefits.push('统一的异步错误处理');
    }

    return {
      target,
      suggestion,
      benefits,
      risks,
    };
  }

  /**
   * 格式化代码输出
   *
   * 对输出内容进行格式化包装。当前为**模拟模式**，添加代码审查标记。
   *
   * @param output - 要格式化的输出文本
   * @returns 格式化后的完整输出
   */
  formatOutput(output: string): string {
    const header = '```\n=== Coder Agent 代码审查报告 ===\n```\n\n';
    const footer = '\n\n---\n*由 aimen CoderAgent 自动生成*';
    return header + output + footer;
  }

  /**
   * 实现 AimenAgent 的抽象 execute() 方法
   *
   * 对任务目标进行模拟代码分析，返回代码质量评估和重构建议组合结果。
   *
   * @param goal    - 任务目标（例如 "检查代码质量"、"建议重构方案"）
   * @param context - 上下文信息（可包含 code、path 等字段）
   * @returns 包含 codeAnalysis 和 refactorSuggestion 的结构化结果
   */
  async execute(goal: string, context: Record<string, unknown>): Promise<unknown> {
    this.setStatus(AgentStatus.Busy);

    const codeInput = (context.code as string) || '// 未提供代码\nfunction placeholder() { return true; }';
    const path = (context.path as string) || '(内联代码)';

    const analysis = this.analyzeCode(codeInput);
    const refactor = this.suggestRefactor(codeInput);
    const formatted = this.formatOutput(
      `目标: ${goal}\n路径: ${path}\n` +
      `质量评分: ${analysis.score}/10\n问题数: ${analysis.issues.length}\n` +
      `重构建议: ${refactor.suggestion}`,
    );

    this.setStatus(AgentStatus.Idle);

    return {
      status: 'completed',
      task: goal,
      codePath: path,
      codeAnalysis: analysis,
      refactorSuggestion: refactor,
      formattedOutput: formatted,
    };
  }
}