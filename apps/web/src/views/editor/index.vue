<template>
  <div class="editor-page">
    <el-card shadow="never" class="editor-header">
      <div class="header-row">
        <div class="header-left">
          <el-button :icon="Back" circle @click="goBack" />
          <el-input
            v-model="form.title"
            placeholder="请输入文章标题"
            class="title-input"
            size="large"
            maxlength="120"
            show-word-limit
          />
        </div>
        <div class="header-right">
          <el-tag :type="form.status === 'published' ? 'success' : 'info'" size="large">
            {{ form.status === "published" ? "已发布" : "草稿" }}
          </el-tag>
          <el-button :loading="saving" @click="save(false)">保存草稿</el-button>
          <el-button type="primary" :loading="saving" @click="save(true)">发布</el-button>
        </div>
      </div>

      <div class="meta-row">
        <div class="meta-item">
          <span class="meta-label">文章链接</span>
          <el-input v-model="form.slug" placeholder="留空则根据标题自动生成" size="small">
            <template #prepend>{{ kindPath }}</template>
          </el-input>
        </div>
        <div class="meta-item">
          <span class="meta-label">标签</span>
          <el-select
            v-model="form.tags"
            multiple
            filterable
            allow-create
            default-first-option
            placeholder="输入后回车添加"
            size="small"
            class="meta-select"
          >
            <el-option v-for="tag in taxonomy.tags" :key="tag" :label="tag" :value="tag" />
          </el-select>
        </div>
        <div class="meta-item">
          <span class="meta-label">分类</span>
          <el-select
            v-model="form.categories"
            multiple
            filterable
            allow-create
            default-first-option
            placeholder="输入后回车添加"
            size="small"
            class="meta-select"
          >
            <el-option v-for="category in taxonomy.categories" :key="category" :label="category" :value="category" />
          </el-select>
        </div>
        <div class="meta-item meta-item--switch">
          <span class="meta-label">置顶</span>
          <el-switch v-model="form.sticky" />
        </div>
      </div>

      <!-- 简介 -->
      <div class="summary-row">
        <span class="meta-label">简介</span>
        <el-input
          v-model="form.summary"
          type="textarea"
          :rows="2"
          maxlength="300"
          show-word-limit
          placeholder="文章简介 / 摘要，会写入 Front Matter 的 description 字段（可留空）"
        />
      </div>
    </el-card>

    <!-- Front Matter 编辑器（自定义字段） -->
    <el-card shadow="never" class="frontmatter-card">
      <div class="frontmatter-toggle" @click="frontMatterVisible = !frontMatterVisible">
        <el-icon><ArrowDown v-if="!frontMatterVisible" /><ArrowRight v-else /></el-icon>
        <span class="frontmatter-title">Front Matter（自定义字段）</span>
        <el-tag v-if="customFrontMatterText" size="small" type="warning" effect="plain">已编辑</el-tag>
      </div>
      <!-- 用 v-if 而非 v-show：让 Monaco 在可见时才挂载，
           避免 display:none 状态下初始化导致 automaticLayout 测量不到高度 -->
      <div v-if="frontMatterVisible" class="frontmatter-body">
        <el-alert
          title="这里展示并编辑 Front Matter 中的自定义字段（YAML）。标题、标签、分类、简介、置顶等常用字段请使用上方表单。"
          type="info"
          :closable="false"
          show-icon
          class="frontmatter-alert"
        />
        <monaco-editor-vue3
          v-model:value="customFrontMatterText"
          theme="vs-dark"
          language="yaml"
          height="320px"
          class="frontmatter-monaco"
          :options="frontMatterOptions"
        />
      </div>
    </el-card>

    <!-- 正文：左侧编辑、右侧预览 -->
    <el-card shadow="never" class="editor-body">
      <div class="split-pane" :class="{ 'is-vertical': layout === 'vertical' }">
        <div class="pane pane-editor">
          <div class="pane-toolbar">
            <span class="pane-title">Markdown 编辑</span>
            <div class="pane-actions">
              <el-tooltip content="插入图片（来自图床）" placement="top">
                <el-button :icon="Picture" size="small" circle @click="imagePickerVisible = true" />
              </el-tooltip>
              <el-tooltip content="切换预览方向" placement="top">
                <el-button
                  :icon="layout === 'horizontal' ? 'Menu' : 'Grid'"
                  size="small"
                  circle
                  @click="layout = layout === 'horizontal' ? 'vertical' : 'horizontal'"
                />
              </el-tooltip>
            </div>
          </div>
          <monaco-editor-vue3
            v-model:value="form.content"
            class="monaco"
            theme="vs-dark"
            language="markdown"
            :options="editorOptions"
          />
        </div>
        <div class="pane-divider" />
        <div class="pane pane-preview">
          <div class="pane-toolbar">
            <span class="pane-title">实时预览</span>
            <el-radio-group v-model="previewMode" size="small">
              <el-radio-button value="preview">预览</el-radio-button>
              <el-radio-button value="html">HTML</el-radio-button>
            </el-radio-group>
          </div>
          <div v-if="previewMode === 'preview'" ref="previewRef" class="markdown-body" v-html="renderedHtml" />
          <pre v-else class="html-source">{{ renderedHtml }}</pre>
        </div>
      </div>
    </el-card>

    <!-- 图片选择弹窗 -->
    <el-dialog v-model="imagePickerVisible" title="选择图片" width="860px">
      <div class="image-picker">
        <div class="picker-toolbar">
          <el-select v-model="pickerFolder" placeholder="全部目录" clearable size="small" style="width: 160px" @change="loadPickerImages">
            <el-option v-for="folder in folders" :key="folder" :label="folder" :value="folder" />
          </el-select>
          <el-upload :show-file-list="false" :before-upload="beforePickerUpload" :http-request="pickerUpload" accept="image/*">
            <el-button size="small" type="primary" :icon="Upload">上传图片</el-button>
          </el-upload>
        </div>
        <div v-loading="pickerLoading" class="picker-grid">
          <div
            v-for="asset in pickerImages"
            :key="asset.id"
            class="picker-item"
            :class="{ 'is-active': selectedImageId === asset.id }"
            @click="selectedImageId = asset.id"
          >
            <img :src="asset.url" :alt="asset.filename" loading="lazy" />
            <span class="picker-name">{{ asset.filename }}</span>
          </div>
          <el-empty v-if="pickerImages.length === 0" description="暂无图片" :image-size="60" />
        </div>
      </div>
      <template #footer>
        <el-button @click="imagePickerVisible = false">取消</el-button>
        <el-button type="primary" :disabled="!selectedImage" @click="insertImage">插入 Markdown</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { ElMessage } from "element-plus";
