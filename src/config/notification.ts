export const NOTIFICATION_TYPES = ["success", "error", "info", "warning"] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const NOTIFICATION_STYLES: Record<NotificationType, string> = {
  success: "border-[var(--color-success-300)] bg-[var(--color-success-50)]/20 text-[var(--color-success-500)]",
  error: "border-[var(--color-warning-300)] bg-[var(--color-warning-50)]/20 text-[var(--color-warning-500)]",
  info: "border-[var(--color-primary-300)] bg-[var(--color-primary-50)]/20 text-[var(--color-primary-500)]",
  warning: "border-[var(--color-secondary-300)] bg-[var(--color-secondary-50)]/20 text-[var(--color-secondary-500)]",
};

export const NOTIFICATION_ICONS: Record<NotificationType, string> = {
  success: "M5 13l4 4L19 7",
  error: "M6 18L18 6M6 6l12 12",
  info: "M13 16h-1v-4h-1m1-4h.01M12 2a10 10 0 100 20 10 10 0 000-20z",
  warning: "M12 9v2m0 4h.01M12 2a10 10 0 100 20 10 10 0 000-20z",
};

export interface Notification {
  id: string;
  message: string;
  type: NotificationType;
  duration?: number;
}
