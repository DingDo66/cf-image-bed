import { useEffect, useState } from "react";
import {
  Copy,
  KeyRound,
  LoaderCircle,
  RotateCcw,
  Trash2,
  X,
} from "lucide-react";
import Modal from "./Modal";
import { api, copyText, formatSize } from "./api";
import { useI18n } from "./i18n";
import type { ImageRecord } from "./types";
import "./advanced-tools.css";
type TokenRecord = { id: string; name: string; createdAt: string };
export default function AdvancedTools({
  tool,
  onClose,
  onChanged,
}: {
  tool: "trash" | "tokens" | "url";
  onClose: () => void;
  onChanged: () => void;
}) {
  const { t, language } = useI18n();
  const [images, setImages] = useState<ImageRecord[]>([]),
    [total, setTotal] = useState(0),
    [tokens, setTokens] = useState<TokenRecord[]>([]);
  const [value, setValue] = useState(""),
    [secret, setSecret] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [confirm, setConfirm] = useState<{
    kind: "purge" | "empty" | "revoke";
    id?: string;
  } | null>(null);
  async function load(offset = 0) {
    setLoading(true);
    try {
      if (tool === "trash") {
        const data = await api<{ images: ImageRecord[]; total: number }>(
          `/trash?offset=${offset}`,
        );
        setImages((old) => (offset ? [...old, ...data.images] : data.images));
        setTotal(data.total);
      }
      if (tool === "tokens")
        setTokens((await api<{ tokens: TokenRecord[] }>("/tokens")).tokens);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, [tool]);
  async function act(operation: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await operation();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const title =
    tool === "trash"
      ? t("回收站", "Recycle bin")
      : tool === "tokens"
        ? t("API Token 管理", "API tokens")
        : t("从网址上传", "Upload from URL");
  return (
    <Modal
      label={title}
      className="small-modal advanced-modal"
      onClose={() => !busy && onClose()}
    >
      <div className="modal-heading">
        <h2>{title}</h2>
        <button
          className="icon-button"
          disabled={busy}
          aria-label={t("关闭", "Close")}
          onClick={onClose}
        >
          <X size={20} />
        </button>
      </div>
      {tool === "url" && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void act(async () => {
              await api("/upload-url", {
                method: "POST",
                body: JSON.stringify({ url: value }),
              });
              onChanged();
              setValue("");
              setNotice(t("图片已保存到图片库", "Image saved to your library"));
            });
          }}
        >
          <p className="tool-note">
            {t(
              "获取网址中的图片并保存到自己的图床，最大 20 MB。",
              "Fetch an image and save it to your storage. Up to 20 MB.",
            )}
          </p>
          <label className="field">
            {t("图片网址", "Image URL")}
            <input
              type="url"
              required
              autoFocus
              maxLength={4096}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="https://example.com/photo.jpg"
              disabled={busy}
            />
          </label>
          <button className="button primary" disabled={busy || !value.trim()}>
            {busy ? <LoaderCircle size={16} className="spin" /> : null}
            {busy ? t("正在获取…", "Fetching…") : t("上传", "Upload")}
          </button>
        </form>
      )}
      {tool === "tokens" && (
        <>
          <p className="tool-note">
            {t(
              "Token 仅允许上传图片，与登录会话独立。最多 50 个。",
              "Tokens allow image uploads only, independently of your login session. Up to 50 tokens.",
            )}
          </p>
          {secret && (
            <div className="token-secret">
              <strong>
                {t(
                  "完整 Token 只显示这一次，请保存。",
                  "This token is shown only once. Save it now.",
                )}
              </strong>
              <input
                aria-label="API Token"
                readOnly
                value={secret}
                onFocus={(e) => e.target.select()}
              />
              <button
                className="button secondary"
                onClick={() =>
                  void act(async () => {
                    await copyText(secret);
                    setNotice(t("已复制", "Copied"));
                  })
                }
              >
                <Copy size={15} />
                {t("复制 Token", "Copy token")}
              </button>
            </div>
          )}
          <form
            className="token-create"
            onSubmit={(e) => {
              e.preventDefault();
              void act(async () => {
                const data = await api<{ token: string }>("/tokens", {
                  method: "POST",
                  body: JSON.stringify({ name: value.trim() }),
                });
                setSecret(data.token);
                setValue("");
                await load();
              });
            }}
          >
            <input
              aria-label={t("Token 名称", "Token name")}
              placeholder={t("名称，例如：PicGo", "Name, e.g. PicGo")}
              maxLength={80}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              disabled={busy}
            />
            <button className="button primary" disabled={busy || !value.trim()}>
              <KeyRound size={15} />
              {t("创建", "Create")}
            </button>
          </form>
          <div className="tool-list">
            {tokens.map((token) => (
              <div className="tool-row" key={token.id}>
                <div>
                  <strong>{token.name}</strong>
                  <small>
                    {new Date(token.createdAt).toLocaleString(
                      language === "zh" ? "zh-CN" : "en-US",
                    )}
                  </small>
                </div>
                <button
                  className="icon-button"
                  aria-label={t(`吊销 ${token.name}`, `Revoke ${token.name}`)}
                  disabled={busy}
                  onClick={() => setConfirm({ kind: "revoke", id: token.id })}
                >
                  <Trash2 size={17} />
                </button>
              </div>
            ))}
          </div>
          <details className="api-example">
            <summary>{t("上传 API 使用方法", "Upload API usage")}</summary>
            <p>
              {t(
                "仅在可信脚本中保存 Token，切勿放在公开网页中。",
                "Keep tokens in trusted scripts, never in public web pages.",
              )}
            </p>
            <pre>{`curl -X POST '${location.origin}/api/v1/images' \\\n  -H 'Authorization: Bearer YOUR_TOKEN' \\\n  -F 'file=@photo.jpg'`}</pre>
            <p>
              {t(
                "返回 image 对象：id、name、url、originalUrl、thumbnailUrl、width、height、size、mime。",
                "Returns image: id, name, url, originalUrl, thumbnailUrl, width, height, size, mime.",
              )}
            </p>
          </details>
        </>
      )}
      {tool === "trash" && (
        <>
          <p className="tool-note">
            {t(
              "删除后保留 30 天，之后自动永久清理。期间原链接仍有效，永久删除后失效。",
              "Kept for 30 days, then automatically purged. Existing links remain valid until permanent deletion.",
            )}
          </p>
          <div className="trash-summary">
            <span>{t(`${total} 张图片`, `${total} images`)}</span>
            <button
              className="button secondary text-danger"
              disabled={busy || !total || loading}
              onClick={() => setConfirm({ kind: "empty" })}
            >
              {t("清空回收站", "Empty recycle bin")}
            </button>
          </div>
          <div className="tool-list">
            {images.map((image) => (
              <div className="tool-row" key={image.id}>
                <img src={image.thumbnailUrl} alt="" />
                <div>
                  <strong>{image.name}</strong>
                  <small>
                    {formatSize(image.size)} · {t("清理日期：", "Purge date: ")}
                    {new Date(
                      new Date(image.deletedAt!).getTime() + 30 * 86400000,
                    ).toLocaleDateString(language === "zh" ? "zh-CN" : "en-US")}
                  </small>
                </div>
                <button
                  className="icon-button"
                  disabled={
                    busy ||
                    image.purgeStarted ||
                    Date.now() - new Date(image.deletedAt!).getTime() >=
                      30 * 86400000
                  }
                  aria-label={t(`恢复 ${image.name}`, `Restore ${image.name}`)}
                  title={t("恢复", "Restore")}
                  onClick={() =>
                    void act(async () => {
                      await api(`/trash/${image.id}`, { method: "POST" });
                      await load();
                      onChanged();
                      setNotice(t("图片已恢复", "Image restored"));
                    })
                  }
                >
                  <RotateCcw size={17} />
                </button>
                <button
                  className="icon-button text-danger"
                  disabled={busy}
                  aria-label={t(
                    `永久删除 ${image.name}`,
                    `Permanently delete ${image.name}`,
                  )}
                  title={t("永久删除", "Delete permanently")}
                  onClick={() => setConfirm({ kind: "purge", id: image.id })}
                >
                  <Trash2 size={17} />
                </button>
              </div>
            ))}
          </div>
          {!loading && !total && (
            <p className="tool-note">
              {t("回收站是空的", "The recycle bin is empty")}
            </p>
          )}
          {images.length < total && (
            <button
              className="button secondary"
              disabled={busy || loading}
              onClick={() => void load(images.length)}
            >
              {t("加载更多", "Load more")}
            </button>
          )}
        </>
      )}
      {loading && tool !== "url" && (
        <p role="status">{t("正在加载…", "Loading…")}</p>
      )}
      {confirm && (
        <div
          className="tool-confirm"
          role="group"
          aria-label={t("确认操作", "Confirm action")}
        >
          <strong>
            {confirm.kind === "revoke"
              ? t("吊销此 Token？", "Revoke this token?")
              : confirm.kind === "empty"
                ? t(
                    "永久删除回收站内全部图片？",
                    "Permanently delete all recycled images?",
                  )
                : t("永久删除这张图片？", "Permanently delete this image?")}
          </strong>
          <p>
            {confirm.kind === "revoke"
              ? t(
                  "使用它的程序将无法继续上传。",
                  "Programs using it will no longer be able to upload.",
                )
              : t(
                  "原图及预览文件将被删除，链接失效，无法恢复。",
                  "Originals and previews will be deleted. Links will stop working. This cannot be undone.",
                )}
          </p>
          <div>
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => setConfirm(null)}
            >
              {t("取消", "Cancel")}
            </button>
            <button
              className="button danger"
              disabled={busy}
              onClick={() =>
                void act(async () => {
                  if (confirm.kind === "empty") {
                    let more = true;
                    while (more) {
                      const r = await api<{ hasMore: boolean; failed: number }>(
                        "/trash",
                        { method: "DELETE" },
                      );
                      if (r.failed)
                        throw new Error(
                          t(
                            "部分图片未清理成功，请重试",
                            "Some images could not be purged. Retry.",
                          ),
                        );
                      more = r.hasMore;
                    }
                  } else
                    await api(
                      confirm.kind === "revoke"
                        ? `/tokens/${confirm.id}`
                        : `/trash/${confirm.id}`,
                      { method: "DELETE" },
                    );
                  if (confirm.kind === "revoke") setSecret("");
                  setConfirm(null);
                  await load();
                  onChanged();
                  setNotice(t("操作完成", "Done"));
                })
              }
            >
              {busy
                ? t("正在处理…", "Processing…")
                : confirm.kind === "revoke"
                  ? t("吊销", "Revoke")
                  : t("永久删除", "Delete permanently")}
            </button>
          </div>
        </div>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="tool-note" role="status">
          {notice}
        </p>
      )}
    </Modal>
  );
}
