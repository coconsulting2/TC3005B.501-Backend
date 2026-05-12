import prisma from "../database/config/prisma.js";
import ViaticasPolicy from "../models/viaticasPolicyModel.js";

/**
 * Checks if the requested fee for a travel request exceeds the org's viaticos policy.
 * Uses hotel_needed to determine which cap applies: maxHotel if hotel_needed, else maxMeal.
 * Throws { status: 422 } when the fee exceeds the applicable cap.
 * @param {number} applicantId
 * @param {number} requestedFee
 * @param {boolean} hotelNeeded
 * @throws {{ status: number, message: string }}
 */
export async function checkFeeVsViaticosPolicy(applicantId, requestedFee, hotelNeeded) {
  const user = await prisma.user.findUnique({
    where: { userId: Number(applicantId) },
    select: { organizationId: true },
  });
  if (!user?.organizationId) return;

  const policy = await ViaticasPolicy.getByOrg(user.organizationId);
  if (!policy || !policy.active) return;

  const cap = hotelNeeded ? policy.max_hotel : policy.max_meal;
  const label = hotelNeeded ? "hotel" : "comidas";

  if (Number(requestedFee) > cap) {
    const err = new Error(
      `La tarifa solicitada (${requestedFee} ${policy.currency}) excede el tope de ${label} definido en la política de viáticos (${cap} ${policy.currency}).`
    );
    err.status = 422;
    throw err;
  }
}