import { Back, Picture, Upload, ArrowDown, ArrowRight } from "@element-plus/icons-vue";
import MonacoEditorVue3 from "monaco-editor-vue3";
import { marked } from "marked";
import yaml from "js-yaml";
import {
  getDocument,
  createDocument,
  updateDocument,
  getTaxonomy,
  type DocumentPayload
} from "@/api/documents";
import { listImages, uploadImage } from "@/api";
import type { Document, DocumentKind, DocumentStatus } from "@/api/types";
import type { Asset } from "@/api/types";

const route = useRoute();
const router = useRouter();

/**
 * 文档类型：由路由路径判断（/content/page-editor 为页面，其余为文章），
 * 而不是依赖 query 参数——编辑已有文档时列表页的 goEdit 不带 query，
 * 若依赖 query 会导致页面被误判为文章（返回按钮回到文章列表、保存也走错接口）。
 */
const kind = computed<DocumentKind>(() =>
  route.path.includes("/page-editor") ? "page" : "post"
);
const isNew = computed(() => route.params.id === "new" || !route.params.id);

const saving = ref(false);
const layout = ref<"horizontal" | "vertical">("horizontal");
const previewMode = ref<"preview" | "html">("preview");
const taxonomy = reactiveTaxonomy();

const form = ref({
  title: "",
  slug: "",
  content: "",
  status: "draft" as DocumentStatus,
  tags: [] as string[],
  categories: [] as string[],
  sticky: false,
  summary: ""
});

