import { useCallback } from "react";
import { apiRequest } from "@utils/apiClient";
import ModalWrapper from "@components/ModalWrapper";
import { showAppAlert, showAppAlertAsync } from "@utils/appAlert";

interface Props {
  request_id: number;
  title: string;
  message: string;
  redirection: string;
  modal_type: "success" | "warning";
  variant?: "filled" | "border" | "empty";
  /** Si es false, el botón no abre el modal (p. ej. solicitud fuera de estado 6). */
  disabled?: boolean;
  children: React.ReactNode;
  token: string;
}

function mensajeDesdeApiError(detail: unknown): string {
  if (!detail || typeof detail !== "object") {
    return "No se pudo completar la solicitud.";
  }
  const d = detail as { status?: number; response?: unknown };
  const r = d.response;
  if (r && typeof r === "object") {
    const body = r as { error?: string; errors?: Array<{ msg?: string; path?: string }> };
    if (typeof body.error === "string" && body.error.trim()) {
      return body.error;
    }
    if (Array.isArray(body.errors) && body.errors.length > 0) {
      return body.errors
        .map((e) => (typeof e.msg === "string" ? e.msg : JSON.stringify(e)))
        .join(" · ");
    }
  }
  return d.status === 400
    ? "Solicitud no válida en este momento (400)."
    : "No se pudo completar la solicitud.";
}

export default function ValidateReceiptStatus({
  request_id,
  title,
  message,
  redirection,
  modal_type,
  variant,
  disabled = false,
  children,
  token,
}: Props) {
  const handleConfirm = useCallback(async () => {
    try {
      const url = `/applicant/send-expense-validation/${request_id}`;
      const data = await apiRequest<{ already_submitted?: boolean; message?: string }>(url, {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}` },
      });
      const okMsg =
        data?.already_submitted === true
          ? "La solicitud ya estaba en validación de comprobantes."
          : "Comprobantes enviados a revisión correctamente.";
      await showAppAlertAsync(okMsg, { variant: "success" });

      if (redirection) {
        window.location.href = redirection;
      } else {
        window.location.reload();
      }
    } catch (error) {
      console.error("Error en la solicitud:", error);
      const wrapped = error as { detail?: unknown };
      const msg = mensajeDesdeApiError(wrapped?.detail);
      showAppAlert(msg, { variant: "error" });
    }
  }, [request_id, redirection, token]);

  return (
    <ModalWrapper
      title={title}
      message={message}
      button_type={modal_type === "warning" ? "danger" : modal_type}
      modal_type={modal_type}
      disabled={disabled}
      onConfirm={handleConfirm}
      variant={variant}
    >
      {children}
    </ModalWrapper>
  );
}