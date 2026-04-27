/**
 * Author: Emiliano Deyta Illescas
 *
 * Description:
 * Approval inbox client island for `/autorizaciones` (M2-007).
 * Wraps `AuthRequestsList` with a responsive filter bar (date
 * range, monto, tipo nacional / internacional) so an N1 / N2
 * approver can narrow the queue before drilling into a request.
 * The filter bar collapses into a single column from 320px and
 * expands to a three-column grid from `sm:` upwards.
 *
 * For roles that cannot approve (e.g. `Administrador`), the
 * inbox renders a read-only banner so the user knows the screen
 * is informational only — the per-row "Ver más" still works,
 * because the detail page handles read-only mode separately.
 */

import { useMemo, useState } from "react";
import AuthRequestsList from "@components/RequestsLists/AuthRequestsList";
import type { UserRole } from "@type/roles";
import { canAuthorizeRequest } from "@utils/canAuthorize";

type TripType = "all" | "nacional" | "internacional";

interface ApprovalsInboxProps {
  data: any[];
  role: UserRole;
}

const MX = "MX";

function isInternational(request: Record<string, any>): boolean {
  const dest = (request?.destination_country ?? "").toString().trim().toUpperCase();
  if (!dest) return false;
  return dest !== MX && dest !== "MEXICO" && dest !== "MÉXICO";
}

