// src/pages/JellyPolly/Payroll/JPPayrollDetailsPage.tsx
import React, { useState, useEffect } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import {
  IconPlus,
  IconTrash,
  IconCash,
  IconReceipt,
  IconUser,
  IconTruck,
  IconCoins,
  IconCalendarEvent,
  IconWallet,
  IconBuildingBank,
  IconChevronRight,
  IconInfoCircle,
} from "@tabler/icons-react";
import Button from "../../../components/Button";
import BackButton from "../../../components/BackButton";
import LoadingSpinner from "../../../components/LoadingSpinner";
import ConfirmationDialog from "../../../components/ConfirmationDialog";
import { api } from "../../../routes/utils/api";
import toast from "react-hot-toast";
import { buildJPPayslipPayroll } from "../../../utils/JellyPolly/buildJPPayslipPayroll";
import AddManualItemModal from "../../../components/Payroll/AddManualItemModal";
import CrossCompanyTakeHomeCard from "../../../components/Payroll/CrossCompanyTakeHomeCard";
import { MidMonthPayroll } from "../../../utils/payroll/midMonthPayrollUtils";
import { getMonthName } from "../../../utils/payroll/payrollUtils";
import {
  DownloadPayslipButton,
  PrintPayslipButton,
} from "../../../utils/payroll/PayslipButtons";

interface PayrollItem {
  id?: number;
  pay_code_id: string;
  description: string;
  rate: number;
  rate_unit: string;
  quantity: number;
  foc_units?: number | null;
  amount: number;
  is_manual: boolean;
  pay_type?: string;
  job_type?: string;
  source_employee_id?: string | null;
  source_date?: string | null;
  work_log_id?: number | null;
  work_log_type?: string | null;
}

interface Deduction {
  deduction_type: string;
  employee_amount: number;
  employer_amount: number;
  wage_amount: number;
  rate_info: {
    employee_rate?: string;
    employer_rate?: string;
    age_group?: string;
  };
}

interface JPPinjamRecord {
  id: number;
  employee_id: string;
  year: number;
  month: number;
  amount: number;
  description: string;
  pinjam_type: "mid_month" | "monthly";
}

interface JPLeaveRecord {
  id?: number;
  employee_id?: string;
  date?: string;
  leave_date?: string;
  leave_type: string;
  days_taken: number;
  amount_paid: number;
  status?: string;
  work_log_id?: number | null;
  work_log_type?: "daily" | "monthly" | "packing_cuti" | null;
}

interface JPMidMonthAdvance {
  id: number;
  employee_id: string;
  year: number;
  month: number;
  amount: number;
  payment_method: "Cash" | "Bank" | "Cheque";
  status: "Pending" | "Paid" | "Cancelled";
  created_at?: string;
  updated_at?: string;
}

interface JPEmployeePayroll {
  id: number;
  monthly_payroll_id: number;
  employee_id: string;
  employee_name: string;
  job_type: string;
  section: string;
  gross_pay: number;
  net_pay: number;
  digenapkan?: number;
  setelah_digenapkan?: number | null;
  year: number;
  month: number;
  ic_no?: string;
  bank_account_number?: string;
  epf_no?: string;
  socso_no?: string;
  items: PayrollItem[];
  deductions: Deduction[];
  employee_job_mapping?: Record<string, string> | string[] | null;
  job_sections?: Record<string, string>;
  pinjam_records?: JPPinjamRecord[];
  leave_records?: JPLeaveRecord[];
  mid_month_payroll?: JPMidMonthAdvance | null;
  mid_month_payrolls_by_employee?: Record<string, number>;
}

const formatCurrency = (amount: number): string =>
  new Intl.NumberFormat("en-MY", {
    style: "currency",
    currency: "MYR",
  }).format(Number(amount) || 0);

const parsePayrollAmount = (
  value: number | string | null | undefined
): number => {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount) ? amount : 0;
};

const formatDisplayDate = (value: string | null | undefined): string => {
  if (!value) return "-";
  const text = String(value);
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return text;

  const [, year, month, day] = match;
  return `${day}/${month}/${year}`;
};

const getYmdDate = (value: string | null | undefined): string | null => {
  if (!value) return null;
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : null;
};

const getDeductionCardLabel = (type: string): string => {
  const normalizedType: string = type.toLowerCase();
  if (normalizedType === "income_tax") return "Income Tax";
  return normalizedType.toUpperCase();
};

const getDeductionSortOrder = (type: string): number => {
  const order: string[] = ["epf", "sip", "socso", "income_tax"];
  const index: number = order.indexOf(type.toLowerCase());
  return index === -1 ? 999 : index;
};

const getLeaveTypeLabel = (type: string): string => {
  switch (type) {
    case "cuti_umum":
      return "Cuti Umum";
    case "cuti_sakit":
      return "Cuti Sakit";
    case "cuti_tahunan":
      return "Cuti Tahunan";
    case "cuti_rawatan":
      return "Cuti Rawatan";
    default:
      return type;
  }
};

const getPayrollItemGroupLabel = (item: PayrollItem): string => {
  if (item.work_log_type === "advance") return "Advance";
  if (item.work_log_type === "bonus") return "Bonus";
  if (item.work_log_type === "others") return "Others";
  return item.pay_type || "Other";
};

