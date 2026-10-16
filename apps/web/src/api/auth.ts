/** 认证接口。 */

import { get, post } from "@/utils/http";

export interface LoginParams {
  username: string;
  password: string;
}

export interface LoginResult {
  token: string;
  username: string;
  displayName: string;
  expiresAt: number;
}

export function login(params: LoginParams): Promise<LoginResult> {
  return post<LoginResult>("/auth/login", params);
}

export function logout(): Promise<null> {
  return post<null>("/auth/logout");
}

export function getMe(): Promise<{ username: string; displayName: string }> {
  return get<{ username: string; displayName: string }>("/auth/me");
}

export function changePassword(currentPassword: string, newPassword: string): Promise<null> {
  return post<null>("/auth/change-password", { currentPassword, newPassword });
}
