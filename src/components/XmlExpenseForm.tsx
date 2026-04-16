/**
 * Author: Emiliano Deyta
 *
 * Description:
 * Expense verification form that auto-fills from XML data parsed by the
 * backend. On XML upload, calls the parser endpoint, populates RFC emisor
 * (readonly), fecha emisión, monto total, UUID (readonly), expense type
 * (select), and notes. Validated with react-hook-form + zod.
 **/

import { useState, useCallback } from "react";
import { useForm, type SubmitHandler } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { apiRequest } from "@utils/apiClient";
import { EXPENSE_TYPES } from "@config/expenseForm";
import type { ParsedXmlData } from "@config/expenseForm";

/* ── Zod schema ── */

const expenseSchema = z.object({
  rfc_emisor: z.string().min(12, "RFC debe tener al menos 12 caracteres").max(13, "RFC no puede exceder 13 caracteres"),
  fecha_emision: z.string().min(1, "Fecha de emisión es requerida"),
  monto_total: z.number().positive("El monto debe ser mayor a 0"),
  uuid: z.string().min(1, "UUID es requerido"),
  receipt_type_id: z.number().min(1, "Selecciona un tipo de gasto"),
  notas: z.string().optional(),
});

type ExpenseFormData = z.infer<typeof expenseSchema>;

/* ── Props ── */

interface Props {
  receiptId: number;
  token: string;
  onSuccess?: () => void;
}

/* ── Component ── */

