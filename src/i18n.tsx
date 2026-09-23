import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type Language = "zh" | "en";
const LANGUAGE_KEY = "image-bed-language";

function preferredLanguage(): Language {
  try {
    const saved = localStorage.getItem(LANGUAGE_KEY);
    if (saved === "zh" || saved === "en") return saved;
  } catch {
    // Private browsing or storage restrictions must not prevent using the app.
  }
  return typeof navigator !== "undefined" &&
    navigator.language.toLowerCase().startsWith("zh")
    ? "zh"
    : "en";
}

let currentLanguage = preferredLanguage();

export function getLanguage(): Language {
  return currentLanguage;
}

export function translate(zh: string, en: string): string {
  return currentLanguage === "zh" ? zh : en;
}

type I18nContextValue = {
  language: Language;
  toggleLanguage: () => void;
  t: (zh: string, en: string) => string;
};

const I18nContext = createContext<I18nContextValue | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<Language>(preferredLanguage);
  const t = useCallback(
    (zh: string, en: string) => (language === "zh" ? zh : en),
    [language],
  );
  const toggleLanguage = useCallback(() => {
    const next = language === "zh" ? "en" : "zh";
    currentLanguage = next;
    setLanguage(next);
    try {
      localStorage.setItem(LANGUAGE_KEY, next);
    } catch {
      // The selected language still works for this page when storage is blocked.
    }
  }, [language]);

  useEffect(() => {
    currentLanguage = language;
    document.documentElement.lang = language === "zh" ? "zh-CN" : "en";
    document
      .querySelector('meta[name="description"]')
      ?.setAttribute(
        "content",
        t(
          "PixNest — Your images, your space. 一个部署在 Cloudflare 上的极简自托管图床。",
          "PixNest — Your images, your space. A minimal self-hosted image host on Cloudflare.",
        ),
      );
  }, [language, t]);

  useEffect(() => {
    const syncLanguage = (event: StorageEvent) => {
      if (event.key !== LANGUAGE_KEY && event.key !== null) return;
      const next = preferredLanguage();
      currentLanguage = next;
      setLanguage(next);
    };
    window.addEventListener("storage", syncLanguage);
    return () => window.removeEventListener("storage", syncLanguage);
  }, []);

  const value = useMemo(
    () => ({ language, toggleLanguage, t }),
    [language, toggleLanguage, t],
  );
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const context = useContext(I18nContext);
  if (!context) throw new Error("useI18n must be used within LanguageProvider");
  return context;
}

const errorMessages: Record<string, string> = {
  "请先配置 ADMIN_PASSWORD（至少 12 字符）和 SESSION_SECRET（至少 32 字符）":
    "Configure ADMIN_PASSWORD (at least 12 characters) and SESSION_SECRET (at least 32 characters) first.",
  请先登录: "Please sign in first.",
  "登录尝试过于频繁，请稍后再试":
    "Too many sign-in attempts. Please try again later.",
  密码格式无效: "Invalid password format.",
  密码不正确: "Incorrect password.",
  图片不存在: "Image not found.",
  相册不存在: "Album not found.",
  接口不存在: "Endpoint not found.",
  "服务暂时不可用，请稍后重试":
    "The service is temporarily unavailable. Please try again later.",
  "操作失败，请重试": "The operation failed. Please try again.",
  "单张图片须大于 0 字节且不超过 20 MB":
    "Each image must be larger than 0 bytes and no larger than 20 MB.",
  "缩略图须大于 0 字节且不超过 512 KB":
    "Thumbnails must be larger than 0 bytes and no larger than 512 KB.",
  "仅支持真实的 JPEG、PNG、WebP、GIF、HEIC 和 HEIF 图片":
    "Only valid JPEG, PNG, WebP, GIF, HEIC and HEIF images are supported.",
  图片声明格式与实际文件内容不一致:
    "The declared image format does not match the file contents.",
  "recent 参数无效": "Invalid recent parameter.",
  "请使用 multipart/form-data 上传图片":
    "Use multipart/form-data to upload images.",
  上传表单格式无效: "Invalid upload form.",
  "上传字段无效或重复，每次仅支持一张原图":
    "Invalid or duplicate upload fields. Upload one original image per request.",
  请选择图片文件: "Please choose an image file.",
  缩略图格式无效: "Invalid thumbnail format.",
  "缩略图必须是 WebP 图片": "Thumbnails must be WebP images.",
  "图片保存失败，请稍后重试":
    "The image could not be saved. Please try again later.",
  请提供需要修改的字段: "Provide at least one field to update.",
  "标签必须是数组，最多 20 个":
    "Tags must be an array with no more than 20 entries.",
  "图片已停止公开访问，但存储清理暂未完成，请重试删除":
    "The image is no longer public, but storage cleanup is incomplete. Please retry deleting it.",
  不支持此请求方法: "This request method is not supported.",
  "请求来源无效，请从图床页面重试":
    "Invalid request origin. Please try again from the image library.",
  请求内容过大: "The request is too large.",
  请求内容不能为空: "The request body cannot be empty.",
  "请使用 application/json 请求格式": "Use application/json for this request.",
  "JSON 格式无效": "Invalid JSON format.",
  请求内容必须是对象: "The request body must be an object.",
  包含未知字段: "The request contains unknown fields.",
  文件名不能包含路径或控制字符:
    "File names cannot contain paths or control characters.",
  "PUBLIC_URL 配置无效，请设置为 HTTPS 域名且不包含路径":
    "Invalid PUBLIC_URL. Use an HTTPS domain without a path.",
  上传已停止: "Upload cancelled.",
  "网络连接中断，请重新上传":
    "The connection was interrupted. Please upload again.",
  "上传超时，请检查图片库后重试":
    "The upload timed out. Check the library before retrying.",
  "服务器响应异常，请重试": "Unexpected server response. Please try again.",
  上传失败: "Upload failed.",
  "复制失败，请手动选择链接复制":
    "Could not copy the link. Please select and copy it manually.",
};

