/**
 * DocumentService：文章 / 页面的业务逻辑。
 *
 * 双写策略：
 *  - SQLite 为 CMS 的数据源（列表、检索、统计全部走本地库）；
 *  - 每次保存同时把 Markdown 文件提交到 GitHub 仓库，供 Hexo 构建消费。
 */

import {
  DOCUMENT_PATHS,
  DEFAULT_SETTINGS,
  SENSITIVE_SETTING_KEYS
} from "../constants/index";
import type { ServiceContainer } from "../services/container";
import { GitHubError } from "../services/github";
import type {
  Document,
  DocumentKind,
  DocumentStatus,
  DocumentSummary,
  ListQuery,
  Paginated
} from "../types/index";
import {
  extractSummary,
  normalizeList,
  parseMarkdown,
  serializeMarkdown,
  slugify,
  cleanFrontMatter
} from "../utils/markdown";
import { hexoDate, parseHexoDate } from "../utils/common";
import type { SettingRepository } from "../repositories/index";

export interface DocumentInput {
  title: string;
  content: string;
  status?: DocumentStatus;
  slug?: string;
  tags?: string[];
  categories?: string[];
  cover?: string;
  sticky?: boolean;
  summary?: string;
  frontMatter?: Record<string, unknown>;
  /** 页面专用：source/pages 下的相对路径。 */
  sourcePath?: string;
}

export class DocumentService {
  constructor(
    private readonly services: ServiceContainer,
    private readonly settings: SettingRepository = services.settings
  ) {}

  /** 分页列表。 */
  list(kind: DocumentKind, query: ListQuery = {}): Paginated<DocumentSummary> {
    return this.services.documents.list({ ...query, kind });
  }

  /** 单篇详情（含正文与 front-matter）。 */
  get(id: number): Document {
    const document = this.services.documents.findById(id);
    if (!document) throw new NotFoundError(`文档不存在: ${id}`);
    return document;
  }

  /** 新建。 */
  async create(kind: DocumentKind, input: DocumentInput): Promise<Document> {
    const title = input.title.trim() || "未命名";
    const rawSlug = (input.slug?.trim() || input.sourcePath?.trim() || slugify(title)).replace(/\.md$/i, "");
    const slug = this.normalizePageSlug(kind, rawSlug);
    const status: DocumentStatus = input.status ?? "draft";

    const parsed = parseMarkdown(input.content);
    const frontMatter = this.mergeFrontMatter(input, parsed.data, kind, status, true);
    const content = input.content.includes("---") ? parsed.content : input.content;
    const path = this.buildPath(kind, slug, status);

    const existing = this.services.documents.findByPath(path);
    if (existing) {
      throw new ValidationError(`路径已存在: ${path}`);
    }

    const repoPath = this.toRepoPath(path);
    const document = this.services.documents.insert({
      kind,
      title,
      slug,
      path,
      status,
      content,
      frontMatter: JSON.stringify(frontMatter),
      summary: input.summary?.trim() || extractSummary(content),
      cover: input.cover ?? String(frontMatter.cover ?? ""),
      sticky: input.sticky ?? Boolean(frontMatter.sticky ?? frontMatter.top) ? 1 : 0,
      tags: JSON.stringify(input.tags ?? normalizeList(frontMatter.tags)),
      categories: JSON.stringify(input.categories ?? normalizeList(frontMatter.categories)),
      repoPath,
      publishedAt: status === "published" ? hexoDate() : null,
      deletedAt: null
    });

    await this.pushToGitHub(document);
    return document;
  }

