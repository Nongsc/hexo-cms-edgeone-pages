/** 待办事项接口（与仪表盘同源，单独封装便于回收站/仪表盘复用）。 */

import { get, post, put, del } from "@/utils/http";
import type { Todo } from "./types";

/** 待办列表已包含在 /dashboard/overview 中，此处提供轻量查询。 */
export async function listTodos(): Promise<Todo[]> {
  const data = await get<{ detail: { todos: Todo[] } }>("/dashboard/overview");
  return data.detail.todos;
}

export async function createTodo(title: string): Promise<Todo> {
  return post<Todo>("/dashboard/todos", { title });
}

export async function updateTodo(id: number, patch: { title?: string; done?: boolean }): Promise<Todo> {
  return put<Todo>(`/dashboard/todos/${id}`, patch);
}

export async function deleteTodo(id: number): Promise<null> {
  return del<null>(`/dashboard/todos/${id}`);
}
