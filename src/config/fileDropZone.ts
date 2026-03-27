export const FILE_DROP_ZONE_STYLES = {
  idle: "border-[var(--color-neutral-300)] bg-white",
  hover: "border-[var(--color-primary-200)] bg-[var(--color-primary-50)]/10",
  error: "border-[var(--color-warning-200)] bg-[var(--color-warning-50)]/10",
  disabled: "border-[var(--color-neutral-200)] bg-[var(--color-neutral-50)] opacity-60 cursor-not-allowed",
} as const;

export type FileDropZoneState = keyof typeof FILE_DROP_ZONE_STYLES;
