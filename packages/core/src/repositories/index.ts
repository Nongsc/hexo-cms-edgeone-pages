/** Repository 层：封装 SQLite 访问，向上只暴露领域语义。 */

import { getDatabase } from "../db/sqlite";
import type {
  Asset,
  ConfigSnapshot,
  DeployChannel,
  DeployLog,
  DeployStatus,
  Document,
  DocumentKind,
  DocumentStatus,
  DocumentSummary,
  ListQuery,
  Paginated,
  SettingRow,
  Todo
} from "../types/index";
import type { SettingGroup } from "../constants/index";
import type { DatabaseSync, SQLInputValue } from "node:sqlite";

export interface DocumentRecord {
  kind: DocumentKind;
  title: string;
  slug: string;
  path: string;
  status: DocumentStatus;
  content: string;
  frontMatter: string;
  summary: string;
  cover: string;
  sticky: number;
  tags: string;
  categories: string;
  repoPath: string;
  repoSha: string | null;
  publishedAt: string | null;
  deletedAt: string | null;
}

/**
 * `SELECT *` 读出的原始行：SQLite 实际列名是下划线风格，
 * 与 DocumentRecord（INSERT 用的 camelCase 参数）不同。
 */
interface DocumentTableRow {
  id: number;
  kind: DocumentKind;
  title: string;
  slug: string;
  path: string;
  status: DocumentStatus;
  content: string;
  front_matter: string;
  summary: string;
  cover: string;
  sticky: number;
  tags: string;
  categories: string;
  repo_path: string;
  repo_sha: string | null;
  published_at: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

function parseJson<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/** 列表查询返回的原始行（列名为下划线风格）。 */
interface DocumentRow {
  id: number;
  kind: DocumentKind;
  title: string;
  slug: string;
  path: string;
  status: DocumentStatus;
  summary: string;
  cover: string;
  sticky: number;
  tags: string;
  categories: string;
  updated_at: string;
  published_at: string | null;
}

function rowToSummary(row: DocumentRow): DocumentSummary {
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    slug: row.slug,
    path: row.path,
    status: row.status,
    summary: row.summary,
    cover: row.cover,
    sticky: Boolean(row.sticky),
    tags: parseJson<string[]>(row.tags, []),
    categories: parseJson<string[]>(row.categories, []),
    updatedAt: row.updated_at,
    publishedAt: row.published_at
  };
}

function rowToDocument(row: DocumentTableRow): Document {
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    slug: row.slug,
    path: row.path,
    status: row.status,
    content: row.content,
    frontMatter: parseJson<Record<string, unknown>>(row.front_matter, {}),
    summary: row.summary,
    cover: row.cover,
    sticky: Boolean(row.sticky),
    tags: parseJson<string[]>(row.tags, []),
    categories: parseJson<string[]>(row.categories, []),
    repoPath: row.repo_path,
    repoSha: row.repo_sha,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    publishedAt: row.published_at ?? null,
    deletedAt: row.deleted_at ?? null
  };
}

export class DocumentRepository {
  constructor(private readonly db: DatabaseSync = getDatabase()) {}

