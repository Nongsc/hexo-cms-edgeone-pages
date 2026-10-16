<template>
  <div class="error-page">
    <div class="error-inner">
      <p class="error-code">404</p>
      <p class="error-text">抱歉，你访问的页面不存在</p>
      <el-button type="primary" @click="router.push('/')">返回首页</el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useRouter } from "vue-router";

const router = useRouter();
</script>

<style scoped>
.error-page {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.error-inner {
  text-align: center;
}

.error-code {
  margin: 0;
  font-size: 90px;
  font-weight: 700;
  color: #409eff;
  line-height: 1;
}

.error-text {
  margin: 12px 0 24px;
  font-size: 16px;
  color: #4e5969;
}
</style>
