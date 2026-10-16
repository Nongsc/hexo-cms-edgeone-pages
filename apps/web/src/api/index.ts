/** 仪表盘 / 图床接口。 */

import { get, post, del, upload } from "@/utils/http";
import type { Asset, DashboardData } from "./types";
export function getDashboard(): Promise<DashboardData> {
  return get<DashboardData>("/dashboard/overview");
}

export { listTodos, createTodo, updateTodo, deleteTodo } from "./todos";

// ---- 图床 ----
export interface ImageListResult {
  list: Asset[];
  total: number;
  page: number;
  pageSize: number;
  folders: string[];
}

export function listImages(params: { folder?: string; page?: number; pageSize?: number } = {}): Promise<ImageListResult> {
  return get<ImageListResult>("/images", params);
}

export function uploadImage(file: File, folder?: string): Promise<Asset> {
  const form = new FormData();
  form.append("file", file);
  if (folder) form.append("folder", folder);
  return upload<Asset>("/images", form);
}

export function deleteImage(cosKey: string): Promise<null> {
  return del<null>(`/images/${encodeURIComponent(cosKey)}`);
}

export function deleteImages(keys: string[]): Promise<null> {
  return del<null>("/images", { keys });
}

export function createFolder(folder: string): Promise<null> {
  return post<null>("/images/folders", { folder });
}

/** 别名：避免与视图层同名函数冲突。 */
export const createImageFolder = createFolder;
