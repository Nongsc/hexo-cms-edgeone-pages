/**
 * EdgeOne Pages · Cloud Functions (Node.js) 入口。
 *
 * 部署时由 build-edge.ts 打包为 cloud-functions/api/[[default]].js，
 * EdgeOne Makers 会把所有 /api/* 请求（含子路径）交给这里处理。
 *
 * 采用 Handler 模式：导出 onRequest(context)，内部转交 Hono 应用。
 *
 * 运行时适配：
 *   - Cloud Functions 的 Node 运行时为 v20.x（不支持 node:sqlite），
 *     因此使用 sql.js（WASM）作为 SQLite 实现；
 *   - 本地 Node >= 22.5 时自动使用内置 node:sqlite。
 *
 * 数据库持久化：Cloud Functions 文件系统不保证长期持久，
 * 当 CMS_DB_REMOTE=cos 时，数据库文件托管在 COS：
 *   - 首次请求（冷启动）从 COS 下载恢复；
 *   - 请求结束后把数据库导出并上传 COS。
 */

import {
  ensureDatabase,
  persistDatabase,
  RemoteDatabase,
  resolveDatabasePath
} from "@hexo-pro/core";
import { createApp } from "./router";
import { createContext } from "./context";

interface Built {
  app: ReturnType<typeof createApp>;
  remoteDb: RemoteDatabase | null;
}

/** 模块级单例：函数实例复用时避免重复初始化。 */
let builtPromise: Promise<Built> | null = null;
let built: Built | null = null;

async function build(): Promise<Built> {
  // 1. 若启用 COS 持久化，先把数据库文件下载到本地。
  //    **必须在 ensureDatabase() 之前**：sql.js 是内存库，
  //    若在加载之后才下载文件，内存中的实例不会感知到该文件。
  //    此阶段 settings 表为空，COS 凭据只能来自环境变量。
  const remoteDb = createRemoteDb();
  if (remoteDb) {
    await remoteDb.initialize();
  }

  // 2. 初始化数据库（Node 20 走 sql.js WASM 并加载刚下载的文件，
  //    本地 Node >= 22.5 走 node:sqlite）
  await ensureDatabase();

  // 3. 构建应用上下文与路由
  const ctx = await createContext();
  return { app: createApp(ctx), remoteDb };
}

/** 创建云端数据库持久化（仅部署环境启用）。 */
function createRemoteDb(): RemoteDatabase | null {
  if (process.env.CMS_DB_REMOTE !== "cos") return null;
  const secretId = process.env.COS_SECRET_ID ?? "";
  const secretKey = process.env.COS_SECRET_KEY ?? "";
  const bucket = process.env.COS_BUCKET ?? "";
  if (!bucket || !secretId || !secretKey) {
    console.warn("[eo] CMS_DB_REMOTE=cos 但缺少 COS_SECRET_ID/COS_SECRET_KEY/COS_BUCKET，跳过云端恢复");
    return null;
  }
  return new RemoteDatabase({
    cos: {
      bucket,
      region: process.env.COS_REGION ?? "ap-guangzhou",
      secretId,
      secretKey,
      sessionToken: process.env.COS_SESSION_TOKEN ?? "",
      domain: process.env.COS_DOMAIN ?? "",
      folder: process.env.COS_FOLDER ?? "images"
    },
    localPath: resolveDatabasePath(process.env.CMS_DB_PATH ?? "apps/api/data/cms.sqlite")
  });
}

type EoContext = {
  request: Request;
  params?: Record<string, string>;
  env?: Record<string, unknown>;
};

/** 统一入口：把 Cloud Functions 的 Web Request 转交 Hono。 */
export async function onRequest(context: EoContext): Promise<Response> {
  try {
    if (!built) {
      if (!builtPromise) {
        builtPromise = build();
      }
      built = await builtPromise;
    }

    try {
      return await built.app.fetch(context.request);
    } finally {
      // 请求结束后把数据库同步到 COS（sql.js 模式需先导出为文件）
      if (built.remoteDb) {
        persistDatabase();
        await built.remoteDb.sync().catch(() => undefined);
      }
    }
  } catch (error) {
    // 全局兜底：函数初始化或执行失败时，返回可读的 JSON 错误信息，
    // 避免 Cloud Functions 直接抛 502 导致无法排查。
    console.error("[eo] onRequest 失败:", error);
    return new Response(
      JSON.stringify({
        code: 500,
        message: `函数执行失败：${(error as Error)?.message ?? String(error)}`,
        stack: (error as Error)?.stack?.slice(0, 800) ?? null
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json; charset=UTF-8" }
      }
    );
  }
}

export default onRequest;
