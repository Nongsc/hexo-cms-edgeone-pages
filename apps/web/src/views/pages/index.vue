<template>
  <div class="page-container">
    <el-card shadow="never">
      <div class="toolbar">
        <div class="toolbar-left">
          <el-button type="primary" :icon="Plus" @click="goCreate">新建页面</el-button>
        </div>
      </div>

      <el-table v-loading="loading" :data="list" row-key="id" border stripe>
        <el-table-column prop="title" label="页面标题" min-width="220" show-overflow-tooltip>
          <template #default="{ row }">
            <el-link type="primary" :underline="false" @click="goEdit(row.id)">{{ row.title }}</el-link>
          </template>
        </el-table-column>
        <el-table-column prop="path" label="仓库路径" min-width="240" show-overflow-tooltip />
        <el-table-column prop="status" label="状态" width="100" align="center">
          <template #default="{ row }">
            <el-tag :type="row.status === 'published' ? 'success' : 'info'" size="small">
              {{ row.status === "published" ? "已发布" : "草稿" }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="updatedAt" label="更新时间" width="170">
          <template #default="{ row }">{{ formatTime(row.updatedAt) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="200" fixed="right" align="center">
          <template #default="{ row }">
            <el-button link type="primary" :icon="Edit" @click="goEdit(row.id)">编辑</el-button>
            <el-button
              link
              :type="row.status === 'published' ? 'warning' : 'success'"
              @click="toggleStatus(row)"
            >
              {{ row.status === "published" ? "转草稿" : "发布" }}
            </el-button>
            <el-button link type="danger" :icon="Delete" @click="handleDelete(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>

      <div class="pagination">
        <el-pagination
          v-model:current-page="query.page"
          v-model:page-size="query.pageSize"
          :total="total"
          :page-sizes="[10, 20, 50]"
          layout="total, sizes, prev, pager, next"
          background
          @size-change="loadList"
          @current-change="loadList"
        />
      </div>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from "vue";
import { useRouter } from "vue-router";
import { ElMessage } from "element-plus";
import { Plus, Edit, Delete } from "@element-plus/icons-vue";
import { listDocuments, setDocumentStatus, trashDocument, type DocumentSummary } from "@/api/documents";
import { confirm } from "@/utils/http";
import type { DocumentStatus } from "@/api/types";

const router = useRouter();
const loading = ref(false);
const list = ref<DocumentSummary[]>([]);
const total = ref(0);
const query = reactive({ page: 1, pageSize: 10 });

async function loadList(): Promise<void> {
  loading.value = true;
  try {
    const data = await listDocuments("page", { page: query.page, pageSize: query.pageSize });
    list.value = data.list;
    total.value = data.total;
  } finally {
    loading.value = false;
  }
}

function goCreate(): void {
  router.push({ path: "/content/page-editor/new", query: { kind: "page" } });
}

function goEdit(id: number): void {
  router.push(`/content/page-editor/${id}`);
}

async function toggleStatus(row: DocumentSummary): Promise<void> {
  const next: DocumentStatus = row.status === "published" ? "draft" : "published";
  const label = next === "published" ? "发布" : "转为草稿";
  if (!(await confirm(`确认${label}《${row.title}》？`))) return;
  try {
    await setDocumentStatus(row.id, next);
    ElMessage.success(`已${label}`);
    await loadList();
  } catch (error) {
    ElMessage.error((error as Error).message);
  }
}

async function handleDelete(row: DocumentSummary): Promise<void> {
  if (!(await confirm(`确认将《${row.title}》移入回收站？`, "删除确认"))) return;
  try {
    await trashDocument(row.id);
    ElMessage.success("已移入回收站");
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

.pagination {
  display: flex;
  justify-content: flex-end;
  margin-top: 16px;
}
</style>
