/**
 * node:sqlite 的打包 stub。
 *
 * 用途：EdgeOne Cloud Functions 运行时为 Node 20（无 node:sqlite），
 * 而 build-edge.ts 会对 bundle 做二次打包，遇到 `node:sqlite` 会报
 * `Could not resolve "sqlite"`。因此打包时把 node:sqlite 别名到此 stub。
 *
 * 运行时安全：Node 20 上 hasNativeSqlite() 返回 false，数据库走 sql.js
 * 分支，这里的 DatabaseSync 永远不会被真正调用。仅用于满足打包器解析。
 */

// 抛错的占位类：若被误用立即失败，暴露问题。
export class DatabaseSync {
  constructor(_path?: string) {
    throw new Error("[stub] node:sqlite 不可用，应使用 sql.js 驱动（CMS_DB_DRIVER=sqljs）");
  }
}
