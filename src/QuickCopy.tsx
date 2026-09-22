import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Link } from "lucide-react";
import { copyText } from "./api";
import { useI18n } from "./i18n";
import type { ImageRecord } from "./types";
type Format = "url" | "markdown" | "html";
const key = "image-bed-copy-format";
function preference(): Format {
  try {
    const value = localStorage.getItem(key);
    return value === "markdown" || value === "html" ? value : "url";
  } catch {
    return "url";
  }
}
export function shareText(
  image: Pick<ImageRecord, "name" | "url">,
  format: Format,
) {
  const escape = (s: string) =>
    s
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  return format === "url"
    ? image.url
    : format === "markdown"
      ? `![${image.name.replace(/[\\\[\]]/g, "\\$&").replace(/[\r\n]/g, " ")}](<${image.url.replace(/>/g, "%3E").replace(/</g, "%3C")}>)`
      : `<img src="${escape(image.url)}" alt="${escape(image.name)}" />`;
}
export default function QuickCopy({
  image,
  notify,
  variant = "card",
}: {
  image: ImageRecord;
  notify: (message: string, error?: boolean) => void;
  variant?: "card" | "list" | "viewer";
}) {
  const { t } = useI18n();
  const [format, setFormat] = useState<Format>(preference),
    [open, setOpen] = useState(false),
    [copied, setCopied] = useState(false),
    [position, setPosition] = useState({ left: 0, top: 0 });
  const root = useRef<HTMLDivElement>(null),
    trigger = useRef<HTMLButtonElement>(null),
    timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const label = (f: Format) =>
    f === "url"
      ? t("直链", "Direct link")
      : f === "markdown"
        ? "Markdown"
        : "HTML";
  useEffect(() => {
    const update = () => setFormat(preference());
    window.addEventListener("copy-format-changed", update);
    window.addEventListener("storage", update);
    return () => {
      window.removeEventListener("copy-format-changed", update);
      window.removeEventListener("storage", update);
      clearTimeout(timer.current);
    };
  }, []);
  useEffect(() => {
    setCopied(false);
    setOpen(false);
  }, [image.id]);
  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopImmediatePropagation();
        event.preventDefault();
        setOpen(false);
        trigger.current?.focus();
      }
    };
    const dismiss = () => setOpen(false);
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", escape, true);
    window.addEventListener("resize", dismiss);
    window.addEventListener("scroll", dismiss, true);
    root.current
      ?.querySelector<HTMLButtonElement>(".quick-copy-popover button")
      ?.focus();
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", escape, true);
      window.removeEventListener("resize", dismiss);
      window.removeEventListener("scroll", dismiss, true);
    };
  }, [open]);
  async function copy(next: Format) {
    try {
      await copyText(shareText(image, next));
      setFormat(next);
      try {
        localStorage.setItem(key, next);
      } catch {
        /* Preference is optional. */
      }
      window.dispatchEvent(new Event("copy-format-changed"));
      setCopied(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1600);
      notify(t(`已复制${label(next)}`, `Copied ${label(next)}`));
    } catch (error) {
      notify((error as Error).message, true);
    }
  }
  return (
    <div
      ref={root}
      className={`quick-copy quick-copy-${variant} ${open ? "is-open" : ""}`}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        className="quick-copy-main"
        data-tooltip={t(`复制${label(format)}`, `Copy ${label(format)}`)}
        aria-label={t(
          `复制 ${image.name} 的${label(format)}`,
          `Copy ${label(format)} for ${image.name}`,
        )}
        onClick={() => void copy(format)}
      >
        {copied ? <Check size={18} /> : <Link size={18} />}
      </button>
      <button
        type="button"
        ref={trigger}
        className="quick-copy-toggle"
        aria-label={t(
          `选择 ${image.name} 的复制格式`,
          `Choose copy format for ${image.name}`,
        )}
        data-tooltip={t("选择复制格式", "Choose copy format")}
        aria-expanded={open}
        onClick={() => {
          const r = trigger.current!.getBoundingClientRect();
          setPosition({
            left: Math.max(8, Math.min(window.innerWidth - 184, r.right - 176)),
            top:
              r.bottom + 160 < window.innerHeight
                ? r.bottom + 8
                : Math.max(8, r.top - 152),
          });
          setOpen(!open);
        }}
      >
        <ChevronDown size={13} />
      </button>
      {open && (
        <div
          className="quick-copy-popover"
          style={position}
          role="group"
          aria-label={t("复制为", "Copy as")}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault();
              event.stopPropagation();
              const buttons = Array.from(
                event.currentTarget.querySelectorAll("button"),
              );
              const i = buttons.indexOf(
                document.activeElement as HTMLButtonElement,
              );
              buttons[
                (i + (event.key === "ArrowDown" ? 1 : buttons.length - 1)) %
                  buttons.length
              ]?.focus();
            }
          }}
        >
          <small>{t("复制为", "Copy as")}</small>
          {(["url", "markdown", "html"] as Format[]).map((f) => (
            <button
              type="button"
              key={f}
              onClick={() => {
                setOpen(false);
                trigger.current?.focus();
                void copy(f);
              }}
            >
              {label(f)}
              {format === f && <Check size={14} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
