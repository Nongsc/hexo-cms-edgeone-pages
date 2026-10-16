<template>
  <div class="login-page">
    <div class="login-card">
      <div class="login-header">
        <div class="brand">
          <span class="brand-mark">H</span>
          <span class="brand-name">Hexo Pro CMS</span>
        </div>
        <p class="brand-desc">基于 EdgeOne Pages 的 Hexo 可视化管理后台</p>
      </div>

      <el-form
        ref="formRef"
        :model="form"
        :rules="rules"
        size="large"
        label-position="top"
        @keyup.enter="handleLogin"
      >
        <el-form-item prop="username">
          <el-input v-model="form.username" placeholder="用户名" :prefix-icon="User" autocomplete="username" />
        </el-form-item>
        <el-form-item prop="password">
          <el-input
            v-model="form.password"
            type="password"
            placeholder="密码"
            :prefix-icon="Lock"
            show-password
            autocomplete="current-password"
          />
        </el-form-item>
        <el-button
          type="primary"
          class="login-button"
          size="large"
          :loading="loading"
          @click="handleLogin"
        >
          登 录
        </el-button>
      </el-form>

      <p class="login-tip">首次登录请使用系统管理预设的管理员账号</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { ElMessage, type FormInstance, type FormRules } from "element-plus";
import { User, Lock } from "@element-plus/icons-vue";
import { useUserStore } from "@/store/modules/user";

const userStore = useUserStore();
const router = useRouter();
const route = useRoute();

const formRef = ref<FormInstance>();
const loading = ref(false);

const form = reactive({
  username: localStorage.getItem("cms-remember-username") ?? "admin",
  password: ""
});

const rules: FormRules = {
  username: [{ required: true, message: "请输入用户名", trigger: "blur" }],
  password: [
    { required: true, message: "请输入密码", trigger: "blur" },
    { min: 6, message: "密码长度至少 6 位", trigger: "blur" }
  ]
};

async function handleLogin(): Promise<void> {
  if (!formRef.value) return;
  await formRef.value.validate(async (valid) => {
    if (!valid) return;
    loading.value = true;
    try {
      await userStore.login(form.username, form.password);
      localStorage.setItem("cms-remember-username", form.username);
      ElMessage.success("登录成功");
      const redirect = (route.query.redirect as string) ?? "/dashboard";
      router.push(redirect);
    } catch (error) {
      ElMessage.error((error as Error).message || "登录失败");
    } finally {
      loading.value = false;
    }
  });
}
</script>

<style scoped lang="scss">
.login-page {
  height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #1d2129 0%, #2b3a55 55%, #409eff 100%);
}

.login-card {
  width: 400px;
  padding: 40px 36px 32px;
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.18);
}

.login-header {
  text-align: center;
  margin-bottom: 28px;
}

.brand {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;

  .brand-mark {
    width: 36px;
    height: 36px;
    border-radius: 10px;
    background: linear-gradient(135deg, #409eff, #66b1ff);
    color: #fff;
    font-weight: 700;
    font-size: 20px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .brand-name {
    font-size: 20px;
    font-weight: 700;
    color: #1d2129;
  }
}

.brand-desc {
  margin: 10px 0 0;
  font-size: 13px;
  color: #86909c;
}

.login-button {
  width: 100%;
  margin-top: 8px;
}

.login-tip {
  margin: 18px 0 0;
  text-align: center;
  font-size: 12px;
  color: #a9aeb8;
}
</style>
