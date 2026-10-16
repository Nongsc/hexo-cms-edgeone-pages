/** 服务容器：集中装配 Repository 与外部客户端，供 Controller 依赖注入。 */

import { ensureDatabase, type AppDatabase } from "../db/sqlite";
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

export interface ServiceContainer {
  db: AppDatabase;
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

/** 异步创建服务容器（内部完成数据库初始化）。 */
export async function createServices(db?: AppDatabase): Promise<ServiceContainer> {
  const database = db ?? (await ensureDatabase());
  const settings = new SettingRepository(database);

  let githubClient: GitHubClient | null = null;
  let cosClient: CosClient | null = null;

  const container: ServiceContainer = {
    db: database,
    documents: new DocumentRepository(database),
    todos: new TodoRepository(database),
    deployLogs: new DeployLogRepository(database),
    assets: new AssetRepository(database),
    settings,
    users: new UserRepository(database),
    configSnapshots: new ConfigSnapshotRepository(database),
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
