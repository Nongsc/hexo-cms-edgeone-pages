/**
 * 腾讯云 COS 客户端。
 *
 * 通过长期密钥或 STS 临时密钥直接调用 COS XML API。
 * 图片资源只存放在 COS，CMS 自身不落盘。
 *
 * 签名采用 AWS SigV4（COS 提供 S3 兼容接口，行为稳定）：
 *   参考：https://cloud.tencent.com/document/product/436/31930
 */

import { createHmac, createHash } from "node:crypto";

/** 空请求体的 SHA256（SigV4 规范）。 */
const EMPTY_SHA256 = createHash("sha256").update("").digest("hex");

export interface CosConfig {
  bucket: string;
  region: string;
  secretId: string;
  secretKey: string;
  sessionToken?: string;
  /** 自定义加速域名，如 https://img.example.com；为空则使用默认域名。 */
  domain?: string;
  /** 图床根目录。 */
  folder?: string;
}

export interface CosObject {
  key: string;
  filename: string;
  folder: string;
  size: number;
  mime: string;
  url: string;
  lastModified: string;
}

export class CosError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    /** COS 返回的错误码，如 AccessDenied / SignatureDoesNotMatch。 */
    readonly code?: string,
    readonly requestId?: string
  ) {
    super(message);
    this.name = "CosError";
  }

  /** 面向用户的可读诊断信息。 */
  get diagnosis(): string {
    if (this.code === "AccessDenied") {
      return (
        "COS 返回 AccessDenied：密钥没有该存储桶的访问权限。" +
        "请在腾讯云 CAM 中为使用的 SecretId 授予该 Bucket 的 " +
        "PUTObject / GETBucket / DELETEObject 权限（可直接使用 FullAccess 的 COS 策略验证）。"
      );
    }
    if (this.code === "SignatureDoesNotMatch") {
      return "COS 返回 SignatureDoesNotMatch：签名不匹配，请检查 SecretKey 是否正确、系统时间是否准确。";
    }
    if (this.code === "NoSuchBucket") {
      return `COS 返回 NoSuchBucket：存储桶 ${this.status ?? ""} 不存在，请检查 Bucket 名称与所属地域是否匹配。`;
    }
    return this.message;
  }
}

export class CosClient {
  constructor(private readonly config: CosConfig) {}

  /** 是否已配置可用凭据。 */
  get isConfigured(): boolean {
    return Boolean(this.config.secretId && this.config.secretKey && this.config.bucket);
  }

