import QuickCopy from "./QuickCopy";
import AdvancedTools from "./AdvancedTools";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
  ArrowLeft,
  ArrowUpRight,
  Check,
  ChevronDown,
  ChevronRight,
  CloudUpload,
  Copy,
  Download,
  Ellipsis,
  Folder,
  FolderPlus,
  FolderOutput,
  Star,
  KeyRound,
  Image as ImageIcon,
  LayoutGrid,
  Link,
  List,
  LoaderCircle,
  LockKeyhole,
  LogOut,
  Plus,
  Search,
  Trash2,
  X,
  CircleAlert,
} from "lucide-react";
import { api, copyText, formatSize, uploadImage } from "./api";
import type { AlbumRecord, ImageRecord, Stats } from "./types";
import Modal from "./Modal";
import ImageViewer from "./ImageViewer";
import { useI18n } from "./i18n";
import BulkActions, {
  ImageSelectionToggle,
  SelectAllButton,
} from "./BulkActions";
import useImageSelection from "./useImageSelection";

type Notice = { message: string; error?: boolean };
type UploadItem = {
  id: string;
  name: string;
  progress: number;
  status: "waiting" | "uploading" | "done" | "error";
  error?: string;
};
const MAX_SIZE = 20 * 1024 * 1024;
function formatDate(value: string, language: "zh" | "en") {
  return new Intl.DateTimeFormat(language === "zh" ? "zh-CN" : "en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}

function LanguageToggle() {
  const { language, toggleLanguage, t } = useI18n();
  return (
    <button
      type="button"
      className="language-toggle"
      onClick={toggleLanguage}
      aria-label={t("切换为英文", "Switch to Chinese")}
      title={t("切换为英文", "Switch to Chinese")}
    >
      {language === "zh" ? "EN" : "中文"}
    </button>
  );
}

function Logo() {
  return (
    <span className="brand">
      <img src="/favicon.svg" alt="" aria-hidden="true" />
      <span>PixNest</span>
    </span>
  );
}

function Login({
  configured,
  onLogin,
}: {
  configured: boolean;
  onLogin: () => void;
}) {
  const { t } = useI18n();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/login", {
        method: "POST",
        body: JSON.stringify({ password }),
      });
      onLogin();
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="login-page">
      <header className="topbar">
        <div className="nav-inner">
          <Logo />
          <LanguageToggle />
        </div>
      </header>
      <main className="login-wrap">
        <div className="login-symbol">
          <img src="/favicon.svg" width={32} height={32} alt="" />
        </div>
        <h1>
          Your images, your space.
        </h1>
        <p className="login-intro">
          {t(
            "一个部署在 Cloudflare 上的极简自托管图床。",
            "A minimal self-hosted image host on Cloudflare.",
          )}
        </p>
        <form className="login-form" onSubmit={submit}>
          <label htmlFor="password">{t("管理密码", "Admin password")}</label>
          <div className="password-input">
            <LockKeyhole size={18} />
            <input
              id="password"
              name="password"
              type="password"
              placeholder={t("输入管理密码", "Enter your admin password")}
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoFocus
              disabled={!configured}
            />
          </div>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          {!configured && (
            <p className="form-error">
              {t(
                "图床还未完成配置，请部署者设置管理密码和会话密钥。",
                "Setup is incomplete. Set the admin password and session secret to continue.",
              )}
            </p>
          )}
          <button
            className="button primary login-submit"
            disabled={busy || !configured}
          >
            {busy ? <LoaderCircle className="spin" size={18} /> : null}
            {busy
              ? t("正在登录…", "Signing in…")
              : t("进入图片库", "Open library")}
            {!busy && <ArrowUpRight size={18} />}
          </button>
        </form>
        <div className="login-note">
          <LockKeyhole size={13} />{" "}
          {t(
            "只有你可以管理，分享由你决定",
            "Your library, your choice of what to share",
          )}
        </div>
      </main>
      <footer className="login-footer">
        {t(
          "图床 · 简单留存，自在分享",
          "Image Bed · Save simply, share freely",
        )}
      </footer>
    </div>
  );
}

function AlbumEditor({
  album,
  onClose,
  onSave,
}: {
  album?: AlbumRecord;
  onClose: () => void;
  onSave: () => void;
}) {
  const { t } = useI18n();
  const [name, setName] = useState(album?.name || "");
  const [description, setDescription] = useState(album?.description || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api(`/albums${album ? `/${album.id}` : ""}`, {
        method: album ? "PATCH" : "POST",
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim(),
        }),
      });
      onSave();
    } catch (error) {
      setError((error as Error).message);
      setBusy(false);
    }
  }
  return (
    <Modal
      label={album ? t("编辑相册", "Edit album") : t("新建相册", "New album")}
      onClose={() => !busy && onClose()}
      className="small-modal"
    >
      <div className="modal-heading">
        <div>
          <span className="eyebrow">ALBUM</span>
          <h2>
            {album
              ? t("编辑相册", "Edit album")
              : t("收集属于同一刻的图片", "Bring your images together")}
          </h2>
        </div>
        <button
          className="icon-button"
          aria-label={t("关闭", "Close")}
          onClick={onClose}
          disabled={busy}
        >
          <X size={20} />
        </button>
      </div>
      <form onSubmit={submit}>
        <label className="field">
          {t("相册名称", "Album name")}
          <input
            data-autofocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("例如：山野之间", "For example: Into the mountains")}
            maxLength={80}
            required
          />
        </label>
        <label className="field">
          {t("描述", "Description")}{" "}
          <span className="optional">{t("选填", "Optional")}</span>
          <textarea
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t(
              "给这个相册写点什么…",
              "Write something about this album…",
            )}
            maxLength={500}
          />
        </label>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="modal-footer">
          <button
            className="button secondary"
            type="button"
            onClick={onClose}
            disabled={busy}
          >
            {t("取消", "Cancel")}
          </button>
          <button className="button primary" disabled={busy || !name.trim()}>
            {busy && <LoaderCircle className="spin" size={16} />}
            {album
              ? t("保存修改", "Save changes")
              : t("创建相册", "Create album")}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function ConfirmDelete({
  removal = false,
  permanent = false,
  title,
  description,
  onClose,
  onConfirm,
}: {
  title: string;
  removal?: boolean;
  permanent?: boolean;
  description: string;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <Modal
      label={title}
      onClose={() => !busy && onClose()}
      className="small-modal confirm-modal"
    >
      <div className={removal ? "remove-symbol" : "delete-symbol"}>
        {removal ? <FolderOutput size={22} /> : <Trash2 size={22} />}
      </div>
      <h2>{title}</h2>
      <p>{description}</p>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="modal-footer">
        <button className="button secondary" onClick={onClose} disabled={busy}>
          {t("取消", "Cancel")}
        </button>
        <button
          className={`button ${removal ? "primary" : "danger"}`}
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await onConfirm();
            } catch (error) {
              setError((error as Error).message);
              setBusy(false);
            }
          }}
        >
          {busy
            ? t("正在处理…", "Processing…")
            : removal
              ? t("移出相册", "Remove from album")
              : permanent
                ? t("删除", "Delete")
                : t("确认删除", "Delete")}
        </button>
      </div>
    </Modal>
  );
}

