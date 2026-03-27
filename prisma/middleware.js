/**
 * @file prisma/middleware.js
 * @description Prisma middleware replicating the 5 MariaDB triggers:
 *   1. DeactivateRequest (BEFORE UPDATE Request)
 *   2. CreateAlert (AFTER INSERT Request)
 *   3. ManageAlertAfterRequestUpdate (AFTER UPDATE Request)
 *   4. DeductFromWalletOnFeeImposed (AFTER UPDATE Request)
 *   5. AddToWalletOnReceiptApproved (AFTER UPDATE Receipt)
 */

/**
 * Registers all trigger middleware on the given PrismaClient instance.
 * @param {import('@prisma/client').PrismaClient} prisma
 */
export function registerMiddleware(prisma) {
  // ---------- REQUEST MIDDLEWARE ----------
  prisma.$use(async (params, next) => {
    if (params.model !== "Request") return next(params);

    // --- Trigger 1: DeactivateRequest (BEFORE UPDATE) ---
    if (params.action === "update") {
      const statusId = params.args.data?.requestStatusId;
      if (statusId === 9 || statusId === 10) {
        params.args.data.active = false;
      }
    }

    // Fetch old values before update (needed by triggers 3 & 4)
    let oldRequest = null;
    if (params.action === "update") {
      const where = params.args.where;
      oldRequest = await prisma.request.findUnique({
        where,
        select: { requestStatusId: true, imposedFee: true, userId: true },
      });
    }

    const result = await next(params);

    // --- Trigger 2: CreateAlert (AFTER INSERT) ---
    if (params.action === "create") {
      const statusId = result.requestStatusId;
      const alertMessage = await prisma.alertMessage.findUnique({
        where: { messageId: statusId },
      });
      if (alertMessage) {
        await prisma.alert.create({
          data: {
            requestId: result.requestId,
            messageId: statusId,
          },
        });
      }
    }

    // --- Trigger 3: ManageAlertAfterRequestUpdate (AFTER UPDATE) ---
    if (params.action === "update" && oldRequest) {
      const newStatusId = result.requestStatusId;

      if ([8, 9, 10].includes(newStatusId)) {
        await prisma.alert.deleteMany({
          where: { requestId: result.requestId },
        });
      } else if (oldRequest.requestStatusId !== newStatusId) {
        await prisma.alert.updateMany({
          where: { requestId: result.requestId },
          data: { messageId: newStatusId },
        });
      }
    }

    // --- Trigger 4: DeductFromWalletOnFeeImposed (AFTER UPDATE) ---
    if (params.action === "update" && oldRequest) {
      const newFee = result.imposedFee;
      const oldFee = oldRequest.imposedFee;

      if (newFee !== null && newFee !== undefined && (oldFee === null || oldFee === undefined || newFee !== oldFee)) {
        const diff = newFee - (oldFee || 0);
        if (diff !== 0 && result.userId) {
          await prisma.user.update({
            where: { userId: result.userId },
            data: { wallet: { decrement: diff } },
          });
        }
      }
    }

    return result;
  });

  // ---------- RECEIPT MIDDLEWARE ----------
  prisma.$use(async (params, next) => {
    if (params.model !== "Receipt") return next(params);

    // Fetch old validation before update (needed by trigger 5)
    let oldReceipt = null;
    if (params.action === "update") {
      const where = params.args.where;
      oldReceipt = await prisma.receipt.findUnique({
        where,
        select: { validation: true },
      });
    }

    const result = await next(params);

    // --- Trigger 5: AddToWalletOnReceiptApproved (AFTER UPDATE) ---
    if (params.action === "update" && oldReceipt) {
      if (result.validation === "Aprobado" && oldReceipt.validation !== "Aprobado") {
        const request = await prisma.request.findUnique({
          where: { requestId: result.requestId },
          select: { userId: true },
        });
        if (request && request.userId) {
          await prisma.user.update({
            where: { userId: request.userId },
            data: { wallet: { increment: result.amount } },
          });
        }
      }
    }

    return result;
  });
}
