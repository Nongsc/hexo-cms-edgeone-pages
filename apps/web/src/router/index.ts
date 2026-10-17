import { createRouter, createWebHistory, type RouteRecordRaw } from "vue-router";
import { useUserStore } from "@/store/modules/user";
import Layout from "@/layout/index.vue";

/** 常量路由：无需权限即可访问。 */
export const constantRoutes: RouteRecordRaw[] = [
  {
    path: "/login",
    name: "Login",
    component: () => import("@/views/login/index.vue"),
    meta: { title: "登录", hidden: true }
  },
  {
    path: "/",
    component: Layout,
    redirect: "/dashboard",
    meta: { title: "仪表盘", icon: "HomeFilled" },
    children: [
      {
        path: "dashboard",
        name: "Dashboard",
        component: () => import("@/views/dashboard/index.vue"),
        meta: { title: "仪表盘", icon: "HomeFilled", affix: true }
      }
    ]
  }
];

/** 动态路由：登录后根据角色注册（本项目为单管理员，直接注册全部）。 */
export const asyncRoutes: RouteRecordRaw[] = [
  {
    path: "/content",
    component: Layout,
    redirect: "/content/posts",
    meta: { title: "内容管理", icon: "Document" },
    children: [
      {
        path: "posts",
        name: "Posts",
        component: () => import("@/views/posts/index.vue"),
        meta: { title: "文章管理", icon: "Notebook" }
      },
      {
        path: "editor/:id?",
        name: "PostEditor",
        component: () => import("@/views/editor/index.vue"),
        meta: { title: "文章编辑", activeMenu: "/content/posts", hidden: true }
      },
      {
        path: "pages",
        name: "Pages",
        component: () => import("@/views/pages/index.vue"),
        meta: { title: "页面管理", icon: "Files" }
      },
      {
        path: "page-editor/:id?",
        name: "PageEditor",
        component: () => import("@/views/editor/index.vue"),
        meta: { title: "页面编辑", activeMenu: "/content/pages", hidden: true }
      },
      {
        path: "images",
        name: "Images",
        component: () => import("@/views/images/index.vue"),
        meta: { title: "图床管理", icon: "Picture" }
      },
      {
        path: "recycle",
        name: "Recycle",
        component: () => import("@/views/recycle/index.vue"),
        meta: { title: "回收站", icon: "Delete" }
      }
    ]
  },
  {
    path: "/system",
    component: Layout,
    redirect: "/system/settings",
    meta: { title: "系统管理", icon: "Setting" },
    children: [
      {
        path: "settings",
        name: "Settings",
        component: () => import("@/views/system/settings.vue"),
        meta: { title: "设置", icon: "Tools" }
      },
      {
        path: "config",
        name: "YamlConfig",
        component: () => import("@/views/system/config.vue"),
        meta: { title: "YAML 配置", icon: "Tickets" }
      },
      {
        path: "themes",
        name: "Themes",
        component: () => import("@/views/system/themes.vue"),
        meta: { title: "主题", icon: "Brush" }
      },
      {
        path: "account",
        name: "Account",
        component: () => import("@/views/system/account.vue"),
        meta: { title: "账号信息", icon: "User" }
      }
    ]
  },
  {
    path: "/:pathMatch(.*)*",
    name: "NotFound",
    component: () => import("@/views/error/404.vue"),
    meta: { title: "页面不存在", hidden: true }
  }
];

const router = createRouter({
  history: createWebHistory(),
  routes: constantRoutes,
  strict: false,
  scrollBehavior: () => ({ left: 0, top: 0 })
});

/** 白名单路径。 */
const whiteList = ["/login"];

router.beforeEach(async (to) => {
  const userStore = useUserStore();
  document.title = (to.meta?.title as string) ?? "Hexo Pro CMS";

  if (whiteList.includes(to.path)) return true;

  if (!userStore.token) {
    return { path: "/login", query: { redirect: to.fullPath } };
  }

  // 首次导航（含刷新页面）：动态路由尚未注册，此时 `to` 是用旧路由表
  // 解析的（matched 为空，会命中 404 或空白）。必须 addRoute 后重新触发
  // 一次导航，让 vue-router 用新路由表重新解析目标路径。
  if (!userStore.isRoutesRegistered) {
    userStore.registerRoutes(asyncRoutes);
    return { path: to.path, query: to.query, hash: to.hash, replace: true };
  }

  return true;
});

export default router;
