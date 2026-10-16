<template>
  <div class="dashboard" v-loading="loading">
    <!-- 第一层：快捷操作与系统状态 -->
    <div class="quick-bar">
      <div class="quick-actions">
        <el-button type="primary" :icon="EditPen" @click="router.push('/content/editor/new?kind=post')">新建文章</el-button>
        <el-button :icon="Document" @click="goDrafts">草稿箱</el-button>
        <el-button :icon="Position" :loading="deploying" @click="handleDeploy">部署</el-button>
        <el-button :icon="Link" @click="openBlog">博客前台</el-button>
        <el-button :icon="Refresh" @click="loadData">刷新</el-button>
      </div>
      <div class="quick-status">
        <div class="status-item">
          <span class="status-label">Hexo 版本</span>
          <span class="status-value">{{ data?.quick.hexoVersion || "-" }}</span>
        </div>
        <div class="status-item">
          <span class="status-label">主题</span>
          <span class="status-value">{{ data?.quick.theme || "-" }}</span>
        </div>
        <div class="status-item">
          <span class="status-label">上次部署</span>
          <span class="status-value">{{ formatTime(data?.quick.lastDeployAt) }}</span>
        </div>
        <div class="status-item">
          <span class="status-label">启用插件</span>
          <span class="status-value">{{ data?.quick.pluginCount ?? 0 }}</span>
        </div>
        <div class="status-item">
          <span class="status-label">文章总数</span>
          <span class="status-value">{{ data?.quick.totalPosts ?? 0 }}</span>
        </div>
      </div>
    </div>

    <!-- 第二层：统计卡片 -->
    <el-row :gutter="16" class="card-row">
      <el-col :xs="24" :sm="12" :md="6">
        <div class="stat-card stat-card--blue">
          <div class="stat-icon"><el-icon><Plus /></el-icon></div>
          <div class="stat-body">
            <div class="stat-value">{{ data?.cards.monthNew ?? 0 }}</div>
            <div class="stat-label">本月新增</div>
          </div>
        </div>
      </el-col>
      <el-col :xs="24" :sm="12" :md="6">
        <div class="stat-card stat-card--orange">
          <div class="stat-icon"><el-icon><Edit /></el-icon></div>
          <div class="stat-body">
            <div class="stat-value">{{ data?.cards.drafts ?? 0 }}</div>
            <div class="stat-label">草稿数量</div>
          </div>
        </div>
      </el-col>
      <el-col :xs="24" :sm="12" :md="6">
        <div class="stat-card stat-card--green">
          <div class="stat-icon"><el-icon><List /></el-icon></div>
          <div class="stat-body">
            <div class="stat-value">{{ data?.cards.todos ?? 0 }}</div>
            <div class="stat-label">待办数量</div>
          </div>
        </div>
      </el-col>
      <el-col :xs="24" :sm="12" :md="6">
        <div class="stat-card stat-card--purple">
          <div class="stat-icon"><el-icon><Files /></el-icon></div>
          <div class="stat-body">
            <div class="stat-value">{{ data?.cards.pages ?? 0 }}</div>
            <div class="stat-label">页面数量</div>
          </div>
        </div>
      </el-col>
    </el-row>

    <!-- 第三层：可视化图表 -->
    <el-row :gutter="16" class="chart-row">
      <el-col :xs="24" :md="16">
        <el-card shadow="never">
          <template #header><span class="card-title">近 6 月文章发布趋势</span></template>
          <div ref="trendRef" class="chart" />
        </el-card>
      </el-col>
      <el-col :xs="24" :md="8">
        <el-card shadow="never">
          <template #header><span class="card-title">分类占比</span></template>
          <div ref="categoryRef" class="chart" />
        </el-card>
      </el-col>
    </el-row>

    <el-row :gutter="16" class="chart-row">
      <el-col :xs="24" :md="12">
        <el-card shadow="never">
          <template #header><span class="card-title">标签云</span></template>
          <div class="tag-cloud">
            <el-tag
              v-for="tag in data?.charts.tags ?? []"
              :key="tag.name"
              :size="tagSize(tag.weight)"
              class="tag-item"
              effect="plain"
              round
            >
              {{ tag.name }} · {{ tag.weight }}
            </el-tag>
            <el-empty v-if="(data?.charts.tags ?? []).length === 0" description="暂无标签" :image-size="60" />
          </div>
        </el-card>
      </el-col>
      <el-col :xs="24" :md="12">
        <el-card shadow="never">
          <template #header>
            <div class="card-header">
              <span class="card-title">最近文章 Top 5</span>
              <el-link type="primary" :underline="false" @click="router.push('/content/posts')">全部文章</el-link>
            </div>
          </template>
          <ul class="recent-list">
            <li v-for="post in data?.charts.recentPosts ?? []" :key="post.id" class="recent-item">
              <span class="recent-title" @click="openPost(post.id)">{{ post.title }}</span>
              <span class="recent-time">{{ formatTime(post.publishedAt) }}</span>
            </li>
            <el-empty v-if="(data?.charts.recentPosts ?? []).length === 0" description="暂无文章" :image-size="60" />
          </ul>
        </el-card>
      </el-col>
    </el-row>

    <!-- 第四层：待办事项与部署信息 -->
    <el-row :gutter="16" class="chart-row">
      <el-col :xs="24" :md="10">
        <el-card shadow="never">
          <template #header>
            <div class="card-header">
              <span class="card-title">待办事项</span>
              <el-link type="primary" :underline="false" @click="todoDialogVisible = true">新增</el-link>
            </div>
          </template>
          <div class="todo-list">
            <div v-for="todo in data?.detail.todos ?? []" :key="todo.id" class="todo-item">
              <el-checkbox
                :model-value="todo.done"
                @change="(value: any) => toggleTodo(todo.id, Boolean(value))"
              />
              <span class="todo-title" :class="{ 'is-done': todo.done }">{{ todo.title }}</span>
              <el-icon class="todo-delete" @click="removeTodo(todo.id)"><Delete /></el-icon>
            </div>
            <el-empty v-if="(data?.detail.todos ?? []).length === 0" description="暂无待办" :image-size="60" />
          </div>
        </el-card>
      </el-col>

      <el-col :xs="24" :md="14">
        <el-card shadow="never">
          <template #header><span class="card-title">系统信息</span></template>
          <el-descriptions :column="2" border>
            <el-descriptions-item label="Hexo 版本">{{ data?.quick.hexoVersion || "-" }}</el-descriptions-item>
            <el-descriptions-item label="主题">{{ data?.quick.theme || "-" }}</el-descriptions-item>
            <el-descriptions-item label="上次部署">{{ formatTime(data?.quick.lastDeployAt) }}</el-descriptions-item>
            <el-descriptions-item label="插件状态">
              {{ data?.quick.pluginCount ?? 0 }} 个已启用
            </el-descriptions-item>
          </el-descriptions>
        </el-card>

        <el-card shadow="never" class="deploy-card">
          <template #header><span class="card-title">部署日志</span></template>
          <el-timeline>
            <el-timeline-item
              v-for="log in data?.detail.deployLogs ?? []"
              :key="log.id"
              :type="logStatusType(log.status)"
              :timestamp="formatTime(log.createdAt)"
            >
              <span class="deploy-channel">{{ channelLabel(log.channel) }}</span>
              <span class="deploy-message">{{ log.message }}</span>
            </el-timeline-item>
            <el-empty v-if="(data?.detail.deployLogs ?? []).length === 0" description="暂无部署记录" :image-size="60" />
          </el-timeline>
        </el-card>
      </el-col>
    </el-row>

    <!-- 新增待办弹窗 -->
    <el-dialog v-model="todoDialogVisible" title="新增待办" width="420px">
      <el-input v-model="todoTitle" placeholder="请输入待办内容" maxlength="100" show-word-limit />
      <template #footer>
        <el-button @click="todoDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="addTodo">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { ElMessage } from "element-plus";
