import { describe, expect, it, beforeEach } from "vitest";
import {
  cleanFrontMatter,
  estimateReadingMinutes,
  extractSummary,
  normalizeList,
  parseMarkdown,
  serializeMarkdown,
  slugify
} from "../src/utils/markdown";

describe("markdown 工具", () => {
  it("解析 front-matter 与正文", () => {
    const raw = `---\ntitle: 测试\ntags:\n  - a\n  - b\n---\n\n# 标题\n\n正文`;
    const parsed = parseMarkdown(raw);
    expect(parsed.data.title).toBe("测试");
    expect(parsed.data.tags).toEqual(["a", "b"]);
    expect(parsed.content).toContain("# 标题");
  });

  it("序列化时保留字段并清理空值", () => {
    const output = serializeMarkdown(
      { title: "文章", tags: ["x"], categories: [], cover: "" },
      "正文内容"
    );
    expect(output).toContain("title: 文章");
    expect(output).toContain("tags:");
    expect(output).not.toContain("categories");
    expect(output).not.toContain("cover");
    expect(output.endsWith("正文内容")).toBe(true);
  });

  it("序列化结果可被再次解析（往返一致）", () => {
    const data = { title: "往返", tags: ["t1", "t2"], date: "2024-01-01 10:00:00" };
    const content = "一些正文";
    const raw = serializeMarkdown(data, content);
    const parsed = parseMarkdown(raw);
    expect(parsed.data.title).toBe("往返");
    expect(parsed.data.tags).toEqual(["t1", "t2"]);
    expect(parsed.content.trim()).toBe(content);
  });

  it("normalizeList 支持字符串与数组", () => {
    expect(normalizeList("a, b，c")).toEqual(["a", "b", "c"]);
    expect(normalizeList(["a", " b "])).toEqual(["a", "b"]);
    expect(normalizeList(undefined)).toEqual([]);
  });

  it("cleanFrontMatter 去掉空值", () => {
    expect(cleanFrontMatter({ a: "", b: null, c: [], d: 0, e: false, f: "x" })).toEqual({
      d: 0,
      e: false,
      f: "x"
    });
  });

  it("slugify 生成安全文件名", () => {
    expect(slugify("Hello World")).toBe("hello-world");
    expect(slugify("  Multiple   Spaces  ")).toBe("multiple-spaces");
    expect(slugify("")).toMatch(/^untitled-/);
  });

  it("extractSummary 去除 Markdown 标记", () => {
    const summary = extractSummary("## 标题\n\n**粗体** 与 [链接](https://a.com)");
    expect(summary).toBe("标题 粗体 与 链接");
  });

  it("estimateReadingMinutes 至少为 1", () => {
    expect(estimateReadingMinutes("短")).toBe(1);
  });
});
