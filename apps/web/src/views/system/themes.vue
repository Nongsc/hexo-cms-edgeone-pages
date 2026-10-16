<template>
  <div class="page-container">
    <el-card shadow="never">
      <template #header>
        <div class="card-header">
          <span class="card-title">主题管理</span>
          <div class="header-actions">
            <el-button type="primary" :icon="Plus" @click="installDialogVisible = true">安装主题</el-button>
            <el-button :icon="Refresh" circle @click="loadThemes" />
          </div>
        </div>
      </template>

      <el-alert
        title="已安装主题来自 GitHub 仓库的 themes 目录（git 安装）与 package.json 中 hexo-theme- 开头的包（命令行安装）。安装/卸载通过 GitHub Actions 工作流完成。"
        type="info"
        :closable="false"
        show-icon
        class="theme-alert"
      />

      <el-table v-loading="loading" :data="themes" border>
        <el-table-column prop="name" label="主题名称" min-width="160">
          <template #default="{ row }">
            <span class="theme-name">{{ row.name }}</span>
          </template>
        </el-table-column>
        <el-table-column label="来源" width="110" align="center">
          <template #default="{ row }">
            <el-tag :type="row.source === 'npm' ? 'warning' : 'primary'" size="small" effect="plain">
              {{ row.source === "npm" ? "命令行" : "git" }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="110" align="center">
          <template #default="{ row }">
            <el-tag :type="row.active ? 'success' : 'info'" size="small">
              {{ row.active ? "使用中" : "已安装" }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="240" align="center">
          <template #default="{ row }">
            <el-button link type="primary" :disabled="row.active" @click="useTheme(row)">
              启用
            </el-button>
            <el-button v-if="row.active" link type="warning" @click="handleDisable">停用</el-button>
            <el-button link type="primary" @click="openConfig(row.name)">配置</el-button>
            <el-button link type="danger" :disabled="row.active" @click="handleUninstall(row)">卸载</el-button>
          </template>
        </el-table-column>
      </el-table>

      <el-empty v-if="themes.length === 0 && !loading" description="未发现已安装的主题" />
    </el-card>

    <!-- 已启用插件 -->
    <el-card shadow="never" class="plugins-card">
      <template #header>
        <div class="card-header">
          <span class="card-title">已启用插件</span>
          <el-button :icon="Refresh" circle @click="loadPlugins" />
        </div>
      </template>

      <el-alert
        title="以下插件来自博客仓库 package.json 中 hexo- 开头的依赖（不含主题包）。Hexo 插件安装在 package.json 中即自动启用，无需额外开关。安装主题时若需额外插件，可参考此列表避免重复安装。"
        type="info"
        :closable="false"
        show-icon
        class="plugins-alert"
      />

      <div v-loading="pluginsLoading" class="plugins-grid">
        <el-tag
          v-for="plugin in plugins"
          :key="plugin.name"
          class="plugin-tag"
          type="success"
          effect="plain"
        >
          {{ plugin.name }} <span class="plugin-version">{{ plugin.version }}</span>
        </el-tag>
        <el-empty v-if="plugins.length === 0 && !pluginsLoading" description="未发现已启用的 Hexo 插件" :image-size="60" />
      </div>
    </el-card>

    <!-- 安装主题弹窗 -->
    <el-dialog v-model="installDialogVisible" title="安装主题" width="640px" :close-on-click-modal="false">
      <el-form :model="installForm" label-width="130px">
        <!-- 安装方式：二选一 -->
        <el-form-item label="安装方式" required>
          <el-radio-group v-model="installForm.installMethod">
            <el-radio value="git">git clone</el-radio>
            <el-radio value="npm">命令行安装 (npm / pnpm)</el-radio>
          </el-radio-group>
        </el-form-item>

        <!-- git clone 方式 -->
        <template v-if="installForm.installMethod === 'git'">
          <el-form-item label="Git 地址" required>
            <el-input v-model="installForm.themeUrl" placeholder="例如 https://github.com/theme/hexo-theme-xxx.git" />
            <div class="form-tip">主题仓库的 git clone 地址</div>
          </el-form-item>
          <el-form-item label="主题目录名" required>
            <el-input v-model="installForm.themeName" placeholder="例如 landscape / next / butterfly" />
          </el-form-item>
          <el-form-item label="分支（可选）">
            <el-input v-model="installForm.themeBranch" placeholder="留空使用默认分支" />
          </el-form-item>
        </template>

        <!-- 命令行安装方式 -->
        <template v-else>
          <el-form-item label="包名" required>
            <el-input v-model="installForm.packageName" placeholder="例如 hexo-theme-landscape / hexo-theme-butterfly" />
            <div class="form-tip">主题的 npm / pnpm 包名</div>
          </el-form-item>
        </template>

        <el-form-item label="包管理器">
          <el-radio-group v-model="installForm.packageManager">
            <el-radio-button value="npm">npm</el-radio-button>
            <el-radio-button value="pnpm">pnpm</el-radio-button>
          </el-radio-group>
        </el-form-item>

        <el-form-item label="依赖包（可选）">
          <el-input
            v-model="installForm.dependencies"
            type="textarea"
            :rows="2"
            placeholder="每行一个，例如：hexo-renderer-pug&#10;hexo-word-counter"
          />
          <div class="form-tip">主题需要额外安装的依赖包 / Hexo 插件</div>
        </el-form-item>
      </el-form>

      <el-alert
        title="提交后将触发博客仓库的 install-theme.yml 工作流，在 GitHub Actions 中执行安装。安装完成后请刷新列表。"
        type="warning"
        :closable="false"
        show-icon
      />

      <template #footer>
        <el-button @click="installDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="installing" @click="handleInstall">触发安装</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from "vue";
import { useRouter } from "vue-router";
import { ElMessage, ElMessageBox } from "element-plus";
import { Plus, Refresh } from "@element-plus/icons-vue";
import { getThemes, installTheme, enableTheme, disableTheme, uninstallTheme, getThemePlugins, type ThemeInfo, type ThemePluginInfo } from "@/api/system";

const router = useRouter();
const loading = ref(false);
const themes = ref<ThemeInfo[]>([]);
const plugins = ref<ThemePluginInfo[]>([]);
const pluginsLoading = ref(false);

const installDialogVisible = ref(false);
const installing = ref(false);
const installForm = reactive({
  installMethod: "git" as "git" | "npm",
  themeUrl: "",
  themeName: "",
  themeBranch: "",
  packageName: "",
  packageManager: "npm" as "npm" | "pnpm",
  dependencies: ""
});

async function loadThemes(): Promise<void> {
  loading.value = true;
  try {
    themes.value = await getThemes();
  } catch (error) {
    ElMessage.error((error as Error).message);
  } finally {
    loading.value = false;
  }
}

async function loadPlugins(): Promise<void> {
  pluginsLoading.value = true;
  try {
    plugins.value = await getThemePlugins();
  } catch (error) {
    ElMessage.error((error as Error).message);
  } finally {
    pluginsLoading.value = false;
  }
}

async function useTheme(row: ThemeInfo): Promise<void> {
  try {
    await enableTheme(row.name);
    ElMessage.success(`已启用主题 ${row.name}`);
    await loadThemes();
  } catch (error) {
    ElMessage.error((error as Error).message);
  }
}

async function handleDisable(): Promise<void> {
  try {
    await ElMessageBox.confirm("停用后将切换回默认主题 landscape，确认？", "停用主题", { type: "warning" });
    await disableTheme();
    ElMessage.success("已停用当前主题");
    await loadThemes();
  } catch (error) {
    if (error !== "cancel" && error !== "close") {
      ElMessage.error((error as Error).message);
    }
  }
}

async function handleUninstall(row: ThemeInfo): Promise<void> {
  try {
    await ElMessageBox.confirm(
      `确认卸载主题「${row.name}」？${row.source === "npm" ? "将从 package.json 移除对应包" : "将删除 themes 目录下的对应文件夹"}。`,
      "卸载主题",
      { type: "warning" }
    );
    const result = await uninstallTheme(row.name, row.source);
    ElMessage.success(result.message);
    await loadThemes();
    await loadPlugins();
  } catch (error) {
    if (error !== "cancel" && error !== "close") {
      ElMessage.error((error as Error).message);
    }
  }
}

async function handleInstall(): Promise<void> {
  // 根据安装方式校验必填字段
  if (installForm.installMethod === "git") {
    if (!installForm.themeUrl.trim()) {
      ElMessage.warning("请填写主题的 Git 地址");
      return;
    }
    if (!installForm.themeName.trim()) {
      ElMessage.warning("请填写主题目录名");
      return;
    }
  } else {
    if (!installForm.packageName.trim()) {
      ElMessage.warning("请填写主题的 npm/pnpm 包名");
      return;
    }
  }

  installing.value = true;
  try {
    const result = await installTheme({
      installMethod: installForm.installMethod,
      themeUrl: installForm.installMethod === "git" ? installForm.themeUrl.trim() : undefined,
      themeName: installForm.installMethod === "git" ? installForm.themeName.trim() : undefined,
      themeBranch: installForm.installMethod === "git" && installForm.themeBranch.trim() ? installForm.themeBranch.trim() : undefined,
      packageName: installForm.installMethod === "npm" ? installForm.packageName.trim() : undefined,
      packageManager: installForm.packageManager,
      dependencies: installForm.dependencies.trim() || undefined
    });
    ElMessage.success(result.message);
    installDialogVisible.value = false;
    installForm.themeUrl = "";
    installForm.themeName = "";
    installForm.themeBranch = "";
    installForm.packageName = "";
    installForm.dependencies = "";
  } catch (error) {
    ElMessage.error((error as Error).message);
  } finally {
    installing.value = false;
  }
}

function openConfig(name: string): void {
  router.push({ path: "/system/config", query: { theme: name } });
}

onMounted(() => {
  loadThemes();
  loadPlugins();
});
</script>

<style scoped lang="scss">
.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.card-title {
  font-size: 15px;
  font-weight: 600;
}

.header-actions {
  display: flex;
  gap: 8px;
}

.theme-alert {
  margin-bottom: 14px;
}

.theme-name {
  font-family: Consolas, monospace;
  font-weight: 600;
}

.plugins-card {
  margin-top: 16px;
}

.plugins-alert {
  margin-bottom: 14px;
}

.plugins-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  min-height: 40px;
  align-items: center;
}

.plugin-tag {
  font-family: Consolas, monospace;
}

.plugin-version {
  color: #86909c;
  margin-left: 4px;
  font-size: 12px;
}

.form-tip {
  margin: 4px 0 0;
  font-size: 12px;
  color: #86909c;
  line-height: 1.4;
  width: 100%;
}
</style>
