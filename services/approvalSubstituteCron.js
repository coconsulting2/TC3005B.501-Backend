import approvalSubstituteService from "./approvalSubstituteService.js";

let cronTask = null;

/**
 * Executes one sweep cycle for pending approvals.
 */
export async function runApprovalSubstituteSweep() {
  try {
    const result = await approvalSubstituteService.processStaleApprovals(new Date());
    if (result.reassigned || result.escalated) {
      console.warn("[approval-substitutes] sweep:", result);
    }
  } catch (error) {
    console.error("[approval-substitutes] sweep failed:", error);
  }
}

/**
 * Starts hourly cron to process approvals stale for over 48 hours.
 */
export async function startApprovalSubstituteCron() {
  if (process.env.NODE_ENV === "test" || cronTask) return;

  try {
    const mod = await import("node-cron");
    const cron = mod.default ?? mod;
    cronTask = cron.schedule("0 * * * *", runApprovalSubstituteSweep, {
      timezone: process.env.TZ || "America/Mexico_City",
    });
    console.warn("[approval-substitutes] hourly cron started");
  } catch (error) {
    console.warn(
      "[approval-substitutes] node-cron unavailable, job not started:",
      error?.message ?? error,
    );
  }
}

/**
 * Stops the running cron task.
 */
export function stopApprovalSubstituteCron() {
  if (cronTask) {
    cronTask.stop();
    cronTask = null;
  }
}

