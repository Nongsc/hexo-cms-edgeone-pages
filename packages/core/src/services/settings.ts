/** SettingsService：系统设置与部署配置。 */

import type { ServiceContainer } from "./container";
import type { SettingGroup } from "../constants/index";
import { DEFAULT_SETTINGS, SETTING_GROUPS, SENSITIVE_SETTING_KEYS } from "../constants/index";
import { GitHubError } from "./github";
import { CosError } from "./cos";
import { maskSecret } from "../utils/common";
import { ValidationError } from "./document";
import type { DeployChannel } from "../types/index";

export class SettingsService {
  constructor(private readonly services: ServiceContainer) {}

  /** 首次启动时写入默认配置。 */
  ensureDefaults(): void {
    const groupOf = (key: string): SettingGroup => {
      if (key.startsWith("github.")) return "github";
      if (key.startsWith("cos.")) return "cos";
      if (key.startsWith("ai.")) return "ai";
      if (key.startsWith("deploy.")) return "deploy";
      return "general";
    };

    for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
      if (this.services.settings.get(key) === null) {
        this.services.settings.set(key, value, groupOf(key), SENSITIVE_SETTING_KEYS.includes(key as never));
      }
    }
  }

  /** 返回全部设置，敏感值打码。 */
  all(): Record<string, string> {
    const result: Record<string, string> = {};
    for (const row of this.services.settings.all()) {
      result[row.key] = row.isSecret && row.value ? maskSecret(row.value) : row.value;
    }
    return result;
  }

  /** 保存一组设置；值为掩码时保持原值不变。 */
  save(entries: Record<string, string>): void {
    for (const [key, value] of Object.entries(entries)) {
      if (value.includes("****")) {
        const current = this.services.settings.get(key);
        if (current) continue;
      }
      const group = this.groupOf(key);
      this.services.settings.set(key, value, group, SENSITIVE_SETTING_KEYS.includes(key as never));
    }
  }

  /** 测试 GitHub 连通性。 */
  async testGitHub(): Promise<{ ok: boolean; message: string; repo?: string }> {
    try {
      const repo = await this.services.github().getRepository();
      return { ok: true, message: `连接成功：${repo.fullName}`, repo: repo.fullName };
    } catch (error) {
      if (error instanceof GitHubError) {
        return { ok: false, message: error.message };
      }
      return { ok: false, message: (error as Error).message };
    }
  }

  /** 测试 COS 连通性（列出根目录 1 个对象）。 */
  async testCos(): Promise<{ ok: boolean; message: string; diagnosis?: string }> {
    if (!this.services.settings.get("cos.bucket")) {
      return { ok: false, message: "未配置 COS 存储桶，请先填写「存储桶名称」与所属地域" };
    }
    if (!this.services.settings.get("cos.secretId") || !this.services.settings.get("cos.secretKey")) {
      return { ok: false, message: "未配置 COS 密钥，请先填写 SecretId 与 SecretKey" };
    }
    try {
      await this.services.cos().listObjects("", 1);
      return { ok: true, message: "连接成功：可以访问存储桶" };
    } catch (error) {
      if (error instanceof CosError) {
        return { ok: false, message: error.message, diagnosis: error.diagnosis };
      }
      return { ok: false, message: (error as Error).message };
    }
  }

  /** 部署通道列表。 */
  deployChannels(): Array<{ value: DeployChannel; label: string; description: string }> {
    return [
      { value: "edgeone-pages", label: "EdgeOne Pages", description: "腾讯云 EdgeOne Pages" },
      { value: "github-pages", label: "GitHub Pages", description: "GitHub Pages" },
      { value: "cloudflare-pages", label: "Cloudflare Pages", description: "Cloudflare Pages" }
    ];
  }

  /** 保存部署通道配置。 */
  saveDeploy(channel: DeployChannel, config: Record<string, string>): void {
    this.services.settings.set("deploy.channel", channel, "deploy");
    for (const [key, value] of Object.entries(config)) {
      this.services.settings.set(`deploy.${key}`, value, "deploy");
    }
  }

  /** 账号信息（用户名 / 显示名）。 */
  account(): { username: string; displayName: string } {
    const username = process.env.CMS_ADMIN_USERNAME ?? "admin";
    return {
      username,
      displayName: process.env.CMS_ADMIN_DISPLAY_NAME ?? username
    };
  }

  /** 修改密码。 */
  changePassword(currentPassword: string, newPassword: string): void {
    if (newPassword.length < 8) {
      throw new ValidationError("新密码长度至少 8 位");
    }
    if (!/^[A-Za-z0-9!@#$%^&*()_+\-=]+$/.test(newPassword)) {
      throw new ValidationError("新密码只能包含字母、数字与常见符号");
    }
    const username = this.account().username;
    const user = this.services.users.findByUsername(username);
    if (!user) {
      this.services.users.create(username, currentPassword, username);
      this.services.users.updatePassword(username, newPassword);
      return;
    }
    if (user.passwordHash !== currentPassword) {
      throw new ValidationError("当前密码不正确");
    }
    this.services.users.updatePassword(username, newPassword);
  }

  private groupOf(key: string): SettingGroup {
    if (key.startsWith("github.")) return "github";
    if (key.startsWith("cos.")) return "cos";
    if (key.startsWith("ai.")) return "ai";
    if (key.startsWith("deploy.")) return "deploy";
    if (!SETTING_GROUPS.includes(key as SettingGroup)) return "general";
    return key as SettingGroup;
  }
}
