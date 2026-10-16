/**
 * SQLite 数据访问层（Model）。
 *
 * 运行环境无关：Node 22+ 与 EdgeOne Cloud Functions（Node runtime）均可使用
 * 内置的 `node:sqlite` 模块，因此不需要任何原生编译依赖。
 */

import { DatabaseSync } from "node:sqlite";
import { mkdirSync, existsSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export interface SqliteOptions {
  /** 数据库文件路径；`:memory:` 表示内存库（测试用）。 */
  path?: string;
}

let singleton: DatabaseSync | null = null;

/**
 * 项目根目录（monorepo 根）。
 *
 * 不依赖固定目录级数（bundle 输出位置会变：本地 apps/api、部署时
 * cloud-functions/api 等），而是从本文件位置向上查找 monorepo 标志文件
 * pnpm-workspace.yaml。这样无论从哪个工作目录启动、bundle 输出到哪里，
 * 相对路径都解析到同一处。
 */
const PROJECT_ROOT = findProjectRoot(dirname(fileURLToPath(import.meta.url)));

function findProjectRoot(startDir: string): string {
  let dir = startDir;
  // 向上最多找 10 层，避免异常情况下的死循环
  for (let i = 0; i < 10; i += 1) {
    if (existsSync(resolve(dir, "pnpm-workspace.yaml"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  // 兜底：退回到原来的固定推导（packages/core/src/db -> 根）
  return resolve(startDir, "../../../..");
}

/** 取得进程内唯一的数据库连接（懒初始化 + 建表）。 */
export function getDatabase(options: SqliteOptions = {}): DatabaseSync {
  if (singleton) return singleton;

  const rawPath = options.path ?? process.env.CMS_DB_PATH ?? "apps/api/data/cms.sqlite";
  const path = resolveDatabasePath(rawPath);

  if (path !== ":memory:") {
    mkdirSync(dirname(path), { recursive: true });
  }

  const db = new DatabaseSync(path);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");
  migrate(db);

  singleton = db;
  return db;
}

/**
 * 解析数据库路径：
 *  - `:memory:` 原样返回；
 *  - 绝对路径原样返回；
 *  - 相对路径统一相对项目根目录解析，与启动时的工作目录无关。
 */
export function resolveDatabasePath(rawPath: string): string {
  if (rawPath === ":memory:") return ":memory:";
  if (isAbsolute(rawPath)) return rawPath;
  return resolve(PROJECT_ROOT, rawPath);
}

/** 测试专用：重置单例，使下一次 getDatabase 使用新的路径。 */
export function resetDatabaseForTesting(): void {
  singleton?.close();
  singleton = null;
}

const MIGRATIONS: Array<{ version: number; statements: string[] }> = [
  {
    version: 1,
    statements: [
      `CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        applied_at TEXT NOT NULL DEFAULT (datetime('now'))
      );`,
      `CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        group_name TEXT NOT NULL DEFAULT 'general',
        is_secret INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );`,
      `CREATE TABLE IF NOT EXISTS documents (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        kind TEXT NOT NULL CHECK (kind IN ('post', 'page')),
        title TEXT NOT NULL DEFAULT '',
        slug TEXT NOT NULL DEFAULT '',
        path TEXT NOT NULL UNIQUE,
        status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('published', 'draft')),
        content TEXT NOT NULL DEFAULT '',
        front_matter TEXT NOT NULL DEFAULT '{}',
        summary TEXT NOT NULL DEFAULT '',
        cover TEXT NOT NULL DEFAULT '',
        sticky INTEGER NOT NULL DEFAULT 0,
        tags TEXT NOT NULL DEFAULT '[]',
        categories TEXT NOT NULL DEFAULT '[]',
        repo_sha TEXT,
        repo_path TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        published_at TEXT,
        deleted_at TEXT
      );`,
      `CREATE INDEX IF NOT EXISTS idx_documents_kind_status
        ON documents (kind, status, deleted_at);`,
      `CREATE TABLE IF NOT EXISTS todos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        done INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );`,
      `CREATE TABLE IF NOT EXISTS deploy_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        channel TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('pending', 'running', 'success', 'failed')),
        message TEXT NOT NULL DEFAULT '',
        trigger_by TEXT NOT NULL DEFAULT 'manual',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        finished_at TEXT
      );`,
      `CREATE TABLE IF NOT EXISTS assets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        cos_key TEXT NOT NULL UNIQUE,
        filename TEXT NOT NULL,
        folder TEXT NOT NULL DEFAULT '',
        url TEXT NOT NULL,
        size INTEGER NOT NULL DEFAULT 0,
        mime TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );`,
      `CREATE INDEX IF NOT EXISTS idx_assets_folder ON assets (folder);`,
      `CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        display_name TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );`
    ]
  },
  {
    version: 2,
    statements: [
      // 配置文件快照草稿：保存到数据库但不推送到 GitHub，待用户手动发布。
      `CREATE TABLE IF NOT EXISTS config_snapshots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        path TEXT NOT NULL UNIQUE,
        content TEXT NOT NULL,
        base_sha TEXT,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );`
    ]
  }
];

function migrate(db: DatabaseSync): void {
  db.exec(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );`
  );

  const applied = new Set(
    (db.prepare("SELECT version FROM schema_migrations").all() as Array<{ version: number }>).map(
      (row) => row.version
    )
  );

  for (const migration of MIGRATIONS) {
    if (applied.has(migration.version)) continue;
    for (const statement of migration.statements) {
      db.exec(statement);
    }
    db.prepare("INSERT INTO schema_migrations (version) VALUES (?)").run(migration.version);
  }
}
