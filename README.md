# Hexo Pro CMS（EdgeOne Pages 版）

复刻 [Hexo-Pro](https://github.com/heywarms/hexo-pro) 后台管理能力，并重构为一个**纯 Web 应用**：
部署在腾讯云 EdgeOne Pages 上，与 Hexo 运行时、桌面端彻底解耦。

## 与原版 Hexo-Pro 的差异

| 能力 | Hexo-Pro（桌面端） | 本项目（EdgeOne Pages） |
| --- | --- | --- |
| 部署形态 | Electron 桌面应用 | 纯 Web：前端静态资源 + Edge Functions API |
| 内容读写 | 直接操作本地 Hexo 工程文件 | **GitHub API** 读写博客仓库（`source/_posts`、`source/_drafts`、`source/pages`、`_config.yml`） |
| 数据源 | 本地 SQLite 与文件系统混合 | **SQLite** 作为 CMS 唯一数据源（列表 / 检索 / 统计 / 待办 / 部署日志） |
| 图片存储 | 本地 `source/images` | **腾讯云 COS**，配置在「系统管理 → 图片设置」维护，CMS 不落盘 |
| UI | 自建后台 | 基于 **pure-admin** 规范重建（Vue3 + Element Plus + Pinia + Vue Router） |
| 编辑器 | 自研 Markdown 编辑器 | **monaco-editor-vue3** 分屏编辑 + 实时预览 |
| 架构 | 单体重构 | 严格 **MVC** 分层（Model / Service / Controller / Router） |
| 部署发布 | 本地 `hexo deploy` | 触发博客仓库的 GitHub Actions，发布到 EdgeOne Pages / GitHub Pages / Cloudflare Pages |

## 目录结构

```
hexo-pro-edgeone-pages/
├── packages/
│   └── core/                     # @hexo-pro/core：领域内核（可独立测试）
│       ├── src/
│       │   ├── db/sqlite.ts      #   Model：SQLite 连接与迁移（node:sqlite）
│       │   ├── repositories/     #   Model：数据访问层
│       │   ├── services/         #   Service：业务逻辑
│       │   │   ├── document.ts   #     文章 / 页面（双写 SQLite + GitHub）
│       │   │   ├── github.ts     #     GitHub API 客户端
│       │   │   ├── cos.ts        #     腾讯云 COS 客户端（TC3 签名）
│       │   │   ├── image.ts      #     图床
│       │   │   ├── dashboard.ts  #     仪表盘
│       │   │   ├── settings.ts   #     设置
│       │   │   ├── deploy.ts     #     部署
│       │   │   └── auth.ts       #     认证
│       │   ├── controllers/      #   （Controller 在 apps/api）
│       │   ├── types/            #   领域类型
│       │   ├── constants/        #   默认配置
│       │   └── utils/            #   Markdown / Front-Matter / 通用工具
│       └── tests/                #   单元测试（23 个用例）
├── apps/
│   ├── api/                      # @hexo-pro/api：Hono API（MVC 的 C + V）
│   │   ├── src/
│   │   │   ├── context.ts        #   依赖装配
│   │   │   ├── controllers/      #   Controller：参数校验、调用 Service
│   │   │   ├── router.ts         #   View：REST 路由与鉴权中间件
│   │   │   ├── server.ts         #   本地 Node 服务器
│   │   │   ├── edge.ts           #   EdgeOne Functions 入口
│   │   │   └── build-edge.ts     #   Edge bundle 打包脚本
│   │   └── tests/                #   集成测试（8 个用例）
│   └── web/                      # @hexo-pro/web：pure-admin 风格前端
│       ├── src/
│       │   ├── api/              #   API 客户端
│       │   ├── store/modules/    #   Pinia：user / app
│       │   ├── layout/           #   布局（侧边栏 + 顶栏）
│       │   ├── router/           #   路由与守卫
│       │   └── views/            #   页面
│       │       ├── login/        #     登录
│       │       ├── dashboard/    #     仪表盘（四层布局）
│       │       ├── posts/        #     文章列表
│       │       ├── editor/       #     Monaco 分屏编辑器
│       │       ├── pages/        #     页面管理
│       │       ├── images/       #     COS 图床
│       │       ├── recycle/      #     回收站
│       │       └── system/       #     设置 / 部署 / YAML / 主题 / 账号
│       └── vite.config.ts
├── deploy/
│   └── hexo-blog-deploy.yml      # 博客仓库的 CI 工作流模板
├── edgeone.json                  # EdgeOne Pages 部署配置
├── docs/                         # 文档
└── Hexo-Pro功能梳理.md            # 功能基线（原始资料）
```

## 快速开始

### 环境要求

- Node.js >= 22.5（使用内置 `node:sqlite`，无需原生编译）
- pnpm >= 9

### 安装

```bash
pnpm install
```

### 开发

```bash
# 同时启动前端 (5173) 与 API (8787)
pnpm dev

# 或分别启动
pnpm dev:api    # http://127.0.0.1:8787
pnpm dev:web    # http://127.0.0.1:5173
```

前端 Vite 已配置 `/api` 代理到 `http://127.0.0.1:8787`。

### 测试

```bash
pnpm test       # 31 个用例（core 23 + api 8）
```

### 构建

```bash
pnpm build      # 构建前端 + 打包 Edge Functions
```

## 首次配置

1. 访问 `http://127.0.0.1:5173`，使用管理员账号登录。
   - 默认账号由环境变量决定：`CMS_ADMIN_USERNAME`（默认 `admin`）、
     `CMS_ADMIN_PASSWORD`（默认 `admin123456`）。
   - **生产环境务必在 EdgeOne Pages 控制台修改这两个变量。**
2. 进入「系统管理 → 设置 → GitHub 关联仓库」，填写：
   - 仓库所有者、仓库名称、分支
   - Access Token（需要仓库 Contents 读写权限）
   - 点击「测试连接」验证
3. 进入「图片设置」，填写 COS 的 Bucket、Region、SecretId、SecretKey，
   点击「测试连接」验证。
4. 点击「文章管理 → 从 GitHub 同步」，把仓库现有 Markdown 导入 CMS。

## 部署到 EdgeOne Pages

详见 [docs/部署指南.md](./部署指南.md)。

简要步骤：

```bash
# 1. 本地构建验证
pnpm build

# 2. 推送到 Git 仓库，EdgeOne Pages 绑定该仓库
#    edgeone.json 中已声明：
#      buildCommand: pnpm install && pnpm --filter @hexo-pro/web run build
#      outputDirectory: apps/web/dist
#      functions.directory: apps/api/dist-edge
#      routes: /api/* -> Edge Functions；其余 -> index.html

# 3. 在 EdgeOne Pages 控制台配置环境变量
#    CMS_ADMIN_USERNAME / CMS_ADMIN_PASSWORD
```

## 架构说明

### MVC 分层

```
HTTP 请求
   │
   ▼
Router (apps/api/src/router.ts)          ← View：路由、CORS、鉴权中间件
   │
   ▼
Controller (apps/api/src/controllers/)   ← 参数校验、组装响应、错误映射
   │
   ▼
Service (packages/core/src/services/)    ← 业务规则、事务边界、外部调用编排
   │
   ├──► Repository (packages/core/src/repositories/)  ← SQL 访问
   │
   └──► GitHubClient / CosClient                      ← 外部 API
```

- **Model**：`packages/core/src/db` + `repositories` + `types`，只关心数据形状与持久化。
- **View**：`router.ts` 定义 REST 端点与鉴权；前端 `views/` 是用户可见的 View。
- **Controller**：只做协议适配（HTTP ↔ 领域对象），不含业务规则。

### 双写策略（SQLite + GitHub）

- **SQLite 是 CMS 的数据源**：列表、分页、搜索、统计、仪表盘图表全部走本地库，
  保证毫秒级响应与离线可用。
- **GitHub 是 Hexo 的输入**：每次保存 / 发布 / 删除，都会把 Markdown 文件
  提交到博客仓库，供 Hexo 构建消费。提交失败时会在 UI 明确提示。
- 首次绑定仓库时可执行「从 GitHub 同步」，把已有内容导入 SQLite。

### 为什么用 `node:sqlite`

Node.js 22.5+ 与 Edge Functions 的 Node runtime 都内置 `node:sqlite`，
因此无需 `better-sqlite3` 这类需要原生编译的依赖，Edge 部署体积更小、更稳定。

### 部署解耦

CMS 本身不执行 `hexo generate`（解耦后没有 Hexo 运行时）。
「部署」按钮通过 GitHub API 触发博客仓库的 `workflow_dispatch`，
由仓库内的 GitHub Actions 完成构建并发布到目标平台。
工作流模板见 [`deploy/hexo-blog-deploy.yml`](../deploy/hexo-blog-deploy.yml)。

## 功能对照表

| Hexo-Pro 功能 | 实现位置 | 状态 |
| --- | --- | --- |
| 文章列表（分页 / 排序 / 筛选） | `views/posts` + `services/document` | ✅ |
| 分屏 Markdown 编辑器 | `views/editor`（monaco-editor-vue3） | ✅ |
| 文章属性（Front-Matter） | `utils/markdown` + `views/editor` | ✅ |
| 自定义 Front-Matter 字段 | `utils/markdown.serializeMarkdown` | ✅ |
| 发布 / 草稿状态切换 | `services/document.setStatus` | ✅ |
| 删除 → 回收站 → 恢复 / 彻底删除 | `services/document` + `views/recycle` | ✅ |
| 页面管理（草稿 / 分类 / 页面） | `views/pages` | ✅ |
| COS 图床 CRUD + 目录管理 | `services/image` + `views/images` | ✅ |
| 主页四层布局 | `views/dashboard` | ✅ |
| 快捷操作与系统状态速览 | `views/dashboard` 第一层 | ✅ |
| 统计卡片 | `views/dashboard` 第二层 | ✅ |
| 可视化图表（趋势 / 分类 / 标签云 / Top5） | `views/dashboard` 第三层 | ✅ |
| 待办事项 + 系统信息 + 部署日志 | `views/dashboard` 第四层 | ✅ |
| YAML 配置管理（站点 / 主题） | `views/system/config` | ✅ |
| 部署（三个通道） | `services/deploy` + `views/system/deploy` | ✅ |
| 主题管理 | `views/system/themes` | ✅ |
| 设置（图片 / AI / GitHub） | `views/system/settings` | ✅ |
| 账号信息与密码修改 | `views/system/account` | ✅ |
| AI 创作助手 | 设置项已预留，能力边界待专项评估 | ⏳ |

## 待办与已知限制

- **AI 创作助手**：`ai.*` 配置项与开关已就绪，但续写 / 润色等能力尚未接入，
  需按功能梳理文档 T2 项做专项评估（模型选型、密钥轮换、用量控制）。
- **COS 签名**：使用 TC3-HMAC-SHA256 直连 COS XML API；若 Bucket 开启了
  更高的安全策略，可改为后端 STS 临时密钥下发。
- **多用户**：当前为单管理员模型（与 EdgeOne Pages 无服务器形态匹配）。
- **分页上限**：单页最大 100 条，避免 Edge Functions 响应过大。

## License

MIT
