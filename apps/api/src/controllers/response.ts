/** 统一响应结构。 */

export interface ApiResponse<T = unknown> {
  code: number;
  message: string;
  data: T;
}

export function ok<T>(data: T, message = "success"): ApiResponse<T> {
  return { code: 0, message, data };
}

export function fail(message: string, code = 400): ApiResponse<never> {
  return { code, message, data: undefined as never };
}

/** 业务异常到 HTTP 状态的映射。 */
export function statusOfError(error: unknown): number {
  if (error && typeof error === "object" && "status" in error) {
    const status = (error as { status?: unknown }).status;
    if (typeof status === "number" && status >= 400 && status < 600) return status;
  }
  return 500;
}

export function messageOfError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
