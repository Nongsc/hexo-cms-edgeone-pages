/**
 * 路由装配：REST 风格 API。
 *
 * 所有接口统一挂在 `/api` 前缀下：本地开发直接访问，
 * 生产环境由 EdgeOne Pages 把 `/api/*` 请求交给 Edge Functions 处理。
 */

import { Hono } from "hono";
import { cors } from "hono/cors";
import type { AppContext } from "./context";
import { AuthController } from "./controllers/auth";
import { ConfigController } from "./controllers/config";
import { DashboardController } from "./controllers/dashboard";
import { DocumentController } from "./controllers/document";
import { ImageController } from "./controllers/image";
import { SettingsController } from "./controllers/settings";
import { ThemeController } from "./controllers/theme";
import type { Session } from "@hexo-pro/core";

declare module "hono" {
  interface ContextVariableMap {
    session: Session;
  }
}

export function createApp(ctx: AppContext): Hono {
  const api = new Hono().basePath("/api");

  api.use(
    "*",
    cors({
      origin: "*",
      allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowHeaders: ["Content-Type", "Authorization"]
    })
  );

  const auth = new AuthController(ctx);
  const dashboard = new DashboardController(ctx);
  const documents = new DocumentController(ctx);
  const images = new ImageController(ctx);
  const settings = new SettingsController(ctx);
  const config = new ConfigController(ctx);
  const theme = new ThemeController(ctx);

  // ---- 健康检查（无需登录） ----
  api.get("/health", (c) =>
    c.json({ code: 0, message: "ok", data: { time: new Date().toISOString() } })
  );

  // ---- 认证 ----
  api.post("/auth/login", auth.login);
  api.post("/auth/logout", auth.logout);

  // ---- 以下接口需要登录 ----
  api.use("/auth/me", authMiddleware(ctx));
  api.use("/auth/change-password", authMiddleware(ctx));
  api.use("/dashboard/*", authMiddleware(ctx));
  api.use("/documents/*", authMiddleware(ctx));
  api.use("/recycle/*", authMiddleware(ctx));
  api.use("/images/*", authMiddleware(ctx));
  api.use("/settings/*", authMiddleware(ctx));
  api.use("/config/*", authMiddleware(ctx));
  api.use("/themes/*", authMiddleware(ctx));

  // ---- 认证（需要登录） ----
  api.get("/auth/me", auth.me);
  api.post("/auth/change-password", auth.changePassword);

  // ---- 主页（仪表盘） ----
  api.get("/dashboard/overview", dashboard.overview);
  api.get("/dashboard/todos", dashboard.listTodos);
  api.post("/dashboard/todos", dashboard.createTodo);
  api.put("/dashboard/todos/:id", dashboard.updateTodo);
  api.delete("/dashboard/todos/:id", dashboard.deleteTodo);

  // ---- 文章 / 页面 ----
  api.get("/documents/:kind", documents.list);
  api.post("/documents/:kind", documents.create);
  api.get("/documents/:kind/taxonomy", documents.taxonomy);
  api.post("/documents/:kind/sync", documents.sync);
  api.get("/documents/detail/:id", documents.detail);
  api.put("/documents/detail/:id", documents.update);
  api.post("/documents/detail/:id/status", documents.setStatus);
  api.delete("/documents/detail/:id", documents.trash);

  // ---- 回收站 ----
  api.get("/recycle", documents.trashedList);
  api.post("/recycle/:id/restore", documents.restore);
  api.delete("/recycle/:id", documents.destroy);

  // ---- 图床 ----
  api.get("/images", images.list);
  api.post("/images", images.upload);
  api.post("/images/folders", images.createFolder);
  api.delete("/images", images.removeMany);
  api.delete("/images/:key", images.remove);

  // ---- 系统管理 ----
  api.get("/settings", settings.all);
  api.post("/settings", settings.save);
  api.post("/settings/test-github", settings.testGithub);
  api.post("/settings/test-cos", settings.testCos);
  api.get("/settings/account", settings.account);

  api.get("/settings/deploy/channels", settings.deployChannels);
  api.get("/settings/deploy/logs", settings.deployList);
  api.post("/settings/deploy", settings.saveDeploy);
  api.post("/settings/deploy/trigger", settings.deployTrigger);

  // ---- 主题管理 ----
  api.get("/themes", theme.list);
  api.get("/themes/plugins", theme.listPlugins);
  api.post("/themes/install", theme.install);
  api.post("/themes/uninstall", theme.uninstall);
  api.post("/themes/enable", theme.enable);
  api.post("/themes/disable", theme.disable);

  // ---- YAML 配置（快照草稿 + 发布 + 新建/删除） ----
  api.get("/config", config.list);
  api.post("/config", config.create);
  api.get("/config/:path", config.read);
  api.post("/config/:path/draft", config.saveDraft);
  api.post("/config/:path/publish", config.publish);
  api.delete("/config/:path/draft", config.discard);
  api.delete("/config/:path", config.remove);

  // ---- 兼容旧接口（settings/themes、settings/config/:kind） ----
  api.get("/settings/themes", theme.list);
  api.get("/settings/config/:kind", settings.getConfig);
  api.put("/settings/config/:kind", settings.saveConfig);

  // ---- 404 与错误处理 ----
  api.onError((error, c) => {
    console.error("[api error]", error);
    return c.json({ code: 500, message: error.message || "服务器内部错误", data: null }, 500 as 400);
  });

  const app = new Hono();
  app.route("/", api);

  // 未命中 /api 前缀的请求（含 /api 下不存在的路径）统一返回 JSON 404
  app.notFound((c) => c.json({ code: 404, message: "接口不存在", data: null }, 404));

  return app;
}

type MiddlewareHandler = Parameters<Hono["use"]>[1];

function authMiddleware(ctx: AppContext): MiddlewareHandler {
  return async (c, next) => {
    const header = c.req.header("authorization") ?? "";
    const token = header.replace(/^Bearer\s+/i, "");
    const session = ctx.auth.verify(token || undefined);
    if (!session) {
      return c.json({ code: 401, message: "登录已过期，请重新登录", data: null }, 401);
    }
    c.set("session", session);
    await next();
  };
}
