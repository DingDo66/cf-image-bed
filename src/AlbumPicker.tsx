import { useState } from "react";
import { Check, Folder, FolderPlus, LoaderCircle, Search } from "lucide-react";
import { api } from "./api";
import { useI18n } from "./i18n";
import type { AlbumRecord } from "./types";
import "./album-picker.css";

export default function AlbumPicker({
  albums,
  value,
  onChange,
  onCreated,
  disabled,
  creating,
  setCreating,
}: {
  albums: AlbumRecord[];
  value: string;
  onChange: (id: string) => void;
  onCreated: (album: AlbumRecord) => void;
  disabled: boolean;
  creating: boolean;
  setCreating: (busy: boolean) => void;
}) {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const [newAlbum, setNewAlbum] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const filtered = albums.filter((album) =>
    album.name.toLowerCase().includes(query.trim().toLowerCase()),
  );
  const locked = disabled || creating;
  async function create(event: React.FormEvent) {
    event.preventDefault();
    if (locked || !name.trim()) return;
    setCreating(true);
    setError("");
    try {
      const data = await api<{ album: AlbumRecord }>("/albums", {
        method: "POST",
        body: JSON.stringify({ name: name.trim() }),
      });
      onCreated(data.album);
      onChange(data.album.id);
      setQuery("");
      setName("");
      setNewAlbum(false);
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setCreating(false);
    }
  }
  return (
    <div className="album-picker">
      <label className="album-picker-search">
        <Search size={17} />
        <input
          aria-label={t("搜索目标相册", "Search destination albums")}
          placeholder={t("搜索相册…", "Search albums…")}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          disabled={locked}
        />
      </label>
      <fieldset className="album-picker-list" disabled={locked}>
        <legend className="album-picker-legend">
          {t("目标相册", "Destination album")}
        </legend>
        {[
          {
            id: "",
            name: t("未归入相册", "No album"),
            imageCount: null,
            coverUrl: null,
          },
          ...filtered,
        ].map((album) => (
          <label
            className={`album-choice ${value === album.id ? "is-current" : ""}`}
            key={album.id}
          >
            <input
              type="radio"
              name="destination-album"
              value={album.id}
              checked={value === album.id}
              onChange={() => onChange(album.id)}
            />
            <span className="album-choice-cover">
              {album.coverUrl ? (
                <img src={album.coverUrl} alt="" />
              ) : (
                <Folder size={19} />
              )}
            </span>
            <span className="album-choice-copy">
              <strong>{album.name}</strong>
              <small>
                {album.imageCount === null
                  ? t("保留在图片库中", "Keep in your library")
                  : t(
                      `${album.imageCount} 张图片`,
                      `${album.imageCount} images`,
                    )}
              </small>
            </span>
            <span className="album-choice-check">
              {value === album.id && <Check size={17} />}
            </span>
          </label>
        ))}
        {!filtered.length && (
          <p className="album-picker-empty">
            {query.trim()
              ? t(
                  "没有匹配的相册，可以直接新建。",
                  "No matching albums. Create one below.",
                )
              : t(
                  "还没有相册，从下方新建一个吧。",
                  "No albums yet. Create one below.",
                )}
          </p>
        )}
      </fieldset>
      <p className="album-picker-current" aria-live="polite">
        {t("已选择：", "Selected: ")}
        {albums.find((album) => album.id === value)?.name ||
          t("未归入相册", "No album")}
      </p>
      {newAlbum ? (
        <form className="album-create-inline" onSubmit={create}>
          <label>
            {t("新相册名称", "New album name")}
            <input
              autoFocus
              maxLength={80}
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={t("例如：旅行日记", "e.g. Travel journal")}
              disabled={locked}
            />
          </label>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <div className="album-create-actions">
            <button
              type="button"
              className="button secondary"
              disabled={locked}
              onClick={() => setNewAlbum(false)}
            >
              {t("取消新建", "Cancel creation")}
            </button>
            <button
              type="submit"
              className="button primary"
              disabled={locked || !name.trim()}
            >
              {creating && <LoaderCircle size={15} className="spin" />}
              {creating
                ? t("正在创建…", "Creating…")
                : t("创建并选中", "Create & select")}
            </button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          className="album-create-trigger"
          disabled={locked}
          onClick={() => {
            setName(query.trim());
            setError("");
            setNewAlbum(true);
          }}
        >
          <FolderPlus size={18} />
          {t("新建相册", "New album")}
        </button>
      )}
    </div>
  );
}
