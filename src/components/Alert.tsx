/**
 * Author: Leonardo Rodriguez
 *
 * Description:
 * Alert component — editorial style with desaturated colors and left border accent.
 */

import { useState } from "react";

type AlertType = "info" | "success" | "warning" | "error";

interface AlertProps {
  children: React.ReactNode;
  type?: AlertType;
  title?: string;
  dismissible?: boolean;
  onDismiss?: () => void;
  className?: string;
}

const typeClasses: Record<AlertType, string> = {
  info: "bg-[var(--color-surface-secondary)] border-[var(--color-ink-muted)] text-[var(--color-ink-secondary)]",
  success: "bg-success-50 border-success-400 text-success-500",
  warning: "bg-warning-50 border-warning-400 text-warning-500",
  error: "bg-accent-50 border-accent-400 text-accent-500",
};

const iconPaths: Record<AlertType, string> = {
  info: "M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
  success: "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z",
  warning: "M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z",
  error: "M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z",
};

export default function Alert({
  children,
  type = "info",
  title,
  dismissible = false,
  onDismiss,
  className = "",
}: AlertProps) {
  const [visible, setVisible] = useState(true);
  if (!visible) return null;

  const handleDismiss = () => {
    setVisible(false);
    onDismiss?.();
  };

  return (
    <div
      className={`flex items-start gap-3 p-4 border-l-4 rounded-[var(--radius-md)] ${typeClasses[type]} ${className}`}
      role="alert"
    >
      <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={iconPaths[type]} />
      </svg>
      <div className="flex-1 min-w-0">
        {title && <p className="font-medium text-sm mb-1">{title}</p>}
        <div className="text-sm">{children}</div>
      </div>
      {dismissible && (
        <button
          onClick={handleDismiss}
          className="flex-shrink-0 ml-auto p-1 rounded hover:bg-black/5 transition-colors cursor-pointer"
          aria-label="Cerrar alerta"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>
  );
}