  /** 更新。 */
  async update(id: number, input: Partial<DocumentInput> & { status?: DocumentStatus }): Promise<Document> {
    const current = this.get(id);
    const status = input.status ?? current.status;
    const title = input.title?.trim() || current.title;
    const slug =
      input.slug !== undefined
        ? this.normalizePageSlug(current.kind, input.slug.trim().replace(/\.md$/i, ""))
        : input.title !== undefined
          ? (current.kind === "page" ? current.slug : slugify(title))
          : current.slug;

    const rawContent = input.content ?? this.rawContent(current);
    const parsed = parseMarkdown(rawContent);
    const content = rawContent.startsWith("---") ? parsed.content : rawContent;
    const frontMatter = this.mergeFrontMatter(
      { ...current, ...input } as DocumentInput,
      parsed.data,
      current.kind,
      status,
      false
    );

    // 重新计算路径：仅当 slug / 标题 / 状态发生变化时。
    let path = current.path;
    if (input.slug !== undefined || input.title !== undefined || status !== current.status) {
      path = this.buildPath(current.kind, slug, status);
    }

    const document = this.services.documents.update(id, {
      title,
      slug,
      path,
      status,
      content,
      frontMatter: JSON.stringify(frontMatter),
      summary: input.summary?.trim() || extractSummary(content),
      cover: input.cover ?? String(frontMatter.cover ?? current.cover),
      sticky: (input.sticky ?? current.sticky) ? 1 : 0,
      tags: JSON.stringify(input.tags ?? normalizeList(frontMatter.tags)),
      categories: JSON.stringify(input.categories ?? normalizeList(frontMatter.categories)),
      repoPath: this.toRepoPath(path),
      publishedAt: status === "published" ? (current.publishedAt ?? hexoDate()) : null
    });

    // 标题 / 路径发生变化时，删除仓库中的旧文件。
    if (document.path !== current.path && current.repoPath) {
      await this.deleteFromGitHub(current.repoPath);
    }
    await this.pushToGitHub(document);
    return document;
  }

  /** 发布状态切换。 */
  async setStatus(id: number, status: DocumentStatus): Promise<Document> {
    return this.update(id, { status });
  }

  /** 软删除（进回收站）。 */
  async trash(id: number): Promise<Document> {
    const document = this.get(id);
    const trashed = this.services.documents.update(id, {
      deletedAt: new Date().toISOString(),
      status: "draft"
    });
    if (document.repoPath) {
      await this.deleteFromGitHub(document.repoPath).catch(() => undefined);
    }
    return trashed;
  }

  /** 从回收站恢复。 */
  async restore(id: number): Promise<Document> {
    const document = this.services.documents.findById(id);
    if (!document) throw new NotFoundError(`文档不存在: ${id}`);
    const restored = this.services.documents.update(id, { deletedAt: null });
    await this.pushToGitHub(restored).catch(() => undefined);
    return restored;
  }

  /** 彻底删除。 */
  async destroy(id: number): Promise<void> {
    const document = this.services.documents.findById(id);
    if (!document) throw new NotFoundError(`文档不存在: ${id}`);
    if (document.repoPath) {
      await this.deleteFromGitHub(document.repoPath).catch(() => undefined);
    }
    this.services.documents.hardDelete(id);
  }

  /** 回收站列表。 */
  trashed(kind?: DocumentKind): Paginated<DocumentSummary> {
    return this.services.documents.trashed(kind);
  }

  /** 编辑器可选的标签 / 分类。 */
  taxonomy(): { tags: string[]; categories: string[] } {
    return {
      tags: this.services.documents.allTags(),
      categories: this.services.documents.allCategories()
    };
  }

