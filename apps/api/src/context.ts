/**
 * 应用上下文：集中创建 services 与各 Controller，供 Router 装配。
 */

import {
  AuthService,
  ConfigService,
  createServices,
  DashboardService,
  DeployService,
  DocumentService,
  ImageService,
  SettingsService,
  ThemeService,
  type ServiceContainer
} from "@hexo-pro/core";

export interface AppContext {
  services: ServiceContainer;
  auth: AuthService;
  dashboard: DashboardService;
  deploy: DeployService;
  documents: DocumentService;
  images: ImageService;
  settings: SettingsService;
  config: ConfigService;
  theme: ThemeService;
}

export function createContext(dbPath?: string): AppContext {
  if (dbPath) process.env.CMS_DB_PATH = dbPath;

  const services = createServices();
  const settings = new SettingsService(services);
  settings.ensureDefaults();

  const auth = new AuthService(services, {
    username: process.env.CMS_ADMIN_USERNAME ?? "admin",
    password: process.env.CMS_ADMIN_PASSWORD ?? "admin123456"
  });
  auth.ensureAdminUser();

  return {
    services,
    auth,
    dashboard: new DashboardService(services),
    deploy: new DeployService(services),
    documents: new DocumentService(services),
    images: new ImageService(services),
    settings,
    config: new ConfigService(services),
    theme: new ThemeService(services)
  };
}
