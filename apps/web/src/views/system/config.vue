<template>
  <div class="page-container">
    <el-card shadow="never" class="config-card">
      <template #header>
        <div class="card-header">
          <span class="card-title">YAML 配置管理</span>
          <el-tooltip content="刷新配置列表" placement="top">
            <el-button :icon="Refresh" circle @click="loadFiles" />
          </el-tooltip>
        </div>
      </template>

      <el-alert
        title="左侧选择配置文件，右侧编辑。编辑内容先保存为快照草稿（存入数据库），确认无误后再「发布」推送到 GitHub。"
        type="info"
        :closable="false"
        show-icon
        class="config-alert"
      />

      <div class="config-layout">
        <!-- 左侧：配置文件列表 -->
        <div class="config-sidebar">
          <div class="sidebar-title">
            <span>配置文件</span>
            <el-button link type="primary" :icon="Plus" size="small" @click="createDialogVisible = true">新建</el-button>
          </div>
          <ul class="file-list">
            <li
              v-for="file in files"
              :key="file.path"
              class="file-item"
              :class="{ 'is-active': file.path === currentPath }"
              @click="selectFile(file)"
            >
              <span class="file-name">{{ file.label }}</span>
              <span class="file-actions">
                <el-tag v-if="file.hasDraft" type="warning" size="small" effect="plain">草稿</el-tag>
                <el-icon
                  v-if="file.kind === 'theme'"
                  class="file-delete"
                  title="删除配置"
                  @click.stop="handleDelete(file)"
                >
                  <Delete />
                </el-icon>
              </span>
            </li>
          </ul>
          <el-empty v-if="files.length === 0" description="未发现配置文件" :image-size="50" />
        </div>

        <!-- 右侧：编辑器 -->
        <div class="config-editor">
          <div class="editor-toolbar" v-if="currentPath">
            <span class="editor-path">{{ currentPath }}</span>
            <el-tag v-if="fromDraft" type="warning" size="small">草稿未发布</el-tag>
            <div class="editor-actions">
              <el-button :loading="saving" @click="saveDraft">保存草稿</el-button>
              <el-button v-if="fromDraft" text type="info" @click="discardDraft">丢弃草稿</el-button>
              <el-button type="primary" :loading="publishing" @click="publish">发布到 GitHub</el-button>
            </div>
          </div>

          <div v-if="currentPath" class="monaco-wrapper">
            <monaco-editor-vue3
              v-model:value="content"
              theme="vs-dark"
              language="yaml"
              :options="editorOptions"
            />
          </div>
          <el-empty v-else description="请从左侧选择一个配置文件" />
        </div>
      </div>
    </el-card>

    <!-- 新建主题配置弹窗 -->
    <el-dialog v-model="createDialogVisible" title="新建主题配置" width="420px">
      <el-form label-width="90px">
        <el-form-item label="主题名" required>
          <el-input v-model="newThemeName" placeholder="例如 butterfly / next" />
        </el-form-item>
      </el-form>
      <el-alert
        title="将新建 _config.<主题名>.yml 的草稿，发布后才会写入 GitHub 仓库。全局 _config.yml 无法新建或删除。"
        type="info"
        :closable="false"
        show-icon
      />
      <template #footer>
        <el-button @click="createDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="creating" @click="handleCreate">创建</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from "vue";
import { ElMessage } from "element-plus";
import { Refresh, Plus, Delete } from "@element-plus/icons-vue";
import MonacoEditorVue3 from "monaco-editor-vue3";
import { listConfigFiles, readConfig, saveConfigDraft, publishConfig, discardConfigDraft, createThemeConfig, deleteConfig } from "@/api/system";
import { confirm } from "@/utils/http";
import type { ConfigFileInfo } from "@/api/system";

const files = ref<ConfigFileInfo[]>([]);
const currentPath = ref("");
const content = ref("");
const fromDraft = ref(false);
const saving = ref(false);
const publishing = ref(false);
const loading = ref(false);

const createDialogVisible = ref(false);
const creating = ref(false);
const newThemeName = ref("");

const editorOptions = {
  fontSize: 14,
  minimap: { enabled: true },
  wordWrap: "on",
  automaticLayout: true,
  scrollBeyondLastLine: false,
  tabSize: 2,
  formatOnPaste: true
};

async function loadFiles(): Promise<void> {
  loading.value = true;
  try {
    files.value = await listConfigFiles();
  } catch (error) {
    ElMessage.error(`加载配置列表失败：${(error as Error).message}`);
  } finally {
    loading.value = false;
  }
}

async function selectFile(file: ConfigFileInfo): Promise<void> {
  currentPath.value = file.path;
  await loadContent();
}

