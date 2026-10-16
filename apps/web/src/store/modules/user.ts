import { defineStore } from "pinia";
import { ref } from "vue";
import { login as loginApi, logout as logoutApi, getMe } from "@/api/auth";
import router from "@/router";
import type { RouteRecordRaw } from "vue-router";

interface UserInfo {
  username: string;
  displayName: string;
}

export const useUserStore = defineStore("user", () => {
  const token = ref<string>(localStorage.getItem("cms-token") ?? "");
  const userInfo = ref<UserInfo>({ username: "", displayName: "" });
  const isRoutesRegistered = ref<boolean>(false);

  async function login(username: string, password: string): Promise<void> {
    const data = await loginApi({ username, password });
    token.value = data.token;
    userInfo.value = { username: data.username, displayName: data.displayName };
    localStorage.setItem("cms-token", data.token);
  }

  async function fetchUserInfo(): Promise<void> {
    const data = await getMe();
    userInfo.value = data;
  }

  /**
   * 把动态路由真正添加到 router，并标记注册完成。
   *
   * 注意：必须在路由跳转之前调用（见 router/index.ts 的 beforeEach），
   * 否则本次导航仍按旧路由表解析，会命中 404 后又被重定向。
   */
  function registerRoutes(routes: RouteRecordRaw[]): void {
    for (const route of routes) {
      if (route.name && router.hasRoute(route.name)) continue;
      router.addRoute(route);
    }
    isRoutesRegistered.value = true;
  }

  async function logout(): Promise<void> {
    try {
      await logoutApi();
    } finally {
      token.value = "";
      userInfo.value = { username: "", displayName: "" };
      isRoutesRegistered.value = false;
      localStorage.removeItem("cms-token");
      resetRoutes();
    }
  }

  /** 移除动态路由，使下次登录可以重新注册。 */
  function resetRoutes(): void {
    // 只移除动态注册的路由，保留常量路由
    for (const route of router.getRoutes()) {
      if (route.name && !["Login", "Dashboard", "NotFound"].includes(route.name as string)) {
        router.removeRoute(route.name);
      }
    }
    isRoutesRegistered.value = false;
  }

  return { token, userInfo, isRoutesRegistered, login, fetchUserInfo, registerRoutes, logout, resetRoutes };
});
