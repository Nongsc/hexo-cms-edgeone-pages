// 完整 API 端到端测试：覆盖全部功能模块（GitHub / COS / 文章 / 页面 / 回收站 / 待办 / 部署 / YAML / 设置）。
const BASE = "http://127.0.0.1:8787/api";

async function api(path, { method = "GET", token, body, formData } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload;
  if (formData) {
    payload = formData;
  } else if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }
  const res = await fetch(`${BASE}${path}`, { method, headers, body: payload });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  return { status: res.status, json };
}

let pass = 0, fail = 0;
function check(name, cond, detail = "") {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name} ${detail}`); }
}

// 1. 健康检查
console.log("\n【1. 健康检查】");
let r = await api("/health");
check("GET /health 返回 200", r.status === 200 && r.json.code === 0);

// 2. 登录
console.log("\n【2. 认证】");
r = await api("/auth/login", { method: "POST", body: { username: "admin", password: "wrong" } });
check("错误密码返回 401", r.status === 401);
r = await api("/auth/login", { method: "POST", body: { username: "admin", password: "admin123456" } });
check("正确登录返回 token", r.status === 200 && !!r.json.data?.token);
const token = r.json.data.token;
r = await api("/auth/me", { token });
check("GET /auth/me 返回用户", r.status === 200 && r.json.data.username === "admin");

// 3. 仪表盘
console.log("\n【3. 仪表盘】");
r = await api("/dashboard/overview", { token });
check("GET /dashboard/overview 200", r.status === 200);
check("返回四层数据", r.json.data?.quick && r.json.data?.cards && r.json.data?.charts && r.json.data?.detail);
check("发布趋势 6 个月", r.json.data?.charts?.publishTrend?.length === 6);

// 4. GitHub 连接与同步
console.log("\n【4. GitHub】");
r = await api("/settings/test-github", { method: "POST", token });
check("GitHub 连接成功", r.status === 200 && r.json.data?.ok === true, JSON.stringify(r.json.data));
r = await api("/documents/post/sync", { method: "POST", token });
check("从 GitHub 同步", r.status === 200, JSON.stringify(r.json));

// 5. 文章 CRUD
console.log("\n【5. 文章管理】");
const title = `测试文章-${Date.now()}`;
r = await api("/documents/post", { method: "POST", token, body: { title, content: "# 标题\n\n正文内容", tags: ["测试"], categories: ["分类A"], status: "published" } });
check("创建文章 201", r.status === 201, JSON.stringify(r.json));
const postId = r.json.data?.id;
check("文章写入 SQLite", !!postId);

r = await api("/documents/post?pageSize=5", { token });
check("文章列表分页", r.status === 200 && r.json.data?.total >= 1);

r = await api(`/documents/detail/${postId}`, { token });
check("文章详情", r.status === 200 && r.json.data?.title === title);

r = await api(`/documents/detail/${postId}`, { method: "PUT", token, body: { title: title + "-改" } });
check("文章更新", r.status === 200 && r.json.data?.title === title + "-改");

r = await api(`/documents/detail/${postId}/status`, { method: "POST", token, body: { status: "draft" } });
check("转为草稿", r.status === 200 && r.json.data?.status === "draft");

r = await api("/documents/post/taxonomy", { token });
check("标签分类字典", r.status === 200 && Array.isArray(r.json.data?.tags));

// 6. 页面管理
console.log("\n【6. 页面管理】");
const pageTitle = `关于我-${Date.now()}`;
r = await api("/documents/page", { method: "POST", token, body: { title: pageTitle, content: "关于页面", status: "published" } });
check("创建页面", r.status === 201, JSON.stringify(r.json));
const pageId = r.json.data?.id;
r = await api("/documents/page?pageSize=5", { token });
check("页面列表", r.status === 200 && r.json.data?.total >= 1);

// 7. 回收站
console.log("\n【7. 回收站】");
r = await api(`/documents/detail/${postId}`, { method: "DELETE", token });
check("文章移入回收站", r.status === 200);
r = await api("/recycle", { token });
check("回收站列表含文章", r.status === 200 && r.json.data?.total >= 1);
r = await api(`/recycle/${postId}/restore`, { method: "POST", token });
check("恢复文章", r.status === 200);
r = await api(`/documents/detail/${postId}`, { method: "DELETE", token });
r = await api(`/recycle/${postId}`, { method: "DELETE", token });
check("彻底删除文章", r.status === 200);

// 8. 待办事项
console.log("\n【8. 待办事项】");
r = await api("/dashboard/todos", { method: "POST", token, body: { title: "写一篇新文章" } });
check("新增待办", r.status === 201, JSON.stringify(r.json));
const todoId = r.json.data?.id;
r = await api(`/dashboard/todos/${todoId}`, { method: "PUT", token, body: { done: true } });
check("标记待办完成", r.status === 200 && r.json.data?.done === true);
r = await api(`/dashboard/todos/${todoId}`, { method: "DELETE", token });
check("删除待办", r.status === 200);

// 9. 图床（COS）
console.log("\n【9. 图床（COS）】");
r = await api("/images?page=1&pageSize=5", { token });
check("图片列表", r.status === 200 && Array.isArray(r.json.data?.list));
const folders = r.json.data?.folders ?? [];
check("返回目录列表", Array.isArray(folders));

// 上传一张真实 PNG
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const fd = new FormData();
fd.append("file", new Blob([png], { type: "image/png" }), `api-test-${Date.now()}.png`);
fd.append("folder", "images");
r = await api("/images", { method: "POST", token, formData: fd });
check("上传图片到 COS", r.status === 200 && !!r.json.data?.url, JSON.stringify(r.json));
const cosKey = r.json.data?.cosKey;
check("图片 URL 含自定义域名", r.json.data?.url?.includes("cos.livejourney.cn") || r.json.data?.url?.includes("myqcloud.com"));

r = await api(`/images/${encodeURIComponent(cosKey)}`, { method: "DELETE", token });
check("删除图片", r.status === 200, JSON.stringify(r.json));

// 10. 设置读写与掩码
console.log("\n【10. 设置】");
r = await api("/settings", { token });
check("读取设置", r.status === 200 && r.json.data?.["site.title"]);
check("敏感值已打码", (r.json.data?.["cos.secretKey"] ?? "").includes("****"));
r = await api("/settings", { method: "POST", token, body: { "site.title": "我的博客" } });
check("保存设置", r.status === 200);

// 11. YAML 配置
console.log("\n【11. YAML 配置】");
r = await api("/settings/config/site", { token });
check("读取站点 YAML", r.status === 200 && typeof r.json.data?.content === "string");

// 12. 部署
console.log("\n【12. 部署】");
r = await api("/settings/deploy/channels", { token });
check("部署通道列表", r.status === 200 && r.json.data?.length >= 3);
r = await api("/settings/deploy/logs", { token });
check("部署日志列表", r.status === 200 && Array.isArray(r.json.data));
r = await api("/settings/deploy/trigger", { method: "POST", token, body: { channel: "edgeone-pages" } });
check("触发部署", r.status === 200, JSON.stringify(r.json.data));

// 13. 主题与账号
console.log("\n【13. 主题与账号】");
r = await api("/settings/themes", { token });
check("主题列表", r.status === 200, JSON.stringify(r.json));
r = await api("/settings/account", { token });
check("账号信息", r.status === 200 && r.json.data?.username === "admin");

// 14. 鉴权保护
console.log("\n【14. 鉴权保护】");
r = await api("/dashboard/overview");
check("无 token 访问受保护接口 401", r.status === 401);
r = await api("/nothing-here", { token });
check("未知接口 404", r.status === 404);

console.log(`\n================ 结果：${pass} 通过 / ${fail} 失败 ================`);
process.exitCode = fail > 0 ? 1 : 0;
