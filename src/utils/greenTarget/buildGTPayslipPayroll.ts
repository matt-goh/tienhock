// src/utils/greenTarget/buildGTPayslipPayroll.ts
// Converts a Green Target employee payroll (with stored payroll_items +
// deductions) into the shared `EmployeePayroll` shape the Tien Hock payslip
// generator (`PaySlipPDFMake`) expects.
//
// GT stores Bonus / Advance / Kerja-Luar-OT as payroll_items tagged with
// work_log_type. The payslip renders advances/bonus/others from dedicated
// `commission_records` / `others_records` arrays (and derives the advance
// deduction from the is_advance commission rows). So here we MOVE those tagged
// items out of `items` into those arrays — leaving only real work items in
// `items` — to avoid double counting and to surface the advance deduction.
import {
  EmployeePayroll,
  CommissionRecord,
  OthersRecord,
  PayrollItem,
} from "../../types/types";

export interface GTPayslipItem {
  id?: number;
  pay_code_id?: string | null;
  description?: string | null;
  rate?: number;
  rate_unit?: string;
  quantity?: number;
  amount?: number;
  is_manual?: boolean;
  pay_type?: string | null;
  job_type?: string | null;
  work_log_type?: string | null;
}

export interface GTPayslipDeduction {
  deduction_type: string;
  employee_amount: number;
  employer_amount: number;
  wage_amount: number;
  rate_info?: {
    employee_rate?: number | string;
    employer_rate?: number | string;
  } | null;
}

export interface GTPayslipLeaveRecord {
  id?: number;
  employee_id?: string;
  leave_date?: string;
  date?: string;
  leave_type: string;
  days_taken?: number;
  amount_paid: number;
}

export interface GTPayslipInput {
  id?: number;
  monthly_payroll_id?: number;
  employee_id: string;
  employee_name?: string;
  job_type: string;
  section?: string | null;
  gross_pay: number;
  net_pay: number;
  digenapkan?: number;
  setelah_digenapkan?: number | null;
  year?: number;
  month?: number;
  items?: GTPayslipItem[];
  deductions?: GTPayslipDeduction[];
  leave_records?: GTPayslipLeaveRecord[];
}

export interface GTPayslipResult {
  pdfPayroll: EmployeePayroll;
  commissionAdvanceTotal: number;
}

export const buildGTPayslipPayroll = (
  payroll: GTPayslipInput
): GTPayslipResult => {
  const workItems: PayrollItem[] = [];
  const commission_records: CommissionRecord[] = [];
  const others_records: OthersRecord[] = [];
  let commissionAdvanceTotal = 0;

  for (const item of payroll.items || []) {
    const wlt = item.work_log_type || "";
    const amount = Number(item.amount) || 0;

    if (wlt === "advance" || wlt === "bonus") {
      const isAdvance = wlt === "advance";
      commission_records.push({
        id: item.id ?? 0,
        employee_id: payroll.employee_id,
        commission_date: "",
        amount,
        description: item.description || (isAdvance ? "Advance" : "Bonus"),
        created_by: "",
        created_at: "",
        is_advance: isAdvance,
      });
      if (isAdvance) commissionAdvanceTotal += amount;
    } else if (wlt === "others") {
      others_records.push({
        id: item.id ?? 0,
        employee_id: payroll.employee_id,
        record_date: "",
        pay_code_id: item.pay_code_id ?? null,
        description: item.description || "Others",
        rate: Number(item.rate) || 0,
        rate_unit: item.rate_unit || "Fixed",
        quantity: Number(item.quantity) || 0,
        amount,
        link_id: null,
      });
    } else {
      workItems.push({
        id: item.id,
        pay_code_id: item.pay_code_id || "",
        description: item.description || "",
        rate: Number(item.rate) || 0,
        rate_unit: item.rate_unit || "Fixed",
        quantity: Number(item.quantity) || 0,
        amount,
        is_manual: !!item.is_manual,
        pay_type: item.pay_type || "Base",
        job_type: item.job_type || undefined,
      });
    }
  }

  const pdfPayroll: EmployeePayroll = {
    id: payroll.id,
    monthly_payroll_id: payroll.monthly_payroll_id,
    employee_id: payroll.employee_id,
    employee_name: payroll.employee_name,
    job_type: payroll.job_type,
    section: payroll.section || "GREEN TARGET",
    gross_pay: payroll.gross_pay,
    // PaySlipPDFMake expects net_pay = gross - statutory ONLY (it subtracts the
    // advance separately as a deduction line: finalPayment = net_pay - midMonth
    // - commissionAdvance). GT's stored net_pay already has the advance removed,
    // so re-add it here to avoid double-counting the advance on the payslip.
    net_pay:
      Math.round((Number(payroll.net_pay) + commissionAdvanceTotal) * 100) / 100,
    digenapkan: payroll.digenapkan,
    setelah_digenapkan: payroll.setelah_digenapkan ?? undefined,
    year: payroll.year,
    month: payroll.month,
    items: workItems,
    deductions: (payroll.deductions || []).map((d) => ({
      deduction_type: d.deduction_type as
        | "epf"
        | "socso"
        | "sip"
        | "income_tax",
      employee_amount: d.employee_amount,
      employer_amount: d.employer_amount,
      wage_amount: d.wage_amount,
      rate_info: {
        rate_id: 0,
        employee_rate: d.rate_info?.employee_rate ?? "0%",
        employer_rate: d.rate_info?.employer_rate ?? "0%",
      },
    })),
    leave_records: (payroll.leave_records || []).map((r) => ({
      date: r.date || r.leave_date || "",
      employee_id: r.employee_id,
      leave_type: r.leave_type,
      days_taken: Number(r.days_taken) || 0,
      amount_paid: Number(r.amount_paid) || 0,
      work_log_type: null,
    })),
    commission_records,
    others_records,
  };

  return { pdfPayroll, commissionAdvanceTotal };
};
