# 媒体功能与上传 API

## 回收站

图片库的“删除”仅记录删除时间，原图、预览及元数据保留 30 天。相册中的“移出相册”仍然仅取消归类，不进入回收站。回收站中的图片从普通列表、搜索、相册计数和封面中排除。恢复保留文件名、标签、描述、收藏和原相册；若原相册已经删除，则恢复为未归入相册。

既有直链在回收站期间仍可访问。永久删除会先标记清理状态，再删除 R2 原图、缩略图、兼容预览和 D1 记录；开始清理后无法恢复。失败项保留以便重试。已经下载的副本无法撤回。

Worker 配置每小时执行一次 Cron，每批最多清理 100 张到期图片，积压会在后续运行继续处理。因此到期清理不是精确到秒；大量积压可能延迟。“清空回收站”会连续提交分页清理请求。不要移除 `triggers.crons` 配置。

## 从网址上传

在上传按钮菜单中输入公网 HTTP(S) 图片网址。后端下载到 R2，之后不依赖远程地址。最多 3 次重定向、20 秒下载时限、20 MiB 文件上限；类型由文件头判断，支持 JPG、PNG、WebP、GIF、HEIC、HEIF，拒绝 HTML / SVG 等内容。

不允许带用户名密码的 URL、IP 字面地址和本机/内网域名。每次跳转会检查 DNS 地址，并且不会转发登录 Cookie 或 Token。只支持公开可访问的网址；需要登录、Referer 或防盗链验证的站点可能失败。

## 创建和使用 Token

账户菜单 → API Token 管理。Token 只允许上传，不允许读取管理列表、删除图片或管理相册。最多 50 个；完整内容只在创建时显示一次，D1 仅保存 SHA-256 摘要。吊销后下一次上传立即拒绝；已经鉴权并开始的请求可能完成。

```sh
curl -X POST 'https://YOUR-WORKER/api/v1/images' \
  -H 'Authorization: Bearer YOUR_TOKEN' \
  -F 'file=@photo.jpg'
```

必填 multipart 字段 `file`；可选 `albumId`（现有相册 ID）。Cookie 登录会话不能替代 Bearer Token。此接口不提供跨站浏览器 CORS 授权，适用于 PicGo / ShareX 自定义上传器、Raycast 或脚本。

成功返回 HTTP 201：

```json
{
  "image": {
    "id": "uuid",
    "name": "photo.jpg",
    "mime": "image/jpeg",
    "size": 204800,
    "width": 1600,
    "height": 900,
    "url": "https://YOUR-WORKER/i/uuid.jpg",
    "originalUrl": "https://YOUR-WORKER/i/uuid.jpg",
    "thumbnailUrl": "https://YOUR-WORKER/i/uuid.jpg",
    "albumId": null,
    "tags": [],
    "description": "",
    "favorite": false,
    "createdAt": "2026-09-14T00:00:00.000Z"
  }
}
```

客户端应使用 `image.url` 分享可显示图片，`image.originalUrl` 下载原文件。错误返回 `{ "error": "说明" }`；常见状态码为 400（参数）、401（Token 无效）、413（过大）、415（格式/解码失败）、502/504（网址获取失败/超时）。上传接口目前没有幂等键；网络中断后重试可能产生副本。

## HEIC / HEIF

浏览器上传优先在本机解码，按需加载 heic-to，生成最长边 2560px 的 JPEG 兼容预览及 WebP 缩略图。原始文件字节不改动，尺寸记录原图尺寸，文件大小记录原文件大小。动态图/多帧容器使用默认静态图作为预览，原文件完整保留。

URL / API 上传没有浏览器转码时使用 Cloudflare Images binding：

```json
{
  "images": { "binding": "IMAGE_PROCESSOR" },
  "triggers": { "crons": ["0 * * * *"] }
}
```

模板和部署脚本已经包含这些配置。Images 转换有独立的用量和计费要求，部署者需确认账户支持。参见 [Images binding](https://developers.cloudflare.com/images/optimization/binding/) 和 [HEIC 支持](https://developers.cloudflare.com/changelog/post/heic-support/)。不需要 VPS 或常驻服务。

本地模拟器的 HEIC 转码能力与云端不完全相同。浏览器本机转换可在本地验证；服务端转换仍需部署后在真实 Images binding 上验收。高级 API 客户端也可附加 JPEG `preview`（最多 10 MiB）、WebP `thumbnail`（最多 512 KiB）和原图 `width` / `height`，从而跳过服务端转换。无法成功解码的图片会拒绝上传，不会留下仅有不可显示原图的记录。

## 升级与验证

`0002_media_tools.sql` 重建 images 表以扩展格式约束，原 ID、R2 键、标签、相册和时间不变，并新增预览、收藏、清理状态与 Token 表。不会删除原有 R2 对象。先备份数据库，再通过正常迁移命令升级；勿手动重复执行 SQL。

```sh
npx wrangler d1 migrations apply DB --local
# 使用已有生产资源配置时：
npx wrangler d1 migrations apply DB --remote --config wrangler.deploy.json
```

正常 `npm run deploy` 会自动迁移并补齐已有配置中的 Images binding 和 Cron；自建 CI 也必须使用更新后的绑定和定时配置。旧记录没有 preview_key 时仍使用原直链。

保持本地开发服务运行后执行 `npm test`。测试覆盖旧库迁移、回收站恢复与清理失败重试、上传 Token、URL 获取错误与危险地址。HEIC 浏览器预览、移动端和语言切换另需界面验证。

### 当前云端验收限制

2026-09-22：已部署实例的 Images binding 对本机生成样本及 libheif 示例样本返回 9516 解码错误。浏览器本地转换已验证；直接 API / URL 上传 HEIC 且不附 JPEG preview 的路径尚未验收通过。此限制解决前不要将该路径宣传为稳定可用。
