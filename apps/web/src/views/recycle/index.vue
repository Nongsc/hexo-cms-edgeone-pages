<template>
  <div class="page-container">
    <el-card shadow="never">
      <div class="toolbar">
        <div class="toolbar-left">
          <el-radio-group v-model="kind" @change="loadList">
            <el-radio-button value="">全部</el-radio-button>
            <el-radio-button value="post">文章</el-radio-button>
            <el-radio-button value="page">页面</el-radio-button>
          </el-radio-group>
        </div>
        <div class="toolbar-right">
          <el-button :icon="Refresh" circle @click="loadList" />
        </div>
      </div>

      <el-alert
        title="回收站中的内容不会出现在站点中，也不会同步到 GitHub 仓库。"
        type="info"
        :closable="false"
        show-icon
        class="recycle-tip"
      />

      <el-table v-loading="loading" :data="list" border stripe>
        <el-table-column prop="title" label="标题" min-width="240" show-overflow-tooltip />
        <el-table-column prop="kind" label="类型" width="90" align="center">
          <template #default="{ row }">
            <el-tag size="small" :type="row.kind === 'post' ? 'primary' : 'warning'">
              {{ row.kind === "post" ? "文章" : "页面" }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="path" label="仓库路径" min-width="240" show-overflow-tooltip />
        <el-table-column prop="updatedAt" label="删除时间" width="170">
          <template #default="{ row }">{{ formatTime(row.updatedAt) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="180" fixed="right" align="center">
          <template #default="{ row }">
            <el-button link type="success" :icon="RefreshLeft" @click="handleRestore(row)">恢复</el-button>
            <el-button link type="danger" :icon="Delete" @click="handleDestroy(row)">彻底删除</el-button>
          </template>
        </el-table-column>
      </el-table>

      <el-empty v-if="list.length === 0 && !loading" description="回收站是空的" />
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from "vue";
import { ElMessage } from "element-plus";
import { Refresh, RefreshLeft, Delete } from "@element-plus/icons-vue";
import { listTrashed, restoreDocument, destroyDocument, type DocumentSummary } from "@/api/documents";
import { confirm } from "@/utils/http";
import type { DocumentKind } from "@/api/types";

const loading = ref(false);
const list = ref<DocumentSummary[]>([]);
const kind = ref<"" | DocumentKind>("");

async function loadList(): Promise<void> {
  loading.value = true;
  try {
    const data = await listTrashed(kind.value || undefined);
    list.value = data.list;
  } finally {
    loading.value = false;
  }
}

async function handleRestore(row: DocumentSummary): Promise<void> {
  if (!(await confirm(`确认恢复《${row.title}》？`))) return;
  try {
    await restoreDocument(row.id);
    ElMessage.success("已恢复");
    await loadList();
  } catch (error) {
    ElMessage.error((error as Error).message);
  }
}

async function handleDestroy(row: DocumentSummary): Promise<void> {
  if (!(await confirm(`彻底删除《${row.title}》后将无法恢复，确认删除？`, "彻底删除"))) return;
  try {
    await destroyDocument(row.id);
    ElMessage.success("已彻底删除");
    await loadList();
  } catch (error) {
    ElMessage.error((error as Error).message);
  }
}

function formatTime(value?: string | null): string {
  if (!value) return "-";
  return value.replace("T", " ").slice(0, 16);
}

onMounted(loadList);
</script>

<style scoped lang="scss">
.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.recycle-tip {
  margin-bottom: 14px;
}
</style>
