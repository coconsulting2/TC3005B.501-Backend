import { useCallback, useState } from "react";
import { apiRequest } from "@utils/apiClient";
import ModalWrapper from "@components/ModalWrapper";
import Toast from "@components/Toast";

function mensajeErrorApi(error: unknown): string {
  if (!error || typeof error !== "object" || !("detail" in error)) {
    return "No se pudo rechazar el comprobante.";
  }
  const d = (error as { detail?: unknown }).detail;
  if (!d || typeof d !== "object" || !("response" in d)) {
    return "No se pudo rechazar el comprobante.";
  }
  const r = (d as { response?: { error?: string } }).response;
  if (r && typeof r.error === "string" && r.error.trim()) return r.error;
  return "No se pudo rechazar el comprobante.";
}

interface Props {
  receipt_id: number;
  title: string;
  message: string;
  redirection: string;
  modal_type: "success" | "warning";
  variant?: "filled" | "border" | "empty";
  children: React.ReactNode;
  disabled?: boolean;
  token: string;
}

export default function RejectReceipStatus({
  receipt_id,
  title,
  message,
  redirection,
  modal_type,
  variant,
  children,
  disabled = false,
  token,
}: Props) {
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const handleConfirm = useCallback(async () => {
    try {
        const url = `/accounts-payable/validate-receipt/${receipt_id}`;
      await apiRequest(url, { 
        method: "PUT", 
        data: {"approval": 0},
        headers: { Authorization: `Bearer ${token}` }
      });
      setToast({ message: "Rechazado correctamente", type: "success" });
      await new Promise((r) => setTimeout(r, 1600));
      window.location.reload();
    } catch (error) {
      console.error("Error en la solicitud:", error);
      setToast({ message: mensajeErrorApi(error), type: "error" });
    }
  }, [receipt_id, token]);

  return (
    <>
      <ModalWrapper
        title={title}
        message={message}
        button_type={modal_type === "warning" ? "danger" : modal_type}
        modal_type={modal_type}
        onConfirm={handleConfirm}
        variant={variant}
        disabled={disabled}
      >
        {children}
      </ModalWrapper>
      {toast && <Toast message={toast.message} type={toast.type} duration={toast.type === "error" ? 5000 : 3500} />}
    </>
  );
}