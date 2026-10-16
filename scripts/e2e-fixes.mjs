// 验证本次 5 个问题修复 + 新功能。
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

// ===== 问题 3：发布文章路径应正确（source/_posts/xxx.md） =====
console.log("\n【问题3】文章发布路径");
let r = await api("/documents/post", { method: "POST", token, body: { title: `路径测试-${Date.now()}`, content: "正文", status: "published" } });
const postPath = r.json.data?.path;
check("发布文章路径为 source/_posts/xxx.md", postPath?.startsWith("source/_posts/") && !postPath?.includes("source/pages"), `path=${postPath}`);
const postId = r.json.data?.id;
// 清理
await api(`/documents/detail/${postId}`, { method: "DELETE", token });
await api(`/recycle/${postId}`, { method: "DELETE", token });

// ===== 问题 3b：页面路径应为 source/pages/xxx.md =====
console.log("\n【问题3b】页面路径");
r = await api("/documents/page", { method: "POST", token, body: { title: `页面测试-${Date.now()}`, content: "正文", status: "published" } });
const pagePath = r.json.data?.path;
check("页面路径为 source/pages/xxx.md", pagePath?.startsWith("source/pages/"), `path=${pagePath}`);
const pageId = r.json.data?.id;
await api(`/documents/detail/${pageId}`, { method: "DELETE", token });
await api(`/recycle/${pageId}`, { method: "DELETE", token });

// ===== 问题 1：同步对账（GitHub 为准） =====
console.log("\n【问题1】同步对账");
r = await api("/documents/post/sync", { method: "POST", token });
check("同步返回 downgraded 字段", typeof r.json.data?.downgraded === "number", JSON.stringify(r.json.data));

// ===== 问题 4：YAML 配置（列表 + 草稿 + 发布） =====
console.log("\n【问题4】YAML 配置快照草稿");
r = await api("/config", { token });
check("配置文件列表", r.status === 200 && Array.isArray(r.json.data) && r.json.data.length >= 1, JSON.stringify(r.json.data));
const sitePath = r.json.data?.[0]?.path ?? "_config.yml";

r = await api(`/config/${encodeURIComponent(sitePath)}`, { token });
check("读取配置内容", r.status === 200 && typeof r.json.data?.content === "string");

// 保存草稿
const draftContent = (r.json.data.content || "") + "\n# draft-marker-" + Date.now();
r = await api(`/config/${encodeURIComponent(sitePath)}/draft`, { method: "POST", token, body: { content: draftContent } });
check("保存草稿", r.status === 200, JSON.stringify(r.json));

// 再次读取应从草稿返回
r = await api(`/config/${encodeURIComponent(sitePath)}`, { token });
check("读取返回草稿内容", r.json.data?.fromDraft === true, JSON.stringify(r.json.data?.fromDraft));

// 列表应显示 hasDraft
r = await api("/config", { token });
const siteFile = r.json.data?.find((f) => f.path === sitePath);
check("列表显示 hasDraft", siteFile?.hasDraft === true);

// 丢弃草稿（不发布，避免污染真实仓库）
r = await api(`/config/${encodeURIComponent(sitePath)}/draft`, { method: "DELETE", token });
check("丢弃草稿", r.status === 200);
r = await api(`/config/${encodeURIComponent(sitePath)}`, { token });
check("丢弃后恢复 GitHub 内容", r.json.data?.fromDraft === false);

// ===== 问题 5：主题管理 =====
console.log("\n【问题5】主题管理");
r = await api("/themes", { token });
check("主题列表", r.status === 200 && Array.isArray(r.json.data), JSON.stringify(r.json.data));
r = await api("/themes/enable", { method: "POST", token, body: { name: "landscape" } });
check("启用主题", r.status === 200);

console.log(`\n================ 结果：${pass} 通过 / ${fail} 失败 ================`);
process.exitCode = fail > 0 ? 1 : 0;
