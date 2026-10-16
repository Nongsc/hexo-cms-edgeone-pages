/** ConfigController：YAML 配置文件的快照草稿与发布。 */

import type { Context } from "hono";
import type { AppContext } from "../context";
import { fail, messageOfError, ok, statusOfError } from "./response";

export class ConfigController {
  constructor(private readonly ctx: AppContext) {}

  /** 配置文件列表。 */
  list = async (c: Context) => {
    try {
      const files = await this.ctx.config.listFiles();
      return c.json(ok(files));
    } catch (error) {
      return c.json(fail(messageOfError(error), statusOfError(error)), statusOfError(error) as 400);
    }
  };

  /** 读取配置内容（优先草稿）。 */
  read = async (c: Context) => {
    const path = c.req.param("path");
    if (!path) return c.json(fail("缺少配置路径", 422), 422);
    try {
      const result = await this.ctx.config.read(path);
      return c.json(ok(result));
    } catch (error) {
      return c.json(fail(messageOfError(error), statusOfError(error)), statusOfError(error) as 400);
    }
  };

  /** 保存快照草稿（不推送）。 */
  saveDraft = async (c: Context) => {
    const path = c.req.param("path");
    if (!path) return c.json(fail("缺少配置路径", 422), 422);
    const body = await c.req.json<{ content?: string }>();
    if (typeof body.content !== "string") {
      return c.json(fail("缺少 content 参数", 422), 422);
    }
    try {
      const snapshot = this.ctx.config.saveDraft(path, body.content);
      return c.json(ok(snapshot, "草稿已保存到数据库，尚未推送到 GitHub"));
    } catch (error) {
      return c.json(fail(messageOfError(error), statusOfError(error)), statusOfError(error) as 400);
    }
  };

  /** 发布：推送草稿到 GitHub。 */
  publish = async (c: Context) => {
    const path = c.req.param("path");
    if (!path) return c.json(fail("缺少配置路径", 422), 422);
    const body = await c.req.json<{ content?: string }>();
    if (typeof body.content !== "string") {
      return c.json(fail("缺少 content 参数", 422), 422);
    }
    try {
      await this.ctx.config.publish(path, body.content);
      return c.json(ok(null, `已发布 ${path} 到 GitHub`));
    } catch (error) {
      return c.json(fail(messageOfError(error), statusOfError(error)), statusOfError(error) as 400);
    }
  };

  /** 丢弃草稿。 */
  discard = async (c: Context) => {
    const path = c.req.param("path");
    if (!path) return c.json(fail("缺少配置路径", 422), 422);
    this.ctx.config.discard(path);
    return c.json(ok(null, "草稿已丢弃"));
  };

  /** 新建主题配置文件。 */
  create = async (c: Context) => {
    const body = await c.req.json<{ themeName?: string; content?: string }>();
    if (!body.themeName?.trim()) {
      return c.json(fail("缺少主题名", 422), 422);
    }
    try {
      const result = await this.ctx.config.createThemeConfig(body.themeName, body.content ?? "");
      return c.json(ok(result, `已新建配置草稿 ${result.path}（发布后才会写入仓库）`));
    } catch (error) {
      return c.json(fail(messageOfError(error), statusOfError(error)), statusOfError(error) as 400);
    }
  };

  /** 删除配置文件（全局 _config.yml 不允许删除）。 */
  remove = async (c: Context) => {
    const path = c.req.param("path");
    if (!path) return c.json(fail("缺少配置路径", 422), 422);
    try {
      await this.ctx.config.deleteConfig(path);
      return c.json(ok(null, `已删除 ${path}`));
    } catch (error) {
      return c.json(fail(messageOfError(error), statusOfError(error)), statusOfError(error) as 400);
    }
  };
}
