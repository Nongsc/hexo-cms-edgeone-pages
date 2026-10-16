/** 领域模型类型定义。 */

export type DocumentKind = "post" | "page";
export type DocumentStatus = "published" | "draft";
export type DeployChannel = "github-pages" | "cloudflare-pages" | "edgeone-pages";
export type DeployStatus = "pending" | "running" | "success" | "failed";

/** 自定义 Front-Matter 字段。 */
export interface CustomFrontMatterField {
  key: string;
  type: "string" | "number" | "boolean";
  value: string | number | boolean;
}

/** 一篇文章 / 一个页面的完整视图。 */
export interface Document {
  id: number;
  kind: DocumentKind;
  title: string;
  slug: string;
  path: string;
  status: DocumentStatus;
  content: string;
  frontMatter: Record<string, unknown>;
  summary: string;
  cover: string;
  sticky: boolean;
  tags: string[];
  categories: string[];
  repoPath: string;
  repoSha: string | null;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
  deletedAt: string | null;
}

/** 列表行（不含正文，减少传输量）。 */
export interface DocumentSummary {
  id: number;
  kind: DocumentKind;
  title: string;
  slug: string;
  path: string;
  status: DocumentStatus;
  summary: string;
  cover: string;
  sticky: boolean;
  tags: string[];
  categories: string[];
  updatedAt: string;
  publishedAt: string | null;
}

export interface Todo {
  id: number;
  title: string;
  done: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface DeployLog {
  id: number;
  channel: DeployChannel;
  status: DeployStatus;
  message: string;
  triggerBy: string;
  createdAt: string;
  finishedAt: string | null;
}

export interface Asset {
  id: number;
  cosKey: string;
  filename: string;
  folder: string;
  url: string;
  size: number;
  mime: string;
  createdAt: string;
}

export interface SettingRow {
  key: string;
  value: string;
  group: string;
  isSecret: boolean;
}

export interface Paginated<T> {
  list: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ListQuery {
  kind?: DocumentKind;
  page?: number;
  pageSize?: number;
  keyword?: string;
  status?: DocumentStatus | "all";
  tag?: string;
  category?: string;
  sortBy?: "updatedAt" | "publishedAt" | "title";
  sortOrder?: "asc" | "desc";
}

/** 配置文件快照草稿（保存到数据库，未推送到 GitHub）。 */
export interface ConfigSnapshot {
  id: number;
  path: string;
  content: string;
  baseSha: string | null;
  updatedAt: string;
}

/** 主题安装方式：git clone 或命令行（npm/pnpm）安装。 */
export type ThemeInstallMethod = "git" | "npm";

/** 主题安装请求。 */
export interface ThemeInstallInput {
  /** 安装方式：git clone 或命令行安装（二选一）。 */
  installMethod: ThemeInstallMethod;
  /** git 方式：主题仓库 clone 地址。 */
  themeUrl?: string;
  /** git 方式：主题目录名。 */
  themeName?: string;
  /** git 方式：分支（可为空 = 默认分支）。 */
  themeBranch?: string;
  /** npm 方式：主题包名（如 hexo-theme-landscape）。 */
  packageName?: string;
  /** 额外需要安装的依赖包 / Hexo 插件（每行一个或多个，逗号/空格分隔）。 */
  dependencies?: string;
  /** 包管理器：npm 或 pnpm。 */
  packageManager?: "npm" | "pnpm";
}

/** 已安装主题条目。 */
export interface ThemeInfo {
  /** 主题名（Hexo site.theme 使用的名称，npm 包已去掉 hexo-theme- 前缀）。 */
  name: string;
  /** 安装来源：themes 目录（git clone）或 npm 包（命令行安装）。 */
  source: "themes" | "npm";
  /** 是否为当前启用的主题。 */
  active: boolean;
}
