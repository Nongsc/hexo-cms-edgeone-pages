/** AuthController：登录、登出、当前用户。 */

import type { Context } from "hono";
import type { AppContext } from "../context";
import { fail, ok } from "./response";
import type { Session } from "@hexo-pro/core";

export class AuthController {
  constructor(private readonly ctx: AppContext) {}

  login = async (c: Context) => {
    const body = await c.req.json<{ username?: string; password?: string }>();
    if (!body.username || !body.password) {
      return c.json(fail("用户名与密码不能为空", 422), 422);
    }
    try {
      const session = this.ctx.auth.login(body.username, body.password);
      return c.json(
        ok({
          token: session.token,
          username: session.username,
          displayName: session.displayName,
          expiresAt: session.expiresAt
        })
      );
    } catch (error) {
      return c.json(fail((error as Error).message, 401), 401);
    }
  };

  logout = async (c: Context) => {
    const token = c.req.header("authorization")?.replace(/^Bearer\s+/i, "");
    if (token) this.ctx.auth.logout(token);
    return c.json(ok(null));
  };

  me = async (c: Context) => {
    const session = c.get("session") as Session | undefined;
    if (!session) return c.json(fail("未登录", 401), 401);
    return c.json(ok({ username: session.username, displayName: session.displayName }));
  };

  changePassword = async (c: Context) => {
    const body = await c.req.json<{ currentPassword?: string; newPassword?: string }>();
    if (!body.currentPassword || !body.newPassword) {
      return c.json(fail("参数不完整", 422), 422);
    }
    try {
      this.ctx.settings.changePassword(body.currentPassword, body.newPassword);
      return c.json(ok(null, "密码已修改"));
    } catch (error) {
      return c.json(fail((error as Error).message, 422), 422);
    }
  };
}
