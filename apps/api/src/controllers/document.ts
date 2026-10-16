/** DocumentController：文章与页面的增删改查、回收站。 */

import type { Context } from "hono";
import type { AppContext } from "../context";
import type { DocumentKind, DocumentStatus } from "@hexo-pro/core";
import { fail, messageOfError, ok, statusOfError } from "./response";

export class DocumentController {
  constructor(private readonly ctx: AppContext) {}

  list = async (c: Context) => {
    const kind = c.req.param("kind") as DocumentKind;
    const query = c.req.query();
    const page = Number(query.page ?? 1);
    const pageSize = Number(query.pageSize ?? 10);

    const data = this.ctx.documents.list(kind, {
      page: Number.isFinite(page) ? page : 1,
      pageSize: Number.isFinite(pageSize) ? pageSize : 10,
      keyword: query.keyword,
      status: (query.status as DocumentStatus | "all") ?? "all",
      tag: query.tag,
      category: query.category,
      sortBy: (query.sortBy as "updatedAt" | "publishedAt" | "title") ?? "updatedAt",
      sortOrder: (query.sortOrder as "asc" | "desc") ?? "desc"
    });
    return c.json(ok(data));
  };

  detail = async (c: Context) => {
    const id = Number(c.req.param("id"));
    if (!Number.isFinite(id)) return c.json(fail("非法 ID", 422), 422);
    try {
      return c.json(ok(this.ctx.documents.get(id)));
    } catch (error) {
      return c.json(fail(messageOfError(error), statusOfError(error)), statusOfError(error) as 400);
    }
  };

  create = async (c: Context) => {
    const kind = c.req.param("kind") as DocumentKind;
    const body = await c.req.json<Parameters<typeof this.ctx.documents.create>[1]>();
    try {
      const document = await this.ctx.documents.create(kind, body);
      return c.json(ok(document, "创建成功"), 201);
    } catch (error) {
      return c.json(fail(messageOfError(error), statusOfError(error)), statusOfError(error) as 400);
    }
  };

  update = async (c: Context) => {
    const id = Number(c.req.param("id"));
    if (!Number.isFinite(id)) return c.json(fail("非法 ID", 422), 422);
    const body = await c.req.json<Parameters<typeof this.ctx.documents.update>[1]>();
    try {
      const document = await this.ctx.documents.update(id, body);
      return c.json(ok(document, "保存成功"));
    } catch (error) {
      return c.json(fail(messageOfError(error), statusOfError(error)), statusOfError(error) as 400);
    }
  };

  setStatus = async (c: Context) => {
    const id = Number(c.req.param("id"));
    const body = await c.req.json<{ status: DocumentStatus }>();
    if (!body.status) return c.json(fail("缺少 status 参数", 422), 422);
    try {
      const document = await this.ctx.documents.setStatus(id, body.status);
      return c.json(ok(document, body.status === "published" ? "已发布" : "已转为草稿"));
    } catch (error) {
      return c.json(fail(messageOfError(error), statusOfError(error)), statusOfError(error) as 400);
    }
  };

  trash = async (c: Context) => {
    const id = Number(c.req.param("id"));
    try {
      await this.ctx.documents.trash(id);
      return c.json(ok(null, "已移入回收站"));
    } catch (error) {
      return c.json(fail(messageOfError(error), statusOfError(error)), statusOfError(error) as 400);
    }
  };

  trashedList = async (c: Context) => {
    const kind = c.req.query("kind") as DocumentKind | undefined;
    return c.json(ok(this.ctx.documents.trashed(kind)));
  };

  restore = async (c: Context) => {
    const id = Number(c.req.param("id"));
    try {
      await this.ctx.documents.restore(id);
      return c.json(ok(null, "已恢复"));
    } catch (error) {
      return c.json(fail(messageOfError(error), statusOfError(error)), statusOfError(error) as 400);
    }
  };

  destroy = async (c: Context) => {
    const id = Number(c.req.param("id"));
    try {
      await this.ctx.documents.destroy(id);
      return c.json(ok(null, "已彻底删除"));
    } catch (error) {
      return c.json(fail(messageOfError(error), statusOfError(error)), statusOfError(error) as 400);
    }
  };

  taxonomy = async (c: Context) => {
    return c.json(ok(this.ctx.documents.taxonomy()));
  };

  sync = async (c: Context) => {
    try {
      const result = await this.ctx.documents.syncFromGitHub();
      const message =
        `同步完成：新增 ${result.imported}，更新 ${result.updated}` +
        (result.downgraded > 0 ? `，${result.downgraded} 篇已发布内容在仓库中不存在，已改回草稿` : "");
      return c.json(ok(result, message));
    } catch (error) {
      return c.json(fail(messageOfError(error), statusOfError(error)), statusOfError(error) as 400);
    }
  };
}
