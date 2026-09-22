import type { ImageRecord } from "./types";
import { getLanguage, localizeError, translate } from "./i18n";

export async function api<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const headers = new Headers(options.headers);
  if (
    options.body &&
    !(options.body instanceof FormData) &&
    !headers.has("Content-Type")
  )
    headers.set("Content-Type", "application/json");
  headers.set("Accept-Language", getLanguage() === "zh" ? "zh-CN" : "en");
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      credentials: "same-origin",
      ...options,
      headers,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError")
      throw new DOMException(
        translate("请求已取消", "Request cancelled."),
        "AbortError",
      );
    throw new Error(
      translate(
        "网络连接失败，请检查网络后重试",
        "Could not connect. Check your connection and try again.",
      ),
    );
  }
  if (response.status === 401 && path !== "/login")
    window.dispatchEvent(new Event("session-expired"));
  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error(localizeError("服务暂时不可用，请稍后重试"));
  }
  if (!response.ok) {
    throw new Error(
      localizeError(
        typeof data?.error === "string" ? data.error : "操作失败，请重试",
      ),
    );
  }
  return data as T;
}

export function formatSize(size: number) {
  if (size === 0) return "0 KB";
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`;
  if (size < 1024 ** 3) return `${(size / 1024 ** 2).toFixed(1)} MB`;
  return `${(size / 1024 ** 3).toFixed(2)} GB`;
}

export async function prepareImage(
  file: File,
): Promise<{
  width?: number;
  height?: number;
  thumbnail?: Blob;
  preview?: Blob;
}> {
  if (typeof createImageBitmap === "undefined") return {};
  let bitmap: ImageBitmap | undefined;
  try {
    const heic =
      /\.hei[cf]$/i.test(file.name) || /^image\/hei[cf]/.test(file.type);
    if (heic) {
      try {
        bitmap = await createImageBitmap(file);
      } catch {
        const { heicTo } = await import("heic-to/csp");
        bitmap = await heicTo({ blob: file, type: "bitmap" });
      }
    } else bitmap = await createImageBitmap(file);
    const { width, height } = bitmap;
    const scale = Math.min(1, 900 / Math.max(width, height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const context = canvas.getContext("2d");
    if (!context) return { width, height };
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const thumbnail = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/webp", 0.82),
    );
    let preview: Blob | undefined;
    if (heic) {
      const scale = Math.min(1, 2560 / Math.max(width, height));
      canvas.width = Math.round(width * scale);
      canvas.height = Math.round(height * scale);
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      preview =
        (await new Promise<Blob | null>((resolve) =>
          canvas.toBlob(resolve, "image/jpeg", 0.88),
        )) || undefined;
      if (preview && preview.size > 10 * 1024 * 1024)
        throw new Error("HEIC preview too large");
    }
    return {
      preview,
      width,
      height,
      ...(thumbnail?.type === "image/webp" && thumbnail.size <= 512 * 1024
        ? { thumbnail }
        : {}),
    };
  } catch (error) {
    console.warn("Image preparation failed", error);
    return {};
  } finally {
    bitmap?.close();
  }
}

export async function uploadImage(
  file: File,
  albumId: string | null,
  onProgress: (percent: number) => void,
  signal?: AbortSignal,
): Promise<ImageRecord> {
  const metadata = await prepareImage(file);
  if (signal?.aborted)
    throw new DOMException(localizeError("上传已停止"), "AbortError");
  const form = new FormData();
  form.append("file", file);
  if (albumId) form.append("albumId", albumId);
  if (metadata.width) form.append("width", String(metadata.width));
  if (metadata.height) form.append("height", String(metadata.height));
  if (metadata.preview) form.append("preview", metadata.preview, "preview.jpg");
  if (metadata.thumbnail)
    form.append("thumbnail", metadata.thumbnail, "thumbnail.webp");
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const cancel = () => xhr.abort();
    signal?.addEventListener("abort", cancel, { once: true });
    xhr.open("POST", "/api/images");
    xhr.setRequestHeader(
      "Accept-Language",
      getLanguage() === "zh" ? "zh-CN" : "en",
    );
    xhr.timeout = 180000;
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable)
        onProgress(Math.min(95, Math.round((e.loaded / e.total) * 95)));
    };
    xhr.onerror = () =>
      reject(new Error(localizeError("网络连接中断，请重新上传")));
    xhr.onabort = () =>
      reject(new DOMException(localizeError("上传已停止"), "AbortError"));
    xhr.onloadend = () => signal?.removeEventListener("abort", cancel);
    xhr.ontimeout = () =>
      reject(new Error(localizeError("上传超时，请检查图片库后重试")));
    xhr.onload = () => {
      if (signal?.aborted) {
        reject(new DOMException(localizeError("上传已停止"), "AbortError"));
        return;
      }
      let data;
      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        reject(new Error(localizeError("服务器响应异常，请重试")));
        return;
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(100);
        resolve(data.image);
      } else {
        if (xhr.status === 401)
          window.dispatchEvent(new Event("session-expired"));
        reject(
          new Error(
            localizeError(
              typeof data?.error === "string" ? data.error : "上传失败",
            ),
          ),
        );
      }
    };
    xhr.send(form);
  });
}

export async function copyText(value: string) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      throw new Error(localizeError("复制失败，请手动选择链接复制"));
    }
    return;
  }
  const area = document.createElement("textarea");
  area.value = value;
  area.style.position = "fixed";
  area.style.opacity = "0";
  document.body.appendChild(area);
  area.select();
  try {
    if (!document.execCommand("copy")) throw new Error("Copy failed");
  } catch {
    throw new Error(localizeError("复制失败，请手动选择链接复制"));
  } finally {
    area.remove();
  }
}
