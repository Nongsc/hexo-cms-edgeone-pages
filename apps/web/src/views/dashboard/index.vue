<template>
  <div class="dashboard" v-loading="loading">
    <!-- 第一层：快捷操作与系统状态 -->
    <div class="quick-bar">
      <div class="quick-actions">
        <el-button type="primary" :icon="EditPen" @click="router.push('/content/editor/new?kind=post')">新建文章</el-button>
        <el-button :icon="Document" @click="goDrafts">草稿箱</el-button>
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
          <span class="status-label">上次推送</span>
          <span class="status-value">{{ formatTime(data?.quick.lastPushAt) }}</span>
        </div>
        <div class="status-item">
          <span class="status-label">安装插件</span>
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
            <vue-word-cloud
              v-if="tagWords.length > 0"
              style="width: 100%; height: 280px"
              :words="tagWords"
              :color="tagColor"
              font-family="'Finger Paint', 'Microsoft YaHei', sans-serif"
              :font-size-ratio="6"
              :spacing="0.3"
              :rotation="tagRotation"
              rotation-unit="turn"
              :enter-animation="tagEnterAnimation"
              :leave-animation="tagLeaveAnimation"
              :animation-duration="1000"
            />
            <el-empty v-else description="暂无标签" :image-size="60" />
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

        <el-card shadow="never" class="todo-card">
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
import { onBeforeUnmount, onMounted, ref, computed } from "vue";
import { useRouter } from "vue-router";
import { ElMessage } from "element-plus";
import { EditPen, Document, Link, Refresh, Plus, Edit, List, Files, Delete } from "@element-plus/icons-vue";
import * as echarts from "echarts/core";
import { LineChart, PieChart } from "echarts/charts";
import { GridComponent, TooltipComponent, LegendComponent, TitleComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import VueWordCloud from "vuewordcloud";
import { getDashboard } from "@/api";
import { createTodo, deleteTodo, updateTodo } from "@/api/todos";
import { confirm } from "@/utils/http";
import type { DashboardData } from "@/api/types";

echarts.use([LineChart, PieChart, GridComponent, TooltipComponent, LegendComponent, TitleComponent, CanvasRenderer]);

const router = useRouter();
const loading = ref(false);
const data = ref<DashboardData | null>(null);

const trendRef = ref<HTMLDivElement>();
const categoryRef = ref<HTMLDivElement>();
let trendChart: echarts.ECharts | null = null;
let categoryChart: echarts.ECharts | null = null;

const todoDialogVisible = ref(false);
const todoTitle = ref("");

/** 标签云数据：转为 VueWordCloud 需要的 [text, weight] 数组。 */
const tagWords = computed(() => (data.value?.charts.tags ?? []).map((tag) => [tag.name, tag.weight] as [string, number]));

/** 标签云颜色：demo 最后一个色板（金黄/青/蓝/红/深紫），随机取色。 */
const TAG_COLORS = ["#ffd077", "#3bc4c7", "#3a9eea", "#ff4e69", "#461e47"];
const tagColor = (): string => TAG_COLORS[Math.floor(Math.random() * TAG_COLORS.length)];

/** 标签云旋转：十字（一半水平 0，一半垂直 3/4 turn = 90° 竖排）。 */
const tagRotation = (): number => (Math.random() < 0.5 ? 0 : 3 / 4);

/** 标签云淡入淡出动画（opacity 过渡）。 */
const tagEnterAnimation = { opacity: 0 };
const tagLeaveAnimation = { opacity: 0 };

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

function formatTime(value?: string | null): string {
  if (!value) return "-";
  return value.replace("T", " ").slice(0, 16);
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
  min-height: 280px;
  align-items: center;
  justify-content: center;
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

.todo-card {
  margin-top: 16px;
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
</style>
