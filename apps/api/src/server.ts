/**
 * 本地开发服务器（Node）。
 * 生产环境由 EdgeOne Pages 的 Edge Functions 托管（见 edgeone/ 目录）。
 */

import { serve } from "@hono/node-server";
import { createApp } from "./router";
import { createContext } from "./context";

const port = Number(process.env.PORT ?? 8787);
const ctx = createContext();
const app = createApp(ctx);

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`[hexo-pro-api] listening on http://127.0.0.1:${info.port}`);
  console.log(`[hexo-pro-api] health: http://127.0.0.1:${info.port}/api/health`);
});
