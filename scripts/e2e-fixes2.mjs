// 验证本轮 3 个问题修复。
const BASE = "http://127.0.0.1:8787/api";

async function api(path, { method = "GET", token, body } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload;
  if (body !== undefined) { headers["Content-Type"] = "application/json"; payload = JSON.stringify(body); }
  const res = await fetch(`${BASE}${path}`, { method, headers, body: payload });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = { raw: text }; }
  return { status: res.status, json };
}

let pass = 0, fail = 0;
function check(name, cond, detail = "") {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name} ${detail}`); }
}

const login = await api("/auth/login", { method: "POST", body: { username: "admin", password: "admin123456" } });
const token = login.json.data.token;

// ===== 问题 1：页面列表应包含 source/<name>/index.md 页面 =====
console.log("\n【问题1】页面列表（Hexo 标准页面结构）");
let r = await api("/documents/post/sync", { method: "POST", token });
console.log("  同步结果:", JSON.stringify(r.json.data));
r = await api("/documents/page?pageSize=50", { token });
const pageList = r.json.data?.list ?? [];
check("页面列表非空", r.status === 200 && pageList.length >= 1, `total=${r.json.data?.total}`);
console.log("  页面:", pageList.map((p) => `${p.title} -> ${p.path}`).join(" | "));
const hasAbout = pageList.some((p) => p.path === "source/about/index.md");
check("包含 source/about/index.md", hasAbout);

// ===== 问题 2：YAML 配置从 GitHub 动态获取 =====
console.log("\n【问题2】YAML 配置动态列表");
r = await api("/config", { token });
const configFiles = r.json.data ?? [];
check("配置文件列表非空", r.status === 200 && configFiles.length >= 1);
console.log("  配置文件:", configFiles.map((f) => `${f.path}${f.hasDraft ? "(有草稿)" : ""}`).join(" | "));
const hasYun = configFiles.some((f) => f.path === "_config.yun.yml");
const hasButterfly = configFiles.some((f) => f.path === "_config.butterfly.yml");
const hasSite = configFiles.some((f) => f.path === "_config.yml");
check("包含 _config.yml", hasSite);
check("包含 _config.butterfly.yml", hasButterfly);
check("包含 _config.yun.yml", hasYun);

// ===== 问题 3：主题安装二选一 =====
console.log("\n【问题3】主题安装二选一");
// git 方式缺少必填字段应报错
r = await api("/themes/install", { method: "POST", token, body: { installMethod: "git" } });
check("git 方式缺 URL 报 422", r.status === 422, `status=${r.status}`);
// npm 方式缺少包名应报错
r = await api("/themes/install", { method: "POST", token, body: { installMethod: "npm" } });
check("npm 方式缺包名报 422", r.status === 422, `status=${r.status}`);

console.log(`\n================ 结果：${pass} 通过 / ${fail} 失败 ================`);
process.exitCode = fail > 0 ? 1 : 0;
