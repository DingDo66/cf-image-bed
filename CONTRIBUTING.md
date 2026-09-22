# 参与开发

请保持界面简洁，优先使用 Worker、D1 和 R2；高级功能放在二级入口。仓库目前处于私有验证阶段，仅受邀协作者可以访问。

## 本地开发

使用 Node.js 22.12+，执行 `npm ci` 和 `npm run dev`。修改前端后执行 `npm run build` 并刷新。配置与图片数据只存放在本机，不要提交 `.dev.vars`、`.deploy/`、`.wrangler/`、备份或真实 Token。

## 提交前

- 执行 `npm run typecheck`、`npm run build`。
- 保持本地 Worker 运行，执行 `npm test`；测试会创建并清理测试数据。
- 涉及部署配置时执行 `npm run deploy -- --dry-run`。
- 界面修改检查桌面与手机布局，并同步中文、英文文案。
- 数据库变更使用新的增量迁移，保留旧数据兼容；不要修改已经应用的迁移。

提交说明应包含问题、修改后的行为和验证结果；界面变化可附截图。避免在截图与日志中包含私人图片、凭据或账户信息。报告安全问题请参阅 [SECURITY.md](SECURITY.md)。
