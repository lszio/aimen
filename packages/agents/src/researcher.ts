/**
 * @aimen/agents — ResearcherAgent（研究代理）
 *
 * 继承 AimenAgent，专注于信息检索、研究分析和结果综合。
 * - LLM 可用时：调用真实 LLM 进行研究和综合
 * - LLM 不可用时：降级为模拟数据
 *
 * @packageDocumentation
 * @module @aimen/agents/researcher
 */

import { AimenAgent, AgentStatus } from './aimen-agent.js';

// ---------------------------------------------------------------------------
// 工具结果类型
// ---------------------------------------------------------------------------

export interface SearchResult {
  query: string;
  results: string[];
  resultCount: number;
}

export interface SynthesizedReport {
  title: string;
  body: string;
  keyFindings: string[];
  sources: string[];
}

// ---------------------------------------------------------------------------
// ResearcherAgent
// ---------------------------------------------------------------------------

export class ResearcherAgent extends AimenAgent {
  constructor(
    agentId: string,
    name: string = 'Researcher',
    router?: import('./aimen-agent.js').AimenAgent['router'],
  ) {
    super(agentId, name, 'researcher', ['web-search', 'research', 'synthesis'], router);
  }

  searchWeb(query: string): SearchResult {
    const simulatedResults = [
      `[${query}] 相关资源一：深入理解 "${query}" 的核心概念与应用场景`,
      `[${query}] 相关资源二：${query} 的最佳实践与常见陷阱分析`,
      `[${query}] 相关资源三：社区最新讨论与 ${query} 的发展趋势`,
      `[${query}] 相关资源四：${query} 在大型项目中的实际应用案例`,
    ];

    return {
      query,
      results: simulatedResults,
      resultCount: simulatedResults.length,
    };
  }

  synthesize(info: string): SynthesizedReport {
    const excerpt = info.length > 80 ? info.slice(0, 80) + '...' : info;

    return {
      title: '研究综合报告',
      body: `## 摘要\n\n基于对以下信息的综合分析：\n\n> ${excerpt}\n\n## 分析结论\n\n经过多源信息交叉验证，形成了以下综合认识：\n\n1. **趋势分析**：当前研究主题处于快速发展阶段\n2. **关键差异**：不同来源在实现路径上存在差异，但核心目标一致\n3. **最佳实践**：社区共识逐渐形成，推荐采纳已验证的方案\n\n## 建议\n\n- 关注核心规范的演进方向\n- 在具体实施时参考多个成熟案例`,
      keyFindings: [
        '核心概念在不同文献中表述一致',
        '存在多种实现路径，需根据场景选择',
        '社区正在形成标准化共识',
      ],
      sources: [
        '来源 1：技术文档与官方指南',
        '来源 2：社区讨论与案例分析',
        '来源 3：学术研究与行业报告',
      ],
    };
  }

  /**
   * 实现 AimenAgent 的抽象 execute() 方法
   *
   * LLM 可用时调用真实 LLM 进行研究分析和综合。
   * 无 LLM 配置或失败时降级为模拟数据。
   */
  async execute(goal: string, context: Record<string, unknown>): Promise<unknown> {
    this.setStatus(AgentStatus.Busy);

    const query = (context.query as string) || goal;
    const info = (context.info as string) || `关于 "${goal}" 的研究资料汇总`;

    // LLM 模式
    if (this.llmAvailable) {
      try {
        const systemPrompt = `你是一位资深研究分析师。请根据用户提供的研究目标，输出结构化的研究报告。

返回格式为 JSON：
{
  "keyFindings": ["发现1", "发现2", "发现3"],
  "analysis": "详细分析正文（Markdown 格式）",
  "sources": ["来源1", "来源2"],
  "conclusion": "结论"
}`;

        const userPrompt = `研究目标：${goal}

研究查询词：${query}

附加上下文：
${JSON.stringify(context, null, 2)}

已有资料：
${info}`;

        const content = await this.callLLM(systemPrompt, userPrompt);

        let parsed: {
          keyFindings?: string[]; analysis?: string; sources?: string[]; conclusion?: string;
        };
        try {
          parsed = JSON.parse(content);
        } catch {
          parsed = { keyFindings: [content], analysis: content, sources: [] };
        }

        this.setStatus(AgentStatus.Idle);

        return {
          status: 'completed',
          task: goal,
          source: 'llm',
          searchQuery: query,
          llmResult: {
            keyFindings: parsed.keyFindings ?? [],
            analysis: parsed.analysis ?? '',
            sources: parsed.sources ?? [],
            conclusion: parsed.conclusion ?? '',
          },
        };
      } catch (err) {
        console.warn(`[ResearcherAgent] LLM 调用失败，降级为模拟模式:`, err);
      }
    }

    // 模拟模式
    const searchResult = this.searchWeb(query);
    const report = this.synthesize(info);

    this.setStatus(AgentStatus.Idle);

    return {
      status: 'completed',
      task: goal,
      source: 'simulation',
      searchQuery: query,
      searchResult,
      synthesizedReport: report,
    };
  }
}