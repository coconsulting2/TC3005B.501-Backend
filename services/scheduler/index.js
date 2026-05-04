/**
 * @module scheduler
 * @description Registro de jobs cron del backend (M2-006).
 *   Activación controlada por `SCHEDULER_ENABLED=true` en .env. Para deployments
 *   multi-instancia, activar en una sola instancia o agregar pg_advisory_lock
 *   (deuda futura documentada en plan §12).
 *
 *   Schedules:
 *     - escalationJob:   "0 * * * *"       cada hora (RF-35 absorbido)
 *     - refundDeadlineJob: "0 3 * * *"     diario a las 03:00 (RF-39)
 */
import cron from "node-cron";
import { runEscalationJob } from "./escalationJob.js";
import { runRefundDeadlineJob } from "./refundDeadlineJob.js";

const ESCALATION_SCHEDULE = process.env.SCHEDULER_ESCALATION_CRON || "0 * * * *";
const REFUND_DEADLINE_SCHEDULE = process.env.SCHEDULER_REFUND_DEADLINE_CRON || "0 3 * * *";

let started = false;
const tasks = [];

/**
 * Starts cron jobs if SCHEDULER_ENABLED=true. Idempotent: subsequent calls are no-ops.
 * @returns {{ enabled: boolean, jobs: string[] }}
 */
export function startScheduler() {
  if (started) return { enabled: true, jobs: tasks.map((t) => t.name) };
  if (process.env.SCHEDULER_ENABLED !== "true") {
    console.warn("Scheduler disabled (SCHEDULER_ENABLED != 'true')");
    return { enabled: false, jobs: [] };
  }

  const escalation = cron.schedule(ESCALATION_SCHEDULE, async () => {
    try {
      const r = await runEscalationJob();
      console.warn(`[scheduler.escalation] scanned=${r.scanned} escalated=${r.escalated}`);
    } catch (e) {
      console.error("[scheduler.escalation] error:", e?.message || e);
    }
  });
  tasks.push({ name: "escalationJob", task: escalation });

  const deadline = cron.schedule(REFUND_DEADLINE_SCHEDULE, async () => {
    try {
      const r = await runRefundDeadlineJob();
      console.warn(`[scheduler.refundDeadline] scanned=${r.scanned} locked=${r.locked}`);
    } catch (e) {
      console.error("[scheduler.refundDeadline] error:", e?.message || e);
    }
  });
  tasks.push({ name: "refundDeadlineJob", task: deadline });

  started = true;
  console.warn(`Scheduler started — escalation:"${ESCALATION_SCHEDULE}" deadline:"${REFUND_DEADLINE_SCHEDULE}"`);
  return { enabled: true, jobs: tasks.map((t) => t.name) };
}

/**
 * Stops all running cron tasks. Useful for tests and graceful shutdown.
 */
export function stopScheduler() {
  for (const { task } of tasks) {
    try { task.stop(); } catch { /* ignore */ }
  }
  tasks.length = 0;
  started = false;
}