const fieldNames: Record<string, string> = {
  搜索关键词: "Search query",
  图片尺寸: "Image dimensions",
  描述: "Description",
  标签: "Tag",
  文件名: "File name",
  相册名称: "Album name",
  相册描述: "Album description",
  "Token name": "Token name",
  "相册 ID": "Album ID",
  ID: "ID",
  limit: "limit",
  offset: "offset",
};

/** Translate the Worker's validation messages without translating user content. */
const featureErrors: Record<string, string> = {
  "HEIC preview must be between 1 byte and 10 MB":
    "HEIC 预览须大于 0 字节且不超过 10 MB",
  "Invalid image URL": "图片网址无效",
  "Only public HTTP(S) image URLs are allowed":
    "仅支持公网 HTTP(S) 图片网址，不支持本机或内网地址",
  "Could not resolve image host": "无法解析图片所在的网址",
  "Too many image redirects": "图片网址跳转次数过多",
  "Could not fetch image URL": "获取图片失败，请检查网址或稍后重试",
  "Image URL request timed out": "获取图片超时，请稍后重试",
  "Invalid image dimensions or corrupt image": "图片损坏或尺寸无效",
  "HEIC conversion requires the IMAGE_PROCESSOR binding":
    "服务端 HEIC 转换尚未配置，请联系部署者启用 Images 绑定",
  "HEIC conversion failed. Check the image and Images binding.":
    "HEIC 转换失败，请检查图片或 Images 绑定配置",
  "Preview is only accepted for HEIC/HEIF": "仅 HEIC/HEIF 可附带兼容预览",
  "HEIC preview must be JPEG": "HEIC 兼容预览必须为 JPEG",
  "Invalid HEIC preview": "HEIC 兼容预览无效",
  "Image expired, already restored, or being permanently deleted":
    "图片已过期、已恢复或正在永久删除，请刷新后重试",
  "Only recycled images can be permanently deleted":
    "只有回收站中的图片可以永久删除",
  "Maximum 50 tokens": "最多可创建 50 个 Token",
  "Image not found": "图片不存在",
  "Invalid offset": "分页参数无效",
  "Invalid favorite value": "收藏状态无效",
};

export function localizeError(raw: string): string {
  if (currentLanguage === "zh" && featureErrors[raw]) return featureErrors[raw];
  if (currentLanguage === "zh") return raw;
  if (errorMessages[raw]) return errorMessages[raw];
  const fieldError = raw.match(/^(.*?)长度或格式无效（最多 (\d+) 字符）$/);
  if (fieldError && fieldNames[fieldError[1]]) {
    return `${fieldNames[fieldError[1]]} has an invalid length or format (maximum ${fieldError[2]} characters).`;
  }
  const textError = raw.match(/^(.*?)必须是文本$/);
  if (textError && fieldNames[textError[1]]) {
    return `${fieldNames[textError[1]]} must be text.`;
  }
  const formatError = raw.match(/^(.*?)(?:格式|参数)无效$/);
  if (formatError && fieldNames[formatError[1]]) {
    return `${fieldNames[formatError[1]]} is invalid.`;
  }
  return /[\u3400-\u9fff]/.test(raw)
    ? "The operation failed. Please try again."
    : raw;
}
