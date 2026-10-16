/** DashboardController：主页四层布局数据 + 待办事项。 */

import type { Context } from "hono";
import type { AppContext } from "../context";
import { fail, messageOfError, ok, statusOfError } from "./response";

export class DashboardController {
  constructor(private readonly ctx: AppContext) {}

  overview = async (c: Context) => {
    try {
      const data = await this.ctx.dashboard.load();
      return c.json(ok(data));
    } catch (error) {
      return c.json(fail(messageOfError(error), statusOfError(error)), statusOfError(error) as 400);
    }
  };

  listTodos = async (c: Context) => {
    return c.json(ok(this.ctx.services.todos.list()));
  };

  createTodo = async (c: Context) => {
    const body = await c.req.json<{ title?: string }>();
    if (!body.title?.trim()) return c.json(fail("待办标题不能为空", 422), 422);
    return c.json(ok(this.ctx.services.todos.create(body.title.trim()), "已添加"), 201);
  };

  updateTodo = async (c: Context) => {
    const id = Number(c.req.param("id"));
    const body = await c.req.json<{ title?: string; done?: boolean }>();
    try {
      return c.json(ok(this.ctx.services.todos.update(id, body), "已更新"));
    } catch (error) {
      return c.json(fail(messageOfError(error), statusOfError(error)), statusOfError(error) as 400);
    }
  };

  deleteTodo = async (c: Context) => {
    const id = Number(c.req.param("id"));
    this.ctx.services.todos.remove(id);
    return c.json(ok(null, "已删除"));
  };
}
