/**
 * ThemeService：主题的安装、卸载、启用、停用。
 *
 * 主题有两种来源：
 *   1. git clone：克隆到 themes/<name> 目录（如 themes/hexo-theme-ele）
 *   2. 命令行：npm/pnpm 安装主题包（如 hexo-theme-landscape，装在 node_modules）
 *
 * Hexo 的「当前主题」由博客仓库根目录 `_config.yml` 的 `theme` 字段决定：
 *   - npm 包 hexo-theme-xxx 的 theme 值是 xxx（去掉前缀）
 *   - git 目录的主题名是目录名本身（如 hexo-theme-ele）
 *
 * 因此「启用/停用」主题 = 修改 `_config.yml` 中的 `theme` 行并推送到 GitHub。
 * 修改采用行替换方式，保留 `_config.yml` 中的所有注释与格式。
 */

import type { ServiceContainer } from "./container";
import type { ThemeInfo, ThemeInstallInput } from "../types/index";
import { GitHubError } from "./github";
import { ValidationError } from "./document";

const SITE_CONFIG_PATH = "_config.yml";

export class ThemeService {
  constructor(private readonly services: ServiceContainer) {}

  /** 从 _config.yml 读取当前启用的主题名（缓存到 site.theme）。 */
  async readActiveTheme(): Promise<string> {
    const file = await this.services.github().getFile(SITE_CONFIG_PATH);
    if (file) {
      const theme = extractThemeValue(file.content);
      if (theme) {
        this.services.settings.set("site.theme", theme, "general");
        return theme;
      }
    }
    // 回退：GitHub 读取失败时用本地缓存
    return this.services.settings.get("site.theme") || "landscape";
  }

