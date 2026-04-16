/**
 * Author: Emiliano Deyta
 *
 * Configuration for the XML expense verification form.
 * Expense types mirror the backend receiptTypeMap from SubmitTravelWarper.
 **/

export const EXPENSE_TYPES = [
  { id: 1, name: "Hospedaje" },
  { id: 2, name: "Comida" },
  { id: 3, name: "Transporte" },
  { id: 4, name: "Caseta" },
  { id: 5, name: "Autobús" },
  { id: 6, name: "Vuelo" },
  { id: 7, name: "Otro" },
] as const;

export type ExpenseTypeId = (typeof EXPENSE_TYPES)[number]["id"];

/** Shape returned by the backend XML parser endpoint */
export interface ParsedXmlData {
  rfc_emisor: string;
  fecha_emision: string;
  monto_total: number;
  uuid: string;
}