  /**
   * 从 GitHub 仓库同步到 SQLite。
   *
   * 识别范围（Hexo 标准结构）：
   *  - 文章：source/_posts/ 下的 .md
   *  - 草稿：source/_drafts/ 下的 .md（文章草稿）与子目录 index.md（页面草稿）
   *  - 页面：source/<name>/index.md（排除 _posts、_drafts、images 等特殊目录）
   *
   * 同步完成后做一次「对账」：以 GitHub 仓库为准，
   * 本地标记为「已发布」但仓库中已不存在的文档，改写为草稿。
   */
  async syncFromGitHub(): Promise<{ imported: number; updated: number; downgraded: number }> {
    const github = this.services.github();
    const tree = await github.getTree();

    /** 保留的特殊目录：不是页面，不能当作 page 处理。 */
    const RESERVED_DIRS = new Set(["_posts", "_drafts", "images", "img", "assets", "js", "css", "fonts"]);

    const interesting = tree.filter((entry) => {
      if (entry.type !== "blob") return false;

      // 文章与文章草稿
      if (entry.path.startsWith("source/_posts/") && entry.path.endsWith(".md")) return true;
      if (entry.path.startsWith("source/_drafts/") && entry.path.endsWith(".md")) return true;

      // 页面：source/<name>/index.md（排除保留目录与更深层级）
      if (entry.path.startsWith("source/") && entry.path.endsWith("/index.md")) {
        const relative = entry.path.slice("source/".length);
        const topDir = relative.split("/")[0];
        if (!relative.startsWith("_")) return true;
        if (RESERVED_DIRS.has(topDir)) return false;
        return true;
      }
      return false;
    });

    let imported = 0;
    let updated = 0;

    for (const entry of interesting) {
      const file = await github.getFile(entry.path);
      if (!file) continue;

      const kind: DocumentKind = this.kindOfRepoPath(entry.path);
      const status: DocumentStatus = this.statusOfRepoPath(entry.path);
      const parsed = parseMarkdown(file.content);
      const slug = this.slugOfRepoPath(entry.path, kind);

      const existing = this.services.documents.findByPath(entry.path);
      const payload = {
        kind,
        title: String(parsed.data.title ?? slug),
        slug,
        path: entry.path,
        status,
        content: parsed.content,
        frontMatter: JSON.stringify(cleanFrontMatter(parsed.data)),
        summary: extractSummary(parsed.content),
        cover: String(parsed.data.cover ?? ""),
        sticky: parsed.data.sticky ?? parsed.data.top ? 1 : 0,
        tags: JSON.stringify(normalizeList(parsed.data.tags)),
        categories: JSON.stringify(normalizeList(parsed.data.categories)),
        repoPath: entry.path,
        repoSha: entry.sha,
        publishedAt: status === "published" ? (dateString(parsed.data.date) ?? hexoDate()) : null,
        deletedAt: null
      };

      if (existing) {
        this.services.documents.update(existing.id, payload);
        updated += 1;
      } else {
        this.services.documents.insert(payload);
        imported += 1;
      }
    }

    // 对账：本地已发布、但 GitHub 已不存在的内容，降级为草稿。
    const publishedPaths = new Set(
      interesting
        .filter((entry) => !entry.path.startsWith("source/_drafts/"))
        .map((entry) => entry.path)
    );
    const downgraded = this.reconcilePublished(publishedPaths);

    return { imported, updated, downgraded };
  }

  /** 根据仓库路径判断文档类型。 */
  private kindOfRepoPath(path: string): DocumentKind {
    if (path.endsWith("/index.md") && !path.startsWith("source/_posts/") && !path.startsWith("source/_drafts/")) {
      return "page";
    }
    return "post";
  }

  /** 根据仓库路径判断状态。 */
  private statusOfRepoPath(path: string): DocumentStatus {
    return path.startsWith("source/_drafts/") ? "draft" : "published";
  }

