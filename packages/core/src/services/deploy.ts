/**
 * DeployService：部署。
 *
 * 部署模式说明：
 *   用户博客通过 EdgeOne Makers 关联 GitHub 仓库实现自动部署——
 *   只要内容推送到仓库（push 事件），EdgeOne 就会自动构建发布。
 *
 * CMS 与 Hexo 运行时解耦后，CMS 不执行 `hexo generate`，而是：
 *   1. 每次保存文章/页面/配置时，已通过 GitHub API 推送内容到仓库，
 *      EdgeOne 会自动触发构建（无需额外操作）；
 *   2. 「手动部署」按钮 = 通过 GitHub API 创建一个空提交（内容不变），
 *      人为触发一次 push，让 EdgeOne 重新构建（例如主题/依赖变更后）。
 *
 * 本服务负责记录与查询部署日志。
 */

import type { ServiceContainer } from "./container";
import type { DeployChannel, DeployLog, DeployStatus } from "../types/index";
import { GitHubError } from "./github";
import { ValidationError } from "./document";

export class DeployService {
  constructor(private readonly services: ServiceContainer) {}

  /**
   * 触发部署：创建一个空提交，触发 EdgeOne Makers 的 push 自动构建。
   */
  async trigger(channel: DeployChannel = "edgeone-pages"): Promise<DeployLog> {
    const settings = this.services.settings;
    if (settings.get("deploy.channel") !== channel) {
      settings.set("deploy.channel", channel, "deploy");
    }

    const log = this.services.deployLogs.create(channel, "正在触发部署（创建空提交）…");

    if (!settings.get("github.token")) {
      return this.services.deployLogs.finish(
        log.id,
        "failed",
        "未配置 GitHub Token，无法触发部署。请在「系统管理 → 设置」中完成配置。"
      );
    }

    try {
      const result = await this.services.github().createEmptyCommit(
        "chore(deploy): 触发 EdgeOne 自动构建"
      );
      return this.services.deployLogs.finish(
        log.id,
        "success",
        `已推送空提交（${result.sha.slice(0, 7)}），EdgeOne Makers 检测到 push 后将自动构建并发布到 ${channel}。`
      );
    } catch (error) {
      const message =
        error instanceof GitHubError
          ? `触发失败：${error.message}`
          : `触发失败：${(error as Error).message}`;
      return this.services.deployLogs.finish(log.id, "failed", message);
    }
  }

  list(limit = 20): DeployLog[] {
    return this.services.deployLogs.list(limit);
  }

  latest(): DeployLog | null {
    return this.services.deployLogs.latest();
  }

  /** 手动记录一次外部部署结果（供 Webhook 回调使用）。 */
  record(channel: DeployChannel, status: DeployStatus, message: string, triggerBy = "manual"): DeployLog {
    const log = this.services.deployLogs.create(channel, message, triggerBy);
    return this.services.deployLogs.finish(log.id, status, message);
  }
}

export { ValidationError };