import { EditPen, Document, Position, Link, Refresh, Plus, Edit, List, Files, Delete } from "@element-plus/icons-vue";
import * as echarts from "echarts/core";
import { LineChart, PieChart } from "echarts/charts";
import { GridComponent, TooltipComponent, LegendComponent, TitleComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import { getDashboard } from "@/api";
import { createTodo, deleteTodo, updateTodo } from "@/api/todos";
import { triggerDeploy } from "@/api/system";
import { confirm } from "@/utils/http";
import type { DashboardData, DeployStatus } from "@/api/types";

echarts.use([LineChart, PieChart, GridComponent, TooltipComponent, LegendComponent, TitleComponent, CanvasRenderer]);

const router = useRouter();
const loading = ref(false);
const deploying = ref(false);
const data = ref<DashboardData | null>(null);

const trendRef = ref<HTMLDivElement>();
const categoryRef = ref<HTMLDivElement>();
let trendChart: echarts.ECharts | null = null;
let categoryChart: echarts.ECharts | null = null;

const todoDialogVisible = ref(false);
const todoTitle = ref("");

async function loadData(): Promise<void> {
  loading.value = true;
  try {
    data.value = await getDashboard();
    renderCharts();
  } finally {
    loading.value = false;
  }
}

function renderCharts(): void {
  if (!data.value) return;

  trendChart?.dispose();
  categoryChart?.dispose();

  if (trendRef.value) {
    trendChart = echarts.init(trendRef.value);
    trendChart.setOption({
      tooltip: { trigger: "axis" },
      grid: { left: 40, right: 16, top: 16, bottom: 30 },
      xAxis: { type: "category", data: data.value.charts.publishTrend.map((item) => item.month), boundaryGap: false },
      yAxis: { type: "value", minInterval: 1 },
      series: [
        {
          type: "line",
          smooth: true,
          data: data.value.charts.publishTrend.map((item) => item.count),
          areaStyle: { opacity: 0.15 },
          itemStyle: { color: "#409eff" },
          lineStyle: { width: 2.5 }
        }
      ]
    });
  }

  if (categoryRef.value) {
    categoryChart = echarts.init(categoryRef.value);
    categoryChart.setOption({
      tooltip: { trigger: "item", formatter: "{b}: {c} ({d}%)" },
      legend: { bottom: 0, type: "scroll" },
      series: [
        {
          type: "pie",
          radius: ["40%", "70%"],
          avoidLabelOverlap: true,
          itemStyle: { borderRadius: 6, borderColor: "#fff", borderWidth: 2 },
          label: { show: false },
          emphasis: { label: { show: true, fontSize: 13, fontWeight: "bold" } },
          data: data.value.charts.categories.map((item) => ({ name: item.name, value: item.count }))
        }
      ]
    });
  }
}

function tagSize(weight: number): "large" | "default" | "small" {
  if (weight >= 5) return "large";
  if (weight >= 2) return "default";
  return "small";
}

function formatTime(value?: string | null): string {
  if (!value) return "-";
  return value.replace("T", " ").slice(0, 16);
}

function logStatusType(status: DeployStatus): "primary" | "success" | "warning" | "danger" | "info" {
  if (status === "success") return "success";
  if (status === "failed") return "danger";
  if (status === "running" || status === "pending") return "warning";
  return "info";
}

function channelLabel(channel: string): string {
  const labels: Record<string, string> = {
    "edgeone-pages": "EdgeOne Pages",
    "github-pages": "GitHub Pages",
    "cloudflare-pages": "Cloudflare Pages"
  };
  return labels[channel] ?? channel;
}

function goDrafts(): void {
  router.push({ path: "/content/posts", query: { status: "draft" } });
}

function openBlog(): void {
  const url = data.value?.quick.blogUrl;
  if (url) window.open(url, "_blank");
  else router.push("/system/settings");
}

function openPost(id: number): void {
  router.push(`/content/editor/${id}`);
}

async function handleDeploy(): Promise<void> {
  if (!(await confirm("将触发一次站点构建与发布，确认继续？", "部署确认"))) return;
  deploying.value = true;
  try {
    const log = await triggerDeploy("edgeone-pages");
    ElMessage.success(log.message);
    await loadData();
  } catch (error) {
    ElMessage.error((error as Error).message);
  } finally {
    deploying.value = false;
  }
}

async function addTodo(): Promise<void> {
  const title = todoTitle.value.trim();
  if (!title) {
    ElMessage.warning("请输入待办内容");
    return;
  }
  try {
    await createTodo(title);
    todoTitle.value = "";
    todoDialogVisible.value = false;
    await loadData();
  } catch (error) {
    ElMessage.error((error as Error).message);
  }
}

async function toggleTodo(id: number, done: boolean): Promise<void> {
  try {
    await updateTodo(id, { done });
    await loadData();
  } catch (error) {
    ElMessage.error((error as Error).message);
  }
}

async function removeTodo(id: number): Promise<void> {
  if (!(await confirm("确认删除该待办？"))) return;
  try {
    await deleteTodo(id);
    await loadData();
  } catch (error) {
    ElMessage.error((error as Error).message);
  }
}

function handleResize(): void {
  trendChart?.resize();
  categoryChart?.resize();
}

onMounted(() => {
  loadData();
  window.addEventListener("resize", handleResize);
});

onBeforeUnmount(() => {
  window.removeEventListener("resize", handleResize);
  trendChart?.dispose();
  categoryChart?.dispose();
});
</script>

<style scoped lang="scss">
.dashboard {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.quick-bar {
  background: #fff;
  border-radius: 8px;
  padding: 16px 20px;
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  align-items: center;
  justify-content: space-between;
  box-shadow: 0 1px 4px rgba(0, 21, 41, 0.06);
}

.quick-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.quick-status {
  display: flex;
  flex-wrap: wrap;
  gap: 20px;
}

.status-item {
  display: flex;
  flex-direction: column;
  gap: 2px;

  .status-label {
    font-size: 12px;
    color: #86909c;
  }

  .status-value {
    font-size: 14px;
    font-weight: 600;
    color: #1d2129;
  }
}

.card-row,
.chart-row {
  margin-top: 0 !important;
}

.stat-card {
  background: #fff;
  border-radius: 8px;
  padding: 20px;
  display: flex;
  align-items: center;
  gap: 16px;
  box-shadow: 0 1px 4px rgba(0, 21, 41, 0.06);
  margin-bottom: 16px;

  .stat-icon {
    width: 52px;
    height: 52px;
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 24px;
    color: #fff;
  }

  .stat-value {
    font-size: 26px;
    font-weight: 700;
    color: #1d2129;
    line-height: 1.2;
  }

  .stat-label {
    font-size: 13px;
    color: #86909c;
    margin-top: 2px;
  }

  &--blue .stat-icon { background: linear-gradient(135deg, #409eff, #66b1ff); }
  &--orange .stat-icon { background: linear-gradient(135deg, #e6a23c, #ebb563); }
  &--green .stat-icon { background: linear-gradient(135deg, #67c23a, #85ce61); }
  &--purple .stat-icon { background: linear-gradient(135deg, #8b5cf6, #a78bfa); }
}

.chart {
  height: 280px;
}

.card-title {
  font-size: 15px;
  font-weight: 600;
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.tag-cloud {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  min-height: 60px;
  align-items: center;
}

.recent-list {
  list-style: none;
  margin: 0;
  padding: 0;

  .recent-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 9px 0;
    border-bottom: 1px dashed #e5e6eb;

    &:last-child {
      border-bottom: none;
    }
  }

  .recent-title {
    cursor: pointer;
    color: #1d2129;
    font-size: 14px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;

    &:hover {
      color: #409eff;
    }
  }

  .recent-time {
    font-size: 12px;
    color: #86909c;
    flex-shrink: 0;
    margin-left: 12px;
  }
}

.todo-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 60px;
}

.todo-item {
  display: flex;
  align-items: center;
  gap: 8px;

  .todo-title {
    flex: 1;
    font-size: 14px;

    &.is-done {
      text-decoration: line-through;
      color: #a9aeb8;
    }
  }

  .todo-delete {
    cursor: pointer;
    color: #f56c6c;
    visibility: hidden;
  }

  &:hover .todo-delete {
    visibility: visible;
  }
}

.deploy-card {
  margin-top: 16px;
}

.deploy-channel {
  font-weight: 600;
  margin-right: 8px;
}

.deploy-message {
  font-size: 13px;
  color: #4e5969;
}
</style>
