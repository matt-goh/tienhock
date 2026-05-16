export interface ConsolidatedAmounts {
  subtotal: number;
  tax: number;
  rounding: number;
  total: number;
}

export interface ConsolidatedReceiptGroup<TInvoice = any> {
  description: string;
  invoices: TInvoice[];
  amounts: ConsolidatedAmounts;
}

export function toAmount(value: unknown): number;

export function formatAmount(amount: number): string;

export function escapeXmlText(value: unknown): string;

export function getInvoiceReference(invoice: unknown): string;

export function createConsolidatedReceiptGroups<TInvoice>(
  invoices: TInvoice[],
  getAmounts?: (invoice: TInvoice) => ConsolidatedAmounts
): ConsolidatedReceiptGroup<TInvoice>[];
