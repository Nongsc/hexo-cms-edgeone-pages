<template>
  <div class="page-container">
    <el-card shadow="never">
      <div class="toolbar">
        <div class="toolbar-left">
          <el-select v-model="folder" placeholder="全部目录" clearable style="width: 180px" @change="loadList">
            <el-option v-for="item in folders" :key="item" :label="item" :value="item" />
          </el-select>
          <el-button :icon="Plus" @click="folderDialogVisible = true">新建目录</el-button>
        </div>
        <div class="toolbar-right">
          <el-button :icon="Refresh" circle @click="loadList" />
        </div>
      </div>

      <!-- 图片网格 -->
      <div v-loading="loading" class="image-grid">
        <el-checkbox-group v-model="selectedKeys" class="image-group">
          <div v-for="asset in list" :key="asset.id" class="image-card">
            <el-checkbox :value="asset.cosKey" class="image-checkbox" />
            <el-image :src="asset.url" :preview-src-list="[asset.url]" fit="cover" lazy />
            <div class="image-info">
              <span class="image-name" :title="asset.filename">{{ asset.filename }}</span>
              <span class="image-meta">{{ formatSize(asset.size) }}</span>
            </div>
            <div class="image-actions">
              <el-button link type="primary" size="small" @click="copyUrl(asset.url)">复制链接</el-button>
              <el-button link type="danger" size="small" @click="removeOne(asset)">删除</el-button>
            </div>
          </div>
        </el-checkbox-group>
        <el-empty v-if="list.length === 0 && !loading" description="暂无图片，点击右上角上传">
          <template #image>
            <el-icon :size="48" color="#c9cdd4"><Picture /></el-icon>
          </template>
        </el-empty>
      </div>

      <div class="batch-bar" v-if="selectedKeys.length > 0">
        <span>已选择 {{ selectedKeys.length }} 张图片</span>
        <el-button link type="danger" @click="removeSelected">批量删除</el-button>
      </div>

      <div class="pagination" v-if="total > 0">
        <el-pagination
          v-model:current-page="query.page"
          v-model:page-size="query.pageSize"
          :total="total"
          :page-sizes="[24, 48, 96]"
          layout="total, sizes, prev, pager, next"
          background
          @size-change="loadList"
          @current-change="loadList"
        />
      </div>
    </el-card>

    <!-- 上传区域 -->
    <el-card shadow="never" class="upload-card">
      <el-upload
        drag
        multiple
        :show-file-list="false"
        :before-upload="beforeUpload"
        :http-request="handleUpload"
        accept="image/*"
        class="uploader"
      >
        <div class="upload-inner">
          <el-icon :size="40" color="#c9cdd4"><UploadFilled /></el-icon>
          <p class="upload-text">将图片拖到此处，或 <em>点击上传</em></p>
          <p class="upload-tip">图片将存储到腾讯云 COS，支持 PNG / JPG / GIF / WebP / SVG，单张不超过 20MB</p>
        </div>
      </el-upload>
    </el-card>

    <!-- 新建目录弹窗 -->
    <el-dialog v-model="folderDialogVisible" title="新建目录" width="400px">
      <el-input v-model="newFolder" placeholder="例如：2026/10" />
      <template #footer>
        <el-button @click="folderDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="createFolder">创建</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from "vue";
import { ElMessage } from "element-plus";
import { Plus, Refresh, Picture, UploadFilled } from "@element-plus/icons-vue";
import { listImages, uploadImage, deleteImage, deleteImages, createImageFolder } from "@/api";
import { confirm } from "@/utils/http";
import type { Asset } from "@/api/types";

const loading = ref(false);
const list = ref<Asset[]>([]);
const total = ref(0);
const folders = ref<string[]>([]);
const folder = ref<string>("");
const selectedKeys = ref<string[]>([]);

const query = reactive({ page: 1, pageSize: 24 });
const folderDialogVisible = ref(false);
const newFolder = ref("");

