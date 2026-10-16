<template>
  <div class="page-container">
    <el-card shadow="never">
      <template #header><span class="card-title">账号信息</span></template>

      <el-descriptions :column="1" border class="account-info">
        <el-descriptions-item label="用户名">{{ account.username || "-" }}</el-descriptions-item>
        <el-descriptions-item label="显示名称">{{ account.displayName || "-" }}</el-descriptions-item>
      </el-descriptions>

      <el-divider content-position="left">修改密码</el-divider>

      <el-form ref="formRef" :model="form" :rules="rules" label-width="120px" class="password-form">
        <el-form-item label="当前密码" prop="currentPassword">
          <el-input v-model="form.currentPassword" type="password" show-password style="width: 320px" />
        </el-form-item>
        <el-form-item label="新密码" prop="newPassword">
          <el-input v-model="form.newPassword" type="password" show-password style="width: 320px" />
        </el-form-item>
        <el-form-item label="确认新密码" prop="confirmPassword">
          <el-input v-model="form.confirmPassword" type="password" show-password style="width: 320px" />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :loading="saving" @click="handleChangePassword">确认修改</el-button>
        </el-form-item>
      </el-form>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from "vue";
import { ElMessage, type FormInstance, type FormRules } from "element-plus";
import { getAccount, changePassword } from "@/api/system";

const saving = ref(false);
const formRef = ref<FormInstance>();
const account = ref({ username: "", displayName: "" });

const form = reactive({
  currentPassword: "",
  newPassword: "",
  confirmPassword: ""
});

const rules: FormRules = {
  currentPassword: [{ required: true, message: "请输入当前密码", trigger: "blur" }],
  newPassword: [
    { required: true, message: "请输入新密码", trigger: "blur" },
    { min: 8, message: "新密码长度至少 8 位", trigger: "blur" }
  ],
  confirmPassword: [
    { required: true, message: "请再次输入新密码", trigger: "blur" },
    {
      validator: (_rule, value, callback) => {
        if (value !== form.newPassword) callback(new Error("两次输入的密码不一致"));
        else callback();
      },
      trigger: "blur"
    }
  ]
};

async function handleChangePassword(): Promise<void> {
  if (!formRef.value) return;
  await formRef.value.validate(async (valid) => {
    if (!valid) return;
    saving.value = true;
    try {
      await changePassword(form.currentPassword, form.newPassword);
      ElMessage.success("密码已修改，请重新登录");
      form.currentPassword = "";
      form.newPassword = "";
      form.confirmPassword = "";
    } catch (error) {
      ElMessage.error((error as Error).message);
    } finally {
      saving.value = false;
    }
  });
}

onMounted(async () => {
  account.value = await getAccount();
});
</script>

<style scoped lang="scss">
.card-title {
  font-size: 15px;
  font-weight: 600;
}

.account-info {
  max-width: 420px;
}

.password-form {
  max-width: 480px;
}
</style>
