/**
 * EdgeOne Pages · Cloud Functions (Node.js) 入口。
 *
 * 部署时由 build-edge.ts 打包为 cloud-functions/api/[[default]].js，
 * EdgeOne Makers 会把所有 /api/* 请求（含子路径）交给这里处理。
 *
 * 采用 Handler 模式：导出 onRequest(context)，内部转交 Hono 应用。
 * Cloud Functions 的 Node.js runtime 是完整 Node v20 环境，
 * 因此可以使用 node:sqlite、node:crypto 等内置模块。
 *
 * 数据库持久化：Cloud Functions 文件系统不保证长期持久，
 * 当 CMS_DB_REMOTE=cos 时，每次请求前从 COS 恢复数据库、请求后同步回 COS。
 */

import { createApp } from "./router";
import { createContext } from "./context";
import { RemoteDatabase } from "@hexo-pro/core";
import { resolveDatabasePath } from "@hexo-pro/core";

/** 模块级单例：函数实例复用时避免重复建库。 */
const ctx = createContext();
const app = createApp(ctx);

/**
 * 云端持久化（仅部署环境启用）。
 * 懒初始化：首次请求时从 COS 拉取数据库，避免冷启动阻塞过久。
 */
const remoteDb = RemoteDatabase.isEnabled()
  ? new RemoteDatabase({
      cos: ctx.services.cos(),
      localPath: resolveDatabasePath(process.env.CMS_DB_PATH ?? "apps/api/data/cms.sqlite")
    })
  : null;
const remoteReady = remoteDb ? remoteDb.initialize() : Promise.resolve();

type EoContext = {
  request: Request;
  params?: Record<string, string>;
  env?: Record<string, unknown>;
};

/**
 * 统一入口：把 Cloud Functions 的 Web Request 转给 Hono。
 */
export async function onRequest(context: EoContext): Promise<Response> {
  await remoteReady;
  try {
    return await app.fetch(context.request);
  } finally {
    // 请求结束后把数据库变更同步到 COS
    if (remoteDb) {
      await remoteDb.sync().catch(() => undefined);
    }
  }
}

export default onRequest;
