import { deploymentConfig } from "./deploy-config.mjs";
import { randomBytes } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { createInterface } from "node:readline";
import { Writable } from "node:stream";
import {
  fail,
  npmScript,
  readJson,
  root,
  wrangler,
  writeJson,
} from "./lib.mjs";

const configPath = resolve(root, "wrangler.deploy.json");
const statePath = resolve(root, ".deploy/state.json");
let secretDirectory;
let checkConfigPath;

function ask(prompt, { hidden = false } = {}) {
  return new Promise((resolveAnswer, reject) => {
    const output = hidden
      ? new Writable({
          write(_chunk, _encoding, callback) {
            callback();
          },
        })
      : process.stdout;
    const rl = createInterface({
      input: process.stdin,
      output,
      terminal: true,
    });
    let answered = false;
    rl.once("SIGINT", () => {
      rl.close();
      reject(new Error("部署已取消。"));
    });
    rl.once("close", () => {
      if (!answered) reject(new Error("输入结束，部署已停止。"));
    });
    if (hidden) process.stdout.write(prompt);
    rl.question(hidden ? "" : prompt, (answer) => {
      answered = true;
      rl.close();
      if (hidden) process.stdout.write("\n");
      resolveAnswer(answer);
    });
  });
}

async function chooseName(prompt, fallback, max = 54) {
  while (true) {
    const name = (await ask(`${prompt} [${fallback}]：`)).trim() || fallback;
    if (
      name.length >= 3 &&
      name.length <= max &&
      /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])$/.test(name)
    )
      return name;
    console.log(
      `请使用 3–${max} 个小写英文字母、数字或连字符，首尾为字母或数字。`,
    );
  }
}

async function readPassword() {
  while (true) {
    const password = await ask("管理员密码（至少 12 个字符，输入不显示）：", {
      hidden: true,
    });
    if (
      password.length < 12 ||
      password.length > 256 ||
      /[\r\n\0]/.test(password)
    ) {
      console.log("密码必须为 12–256 个字符，且不含换行或空字符。");
      continue;
    }
    if (password === "local-image-bed-2026") {
      console.log("请为生产环境选择一个独立密码。");
      continue;
    }
    const repeated = await ask("再次输入管理员密码：", { hidden: true });
    if (password === repeated) return password;
    console.log("两次输入不一致，请重新输入。");
  }
}

function getBindings(config) {
  const database = config.d1_databases?.find((item) => item.binding === "DB");
  const bucket = config.r2_buckets?.find((item) => item.binding === "IMAGES");
  if (!database || !bucket)
    throw new Error("生产配置必须包含 DB 与 IMAGES 绑定。");
  return { database, bucket };
}

function cleanupSecrets() {
  if (secretDirectory)
    rmSync(secretDirectory, { recursive: true, force: true });
}

