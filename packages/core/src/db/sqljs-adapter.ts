/**
 * sql.js 适配器：提供与 node:sqlite 的 DatabaseSync 兼容的 API。
 *
 * 为什么需要它：
 *   EdgeOne Cloud Functions 的 Node 运行时是 v20.x，而 node:sqlite
 *   直到 Node 22.5 才稳定可用。sql.js 是 SQLite 的 WASM 版本，纯 JS、
 *   无原生依赖，可在任意 Node 版本运行。
 *
 * 设计目标：让上层 Repository 代码零改动，因此这里完整复刻
 * DatabaseSync 的同步 API：
 *   - exec(sql)                执行多条语句
 *   - prepare(sql).run(...)    写操作，返回 { changes, lastInsertRowid }
 *   - prepare(sql).get(...)    读单行
 *   - prepare(sql).all(...)    读多行
 *   - close()                  关闭
 *
 * 参数绑定要点（经实测验证）：
 *   - 位置参数：bind([1, 2])                    ✅
 *   - 具名参数：bind({ ":a": 1, ":b": 2 })      ✅ key 必须带 : / @ / $ 前缀
 *   - 具名裸 key：bind({ a: 1 })                ⚠️ 静默绑定为 null（不报错）
 *   - 数组包对象：bind([{ a: 1 }])              ❌ 报错 unknown type
 *   因此这里把裸 key 统一加 ":" 前缀，并把 @x/$x 占位符改写为 :x。
 */

// 值：使用 inline 构建（wasm base64 内联，无外部 .wasm 依赖，便于打包）
import initSqlJs from "sql.js/dist/sql-wasm-inline.js";
// 类型：从主模块声明导入（inline 版只导出默认值）
import type { Database as SqlJsDatabase, SqlValue } from "sql.js";

export interface SqliteCompatDatabase {
  exec(sql: string): void;
  prepare(sql: string): {
    run(...params: unknown[]): { changes: number; lastInsertRowid: number };
    get(...params: unknown[]): unknown;
    all(...params: unknown[]): unknown[];
  };
  close(): void;
}

/* -------------------------------------------------------------------------- */
/* 参数与占位符处理                                                            */
/* -------------------------------------------------------------------------- */

/**
 * 把 SQL 中的 @name / $name 占位符统一改写为 :name（sql.js 认 :name）。
 * 注意：不要触碰字符串字面量内的内容（本项目 SQL 无此情况，保持简单）。
 */
function rewritePlaceholders(sql: string): string {
  return sql.replace(/[@$](\w+)/g, ":$1");
}

/**
 * 归一化绑定参数：
 *   - 单个普通对象 → 转为带 ":" 前缀的具名参数对象（sql.js 要求）
 *   - 其他（数组 / 标量 / undefined）→ 原样返回
 */
function normalizeParams(params: unknown[]): unknown[] {
  if (params.length === 1 && isPlainObject(params[0])) {
    return [toNamedParams(params[0] as Record<string, unknown>)];
  }
  // 位置参数：逐个过滤 sql.js 支持的类型
  return params.map((value) => (value === undefined ? null : toSqlValue(value)));
}

/** 裸 key 具名参数 → 带 ":" 前缀。 */
function toNamedParams(obj: Record<string, unknown>): Record<string, SqlValue> {
  const result: Record<string, SqlValue> = {};
  for (const [key, value] of Object.entries(obj)) {
    const name = key.startsWith(":") ? key : `:${key.replace(/^[@$]/, "")}`;
    result[name] = toSqlValue(value);
  }
  return result;
}

function isPlainObject(value: unknown): boolean {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** 转换为 sql.js 支持的绑定值类型。 */
function toSqlValue(value: unknown): SqlValue {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") return value;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "boolean") return value ? 1 : 0;
  if (value instanceof Uint8Array) return value;
  return String(value);
}

/* -------------------------------------------------------------------------- */
/* 语句与数据库                                                                */
/* -------------------------------------------------------------------------- */

export class SqlJsCompatStatement {
  constructor(
    private readonly db: SqlJsDatabase,
    private readonly sql: string
  ) {}

  run(...params: unknown[]): { changes: number; lastInsertRowid: number } {
    const sql = rewritePlaceholders(this.sql);
    const normalized = normalizeParams(params);
    // sql.js 的 db.run(sql, params)：params 为数组或具名对象
    this.db.run(sql, normalized.length === 0 ? undefined : (normalized as never));
    const changes = this.db.getRowsModified();
    return { changes, lastInsertRowid: this.lastInsertRowid() };
  }

  get(...params: unknown[]): unknown {
    const stmt = this.db.prepare(rewritePlaceholders(this.sql));
    try {
      this.bindStatement(stmt, params);
      if (!stmt.step()) return undefined;
      return stmt.getAsObject();
    } finally {
      stmt.free();
    }
  }

  all(...params: unknown[]): unknown[] {
    const stmt = this.db.prepare(rewritePlaceholders(this.sql));
    try {
      this.bindStatement(stmt, params);
      const rows: Record<string, SqlValue>[] = [];
      while (stmt.step()) {
        rows.push(stmt.getAsObject());
      }
      return rows;
    } finally {
      stmt.free();
    }
  }

  /** 绑定参数：具名对象整体传入，位置参数则展开为数组。 */
  private bindStatement(stmt: ReturnType<SqlJsDatabase["prepare"]>, params: unknown[]): void {
    if (params.length === 0) return;

    if (params.length === 1 && isPlainObject(params[0])) {
      stmt.bind(toNamedParams(params[0] as Record<string, unknown>));
      return;
    }
    stmt.bind(
      params.map((value) => (value === undefined ? null : toSqlValue(value)))
    );
  }

  private lastInsertRowid(): number {
    const result = this.db.exec("SELECT last_insert_rowid() AS id");
    if (result.length === 0) return 0;
    return Number(result[0].values[0][0]);
  }
}

export class SqlJsCompatDatabase implements SqliteCompatDatabase {
  private constructor(private readonly db: SqlJsDatabase) {}

  /** 创建空库。 */
  static async open(): Promise<SqlJsCompatDatabase> {
    const SQL = await initSqlJs();
    return new SqlJsCompatDatabase(new SQL.Database());
  }

  /** 从已有数据库文件内容创建（用于从 COS 恢复）。 */
  static async fromBytes(bytes: Uint8Array): Promise<SqlJsCompatDatabase> {
    const SQL = await initSqlJs();
    return new SqlJsCompatDatabase(new SQL.Database(bytes));
  }

  exec(sql: string): void {
    this.db.exec(sql);
  }

  prepare(sql: string): SqlJsCompatStatement {
    return new SqlJsCompatStatement(this.db, sql);
  }

  /** 导出数据库为二进制（用于持久化到 COS）。 */
  export(): Uint8Array {
    return this.db.export();
  }

  close(): void {
    this.db.close();
  }
}
