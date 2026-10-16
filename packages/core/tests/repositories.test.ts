import { describe, expect, it, beforeEach } from "vitest";
import {
  ensureDatabase,
  resetDatabaseForTesting,
  DocumentRepository,
  TodoRepository,
  SettingRepository
} from "../src";
import type { AppDatabase } from "../src/db/sqlite";

/**
 * Repository 测试使用独立的内存库：
 * 通过 CMS_DB_PATH=:memory: 让每个测试拿到干净的数据。
 *
 * 注意：resetDatabaseForTesting() 会关闭并清空单例，因此每个测试都要
 * 重新 ensureDatabase() 并刷新 db 引用，否则会命中已关闭的实例。
 */
let db: AppDatabase;

beforeEach(async () => {
  process.env.CMS_DB_PATH = ":memory:";
  resetDatabaseForTesting();
  db = await ensureDatabase();
});

describe("DocumentRepository", () => {
  const seed = (database: AppDatabase) => {
    const repo = new DocumentRepository(database);
    repo.insert({
      kind: "post",
      title: "第一篇文章",
      slug: "first-post",
      path: "source/_posts/first-post.md",
      status: "published",
      content: "正文",
      frontMatter: '{"title":"第一篇文章"}',
      summary: "摘要",
      cover: "",
      sticky: 0,
      tags: '["vue","ts"]',
      categories: '["前端"]',
      repoPath: "source/_posts/first-post.md",
      publishedAt: "2024-01-01 00:00:00",
      deletedAt: null
    });
    repo.insert({
      kind: "post",
      title: "草稿",
      slug: "draft-post",
      path: "source/_drafts/draft-post.md",
      status: "draft",
      content: "草稿正文",
      frontMatter: "{}",
      summary: "",
      cover: "",
      sticky: 1,
      tags: '["vue"]',
      categories: "[]",
      repoPath: "source/_drafts/draft-post.md",
      publishedAt: null,
      deletedAt: null
    });
    return repo;
  };

  it("建表并插入文档", () => {
    const repo = seed(db);
    const doc = repo.findByPath("source/_posts/first-post.md");
    expect(doc).not.toBeNull();
    expect(doc?.title).toBe("第一篇文章");
    expect(doc?.tags).toEqual(["vue", "ts"]);
    expect(doc?.sticky).toBe(false);
  });

  it("分页列表排除已删除并按置顶排序", () => {
    const repo = seed(db);
    const page = repo.list({ kind: "post", pageSize: 10 });
    expect(page.total).toBe(2);
    // 置顶草稿排在最前
    expect(page.list[0].title).toBe("草稿");
  });

  it("按状态过滤", () => {
    const repo = seed(db);
    const published = repo.list({ kind: "post", status: "published" });
    expect(published.total).toBe(1);
    expect(published.list[0].title).toBe("第一篇文章");
  });

  it("关键词搜索命中标题与正文", () => {
    const repo = seed(db);
    expect(repo.list({ kind: "post", keyword: "第一篇" }).total).toBe(1);
    expect(repo.list({ kind: "post", keyword: "草稿正文" }).total).toBe(1);
    expect(repo.list({ kind: "post", keyword: "不存在" }).total).toBe(0);
  });

  it("按标签过滤", () => {
    const repo = seed(db);
    expect(repo.list({ kind: "post", tag: "vue" }).total).toBe(2);
    expect(repo.list({ kind: "post", tag: "ts" }).total).toBe(1);
  });

  it("统计文章与草稿数量", () => {
    const repo = seed(db);
    const stats = repo.stats();
    expect(stats.totalPosts).toBe(2);
    expect(stats.drafts).toBe(1);
  });

  it("软删除后进入回收站，恢复后回到列表", () => {
    const repo = seed(db);
    const target = repo.findByPath("source/_posts/first-post.md");
    if (!target) throw new Error("missing");
    repo.update(target.id, { deletedAt: new Date().toISOString() });
    expect(repo.list({ kind: "post" }).total).toBe(1);
    expect(repo.trashed("post").total).toBe(1);
    repo.update(target.id, { deletedAt: null });
    expect(repo.list({ kind: "post" }).total).toBe(2);
  });

  it("发布趋势返回 6 个月数据", () => {
    const repo = seed(db);
    expect(repo.publishTrend(6)).toHaveLength(6);
  });

  it("分类与标签聚合", () => {
    const repo = seed(db);
    expect(repo.categoryDistribution()).toEqual([{ name: "前端", count: 1 }]);
    expect(repo.tagWeights()).toEqual([
      { name: "vue", weight: 2 },
      { name: "ts", weight: 1 }
    ]);
  });
});

describe("TodoRepository", () => {
  it("增改查删", () => {
    const repo = new TodoRepository(db);
    const todo = repo.create("写文章");
    expect(repo.list()).toHaveLength(1);
    const done = repo.update(todo.id, { done: true });
    expect(done.done).toBe(true);
    expect(repo.list()[0].done).toBe(true);
    repo.remove(todo.id);
    expect(repo.list()).toHaveLength(0);
  });
});

describe("SettingRepository", () => {
  it("写入、读取、更新", () => {
    const repo = new SettingRepository(db);
    repo.set("site.title", "博客", "general");
    expect(repo.get("site.title")).toBe("博客");
    repo.set("site.title", "新博客", "general");
    expect(repo.get("site.title")).toBe("新博客");
    expect(repo.byGroup("general")).toEqual({ "site.title": "新博客" });
  });
});
