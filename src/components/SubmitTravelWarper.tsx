import { apiRequest } from "@utils/apiClient";

const receiptTypeMap: Record<string, number> = {
  "Autobús": 5,
  "Caseta": 4,
  "Comida": 2,
  "Hospedaje": 1,
  "Otro": 7,
  "Transporte": 3,
  "Vuelo": 6,
};

interface SubmitExpenseParams {
  requestId: number;
  concepto: string;
  monto: number;
  token: string;
  /** UUID del TimbreFiscalDigital (obligatorio salvo viaje internacional sin XML real). */
  cfdiUuid?: string | null;
  /** Viaje internacional con XML sustituto: el backend no exige cfdi_uuid ni anti-duplicado por UUID. */
  allowMissingCfdiUuid?: boolean;
}

export async function submitTravelExpense({
  requestId,
  concepto,
  monto,
  token,
  cfdiUuid,
  allowMissingCfdiUuid = false,
}: SubmitExpenseParams): Promise<{ count: number; lastReceiptId: number | null }> {
  const receipt_type_id = receiptTypeMap[concepto];
  if (!receipt_type_id) throw new Error(`Concepto inválido: ${concepto}`);

  const receiptRow: {
    receipt_type_id: number;
    request_id: number;
    amount: number;
    cfdi_uuid?: string;
  } = {
    receipt_type_id,
    request_id: requestId,
    amount: monto,
  };
  if (cfdiUuid && cfdiUuid.trim()) {
    receiptRow.cfdi_uuid = cfdiUuid.trim().toLowerCase();
  }

  const payload: {
    receipts: typeof receiptRow[];
    allow_missing_cfdi_uuid?: boolean;
  } = {
    receipts: [receiptRow],
  };
  if (allowMissingCfdiUuid) {
    payload.allow_missing_cfdi_uuid = true;
  }

  await apiRequest("/applicant/create-expense-validation", {
    method: "POST",
    data: payload,
    headers: { Authorization: `Bearer ${token}` }
  });

  // Espera un momento dice mike
  await new Promise((res) => setTimeout(res, 500));

  const res = await apiRequest(`/accounts-payable/get-expense-validations/${requestId}`, { 
    method: "GET",
    headers: { Authorization: `Bearer ${token}` } 
  });

  const expenses = res.Expenses ?? [];
  const count = expenses.length;

  expenses.sort((a: { receipt_id: number }, b: { receipt_id: number }) => b.receipt_id - a.receipt_id);
  const lastReceiptId = count > 0 ? expenses[0].receipt_id : null;

  //alert(`Comprobante enviado exitosamente.`);

  return { count, lastReceiptId };
}
