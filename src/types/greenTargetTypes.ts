// GreenTarget-specific type definitions

export type GreenTargetRevenueAccountCode = "TGA" | "TGB" | "WS_OTH";
export type GreenTargetRevenueSplitAccountCode =
  | GreenTargetRevenueAccountCode
  | "WS_OTH4";

/**
 * One ordered revenue line for a Green Target invoice journal. Account codes
 * are intentionally not unique: the legacy journals sometimes contain two
 * separate lines posted to the same revenue account.
 */
export interface GreenTargetRevenueSplit {
  line_number: number;
  account_code: GreenTargetRevenueSplitAccountCode;
  amount: number;
}

export interface GreenTargetDebtorSubledgerIdentity {
  code: string;
  description: string;
  control_account_code: string;
  kind: string;
  effective_from: string;
  effective_to: string | null;
  sort_order: number;
  is_active: boolean;
  is_selectable: boolean;
}

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
  receivable_account_code?: string | null;
  revenue_account_code?: GreenTargetRevenueSplitAccountCode | null;
  revenue_splits?: GreenTargetRevenueSplit[];
  edit_dependencies?: {
    has_receipts: boolean;
    has_adjustments: boolean;
    journal_manual_override: boolean;
  };
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
  // Pre-cutover receipts post no journal of their own — the collection is
  // already inside the imported ledger, in the invoice's own '#/#' journal.
  imported_journal_entry_id?: number | null;
  imported_journal_reference?: string | null;
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

// A payment's rentals are derived through its invoice (invoice_rentals), never
// stored on the payment: one invoice can cover several rentals.
export interface GreenTargetReceiptAllocationRental {
  rental_id: number;
  tong_no: string;
  date_placed: string;
  date_picked: string | null;
  location_site: string | null;
  location_address: string | null;
}

export interface GreenTargetReceiptGroupAllocation {
  payment_id: number;
  invoice_id: number;
  invoice_number: string;
  customer_id: number;
  customer_name: string;
  amount_paid: number;
  status: GreenTargetPayment["status"];
  rentals: GreenTargetReceiptAllocationRental[];
  // Set only for pre-cutover allocations, whose collection sits in the
  // invoice's imported '#/#' journal instead of a receipt-owned journal.
  imported_journal: GreenTargetImportedJournalRef | null;
}

export interface GreenTargetImportedJournalRef {
  journal_entry_id: number;
  reference_no: string;
  entry_date: string;
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
  // Join an existing receipt header instead of opening a new one. The header
  // owns the banking event, so the date, method and cheque/transaction
  // reference sent alongside are ignored by the server.
  receipt_id?: number;
}

export interface CreateGreenTargetPaymentBatchInput {
  payment_date: string;
  payment_method: GreenTargetPayment["payment_method"];
  payment_reference: string | null;
  internal_reference: string;
  allocations: GreenTargetPaymentAllocationInput[];
  // Join an existing receipt header instead of opening a new one. The header
  // owns the banking event, so the date, method and cheque/transaction
  // reference sent alongside are ignored by the server.
  receipt_id?: number;
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
  receipt?: {
    receipt_id: number;
    display_reference: string;
    received_date: string;
    payment_method: GreenTargetPayment["payment_method"];
    payment_reference: string | null;
    status: GreenTargetReceiptStatus;
    total_amount: number;
    joined: boolean;
  };
}

export type GreenTargetReceiptJoinBlockReason =
  | "cancelled"
  | "manual_override"
  | "invoice_already_allocated";

export interface GreenTargetReceiptJoinCandidate {
  receipt_id: number;
  display_reference: string;
  received_date: string;
  posting_date: string | null;
  payment_method: GreenTargetPayment["payment_method"];
  payment_reference: string | null;
  status: GreenTargetReceiptStatus;
  origin: "erp" | "legacy_operational";
  total_amount: number;
  allocation_count: number;
}

export interface GreenTargetReceiptByReferenceResponse {
  exists: boolean;
  receipt: GreenTargetReceiptJoinCandidate | null;
  joinable: boolean;
  block_reason: GreenTargetReceiptJoinBlockReason | null;
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
