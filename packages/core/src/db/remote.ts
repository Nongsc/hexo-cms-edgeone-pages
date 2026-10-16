/**
 * SQLite 数据库的云端持久化（面向 EdgeOne Cloud Functions）。
 *
 * 背景：Cloud Functions 的文件系统不保证长期持久（官方建议用 COS 处理
 * 持久化需求）。因此部署环境下把 SQLite 数据库文件托管在腾讯云 COS：
 *
 *   - 冷启动 / 首次访问：从 COS 下载 cms.sqlite 到本地
 *   - 请求处理结束：把本地 cms.sqlite 重新上传 COS（仅在有写入时）
 *
 * 本地开发环境不使用该机制（CMS_DB_REMOTE 未设置），直接读写本地文件。
 */

import { readFileSync, writeFileSync, existsSync, statSync } from "node:fs";
import { CosClient, type CosConfig } from "../services/cos";

/** 数据库在 COS 中的对象键。 */
const DB_COS_KEY = "cms/database/cms.sqlite";

export interface RemoteDbOptions {
  /**
   * COS 客户端实例或凭据配置。
   * 传凭据配置更常见：启动早期 settings 表可能为空，无法从数据库读取 COS 配置，
   * 因此凭据通常来自环境变量。
   */
  cos: CosClient | CosConfig;
  /** 本地数据库文件路径。 */
  localPath: string;
}

export class RemoteDatabase {
  private readonly cos: CosClient;
  private readonly localPath: string;
  private lastSyncMtimeMs = 0;
  private initialized = false;

  constructor(options: RemoteDbOptions) {
    this.cos = options.cos instanceof CosClient ? options.cos : new CosClient(options.cos);
    this.localPath = options.localPath;
  }

  /** 是否启用了云端持久化。 */
  static isEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
    return env.CMS_DB_REMOTE === "cos";
  }

  /** 启动时调用：从 COS 拉取数据库（若存在）。 */
  async initialize(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;

    try {
      // COS 上没有数据库时保持空库（首次部署）
      const { objects } = await this.cos.listObjects(DB_COS_KEY, 1);
      if (objects.length === 0) return;

      // 下载数据库文件到本地
      const url = this.cos.urlForKey(DB_COS_KEY);
      const response = await fetch(url);
      if (!response.ok) {
        console.warn(`[remote-db] 下载失败: ${response.status}`);
        return;
      }
      const buffer = Buffer.from(await response.arrayBuffer());
      writeFileSync(this.localPath, buffer);
      this.lastSyncMtimeMs = this.currentMtime();
      console.log(`[remote-db] 已从 COS 恢复数据库 (${buffer.length} bytes)`);
    } catch (error) {
      console.warn("[remote-db] 初始化失败（将使用本地空库）:", (error as Error).message);
    }
  }

  /** 请求结束后调用：若数据库有变更，上传到 COS。 */
  async sync(): Promise<void> {
    if (!existsSync(this.localPath)) return;

    const mtime = this.currentMtime();
    if (mtime === this.lastSyncMtimeMs) return; // 无变更

    try {
      const buffer = readFileSync(this.localPath);
      await this.cos.putObject(DB_COS_KEY, buffer, "application/octet-stream", "cms/database");
      this.lastSyncMtimeMs = mtime;
      console.log(`[remote-db] 数据库已同步到 COS (${buffer.length} bytes)`);
    } catch (error) {
      console.warn("[remote-db] 同步失败:", (error as Error).message);
    }
  }

  private currentMtime(): number {
    if (!existsSync(this.localPath)) return 0;
    return statSync(this.localPath).mtimeMs;
  }
}