  private get host(): string {
    if (this.config.domain) {
      return this.config.domain.replace(/^https?:\/\//, "").replace(/\/$/, "");
    }
    return `${this.config.bucket}.cos.${this.config.region}.myqcloud.com`;
  }

  private get baseUrl(): string {
    return `https://${this.host}`;
  }

  /** 生成对象公网地址。 */
  urlForKey(key: string): string {
    return `${this.baseUrl}/${key}`;
  }

  private keyFor(filename: string, folder?: string): string {
    const folderPart = (folder ?? this.config.folder ?? "").replace(/^\/+|\/+$/g, "");
    const safeName = filename.replace(/[/\\]/g, "_");
    return folderPart ? `${folderPart}/${safeName}` : safeName;
  }

  private requireConfigured(): void {
    if (!this.config.bucket) {
      throw new CosError("未配置 COS 存储桶，请先在「系统管理 → 图片设置」中完成配置", 400);
    }
    if (!this.config.secretId || !this.config.secretKey) {
      throw new CosError("未配置 COS 密钥，请先在「系统管理 → 图片设置」中完成配置", 400);
    }
  }

  /**
   * 上传文件（二进制 Buffer）。
   * 走 COS PutObject 接口。
   */
  async putObject(
    filename: string,
    body: Buffer | Uint8Array | string,
    contentType: string,
    folder?: string
  ): Promise<CosObject> {
    this.requireConfigured();

    const key = this.keyFor(filename, folder);
    const buffer = typeof body === "string" ? Buffer.from(body, "utf8") : Buffer.from(body);

    const response = await this.signedFetch("PUT", `/${encodeKey(key)}`, "", {
      body: new Uint8Array(buffer),
      contentType
    });

    if (!response.ok) {
      throw await this.toError("上传", response);
    }

    return {
      key,
      filename,
      folder: folder ?? this.config.folder ?? "",
      size: buffer.length,
      mime: contentType,
      url: this.urlForKey(key),
      lastModified: new Date().toISOString()
    };
  }

  /** 列出对象（分页）。 */
  async listObjects(prefix = "", maxKeys = 100, marker = ""): Promise<{
    objects: CosObject[];
    isTruncated: boolean;
    nextMarker: string;
  }> {
    this.requireConfigured();

    // 手动构造查询串：key/value 做标准 URI 编码，并按 key 字母序排列。
    // 注意两点（否则会 SignatureDoesNotMatch）：
    //   1. 参数必须按字母序排序（max-keys < prefix < marker）；
    //   2. prefix 值里的 "/" 必须编码为 %2F（encodeURIComponent 已满足）。
    const params: Record<string, string> = { "max-keys": String(maxKeys) };
    if (prefix) params.prefix = encodeURIComponent(prefix);
    if (marker) params.marker = encodeURIComponent(marker);
    const query = Object.keys(params)
      .sort()
      .map((key) => `${key}=${params[key]}`)
      .join("&");

    const response = await this.signedFetch("GET", "/", query);
    if (!response.ok) {
      throw await this.toError("列表", response);
    }

    const xml = await response.text();
    const objects = parseListBucketResult(xml).map((item) => ({
      key: item.key,
      filename: item.key.split("/").pop() ?? item.key,
      folder: item.key.split("/").slice(0, -1).join("/"),
      size: item.size,
      mime: "",
      url: this.urlForKey(item.key),
      lastModified: item.lastModified
    }));

    const isTruncated = /<IsTruncated>true<\/IsTruncated>/.test(xml);
    const nextMarker = /<NextMarker>([^<]*)<\/NextMarker>/.exec(xml)?.[1] ?? "";

    return { objects, isTruncated, nextMarker };
  }

  /** 删除单个对象。 */
  async deleteObject(key: string): Promise<void> {
    this.requireConfigured();
    const response = await this.signedFetch("DELETE", `/${encodeKey(key)}`);
    if (!response.ok && response.status !== 204) {
      throw await this.toError("删除", response);
    }
  }

  /** 批量删除。 */
  async deleteObjects(keys: string[]): Promise<void> {
    if (keys.length === 0) return;
    this.requireConfigured();

    const body =
      `<Delete>` +
      keys
        .map((key) => `<Object><Key>${escapeXml(key)}</Key></Object>`)
        .join("") +
      `<Quiet>true</Quiet></Delete>`;
    const buffer = Buffer.from(body, "utf8");
    const md5 = createHash("md5").update(buffer).digest("base64");

    const response = await this.signedFetch("POST", "/", "delete=", {
      body: new Uint8Array(buffer),
      contentType: "application/xml",
      extraHeaders: { "Content-MD5": md5 }
    });
    if (!response.ok) {
      throw await this.toError("批量删除", response);
    }
  }

  /** 创建「目录」（COS 中目录即以 / 结尾的空对象）。 */
  async createFolder(folder: string): Promise<void> {
    this.requireConfigured();
    const key = `${folder.replace(/^\/+|\/+$/g, "")}/`;
    const response = await this.signedFetch("PUT", `/${encodeKey(key)}`, "", {
      contentType: "application/xml"
    });
    if (!response.ok) {
      throw await this.toError("创建目录", response);
    }
  }

  // ---------------------------------------------------------------------------
  // 签名：AWS SigV4（COS 提供 S3 兼容接口）
  //
  // 说明：COS 同时支持 TC3-HMAC-SHA256 与 AWS SigV4 两种签名。
  // 这里选用 SigV4，因为：
  //   1. COS 的 S3 兼容端点原生支持，行为稳定；
  //   2. 只需 host / x-amz-content-sha256 / x-amz-date 三个头参与签名，
  //      不涉及 TC3 的 CanonicalHeaders 细节，减少出错面；
  //   3. 与 aws-sdk 生态一致，便于后续切换到 SDK。
  // 参考：https://cloud.tencent.com/document/product/436/31930
  // ---------------------------------------------------------------------------

  /**
   * 生成 SigV4 Authorization 头。
   *
   * @param method      HTTP 方法
   * @param path        对象路径（含前导 /），如 /images/a.png
   * @param query       查询字符串（不含 ?），如 max-keys=2
   * @param payloadHash 请求体的 SHA256 十六进制；无 body 时传空串的哈希
   * @param extraHeaders 需要额外参与签名的头（当前未使用，保留扩展）
   */
  private sign(
    method: string,
    path: string,
    query = "",
    payloadHash = EMPTY_SHA256,
    extraHeaders: Record<string, string> = {}
  ): { authorization: string; amzDate: string; payloadHash: string } {
    const now = new Date();
    // AWS 规范格式：20240101T000000Z
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
    const datestamp = amzDate.slice(0, 8);

    // 1. CanonicalRequest（与 AWS SigV4 规范一致）
    const canonicalHeaders =
      `host:${this.host}\n` +
      `x-amz-content-sha256:${payloadHash}\n` +
      `x-amz-date:${amzDate}\n`;
    const signedHeaders = "host;x-amz-content-sha256;x-amz-date";

    const canonicalRequest = [
      method,
      path,
      query,
      canonicalHeaders,
      signedHeaders,
      payloadHash
    ].join("\n");

    // 2. StringToSign
    const algorithm = "AWS4-HMAC-SHA256";
    const credentialScope = `${datestamp}/${this.config.region}/s3/aws4_request`;
    const stringToSign = [
      algorithm,
      amzDate,
      credentialScope,
      createHash("sha256").update(canonicalRequest, "utf8").digest("hex")
    ].join("\n");

    // 3. 派生签名密钥
    const kDate = createHmac("sha256", `AWS4${this.config.secretKey}`).update(datestamp).digest();
    const kRegion = createHmac("sha256", kDate).update(this.config.region).digest();
    const kService = createHmac("sha256", kRegion).update("s3").digest();
    const kSigning = createHmac("sha256", kService).update("aws4_request").digest();
    const signature = createHmac("sha256", kSigning).update(stringToSign).digest("hex");

    const authorization =
      `${algorithm} ` +
      `Credential=${this.config.secretId}/${credentialScope}, ` +
      `SignedHeaders=${signedHeaders}, ` +
      `Signature=${signature}`;

    return { authorization, amzDate, payloadHash };
  }

  /** 发送一个已签名的 COS 请求。 */
  private async signedFetch(
    method: string,
    path: string,
    query = "",
    options: { body?: Uint8Array; contentType?: string; extraHeaders?: Record<string, string> } = {}
  ): Promise<Response> {
    const payloadHash = options.body
      ? createHash("sha256").update(options.body).digest("hex")
      : EMPTY_SHA256;

    const { authorization, amzDate } = this.sign(method, path, query, payloadHash);

    const headers: Record<string, string> = {
      Authorization: authorization,
      "x-amz-content-sha256": payloadHash,
      "x-amz-date": amzDate,
      ...options.extraHeaders
    };
    if (options.contentType) headers["Content-Type"] = options.contentType;
    if (this.config.sessionToken) headers["x-cos-security-token"] = this.config.sessionToken;

    const url = `${this.baseUrl}${path}${query ? `?${query}` : ""}`;
    return fetch(url, { method, headers, body: options.body });
  }

  /** 把非 2xx 响应转换为带诊断信息的 CosError。 */
  private async toError(action: string, response: Response): Promise<CosError> {
    const text = await response.text().catch(() => "");
    const code = /<Code>([^<]*)<\/Code>/.exec(text)?.[1];
    const message = /<Message>([^<]*)<\/Message>/.exec(text)?.[1];
    const requestId = /<RequestId>([^<]*)<\/RequestId>/.exec(text)?.[1];

    const error = new CosError(
      `COS ${action}失败 (${response.status})${code ? ` [${code}]` : ""}${message ? `: ${message}` : ""}`,
      response.status,
      code,
      requestId
    );
    return error;
  }
}

// -----------------------------------------------------------------------------
// 辅助函数
// -----------------------------------------------------------------------------

function encodeKey(key: string): string {
  return key
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function parseListBucketResult(
  xml: string
): Array<{ key: string; size: number; lastModified: string }> {
  const contents: Array<{ key: string; size: number; lastModified: string }> = [];
  const contentRegex = /<Contents>([\s\S]*?)<\/Contents>/g;
  let match: RegExpExecArray | null;
  while ((match = contentRegex.exec(xml)) !== null) {
    const block = match[1];
    const key = /<Key>([^<]*)<\/Key>/.exec(block)?.[1] ?? "";
    const size = Number(/<Size>(\d+)<\/Size>/.exec(block)?.[1] ?? "0");
    const lastModified = /<LastModified>([^<]*)<\/LastModified>/.exec(block)?.[1] ?? "";
    if (key && !key.endsWith("/")) {
      contents.push({ key, size, lastModified });
    }
  }
  return contents;
}