function ImageDetail({
  albumName,
  image,
  albums,
  onClose,
  onSaved,
  onDelete,
  notify,
}: {
  image: ImageRecord;
  albumName?: string;
  albums: AlbumRecord[];
  onClose: () => void;
  onSaved: (image: ImageRecord) => void;
  onDelete: () => Promise<void>;
  notify: (message: string, error?: boolean) => void;
}) {
  const { language, t } = useI18n();
  const [name, setName] = useState(image.name);
  const [description, setDescription] = useState(image.description);
  const [tags, setTags] = useState(image.tags.join(", "));
  const [albumId, setAlbumId] = useState(image.albumId || "");
  const [format, setFormat] = useState<"url" | "markdown" | "html">("url");
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState("");
  const escapedName = image.name.replace(/[\\\[\]]/g, "\\$&");
  const htmlName = image.name
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  const value =
    format === "url"
      ? image.url
      : format === "markdown"
        ? `![${escapedName}](${image.url})`
        : `<img src="${image.url}" alt="${htmlName}" />`;
  const dirty =
    name !== image.name ||
    description !== image.description ||
    tags !== image.tags.join(", ") ||
    albumId !== (image.albumId || "");
  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const data = await api<{ image: ImageRecord }>(`/images/${image.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: name.trim(),
          description,
          tags: tags
            .split(/[,，]/)
            .map((t) => t.trim())
            .filter(Boolean),
          albumId: albumId || null,
        }),
      });
      onSaved(data.image);
      setName(data.image.name);
      setDescription(data.image.description);
      setAlbumId(data.image.albumId || "");
      setTags(data.image.tags.join(", "));
      notify(t("图片信息已保存", "Image details saved"));
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (confirm)
    return (
      <ConfirmDelete
        removal={!!albumName}
        permanent={false}
        title={
          albumName
            ? t(`移出「${albumName}」？`, `Remove from “${albumName}”?`)
            : t("将这张图片移入回收站？", "Move this image to the recycle bin?")
        }
        description={
          albumName
            ? t(
                "图片仍保留在图片库中，已有链接不受影响。",
                "The image remains in your library. Existing links are unaffected.",
              )
            : t(
                "图片将在回收站保留 30 天，期间可恢复，原链接仍有效。",
                "The image is kept for 30 days in the recycle bin. You can restore it; existing links remain valid.",
              )
        }
        onClose={() => setConfirm(false)}
        onConfirm={onDelete}
      />
    );
  return (
    <Modal
      label={t(`图片详情：${image.name}`, `Image details: ${image.name}`)}
      className="detail-modal"
      onClose={() => !busy && onClose()}
    >
      <div className="detail-preview">
        <img src={image.url} alt={image.description || image.name} />
        <a
          href={image.url}
          target="_blank"
          rel="noreferrer"
          className="original-link"
        >
          {t("查看原图", "View original")} <ArrowUpRight size={14} />
        </a>
      </div>
      <section className="detail-panel">
        <div className="detail-heading">
          <h2>{t("图片详情", "Image details")}</h2>
          <button
            className="icon-button"
            data-autofocus
            aria-label={t("关闭详情", "Close details")}
            onClick={onClose}
            disabled={busy}
          >
            <X size={21} />
          </button>
        </div>
        <div className="image-metadata">
          <span>{image.mime.split("/")[1].toUpperCase()}</span>
          <span>{formatSize(image.size)}</span>
          <span>
            {image.width && image.height
              ? `${image.width} × ${image.height}`
              : image.mime.split("/")[1].toUpperCase()}
          </span>
          <span>{formatDate(image.createdAt, language)}</span>
        </div>
        <form onSubmit={save}>
          <label className="field">
            {t("文件名", "File name")}
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={200}
            />
          </label>
          <label className="field">
            {t("相册", "Album")}
            <select
              value={albumId}
              onChange={(e) => setAlbumId(e.target.value)}
            >
              <option value="">{t("未归入相册", "No album")}</option>
              {albums.map((album) => (
                <option key={album.id} value={album.id}>
                  {album.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            {t("标签", "Tags")}
            <input
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder={t(
                "用逗号分隔，例如：风景, 旅行",
                "Separate with commas, e.g. landscape, travel",
              )}
              maxLength={500}
            />
          </label>
          <label className="field">
            {t("描述", "Description")}
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t(
                "记录这张图片的故事…",
                "Tell the story behind this image…",
              )}
              rows={2}
              maxLength={2000}
            />
          </label>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <button
            className="button secondary save-button"
            disabled={!dirty || busy}
          >
            {busy ? t("正在保存…", "Saving…") : t("保存修改", "Save changes")}
          </button>
        </form>
        <div className="share-section">
          <h3>{t("分享图片", "Share image")}</h3>
          <div
            className="format-tabs"
            aria-label={t("链接格式", "Link format")}
          >
            {(
              [
                ["url", t("直链", "Direct URL")],
                ["markdown", "Markdown"],
                ["html", "HTML"],
              ] as const
            ).map(([key, text]) => (
              <button
                key={key}
                className={format === key ? "active" : ""}
                onClick={() => setFormat(key)}
                aria-pressed={format === key}
              >
                {text}
              </button>
            ))}
          </div>
          <div className="copy-field">
            <input
              aria-label={t("图片分享链接", "Image share link")}
              readOnly
              value={value}
              onFocus={(e) => e.target.select()}
            />
            <button
              className="icon-button"
              aria-label={t("复制分享链接", "Copy share link")}
              onClick={async () => {
                try {
                  await copyText(value);
                  notify(t("链接已复制", "Link copied"));
                } catch (error) {
                  notify((error as Error).message, true);
                }
              }}
            >
              <Copy size={17} />
            </button>
          </div>
          <p className="share-note">
            {t(
              "持有链接的人均可查看图片",
              "Anyone with the link can view this image",
            )}
          </p>
        </div>
        <div className="detail-actions">
          <button
            className="icon-button"
            aria-label={
              image.favorite
                ? t("取消收藏", "Unfavorite")
                : t("收藏", "Favorite")
            }
            aria-pressed={!!image.favorite}
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                const data = await api<{ image: ImageRecord }>(
                  `/images/${image.id}`,
                  {
                    method: "PATCH",
                    body: JSON.stringify({ favorite: !image.favorite }),
                  },
                );
                onSaved(data.image);
              } catch (e) {
                notify((e as Error).message, true);
              } finally {
                setBusy(false);
              }
            }}
          >
            <Star size={18} fill={image.favorite ? "currentColor" : "none"} />
          </button>
          <a
            className="button secondary"
            href={`${image.originalUrl || image.url}?download=1`}
            download={image.name}
          >
            <Download size={16} /> {t("下载原图", "Download original")}
          </a>
          <button
            className={`icon-button ${albumName ? "" : "delete-button"}`}
            title={
              albumName
                ? t("移出相册", "Remove from album")
                : t("删除", "Delete")
            }
            aria-label={
              albumName
                ? t("移出相册", "Remove from album")
                : t("删除", "Delete")
            }
            onClick={() => setConfirm(true)}
          >
            {albumName ? <FolderOutput size={18} /> : <Trash2 size={18} />}
          </button>
        </div>
      </section>
    </Modal>
  );
}

export default function App() {
  const { language, t } = useI18n();
  const [session, setSession] = useState<{
    authenticated: boolean;
    configured: boolean;
  } | null>(null);
  const [bootError, setBootError] = useState("");
  const [page, setPage] = useState<"library" | "albums">("library");
  const [advanced, setAdvanced] = useState<"trash" | "tokens" | "url" | null>(
    null,
  );
  const [uploadMenu, setUploadMenu] = useState(false);
  const [activeAlbum, setActiveAlbum] = useState<AlbumRecord | null>(null);
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [recent, setRecent] = useState(false);
  const [view, setView] = useState<"grid" | "list">(() =>
    localStorage.getItem("gallery-view") === "list" ? "list" : "grid",
  );
  const [images, setImages] = useState<ImageRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [albums, setAlbums] = useState<AlbumRecord[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [listError, setListError] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [selected, setSelected] = useState<ImageRecord | null>(null);
  const [albumEditor, setAlbumEditor] = useState<AlbumRecord | "new" | null>(
    null,
  );
  const [deleteAlbum, setDeleteAlbum] = useState<AlbumRecord | null>(null);
  const [profile, setProfile] = useState(false);
  const [albumMenu, setAlbumMenu] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);
  const requestVersion = useRef(0);
  const uploadLock = useRef(false);
  const uploadAbort = useRef<AbortController | null>(null);
  const viewerTrigger = useRef<{
    element: HTMLButtonElement;
    id: string;
  } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const notify = useCallback((message: string, error = false) => {
    setNotice({ message, error });
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setNotice(null), error ? 6000 : 3200);
  }, []);
  const reload = useCallback(() => setRefresh((value) => value + 1), []);
  const openImage = (image: ImageRecord, element: HTMLButtonElement) => {
    viewerTrigger.current = { element, id: image.id };
    setSelected(image);
  };
  useEffect(() => {
    if (selected || loading || !viewerTrigger.current) return;
    const frame = requestAnimationFrame(() => {
      const trigger = viewerTrigger.current;
      if (!trigger) return;
      const target = trigger.element.isConnected
        ? trigger.element
        : document.querySelector<HTMLButtonElement>(
            `[data-viewer-trigger="${trigger.id}"]`,
          ) ||
          document.querySelector<HTMLButtonElement>("[data-viewer-trigger]") ||
          document.querySelector<HTMLButtonElement>(
            ".upload-button:not(:disabled)",
          );
      target?.focus({ preventScroll: true });
      viewerTrigger.current = null;
    });
    return () => cancelAnimationFrame(frame);
  }, [selected, loading]);
  const showLibrary = page === "library" || !!activeAlbum;
  const canUpload = page === "library" && !activeAlbum;
  const uploadBusy = uploads.some(
    (item) => item.status === "waiting" || item.status === "uploading",
  );
  const imageSelection = useImageSelection({
    scope: `${page}:${activeAlbum?.id || ""}:${recent}:${search}`,
    enabled: !!session?.authenticated && showLibrary,
    search,
    recent,
    albumId: activeAlbum?.id,
    reload,
    notify,
  });
  const checkSession = useCallback(() => {
    setBootError("");
    api<{ authenticated: boolean; configured: boolean }>("/session")
      .then(setSession)
      .catch((error) => setBootError(error.message));
  }, []);
  useEffect(() => {
    checkSession();
    const expired = () => {
      uploadAbort.current?.abort();
      setUploads([]);
      setSession((s) => (s ? { ...s, authenticated: false } : s));
      setSelected(null);
      setImages([]);
      setAlbums([]);
    };
    window.addEventListener("session-expired", expired);
    return () => window.removeEventListener("session-expired", expired);
  }, [checkSession]);
  useEffect(() => {
    const timeout = setTimeout(() => setSearch(query.trim()), 260);
    return () => clearTimeout(timeout);
  }, [query]);
  useEffect(() => {
    localStorage.setItem("gallery-view", view);
  }, [view]);
  useEffect(() => {
    document.title = `PixNest · ${activeAlbum?.name || (page === "albums" ? t("相册", "Albums") : t("图片库", "Library"))}`;
  }, [page, activeAlbum, t]);
  useEffect(() => {
    if (!profile && !albumMenu) return;
    const close = () => {
      setProfile(false);
      setAlbumMenu(false);
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    document.addEventListener("click", close);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("click", close);
      document.removeEventListener("keydown", key);
    };
  }, [profile, albumMenu]);

  useEffect(() => {
    if (!session?.authenticated) return;
    const abort = new AbortController();
    Promise.all([
      api<{ albums: AlbumRecord[] }>("/albums", { signal: abort.signal }),
      api<Stats>("/stats", { signal: abort.signal }),
    ])
      .then(([data, info]) => {
        setAlbums(data.albums);
        setStats(info);
        setActiveAlbum((current) =>
          current
            ? data.albums.find((album) => album.id === current.id) || null
            : null,
        );
      })
      .catch((error) => {
        if (error.name !== "AbortError") notify(error.message, true);
      });
    return () => abort.abort();
  }, [session?.authenticated, refresh, notify]);
  useEffect(() => {
    if (!session?.authenticated) return;
    const abort = new AbortController();
    const version = ++requestVersion.current;
    setLoading(true);
    setLoadingMore(false);
    setListError("");
    const params = new URLSearchParams({ q: search, limit: "48", offset: "0" });
    if (recent) params.set("recent", "1");
    if (activeAlbum) params.set("albumId", activeAlbum.id);
    api<{ images: ImageRecord[]; total: number }>(`/images?${params}`, {
      signal: abort.signal,
    })
      .then((data) => {
        if (version === requestVersion.current) {
          setImages(data.images);
          setTotal(data.total);
        }
      })
      .catch((error) => {
        if (error.name !== "AbortError") setListError(error.message);
      })
      .finally(() => {
        if (version === requestVersion.current) setLoading(false);
      });
    return () => abort.abort();
  }, [session?.authenticated, search, recent, activeAlbum?.id, refresh]);

  const beginUpload = useCallback(
    async (files: File[]) => {
      if (!files.length) return;
      if (uploadLock.current) {
        notify(
          t(
            "当前上传完成后，就可以继续添加图片",
            "You can add more images once the current upload finishes.",
          ),
          true,
        );
        return;
      }
      if (files.length > 50) {
        notify(
          t(
            "每批最多上传 50 张图片，请分批添加",
            "Upload up to 50 images at a time.",
          ),
          true,
        );
        return;
      }
      const queue = files.map((file) => ({ file, id: crypto.randomUUID() }));
      uploadLock.current = true;
      const controller = new AbortController();
      uploadAbort.current = controller;
      setUploads(
        queue.map(({ file, id }) => ({
          id,
          name: file.name,
          progress: 0,
          status: "waiting",
        })),
      );
      let done = 0;
      let next = 0;
      const patch = (id: string, data: Partial<UploadItem>) =>
        setUploads((current) =>
          current.map((item) => (item.id === id ? { ...item, ...data } : item)),
        );
      const worker = async () => {
        while (next < queue.length && !controller.signal.aborted) {
          const { file, id } = queue[next++];
          try {
            if (
              ![
                "image/jpeg",
                "image/png",
                "image/webp",
                "image/gif",
                "image/heic",
                "image/heif",
              ].includes(file.type) &&
              !/\.hei[cf]$/i.test(file.name)
            )
              throw new Error(
                t(
                  "仅支持 JPG、PNG、WebP、GIF、HEIC 和 HEIF",
                  "Only JPG, PNG, WebP, GIF, HEIC and HEIF are supported.",
                ),
              );
            if (file.size > MAX_SIZE)
              throw new Error(t("图片超过 20 MB", "Image exceeds 20 MB."));
            if (!file.size)
              throw new Error(t("图片文件为空", "The image file is empty."));
            patch(id, { status: "uploading" });
            await uploadImage(
              file,
              activeAlbum?.id || null,
              (progress) => patch(id, { progress }),
              controller.signal,
            );
            patch(id, { status: "done", progress: 100 });
            done++;
          } catch (error) {
            patch(id, { status: "error", error: (error as Error).message });
          }
        }
      };
      try {
        await Promise.all(
          Array.from(
            {
              length: Math.min(
                queue.some(
                  (item) =>
                    item.file.size > 8 * 1024 * 1024 ||
                    /\.hei[cf]$/i.test(item.file.name),
                )
                  ? 1
                  : 3,
                queue.length,
              ),
            },
            worker,
          ),
        );
      } finally {
        uploadLock.current = false;
        uploadAbort.current = null;
        reload();
      }
      if (controller.signal.aborted) return;
      if (done)
        notify(
          done === queue.length
            ? t(
                `${done} 张图片已上传`,
                `${done} ${done === 1 ? "image" : "images"} uploaded`,
              )
            : t(
                `${done} 张已上传，${queue.length - done} 张未完成`,
                `${done} uploaded, ${queue.length - done} incomplete`,
              ),
          done !== queue.length,
        );
    },
    [activeAlbum?.id, notify, reload, t],
  );
  useEffect(() => {
    if (!session?.authenticated || !canUpload) return;
    const paste = (event: ClipboardEvent) => {
      if (
        (event.target as HTMLElement)?.closest(
          'input, textarea, [contenteditable="true"]',
        ) ||
        selected ||
        albumEditor ||
        deleteAlbum ||
        imageSelection.dialog ||
        advanced
      )
        return;
      const files = Array.from(event.clipboardData?.files || []).filter(
        (file) => file.type.startsWith("image/"),
      );
      if (files.length) {
        event.preventDefault();
        void beginUpload(files);
      }
    };
    window.addEventListener("paste", paste);
    return () => window.removeEventListener("paste", paste);
  }, [
    session?.authenticated,
    beginUpload,
    advanced,
    canUpload,
    selected,
    albumEditor,
    deleteAlbum,
    imageSelection.dialog,
  ]);

  async function loadMore() {
    const version = requestVersion.current;
    setLoadingMore(true);
    const params = new URLSearchParams({
      q: search,
      limit: "48",
      offset: String(images.length),
    });
    if (recent) params.set("recent", "1");
    if (activeAlbum) params.set("albumId", activeAlbum.id);
    try {
      const data = await api<{ images: ImageRecord[]; total: number }>(
        `/images?${params}`,
      );
      if (version === requestVersion.current) {
        setImages((current) => [
          ...current,
          ...data.images.filter(
            (image) => !current.some((existing) => existing.id === image.id),
          ),
        ]);
        setTotal(data.total);
      }
    } catch (error) {
      notify((error as Error).message, true);
    } finally {
      if (version === requestVersion.current) setLoadingMore(false);
    }
  }
  function navigate(target: "library" | "albums") {
    setPage(target);
    setActiveAlbum(null);
    setQuery("");
    setSearch("");
    setRecent(false);
    setAlbumMenu(false);
  }
  function matchesImageFilter(image: ImageRecord) {
    const needle = search.toLowerCase();
    return (
      (!activeAlbum || image.albumId === activeAlbum.id) &&
      (!recent ||
        new Date(image.createdAt).getTime() >=
          Date.now() - 7 * 24 * 60 * 60 * 1000) &&
      (!needle ||
        [image.name, image.description, ...image.tags].some((value) =>
          value.toLowerCase().includes(needle),
        ))
    );
  }

  if (!session)
    return (
      <div className="boot-state">
        <Logo />
        {bootError ? (
          <>
            <p role="alert">{bootError}</p>
            <button className="button secondary" onClick={checkSession}>
              {t("重新连接", "Reconnect")}
            </button>
          </>
        ) : (
          <LoaderCircle className="spin" size={24} />
        )}
      </div>
    );
  if (!session.authenticated)
    return (
      <Login
        configured={session.configured}
        onLogin={() => {
          setSession({ configured: true, authenticated: true });
          reload();
        }}
      />
    );
  const filteredAlbums = albums.filter((album) =>
    `${album.name} ${album.description}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );

  return (
    <div
      className={`app ${imageSelection.ids.size || imageSelection.collecting ? "has-bulk-selection" : ""}`}
      onDragEnter={(event) => {
        if (event.dataTransfer.types.includes("Files")) {
          event.preventDefault();
          if (!canUpload) return;
          dragDepth.current++;
          setDragging(true);
        }
      }}
      onDragOver={(event) => {
        if (event.dataTransfer.types.includes("Files")) event.preventDefault();
      }}
      onDragLeave={(event) => {
        event.preventDefault();
        if (--dragDepth.current <= 0) {
          dragDepth.current = 0;
          setDragging(false);
        }
      }}
      onDrop={(event) => {
        event.preventDefault();
        dragDepth.current = 0;
        setDragging(false);
        if (
          canUpload &&
          !selected &&
          !albumEditor &&
          !deleteAlbum &&
          !imageSelection.dialog &&
          !advanced
        )
          void beginUpload(Array.from(event.dataTransfer.files));
      }}
    >
      <header className="topbar">
        <div className="nav-inner">
          <button
            className="brand-button"
            aria-label={t("PixNest 首页", "PixNest home")}
            onClick={() => navigate("library")}
          >
            <Logo />
          </button>
          <nav className="main-nav" aria-label={t("主导航", "Main navigation")}>
            <button
              className={page === "library" ? "active" : ""}
              aria-current={page === "library" ? "page" : undefined}
              onClick={() => navigate("library")}
            >
              {t("图片库", "Library")}
            </button>
            <button
              className={page === "albums" ? "active" : ""}
              aria-current={page === "albums" ? "page" : undefined}
              onClick={() => navigate("albums")}
            >
              {t("相册", "Albums")}
            </button>
          </nav>
          <LanguageToggle />
          <div className="profile-wrap">
            <button
              className={`profile-button ${profile ? "open" : ""}`}
              aria-label={t("账户菜单", "Account menu")}
              aria-expanded={profile}
              onClick={(event) => {
                event.stopPropagation();
                setProfile(!profile);
              }}
            >
              <span className="avatar">
                <img
                  src="/avatar.svg"
                  alt={t("默认笑脸头像", "Default smile avatar")}
                />
              </span>
              <ChevronDown size={14} />
            </button>
            {profile && (
              <div
                className="dropdown profile-menu"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="profile-info">
                  <strong>{t("我的图床", "My Image Bed")}</strong>
                  <span>
                    {stats
                      ? t(
                          `${stats.totalImages} 张图片 · ${formatSize(stats.totalBytes)}`,
                          `${stats.totalImages} ${stats.totalImages === 1 ? "image" : "images"} · ${formatSize(stats.totalBytes)}`,
                        )
                      : t("正在读取存储信息…", "Loading storage usage…")}
                  </span>
                </div>
                <button
                  onClick={() => {
                    setAdvanced("trash");
                    setProfile(false);
                  }}
                >
                  <Trash2 size={16} />
                  {t("回收站", "Recycle bin")}
                </button>
                <button
                  onClick={() => {
                    setAdvanced("tokens");
                    setProfile(false);
                  }}
                >
                  <KeyRound size={16} />
                  {t("API Token 管理", "API tokens")}
                </button>
                <button
                  onClick={async () => {
                    if (uploadBusy) {
                      notify(
                        t(
                          "请等待上传完成后再退出",
                          "Please wait for uploads to finish before signing out.",
                        ),
                        true,
                      );
                      return;
                    }
                    try {
                      await api("/logout", { method: "POST" });
                      setSession({ ...session, authenticated: false });
                      setProfile(false);
                      setImages([]);
                      setAlbums([]);
                      setUploads([]);
                    } catch (error) {
                      notify((error as Error).message, true);
                    }
                  }}
                >
                  <LogOut size={16} /> {t("退出登录", "Sign out")}
                </button>
              </div>
            )}
          </div>
        </div>
      </header>
      <main
        className={`main-container ${showLibrary ? "image-library" : ""} ${activeAlbum ? "album-gallery" : ""}`}
      >
        {activeAlbum && (
          <button
            className="breadcrumb"
            onClick={() => {
              setActiveAlbum(null);
              setQuery("");
              setSearch("");
              setRecent(false);
            }}
          >
            <ArrowLeft size={15} /> {t("返回相册", "Back to albums")}{" "}
            <ChevronRight size={13} />
            <span>{activeAlbum.name}</span>
          </button>
        )}
        <section className="page-heading">
          <div className="heading-text">
            <h1>
              {activeAlbum?.name ||
                (page === "albums"
                  ? t("相册", "Albums")
                  : t("图片库", "Library"))}
            </h1>
            <p>
              {activeAlbum
                ? activeAlbum.description ||
                  t("把相关的图片，收藏在一起", "Keep related images together.")
                : page === "albums"
                  ? t(
                      "把每一份灵感，整理成册",
                      "An album for every inspiration.",
                    )
                  : t(
                      "上传、管理与分享你的图片",
                      "Upload, organize and share your images.",
                    )}
            </p>
          </div>
          <div className="heading-actions">
            <div className="search-field">
              <Search size={21} strokeWidth={1.6} />
              <input
                aria-label={
                  showLibrary
                    ? t("搜索图片", "Search images")
                    : t("搜索相册", "Search albums")
                }
                maxLength={200}
                placeholder={
                  showLibrary
                    ? t(
                        "搜索图片文件名、标签或描述",
                        "Search image names, tags or descriptions",
                      )
                    : t(
                        "搜索相册名称或描述",
                        "Search album names or descriptions",
                      )
                }
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
              {query && (
                <button
                  className="clear-search"
                  aria-label={t("清空搜索", "Clear search")}
                  onClick={() => setQuery("")}
                >
                  <X size={15} />
                </button>
              )}
            </div>
            {canUpload ? (
              <div className="upload-menu-wrap">
                <button
                  className="button primary upload-button"
                  onClick={() => setUploadMenu(!uploadMenu)}
                  aria-expanded={uploadMenu}
                  disabled={uploadBusy}
                >
                  <Plus size={20} strokeWidth={1.8} />
                  <span>{t("上传图片", "Upload images")}</span>
                  <ChevronDown size={14} />
                </button>
                {uploadMenu && (
                  <div className="dropdown">
                    <button
                      onClick={() => {
                        setUploadMenu(false);
                        fileInput.current?.click();
                      }}
                    >
                      {t("选择文件", "Choose files")}
                    </button>
                    <button
                      onClick={() => {
                        setUploadMenu(false);
                        setAdvanced("url");
                      }}
                    >
                      {t("从网址上传", "Upload from URL")}
                    </button>
                  </div>
                )}
              </div>
            ) : !activeAlbum ? (
              <button
                className="button primary upload-button"
                onClick={() => setAlbumEditor("new")}
              >
                <Plus size={20} />
                <span>{t("新建相册", "New album")}</span>
              </button>
            ) : null}
          </div>
        </section>
        {canUpload && (
          <input
            ref={fileInput}
            type="file"
            className="visually-hidden"
            accept="image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif,.heic,.heif"
            multiple
            tabIndex={-1}
            aria-label={t("选择要上传的图片", "Choose images to upload")}
            onChange={(event) => {
              void beginUpload(Array.from(event.target.files || []));
              event.target.value = "";
            }}
          />
        )}
        {canUpload && (
          <button
            className={`dropzone ${dragging ? "dragging" : ""}`}
            onClick={() => fileInput.current?.click()}
            disabled={uploadBusy}
          >
            <CloudUpload size={34} strokeWidth={1.5} />
            <strong>
              {uploadBusy
                ? t("图片正在上传，请稍候", "Uploading images. Please wait…")
                : dragging
                  ? t("松开鼠标，开始上传", "Drop to upload")
                  : t("拖拽图片到这里", "Drag images here")}
            </strong>
            <span>
              {t("或点击选择文件", "or click to choose files")}
              <span className="separator"> · </span>
              {t("JPG、PNG、WebP、GIF、HEIC", "JPG, PNG, WebP, GIF, HEIC")}
              <span className="separator"> · </span>
              {t("最大 20 MB", "Up to 20 MB")}
            </span>
          </button>
        )}
        <div className="library-toolbar">
          <div
            className="filter-tabs"
            role="group"
            aria-label={
              showLibrary
                ? t("图片筛选", "Image filters")
                : t("相册筛选", "Album filters")
            }
          >
            {showLibrary ? (
              <>
                <button
                  className={!recent ? "active" : ""}
                  aria-pressed={!recent}
                  onClick={() => setRecent(false)}
                >
                  {t("全部图片", "All images")}
                </button>
                <button
                  className={recent ? "active" : ""}
                  aria-pressed={recent}
                  onClick={() => setRecent(true)}
                  title={t(
                    "最近 7 天上传的图片",
                    "Images uploaded in the last 7 days",
                  )}
                >
                  {t("最近上传", "Recent uploads")}
                </button>
              </>
            ) : (
              <button className="active">{t("全部相册", "All albums")}</button>
            )}
          </div>
          <div className="toolbar-right">
            {showLibrary && (
              <SelectAllButton
                selection={imageSelection}
                total={total}
                disabled={loading || !!listError}
              />
            )}
            <span className="result-count" aria-live="polite">
              {showLibrary
                ? t(
                    `${loading ? "…" : total} 张图片`,
                    `${loading ? "…" : total} ${total === 1 ? "image" : "images"}`,
                  )
                : t(
                    `${filteredAlbums.length} 个相册`,
                    `${filteredAlbums.length} ${filteredAlbums.length === 1 ? "album" : "albums"}`,
                  )}
            </span>
            {showLibrary && (
              <div
                className="view-switch"
                role="group"
                aria-label={t("显示方式", "Display mode")}
              >
                <button
                  className={view === "grid" ? "active" : ""}
                  aria-label={t("网格视图", "Grid view")}
                  aria-pressed={view === "grid"}
                  onClick={() => setView("grid")}
                >
                  <LayoutGrid size={19} />
                </button>
                <button
                  className={view === "list" ? "active" : ""}
                  aria-label={t("列表视图", "List view")}
                  aria-pressed={view === "list"}
                  onClick={() => setView("list")}
                >
                  <List size={20} />
                </button>
              </div>
            )}
            {activeAlbum && (
              <div className="album-menu-wrap">
                <button
                  className="icon-button"
                  aria-label={t("相册选项", "Album options")}
                  aria-expanded={albumMenu}
                  onClick={(event) => {
                    event.stopPropagation();
                    setAlbumMenu(!albumMenu);
                  }}
                >
                  <Ellipsis size={21} />
                </button>
                {albumMenu && (
                  <div className="dropdown album-options">
                    <button onClick={() => setAlbumEditor(activeAlbum)}>
                      {t("编辑相册", "Edit album")}
                    </button>
                    <button
                      className="text-danger"
                      onClick={() => setDeleteAlbum(activeAlbum)}
                    >
                      {t("删除相册", "Delete album")}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
        {showLibrary ? (
          <>
            <BulkActions
              albumName={activeAlbum?.name}
              selection={imageSelection}
              albums={albums}
              onAlbumCreated={(album) => {
                setAlbums((current) => [album, ...current]);
              }}
            />
            {listError ? (
              <div className="empty-state">
                <CircleAlert size={32} />
                <h2>{t("图片暂时没有加载出来", "Unable to load images")}</h2>
                <p>{listError}</p>
                <button className="button secondary" onClick={reload}>
                  {t("重新加载", "Reload")}
                </button>
              </div>
            ) : loading ? (
              <div
                className="image-grid"
                aria-label={t("正在加载图片", "Loading images")}
                aria-busy="true"
              >
                {Array.from({ length: 8 }, (_, i) => (
                  <div className="skeleton-card" key={i}>
                    <div />
                    <span />
                    <span />
                  </div>
                ))}
              </div>
            ) : images.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">
                  <ImageIcon size={30} strokeWidth={1.3} />
                </div>
                <h2>
                  {search
                    ? t("没有找到相关图片", "No matching images")
                    : recent
                      ? t("最近还没有上传图片", "No recent uploads")
                      : activeAlbum
                        ? t(
                            "相册里的第一张，由你来选",
                            "Choose the first image for this album",
                          )
                        : t("从第一张图片开始", "Start with your first image")}
                </h2>
                <p>
                  {search
                    ? t(
                        "试试其他文件名、标签或描述",
                        "Try a different file name, tag or description.",
                      )
                    : activeAlbum
                      ? t(
                          "在图片库中选择图片，然后移动到这个相册。",
                          "Select images in the library, then move them into this album.",
                        )
                      : t(
                          "拖入图片，或从设备中选择；也可以直接粘贴截图。",
                          "Drop images, choose files from your device, or paste a screenshot.",
                        )}
                </p>
                {search ? (
                  <button
                    className="button secondary"
                    onClick={() => setQuery("")}
                  >
                    {t("清空搜索", "Clear search")}
                  </button>
                ) : (
                  <button
                    className="button secondary"
                    onClick={() =>
                      activeAlbum
                        ? navigate("library")
                        : fileInput.current?.click()
                    }
                  >
                    {activeAlbum ? (
                      t("前往图片库", "Go to library")
                    ) : (
                      <>
                        <Plus size={16} /> {t("上传图片", "Upload images")}
                      </>
                    )}
                  </button>
                )}
              </div>
            ) : view === "grid" ? (
              <div
                className={`image-grid ${imageSelection.ids.size ? "is-selecting" : ""}`}
              >
                {images.map((image) => (
                  <article
                    className={`image-card ${imageSelection.ids.has(image.id) ? "is-selected" : ""}`}
                    key={image.id}
                    onClickCapture={(event) => {
                      if (!imageSelection.ids.size) return;
                      event.preventDefault();
                      event.stopPropagation();
                      if (!imageSelection.busy && !imageSelection.collecting)
                        imageSelection.toggle(image.id);
                    }}
                  >
                    <ImageSelectionToggle
                      id={image.id}
                      name={image.name}
                      selection={imageSelection}
                    />
                    <button
                      className="image-open"
                      aria-label={t(`查看 ${image.name}`, `View ${image.name}`)}
                      data-viewer-trigger={image.id}
                      onClick={(event) => openImage(image, event.currentTarget)}
                    >
                      <img
                        src={image.thumbnailUrl}
                        alt={image.description || image.name}
                        loading="lazy"
                        decoding="async"
                      />
                      <span className="preview-hint">
                        {t("查看图片", "View image")} <ArrowUpRight size={14} />
                      </span>
                    </button>
                    <div className="card-info">
                      <button
                        className="card-name"
                        data-viewer-trigger={image.id}
                        onClick={(event) =>
                          openImage(image, event.currentTarget)
                        }
                        title={image.name}
                      >
                        {image.name}
                      </button>
                      <span className="file-size">
                        {formatSize(image.size)}
                      </span>
                      <QuickCopy image={image} notify={notify} />
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="image-list has-selection">
                <div className="list-header">
                  <span className="list-selection-space" aria-hidden="true" />
                  <span>{t("文件名", "File name")}</span>
                  <span>{t("大小", "Size")}</span>
                  <span>{t("上传日期", "Uploaded")}</span>
                  <span>{t("操作", "Actions")}</span>
                </div>
                {images.map((image) => (
                  <article
                    className={`list-row ${imageSelection.ids.has(image.id) ? "is-selected" : ""}`}
                    key={image.id}
                    onClickCapture={(event) => {
                      if (!imageSelection.ids.size) return;
                      event.preventDefault();
                      event.stopPropagation();
                      if (!imageSelection.busy && !imageSelection.collecting)
                        imageSelection.toggle(image.id);
                    }}
                  >
                    <ImageSelectionToggle
                      id={image.id}
                      name={image.name}
                      selection={imageSelection}
                      list
                    />
                    <button
                      className="list-file"
                      data-viewer-trigger={image.id}
                      onClick={(event) => openImage(image, event.currentTarget)}
                    >
                      <img src={image.thumbnailUrl} alt="" loading="lazy" />
                      <span>
                        <strong>{image.name}</strong>
                        <small>
                          {image.tags.length
                            ? image.tags.join(" · ")
                            : image.mime.split("/")[1].toUpperCase()}
                        </small>
                      </span>
                    </button>
                    <span className="list-size">{formatSize(image.size)}</span>
                    <span className="list-date">
                      {formatDate(image.createdAt, language)}
                    </span>
                    <QuickCopy image={image} notify={notify} variant="list" />
                  </article>
                ))}
              </div>
            )}
            {!loading && !listError && images.length < total && (
              <div className="load-more">
                <button
                  className="button secondary"
                  disabled={loadingMore}
                  onClick={() => void loadMore()}
                >
                  {loadingMore ? (
                    <LoaderCircle className="spin" size={16} />
                  ) : null}
                  {loadingMore
                    ? t("正在加载…", "Loading…")
                    : t("加载更多图片", "Load more images")}
                </button>
                <span>
                  {t(
                    `已显示 ${images.length} / ${total} 张`,
                    `Showing ${images.length} of ${total}`,
                  )}
                </span>
              </div>
            )}
          </>
        ) : filteredAlbums.length ? (
          <div className="album-grid">
            {filteredAlbums.map((album) => (
              <button
                className="album-card"
                key={album.id}
                onClick={() => {
                  setActiveAlbum(album);
                  setQuery("");
                  setSearch("");
                }}
              >
                <div
                  className={`album-cover ${!album.coverUrl ? "no-cover" : ""}`}
                >
                  {album.coverUrl ? (
                    <img src={album.coverUrl} alt={album.name} loading="lazy" />
                  ) : (
                    <Folder size={46} strokeWidth={1.1} />
                  )}
                  <span className="album-badge">
                    <Folder size={13} />{" "}
                    {t(
                      `${album.imageCount} 张`,
                      `${album.imageCount} ${album.imageCount === 1 ? "image" : "images"}`,
                    )}
                  </span>
                </div>
                <div className="album-info">
                  <h2>{album.name}</h2>
                  <p>
                    {album.description ||
                      t(
                        `${album.imageCount} 张图片`,
                        `${album.imageCount} ${album.imageCount === 1 ? "image" : "images"}`,
                      )}
                  </p>
                  <ChevronRight size={19} />
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <div className="empty-icon">
              <FolderPlus size={30} strokeWidth={1.3} />
            </div>
            <h2>
              {search
                ? t("没有找到相关相册", "No matching albums")
                : t("让图片有自己的归处", "Give your images a home")}
            </h2>
            <p>
              {search
                ? t("试试其他相册名称", "Try a different album name.")
                : t(
                    "为旅行、日常或灵感，创建你的第一个相册。",
                    "Create your first album for travels, everyday moments or inspiration.",
                  )}
            </p>
            <button
              className="button secondary"
              onClick={() => (search ? setQuery("") : setAlbumEditor("new"))}
            >
              {search
                ? t("清空搜索", "Clear search")
                : t("新建相册", "New album")}
            </button>
          </div>
        )}
      </main>
      {canUpload && dragging && !selected && !albumEditor && !deleteAlbum && (
        <div className="global-drop" aria-hidden="true">
          <div>
            <CloudUpload size={48} strokeWidth={1.3} />
            <h2>{t("把图片放在这里", "Drop your images here")}</h2>
            <p>{t("松开即可上传到图片库", "Drop to upload to your library")}</p>
          </div>
        </div>
      )}
      {uploads.length > 0 && (
        <section
          className="upload-panel"
          aria-label={t("上传进度", "Upload progress")}
        >
          <div className="upload-panel-heading">
            <strong>
              {uploadBusy
                ? t("正在上传图片", "Uploading images")
                : uploads.some((item) => item.status === "error")
                  ? t("上传结果", "Upload results")
                  : t("上传完成", "Upload complete")}{" "}
              <span>
                {uploads.filter((item) => item.status === "done").length}/
                {uploads.length}
              </span>
            </strong>
            {!uploadBusy && (
              <button
                className="icon-button"
                aria-label={t("关闭上传进度", "Close upload progress")}
                onClick={() => setUploads([])}
              >
                <X size={17} />
              </button>
            )}
          </div>
          <div className="upload-items">
            {uploads.map((item) => (
              <div className="upload-item" key={item.id}>
                <div className={`upload-item-icon ${item.status}`}>
                  {item.status === "done" ? (
                    <Check size={17} />
                  ) : item.status === "error" ? (
                    <CircleAlert size={17} />
                  ) : (
                    <ImageIcon size={17} />
                  )}
                </div>
                <div className="upload-item-info">
                  <span>{item.name}</span>
                  {item.error ? (
                    <small className="text-danger">{item.error}</small>
                  ) : (
                    <>
                      <small>
                        {item.status === "waiting"
                          ? t("等待上传", "Queued")
                          : item.status === "done"
                            ? t("已保存", "Saved")
                            : item.progress === 95
                              ? t("正在保存…", "Saving…")
                              : `${item.progress}%`}
                      </small>
                      {item.status === "uploading" && (
                        <progress
                          value={item.progress}
                          max={100}
                          aria-label={t(
                            `${item.name} 上传进度`,
                            `Upload progress for ${item.name}`,
                          )}
                        />
                      )}
                    </>
                  )}
                </div>
                {item.status === "uploading" && (
                  <LoaderCircle size={15} className="spin" />
                )}
              </div>
            ))}
          </div>
        </section>
      )}
      {advanced && (
        <AdvancedTools
          tool={advanced}
          onClose={() => setAdvanced(null)}
          onChanged={reload}
        />
      )}
      {selected && (
        <ImageViewer
          albumContext={!!activeAlbum}
          initialImage={selected}
          initialImages={images}
          initialTotal={total}
          onClose={() => setSelected(null)}
          notify={notify}
          matchesFilter={matchesImageFilter}
          loadPage={async (offset, signal) => {
            const params = new URLSearchParams({
              q: search,
              limit: "48",
              offset: String(offset),
            });
            if (recent) params.set("recent", "1");
            if (activeAlbum) params.set("albumId", activeAlbum.id);
            return api<{ images: ImageRecord[]; total: number }>(
              `/images?${params}`,
              { signal },
            );
          }}
          onSaved={(image) => {
            if (!matchesImageFilter(image)) imageSelection.remove([image.id]);
            reload();
          }}
          onDelete={async (image) => {
            await api(
              `/images/${image.id}`,
              activeAlbum
                ? { method: "PATCH", body: JSON.stringify({ albumId: null }) }
                : { method: "DELETE" },
            );
            imageSelection.remove([image.id]);
            reload();
            notify(
              activeAlbum
                ? t(
                    "图片已移出相册，原链接保持有效",
                    "Image removed from album. Links remain valid.",
                  )
                : t("图片已移入回收站", "Image moved to recycle bin"),
            );
          }}
          renderDetails={(detail) => (
            <ImageDetail
              key={detail.image.id}
              {...detail}
              albumName={activeAlbum?.name}
              albums={albums}
              notify={notify}
            />
          )}
          renderDelete={(confirmation) => (
            <ConfirmDelete
              removal={!!activeAlbum}
              permanent={false}
              title={
                activeAlbum
                  ? t(
                      `移出「${activeAlbum.name}」？`,
                      `Remove from “${activeAlbum.name}”?`,
                    )
                  : t(
                      "将这张图片移入回收站？",
                      "Move this image to the recycle bin?",
                    )
              }
              description={
                activeAlbum
                  ? t(
                      "图片仍保留在图片库中，已有链接不受影响。",
                      "The image remains in your library. Existing links are unaffected.",
                    )
                  : t(
                      "图片将在回收站保留 30 天，期间可恢复，原链接仍有效。",
                      "The image is kept for 30 days in the recycle bin. You can restore it; existing links remain valid.",
                    )
              }
              {...confirmation}
            />
          )}
        />
      )}
      {albumEditor && (
        <AlbumEditor
          album={albumEditor === "new" ? undefined : albumEditor}
          onClose={() => setAlbumEditor(null)}
          onSave={() => {
            notify(
              albumEditor === "new"
                ? t("相册已创建", "Album created")
                : t("相册已更新", "Album updated"),
            );
            setAlbumEditor(null);
            reload();
          }}
        />
      )}
      {deleteAlbum && (
        <ConfirmDelete
          title={t(
            `删除「${deleteAlbum.name}」？`,
            `Delete “${deleteAlbum.name}”?`,
          )}
          description={t(
            "相册将被删除，其中的图片会保留在图片库中。",
            "The album will be deleted. Its images will remain in your library.",
          )}
          onClose={() => setDeleteAlbum(null)}
          onConfirm={async () => {
            await api(`/albums/${deleteAlbum.id}`, { method: "DELETE" });
            setDeleteAlbum(null);
            setActiveAlbum(null);
            reload();
            notify(
              t(
                "相册已删除，图片已保留",
                "Album deleted. Images kept in your library.",
              ),
            );
          }}
        />
      )}
      <div
        className={`toast ${notice ? "visible" : ""} ${notice?.error ? "error" : ""}`}
        role="status"
        aria-live="polite"
      >
        {notice?.error ? <CircleAlert size={18} /> : <Check size={18} />}
        <span>{notice?.message}</span>
      </div>
    </div>
  );
}