async function loadList(): Promise<void> {
  loading.value = true;
  try {
    const data = await listImages({ folder: folder.value || undefined, page: query.page, pageSize: query.pageSize });
    list.value = data.list;
    total.value = data.total;
    folders.value = data.folders;
  } finally {
    loading.value = false;
  }
}

function beforeUpload(file: File): boolean {
  if (!file.type.startsWith("image/")) {
    ElMessage.error("只能上传图片文件");
    return false;
  }
  if (file.size > 20 * 1024 * 1024) {
    ElMessage.error("图片大小不能超过 20MB");
    return false;
  }
  return true;
}

async function handleUpload(options: { file: File }): Promise<void> {
  try {
    await uploadImage(options.file, folder.value || undefined);
    ElMessage.success(`${options.file.name} 上传成功`);
    await loadList();
  } catch (error) {
    ElMessage.error(`${options.file.name} 上传失败：${(error as Error).message}`);
  }
}

async function copyUrl(url: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(url);
    ElMessage.success("链接已复制");
  } catch {
    ElMessage.warning("浏览器不支持自动复制，请手动复制");
  }
}

async function removeOne(asset: Asset): Promise<void> {
  if (!(await confirm(`确认删除图片 ${asset.filename}？`, "删除确认"))) return;
  try {
    await deleteImage(asset.cosKey);
    ElMessage.success("已删除");
    await loadList();
  } catch (error) {
    ElMessage.error((error as Error).message);
  }
}

async function removeSelected(): Promise<void> {
  if (!(await confirm(`确认删除选中的 ${selectedKeys.value.length} 张图片？`, "批量删除"))) return;
  try {
    await deleteImages(selectedKeys.value);
    selectedKeys.value = [];
    ElMessage.success("已删除");
    await loadList();
  } catch (error) {
    ElMessage.error((error as Error).message);
  }
}

async function createFolder(): Promise<void> {
  const value = newFolder.value.trim();
  if (!value) {
    ElMessage.warning("请输入目录名");
    return;
  }
  try {
    await createImageFolder(value);
    ElMessage.success("目录已创建");
    newFolder.value = "";
    folderDialogVisible.value = false;
    await loadList();
  } catch (error) {
    ElMessage.error((error as Error).message);
  }
}

function formatSize(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(2)} MB`;
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

.image-grid {
  min-height: 160px;
}

.image-group {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 14px;
}

.image-card {
  position: relative;
  border: 1px solid #e5e6eb;
  border-radius: 8px;
  overflow: hidden;
  background: #fff;
  transition: box-shadow 0.2s;

  &:hover {
    box-shadow: 0 4px 14px rgba(0, 21, 41, 0.12);
  }

  .image-checkbox {
    position: absolute;
    top: 8px;
    left: 8px;
    z-index: 2;
  }

  :deep(.el-image) {
    width: 100%;
    height: 140px;
    display: block;
  }

  .image-info {
    padding: 8px 10px;
    display: flex;
    flex-direction: column;
    gap: 2px;

    .image-name {
      font-size: 13px;
      color: #1d2129;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .image-meta {
      font-size: 12px;
      color: #86909c;
    }
  }

  .image-actions {
    display: flex;
    justify-content: space-around;
    padding: 4px 0 8px;
  }
}

.batch-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 14px;
  padding: 8px 14px;
  background: #ecf5ff;
  border-radius: 6px;
  font-size: 13px;
  color: #409eff;
}

.pagination {
  display: flex;
  justify-content: flex-end;
  margin-top: 16px;
}

.upload-card {
  margin-top: 16px;
}

.uploader {
  width: 100%;

  :deep(.el-upload-dragger) {
    padding: 24px;
  }
}

.upload-inner {
  text-align: center;

  .upload-text {
    margin: 8px 0 4px;
    font-size: 14px;
    color: #4e5969;

    em {
      color: #409eff;
      font-style: normal;
    }
  }

  .upload-tip {
    margin: 0;
    font-size: 12px;
    color: #86909c;
  }
}
</style>
