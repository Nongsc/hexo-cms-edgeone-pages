/**
 * 认证服务。
 *
 * 与桌面端 / Hexo 运行时完全解耦：账号信息存放在 CMS 自己的 SQLite 中，
 * 通过环境变量注入初始管理员账号。
 */

import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import type { ServiceContainer } from "./container";
import { ValidationError } from "./document";

export interface Session {
  token: string;
  username: string;
  displayName: string;
  expiresAt: number;
}

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const sessions = new Map<string, Session>();

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

  /** 首次启动时确保管理员账号存在。 */
  ensureAdminUser(): void {
    if (this.services.users.count() === 0) {
      this.services.users.create(
        this.options.username,
        this.options.password,
        this.options.displayName ?? this.options.username
      );
    }
  }

  login(username: string, password: string): Session {
    const user = this.services.users.findByUsername(username);
    if (!user || !safeEqual(user.passwordHash, password)) {
      throw new ValidationError("用户名或密码错误");
    }
    return this.createSession(user.username, user.displayName);
  }

  logout(token: string): void {
    sessions.delete(token);
  }

  verify(token: string | undefined): Session | null {
    if (!token) return null;
    const session = sessions.get(token);
    if (!session) return null;
    if (session.expiresAt < Date.now()) {
      sessions.delete(token);
      return null;
    }
    return session;
  }

  private createSession(username: string, displayName: string): Session {
    const session: Session = {
      token: randomUUID(),
      username,
      displayName,
      expiresAt: Date.now() + SESSION_TTL_MS
    };
    sessions.set(session.token, session);
    return session;
  }

  /** 生成简单的请求签名，用于 CI Webhook 校验。 */
  signPayload(payload: string): string {
    return createHmac("sha256", this.options.password).update(payload).digest("hex");
  }
}

function safeEqual(a: string, b: string): boolean {
  const bufferA = Buffer.from(a, "utf8");
  const bufferB = Buffer.from(b, "utf8");
  if (bufferA.length !== bufferB.length) return false;
  return timingSafeEqual(bufferA, bufferB);
}
