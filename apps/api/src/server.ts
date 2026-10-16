/**
 * 本地开发服务器（Node）。
 * 生产环境由 EdgeOne Pages 的 Cloud Functions 托管（见 eo.ts）。
 */

import { serve } from "@hono/node-server";
import { createApp } from "./router";
import { createContext } from "./context";

const port = Number(process.env.PORT ?? 8787);

async function start(): Promise<void> {
  const ctx = await createContext();
  const app = createApp(ctx);

  serve({ fetch: app.fetch, port }, (info) => {
    console.log(`[hexo-pro-api] listening on http://127.0.0.1:${info.port}`);
    console.log(`[hexo-pro-api] health: http://127.0.0.1:${info.port}/api/health`);
  });
}

start().catch((error) => {
  console.error("[hexo-pro-api] 启动失败:", error);
  process.exit(1);
});