function getRequestAmount(request: Record<string, any>): number {
  const candidate =
    request?.requested_fee ??
    request?.imposed_fee ??
    request?.amount ??
    0;
  const parsed = typeof candidate === "number" ? candidate : Number(candidate);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseDate(raw: unknown): Date | null {
  if (!raw) return null;
  const date = new Date(String(raw));
  return Number.isNaN(date.getTime()) ? null : date;
}

export default function ApprovalsInbox({ data, role }: ApprovalsInboxProps) {
  const readOnly = !canAuthorizeRequest(role);

  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [montoMin, setMontoMin] = useState("");
  const [montoMax, setMontoMax] = useState("");
  const [tipo, setTipo] = useState<TripType>("all");

  const filtered = useMemo(() => {
    const from = parseDate(dateFrom);
    const to = parseDate(dateTo);
    const min = montoMin === "" ? null : Number(montoMin);
    const max = montoMax === "" ? null : Number(montoMax);

    return data.filter((req) => {
      const start = parseDate(req?.beginning_date);
      if (from && start && start < from) return false;
      if (to && start && start > to) return false;

      const monto = getRequestAmount(req);
      if (min != null && Number.isFinite(min) && monto < min) return false;
      if (max != null && Number.isFinite(max) && monto > max) return false;

      if (tipo === "nacional" && isInternational(req)) return false;
      if (tipo === "internacional" && !isInternational(req)) return false;

      return true;
    });
  }, [data, dateFrom, dateTo, montoMin, montoMax, tipo]);

  const handleReset = () => {
    setDateFrom("");
    setDateTo("");
    setMontoMin("");
    setMontoMax("");
    setTipo("all");
  };

  const hasActiveFilters =
    dateFrom !== "" ||
    dateTo !== "" ||
    montoMin !== "" ||
    montoMax !== "" ||
    tipo !== "all";

  return (
    <div className="flex flex-col gap-6">
      {readOnly && (
        <div
          role="note"
          className="rounded-[var(--radius-md)] border border-[var(--color-neutral-200)] bg-[var(--color-surface-secondary)] px-4 py-3 text-sm text-[var(--color-ink-secondary)]"
        >
          Estás viendo la bandeja en <strong>modo solo lectura</strong>. Tu rol
          recibe notificaciones, pero no puede aprobar ni rechazar solicitudes
          desde esta pantalla.
        </div>
      )}

      <section
        aria-label="Filtros de la bandeja"
        className="card-editorial p-4 sm:p-5"
      >
        <div className="flex flex-col sm:flex-row sm:items-end gap-3 sm:gap-4">
          <fieldset className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 flex-1 min-w-0">
            <legend className="sr-only">Criterios de búsqueda</legend>

            <label className="flex flex-col gap-1 min-w-0">
              <span className="text-xs font-medium text-[var(--color-ink-secondary)]">
                Desde
              </span>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="border border-[var(--color-neutral-300)] rounded-[var(--radius-md)] px-3 min-h-11 text-sm bg-[var(--color-surface-white)] text-[var(--color-ink)] focus:outline-none focus:ring-2 focus:ring-primary-200 focus:border-primary-400"
              />
            </label>

            <label className="flex flex-col gap-1 min-w-0">
              <span className="text-xs font-medium text-[var(--color-ink-secondary)]">
                Hasta
              </span>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="border border-[var(--color-neutral-300)] rounded-[var(--radius-md)] px-3 min-h-11 text-sm bg-[var(--color-surface-white)] text-[var(--color-ink)] focus:outline-none focus:ring-2 focus:ring-primary-200 focus:border-primary-400"
              />
            </label>

            <label className="flex flex-col gap-1 min-w-0">
              <span className="text-xs font-medium text-[var(--color-ink-secondary)]">
                Monto mínimo (MXN)
              </span>
              <input
                type="number"
                inputMode="decimal"
                min={0}
                step="100"
                value={montoMin}
                placeholder="0"
                onChange={(e) => setMontoMin(e.target.value)}
                className="border border-[var(--color-neutral-300)] rounded-[var(--radius-md)] px-3 min-h-11 text-sm bg-[var(--color-surface-white)] text-[var(--color-ink)] focus:outline-none focus:ring-2 focus:ring-primary-200 focus:border-primary-400 tabular-nums"
              />
            </label>

            <label className="flex flex-col gap-1 min-w-0">
              <span className="text-xs font-medium text-[var(--color-ink-secondary)]">
                Monto máximo (MXN)
              </span>
              <input
                type="number"
                inputMode="decimal"
                min={0}
                step="100"
                value={montoMax}
                placeholder="∞"
                onChange={(e) => setMontoMax(e.target.value)}
                className="border border-[var(--color-neutral-300)] rounded-[var(--radius-md)] px-3 min-h-11 text-sm bg-[var(--color-surface-white)] text-[var(--color-ink)] focus:outline-none focus:ring-2 focus:ring-primary-200 focus:border-primary-400 tabular-nums"
              />
            </label>

            <label className="flex flex-col gap-1 min-w-0">
              <span className="text-xs font-medium text-[var(--color-ink-secondary)]">
                Tipo
              </span>
              <select
                value={tipo}
                onChange={(e) => setTipo(e.target.value as TripType)}
                className="border border-[var(--color-neutral-300)] rounded-[var(--radius-md)] px-3 min-h-11 text-sm bg-[var(--color-surface-white)] text-[var(--color-ink)] focus:outline-none focus:ring-2 focus:ring-primary-200 focus:border-primary-400"
              >
                <option value="all">Todos</option>
                <option value="nacional">Nacional</option>
                <option value="internacional">Internacional</option>
              </select>
            </label>
          </fieldset>

          <div className="flex items-end">
            <button
              type="button"
              onClick={handleReset}
              disabled={!hasActiveFilters}
              className="min-h-11 px-4 text-sm font-medium rounded-[var(--radius-md)] border border-[var(--color-neutral-300)] text-[var(--color-ink-secondary)] hover:bg-[var(--color-surface-secondary)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer w-full sm:w-auto"
            >
              Limpiar filtros
            </button>
          </div>
        </div>

        <p className="text-xs text-[var(--color-ink-muted)] mt-3 tabular-nums">
          {filtered.length} de {data.length}{" "}
          {data.length === 1 ? "solicitud" : "solicitudes"}
          {hasActiveFilters ? " coincide con los filtros" : ""}
        </p>
      </section>

      {filtered.length === 0 ? (
        <div className="card-editorial py-12 text-center text-sm text-[var(--color-ink-muted)]">
          {hasActiveFilters
            ? "Ninguna solicitud coincide con los filtros aplicados."
            : "No hay solicitudes pendientes en este momento."}
        </div>
      ) : (
        <AuthRequestsList data={filtered} role={role} />
      )}
    </div>
  );
}
