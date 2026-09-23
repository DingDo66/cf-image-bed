import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { optionsFromEnv, cloudflareClient, provision, deployCI } from '../scripts/deploy-ci.mjs';

const env = { CLOUDFLARE_API_TOKEN: 'test-token', CLOUDFLARE_ACCOUNT_ID: 'a'.repeat(32), ADMIN_PASSWORD: 'test-password-long' };
const template = JSON.parse(readFileSync(new URL('../wrangler.jsonc', import.meta.url)));
function fixture({ existing = false, mismatch = false, bucketFailure = false, pageTwo = false, secrets = ['ADMIN_PASSWORD', 'SESSION_SECRET'], cron = true } = {}) {
  const calls = [];
  const db = { name: 'minimal-image-bed-db', uuid: 'db-id' };
  const api = async (method, path, body) => {
    calls.push({ method, path, body });
    if (path.endsWith('/settings')) return existing ? { result: { bindings: [
      { name: 'DB', type: 'd1', id: mismatch ? 'wrong-id' : db.uuid },
      { name: 'IMAGES', type: 'r2_bucket', bucket_name: 'minimal-image-bed-images' },
    ] } } : null;
    if (path.startsWith('/d1/database?')) return { result: existing && (!pageTwo || path.endsWith('page=2')) ? [db] : [], result_info: { total_pages: pageTwo ? 2 : 1 } };
    if (path.startsWith('/r2/buckets/') && method === 'GET') { if (bucketFailure) throw new Error('R2 disabled'); return existing ? { result: {} } : null; }
    if (path.endsWith('/secrets')) return { result: secrets.map(name => ({ name })) };
    if (path === '/d1/database' && method === 'POST') return { result: db };
    if (path === '/r2/buckets' && method === 'POST') return { result: {} };
    if (path.endsWith('/schedules')) return { result: { schedules: cron ? [{ cron: '0 * * * *' }] : [] } };
    if (path === '/workers/subdomain') return { result: { subdomain: 'example' } };
    throw new Error(`Unexpected API call ${method} ${path}`);
  };
  return { api, calls };
}

test('CI validates missing secrets, password and names before any cloud request', () => {
  for (const key of Object.keys(env)) assert.throws(() => optionsFromEnv({ ...env, [key]: '' }));
  assert.throws(() => optionsFromEnv({ ...env, ADMIN_PASSWORD: '123456' }));
  assert.throws(() => optionsFromEnv({ ...env, IMAGE_BED_NAME: '../../other' }));
  assert.equal(optionsFromEnv(env).name, 'minimal-image-bed');
});
test('fresh deployment creates only required storage and generates independent secrets', async () => {
  const { api, calls } = fixture();
  const { config, secrets } = await provision(optionsFromEnv(env), api, template);
  assert.deepEqual(calls.filter(c => c.method === 'POST').map(c => c.path), ['/d1/database', '/r2/buckets']);
  assert.equal(config.d1_databases[0].database_id, 'db-id');
  assert.equal(secrets.ADMIN_PASSWORD, env.ADMIN_PASSWORD);
  assert.ok(secrets.SESSION_SECRET.length >= 32);
  assert.equal(template.name, 'cf-image-bed-local');
});
test('updates traverse pagination, reuse storage and preserve both secrets', async () => {
  const { api, calls } = fixture({ existing: true, pageTwo: true });
  const result = await provision(optionsFromEnv(env), api, template);
  assert.deepEqual(result.secrets, {});
  assert.equal(calls.filter(c => c.method !== 'GET').length, 0);
});
test('password reset rotates secrets only when explicitly selected', async () => {
  const { api } = fixture({ existing: true });
  const result = await provision(optionsFromEnv({ ...env, RESET_ADMIN_PASSWORD: 'true' }), api, template);
  assert.deepEqual(Object.keys(result.secrets).sort(), ['ADMIN_PASSWORD', 'SESSION_SECRET']);
});
test('missing one secret does not overwrite the other', async () => {
  const { api } = fixture({ existing: true, secrets: ['ADMIN_PASSWORD'] });
  const result = await provision(optionsFromEnv(env), api, template);
  assert.deepEqual(Object.keys(result.secrets), ['SESSION_SECRET']);
});
test('conflicting Worker bindings and R2 access failures cause no mutations', async () => {
  for (const scenario of [{ existing: true, mismatch: true }, { bucketFailure: true }]) {
    const { api, calls } = fixture(scenario);
    await assert.rejects(provision(optionsFromEnv(env), api, template));
    assert.equal(calls.filter(c => c.method !== 'GET').length, 0);
  }
});
test('API distinguishes missing resources from authorization failures and redacts error payloads', async () => {
  const response = (status, code) => async () => new Response(JSON.stringify({ success: false, errors: [{ code, message: env.CLOUDFLARE_API_TOKEN }] }), { status });
  const options = optionsFromEnv(env);
  assert.equal(await cloudflareClient(options, response(404, 10007))('GET', '/missing', undefined, 10007), null);
  await assert.rejects(cloudflareClient(options, response(403, 10007))('GET', '/missing', undefined, 10007), error => !error.message.includes(env.CLOUDFLARE_API_TOKEN));
  await assert.rejects(cloudflareClient(options, response(403, 10042))('GET', '/r2/buckets'), /开通 R2/);
});
test('deployment applies migrations before publishing, protects and removes temporary secrets', async () => {
  const { api } = fixture();
  const calls = [];
  let secretPath, configPath;
  const url = await deployCI(env, { api, template, wrangler: async args => {
    calls.push(args[0]); configPath = args[args.indexOf('--config') + 1];
    assert.equal(JSON.parse(readFileSync(configPath)).name, 'minimal-image-bed');
    if (args[0] === 'deploy') {
      secretPath = args[args.indexOf('--secrets-file') + 1];
      assert.equal(statSync(secretPath).mode & 0o777, 0o600);
      assert.equal(JSON.parse(readFileSync(secretPath)).ADMIN_PASSWORD, env.ADMIN_PASSWORD);
    }
  } });
  assert.deepEqual(calls, ['d1', 'deploy']);
  assert.equal(url, 'https://minimal-image-bed.example.workers.dev');
  assert.equal(existsSync(secretPath), false);
  assert.equal(existsSync(configPath), false);
});
test('failed migrations prevent publication; failed deployment still removes secrets', async () => {
  for (const failAt of ['d1', 'deploy']) {
    const { api } = fixture(); const calls = []; let secretPath, configPath;
    await assert.rejects(deployCI(env, { api, template, wrangler: async args => {
      calls.push(args[0]); configPath = args[args.indexOf('--config') + 1];
      if (args.includes('--secrets-file')) secretPath = args[args.indexOf('--secrets-file') + 1];
      if (args[0] === failAt) throw new Error('simulated failure');
    } }), /simulated failure/);
    assert.deepEqual(calls, failAt === 'd1' ? ['d1'] : ['d1', 'deploy']);
    assert.equal(existsSync(configPath), false);
    if (secretPath) assert.equal(existsSync(secretPath), false);
  }
});
test('missing Cron never reports a successful deployment', async () => {
  const { api } = fixture({ cron: false });
  await assert.rejects(deployCI(env, { api, template, wrangler: async () => {} }), /定时清理/);
});
