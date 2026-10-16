/** DashboardService：主页四层布局所需的全部数据。 */

import type { ServiceContainer } from "./container";
import { parseMarkdown } from "../utils/markdown";
import { GitHubError } from "./github";

export interface DashboardData {
  /** 第一层：速览状态。 */
  quick: {
    hexoVersion: string;
    theme: string;
    lastDeployAt: string | null;
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
  /** 第四层：待办与部署信息。 */
  detail: {
    todos: Array<{ id: number; title: string; done: boolean; createdAt: string }>;
    deployLogs: Array<{
      id: number;
      channel: string;
      status: string;
      message: string;
      createdAt: string;
      finishedAt: string | null;
    }>;
  };
}

export class DashboardService {
  constructor(private readonly services: ServiceContainer) {}

  async load(): Promise<DashboardData> {
    const stats = this.services.documents.stats();
    const lastDeploy = this.services.deployLogs.latest();
    const theme = this.services.settings.get("site.theme") || "landscape";

    return {
      quick: {
        hexoVersion: await this.readHexoVersion(),
        theme,
        lastDeployAt: lastDeploy?.finishedAt ?? lastDeploy?.createdAt ?? null,
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
        todos: this.services.todos.list(),
        deployLogs: this.services.deployLogs.list(20)
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

  /** 统计启用的插件数量。 */
  private async countPlugins(): Promise<number> {
    if (!this.services.settings.get("github.token")) return 0;
    try {
      const file = await this.services.github().getFile("_config.yml");
      if (!file) return 0;
      const parsed = parseMarkdown(file.content);
      const plugins = parsed.data.plugins;
      if (Array.isArray(plugins)) return plugins.length;
      if (plugins && typeof plugins === "object") return Object.keys(plugins).length;
      return 0;
    } catch {
      return 0;
    }
  }
}
