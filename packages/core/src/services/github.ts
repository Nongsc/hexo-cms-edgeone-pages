/**
 * GitHub API 客户端。
 *
 * CMS 通过它读写博客仓库内容，不接触本地文件系统。
 * 使用 Node 原生 fetch，Edge Functions 与 Node 22+ 通用。
 */

export interface GitHubConfig {
  owner: string;
  repo: string;
  branch: string;
  token: string;
  /** 覆盖 API 基地址，默认 https://api.github.com。 */
  apiBaseUrl?: string;
}

export interface GitHubContent {
  path: string;
  sha: string;
  content: string;
  encoding: "utf-8" | "base64";
}

export interface GitHubTreeEntry {
  path: string;
  type: "blob" | "tree";
  sha: string;
  size?: number;
}

export interface CommitResult {
  sha: string;
  htmlUrl: string;
}

export class GitHubError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body?: unknown
  ) {
    super(message);
    this.name = "GitHubError";
  }
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
}

export class GitHubClient {
  constructor(private readonly config: GitHubConfig) {}

  private get baseUrl(): string {
    return this.config.apiBaseUrl ?? "https://api.github.com";
  }

  private get repoUrl(): string {
    return `${this.baseUrl}/repos/${encodeURIComponent(this.config.owner)}/${encodeURIComponent(this.config.repo)}`;
  }

  private async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    if (!this.config.token) {
      throw new GitHubError("未配置 GitHub Token，请先在「系统管理 → 设置」中完成 GitHub 关联仓库设置", 401);
    }

    const response = await fetch(`${this.repoUrl}${path}`, {
      method: options.method ?? "GET",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${this.config.token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
        ...options.headers
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body)
    });

    if (response.status === 204) return undefined as T;

    const text = await response.text();
    const payload = text ? safeJsonParse(text) : undefined;

