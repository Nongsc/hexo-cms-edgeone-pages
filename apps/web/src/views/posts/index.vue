<template>
  <div class="page-container">
    <el-card shadow="never">
      <!-- 搜索栏 -->
      <el-form :inline="true" :model="query" class="search-form" @submit.prevent>
        <el-form-item label="关键词">
          <el-input v-model="query.keyword" placeholder="标题 / 摘要" clearable style="width: 200px" @keyup.enter="handleSearch" />
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="query.status" placeholder="全部" style="width: 130px" @change="handleSearch">
            <el-option label="全部" value="all" />
            <el-option label="已发布" value="published" />
            <el-option label="草稿" value="draft" />
          </el-select>
        </el-form-item>
        <el-form-item label="标签">
          <el-select v-model="query.tag" placeholder="全部" clearable style="width: 140px" @change="handleSearch">
            <el-option v-for="tag in taxonomy.tags" :key="tag" :label="tag" :value="tag" />
          </el-select>
        </el-form-item>
        <el-form-item label="分类">
          <el-select v-model="query.category" placeholder="全部" clearable style="width: 140px" @change="handleSearch">
            <el-option v-for="category in taxonomy.categories" :key="category" :label="category" :value="category" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :icon="Search" @click="handleSearch">查询</el-button>
          <el-button :icon="RefreshLeft" @click="handleReset">重置</el-button>
        </el-form-item>
      </el-form>

      <!-- 操作栏 -->
      <div class="toolbar">
        <div class="toolbar-left">
          <el-button type="primary" :icon="Plus" @click="goCreate">新建文章</el-button>
          <el-button :icon="Download" :loading="syncing" @click="handleSync">从 GitHub 同步</el-button>
        </div>
        <div class="toolbar-right">
          <el-tooltip content="刷新列表" placement="top">
            <el-button :icon="Refresh" circle @click="loadList" />
          </el-tooltip>
        </div>
      </div>

      <!-- 列表 -->
      <el-table v-loading="loading" :data="list" row-key="id" border stripe>
        <el-table-column prop="title" label="标题" min-width="220" show-overflow-tooltip>
          <template #default="{ row }">
            <div class="title-cell">
              <el-tag v-if="row.sticky" type="danger" size="small" effect="dark">置顶</el-tag>
              <el-link type="primary" :underline="false" @click="goEdit(row.id)">{{ row.title }}</el-link>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="status" label="状态" width="100" align="center">
          <template #default="{ row }">
            <el-tag :type="row.status === 'published' ? 'success' : 'info'" size="small">
              {{ row.status === "published" ? "已发布" : "草稿" }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="tags" label="标签" min-width="140">
          <template #default="{ row }">
            <el-tag v-for="tag in row.tags" :key="tag" size="small" class="cell-tag">{{ tag }}</el-tag>
            <span v-if="!row.tags?.length" class="text-muted">-</span>
          </template>
        </el-table-column>
        <el-table-column prop="categories" label="分类" min-width="120">
          <template #default="{ row }">
            <el-tag v-for="category in row.categories" :key="category" type="warning" size="small" class="cell-tag">
              {{ category }}
            </el-tag>
            <span v-if="!row.categories?.length" class="text-muted">-</span>
          </template>
        </el-table-column>
        <el-table-column prop="updatedAt" label="更新时间" width="170" sortable>
          <template #default="{ row }">{{ formatTime(row.updatedAt) }}</template>
        </el-table-column>
        <el-table-column prop="publishedAt" label="发布时间" width="170" sortable>
          <template #default="{ row }">{{ formatTime(row.publishedAt) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="210" fixed="right" align="center">
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

      <!-- 分页 -->
      <div class="pagination">
        <el-pagination
          v-model:current-page="query.page"
          v-model:page-size="query.pageSize"
          :total="total"
          :page-sizes="[10, 20, 50]"
          layout="total, sizes, prev, pager, next, jumper"
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
import { useRoute, useRouter } from "vue-router";
import { ElMessage } from "element-plus";
import { Search, RefreshLeft, Refresh, Plus, Edit, Delete, Download } from "@element-plus/icons-vue";
import {
  listDocuments,
  setDocumentStatus,
  trashDocument,
  getTaxonomy,
  syncFromGitHub,
  type DocumentSummary
} from "@/api/documents";
import { confirm } from "@/utils/http";
import type { DocumentStatus } from "@/api/types";

const router = useRouter();
const route = useRoute();

const loading = ref(false);
const syncing = ref(false);
const list = ref<DocumentSummary[]>([]);
const total = ref(0);
const taxonomy = reactive<{ tags: string[]; categories: string[] }>({ tags: [], categories: [] });

const query = reactive({
  page: 1,
  pageSize: 10,
  keyword: "",
  status: ((route.query.status as string) ?? "all") as DocumentStatus | "all",
  tag: "",
  category: ""
});

async function loadTaxonomy(): Promise<void> {
  const data = await getTaxonomy();
  taxonomy.tags = data.tags;
  taxonomy.categories = data.categories;
}

async function loadList(): Promise<void> {
  loading.value = true;
  try {
    const data = await listDocuments("post", {
      page: query.page,
      pageSize: query.pageSize,
      keyword: query.keyword || undefined,
      status: query.status,
      tag: query.tag || undefined,
      category: query.category || undefined
    });
    list.value = data.list;
    total.value = data.total;
  } finally {
    loading.value = false;
  }
}

function handleSearch(): void {
  query.page = 1;
  loadList();
}

function handleReset(): void {
  query.keyword = "";
  query.status = "all";
  query.tag = "";
  query.category = "";
  query.page = 1;
  loadList();
}

function goCreate(): void {
  router.push("/content/editor/new");
}

function goEdit(id: number): void {
  router.push(`/content/editor/${id}`);
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

async function handleSync(): Promise<void> {
  if (!(await confirm("将从 GitHub 仓库同步 source/_posts、source/_drafts 下的 Markdown 文件，并以仓库为准改写本地状态，确认继续？", "同步确认"))) return;
  syncing.value = true;
  try {
    const result = await syncFromGitHub();
    const parts = [`新增 ${result.imported} 篇`, `更新 ${result.updated} 篇`];
    if (result.downgraded > 0) {
      parts.push(`${result.downgraded} 篇已发布文章在仓库中不存在，已改回草稿`);
    }
    ElMessage.success(`同步完成：${parts.join("，")}`);
    await loadTaxonomy();
    await loadList();
  } catch (error) {
    ElMessage.error((error as Error).message);
  } finally {
    syncing.value = false;
  }
}

function formatTime(value?: string | null): string {
  if (!value) return "-";
  return value.replace("T", " ").slice(0, 16);
}

onMounted(() => {
  loadTaxonomy();
  loadList();
});
</script>

<style scoped lang="scss">
.page-container {
  height: 100%;
}

.search-form {
  margin-bottom: 8px;

  :deep(.el-form-item) {
    margin-bottom: 12px;
  }
}

.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.title-cell {
  display: flex;
  align-items: center;
  gap: 6px;
}

.cell-tag {
  margin-right: 4px;
}

.text-muted {
  color: #a9aeb8;
}

.pagination {
  display: flex;
  justify-content: flex-end;
  margin-top: 16px;
}
</style>
