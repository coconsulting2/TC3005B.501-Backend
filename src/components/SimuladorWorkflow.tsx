/**
 * SimuladorWorkflow — admin tool to preview the approval path for a
 * test amount before activating workflow changes. Submits to
 * POST /workflow/simulate and visualizes the resulting levels in a
 * horizontal diagram with jump / escalation cues (M2-008).
 */

import { useState } from "react";
import Button from "@components/Button";
import { apiRequest } from "@utils/apiClient";
import { formatMxn, simulateWorkflowLocally } from "@utils/workflowSimulator";
import type {
  DestinationKind,
  ExpenseType,
  WorkflowSimulationInput,
  WorkflowSimulationResult,
  WorkflowStep,
} from "@type/Workflow";

const EXPENSE_OPTIONS: { value: ExpenseType; label: string }[] = [
  { value: "viaje_nacional", label: "Viaje nacional" },
  { value: "viaje_internacional", label: "Viaje internacional" },
  { value: "hospedaje", label: "Hospedaje" },
  { value: "transporte", label: "Transporte" },
  { value: "alimentos", label: "Alimentos" },
  { value: "otros", label: "Otros" },
];

const DESTINATION_OPTIONS: { value: DestinationKind; label: string }[] = [
  { value: "nacional", label: "Nacional" },
  { value: "internacional", label: "Internacional" },
];

interface SimuladorWorkflowProps {
  apiEndpoint?: string;
  token?: string;
}

const STATUS_STYLE: Record<
  WorkflowStep["status"],
  { pill: string; label: string; dot: string }
> = {
  pending: {
    pill: "bg-primary-50 text-primary-500",
    label: "Pendiente",
    dot: "bg-primary-500",
  },
  auto_approved: {
    pill: "bg-success-50 text-success-500",
    label: "Auto-aprobado",
    dot: "bg-success-500",
  },
  escalated: {
    pill: "bg-warning-50 text-warning-500",
    label: "Escalación",
    dot: "bg-warning-500",
  },
  skipped: {
    pill: "bg-[var(--color-surface-secondary)] text-[var(--color-ink-muted)]",
    label: "Omitido",
    dot: "bg-[var(--color-ink-muted)]",
  },
};

const INITIAL_INPUT: WorkflowSimulationInput = {
  monto: 15000,
  tipo_gasto: "viaje_nacional",
  destino: "nacional",
};

