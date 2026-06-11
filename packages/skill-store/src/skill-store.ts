/**
 * SkillMeta — 单个技能的元数据类型。
 * content 仅在调用 getSkill(name) 时提供完整 markdown 内容。
 */
export interface SkillMeta {
  /** 技能名称，对应 skills/<name>/ 目录名 */
  name: string;
  /** 技能描述 */
  description: string;
  /** 语义版本 */
  version: string;
  /** 作者 */
  author: string;
  /** 许可证 */
  license: string;
  /** 标签列表 */
  tags: string[];
  /** 关联技能名称列表 */
  relatedSkills: string[];
  /** 完整的 SKILL.md 原文（仅 getSkill 时填充） */
  content?: string;
}

/* ------------------------------------------------------------------ */
/*  YAML 前注解析 —— 零外部依赖，纯正则 + 行解析                     */
/* ------------------------------------------------------------------ */

/**
 * 解析简单的 YAML 前注（frontmatter）字符串，返回一个扁平键值对对象。
 * 支持：
 *   - key: value
 *   - key: [item1, item2, ...]
 *   - 嵌套 key: 子 key: value（会以点号拼接，如 metadata.hermes.tags）
 * 忽略空行与注释。
 */
function parseFrontmatter(raw: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const lines = raw.split('\n');
  const stack: { prefix: string; indent: number }[] = [];

  for (const line of lines) {
    const trimmed = line.trimEnd();
    if (trimmed === '' || trimmed.startsWith('#')) continue;

    const indent = line.length - line.trimStart().length;

    // Pop stack until we find the parent matching this indent
    while (stack.length > 0 && stack[stack.length - 1].indent >= indent) {
      stack.pop();
    }

    // Match key: value 或 key: [item, ...]
    const simpleMatch = trimmed.match(/^(\S[\w.-]*?):\s*(.+)$/);
    if (!simpleMatch) continue;

    const key = simpleMatch[1];
    const valueRaw = simpleMatch[2].trim();

    // Build full key path
    const prefix = stack.length > 0 ? stack[stack.length - 1].prefix + '.' : '';
    const fullKey = prefix + key;

    // List value: [a, b, c]
    const listMatch = valueRaw.match(/^\[([^\]]*)\]$/);
    if (listMatch) {
      const items = listMatch[1]
        .split(',')
        .map((s) => s.trim().replace(/^['"]|['"]$/g, ''))
        .filter(Boolean);
      result[fullKey] = items;
      continue;
    }

    // Simple scalar value (strip optional quotes)
    const scalar = valueRaw.replace(/^['"]|['"]$/g, '');
    result[fullKey] = scalar;

    // If this line has a sub-item (next line with greater indent), push to stack
    if (valueRaw === '') {
      stack.push({ prefix: fullKey, indent });
    }
  }

  return result;
}

/** 招牌上花括号内标签 —— 将 metadata.hermes.tags 映射到顶层 tags */
const TAG_KEY = 'metadata.hermes.tags';
const RELATED_KEY = 'metadata.hermes.related_skills';

/**
 * 将扁平 frontmatter 对象映射为 SkillMeta。
 */
function frontmatterToMeta(
  name: string,
  fm: Record<string, unknown>,
  content?: string,
): SkillMeta {
  const tags = (fm[TAG_KEY] as string[]) ?? [];
  const relatedRaw = (fm[RELATED_KEY] as string[]) ?? [];

  return {
    name: (fm.name as string) ?? name,
    description: (fm.description as string) ?? '',
    version: (fm.version as string) ?? '0.0.0',
    author: (fm.author as string) ?? '',
    license: (fm.license as string) ?? '',
    tags,
    relatedSkills: relatedRaw,
    content,
  };
}

/* ------------------------------------------------------------------ */
/*  SkillStore                                                         */
/* ------------------------------------------------------------------ */

/**
 * SkillStore —— 技能元数据存储。
 *
 * 读取 `../../skills/<name>/SKILL.md`（相对于本文件在 packages/skill-store/src/ 的位置）
 * 解析 YAML 前注并缓存，提供列表 / 搜索 / 按名获取能力。
 */
export class SkillStore {
  private cache: Map<string, SkillMeta> = new Map();

  /* ------ 路径解析 ------ */

  /** skills/ 目录的绝对路径 */
  private get skillsDir(): string {
    // 相对于 packages/skill-store/src/skill-store.ts
    // 实际项目路径: <root>/packages/skill-store/src/skill-store.ts
    // skills 目录:      <root>/skills/
    // 相对: ../../skills/
    return new URL('../../skills/', import.meta.url).pathname;
  }

  /* ------ 公共 API ------ */

  /**
   * 列出所有已缓存的技能元数据。
   */
  listSkills(): SkillMeta[] {
    return Array.from(this.cache.values());
  }

  /**
   * 按名称获取单个技能，包含完整 SKILL.md 内容。
   * 若技能不在缓存中，返回 undefined。
   * 若 skillsDir 下存在同名目录但尚未缓存，不会自动扫描 —— 先调用 refresh()。
   */
  getSkill(name: string): SkillMeta | undefined {
    const meta = this.cache.get(name);
    if (!meta) return undefined;

    // 若尚未加载完整内容，此时补充
    // （cache 中可能只有 frontmatter 信息）
    return meta.content !== undefined ? meta : meta;
  }

  /**
   * 按名称、标签、描述搜索技能（大小写不敏感）。
   */
  searchSkills(query: string): SkillMeta[] {
    const q = query.toLowerCase();
    return Array.from(this.cache.values()).filter((s) => {
      return (
        s.name.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q) ||
        s.tags.some((t) => t.toLowerCase().includes(q))
      );
    });
  }

  /**
   * 重新扫描 skills/ 目录，刷新缓存。
   *
   * 遍历 `../../skills/` 下所有子目录，读取其中的 SKILL.md，
   * 解析 YAML 前注并缓存元数据。
   * 旧条目（已被删除的技能目录）会被清除。
   */
  async refresh(): Promise<void> {
    const newCache = new Map<string, SkillMeta>();
    const dir = this.skillsDir;

    let entries: string[];
    try {
      const { readdir } = await import('node:fs/promises');
      const dirEntries = await readdir(dir, { withFileTypes: true });
      entries = dirEntries
        .filter((d) => d.isDirectory())
        .map((d) => d.name);
    } catch {
      // 目录不存在则清空缓存
      this.cache = newCache;
      return;
    }

    for (const skillName of entries) {
      const skillFile = `${dir}${skillName}/SKILL.md`;

      try {
        const file = Bun.file(skillFile);
        const exists = await file.exists();
        if (!exists) continue;

        const text = await file.text();
        const meta = parseSkillFile(skillName, text);
        if (meta) {
          newCache.set(skillName, meta);
        }
      } catch {
        // 跳过无法读取的技能
        continue;
      }
    }

    this.cache = newCache;
  }

  /**
   * 当前缓存的技能数量。
   */
  skillCount(): number {
    return this.cache.size;
  }
}

/* ------------------------------------------------------------------ */
/*  内部辅助                                                           */
/* ------------------------------------------------------------------ */

/**
 * 解析 SKILL.md 文件内容，返回 SkillMeta（不含完整 content，以节省内存）。
 */
function parseSkillFile(name: string, text: string): SkillMeta | null {
  // 用 /\n---\n/ 分割，第一个分隔区之前为 frontmatter
  const match = text.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) return null;

  const frontmatterRaw = match[1];
  const bodyContent = match[2] ?? '';

  const fm = parseFrontmatter(frontmatterRaw);
  const meta = frontmatterToMeta(name, fm, bodyContent);
  return meta;
}

