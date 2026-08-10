export interface GreenTargetSalesReportPeriod {
  start_date: string;
  end_date: string;
}

export interface GreenTargetSalesReportCoverage {
  complete_from: string;
  is_complete: boolean;
}

export interface GreenTargetSalesReportLocation {
  location_id: number | null;
  site: string | null;
  address: string | null;
  phone_number: string | null;
}

export interface GreenTargetSalesReportPayment {
  payment_id: number;
  payment_date: string;
  posting_date: string | null;
  amount_paid: number;
  payment_method: "cash" | "cheque" | "bank_transfer" | "online" | null;
  payment_reference: string | null;
  internal_reference: string | null;
  status: "active" | "pending" | "cancelled" | null;
}

export interface GreenTargetSalesReportRow {
  invoice_id: number;
  invoice_number: string;
  date_issued: string;
  customer_name: string;
  legacy_particular: string | null;
  customer_phone_number: string | null;
  locations: GreenTargetSalesReportLocation[];
  amount_before_tax: number;
  total_amount: number;
  status: string;
  balance_due: number;
  amount_paid: number;
  adjustment_effect: number;
  payments: GreenTargetSalesReportPayment[];
}

export interface GreenTargetSalesReportTotals {
  total_sales: number;
  total_paid: number;
  total_outstanding: number;
  invoice_count: number;
  cancelled_count: number;
}

export interface GreenTargetSalesReportResponse {
  period: GreenTargetSalesReportPeriod;
  coverage: GreenTargetSalesReportCoverage;
  rows: GreenTargetSalesReportRow[];
  opening_balance: number;
  totals: GreenTargetSalesReportTotals;
}