    if (!response.ok) {
      const message =
        (payload as { message?: string } | undefined)?.message ?? `GitHub 请求失败: ${response.status}`;
      throw new GitHubError(message, response.status, payload);
    }
    return payload as T;
  }

  /** 测试连通性并返回仓库信息。 */
  async getRepository(): Promise<{
    fullName: string;
    defaultBranch: string;
    private: boolean;
    description: string | null;
  }> {
    const data = await this.request<{
      full_name: string;
      default_branch: string;
      private: boolean;
      description: string | null;
    }>("");
    return {
      fullName: data.full_name,
      defaultBranch: data.default_branch,
      private: data.private,
      description: data.description
    };
  }

  /** 递归读取整个仓库文件树（用于首次同步）。 */
  async getTree(): Promise<GitHubTreeEntry[]> {
    const branch = await this.getBranch();
    const tree = await this.request<{ tree: GitHubTreeEntry[]; truncated: boolean }>(
      `/git/trees/${encodeURIComponent(branch.commit.sha)}?recursive=1`
    );
    return tree.tree;
  }

  async getBranch(): Promise<{ name: string; commit: { sha: string } }> {
    return this.request<{ name: string; commit: { sha: string } }>(
      `/branches/${encodeURIComponent(this.config.branch)}`
    );
  }

  /**
   * 列出分支最近提交（默认最近 1 条）。
   * 返回提交的 sha、提交时间与提交者信息，用于「上次推送时间」等展示。
   */
  async listCommits(perPage = 1): Promise<
    Array<{
      sha: string;
      message: string;
      committedAt: string | null;
      authorName: string;
    }>
  > {
    const data = await this.request<
      Array<{
        sha: string;
        commit: {
          message: string;
          author: { name: string; date: string | null };
          committer: { name: string; date: string | null };
        };
      }>
    >(`/commits?per_page=${perPage}&sha=${encodeURIComponent(this.config.branch)}`);
    return data.map((item) => ({
      sha: item.sha,
      message: item.commit.message,
      committedAt: item.commit.committer?.date ?? item.commit.author?.date ?? null,
      authorName: item.commit.committer?.name ?? item.commit.author?.name ?? ""
    }));
  }

  /** 读取单个文件内容。不存在时返回 null。 */
  async getFile(path: string): Promise<GitHubContent | null> {
    try {
      const data = await this.request<{ path: string; sha: string; content: string; encoding: string }>(
        `/contents/${encodePath(path)}?ref=${encodeURIComponent(this.config.branch)}`
      );
      const raw =
        data.encoding === "base64"
          ? decodeBase64ToUtf8(data.content)
          : (data.content as unknown as string);
      return { path: data.path, sha: data.sha, content: raw, encoding: "utf-8" };
    } catch (error) {
      if (error instanceof GitHubError && error.status === 404) return null;
      throw error;
    }
  }

  /** 列出目录。 */
  async listDirectory(path: string): Promise<Array<{ path: string; type: string; sha: string }>> {
    try {
      const data = await this.request<Array<{ path: string; type: string; sha: string }>>(
        `/contents/${encodePath(path)}?ref=${encodeURIComponent(this.config.branch)}`
      );
      return data;
    } catch (error) {
      if (error instanceof GitHubError && error.status === 404) return [];
      throw error;
    }
  }

  /**
   * 一次性提交多个文件变更（新增 / 修改 / 删除）。
   * 通过 Git Data API 的 tree + commit + ref 完成，避免多次 contents API 调用。
   */
  async commitChanges(
    changes: Array<{ path: string; content?: string; delete?: boolean; sha?: string }>,
    message: string
  ): Promise<CommitResult> {
    if (changes.length === 0) throw new GitHubError("没有需要提交的变更", 400);

    const branch = await this.getBranch();
    const baseTreeSha = branch.commit.sha;

    const tree: Array<Record<string, unknown>> = [];
    for (const change of changes) {
      if (change.delete) {
        tree.push({ path: change.path, mode: "100644", type: "blob", sha: null });
        continue;
      }
      const blob = await this.createBlob(change.content ?? "");
      tree.push({
        path: change.path,
        mode: "100644",
        type: "blob",
        sha: blob.sha
      });
    }

    const newTree = await this.request<{ sha: string }>("/git/trees", {
      method: "POST",
      body: { base_tree: baseTreeSha, tree }
    });

    const commit = await this.request<{ sha: string; html_url: string }>("/git/commits", {
      method: "POST",
      body: {
        message,
        tree: newTree.sha,
        parents: [baseTreeSha]
      }
    });

    await this.request(`/git/refs/heads/${encodeURIComponent(this.config.branch)}`, {
      method: "PATCH",
      body: { sha: commit.sha, force: false }
    });

    return { sha: commit.sha, htmlUrl: commit.html_url };
  }

  /** 触发 GitHub Actions 工作流（workflow_dispatch）。 */
  async dispatchWorkflow(workflow: string, inputs: Record<string, string>): Promise<void> {
    await this.request(`/actions/workflows/${encodeURIComponent(workflow)}/dispatches`, {
      method: "POST",
      body: { ref: this.config.branch, inputs }
    });
  }

  /**
   * 创建一个「空提交」（内容不变，只新增一个 commit）。
   * 用于触发监听 push 事件的自动部署（如 EdgeOne Makers Git 集成）。
   */
  async createEmptyCommit(message: string): Promise<CommitResult> {
    const branch = await this.getBranch();
    const baseTreeSha = branch.commit.sha;

    // 复用当前分支的 tree（内容不变），只新建一个 commit
    const commit = await this.request<{ sha: string; html_url: string }>("/git/commits", {
      method: "POST",
      body: {
        message,
        tree: baseTreeSha,
        parents: [baseTreeSha]
      }
    });

    await this.request(`/git/refs/heads/${encodeURIComponent(this.config.branch)}`, {
      method: "PATCH",
      body: { sha: commit.sha, force: false }
    });

    return { sha: commit.sha, htmlUrl: commit.html_url };
  }

  /** 便捷方法：写入 / 更新单个文件。 */
  async putFile(path: string, content: string, message: string): Promise<CommitResult> {
    const existing = await this.getFile(path);
    return this.commitChanges([{ path, content, sha: existing?.sha }], message);
  }

  /** 删除单个文件。 */
  async deleteFile(path: string, message: string): Promise<CommitResult> {
    const existing = await this.getFile(path);
    if (!existing) throw new GitHubError(`文件不存在: ${path}`, 404);
    return this.commitChanges([{ path, delete: true }], message);
  }

  private async createBlob(content: string): Promise<{ sha: string }> {
    return this.request<{ sha: string }>("/git/blobs", {
      method: "POST",
      body: {
        content: encodeUtf8ToBase64(content),
        encoding: "base64"
      }
    });
  }
}

function encodePath(path: string): string {
  return path
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function encodeUtf8ToBase64(text: string): string {
  return Buffer.from(text, "utf8").toString("base64");
}

function decodeBase64ToUtf8(base64: string): string {
  const normalized = base64.replace(/\s/g, "");
  return Buffer.from(normalized, "base64").toString("utf8");
}
