// GreenTarget-specific type definitions

export interface GreenTargetInvoice {
  invoice_id: number;
  invoice_number: string;
  customer_id: number;
  customer_name: string;
  date_issued: string;
  total_amount: number;
  current_balance: number;
  status?: string;
  amount_paid?: number;
  amount_before_tax?: number;
  tax_amount?: number;
  type?: string;
  rental_id?: number;
  date_placed?: string;
  date_picked?: string;
  einvoice_status?: "valid" | "invalid" | "pending" | "cancelled" | null;
  uuid?: string | null;
  long_id?: string | null;
  tin_number?: string;
  id_number?: string;
  consolidated_part_of?: any;
  debtor_account_code?: string | null;
  revenue_account_code?: "TGA" | "TGB" | "WS_OTH" | null;
}

export interface GreenTargetPayment {
  payment_id: number;
  invoice_id: string | number;
  invoice_number?: string;
  payment_date: string;
  amount_paid: number | string;
  payment_method: "cash" | "cheque" | "bank_transfer" | "online";
  payment_reference?: string | null;
  internal_reference?: string | null;
  bank_account?: "PBB_1" | null;
  journal_entry_id?: number | null;
  journal_reference_no?: string | null;
  receipt_id?: number;
  posting_date?: string | null;
  notes?: string | null;
  status?: "active" | "pending" | "cancelled" | null;
  customer_name?: string;
  customerid?: string;
  created_at?: string;
  cancellation_date?: string | null;
}

export type GreenTargetReceiptStatus = "pending" | "posted" | "cancelled";

export interface GreenTargetReceiptGroupHeader {
  receipt_id: number;
  display_reference: string;
  received_date: string;
  posting_date: string | null;
  payment_method: GreenTargetPayment["payment_method"];
  payment_reference: string | null;
  bank_account: string;
  status: GreenTargetReceiptStatus;
  origin: "erp" | "legacy_operational";
  total_amount: number;
  cancellation_date: string | null;
  cancellation_reason: string | null;
}

export interface GreenTargetReceiptGroupJournal {
  journal_entry_id: number;
  reference_no: string;
  entry_date: string;
  status: string;
}

export interface GreenTargetReceiptGroupAllocation {
  payment_id: number;
  invoice_id: number;
  invoice_number: string;
  customer_id: number;
  customer_name: string;
  amount_paid: number;
  status: GreenTargetPayment["status"];
}

export interface GreenTargetReceiptGroupDetails {
  receipt: GreenTargetReceiptGroupHeader;
  representative_payment_id: number | null;
  journal: GreenTargetReceiptGroupJournal | null;
  allocations: GreenTargetReceiptGroupAllocation[];
}

export interface GreenTargetPaymentAllocationInput {
  invoice_id: number;
  amount_paid: number;
}

export interface CreateGreenTargetPaymentInput {
  invoice_id: number;
  payment_date: string;
  amount_paid: number;
  payment_method: GreenTargetPayment["payment_method"];
  payment_reference: string | null;
  internal_reference: string;
}

export interface CreateGreenTargetPaymentBatchInput {
  payment_date: string;
  payment_method: GreenTargetPayment["payment_method"];
  payment_reference: string | null;
  internal_reference: string;
  allocations: GreenTargetPaymentAllocationInput[];
}

export interface UpdateGreenTargetPaymentReferencesInput {
  internal_reference?: string | null;
  payment_reference?: string | null;
  expected_internal_reference?: string;
}

export interface GreenTargetPaymentMutationResponse {
  message: string;
  payment: GreenTargetPayment;
  payments?: GreenTargetPayment[];
}

export interface GreenTargetPaymentBatchResponse {
  message: string;
  payments: GreenTargetPayment[];
}

export interface GreenTargetPaymentReferenceAvailability {
  available: boolean;
  exists: boolean;
  existing_id: number | null;
}
