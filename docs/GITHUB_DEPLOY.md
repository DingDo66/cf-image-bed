# 用 GitHub 网页部署PixNest

不需要安装 Node.js、Git，也不需要打开终端。准备好 GitHub 和 Cloudflare 账户后，按下面步骤操作。

**流程：复制仓库 → 准备 Cloudflare → 填三个 Secrets → 点击部署 → 打开图床。**

本流程适用于新建图床，以及更新通过本流程创建的图床。已经通过本地脚本部署的用户，请先看最后的“已有实例”。

## 1. 把代码放到自己的 GitHub

打开项目首页，点击右上角 **Fork → Create fork**，进入自己账号下的仓库。后面所有 GitHub 操作都在自己的仓库进行。

仓库已公开，任何 GitHub 用户都可以 Fork；仓库所有者直接使用现有仓库即可。Fork 不会复制原作者的 Secrets，需要填写自己的配置。

## 2. 准备 Cloudflare

1. 登录 [Cloudflare 控制台](https://dash.cloudflare.com/)，选择用于部署的账户。
2. 打开 **R2 Object Storage**，按页面提示开通 R2。只开通服务，无需自己创建桶。是否需要付款方式及收费标准以账户页面为准。
3. 打开 **Workers & Pages**；首次使用时完成引导并设置自己的 `workers.dev` 子域名。无需购买域名。
4. 复制该账户的 **Account ID / 账户 ID**（32 位字符）。这是账户 ID，不是某个域名的 Zone ID。

部署还会配置一个回收站定时清理任务；账户需要有可用的 Cron 额度。Images 服务端转换和其他 Cloudflare 用量可能计费，项目不承诺永久免费。[R2 开通说明](https://developers.cloudflare.com/r2/get-started/)

## 3. 创建 Cloudflare API Token

打开 [API Tokens](https://dash.cloudflare.com/profile/api-tokens)，选择 **Create Token → Create Custom Token**，名称可填 `minimal-image-bed-github`。

添加以下账户级权限：

| 类别 | 权限 | 级别 |
| --- | --- | --- |
| Account | Workers Scripts | Edit |
| Account | D1 | Edit |
| Account | Workers R2 Storage | Edit |
| Account | Account Settings | Read |

**Account Resources** 选择 **Include → Specific account → 你的部署账户**。无需使用 Global API Key，也无需为默认的 `workers.dev` 地址添加域名权限。

确认并创建，复制生成的 Token，下一步粘贴到 GitHub Secret。不要把 Token 写到代码、Issue 或截图里。

## 4. 填写三个 Secrets

进入自己的 GitHub 仓库：

**Settings → Secrets and variables → Actions → Secrets → New repository secret**

重复三次，每次填写一组 Name 和 Secret：

| Name（原样复制） | Secret（填写自己的值） |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | 上一步创建的 Cloudflare Token |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare 账户 ID |
| `ADMIN_PASSWORD` | 自己设置的图床登录密码，12–256 个字符，不含换行 |

三个值都放在 **Secrets**，不是 Variables。登录时只需密码，无需用户名。会话密钥由脚本随机生成，不用自己填。

可选：如果想更改网址前缀，在同一页面的 **Variables** 标签中添加 `IMAGE_BED_NAME`，例如 `my-photo-library`。默认是 `minimal-image-bed`。使用 3–40 个小写字母、数字或连字符，首尾为字母或数字。

**首次部署后保持这个名称不变。** 修改名称会指定另一套 Worker、数据库和存储桶，不会迁移原来的图片。不要让多个仓库管理同一账户里的同名图床。

## 5. 点击部署

1. 打开仓库顶部的 **Actions**。
2. 如果是 Fork 后第一次使用，按页面提示启用工作流。
3. 左侧选择 **部署图床 / Deploy**。
4. 点击 **Run workflow**，分支选择 **main**。
5. **不要勾选重置密码**，直接点击绿色 **Run workflow**。
6. 打开刚出现的运行记录，等待全部步骤变绿。

脚本会检查配置、构建前端、创建或复用 D1 / R2、应用数据库迁移、设置必要密钥、发布网站，并核对回收站清理任务。

成功后，运行详情的 **Summary / 摘要** 中会出现 **打开图床 / Open image library** 链接。点击后使用 `ADMIN_PASSWORD` 中的密码登录。

地址类似 `https://minimal-image-bed.你的子域名.workers.dev`。新图床为空，上传第一张图片即可开始使用。如果当地网络无法访问 `workers.dev`，可以另行配置自定义域名。

## 日常更新

先备份数据库和图片，方法见 [部署与维护](DEPLOYMENT.md#备份与恢复)。

1. 在自己的 Fork 首页点击 **Sync fork → Update branch**，取得新代码。
2. 再次进入 **Actions → 部署图床 / Deploy → Run workflow**。
3. 使用 `main` 分支，不勾选重置密码。

本流程**只在手动点击时部署**，推送、PR 和同步代码只触发检查。重复部署复用原资源，普通更新保留图片、管理员密码和会话密钥。

## 修改或忘记密码

1. 在 GitHub Secrets 中编辑 `ADMIN_PASSWORD`，保存新密码。
2. 运行部署工作流时勾选 **重置管理员密码并退出旧登录**。

只编辑 Secret 不会立即改变线上密码。成功重置会使之前的登录失效，但图片和分享链接不变。

## 失败时怎么办

展开 Actions 中标红的步骤，先看错误码。修复后重新运行同一个工作流；不要通过改资源名称来重试。

| 现象 | 处理 |
| --- | --- |
| 缺少配置 | 检查三个 Secret 的名称、值，以及是否填在自己的仓库中 |
| 账户 ID 格式错误 | 使用 Account ID，不要复制 Zone ID |
| HTTP 401 / 403、权限错误 | 检查 Token 是否过期、权限是否齐全、授权账户是否与 ID 相同 |
| `10042` / R2 未开通 | 到 Cloudflare 开通 R2，再运行部署 |
| `10072` / Cron 额度不足 | 检查其他任务和账户额度；脚本不会删除其他项目的任务或自动升级套餐 |
| 同名 Worker 绑定不一致 | 新用户在 Variables 改为尚未使用的 `IMAGE_BED_NAME`；已有用户先核对原资源，避免创建空图库 |
| 没有访问地址 / 未设置子域名 | 在 Workers & Pages 完成 `workers.dev` 子域名设置后重试 |
| 网站能访问但部署仍红色 | 代码可能已经发布，后续任务配置失败；以整个运行成功为准，修复错误后重跑 |
| 没有 Run workflow 按钮 | 确认自己有仓库写权限、Actions 已启用，且 main 分支包含部署工作流 |
| 网站密码没变化 | 更新 Secret 后需要勾选重置密码再部署 |

如果 GitHub 提示 Actions 用量或计费限制，需要在 GitHub 账户中处理；GitHub Actions 和 Cloudflare 分别计算用量。

## 已有实例、自定义域名与高级配置

本地脚本生成的 `wrangler.deploy.json` 不会上传到 GitHub，因此本流程不会自动接管原实例。已有图床继续使用原来的 `npm run deploy`；迁移到 Actions 前，应备份并显式匹配原账户、资源名、绑定、域名和环境变量。本指南默认按 `IMAGE_BED_NAME` 派生数据库和桶名，不提供任意旧配置自动导入。

需要自定义域名或环境变量时，在仓库的 `wrangler.jsonc` 模板中维护相应 `routes` / `vars`，详见 [域名配置](DEPLOYMENT.md#自定义域名)。模板不要填私人密钥或生产数据库 ID。使用自定义域名还需要相应 Zone 权限；仅用默认网址不需要。

普通部署保留 Cloudflare 中的 Secret；其他应用配置以仓库模板为准。不要只在 Cloudflare 控制台修改绑定或 Cron，再期待下一次部署保留这些改动。脚本会拒绝目标 DB / R2 不匹配的同名 Worker。

实现采用 Cloudflare 官方 [GitHub Actions 部署方式](https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/)。首次创建、重试、密码保留和失败清理经过自动化模拟测试；完整云端验收需要在配置了真实 Secrets 的账户上运行。
