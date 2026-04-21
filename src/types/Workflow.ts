/**
 * Workflow simulator types (M2-008).
 * Mirrors the contract expected from POST /workflow/simulate.
 */

export type ExpenseType =
  | "viaje_nacional"
  | "viaje_internacional"
  | "hospedaje"
  | "transporte"
  | "alimentos"
  | "otros";

export type DestinationKind = "nacional" | "internacional";

export interface WorkflowSimulationInput {
  monto: number;
  tipo_gasto: ExpenseType;
  destino: DestinationKind;
}

export type StepStatus = "pending" | "auto_approved" | "escalated" | "skipped";

export interface WorkflowStep {
  level: number;
  role: string;
  role_label: string;
  limit: number | null;
  status: StepStatus;
  note?: string;
}

export interface WorkflowSimulationResult {
  input: WorkflowSimulationInput;
  steps: WorkflowStep[];
  total_levels: number;
  auto_approved: boolean;
  escalation_triggered: boolean;
  summary: string;
}
