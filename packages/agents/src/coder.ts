/**
 * @aimen/agents — CoderAgent（编码代理）
 *
 * 继承 AimenAgent，专注于代码分析、重构建议和代码生成。
 * - LLM 可用时：调用真实 LLM 进行代码评审和分析
 * - LLM 不可用时：降级为模拟数据
 *
 * @packageDocumentation
 * @module @aimen/agents/coder
 */

import { AimenAgent, AgentStatus } from './aimen-agent.js';

// ---------------------------------------------------------------------------
// 工具结果类型
// ---------------------------------------------------------------------------

export interface CodeAnalysis {
  score: number;
  issues: string[];
  suggestions: string[];
}

export interface RefactorSuggestion {
  target: string;
  suggestion: string;
  benefits: string[];
  risks: string[];
}

// ---------------------------------------------------------------------------
// CoderAgent
// ---------------------------------------------------------------------------

export class CoderAgent extends AimenAgent {
  constructor(
    agentId: string,
    name: string = 'Coder',
    router?: import('./aimen-agent.js').AimenAgent['router'],
  ) {
    super(agentId, name, 'coder', ['code-analysis', 'refactoring', 'code-generation'], router);
  }

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

    return { target, suggestion, benefits, risks };
  }

  formatOutput(output: string): string {
    const header = '```\n=== Coder Agent 代码审查报告 ===\n```\n\n';
    const footer = '\n\n---\n*由 aimen CoderAgent 自动生成*';
    return header + output + footer;
  }

  /**
   * 实现 AimenAgent 的抽象 execute() 方法
   *
   * LLM 可用时调用真实 LLM 进行代码评审。
   * 无 LLM 配置或失败时降级为模拟分析。
   */
  async execute(goal: string, context: Record<string, unknown>): Promise<unknown> {
    this.setStatus(AgentStatus.Busy);

    const codeInput = (context.code as string) || '// 未提供代码\nfunction placeholder() { return true; }';
    const path = (context.path as string) || '(内联代码)';

    // LLM 模式
    if (this.llmAvailable) {
      try {
        const systemPrompt = `你是一位资深代码评审专家。请对以下代码进行评审，分析其质量、潜在问题和改进建议。

返回格式为 JSON：
{
  "score": 7,
  "issues": ["问题1", "问题2"],
  "suggestions": ["建议1", "建议2"],
  "refactorTarget": "需要重构的目标",
  "refactorSuggestion": "重构方案描述"
}`;

        const userPrompt = `任务目标：${goal}

文件路径：${path}

代码内容：
\`\`\`
${codeInput.slice(0, 4000)}
\`\`\``;

        const content = await this.callLLM(systemPrompt, userPrompt);

        let parsed: {
          score?: number; issues?: string[]; suggestions?: string[];
          refactorTarget?: string; refactorSuggestion?: string;
        };
        try {
          parsed = JSON.parse(content);
        } catch {
          parsed = { issues: [content], suggestions: [] };
        }

        this.setStatus(AgentStatus.Idle);

        return {
          status: 'completed',
          task: goal,
          source: 'llm',
          codePath: path,
          codeAnalysis: {
            score: typeof parsed.score === 'number' ? parsed.score : 5,
            issues: parsed.issues ?? [],
            suggestions: parsed.suggestions ?? [],
          },
          refactorSuggestion: {
            target: parsed.refactorTarget ?? '代码整体',
            suggestion: parsed.refactorSuggestion ?? '参考上述分析进行调整',
            benefits: ['提升代码质量'],
            risks: ['需验证改动后的正确性'],
          },
        };
      } catch (err) {
        console.warn(`[CoderAgent] LLM 调用失败，降级为模拟模式:`, err);
      }
    }

    // 模拟模式
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
      source: 'simulation',
      codePath: path,
      codeAnalysis: analysis,
      refactorSuggestion: refactor,
      formattedOutput: formatted,
    };
  }
}