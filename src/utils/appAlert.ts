/**
 * Sustituto de window.alert() — dispara un diálogo editorial (AppAlertHost en MainLayout).
 * Uso: import { showAppAlert } from "@utils/appAlert";
 */

export type AppAlertVariant = "info" | "success" | "warning" | "error";

export type AppAlertOptions = {
  title?: string;
  variant?: AppAlertVariant;
};

export const COCO_ALERT_EVENT = "coco:alert";

/** Se emite al cerrar el diálogo (Aceptar u overlay), para await showAppAlertAsync. */
export const COCO_ALERT_CLOSED_EVENT = "coco:alert-closed";

export type CocoAlertDetail = AppAlertOptions & {
  message: string;
};

export function showAppAlert(message: string, options?: AppAlertOptions): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<CocoAlertDetail>(COCO_ALERT_EVENT, {
      detail: {
        message,
        title: options?.title,
        variant: options?.variant ?? "info",
      },
    }),
  );
}

/** Igual que un alert() nativo: el Promise resuelve cuando el usuario pulsa Aceptar o cierra el diálogo. */
export function showAppAlertAsync(message: string, options?: AppAlertOptions): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window === "undefined") {
      resolve();
      return;
    }
    const done = () => {
      window.removeEventListener(COCO_ALERT_CLOSED_EVENT, done);
      resolve();
    };
    window.addEventListener(COCO_ALERT_CLOSED_EVENT, done);
    showAppAlert(message, options);
  });
}
