import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { hexoDate, maskSecret, parseHexoDate, toError } from "../src/utils/common";

describe("通用工具", () => {
  it("hexoDate 输出 Hexo 兼容格式", () => {
    const date = new Date(2024, 0, 2, 3, 4, 5);
    expect(hexoDate(date)).toBe("2024-01-02 03:04:05");
  });

  it("parseHexoDate 支持字符串与 Date", () => {
    expect(parseHexoDate("2024-01-02 03:04:05")).toBe(Date.parse("2024-01-02T03:04:05"));
    const date = new Date();
    expect(parseHexoDate(date)).toBe(date.getTime());
    expect(parseHexoDate("")).toBeNull();
    expect(parseHexoDate(null)).toBeNull();
  });

  it("maskSecret 打码敏感值", () => {
    expect(maskSecret("")).toBe("");
    expect(maskSecret("abcd")).toBe("****");
    expect(maskSecret("abcdefgh")).toBe("ab****gh");
  });

  it("toError 归一化异常", () => {
    expect(toError(new Error("x")).message).toBe("x");
    expect(toError("字符串").message).toBe("字符串");
  });
});
