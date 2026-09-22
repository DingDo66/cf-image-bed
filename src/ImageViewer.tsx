import QuickCopy from "./QuickCopy";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Download,
  Info,
  LoaderCircle,
  Trash2,
  FolderOutput,
  X,
} from "lucide-react";
import Modal from "./Modal";
import { useI18n } from "./i18n";
import type { ImageRecord } from "./types";
import "./image-viewer.css";

type DetailProps = {
  image: ImageRecord;
  onClose: () => void;
  onSaved: (image: ImageRecord) => void;
  onDelete: () => Promise<void>;
};

type Props = {
  albumContext?: boolean;
  initialImage: ImageRecord;
  initialImages: ImageRecord[];
  initialTotal: number;
  loadPage: (
    offset: number,
    signal: AbortSignal,
  ) => Promise<{ images: ImageRecord[]; total: number }>;
  matchesFilter: (image: ImageRecord) => boolean;
  onClose: () => void;
  onSaved: (image: ImageRecord) => void;
  onDelete: (image: ImageRecord) => Promise<void>;
  notify: (message: string, error?: boolean) => void;
  renderDetails: (props: DetailProps) => ReactNode;
  renderDelete: (props: {
    onClose: () => void;
    onConfirm: () => Promise<void>;
  }) => ReactNode;
};

