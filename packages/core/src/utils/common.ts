/** 通用工具函数。 */

/** 延迟执行。 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 把未知异常归一化为 Error。 */
export function toError(value: unknown): Error {
  if (value instanceof Error) return value;
  return new Error(typeof value === "string" ? value : JSON.stringify(value));
}

/** 生成形如 2024-01-01 12:00:00 的本地时间字符串（Hexo date 格式）。 */
export function hexoDate(date: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  );
}

/** 解析 Hexo date 字段为时间戳；无法解析返回 null。 */
export function parseHexoDate(value: unknown): number | null {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number") return value;
  if (typeof value !== "string" || value.trim() === "") return null;
  const timestamp = Date.parse(value.replace(" ", "T"));
  return Number.isNaN(timestamp) ? null : timestamp;
}

/** 掩码敏感配置，供前端回显。 */
export function maskSecret(value: string): string {
  if (!value) return "";
  if (value.length <= 4) return "****";
  return `${value.slice(0, 2)}****${value.slice(-2)}`;
}
