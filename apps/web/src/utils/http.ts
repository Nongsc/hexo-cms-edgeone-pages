/** API 客户端：封装 axios 实例与统一响应处理。 */

import axios, { type AxiosInstance, type AxiosRequestConfig, type AxiosResponse } from "axios";
import { ElMessage, ElMessageBox } from "element-plus";
import router from "@/router";
import { useUserStore } from "@/store/modules/user";

export interface ApiResult<T = unknown> {
  code: number;
  message: string;
  data: T;
}

const service: AxiosInstance = axios.create({
  baseURL: import.meta.env.VITE_API_BASE ?? "/api",
  timeout: 30000,
  headers: { "Content-Type": "application/json" }
});

service.interceptors.request.use((config) => {
  const userStore = useUserStore();
  if (userStore.token) {
    config.headers.Authorization = `Bearer ${userStore.token}`;
  }
  return config;
});

service.interceptors.response.use(
  (response: AxiosResponse<ApiResult>) => {
    const res = response.data;
    if (res.code === 0) return response;

    // 登录态失效
    if (res.code === 401) {
      const userStore = useUserStore();
      userStore.logout();
      router.push({ path: "/login", query: { redirect: router.currentRoute.value.fullPath } });
      return Promise.reject(new Error(res.message || "登录已过期"));
    }

    ElMessage.error(res.message || "请求失败");
    return Promise.reject(new Error(res.message || "请求失败"));
  },
  (error) => {
    const status = error.response?.status;
    if (status === 401) {
      const userStore = useUserStore();
      userStore.logout();
      router.push({ path: "/login" });
    } else if (status === 404) {
      ElMessage.error("接口不存在");
    } else if (status && status >= 500) {
      ElMessage.error("服务器内部错误");
    } else if (error.code === "ECONNABORTED") {
      ElMessage.error("请求超时，请稍后重试");
    } else {
      ElMessage.error(error.message || "网络异常");
    }
    return Promise.reject(error);
  }
);

/** GET 请求，返回 data 字段。 */
export async function get<T>(url: string, params?: unknown, config?: AxiosRequestConfig): Promise<T> {
  const response = await service.get<ApiResult<T>>(url, { params, ...config });
  return response.data.data;
}

/** POST 请求。 */
export async function post<T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> {
  const response = await service.post<ApiResult<T>>(url, data, config);
  return response.data.data;
}

/** PUT 请求。 */
export async function put<T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> {
  const response = await service.put<ApiResult<T>>(url, data, config);
  return response.data.data;
}

/** DELETE 请求。 */
export async function del<T>(url: string, params?: unknown, config?: AxiosRequestConfig): Promise<T> {
  const response = await service.delete<ApiResult<T>>(url, { params, ...config });
  return response.data.data;
}

/** 上传文件（multipart/form-data）。 */
export async function upload<T>(url: string, form: FormData): Promise<T> {
  const response = await service.post<ApiResult<T>>(url, form, {
    headers: { "Content-Type": "multipart/form-data" }
  });
  return response.data.data;
}

/** 确认弹窗。 */
export async function confirm(message: string, title = "提示"): Promise<boolean> {
  try {
    await ElMessageBox.confirm(message, title, {
      confirmButtonText: "确定",
      cancelButtonText: "取消",
      type: "warning"
    });
    return true;
  } catch {
    return false;
  }
}

export default service;
