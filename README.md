<p align="center"><img src="public/favicon.svg" width="64" height="64" alt="PixNest 图标"></p>

<h1 align="center">PixNest</h1>
<p align="center"><strong>Your images, your space.</strong></p>
<p align="center">一个部署在 Cloudflare 上的极简自托管图床。</p>
<p align="center">
  <a href="https://github.com/DingDo66/PixNest/actions/workflows/ci.yml"><img src="https://github.com/DingDo66/PixNest/actions/workflows/ci.yml/badge.svg" alt="Validate"></a>
  <img src="https://img.shields.io/badge/Cloudflare-Workers%20%2B%20R2%20%2B%20D1-f38020" alt="Cloudflare Workers + R2 + D1">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT License"></a>
</p>
<p align="center">简体中文 · <a href="README.en.md">English</a></p>
<p align="center">
  <a href="#先在本地运行">本地运行</a> ·
  <a href="docs/GITHUB_DEPLOY.md">网页部署</a> ·
  <a href="docs/MEDIA_API.md">上传 API</a> ·
  <a href="CHANGELOG.md">更新记录</a> ·
  <a href="CONTRIBUTING.md">参与开发</a>
</p>

PixNest 是一个部署在 Cloudflare 上的极简自托管图床。图片库采用留白、浅灰边框与四列图片卡片的设计，支持手机和桌面。图片由你管理，链接可以公开分享。

当前处于发布前验证阶段。功能与验证范围见 [验证记录](docs/VALIDATION.md)，版本变更见 [更新记录](CHANGELOG.md)。

## 已实现

- 拖拽、选择和粘贴上传，多文件上传进度；JPG、PNG、WebP、GIF、HEIC / HEIF，每张最多 20 MiB。
- 网格 / 列表视图、文件名 / 标签 / 描述搜索、最近上传。
- 中英文界面，首次使用跟随浏览器语言；登录页和顶部的小按钮可一键切换，并记住选择。
- 全屏大图预览，支持左右按钮和键盘方向键切换；顶部仅显示图标，悬停或键盘聚焦时显示下载、详情、新页面打开、复制链接和删除等操作名称。
- 圆圈勾选图片，支持全选、批量删除和移动到相册；显示处理进度，部分失败时保留失败项的选中状态，便于重试。
- 图片详情支持重命名、描述、标签和移动到相册，关闭详情后回到当前大图。
- 相册管理；卡片、列表和大图预览均可快速复制直链、Markdown、HTML，并记住上次选择的格式。
- 单管理员密码登录、服务端会话、登录限流；图片库与管理 API 需要登录。
- 独立的 Cloudflare Worker、R2 存储、D1 数据库和静态前端，一份代码完成部署。

鼠标移到图片卡片上时，右上角会出现选择圆圈；点击圆圈只切换选中状态，未选择图片时点击其他位置打开大图预览；已有选中项时，点击图片任意位置切换选择。全选包含当前搜索、最近上传或相册筛选结果中的所有图片，包括尚未加载的后续分页。切换页面或筛选条件会清空选择，避免误操作其他范围的图片。

## 新增的次级工具

- 上传按钮菜单 → **从网址上传**，后端获取图片并保存到自己的 R2。
- 账户菜单 → **回收站**，保留 30 天，可恢复、永久删除或清空。
- 账户菜单 → **API Token 管理**，创建仅允许上传的独立 Token。
- HEIC / HEIF 保留原文件并生成 JPEG 预览；详情中可收藏，原图下载保持原格式。

接口示例、HEIC 转换配置和升级注意事项见 [媒体功能与上传 API](docs/MEDIA_API.md)。

## 使用前了解

- 无需 VPS、Docker 或常驻 Node 服务；Node.js 仅用于本地开发与部署。
- 相册中的“移出相册”保留图片；图片库中的“删除”先进入回收站，恢复时保留原有元数据。
- 自动清理依赖成功启用 Cloudflare Cron；账户定时任务额度不足时需要先解决配额问题。
- 浏览器上传 HEIC / HEIF 会生成兼容预览并保留原文件；URL / API 的服务端转换依赖 Images binding，目前仍有解码兼容问题，详见 [验证记录](docs/VALIDATION.md)。

## 网页部署（推荐新人使用）

**无需终端：Fork 仓库 → 填写三个 Secrets → Actions 点击部署 → 打开图床。**

准备 Cloudflare API Token、账户 ID 和管理员密码，在 GitHub 的 **部署图床 / Deploy** 工作流中选择 `main` 并运行。数据库、存储桶、迁移和登录密钥由脚本处理，成功后摘要中会显示网站地址。

👉 **[按照网页部署指南开始](docs/GITHUB_DEPLOY.md)** · [English guide](docs/GITHUB_DEPLOY.en.md)

项目已公开，可 Fork 到自己的 GitHub 账户后部署。日常更新也是手动点击部署，普通推送不会自动发布。已有本地部署实例请先阅读指南中的“已有实例”。

## 先在本地运行

需要 Node.js 22.12+ 和 npm。下载或克隆本项目，在项目目录执行：

```sh
npm install
npm run dev
```

