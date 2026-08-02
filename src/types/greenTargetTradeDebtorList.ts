export interface GreenTargetTradeDebtorListTotals {
  closing_balance: number;
  current_month: number;
  previous_month: number;
}

export interface GreenTargetTradeDebtorListRow {
  account_no: string;
  particular: string;
  closing_balance: number;
  current_month: number;
  previous_month: number;
  source_page: number | null;
  source_row: number | null;
}

export interface GreenTargetTradeDebtorListSection {
  rows: GreenTargetTradeDebtorListRow[];
  total_accounts: number;
  full_population: number;
  control_totals: GreenTargetTradeDebtorListTotals;
}

export interface GreenTargetTradeDebtorSubScheduleSection
  extends GreenTargetTradeDebtorListSection {
  visible_totals: GreenTargetTradeDebtorListTotals;
  reconciliation_residual: GreenTargetTradeDebtorListTotals;
}

export interface GreenTargetTradeDebtorListResponse {
  statement_date: string;
  previous_statement_date: string;
  report_datetime: string;
  statement_month: number;
  statement_year: number;
  hide_zero: boolean;
  direct: GreenTargetTradeDebtorListSection;
  cd_sd: GreenTargetTradeDebtorSubScheduleSection;
}

