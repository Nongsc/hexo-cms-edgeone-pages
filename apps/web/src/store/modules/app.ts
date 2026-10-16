import { defineStore } from "pinia";
import { ref } from "vue";

/** 侧边栏折叠状态。 */
export const useAppStore = defineStore("app", () => {
  const sidebarCollapsed = ref<boolean>(false);
  const device = ref<"desktop" | "mobile">("desktop");

  function toggleSidebar(): void {
    sidebarCollapsed.value = !sidebarCollapsed.value;
  }

  function toggleDevice(value: "desktop" | "mobile"): void {
    device.value = value;
  }

  return { sidebarCollapsed, device, toggleSidebar, toggleDevice };
});
