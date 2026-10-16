/** ImageController：COS 图床管理。 */

import type { Context } from "hono";
import type { AppContext } from "../context";
import { fail, messageOfError, ok, statusOfError } from "./response";

const ALLOWED_MIME = [
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/gif",
  "image/webp",
  "image/svg+xml",
  "image/avif",
  "image/bmp"
];

export class ImageController {
  constructor(private readonly ctx: AppContext) {}

  list = async (c: Context) => {
    const folder = c.req.query("folder");
    const page = Number(c.req.query("page") ?? 1);
    const pageSize = Number(c.req.query("pageSize") ?? 60);
    const [assets, folders] = await Promise.all([
      this.ctx.images.list(folder || undefined, page, pageSize),
      this.ctx.images.folders()
    ]);
    return c.json(ok({ ...assets, folders }));
  };

  upload = async (c: Context) => {
    const body = await c.req.parseBody();
    const file = body.file;
    const folder = typeof body.folder === "string" ? body.folder : undefined;

    if (!(file instanceof File)) {
      return c.json(fail("请选择要上传的图片", 422), 422);
    }
    const mime = file.type || "image/png";
    if (!ALLOWED_MIME.includes(mime)) {
      return c.json(fail(`不支持的图片格式: ${mime}`, 422), 422);
    }

    try {
      const buffer = Buffer.from(await file.arrayBuffer());
      const asset = await this.ctx.images.upload({
        filename: file.name || "image.png",
        data: buffer,
        mime,
        folder
      });
      return c.json(ok(asset, "上传成功"));
    } catch (error) {
      return c.json(fail(messageOfError(error), statusOfError(error)), statusOfError(error) as 400);
    }
  };

  remove = async (c: Context) => {
    const rawKey = c.req.param("key") ?? "";
    if (!rawKey) return c.json(fail("缺少 key 参数", 422), 422);
    const cosKey = decodeURIComponent(rawKey);
    try {
      await this.ctx.images.remove(cosKey);
      return c.json(ok(null, "已删除"));
    } catch (error) {
      return c.json(fail(messageOfError(error), statusOfError(error)), statusOfError(error) as 400);
    }
  };

  removeMany = async (c: Context) => {
    const body = await c.req.json<{ keys?: string[] }>();
    if (!Array.isArray(body.keys) || body.keys.length === 0) {
      return c.json(fail("缺少待删除的 keys", 422), 422);
    }
    try {
      await this.ctx.images.removeMany(body.keys);
      return c.json(ok(null, `已删除 ${body.keys.length} 张图片`));
    } catch (error) {
      return c.json(fail(messageOfError(error), statusOfError(error)), statusOfError(error) as 400);
    }
  };

  createFolder = async (c: Context) => {
    const body = await c.req.json<{ folder?: string }>();
    if (!body.folder) return c.json(fail("目录名不能为空", 422), 422);
    try {
      await this.ctx.images.createFolder(body.folder);
      return c.json(ok(null, "目录已创建"));
    } catch (error) {
      return c.json(fail(messageOfError(error), statusOfError(error)), statusOfError(error) as 400);
    }
  };
}
