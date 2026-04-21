import React, { useState, useRef } from "react";
import FileDropZone from "@components/FileDropZone";
import type { FileDropZoneHandle, ReceiptUploadResponse } from "@components/FileDropZone";
import CfdiDevPreview, { isDevTaxPreviewEnabled } from "@components/CfdiDevPreview";
import Button from "@components/Button.tsx";
import { submitTravelExpense } from "@components/SubmitTravelWarper";
import ModalWrapper from "@components/ModalWrapper.tsx";
import { apiRequest } from "@utils/apiClient";
import { extractCfdiUuidFromXml } from "@utils/cfdiXml";

const API_BASE_URL = import.meta.env.PUBLIC_API_BASE_URL;

function formatRegistroError(err: unknown): string {
  if (err && typeof err === "object" && "detail" in err) {
    const d = (err as { detail?: unknown }).detail;
    if (d && typeof d === "object" && "response" in d) {
      const r = (d as { response?: { error?: string; details?: string; message?: string } }).response;
      if (r && typeof r === "object") {
        if (typeof r.error === "string") return r.error;
        if (typeof r.details === "string") return r.details;
        if (typeof r.message === "string") return r.message;
      }
    }
    if (d && typeof d === "object" && "status" in d) {
      return `Error HTTP ${(d as { status: number }).status} al registrar CFDI`;
    }
  }
  return "No se pudo registrar el CFDI (SAT o validación en servidor)";
}

function formatCreateReceiptError(err: unknown): string {
  if (err && typeof err === "object" && "detail" in err) {
    const d = (err as { detail?: { response?: unknown; status?: number } }).detail;
    const r = d?.response;
    if (r && typeof r === "object" && r !== null && "error" in r && typeof (r as { error: string }).error === "string") {
      return (r as { error: string }).error;
    }
    if (typeof d?.status === "number") return `Error ${d.status} al crear el comprobante.`;
  }
  return "No se pudo crear el comprobante. Revisa la conexión o vuelve a intentar.";
}

interface Props {
  requestId: number;
  token: string;
  receiptToReplace?: string | null;
}

