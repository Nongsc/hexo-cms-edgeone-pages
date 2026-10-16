/** 常量与默认值。 */

import type { DocumentKind } from "../types/index";

/**
 * 各类型文档在仓库中的目录布局（Hexo 标准结构）。
 *
 * - 文章（post）：source/_posts/<slug>.md
 * - 草稿（draft）：source/_drafts/<slug>.md
 * - 页面（page）：source/<slug>/index.md（如 source/about/index.md）
 *   页面草稿：source/_drafts/<slug>/index.md
 */
export const DOCUMENT_PATHS: Record<DocumentKind, { source: string; draft: string }> = {
  post: { source: "source/_posts", draft: "source/_drafts" },
  page: { source: "source", draft: "source/_drafts" }
};

/** Hexo 默认文章模板的 front-matter 字段顺序。 */
export const DEFAULT_FRONT_MATTER = [
  "title",
  "date",
  "updated",
  "tags",
  "categories",
  "cover",
  "top",
  "sticky",
  "description"
];

export const DEFAULT_POST_TEMPLATE = `---
title: {{title}}
date: {{date}}
tags:
categories:
---

`;

export const SENSITIVE_SETTING_KEYS = [
  "github.token",
  "cos.secretId",
  "cos.secretKey",
  "cos.sessionToken",
  "ai.apiKey"
] as const;

export const SETTING_GROUPS = ["general", "github", "cos", "ai", "deploy"] as const;
export type SettingGroup = (typeof SETTING_GROUPS)[number];

export const DEFAULT_SETTINGS: Record<string, string> = {
  "site.title": "My Hexo Blog",
  "site.url": "",
  "site.description": "",
  "site.theme": "landscape",
  "site.postsPerPage": "10",
  "github.owner": "",
  "github.repo": "",
  "github.branch": "main",
  "github.token": "",
  "cos.bucket": "",
  "cos.region": "ap-guangzhou",
  "cos.secretId": "",
  "cos.secretKey": "",
  "cos.sessionToken": "",
  "cos.domain": "",
  "cos.folder": "images",
  "ai.enabled": "false",
  "ai.provider": "deepseek",
  "ai.baseUrl": "https://api.deepseek.com",
  "ai.model": "deepseek-chat",
  "ai.apiKey": "",
  "deploy.channel": "edgeone-pages",
  "deploy.githubPagesBranch": "gh-pages",
  "deploy.buildCommand": "hexo generate",
  "deploy.publishDir": "public"
};