/** Front Matter 保留字段：这些字段有专门 UI，不在自定义字段编辑器里展示。 */
const RESERVED_FRONT_MATTER_KEYS = new Set([
  "title",
  "date",
  "updated",
  "tags",
  "categories",
  "cover",
  "sticky",
  "top",
  "description",
  "published"
]);

/** 自定义 Front Matter 字段的 YAML 文本（用于 Monaco 编辑器）。 */
const frontMatterVisible = ref(false);
const customFrontMatterText = ref("");
const frontMatterOptions = {
  fontSize: 13,
  minimap: { enabled: false },
  wordWrap: "on",
  scrollBeyondLastLine: false,
  automaticLayout: true,
  lineNumbers: "on",
  tabSize: 2,
  folding: true,
  scrollbar: { vertical: "auto", horizontal: "auto" }
};

/** 把完整 frontMatter 对象过滤出自定义字段，序列化为 YAML 文本。 */
function customFrontMatterToYaml(frontMatter: Record<string, unknown>): string {
  const custom: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(frontMatter ?? {})) {
    if (!RESERVED_FRONT_MATTER_KEYS.has(key)) {
      custom[key] = value;
    }
  }
  if (Object.keys(custom).length === 0) return "";
  return yaml.dump(custom, { indent: 2, lineWidth: -1, noRefs: true });
}

/** 把 YAML 文本解析为自定义字段对象；空文本返回空对象。 */
function yamlToCustomFrontMatter(text: string): Record<string, unknown> {
  const trimmed = text.trim();
  if (!trimmed) return {};
  try {
    const parsed = yaml.load(trimmed);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return {};
  } catch {
    return {};
  }
}

const kindPath = computed(() => {
  if (kind.value === "page") {
    return form.value.status === "published" ? "source/" : "source/_drafts/";
  }
  return form.value.status === "published" ? "source/_posts/" : "source/_drafts/";
});

const editorOptions = {
  fontSize: 14,
  minimap: { enabled: false },
  wordWrap: "on",
  scrollBeyondLastLine: false,
  automaticLayout: true,
  lineNumbers: "on",
  renderLineHighlight: "all",
  tabSize: 2,
  formatOnPaste: true,
  fontFamily: "'JetBrains Mono', 'Fira Code', Consolas, monospace"
};

const renderedHtml = computed(() => marked.parse(form.value.content || "", { async: false }) as string);

function reactiveTaxonomy() {
  return { tags: [] as string[], categories: [] as string[] };
}

// ---- 图片选择器 ----
const imagePickerVisible = ref(false);
const pickerLoading = ref(false);
const pickerImages = ref<Asset[]>([]);
const pickerFolder = ref<string>("");
const folders = ref<string[]>([]);
const selectedImageId = ref<number | null>(null);
const selectedImage = computed(() => pickerImages.value.find((item) => item.id === selectedImageId.value) ?? null);

async function loadPickerImages(): Promise<void> {
  pickerLoading.value = true;
  try {
    const data = await listImages({ folder: pickerFolder.value || undefined, page: 1, pageSize: 100 });
    pickerImages.value = data.list;
    folders.value = data.folders;
  } finally {
    pickerLoading.value = false;
  }
}

function beforePickerUpload(file: File): boolean {
  const isImage = file.type.startsWith("image/");
  if (!isImage) {
    ElMessage.error("只能上传图片文件");
    return false;
  }
  if (file.size > 20 * 1024 * 1024) {
    ElMessage.error("图片大小不能超过 20MB");
    return false;
  }
  return true;
}

