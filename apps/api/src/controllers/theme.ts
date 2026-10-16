/** ThemeController：主题列表、安装、启用。 */

import type { Context } from "hono";
import type { AppContext } from "../context";
import type { ThemeInstallInput } from "@hexo-pro/core";
import { fail, messageOfError, ok, statusOfError } from "./response";

export class ThemeController {
  constructor(private readonly ctx: AppContext) {}

  list = async (c: Context) => {
    try {
      return c.json(ok(await this.ctx.theme.list()));
    } catch (error) {
      return c.json(fail(messageOfError(error), statusOfError(error)), statusOfError(error) as 400);
    }
  };

  /** 已安装的 Hexo 插件列表。 */
  listPlugins = async (c: Context) => {
    try {
      return c.json(ok(await this.ctx.theme.listPlugins()));
    } catch (error) {
      return c.json(fail(messageOfError(error), statusOfError(error)), statusOfError(error) as 400);
    }
  };

  /** 触发安装工作流。 */
  install = async (c: Context) => {
    const body = await c.req.json<ThemeInstallInput>();
    try {
      const result = await this.ctx.theme.install(body);
      return c.json(ok(result, result.message));
    } catch (error) {
      return c.json(fail(messageOfError(error), statusOfError(error)), statusOfError(error) as 400);
    }
  };

  /** 卸载主题。 */
  uninstall = async (c: Context) => {
    const body = await c.req.json<{ name?: string; source?: "themes" | "npm" }>();
    if (!body.name) return c.json(fail("缺少主题名称", 422), 422);
    const source = body.source === "npm" ? "npm" : "themes";
    try {
      const result = await this.ctx.theme.uninstall(body.name, source);
      return c.json(ok(result, result.message));
    } catch (error) {
      return c.json(fail(messageOfError(error), statusOfError(error)), statusOfError(error) as 400);
    }
  };

  /** 启用主题。 */
  enable = async (c: Context) => {
    const body = await c.req.json<{ name?: string }>();
    if (!body.name) return c.json(fail("缺少主题名称", 422), 422);
    try {
      await this.ctx.theme.enable(body.name);
      return c.json(ok(null, `已启用主题 ${body.name}，并更新 _config.yml`));
    } catch (error) {
      return c.json(fail(messageOfError(error), statusOfError(error)), statusOfError(error) as 400);
    }
  };

  /** 停用当前主题（切回默认 landscape）。 */
  disable = async (c: Context) => {
    try {
      const name = await this.ctx.theme.disable();
      return c.json(ok(null, `已停用，切换回默认主题 ${name}，并更新 _config.yml`));
    } catch (error) {
      return c.json(fail(messageOfError(error), statusOfError(error)), statusOfError(error) as 400);
    }
  };
}