export default function XmlExpenseForm({ receiptId, token, onSuccess }: Props) {
  const [xmlFile, setXmlFile] = useState<File | null>(null);
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ExpenseFormData>({
    resolver: zodResolver(expenseSchema),
    defaultValues: {
      rfc_emisor: "",
      fecha_emision: "",
      monto_total: 0,
      uuid: "",
      receipt_type_id: 0,
      notas: "",
    },
  });

  const handleXmlUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      setXmlFile(file);
      setParsing(true);
      setParseError(null);

      try {
        const formData = new FormData();
        formData.append("xml", file);

        const res = await fetch(
          `${import.meta.env.PUBLIC_API_BASE_URL}/comprobantes/parse-xml`,
          {
            method: "POST",
            headers: { Authorization: `Bearer ${token}` },
            body: formData,
          },
        );

        if (!res.ok) throw new Error("Error al procesar el XML");

        const data: ParsedXmlData = await res.json();

        reset({
          rfc_emisor: data.rfc_emisor,
          fecha_emision: data.fecha_emision,
          monto_total: data.monto_total,
          uuid: data.uuid,
          receipt_type_id: 0,
          notas: "",
        });
      } catch {
        setParseError("No se pudo procesar el archivo XML. Verifica que sea un CFDI válido.");
      } finally {
        setParsing(false);
      }
    },
    [token, reset],
  );

  const onSubmit: SubmitHandler<ExpenseFormData> = async (data) => {
    setSubmitting(true);
    try {
      await apiRequest(`/comprobantes/${receiptId}/registrar`, {
        method: "POST",
        data,
        headers: { Authorization: `Bearer ${token}` },
      });
      onSuccess?.();
    } catch {
      setParseError("Error al guardar la comprobación. Intenta de nuevo.");
    } finally {
      setSubmitting(false);
    }
  };

  const inputBase =
    "w-full border rounded-[var(--radius-md)] px-3 py-2.5 text-sm bg-[var(--color-surface-white)] text-[var(--color-ink)] focus:outline-none focus:ring-2 focus:ring-primary-200 focus:border-primary-400 transition-colors";

  const readonlyClass =
    "bg-[var(--color-surface-secondary)] text-[var(--color-ink-muted)] cursor-not-allowed";

  return (
    <div className="card-editorial p-6 md:p-8">
      {/* XML Upload */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-[var(--color-ink-secondary)] mb-1.5">
          Archivo XML del CFDI <span className="text-accent-400">*</span>
        </label>
        <input
          type="file"
          accept=".xml"
          onChange={handleXmlUpload}
          disabled={parsing}
          className="block w-full text-sm text-[var(--color-ink-muted)] file:mr-4 file:py-2 file:px-4 file:rounded-[var(--radius-md)] file:border-0 file:text-sm file:font-medium file:bg-primary-100 file:text-primary-500 hover:file:bg-primary-200 file:cursor-pointer file:transition-colors"
        />
        {parsing && (
          <p className="text-xs text-[var(--color-ink-muted)] mt-1 animate-pulse">
            Procesando XML...
          </p>
        )}
        {xmlFile && !parsing && !parseError && (
          <p className="text-xs text-success-500 mt-1">
            {xmlFile.name} cargado correctamente
          </p>
        )}
        {parseError && (
          <p className="text-xs text-accent-400 mt-1">{parseError}</p>
        )}
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        {/* RFC + UUID — readonly row */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div>
            <label className="block text-sm font-medium text-[var(--color-ink-secondary)] mb-1.5">
              RFC Emisor
            </label>
            <input
              {...register("rfc_emisor")}
              readOnly
              className={`${inputBase} ${readonlyClass}`}
              placeholder="Se llenará al subir XML"
            />
            {errors.rfc_emisor && (
              <p className="text-xs text-accent-400 mt-1">{errors.rfc_emisor.message}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-[var(--color-ink-secondary)] mb-1.5">
              UUID
            </label>
            <input
              {...register("uuid")}
              readOnly
              className={`${inputBase} ${readonlyClass}`}
              placeholder="Se llenará al subir XML"
            />
            {errors.uuid && (
              <p className="text-xs text-accent-400 mt-1">{errors.uuid.message}</p>
            )}
          </div>
        </div>

        {/* Fecha + Monto — editable row */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div>
            <label className="block text-sm font-medium text-[var(--color-ink-secondary)] mb-1.5">
              Fecha de Emisión <span className="text-accent-400">*</span>
            </label>
            <input
              {...register("fecha_emision")}
              type="datetime-local"
              className={`${inputBase} ${errors.fecha_emision ? "border-accent-400" : "border-[var(--color-neutral-300)]"}`}
            />
            {errors.fecha_emision && (
              <p className="text-xs text-accent-400 mt-1">{errors.fecha_emision.message}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-[var(--color-ink-secondary)] mb-1.5">
              Monto Total <span className="text-accent-400">*</span>
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[var(--color-ink-muted)]">
                $
              </span>
              <input
                {...register("monto_total")}
                type="number"
                step="0.01"
                min="0"
                className={`${inputBase} pl-7 ${errors.monto_total ? "border-accent-400" : "border-[var(--color-neutral-300)]"}`}
              />
            </div>
            {errors.monto_total && (
              <p className="text-xs text-accent-400 mt-1">{errors.monto_total.message}</p>
            )}
          </div>
        </div>

        {/* Tipo de gasto */}
        <div>
          <label className="block text-sm font-medium text-[var(--color-ink-secondary)] mb-1.5">
            Tipo de Gasto <span className="text-accent-400">*</span>
          </label>
          <select
            {...register("receipt_type_id")}
            className={`${inputBase} ${errors.receipt_type_id ? "border-accent-400" : "border-[var(--color-neutral-300)]"}`}
          >
            <option value={0}>Seleccionar tipo de gasto</option>
            {EXPENSE_TYPES.map((type) => (
              <option key={type.id} value={type.id}>
                {type.name}
              </option>
            ))}
          </select>
          {errors.receipt_type_id && (
            <p className="text-xs text-accent-400 mt-1">{errors.receipt_type_id.message}</p>
          )}
        </div>

        {/* Notas */}
        <div>
          <label className="block text-sm font-medium text-[var(--color-ink-secondary)] mb-1.5">
            Notas <span className="text-[var(--color-ink-muted)]">(opcional)</span>
          </label>
          <textarea
            {...register("notas")}
            rows={3}
            className={`${inputBase} border-[var(--color-neutral-300)] resize-none`}
            placeholder="Observaciones adicionales..."
          />
        </div>

        {/* Submit */}
        <div className="flex justify-end pt-2">
          <button
            type="submit"
            disabled={submitting}
            className="px-6 py-2.5 text-sm font-medium rounded-[var(--radius-md)] bg-primary-500 text-white hover:bg-primary-400 active:bg-primary-300 transition-all duration-200 focus:ring-2 focus:ring-primary-200 focus:ring-offset-1 disabled:bg-neutral-300 disabled:text-neutral-400 disabled:cursor-not-allowed"
          >
            {submitting ? "Guardando..." : "Guardar Comprobación"}
          </button>
        </div>
      </form>
    </div>
  );
}