async function pickerUpload(options: { file: File }): Promise<void> {
  try {
    const asset = await uploadImage(options.file, pickerFolder.value || undefined);
    ElMessage.success("上传成功");
    await loadPickerImages();
    selectedImageId.value = asset.id;
  } catch (error) {
    ElMessage.error((error as Error).message);
  }
}

function insertImage(): void {
  const asset = selectedImage.value;
  if (!asset) return;
  const snippet = `\n![${asset.filename}](${asset.url})\n`;
  form.value.content = `${form.value.content}${snippet}`;
  imagePickerVisible.value = false;
  ElMessage.success("已插入图片");
}

watch(imagePickerVisible, (visible) => {
  if (visible) loadPickerImages();
});

// ---- 数据加载与保存 ----
async function loadDocument(): Promise<void> {
  if (isNew.value) {
    form.value.title = "";
    form.value.slug = "";
    form.value.content = "";
    form.value.status = "draft";
    form.value.tags = [];
    form.value.categories = [];
    form.value.sticky = false;
    form.value.summary = "";
    customFrontMatterText.value = "";
    frontMatterVisible.value = false;
    return;
  }
  const document: Document = await getDocument(Number(route.params.id));
  form.value.title = document.title;
  form.value.slug = document.slug;
  form.value.content = document.content;
  form.value.status = document.status;
  form.value.tags = [...document.tags];
  form.value.categories = [...document.categories];
  form.value.sticky = document.sticky;
  form.value.summary = document.summary;
  customFrontMatterText.value = customFrontMatterToYaml(document.frontMatter);
  // 有自定义字段时默认展开，便于直接看到内容
  frontMatterVisible.value = customFrontMatterText.value.trim().length > 0;
}

async function save(publish: boolean): Promise<void> {
  if (!form.value.title.trim()) {
    ElMessage.warning("请输入文章标题");
    return;
  }

  saving.value = true;
  try {
    // 解析自定义 Front Matter（YAML -> 对象），YAML 非法时提示但不阻断保存
    const customFrontMatter = yamlToCustomFrontMatter(customFrontMatterText.value);
    const payload: DocumentPayload = {
      title: form.value.title.trim(),
      content: form.value.content,
      slug: form.value.slug.trim() || undefined,
      status: publish ? "published" : "draft",
      tags: form.value.tags,
      categories: form.value.categories,
      sticky: form.value.sticky,
      summary: form.value.summary || undefined,
      frontMatter: customFrontMatter
    };

    if (isNew.value) {
      const created = await createDocument(kind.value, payload);
      ElMessage.success(publish ? "已发布" : "草稿已保存");
      const editorPath = kind.value === "page" ? "/content/page-editor" : "/content/editor";
      router.replace(`${editorPath}/${created.id}`);
    } else {
      await updateDocument(Number(route.params.id), payload);
      ElMessage.success(publish ? "已发布" : "草稿已保存");
      await loadDocument();
    }
  } catch (error) {
    ElMessage.error((error as Error).message);
  } finally {
    saving.value = false;
  }
}

function goBack(): void {
  router.push(kind.value === "page" ? "/content/pages" : "/content/posts");
}

onMounted(async () => {
  const data = await getTaxonomy();
  taxonomy.tags = data.tags;
  taxonomy.categories = data.categories;
  await loadDocument();
});
</script>

<style scoped lang="scss">
.editor-page {
  display: flex;
  flex-direction: column;
  gap: 12px;
  height: 100%;
}

.editor-header {
  flex-shrink: 0;
}

.header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 1;
  min-width: 320px;
}

.title-input {
  flex: 1;
  max-width: 560px;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.meta-row {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  margin-top: 14px;
  padding-top: 14px;
  border-top: 1px dashed #e5e6eb;
}

.meta-item {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 240px;

  .meta-label {
    font-size: 13px;
    color: #4e5969;
    white-space: nowrap;
  }

  &--switch {
    min-width: auto;
  }
}

.meta-select {
  width: 260px;
}

.summary-row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px dashed #e5e6eb;

  .meta-label {
    font-size: 13px;
    color: #4e5969;
    white-space: nowrap;
    padding-top: 6px;
    flex-shrink: 0;
  }
}

