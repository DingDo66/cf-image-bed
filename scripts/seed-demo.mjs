import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

// Explicit opt-in. Never seed a remote/production gallery.
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const base = "http://127.0.0.1:8787";
const photographs = [
  {
    name: "mountain.jpg",
    photo: "photo-1464822759023-fed622ff2c3b",
    tags: ["山野", "风景"],
    description: "山峰与晨光",
  },
  {
    name: "sea.jpg",
    photo: "photo-1473116763249-2faaef81ccda",
    tags: ["海边", "风景"],
    description: "海风经过的地方",
  },
  {
    name: "architecture.jpg",
    photo: "photo-1600607687920-4e2a09cf159d",
    tags: ["建筑", "空间"],
    description: "光影构成的空间",
  },
  {
    name: "plant.jpg",
    photo: "photo-1501004318641-b39e6451bec6",
    tags: ["植物", "日常"],
    description: "日常里的一点绿意",
  },
  {
    name: "dunes.jpg",
    photo: "photo-1509316785289-025f5b846b35",
    tags: ["沙漠", "风景"],
    description: "风留在沙丘上的痕迹",
  },
  {
    name: "clouds.jpg",
    photo: "photo-1534088568595-a066f410bcda",
    tags: ["天空", "云"],
    description: "抬头看见的一朵云",
  },
  {
    name: "interior.jpg",
    photo: "photo-1600210492486-724fe5c67fb0",
    tags: ["室内", "空间"],
    description: "安静的午后",
  },
  {
    name: "lake.jpg",
    photo: "photo-1470770841072-f978cf4d019e",
    tags: ["湖泊", "风景"],
    description: "山间湖泊的倒影",
  },
];

let cookie = "";
async function api(path, init = {}) {
  const response = await fetch(base + path, {
    ...init,
    headers: { Cookie: cookie, ...init.headers },
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
  if (response.headers.get("set-cookie"))
    cookie = response.headers.get("set-cookie").split(";")[0];
  return data;
}
try {
  const vars = await readFile(resolve(root, ".dev.vars"), "utf8");
  const match = vars.match(/^ADMIN_PASSWORD\s*=\s*(.*?)\s*$/m);
  if (!match) throw new Error("先运行 npm run dev 创建本地配置。");
  const password = match[1].replace(/^(["'])(.*)\1$/, "$2");
  await api("/api/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });
  for (const photograph of [...photographs].reverse()) {
    const existing = await api(
      `/api/images?q=${encodeURIComponent(photograph.name)}`,
    );
    if (existing.images.some((image) => image.name === photograph.name)) {
      console.log(`已存在：${photograph.name}`);
      continue;
    }
    const source = `https://images.unsplash.com/${photograph.photo}?auto=format&fit=crop&w=1400&h=790&q=85&fm=jpg`;
    const response = await fetch(source, {
      signal: AbortSignal.timeout(45000),
    });
    if (!response.ok)
      throw new Error(
        `示例图片下载失败：${photograph.name} (${response.status})`,
      );
    const blob = await response.blob();
    const form = new FormData();
    form.append(
      "file",
      new Blob([blob], { type: "image/jpeg" }),
      photograph.name,
    );
    form.append("width", "1400");
    form.append("height", "790");
    const { image } = await api("/api/images", { method: "POST", body: form });
    await api(`/api/images/${image.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        description: photograph.description,
        tags: photograph.tags,
      }),
    });
    console.log(`已导入本地示例：${photograph.name}`);
  }
  console.log(
    "本地示例已准备好。生产部署不会导入这些图片。图片来自 Unsplash，来源见 docs/demo-images.md。",
  );
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  if (cookie) await api("/api/logout", { method: "POST" }).catch(() => {});
}
