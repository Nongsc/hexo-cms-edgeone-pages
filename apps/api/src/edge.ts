/**
 * EdgeOne Pages / Edge Functions 入口。
 *
 * 部署时 apps/api 的产物与前端 dist 一起上传，EdgeOne 按 edgeone.json
 * 的规则把 /api/* 请求交给这里处理。
 */

import { createApp } from "./router";
import { createContext } from "./context";

const ctx = createContext();
const app = createApp(ctx);

export default app;
