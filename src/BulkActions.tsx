import { useState } from "react";
import {
  Check,
  FolderOutput,
  FolderInput,
  LoaderCircle,
  Trash2,
  X,
} from "lucide-react";
import Modal from "./Modal";
import AlbumPicker from "./AlbumPicker";
import { useI18n } from "./i18n";
import type useImageSelection from "./useImageSelection";
import type { AlbumRecord } from "./types";
import "./selection.css";

type Selection = ReturnType<typeof useImageSelection>;

export function ImageSelectionToggle({
  id,
  name,
  selection,
  list = false,
}: {
  id: string;
  name: string;
  selection: Selection;
  list?: boolean;
}) {
  const { t } = useI18n();
  const checked = selection.ids.has(id);
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      className={`image-select ${checked ? "is-checked" : ""} ${list ? "is-list" : ""}`}
      aria-label={
        checked
          ? t(`取消选择 ${name}`, `Deselect ${name}`)
          : t(`选择 ${name}`, `Select ${name}`)
      }
      disabled={selection.collecting || selection.busy}
      onClick={(event) => {
        event.stopPropagation();
        selection.toggle(id);
      }}
    >
      <span className="selection-circle">
        {checked && <Check size={16} strokeWidth={2.4} />}
      </span>
    </button>
  );
}

export function SelectAllButton({
  selection,
  total,
  disabled,
}: {
  selection: Selection;
  total: number;
  disabled: boolean;
}) {
  const { t } = useI18n();
  const checked = total > 0 && selection.ids.size === total;
  return (
    <button
      type="button"
      className="select-all-button"
      role="checkbox"
      aria-checked={checked ? true : selection.ids.size ? "mixed" : false}
      disabled={
        disabled || selection.busy || selection.collecting || total === 0
      }
      onClick={() => (checked ? selection.clear() : void selection.selectAll())}
    >
      <span className="select-all-box">
        {selection.collecting ? (
          <LoaderCircle size={13} className="spin" />
        ) : checked ? (
          <Check size={13} />
        ) : selection.ids.size ? (
          <span className="selection-dash" />
        ) : null}
      </span>
      {selection.collecting
        ? t("正在全选…", "Selecting…")
        : t("全选", "Select all")}
    </button>
  );
}

export default function BulkActions({
  selection,
  albums,
  onAlbumCreated,
  albumName,
}: {
  selection: Selection;
  albums: AlbumRecord[];
  albumName?: string;
  onAlbumCreated: (album: AlbumRecord) => void;
}) {
  const { t } = useI18n();
  const [destination, setDestination] = useState("");
  const [creating, setCreating] = useState(false);
  const locked = selection.busy || creating;
  const count = selection.ids.size;
  const close = () => {
    if (!locked) selection.setDialog(null);
  };
  return (
    <>
      {(count > 0 || selection.collecting) && (
        <div
          className="bulk-toolbar"
          role="region"
          aria-label={t("批量管理", "Bulk management")}
        >
          <span className="bulk-count" aria-live="polite">
            {t(
              `已选择 ${count} 张图片`,
              `${count} ${count === 1 ? "image" : "images"} selected`,
            )}
          </span>
          <div className="bulk-controls">
            <button
              className="button secondary"
              disabled={!count || selection.collecting || selection.busy}
              onClick={() => {
                setDestination("");
                selection.setDialog("move");
              }}
            >
              <FolderInput size={16} />
              <span>{t("移动到相册", "Move to album")}</span>
            </button>
            <button
              className={`button secondary ${albumName ? "" : "bulk-delete"}`}
              disabled={!count || selection.collecting || selection.busy}
              onClick={() =>
                selection.setDialog(albumName ? "remove" : "delete")
              }
            >
              {albumName ? <FolderOutput size={16} /> : <Trash2 size={16} />}
              <span>
                {albumName
                  ? t("移出相册", "Remove from album")
                  : t("删除", "Delete")}
              </span>
            </button>
            <button
              className="icon-button"
              disabled={locked}
              onClick={selection.clear}
              aria-label={t("取消选择", "Clear selection")}
              title={t("取消选择", "Clear selection")}
            >
              <X size={18} />
            </button>
          </div>
        </div>
      )}
      {selection.dialog && (
        <Modal
          className="small-modal bulk-modal"
          label={
            selection.dialog === "remove"
              ? t("移出相册", "Remove from album")
              : selection.dialog === "delete"
                ? t("批量删除图片", "Delete selected images")
                : t("移动到相册", "Move to album")
          }
          onClose={close}
        >
          <div className="modal-heading">
            <h2>
              {selection.dialog === "remove"
                ? t(
                    `将这 ${count} 张图片移出「${albumName}」？`,
                    `Remove ${count} images from “${albumName}”?`,
                  )
                : selection.dialog === "delete"
                  ? t(
                      `删除这 ${count} 张图片？`,
                      `Delete ${count} ${count === 1 ? "image" : "images"}?`,
                    )
                  : t("移动到相册", "Move to album")}
            </h2>
            <button
              className="icon-button"
              disabled={locked}
              aria-label={t("关闭", "Close")}
              onClick={close}
            >
              <X size={20} />
            </button>
          </div>
          {selection.dialog !== "move" ? (
            <p className="bulk-description">
              {selection.dialog === "remove"
                ? t(
                    "图片仍保留在图片库中，已有链接不受影响。",
                    "Images remain in your library. Existing links are unaffected.",
                  )
                : t(
                    "所选图片将在回收站保留 30 天，期间可恢复，原链接仍有效。",
                    "Selected images are kept in the recycle bin for 30 days. You can restore them; existing links remain valid.",
                  )}
            </p>
          ) : (
            <>
              <p className="bulk-description">
                {t(
                  `将选中的 ${count} 张图片整理到同一个相册。`,
                  `Organize ${count} selected ${count === 1 ? "image" : "images"} in one album.`,
                )}
              </p>
              <AlbumPicker
                albums={albums}
                value={destination}
                onChange={setDestination}
                onCreated={onAlbumCreated}
                disabled={locked}
                creating={creating}
                setCreating={setCreating}
              />
            </>
          )}
          {selection.busy && (
            <div className="bulk-progress" role="status">
              <LoaderCircle size={16} className="spin" />
              {t("正在处理", "Processing")} {selection.progress.completed} /{" "}
              {selection.progress.total}
              <progress
                aria-label={t("批量操作进度", "Bulk operation progress")}
                value={selection.progress.completed}
                max={selection.progress.total}
              />
            </div>
          )}
          <div className="modal-footer">
            <button
              className="button secondary"
              disabled={locked}
              onClick={close}
            >
              {t("取消", "Cancel")}
            </button>
            <button
              className={`button ${selection.dialog === "delete" ? "danger" : "primary"}`}
              disabled={locked || !count}
              onClick={() =>
                void selection.apply(selection.dialog!, destination || null)
              }
            >
              {selection.busy
                ? t("正在处理…", "Processing…")
                : selection.dialog === "remove"
                  ? t("移出相册", "Remove from album")
                  : selection.dialog === "delete"
                    ? t("删除", "Delete")
                    : t("确认移动", "Move images")}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
