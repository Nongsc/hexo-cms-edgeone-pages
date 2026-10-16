/**
 * 认证服务。
 *
 * 与桌面端 / Hexo 运行时完全解耦：账号信息存放在 CMS 自己的 SQLite 中，
 * 通过环境变量注入初始管理员账号。
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import type { ServiceContainer } from "./container";
import { ValidationError } from "./document";

export interface Session {
  token: string;
  username: string;
  displayName: string;
  expiresAt: number;
}

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface AuthServiceOptions {
  username: string;
  password: string;
  displayName?: string;
}

export class AuthService {
  private readonly options: AuthServiceOptions;

  constructor(
    private readonly services: ServiceContainer,
    options: AuthServiceOptions
  ) {
    this.options = options;
  }

  /**
   * 确保管理员账号存在且密码与环境变量一致。
   *
   * 重要：环境变量是权威来源。若从 COS 恢复的旧库里已有同名 admin
   * （密码可能是旧值），仅凭 count()===0 判断会导致新密码不生效、
   * 登录失败。因此这里始终用环境变量的凭据创建或更新。
   */
  ensureAdminUser(): void {
    const existing = this.services.users.findByUsername(this.options.username);
    if (!existing) {
      this.services.users.create(
        this.options.username,
        this.options.password,
        this.options.displayName ?? this.options.username
      );
      return;
    }
    this.services.users.updatePassword(this.options.username, this.options.password);
  }

  login(username: string, password: string): Session {
    const user = this.services.users.findByUsername(username);
    if (!user || !safeEqual(user.passwordHash, password)) {
      throw new ValidationError("用户名或密码错误");
    }
    return this.createSession(user.username, user.displayName);
  }

  logout(_token: string): void {
    // 无状态 token：服务端不保存会话，登出由前端丢弃 token 完成。
    // 这里保留方法以兼容现有调用方。
  }

  verify(token: string | undefined): Session | null {
    if (!token) return null;
    try {
      const session = decodeSession(token, this.options.password);
      if (session.expiresAt < Date.now()) return null;
      return session;
    } catch {
      return null;
    }
  }

  private createSession(username: string, displayName: string): Session {
    const session: Session = {
      token: "",
      username,
      displayName,
      expiresAt: Date.now() + SESSION_TTL_MS
    };
    session.token = encodeSession(session, this.options.password);
    return session;
  }

  /** 生成简单的请求签名，用于 CI Webhook 校验。 */
  signPayload(payload: string): string {
    return createHmac("sha256", this.options.password).update(payload).digest("hex");
  }
}

/**
 * 无状态 session token：payload 用 HMAC 签名，验证时不依赖服务端存储。
 * 这是关键——Cloud Functions 是多实例、无状态的，登录请求与后续请求
 * 可能落在不同实例，内存 Map 会导致「登录成功但马上 401 被踢回登录页」。
 *
 * token 格式：base64url(payload).base64url(hmac_signature)
 */
function encodeSession(session: Session, secret: string): string {
  const payload = Buffer.from(
    JSON.stringify({
      username: session.username,
      displayName: session.displayName,
      expiresAt: session.expiresAt
    }),
    "utf8"
  ).toString("base64url");
  const signature = createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

function decodeSession(token: string, secret: string): Session {
  const dot = token.lastIndexOf(".");
  if (dot <= 0) throw new Error("invalid token");
  const payload = token.slice(0, dot);
  const signature = token.slice(dot + 1);

  const expected = createHmac("sha256", secret).update(payload).digest("base64url");
  if (!timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    throw new Error("invalid signature");
  }

  const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
    username: string;
    displayName: string;
    expiresAt: number;
  };
  return {
    token,
    username: data.username,
    displayName: data.displayName,
    expiresAt: data.expiresAt
  };
}

function safeEqual(a: string, b: string): boolean {
  const bufferA = Buffer.from(a, "utf8");
  const bufferB = Buffer.from(b, "utf8");
  if (bufferA.length !== bufferB.length) return false;
  return timingSafeEqual(bufferA, bufferB);
}
