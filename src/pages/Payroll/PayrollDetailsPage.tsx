// src/pages/Payroll/EmployeePayrollDetailsPage.tsx
import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  IconPlus,
  IconTrash,
  IconInfoCircle,
  IconCash,
  IconReceipt,
  IconCoins,
  IconClock,
  IconBusinessplan,
  IconCalendarEvent,
  IconCirclePlus,
  IconList,
  IconListDetails,
} from "@tabler/icons-react";
import { format } from "date-fns";
import Button from "../../components/Button";
import BackButton from "../../components/BackButton";
import LoadingSpinner from "../../components/LoadingSpinner";
import ConfirmationDialog from "../../components/ConfirmationDialog";
import {
  getEmployeePayrollComprehensive,
  deletePayrollItem,
  groupItemsByType,
  getMonthName,
  consolidatePayrollItems,
  groupConsolidatedItemsByType,
  ConsolidatedPayrollItem,
} from "../../utils/payroll/payrollUtils";
import toast from "react-hot-toast";
import { Link } from "react-router-dom";
import AddManualItemModal from "../../components/Payroll/AddManualItemModal";
import {
  EmployeePayroll,
  CommissionRecord,
  MidMonthPayroll,
} from "../../types/types";
import {
  DownloadPayslipButton,
  PrintPayslipButton,
} from "../../utils/payroll/PayslipButtons";

interface PayrollItem {
  id?: number;
  pay_code_id: string;
  description: string;
  rate: number;
  rate_unit: string;
  quantity: number;
  amount: number;
  is_manual: boolean;
  pay_type?: string;
  job_type?: string;
  source_date?: string | null;
  work_log_id?: number | null;
  work_log_type?: "daily" | "monthly" | null;
}

interface MonthlyLeaveRecord {
  id: number;
  employee_id: string;
  date: string;
  leave_type: string;
  days_taken: number;
  amount_paid: number;
  status: string;
  work_log_id?: number;
}

const EmployeePayrollDetailsPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [payroll, setPayroll] = useState<EmployeePayroll | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showAddItemModal, setShowAddItemModal] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<PayrollItem | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [midMonthPayroll, setMidMonthPayroll] =
    useState<MidMonthPayroll | null>(null);
  const [monthlyLeaveRecords, setMonthlyLeaveRecords] = useState<
    MonthlyLeaveRecord[]
  >([]);
  const [commissionRecords, setCommissionRecords] = useState<
    CommissionRecord[]
  >([]);
  const [viewMode, setViewMode] = useState<"consolidated" | "detailed">(
    "consolidated"
  );

  useEffect(() => {
    fetchEmployeePayrollComprehensive();
  }, [id]);

  const fetchEmployeePayrollComprehensive = async () => {
    if (!id) return;

    setIsLoading(true);
    try {
      const response = await getEmployeePayrollComprehensive(Number(id));

      // Set all data from the comprehensive response
      setPayroll(response);
      setMidMonthPayroll(response.mid_month_payroll);
      setMonthlyLeaveRecords(response.leave_records || []);
      setCommissionRecords(response.commission_records || []);
    } catch (error) {
      console.error("Error fetching comprehensive employee payroll:", error);
      toast.error("Failed to load employee payroll details");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteItem = async () => {
    if (!itemToDelete || !itemToDelete.id) return;

    setIsDeleting(true);
    try {
      await deletePayrollItem(itemToDelete.id);
      toast.success("Item deleted successfully");
      await fetchEmployeePayrollComprehensive();
    } catch (error) {
      console.error("Error deleting payroll item:", error);
      toast.error("Failed to delete payroll item");
    } finally {
      setIsDeleting(false);
      setShowDeleteDialog(false);
      setItemToDelete(null);
    }
  };

  const handleBack = () => {
    // Navigate back with year and month params to preserve the selected month
    if (payroll) {
      navigate(`/payroll/monthly-payrolls?year=${payroll.year}&month=${payroll.month}`);
    } else {
      navigate("/payroll/monthly-payrolls");
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-MY", {
      style: "currency",
      currency: "MYR",
    }).format(amount);
  };

  // Helper to format source date for display
  const formatSourceDate = (dateStr: string | null | undefined): string => {
    if (!dateStr) return "-";
    try {
      return format(new Date(dateStr), "dd MMM");
    } catch {
      return dateStr;
    }
  };

  // Helper to generate work log URL for navigation
  const getWorkLogUrl = (item: PayrollItem): string | null => {
    if (!item.work_log_id || !item.work_log_type) return null;

    const jobType = item.job_type || "";

    // Map job_type to route path based on payrollJobConfigs
    // Handle both config keys (MEE, BIHUN) and specific job IDs (MEE_FOREMAN, BH_BERAS)
    const getRoutePath = (jt: string): string | null => {
      // Direct mapping for config keys
      const directMap: Record<string, string> = {
        MEE: "mee-production",
        BIHUN: "bihun-production",
        BOILER: "boiler-production",
        SALESMAN: "salesman-production",
        MAINTEN: "maintenance-monthly",
        OFFICE: "office-monthly",
        SAPU: "tukang-sapu-monthly",
      };

      if (directMap[jt]) return directMap[jt];

      // Match by prefix for specific job IDs (e.g., MEE_FOREMAN → mee-production)
      if (jt.startsWith("MEE")) return "mee-production";
      if (jt.startsWith("BH_") || jt.startsWith("BIHUN"))
        return "bihun-production";
      if (jt.startsWith("BOILER")) return "boiler-production";
      if (jt.startsWith("SALESMAN")) return "salesman-production";

      return null;
    };

    const routePath = getRoutePath(jobType);
    if (!routePath) return null;

    return `/payroll/${routePath}/${item.work_log_id}`;
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
      <div className="text-center py-12">
        <p className="text-default-500 dark:text-gray-400">Employee payroll not found</p>
        <Button onClick={handleBack} className="mt-4" variant="outline">
          Back
        </Button>
      </div>
    );
  }

  const isEditable = payroll.payroll_status !== "Finalized";
  const groupedItems = groupItemsByType(
    payroll.items.map((item) => ({
      ...item,
      id: item.id || 0, // Ensure id is always a number
    }))
  );

  // Consolidated items for the consolidated view
  const consolidatedItems = consolidatePayrollItems(payroll.items);
  const groupedConsolidatedItems = groupConsolidatedItemsByType(consolidatedItems);

  // Detect if this is a combined job payroll (multiple job types)
  const uniqueJobTypes = [
    ...new Set(payroll.items.map((item) => item.job_type).filter(Boolean)),
  ];
  const isCombinedPayroll = uniqueJobTypes.length > 1;

  // Derive employee-to-job-types mapping from actual payroll items
  // This handles cases where one employee ID works on multiple job types
  const derivedEmployeeJobMapping = payroll.items.reduce((acc, item) => {
    const empId = item.source_employee_id || payroll.employee_id;
    if (empId && item.job_type) {
      if (!acc[empId]) {
        acc[empId] = new Set<string>();
      }
      acc[empId].add(item.job_type);
    }
    return acc;
  }, {} as Record<string, Set<string>>);

  // Group items by job type first, then by pay type for combined payrolls
  const itemsByJob = isCombinedPayroll
    ? uniqueJobTypes.reduce((acc, jobType) => {
        const jobItems = payroll.items.filter(
          (item) => item.job_type === jobType
        );
        acc[jobType as string] = groupItemsByType(
          jobItems.map((item) => ({
            ...item,
            id: item.id || 0,
          }))
        );
        return acc;
      }, {} as Record<string, ReturnType<typeof groupItemsByType>>)
    : null;

  // Consolidated items by job type for combined payrolls
  const consolidatedItemsByJob = isCombinedPayroll
    ? uniqueJobTypes.reduce((acc, jobType) => {
        const jobItems = payroll.items.filter(
          (item) => item.job_type === jobType
        );
        const consolidated = consolidatePayrollItems(jobItems);
        acc[jobType as string] = groupConsolidatedItemsByType(consolidated);
        return acc;
      }, {} as Record<string, ReturnType<typeof groupConsolidatedItemsByType>>)
    : null;

  // Calculate totals for each group - use consolidated items for consistency with recalculated amounts
  const baseTotal = groupedConsolidatedItems["Base"].reduce(
    (sum, item) => sum + item.total_amount,
    0
  );
  const tambahanTotal = groupedConsolidatedItems["Tambahan"].reduce(
    (sum, item) => sum + item.total_amount,
    0
  );
  const overtimeTotal = groupedConsolidatedItems["Overtime"].reduce(
    (sum, item) => sum + item.total_amount,
    0
  );

  // Helper to format job type for display
  const formatJobType = (jobType: string): string => {
    const jobTypeMap: Record<string, string> = {
      MEE: "Mee",
      BIHUN: "Bihun",
      MAINTEN: "Maintenance",
    };
    return jobTypeMap[jobType] || jobType;
  };

  // Helper to get sorted items by date for detailed view with day separators
  const getSortedItemsWithSeparators = (items: PayrollItem[]) => {
    const sorted = [...items].sort((a, b) => {
      if (!a.source_date && !b.source_date) return 0;
      if (!a.source_date) return 1;
      if (!b.source_date) return -1;
      return a.source_date.localeCompare(b.source_date);
    });
    return sorted;
  };

  // Helper to render consolidated table row
  const renderConsolidatedRow = (item: ConsolidatedPayrollItem, index: number) => {
    // Find the original item for deletion (only for single manual items)
    const canDelete = item.is_manual && item.item_count === 1 && isEditable;
    const originalItem = canDelete
      ? payroll.items.find(
          (i) =>
            i.pay_code_id === item.pay_code_id &&
            i.rate === item.rate &&
            i.rate_unit === item.rate_unit &&
            i.is_manual
        )
      : null;

    return (
      <tr key={`${item.pay_code_id}-${item.rate}-${index}`} className="hover:bg-default-50 dark:hover:bg-gray-700">
        <td className="px-3 py-2">
          <span
            className="text-sm text-default-900 dark:text-gray-100"
            title={`${item.description} (${item.pay_code_id})`}
          >
            {item.description}{" "}
            <span className="text-default-500 dark:text-gray-400">({item.pay_code_id})</span>
            {item.item_count > 1 && (
              <span className="ml-1.5 px-1 py-0.5 text-xs rounded bg-default-100 dark:bg-gray-700 text-default-500 dark:text-gray-400">
                {item.item_count} entries
              </span>
            )}
            {item.is_manual && (
              <span className="ml-1.5 px-1 py-0.5 text-xs rounded bg-default-100 dark:bg-gray-700 text-default-600 dark:text-gray-300">
                Manual
              </span>
            )}
          </span>
        </td>
        <td className="px-3 py-2 whitespace-nowrap text-center text-sm">
          {item.rate_unit === "Percent"
            ? `${item.rate}%`
            : `${formatCurrency(item.rate)}/${item.rate_unit}`}
        </td>
        <td className="px-3 py-2 whitespace-nowrap text-center text-sm">
          {item.total_quantity}
        </td>
        <td className="px-3 py-2 whitespace-nowrap text-right text-sm font-medium">
          {formatCurrency(item.total_amount)}
        </td>
        {canDelete && originalItem && (
          <td className="px-3 py-2 whitespace-nowrap text-center">
            <button
              onClick={() => {
                setItemToDelete({ ...originalItem, id: originalItem.id || 0 });
                setShowDeleteDialog(true);
              }}
              className="text-rose-600 hover:text-rose-800"
            >
              <IconTrash size={16} />
            </button>
          </td>
        )}
      </tr>
    );
  };

  // Helper to render detailed table row with optional day separator
  const renderDetailedRow = (
    item: PayrollItem,
    index: number,
    items: PayrollItem[],
    showDeleteButton: boolean = false
  ) => {
    const prevItem = index > 0 ? items[index - 1] : null;
    const isNewDay = prevItem && prevItem.source_date !== item.source_date && item.source_date;
    const colCount = showDeleteButton && isEditable ? 6 : 5;

    return (
      <React.Fragment key={item.id}>
        {isNewDay && (
          <tr className="bg-default-100 dark:bg-gray-700">
            <td colSpan={colCount} className="px-3 py-1.5 text-xs font-semibold text-default-600 dark:text-gray-300 border-t-2 border-default-300 dark:border-gray-600">
              {formatSourceDate(item.source_date)}
            </td>
          </tr>
        )}
        <tr className="hover:bg-default-50 dark:hover:bg-gray-700">
        <td className="px-3 py-2 whitespace-nowrap text-center text-sm">
          {item.source_date ? (
            getWorkLogUrl(item) ? (
              <Link
                to={getWorkLogUrl(item)!}
                className="text-sky-600 dark:text-sky-400 hover:underline"
              >
                {formatSourceDate(item.source_date)}
              </Link>
            ) : (
              formatSourceDate(item.source_date)
            )
          ) : (
            "-"
          )}
        </td>
        <td className="px-3 py-2">
          <span
            className="text-sm text-default-900 dark:text-gray-100"
            title={`${item.description} (${item.pay_code_id})`}
          >
            {item.description}{" "}
            <span className="text-default-500 dark:text-gray-400">({item.pay_code_id})</span>
            {item.is_manual && (
              <span className="ml-1.5 px-1 py-0.5 text-xs rounded bg-default-100 dark:bg-gray-700 text-default-600 dark:text-gray-300">
                Manual
              </span>
            )}
          </span>
        </td>
        <td className="px-3 py-2 whitespace-nowrap text-center text-sm">
          {item.rate_unit === "Percent"
            ? `${item.rate}%`
            : `${formatCurrency(item.rate)}/${item.rate_unit}`}
        </td>
        <td className="px-3 py-2 whitespace-nowrap text-center text-sm">
          {item.quantity}
        </td>
        <td className="px-3 py-2 whitespace-nowrap text-right text-sm font-medium">
          {formatCurrency(item.amount)}
        </td>
        {showDeleteButton && isEditable && (
          <td className="px-3 py-2 whitespace-nowrap text-center">
            <button
              onClick={() => {
                setItemToDelete({ ...item, id: item.id || 0 });
                setShowDeleteDialog(true);
              }}
              className="text-rose-600 hover:text-rose-800"
            >
              <IconTrash size={16} />
            </button>
          </td>
        )}
        </tr>
      </React.Fragment>
    );
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center">
        <div className="flex items-center gap-4">
          <BackButton onClick={handleBack} />
          <div className="h-6 w-px bg-default-300 dark:bg-gray-600"></div>
          <div>
            <h1 className="text-xl font-semibold text-default-800 dark:text-gray-100">
              Payroll Details
            </h1>
            <p className="text-sm text-default-500 dark:text-gray-400 mt-1">
              {getMonthName(payroll.month)} {payroll.year}
            </p>
          </div>
          <div className="h-6 w-px bg-default-300 dark:bg-gray-600"></div>
          {/* View Mode Toggle */}
          <div className="flex rounded-lg border border-default-300 dark:border-gray-600 overflow-hidden">
            <button
              onClick={() => setViewMode("consolidated")}
              className={`px-3 py-1.5 flex items-center gap-1.5 text-sm ${
                viewMode === "consolidated"
                  ? "bg-sky-500 text-white"
                  : "bg-white dark:bg-gray-800 text-default-600 dark:text-gray-300 hover:bg-default-50 dark:hover:bg-gray-700"
              }`}
              title="Summary View - Shows totals grouped by item"
            >
              <IconList size={16} />
              Summary
            </button>
            <button
              onClick={() => setViewMode("detailed")}
              className={`px-3 py-1.5 flex items-center gap-1.5 text-sm ${
                viewMode === "detailed"
                  ? "bg-sky-500 text-white"
                  : "bg-white dark:bg-gray-800 text-default-600 dark:text-gray-300 hover:bg-default-50 dark:hover:bg-gray-700"
              }`}
              title="Detailed View - Shows per-day breakdown"
            >
              <IconListDetails size={16} />
              Detailed
            </button>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 mt-2 md:mt-0 w-full md:w-auto">
          <PrintPayslipButton
            payroll={payroll}
            midMonthPayroll={midMonthPayroll}
            buttonText="Print Pay Slip"
            variant="filled"
            color="sky"
            className="flex-1 md:flex-none shadow-sm"
          />
          <DownloadPayslipButton
            payroll={payroll}
            midMonthPayroll={midMonthPayroll}
            buttonText="Download PDF"
            variant="default"
            color="sky"
            className="flex-1 md:flex-none"
          />
          {isEditable && (
            <Button
              onClick={() => setShowAddItemModal(true)}
              icon={IconPlus}
              variant="default"
              color="default"
              className="flex-1 md:flex-none"
            >
              Add Manual Item
            </Button>
          )}
        </div>
      </div>

      {/* Payroll Summary Grid */}
      <div className="mb-2 grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Employee Information Column */}
        <div className="border border-default-200 dark:border-gray-700 rounded-lg overflow-hidden bg-white dark:bg-gray-800 transition-shadow hover:shadow-md">
          <div className="px-4 py-3 bg-default-50 dark:bg-gray-900/50 border-b border-default-100 dark:border-gray-700">
            <h3 className="text-md font-semibold text-default-700 dark:text-gray-200">
              Employee Information
            </h3>
          </div>
          <div className="p-4 flex flex-col h-full">
            <div className="space-y-4 flex-grow">
              {/* Employee Name */}
              <div>
                <p className="text-xs uppercase tracking-wide text-default-400 dark:text-gray-400 mb-1">
                  Employee
                </p>
                {isCombinedPayroll && Object.keys(derivedEmployeeJobMapping).length > 0 ? (
                  <>
                    <p className="font-semibold text-default-800 dark:text-gray-100">
                      {payroll.employee_name || "Unknown"}
                    </p>
                    <div className="mt-2 space-y-1">
                      {Object.entries(derivedEmployeeJobMapping).map(
                        ([empId, jobTypesSet]) => (
                          <div
                            key={empId}
                            className="flex items-center text-sm"
                          >
                            <Link
                              to={`/catalogue/staff/${empId}`}
                              className="text-sky-600 dark:text-sky-400 hover:underline font-medium"
                            >
                              {empId}
                            </Link>
                            <span className="mx-2 text-default-300 dark:text-gray-600">→</span>
                            <span className="text-default-600 dark:text-gray-300">
                              {Array.from(jobTypesSet).join(", ")}
                            </span>
                          </div>
                        )
                      )}
                    </div>
                  </>
                ) : (
                  <>
                    <p className="font-semibold text-default-800 dark:text-gray-100">
                      <Link
                        to={`/catalogue/staff/${payroll.employee_id}`}
                        className="text-sky-600 dark:text-sky-400 hover:underline"
                      >
                        {payroll.employee_name || "Unknown"}
                      </Link>
                    </p>
                    <p className="text-sm text-default-500 dark:text-gray-400 mt-1">
                      {payroll.employee_id}
                    </p>
                  </>
                )}
              </div>

              {/* Job Type */}
              <div>
                <p className="text-xs uppercase tracking-wide text-default-400 dark:text-gray-400 mb-1">
                  Job Type
                </p>
                <p className="font-semibold text-default-800 dark:text-gray-100">
                  {payroll.job_type}
                </p>
                <p className="text-sm text-default-500 dark:text-gray-400 mt-1">
                  {payroll.section}
                </p>
              </div>

              {/* Status */}
              <div>
                <p className="text-xs uppercase tracking-wide text-default-400 dark:text-gray-400 mb-1">
                  Status
                </p>
                <span
                  className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-sm font-medium ${
                    payroll.payroll_status === "CONFIRMED"
                      ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300"
                      : payroll.payroll_status === "PENDING"
                      ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300"
                      : "bg-default-100 text-default-800 dark:bg-gray-700 dark:text-gray-300"
                  }`}
                >
                  {payroll.payroll_status}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Earnings Column */}
        <div className="border border-default-200 dark:border-gray-700 rounded-lg overflow-hidden bg-white dark:bg-gray-800 flex flex-col transition-shadow hover:shadow-md">
          <div className="px-4 py-3 bg-emerald-50 dark:bg-emerald-900/20 border-b border-emerald-100 dark:border-emerald-800/50">
            <h3 className="text-md font-semibold text-emerald-800 dark:text-emerald-300 flex items-center gap-2">
              <IconCash size={18} className="text-emerald-600 dark:text-emerald-400" />
              Earnings
            </h3>
          </div>
          <div className="p-4 flex flex-col flex-grow">
            <div className="space-y-2 flex-grow">
              <div className="flex justify-between text-sm">
                <span className="text-default-600 dark:text-gray-300">Base Pay</span>
                <span className="font-medium text-default-800 dark:text-gray-100">
                  {formatCurrency(baseTotal)}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-default-600 dark:text-gray-300">Tambahan</span>
                <span className="font-medium text-default-800 dark:text-gray-100">
                  {formatCurrency(tambahanTotal)}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-default-600 dark:text-gray-300">Overtime</span>
                <span className="font-medium text-default-800 dark:text-gray-100">
                  {formatCurrency(overtimeTotal)}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-default-600 dark:text-gray-300">Leave Pay</span>
                <span className="font-medium text-default-800 dark:text-gray-100">
                  {formatCurrency(
                    monthlyLeaveRecords.reduce(
                      (sum, record) => sum + Number(record.amount_paid),
                      0
                    )
                  )}
                </span>
              </div>
              {commissionRecords.length > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-default-600 dark:text-gray-300">
                    {commissionRecords
                      .map((record) => record.description)
                      .join(" + ")}
                  </span>
                  <span className="font-medium text-default-800 dark:text-gray-100">
                    {formatCurrency(
                      commissionRecords.reduce(
                        (sum, record) => sum + Number(record.amount),
                        0
                      )
                    )}
                  </span>
                </div>
              )}
            </div>
            <div className="border-t border-default-200 dark:border-gray-600 mt-auto pt-3">
              <div className="flex justify-between font-semibold">
                <span className="text-default-800 dark:text-gray-100">Gross Pay</span>
                <span className="text-emerald-700 dark:text-emerald-400 text-lg">
                  {formatCurrency(payroll.gross_pay)}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Deductions & Final Payment Column */}
        <div className="border border-sky-200 dark:border-sky-800/50 rounded-lg bg-white dark:bg-gray-800 flex flex-col transition-shadow hover:shadow-md">
          <div className="px-4 py-3 bg-sky-50 dark:bg-sky-900/20 border-b border-sky-100 dark:border-sky-800/50 rounded-t-lg">
            <h3 className="text-md font-semibold text-sky-800 dark:text-sky-300 flex items-center gap-2">
              <IconReceipt size={18} className="text-sky-600 dark:text-sky-400" />
              Deductions & Final Pay
            </h3>
          </div>
          <div className="p-4 flex flex-col flex-grow">
            <div className="space-y-2 flex-grow">
              <div className="flex justify-between text-sm">
                <span className="text-default-600 dark:text-gray-300">Gross Pay</span>
                <span className="font-medium text-default-800 dark:text-gray-100">
                  {formatCurrency(payroll.gross_pay)}
                </span>
              </div>

              {/* Dotted divider */}
              <div className="border-t border-dashed border-default-300 dark:border-gray-600 my-2"></div>

              {/* Statutory Deductions with Tooltips */}
              {payroll.deductions
                ?.filter((d) => d.employee_amount > 0)
                .sort((a, b) => {
                  const order = ["EPF", "SIP", "SOCSO", "INCOME_TAX"];
                  const aIndex = order.indexOf(a.deduction_type.toUpperCase());
                  const bIndex = order.indexOf(b.deduction_type.toUpperCase());
                  return (
                    (aIndex === -1 ? 999 : aIndex) -
                    (bIndex === -1 ? 999 : bIndex)
                  );
                })
                .map((deduction) => {
                  const deductionType = deduction.deduction_type.toUpperCase();
                  const deductionName =
                    deductionType === "INCOME_TAX"
                      ? "Income Tax"
                      : deductionType;
                  const percentage =
                    payroll.gross_pay > 0
                      ? (
                          (deduction.employee_amount / payroll.gross_pay) *
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
                        - {formatCurrency(deduction.employee_amount)}
                      </span>
                      {/* Tooltip - appears below */}
                      <div className="absolute left-0 top-full mt-2 hidden group-hover:block z-50 w-64">
                        <div className="bg-default-800 text-white text-xs rounded-lg p-3 shadow-lg relative">
                          <div className="absolute left-4 bottom-full w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-b-[6px] border-b-default-800"></div>
                          <div className="font-semibold mb-2 text-default-100">
                            {deductionName} Breakdown
                          </div>
                          <div className="space-y-1">
                            <div className="flex justify-between">
                              <span className="text-default-300">
                                Employee:
                              </span>
                              <span>
                                {formatCurrency(deduction.employee_amount)}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-default-300">
                                Employer:
                              </span>
                              <span>
                                {formatCurrency(deduction.employer_amount)}
                              </span>
                            </div>
                            <div className="border-t border-default-600 mt-2 pt-2">
                              <div className="flex justify-between text-default-400">
                                <span>Employee Rate:</span>
                                <span>{deduction.rate_info.employee_rate}</span>
                              </div>
                              <div className="flex justify-between text-default-400">
                                <span>Employer Rate:</span>
                                <span>{deduction.rate_info.employer_rate}</span>
                              </div>
                              {deduction.rate_info.age_group && (
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

              {/* Commission Advance with Tooltip */}
              {commissionRecords.length > 0 && (
                <div className="group relative flex justify-between text-sm">
                  <span className="text-default-600 dark:text-gray-300 flex items-center gap-1 cursor-help">
                    {commissionRecords
                      .map((record) => record.description)
                      .join(" + ")}{" "}
                    Advance
                    <IconInfoCircle
                      size={14}
                      className="text-default-400 dark:text-gray-400 opacity-60 group-hover:opacity-100"
                    />
                  </span>
                  <span className="font-medium text-rose-600 dark:text-rose-400">
                    -{" "}
                    {formatCurrency(
                      commissionRecords.reduce(
                        (sum, record) => sum + Number(record.amount),
                        0
                      )
                    )}
                  </span>
                  {/* Tooltip - appears below */}
                  <div className="absolute left-0 top-full mt-2 hidden group-hover:block z-50 w-64">
                    <div className="bg-default-800 text-white text-xs rounded-lg p-3 shadow-lg relative">
                      <div className="absolute left-4 bottom-full w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-b-[6px] border-b-default-800"></div>
                      <div className="font-semibold mb-2 text-default-100">
                        Commission Advance
                      </div>
                      <div className="space-y-1">
                        <div className="flex justify-between">
                          <span className="text-default-300">
                            Total Amount:
                          </span>
                          <span>
                            {formatCurrency(
                              commissionRecords.reduce(
                                (sum, record) => sum + Number(record.amount),
                                0
                              )
                            )}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-default-300">Records:</span>
                          <span>{commissionRecords.length}</span>
                        </div>
                      </div>
                      <div className="border-t border-default-600 mt-2 pt-2 text-default-400">
                        Payments made in advance, deducted from final pay.
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Mid-month Advance with Tooltip */}
              {midMonthPayroll && (
                <div className="group relative flex justify-between text-sm">
                  <span className="text-default-600 dark:text-gray-300 flex items-center gap-1 cursor-help">
                    Mid-month Advance
                    <IconInfoCircle
                      size={14}
                      className="text-default-400 dark:text-gray-400 opacity-60 group-hover:opacity-100"
                    />
                  </span>
                  <span className="font-medium text-rose-600 dark:text-rose-400">
                    - {formatCurrency(midMonthPayroll.amount)}
                  </span>
                  {/* Tooltip - appears below */}
                  <div className="absolute left-0 top-full mt-2 hidden group-hover:block z-50 w-64">
                    <div className="bg-default-800 text-white text-xs rounded-lg p-3 shadow-lg relative">
                      <div className="absolute left-4 bottom-full w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-b-[6px] border-b-default-800"></div>
                      <div className="font-semibold mb-2 text-default-100">
                        Mid-month Advance
                      </div>
                      <div className="space-y-1">
                        <div className="flex justify-between">
                          <span className="text-default-300">Amount:</span>
                          <span>{formatCurrency(midMonthPayroll.amount)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-default-300">Date:</span>
                          <span>
                            {format(
                              new Date(midMonthPayroll.created_at),
                              "dd MMM yyyy"
                            )}
                          </span>
                        </div>
                      </div>
                      <div className="border-t border-default-600 mt-2 pt-2 text-default-400">
                        Advance payment made mid-month, deducted from final pay.
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Cuti Tahunan Advance with Tooltip (MAINTEN only) */}
              {payroll.job_type === "MAINTEN" &&
                monthlyLeaveRecords.filter(
                  (record) => record.leave_type === "cuti_tahunan"
                ).length > 0 && (
                  <div className="group relative flex justify-between text-sm">
                    <span className="text-default-600 dark:text-gray-300 flex items-center gap-1 cursor-help">
                      Cuti Tahunan Advance
                      <IconInfoCircle
                        size={14}
                        className="text-default-400 dark:text-gray-400 opacity-60 group-hover:opacity-100"
                      />
                    </span>
                    <span className="font-medium text-rose-600 dark:text-rose-400">
                      -{" "}
                      {formatCurrency(
                        monthlyLeaveRecords
                          .filter(
                            (record) => record.leave_type === "cuti_tahunan"
                          )
                          .reduce((sum, record) => sum + record.amount_paid, 0)
                      )}
                    </span>
                    {/* Tooltip - appears below */}
                    <div className="absolute left-0 top-full mt-2 hidden group-hover:block z-50 w-64">
                      <div className="bg-default-800 text-white text-xs rounded-lg p-3 shadow-lg relative">
                        <div className="absolute left-4 bottom-full w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-b-[6px] border-b-default-800"></div>
                        <div className="font-semibold mb-2 text-default-100">
                          Cuti Tahunan Advance
                        </div>
                        <div className="space-y-1">
                          <div className="flex justify-between">
                            <span className="text-default-300">Amount:</span>
                            <span>
                              {formatCurrency(
                                monthlyLeaveRecords
                                  .filter(
                                    (record) =>
                                      record.leave_type === "cuti_tahunan"
                                  )
                                  .reduce(
                                    (sum, record) => sum + record.amount_paid,
                                    0
                                  )
                              )}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-default-300">Days:</span>
                            <span>
                              {monthlyLeaveRecords
                                .filter(
                                  (record) =>
                                    record.leave_type === "cuti_tahunan"
                                )
                                .reduce(
                                  (sum, record) => sum + record.days_taken,
                                  0
                                )}{" "}
                              day
                              {monthlyLeaveRecords
                                .filter(
                                  (record) =>
                                    record.leave_type === "cuti_tahunan"
                                )
                                .reduce(
                                  (sum, record) => sum + record.days_taken,
                                  0
                                ) !== 1
                                ? "s"
                                : ""}
                            </span>
                          </div>
                        </div>
                        <div className="border-t border-default-600 mt-2 pt-2 text-default-400">
                          Annual leave payment for MAINTEN employees, treated as
                          advance.
                        </div>
                      </div>
                    </div>
                  </div>
                )}

              {/* Total Deductions */}
              <div className="border-t border-default-200 dark:border-gray-600 mt-2 pt-2">
                <div className="flex justify-between text-sm">
                  <span className="text-default-600 dark:text-gray-300 font-medium">
                    Total Deductions
                  </span>
                  <span className="font-semibold text-rose-600 dark:text-rose-400">
                    -{" "}
                    {formatCurrency(
                      (() => {
                        const statutoryDeductions =
                          payroll.deductions
                            ?.filter((d) => d.employee_amount > 0)
                            .reduce((sum, d) => sum + d.employee_amount, 0) ||
                          0;
                        const commissionAdvance = commissionRecords.reduce(
                          (sum, r) => sum + Number(r.amount),
                          0
                        );
                        const midMonthAdvance = midMonthPayroll?.amount || 0;
                        const cutiTahunanAdvance =
                          payroll.job_type === "MAINTEN"
                            ? monthlyLeaveRecords
                                .filter((r) => r.leave_type === "cuti_tahunan")
                                .reduce((sum, r) => sum + r.amount_paid, 0)
                            : 0;
                        return (
                          statutoryDeductions +
                          commissionAdvance +
                          midMonthAdvance +
                          cutiTahunanAdvance
                        );
                      })()
                    )}
                  </span>
                </div>
              </div>
            </div>

            {/* Digenapkan (Rounding) - Only show if there's an adjustment */}
            {(() => {
              const isMainten = payroll.job_type === "MAINTEN";
              const cutiTahunanAmount = monthlyLeaveRecords
                .filter((record) => record.leave_type === "cuti_tahunan")
                .reduce((sum, record) => sum + record.amount_paid, 0);
              const additionalMaintenDeduction = isMainten ? cutiTahunanAmount : 0;
              const commissionAdvance = commissionRecords.reduce(
                (sum, r) => sum + Number(r.amount),
                0
              );
              const finalPayment =
                payroll.net_pay -
                (midMonthPayroll?.amount || 0) -
                additionalMaintenDeduction -
                commissionAdvance;
              // Use stored rounding values if available, otherwise calculate
              const digenapkan = payroll.digenapkan ?? (Math.ceil(finalPayment) - finalPayment);

              return digenapkan > 0.001 ? (
                <div className="flex justify-between text-sm mt-2">
                  <span className="text-default-600 dark:text-gray-300">
                    Digenapkan
                  </span>
                  <span className="font-medium text-emerald-600 dark:text-emerald-400">
                    + {formatCurrency(digenapkan)}
                  </span>
                </div>
              ) : null;
            })()}

            {/* Take Home Pay - Highlighted */}
            <div className="bg-sky-100 dark:bg-sky-900/30 -mx-4 -mb-4 mt-4 px-4 py-4 border-t border-sky-200 dark:border-sky-800/50 rounded-b-lg">
              <div className="flex justify-between items-center">
                <span className="text-sky-800 dark:text-sky-300 font-bold text-base">
                  Take Home Pay
                </span>
                <span className="text-sky-900 dark:text-sky-200 text-2xl font-bold">
                  {formatCurrency(
                    (() => {
                      const isMainten = payroll.job_type === "MAINTEN";
                      const cutiTahunanAmount = monthlyLeaveRecords
                        .filter(
                          (record) => record.leave_type === "cuti_tahunan"
                        )
                        .reduce((sum, record) => sum + record.amount_paid, 0);
                      const additionalMaintenDeduction = isMainten
                        ? cutiTahunanAmount
                        : 0;
                      const commissionAdvance = commissionRecords.reduce(
                        (sum, r) => sum + Number(r.amount),
                        0
                      );
                      const finalPayment =
                        payroll.net_pay -
                        (midMonthPayroll?.amount || 0) -
                        additionalMaintenDeduction -
                        commissionAdvance;
                      // Use stored rounding values if available, otherwise calculate on-the-fly
                      return payroll.setelah_digenapkan ?? Math.ceil(finalPayment);
                    })()
                  )}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
      {/* Payroll Items Tab - This will contain all the existing payroll items tables */}
      <div>
        {/* Payroll Items - Grouped by Job Type for Combined Payrolls */}
        {isCombinedPayroll && itemsByJob ? (
          // Combined Payroll: Group by Job Type first
          uniqueJobTypes.map((jobType) => {
            const jobGroupedItems = itemsByJob[jobType as string];
            const jobConsolidatedItems = consolidatedItemsByJob?.[jobType as string];
            // Use consolidated items for totals - consistent with recalculated amounts
            const jobBaseTotal = (jobConsolidatedItems?.["Base"] || []).reduce(
              (sum, item) => sum + item.total_amount,
              0
            );
            const jobTambahanTotal = (jobConsolidatedItems?.["Tambahan"] || []).reduce(
              (sum, item) => sum + item.total_amount,
              0
            );
            const jobOvertimeTotal = (jobConsolidatedItems?.["Overtime"] || []).reduce(
              (sum, item) => sum + item.total_amount,
              0
            );
            const jobTotal = jobBaseTotal + jobTambahanTotal + jobOvertimeTotal;

            return (
              <div key={jobType} className="mb-3">
                <div className="flex items-center justify-between mb-3 pb-2 border-b-2 border-default-300 dark:border-gray-600">
                  <h3 className="text-lg font-semibold text-default-800 dark:text-gray-100">
                    {formatJobType(jobType as string)} Section
                  </h3>
                  <span className="text-sm font-medium text-default-600 dark:text-gray-300">
                    Subtotal: {formatCurrency(jobTotal)}
                  </span>
                </div>

                {/* Base Pay for this job */}
                {((viewMode === "consolidated" && (jobConsolidatedItems?.["Base"]?.length ?? 0) > 0) ||
                  (viewMode === "detailed" && jobGroupedItems["Base"].length > 0)) && (
                  <div className="mb-4 border border-default-200 dark:border-gray-700 rounded-lg overflow-hidden bg-white dark:bg-gray-800">
                    <div className="px-4 py-1.5 bg-amber-50 dark:bg-amber-900/20 border-b border-amber-100 dark:border-amber-800/50">
                      <h4 className="text-md font-semibold text-amber-800 dark:text-amber-300 flex items-center gap-2">
                        <IconCoins size={18} className="text-amber-600 dark:text-amber-400" />
                        Base Pay
                      </h4>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-default-200 dark:divide-gray-700">
                        <thead className="bg-default-50 dark:bg-gray-800">
                          <tr>
                            {viewMode === "detailed" && (
                              <th
                                scope="col"
                                className="px-3 py-2 text-center text-xs font-medium text-default-500 dark:text-gray-400 uppercase"
                              >
                                Date
                              </th>
                            )}
                            <th
                              scope="col"
                              className="px-3 py-2 text-left text-xs font-medium text-default-500 dark:text-gray-400 uppercase"
                            >
                              Description
                            </th>
                            <th
                              scope="col"
                              className="px-3 py-2 text-center text-xs font-medium text-default-500 dark:text-gray-400 uppercase"
                            >
                              Rate
                            </th>
                            <th
                              scope="col"
                              className="px-3 py-2 text-center text-xs font-medium text-default-500 dark:text-gray-400 uppercase"
                            >
                              {viewMode === "consolidated" ? "Total Qty" : "Qty"}
                            </th>
                            <th
                              scope="col"
                              className="px-3 py-2 text-right text-xs font-medium text-default-500 dark:text-gray-400 uppercase"
                            >
                              Amount
                            </th>
                          </tr>
                        </thead>
                        <tbody className="bg-white dark:bg-gray-800 divide-y divide-default-200 dark:divide-gray-700">
                          {viewMode === "consolidated"
                            ? jobConsolidatedItems?.["Base"]?.map((item, index) =>
                                renderConsolidatedRow(item, index)
                              )
                            : getSortedItemsWithSeparators(jobGroupedItems["Base"]).map(
                                (item, index, arr) => renderDetailedRow(item, index, arr, false)
                              )}
                        </tbody>
                        <tfoot className="bg-default-50 dark:bg-gray-800">
                          <tr>
                            <td
                              colSpan={viewMode === "detailed" ? 4 : 3}
                              className="px-3 py-2 text-right text-sm font-medium text-default-600 dark:text-gray-300"
                            >
                              Total Base
                            </td>
                            <td className="px-3 py-2 text-right text-sm font-semibold text-default-800 dark:text-gray-100">
                              {formatCurrency(jobBaseTotal)}
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>
                )}

                {/* Tambahan Pay for this job */}
                {((viewMode === "consolidated" && (jobConsolidatedItems?.["Tambahan"]?.length ?? 0) > 0) ||
                  (viewMode === "detailed" && jobGroupedItems["Tambahan"].length > 0)) && (
                  <div className="mb-4 border border-default-200 dark:border-gray-700 rounded-lg overflow-hidden bg-white dark:bg-gray-800">
                    <div className="px-4 py-1.5 bg-violet-50 dark:bg-violet-900/20 border-b border-violet-100 dark:border-violet-800/50">
                      <h4 className="text-md font-semibold text-violet-800 dark:text-violet-300 flex items-center gap-2">
                        <IconCirclePlus size={18} className="text-violet-600 dark:text-violet-400" />
                        Tambahan Pay
                      </h4>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-default-200 dark:divide-gray-700">
                        <thead className="bg-default-50 dark:bg-gray-800">
                          <tr>
                            {viewMode === "detailed" && (
                              <th
                                scope="col"
                                className="px-3 py-2 text-center text-xs font-medium text-default-500 dark:text-gray-400 uppercase"
                              >
                                Date
                              </th>
                            )}
                            <th
                              scope="col"
                              className="px-3 py-2 text-left text-xs font-medium text-default-500 dark:text-gray-400 uppercase"
                            >
                              Description
                            </th>
                            <th
                              scope="col"
                              className="px-3 py-2 text-center text-xs font-medium text-default-500 dark:text-gray-400 uppercase"
                            >
                              Rate
                            </th>
                            <th
                              scope="col"
                              className="px-3 py-2 text-center text-xs font-medium text-default-500 dark:text-gray-400 uppercase"
                            >
                              {viewMode === "consolidated" ? "Total Qty" : "Qty"}
                            </th>
                            <th
                              scope="col"
                              className="px-3 py-2 text-right text-xs font-medium text-default-500 dark:text-gray-400 uppercase"
                            >
                              Amount
                            </th>
                            {isEditable && (
                              viewMode === "detailed" ||
                              (viewMode === "consolidated" && jobConsolidatedItems?.["Tambahan"]?.some(item => item.is_manual && item.item_count === 1))
                            ) && (
                              <th
                                scope="col"
                                className="px-3 py-2 text-center text-xs font-medium text-default-500 dark:text-gray-400 uppercase w-12"
                              ></th>
                            )}
                          </tr>
                        </thead>
                        <tbody className="bg-white dark:bg-gray-800 divide-y divide-default-200 dark:divide-gray-700">
                          {viewMode === "consolidated"
                            ? jobConsolidatedItems?.["Tambahan"]?.map((item, index) =>
                                renderConsolidatedRow(item, index)
                              )
                            : getSortedItemsWithSeparators(jobGroupedItems["Tambahan"]).map(
                                (item, index, arr) => renderDetailedRow(item, index, arr, true)
                              )}
                        </tbody>
                        <tfoot className="bg-default-50 dark:bg-gray-800">
                          <tr>
                            <td
                              colSpan={viewMode === "detailed" ? 4 : 3}
                              className="px-3 py-2 text-right text-sm font-medium text-default-600 dark:text-gray-300"
                            >
                              Total Tambahan
                            </td>
                            <td className="px-3 py-2 text-right text-sm font-semibold text-default-800 dark:text-gray-100">
                              {formatCurrency(jobTambahanTotal)}
                            </td>
                            {isEditable && (
                              viewMode === "detailed" ||
                              (viewMode === "consolidated" && jobConsolidatedItems?.["Tambahan"]?.some(item => item.is_manual && item.item_count === 1))
                            ) && <td></td>}
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>
                )}

                {/* Overtime Pay for this job */}
                {((viewMode === "consolidated" && (jobConsolidatedItems?.["Overtime"]?.length ?? 0) > 0) ||
                  (viewMode === "detailed" && jobGroupedItems["Overtime"].length > 0)) && (
                  <div className="mb-4 border border-default-200 dark:border-gray-700 rounded-lg overflow-hidden bg-white dark:bg-gray-800">
                    <div className="px-4 py-1.5 bg-orange-50 dark:bg-orange-900/20 border-b border-orange-100 dark:border-orange-800/50">
                      <h4 className="text-md font-semibold text-orange-800 dark:text-orange-300 flex items-center gap-2">
                        <IconClock size={18} className="text-orange-600 dark:text-orange-400" />
                        Overtime Pay
                      </h4>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-default-200 dark:divide-gray-700">
                        <thead className="bg-default-50 dark:bg-gray-800">
                          <tr>
                            {viewMode === "detailed" && (
                              <th
                                scope="col"
                                className="px-3 py-2 text-center text-xs font-medium text-default-500 dark:text-gray-400 uppercase"
                              >
                                Date
                              </th>
                            )}
                            <th
                              scope="col"
                              className="px-3 py-2 text-left text-xs font-medium text-default-500 dark:text-gray-400 uppercase"
                            >
                              Description
                            </th>
                            <th
                              scope="col"
                              className="px-3 py-2 text-center text-xs font-medium text-default-500 dark:text-gray-400 uppercase"
                            >
                              Rate
                            </th>
                            <th
                              scope="col"
                              className="px-3 py-2 text-center text-xs font-medium text-default-500 dark:text-gray-400 uppercase"
                            >
                              {viewMode === "consolidated" ? "Total Qty" : "Qty"}
                            </th>
                            <th
                              scope="col"
                              className="px-3 py-2 text-right text-xs font-medium text-default-500 dark:text-gray-400 uppercase"
                            >
                              Amount
                            </th>
                          </tr>
                        </thead>
                        <tbody className="bg-white dark:bg-gray-800 divide-y divide-default-200 dark:divide-gray-700">
                          {viewMode === "consolidated"
                            ? jobConsolidatedItems?.["Overtime"]?.map((item, index) =>
                                renderConsolidatedRow(item, index)
                              )
                            : getSortedItemsWithSeparators(jobGroupedItems["Overtime"]).map(
                                (item, index, arr) => renderDetailedRow(item, index, arr, false)
                              )}
                        </tbody>
                        <tfoot className="bg-default-50 dark:bg-gray-800">
                          <tr>
                            <td
                              colSpan={viewMode === "detailed" ? 4 : 3}
                              className="px-3 py-2 text-right text-sm font-medium text-default-600 dark:text-gray-300"
                            >
                              Total Overtime
                            </td>
                            <td className="px-3 py-2 text-right text-sm font-semibold text-default-800 dark:text-gray-100">
                              {formatCurrency(jobOvertimeTotal)}
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        ) : (
          // Single Job Payroll: Original layout with compact tables
          <>
            {/* Base Pay Items */}
            {((viewMode === "consolidated" && groupedConsolidatedItems["Base"].length > 0) ||
              (viewMode === "detailed" && groupedItems["Base"].length > 0)) && (
              <div className="mb-4 border border-default-200 dark:border-gray-700 rounded-lg overflow-hidden bg-white dark:bg-gray-800">
                <div className="px-4 py-1.5 bg-amber-50 dark:bg-amber-900/20 border-b border-amber-100 dark:border-amber-800/50">
                  <h3 className="text-md font-semibold text-amber-800 dark:text-amber-300 flex items-center gap-2">
                    <IconCoins size={18} className="text-amber-600 dark:text-amber-400" />
                    Base Pay
                  </h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-default-200 dark:divide-gray-700">
                    <thead className="bg-default-50 dark:bg-gray-800">
                      <tr>
                        {viewMode === "detailed" && (
                          <th
                            scope="col"
                            className="px-3 py-2 text-center text-xs font-medium text-default-500 dark:text-gray-400 uppercase"
                          >
                            Date
                          </th>
                        )}
                        <th
                          scope="col"
                          className="px-3 py-2 text-left text-xs font-medium text-default-500 dark:text-gray-400 uppercase"
                        >
                          Description
                        </th>
                        <th
                          scope="col"
                          className="px-3 py-2 text-center text-xs font-medium text-default-500 dark:text-gray-400 uppercase"
                        >
                          Rate
                        </th>
                        <th
                          scope="col"
                          className="px-3 py-2 text-center text-xs font-medium text-default-500 dark:text-gray-400 uppercase"
                        >
                          {viewMode === "consolidated" ? "Total Qty" : "Qty"}
                        </th>
                        <th
                          scope="col"
                          className="px-3 py-2 text-right text-xs font-medium text-default-500 dark:text-gray-400 uppercase"
                        >
                          Amount
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white dark:bg-gray-800 divide-y divide-default-200 dark:divide-gray-700">
                      {viewMode === "consolidated"
                        ? groupedConsolidatedItems["Base"].map((item, index) =>
                            renderConsolidatedRow(item, index)
                          )
                        : getSortedItemsWithSeparators(groupedItems["Base"]).map(
                            (item, index, arr) => renderDetailedRow(item, index, arr, false)
                          )}
                    </tbody>
                    <tfoot className="bg-default-50 dark:bg-gray-800">
                      <tr>
                        <td
                          colSpan={viewMode === "detailed" ? 4 : 3}
                          className="px-3 py-2 text-right text-sm font-medium text-default-600 dark:text-gray-300"
                        >
                          Total Base Pay
                          {(() => {
                            const baseGroupedByHours = groupedItems["Base"]
                              .filter((item) => item.rate_unit === "Hour" || item.rate_unit === "Bill")
                              .reduce((acc, item) => {
                                const existing = acc.find(
                                  (group) => group.hours === item.quantity
                                );
                                if (existing) existing.amount += item.amount;
                                else
                                  acc.push({
                                    hours: item.quantity,
                                    amount: item.amount,
                                  });
                                return acc;
                              }, [] as { hours: number; amount: number }[]);
                            if (baseGroupedByHours.length > 0) {
                              const maxHoursGroup = baseGroupedByHours.reduce(
                                (max, curr) =>
                                  curr.hours > max.hours ? curr : max,
                                baseGroupedByHours[0]
                              );
                              const avgRate =
                                maxHoursGroup?.hours > 0
                                  ? baseTotal / maxHoursGroup.hours
                                  : 0;
                              return (
                                <div className="text-xs text-default-400 dark:text-gray-400">
                                  Avg: {formatCurrency(avgRate)}/hr
                                </div>
                              );
                            }
                            return null;
                          })()}
                        </td>
                        <td className="px-3 py-2 text-right text-sm font-semibold text-default-800 dark:text-gray-100">
                          {formatCurrency(baseTotal)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )}

            {/* Tambahan Pay Items */}
            {((viewMode === "consolidated" && groupedConsolidatedItems["Tambahan"].length > 0) ||
              (viewMode === "detailed" && groupedItems["Tambahan"].length > 0)) && (
              <div className="mb-4 border border-default-200 dark:border-gray-700 rounded-lg overflow-hidden bg-white dark:bg-gray-800">
                <div className="px-4 py-2 bg-violet-50 dark:bg-violet-900/20 border-b border-violet-100 dark:border-violet-800/50">
                  <h3 className="text-md font-semibold text-violet-800 dark:text-violet-300 flex items-center gap-2">
                    <IconCirclePlus size={18} className="text-violet-600 dark:text-violet-400" />
                    Tambahan Pay
                  </h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-default-200 dark:divide-gray-700">
                    <thead className="bg-default-50 dark:bg-gray-800">
                      <tr>
                        {viewMode === "detailed" && (
                          <th
                            scope="col"
                            className="px-3 py-2 text-center text-xs font-medium text-default-500 dark:text-gray-400 uppercase"
                          >
                            Date
                          </th>
                        )}
                        <th
                          scope="col"
                          className="px-3 py-2 text-left text-xs font-medium text-default-500 dark:text-gray-400 uppercase"
                        >
                          Description
                        </th>
                        <th
                          scope="col"
                          className="px-3 py-2 text-center text-xs font-medium text-default-500 dark:text-gray-400 uppercase"
                        >
                          Rate
                        </th>
                        <th
                          scope="col"
                          className="px-3 py-2 text-center text-xs font-medium text-default-500 dark:text-gray-400 uppercase"
                        >
                          {viewMode === "consolidated" ? "Total Qty" : "Qty"}
                        </th>
                        <th
                          scope="col"
                          className="px-3 py-2 text-right text-xs font-medium text-default-500 dark:text-gray-400 uppercase"
                        >
                          Amount
                        </th>
                        {isEditable && (
                          viewMode === "detailed" ||
                          (viewMode === "consolidated" && groupedConsolidatedItems["Tambahan"].some(item => item.is_manual && item.item_count === 1))
                        ) && (
                          <th
                            scope="col"
                            className="px-3 py-2 text-center text-xs font-medium text-default-500 dark:text-gray-400 uppercase w-12"
                          ></th>
                        )}
                      </tr>
                    </thead>
                    <tbody className="bg-white dark:bg-gray-800 divide-y divide-default-200 dark:divide-gray-700">
                      {viewMode === "consolidated"
                        ? groupedConsolidatedItems["Tambahan"].map((item, index) =>
                            renderConsolidatedRow(item, index)
                          )
                        : getSortedItemsWithSeparators(groupedItems["Tambahan"]).map(
                            (item, index, arr) => renderDetailedRow(item, index, arr, true)
                          )}
                    </tbody>
                    <tfoot className="bg-default-50 dark:bg-gray-800">
                      <tr>
                        <td
                          colSpan={viewMode === "detailed" ? 4 : 3}
                          className="px-3 py-2 text-right text-sm font-medium text-default-600 dark:text-gray-300"
                        >
                          Total Tambahan Pay
                        </td>
                        <td className="px-3 py-2 text-right text-sm font-semibold text-default-800 dark:text-gray-100">
                          {formatCurrency(tambahanTotal)}
                        </td>
                        {isEditable && (
                          viewMode === "detailed" ||
                          (viewMode === "consolidated" && groupedConsolidatedItems["Tambahan"].some(item => item.is_manual && item.item_count === 1))
                        ) && <td></td>}
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )}

            {/* Overtime Pay Items */}
            {((viewMode === "consolidated" && groupedConsolidatedItems["Overtime"].length > 0) ||
              (viewMode === "detailed" && groupedItems["Overtime"].length > 0)) && (
              <div className="mb-4 border border-default-200 dark:border-gray-700 rounded-lg overflow-hidden bg-white dark:bg-gray-800">
                <div className="px-4 py-2 bg-orange-50 dark:bg-orange-900/20 border-b border-orange-100 dark:border-orange-800/50">
                  <h3 className="text-md font-semibold text-orange-800 dark:text-orange-300 flex items-center gap-2">
                    <IconClock size={18} className="text-orange-600 dark:text-orange-400" />
                    Overtime Pay
                  </h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-default-200 dark:divide-gray-700">
                    <thead className="bg-default-50 dark:bg-gray-800">
                      <tr>
                        {viewMode === "detailed" && (
                          <th
                            scope="col"
                            className="px-3 py-2 text-center text-xs font-medium text-default-500 dark:text-gray-400 uppercase"
                          >
                            Date
                          </th>
                        )}
                        <th
                          scope="col"
                          className="px-3 py-2 text-left text-xs font-medium text-default-500 dark:text-gray-400 uppercase"
                        >
                          Description
                        </th>
                        <th
                          scope="col"
                          className="px-3 py-2 text-center text-xs font-medium text-default-500 dark:text-gray-400 uppercase"
                        >
                          Rate
                        </th>
                        <th
                          scope="col"
                          className="px-3 py-2 text-center text-xs font-medium text-default-500 dark:text-gray-400 uppercase"
                        >
                          {viewMode === "consolidated" ? "Total Qty" : "Qty"}
                        </th>
                        <th
                          scope="col"
                          className="px-3 py-2 text-right text-xs font-medium text-default-500 dark:text-gray-400 uppercase"
                        >
                          Amount
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white dark:bg-gray-800 divide-y divide-default-200 dark:divide-gray-700">
                      {viewMode === "consolidated"
                        ? groupedConsolidatedItems["Overtime"].map((item, index) =>
                            renderConsolidatedRow(item, index)
                          )
                        : getSortedItemsWithSeparators(groupedItems["Overtime"]).map(
                            (item, index, arr) => renderDetailedRow(item, index, arr, false)
                          )}
                    </tbody>
                    <tfoot className="bg-default-50 dark:bg-gray-800">
                      <tr>
                        <td
                          colSpan={viewMode === "detailed" ? 4 : 3}
                          className="px-3 py-2 text-right text-sm font-medium text-default-600 dark:text-gray-300"
                        >
                          Total Overtime Pay
                        </td>
                        <td className="px-3 py-2 text-right text-sm font-semibold text-default-800 dark:text-gray-100">
                          {formatCurrency(overtimeTotal)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )}
          </>
        )}

        {/* Commission Records */}
        {commissionRecords.length > 0 && (
          <div className="mb-4 border border-default-200 dark:border-gray-700 rounded-lg overflow-hidden bg-white dark:bg-gray-800">
            <div className="px-4 py-2 bg-teal-50 dark:bg-teal-900/20 border-b border-teal-100 dark:border-teal-800/50">
              <h3 className="text-md font-semibold text-teal-800 dark:text-teal-300 flex items-center gap-2">
                <IconBusinessplan size={18} className="text-teal-600 dark:text-teal-400" />
                {commissionRecords
                  .map((record) => record.description)
                  .join(" + ")}
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-default-200 dark:divide-gray-700">
                <thead className="bg-default-50 dark:bg-gray-800">
                  <tr>
                    <th
                      scope="col"
                      className="px-3 py-2 text-left text-xs font-medium text-default-500 dark:text-gray-400 uppercase"
                    >
                      Date
                    </th>
                    <th
                      scope="col"
                      className="px-3 py-2 text-left text-xs font-medium text-default-500 dark:text-gray-400 uppercase"
                    >
                      Description
                    </th>
                    <th
                      scope="col"
                      className="px-3 py-2 text-right text-xs font-medium text-default-500 dark:text-gray-400 uppercase"
                    >
                      Amount
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-800 divide-y divide-default-200 dark:divide-gray-700">
                  {commissionRecords.map((record) => (
                    <tr key={record.id} className="hover:bg-default-50 dark:hover:bg-gray-700">
                      <td className="px-3 py-2 whitespace-nowrap text-sm text-default-800 dark:text-gray-100">
                        {format(
                          new Date(record.commission_date),
                          "dd MMM yyyy"
                        )}
                      </td>
                      <td
                        className="px-3 py-2 text-sm text-default-800 dark:text-gray-100"
                        title={record.description}
                      >
                        {record.description}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-right text-sm font-medium text-default-800 dark:text-gray-100">
                        {formatCurrency(record.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-default-50 dark:bg-gray-800">
                  <tr>
                    <td
                      colSpan={2}
                      className="px-3 py-2 text-right text-sm font-medium text-default-600 dark:text-gray-300"
                    >
                      Total{" "}
                      {commissionRecords
                        .map((record) => record.description)
                        .join(" + ")}
                    </td>
                    <td className="px-3 py-2 text-right text-sm font-semibold text-default-800 dark:text-gray-100">
                      {formatCurrency(
                        commissionRecords.reduce(
                          (sum, record) => sum + Number(record.amount),
                          0
                        )
                      )}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}

        {/* Monthly Leave Summary */}
        {monthlyLeaveRecords.length > 0 && (
          <div className="mb-4 border border-default-200 dark:border-gray-700 rounded-lg overflow-hidden bg-white dark:bg-gray-800">
            <div className="px-4 py-2 bg-rose-50 dark:bg-rose-900/20 border-b border-rose-100 dark:border-rose-800/50">
              <h3 className="text-md font-semibold text-rose-800 dark:text-rose-300 flex items-center gap-2">
                <IconCalendarEvent size={18} className="text-rose-600 dark:text-rose-400" />
                Leave Records This Month
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-default-200 dark:divide-gray-700">
                <thead className="bg-default-50 dark:bg-gray-800">
                  <tr>
                    <th
                      scope="col"
                      className="px-3 py-2 text-left text-xs font-medium text-default-500 dark:text-gray-400 uppercase"
                    >
                      Date
                    </th>
                    <th
                      scope="col"
                      className="px-3 py-2 text-center text-xs font-medium text-default-500 dark:text-gray-400 uppercase"
                    >
                      Leave Type
                    </th>
                    <th
                      scope="col"
                      className="px-3 py-2 text-center text-xs font-medium text-default-500 dark:text-gray-400 uppercase"
                    >
                      Days
                    </th>
                    <th
                      scope="col"
                      className="px-3 py-2 text-right text-xs font-medium text-default-500 dark:text-gray-400 uppercase"
                    >
                      Amount
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-800 divide-y divide-default-200 dark:divide-gray-700">
                  {monthlyLeaveRecords.map((record, index) => {
                    const getLeaveTypeDisplay = (leaveType: string) => {
                      switch (leaveType) {
                        case "cuti_umum":
                          return "Cuti Umum";
                        case "cuti_sakit":
                          return "Cuti Sakit";
                        case "cuti_tahunan":
                          return "Cuti Tahunan";
                        default:
                          return leaveType;
                      }
                    };
                    const getLeaveTypeColor = (leaveType: string) => {
                      switch (leaveType) {
                        case "cuti_umum":
                          return "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300";
                        case "cuti_sakit":
                          return "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300";
                        case "cuti_tahunan":
                          return "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300";
                        default:
                          return "bg-default-100 text-default-700 dark:bg-gray-700 dark:text-gray-300";
                      }
                    };
                    return (
                      <tr key={index} className="hover:bg-default-50 dark:hover:bg-gray-700">
                        <td className="px-3 py-2 text-sm text-default-800 dark:text-gray-100">
                          {format(
                            new Date(record.date.replace(/-/g, "/")),
                            "dd MMM yyyy"
                          )}
                        </td>
                        <td className="px-3 py-2 text-center">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${getLeaveTypeColor(
                              record.leave_type
                            )}`}
                          >
                            {getLeaveTypeDisplay(record.leave_type)}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-center text-sm text-default-800 dark:text-gray-100">
                          {Math.round(record.days_taken)}
                        </td>
                        <td className="px-3 py-2 text-right text-sm font-medium text-default-800 dark:text-gray-100">
                          {formatCurrency(record.amount_paid)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="bg-default-50 dark:bg-gray-800">
                  <tr>
                    <td
                      colSpan={3}
                      className="px-3 py-2 text-right text-sm font-medium text-default-600 dark:text-gray-300"
                    >
                      Total (
                      {monthlyLeaveRecords.reduce(
                        (sum, r) => sum + (Number(r.days_taken) || 0),
                        0
                      )}{" "}
                      day
                      {monthlyLeaveRecords.reduce(
                        (sum, r) => sum + (Number(r.days_taken) || 0),
                        0
                      ) !== 1
                        ? "s"
                        : ""}
                      )
                    </td>
                    <td className="px-3 py-2 text-right text-sm font-semibold text-default-800 dark:text-gray-100">
                      {formatCurrency(
                        monthlyLeaveRecords.reduce(
                          (sum, r) => sum + (Number(r.amount_paid) || 0),
                          0
                        )
                      )}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}

        {payroll.items.length === 0 && (
          <div className="text-center py-8 border border-default-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800">
            <p className="text-default-500 dark:text-gray-400">No payroll items found.</p>
            {isEditable && (
              <Button
                onClick={() => setShowAddItemModal(true)}
                color="sky"
                variant="outline"
                className="mt-4"
              >
                Add Manual Item
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Add Manual Item Modal */}
      <AddManualItemModal
        isOpen={showAddItemModal}
        onClose={() => setShowAddItemModal(false)}
        employeePayrollId={Number(id)}
        onItemAdded={fetchEmployeePayrollComprehensive}
      />

      {/* Delete Item Confirmation Dialog */}
      <ConfirmationDialog
        isOpen={showDeleteDialog}
        onClose={() => {
          setShowDeleteDialog(false);
          setItemToDelete(null);
        }}
        onConfirm={handleDeleteItem}
        title="Delete Payroll Item"
        message={`Are you sure you want to delete this item: ${itemToDelete?.description}?`}
        confirmButtonText={isDeleting ? "Deleting..." : "Delete"}
        variant="danger"
      />
    </div>
  );
};

export default EmployeePayrollDetailsPage;