try {
  const args = process.argv.slice(2);
  if (
    args.some(
      (arg) => !["--dry-run", "--rotate-secrets", "--help"].includes(arg),
    )
  ) {
    throw new Error("支持的选项：--dry-run、--rotate-secrets、--help。");
  }
  if (args.includes("--help")) {
    console.log(
      "npm run deploy                  交互式创建资源并部署；后续运行会复用资源和密钥。",
    );
    console.log(
      "npm run deploy -- --dry-run      仅本地构建与打包验证，不连接 Cloudflare。",
    );
    console.log(
      "npm run deploy -- --rotate-secrets  部署并更改密码及会话密钥，所有登录会失效。",
    );
  } else {
    if (
      !args.includes("--dry-run") &&
      (!process.stdin.isTTY || !process.stdout.isTTY)
    ) {
      throw new Error(
        "首次部署/更新请在交互式终端运行 npm run deploy。CI 部署方法见 docs/DEPLOYMENT.md。",
      );
    }
    await npmScript("typecheck");
    await npmScript("build");
    if (args.includes("--dry-run")) {
      checkConfigPath = resolve(root, `.deploy-check-${process.pid}.json`);
      writeJson(
        checkConfigPath,
        deploymentConfig(
          readJson(
            existsSync(configPath)
              ? configPath
              : resolve(root, "wrangler.jsonc"),
          ),
        ),
      );
      await wrangler(["deploy", "--dry-run", "--config", checkConfigPath]);
      console.log("\n本地打包验证完成，没有创建或修改云端资源。");
    } else {
      console.log(
        "\n接下来会登录 Cloudflare，创建或复用一个 D1 数据库和一个 R2 桶，然后发布 Worker。",
      );
      console.log(
        "请先在 Cloudflare 控制台启用 R2；实际费用和额度以账户控制台为准。\n",
      );
      try {
        await wrangler(["whoami", "--json"], { capture: true });
      } catch {
        await wrangler(["login"]);
      }

      mkdirSync(resolve(root, ".deploy"), { recursive: true, mode: 0o700 });
      let state = existsSync(statePath) ? readJson(statePath) : {};
      let config;
      if (existsSync(configPath)) {
        config = readJson(configPath);
        const { database, bucket } = getBindings(config);
        if (
          state.accountId &&
          (state.accountId !== config.account_id ||
            state.workerName !== config.name)
        ) {
          throw new Error(
            "wrangler.deploy.json 与 .deploy/state.json 的账户/Worker 不一致。请恢复匹配的配置，或先阅读 docs/DEPLOYMENT.md 的迁移说明。",
          );
        }
        state = {
          ...state,
          accountId: config.account_id,
          workerName: config.name,
          databaseName: database.database_name,
          bucketName: bucket.bucket_name,
        };
      } else if (state.accountId) {
        config = {
          ...readJson(resolve(root, "wrangler.jsonc")),
          name: state.workerName,
          account_id: state.accountId,
        };
        const { database, bucket } = getBindings(config);
        database.database_name = state.databaseName;
        database.database_id = state.databaseId || database.database_id;
        bucket.bucket_name = state.bucketName;
      } else {
        await wrangler(["whoami"]);
        let accountId;
        do {
          accountId = (
            await ask("部署账户 ID（从上方账户列表复制 32 位 ID）：")
          ).trim();
        } while (!/^[a-f0-9]{32}$/i.test(accountId));
        const workerName = await chooseName(
          "Worker 名称",
          `image-bed-${randomBytes(3).toString("hex")}`,
        );
        const databaseName = await chooseName(
          "D1 数据库名称",
          `${workerName}-db`,
          63,
        );
        const bucketName = await chooseName(
          "R2 桶名称",
          `${workerName}-images`,
          63,
        );
        state = { accountId, workerName, databaseName, bucketName };
        config = {
          ...readJson(resolve(root, "wrangler.jsonc")),
          name: workerName,
          account_id: accountId,
        };
        const { database, bucket } = getBindings(config);
        database.database_name = databaseName;
        bucket.bucket_name = bucketName;
      }
      if (!/^[a-f0-9]{32}$/i.test(config.account_id || ""))
        throw new Error("生产配置缺少有效的 account_id。");
      console.log(
        `\n账户：${state.accountId}\nWorker：${state.workerName}\nD1：${state.databaseName}\nR2：${state.bucketName}`,
      );
      console.log("会复用同名资源、应用尚未执行的数据库迁移，并发布当前构建。");
      if ((await ask("输入 deploy 开始：")).trim() !== "deploy")
        throw new Error("部署已取消，没有修改云端资源。");
      writeJson(statePath, state); // Save planned names before provisioning, so interrupted runs can resume.
      writeJson(configPath, config);
      const remote = { env: { CLOUDFLARE_ACCOUNT_ID: state.accountId } };
      const { database, bucket } = getBindings(config);
      let databases = JSON.parse(
        await wrangler(["d1", "list", "--json", "--config", configPath], {
          ...remote,
          capture: true,
        }),
      );
      if (!Array.isArray(databases)) databases = databases.result;
      if (!Array.isArray(databases))
        throw new Error("无法读取 D1 列表，已停止部署。");
      let existingDatabase = databases.find(
        (item) => item.name === database.database_name,
      );
      if (!existingDatabase) {
        await wrangler(
          [
            "d1",
            "create",
            database.database_name,
            "--update-config=false",
            "--config",
            configPath,
          ],
          remote,
        );
        const result = JSON.parse(
          await wrangler(["d1", "list", "--json", "--config", configPath], {
            ...remote,
            capture: true,
          }),
        );
        existingDatabase = (
          Array.isArray(result) ? result : result.result
        )?.find((item) => item.name === database.database_name);
      }
      if (!existingDatabase?.uuid)
        throw new Error(
          "D1 已创建但未能取得 ID；再次运行 npm run deploy 可继续。",
        );
      if (state.databaseId && state.databaseId !== existingDatabase.uuid) {
        throw new Error(
          "D1 数据库 ID 与上次部署不一致；请先确认数据库是否被替换。",
        );
      }
      database.database_id = existingDatabase.uuid;
      state.databaseId = existingDatabase.uuid;
      writeJson(configPath, config);
      writeJson(statePath, state);
      try {
        await wrangler(
          [
            "r2",
            "bucket",
            "info",
            bucket.bucket_name,
            "--json",
            "--config",
            configPath,
          ],
          { ...remote, capture: true },
        );
      } catch (error) {
        const output = `${error.stdout || ""}\n${error.stderr || ""}`;
        if (
          !/NoSuchBucket|bucket[^\n]*(?:not found|does not exist)|\b10006\b/i.test(
            output,
          )
        )
          throw error;
        await wrangler(
          [
            "r2",
            "bucket",
            "create",
            bucket.bucket_name,
            "--update-config=false",
            "--config",
            configPath,
          ],
          remote,
        );
      }
      // Check only secret names, never retrieve or log secret values.
      let secretNames = [];
      try {
        const listed = JSON.parse(
          await wrangler(["secret", "list", "--config", configPath], {
            ...remote,
            capture: true,
          }),
        );
        secretNames = listed.map((item) => item.name);
      } catch (error) {
        const output = `${error.stdout || ""}\n${error.stderr || ""}`;
        if (
          !/\b10007\b|worker[^\n]*not found|script[^\n]*(?:not found|does not exist)/i.test(
            output,
          )
        )
          throw error;
      }
      const needsSecrets =
        args.includes("--rotate-secrets") ||
        !["ADMIN_PASSWORD", "SESSION_SECRET"].every((name) =>
          secretNames.includes(name),
        );
      let secretFile;
      if (needsSecrets) {
        const password = await readPassword();
        secretDirectory = mkdtempSync(
          resolve(tmpdir(), "cf-image-bed-secrets-"),
        );
        secretFile = resolve(secretDirectory, "secrets.json");
        writeFileSync(
          secretFile,
          JSON.stringify({
            ADMIN_PASSWORD: password,
            SESSION_SECRET: randomBytes(48).toString("base64url"),
          }),
          { mode: 0o600, flag: "wx" },
        );
        process.once("exit", cleanupSecrets);
      } else {
        console.log("保留现有管理员密码与会话密钥。");
      }
      const updatedConfig = deploymentConfig(readJson(configPath));
      writeJson(configPath, updatedConfig);
      await wrangler(
        ["d1", "migrations", "apply", "DB", "--remote", "--config", configPath],
        remote,
      );
      const deployArgs = ["deploy", "--config", configPath];
      if (secretFile) deployArgs.push("--secrets-file", secretFile);
      await wrangler(deployArgs, remote);
      state.lastDeployedAt = new Date().toISOString();
      writeJson(statePath, state);
      console.log(
        "\n部署完成。使用 Wrangler 上方输出的 HTTPS 地址登录；新实例的图片库为空。",
      );
      console.log(
        "后续更新：npm run deploy。域名配置与备份方法见 docs/DEPLOYMENT.md。",
      );
    }
  }
} catch (error) {
  console.error("部署未完整完成时，请检查上方输出：代码和数据库可能已经更新，触发器配置可能失败。修复账户额度或权限后重跑部署；不要仅凭网页可访问判断定时清理已启用。");
  fail(error);
} finally {
  if (checkConfigPath) rmSync(checkConfigPath, { force: true });
  cleanupSecrets();
}
