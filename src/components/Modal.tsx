/**
 * Author: Leonardo Rodriguez
 *
 * Description:
 * Modal component — editorial style with 1px border, no heavy colors.
 * Overlay with subtle blur, focus trap, escape key handler.
 */

import { useEffect, useRef, useCallback } from "react";
import { MODAL_STYLES } from "@config/modal";
import type { ModalType } from "@config/modal";

interface ModalProps {
  title: string;
  message: string;
  type?: ModalType;
  onClose: () => void;
  onConfirm?: () => void;
  show: boolean;
  confirmLabel?: string;
  cancelLabel?: string;
  children?: React.ReactNode;
}

export default function Modal({
  title,
  message,
  type = "confirm",
  onClose,
  onConfirm,
  show,
  confirmLabel = "Confirmar",
  cancelLabel = "Cancelar",
  children,
}: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);

  const handleEscape = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose]
  );

  const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose();
  };

  useEffect(() => {
    if (!show) return;
    document.addEventListener("keydown", handleEscape);
    document.body.style.overflow = "hidden";

    const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    if (focusable && focusable.length > 0) focusable[0].focus();

    return () => {
      document.removeEventListener("keydown", handleEscape);
      document.body.style.overflow = "";
    };
  }, [show, handleEscape]);

  if (!show) return null;

  const confirmColors = type === "error" || type === "warning"
    ? "bg-accent-400 hover:bg-accent-300 text-white"
    : "bg-primary-500 hover:bg-primary-400 text-white";

  return (
    <div
      className="fixed inset-0 flex items-center justify-center z-50 bg-[var(--color-ink)]/30 backdrop-blur-sm p-4"
      onClick={handleOverlayClick}
    >
      <div
        ref={dialogRef}
        className={`bg-[var(--color-surface-white)] border rounded-[var(--radius-lg)] p-6 w-full max-w-md ${MODAL_STYLES[type]}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        aria-describedby="modal-message"
      >
        <h2
          id="modal-title"
          className="font-editorial text-xl font-normal text-[var(--color-ink)] mb-2"
        >
          {title}
        </h2>
        <p id="modal-message" className="mb-4 text-sm text-[var(--color-ink-secondary)]">
          {message}
        </p>
        {children}
        <div className="flex justify-end gap-2 mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-[var(--color-ink-secondary)] bg-transparent border border-[var(--color-neutral-300)] rounded-[var(--radius-md)] hover:bg-[var(--color-surface-secondary)] transition-colors cursor-pointer"
          >
            {cancelLabel}
          </button>
          {onConfirm && (
            <button
              onClick={onConfirm}
              className={`px-4 py-2 text-sm font-medium rounded-[var(--radius-md)] transition-colors cursor-pointer ${confirmColors}`}
            >
              {confirmLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
