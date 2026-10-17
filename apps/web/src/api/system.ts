/** 系统管理接口：设置、YAML 配置、主题、账号。 */

import { get, post, put, del } from "@/utils/http";

export interface SettingsMap {
  [key: string]: string;
}

export function getSettings(): Promise<SettingsMap> {
  return get<SettingsMap>("/settings");
}

export function saveSettings(entries: SettingsMap): Promise<SettingsMap> {
  return post<SettingsMap>("/settings", entries);
}

export function testGitHub(): Promise<{ ok: boolean; message: string; repo?: string }> {
  return post<{ ok: boolean; message: string; repo?: string }>("/settings/test-github");
}

export function testCos(): Promise<{ ok: boolean; message: string; diagnosis?: string }> {
  return post<{ ok: boolean; message: string; diagnosis?: string }>("/settings/test-cos");
}

// ---- 主题 ----
export interface ThemeInfo {
  name: string;
  source: "themes" | "npm";
  active: boolean;
}

export interface ThemeInstallPayload {
  installMethod: "git" | "npm";
  themeUrl?: string;
  themeName?: string;
  themeBranch?: string;
  packageName?: string;
  dependencies?: string;
  packageManager?: "npm" | "pnpm";
}

export function getThemes(): Promise<ThemeInfo[]> {
  return get<ThemeInfo[]>("/themes");
}

export interface ThemePluginInfo {
  name: string;
  version: string;
  source: "dependencies" | "devDependencies";
}

export function getThemePlugins(): Promise<ThemePluginInfo[]> {
  return get<ThemePluginInfo[]>("/themes/plugins");
}

export function installTheme(payload: ThemeInstallPayload): Promise<{ workflow: string; message: string }> {
  return post<{ workflow: string; message: string }>("/themes/install", payload);
}

export function uninstallTheme(name: string, source: "themes" | "npm"): Promise<{ workflow: string; message: string }> {
  return post<{ workflow: string; message: string }>("/themes/uninstall", { name, source });
}

export function enableTheme(name: string): Promise<null> {
  return post<null>("/themes/enable", { name });
}

export function disableTheme(): Promise<null> {
  return post<null>("/themes/disable");
}

// ---- YAML 配置（快照草稿 + 发布 + 新建/删除） ----
export interface ConfigFileInfo {
  path: string;
  kind: "site" | "theme";
  label: string;
  hasDraft: boolean;
}

export function listConfigFiles(): Promise<ConfigFileInfo[]> {
  return get<ConfigFileInfo[]>("/config");
}

/** 站点信息（只读）：从 _config.yml 解析。 */
export interface SiteInfo {
  title: string;
  url: string;
  description: string;
  theme: string;
}

export function getSiteInfo(): Promise<SiteInfo> {
  return get<SiteInfo>("/config/site-info");
}

export function createThemeConfig(themeName: string, content = ""): Promise<{ path: string }> {
  return post<{ path: string }>("/config", { themeName, content });
}

export function deleteConfig(path: string): Promise<null> {
  return del<null>(`/config/${encodeURIComponent(path)}`);
}

export function readConfig(path: string): Promise<{ path: string; content: string; sha: string | null; fromDraft: boolean }> {
  return get<{ path: string; content: string; sha: string | null; fromDraft: boolean }>(
    `/config/${encodeURIComponent(path)}`
  );
}

export function saveConfigDraft(path: string, content: string): Promise<null> {
  return post<null>(`/config/${encodeURIComponent(path)}/draft`, { content });
}

export function publishConfig(path: string, content: string): Promise<null> {
  return post<null>(`/config/${encodeURIComponent(path)}/publish`, { content });
}

export function discardConfigDraft(path: string): Promise<null> {
  return del<null>(`/config/${encodeURIComponent(path)}/draft`);
}

// ---- 兼容旧接口 ----
export function getYamlConfig(kind: "site" | "theme"): Promise<{ path: string; content: string; sha: string | null }> {
  return get<{ path: string; content: string; sha: string | null }>(`/settings/config/${kind}`);
}

export function saveYamlConfig(kind: "site" | "theme", content: string): Promise<null> {
  return put<null>(`/settings/config/${kind}`, { content });
}

export function getAccount(): Promise<{ username: string; displayName: string }> {
  return get<{ username: string; displayName: string }>("/settings/account");
}

export { changePassword } from "./auth";