export default function SimuladorWorkflow({
  apiEndpoint = "/workflow/simulate",
  token,
}: SimuladorWorkflowProps) {
  const [input, setInput] = useState<WorkflowSimulationInput>(INITIAL_INPUT);
  const [result, setResult] = useState<WorkflowSimulationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updateInput = <K extends keyof WorkflowSimulationInput>(
    key: K,
    value: WorkflowSimulationInput[K]
  ) => {
    setInput((prev) => ({ ...prev, [key]: value }));
  };

  const handleSimulate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    if (!Number.isFinite(input.monto) || input.monto <= 0) {
      setError("Ingresa un monto mayor a cero.");
      setResult(null);
      return;
    }

    setLoading(true);
    try {
      let remote: WorkflowSimulationResult | null = null;
      try {
        remote = await apiRequest<WorkflowSimulationResult>(apiEndpoint, {
          method: "POST",
          data: input,
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        });
      } catch (err) {
        console.warn("[SimuladorWorkflow] API unavailable, using local rules", err);
      }
      setResult(remote ?? simulateWorkflowLocally(input));
    } catch (err) {
      console.error(err);
      setError("No se pudo simular el flujo. Intenta de nuevo.");
      setResult(null);
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setInput(INITIAL_INPUT);
    setResult(null);
    setError(null);
  };

  return (
    <div className="space-y-8">
      <form
        onSubmit={handleSimulate}
        className="card-editorial p-6 space-y-5"
        aria-label="Parámetros de la simulación"
      >
        <div>
          <p className="eyebrow mb-1">Parámetros</p>
          <h2 className="font-editorial text-xl text-[var(--color-ink)] font-normal">
            Simulación de flujo de aprobación
          </h2>
          <p className="text-sm text-[var(--color-ink-muted)] mt-1">
            Ingresa un monto de prueba para ver qué niveles de autorización
            tendría que recorrer la solicitud.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label
              htmlFor="sim-monto"
              className="block text-sm font-medium mb-1.5 text-[var(--color-ink-secondary)]"
            >
              Monto (MXN) <span className="text-accent-400">*</span>
            </label>
            <input
              id="sim-monto"
              type="number"
              min={0}
              step="100"
              value={input.monto}
              onChange={(e) => updateInput("monto", Number(e.target.value))}
              className="w-full border border-[var(--color-neutral-300)] rounded-[var(--radius-md)] px-3 py-2.5 text-sm bg-[var(--color-surface-white)] text-[var(--color-ink)] focus:outline-none focus:ring-2 focus:ring-primary-200 focus:border-primary-400 transition-colors tabular-nums"
            />
          </div>
          <div>
            <label
              htmlFor="sim-tipo"
              className="block text-sm font-medium mb-1.5 text-[var(--color-ink-secondary)]"
            >
              Tipo de gasto <span className="text-accent-400">*</span>
            </label>
            <select
              id="sim-tipo"
              value={input.tipo_gasto}
              onChange={(e) => updateInput("tipo_gasto", e.target.value as ExpenseType)}
              className="w-full border border-[var(--color-neutral-300)] rounded-[var(--radius-md)] px-3 py-2.5 text-sm bg-[var(--color-surface-white)] text-[var(--color-ink)] focus:outline-none focus:ring-2 focus:ring-primary-200 focus:border-primary-400 transition-colors"
            >
              {EXPENSE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label
              htmlFor="sim-destino"
              className="block text-sm font-medium mb-1.5 text-[var(--color-ink-secondary)]"
            >
              Destino <span className="text-accent-400">*</span>
            </label>
            <select
              id="sim-destino"
              value={input.destino}
              onChange={(e) =>
                updateInput("destino", e.target.value as DestinationKind)
              }
              className="w-full border border-[var(--color-neutral-300)] rounded-[var(--radius-md)] px-3 py-2.5 text-sm bg-[var(--color-surface-white)] text-[var(--color-ink)] focus:outline-none focus:ring-2 focus:ring-primary-200 focus:border-primary-400 transition-colors"
            >
              {DESTINATION_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {error && (
          <p className="text-sm text-accent-400" role="alert">
            {error}
          </p>
        )}

        <div className="flex flex-col sm:flex-row justify-end gap-3 pt-2">
          <Button type="button" variant="border" color="accent" onClick={handleReset} disabled={loading}>
            Limpiar
          </Button>
          <Button type="submit" variant="filled" color="primary" disabled={loading}>
            {loading ? "Simulando..." : "Simular flujo"}
          </Button>
        </div>
      </form>

      {result && (
        <section aria-label="Resultado de la simulación" className="space-y-6">
          <div className="card-editorial p-6">
            <p className="eyebrow mb-2">Resultado</p>
            <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
              <div>
                <p className="money-display text-3xl text-[var(--color-ink)]">
                  {formatMxn(result.input.monto)}
                </p>
                <p className="text-sm text-[var(--color-ink-muted)] mt-1">
                  {
                    EXPENSE_OPTIONS.find(
                      (o) => o.value === result.input.tipo_gasto
                    )?.label
                  }
                  {" · "}
                  {
                    DESTINATION_OPTIONS.find(
                      (o) => o.value === result.input.destino
                    )?.label
                  }
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <span className="status-pill bg-[var(--color-surface-secondary)] text-[var(--color-ink-secondary)]">
                  {result.total_levels} nivel{result.total_levels === 1 ? "" : "es"}
                </span>
                {result.auto_approved && (
                  <span className="status-pill bg-success-50 text-success-500">
                    Auto-aprobación
                  </span>
                )}
                {result.escalation_triggered && (
                  <span className="status-pill bg-warning-50 text-warning-500">
                    Escalación
                  </span>
                )}
              </div>
            </div>
            <p className="text-sm text-[var(--color-ink-secondary)] mt-4">
              {result.summary}
            </p>
          </div>

          <div className="card-editorial p-6">
            <p className="eyebrow mb-4">Ruta de aprobación</p>

            {result.steps.length === 0 ? (
              <p className="text-sm text-[var(--color-ink-muted)]">
                No hay pasos que mostrar.
              </p>
            ) : (
              <ol className="flex flex-col lg:flex-row lg:items-stretch gap-0">
                {result.steps.map((step, idx) => {
                  const style = STATUS_STYLE[step.status];
                  const isLast = idx === result.steps.length - 1;
                  const hasJump =
                    !isLast &&
                    result.steps[idx + 1].level - step.level > 1;
                  return (
                    <li
                      key={`${step.level}-${step.role}`}
                      className="flex-1 flex flex-col lg:flex-row lg:items-stretch min-w-0"
                    >
                      <div className="flex-1 border border-[var(--color-neutral-200)] rounded-[var(--radius-md)] p-4 bg-[var(--color-surface-white)]">
                        <div className="flex items-center gap-2 mb-2">
                          <span
                            className={`inline-block w-2 h-2 rounded-full ${style.dot}`}
                            aria-hidden="true"
                          />
                          <p className="eyebrow">Nivel {step.level}</p>
                          <span className={`status-pill ml-auto ${style.pill}`}>
                            {style.label}
                          </span>
                        </div>
                        <p className="text-sm font-medium text-[var(--color-ink)]">
                          {step.role_label}
                        </p>
                        <p className="text-xs text-[var(--color-ink-muted)] mt-1 tabular-nums">
                          Límite: {step.limit == null ? "Sin límite" : formatMxn(step.limit)}
                        </p>
                        {step.note && (
                          <p className="text-xs text-[var(--color-ink-secondary)] mt-2 border-l-2 border-[var(--color-neutral-300)] pl-2">
                            {step.note}
                          </p>
                        )}
                      </div>
                      {!isLast && (
                        <div
                          className="flex items-center justify-center my-2 lg:my-0 lg:mx-2 text-[var(--color-ink-muted)]"
                          aria-hidden="true"
                        >
                          <span className="hidden lg:inline text-lg leading-none">
                            {hasJump ? "⟶⟶" : "→"}
                          </span>
                          <span className="lg:hidden text-lg leading-none">
                            {hasJump ? "↓↓" : "↓"}
                          </span>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ol>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
