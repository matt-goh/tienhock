// src/pages/Payroll/EmployeePayrollDetailsPage.tsx
import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  IconPlus,
  IconTrash,
  IconInfoCircle,
  IconCash,
  IconReceipt,
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
    navigate("/payroll/monthly-payrolls");
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
        <p className="text-default-500">Employee payroll not found</p>
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

  // Detect if this is a combined job payroll (multiple job types)
  const uniqueJobTypes = [
    ...new Set(payroll.items.map((item) => item.job_type).filter(Boolean)),
  ];
  const isCombinedPayroll = uniqueJobTypes.length > 1;

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

  // Calculate totals for each group
  const baseTotal = groupedItems["Base"].reduce(
    (sum, item) => sum + item.amount,
    0
  );
  const tambahanTotal = groupedItems["Tambahan"].reduce(
    (sum, item) => sum + item.amount,
    0
  );
  const overtimeTotal = groupedItems["Overtime"].reduce(
    (sum, item) => sum + item.amount,
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

  return (
    <div className="space-y-3">
      <BackButton onClick={handleBack} />

      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-4">
        <div>
          <h1 className="text-xl font-semibold text-default-800">
            Payroll Details
          </h1>
          <p className="text-sm text-default-500 mt-1">
            {getMonthName(payroll.month)} {payroll.year}
          </p>
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
        <div className="border rounded-lg overflow-hidden bg-white transition-shadow hover:shadow-md">
          <div className="px-4 py-3 bg-default-50 border-b border-default-100">
            <h3 className="text-md font-semibold text-default-700">
              Employee Information
            </h3>
          </div>
          <div className="p-4 flex flex-col h-full">
            <div className="space-y-4 flex-grow">
              {/* Employee Name */}
              <div>
                <p className="text-xs uppercase tracking-wide text-default-400 mb-1">
                  Employee
                </p>
                {payroll.employee_job_mapping &&
                Object.keys(payroll.employee_job_mapping).length > 1 ? (
                  <>
                    <p className="font-semibold text-default-800">
                      {payroll.employee_name || "Unknown"}
                    </p>
                    <div className="mt-2 space-y-1">
                      {Object.entries(payroll.employee_job_mapping).map(
                        ([empId, jobType]) => (
                          <div
                            key={empId}
                            className="flex items-center text-sm"
                          >
                            <Link
                              to={`/catalogue/staff/${empId}`}
                              className="text-sky-600 hover:underline font-medium"
                            >
                              {empId}
                            </Link>
                            <span className="mx-2 text-default-300">→</span>
                            <span className="text-default-600">
                              {jobType as string}
                            </span>
                          </div>
                        )
                      )}
                    </div>
                  </>
                ) : (
                  <>
                    <p className="font-semibold text-default-800">
                      <Link
                        to={`/catalogue/staff/${payroll.employee_id}`}
                        className="text-sky-600 hover:underline"
                      >
                        {payroll.employee_name || "Unknown"}
                      </Link>
                    </p>
                    <p className="text-sm text-default-500 mt-1">
                      {payroll.employee_id}
                    </p>
                  </>
                )}
              </div>

              {/* Job Type */}
              <div>
                <p className="text-xs uppercase tracking-wide text-default-400 mb-1">
                  Job Type
                </p>
                <p className="font-semibold text-default-800">
                  {payroll.job_type}
                </p>
                <p className="text-sm text-default-500 mt-1">
                  {payroll.section}
                </p>
              </div>

              {/* Status */}
              <div>
                <p className="text-xs uppercase tracking-wide text-default-400 mb-1">
                  Status
                </p>
                <span
                  className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-sm font-medium ${
                    payroll.payroll_status === "CONFIRMED"
                      ? "bg-green-100 text-green-800"
                      : payroll.payroll_status === "PENDING"
                      ? "bg-yellow-100 text-yellow-800"
                      : "bg-default-100 text-default-800"
                  }`}
                >
                  {payroll.payroll_status}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Earnings Column */}
        <div className="border rounded-lg overflow-hidden bg-white flex flex-col transition-shadow hover:shadow-md">
          <div className="px-4 py-3 bg-emerald-50 border-b border-emerald-100">
            <h3 className="text-md font-semibold text-emerald-800 flex items-center gap-2">
              <IconCash size={18} className="text-emerald-600" />
              Earnings
            </h3>
          </div>
          <div className="p-4 flex flex-col flex-grow">
            <div className="space-y-2 flex-grow">
              <div className="flex justify-between text-sm">
                <span className="text-default-600">Base Pay</span>
                <span className="font-medium text-default-800">
                  {formatCurrency(baseTotal)}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-default-600">Tambahan</span>
                <span className="font-medium text-default-800">
                  {formatCurrency(tambahanTotal)}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-default-600">Overtime</span>
                <span className="font-medium text-default-800">
                  {formatCurrency(overtimeTotal)}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-default-600">Leave Pay</span>
                <span className="font-medium text-default-800">
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
                  <span className="text-default-600">
                    {commissionRecords
                      .map((record) => record.description)
                      .join(" + ")}
                  </span>
                  <span className="font-medium text-default-800">
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
            <div className="border-t border-default-200 mt-auto pt-3">
              <div className="flex justify-between font-semibold">
                <span className="text-default-800">Gross Pay</span>
                <span className="text-emerald-700 text-lg">
                  {formatCurrency(payroll.gross_pay)}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Deductions & Final Payment Column */}
        <div className="border rounded-lg bg-white border-sky-200 flex flex-col transition-shadow hover:shadow-md">
          <div className="px-4 py-3 bg-sky-50 border-b border-sky-100 rounded-t-lg">
            <h3 className="text-md font-semibold text-sky-800 flex items-center gap-2">
              <IconReceipt size={18} className="text-sky-600" />
              Deductions & Final Pay
            </h3>
          </div>
          <div className="p-4 flex flex-col flex-grow">
            <div className="space-y-2 flex-grow">
              <div className="flex justify-between text-sm">
                <span className="text-default-600">Gross Pay</span>
                <span className="font-medium text-default-800">
                  {formatCurrency(payroll.gross_pay)}
                </span>
              </div>

              {/* Dotted divider */}
              <div className="border-t border-dashed border-default-300 my-2"></div>

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
                      <span className="text-default-600 flex items-center gap-1 cursor-help">
                        {deductionName}
                        <IconInfoCircle
                          size={14}
                          className="text-default-400 opacity-60 group-hover:opacity-100"
                        />
                        <span className="text-xs text-default-400">
                          ({percentage}%)
                        </span>
                      </span>
                      <span className="font-medium text-rose-600">
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
                  <span className="text-default-600 flex items-center gap-1 cursor-help">
                    {commissionRecords
                      .map((record) => record.description)
                      .join(" + ")}{" "}
                    Advance
                    <IconInfoCircle
                      size={14}
                      className="text-default-400 opacity-60 group-hover:opacity-100"
                    />
                  </span>
                  <span className="font-medium text-rose-600">
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
                  <span className="text-default-600 flex items-center gap-1 cursor-help">
                    Mid-month Advance
                    <IconInfoCircle
                      size={14}
                      className="text-default-400 opacity-60 group-hover:opacity-100"
                    />
                  </span>
                  <span className="font-medium text-rose-600">
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
                    <span className="text-default-600 flex items-center gap-1 cursor-help">
                      Cuti Tahunan Advance
                      <IconInfoCircle
                        size={14}
                        className="text-default-400 opacity-60 group-hover:opacity-100"
                      />
                    </span>
                    <span className="font-medium text-rose-600">
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
              <div className="border-t border-default-200 mt-2 pt-2">
                <div className="flex justify-between text-sm">
                  <span className="text-default-600 font-medium">
                    Total Deductions
                  </span>
                  <span className="font-semibold text-rose-600">
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

            {/* Take Home Pay - Highlighted */}
            <div className="bg-sky-100 -mx-4 -mb-4 mt-4 px-4 py-4 border-t border-sky-200 rounded-b-lg">
              <div className="flex justify-between items-center">
                <span className="text-sky-800 font-bold text-base">
                  Take Home Pay
                </span>
                <span className="text-sky-900 text-2xl font-bold">
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
                      return (
                        payroll.net_pay -
                        (midMonthPayroll?.amount || 0) -
                        additionalMaintenDeduction
                      );
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
            const jobBaseTotal = jobGroupedItems["Base"].reduce(
              (sum, item) => sum + item.amount,
              0
            );
            const jobTambahanTotal = jobGroupedItems["Tambahan"].reduce(
              (sum, item) => sum + item.amount,
              0
            );
            const jobOvertimeTotal = jobGroupedItems["Overtime"].reduce(
              (sum, item) => sum + item.amount,
              0
            );
            const jobTotal = jobBaseTotal + jobTambahanTotal + jobOvertimeTotal;

            return (
              <div key={jobType} className="mb-6">
                <div className="flex items-center justify-between mb-3 pb-2 border-b-2 border-default-300">
                  <h3 className="text-lg font-semibold text-default-800">
                    {formatJobType(jobType as string)} Section
                  </h3>
                  <span className="text-sm font-medium text-default-600">
                    Subtotal: {formatCurrency(jobTotal)}
                  </span>
                </div>

                {/* Base Pay for this job */}
                {jobGroupedItems["Base"].length > 0 && (
                  <div className="mb-4">
                    <h4 className="text-sm font-medium text-default-600 mb-2">
                      Base Pay
                    </h4>
                    <div className="border rounded-lg overflow-x-auto">
                      <table className="min-w-full divide-y divide-default-200">
                        <thead className="bg-default-50">
                          <tr>
                            <th
                              scope="col"
                              className="px-3 py-2 text-center text-xs font-medium text-default-500 uppercase"
                            >
                              Date
                            </th>
                            <th
                              scope="col"
                              className="px-3 py-2 text-left text-xs font-medium text-default-500 uppercase"
                            >
                              Description
                            </th>
                            <th
                              scope="col"
                              className="px-3 py-2 text-center text-xs font-medium text-default-500 uppercase"
                            >
                              Rate
                            </th>
                            <th
                              scope="col"
                              className="px-3 py-2 text-center text-xs font-medium text-default-500 uppercase"
                            >
                              Qty
                            </th>
                            <th
                              scope="col"
                              className="px-3 py-2 text-right text-xs font-medium text-default-500 uppercase"
                            >
                              Amount
                            </th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-default-200">
                          {jobGroupedItems["Base"].map((item) => (
                            <tr key={item.id} className="hover:bg-default-50">
                              <td className="px-3 py-2 whitespace-nowrap text-center text-sm">
                                {item.source_date ? (
                                  getWorkLogUrl(item) ? (
                                    <Link
                                      to={getWorkLogUrl(item)!}
                                      className="text-sky-600 hover:underline"
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
                                  className="text-sm text-default-900"
                                  title={`${item.description} (${item.pay_code_id})`}
                                >
                                  {item.description}{" "}
                                  <span className="text-default-500">
                                    ({item.pay_code_id})
                                  </span>
                                </span>
                              </td>
                              <td className="px-3 py-2 whitespace-nowrap text-center text-sm">
                                {item.rate_unit === "Percent"
                                  ? `${item.rate}%`
                                  : `${formatCurrency(item.rate)}/${
                                      item.rate_unit
                                    }`}
                              </td>
                              <td className="px-3 py-2 whitespace-nowrap text-center text-sm">
                                {item.quantity}
                              </td>
                              <td className="px-3 py-2 whitespace-nowrap text-right text-sm font-medium">
                                {formatCurrency(item.amount)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot className="bg-default-50">
                          <tr>
                            <td
                              colSpan={4}
                              className="px-3 py-2 text-right text-sm font-medium text-default-600"
                            >
                              Total Base
                            </td>
                            <td className="px-3 py-2 text-right text-sm font-semibold">
                              {formatCurrency(jobBaseTotal)}
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>
                )}

                {/* Tambahan Pay for this job */}
                {jobGroupedItems["Tambahan"].length > 0 && (
                  <div className="mb-4">
                    <h4 className="text-sm font-medium text-default-600 mb-2">
                      Tambahan Pay
                    </h4>
                    <div className="border rounded-lg overflow-x-auto">
                      <table className="min-w-full divide-y divide-default-200">
                        <thead className="bg-default-50">
                          <tr>
                            <th
                              scope="col"
                              className="px-3 py-2 text-center text-xs font-medium text-default-500 uppercase"
                            >
                              Date
                            </th>
                            <th
                              scope="col"
                              className="px-3 py-2 text-left text-xs font-medium text-default-500 uppercase"
                            >
                              Description
                            </th>
                            <th
                              scope="col"
                              className="px-3 py-2 text-center text-xs font-medium text-default-500 uppercase"
                            >
                              Rate
                            </th>
                            <th
                              scope="col"
                              className="px-3 py-2 text-center text-xs font-medium text-default-500 uppercase"
                            >
                              Qty
                            </th>
                            <th
                              scope="col"
                              className="px-3 py-2 text-right text-xs font-medium text-default-500 uppercase"
                            >
                              Amount
                            </th>
                            {isEditable && (
                              <th
                                scope="col"
                                className="px-3 py-2 text-center text-xs font-medium text-default-500 uppercase w-12"
                              ></th>
                            )}
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-default-200">
                          {jobGroupedItems["Tambahan"].map((item) => (
                            <tr key={item.id} className="hover:bg-default-50">
                              <td className="px-3 py-2 whitespace-nowrap text-center text-sm">
                                {item.source_date ? (
                                  getWorkLogUrl(item) ? (
                                    <Link
                                      to={getWorkLogUrl(item)!}
                                      className="text-sky-600 hover:underline"
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
                                  className="text-sm text-default-900"
                                  title={`${item.description} (${item.pay_code_id})`}
                                >
                                  {item.description}{" "}
                                  <span className="text-default-500">
                                    ({item.pay_code_id})
                                  </span>
                                  {item.is_manual && (
                                    <span className="ml-1.5 px-1 py-0.5 text-xs rounded bg-default-100 text-default-600">
                                      Manual
                                    </span>
                                  )}
                                </span>
                              </td>
                              <td className="px-3 py-2 whitespace-nowrap text-center text-sm">
                                {item.rate_unit === "Percent"
                                  ? `${item.rate}%`
                                  : `${formatCurrency(item.rate)}/${
                                      item.rate_unit
                                    }`}
                              </td>
                              <td className="px-3 py-2 whitespace-nowrap text-center text-sm">
                                {item.quantity}
                              </td>
                              <td className="px-3 py-2 whitespace-nowrap text-right text-sm font-medium">
                                {formatCurrency(item.amount)}
                              </td>
                              {isEditable && (
                                <td className="px-3 py-2 whitespace-nowrap text-center">
                                  <button
                                    onClick={() => {
                                      setItemToDelete({
                                        ...item,
                                        id: item.id || 0,
                                      });
                                      setShowDeleteDialog(true);
                                    }}
                                    className="text-rose-600 hover:text-rose-800"
                                  >
                                    <IconTrash size={16} />
                                  </button>
                                </td>
                              )}
                            </tr>
                          ))}
                        </tbody>
                        <tfoot className="bg-default-50">
                          <tr>
                            <td
                              colSpan={4}
                              className="px-3 py-2 text-right text-sm font-medium text-default-600"
                            >
                              Total Tambahan
                            </td>
                            <td className="px-3 py-2 text-right text-sm font-semibold">
                              {formatCurrency(jobTambahanTotal)}
                            </td>
                            {isEditable && <td></td>}
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>
                )}

                {/* Overtime Pay for this job */}
                {jobGroupedItems["Overtime"].length > 0 && (
                  <div className="mb-4">
                    <h4 className="text-sm font-medium text-default-600 mb-2">
                      Overtime Pay
                    </h4>
                    <div className="border rounded-lg overflow-x-auto">
                      <table className="min-w-full divide-y divide-default-200">
                        <thead className="bg-default-50">
                          <tr>
                            <th
                              scope="col"
                              className="px-3 py-2 text-center text-xs font-medium text-default-500 uppercase"
                            >
                              Date
                            </th>
                            <th
                              scope="col"
                              className="px-3 py-2 text-left text-xs font-medium text-default-500 uppercase"
                            >
                              Description
                            </th>
                            <th
                              scope="col"
                              className="px-3 py-2 text-center text-xs font-medium text-default-500 uppercase"
                            >
                              Rate
                            </th>
                            <th
                              scope="col"
                              className="px-3 py-2 text-center text-xs font-medium text-default-500 uppercase"
                            >
                              Qty
                            </th>
                            <th
                              scope="col"
                              className="px-3 py-2 text-right text-xs font-medium text-default-500 uppercase"
                            >
                              Amount
                            </th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-default-200">
                          {jobGroupedItems["Overtime"].map((item) => (
                            <tr key={item.id} className="hover:bg-default-50">
                              <td className="px-3 py-2 whitespace-nowrap text-center text-sm">
                                {item.source_date ? (
                                  getWorkLogUrl(item) ? (
                                    <Link
                                      to={getWorkLogUrl(item)!}
                                      className="text-sky-600 hover:underline"
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
                                  className="text-sm text-default-900"
                                  title={`${item.description} (${item.pay_code_id})`}
                                >
                                  {item.description}{" "}
                                  <span className="text-default-500">
                                    ({item.pay_code_id})
                                  </span>
                                </span>
                              </td>
                              <td className="px-3 py-2 whitespace-nowrap text-center text-sm">
                                {item.rate_unit === "Percent"
                                  ? `${item.rate}%`
                                  : `${formatCurrency(item.rate)}/${
                                      item.rate_unit
                                    }`}
                              </td>
                              <td className="px-3 py-2 whitespace-nowrap text-center text-sm">
                                {item.quantity}
                              </td>
                              <td className="px-3 py-2 whitespace-nowrap text-right text-sm font-medium">
                                {formatCurrency(item.amount)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot className="bg-default-50">
                          <tr>
                            <td
                              colSpan={4}
                              className="px-3 py-2 text-right text-sm font-medium text-default-600"
                            >
                              Total Overtime
                            </td>
                            <td className="px-3 py-2 text-right text-sm font-semibold">
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
            {groupedItems["Base"].length > 0 && (
              <div className="mb-4">
                <h3 className="text-md font-medium text-default-700 mb-2">
                  Base Pay
                </h3>
                <div className="border rounded-lg overflow-x-auto">
                  <table className="min-w-full divide-y divide-default-200">
                    <thead className="bg-default-50">
                      <tr>
                        <th
                          scope="col"
                          className="px-3 py-2 text-center text-xs font-medium text-default-500 uppercase"
                        >
                          Date
                        </th>
                        <th
                          scope="col"
                          className="px-3 py-2 text-left text-xs font-medium text-default-500 uppercase"
                        >
                          Description
                        </th>
                        <th
                          scope="col"
                          className="px-3 py-2 text-center text-xs font-medium text-default-500 uppercase"
                        >
                          Rate
                        </th>
                        <th
                          scope="col"
                          className="px-3 py-2 text-center text-xs font-medium text-default-500 uppercase"
                        >
                          Qty
                        </th>
                        <th
                          scope="col"
                          className="px-3 py-2 text-right text-xs font-medium text-default-500 uppercase"
                        >
                          Amount
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-default-200">
                      {groupedItems["Base"].map((item) => (
                        <tr key={item.id} className="hover:bg-default-50">
                          <td className="px-3 py-2 whitespace-nowrap text-center text-sm">
                            {item.source_date ? (
                              getWorkLogUrl(item) ? (
                                <Link
                                  to={getWorkLogUrl(item)!}
                                  className="text-sky-600 hover:underline"
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
                              className="text-sm text-default-900"
                              title={`${item.description} (${item.pay_code_id})`}
                            >
                              {item.description}{" "}
                              <span className="text-default-500">
                                ({item.pay_code_id})
                              </span>
                            </span>
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap text-center text-sm">
                            {item.rate_unit === "Percent"
                              ? `${item.rate}%`
                              : `${formatCurrency(item.rate)}/${
                                  item.rate_unit
                                }`}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap text-center text-sm">
                            {item.quantity}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap text-right text-sm font-medium">
                            {formatCurrency(item.amount)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-default-50">
                      <tr>
                        <td
                          colSpan={4}
                          className="px-3 py-2 text-right text-sm font-medium text-default-600"
                        >
                          Total Base Pay
                          {(() => {
                            const baseGroupedByHours = groupedItems["Base"]
                              .filter((item) => item.rate_unit === "Hour")
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
                                <div className="text-xs text-default-500">
                                  Avg: {formatCurrency(avgRate)}/hr
                                </div>
                              );
                            }
                            return null;
                          })()}
                        </td>
                        <td className="px-3 py-2 text-right text-sm font-semibold">
                          {formatCurrency(baseTotal)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )}

            {/* Tambahan Pay Items */}
            {groupedItems["Tambahan"].length > 0 && (
              <div className="mb-4">
                <h3 className="text-md font-medium text-default-700 mb-2">
                  Tambahan Pay
                </h3>
                <div className="border rounded-lg overflow-x-auto">
                  <table className="min-w-full divide-y divide-default-200">
                    <thead className="bg-default-50">
                      <tr>
                        <th
                          scope="col"
                          className="px-3 py-2 text-center text-xs font-medium text-default-500 uppercase"
                        >
                          Date
                        </th>
                        <th
                          scope="col"
                          className="px-3 py-2 text-left text-xs font-medium text-default-500 uppercase"
                        >
                          Description
                        </th>
                        <th
                          scope="col"
                          className="px-3 py-2 text-center text-xs font-medium text-default-500 uppercase"
                        >
                          Rate
                        </th>
                        <th
                          scope="col"
                          className="px-3 py-2 text-center text-xs font-medium text-default-500 uppercase"
                        >
                          Qty
                        </th>
                        <th
                          scope="col"
                          className="px-3 py-2 text-right text-xs font-medium text-default-500 uppercase"
                        >
                          Amount
                        </th>
                        {isEditable && (
                          <th
                            scope="col"
                            className="px-3 py-2 text-center text-xs font-medium text-default-500 uppercase w-12"
                          ></th>
                        )}
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-default-200">
                      {groupedItems["Tambahan"].map((item) => (
                        <tr key={item.id} className="hover:bg-default-50">
                          <td className="px-3 py-2 whitespace-nowrap text-center text-sm">
                            {item.source_date ? (
                              getWorkLogUrl(item) ? (
                                <Link
                                  to={getWorkLogUrl(item)!}
                                  className="text-sky-600 hover:underline"
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
                              className="text-sm text-default-900"
                              title={`${item.description} (${item.pay_code_id})`}
                            >
                              {item.description}{" "}
                              <span className="text-default-500">
                                ({item.pay_code_id})
                              </span>
                              {item.is_manual && (
                                <span className="ml-1.5 px-1 py-0.5 text-xs rounded bg-default-100 text-default-600">
                                  Manual
                                </span>
                              )}
                            </span>
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap text-center text-sm">
                            {item.rate_unit === "Percent"
                              ? `${item.rate}%`
                              : `${formatCurrency(item.rate)}/${
                                  item.rate_unit
                                }`}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap text-center text-sm">
                            {item.quantity}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap text-right text-sm font-medium">
                            {formatCurrency(item.amount)}
                          </td>
                          {isEditable && (
                            <td className="px-3 py-2 whitespace-nowrap text-center">
                              <button
                                onClick={() => {
                                  setItemToDelete({
                                    ...item,
                                    id: item.id || 0,
                                  });
                                  setShowDeleteDialog(true);
                                }}
                                className="text-rose-600 hover:text-rose-800"
                              >
                                <IconTrash size={16} />
                              </button>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-default-50">
                      <tr>
                        <td
                          colSpan={4}
                          className="px-3 py-2 text-right text-sm font-medium text-default-600"
                        >
                          Total Tambahan Pay
                        </td>
                        <td className="px-3 py-2 text-right text-sm font-semibold">
                          {formatCurrency(tambahanTotal)}
                        </td>
                        {isEditable && <td></td>}
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )}

            {/* Overtime Pay Items */}
            {groupedItems["Overtime"].length > 0 && (
              <div className="mb-4">
                <h3 className="text-md font-medium text-default-700 mb-2">
                  Overtime Pay
                </h3>
                <div className="border rounded-lg overflow-x-auto">
                  <table className="min-w-full divide-y divide-default-200">
                    <thead className="bg-default-50">
                      <tr>
                        <th
                          scope="col"
                          className="px-3 py-2 text-center text-xs font-medium text-default-500 uppercase"
                        >
                          Date
                        </th>
                        <th
                          scope="col"
                          className="px-3 py-2 text-left text-xs font-medium text-default-500 uppercase"
                        >
                          Description
                        </th>
                        <th
                          scope="col"
                          className="px-3 py-2 text-center text-xs font-medium text-default-500 uppercase"
                        >
                          Rate
                        </th>
                        <th
                          scope="col"
                          className="px-3 py-2 text-center text-xs font-medium text-default-500 uppercase"
                        >
                          Qty
                        </th>
                        <th
                          scope="col"
                          className="px-3 py-2 text-right text-xs font-medium text-default-500 uppercase"
                        >
                          Amount
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-default-200">
                      {groupedItems["Overtime"].map((item) => (
                        <tr key={item.id} className="hover:bg-default-50">
                          <td className="px-3 py-2 whitespace-nowrap text-center text-sm">
                            {item.source_date ? (
                              getWorkLogUrl(item) ? (
                                <Link
                                  to={getWorkLogUrl(item)!}
                                  className="text-sky-600 hover:underline"
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
                              className="text-sm text-default-900"
                              title={`${item.description} (${item.pay_code_id})`}
                            >
                              {item.description}{" "}
                              <span className="text-default-500">
                                ({item.pay_code_id})
                              </span>
                            </span>
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap text-center text-sm">
                            {item.rate_unit === "Percent"
                              ? `${item.rate}%`
                              : `${formatCurrency(item.rate)}/${
                                  item.rate_unit
                                }`}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap text-center text-sm">
                            {item.quantity}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap text-right text-sm font-medium">
                            {formatCurrency(item.amount)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-default-50">
                      <tr>
                        <td
                          colSpan={4}
                          className="px-3 py-2 text-right text-sm font-medium text-default-600"
                        >
                          Total Overtime Pay
                        </td>
                        <td className="px-3 py-2 text-right text-sm font-semibold">
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
          <div className="mb-4">
            <h3 className="text-md font-medium text-default-700 mb-2">
              {commissionRecords
                .map((record) => record.description)
                .join(" + ")}
            </h3>
            <div className="border rounded-lg overflow-x-auto">
              <table className="min-w-full divide-y divide-default-200">
                <thead className="bg-default-50">
                  <tr>
                    <th
                      scope="col"
                      className="px-3 py-2 text-left text-xs font-medium text-default-500 uppercase"
                    >
                      Date
                    </th>
                    <th
                      scope="col"
                      className="px-3 py-2 text-left text-xs font-medium text-default-500 uppercase"
                    >
                      Description
                    </th>
                    <th
                      scope="col"
                      className="px-3 py-2 text-right text-xs font-medium text-default-500 uppercase"
                    >
                      Amount
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-default-200">
                  {commissionRecords.map((record) => (
                    <tr key={record.id} className="hover:bg-default-50">
                      <td className="px-3 py-2 whitespace-nowrap text-sm">
                        {format(
                          new Date(record.commission_date),
                          "dd MMM yyyy"
                        )}
                      </td>
                      <td
                        className="px-3 py-2 text-sm"
                        title={record.description}
                      >
                        {record.description}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-right text-sm font-medium">
                        {formatCurrency(record.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-default-50">
                  <tr>
                    <td
                      colSpan={2}
                      className="px-3 py-2 text-right text-sm font-medium text-default-600"
                    >
                      Total{" "}
                      {commissionRecords
                        .map((record) => record.description)
                        .join(" + ")}
                    </td>
                    <td className="px-3 py-2 text-right text-sm font-semibold">
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
          <div className="mb-4">
            <h3 className="text-md font-medium text-default-700 mb-2">
              Leave Records This Month
            </h3>
            <div className="border rounded-lg overflow-x-auto">
              <table className="min-w-full divide-y divide-default-200">
                <thead className="bg-default-50">
                  <tr>
                    <th
                      scope="col"
                      className="px-3 py-2 text-left text-xs font-medium text-default-500 uppercase"
                    >
                      Date
                    </th>
                    <th
                      scope="col"
                      className="px-3 py-2 text-center text-xs font-medium text-default-500 uppercase"
                    >
                      Leave Type
                    </th>
                    <th
                      scope="col"
                      className="px-3 py-2 text-center text-xs font-medium text-default-500 uppercase"
                    >
                      Days
                    </th>
                    <th
                      scope="col"
                      className="px-3 py-2 text-right text-xs font-medium text-default-500 uppercase"
                    >
                      Amount
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-default-200">
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
                          return "bg-red-100 text-red-700";
                        case "cuti_sakit":
                          return "bg-amber-100 text-amber-700";
                        case "cuti_tahunan":
                          return "bg-green-100 text-green-700";
                        default:
                          return "bg-default-100 text-default-700";
                      }
                    };
                    return (
                      <tr key={index} className="hover:bg-default-50">
                        <td className="px-3 py-2 text-sm">
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
                        <td className="px-3 py-2 text-center text-sm">
                          {Math.round(record.days_taken)}
                        </td>
                        <td className="px-3 py-2 text-right text-sm font-medium">
                          {formatCurrency(record.amount_paid)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="bg-default-50">
                  <tr>
                    <td
                      colSpan={3}
                      className="px-3 py-2 text-right text-sm font-medium text-default-600"
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
                    <td className="px-3 py-2 text-right text-sm font-semibold">
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
          <div className="text-center py-8 border rounded-lg">
            <p className="text-default-500">No payroll items found.</p>
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