.frontmatter-card {
  flex-shrink: 0;
}

.frontmatter-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  user-select: none;
  color: #1d2129;

  .frontmatter-title {
    font-size: 14px;
    font-weight: 600;
  }
}

.frontmatter-body {
  margin-top: 12px;
}

.frontmatter-alert {
  margin-bottom: 10px;
}

.frontmatter-monaco {
  height: 320px;
  border: 1px solid #e5e6eb;
  border-radius: 6px;
  overflow: hidden;

  // 确保 Monaco 内部的 .monaco-editor 容器撑满高度
  :deep(.monaco-editor) {
    height: 100%;
  }
}

.editor-body {
  flex: 1;
  min-height: 480px;
  display: flex;
  overflow: hidden;
}

.split-pane {
  display: flex;
  flex: 1;
  min-height: 440px;
  gap: 0;

  &.is-vertical {
    flex-direction: column;
  }
}

.pane {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  border: 1px solid #e5e6eb;
  border-radius: 6px;
  overflow: hidden;
}

.pane-divider {
  width: 10px;
  flex-shrink: 0;
}

.is-vertical .pane-divider {
  width: auto;
  height: 10px;
}

.pane-toolbar {
  height: 38px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 10px;
  background: #f7f8fa;
  border-bottom: 1px solid #e5e6eb;
  flex-shrink: 0;

  .pane-title {
    font-size: 13px;
    font-weight: 600;
    color: #4e5969;
  }
}

.pane-actions {
  display: flex;
  gap: 6px;
}

.monaco {
  flex: 1;
  min-height: 380px;
}

.markdown-body {
  flex: 1;
  overflow: auto;
  padding: 16px 20px;
  background: #fff;

  :deep(h1), :deep(h2), :deep(h3) {
    margin: 14px 0 8px;
    font-weight: 600;
  }
  :deep(h1) { font-size: 22px; }
  :deep(h2) { font-size: 19px; }
  :deep(h3) { font-size: 16px; }
  :deep(p) { margin: 8px 0; line-height: 1.7; }
  :deep(code) {
    background: #f2f3f5;
    padding: 2px 5px;
    border-radius: 4px;
    font-size: 0.9em;
    font-family: Consolas, monospace;
  }
  :deep(pre) {
    background: #1d2129;
    color: #e5e6eb;
    padding: 12px;
    border-radius: 6px;
    overflow: auto;
    code { background: none; color: inherit; }
  }
  :deep(blockquote) {
    border-left: 4px solid #409eff;
    padding: 4px 12px;
    margin: 8px 0;
    background: #ecf5ff;
    color: #4e5969;
  }
  :deep(table) {
    border-collapse: collapse;
    width: 100%;
    th, td { border: 1px solid #e5e6eb; padding: 6px 10px; }
    th { background: #f7f8fa; }
  }
  :deep(img) { max-width: 100%; border-radius: 6px; }
  :deep(ul), :deep(ol) { padding-left: 22px; }
}

.html-source {
  flex: 1;
  overflow: auto;
  margin: 0;
  padding: 16px;
  background: #1d2129;
  color: #a9aeb8;
  font-size: 12px;
  font-family: Consolas, monospace;
  white-space: pre-wrap;
  word-break: break-all;
}

.image-picker {
  .picker-toolbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 12px;
  }

  .picker-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: 12px;
    max-height: 420px;
    overflow: auto;
    min-height: 120px;
  }

  .picker-item {
    border: 2px solid transparent;
    border-radius: 8px;
    overflow: hidden;
    cursor: pointer;
    background: #f7f8fa;
    transition: border-color 0.2s;

    &.is-active {
      border-color: #409eff;
    }

    img {
      width: 100%;
      height: 110px;
      object-fit: cover;
      display: block;
    }

    .picker-name {
      display: block;
      padding: 6px 8px;
      font-size: 12px;
      color: #4e5969;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  }
}
</style>