export default function ExpensesFormClient({ requestId, token, receiptToReplace }: Props) {
  const [concepto, setConcepto] = useState("Transporte");
  const [monto, setMonto] = useState("");
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [xmlFile, setXmlFile] = useState<File | null>(null);
  const [isInternational, setIsInternational] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [devUploadResult, setDevUploadResult] = useState<ReceiptUploadResponse | null>(null);
  const [devReceiptId, setDevReceiptId] = useState<number | null>(null);
  const [devRegistroResponse, setDevRegistroResponse] = useState<unknown | null>(null);
  const [devRegistroError, setDevRegistroError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState(false);

  const dropZoneRef = useRef<FileDropZoneHandle>(null);
  const showDevPanel = isDevTaxPreviewEnabled();

  const handleSubmit = async () => {
    try {
      setSubmitting(true);
      setDevUploadResult(null);
      setDevReceiptId(null);
      setDevRegistroResponse(null);
      setDevRegistroError(null);

      if (!concepto || !monto || isNaN(parseFloat(monto)) || !pdfFile || (!isInternational && !xmlFile)) {
        alert("Por favor, completa todos los campos correctamente.");
        setSubmitting(false);
        return;
      }

      let cfdiUuid: string | null = null;
      if (!isInternational && xmlFile) {
        const xmlText = await xmlFile.text();
        cfdiUuid = extractCfdiUuidFromXml(xmlText);
        if (!cfdiUuid) {
          alert("No se pudo leer el UUID del XML. Verifica que sea un CFDI con TimbreFiscalDigital válido.");
          setSubmitting(false);
          return;
        }
      }

      let lastReceiptId: number | null = null;
      try {
        const res = await submitTravelExpense({
          requestId,
          concepto,
          monto: parseFloat(monto),
          token,
          cfdiUuid: cfdiUuid ?? undefined,
          allowMissingCfdiUuid: isInternational,
        });
        lastReceiptId = res.lastReceiptId;
      } catch (createErr) {
        alert(formatCreateReceiptError(createErr));
        setSubmitting(false);
        return;
      }

      if (!lastReceiptId) {
        alert("No se pudo crear el comprobante.");
        setSubmitting(false);
        return;
      }

      // 2. If replacing an old receipt, delete it first
      if (receiptToReplace) {
        try {
          await apiRequest(`/applicant/delete-receipt/${receiptToReplace}`, {
            method: "DELETE",
            headers: { Authorization: `Bearer ${token}` },
          });
        } catch (delErr) {
          console.error("Error eliminando comprobante anterior:", delErr);
        }
      }

      // 3. Upload files via FileDropZone's imperative handle (real progress bar)
      const uploadUrl = `${API_BASE_URL}/files/upload-receipt-files/${lastReceiptId}`;
      const uploadRes = await dropZoneRef.current!.upload(uploadUrl);

      // 4. Persistir CFDI en cfdi_comprobantes + SAT cuando el XML permitió armar el cuerpo
      if (uploadRes.registro_sugerido && typeof uploadRes.registro_sugerido === "object") {
        try {
          const regRes = await apiRequest(`/comprobantes/${lastReceiptId}`, {
            method: "POST",
            data: uploadRes.registro_sugerido,
            headers: { Authorization: `Bearer ${token}` },
          });
          if (showDevPanel) {
            setDevRegistroResponse(regRes);
          }
        } catch (regErr) {
          console.error(regErr);
          const msg = formatRegistroError(regErr);
          setDevRegistroError(msg);
          alert(msg);
          if (showDevPanel) {
            setDevUploadResult(uploadRes);
            setDevReceiptId(lastReceiptId);
          }
          setSubmitting(false);
          return;
        }
      }

      if (showDevPanel) {
        setDevUploadResult(uploadRes);
        setDevReceiptId(lastReceiptId);
        setUploadSuccess(true);
        setSubmitting(false);
        return;
      }

      setUploadSuccess(true);
      setSubmitting(false);
    } catch (err) {
      console.error(err);
      setSubmitting(false);
    }
  };

  if (uploadSuccess) {
    return (
      <div className="space-y-6 rounded-[var(--radius-md)] border border-[var(--color-neutral-200)] bg-[var(--color-surface-secondary)] p-6">
        <p className="text-sm font-medium text-[var(--color-ink)]">
          Comprobante registrado correctamente.
        </p>
        <p className="text-xs text-[var(--color-ink-muted)]">
          Ya puedes revisar tus comprobantes o volver al inicio. No es necesario volver a subir el mismo archivo.
        </p>
        <div className="flex flex-wrap gap-3 pt-2">
          <a
            href="/dashboard"
            className="inline-flex items-center justify-center rounded-[var(--radius-md)] bg-primary-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-primary-600 transition-colors"
          >
            Ir al dashboard
          </a>
          <a
            href={`/comprobar-solicitud/${requestId}`}
            className="inline-flex items-center justify-center rounded-[var(--radius-md)] border border-[var(--color-neutral-300)] bg-[var(--color-surface-white)] px-4 py-2.5 text-sm font-medium text-[var(--color-ink)] hover:bg-[var(--color-surface-secondary)] transition-colors"
          >
            Volver a comprobantes
          </a>
        </div>
        {showDevPanel && devReceiptId != null && devUploadResult != null && (
          <CfdiDevPreview
            requestId={requestId}
            receiptId={devReceiptId}
            apiBaseUrl={API_BASE_URL}
            upload={devUploadResult}
            registroResponse={devRegistroResponse}
            registroError={devRegistroError}
          />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Form fields ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
        <div>
          <label
            htmlFor="concepto"
            className="block text-sm font-medium mb-1.5 text-[var(--color-ink-secondary)]"
          >
            Concepto
          </label>
          <select
            id="concepto"
            name="concepto"
            className="w-full border border-[var(--color-neutral-300)] rounded-[var(--radius-md)] px-3 py-2.5 text-sm bg-[var(--color-surface-white)] text-[var(--color-ink)] focus:outline-none focus:ring-2 focus:ring-primary-200 focus:border-primary-400 transition-colors"
            value={concepto}
            onChange={(e) => setConcepto(e.target.value)}
          >
            <option>Transporte</option>
            <option>Hospedaje</option>
            <option>Comida</option>
            <option>Caseta</option>
            <option>Autobús</option>
            <option>Vuelo</option>
            <option>Otro</option>
          </select>
        </div>
        <div>
          <label
            htmlFor="monto"
            className="block text-sm font-medium mb-1.5 text-[var(--color-ink-secondary)]"
          >
            Monto
          </label>
          <input
            id="monto"
            type="number"
            step="0.01"
            className="w-full border border-[var(--color-neutral-300)] rounded-[var(--radius-md)] px-3 py-2.5 text-sm bg-[var(--color-surface-white)] text-[var(--color-ink)] placeholder:text-[var(--color-ink-subtle)] focus:outline-none focus:ring-2 focus:ring-primary-200 focus:border-primary-400 transition-colors"
            placeholder="Ej. 443.50"
            value={monto}
            onChange={(e) => setMonto(e.target.value)}
            required
          />
        </div>
      </div>

      {/* ── International toggle ── */}
      <label className="flex items-center gap-2 text-sm text-[var(--color-ink-secondary)] cursor-pointer">
        <input
          type="checkbox"
          checked={isInternational}
          onChange={(e) => setIsInternational(e.target.checked)}
          className="accent-primary-400"
        />
        Es viaje internacional
      </label>

      {/* ── Drag & drop file zone ── */}
      <FileDropZone
        ref={dropZoneRef}
        token={token}
        isInternational={isInternational}
        onPdfChange={setPdfFile}
        onXmlChange={setXmlFile}
      />

      {/* ── Actions ── */}
      <div className="flex justify-end gap-4 pt-4">
        <a href={`/comprobar-solicitud/${requestId}`}>
          <Button type="button" variant="border" color="danger">
            Cancelar
          </Button>
        </a>
        <ModalWrapper
          title="Subir comprobación"
          message="¿Está seguro de que desea subir este Comprobante?"
          modal_type="confirm"
          button_type="primary"
          variant="filled"
          disabled={submitting}
          onConfirm={handleSubmit}
        >
          Subir Comprobante
        </ModalWrapper>
      </div>
    </div>
  );
}
