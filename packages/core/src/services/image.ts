/** ImageService：腾讯云 COS 图床管理。 */

import type { ServiceContainer } from "./container";
import { CosError } from "./cos";
import type { Asset, Paginated } from "../types/index";
import { ValidationError } from "./document";

export interface UploadInput {
  filename: string;
  data: Buffer;
  mime: string;
  folder?: string;
}

export class ImageService {
  constructor(private readonly services: ServiceContainer) {}

  /** 上传图片到 COS 并在 SQLite 记录元数据。 */
  async upload(input: UploadInput): Promise<Asset> {
    if (!input.data || input.data.length === 0) {
      throw new ValidationError("图片内容为空");
    }
    if (input.data.length > 20 * 1024 * 1024) {
      throw new ValidationError("图片大小超过 20MB 限制");
    }

    const cos = this.services.cos();
    const folder = input.folder?.trim() || this.services.settings.get("cos.folder") || "images";
    const object = await cos.putObject(input.filename, input.data, input.mime, folder);

    return this.services.assets.create({
      cosKey: object.key,
      filename: object.filename,
      folder: object.folder,
      url: object.url,
      size: object.size,
      mime: object.mime
    });
  }

  /** 从 COS 拉取列表并与本地记录合并。 */
  async list(folder?: string, page = 1, pageSize = 60): Promise<Paginated<Asset>> {
    const local = this.services.assets.list(folder, page, pageSize);
    return local;
  }

  async folders(): Promise<string[]> {
    return this.services.assets.folders();
  }

  /** 新建目录。 */
  async createFolder(folder: string): Promise<void> {
    const normalized = folder.trim().replace(/^\/+|\/+$/g, "");
    if (!normalized) throw new ValidationError("目录名不能为空");
    await this.services.cos().createFolder(normalized);
  }

  /** 删除图片（COS + 本地记录）。 */
  async remove(cosKey: string): Promise<void> {
    try {
      await this.services.cos().deleteObject(cosKey);
    } catch (error) {
      if (!(error instanceof CosError)) throw error;
      // COS 上已不存在时仍然清理本地记录
    }
    this.services.assets.remove(cosKey);
  }

  async removeMany(cosKeys: string[]): Promise<void> {
    if (cosKeys.length === 0) return;
    try {
      await this.services.cos().deleteObjects(cosKeys);
    } catch {
      // 忽略 COS 侧错误，保证本地记录被清理
    }
    for (const key of cosKeys) {
      this.services.assets.remove(key);
    }
  }
}
