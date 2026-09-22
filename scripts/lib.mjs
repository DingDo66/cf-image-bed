import { spawn } from "node:child_process";
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const wranglerBin = resolve(
  root,
  "node_modules/wrangler/bin/wrangler.js",
);

export function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

export function writeJson(path, value) {
  const temp = `${path}.tmp`;
  writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  renameSync(temp, path);
}

/** Arguments are passed directly to the child; they never pass through a shell. */
export function run(
  command,
  args,
  { capture = false, env = {}, stdin = "inherit" } = {},
) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      cwd: root,
      env: { ...process.env, WRANGLER_SEND_METRICS: "false", ...env },
      stdio: [
        stdin,
        capture ? "pipe" : "inherit",
        capture ? "pipe" : "inherit",
      ],
    });
    let stdout = "";
    let stderr = "";
    if (capture) {
      child.stdout.setEncoding("utf8").on("data", (data) => {
        stdout += data;
      });
      child.stderr.setEncoding("utf8").on("data", (data) => {
        stderr += data;
      });
    }
    const forwardInterrupt = () => child.kill("SIGINT");
    const forwardTerminate = () => child.kill("SIGTERM");
    process.on("SIGINT", forwardInterrupt);
    process.on("SIGTERM", forwardTerminate);
    const cleanup = () => {
      process.off("SIGINT", forwardInterrupt);
      process.off("SIGTERM", forwardTerminate);
    };
    child.on("error", (error) => {
      cleanup();
      reject(error);
    });
    child.on("close", (code, signal) => {
      cleanup();
      if (code === 0) resolvePromise(stdout.trim());
      else {
        const error = new Error(
          `${command === process.execPath ? args[0].split(/[\\/]/).pop() : command} 执行失败（${signal || code}）。${capture ? `\n${stderr || stdout}` : ""}`,
        );
        error.stdout = stdout;
        error.stderr = stderr;
        error.code = code;
        reject(error);
      }
    });
  });
}

export function wrangler(args, options) {
  if (!existsSync(wranglerBin)) throw new Error("请先运行 npm install。");
  return run(process.execPath, [wranglerBin, ...args], options);
}

export function npmScript(name) {
  if (process.env.npm_execpath)
    return run(process.execPath, [process.env.npm_execpath, "run", name]);
  return run(process.platform === "win32" ? "npm.cmd" : "npm", ["run", name]);
}

export function fail(error) {
  console.error(`\n${error.message}`);
  process.exitCode = 1;
}
