// 验证 Edge bundle 在 Node runtime 下可完整运行。
process.env.CMS_DB_PATH = ":memory:";
process.env.CMS_ADMIN_USERNAME = "admin";
process.env.CMS_ADMIN_PASSWORD = "admin123456";

const mod = await import("../apps/api/dist-edge/index.js");
const app = mod.default;

function assert(condition, message) {
  if (!condition) {
    console.error("FAIL:", message);
    process.exitCode = 1;
  } else {
    console.log("ok:", message);
  }
}

const health = await app.request("/api/health");
assert(health.status === 200, "GET /api/health -> 200");

const badLogin = await app.request("/api/auth/login", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ username: "admin", password: "wrong" })
});
assert(badLogin.status === 401, "错误密码 -> 401");

const login = await app.request("/api/auth/login", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ username: "admin", password: "admin123456" })
});
assert(login.status === 200, "登录 -> 200");
const loginBody = await login.json();
const token = loginBody.data.token;
assert(typeof token === "string" && token.length > 10, "返回 token");

const headers = { Authorization: `Bearer ${token}` };

const noAuth = await app.request("/api/dashboard/overview");
assert(noAuth.status === 401, "无 token -> 401");

const dash = await app.request("/api/dashboard/overview", { headers });
assert(dash.status === 200, "仪表盘 -> 200");
const dashBody = await dash.json();
assert(Array.isArray(dashBody.data.charts.publishTrend), "仪表盘返回发布趋势");

const created = await app.request("/api/documents/post", {
  method: "POST",
  headers: { ...headers, "Content-Type": "application/json" },
  body: JSON.stringify({ title: "Edge 验证", content: "正文", status: "published" })
});
assert(created.status === 201, "创建文章 -> 201");
const postId = (await created.json()).data.id;

const list = await app.request("/api/documents/post?pageSize=5", { headers });
assert((await list.json()).data.total === 1, "文章列表 total=1");

const images = await app.request("/api/images?page=1&pageSize=10", { headers });
assert(images.status === 200, "图床列表 -> 200");

const notFound = await app.request("/api/does-not-exist", { headers });
assert(notFound.status === 404, "未知接口 -> 404");

console.log(process.exitCode ? "\nEDGE BUNDLE VERIFICATION FAILED" : "\nEDGE BUNDLE VERIFICATION PASSED");
