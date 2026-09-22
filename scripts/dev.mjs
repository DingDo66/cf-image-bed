import { randomBytes } from "node:crypto";
import { existsSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fail, npmScript, root, wrangler } from "./lib.mjs";

try {
  const varsPath = resolve(root, ".dev.vars");
  if (!existsSync(varsPath)) {
    writeFileSync(
      varsPath,
      [
        "# Local development only. Production uses Cloudflare secrets.",
        'ADMIN_PASSWORD="local-image-bed-2026"',
        `SESSION_SECRET="${randomBytes(48).toString("base64url")}"`,
        "",
      ].join("\n"),
      { mode: 0o600, flag: "wx" },
    );
    console.log("已创建本地配置。首次登录密码：local-image-bed-2026");
  } else {
    console.log(
      "使用现有 .dev.vars；本地登录密码见该文件中的 ADMIN_PASSWORD。",
    );
  }
  await npmScript("build");
  await wrangler(["d1", "migrations", "apply", "DB", "--local"], {
    stdin: "ignore",
  });
  console.log(
    "\n本地预览：http://localhost:8787（D1 与 R2 数据保存在 .wrangler/state）",
  );
  console.log(
    "修改前端后重新运行 npm run build，并刷新浏览器。Ctrl+C 停止。\n",
  );
  await wrangler(["dev", "--local", "--ip", "127.0.0.1", "--port", "8787"]);
} catch (error) {
  fail(error);
}
