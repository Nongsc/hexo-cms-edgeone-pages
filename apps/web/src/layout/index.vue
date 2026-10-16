<template>
  <div class="app-wrapper" :class="{ 'is-collapsed': appStore.sidebarCollapsed }">
    <!-- 侧边栏 -->
    <aside class="app-sidebar">
      <div class="sidebar-logo">
        <span class="logo-mark">H</span>
        <span v-show="!appStore.sidebarCollapsed" class="logo-text">Hexo Pro CMS</span>
      </div>
      <el-menu
        :default-active="activeMenu"
        :collapse="appStore.sidebarCollapsed"
        :collapse-transition="false"
        router
        class="sidebar-menu"
        background-color="#1d2129"
        text-color="#c9cdd4"
        active-text-color="#ffffff"
      >
        <template v-for="route in menuRoutes" :key="route.path">
          <!-- 有子级：渲染子菜单 -->
          <el-sub-menu v-if="route.children && route.children.length > 1" :index="route.path">
            <template #title>
              <el-icon v-if="route.meta?.icon"><component :is="route.meta.icon" /></el-icon>
              <span>{{ route.meta?.title }}</span>
            </template>
            <el-menu-item
              v-for="child in visibleChildren(route)"
              :key="child.path"
              :index="resolvePath(route.path, child.path)"
            >
              <el-icon v-if="child.meta?.icon"><component :is="child.meta.icon" /></el-icon>
              <template #title>{{ child.meta?.title }}</template>
            </el-menu-item>
          </el-sub-menu>

          <!-- 单子项：直接渲染 -->
          <el-menu-item
            v-else-if="route.children?.length === 1"
            :index="resolvePath(route.path, route.children[0].path)"
          >
            <el-icon v-if="route.children[0].meta?.icon">
              <component :is="route.children[0].meta.icon" />
            </el-icon>
            <template #title>{{ route.children[0].meta?.title }}</template>
          </el-menu-item>
        </template>
      </el-menu>
    </aside>

    <!-- 主区域 -->
    <div class="app-main">
      <header class="app-header">
        <div class="header-left">
          <el-icon class="collapse-btn" @click="appStore.toggleSidebar()">
            <Fold v-if="!appStore.sidebarCollapsed" />
            <Expand v-else />
          </el-icon>
          <el-breadcrumb separator="/">
            <el-breadcrumb-item :to="{ path: '/' }">首页</el-breadcrumb-item>
            <el-breadcrumb-item v-if="currentTitle">{{ currentTitle }}</el-breadcrumb-item>
          </el-breadcrumb>
        </div>
        <div class="header-right">
          <el-tooltip content="博客前台" placement="bottom">
            <el-icon class="header-action" @click="openBlog"><Link /></el-icon>
          </el-tooltip>
          <el-dropdown trigger="click" @command="handleCommand">
            <span class="user-trigger">
              <el-avatar :size="28">{{ avatarText }}</el-avatar>
              <span class="username">{{ userStore.userInfo.displayName || userStore.userInfo.username }}</span>
            </span>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="account">账号信息</el-dropdown-item>
                <el-dropdown-item command="logout" divided>退出登录</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </header>

      <main class="app-content">
        <router-view v-slot="{ Component }">
          <keep-alive :include="cachedViews">
            <component :is="Component" :key="route.fullPath" />
          </keep-alive>
        </router-view>
      </main>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import { ElMessageBox } from "element-plus";
import { Fold, Expand, Link } from "@element-plus/icons-vue";
import { useAppStore } from "@/store/modules/app";
import { useUserStore } from "@/store/modules/user";
import { asyncRoutes, constantRoutes } from "@/router";
import type { RouteRecordRaw } from "vue-router";

const appStore = useAppStore();
const userStore = useUserStore();
const route = useRoute();
const router = useRouter();

const cachedViews = computed<string[]>(() => ["Posts", "Pages", "Images", "Recycle"]);

const currentTitle = computed(() => (route.meta?.title as string) ?? "");

const avatarText = computed(() => {
  const name = userStore.userInfo.displayName || userStore.userInfo.username || "A";
  return name.slice(0, 1).toUpperCase();
});

/**
 * 菜单数据：由 constantRoutes（仪表盘）+ asyncRoutes（内容管理 / 系统管理）组成。
 *
 * 直接从静态路由表派生，而不是 router.getRoutes()：
 *  - getRoutes() 会做扁平化，子路由的相对路径解析结果与预期不一致；
 *  - 静态派生不依赖路由注册时机，刷新后依然稳定。
 */
const menuRoutes = computed<RouteRecordRaw[]>(() => {
  const groups = [
    ...constantRoutes.filter((item) => item.meta?.title && !item.meta?.hidden),
    ...asyncRoutes.filter((item) => item.meta?.title && !item.meta?.hidden)
  ];

  return groups.map((group) => ({
    path: group.path,
    meta: group.meta,
    children: (group.children ?? []).filter(
      (child) => !child.meta?.hidden && !String(child.path).includes(":")
    )
  }));
});

const activeMenu = computed(() => (route.meta?.activeMenu as string) ?? route.path);

function visibleChildren(route: RouteRecordRaw): RouteRecordRaw[] {
  return (route.children ?? []).filter((child) => !child.meta?.hidden && !child.path.includes(":"));
}

function resolvePath(parentPath: string, childPath: string): string {
  return `${parentPath.replace(/\/$/, "")}/${childPath.replace(/^\//, "")}`;
}

function openBlog(): void {
  // 博客前台地址在「系统管理 → 设置 → 站点信息」中配置后写入 localStorage
  const url = localStorage.getItem("blog-url");
  if (url) window.open(url, "_blank");
  else router.push("/system/settings");
}

async function handleCommand(command: string): Promise<void> {
  if (command === "logout") {
    await ElMessageBox.confirm("确认退出登录？", "提示", { type: "warning" });
    await userStore.logout();
    router.push("/login");
  } else if (command === "account") {
    router.push("/system/account");
  }
}
</script>

<style scoped lang="scss">
.app-wrapper {
  display: flex;
  height: 100vh;
  width: 100%;
}

.app-sidebar {
  width: 210px;
  background: #1d2129;
  transition: width 0.28s;
  overflow: hidden;
  flex-shrink: 0;

  .is-collapsed & {
    width: 64px;
  }
}

.sidebar-logo {
  height: 56px;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 16px;
  color: #fff;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);

  .logo-mark {
    width: 30px;
    height: 30px;
    border-radius: 8px;
    background: linear-gradient(135deg, #409eff, #66b1ff);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-weight: 700;
    flex-shrink: 0;
  }

  .logo-text {
    font-size: 15px;
    font-weight: 600;
    white-space: nowrap;
  }
}

.sidebar-menu {
  border-right: none;
  height: calc(100vh - 56px);
  overflow-y: auto;
}

.sidebar-menu:not(.el-menu--collapse) {
  width: 210px;
}

.app-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  background: #f0f2f5;
}

.app-header {
  height: 56px;
  background: #fff;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  box-shadow: 0 1px 4px rgba(0, 21, 41, 0.08);
  flex-shrink: 0;
}

.header-left,
.header-right {
  display: flex;
  align-items: center;
  gap: 16px;
}

.collapse-btn,
.header-action {
  font-size: 20px;
  cursor: pointer;
  color: #4e5969;

  &:hover {
    color: #409eff;
  }
}

.user-trigger {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  outline: none;

  .username {
    font-size: 14px;
    color: #1d2129;
  }
}

.app-content {
  flex: 1;
  overflow: auto;
  padding: 16px;
}
</style>
