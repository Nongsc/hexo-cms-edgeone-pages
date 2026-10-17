/** 与后端一致的领域类型（前端视图模型）。 */

export type DocumentKind = "post" | "page";
export type DocumentStatus = "published" | "draft";

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

export interface Todo {
  id: number;
  title: string;
  done: boolean;
  createdAt: string;
  updatedAt: string;
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

export interface DashboardData {
  quick: {
    hexoVersion: string;
    theme: string;
    lastPushAt: string | null;
    pluginCount: number;
    totalPosts: number;
    blogUrl: string;
  };
  cards: { monthNew: number; drafts: number; todos: number; pages: number };
  charts: {
    publishTrend: Array<{ month: string; count: number }>;
    categories: Array<{ name: string; count: number }>;
    tags: Array<{ name: string; weight: number }>;
    recentPosts: Array<{ id: number; title: string; publishedAt: string | null; path: string }>;
  };
  detail: {
    todos: Todo[];
  };
}
