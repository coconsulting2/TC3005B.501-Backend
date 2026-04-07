/**
 * @file prisma/middleware.js
 * @description Prisma client extension replicating the 5 MariaDB triggers:
 *   1. DeactivateRequest (BEFORE UPDATE Request)
 *   2. CreateAlert (AFTER INSERT Request)
 *   3. ManageAlertAfterRequestUpdate (AFTER UPDATE Request)
 *   4. DeductFromWalletOnFeeImposed (AFTER UPDATE Request)
 *   5. AddToWalletOnReceiptApproved (AFTER UPDATE Receipt)
 *
 * Migrated from the legacy `prisma.$use` middleware API (removed in Prisma 5+)
 * to the `$extends` Client Extensions API.
 */
import { Prisma } from "@prisma/client";

export const triggerExtension = Prisma.defineExtension((client) =>
  client.$extends({
    name: "cocoscheme-triggers",
    query: {
      request: {
        // --- Trigger 2: CreateAlert (AFTER INSERT) ---
        async create({ args, query }) {
          const result = await query(args);
          const statusId = result.requestStatusId;
          const alertMessage = await client.alertMessage.findUnique({
            where: { messageId: statusId },
          });
          if (alertMessage) {
            await client.alert.create({
              data: {
                requestId: result.requestId,
                messageId: statusId,
              },
            });
          }
          return result;
        },

        async update({ args, query }) {
          // --- Trigger 1: DeactivateRequest (BEFORE UPDATE) ---
          const incomingStatusId = args.data?.requestStatusId;
          if (incomingStatusId === 9 || incomingStatusId === 10) {
            args.data.active = false;
          }

          // Fetch old values before the update (needed by triggers 3 & 4)
          const oldRequest = await client.request.findUnique({
            where: args.where,
            select: { requestStatusId: true, imposedFee: true, userId: true },
          });

          const result = await query(args);

          if (oldRequest) {
            // --- Trigger 3: ManageAlertAfterRequestUpdate (AFTER UPDATE) ---
            const newStatusId = result.requestStatusId;
            if ([8, 9, 10].includes(newStatusId)) {
              await client.alert.deleteMany({
                where: { requestId: result.requestId },
              });
            } else if (oldRequest.requestStatusId !== newStatusId) {
              await client.alert.updateMany({
                where: { requestId: result.requestId },
                data: { messageId: newStatusId },
              });
            }

            // --- Trigger 4: DeductFromWalletOnFeeImposed (AFTER UPDATE) ---
            const newFee = result.imposedFee;
            const oldFee = oldRequest.imposedFee;
            if (
              newFee !== null &&
              newFee !== undefined &&
              (oldFee === null || oldFee === undefined || newFee !== oldFee)
            ) {
              const diff = newFee - (oldFee || 0);
              if (diff !== 0 && result.userId) {
                await client.user.update({
                  where: { userId: result.userId },
                  data: { wallet: { decrement: diff } },
                });
              }
            }
          }

          return result;
        },
      },

      receipt: {
        // --- Trigger 5: AddToWalletOnReceiptApproved (AFTER UPDATE) ---
        async update({ args, query }) {
          const oldReceipt = await client.receipt.findUnique({
            where: args.where,
            select: { validation: true },
          });

          const result = await query(args);

          if (
            oldReceipt &&
            result.validation === "Aprobado" &&
            oldReceipt.validation !== "Aprobado"
          ) {
            const request = await client.request.findUnique({
              where: { requestId: result.requestId },
              select: { userId: true },
            });
            if (request && request.userId) {
              await client.user.update({
                where: { userId: request.userId },
                data: { wallet: { increment: result.amount } },
              });
            }
          }

          return result;
        },
      },
    },
  }),
);
