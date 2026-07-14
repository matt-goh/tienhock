// src/pages/GreenTarget/Payroll/GTPayrollDetailsPage.tsx
// Green Target employee payroll details using the modern payroll layout while
// keeping GT's own item, deduction, mid-month, and pinjam data model.
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  IconBuildingBank,
  IconCash,
  IconCoins,
  IconExternalLink,
  IconInfoCircle,
  IconPlus,
  IconReceipt,
  IconTrash,
  IconTruck,
  IconUser,
  IconWallet,
} from "@tabler/icons-react";
import toast from "react-hot-toast";
import BackButton from "../../../components/BackButton";
import Button from "../../../components/Button";
import ConfirmationDialog from "../../../components/ConfirmationDialog";
import LoadingSpinner from "../../../components/LoadingSpinner";
import AddManualItemModal from "../../../components/Payroll/AddManualItemModal";
import { useScrollRestoration } from "../../../hooks/useScrollRestoration";
import { api } from "../../../routes/utils/api";
import type { EmployeePayroll } from "../../../types/types";
import { buildGTPayslipPayroll } from "../../../utils/greenTarget/buildGTPayslipPayroll";
import type { MidMonthPayroll } from "../../../utils/payroll/midMonthPayrollUtils";
import { getMonthName } from "../../../utils/payroll/payrollUtils";
import {
  DownloadPayslipButton,
  PrintPayslipButton,
} from "../../../utils/payroll/PayslipButtons";

interface PayrollItem {
  id?: number;
  pay_code_id: string | null;
  description: string;
  rate: number;
  rate_unit: string;
  quantity: number;
  amount: number;
  is_manual: boolean;
  pay_type?: string | null;
  job_type?: string | null;
  work_log_type?: string | null;
}

interface DeductionRateInfo {
  employee_rate?: number | string;
  employer_rate?: number | string;
  age_group?: string;
}

interface Deduction {
  deduction_type: string;
  employee_amount: number;
  employer_amount: number;
  wage_amount: number;
  rate_info: DeductionRateInfo;
}

interface GTPinjamRecord {
  id: number;
  employee_id: string;
  year: number;
  month: number;
  amount: number;
  description: string;
  pinjam_type: "mid_month" | "monthly";
}

