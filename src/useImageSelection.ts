import { useEffect, useRef, useState } from "react";
import { api } from "./api";
import { useI18n } from "./i18n";
import { collectImageIds, runImageBatch } from "./selectionOps";

export default function useImageSelection({
  scope,
  enabled,
  search,
  recent,
  albumId,
  reload,
  notify,
}: {
  scope: string;
  enabled: boolean;
  search: string;
  recent: boolean;
  albumId?: string;
  reload: () => void;
  notify: (message: string, error?: boolean) => void;
}) {
  const { t } = useI18n();
  const [ids, setIds] = useState<Set<string>>(new Set());
  const [collecting, setCollecting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState({ completed: 0, total: 0 });
  const [dialog, setDialog] = useState<"move" | "delete" | "remove" | null>(
    null,
  );
  const request = useRef<AbortController | null>(null);

  useEffect(() => {
    request.current?.abort();
    request.current = null;
    setIds(new Set());
    setDialog(null);
    setCollecting(false);
    setBusy(false);
    return () => request.current?.abort();
  }, [scope, enabled]);

  function toggle(id: string) {
    if (request.current) return;
    setIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function clear() {
    if (busy) return;
    request.current?.abort();
    request.current = null;
    setCollecting(false);
    setIds(new Set());
  }

  function remove(removed: string[]) {
    setIds(
      (current) => new Set([...current].filter((id) => !removed.includes(id))),
    );
  }

  async function selectAll() {
    if (request.current) return;
    const controller = new AbortController();
    request.current = controller;
    setCollecting(true);
    try {
      const all = await collectImageIds(async (offset, signal) => {
        const params = new URLSearchParams({
          q: search,
          limit: "100",
          offset: String(offset),
        });
        if (recent) params.set("recent", "1");
        if (albumId) params.set("albumId", albumId);
        return api<{ images: { id: string }[]; total: number }>(
          `/images?${params}`,
          { signal },
        );
      }, controller.signal);
      if (!controller.signal.aborted) setIds(all);
    } catch (error) {
      if (!controller.signal.aborted) notify((error as Error).message, true);
    } finally {
      if (request.current === controller) {
        request.current = null;
        setCollecting(false);
      }
    }
  }

  async function apply(
    action: "move" | "delete" | "remove",
    destination: string | null = null,
  ) {
    if (request.current || !ids.size) return;
    const controller = new AbortController();
    request.current = controller;
    const selected = [...ids];
    setBusy(true);
    setProgress({ completed: 0, total: selected.length });
    try {
      const result = await runImageBatch(
        selected,
        (id, signal) =>
          api(`/images/${id}`, {
            method: action === "delete" ? "DELETE" : "PATCH",
            ...(action !== "delete"
              ? {
                  body: JSON.stringify({
                    albumId: action === "remove" ? null : destination,
                  }),
                }
              : {}),
            signal,
          }),
        controller.signal,
        (completed) => {
          if (!controller.signal.aborted)
            setProgress({ completed, total: selected.length });
        },
      );
      setIds(new Set(result.failed));
      setDialog(null);
      const count = result.succeeded.length;
      const summary =
        action === "remove"
          ? t(
              `已移出相册 ${count} 张图片`,
              `Removed ${count} images from album`,
            )
          : action === "delete"
            ? t(
                `已将 ${count} 张图片移入回收站`,
                `Moved ${count} ${count === 1 ? "image" : "images"} to recycle bin`,
              )
            : t(
                `已移动 ${count} 张图片`,
                `Moved ${count} ${count === 1 ? "image" : "images"}`,
              );
      notify(
        result.failed.length
          ? `${summary}${t(`，${result.failed.length} 张未完成，已保留选择，可重试。`, `; ${result.failed.length} failed and remain selected for retry.`)} ${result.firstError}`
          : summary,
        result.failed.length > 0,
      );
    } catch (error) {
      if (!controller.signal.aborted) notify((error as Error).message, true);
    } finally {
      if (request.current === controller) {
        request.current = null;
        setBusy(false);
        reload();
      }
    }
  }

  return {
    ids,
    collecting,
    busy,
    progress,
    dialog,
    setDialog,
    toggle,
    clear,
    remove,
    selectAll,
    apply,
  };
}