export default function ImageViewer({
  albumContext = false,
  initialImage,
  initialImages,
  initialTotal,
  loadPage,
  matchesFilter,
  onClose,
  onSaved,
  onDelete,
  notify,
  renderDetails,
  renderDelete,
}: Props) {
  const { t } = useI18n();
  // Keep the browsing order while background library requests refresh metadata.
  const [images, setImages] = useState(() =>
    initialImages.some((item) => item.id === initialImage.id)
      ? initialImages
      : [initialImage, ...initialImages],
  );
  const [currentId, setCurrentId] = useState(initialImage.id);
  const [total, setTotal] = useState(initialTotal);
  const [mode, setMode] = useState<"preview" | "details" | "delete">("preview");
  const [paging, setPaging] = useState(false);
  const [loadedUrl, setLoadedUrl] = useState("");
  const [failedUrl, setFailedUrl] = useState("");
  const [retry, setRetry] = useState(0);
  const pageRequest = useRef<AbortController | null>(null);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const mounted = useRef(false);
  const index = images.findIndex((image) => image.id === currentId);
  const image = images[index] || images[0];
  const hasPrevious = index > 0;
  const hasNext = index + 1 < images.length || images.length < total;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      pageRequest.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (imageRef.current?.complete && imageRef.current.naturalWidth > 0)
      setLoadedUrl(image.url);
  }, [image.url, mode, retry]);

  async function move(direction: -1 | 1) {
    if (mode !== "preview" || pageRequest.current) return;
    const next = images[index + direction];
    if (next) {
      setCurrentId(next.id);
      return;
    }
    if (direction < 0 || !hasNext) return;
    const controller = new AbortController();
    pageRequest.current = controller;
    setPaging(true);
    try {
      // Edits may move a viewed image outside the active album or search. Keep it
      // visible, but don't count it when requesting the next page of matches.
      const offset = images.filter(matchesFilter).length;
      const data = await loadPage(offset, controller.signal);
      if (controller.signal.aborted) return;
      const additions = data.images.filter(
        (item) => !images.some((existing) => existing.id === item.id),
      );
      setImages((current) => [...current, ...additions]);
      setTotal(data.total + images.length - offset);
      if (additions[0]) setCurrentId(additions[0].id);
      else {
        setTotal(images.length);
        notify(t("已经是最后一张图片", "This is the last image"));
      }
    } catch (error) {
      if (!controller.signal.aborted) notify((error as Error).message, true);
    } finally {
      if (pageRequest.current === controller) {
        pageRequest.current = null;
        setPaging(false);
      }
    }
  }

  const navigation = useRef(move);
  navigation.current = move;
  useEffect(() => {
    if (mode !== "preview") return;
    const handle = (event: KeyboardEvent) => {
      if (
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        (event.target as HTMLElement)?.closest(
          "input, textarea, select, [contenteditable]",
        )
      )
        return;
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault();
        void navigation.current(event.key === "ArrowLeft" ? -1 : 1);
      }
    };
    document.addEventListener("keydown", handle);
    return () => document.removeEventListener("keydown", handle);
  }, [mode]);

  async function remove() {
    await onDelete(image);
    if (!mounted.current) return;
    let remaining = images.filter((item) => item.id !== image.id);
    let remainingTotal = Math.max(remaining.length, total - 1);
    if (index === images.length - 1 && remaining.length < remainingTotal) {
      const controller = new AbortController();
      pageRequest.current = controller;
      try {
        const offset = remaining.filter(matchesFilter).length;
        const data = await loadPage(offset, controller.signal);
        if (controller.signal.aborted) return;
        remainingTotal = data.total + remaining.length - offset;
        remaining = [
          ...remaining,
          ...data.images.filter(
            (item) => !remaining.some((existing) => existing.id === item.id),
          ),
        ];
      } catch (error) {
        if (controller.signal.aborted) return;
        notify(
          `${t("操作已完成，加载下一张失败", "Action completed, but the next image could not be loaded")}: ${(error as Error).message}`,
          true,
        );
      } finally {
        if (pageRequest.current === controller) pageRequest.current = null;
      }
    }
    if (!remaining.length) {
      onClose();
      return;
    }
    setImages(remaining);
    setTotal(Math.max(remaining.length, remainingTotal));
    setCurrentId(remaining[Math.min(index, remaining.length - 1)].id);
    setMode("preview");
  }

  if (mode === "details")
    return renderDetails({
      image,
      onClose: () => setMode("preview"),
      onSaved: (updated) => {
        setImages((current) =>
          current.map((item) => (item.id === updated.id ? updated : item)),
        );
        onSaved(updated);
      },
      onDelete: remove,
    });
  if (mode === "delete")
    return renderDelete({
      onClose: () => setMode("preview"),
      onConfirm: remove,
    });

  return (
    <Modal
      label={`${t("大图预览", "Image preview")}: ${image.name}`}
      className="image-viewer"
      backdropClassName="viewer-backdrop"
      onClose={onClose}
    >
      <header className="viewer-header">
        <div
          className="viewer-toolbar"
          role="group"
          aria-label={t("图片操作", "Image actions")}
        >
          <a
            className="viewer-action"
            href={`${image.originalUrl || image.url}?download=1`}
            download={image.name}
            aria-label={t("下载原图", "Download original")}
            data-tooltip={t("下载", "Download")}
          >
            <Download size={21} />
          </a>
          <button
            className="viewer-action"
            aria-label={t("图片详情", "Image details")}
            data-tooltip={t("图片详情", "Image details")}
            onClick={() => setMode("details")}
            disabled={paging}
          >
            <Info size={21} />
          </button>
          <a
            className="viewer-action"
            href={image.url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={t("在新页面中打开", "Open in new tab")}
            data-tooltip={t("在新页面中打开", "Open in new tab")}
          >
            <ArrowUpRight size={22} />
          </a>
          <QuickCopy
            key={image.id}
            image={image}
            notify={notify}
            variant="viewer"
          />
          <button
            className={`viewer-action ${albumContext ? "" : "danger"}`}
            aria-label={
              albumContext
                ? t("移出相册", "Remove from album")
                : t("删除", "Delete")
            }
            data-tooltip={
              albumContext
                ? t("移出相册", "Remove from album")
                : t("删除", "Delete")
            }
            onClick={() => setMode("delete")}
            disabled={paging}
          >
            {albumContext ? <FolderOutput size={21} /> : <Trash2 size={21} />}
          </button>
        </div>
        <button
          className="viewer-close viewer-action"
          data-autofocus
          aria-label={t("关闭大图预览", "Close image preview")}
          data-tooltip={t("关闭（Esc）", "Close (Esc)")}
          onClick={onClose}
        >
          <X size={24} />
        </button>
      </header>
      <div
        className="viewer-stage"
        onClick={(event) => {
          if (event.target === event.currentTarget) onClose();
        }}
        onTouchStart={(event) => {
          const point = event.touches[0];
          touchStart.current =
            event.touches.length === 1 &&
            point &&
            !(event.target as HTMLElement).closest("button, a")
              ? { x: point.clientX, y: point.clientY }
              : null;
        }}
        onTouchCancel={() => {
          touchStart.current = null;
        }}
        onTouchEnd={(event) => {
          const start = touchStart.current;
          touchStart.current = null;
          const end = event.changedTouches[0];
          if (start && end) {
            const dx = end.clientX - start.x;
            const dy = end.clientY - start.y;
            if (Math.abs(dx) > 65 && Math.abs(dx) > Math.abs(dy) * 1.5)
              void move(dx < 0 ? 1 : -1);
          }
        }}
      >
        {failedUrl === image.url ? (
          <div className="viewer-error" role="alert">
            <CircleAlert size={30} />
            <p>{t("图片加载失败", "Unable to load image")}</p>
            <button
              className="button secondary"
              onClick={() => {
                setFailedUrl("");
                setRetry((count) => count + 1);
              }}
            >
              {t("重新加载", "Try again")}
            </button>
          </div>
        ) : (
          <>
            {loadedUrl !== image.url && (
              <div
                className="viewer-loading"
                role="status"
                aria-label={t("正在加载原图", "Loading original image")}
              >
                <LoaderCircle className="spin" size={28} />
              </div>
            )}
            <img
              ref={imageRef}
              key={`${image.id}:${retry}`}
              src={image.url}
              alt={image.description || image.name}
              className={`viewer-image ${loadedUrl !== image.url ? "is-loading" : ""}`}
              draggable={false}
              onLoad={() => setLoadedUrl(image.url)}
              onError={() => setFailedUrl(image.url)}
            />
          </>
        )}
        <button
          className="viewer-nav viewer-prev"
          aria-label={t("上一张图片", "Previous image")}
          title={t("上一张（←）", "Previous (←)")}
          disabled={!hasPrevious || paging}
          onClick={() => void move(-1)}
        >
          <ChevronLeft size={29} />
        </button>
        <button
          className="viewer-nav viewer-next"
          aria-label={t("下一张图片", "Next image")}
          title={t("下一张（→）", "Next (→)")}
          disabled={!hasNext || paging}
          onClick={() => void move(1)}
        >
          {paging ? (
            <LoaderCircle className="spin" size={23} />
          ) : (
            <ChevronRight size={29} />
          )}
        </button>
      </div>
      <footer className="viewer-footer">
        <span className="viewer-name" title={image.name}>
          {image.name}
        </span>
        <span
          className="viewer-count"
          aria-live="polite"
          aria-atomic="true"
          aria-label={t(
            `第 ${index + 1} 张，共 ${Math.max(images.length, total)} 张`,
            `Image ${index + 1} of ${Math.max(images.length, total)}`,
          )}
        >
          {index + 1} / {Math.max(images.length, total)}
        </span>
      </footer>
    </Modal>
  );
}
