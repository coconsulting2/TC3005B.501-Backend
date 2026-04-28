import { useCallback, useState } from "react";
import { apiRequest } from "@utils/apiClient";
import Modal from "@components/Modal";
import Toast from "@components/Toast";
import { getButtonClasses } from "@type/button";

interface Props {
  request_id: number;
  token: string;
}

export default function TravelRequestAuthorizeActions({
  request_id,
  token,
}: Props) {
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);
  const [approveOpen, setApproveOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [comment, setComment] = useState("");
  const [reassignOpen, setReassignOpen] = useState(false);
  const [targetUserId, setTargetUserId] = useState("");
  const [motivo, setMotivo] = useState("");

  const redirectDashboard = () => {
    window.location.href = "/dashboard";
  };

  const handleApprove = useCallback(async () => {
    try {
      await apiRequest(`/solicitudes/${request_id}/aprobar`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        data: {},
      });
      setApproveOpen(false);
      setToast({
        message: "Solicitud actualizada correctamente.",
        type: "success",
      });
      await new Promise((r) => setTimeout(r, 1500));
      redirectDashboard();
    } catch (error) {
      console.error(error);
      const detail =
        error &&
        typeof error === "object" &&
        "detail" in error
          ? (error as { detail?: { response?: { error?: string } } }).detail
          : undefined;
      const msg =
        detail?.response && typeof detail.response === "object" &&
        detail.response !== null &&
        "error" in detail.response &&
        typeof (detail.response as { error?: string }).error === "string"
          ? (detail.response as { error: string }).error
          : "No se pudo completar la acción.";
      setToast({ message: msg, type: "error" });
    }
  }, [request_id, token]);

  const handleRejectConfirm = useCallback(async () => {
    const c = comment.trim();
    if (!c) {
      setToast({
        message: "El comentario es obligatorio para rechazar.",
        type: "error",
      });
      return;
    }
    try {
      await apiRequest(`/solicitudes/${request_id}/rechazar`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        data: { comentario: c },
      });
      setRejectOpen(false);
      setComment("");
      setToast({ message: "Solicitud rechazada.", type: "success" });
      await new Promise((r) => setTimeout(r, 1500));
      redirectDashboard();
    } catch (error) {
      console.error(error);
      const detail =
        error &&
        typeof error === "object" &&
        "detail" in error
          ? (error as { detail?: { response?: { error?: string } } }).detail
          : undefined;
      const msg =
        detail?.response && typeof detail.response === "object" &&
        detail.response !== null &&
        "error" in detail.response &&
        typeof (detail.response as { error?: string }).error === "string"
          ? (detail.response as { error: string }).error
          : "No se pudo rechazar la solicitud.";
      setToast({ message: msg, type: "error" });
    }
  }, [request_id, token, comment]);

  const handleReassign = useCallback(async () => {
    const uid = Number(targetUserId.trim());
    const m = motivo.trim();
    if (!Number.isFinite(uid) || uid < 1) {
      setToast({
        message: "Indica un ID de usuario destino válido.",
        type: "error",
      });
      return;
    }
    if (!m) {
      setToast({ message: "El motivo es obligatorio.", type: "error" });
      return;
    }
    try {
      await apiRequest(`/solicitudes/${request_id}/reasignar`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        data: { userId: uid, motivo: m },
      });
      setReassignOpen(false);
      setTargetUserId("");
      setMotivo("");
      setToast({ message: "Tarea reasignada.", type: "success" });
    } catch (error) {
      console.error(error);
      const detail =
        error &&
        typeof error === "object" &&
        "detail" in error
          ? (error as { detail?: { response?: { error?: string } } }).detail
          : undefined;
      const msg =
        detail?.response && typeof detail.response === "object" &&
        detail.response !== null &&
        "error" in detail.response &&
        typeof (detail.response as { error?: string }).error === "string"
          ? (detail.response as { error: string }).error
          : "No se pudo reasignar.";
      setToast({ message: msg, type: "error" });
    }
  }, [request_id, token, targetUserId, motivo]);

  const btnPrimary = getButtonClasses({
    variant: "filled",
    color: "success",
    size: "medium",
  });
  const btnDanger = getButtonClasses({
    variant: "filled",
    color: "danger",
    size: "medium",
  });
  const btnNeutral = getButtonClasses({
    variant: "border",
    color: "primary",
    size: "medium",
  });

  return (
    <>
      <div className="flex flex-wrap justify-end gap-4 mt-8">
        <button
          type="button"
          className={btnPrimary}
          onClick={() => setApproveOpen(true)}
        >
          Aceptar
        </button>
        <button
          type="button"
          className={btnDanger}
          onClick={() => setRejectOpen(true)}
        >
          Rechazar
        </button>
        <button
          type="button"
          className={btnNeutral}
          onClick={() => setReassignOpen(true)}
        >
          Reasignar
        </button>
      </div>

      <Modal
        title="Confirmar autorización"
        message="¿Está seguro de que desea autorizar esta solicitud?"
        type="success"
        show={approveOpen}
        onClose={() => setApproveOpen(false)}
        onConfirm={handleApprove}
        confirmLabel="Confirmar"
      />

      <Modal
        title="Rechazar autorización"
        message="Indique el motivo del rechazo (obligatorio)."
        type="warning"
        show={rejectOpen}
        onClose={() => {
          setRejectOpen(false);
          setComment("");
        }}
        onConfirm={handleRejectConfirm}
        confirmLabel="Rechazar"
      >
        <label className="block text-sm text-[var(--color-ink-secondary)] mb-1" htmlFor="reject-comment">
          Comentario
        </label>
        <textarea
          id="reject-comment"
          className="w-full min-h-[100px] border border-[var(--color-neutral-300)] rounded-[var(--radius-md)] p-2 text-sm"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Motivo del rechazo…"
        />
      </Modal>

      <Modal
        title="Reasignar aprobación"
        message="Asigne otro usuario con rol N1 o N2 e indique el motivo."
        type="confirm"
        show={reassignOpen}
        onClose={() => {
          setReassignOpen(false);
          setTargetUserId("");
          setMotivo("");
        }}
        onConfirm={handleReassign}
        confirmLabel="Guardar"
      >
        <label className="block text-sm text-[var(--color-ink-secondary)] mb-1" htmlFor="reassign-user">
          ID usuario destino
        </label>
        <input
          id="reassign-user"
          type="number"
          min={1}
          className="w-full border border-[var(--color-neutral-300)] rounded-[var(--radius-md)] p-2 text-sm mb-3"
          value={targetUserId}
          onChange={(e) => setTargetUserId(e.target.value)}
        />
        <label className="block text-sm text-[var(--color-ink-secondary)] mb-1" htmlFor="reassign-motivo">
          Motivo
        </label>
        <textarea
          id="reassign-motivo"
          className="w-full min-h-[80px] border border-[var(--color-neutral-300)] rounded-[var(--radius-md)] p-2 text-sm"
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          placeholder="Motivo de la reasignación…"
        />
      </Modal>

      {toast && <Toast message={toast.message} type={toast.type} />}
    </>
  );
}
