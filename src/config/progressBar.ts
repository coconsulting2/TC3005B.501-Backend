export const PROGRESS_BAR_COLORS = {
  primary: "bg-[var(--color-primary-200)]",
  secondary: "bg-[var(--color-secondary-200)]",
  success: "bg-[var(--color-success-200)]",
  warning: "bg-[var(--color-warning-200)]",
} as const;

export const PROGRESS_BAR_TRACK = "bg-[var(--color-neutral-50)]";

export const PROGRESS_BAR_SIZES = {
  small: "h-1.5",
  medium: "h-2.5",
  large: "h-4",
} as const;

export type ProgressBarColor = keyof typeof PROGRESS_BAR_COLORS;
export type ProgressBarSize = keyof typeof PROGRESS_BAR_SIZES;
