export const MODAL_TYPES = ["confirm", "warning", "error", "success"] as const;

export type ModalType = (typeof MODAL_TYPES)[number];

export const MODAL_STYLES: Record<ModalType, string> = {
  confirm: "border-neutral-200",
  warning: "border-warning-300",
  error: "border-accent-400",
  success: "border-success-300",
};
