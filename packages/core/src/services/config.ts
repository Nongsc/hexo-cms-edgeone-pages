/**
 * ConfigService：YAML 配置管理（站点 _config.yml 与主题 _config.<theme>.yml）。
 *
 * 快照草稿工作流：
 *   1. 列出配置文件列表；
 *   2. 编辑内容 →「保存草稿」写入 SQLite 的 config_snapshots 表（不推送）；
 *   3. 「发布」把草稿推送到 GitHub 仓库，成功后清除草稿。
 */

import type { ServiceContainer } from "./container";
import type { ConfigSnapshot } from "../types/index";
import { GitHubError } from "./github";
import { ValidationError } from "./document";

export interface ConfigFileInfo {
  path: string;
  kind: "site" | "theme";
  label: string;
  hasDraft: boolean;
}

export class ConfigService {
  constructor(private readonly services: ServiceContainer) {}

  /** 列出可编辑的配置文件（GitHub 仓库中的 _config*.yml + 本地草稿）。 */
  async listFiles(): Promise<ConfigFileInfo[]> {
    const currentTheme = this.services.settings.get("site.theme") || "landscape";
    const draftPaths = new Set(this.services.configSnapshots.listPaths());

    // 从仓库根目录读取所有 _config*.yml / _config*.yaml，与仓库实际内容同步
    let rootEntries: Array<{ path: string; type: string }> = [];
    try {
      rootEntries = await this.services.github().listDirectory("");
    } catch {
      // 仓库根目录不可读时回退到 tree
      const tree = await this.services.github().getTree();
      rootEntries = tree
        .filter((entry) => entry.type === "blob" && !entry.path.includes("/"))
        .map((entry) => ({ path: entry.path, type: "file" }));
    }

    // GitHub 上已存在的配置文件路径集合
    const repoPaths = new Set(
      rootEntries
        .filter((entry) => entry.type === "file" || entry.type === "blob")
        .map((entry) => entry.path)
        .filter((path) => /^_config(\.\S+)?\.ya?ml$/i.test(path))
    );

    // 合并：GitHub 已有 + 本地草稿（新建但尚未发布的配置）
    const allPaths = new Set<string>([...repoPaths, ...draftPaths]);

    const sortedPaths = [...allPaths].sort((a, b) => {
      if (a === "_config.yml" || a === "_config.yaml") return -1;
      if (b === "_config.yml" || b === "_config.yaml") return 1;
      return a.localeCompare(b);
    });

    const result: ConfigFileInfo[] = [];
    for (const path of sortedPaths) {
      const kind: "site" | "theme" =
        path === "_config.yml" || path === "_config.yaml" ? "site" : "theme";
      const label = this.labelOf(path, kind, currentTheme);
      result.push({ path, kind, label, hasDraft: draftPaths.has(path) });
    }
    return result;
  }

  /** 为配置文件生成可读标签。 */
  private labelOf(path: string, kind: "site" | "theme", currentTheme: string): string {
    if (kind === "site") return "站点配置 (hexo/config)";
    const match = /^_config\.(.+?)\.ya?ml$/i.exec(path);
    const themeName = match?.[1] ?? path;
    const active = themeName === currentTheme ? "（当前使用）" : "";
    return `主题配置 ${themeName}${active}`;
  }

  /** 读取配置内容：优先返回快照草稿，否则返回 GitHub 上的内容。 */
  async read(path: string): Promise<{ path: string; content: string; sha: string | null; fromDraft: boolean }> {
    const draft = this.services.configSnapshots.get(path);
    if (draft) {
      return { path, content: draft.content, sha: draft.baseSha, fromDraft: true };
    }
    const file = await this.services.github().getFile(path);
    return { path, content: file?.content ?? "", sha: file?.sha ?? null, fromDraft: false };
  }

  /** 保存快照草稿到数据库（不推送）。 */
  saveDraft(path: string, content: string): ConfigSnapshot {
    const github = this.services.github();
    const existing = this.services.configSnapshots.get(path);
    // 草稿的 base_sha 记录编辑开始时 GitHub 上的版本，用于发布时校验
    const baseSha = existing?.baseSha ?? null;
    return this.services.configSnapshots.save(path, content, baseSha);
  }

  /**
   * 发布：把快照草稿推送到 GitHub。
   * 若没有草稿，则视为直接推送当前内容。
   */
  async publish(path: string, content: string): Promise<void> {
    if (!this.services.settings.get("github.token")) {
      throw new ValidationError("未配置 GitHub Token，无法推送配置。请先完成 GitHub 关联仓库设置。");
    }
    try {
      await this.services.github().putFile(path, content, `chore(config): 更新 ${path}`);
    } catch (error) {
      if (error instanceof GitHubError) {
        throw new ValidationError(`推送配置失败：${error.message}`);
      }
      throw error;
    }
    // 发布成功后清除草稿
    this.services.configSnapshots.remove(path);
  }

  /** 丢弃草稿，恢复为 GitHub 上的版本。 */
  discard(path: string): void {
    this.services.configSnapshots.remove(path);
  }

  /**
   * 新建主题配置文件 _config.<themeName>.yml。
   * 全局 _config.yml 不允许新建（已存在）。
   */
  async createThemeConfig(themeName: string, content = ""): Promise<{ path: string }> {
    const name = themeName.trim().replace(/[/\\]/g, "");
    if (!name) {
      throw new ValidationError("主题名不能为空");
    }
    if (!/^[\w.-]+$/.test(name)) {
      throw new ValidationError("主题名只能包含字母、数字、下划线、点、连字符");
    }
    const path = `_config.${name}.yml`;

    // 已存在则报错
    const existing = await this.services.github().getFile(path);
    if (existing) {
      throw new ValidationError(`配置文件已存在: ${path}`);
    }

    // 先保存为草稿，待用户「发布」时推送到 GitHub
    this.services.configSnapshots.save(path, content, null);
    return { path };
  }

  /**
   * 删除配置文件。
   * 全局 _config.yml 不允许删除；其余主题配置可删。
   */
  async deleteConfig(path: string): Promise<void> {
    if (path === "_config.yml" || path === "_config.yaml") {
      throw new ValidationError("全局配置 _config.yml 不允许删除");
    }
    if (!this.services.settings.get("github.token")) {
      throw new ValidationError("未配置 GitHub Token，无法删除配置。请先完成 GitHub 关联仓库设置。");
    }

    const existing = await this.services.github().getFile(path);
    if (!existing) {
      // GitHub 上不存在，仅清理本地草稿
      this.services.configSnapshots.remove(path);
      return;
    }

    try {
      await this.services.github().deleteFile(path, `chore(config): 删除 ${path}`);
    } catch (error) {
      if (error instanceof GitHubError) {
        throw new ValidationError(`删除配置失败：${error.message}`);
      }
      throw error;
    }
    this.services.configSnapshots.remove(path);
  }
}
