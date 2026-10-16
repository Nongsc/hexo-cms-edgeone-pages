/**
 * sql.js 类型声明（sql.js 1.x 未内置 TypeScript 类型）。
 * 仅声明本项目使用到的 API。
 */

declare module "sql.js" {
  export type SqlValue = number | string | Uint8Array | null;

  export type BindParams = unknown[] | Record<string, SqlValue>;

  export interface Statement {
    bind(params?: BindParams): boolean;
    step(): boolean;
    getAsObject(): Record<string, SqlValue>;
    free(): boolean;
    reset(): void;
  }

  export interface QueryExecResult {
    columns: string[];
    values: SqlValue[][];
  }

  export class Database {
    constructor(data?: Uint8Array | Buffer);
    run(sql: string, params?: BindParams): Database;
    exec(sql: string, params?: BindParams): QueryExecResult[];
    prepare(sql: string, params?: BindParams): Statement;
    export(): Uint8Array;
    close(): void;
    getRowsModified(): number;
  }

  export interface SqlJsStatic {
    Database: typeof Database;
  }

  /** 该模块的默认导出既是类型也是值（工厂函数）。 */
  export default function initSqlJs(config?: {
    locateFile?: (file: string) => string;
  }): Promise<SqlJsStatic>;
}

/**
 * inline 构建：WASM 以 base64 内联，无外部 .wasm 文件依赖，
 * 便于打包部署（本项目 Cloud Functions bundle 使用此入口）。
 */
declare module "sql.js/dist/sql-wasm-inline.js" {
  const initSqlJsInline: (config?: { locateFile?: (file: string) => string }) => Promise<{
    Database: typeof import("sql.js").Database;
  }>;
  export default initSqlJsInline;
}
