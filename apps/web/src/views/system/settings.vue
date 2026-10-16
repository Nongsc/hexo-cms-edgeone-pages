<template>
  <div class="page-container">
    <el-tabs v-model="activeTab" class="settings-tabs">
      <!-- 图片设置（COS） -->
      <el-tab-pane label="图片设置" name="cos">
        <el-alert
          title="图片资源统一存储在腾讯云 COS，CMS 不保留本地副本。配置保存在系统 SQLite 中。"
          type="info"
          :closable="false"
          show-icon
          class="pane-alert"
        />
        <el-form :model="form" label-width="120px" class="settings-form">
          <el-form-item label="存储桶名称">
            <el-input v-model="form['cos.bucket']" placeholder="例如 my-bucket-1250000000" />
          </el-form-item>
          <el-form-item label="所属地域">
            <el-select v-model="form['cos.region']" filterable allow-create style="width: 260px">
              <el-option v-for="region in cosRegions" :key="region" :label="region" :value="region" />
            </el-select>
          </el-form-item>
          <el-form-item label="SecretId">
            <el-input v-model="form['cos.secretId']" placeholder="腾讯云 API 密钥 SecretId" show-password />
          </el-form-item>
          <el-form-item label="SecretKey">
            <el-input v-model="form['cos.secretKey']" placeholder="腾讯云 API 密钥 SecretKey" show-password />
          </el-form-item>
          <el-form-item label="SessionToken">
            <el-input v-model="form['cos.sessionToken']" placeholder="使用临时密钥时填写，可留空" />
          </el-form-item>
          <el-form-item label="加速域名">
            <el-input v-model="form['cos.domain']" placeholder="例如 https://img.example.com，可留空" />
          </el-form-item>
          <el-form-item label="图床根目录">
            <el-input v-model="form['cos.folder']" placeholder="例如 images" />
          </el-form-item>
          <el-form-item>
            <el-button type="primary" :loading="saving" @click="save('cos')">保存设置</el-button>
            <el-button :loading="testing" @click="handleTestCos">测试连接</el-button>
          </el-form-item>
        </el-form>
      </el-tab-pane>

      <!-- GitHub 关联仓库 -->
      <el-tab-pane label="GitHub 关联仓库" name="github">
        <el-alert
          title="CMS 通过 GitHub API 读写博客仓库的 Markdown 内容与配置文件，不操作本地文件系统。"
          type="info"
          :closable="false"
          show-icon
          class="pane-alert"
        />
        <el-form :model="form" label-width="120px" class="settings-form">
          <el-form-item label="仓库所有者">
            <el-input v-model="form['github.owner']" placeholder="GitHub 用户名或组织名" />
          </el-form-item>
          <el-form-item label="仓库名称">
            <el-input v-model="form['github.repo']" placeholder="例如 my-hexo-blog" />
          </el-form-item>
          <el-form-item label="分支">
            <el-input v-model="form['github.branch']" placeholder="main" />
          </el-form-item>
          <el-form-item label="Access Token">
            <el-input
              v-model="form['github.token']"
              type="textarea"
              :rows="2"
              placeholder="ghp_xxx 或 fine-grained token，需要 Contents 读写权限"
            />
          </el-form-item>
          <el-form-item>
            <el-button type="primary" :loading="saving" @click="save('github')">保存设置</el-button>
            <el-button :loading="testing" @click="handleTestGithub">测试连接</el-button>
          </el-form-item>
        </el-form>
      </el-tab-pane>

      <!-- AI 设置 -->
      <el-tab-pane label="AI 设置" name="ai">
        <el-alert
          title="AI 创作助手的能力开关与参数配置。密钥仅保存在本系统 SQLite 中。"
          type="info"
          :closable="false"
          show-icon
          class="pane-alert"
        />
        <el-form :model="form" label-width="120px" class="settings-form">
          <el-form-item label="启用 AI 助手">
            <el-switch v-model="aiEnabled" />
          </el-form-item>
          <el-form-item label="服务提供商">
            <el-select v-model="form['ai.provider']" style="width: 200px">
              <el-option label="DeepSeek" value="deepseek" />
              <el-option label="OpenAI" value="openai" />
              <el-option label="通义千问" value="qwen" />
              <el-option label="智谱 GLM" value="zhipu" />
            </el-select>
          </el-form-item>
          <el-form-item label="接口地址">
            <el-input v-model="form['ai.baseUrl']" placeholder="https://api.deepseek.com" />
          </el-form-item>
          <el-form-item label="模型">
            <el-input v-model="form['ai.model']" placeholder="deepseek-chat" />
          </el-form-item>
          <el-form-item label="API Key">
            <el-input v-model="form['ai.apiKey']" placeholder="sk-..." show-password />
          </el-form-item>
          <el-form-item>
            <el-button type="primary" :loading="saving" @click="save('ai')">保存设置</el-button>
          </el-form-item>
        </el-form>
      </el-tab-pane>

      <!-- 站点信息 -->
      <el-tab-pane label="站点信息" name="general">
        <el-form :model="form" label-width="120px" class="settings-form">
          <el-form-item label="站点标题">
            <el-input v-model="form['site.title']" />
          </el-form-item>
          <el-form-item label="博客前台地址">
            <el-input v-model="form['site.url']" placeholder="https://example.com" />
          </el-form-item>
          <el-form-item label="站点描述">
            <el-input v-model="form['site.description']" type="textarea" :rows="2" />
          </el-form-item>
          <el-form-item label="当前主题">
            <el-input v-model="form['site.theme']" placeholder="landscape" />
          </el-form-item>
          <el-form-item label="每页文章数">
            <el-input-number v-model="postsPerPage" :min="1" :max="100" />
          </el-form-item>
          <el-form-item>
            <el-button type="primary" :loading="saving" @click="save('general')">保存设置</el-button>
          </el-form-item>
        </el-form>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import { ElMessage } from "element-plus";
