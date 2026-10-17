# Hexo Pro CMS（EdgeOne Pages 版）

复刻 [Hexo-Pro](https://github.com/heywarms/hexo-pro) 后台管理能力，重构为一个**纯 Web 应用**：部署在腾讯云 EdgeOne Pages 上，与 Hexo 运行时、桌面端彻底解耦。

## 与原版 Hexo-Pro 的差异

| 能力 | Hexo-Pro（桌面端） | 本项目（EdgeOne Pages） |
| --- | --- | --- |
| 部署形态 | Electron 桌面应用 | 纯 Web：前端静态资源 + Cloud Functions API |
| 内容读写 | 直接操作本地 Hexo 工程文件 | **GitHub API** 读写博客仓库（`source/_posts`、`source/_drafts`、页面、`_config*.yml`） |
| 数据源 | 本地 SQLite 与文件系统混合 | **SQLite** 作为 CMS 数据源（列表 / 检索 / 统计 / 待办 / 配置镜像） |
| 图片存储 | 本地 `source/images` | **腾讯云 COS**，CMS 不落盘 |
| UI | 自建后台 | 基于 **pure-admin** 规范重建（Vue3 + Element Plus + Pinia + Vue Router） |
| 编辑器 | 自研 Markdown 编辑器 | **monaco-editor-vue3** 分屏编辑 + 实时预览 |
| 架构 | 单体重构 | 严格 **MVC** 分层（Model / Service / Controller / Router） |
| 部署发布 | 本地 `hexo deploy` | 博客仓库关联 EdgeOne Makers / GitHub Actions 自动构建，push 即发布 |

## 技术栈

- **前端**：Vue 3 + TypeScript + Vite + Element Plus + Pinia + Vue Router + ECharts + monaco-editor-vue3 + VueWordCloud
- **后端**：Hono（MVC 分层）
- **持久化**：SQLite（Node ≥ 22.5 用内置 `node:sqlite`，Node 20 用 `sql.js` WASM 适配层，自动切换）
- **外部服务**：GitHub API（内容 / 配置 / 提交）、腾讯云 COS（图床 + 数据库托管，AWS SigV4 签名）
- **包管理**：pnpm workspace（monorepo）

## 目录结构

```
hexo-pro-edgeone-pages/
├── packages/
│   └── core/                     # @hexo-pro/core：领域内核（可独立测试）
│       ├── src/
│       │   ├── db/               #   Model：SQLite 连接、迁移、sql.js 适配器、COS 持久化
│       │   ├── repositories/     #   Model：数据访问层
│       │   ├── services/         #   Service：业务逻辑
│       │   │   ├── document.ts   #     文章 / 页面（双写 SQLite + GitHub）
│       │   │   ├── github.ts     #     GitHub API 客户端
│       │   │   ├── cos.ts        #     腾讯云 COS 客户端（SigV4 签名）
│       │   │   ├── image.ts      #     图床
│       │   │   ├── dashboard.ts  #     仪表盘
│       │   │   ├── settings.ts   #     设置
│       │   │   ├── auth.ts       #     认证（无状态 HMAC token）
│       │   │   ├── config.ts     #     YAML 配置管理
│       │   │   └── theme.ts      #     主题管理
│       │   ├── types/            #   领域类型
│       │   ├── constants/        #   默认配置
│       │   └── utils/            #   Markdown / Front-Matter / 通用工具
│       └── tests/                #   单元测试
├── apps/
│   ├── api/                      # @hexo-pro/api：Hono API（MVC 的 C + V）
│   │   ├── src/
│   │   │   ├── context.ts        #   依赖装配
│   │   │   ├── controllers/      #   Controller：参数校验、调用 Service
│   │   │   ├── router.ts         #   View：REST 路由与鉴权中间件
│   │   │   ├── server.ts         #   本地 Node 服务器
│   │   │   ├── eo.ts             #   Cloud Functions 入口（onRequest handler）
│   │   │   ├── node-sqlite-stub.ts # 打包时 node:sqlite 的占位实现
│   │   │   └── build-edge.ts     #   Cloud Functions bundle 打包脚本
│   │   └── tests/                #   集成测试
│   └── web/                      # @hexo-pro/web：pure-admin 风格前端
│       └── src/
│           ├── api/              #   API 客户端
│           ├── store/modules/    #   Pinia：user / app
│           ├── layout/           #   布局（侧边栏 + 顶栏）
│           ├── router/           #   路由与守卫
│           └── views/            #   页面
│               ├── login/        #     登录
│               ├── dashboard/    #     仪表盘
│               ├── posts/        #     文章列表
│               ├── editor/       #     Monaco 分屏编辑器
│               ├── pages/        #     页面管理
│               ├── images/       #     COS 图床
│               ├── recycle/      #     回收站
│               └── system/       #     设置 / YAML 配置 / 主题 / 账号
├── deploy/                       # 博客仓库的工作流模板（复制到博客仓库 .github/workflows/）
│   ├── hexo-blog-deploy.yml      #   部署工作流
│   ├── install-theme.yml         #   安装主题工作流
│   └── manage-theme.yml          #   卸载 / 管理主题工作流
├── edgeone.json                  # EdgeOne Pages 部署配置
├── docs/                         # 文档
└── Hexo-Pro功能梳理.md            # 功能基线（原始资料）
```

## 快速开始

### 环境要求

- Node.js ≥ 22.13（本地开发用内置 `node:sqlite`）
- pnpm ≥ 10（本项目锁定 `pnpm@11.7.0`）

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
pnpm test       # core 23 + api 8 = 31 个用例
```

### 构建

```bash
pnpm build      # 类型检查 + 打包 Cloud Functions + 构建前端
```

## 首次配置

1. 访问 `http://127.0.0.1:5173`，使用管理员账号登录。
   - 默认账号由环境变量决定：`CMS_ADMIN_USERNAME`（默认 `admin`）、
     `CMS_ADMIN_PASSWORD`（默认 `admin123456`）。
   - **生产环境务必在 EdgeOne Pages 控制台修改这两个变量。**
2. 进入「系统管理 → 设置 → GitHub 关联仓库」，填写仓库所有者、仓库名称、分支、
   Access Token（需要 Contents 读写权限），点击「测试连接」验证。
3. 进入「图片设置」，填写 COS 的 Bucket、Region、SecretId、SecretKey，
   点击「测试连接」验证。
4. 点击「文章管理 → 从 GitHub 同步」，把仓库现有 Markdown 导入 CMS。

## 部署到 EdgeOne Pages

详见 [docs/部署指南.md](./docs/部署指南.md)。

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

- **SQLite 是 CMS 的数据源**：列表、分页、搜索、统计、仪表盘图表全部走本地库。
- **GitHub 是 Hexo 的输入**：每次保存 / 发布 / 删除，都会把 Markdown 文件提交到博客仓库，
  供 Hexo 构建消费。
- 首次绑定仓库时可执行「从 GitHub 同步」，把已有内容导入 SQLite。

### 数据库驱动自动适配

| 环境 | Node 版本 | 驱动 |
| --- | --- | --- |
| 本地开发 | ≥ 22.13 | `node:sqlite`（内置，文件持久化） |
| EdgeOne Cloud Functions | 20.x | `sql.js`（SQLite 编译为 WASM，inline 内联） |

`node:sqlite` 直到 Node 22.5 才稳定，而 Cloud Functions 运行时是 Node 20，
因此部署环境自动使用 sql.js。上层 Repository 代码零改动：
两种驱动通过统一适配层暴露相同的同步 API。

### 认证（无状态 HMAC token）

登录签发的是 HMAC 签名 token（`base64url(payload).base64url(hmac)`），
验证时不依赖服务端存储。这是因为 Cloud Functions 是无状态、多实例的——
登录请求与后续请求可能落在不同实例，内存会话会导致「登录成功但马上 401」。

### 数据库持久化（COS 托管）

Cloud Functions 的文件系统不保证长期持久，因此部署环境（`CMS_DB_REMOTE=cos`）
把 SQLite 数据库文件托管在 COS（键名 `cms/database/cms.sqlite`）：
冷启动自动恢复、请求结束自动同步。

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
| 仪表盘（速览 / 统计 / 图表 / 待办） | `views/dashboard` | ✅ |
| 标签云（VueWordCloud，逐词字体） | `views/dashboard` 第三层 | ✅ |
| 待办事项 | `views/dashboard` | ✅ |
| YAML 配置管理（站点 / 主题，快照草稿 + 数据库镜像） | `views/system/config` | ✅ |
| 主题管理（安装 / 卸载 / 启用 / 停用） | `views/system/themes` | ✅ |
| 设置（图片 COS / GitHub / AI） | `views/system/settings` | ✅ |
| 站点信息（只读，来自 _config.yml） | `views/system/settings` | ✅ |
| 账号信息与密码修改 | `views/system/account` | ✅ |
| AI 创作助手 | 设置项已预留，能力边界待专项评估 | ⏳ |

## 待办与已知限制

- **AI 创作助手**：`ai.*` 配置项与开关已就绪，但续写 / 润色等能力尚未接入。
- **多用户**：当前为单管理员模型（与 EdgeOne Pages 无服务器形态匹配）。
- **分页上限**：单页最大 100 条，避免响应过大。
- **Finger Paint 字体**：标签云英文标签使用 Google Fonts 的 Finger Paint 字体，
  国内网络访问 `fonts.googleapis.com` 可能不稳定；如需可改为自托管字体文件。

## License

MIT