const getJobTypeSlug = (jobType: string): string =>
  jobType.toLowerCase().replace(/_/g, "-");

const JPPayrollDetailsPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [payroll, setPayroll] = useState<JPEmployeePayroll | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [itemToDelete, setItemToDelete] = useState<PayrollItem | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState<boolean>(false);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);
  const [showAddItemModal, setShowAddItemModal] = useState<boolean>(false);

  const fetchPayrollDetails = async (): Promise<void> => {
    if (!id) return;

    setIsLoading(true);
    try {
      const response: JPEmployeePayroll = await api.get(
        `/jellypolly/api/employee-payrolls/${id}`
      );
      setPayroll(response);
    } catch (error) {
      console.error("Error fetching JP employee payroll:", error);
      toast.error("Failed to load payroll details");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void fetchPayrollDetails();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const handleDeleteItem = async (): Promise<void> => {
    if (!itemToDelete?.id) return;

    setIsDeleting(true);
    try {
      await api.delete(
        `/jellypolly/api/employee-payrolls/items/${itemToDelete.id}`
      );
      toast.success("Item deleted successfully");
      await fetchPayrollDetails();
    } catch (error) {
      console.error("Error deleting payroll item:", error);
      toast.error("Failed to delete payroll item");
    } finally {
      setIsDeleting(false);
      setShowDeleteDialog(false);
      setItemToDelete(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-96">
        <LoadingSpinner />
      </div>
    );
  }

  if (!payroll) {
    return (
      <div className="p-6">
        <BackButton
          onClick={() => navigate("/jellypolly/payroll/monthly-payrolls")}
        />
        <div className="mt-4 text-center text-default-500 dark:text-gray-400">
          Payroll not found
        </div>
      </div>
    );
  }

  const normalizedLeaveRecords: JPLeaveRecord[] = (
    payroll.leave_records || []
  ).map((record: JPLeaveRecord) => ({
    ...record,
    date: record.date || record.leave_date,
    amount_paid: parsePayrollAmount(record.amount_paid),
  }));

  const { pdfPayroll } = buildJPPayslipPayroll({
    ...payroll,
    leave_records: normalizedLeaveRecords,
  });

  const staffDetails = {
    name: payroll.employee_name,
    icNo: payroll.ic_no || "N/A",
    jobName: payroll.job_type,
    section: payroll.section || "JELLY POLLY",
  };

  const midMonthForPdf: MidMonthPayroll | null = payroll.mid_month_payroll
    ? {
        id: payroll.mid_month_payroll.id,
        employee_id: payroll.employee_id,
        employee_name: payroll.employee_name,
        year: payroll.year,
        month: payroll.month,
        amount: parsePayrollAmount(payroll.mid_month_payroll.amount),
        payment_method: payroll.mid_month_payroll.payment_method,
        status: payroll.mid_month_payroll.status,
        created_at: payroll.mid_month_payroll.created_at || "",
        updated_at: payroll.mid_month_payroll.updated_at || "",
      }
    : null;

  const totalStatutoryDeductions: number = payroll.deductions.reduce(
    (sum: number, deduction: Deduction) =>
      sum + parsePayrollAmount(deduction.employee_amount),
    0
  );
  const commissionAdvanceTotal: number = payroll.items
    .filter((item: PayrollItem) => item.work_log_type === "advance")
    .reduce(
      (sum: number, item: PayrollItem) => sum + parsePayrollAmount(item.amount),
      0
    );
  const bonusTotal: number = payroll.items
    .filter((item: PayrollItem) => item.work_log_type === "bonus")
    .reduce(
      (sum: number, item: PayrollItem) => sum + parsePayrollAmount(item.amount),
      0
    );
  const othersTotal: number = payroll.items
    .filter((item: PayrollItem) => item.work_log_type === "others")
    .reduce(
      (sum: number, item: PayrollItem) => sum + parsePayrollAmount(item.amount),
      0
    );
  const leaveTotal: number = normalizedLeaveRecords.reduce(
    (sum: number, record: JPLeaveRecord) =>
      sum + parsePayrollAmount(record.amount_paid),
    0
  );
  const leaveDateKeys = new Set<string>(
    normalizedLeaveRecords
      .map((record: JPLeaveRecord): string | null => {
        const date = getYmdDate(record.date || record.leave_date);
        const employeeId = record.employee_id || payroll.employee_id;
        return date ? `${employeeId}:${date}` : null;
      })
      .filter((key): key is string => key !== null)
  );
  const isLeaveDayWorkItem = (item: PayrollItem): boolean => {
    const sourceDate = getYmdDate(item.source_date);
    if (!sourceDate || !item.source_employee_id) return false;
    return leaveDateKeys.has(`${item.source_employee_id}:${sourceDate}`);
  };
  const baseWorkTotal: number = payroll.items
    .filter(
      (item: PayrollItem) =>
        item.work_log_type !== "advance" &&
        item.work_log_type !== "bonus" &&
        item.work_log_type !== "others" &&
        !isLeaveDayWorkItem(item)
    )
    .reduce(
      (sum: number, item: PayrollItem) => sum + parsePayrollAmount(item.amount),
      0
    );

  const midMonthAmount: number = parsePayrollAmount(
    payroll.mid_month_payroll?.amount
  );
  const totalFinalDeductions: number =
    totalStatutoryDeductions + commissionAdvanceTotal + midMonthAmount;
  const jumlah: number = parsePayrollAmount(payroll.net_pay) - midMonthAmount;
  const setelahDigenapkan: number =
    payroll.setelah_digenapkan ?? Math.ceil(jumlah);
  const digenapkan: number =
    payroll.digenapkan ?? setelahDigenapkan - jumlah;

  const pinjamRecords: JPPinjamRecord[] = payroll.pinjam_records || [];
  const midMonthPinjamRecords: JPPinjamRecord[] = pinjamRecords.filter(
    (record: JPPinjamRecord) => record.pinjam_type === "mid_month"
  );
  const monthlyPinjamRecords: JPPinjamRecord[] = pinjamRecords.filter(
    (record: JPPinjamRecord) => record.pinjam_type === "monthly"
  );
  const midMonthPinjamTotal: number = midMonthPinjamRecords.reduce(
    (sum: number, record: JPPinjamRecord) =>
      sum + parsePayrollAmount(record.amount),
    0
  );
  const monthlyPinjamTotal: number = monthlyPinjamRecords.reduce(
    (sum: number, record: JPPinjamRecord) =>
      sum + parsePayrollAmount(record.amount),
    0
  );
  const midMonthFinalPay: number = midMonthAmount - midMonthPinjamTotal;
  const monthlyFinalPay: number = setelahDigenapkan - monthlyPinjamTotal;
  const hasMidMonthPinjam: boolean = midMonthPinjamRecords.length > 0;
  const hasMonthlyPinjam: boolean = monthlyPinjamRecords.length > 0;
  const hasBothPinjamPanels: boolean = hasMidMonthPinjam && hasMonthlyPinjam;

  const groupedItems: Record<string, PayrollItem[]> = payroll.items.reduce(
    (acc: Record<string, PayrollItem[]>, item: PayrollItem) => {
      const type: string = getPayrollItemGroupLabel(item);
      if (!acc[type]) acc[type] = [];
      acc[type].push(item);
      return acc;
    },
    {}
  );

  const getWorkLogUrl = (item: PayrollItem): string | null => {
    if (!item.work_log_id || !item.work_log_type) return null;

    const jobType = item.job_type || payroll.job_type;
    const slug = getJobTypeSlug(jobType);

    if (
      item.work_log_type === "monthly" &&
      (jobType === "OFFICE" || jobType === "MAINTENANCE")
    ) {
      return `/jellypolly/payroll/${slug}-monthly/${item.work_log_id}`;
    }

    if (item.work_log_type === "daily") {
      if (jobType === "SALESMAN" || jobType === "SALESMAN_IKUT") {
        return `/jellypolly/payroll/salesman-production/${item.work_log_id}`;
      }

      if (jobType === "ICE_POLLY" || jobType === "JELLY_CUP") {
        return `/jellypolly/payroll/${slug}-production/${item.work_log_id}`;
      }
    }

    return null;
  };

  const getItemDateLabel = (item: PayrollItem): string => {
    if (item.source_date) return formatDisplayDate(item.source_date);
    if (item.work_log_type === "monthly") {
      return `${getMonthName(payroll.month)} ${payroll.year}`;
    }
    return "-";
  };

  const pinjamAmountColor = (
    value: number,
    positiveClass: string
  ): string =>
    value < 0 ? "text-rose-600 dark:text-rose-400" : positiveClass;

  const searchText: string = encodeURIComponent(
    payroll.employee_name || payroll.employee_id
  );
  const midMonthUrl = `/jellypolly/payroll/mid-month-payrolls?year=${payroll.year}&month=${payroll.month}&search=${searchText}`;
  const pinjamUrl = `/jellypolly/payroll/pinjam?year=${payroll.year}&month=${payroll.month}&search=${searchText}`;

  return (
    <div className="space-y-3 pb-6">
      <div className="sticky top-1 z-20 -mx-1 flex flex-col items-start justify-between gap-2 rounded-lg border border-default-200 bg-white/95 px-3 py-2 shadow-sm backdrop-blur dark:border-gray-700 dark:bg-gray-800/95 md:flex-row md:items-center">
        <div className="flex items-center gap-4 min-w-0">
          <BackButton
            onClick={() => navigate("/jellypolly/payroll/monthly-payrolls")}
          />
          <div className="h-6 w-px bg-default-300 dark:bg-gray-600" />
          <div className="min-w-0">
            <h1
              className="max-w-48 truncate text-xl font-semibold text-default-800 dark:text-gray-100 sm:max-w-72"
              title={payroll.employee_name || "Unknown employee"}
            >
              {payroll.employee_name || "Unknown employee"}
            </h1>
            <p className="text-sm text-default-500 dark:text-gray-400 mt-1">
              {getMonthName(payroll.month)} {payroll.year}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 mt-2 md:mt-0 w-full md:w-auto">
          <PrintPayslipButton
            company="jellypolly"
            payroll={pdfPayroll}
            staffDetails={staffDetails}
            midMonthPayroll={midMonthForPdf}
            companyName="JELLY POLLY"
            buttonText="Pay Slip"
            variant="filled"
            color="sky"
            className="flex-1 md:flex-none shadow-sm"
          />
          <DownloadPayslipButton
            company="jellypolly"
            payroll={pdfPayroll}
            staffDetails={staffDetails}
            midMonthPayroll={midMonthForPdf}
            companyName="JELLY POLLY"
            buttonText="PDF"
            variant="default"
            color="sky"
            className="flex-1 md:flex-none"
          />
          <Button
            onClick={() => setShowAddItemModal(true)}
            icon={IconPlus}
            variant="default"
            color="default"
            className="flex-1 md:flex-none"
          >
            Manual Item
          </Button>
        </div>
      </div>

      <div className="mb-2 grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="border border-default-200 dark:border-gray-700 rounded-lg overflow-hidden bg-white dark:bg-gray-800 transition-shadow hover:shadow-md">
          <div className="px-4 py-3 bg-default-50 dark:bg-gray-900/50 border-b border-default-100 dark:border-gray-700">
            <h3 className="text-md font-semibold text-default-700 dark:text-gray-200">
              Employee Information
            </h3>
          </div>
          <div className="p-4 space-y-4">
            <div>
              <p className="text-xs uppercase tracking-wide text-default-400 dark:text-gray-400 mb-1">
                Employee
              </p>
              <p className="font-semibold text-default-800 dark:text-gray-100">
                <Link
                  to={`/jellypolly/catalogue/staff/${payroll.employee_id}`}
                  className="text-sky-600 dark:text-sky-400 hover:underline"
                >
                  {payroll.employee_name || "Unknown"}
                </Link>
              </p>
              <p className="text-sm text-default-500 dark:text-gray-400 mt-1">
                {payroll.employee_id}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-default-400 dark:text-gray-400 mb-1">
                Job Type
              </p>
              <p className="font-semibold text-default-800 dark:text-gray-100 flex items-center gap-2">
                {payroll.job_type === "SALESMAN" ? (
                  <IconTruck size={18} className="text-amber-500" />
                ) : (
                  <IconUser size={18} className="text-sky-500" />
                )}
                {payroll.job_type}
              </p>
              <p className="text-sm text-default-500 dark:text-gray-400 mt-1">
                {payroll.section || "JELLY POLLY"}
              </p>
            </div>
          </div>
        </div>

        <div className="border border-default-200 dark:border-gray-700 rounded-lg overflow-hidden bg-white dark:bg-gray-800 flex flex-col transition-shadow hover:shadow-md">
          <div className="px-4 py-3 bg-emerald-50 dark:bg-emerald-900/20 border-b border-emerald-100 dark:border-emerald-800/50">
            <h3 className="text-md font-semibold text-emerald-800 dark:text-emerald-300 flex items-center gap-2">
              <IconCash
                size={18}
                className="text-emerald-600 dark:text-emerald-400"
              />
              Earnings
            </h3>
          </div>
          <div className="p-4 flex flex-col flex-grow">
            <div className="space-y-2 flex-grow">
              <div className="flex justify-between text-sm">
                <span className="text-default-600 dark:text-gray-300">
                  Work Pay
                </span>
                <span className="font-medium text-default-800 dark:text-gray-100">
                  {formatCurrency(baseWorkTotal)}
                </span>
              </div>
              {leaveTotal > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-default-600 dark:text-gray-300">
                    Cuti Pay
                  </span>
                  <span className="font-medium text-default-800 dark:text-gray-100">
                    {formatCurrency(leaveTotal)}
                  </span>
                </div>
              )}
              {bonusTotal > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-default-600 dark:text-gray-300">
                    Bonus
                  </span>
                  <span className="font-medium text-default-800 dark:text-gray-100">
                    {formatCurrency(bonusTotal)}
                  </span>
                </div>
              )}
              {othersTotal > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-default-600 dark:text-gray-300">
                    Others
                  </span>
                  <span className="font-medium text-default-800 dark:text-gray-100">
                    {formatCurrency(othersTotal)}
                  </span>
                </div>
              )}
              {commissionAdvanceTotal > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-default-600 dark:text-gray-300">
                    Advance
                  </span>
                  <span className="font-medium text-default-800 dark:text-gray-100">
                    {formatCurrency(commissionAdvanceTotal)}
                  </span>
                </div>
              )}
            </div>
            <div className="border-t border-default-200 dark:border-gray-600 mt-auto pt-3">
              <div className="flex justify-between font-semibold">
                <span className="text-default-800 dark:text-gray-100">
                  Gross Pay
                </span>
                <span className="text-emerald-700 dark:text-emerald-400 text-lg">
                  {formatCurrency(payroll.gross_pay)}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="border border-sky-200 dark:border-sky-800/50 rounded-lg bg-white dark:bg-gray-800 flex flex-col transition-shadow hover:shadow-md">
          <div className="px-4 py-3 bg-sky-50 dark:bg-sky-900/20 border-b border-sky-100 dark:border-sky-800/50 rounded-t-lg">
            <h3 className="text-md font-semibold text-sky-800 dark:text-sky-300 flex items-center gap-2">
              <IconReceipt
                size={18}
                className="text-sky-600 dark:text-sky-400"
              />
              Deductions & Final Pay
            </h3>
          </div>
          <div className="p-4 flex flex-col flex-grow">
            <div className="space-y-2 flex-grow">
              <div className="flex justify-between text-sm">
                <span className="text-default-600 dark:text-gray-300">
                  Gross Pay
                </span>
                <span className="font-medium text-default-800 dark:text-gray-100">
                  {formatCurrency(payroll.gross_pay)}
                </span>
              </div>
              <div className="border-t border-dashed border-default-300 dark:border-gray-600 my-2" />
              {payroll.deductions
                .filter(
                  (deduction: Deduction) =>
                    parsePayrollAmount(deduction.employee_amount) > 0
                )
                .sort(
                  (a: Deduction, b: Deduction) =>
                    getDeductionSortOrder(a.deduction_type) -
                    getDeductionSortOrder(b.deduction_type)
                )
                .map((deduction: Deduction) => {
                  const deductionName: string = getDeductionCardLabel(
                    deduction.deduction_type
                  );
                  const employeeAmount: number = parsePayrollAmount(
                    deduction.employee_amount
                  );
                  const employerAmount: number = parsePayrollAmount(
                    deduction.employer_amount
                  );
                  const percentage: string =
                    payroll.gross_pay > 0
                      ? (
                          (employeeAmount /
                            parsePayrollAmount(payroll.gross_pay)) *
                          100
                        ).toFixed(1)
                      : "0";

                  return (
                    <div
                      key={deduction.deduction_type}
                      className="group relative flex justify-between text-sm"
                    >
                      <span className="text-default-600 dark:text-gray-300 flex items-center gap-1 cursor-help">
                        {deductionName}
                        <IconInfoCircle
                          size={14}
                          className="text-default-400 dark:text-gray-400 opacity-60 group-hover:opacity-100"
                        />
                        <span className="text-xs text-default-400 dark:text-gray-400">
                          ({percentage}%)
                        </span>
                      </span>
                      <span className="font-medium text-rose-600 dark:text-rose-400">
                        - {formatCurrency(employeeAmount)}
                      </span>
                      <div className="absolute left-0 top-full mt-2 hidden group-hover:block z-50 w-64">
                        <div className="bg-default-800 text-white text-xs rounded-lg p-3 shadow-lg relative">
                          <div className="absolute left-4 bottom-full w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-b-[6px] border-b-default-800" />
                          <div className="font-semibold mb-2 text-default-100">
                            {deductionName} Breakdown
                          </div>
                          <div className="space-y-1">
                            <div className="flex justify-between">
                              <span className="text-default-300">
                                Employee:
                              </span>
                              <span>{formatCurrency(employeeAmount)}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-default-300">
                                Employer:
                              </span>
                              <span>{formatCurrency(employerAmount)}</span>
                            </div>
                            <div className="border-t border-default-600 mt-2 pt-2">
                              <div className="flex justify-between text-default-400">
                                <span>Employee Rate:</span>
                                <span>
                                  {deduction.rate_info?.employee_rate || "-"}
                                </span>
                              </div>
                              <div className="flex justify-between text-default-400">
                                <span>Employer Rate:</span>
                                <span>
                                  {deduction.rate_info?.employer_rate || "-"}
                                </span>
                              </div>
                              {deduction.rate_info?.age_group && (
                                <div className="flex justify-between text-default-400">
                                  <span>Age Group:</span>
                                  <span className="capitalize">
                                    {deduction.rate_info.age_group.replace(
                                      /_/g,
                                      " "
                                    )}
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              {commissionAdvanceTotal > 0 && (
                <div className="group relative flex justify-between text-sm">
                  <span className="text-default-600 dark:text-gray-300 flex items-center gap-1 cursor-help">
                    Advance
                    <IconInfoCircle
                      size={14}
                      className="text-default-400 dark:text-gray-400 opacity-60 group-hover:opacity-100"
                    />
                  </span>
                  <span className="font-medium text-rose-600 dark:text-rose-400">
                    - {formatCurrency(commissionAdvanceTotal)}
                  </span>
                  <div className="absolute left-0 top-full mt-2 hidden group-hover:block z-50 w-64">
                    <div className="bg-default-800 text-white text-xs rounded-lg p-3 shadow-lg relative">
                      <div className="absolute left-4 bottom-full w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-b-[6px] border-b-default-800" />
                      <div className="font-semibold mb-2 text-default-100">
                        Advance
                      </div>
                      <div className="space-y-1">
                        <div className="flex justify-between">
                          <span className="text-default-300">
                            Total Amount:
                          </span>
                          <span>{formatCurrency(commissionAdvanceTotal)}</span>
                        </div>
                      </div>
                      <div className="border-t border-default-600 mt-2 pt-2 text-default-400">
                        Payments made in advance, deducted from final pay.
                      </div>
                    </div>
                  </div>
                </div>
              )}
              {midMonthAmount > 0 && (
                <div className="group relative flex justify-between text-sm">
                  <Link
                    to={midMonthUrl}
                    className="flex flex-1 items-center justify-between rounded text-default-600 hover:text-sky-600 dark:text-gray-300 dark:hover:text-sky-400"
                  >
                    <span className="flex items-center gap-1 cursor-help">
                      Mid-month Advance
                      <IconInfoCircle
                        size={14}
                        className="text-default-400 dark:text-gray-400 opacity-60 group-hover:opacity-100"
                      />
                    </span>
                    <span className="font-medium text-rose-600 dark:text-rose-400">
                      - {formatCurrency(midMonthAmount)}
                    </span>
                  </Link>
                  <div className="absolute left-0 top-full mt-2 hidden group-hover:block z-50 w-64">
                    <div className="bg-default-800 text-white text-xs rounded-lg p-3 shadow-lg relative">
                      <div className="absolute left-4 bottom-full w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-b-[6px] border-b-default-800" />
                      <div className="font-semibold mb-2 text-default-100">
                        Mid-month Advance
                      </div>
                      <div className="space-y-1">
                        <div className="flex justify-between">
                          <span className="text-default-300">Amount:</span>
                          <span>{formatCurrency(midMonthAmount)}</span>
                        </div>
                        {payroll.mid_month_payroll?.created_at && (
                          <div className="flex justify-between">
                            <span className="text-default-300">Date:</span>
                            <span>
                              {formatDisplayDate(
                                payroll.mid_month_payroll.created_at
                              )}
                            </span>
                          </div>
                        )}
                      </div>
                      <div className="border-t border-default-600 mt-2 pt-2 text-default-400">
                        Advance payment made mid-month, deducted from final pay.
                      </div>
                    </div>
                  </div>
                </div>
              )}
              <div className="border-t border-default-200 dark:border-gray-600 mt-2 pt-2">
                <div className="flex justify-between text-sm">
                  <span className="text-default-600 dark:text-gray-300 font-medium">
                    Total Deductions
                  </span>
                  <span className="font-semibold text-rose-600 dark:text-rose-400">
                    - {formatCurrency(totalFinalDeductions)}
                  </span>
                </div>
              </div>
              <div className="border-t border-default-200 dark:border-gray-600 mt-2 pt-2">
                <div className="flex justify-between text-sm">
                  <span className="text-default-600 dark:text-gray-300 font-medium">
                    Net Pay
                  </span>
                  <span className="font-semibold text-default-800 dark:text-gray-100">
                    {formatCurrency(payroll.net_pay)}
                  </span>
                </div>
              </div>
            </div>
            {digenapkan > 0.001 && (
              <div className="flex justify-between text-sm mt-2">
                <span className="text-default-600 dark:text-gray-300">
                  Digenapkan
                </span>
                <span className="font-medium text-emerald-600 dark:text-emerald-400">
                  + {formatCurrency(digenapkan)}
                </span>
              </div>
            )}
            <div className="bg-sky-100 dark:bg-sky-900/30 -mx-4 -mb-4 mt-4 px-4 py-4 border-t border-sky-200 dark:border-sky-800/50 rounded-b-lg">
              <div className="flex justify-between items-center">
                <span className="text-sky-800 dark:text-sky-300 font-bold text-base">
                  Jumlah Digenapkan
                </span>
                <span className="text-sky-900 dark:text-sky-200 text-2xl font-bold">
                  {formatCurrency(setelahDigenapkan)}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="border border-default-200 dark:border-gray-700 rounded-lg overflow-hidden bg-white dark:bg-gray-800">
        <div className="px-4 py-2 bg-amber-50 dark:bg-amber-900/20 border-b border-amber-100 dark:border-amber-800/50 flex justify-between items-center">
          <h3 className="text-md font-semibold text-amber-800 dark:text-amber-300 flex items-center gap-2">
            <IconCoins size={18} className="text-amber-600 dark:text-amber-400" />
            Payroll Items
          </h3>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowAddItemModal(true)}
            icon={IconPlus}
            iconSize={16}
          >
            Manual Item
          </Button>
        </div>
        <div className="overflow-x-auto">
          {payroll.items.length === 0 ? (
            <p className="text-center text-default-400 dark:text-gray-500 py-6">
              No earnings recorded
            </p>
          ) : (
            <table className="min-w-full divide-y divide-default-200 dark:divide-gray-700">
              <thead className="bg-default-50 dark:bg-gray-800">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium text-default-500 dark:text-gray-400 uppercase w-28">
                    Date
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-default-500 dark:text-gray-400 uppercase">
                    Description
                  </th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-default-500 dark:text-gray-400 uppercase w-28">
                    Rate
                  </th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-default-500 dark:text-gray-400 uppercase w-20">
                    Qty
                  </th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-default-500 dark:text-gray-400 uppercase w-28">
                    Amount
                  </th>
                  <th className="px-3 py-2 w-10" />
                </tr>
              </thead>
              <tbody className="divide-y divide-default-100 dark:divide-gray-700">
                {Object.entries(groupedItems).map(([type, items]) => (
                  <React.Fragment key={type}>
                    <tr className="bg-default-50/70 dark:bg-gray-800/80">
                      <td
                        colSpan={6}
                        className="px-3 py-2 text-xs font-semibold text-default-500 dark:text-gray-400 uppercase tracking-wide"
                      >
                        {type}
                      </td>
                    </tr>
                    {items.map((item: PayrollItem, index: number) => {
                      const workLogUrl: string | null = getWorkLogUrl(item);
                      return (
                        <tr key={`${type}-${item.id || index}`}>
                          <td className="px-3 py-2 text-sm text-default-500 dark:text-gray-400">
                            {getItemDateLabel(item)}
                          </td>
                          <td className="px-3 py-2 text-sm text-default-800 dark:text-gray-200">
                            <div className="flex items-center gap-2 min-w-0">
                              {workLogUrl ? (
                                <Link
                                  to={workLogUrl}
                                  className="font-medium text-sky-600 dark:text-sky-400 hover:underline truncate"
                                  title="Open source log"
                                >
                                  {item.description}
                                </Link>
                              ) : (
                                <span className="truncate">{item.description}</span>
                              )}
                              {workLogUrl && (
                                <IconChevronRight
                                  size={14}
                                  className="text-sky-500 flex-shrink-0"
                                />
                              )}
                              {item.is_manual && (
                                <span className="px-1.5 py-0.5 text-xs bg-sky-100 dark:bg-sky-900/30 text-sky-600 dark:text-sky-400 rounded">
                                  Manual
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-3 py-2 text-right text-sm text-default-600 dark:text-gray-400">
                            {formatCurrency(item.rate)}
                            <span className="text-xs text-default-400 dark:text-gray-500 ml-1">
                              /{item.rate_unit}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-right text-sm text-default-600 dark:text-gray-400">
                            {item.quantity}
                          </td>
                          <td className="px-3 py-2 text-right text-sm font-medium text-default-800 dark:text-gray-200">
                            {formatCurrency(item.amount)}
                          </td>
                          <td className="px-3 py-2 text-right">
                            {item.is_manual && (
                              <button
                                type="button"
                                onClick={() => {
                                  setItemToDelete(item);
                                  setShowDeleteDialog(true);
                                }}
                                className="p-1 text-red-500 hover:text-red-700 dark:hover:text-red-400"
                                title="Delete manual item"
                              >
                                <IconTrash size={16} />
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </React.Fragment>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-default-200 dark:border-gray-600">
                  <td
                    colSpan={4}
                    className="px-3 py-2 font-semibold text-default-800 dark:text-gray-200"
                  >
                    Total Earnings
                  </td>
                  <td className="px-3 py-2 text-right font-bold text-emerald-600 dark:text-emerald-400">
                    {formatCurrency(payroll.gross_pay)}
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      </div>

      {normalizedLeaveRecords.length > 0 && (
        <div className="border border-default-200 dark:border-gray-700 rounded-lg overflow-hidden bg-white dark:bg-gray-800">
          <div className="px-4 py-2 bg-cyan-50 dark:bg-cyan-900/20 border-b border-cyan-100 dark:border-cyan-800/50">
            <h3 className="text-md font-semibold text-cyan-800 dark:text-cyan-300 flex items-center gap-2">
              <IconCalendarEvent
                size={18}
                className="text-cyan-600 dark:text-cyan-400"
              />
              Leave Pay
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-default-200 dark:divide-gray-700">
              <thead className="bg-default-50 dark:bg-gray-800">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium text-default-500 dark:text-gray-400 uppercase">
                    Date
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-default-500 dark:text-gray-400 uppercase">
                    Type
                  </th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-default-500 dark:text-gray-400 uppercase">
                    Days
                  </th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-default-500 dark:text-gray-400 uppercase">
                    Amount
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-default-100 dark:divide-gray-700">
                {normalizedLeaveRecords.map(
                  (record: JPLeaveRecord, index: number) => (
                    <tr key={`${record.id || index}-${record.date || ""}`}>
                      <td className="px-3 py-2 text-sm text-default-600 dark:text-gray-400">
                        {formatDisplayDate(record.date || record.leave_date)}
                      </td>
                      <td className="px-3 py-2 text-sm text-default-800 dark:text-gray-200">
                        {getLeaveTypeLabel(record.leave_type)}
                      </td>
                      <td className="px-3 py-2 text-right text-sm text-default-600 dark:text-gray-400">
                        {record.days_taken}
                      </td>
                      <td className="px-3 py-2 text-right text-sm font-medium text-cyan-700 dark:text-cyan-300">
                        {formatCurrency(record.amount_paid)}
                      </td>
                    </tr>
                  )
                )}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-default-200 dark:border-gray-600">
                  <td
                    colSpan={3}
                    className="px-3 py-2 font-semibold text-default-800 dark:text-gray-200"
                  >
                    Total Leave Pay
                  </td>
                  <td className="px-3 py-2 text-right font-bold text-cyan-700 dark:text-cyan-300">
                    {formatCurrency(leaveTotal)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {pinjamRecords.length > 0 && (
        <div
          id="pinjam-section"
          className="mb-4 overflow-hidden rounded-lg border border-default-200 bg-white dark:border-gray-700 dark:bg-gray-800"
        >
          <Link
            to={pinjamUrl}
            className="group flex items-center justify-between gap-3 border-b border-red-100 bg-red-50 px-4 py-2 transition-colors hover:bg-red-100/70 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-red-400 dark:border-red-800/50 dark:bg-red-900/20 dark:hover:bg-red-900/35"
            title={`Open Pinjam for ${payroll.employee_name || payroll.employee_id}`}
          >
            <h3 className="text-md font-semibold text-red-800 dark:text-red-300 flex items-center gap-2">
              <IconWallet size={18} className="text-red-600 dark:text-red-400" />
              <span>Pinjam</span>
            </h3>
            <span className="flex items-center gap-1 text-xs font-semibold text-red-700 group-hover:underline dark:text-red-300">
              Open Pinjam
              <IconChevronRight size={16} aria-hidden="true" />
            </span>
          </Link>
          <div className="p-4">
            <div
              className={`flex flex-col ${
                hasBothPinjamPanels
                  ? "lg:flex-row lg:gap-6 lg:divide-x lg:divide-default-200 dark:lg:divide-gray-700"
                  : ""
              } gap-6`}
            >
              {hasMidMonthPinjam && (
                <div
                  className={`min-w-0 flex flex-col ${
                    hasBothPinjamPanels ? "flex-1 lg:pr-6" : "w-full"
                  }`}
                >
                  <div className="mb-3">
                    <p className="text-sm text-default-500 dark:text-gray-400 mb-1">
                      Mid-Month Pay (Before Pinjam)
                    </p>
                    <p
                      className={`text-xl font-bold ${pinjamAmountColor(
                        midMonthAmount,
                        "text-default-800 dark:text-gray-100"
                      )}`}
                    >
                      {formatCurrency(midMonthAmount)}
                    </p>
                  </div>
                  <div className="mb-3">
                    <p className="text-sm font-medium text-default-700 dark:text-gray-200 mb-2">
                      Pinjam Items:
                    </p>
                    <div className="space-y-1 text-sm text-default-600 dark:text-gray-300">
                      {midMonthPinjamRecords.map((record: JPPinjamRecord) => (
                        <div key={record.id} className="flex items-start">
                          <span className="text-default-400 mr-2 mt-0.5">-</span>
                          <span className="flex-1 min-w-0">
                            {record.description}
                          </span>
                          <span className="ml-2 flex-shrink-0 font-medium text-default-700 dark:text-gray-200">
                            {formatCurrency(record.amount)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="mt-auto text-sm">
                    <div className="flex justify-between mb-2">
                      <span className="text-default-600 dark:text-gray-300">
                        Jumlah Pinjam:
                      </span>
                      <span className="font-semibold text-red-600 dark:text-red-400">
                        - {formatCurrency(midMonthPinjamTotal)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center font-semibold border-t border-default-200 dark:border-gray-600 pt-2">
                      <span className="text-default-800 dark:text-gray-100">
                        Final Mid-Month Pay
                      </span>
                      <span
                        className={`text-lg font-bold ${pinjamAmountColor(
                          midMonthFinalPay,
                          "text-sky-600 dark:text-sky-400"
                        )}`}
                      >
                        {formatCurrency(midMonthFinalPay)}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {hasMonthlyPinjam && (
                <div
                  className={`min-w-0 flex flex-col ${
                    hasBothPinjamPanels ? "flex-1 lg:pl-6" : "w-full"
                  }`}
                >
                  <div className="mb-3">
                    <p className="text-sm text-default-500 dark:text-gray-400 mb-1">
                      Gaji Genap (Before Pinjam)
                    </p>
                    <p
                      className={`text-xl font-bold ${pinjamAmountColor(
                        setelahDigenapkan,
                        "text-default-800 dark:text-gray-100"
                      )}`}
                    >
                      {formatCurrency(setelahDigenapkan)}
                    </p>
                  </div>
                  <div className="mb-3">
                    <p className="text-sm font-medium text-default-700 dark:text-gray-200 mb-2">
                      Pinjam Items:
                    </p>
                    <div className="space-y-1 text-sm text-default-600 dark:text-gray-300">
                      {monthlyPinjamRecords.map((record: JPPinjamRecord) => (
                        <div key={record.id} className="flex items-start">
                          <span className="text-default-400 mr-2 mt-0.5">-</span>
                          <span className="flex-1 min-w-0">
                            {record.description}
                          </span>
                          <span className="ml-2 flex-shrink-0 font-medium text-default-700 dark:text-gray-200">
                            {formatCurrency(record.amount)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="mt-auto text-sm">
                    <div className="flex justify-between mb-2">
                      <span className="text-default-600 dark:text-gray-300">
                        Jumlah Pinjam:
                      </span>
                      <span className="font-semibold text-red-600 dark:text-red-400">
                        - {formatCurrency(monthlyPinjamTotal)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center font-semibold border-t border-default-200 dark:border-gray-600 pt-2">
                      <span className="text-default-800 dark:text-gray-100 flex items-center gap-1.5">
                        <IconBuildingBank className="w-4 h-4 flex-shrink-0" />
                        Jumlah Masuk Bank
                      </span>
                      <span
                        className={`text-lg font-bold ${pinjamAmountColor(
                          monthlyFinalPay,
                          "text-sky-600 dark:text-sky-400"
                        )}`}
                      >
                        {formatCurrency(monthlyFinalPay)}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <CrossCompanyTakeHomeCard
        employeeId={payroll.employee_id}
        year={payroll.year}
        month={payroll.month}
        currentCompany="jellypolly"
      />

      <AddManualItemModal
        company="jellypolly"
        isOpen={showAddItemModal}
        onClose={() => setShowAddItemModal(false)}
        employeePayrollId={payroll.id}
        employeeJobType={payroll.job_type}
        onItemAdded={fetchPayrollDetails}
        apiBasePath="/jellypolly/api/employee-payrolls"
      />

      <ConfirmationDialog
        isOpen={showDeleteDialog}
        onClose={() => {
          setShowDeleteDialog(false);
          setItemToDelete(null);
        }}
        onConfirm={handleDeleteItem}
        title="Delete Payroll Item"
        message={`Are you sure you want to delete "${itemToDelete?.description}"? This action cannot be undone.`}
        confirmButtonText={isDeleting ? "Deleting..." : "Delete"}
        variant="danger"
      />
    </div>
  );
};

export default JPPayrollDetailsPage;
