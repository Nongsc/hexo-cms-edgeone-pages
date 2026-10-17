/** DashboardService：主页四层布局所需的全部数据。 */

import type { ServiceContainer } from "./container";
import { GitHubError } from "./github";

export interface DashboardData {
  /** 第一层：速览状态。 */
  quick: {
    hexoVersion: string;
    theme: string;
    lastPushAt: string | null;
    pluginCount: number;
    totalPosts: number;
    blogUrl: string;
  };
  /** 第二层：统计卡片。 */
  cards: {
    monthNew: number;
    drafts: number;
    todos: number;
    pages: number;
  };
  /** 第三层：图表。 */
  charts: {
    publishTrend: Array<{ month: string; count: number }>;
    categories: Array<{ name: string; count: number }>;
    tags: Array<{ name: string; weight: number }>;
    recentPosts: Array<{
      id: number;
      title: string;
      publishedAt: string | null;
      path: string;
    }>;
  };
  /** 第四层：待办。 */
  detail: {
    todos: Array<{ id: number; title: string; done: boolean; createdAt: string }>;
  };
}

export class DashboardService {
  constructor(private readonly services: ServiceContainer) {}

  async load(): Promise<DashboardData> {
    const stats = this.services.documents.stats();
    const theme = this.services.settings.get("site.theme") || "landscape";

    return {
      quick: {
        hexoVersion: await this.readHexoVersion(),
        theme,
        lastPushAt: await this.readLastPushAt(),
        pluginCount: await this.countPlugins(),
        totalPosts: stats.totalPosts,
        blogUrl: this.services.settings.get("site.url") || ""
      },
      cards: {
        monthNew: stats.publishedThisMonth,
        drafts: stats.drafts,
        todos: this.services.todos.list().filter((todo) => !todo.done).length,
        pages: stats.totalPages
      },
      charts: {
        publishTrend: this.services.documents.publishTrend(6),
        categories: this.services.documents.categoryDistribution(),
        tags: this.services.documents.tagWeights(),
        recentPosts: this.services.documents.recentPosts(5)
      },
      detail: {
        todos: this.services.todos.list()
      }
    };
  }

  /** 从 package.json 读取 Hexo 版本。 */
  private async readHexoVersion(): Promise<string> {
    const fallback = process.env.CMS_HEXO_VERSION ?? "7.x";
    if (!this.services.settings.get("github.token")) return fallback;
    try {
      const file = await this.services.github().getFile("package.json");
      if (!file) return fallback;
      const parsed = JSON.parse(file.content) as {
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      };
      return parsed.dependencies?.hexo ?? parsed.devDependencies?.hexo ?? fallback;
    } catch (error) {
      if (error instanceof GitHubError) return fallback;
      throw error;
    }
  }

  /** 读取上一次推送 GitHub 的时间（最新提交时间）。 */
  private async readLastPushAt(): Promise<string | null> {
    if (!this.services.settings.get("github.token")) return null;
    try {
      const commits = await this.services.github().listCommits(1);
      return commits[0]?.committedAt ?? null;
    } catch (error) {
      if (error instanceof GitHubError) return null;
      throw error;
    }
  }

  /** 统计已安装的 Hexo 插件数量（package.json 中 hexo-* 依赖，不含主题包）。 */
  private async countPlugins(): Promise<number> {
    if (!this.services.settings.get("github.token")) return 0;
    try {
      const file = await this.services.github().getFile("package.json");
      if (!file) return 0;
      const parsed = JSON.parse(file.content) as {
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      };
      let count = 0;
      const push = (deps: Record<string, string> | undefined) => {
        for (const name of Object.keys(deps ?? {})) {
          if (name.startsWith("hexo-") && !name.startsWith("hexo-theme-")) {
            count += 1;
          }
        }
      };
      push(parsed.dependencies);
      push(parsed.devDependencies);
      return count;
    } catch {
      return 0;
    }
  }
}