  insert(input: Omit<DocumentRecord, "repoSha"> & { repoSha?: string | null }): Document {
    const stmt = this.db.prepare(`
      INSERT INTO documents
        (kind, title, slug, path, status, content, front_matter, summary, cover, sticky,
         tags, categories, repo_path, repo_sha, published_at, deleted_at)
      VALUES
        (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(
      input.kind,
      input.title,
      input.slug,
      input.path,
      input.status,
      input.content,
      input.frontMatter,
      input.summary,
      input.cover,
      input.sticky,
      input.tags,
      input.categories,
      input.repoPath,
      input.repoSha ?? null,
      input.publishedAt,
      input.deletedAt
    );
    const created = this.findById(Number(result.lastInsertRowid));
    if (!created) throw new Error("插入文档后读取失败");
    return created;
  }

  update(id: number, patch: Partial<DocumentRecord>): Document {
    const allowed: Array<keyof DocumentRecord> = [
      "title",
      "slug",
      "path",
      "status",
      "content",
      "frontMatter",
      "summary",
      "cover",
      "sticky",
      "tags",
      "categories",
      "repoPath",
      "repoSha",
      "publishedAt",
      "deletedAt"
    ];
    const assignments: string[] = [];
    const values: SQLInputValue[] = [];
    for (const key of allowed) {
      // 允许把字段显式置为 null（如恢复回收站时清空 deleted_at），
      // 因此只跳过 undefined。
      if (key in patch && patch[key] !== undefined) {
        assignments.push(`${keyToColumn(key)} = ?`);
        values.push(patch[key] as SQLInputValue);
      }
    }
    if (assignments.length === 0) {
      const existing = this.findById(id);
      if (!existing) throw new Error(`文档不存在: ${id}`);
      return existing;
    }
    assignments.push("updated_at = datetime('now')");
    values.push(id);
    this.db
      .prepare(`UPDATE documents SET ${assignments.join(", ")} WHERE id = ?`)
      .run(...values);
    const updated = this.findById(id);
    if (!updated) throw new Error(`文档不存在: ${id}`);
    return updated;
  }

  findById(id: number): Document | null {
    const row = this.db.prepare("SELECT * FROM documents WHERE id = ?").get(id) as
      | DocumentTableRow
      | undefined;
    return row ? rowToDocument(row) : null;
  }

  findByPath(path: string): Document | null {
    const row = this.db.prepare("SELECT * FROM documents WHERE path = ?").get(path) as
      | DocumentTableRow
      | undefined;
    return row ? rowToDocument(row) : null;
  }

  list(query: ListQuery, includeDeleted = false): Paginated<DocumentSummary> {
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 10));

    const where: string[] = ["kind = @kind"];
    const params: Record<string, unknown> = { kind: query.kind ?? "post" };

    if (!includeDeleted) {
      where.push("deleted_at IS NULL");
    }
    if (query.status && query.status !== "all") {
      where.push("status = @status");
      params.status = query.status;
    }
    if (query.keyword) {
      where.push("(title LIKE @keyword OR summary LIKE @keyword OR content LIKE @keyword)");
      params.keyword = `%${query.keyword}%`;
    }
    if (query.tag) {
      where.push("EXISTS (SELECT 1 FROM json_each(documents.tags) WHERE json_each.value = @tag)");
      params.tag = query.tag;
    }
    if (query.category) {
      where.push(
        "EXISTS (SELECT 1 FROM json_each(documents.categories) WHERE json_each.value = @category)"
      );
      params.category = query.category;
    }

    const whereSql = `WHERE ${where.join(" AND ")}`;
    const sortColumnMap: Record<string, string> = {
      updatedAt: "updated_at",
      publishedAt: "published_at",
      title: "title"
    };
    const sortColumn = sortColumnMap[query.sortBy ?? "updatedAt"] ?? "updated_at";
    const sortOrder = query.sortOrder === "asc" ? "ASC" : "DESC";

    const totalRow = this.db
      .prepare(`SELECT COUNT(*) AS count FROM documents ${whereSql}`)
      .get(params as Record<string, SQLInputValue>) as { count: number };

    const rows = this.db
      .prepare(
        `SELECT id, kind, title, slug, path, status, summary, cover, sticky, tags, categories,
                updated_at, published_at
         FROM documents ${whereSql}
         ORDER BY sticky DESC, ${sortColumn} ${sortOrder}
         LIMIT @limit OFFSET @offset`
      )
      .all({ ...params, limit: pageSize, offset: (page - 1) * pageSize } as Record<
        string,
        SQLInputValue
      >) as unknown as Array<
      DocumentRow
    >;

    return {
      list: rows.map(rowToSummary),
      total: totalRow.count,
      page,
      pageSize
    };
  }

  /** 首页仪表盘统计。 */
  stats(): {
    totalPosts: number;
    drafts: number;
    publishedThisMonth: number;
    totalPages: number;
  } {
    const row = this.db
      .prepare(
        `SELECT
           SUM(CASE WHEN kind = 'post' AND deleted_at IS NULL THEN 1 ELSE 0 END) AS total_posts,
           SUM(CASE WHEN kind = 'post' AND status = 'draft' AND deleted_at IS NULL THEN 1 ELSE 0 END) AS drafts,
           SUM(CASE WHEN kind = 'post' AND deleted_at IS NULL
                         AND strftime('%Y-%m', published_at) = strftime('%Y-%m', 'now') THEN 1 ELSE 0 END)
             AS published_this_month,
           SUM(CASE WHEN kind = 'page' AND deleted_at IS NULL THEN 1 ELSE 0 END) AS total_pages
         FROM documents`
      )
      .get() as {
      total_posts: number | null;
      drafts: number | null;
      published_this_month: number | null;
      total_pages: number | null;
    };

    return {
      totalPosts: Number(row.total_posts ?? 0),
      drafts: Number(row.drafts ?? 0),
      publishedThisMonth: Number(row.published_this_month ?? 0),
      totalPages: Number(row.total_pages ?? 0)
    };
  }

  /** 杩?N 涓湀鍙戝竷瓒嬪娍锛堟寜鏈堣仛鍚堬紝琛ュ叏绌烘湀浠斤級銆?*/
  publishTrend(months = 6): Array<{ month: string; count: number }> {
    const rows = this.db
      .prepare(
        `SELECT strftime('%Y-%m', published_at) AS month, COUNT(*) AS count
         FROM documents
         WHERE kind = 'post' AND deleted_at IS NULL AND published_at IS NOT NULL
           AND published_at >= date('now', '-' || ? || ' months')
         GROUP BY month
         ORDER BY month`
      )
      .all(months) as Array<{ month: string; count: number }>;

    const map = new Map(rows.map((row) => [row.month, Number(row.count)]));
    const result: Array<{ month: string; count: number }> = [];
    const now = new Date();
    for (let i = months - 1; i >= 0; i -= 1) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      result.push({ month: key, count: map.get(key) ?? 0 });
    }
    return result;
  }

  /** 分类占比。 */
  categoryDistribution(): Array<{ name: string; count: number }> {
    const rows = this.db
      .prepare(
        `SELECT je.value AS name, COUNT(*) AS count
         FROM documents, json_each(documents.categories) je
         WHERE kind = 'post' AND deleted_at IS NULL
         GROUP BY je.value
         ORDER BY count DESC`
      )
      .all() as Array<{ name: string; count: number }>;
    return rows.map((row) => ({ name: row.name, count: Number(row.count) }));
  }

  /** 鏍囩鏉冮噸銆?*/
  tagWeights(): Array<{ name: string; weight: number }> {
    const rows = this.db
      .prepare(
        `SELECT je.value AS name, COUNT(*) AS weight
         FROM documents, json_each(documents.tags) je
         WHERE kind = 'post' AND deleted_at IS NULL
         GROUP BY je.value
         ORDER BY weight DESC`
      )
      .all() as Array<{ name: string; weight: number }>;
    return rows.map((row) => ({ name: row.name, weight: Number(row.weight) }));
  }

  /** 鎵€鏈夋爣绛撅紙鍘婚噸锛屼緵缂栬緫鍣ㄥ閫夛級銆?*/
  allTags(): string[] {
    const rows = this.db
      .prepare(
        `SELECT DISTINCT je.value AS name
         FROM documents, json_each(documents.tags) je
         WHERE deleted_at IS NULL
         ORDER BY name`
      )
      .all() as Array<{ name: string }>;
    return rows.map((row) => row.name);
  }

  /** 所有分类（去重）。 */
  allCategories(): string[] {
    const rows = this.db
      .prepare(
        `SELECT DISTINCT je.value AS name
         FROM documents, json_each(documents.categories) je
         WHERE deleted_at IS NULL
         ORDER BY name`
      )
      .all() as Array<{ name: string }>;
    return rows.map((row) => row.name);
  }

  /** 最近发布的文章。 */
  recentPosts(limit = 5): DocumentSummary[] {
    const rows = this.db
      .prepare(
        `SELECT id, kind, title, slug, path, status, summary, cover, sticky, tags, categories,
                updated_at, published_at
         FROM documents
         WHERE kind = 'post' AND deleted_at IS NULL AND status = 'published'
         ORDER BY published_at DESC
         LIMIT ?`
      )
      .all(limit) as unknown as Array<DocumentRow>;
    return rows.map(rowToSummary);
  }

  /**
   * 列出所有「已发布」的文档（含 id / kind / path / title），
   * 用于与 GitHub 仓库对账：仓库中已不存在的内容需要改写状态。
   */
  listAllPublished(): Array<{ id: number; kind: DocumentKind; path: string; title: string }> {
    const rows = this.db
      .prepare(
        `SELECT id, kind, path, title
         FROM documents
         WHERE deleted_at IS NULL AND status = 'published'
         ORDER BY kind, path`
      )
      .all() as Array<{ id: number; kind: DocumentKind; path: string; title: string }>;
    return rows;
  }

  /** 回收站列表。 */
  trashed(kind?: DocumentKind): Paginated<DocumentSummary> {
    const params: Record<string, SQLInputValue> = {};
    let where = "deleted_at IS NOT NULL";
    if (kind) {
      where += " AND kind = @kind";
      params.kind = kind;
    }
    const rows = this.db
      .prepare(
        `SELECT id, kind, title, slug, path, status, summary, cover, sticky, tags, categories,
                updated_at, published_at
         FROM documents WHERE ${where}
         ORDER BY deleted_at DESC
         LIMIT 200`
      )
      .all(params) as unknown as Array<DocumentRow>;
    const list = rows.map(rowToSummary);
    return { list, total: list.length, page: 1, pageSize: list.length || 1 };
  }

  hardDelete(id: number): void {
    this.db.prepare("DELETE FROM documents WHERE id = ?").run(id);
  }
}

function keyToColumn(key: keyof DocumentRecord): string {
  const map: Record<string, string> = {
    frontMatter: "front_matter",
    repoPath: "repo_path",
    repoSha: "repo_sha",
    publishedAt: "published_at",
    deletedAt: "deleted_at"
  };
  return map[key] ?? key;
}

export class TodoRepository {
  constructor(private readonly db: DatabaseSync = getDatabase()) {}

  list(): Todo[] {
    const rows = this.db
      .prepare("SELECT * FROM todos ORDER BY done ASC, id DESC")
      .all() as Array<{
      id: number;
      title: string;
      done: number;
      created_at: string;
      updated_at: string;
    }>;
    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      done: Boolean(row.done),
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }));
  }

  create(title: string): Todo {
    const result = this.db.prepare("INSERT INTO todos (title) VALUES (?)").run(title);
    const row = this.db
      .prepare("SELECT * FROM todos WHERE id = ?")
      .get(Number(result.lastInsertRowid)) as {
      id: number;
      title: string;
      done: number;
      created_at: string;
      updated_at: string;
    };
    return {
      id: row.id,
      title: row.title,
      done: Boolean(row.done),
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  update(id: number, patch: { title?: string; done?: boolean }): Todo {
    if (patch.title !== undefined) {
      this.db.prepare("UPDATE todos SET title = ?, updated_at = datetime('now') WHERE id = ?").run(
        patch.title,
        id
      );
    }
    if (patch.done !== undefined) {
      this.db
        .prepare("UPDATE todos SET done = ?, updated_at = datetime('now') WHERE id = ?")
        .run(patch.done ? 1 : 0, id);
    }
    const row = this.db.prepare("SELECT * FROM todos WHERE id = ?").get(id) as
      | { id: number; title: string; done: number; created_at: string; updated_at: string }
      | undefined;
    if (!row) throw new Error(`待办不存在: ${id}`);
    return {
      id: row.id,
      title: row.title,
      done: Boolean(row.done),
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  remove(id: number): void {
    this.db.prepare("DELETE FROM todos WHERE id = ?").run(id);
  }
}

export class DeployLogRepository {
  constructor(private readonly db: DatabaseSync = getDatabase()) {}

  list(limit = 20): DeployLog[] {
    const rows = this.db
      .prepare("SELECT * FROM deploy_logs ORDER BY id DESC LIMIT ?")
      .all(limit) as Array<{
      id: number;
      channel: DeployChannel;
      status: DeployStatus;
      message: string;
      trigger_by: string;
      created_at: string;
      finished_at: string | null;
    }>;
    return rows.map((row) => ({
      id: row.id,
      channel: row.channel,
      status: row.status,
      message: row.message,
      triggerBy: row.trigger_by,
      createdAt: row.created_at,
      finishedAt: row.finished_at
    }));
  }

  latest(): DeployLog | null {
    const row = this.db.prepare("SELECT * FROM deploy_logs ORDER BY id DESC LIMIT 1").get() as
      | {
          id: number;
          channel: DeployChannel;
          status: DeployStatus;
          message: string;
          trigger_by: string;
          created_at: string;
          finished_at: string | null;
        }
      | undefined;
    return row
      ? {
          id: row.id,
          channel: row.channel,
          status: row.status,
          message: row.message,
          triggerBy: row.trigger_by,
          createdAt: row.created_at,
          finishedAt: row.finished_at
        }
      : null;
  }

  create(channel: DeployChannel, message = "", triggerBy = "manual"): DeployLog {
    const result = this.db
      .prepare("INSERT INTO deploy_logs (channel, status, message, trigger_by) VALUES (?, 'pending', ?, ?)")
      .run(channel, message, triggerBy);
    const row = this.db
      .prepare("SELECT * FROM deploy_logs WHERE id = ?")
      .get(Number(result.lastInsertRowid)) as {
      id: number;
      channel: DeployChannel;
      status: DeployStatus;
      message: string;
      trigger_by: string;
      created_at: string;
      finished_at: string | null;
    };
    return {
      id: row.id,
      channel: row.channel,
      status: row.status,
      message: row.message,
      triggerBy: row.trigger_by,
      createdAt: row.created_at,
      finishedAt: row.finished_at
    };
  }

  finish(id: number, status: DeployStatus, message: string): DeployLog {
    this.db
      .prepare(
        "UPDATE deploy_logs SET status = ?, message = ?, finished_at = datetime('now') WHERE id = ?"
      )
      .run(status, message, id);
    const row = this.db.prepare("SELECT * FROM deploy_logs WHERE id = ?").get(id) as {
      id: number;
      channel: DeployChannel;
      status: DeployStatus;
      message: string;
      trigger_by: string;
      created_at: string;
      finished_at: string | null;
    };
    return {
      id: row.id,
      channel: row.channel,
      status: row.status,
      message: row.message,
      triggerBy: row.trigger_by,
      createdAt: row.created_at,
      finishedAt: row.finished_at
    };
  }
}

export class AssetRepository {
  constructor(private readonly db: DatabaseSync = getDatabase()) {}

  create(input: {
    cosKey: string;
    filename: string;
    folder: string;
    url: string;
    size: number;
    mime: string;
  }): Asset {
    this.db
      .prepare(
        `INSERT INTO assets (cos_key, filename, folder, url, size, mime)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(cos_key) DO UPDATE SET
           url = excluded.url, size = excluded.size, mime = excluded.mime`
      )
      .run(input.cosKey, input.filename, input.folder, input.url, input.size, input.mime);
    const row = this.db.prepare("SELECT * FROM assets WHERE cos_key = ?").get(input.cosKey) as {
      id: number;
      cos_key: string;
      filename: string;
      folder: string;
      url: string;
      size: number;
      mime: string;
      created_at: string;
    };
    return {
      id: row.id,
      cosKey: row.cos_key,
      filename: row.filename,
      folder: row.folder,
      url: row.url,
      size: row.size,
      mime: row.mime,
      createdAt: row.created_at
    };
  }

  list(folder?: string, page = 1, pageSize = 60): Paginated<Asset> {
    const where = folder ? "WHERE folder = ?" : "";
    const params: SQLInputValue[] = folder ? [folder] : [];
    const totalRow = this.db
      .prepare(`SELECT COUNT(*) AS count FROM assets ${where}`)
      .get(...params) as { count: number };
    const rows = this.db
      .prepare(
        `SELECT * FROM assets ${where} ORDER BY id DESC LIMIT ? OFFSET ?`
      )
      .all(...params, pageSize, (page - 1) * pageSize) as Array<{
      id: number;
      cos_key: string;
      filename: string;
      folder: string;
      url: string;
      size: number;
      mime: string;
      created_at: string;
    }>;
    return {
      list: rows.map((row) => ({
        id: row.id,
        cosKey: row.cos_key,
        filename: row.filename,
        folder: row.folder,
        url: row.url,
        size: row.size,
        mime: row.mime,
        createdAt: row.created_at
      })),
      total: totalRow.count,
      page,
      pageSize
    };
  }

  folders(): string[] {
    const rows = this.db
      .prepare("SELECT DISTINCT folder FROM assets ORDER BY folder")
      .all() as Array<{ folder: string }>;
    return rows.map((row) => row.folder).filter(Boolean);
  }

  remove(cosKey: string): void {
    this.db.prepare("DELETE FROM assets WHERE cos_key = ?").run(cosKey);
  }

  find(cosKey: string): Asset | null {
    const row = this.db.prepare("SELECT * FROM assets WHERE cos_key = ?").get(cosKey) as
      | {
          id: number;
          cos_key: string;
          filename: string;
          folder: string;
          url: string;
          size: number;
          mime: string;
          created_at: string;
        }
      | undefined;
    return row
      ? {
          id: row.id,
          cosKey: row.cos_key,
          filename: row.filename,
          folder: row.folder,
          url: row.url,
          size: row.size,
          mime: row.mime,
          createdAt: row.created_at
        }
      : null;
  }
}

export class SettingRepository {
  constructor(private readonly db: DatabaseSync = getDatabase()) {}

  all(): SettingRow[] {
    const rows = this.db
      .prepare("SELECT key, value, group_name, is_secret FROM settings ORDER BY group_name, key")
      .all() as Array<{ key: string; value: string; group_name: SettingGroup; is_secret: number }>;
    return rows.map((row) => ({
      key: row.key,
      value: row.value,
      group: row.group_name,
      isSecret: Boolean(row.is_secret)
    }));
  }

  byGroup(group: string): Record<string, string> {
    const rows = this.db
      .prepare("SELECT key, value FROM settings WHERE group_name = ?")
      .all(group) as Array<{ key: string; value: string }>;
    return Object.fromEntries(rows.map((row) => [row.key, row.value]));
  }

  get(key: string): string | null {
    const row = this.db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as
      | { value: string }
      | undefined;
    return row?.value ?? null;
  }

  set(key: string, value: string, group = "general", isSecret = false): void {
    this.db
      .prepare(
        `INSERT INTO settings (key, value, group_name, is_secret, updated_at)
         VALUES (?, ?, ?, ?, datetime('now'))
         ON CONFLICT(key) DO UPDATE SET
           value = excluded.value,
           group_name = excluded.group_name,
           is_secret = excluded.is_secret,
           updated_at = datetime('now')`
      )
      .run(key, value, group, isSecret ? 1 : 0);
  }

  setMany(entries: Record<string, string>, group: string, secretKeys: string[] = []): void {
    for (const [key, value] of Object.entries(entries)) {
      this.set(key, value, group, secretKeys.includes(key));
    }
  }

  remove(key: string): void {
    this.db.prepare("DELETE FROM settings WHERE key = ?").run(key);
  }
}

export class UserRepository {
  constructor(private readonly db: DatabaseSync = getDatabase()) {}

  findByUsername(username: string): { id: number; username: string; passwordHash: string; displayName: string } | null {
    const row = this.db
      .prepare("SELECT id, username, password_hash, display_name FROM users WHERE username = ?")
      .get(username) as
      | { id: number; username: string; password_hash: string; display_name: string }
      | undefined;
    return row
      ? {
          id: row.id,
          username: row.username,
          passwordHash: row.password_hash,
          displayName: row.display_name
        }
      : null;
  }

  create(username: string, passwordHash: string, displayName = ""): void {
    this.db
      .prepare("INSERT INTO users (username, password_hash, display_name) VALUES (?, ?, ?)")
      .run(username, passwordHash, displayName || username);
  }

  updatePassword(username: string, passwordHash: string): void {
    this.db.prepare("UPDATE users SET password_hash = ? WHERE username = ?").run(passwordHash, username);
  }

  count(): number {
    const row = this.db.prepare("SELECT COUNT(*) AS count FROM users").get() as { count: number };
    return row.count;
  }
}

export class ConfigSnapshotRepository {
  constructor(private readonly db: DatabaseSync = getDatabase()) {}

  /** 保存快照草稿（upsert）。 */
  save(path: string, content: string, baseSha: string | null): ConfigSnapshot {
    this.db
      .prepare(
        `INSERT INTO config_snapshots (path, content, base_sha, updated_at)
         VALUES (?, ?, ?, datetime('now'))
         ON CONFLICT(path) DO UPDATE SET
           content = excluded.content,
           base_sha = excluded.base_sha,
           updated_at = datetime('now')`
      )
      .run(path, content, baseSha);
    return this.get(path)!;
  }

  /** 读取单个快照草稿；不存在返回 null。 */
  get(path: string): ConfigSnapshot | null {
    const row = this.db
      .prepare("SELECT id, path, content, base_sha, updated_at FROM config_snapshots WHERE path = ?")
      .get(path) as
      | { id: number; path: string; content: string; base_sha: string | null; updated_at: string }
      | undefined;
    return row
      ? {
          id: row.id,
          path: row.path,
          content: row.content,
          baseSha: row.base_sha,
          updatedAt: row.updated_at
        }
      : null;
  }

  /** 列出所有有快照草稿的路径。 */
  listPaths(): string[] {
    const rows = this.db
      .prepare("SELECT path FROM config_snapshots ORDER BY path")
      .all() as Array<{ path: string }>;
    return rows.map((row) => row.path);
  }

  /** 删除快照草稿（发布成功后调用）。 */
  remove(path: string): void {
    this.db.prepare("DELETE FROM config_snapshots WHERE path = ?").run(path);
  }
}

