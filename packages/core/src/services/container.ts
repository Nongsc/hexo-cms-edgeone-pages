/** 服务容器：集中装配 Repository 与外部客户端，供 Controller 依赖注入。 */

import { getDatabase } from "../db/sqlite";
import {
  AssetRepository,
  ConfigSnapshotRepository,
  DeployLogRepository,
  DocumentRepository,
  SettingRepository,
  TodoRepository,
  UserRepository
} from "../repositories/index";
import { CosClient, type CosConfig } from "./cos";
import { GitHubClient, type GitHubConfig } from "./github";
import type { DatabaseSync } from "node:sqlite";

export interface ServiceContainer {
  db: DatabaseSync;
  documents: DocumentRepository;
  todos: TodoRepository;
  deployLogs: DeployLogRepository;
  assets: AssetRepository;
  settings: SettingRepository;
  users: UserRepository;
  configSnapshots: ConfigSnapshotRepository;
  github: () => GitHubClient;
  cos: () => CosClient;
}

export function createServices(db: DatabaseSync = getDatabase()): ServiceContainer {
  const settings = new SettingRepository(db);

  let githubClient: GitHubClient | null = null;
  let cosClient: CosClient | null = null;

  const container: ServiceContainer = {
    db,
    documents: new DocumentRepository(db),
    todos: new TodoRepository(db),
    deployLogs: new DeployLogRepository(db),
    assets: new AssetRepository(db),
    settings,
    users: new UserRepository(db),
    configSnapshots: new ConfigSnapshotRepository(db),
    github() {
      if (!githubClient) {
        githubClient = new GitHubClient(readGitHubConfig(settings));
      }
      return githubClient;
    },
    cos() {
      if (!cosClient) {
        cosClient = new CosClient(readCosConfig(settings));
      }
      return cosClient;
    }
  };

  return container;
}

export function readGitHubConfig(settings: SettingRepository): GitHubConfig {
  return {
    owner: settings.get("github.owner") ?? "",
    repo: settings.get("github.repo") ?? "",
    branch: settings.get("github.branch") ?? "main",
    token: settings.get("github.token") ?? ""
  };
}

export function readCosConfig(settings: SettingRepository): CosConfig {
  return {
    bucket: settings.get("cos.bucket") ?? "",
    region: settings.get("cos.region") ?? "ap-guangzhou",
    secretId: settings.get("cos.secretId") ?? "",
    secretKey: settings.get("cos.secretKey") ?? "",
    sessionToken: settings.get("cos.sessionToken") ?? "",
    domain: settings.get("cos.domain") ?? "",
    folder: settings.get("cos.folder") ?? "images"
  };
}
