import { createApp } from "vue";
import ElementPlus from "element-plus";
import "element-plus/dist/index.css";
import * as ElementPlusIconsVue from "@element-plus/icons-vue";
import { createPinia } from "pinia";

import App from "./App.vue";
import router from "./router";
import "./styles/index.scss";

const app = createApp(App);

// 注册所有 Element Plus 图标为全局组件
for (const [name, component] of Object.entries(ElementPlusIconsVue)) {
  app.component(name, component as Parameters<typeof app.component>[1]);
}

app.use(createPinia());
app.use(router);
app.use(ElementPlus);
app.mount("#app");
