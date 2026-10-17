/**
 * SQLite 数据访问层（Model）。
 *
 * 运行环境适配：
 *   - Node >= 22.5：使用内置 node:sqlite（同步 API，稳定）
 *   - Node 20（EdgeOne Cloud Functions 运行时）：使用 sql.js（WASM）
 *
 * 上层 Repository 通过 getDatabase() 取得已初始化的数据库实例。
 * 由于 sql.js 需要异步初始化 WASM，这里提供 ensureDatabase()：
 * 应用启动时 await 一次，之后 getDatabase() 同步返回。
 */

import { DatabaseSync } from "node:sqlite";
import { mkdirSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { SqlJsCompatDatabase, type SqliteCompatDatabase } from "./sqljs-adapter";

/** 统一的数据库接口（node:sqlite 与 sql.js 适配器都实现它）。 */
export type AppDatabase = DatabaseSync | SqliteCompatDatabase;

let singleton: AppDatabase | null = null;
/** 是否使用 sql.js 适配器（Node 20 环境）。 */
let usingSqlJs = false;

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
  for (let i = 0; i < 10; i += 1) {
    if (existsSync(resolve(dir, "pnpm-workspace.yaml"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return resolve(startDir, "../../../..");
}

/** Node 是否内置可用的 node:sqlite（>= 22.5）。 */
function hasNativeSqlite(): boolean {
  const major = Number(process.versions.node.split(".")[0]);
  const minor = Number(process.versions.node.split(".")[1]);
  return major > 22 || (major === 22 && minor >= 5);
}

/**
 * 本地数据库文件路径（部署环境与开发环境统一入口）。
 * 导出供 remote.ts / eo.ts 复用，保证「数据库实际读写位置」
 * 与「云端持久化下载/上传位置」始终一致。
 */
export function resolveLocalDatabasePath(): string {
  const configured = process.env.CMS_DB_PATH;
  if (configured) {
    return resolveDatabasePath(configured);
  }
  // Cloud Functions 部署环境：优先 /tmp（可写临时目录）
  if (process.env.CMS_DB_REMOTE === "cos") {
    return "/tmp/cms.sqlite";
  }
  // 本地开发：项目相对路径
  return resolveDatabasePath("apps/api/data/cms.sqlite");
}

/**
 * 初始化数据库（幂等）。
 *
 * 驱动选择：
 *   - CMS_DB_DRIVER=sqljs    强制 sql.js（WASM）
 *   - CMS_DB_DRIVER=native   强制 node:sqlite
 *   - 未设置：Node >= 22.5 用 node:sqlite，否则 sql.js
 *     （EdgeOne Cloud Functions 运行时为 Node 20，会自动走 sql.js）
 */
export async function ensureDatabase(): Promise<AppDatabase> {
  if (singleton) return singleton;

  const path = resolveLocalDatabasePath();
  const driver = process.env.CMS_DB_DRIVER ?? (hasNativeSqlite() ? "native" : "sqljs");

  if (driver === "native") {
    if (path !== ":memory:") {
      mkdirSync(dirname(path), { recursive: true });
    }
    const db = new DatabaseSync(path);
    db.exec("PRAGMA journal_mode = WAL;");
    db.exec("PRAGMA foreign_keys = ON;");
    migrate(db);
    singleton = db;
    usingSqlJs = false;
    return db;
  }

  // sql.js（WASM）
  usingSqlJs = true;
  if (path !== ":memory:" && existsSync(path)) {
    const bytes = new Uint8Array(readFileSync(path));
    const db = await SqlJsCompatDatabase.fromBytes(bytes);
    migrate(db);
    singleton = db;
    return db;
  }
  const db = await SqlJsCompatDatabase.open();
  migrate(db);
  singleton = db;
  return db;
}

/**
 * 取得已初始化的数据库。
 * 必须先 await ensureDatabase()（应用启动时完成）。
 */
export function getDatabase(): AppDatabase {
  if (!singleton) {
    throw new Error("数据库未初始化：请先 await ensureDatabase()");
  }
  return singleton;
}

/** 是否使用 sql.js 适配器。 */
export function isUsingSqlJs(): boolean {
  return usingSqlJs;
}

/**
 * 把内存中的数据库导出为文件（sql.js 模式）。
 * node:sqlite 模式无需调用（本身即文件）。
 */
export function persistDatabase(): void {
  if (!singleton || !usingSqlJs) return;
  const path = resolveLocalDatabasePath();
  if (path === ":memory:") return;
  const bytes = (singleton as SqlJsCompatDatabase).export();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, bytes);
}

/** 测试专用：重置单例，使下一次 ensureDatabase 使用新的路径。 */
export function resetDatabaseForTesting(): void {
  singleton?.close();
  singleton = null;
  usingSqlJs = false;
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
        filename TEXT NOT NULL DEFAULT '',
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

function migrate(db: AppDatabase): void {
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