import { getSettings, saveSettings, testCos, testGitHub } from "@/api/system";

const activeTab = ref("cos");
const saving = ref(false);
const testing = ref(false);
const form = reactive<Record<string, string>>({});

const cosRegions = [
  "ap-beijing",
  "ap-nanjing",
  "ap-shanghai",
  "ap-guangzhou",
  "ap-chengdu",
  "ap-chongqing",
  "ap-hongkong",
  "ap-singapore",
  "ap-tokyo",
  "na-siliconvalley",
  "eu-frankfurt"
];

const aiEnabled = computed({
  get: () => form["ai.enabled"] === "true",
  set: (value: boolean) => {
    form["ai.enabled"] = value ? "true" : "false";
  }
});

const postsPerPage = computed({
  get: () => Number(form["site.postsPerPage"] ?? 10),
  set: (value: number) => {
    form["site.postsPerPage"] = String(value);
  }
});

async function load(): Promise<void> {
  const data = await getSettings();
  for (const [key, value] of Object.entries(data)) {
    form[key] = value;
  }
  // 同步博客前台地址到 localStorage，供顶栏「博客前台」入口使用
  if (form["site.url"]) {
    localStorage.setItem("blog-url", form["site.url"]);
  } else {
    localStorage.removeItem("blog-url");
  }
}

async function save(group: string): Promise<void> {
  saving.value = true;
  try {
    const prefix = `${group}.`;
    const entries: Record<string, string> = {};
    for (const [key, value] of Object.entries(form)) {
      if (key.startsWith(prefix)) entries[key] = value;
    }
    await saveSettings(entries);
    // 保存站点信息时同步刷新博客前台地址
    if (group === "general") {
      if (form["site.url"]) localStorage.setItem("blog-url", form["site.url"]);
      else localStorage.removeItem("blog-url");
    }
    ElMessage.success("设置已保存");
  } catch (error) {
    ElMessage.error((error as Error).message);
  } finally {
    saving.value = false;
  }
}

async function handleTestGithub(): Promise<void> {
  testing.value = true;
  try {
    const result = await testGitHub();
    if (result.ok) ElMessage.success(result.message);
    else ElMessage.error(result.message);
  } catch (error) {
    ElMessage.error((error as Error).message);
  } finally {
    testing.value = false;
  }
}

async function handleTestCos(): Promise<void> {
  testing.value = true;
  try {
    const result = await testCos();
    if (result.ok) ElMessage.success(result.message);
    else ElMessage.error(result.message);
  } catch (error) {
    ElMessage.error((error as Error).message);
  } finally {
    testing.value = false;
  }
}

onMounted(load);
</script>

<style scoped lang="scss">
.settings-tabs {
  background: #fff;
  border-radius: 8px;
  padding: 8px 16px;
}

.pane-alert {
  margin-bottom: 16px;
}

.settings-form {
  max-width: 640px;
  padding-bottom: 16px;
}
</style>
