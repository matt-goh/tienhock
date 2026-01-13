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
}

export interface GreenTargetPayment {
  payment_id: number;
  invoice_id: string | number;
  payment_date: string;
  amount_paid: number;
  payment_method: "cash" | "cheque" | "bank_transfer" | "online";
  payment_reference?: string;
  internal_reference?: string;
  bank_account?: "CASH" | "BANK_PBB" | "BANK_ABB";
  journal_entry_id?: number;
  journal_reference_no?: string; // Reference number from associated journal entry (e.g., REC001/01)
  notes?: string;
  status?: "active" | "pending" | "cancelled" | "overpaid";
  customer_name?: string;
  customerid?: string;
  created_at?: string;
  cancellation_date?: string;
}