export interface GreenTargetDebtorSubScheduleRow {
  account_no: string;
  particular: string;
  closing_balance: number;
  current_month: number;
  previous_month: number;
  source_page: number | null;
  source_row: number | null;
}

export interface GreenTargetDebtorSubScheduleTotals {
  closing_balance: number;
  current_month: number;
  previous_month: number;
}

export interface GreenTargetDebtorSubScheduleResponse {
  statement_date: string;
  statement_month: number;
  statement_year: number;
  rows: GreenTargetDebtorSubScheduleRow[];
  totals: GreenTargetDebtorSubScheduleTotals;
  visible_totals: GreenTargetDebtorSubScheduleTotals;
  reconciliation_residual: GreenTargetDebtorSubScheduleTotals;
  total_accounts: number;
  full_population: number;
  page: number;
  limit: number;
  total_pages: number;
}

export interface GreenTargetDebtorSubScheduleQuery {
  year: number;
  month: number;
  search?: string;
  page?: number;
  limit?: number;
  hideZero?: boolean;
}
