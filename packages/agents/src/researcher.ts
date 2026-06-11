/**
 * @aimen/agents — ResearcherAgent（研究代理）
 *
 * 继承 AimenAgent，专注于信息检索、研究分析和结果综合。
 * 提供 searchWeb()、synthesize() 两个工具，
 * 用于网络搜索和信息整合。
 *
 * @packageDocumentation
 * @module @aimen/agents/researcher
 */

import { AimenAgent, AgentStatus } from './aimen-agent.js';

// ---------------------------------------------------------------------------
// 工具结果类型
// ---------------------------------------------------------------------------

/**
 * 搜索结果
 *
 * 包含查询关键词、结果摘要列表、以及来源数量。
 */
export interface SearchResult {
  /** 原始查询关键词 */
  query: string;
  /** 搜索结果摘要列表 */
  results: string[];
  /** 搜索结果来源数量 */
  resultCount: number;
}

/**
 * 综合研究报告
 *
 * 包含报告标题、正文、关键发现和相关来源。
 */
export interface SynthesizedReport {
  /** 综合报告标题 */
  title: string;
  /** 报告正文（Markdown 格式） */
  body: string;
  /** 关键发现列表 */
  keyFindings: string[];
  /** 相关来源 */
  sources: string[];
}

// ---------------------------------------------------------------------------
// ResearcherAgent
// ---------------------------------------------------------------------------

/**
 * 研究代理
 *
 * 继承 AimenAgent，专注于网络信息检索与研究分析。
 * 通过 searchWeb() 模拟搜索，synthesize() 整合信息并生成报告。
 *
 * @remarks
 * - 当前为**模拟模式**，searchWeb() 返回预定义结果而非真实搜索
 * - execute() 返回搜索结果与综合报告的组合
 *
 * @example
 * ```ts
 * const researcher = new ResearcherAgent('res-1', '研究者', router);
 * const result = await researcher.execute('搜索最新的 TypeScript 最佳实践', {});
 * console.log(result);
 * ```
 */
export class ResearcherAgent extends AimenAgent {
  /**
   * @param agentId - 代理唯一标识
   * @param name    - 代理显示名称
   * @param router  - 可选的 ACP MessageRouter 引用
   */
  constructor(
    agentId: string,
    name: string = 'Researcher',
    router?: import('./aimen-agent.js').AimenAgent['router'],
  ) {
    super(agentId, name, 'researcher', ['web-search', 'research', 'synthesis'], router);
  }

  /**
   * 模拟网络搜索
   *
   * 根据查询关键词返回模拟搜索结果。当前为**模拟模式**，
   * 不进行真实网络请求，返回基于关键词生成的占位结果。
   *
   * @param query - 搜索查询关键词
   * @returns SearchResult 对象，包含模拟结果摘要
   */
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

  /**
   * 综合信息生成报告
   *
   * 将输入的信息文本进行综合整理，生成结构化的研究报告。
   * 当前为**模拟模式**，返回基于输入生成的占位报告。
   *
   * @param info - 要综合整理的原始信息文本
   * @returns SynthesizedReport 对象
   */
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
   * 模拟执行研究任务：先搜索关键词获取结果，再对结果进行综合整理。
   *
   * @param goal    - 任务目标（例如 "搜索最新技术趋势"）
   * @param context - 上下文信息（可包含 query、info 等字段）
   * @returns 包含 searchResult 和 synthesizedReport 的结构化结果
   */
  async execute(goal: string, context: Record<string, unknown>): Promise<unknown> {
    this.setStatus(AgentStatus.Busy);

    const query = (context.query as string) || goal;
    const info = (context.info as string) || `关于 "${goal}" 的研究资料汇总`;

    const searchResult = this.searchWeb(query);
    const report = this.synthesize(info);

    this.setStatus(AgentStatus.Idle);

    return {
      status: 'completed',
      task: goal,
      searchQuery: query,
      searchResult,
      synthesizedReport: report,
    };
  }
}