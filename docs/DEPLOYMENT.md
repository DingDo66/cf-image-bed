# 部署与维护

新用户推荐使用 [GitHub 网页部署指南](GITHUB_DEPLOY.md)，无需本地终端。下文主要介绍本地脚本及高级维护。

## 设计

项目使用标准 Wrangler CLI。前端由 Vite 构建为 `dist/`，随 Worker 一次发布。所有请求先进入 Worker：处理 `/api/*`、`/i/*`、`/t/*`、`/p/*`，其余请求交给 Static Assets 提供 SPA 并附加安全响应头。配置方式依据 Cloudflare 的 [Static Assets 绑定说明](https://developers.cloudflare.com/workers/static-assets/binding/)。

| 绑定 / 配置 | 作用 | 是否保密 |
| --- | --- | --- |
| `ASSETS` | 前端静态资源 | 否 |
| `DB` | D1 图片元数据、相册和鉴权数据 | 数据库内容应保密 |
| `IMAGE_PROCESSOR` | HEIC 服务端 JPEG 转换，需账户支持 Images binding | 否 |
| `triggers.crons` | 每小时清理到期回收站图片 | 否 |
| `IMAGES` | R2 原图、缩略图和兼容预览 | 桶私有；通过 Worker 分享的链接公开 |
| `ADMIN_PASSWORD` | 12–256 个字符的管理员密码 | Cloudflare Secret |
| `SESSION_SECRET` | 随机会话签名密钥，至少 32 个字符 | Cloudflare Secret |
| `PUBLIC_URL` | 可选，生成直链所用 HTTPS 站点来源 | 否 |

默认以当前请求的来源生成图片地址。图片键与域名分开保存；迁移域名后新复制的链接使用新域名，已经分享到别处的旧链接需要继续保留旧域名或自行更新。

## 自动部署与重试

使用 `npm run deploy`，在本地交互式终端完成。首次运行会展示账户与资源名，在你输入 `deploy` 后才开始资源变更。Wrangler 自行处理 Cloudflare OAuth；脚本不读取本机 OAuth 配置文件。也可以使用自己已配置的 `CLOUDFLARE_API_TOKEN`，不要将 Token 提交到 Git。

脚本在每个关键步骤保存非秘密资源信息：

- `wrangler.deploy.json` 是生产配置，可按下文添加域名与公开环境变量。
- `.deploy/state.json` 记录原定名称、账户和数据库 ID，用于发现配置不一致和从中断处继续。
- 两者均被 Git 忽略。请在私有备份中保留，换电脑时复制到项目根目录相同位置。

如果网络中断或创建资源后失败，直接再次执行 `npm run deploy`。脚本会按名称找到同一 D1 / R2，验证已记录的数据库 ID，继续未完成步骤；不会主动删除资源。迁移失败时 Wrangler 会回滚失败的那一条迁移，已经成功的迁移保留，详见 [D1 migrations apply](https://developers.cloudflare.com/workers/wrangler/commands/d1/#d1-migrations-apply)。

密钥通过 `wrangler deploy --secrets-file` 和代码一起发布。普通更新保留现有密钥，不会因为部署而丢失；详情见 [Cloudflare Secrets](https://developers.cloudflare.com/workers/configuration/secrets/)。临时文件仅当前用户可读写，正常结束、异常和 Ctrl+C 都会尝试清理。强制断电或 `kill -9` 无法执行清理时，可删除操作系统临时目录中的 `cf-image-bed-secrets-*` 目录。

不要直接将模板中的数据库占位 ID 用于生产。`npx wrangler deploy` 默认读取本地模板；应使用 `npm run deploy`，或始终显式传入 `--config wrangler.deploy.json`。

## 自定义域名

先确保域名在自己的 Cloudflare 账户里。在生成的 `wrangler.deploy.json` 中增加以下配置，保留原有绑定：

```json
{
  "routes": [
    { "pattern": "images.example.com", "custom_domain": true }
  ],
  "vars": {
    "PUBLIC_URL": "https://images.example.com"
  }
}
```

这是要合并的字段片段，不是完整替换文件。将示例域名改为自己的域名，再运行 `npm run deploy`。只使用 HTTPS 来源，不带路径、用户名、查询参数或片段。也可以在确认域名可用后将 `workers_dev` 设为 `false`。配置细节见 [Workers Custom Domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/)。

不要给 R2 桶单独绑定公开域名；直链路径通过 Worker 处理，应用无需公开 R2 桶。

## 更新、密码与迁移

更新前先备份数据，取得新版代码后执行。运行 `npm test` 前，需要在另一个终端保持 `npm run dev` 运行：

```sh
npm ci
npm run typecheck
npm test
npm run deploy
```

`npm run deploy` 会重新构建、应用尚未执行的远程迁移、发布。现有图片与相册保留。未来迁移应新增有序 SQL 文件，不要改写已经在线上执行过的迁移。采用先增加兼容字段、部署新代码、再清理旧字段的方式，避免迁移先于新代码时影响现有请求。

修改管理员密码、重置忘记的密码，或者让所有登录失效：

```sh
npm run deploy -- --rotate-secrets
```

这一操作同时更换密码与会话密钥。不影响已分享的公开图片链接。

## 备份与恢复

**数据库和 R2 对象需要一起备份。** D1 只包含元数据，不能从 D1 恢复被删掉的原图。为获得一致快照，备份期间暂停上传、编辑、删除及回收站定时清理，完成后恢复定时任务。

1. 创建本地 `backups/` 目录，然后导出 D1：

   ```sh
   npx wrangler d1 export DB --remote --config wrangler.deploy.json --output backups/library.sql
   ```

2. 按 [Cloudflare rclone 指南](https://developers.cloudflare.com/r2/examples/rclone/) 为 R2 配置一个只读备份凭据。假设 rclone remote 叫 `imagebed`，从 `wrangler.deploy.json` 取实际桶名，复制整个桶：

   ```sh
   rclone copy imagebed:你的桶名 backups/objects
   ```

   保留原有对象键，备份必须包含 originals、thumbnails 和 previews 全部对象。不要把 S3 Access Key 写到仓库里。

3. 备份 `wrangler.deploy.json` 与 `.deploy/state.json`，把备份保存到另一设备或存储服务，并验证可以读取。

恢复时先创建一个新的空 D1 和 R2，向空数据库导入 SQL，按原对象键恢复所有对象，验证后再将生产配置的绑定切换到它们；修改或移走旧 `.deploy/state.json`，使记录与新账户 / 资源相匹配。恢复命令示例：

```sh
npx wrangler d1 execute 新数据库名称 --remote --config wrangler.deploy.json --file backups/library.sql
rclone copy backups/objects imagebed:新桶名
```

D1 提供 [Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/)，可以按当前套餐的保留窗口恢复数据库状态；它不恢复 R2 对象。不要仅回退 Worker 代码就假定数据库结构也已回退。

## 手动部署和 CI

GitHub 的 Validate 工作流在推送和 PR 时执行检查，不需要 Cloudflare 密钥；新增“部署图床 / Deploy”工作流由用户手动触发，需要配置三个 Secrets，见 [网页部署指南](GITHUB_DEPLOY.md)。

如需要手动操作，在自己的终端中依次执行 `wrangler d1 create`、`wrangler r2 bucket create`，把结果填写到由模板复制得到的 `wrangler.deploy.json` 中（包括 `name`、`account_id`、D1 的真实 `database_id`、桶名）。初次发布要同时设置 `ADMIN_PASSWORD` 和随机 `SESSION_SECRET`。建议使用自动脚本处理，避免遗漏。

已有实例可以在自己的 CI 中按以下顺序发布，配置文件通过私有 CI 变量或安全制品提供。运行测试的作业需要先启动本地 Worker 并等待 `/api/session` 就绪；可复用本仓库 CI 的启动、等待和清理步骤：

```sh
npm ci
npm run typecheck
npm test
npm run build
npx wrangler d1 migrations apply DB --remote --config wrangler.deploy.json
npx wrangler deploy --config wrangler.deploy.json
```

CI 中设置 `CLOUDFLARE_API_TOKEN` 与 `CLOUDFLARE_ACCOUNT_ID`，Token 仅授权所需账户与 Workers、D1、R2 操作。已存在的密码与会话 Secret 会保留，无需每次向 CI 提供。生产发布任务应串行执行，防止两次迁移/部署交叉。

## 常见问题

- **登录显示未配置：** 生产 Worker 需要两个有效 Secret；重新执行部署或使用 `--rotate-secrets`。本地检查 `.dev.vars` 并重启。
- **R2 创建失败：** 先完成 R2 开通流程；确认选择了正确的账户，并具备 R2 权限。
- **本地端口被占用：** 停止占用 8787 的旧 Wrangler 进程再启动。
- **更新后样式没有变化：** 本地重新构建，线上重新部署，刷新浏览器；不要只修改 `src/` 而不构建。
- **图片可在后台看到但复制链接打不开：** 检查 `PUBLIC_URL`、域名解析及 Worker 路由，图片域名必须指向同一个应用。
- **账户或资源名要改变：** 将其视为一次迁移，先备份并恢复数据，再修改配置。不要随意删掉部署状态后用新名称重新运行，并期望旧图片自动迁移。
- **Cloudflare 请求额度、内存或 CPU 超限：** 查看平台日志及当前套餐；高流量场景需要按访问量设计缓存、限流与费用控制。

## 新媒体功能配置

部署脚本和 dry-run 均补齐 IMAGE_PROCESSOR 绑定及每小时 Cron，保留自定义定时任务。dry-run 使用临时配置，不改写生产配置。Images 转换可能产生独立费用；浏览器本地 HEIC 转换成功时不调用服务端转换。详见 [媒体功能与上传 API](MEDIA_API.md)。

### Cron 配额不足

若部署返回 `10072`（账户 Cron 配额不足），Worker 代码和迁移可能已经成功，但定时清理未启用。手动恢复、永久删除和清空仍可使用，不能保证到期图片自动清理。需由账户所有者释放其他不再使用的定时任务额度，或选择适合的套餐，再重新部署。脚本不会自动删除其他 Worker 的任务或升级套餐。