  /** 根据仓库路径推导 slug。 */
  private slugOfRepoPath(path: string, kind: DocumentKind): string {
    if (kind === "page") {
      // source/about/index.md -> about
      const relative = path.replace(/^source\//, "").replace(/\/index\.md$/i, "");
      return relative;
    }
    return basename(path).replace(/\.md$/i, "");
  }

  /**
   * 把本地「已发布」但仓库 source/_posts、source/pages 中已不存在的文档
   * 改写为草稿（状态以 GitHub 为准）。
   */
  private reconcilePublished(publishedPaths: Set<string>): number {
    let downgraded = 0;
    for (const doc of this.services.documents.listAllPublished()) {
      if (!publishedPaths.has(doc.path)) {
        this.services.documents.update(doc.id, { status: "draft", publishedAt: null });
        downgraded += 1;
      }
    }
    return downgraded;
  }

  /** 读取站点级 Hexo 配置（_config.yml）与主题配置。 */
  async getConfig(kind: "site" | "theme"): Promise<{ path: string; content: string; sha: string | null }> {
    const path =
      kind === "site"
        ? "_config.yml"
        : `_config.${this.settings.get("site.theme") || "landscape"}.yml`;
    const file = await this.services.github().getFile(path);
    return { path, content: file?.content ?? "", sha: file?.sha ?? null };
  }

  async saveConfig(kind: "site" | "theme", content: string): Promise<void> {
    const path =
      kind === "site"
        ? "_config.yml"
        : `_config.${this.settings.get("site.theme") || "landscape"}.yml`;
    await this.services.github().putFile(path, content, `chore(config): 更新 ${path}`);
  }

  // ---------------------------------------------------------------------------

  private rawContent(document: Document): string {
    return serializeMarkdown(document.frontMatter, document.content);
  }

  /**
   * 根据 kind / slug / status 计算仓库中的标准路径（Hexo 标准结构）。
   *
   * - 文章已发布：source/_posts/<slug>.md
   * - 文章草稿：  source/_drafts/<slug>.md
   * - 页面已发布：source/<slug>/index.md（slug 可含子目录，如 about/team）
   * - 页面草稿：  source/_drafts/<slug>/index.md
   */
  private buildPath(kind: DocumentKind, slug: string, status: DocumentStatus): string {
    const base = status === "published" ? DOCUMENT_PATHS[kind].source : DOCUMENT_PATHS[kind].draft;
    if (kind === "page") {
      return `${base}/${slug}/index.md`;
    }
    return `${base}/${slug}.md`;
  }

  /**
   * 页面 slug 规范化：把用户输入（可含子目录、可带 index.md 后缀）
   * 规范化为不含前后斜杠、不含 index.md 的目录片段，如 "about/team"。
   * 文章忽略此参数。
   */
  private normalizePageSlug(kind: DocumentKind, slug: string): string {
    if (kind !== "page") return slug;
    return slug
      .replace(/\/index\.md$/i, "")
      .replace(/\.md$/i, "")
      .replace(/^\/+|\/+$/g, "")
      .split("/")
      .filter(Boolean)
      .join("/");
  }

  /**
   * 从已存在的页面路径中提取 slug（去掉 source/ 前缀与 /index.md 后缀）。
   * 例如 "source/about/index.md" -> "about"；文章返回原 slug。
   */
  private extractPageSlug(kind: DocumentKind, path: string): string {
    if (kind !== "page") return "";
    const relative = path
      .replace(/^source\//, "")
      .replace(/\/index\.md$/i, "");
    return relative;
  }

  private toRepoPath(path: string): string {
    return path;
  }

  private mergeFrontMatter(
    input: DocumentInput,
    parsed: Record<string, unknown>,
    kind: DocumentKind,
    status: DocumentStatus,
    isCreate: boolean
  ): Record<string, unknown> {
    const now = hexoDate();
    const base: Record<string, unknown> = { ...parsed, ...(input.frontMatter ?? {}) };

    base.title = input.title?.trim() || String(base.title ?? "未命名");
    base.tags = input.tags ?? normalizeList(base.tags);
    base.categories = input.categories ?? normalizeList(base.categories);

    if (isCreate) {
      base.date = base.date ?? now;
    } else {
      base.updated = now;
    }
    if (kind === "post") {
      base.date = dateString(base.date) ?? base.date;
    }
    if (input.cover !== undefined) base.cover = input.cover;
    if (input.sticky !== undefined) base.sticky = input.sticky;
    if (input.summary !== undefined) base.description = input.summary;

    if (status === "published") {
      delete base.published;
    } else {
      base.published = false;
    }

    return cleanFrontMatter(base);
  }

  private async pushToGitHub(document: Document): Promise<void> {
    if (!this.settings.get("github.token")) return;
    const raw = serializeMarkdown(document.frontMatter, document.content);
    try {
      await this.services.github().putFile(document.repoPath, raw, buildCommitMessage(document));
    } catch (error) {
      if (error instanceof GitHubError && error.status === 404) {
        throw new ValidationError(
          `GitHub 仓库路径不可写（${error.message}）。请检查 GitHub 关联仓库设置与 Token 权限。`
        );
      }
      throw error;
    }
  }

  private async deleteFromGitHub(repoPath: string): Promise<void> {
    if (!this.settings.get("github.token")) return;
    await this.services.github().deleteFile(repoPath, `chore(cms): 删除 ${repoPath}`);
  }
}

export function buildCommitMessage(document: Document): string {
  const verb = document.status === "published" ? "发布" : "保存草稿";
  const label = document.kind === "post" ? "文章" : "页面";
  return `${verb}${label}: ${document.title}`;
}

function basename(path: string): string {
  return path.split("/").pop() ?? path;
}

function dateString(value: unknown): string | null {
  const timestamp = parseHexoDate(value);
  return timestamp === null ? null : hexoDate(new Date(timestamp));
}

/** 业务异常基类。 */
export class ServiceError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

export class NotFoundError extends ServiceError {
  constructor(message: string) {
    super(message, 404);
  }
}

export class ValidationError extends ServiceError {
  constructor(message: string) {
    super(message, 422);
  }
}

export { DEFAULT_SETTINGS, SENSITIVE_SETTING_KEYS };
