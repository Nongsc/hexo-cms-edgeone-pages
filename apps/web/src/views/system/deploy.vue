<template>
  <div class="page-container">
    <el-card shadow="never">
      <template #header>
        <div class="card-header">
          <span class="card-title">部署通道</span>
          <el-button type="primary" :icon="Position" :loading="deploying" @click="handleDeploy">立即部署</el-button>
        </div>
      </template>

      <el-alert
        title="博客通过 EdgeOne Makers 关联 GitHub 仓库自动部署：内容推送到仓库（push）即自动构建。CMS 每次保存内容都会推送，因此保存即部署；点击「立即部署」会创建一个空提交，人为触发一次构建。"
        type="info"
        :closable="false"
        show-icon
        class="deploy-alert"
      />

      <el-radio-group v-model="channel" class="channel-group">
        <div v-for="item in channels" :key="item.value" class="channel-card" :class="{ 'is-active': channel === item.value }">
          <el-radio :value="item.value" class="channel-radio">
            <span class="channel-label">{{ item.label }}</span>
          </el-radio>
          <p class="channel-desc">{{ item.description }}</p>
        </div>
      </el-radio-group>

      <el-form label-width="140px" class="deploy-form">
        <el-form-item label="部署方式">
          <el-tag type="success" effect="plain">EdgeOne Makers · 关联 GitHub 自动部署</el-tag>
          <span class="form-tip">推送即构建，无需配置 CI 工作流</span>
        </el-form-item>
        <el-form-item label="构建命令">
          <el-input :model-value="buildCommand" disabled style="width: 260px" />
        </el-form-item>
        <el-form-item label="发布目录">
          <el-input :model-value="publishDir" disabled style="width: 260px" />
        </el-form-item>
      </el-form>
    </el-card>

    <el-card shadow="never" class="log-card">
      <template #header><span class="card-title">部署日志</span></template>
      <el-timeline>
        <el-timeline-item
          v-for="log in logs"
          :key="log.id"
          :type="logStatusType(log.status)"
          :timestamp="formatTime(log.createdAt)"
          placement="top"
        >
          <div class="log-item">
            <span class="log-channel">{{ channelLabel(log.channel) }}</span>
            <el-tag :type="logStatusType(log.status)" size="small">{{ statusLabel(log.status) }}</el-tag>
          </div>
          <p class="log-message">{{ log.message }}</p>
        </el-timeline-item>
        <el-empty v-if="logs.length === 0" description="暂无部署记录" :image-size="60" />
      </el-timeline>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from "vue";
import { ElMessage } from "element-plus";
import { Position } from "@element-plus/icons-vue";
import { getDeployChannels, getDeployLogs, triggerDeploy } from "@/api/system";
import { getSettings } from "@/api/system";
import { confirm } from "@/utils/http";
import type { DeployChannel, DeployLog, DeployStatus } from "@/api/types";
import type { DeployChannelInfo } from "@/api/system";

const channels = ref<DeployChannelInfo[]>([]);
const logs = ref<DeployLog[]>([]);
const deploying = ref(false);
const channel = ref<DeployChannel>("edgeone-pages");
const buildCommand = ref("hexo generate");
const publishDir = ref("public");

function channelLabel(value: string): string {
  return channels.value.find((item) => item.value === value)?.label ?? value;
}

function logStatusType(status: DeployStatus): "primary" | "success" | "warning" | "danger" | "info" {
  if (status === "success") return "success";
  if (status === "failed") return "danger";
  if (status === "running" || status === "pending") return "warning";
  return "info";
}

function statusLabel(status: DeployStatus): string {
  const labels: Record<DeployStatus, string> = {
    pending: "等待中",
    running: "进行中",
    success: "成功",
    failed: "失败"
  };
  return labels[status];
}

async function load(): Promise<void> {
  channels.value = await getDeployChannels();
  logs.value = await getDeployLogs();
  const settings = await getSettings();
  channel.value = (settings["deploy.channel"] as DeployChannel) ?? "edgeone-pages";
  buildCommand.value = settings["deploy.buildCommand"] ?? "hexo generate";
  publishDir.value = settings["deploy.publishDir"] ?? "public";
}

async function handleDeploy(): Promise<void> {
  if (!(await confirm(`将创建一个空提交，触发 ${channelLabel(channel.value)} 自动构建，确认继续？`, "部署确认"))) return;
  deploying.value = true;
  try {
    const log = await triggerDeploy(channel.value);
    if (log.status === "success") ElMessage.success(log.message);
    else ElMessage.warning(log.message);
    logs.value = await getDeployLogs();
  } catch (error) {
    ElMessage.error((error as Error).message);
  } finally {
    deploying.value = false;
  }
}

function formatTime(value?: string | null): string {
  if (!value) return "-";
  return value.replace("T", " ").slice(0, 16);
}

onMounted(load);
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

.deploy-alert {
  margin-bottom: 16px;
}

.channel-group {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 16px;
  width: 100%;
}

.channel-card {
  border: 2px solid #e5e6eb;
  border-radius: 8px;
  padding: 14px 18px;
  min-width: 220px;
  cursor: pointer;
  transition: border-color 0.2s;

  &.is-active {
    border-color: #409eff;
    background: #ecf5ff;
  }

  .channel-radio {
    width: 100%;
  }

  .channel-label {
    font-weight: 600;
  }

  .channel-desc {
    margin: 6px 0 0;
    font-size: 12px;
    color: #86909c;
  }
}

.deploy-form {
  max-width: 560px;
}

.form-tip {
  margin-left: 10px;
  font-size: 12px;
  color: #86909c;
}

.log-card {
  margin-top: 16px;
}

.log-item {
  display: flex;
  align-items: center;
  gap: 8px;

  .log-channel {
    font-weight: 600;
    font-size: 14px;
  }
}

.log-message {
  margin: 4px 0 0;
  font-size: 13px;
  color: #4e5969;
}
</style>
