/** SettingsController：系统管理（设置 / 主题 / YAML 配置 / 账号）。 */

import type { Context } from "hono";
import type { AppContext } from "../context";
import { fail, messageOfError, ok, statusOfError } from "./response";

export class SettingsController {
  constructor(private readonly ctx: AppContext) {}

  all = async (c: Context) => {
    return c.json(ok(this.ctx.settings.all()));
  };

  save = async (c: Context) => {
    const body = await c.req.json<Record<string, string>>();
    try {
      this.ctx.settings.save(body);
      return c.json(ok(this.ctx.settings.all(), "设置已保存"));
    } catch (error) {
      return c.json(fail(messageOfError(error), statusOfError(error)), statusOfError(error) as 400);
    }
  };

  testGithub = async (c: Context) => {
    return c.json(ok(await this.ctx.settings.testGitHub()));
  };

  testCos = async (c: Context) => {
    return c.json(ok(await this.ctx.settings.testCos()));
  };

  account = async (c: Context) => {
    return c.json(ok(this.ctx.settings.account()));
  };

  getConfig = async (c: Context) => {
    const kind = c.req.param("kind") === "theme" ? "theme" : "site";
    try {
      return c.json(ok(await this.ctx.documents.getConfig(kind)));
    } catch (error) {
      return c.json(fail(messageOfError(error), statusOfError(error)), statusOfError(error) as 400);
    }
  };

  saveConfig = async (c: Context) => {
    const kind = c.req.param("kind") === "theme" ? "theme" : "site";
    const body = await c.req.json<{ content?: string }>();
    if (typeof body.content !== "string") return c.json(fail("缺少 content", 422), 422);
    try {
      await this.ctx.documents.saveConfig(kind, body.content);
      return c.json(ok(null, "配置已保存"));
    } catch (error) {
      return c.json(fail(messageOfError(error), statusOfError(error)), statusOfError(error) as 400);
    }
  };
}
