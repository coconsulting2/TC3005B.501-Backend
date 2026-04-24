/**
 * Escucha showAppAlert() (evento coco:alert) y muestra un diálogo tipo alert nativo.
 * Debe montarse una vez en MainLayout con client:load.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { MODAL_STYLES, type ModalType } from "@config/modal";
import {
  COCO_ALERT_EVENT,
  COCO_ALERT_CLOSED_EVENT,
  type AppAlertVariant,
  type CocoAlertDetail,
} from "@utils/appAlert";

const variantToModalType: Record<AppAlertVariant, ModalType> = {
  info: "confirm",
  success: "success",
  warning: "warning",
  error: "error",
};

const defaultTitles: Record<AppAlertVariant, string> = {
  info: "Aviso",
  success: "Listo",
  warning: "Atención",
  error: "Error",
};

export default function AppAlertHost() {
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<CocoAlertDetail | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => {
    setOpen(false);
    setDetail(null);
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent(COCO_ALERT_CLOSED_EVENT));
    }
  }, []);

  useEffect(() => {
    const onAlert = (e: Event) => {
      const ce = e as CustomEvent<CocoAlertDetail>;
      if (!ce.detail?.message) return;
      setDetail(ce.detail);
      setOpen(true);
    };
    window.addEventListener(COCO_ALERT_EVENT, onAlert);
    return () => window.removeEventListener(COCO_ALERT_EVENT, onAlert);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    const t = window.setTimeout(() => {
      dialogRef.current?.querySelector<HTMLButtonElement>("button[data-alert-ok]")?.focus();
    }, 0);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
      window.clearTimeout(t);
    };
  }, [open, close]);

  if (!open || !detail) return null;

  const variant = detail.variant ?? "info";
  const modalType = variantToModalType[variant];
  const title = detail.title?.trim() || defaultTitles[variant];

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-[var(--color-ink)]/30 backdrop-blur-sm p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
      role="presentation"
    >
      <div
        ref={dialogRef}
        className={`bg-[var(--color-surface-white)] border rounded-[var(--radius-lg)] p-6 w-full max-w-md min-w-[280px] shadow-[var(--shadow-md)] ${MODAL_STYLES[modalType]}`}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="app-alert-title"
        aria-describedby="app-alert-message"
        onClick={(e) => e.stopPropagation()}
      >
        <h2
          id="app-alert-title"
          className="font-editorial text-xl font-normal text-[var(--color-ink)] mb-2 leading-tight"
        >
          {title}
        </h2>
        <p
          id="app-alert-message"
          className="text-sm text-[var(--color-ink-secondary)] leading-relaxed whitespace-pre-wrap break-words"
        >
          {detail.message}
        </p>
        <div className="flex justify-end mt-6">
          <button
            type="button"
            data-alert-ok
            onClick={close}
            className="px-5 py-2.5 text-sm font-medium rounded-[var(--radius-md)] bg-primary-500 hover:bg-primary-400 text-white transition-colors cursor-pointer"
          >
            Aceptar
          </button>
        </div>
      </div>
    </div>
  );
}
