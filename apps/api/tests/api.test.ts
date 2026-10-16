import { describe, expect, it, beforeAll } from "vitest";
import { createApp } from "../src/router";
import { createContext } from "../src/context";

process.env.CMS_DB_PATH = ":memory:";
process.env.CMS_ADMIN_USERNAME = "admin";
process.env.CMS_ADMIN_PASSWORD = "admin123456";

let app: ReturnType<typeof createApp>;

async function api(path: string, init?: RequestInit) {
  const response = await app.request(`/api${path}`, init);
  const body = (await response.json()) as { code: number; message: string; data: unknown };
  return { status: response.status, body };
}

describe("API 集成测试", () => {
  let token = "";

  beforeAll(async () => {
    const ctx = await createContext();
    app = createApp(ctx);

    const login = await api("/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "admin", password: "admin123456" })
    });
    token = (login.body.data as { token: string }).token;
  });

  it("健康检查无需登录", async () => {
    const res = await api("/health");
    expect(res.status).toBe(200);
    expect(res.body.code).toBe(0);
  });

  it("错误密码返回 401", async () => {
    const res = await api("/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "admin", password: "wrong" })
    });
    expect(res.status).toBe(401);
  });

  it("未登录访问受保护接口返回 401", async () => {
    const res = await api("/dashboard/overview");
    expect(res.status).toBe(401);
    expect(res.body.code).toBe(401);
  });

  it("登录后可访问仪表盘", async () => {
    const res = await api("/dashboard/overview", {
      headers: { Authorization: `Bearer ${token}` }
    });
    expect(res.status).toBe(200);
    const data = res.body.data as { quick: { hexoVersion: string }; charts: { publishTrend: unknown[] } };
    expect(data.quick.hexoVersion).toBeTruthy();
    expect(data.charts.publishTrend).toHaveLength(6);
  });

  it("创建文章 → 列表 → 详情 → 更新 → 状态 → 删除", async () => {
    const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

    const created = await api("/documents/post", {
      method: "POST",
      headers,
      body: JSON.stringify({ title: "测试文章", content: "正文内容", tags: ["测试"] })
    });
    expect(created.status).toBe(201);
    const id = (created.body.data as { id: number }).id;
    expect(id).toBeGreaterThan(0);

    const list = await api("/documents/post?pageSize=10", { headers });
    const listData = list.body.data as { total: number; list: Array<{ title: string }> };
    expect(listData.total).toBe(1);
    expect(listData.list[0].title).toBe("测试文章");

    const detail = await api(`/documents/detail/${id}`, { headers });
    expect((detail.body.data as { title: string }).title).toBe("测试文章");

    const updated = await api(`/documents/detail/${id}`, {
      method: "PUT",
      headers,
      body: JSON.stringify({ title: "新标题" })
    });
    expect((updated.body.data as { title: string }).title).toBe("新标题");

    const published = await api(`/documents/detail/${id}/status`, {
      method: "POST",
      headers,
      body: JSON.stringify({ status: "published" })
    });
    expect((published.body.data as { status: string }).status).toBe("published");

    const trashed = await api(`/documents/detail/${id}`, { method: "DELETE", headers });
    expect(trashed.body.code).toBe(0);

    const recycle = await api("/recycle", { headers });
    expect((recycle.body.data as { total: number }).total).toBe(1);

    await api(`/recycle/${id}/restore`, { method: "POST", headers });
    const restored = await api(`/documents/detail/${id}`, { headers });
    expect((restored.body.data as { deletedAt: string | null }).deletedAt).toBeNull();

    await api(`/documents/detail/${id}`, { method: "DELETE", headers });
    await api(`/recycle/${id}`, { method: "DELETE", headers });
    const empty = await api("/recycle", { headers });
    expect((empty.body.data as { total: number }).total).toBe(0);
  });

  it("文章分类与标签字典", async () => {
    const res = await api("/documents/post/taxonomy", {
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = res.body.data as { tags: string[]; categories: string[] };
    expect(Array.isArray(data.tags)).toBe(true);
    expect(Array.isArray(data.categories)).toBe(true);
  });

  it("设置读写与掩码", async () => {
    const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
    await api("/settings", {
      method: "POST",
      headers,
      body: JSON.stringify({ "site.title": "我的博客", "cos.secretKey": "abcdefghijklmn" })
    });
    const res = await api("/settings", { headers });
    const data = res.body.data as Record<string, string>;
    expect(data["site.title"]).toBe("我的博客");
    expect(data["cos.secretKey"]).not.toBe("abcdefghijklmn");
    expect(data["cos.secretKey"]).toContain("****");
  });

  it("未知接口返回 404", async () => {
    const res = await api("/not-exist", { headers: { Authorization: `Bearer ${token}` } });
    expect(res.status).toBe(404);
  });
});