  /**
   * 已安装主题列表：合并 themes 目录（git）与 package.json 中
   * hexo-theme- 开头的包（npm），按主题名去重。
   */
  async list(): Promise<ThemeInfo[]> {
    const active = await this.readActiveTheme();
    const map = new Map<string, ThemeInfo>();

    // 1. themes/ 目录下的主题（git clone 安装）
    try {
      const entries = await this.services.github().listDirectory("themes");
      for (const entry of entries) {
        if (entry.type !== "dir") continue;
        const name = entry.path.split("/").pop() ?? entry.path;
        if (!name || name.startsWith(".")) continue;
        map.set(name, { name, source: "themes", active: name === active });
      }
    } catch (error) {
      if (!(error instanceof GitHubError && error.status === 404)) throw error;
    }

    // 2. package.json 中 hexo-theme- 开头的包（命令行安装）
    const pkg = await this.services.github().getFile("package.json");
    if (pkg) {
      try {
        const parsed = JSON.parse(pkg.content) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
        for (const [pkgName] of Object.entries({ ...(parsed.dependencies ?? {}), ...(parsed.devDependencies ?? {}) })) {
          if (!pkgName.startsWith("hexo-theme-")) continue;
          // hexo-theme-landscape -> landscape
          const themeName = pkgName.slice("hexo-theme-".length);
          if (!themeName) continue;
          if (!map.has(themeName)) {
            map.set(themeName, { name: themeName, source: "npm", active: themeName === active });
          }
        }
      } catch {
        // package.json 解析失败时忽略
      }
    }

    return [...map.values()].sort((a, b) => {
      if (a.active !== b.active) return a.active ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }

  /**
   * 已安装的 Hexo 插件列表（从仓库 package.json 筛选 hexo- 开头的包，
   * 排除 hexo-theme- 前缀的主题包）。插件装在 package.json 即被 Hexo
   * 自动加载，无需「启用/停用」。
   */
  async listPlugins(): Promise<Array<{ name: string; version: string; source: "dependencies" | "devDependencies" }>> {
    const file = await this.services.github().getFile("package.json");
    if (!file) return [];

    let parsed: { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
    try {
      parsed = JSON.parse(file.content);
    } catch {
      return [];
    }

    const result: Array<{ name: string; version: string; source: "dependencies" | "devDependencies" }> = [];
    const push = (deps: Record<string, string> | undefined, source: "dependencies" | "devDependencies") => {
      for (const [name, version] of Object.entries(deps ?? {})) {
        if (name.startsWith("hexo-") && !name.startsWith("hexo-theme-")) {
          result.push({ name, version, source });
        }
      }
    };
    push(parsed.dependencies, "dependencies");
    push(parsed.devDependencies, "devDependencies");

    return result.sort((a, b) => a.name.localeCompare(b.name));
  }

  /** 触发主题安装工作流。 */
  async install(input: ThemeInstallInput): Promise<{ workflow: string; message: string }> {
    if (!this.services.settings.get("github.token")) {
      throw new ValidationError("未配置 GitHub Token，无法触发主题安装。请先完成 GitHub 关联仓库设置。");
    }

    const workflow = "install-theme.yml";
    const inputs: Record<string, string> = {
      install_method: input.installMethod
    };

    if (input.installMethod === "git") {
      if (!input.themeUrl?.trim()) {
        throw new ValidationError("请填写主题的 git clone 地址");
      }
      if (!input.themeName?.trim()) {
        throw new ValidationError("请填写主题目录名");
      }
      inputs.theme_url = input.themeUrl.trim();
      inputs.theme_name = input.themeName.trim().replace(/[/\\]/g, "");
      if (input.themeBranch?.trim()) {
        inputs.theme_branch = input.themeBranch.trim();
      }
    } else {
      if (!input.packageName?.trim()) {
        throw new ValidationError("请填写主题的 npm/pnpm 包名");
      }
      inputs.package_name = input.packageName.trim();
    }

    if (input.dependencies?.trim()) {
      inputs.dependencies = input.dependencies.trim();
    }
    if (input.packageManager && input.packageManager !== "npm") {
      inputs.package_manager = input.packageManager;
    }

    try {
      await this.services.github().dispatchWorkflow(workflow, inputs);
      const methodLabel = input.installMethod === "git" ? "git clone" : "命令行安装";
      const nameLabel = input.installMethod === "git" ? input.themeName : input.packageName;
      return {
        workflow,
        message: `已触发主题安装工作流（${methodLabel}），正在安装「${nameLabel}」。可在 GitHub Actions 中查看进度。`
      };
    } catch (error) {
      if (error instanceof GitHubError) {
        throw new ValidationError(`触发失败：${error.message}（请确认仓库已配置 ${workflow} 工作流）`);
      }
      throw error;
    }
  }

  /**
   * 卸载主题：触发工作流删除。
   * @param name  主题名（npm 主题为去掉前缀后的名字，如 landscape）
   * @param source 安装来源（决定卸载方式）
   */
  async uninstall(name: string, source: "themes" | "npm"): Promise<{ workflow: string; message: string }> {
    if (!name?.trim()) {
      throw new ValidationError("缺少主题名称");
    }
    if (!this.services.settings.get("github.token")) {
      throw new ValidationError("未配置 GitHub Token，无法卸载主题。请先完成 GitHub 关联仓库设置。");
    }
    const active = await this.readActiveTheme();
    if (name === active) {
      throw new ValidationError("不能卸载当前正在使用的主题，请先切换到其他主题");
    }

    const workflow = "manage-theme.yml";
    const inputs: Record<string, string> = {
      action: "uninstall",
      uninstall_method: source === "npm" ? "npm" : "git",
      theme_name: name.trim().replace(/[/\\]/g, "")
    };
    if (source === "npm") {
      inputs.package_name = `hexo-theme-${name.trim()}`;
    }

    try {
      await this.services.github().dispatchWorkflow(workflow, inputs);
      return {
        workflow,
        message: `已触发卸载工作流，正在卸载主题「${name}」。可在 GitHub Actions 中查看进度。`
      };
    } catch (error) {
      if (error instanceof GitHubError) {
        throw new ValidationError(`触发失败：${error.message}（请确认仓库已配置 ${workflow} 工作流）`);
      }
      throw error;
    }
  }

  /**
   * 启用主题：修改 _config.yml 的 theme 字段并推送到 GitHub。
   */
  async enable(name: string): Promise<void> {
    const themeName = name.trim();
    if (!themeName) {
      throw new ValidationError("缺少主题名称");
    }
    await this.writeConfigTheme(themeName);
  }

  /** 停用当前主题：把 _config.yml 的 theme 切换回默认 landscape。 */
  async disable(): Promise<string> {
    await this.writeConfigTheme("landscape");
    return "landscape";
  }

  // ---------------------------------------------------------------------------
  // 私有：读写 _config.yml 的 theme 行（保留注释与格式）
  // ---------------------------------------------------------------------------

  /** 把 _config.yml 的 theme 值改为指定主题，推送到 GitHub。 */
  private async writeConfigTheme(themeName: string): Promise<void> {
    if (!this.services.settings.get("github.token")) {
      throw new ValidationError("未配置 GitHub Token，无法切换主题。请先完成 GitHub 关联仓库设置。");
    }

    const file = await this.services.github().getFile(SITE_CONFIG_PATH);
    const current = file?.content ?? "";
    const updated = replaceThemeValue(current, themeName);

    try {
      await this.services.github().putFile(
        SITE_CONFIG_PATH,
        updated,
        `chore(config): 切换主题为 ${themeName}`
      );
    } catch (error) {
      if (error instanceof GitHubError) {
        throw new ValidationError(`切换主题失败：${error.message}`);
      }
      throw error;
    }
    // 同步本地缓存
    this.services.settings.set("site.theme", themeName, "general");
  }
}

/**
 * 从 _config.yml 文本中提取 theme 值。
 * 匹配 `theme: xxx` 行，返回 xxx；不存在返回 null。
 */
function extractThemeValue(content: string): string | null {
  const match = /^theme:\s*(\S+)\s*$/m.exec(content);
  if (!match) return null;
  const value = match[1].trim();
  // 去掉可能的引号
  return value.replace(/^["']|["']$/g, "");
}

/**
 * 替换 _config.yml 中的 theme 行，保留所有注释与其他内容。
 * 若不存在 theme 行，则在文件末尾追加。
 */
function replaceThemeValue(content: string, themeName: string): string {
  const lines = content.split("\n");
  let replaced = false;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    // 只替换顶层的 theme: 行（非注释、非缩进）
    if (/^theme:\s*.*$/.test(line)) {
      lines[i] = `theme: ${themeName}`;
      replaced = true;
      break;
    }
  }
  if (!replaced) {
    // 没有 theme 行，在末尾追加（确保前面有空行）
    while (lines.length > 0 && lines[lines.length - 1].trim() === "") {
      lines.pop();
    }
    lines.push("", `theme: ${themeName}`, "");
  }
  return lines.join("\n");
}