打开 [http://localhost:8787](http://localhost:8787)。首次启动会创建仅供本地使用的 `.dev.vars`，默认管理员密码为 **`local-image-bed-2026`**。可以修改文件中的 `ADMIN_PASSWORD`，重启后生效。

`dev` 会构建前端、自动执行本地数据库迁移，再启动 Wrangler；无需 Cloudflare 登录。图片和元数据保存在 `.wrangler/state`，重启后保留。修改前端后执行 `npm run build` 并刷新页面，或重新运行 `npm run dev`。

新实例默认没有图片。需要查看完整示例时，保持本地服务运行，另开终端执行：

```sh
npm run demo:seed
```

演示脚本只允许写入本机服务，示例数据不会被生产部署带上。示例下载自 Unsplash，见 [图片来源](docs/demo-images.md)。

## 从本地部署到 Cloudflare

准备一个 Cloudflare 账户，并在控制台启用 R2 订阅。Cloudflare 的 R2 入门流程包括开通订阅，具体要求以账户页面为准。[R2 开通说明](https://developers.cloudflare.com/r2/get-started/)

```sh
npm run deploy
```

交互式脚本会完成以下步骤：

1. 检查类型、构建前端，通过 Wrangler 登录 Cloudflare。
2. 选择账户 ID、Worker 名称、D1 数据库名和 R2 桶名，展示部署目标。
3. 输入 `deploy` 后创建或复用这些资源，保存资源配置，方便中断后继续。
4. 设置隐藏输入的管理员密码，生成随机会话密钥；应用数据库迁移后，将代码与密钥一起发布。
5. 输出可访问的 HTTPS 地址。新部署的图片库为空，登录后即可上传。

生产资源写入被 Git 忽略的 `wrangler.deploy.json` 与 `.deploy/state.json`。管理员密码和会话密钥不会写入这些文件；上传时只使用权限为 `0600` 的临时文件，流程结束会删除。后续运行 `npm run deploy` 会复用原有资源和密钥。模板 `wrangler.jsonc` 只包含本地占位绑定。

部署前可运行只在本地打包的检查：

```sh
npm run deploy -- --dry-run
```

域名、手动部署、CI、更新和故障恢复详见 [部署与维护](docs/DEPLOYMENT.md)。

## 数据与访问方式

```text
浏览器 ── 静态页面 ────────────── Workers Static Assets
      ├─ /api/* ── 登录与管理 ─── Worker ── D1（元数据 / 相册 / 会话）
      │                                └─ R2（原图 / 缩略图）
      └─ /i/*、/t/* ── 公开读取 ─ Worker ── R2
```

管理后台只有一个管理员，没有开放注册或游客上传。相册仅用于管理员整理图片，不会生成公开相册列表。

**图片链接公开可访问。** 随机文件键使链接不易被猜到，但知道链接的人无需登录即可读取原图和缩略图；它们不适合保存需要鉴权的私密照片。回收站保留期内图片链接仍然有效，永久删除才会使之后的源站请求失效，但已经下载或缓存的副本无法撤回。R2 桶保持私有，无需开启 `r2.dev` 公共访问。

上传会校验文件大小、类型与文件头，禁止 SVG / HTML；原图保留原始内容，包括可能存在的 EXIF 信息。缩略图由浏览器生成，上传失败时可退回显示原图。生产使用 HTTPS，登录 Cookie 为 HttpOnly，并校验浏览器写入请求的来源。

## 常用命令

| 命令 | 用途 |
| --- | --- |
| `npm run dev` | 一条命令启动本地完整应用 |
| `npm run build` | 构建静态前端到 `dist/` |
| `npm run typecheck` | 检查前端与 Worker 类型 |
| `npm test` | 先保持 `npm run dev` 运行，再验证本地真实 Worker API 和批量选择辅助逻辑 |
| `npm run test:selection` | 单独验证批量选择、分页和批量操作辅助逻辑，无需启动本地服务 |
| `npm run demo:seed` | 给正在运行的本地服务添加示例图片 |
| `npm run deploy` | 交互式创建资源、迁移、部署或更新 |
| `npm run deploy -- --dry-run` | 验证打包，不部署 |
| `npm run deploy -- --rotate-secrets` | 更新密码和会话密钥，并使旧登录失效 |

## 费用与边界

实际费用由使用量及 Cloudflare 账户套餐决定，包括 Worker 调用、R2 存储与操作、D1 查询与存储；本项目不承诺永久免费。页面和图片请求都经过 Worker，外链访问量会影响使用量。请查看最新的 [Workers 定价](https://developers.cloudflare.com/workers/platform/pricing/)、[R2 定价](https://developers.cloudflare.com/r2/pricing/) 和 [D1 定价](https://developers.cloudflare.com/d1/platform/pricing/)。

当前面向个人图片库：没有多用户、开放上传、图片审核、防盗链、对象总量配额或 CDN 缓存清除面板；搜索与分页适合中小型图库。20 MiB 限制不等于解码后像素上限，特别大的图片可能超出设备浏览器处理能力。文件头检查不等于完整的恶意文件扫描。

R2 与 D1 无跨服务事务，应用会在已知失败时补偿清理，但在 Worker 被强制中止等少见情形下仍可能留下孤立对象。请同时备份对象和数据库，详见 [部署与维护](docs/DEPLOYMENT.md#备份与恢复)。

## 项目结构

```text
src/                  React 界面
worker/               API、鉴权与图片读取
migrations/           D1 增量 SQL 迁移
scripts/              本地启动、部署、演示及验证脚本
wrangler.jsonc        可提交的本地配置模板
wrangler.deploy.json  部署脚本生成的账户配置（不提交）
```

项目代码采用 MIT License；HEIC 解码依赖采用 LGPL-3.0，见 [第三方许可](public/licenses/NOTICE.md)。上传内容的权利与管理由部署者负责。
