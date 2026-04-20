import { useCallback, useState } from "react";
import { apiRequest } from "@utils/apiClient";
import ModalWrapper from "@components/ModalWrapper";
import Toast from "@components/Toast";

interface Props {
  request_id: number;
  endpoint: string;
  /** ID del usuario autenticado (misma cookie `id` / sesión); la API usa :user_id, no role_id. */
  user_id: string;
  title: string;
  message: string;
  redirection: string;
  modal_type: "success" | "warning";
  children: React.ReactNode;
  token: string;
}

export default function TravelRequestActionWrapper({
  request_id,
  endpoint,
  user_id,
  title,
  message,
  redirection,
  modal_type,
  children,
  token,
}: Props) {
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const handleConfirm = useCallback(async () => {
    try {
      const url = `${endpoint}/${request_id}/${user_id}`;
      await apiRequest(url, { 
        method: "PUT",
        headers: { Authorization: `Bearer ${token}` }
      });

      if (endpoint.includes("authorize-travel-request")) {
        setToast({ message: 'Solicitud autorizada exitosamente.', type: 'success' });
        await new Promise(resolve => setTimeout(resolve, 2000));
      } else if (endpoint.includes("decline-travel-request")) {
        setToast({ message: 'Solicitud rechazada exitosamente.', type: 'success' });
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
      if (redirection) {
        window.location.href = redirection;
      } else {
        window.location.reload();
      }
    } catch (error) {
      console.error("Error en la solicitud:", error);
      const detail = error && typeof error === "object" && "detail" in error
        ? (error as { detail?: { response?: { error?: string } } }).detail
        : undefined;
      const msg =
        detail?.response && typeof detail.response.error === "string"
          ? detail.response.error
          : "No se pudo completar la acción. Intenta de nuevo.";
      setToast({ message: msg, type: "error" });
    }
  }, [request_id, endpoint, redirection, user_id, token]);

  return (
    <>
      <ModalWrapper
        title={title}
        message={message}
        button_type={modal_type === "warning" ? "danger" : modal_type}
        modal_type={modal_type}
        onConfirm={handleConfirm}
      >
        {children}
      </ModalWrapper>
      {toast && <Toast message={toast.message} type={toast.type} />}
    </>
  );
}