async function loadContent(): Promise<void> {
  if (!currentPath.value) return;
  try {
    const data = await readConfig(currentPath.value);
    content.value = data.content;
    fromDraft.value = data.fromDraft;
  } catch (error) {
    ElMessage.error(`加载配置失败：${(error as Error).message}`);
  }
}

async function saveDraft(): Promise<void> {
  saving.value = true;
  try {
    await saveConfigDraft(currentPath.value, content.value);
    fromDraft.value = true;
    ElMessage.success("草稿已保存到数据库（未推送到 GitHub）");
    await loadFiles();
  } catch (error) {
    ElMessage.error((error as Error).message);
  } finally {
    saving.value = false;
  }
}

async function publish(): Promise<void> {
  if (!(await confirm(`确认将 ${currentPath.value} 发布到 GitHub？发布后草稿将被清除。`, "发布确认"))) return;
  publishing.value = true;
  try {
    await publishConfig(currentPath.value, content.value);
    fromDraft.value = false;
    ElMessage.success("已发布到 GitHub");
    await loadFiles();
  } catch (error) {
    ElMessage.error((error as Error).message);
  } finally {
    publishing.value = false;
  }
}

async function discardDraft(): Promise<void> {
  if (!(await confirm("丢弃草稿将恢复为 GitHub 上的版本，确认？", "丢弃草稿"))) return;
  try {
    await discardConfigDraft(currentPath.value);
    await loadContent();
    await loadFiles();
    ElMessage.success("草稿已丢弃");
  } catch (error) {
    ElMessage.error((error as Error).message);
  }
}

async function handleCreate(): Promise<void> {
  const name = newThemeName.value.trim();
  if (!name) {
    ElMessage.warning("请输入主题名");
    return;
  }
  creating.value = true;
  try {
    const result = await createThemeConfig(name);
    ElMessage.success(`已新建配置草稿 ${result.path}（发布后写入仓库）`);
    createDialogVisible.value = false;
    newThemeName.value = "";
    await loadFiles();
    // 选中新建的文件
    const file = files.value.find((f) => f.path === result.path);
    if (file) await selectFile(file);
  } catch (error) {
    ElMessage.error((error as Error).message);
  } finally {
    creating.value = false;
  }
}

async function handleDelete(file: ConfigFileInfo): Promise<void> {
  if (!(await confirm(`确认删除 ${file.path}？删除后将直接从 GitHub 仓库移除。`, "删除配置"))) return;
  try {
    await deleteConfig(file.path);
    ElMessage.success(`已删除 ${file.path}`);
    if (currentPath.value === file.path) {
      currentPath.value = "";
      content.value = "";
    }
    await loadFiles();
  } catch (error) {
    ElMessage.error((error as Error).message);
  }
}

onMounted(loadFiles);
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

.config-alert {
  margin-bottom: 14px;
}

.config-layout {
  display: flex;
  gap: 16px;
  min-height: 560px;
}

.config-sidebar {
  width: 220px;
  flex-shrink: 0;
  border: 1px solid #e5e6eb;
  border-radius: 6px;
  overflow: hidden;

  .sidebar-title {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 12px;
    font-size: 13px;
    font-weight: 600;
    color: #4e5969;
    background: #f7f8fa;
    border-bottom: 1px solid #e5e6eb;
  }
}

.file-list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.file-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  padding: 10px 12px;
  cursor: pointer;
  border-bottom: 1px solid #f0f1f3;
  transition: background 0.15s;

  &:hover {
    background: #f7f8fa;
  }

  &.is-active {
    background: #ecf5ff;
    border-left: 3px solid #409eff;
  }

  .file-name {
    font-size: 13px;
    color: #1d2129;
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .file-actions {
    display: flex;
    align-items: center;
    gap: 4px;
    flex-shrink: 0;
  }

  .file-delete {
    cursor: pointer;
    color: #f56c6c;
    font-size: 15px;
    visibility: hidden;

    &:hover {
      color: #e5484d;
    }
  }

  &:hover .file-delete {
    visibility: visible;
  }
}

.config-editor {
  flex: 1;
  min-width: 0;
  border: 1px solid #e5e6eb;
  border-radius: 6px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.editor-toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 12px;
  background: #f7f8fa;
  border-bottom: 1px solid #e5e6eb;

  .editor-path {
    font-size: 13px;
    color: #4e5969;
    font-family: Consolas, monospace;
    flex: 1;
  }
}

.editor-actions {
  display: flex;
  gap: 8px;
}

.monaco-wrapper {
  flex: 1;
  min-height: 520px;
}
</style>
