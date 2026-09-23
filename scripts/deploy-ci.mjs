import { randomBytes } from 'node:crypto';
import { appendFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { deploymentConfig } from './deploy-config.mjs';
import { readJson, root, wrangler } from './lib.mjs';

export function optionsFromEnv(env) {
  for (const key of ['CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID', 'ADMIN_PASSWORD']) {
    if (!env[key]) throw new Error(`缺少 ${key}：请在 Settings → Secrets and variables → Actions → Secrets 中添加。`);
  }
  if (!/^[a-f0-9]{32}$/i.test(env.CLOUDFLARE_ACCOUNT_ID)) throw new Error('账户 ID 应为 32 位十六进制字符。');
  if (env.ADMIN_PASSWORD.length < 12 || env.ADMIN_PASSWORD.length > 256 || /[\r\n\0]/.test(env.ADMIN_PASSWORD) || env.ADMIN_PASSWORD === 'local-image-bed-2026') {
    throw new Error('ADMIN_PASSWORD 必须为 12–256 个字符，不能使用本地默认密码或包含换行。');
  }
  const name = env.IMAGE_BED_NAME || 'minimal-image-bed';
  if (!/^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/.test(name)) throw new Error('IMAGE_BED_NAME 必须为 3–40 个小写字母、数字或连字符，首尾为字母或数字。');
  return { account: env.CLOUDFLARE_ACCOUNT_ID, token: env.CLOUDFLARE_API_TOKEN, password: env.ADMIN_PASSWORD, name, reset: env.RESET_ADMIN_PASSWORD === 'true' };
}

export function cloudflareClient({ account, token }, fetcher = fetch) {
  return async (method, path, body, missingCode) => {
    const response = await fetcher(`https://api.cloudflare.com/client/v4/accounts/${account}${path}`, {
      method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(30_000),
    });
    let data;
    try { data = await response.json(); } catch { throw new Error(`Cloudflare 返回了非 JSON 响应（HTTP ${response.status}）。请稍后重试。`); }
    if (!response.ok || data.success === false) {
      const codes = (data.errors || []).map(item => Number(item.code));
      if (missingCode && codes.length === 1 && codes[0] === missingCode && response.status === 404) return null;
      if (codes.includes(10042)) throw new Error('请先在 Cloudflare 控制台开通 R2，再重新运行部署。');
      // Do not echo upstream bodies: they may contain request details or secrets.
      throw new Error(`Cloudflare API 请求失败（HTTP ${response.status}，错误码 ${codes.join(', ') || '未知'}）。检查 Token 权限、账户 ID、服务开通状态及额度。`);
    }
    return data;
  };
}

export async function provision(options, api, template) {
  const { name } = options;
  const databaseName = `${name}-db`;
  const bucketName = `${name}-images`;
  const settings = await api('GET', `/workers/scripts/${name}/settings`, undefined, 10007);
  const databases = [];
  for (let page = 1; ; page++) {
    const data = await api('GET', `/d1/database?per_page=100&page=${page}`);
    if (!Array.isArray(data.result)) throw new Error('无法读取 D1 数据库列表。');
    databases.push(...data.result);
    if (data.result_info?.total_pages ? page >= data.result_info.total_pages : data.result.length < 100) break;
  }
  let database = databases.find(item => item.name === databaseName);
  // Check subscription/permissions before creating anything. Only a specific missing-bucket error permits creation.
  const bucket = await api('GET', `/r2/buckets/${bucketName}`, undefined, 10006);
  const bindings = settings?.result?.bindings;
  if (settings) {
    if (!Array.isArray(bindings) || !database?.uuid || !bucket ||
        !bindings.some(b => b.name === 'DB' && b.type === 'd1' && b.id === database.uuid) ||
        !bindings.some(b => b.name === 'IMAGES' && b.type === 'r2_bucket' && b.bucket_name === bucketName)) {
      throw new Error('同名 Worker 的 DB / IMAGES 绑定与部署目标不一致。已停止，未修改资源。首次部署请更换 IMAGE_BED_NAME；已有图床请保留原部署方式并核对配置。');
    }
  }
  const secretList = settings ? await api('GET', `/workers/scripts/${name}/secrets`) : { result: [] };
  if (!Array.isArray(secretList.result)) throw new Error('无法读取 Worker 密钥名称，已停止。');
  if (!database) database = (await api('POST', '/d1/database', { name: databaseName })).result;
  if (!database?.uuid) throw new Error('D1 未返回数据库 ID，请重新运行部署。');
  if (!bucket) await api('POST', '/r2/buckets', { name: bucketName });
  const config = deploymentConfig({
    ...structuredClone(template), name, account_id: options.account,
    d1_databases: [{ binding: 'DB', database_name: databaseName, database_id: database.uuid, migrations_dir: 'migrations' }],
    r2_buckets: [{ binding: 'IMAGES', bucket_name: bucketName }],
  });
  const names = secretList.result.map(item => item.name);
  const secrets = {};
  if (options.reset || !names.includes('ADMIN_PASSWORD')) secrets.ADMIN_PASSWORD = options.password;
  if (options.reset || !names.includes('SESSION_SECRET')) secrets.SESSION_SECRET = randomBytes(48).toString('base64url');
  return { config, secrets };
}

export async function deployCI(env = process.env, dependencies = {}) {
  const options = optionsFromEnv(env);
  const api = dependencies.api || cloudflareClient(options);
  const invoke = dependencies.wrangler || wrangler;
  const template = dependencies.template || readJson(resolve(root, 'wrangler.jsonc'));
  const { config, secrets } = await provision(options, api, template);
  const directory = mkdtempSync(resolve(tmpdir(), 'image-bed-ci-'));
  // Keep config next to the template so Worker/assets/migrations paths remain correct.
  const configPath = resolve(root, `.deploy-check-ci-${process.pid}.json`);
  try {
    writeFileSync(configPath, JSON.stringify(config), { mode: 0o600, flag: 'wx' });
    const remote = { env: { CLOUDFLARE_API_TOKEN: options.token, CLOUDFLARE_ACCOUNT_ID: options.account, CI: 'true' }, stdin: 'ignore' };
    await invoke(['d1', 'migrations', 'apply', 'DB', '--remote', '--config', configPath], remote);
    const args = ['deploy', '--config', configPath];
    if (Object.keys(secrets).length) {
      const secretPath = resolve(directory, 'secrets.json');
      writeFileSync(secretPath, JSON.stringify(secrets), { mode: 0o600, flag: 'wx' });
      args.push('--secrets-file', secretPath);
    }
    await invoke(args, remote);
    const schedules = await api('GET', `/workers/scripts/${options.name}/schedules`);
    if (!schedules.result?.schedules?.some(item => item.cron === '0 * * * *')) {
      throw new Error('代码可能已经发布，但回收站定时清理未确认启用。请检查 Cron 配额后重新运行。');
    }
    const domain = await api('GET', '/workers/subdomain');
    const subdomain = domain.result?.subdomain;
    if (typeof subdomain !== 'string' || !/^[a-z0-9-]+$/.test(subdomain)) throw new Error('部署已完成，但未取得 workers.dev 子域名，请在 Cloudflare Worker 页面查看访问地址。');
    const url = `https://${options.name}.${subdomain}.workers.dev`;
    console.log(`\n部署成功 / Deployed: ${url}`);
    if (env.GITHUB_STEP_SUMMARY) appendFileSync(env.GITHUB_STEP_SUMMARY, `## 部署成功 / Deployment complete\n\n[打开图床 / Open image library](${url})\n\n使用首次部署时设置的管理员密码登录。普通更新保留原密码，重置后使用 ADMIN_PASSWORD 中的新密码。\n\n- Worker: \`${options.name}\`\n- D1: \`${config.d1_databases[0].database_name}\`\n- R2: \`${config.r2_buckets[0].bucket_name}\`\n- 回收站每小时清理任务已核对。\n`);
    return url;
  } finally {
    rmSync(configPath, { force: true });
    rmSync(directory, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  deployCI().catch(error => {
    console.error(`部署未完整完成：${error.message}\n修复后可重新运行；保留相同名称会复用资源。代码或迁移可能已更新，请勿仅凭网站可访问判断部署成功。`);
    process.exitCode = 1;
  });
}