interface GTMidMonthAdvance {
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

interface GTEmployeePayroll {
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
  income_tax_no?: string;
  items: PayrollItem[];
  deductions: Deduction[];
  pinjam_records?: GTPinjamRecord[];
  mid_month_payroll?: GTMidMonthAdvance | null;
  leave_records?: GTLeaveRecord[];
}

interface GTLeaveRecord {
  id: number;
  employee_id: string;
  leave_date: string;
  leave_type: string;
  days_taken: number;
  amount_paid: number;
  status?: string;
}

interface GTPayslipStaffDetails {
  name: string;
  icNo: string;
  jobName: string;
  section: string;
}

interface GTPayslipData {
  pdfPayroll: EmployeePayroll;
  staffDetails: GTPayslipStaffDetails;
  midMonthForPdf: MidMonthPayroll | null;
}

interface PayrollItemGroupStyle {
  label: string;
  headerClassName: string;
  titleClassName: string;
  iconClassName: string;
  totalClassName: string;
  addOnPath: string | null;
  addOnLabel: string | null;
}

const parsePayrollAmount = (
  value: number | string | null | undefined
): number => {
  const amount: number = Number(value ?? 0);
  return Number.isFinite(amount) ? amount : 0;
};

const formatCurrency = (amount: number): string =>
  new Intl.NumberFormat("en-MY", {
    style: "currency",
    currency: "MYR",
  }).format(parsePayrollAmount(amount));

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

const getPayrollItemGroupLabel = (item: PayrollItem): string => {
  if (item.work_log_type === "advance") return "Advance";
  if (item.work_log_type === "bonus") return "Bonus";
  if (item.work_log_type === "others") return "Others";
  return item.pay_type || "Other";
};

const isSpecialPayrollItem = (item: PayrollItem): boolean =>
  item.work_log_type === "advance" ||
  item.work_log_type === "bonus" ||
  item.work_log_type === "others";

const getPayrollGroupSortOrder = (group: string): number => {
  const order: string[] = [
    "Base",
    "Tambahan",
    "Overtime",
    "Bonus",
    "Advance",
    "Others",
    "Other",
  ];
  const index: number = order.indexOf(group);
  return index === -1 ? 999 : index;
};

const getPayrollItemGroupStyle = (
  group: string
): PayrollItemGroupStyle => {
  switch (group) {
    case "Base":
      return {
        label: "Base Pay",
        headerClassName:
          "border-sky-100 bg-sky-50 dark:border-sky-800/50 dark:bg-sky-900/20",
        titleClassName: "text-sky-800 dark:text-sky-300",
        iconClassName: "text-sky-600 dark:text-sky-400",
        totalClassName: "text-sky-700 dark:text-sky-300",
        addOnPath: null,
        addOnLabel: null,
      };
    case "Tambahan":
      return {
        label: "Additional Pay",
        headerClassName:
          "border-violet-100 bg-violet-50 dark:border-violet-800/50 dark:bg-violet-900/20",
        titleClassName: "text-violet-800 dark:text-violet-300",
        iconClassName: "text-violet-600 dark:text-violet-400",
        totalClassName: "text-violet-700 dark:text-violet-300",
        addOnPath: null,
        addOnLabel: null,
      };
    case "Overtime":
      return {
        label: "Overtime",
        headerClassName:
          "border-amber-100 bg-amber-50 dark:border-amber-800/50 dark:bg-amber-900/20",
        titleClassName: "text-amber-800 dark:text-amber-300",
        iconClassName: "text-amber-600 dark:text-amber-400",
        totalClassName: "text-amber-700 dark:text-amber-300",
        addOnPath: null,
        addOnLabel: null,
      };
    case "Bonus":
      return {
        label: "Bonus",
        headerClassName:
          "border-emerald-100 bg-emerald-50 dark:border-emerald-800/50 dark:bg-emerald-900/20",
        titleClassName: "text-emerald-800 dark:text-emerald-300",
        iconClassName: "text-emerald-600 dark:text-emerald-400",
        totalClassName: "text-emerald-700 dark:text-emerald-300",
        addOnPath: "/greentarget/payroll/bonus",
        addOnLabel: "Open Bonus",
      };
    case "Advance":
      return {
        label: "Others (Advance)",
        headerClassName:
          "border-rose-100 bg-rose-50 dark:border-rose-800/50 dark:bg-rose-900/20",
        titleClassName: "text-rose-800 dark:text-rose-300",
        iconClassName: "text-rose-600 dark:text-rose-400",
        totalClassName: "text-rose-700 dark:text-rose-300",
        addOnPath: "/greentarget/payroll/others-advance",
        addOnLabel: "Open Advances",
      };
    case "Others":
      return {
        label: "Others (Kerja Luar OT)",
        headerClassName:
          "border-indigo-100 bg-indigo-50 dark:border-indigo-800/50 dark:bg-indigo-900/20",
        titleClassName: "text-indigo-800 dark:text-indigo-300",
        iconClassName: "text-indigo-600 dark:text-indigo-400",
        totalClassName: "text-indigo-700 dark:text-indigo-300",
        addOnPath: "/greentarget/payroll/others",
        addOnLabel: "Open Others",
      };
    default:
      return {
        label: group,
        headerClassName:
          "border-default-100 bg-default-50 dark:border-gray-700 dark:bg-gray-900/40",
        titleClassName: "text-default-800 dark:text-gray-200",
        iconClassName: "text-default-500 dark:text-gray-400",
        totalClassName: "text-default-800 dark:text-gray-200",
        addOnPath: null,
        addOnLabel: null,
      };
  }
};

const GTPayrollDetailsPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [payroll, setPayroll] = useState<GTEmployeePayroll | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [itemToDelete, setItemToDelete] = useState<PayrollItem | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState<boolean>(false);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);
  const [showAddItemModal, setShowAddItemModal] = useState<boolean>(false);
  const payrollRequestIdRef = useRef<number>(0);

  useScrollRestoration(
    `gt-payroll-details:${id || "unknown"}`,
    !isLoading && !!payroll
  );

  const fetchPayrollDetails = useCallback(async (): Promise<void> => {
    const requestId: number = payrollRequestIdRef.current + 1;
    payrollRequestIdRef.current = requestId;
    if (!id) {
      setPayroll(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setPayroll(null);
    try {
      const response: GTEmployeePayroll = await api.get(
        `/greentarget/api/employee-payrolls/${id}`
      );
      if (requestId === payrollRequestIdRef.current) {
        setPayroll(response);
      }
    } catch (error: unknown) {
      if (requestId !== payrollRequestIdRef.current) return;
      console.error("Error fetching GT employee payroll:", error);
      setPayroll(null);
      toast.error("Failed to load payroll details");
    } finally {
      if (requestId === payrollRequestIdRef.current) {
        setIsLoading(false);
      }
    }
  }, [id]);

  useEffect(() => {
    void fetchPayrollDetails();
    return (): void => {
      payrollRequestIdRef.current += 1;
    };
  }, [fetchPayrollDetails]);

  const handleDeleteItem = async (): Promise<void> => {
    if (isDeleting || !itemToDelete?.id) return;

    setIsDeleting(true);
    try {
      await api.delete(
        `/greentarget/api/employee-payrolls/items/${itemToDelete.id}`
      );
      toast.success("Item deleted successfully");
      await fetchPayrollDetails();
    } catch (error: unknown) {
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
      <div className="flex h-96 items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  if (!payroll) {
    return (
      <div className="py-12 text-center">
        <p className="text-default-500 dark:text-gray-400">
          Employee payroll not found
        </p>
        <Button
          onClick={() => navigate("/greentarget/payroll")}
          className="mt-4"
          variant="outline"
        >
          Back
        </Button>
      </div>
    );
  }

  const buildPayslipData = (
    currentPayroll: GTEmployeePayroll
  ): GTPayslipData => {
    const normalizedPayroll: EmployeePayroll = buildGTPayslipPayroll({
      ...currentPayroll,
      gross_pay: parsePayrollAmount(currentPayroll.gross_pay),
      net_pay: parsePayrollAmount(currentPayroll.net_pay),
      digenapkan: parsePayrollAmount(currentPayroll.digenapkan),
      setelah_digenapkan:
        currentPayroll.setelah_digenapkan == null
          ? null
          : parsePayrollAmount(currentPayroll.setelah_digenapkan),
    }).pdfPayroll;

    // GT payroll IDs can overlap with Tien Hock IDs. Removing the ID from the
    // print-only object prevents the shared manager from refetching a TH record.
    const pdfPayroll: EmployeePayroll = {
      ...normalizedPayroll,
      id: undefined,
    };
    const staffDetails: GTPayslipStaffDetails = {
      name: currentPayroll.employee_name,
      icNo: currentPayroll.ic_no || "N/A",
      jobName: currentPayroll.job_type,
      section: currentPayroll.section || "GREEN TARGET",
    };
    const midMonthForPdf: MidMonthPayroll | null =
      currentPayroll.mid_month_payroll
        ? {
            id: currentPayroll.mid_month_payroll.id,
            employee_id: currentPayroll.employee_id,
            employee_name: currentPayroll.employee_name,
            year: currentPayroll.year,
            month: currentPayroll.month,
            amount: parsePayrollAmount(
              currentPayroll.mid_month_payroll.amount
            ),
            payment_method: currentPayroll.mid_month_payroll.payment_method,
            status: currentPayroll.mid_month_payroll.status,
            created_at: currentPayroll.mid_month_payroll.created_at || "",
            updated_at: currentPayroll.mid_month_payroll.updated_at || "",
          }
        : null;

    return { pdfPayroll, staffDetails, midMonthForPdf };
  };

  const { pdfPayroll, staffDetails, midMonthForPdf }: GTPayslipData =
    buildPayslipData(payroll);
  const grossPay: number = parsePayrollAmount(payroll.gross_pay);
  const netPay: number = parsePayrollAmount(payroll.net_pay);
  const totalStatutoryDeductions: number = payroll.deductions.reduce(
    (sum: number, deduction: Deduction): number =>
      sum + parsePayrollAmount(deduction.employee_amount),
    0
  );
  const commissionAdvanceTotal: number = payroll.items
    .filter(
      (item: PayrollItem): boolean => item.work_log_type === "advance"
    )
    .reduce(
      (sum: number, item: PayrollItem): number =>
        sum + parsePayrollAmount(item.amount),
      0
    );
  const bonusTotal: number = payroll.items
    .filter((item: PayrollItem): boolean => item.work_log_type === "bonus")
    .reduce(
      (sum: number, item: PayrollItem): number =>
        sum + parsePayrollAmount(item.amount),
      0
    );
  const othersTotal: number = payroll.items
    .filter((item: PayrollItem): boolean => item.work_log_type === "others")
    .reduce(
      (sum: number, item: PayrollItem): number =>
        sum + parsePayrollAmount(item.amount),
      0
    );

  const regularPayrollItems: PayrollItem[] = payroll.items.filter(
    (item: PayrollItem): boolean => !isSpecialPayrollItem(item)
  );
  const baseTotal: number = regularPayrollItems
    .filter((item: PayrollItem): boolean => item.pay_type === "Base")
    .reduce(
      (sum: number, item: PayrollItem): number =>
        sum + parsePayrollAmount(item.amount),
      0
    );
  const tambahanTotal: number = regularPayrollItems
    .filter((item: PayrollItem): boolean => item.pay_type === "Tambahan")
    .reduce(
      (sum: number, item: PayrollItem): number =>
        sum + parsePayrollAmount(item.amount),
      0
    );
  const overtimeTotal: number = regularPayrollItems
    .filter((item: PayrollItem): boolean => item.pay_type === "Overtime")
    .reduce(
      (sum: number, item: PayrollItem): number =>
        sum + parsePayrollAmount(item.amount),
      0
    );
  const otherWorkTotal: number = regularPayrollItems
    .filter(
      (item: PayrollItem): boolean =>
        item.pay_type !== "Base" &&
        item.pay_type !== "Tambahan" &&
        item.pay_type !== "Overtime"
    )
    .reduce(
      (sum: number, item: PayrollItem): number =>
        sum + parsePayrollAmount(item.amount),
      0
    );

  const leaveRecords: GTLeaveRecord[] = payroll.leave_records || [];
  const leaveTotal: number = leaveRecords.reduce(
    (sum: number, record: GTLeaveRecord): number =>
      sum + parsePayrollAmount(record.amount_paid),
    0
  );

  const midMonthAmount: number = parsePayrollAmount(
    payroll.mid_month_payroll?.amount
  );
  const totalFinalDeductions: number =
    totalStatutoryDeductions + commissionAdvanceTotal + midMonthAmount;
  const jumlah: number = netPay - midMonthAmount;
  const setelahDigenapkan: number =
    payroll.setelah_digenapkan ?? Math.ceil(jumlah);
  const digenapkan: number =
    payroll.digenapkan ?? setelahDigenapkan - jumlah;

  const pinjamRecords: GTPinjamRecord[] = payroll.pinjam_records || [];
  const midMonthPinjamRecords: GTPinjamRecord[] = pinjamRecords.filter(
    (record: GTPinjamRecord): boolean => record.pinjam_type === "mid_month"
  );
  const monthlyPinjamRecords: GTPinjamRecord[] = pinjamRecords.filter(
    (record: GTPinjamRecord): boolean => record.pinjam_type === "monthly"
  );
  const midMonthPinjamTotal: number = midMonthPinjamRecords.reduce(
    (sum: number, record: GTPinjamRecord): number =>
      sum + parsePayrollAmount(record.amount),
    0
  );
  const monthlyPinjamTotal: number = monthlyPinjamRecords.reduce(
    (sum: number, record: GTPinjamRecord): number =>
      sum + parsePayrollAmount(record.amount),
    0
  );
  const midMonthFinalPay: number = midMonthAmount - midMonthPinjamTotal;
  const monthlyFinalPay: number = setelahDigenapkan - monthlyPinjamTotal;
  const hasMidMonthPinjam: boolean = midMonthPinjamRecords.length > 0;
  const hasMonthlyPinjam: boolean = monthlyPinjamRecords.length > 0;
  const hasBothPinjamPanels: boolean =
    hasMidMonthPinjam && hasMonthlyPinjam;

  const groupedItems: Record<string, PayrollItem[]> = payroll.items.reduce(
    (
      groups: Record<string, PayrollItem[]>,
      item: PayrollItem
    ): Record<string, PayrollItem[]> => {
      const group: string = getPayrollItemGroupLabel(item);
      if (!groups[group]) groups[group] = [];
      groups[group].push(item);
      return groups;
    },
    {}
  );
  const groupedItemEntries: Array<[string, PayrollItem[]]> = Object.entries(
    groupedItems
  ).sort(
    (
      [leftGroup]: [string, PayrollItem[]],
      [rightGroup]: [string, PayrollItem[]]
    ): number =>
      getPayrollGroupSortOrder(leftGroup) -
      getPayrollGroupSortOrder(rightGroup)
  );

  const pinjamAmountColor = (
    value: number,
    positiveClass: string
  ): string =>
    value < -0.005 ? "text-red-600 dark:text-red-400" : positiveClass;

  const payrollListUrl: string = `/greentarget/payroll?year=${payroll.year}&month=${payroll.month}`;

  return (
    <div className="space-y-3 pb-6">
      <div className="sticky top-1 z-20 -mx-1 flex flex-col items-start justify-between gap-2 rounded-lg border border-default-200 bg-white/95 px-3 py-2 shadow-sm backdrop-blur dark:border-gray-700 dark:bg-gray-800/95 md:flex-row md:items-center">
        <div className="flex min-w-0 items-center gap-4">
          <BackButton onClick={() => navigate(payrollListUrl)} />
          <div className="h-6 w-px bg-default-300 dark:bg-gray-600" />
          <div className="min-w-0">
            <h1
              className="max-w-48 truncate text-xl font-semibold text-default-800 dark:text-gray-100 sm:max-w-72"
              title={payroll.employee_name || "Unknown employee"}
            >
              {payroll.employee_name || "Unknown employee"}
            </h1>
            <p className="mt-1 text-sm text-default-500 dark:text-gray-400">
              {getMonthName(payroll.month)} {payroll.year}
            </p>
          </div>
        </div>
        <div className="mt-2 flex w-full flex-wrap gap-2 md:mt-0 md:w-auto">
          <PrintPayslipButton
            payroll={pdfPayroll}
            staffDetails={staffDetails}
            midMonthPayroll={midMonthForPdf}
            companyName="GREEN TARGET SDN. BHD."
            buttonText="Pay Slip"
            variant="filled"
            color="sky"
            className="flex-1 shadow-sm md:flex-none"
          />
          <DownloadPayslipButton
            payroll={pdfPayroll}
            staffDetails={staffDetails}
            midMonthPayroll={midMonthForPdf}
            companyName="GREEN TARGET SDN. BHD."
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

      <div className="mb-2 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="overflow-hidden rounded-lg border border-default-200 bg-white transition-shadow hover:shadow-md dark:border-gray-700 dark:bg-gray-800">
          <div className="border-b border-default-100 bg-default-50 px-4 py-3 dark:border-gray-700 dark:bg-gray-900/50">
            <h3 className="text-md font-semibold text-default-700 dark:text-gray-200">
              Employee Information
            </h3>
          </div>
          <div className="space-y-4 p-4">
            <div>
              <p className="mb-1 text-xs uppercase tracking-wide text-default-400 dark:text-gray-400">
                Employee
              </p>
              <p className="font-semibold text-default-800 dark:text-gray-100">
                {payroll.employee_name || "Unknown"}
              </p>
              <p className="mt-1 text-sm text-default-500 dark:text-gray-400">
                {payroll.employee_id}
              </p>
            </div>
            <div>
              <p className="mb-1 text-xs uppercase tracking-wide text-default-400 dark:text-gray-400">
                Job Type
              </p>
              <p className="flex items-center gap-2 font-semibold text-default-800 dark:text-gray-100">
                {payroll.job_type === "DRIVER" ? (
                  <IconTruck size={18} className="text-amber-500" />
                ) : (
                  <IconUser size={18} className="text-sky-500" />
                )}
                {payroll.job_type}
              </p>
              <p className="mt-1 text-sm text-default-500 dark:text-gray-400">
                {payroll.section || "GREEN TARGET"}
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-col overflow-hidden rounded-lg border border-default-200 bg-white transition-shadow hover:shadow-md dark:border-gray-700 dark:bg-gray-800">
          <div className="border-b border-emerald-100 bg-emerald-50 px-4 py-3 dark:border-emerald-800/50 dark:bg-emerald-900/20">
            <h3 className="text-md flex items-center gap-2 font-semibold text-emerald-800 dark:text-emerald-300">
              <IconCash
                size={18}
                className="text-emerald-600 dark:text-emerald-400"
              />
              Earnings
            </h3>
          </div>
          <div className="flex flex-grow flex-col p-4">
            <div className="flex-grow space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-default-600 dark:text-gray-300">
                  Base Pay
                </span>
                <span className="font-medium text-default-800 dark:text-gray-100">
                  {formatCurrency(baseTotal)}
                </span>
              </div>
              {tambahanTotal > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-default-600 dark:text-gray-300">
                    Tambahan
                  </span>
                  <span className="font-medium text-default-800 dark:text-gray-100">
                    {formatCurrency(tambahanTotal)}
                  </span>
                </div>
              )}
              {overtimeTotal > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-default-600 dark:text-gray-300">
                    Overtime
                  </span>
                  <span className="font-medium text-default-800 dark:text-gray-100">
                    {formatCurrency(overtimeTotal)}
                  </span>
                </div>
              )}
              {otherWorkTotal > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-default-600 dark:text-gray-300">
                    Other Work Pay
                  </span>
                  <span className="font-medium text-default-800 dark:text-gray-100">
                    {formatCurrency(otherWorkTotal)}
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
              {leaveTotal > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-default-600 dark:text-gray-300">
                    Cuti (Leave)
                  </span>
                  <span className="font-medium text-default-800 dark:text-gray-100">
                    {formatCurrency(leaveTotal)}
                  </span>
                </div>
              )}
            </div>
            <div className="mt-auto border-t border-default-200 pt-3 dark:border-gray-600">
              <div className="flex justify-between font-semibold">
                <span className="text-default-800 dark:text-gray-100">
                  Gross Pay
                </span>
                <span className="text-lg text-emerald-700 dark:text-emerald-400">
                  {formatCurrency(grossPay)}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col rounded-lg border border-sky-200 bg-white transition-shadow hover:shadow-md dark:border-sky-800/50 dark:bg-gray-800">
          <div className="rounded-t-lg border-b border-sky-100 bg-sky-50 px-4 py-3 dark:border-sky-800/50 dark:bg-sky-900/20">
            <h3 className="text-md flex items-center gap-2 font-semibold text-sky-800 dark:text-sky-300">
              <IconReceipt
                size={18}
                className="text-sky-600 dark:text-sky-400"
              />
              Deductions & Final Pay
            </h3>
          </div>
          <div className="flex flex-grow flex-col p-4">
            <div className="flex-grow space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-default-600 dark:text-gray-300">
                  Gross Pay
                </span>
                <span className="font-medium text-default-800 dark:text-gray-100">
                  {formatCurrency(grossPay)}
                </span>
              </div>
              <div className="my-2 border-t border-dashed border-default-300 dark:border-gray-600" />
              {payroll.deductions
                .filter(
                  (deduction: Deduction): boolean =>
                    parsePayrollAmount(deduction.employee_amount) > 0
                )
                .sort(
                  (left: Deduction, right: Deduction): number =>
                    getDeductionSortOrder(left.deduction_type) -
                    getDeductionSortOrder(right.deduction_type)
                )
                .map((deduction: Deduction): React.ReactNode => {
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
                    grossPay > 0
                      ? ((employeeAmount / grossPay) * 100).toFixed(1)
                      : "0";

                  return (
                    <div
                      key={deduction.deduction_type}
                      className="group relative flex justify-between text-sm"
                    >
                      <span className="flex cursor-help items-center gap-1 text-default-600 dark:text-gray-300">
                        {deductionName}
                        <IconInfoCircle
                          size={14}
                          className="text-default-400 opacity-60 group-hover:opacity-100 dark:text-gray-400"
                        />
                        <span className="text-xs text-default-400 dark:text-gray-400">
                          ({percentage}%)
                        </span>
                      </span>
                      <span className="font-medium text-rose-600 dark:text-rose-400">
                        - {formatCurrency(employeeAmount)}
                      </span>
                      <div className="absolute left-0 top-full z-50 mt-2 hidden w-64 group-hover:block">
                        <div className="relative rounded-lg bg-default-800 p-3 text-xs text-white shadow-lg">
                          <div className="absolute bottom-full left-4 h-0 w-0 border-b-[6px] border-l-[6px] border-r-[6px] border-b-default-800 border-l-transparent border-r-transparent" />
                          <div className="mb-2 font-semibold text-default-100">
                            {deductionName} Breakdown
                          </div>
                          <div className="space-y-1">
                            <div className="flex justify-between">
                              <span className="text-default-300">Employee:</span>
                              <span>{formatCurrency(employeeAmount)}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-default-300">Employer:</span>
                              <span>{formatCurrency(employerAmount)}</span>
                            </div>
                            <div className="mt-2 border-t border-default-600 pt-2">
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
                  <span className="flex cursor-help items-center gap-1 text-default-600 dark:text-gray-300">
                    Advance
                    <IconInfoCircle
                      size={14}
                      className="text-default-400 opacity-60 group-hover:opacity-100 dark:text-gray-400"
                    />
                  </span>
                  <span className="font-medium text-rose-600 dark:text-rose-400">
                    - {formatCurrency(commissionAdvanceTotal)}
                  </span>
                  <div className="absolute left-0 top-full z-50 mt-2 hidden w-64 group-hover:block">
                    <div className="relative rounded-lg bg-default-800 p-3 text-xs text-white shadow-lg">
                      <div className="absolute bottom-full left-4 h-0 w-0 border-b-[6px] border-l-[6px] border-r-[6px] border-b-default-800 border-l-transparent border-r-transparent" />
                      <div className="mb-2 font-semibold text-default-100">
                        Advance
                      </div>
                      <div className="flex justify-between">
                        <span className="text-default-300">Total Amount:</span>
                        <span>{formatCurrency(commissionAdvanceTotal)}</span>
                      </div>
                      <div className="mt-2 border-t border-default-600 pt-2 text-default-400">
                        Payments made in advance, deducted from final pay.
                      </div>
                    </div>
                  </div>
                </div>
              )}
              {midMonthAmount > 0 && (
                <div className="group relative flex justify-between text-sm">
                  <div className="flex flex-1 items-center justify-between text-default-600 dark:text-gray-300">
                    <span className="flex cursor-help items-center gap-1">
                      Mid-month Advance
                      <IconInfoCircle
                        size={14}
                        className="text-default-400 opacity-60 group-hover:opacity-100 dark:text-gray-400"
                      />
                    </span>
                    <span className="font-medium text-rose-600 dark:text-rose-400">
                      - {formatCurrency(midMonthAmount)}
                    </span>
                  </div>
                  <div className="absolute left-0 top-full z-50 mt-2 hidden w-64 group-hover:block">
                    <div className="relative rounded-lg bg-default-800 p-3 text-xs text-white shadow-lg">
                      <div className="absolute bottom-full left-4 h-0 w-0 border-b-[6px] border-l-[6px] border-r-[6px] border-b-default-800 border-l-transparent border-r-transparent" />
                      <div className="mb-2 font-semibold text-default-100">
                        Mid-month Advance
                      </div>
                      <div className="flex justify-between">
                        <span className="text-default-300">Amount:</span>
                        <span>{formatCurrency(midMonthAmount)}</span>
                      </div>
                      <div className="mt-2 border-t border-default-600 pt-2 text-default-400">
                        Advance payment made mid-month, deducted before rounding.
                      </div>
                    </div>
                  </div>
                </div>
              )}
              <div className="mt-2 border-t border-default-200 pt-2 dark:border-gray-600">
                <div className="flex justify-between text-sm">
                  <span className="font-medium text-default-600 dark:text-gray-300">
                    Total Deductions
                  </span>
                  <span className="font-semibold text-rose-600 dark:text-rose-400">
                    - {formatCurrency(totalFinalDeductions)}
                  </span>
                </div>
              </div>
              <div className="mt-2 border-t border-default-200 pt-2 dark:border-gray-600">
                <div className="flex justify-between text-sm">
                  <span className="font-medium text-default-600 dark:text-gray-300">
                    Pay Before Rounding
                  </span>
                  <span className="font-semibold text-default-800 dark:text-gray-100">
                    {formatCurrency(jumlah)}
                  </span>
                </div>
              </div>
            </div>
            {digenapkan > 0.001 && (
              <div className="mt-2 flex justify-between text-sm">
                <span className="text-default-600 dark:text-gray-300">
                  Digenapkan
                </span>
                <span className="font-medium text-emerald-600 dark:text-emerald-400">
                  + {formatCurrency(digenapkan)}
                </span>
              </div>
            )}
            <div className="-mx-4 -mb-4 mt-4 rounded-b-lg border-t border-sky-200 bg-sky-100 px-4 py-4 dark:border-sky-800/50 dark:bg-sky-900/30">
              <div className="flex items-center justify-between">
                <span className="text-base font-bold text-sky-800 dark:text-sky-300">
                  Jumlah Digenapkan
                </span>
                <span className="text-2xl font-bold text-sky-900 dark:text-sky-200">
                  {formatCurrency(setelahDigenapkan)}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <section className="space-y-3">
        <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-end">
          <div>
            <h2 className="text-lg font-semibold text-default-800 dark:text-gray-100">
              Earnings Breakdown
            </h2>
            <p className="text-sm text-default-500 dark:text-gray-400">
              Pay items are separated by source so additions and manual entries
              are easier to review.
            </p>
          </div>
        </div>

        {payroll.items.length === 0 ? (
          <div className="rounded-lg border border-dashed border-default-300 bg-white px-6 py-8 text-center dark:border-gray-600 dark:bg-gray-800">
            <IconCoins
              size={28}
              className="mx-auto mb-2 text-default-300 dark:text-gray-500"
            />
            <p className="text-default-500 dark:text-gray-400">
              No earnings recorded.
            </p>
            <Button
              size="sm"
              variant="outline"
              onClick={(): void => setShowAddItemModal(true)}
              icon={IconPlus}
              iconSize={16}
              className="mt-3"
            >
              Add Manual Item
            </Button>
          </div>
        ) : (
          groupedItemEntries.map(
            ([group, items]: [string, PayrollItem[]]): React.ReactNode => {
              const groupStyle: PayrollItemGroupStyle =
                getPayrollItemGroupStyle(group);
              const groupTotal: number = items.reduce(
                (sum: number, item: PayrollItem): number =>
                  sum + parsePayrollAmount(item.amount),
                0
              );
              const addOnUrl: string | null = groupStyle.addOnPath
                ? `${groupStyle.addOnPath}?year=${payroll.year}&month=${
                    payroll.month
                  }&search=${encodeURIComponent(payroll.employee_id)}`
                : null;

              return (
                <div
                  key={group}
                  className="overflow-hidden rounded-lg border border-default-200 bg-white dark:border-gray-700 dark:bg-gray-800"
                >
                  <div
                    className={`flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2.5 ${groupStyle.headerClassName}`}
                  >
                    <h3
                      className={`flex items-center gap-2 font-semibold ${groupStyle.titleClassName}`}
                    >
                      <IconCoins
                        size={18}
                        className={groupStyle.iconClassName}
                      />
                      <span>{groupStyle.label}</span>
                      <span className="rounded-full bg-white/70 px-2 py-0.5 text-xs font-medium text-default-500 dark:bg-gray-800/70 dark:text-gray-400">
                        {items.length}
                      </span>
                    </h3>
                    {addOnUrl && groupStyle.addOnLabel && (
                      <Link
                        to={addOnUrl}
                        className={`inline-flex items-center gap-1 text-sm font-medium transition-opacity hover:opacity-75 ${groupStyle.titleClassName}`}
                        title={`${groupStyle.addOnLabel} for ${payroll.employee_name}`}
                      >
                        {groupStyle.addOnLabel}
                        <IconExternalLink size={14} />
                      </Link>
                    )}
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[620px]">
                      <thead className="bg-default-50/70 dark:bg-gray-800">
                        <tr>
                          <th className="px-3 py-2 text-left text-xs font-medium uppercase text-default-500 dark:text-gray-400">
                            Description
                          </th>
                          <th className="w-28 px-3 py-2 text-right text-xs font-medium uppercase text-default-500 dark:text-gray-400">
                            Rate
                          </th>
                          <th className="w-20 px-3 py-2 text-right text-xs font-medium uppercase text-default-500 dark:text-gray-400">
                            Qty
                          </th>
                          <th className="w-28 px-3 py-2 text-right text-xs font-medium uppercase text-default-500 dark:text-gray-400">
                            Amount
                          </th>
                          <th className="w-10 px-3 py-2" />
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-default-100 dark:divide-gray-700">
                        {items.map(
                          (
                            item: PayrollItem,
                            index: number
                          ): React.ReactNode => (
                            <tr key={`${group}-${item.id || index}`}>
                              <td className="px-3 py-2 text-sm text-default-800 dark:text-gray-200">
                                <div className="flex min-w-0 items-center gap-2">
                                  <span className="truncate">
                                    {item.description}
                                  </span>
                                  {item.is_manual && (
                                    <span className="rounded bg-sky-100 px-1.5 py-0.5 text-xs text-sky-600 dark:bg-sky-900/30 dark:text-sky-400">
                                      Manual
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="px-3 py-2 text-right text-sm text-default-600 dark:text-gray-400">
                                {formatCurrency(item.rate)}
                                {item.rate_unit && (
                                  <span className="ml-1 text-xs text-default-400 dark:text-gray-500">
                                    /{item.rate_unit}
                                  </span>
                                )}
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
                                    onClick={(): void => {
                                      setItemToDelete(item);
                                      setShowDeleteDialog(true);
                                    }}
                                    className="rounded p-1 text-red-500 transition-colors hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-900/20 dark:hover:text-red-400"
                                    title="Delete manual item"
                                    aria-label={`Delete ${item.description}`}
                                  >
                                    <IconTrash size={16} />
                                  </button>
                                )}
                              </td>
                            </tr>
                          )
                        )}
                      </tbody>
                      <tfoot>
                        <tr className="border-t border-default-200 bg-default-50/60 dark:border-gray-700 dark:bg-gray-900/30">
                          <td
                            colSpan={3}
                            className="px-3 py-2 text-sm font-semibold text-default-700 dark:text-gray-200"
                          >
                            Total {groupStyle.label}
                          </td>
                          <td
                            className={`px-3 py-2 text-right font-bold ${groupStyle.totalClassName}`}
                          >
                            {formatCurrency(groupTotal)}
                          </td>
                          <td />
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              );
            }
          )
        )}
      </section>

      {pinjamRecords.length > 0 && (
        <div
          id="pinjam-section"
          className="mb-4 overflow-hidden rounded-lg border border-default-200 bg-white dark:border-gray-700 dark:bg-gray-800"
        >
          <div className="flex items-center justify-between gap-3 border-b border-red-100 bg-red-50 px-4 py-2 dark:border-red-800/50 dark:bg-red-900/20">
            <h3 className="text-md flex items-center gap-2 font-semibold text-red-800 dark:text-red-300">
              <IconWallet
                size={18}
                className="text-red-600 dark:text-red-400"
              />
              <span>Pinjam</span>
            </h3>
          </div>
          <div className="p-4">
            <div
              className={`flex flex-col gap-6 ${
                hasBothPinjamPanels
                  ? "lg:flex-row lg:divide-x lg:divide-default-200 dark:lg:divide-gray-700"
                  : ""
              }`}
            >
              {hasMidMonthPinjam && (
                <div
                  className={`flex min-w-0 flex-col ${
                    hasBothPinjamPanels ? "flex-1 lg:pr-6" : "w-full"
                  }`}
                >
                  <div className="mb-3">
                    <p className="mb-1 text-sm text-default-500 dark:text-gray-400">
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
                    <p className="mb-2 text-sm font-medium text-default-700 dark:text-gray-200">
                      Pinjam Items:
                    </p>
                    <div className="space-y-1 text-sm text-default-600 dark:text-gray-300">
                      {midMonthPinjamRecords.map(
                        (record: GTPinjamRecord): React.ReactNode => (
                          <div key={record.id} className="flex items-start">
                            <span className="mr-2 mt-0.5 text-default-400">•</span>
                            <span className="min-w-0 flex-1">
                              {record.description}
                            </span>
                            <span className="ml-2 flex-shrink-0 font-medium text-default-700 dark:text-gray-200">
                              {formatCurrency(record.amount)}
                            </span>
                          </div>
                        )
                      )}
                    </div>
                  </div>
                  <div className="mt-auto text-sm">
                    <div className="mb-2 flex justify-between">
                      <span className="text-default-600 dark:text-gray-300">
                        Jumlah Pinjam:
                      </span>
                      <span className="font-semibold text-red-600 dark:text-red-400">
                        - {formatCurrency(midMonthPinjamTotal)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between border-t border-default-200 pt-2 font-semibold dark:border-gray-600">
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
                  className={`flex min-w-0 flex-col ${
                    hasBothPinjamPanels ? "flex-1 lg:pl-6" : "w-full"
                  }`}
                >
                  <div className="mb-3">
                    <p className="mb-1 text-sm text-default-500 dark:text-gray-400">
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
                    <p className="mb-2 text-sm font-medium text-default-700 dark:text-gray-200">
                      Pinjam Items:
                    </p>
                    <div className="space-y-1 text-sm text-default-600 dark:text-gray-300">
                      {monthlyPinjamRecords.map(
                        (record: GTPinjamRecord): React.ReactNode => (
                          <div key={record.id} className="flex items-start">
                            <span className="mr-2 mt-0.5 text-default-400">•</span>
                            <span className="min-w-0 flex-1">
                              {record.description}
                            </span>
                            <span className="ml-2 flex-shrink-0 font-medium text-default-700 dark:text-gray-200">
                              {formatCurrency(record.amount)}
                            </span>
                          </div>
                        )
                      )}
                    </div>
                  </div>
                  <div className="mt-auto text-sm">
                    <div className="mb-2 flex justify-between">
                      <span className="text-default-600 dark:text-gray-300">
                        Jumlah Pinjam:
                      </span>
                      <span className="font-semibold text-red-600 dark:text-red-400">
                        - {formatCurrency(monthlyPinjamTotal)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between border-t border-default-200 pt-2 font-semibold dark:border-gray-600">
                      <span className="flex items-center gap-1.5 text-default-800 dark:text-gray-100">
                        <IconBuildingBank className="h-4 w-4 flex-shrink-0" />
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

      <AddManualItemModal
        isOpen={showAddItemModal}
        onClose={() => setShowAddItemModal(false)}
        employeePayrollId={payroll.id}
        employeeJobType={payroll.job_type}
        onItemAdded={fetchPayrollDetails}
        apiBasePath="/greentarget/api/employee-payrolls"
      />

      <ConfirmationDialog
        isOpen={showDeleteDialog}
        onClose={() => {
          setShowDeleteDialog(false);
          setItemToDelete(null);
        }}
        onConfirm={handleDeleteItem}
        title="Delete Payroll Item"
        message={`Are you sure you want to delete "${
          itemToDelete?.description || "this item"
        }"? This action cannot be undone.`}
        confirmButtonText={isDeleting ? "Deleting..." : "Delete"}
        variant="danger"
      />
    </div>
  );
};

export default GTPayrollDetailsPage;
