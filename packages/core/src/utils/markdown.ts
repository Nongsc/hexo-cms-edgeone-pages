/** Markdown / Front-Matter 序列化工具。 */

import matter from "gray-matter";
import yaml from "js-yaml";

export interface ParsedDocument {
  data: Record<string, unknown>;
  content: string;
}

/** 解析带 front-matter 的 Markdown 文本。 */
export function parseMarkdown(raw: string): ParsedDocument {
  const parsed = matter(raw);
  return {
    data: (parsed.data ?? {}) as Record<string, unknown>,
    content: parsed.content ?? ""
  };
}

export interface SerializeOptions {
  /** 覆盖写入时的日期字段；不传则保留原值或使用当前时间。 */
  date?: string;
  updated?: string;
}

/** 把 front-matter 对象与正文合成为 Markdown 文本。 */
export function serializeMarkdown(data: Record<string, unknown>, content: string): string {
  const cleaned = cleanFrontMatter(data);
  if (Object.keys(cleaned).length === 0) {
    return content.startsWith("\n") ? content : `\n${content}`;
  }
  const yamlText = yaml.dump(cleaned, {
    indent: 2,
    lineWidth: -1,
    noRefs: true,
    quotingType: '"',
    forceQuotes: false
  });
  return `---\n${yamlText}---\n\n${content.replace(/^\n+/, "")}`;
}

/** 去掉空值与空数组，保持 Hexo 配置整洁。 */
export function cleanFrontMatter(data: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined || value === null) continue;
    if (typeof value === "string" && value.trim() === "") continue;
    if (Array.isArray(value) && value.length === 0) continue;
    result[key] = value;
  }
  return result;
}

/** 从 front-matter 中提取分类与标签（Hexo 允许字符串或数组）。 */
export function normalizeList(value: unknown): string[] {
  if (value === undefined || value === null) return [];
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }
  if (typeof value === "string") {
    return value
      .split(/[,，]/)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [String(value)];
}

/** 生成 Hexo 合法的文件名：标题转拼音以外的安全 ASCII 串。 */
export function slugify(title: string): string {
  return (
    title
      .trim()
      .toLowerCase()
      .replace(/[\s_]+/g, "-")
      .replace(/[^\w\u4e00-\u9fa5-]/g, "")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "") || `untitled-${Date.now()}`
  );
}

/** 估算阅读时长（按中文 300 字/分钟、英文 200 词/分钟粗略估算）。 */
export function estimateReadingMinutes(content: string): number {
  const cjk = (content.match(/[\u4e00-\u9fa5]/g) ?? []).length;
  const words = (content.replace(/[\u4e00-\u9fa5]/g, " ").match(/\b\w+\b/g) ?? []).length;
  return Math.max(1, Math.round(cjk / 300 + words / 200));
}

/** 取正文前 N 个字符作为摘要。 */
export function extractSummary(content: string, maxLength = 120): string {
  const plain = content
    .replace(/```[\s\S]*?```/g, "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[#>*`~_-]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return plain.length > maxLength ? `${plain.slice(0, maxLength)}…` : plain;
}
