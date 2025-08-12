// src/pages/Payroll/EmployeePayrollDetailsPage.tsx
import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  IconPlus,
  IconTrash,
  IconChevronDown,
  IconChevronUp,
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
  id: number;
  pay_code_id: string;
  description: string;
  rate: number;
  rate_unit: string;
  quantity: number;
  amount: number;
  is_manual: boolean;
  pay_type?: string;
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
  const [isDeductionsExpanded, setIsDeductionsExpanded] = useState(false);

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
    if (!itemToDelete) return;

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
    if (payroll) {
      navigate(`/payroll/monthly-payrolls/${payroll.monthly_payroll_id}`);
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

  return (
    <div className="relative w-full mx-4 md:mx-6 mb-4">
      <BackButton onClick={handleBack} />

      <div className="bg-white rounded-lg border border-default-200 shadow-sm p-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6">
          <div>
            <h1 className="text-xl font-semibold text-default-800">
              Employee Payroll Details
            </h1>
            <p className="text-sm text-default-500 mt-1">
              {getMonthName(payroll.month)} {payroll.year}
            </p>
          </div>
          <div className="flex flex-wrap gap-3 mt-4 md:mt-0 w-full md:w-auto">
            <DownloadPayslipButton
              payroll={payroll}
              midMonthPayroll={midMonthPayroll}
              buttonText="Download PDF"
              variant="outline"
              className="flex-1 md:flex-none"
            />
            <PrintPayslipButton
              payroll={payroll}
              midMonthPayroll={midMonthPayroll}
              buttonText="Print Pay Slip"
              variant="outline"
              className="flex-1 md:flex-none"
            />
            {isEditable && (
              <Button
                onClick={() => setShowAddItemModal(true)}
                icon={IconPlus}
                variant="outline"
                className="flex-1 md:flex-none"
              >
                Add Manual Item
              </Button>
            )}
          </div>
        </div>

        {/* Employee Information */}
        <div className="mb-4 border rounded-lg p-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <p className="text-sm text-default-500 mb-1">Employee</p>
              <p className="font-medium">
                <Link
                  to={`/catalogue/staff/${payroll.employee_id}`}
                  className="text-sky-600 hover:underline"
                >
                  {payroll.employee_name || "Unknown"}
                </Link>
              </p>
              <p className="text-sm text-default-500">{payroll.employee_id}</p>
            </div>
            <div>
              <p className="text-sm text-default-500 mb-1">Job Type</p>
              <p className="font-medium">{payroll.job_type}</p>
              <p className="text-sm text-default-500">{payroll.section}</p>
            </div>
            <div>
              <p className="text-sm text-default-500 mb-1">Status</p>
              <p className="font-medium">{payroll.payroll_status}</p>
            </div>
          </div>
        </div>

        {/* Payroll Summary */}
        <div className="mb-4">
          <h2 className="text-lg font-medium text-default-800 mb-4">
            Payroll Summary
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Earnings Column */}
            <div className="border rounded-lg p-4 flex flex-col bg-white">
              <h3 className="text-md font-semibold text-default-700 mb-3">
                Earnings
              </h3>
              <div className="space-y-2 flex-grow">
                <div className="flex justify-between text-sm">
                  <span className="text-default-600">Base Pay</span>
                  <span className="font-medium">
                    {formatCurrency(baseTotal)}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-default-600">Tambahan</span>
                  <span className="font-medium">
                    {formatCurrency(tambahanTotal)}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-default-600">Overtime</span>
                  <span className="font-medium">
                    {formatCurrency(overtimeTotal)}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-default-600">Leave Pay</span>
                  <span className="font-medium">
                    {formatCurrency(
                      monthlyLeaveRecords.reduce(
                        (sum, record) => sum + Number(record.amount_paid),
                        0
                      )
                    )}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-default-600">
                    {commissionRecords.length > 0
                      ? commissionRecords
                          .map((record) => record.description)
                          .join(" + ")
                      : "Commission"}
                  </span>
                  <span className="font-medium">
                    {formatCurrency(
                      commissionRecords.reduce(
                        (sum, record) => sum + Number(record.amount),
                        0
                      )
                    )}
                  </span>
                </div>
              </div>
              <div className="border-t border-default-200 mt-3 pt-3">
                <div className="flex justify-between font-semibold">
                  <span className="text-default-800">Gross Pay</span>
                  <span className="text-default-900 text-lg">
                    {formatCurrency(payroll.gross_pay)}
                  </span>
                </div>
              </div>
            </div>

            {/* Final Payment Column */}
            <div className="border rounded-lg p-4 flex flex-col bg-sky-50 border-sky-200">
              <button
                onClick={() => setIsDeductionsExpanded(!isDeductionsExpanded)}
                className="flex gap-1.5 items-center w-fit mb-3 cursor-pointer text-left"
                title="Toggle Deductions Breakdown"
                aria-expanded={isDeductionsExpanded}
                aria-controls="deductions-breakdown"
              >
                <h3 className="text-md font-semibold text-sky-800">
                  Final Payment
                </h3>
                {isDeductionsExpanded ? (
                  <IconChevronUp
                    size={16}
                    stroke={2.5}
                    className="text-sky-800"
                  />
                ) : (
                  <IconChevronDown
                    size={16}
                    stroke={2.5}
                    className="text-sky-800"
                  />
                )}
              </button>
              <div className="space-y-2 flex-grow">
                <div className="flex justify-between text-sm">
                  <span className="text-sky-700">Gross Pay</span>
                  <span className="font-medium text-sky-900">
                    {formatCurrency(payroll.gross_pay)}
                  </span>
                </div>
                {payroll.deductions
                  ?.filter((d) => d.employee_amount > 0)
                  .sort((a, b) => {
                    const order = ["EPF", "SIP", "SOCSO", "INCOME_TAX"];
                    const aIndex = order.indexOf(
                      a.deduction_type.toUpperCase()
                    );
                    const bIndex = order.indexOf(
                      b.deduction_type.toUpperCase()
                    );
                    return (
                      (aIndex === -1 ? 999 : aIndex) -
                      (bIndex === -1 ? 999 : bIndex)
                    );
                  })
                  .map((deduction) => (
                    <div
                      key={deduction.deduction_type}
                      className="flex justify-between text-sm"
                    >
                      <span className="text-sky-700">
                        {deduction.deduction_type.toUpperCase() === "INCOME_TAX"
                          ? "Income Tax"
                          : deduction.deduction_type.toUpperCase()}
                      </span>
                      <span className="font-medium text-sky-900">
                        - {formatCurrency(deduction.employee_amount)}
                      </span>
                    </div>
                  ))}
                {commissionRecords.length > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-sky-700">
                      {commissionRecords
                        .map((record) => record.description)
                        .join(" + ")}{" "}
                      Advance
                    </span>
                    <span className="font-medium text-sky-900">
                      -{" "}
                      {formatCurrency(
                        commissionRecords.reduce(
                          (sum, record) => sum + Number(record.amount),
                          0
                        )
                      )}
                    </span>
                  </div>
                )}
                {midMonthPayroll && (
                  <div className="flex justify-between text-sm">
                    <span className="text-sky-700">Mid-month Advance</span>
                    <span className="font-medium text-sky-900">
                      - {formatCurrency(midMonthPayroll.amount)}
                    </span>
                  </div>
                )}
                {payroll.job_type === "MAINTEN" &&
                  monthlyLeaveRecords.filter(
                    (record) => record.leave_type === "cuti_tahunan"
                  ).length > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-sky-700">Cuti Tahunan Advance</span>
                      <span className="font-medium text-sky-900">
                        -{" "}
                        {formatCurrency(
                          monthlyLeaveRecords
                            .filter(
                              (record) => record.leave_type === "cuti_tahunan"
                            )
                            .reduce(
                              (sum, record) => sum + record.amount_paid,
                              0
                            )
                        )}
                      </span>
                    </div>
                  )}
              </div>
              <div className="border-t border-sky-200 mt-3 pt-3">
                <div className="flex justify-between font-bold">
                  <span className="text-sky-800">Take Home Pay</span>
                  <span className="text-sky-900 text-xl">
                    {formatCurrency(
                      (() => {
                        // Calculate additional deduction for MAINTEN job type (Cuti Tahunan in commission deduction)
                        const isMainten = payroll.job_type === "MAINTEN";
                        const cutiTahunanRecords = monthlyLeaveRecords.filter(
                          (record) => record.leave_type === "cuti_tahunan"
                        );
                        const cutiTahunanAmount = cutiTahunanRecords.reduce(
                          (sum, record) => sum + record.amount_paid,
                          0
                        );
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

        {/* Deductions Breakdown */}
        {isDeductionsExpanded && (
          <div className="mb-4" id="deductions-breakdown">
            <h2 className="text-lg font-medium text-default-800 mb-4">
              Deductions Breakdown
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-4 gap-4">
              {/* Statutory Contributions */}
              {payroll.deductions &&
                payroll.deductions.length > 0 &&
                payroll.deductions
                  .sort((a, b) => {
                    const order = ["EPF", "SIP", "SOCSO", "INCOME_TAX"];
                    const aIndex = order.indexOf(
                      a.deduction_type.toUpperCase()
                    );
                    const bIndex = order.indexOf(
                      b.deduction_type.toUpperCase()
                    );
                    return (
                      (aIndex === -1 ? 999 : aIndex) -
                      (bIndex === -1 ? 999 : bIndex)
                    );
                  })
                  .map((deduction, index) => {
                    const deductionType =
                      deduction.deduction_type.toUpperCase();
                    const deductionName =
                      deductionType === "INCOME_TAX"
                        ? "Income Tax"
                        : deductionType;
                    return (
                      <div key={index} className="border rounded-lg p-4">
                        <h3 className="text-sm font-medium text-default-700 mb-2">
                          {deductionName}
                        </h3>
                        <div className="space-y-2">
                          <div>
                            <div className="flex justify-between text-sm">
                              <span className="text-default-600">
                                Employee:
                              </span>
                              <span className="font-medium text-default-900">
                                {formatCurrency(deduction.employee_amount)}
                              </span>
                            </div>
                            <div className="flex justify-between text-sm">
                              <span className="text-default-600">
                                Employer:
                              </span>
                              <span className="font-medium text-default-900">
                                {formatCurrency(deduction.employer_amount)}
                              </span>
                            </div>
                          </div>
                          <div className="border-t border-default-200 pt-2 mt-2">
                            <div className="flex justify-between text-xs text-default-500">
                              <span>Employee Rate:</span>
                              <span>{deduction.rate_info.employee_rate}</span>
                            </div>
                            <div className="flex justify-between text-xs text-default-500">
                              <span>Employer Rate:</span>
                              <span>{deduction.rate_info.employer_rate}</span>
                            </div>
                            {deduction.rate_info.age_group && (
                              <div className="flex justify-between text-xs text-default-500">
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
                    );
                  })}

              {/* Commission Advance */}
              {commissionRecords.length > 0 && (
                <div className="border rounded-lg p-4">
                  <h3 className="text-sm font-medium text-default-700 mb-2">
                    {commissionRecords
                      .map((record) => record.description)
                      .join(" + ")}{" "}
                    Advance
                  </h3>
                  <div className="space-y-2">
                    <div>
                      <div className="flex justify-between text-sm">
                        <span className="text-default-600">Total Amount:</span>
                        <span className="font-medium text-default-900">
                          {formatCurrency(
                            commissionRecords.reduce(
                              (sum, record) => sum + Number(record.amount),
                              0
                            )
                          )}
                        </span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-default-600">Records:</span>
                        <span className="font-medium text-default-900">
                          {commissionRecords.length}
                        </span>
                      </div>
                    </div>
                    <div className="border-t border-default-200 pt-2 mt-2">
                      <div className="text-xs text-default-500">
                        {commissionRecords
                          .map((record) => record.description)
                          .join(" + ")}{" "}
                        payments made in advance, deducted from final pay.
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Mid-month Advance */}
              {midMonthPayroll && (
                <div className="border rounded-lg p-4">
                  <h3 className="text-sm font-medium text-default-700 mb-2">
                    Mid-month Advance
                  </h3>
                  <div className="space-y-2">
                    <div>
                      <div className="flex justify-between text-sm">
                        <span className="text-default-600">Amount:</span>
                        <span className="font-medium text-default-900">
                          {formatCurrency(midMonthPayroll.amount)}
                        </span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-default-600">Date:</span>
                        <span className="font-medium text-default-900">
                          {format(
                            new Date(midMonthPayroll.created_at),
                            "dd MMM yyyy"
                          )}
                        </span>
                      </div>
                    </div>
                    <div className="border-t border-default-200 pt-2 mt-2">
                      <div className="text-xs text-default-500">
                        Advance payment made mid-month, deducted from final pay.
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Cuti Tahunan Advance (MAINTEN only) */}
              {payroll.job_type === "MAINTEN" &&
                monthlyLeaveRecords.filter(
                  (record) => record.leave_type === "cuti_tahunan"
                ).length > 0 && (
                  <div className="border rounded-lg p-4">
                    <h3 className="text-sm font-medium text-default-700 mb-2">
                      Cuti Tahunan Advance
                    </h3>
                    <div className="space-y-2">
                      <div>
                        <div className="flex justify-between text-sm">
                          <span className="text-default-600">Amount:</span>
                          <span className="font-medium text-default-900">
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
                        <div className="flex justify-between text-sm">
                          <span className="text-default-600">Days:</span>
                          <span className="font-medium text-default-900">
                            {monthlyLeaveRecords
                              .filter(
                                (record) => record.leave_type === "cuti_tahunan"
                              )
                              .reduce(
                                (sum, record) => sum + record.days_taken,
                                0
                              )}{" "}
                            day
                            {monthlyLeaveRecords
                              .filter(
                                (record) => record.leave_type === "cuti_tahunan"
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
                      <div className="border-t border-default-200 pt-2 mt-2">
                        <div className="text-xs text-default-500">
                          Annual leave payment for MAINTEN employees, treated as
                          advance for commission deduction.
                        </div>
                      </div>
                    </div>
                  </div>
                )}
            </div>
          </div>
        )}

        {/* Tabs for Items and Pay Slip View */}
        <div className="mb-6">
          {/* Payroll Items Tab - This will contain all the existing payroll items tables */}
          <div className="mt-4">
            {/* Payroll Items Section */}
            <h2 className="text-lg font-medium text-default-800 mb-4">
              Payroll Items
            </h2>

            {/* Base Pay Items */}
            {groupedItems["Base"].length > 0 && (
              <div className="mb-6">
                <h3 className="text-md font-medium text-default-700 mb-2">
                  Base Pay
                </h3>
                <div className="border rounded-lg overflow-x-auto">
                  <table className="min-w-full divide-y divide-default-200">
                    <thead className="bg-default-50">
                      <tr>
                        <th
                          scope="col"
                          className="px-6 py-3 text-left text-xs font-medium text-default-500 uppercase tracking-wider"
                        >
                          Description
                        </th>
                        <th
                          scope="col"
                          className="px-6 py-3 text-center text-xs font-medium text-default-500 uppercase tracking-wider"
                        >
                          Rate
                        </th>
                        <th
                          scope="col"
                          className="px-6 py-3 text-center text-xs font-medium text-default-500 uppercase tracking-wider"
                        >
                          Quantity
                        </th>
                        <th
                          scope="col"
                          className="px-6 py-3 text-right text-xs font-medium text-default-500 uppercase tracking-wider"
                        >
                          Amount
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-default-200">
                      {groupedItems["Base"].map((item) => (
                        <tr key={item.id} className="hover:bg-default-50">
                          <td className="px-6 py-3 max-w-xs">
                            <div
                              className="text-sm font-medium text-default-900 truncate"
                              title={item.description}
                            >
                              {item.description}
                            </div>
                            <div className="text-xs text-default-500">
                              {item.pay_code_id}
                            </div>
                          </td>
                          <td className="px-6 py-3 whitespace-nowrap text-center">
                            <div className="text-sm text-default-900">
                              {item.rate_unit === "Percent" ? (
                                <>{item.rate}%</>
                              ) : (
                                <>
                                  {formatCurrency(item.rate)}
                                  <span className="text-xs text-default-500 ml-1">
                                    /{item.rate_unit}
                                  </span>
                                </>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-3 whitespace-nowrap text-center">
                            <div className="text-sm text-default-900">
                              {item.quantity}
                              <span className="text-xs text-default-500 ml-1">
                                {item.rate_unit === "Hour"
                                  ? "hours"
                                  : item.rate_unit === "Day"
                                  ? "days"
                                  : item.rate_unit === "Fixed"
                                  ? ""
                                  : item.rate_unit === "Percent"
                                  ? "units"
                                  : item.rate_unit.toLowerCase()}
                              </span>
                            </div>
                          </td>
                          <td className="px-6 py-3 whitespace-nowrap text-right">
                            <div className="text-sm font-medium text-default-900">
                              {formatCurrency(item.amount)}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-default-50 border-t-2 border-default-200">
                      <tr>
                        <td
                          colSpan={3}
                          className="px-6 py-3 text-right text-sm font-medium text-default-600"
                        >
                          Total Base Pay
                          {(() => {
                            // Group base items by hours to find average rate
                            const baseGroupedByHours = groupedItems["Base"]
                              .filter((item) => item.rate_unit === "Hour")
                              .reduce((acc, item) => {
                                const existing = acc.find(
                                  (group) => group.hours === item.quantity
                                );
                                if (existing) {
                                  existing.amount += item.amount;
                                } else {
                                  acc.push({
                                    hours: item.quantity,
                                    amount: item.amount,
                                  });
                                }
                                return acc;
                              }, [] as { hours: number; amount: number }[]);

                            if (baseGroupedByHours.length > 0) {
                              // Find the hour group with the maximum hours (latest/most hours)
                              const maxHoursGroup = baseGroupedByHours.reduce(
                                (maxGroup, currentGroup) => {
                                  return currentGroup.hours > maxGroup.hours
                                    ? currentGroup
                                    : maxGroup;
                                },
                                baseGroupedByHours[0]
                              );

                              // Calculate rate using the maximum hours group
                              const averageBaseRate =
                                maxHoursGroup && maxHoursGroup.hours > 0
                                  ? baseTotal / maxHoursGroup.hours
                                  : 0;

                              return (
                                <div className="text-xs text-default-500 mt-1">
                                  Avg Rate: {formatCurrency(averageBaseRate)}
                                  /hour
                                </div>
                              );
                            }
                            return null;
                          })()}
                        </td>
                        <td className="px-6 py-3 text-right text-sm font-semibold text-default-900">
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
              <div className="mb-6">
                <h3 className="text-md font-medium text-default-700 mb-2">
                  Tambahan Pay
                </h3>
                <div className="border rounded-lg overflow-x-auto">
                  <table className="min-w-full divide-y divide-default-200">
                    <thead className="bg-default-50">
                      <tr>
                        <th
                          scope="col"
                          className="px-6 py-3 text-left text-xs font-medium text-default-500 uppercase tracking-wider"
                        >
                          Description
                        </th>
                        <th
                          scope="col"
                          className="px-6 py-3 text-center text-xs font-medium text-default-500 uppercase tracking-wider"
                        >
                          Rate
                        </th>
                        <th
                          scope="col"
                          className="px-6 py-3 text-center text-xs font-medium text-default-500 uppercase tracking-wider"
                        >
                          Quantity
                        </th>
                        <th
                          scope="col"
                          className="px-6 py-3 text-right text-xs font-medium text-default-500 uppercase tracking-wider"
                        >
                          Amount
                        </th>
                        {isEditable && (
                          <th
                            scope="col"
                            className="px-6 py-3 text-center text-xs font-medium text-default-500 uppercase tracking-wider"
                          >
                            Actions
                          </th>
                        )}
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-default-200">
                      {groupedItems["Tambahan"].map((item) => (
                        <tr key={item.id} className="hover:bg-default-50">
                          <td className="px-6 py-3 max-w-xs">
                            <div
                              className="text-sm font-medium text-default-900 truncate flex items-center"
                              title={item.description}
                            >
                              <span className="truncate">
                                {item.description}
                              </span>
                              {item.is_manual && (
                                <span className="ml-2 px-1.5 py-0.5 text-xs rounded bg-default-100 text-default-600 flex-shrink-0">
                                  Manual
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-default-500">
                              {item.pay_code_id}
                            </div>
                          </td>
                          <td className="px-6 py-3 whitespace-nowrap text-center">
                            <div className="text-sm text-default-900">
                              {item.rate_unit === "Percent" ? (
                                <>{item.rate}%</>
                              ) : (
                                <>
                                  {formatCurrency(item.rate)}
                                  <span className="text-xs text-default-500 ml-1">
                                    /{item.rate_unit}
                                  </span>
                                </>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-3 whitespace-nowrap text-center">
                            <div className="text-sm text-default-900">
                              {item.quantity}
                              <span className="text-xs text-default-500 ml-1">
                                {item.rate_unit === "Hour"
                                  ? "hours"
                                  : item.rate_unit === "Day"
                                  ? "days"
                                  : item.rate_unit === "Fixed"
                                  ? ""
                                  : item.rate_unit === "Percent"
                                  ? "units"
                                  : item.rate_unit.toLowerCase()}
                              </span>
                            </div>
                          </td>
                          <td className="px-6 py-3 whitespace-nowrap text-right">
                            <div className="text-sm font-medium text-default-900">
                              {formatCurrency(item.amount)}
                            </div>
                          </td>
                          {isEditable && (
                            <td className="px-6 py-3 whitespace-nowrap text-center">
                              <button
                                onClick={() => {
                                  setItemToDelete({
                                    ...item,
                                    id: item.id || 0,
                                  });
                                  setShowDeleteDialog(true);
                                }}
                                className="text-rose-600 hover:text-rose-800"
                                title="Delete Item"
                              >
                                <IconTrash size={18} />
                              </button>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-default-50 border-t-2 border-default-200">
                      <tr>
                        <td
                          colSpan={3}
                          className="px-6 py-3 text-right text-sm font-medium text-default-600"
                        >
                          Total Tambahan Pay
                        </td>
                        <td className="px-6 py-3 text-right text-sm font-semibold text-default-900">
                          {formatCurrency(tambahanTotal)}
                        </td>
                        {isEditable && <td className="px-6 py-3"></td>}
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )}

            {/* Overtime Pay Items */}
            {groupedItems["Overtime"].length > 0 && (
              <div className="mb-6">
                <h3 className="text-md font-medium text-default-700 mb-2">
                  Overtime Pay
                </h3>
                <div className="border rounded-lg overflow-x-auto">
                  <table className="min-w-full divide-y divide-default-200">
                    <thead className="bg-default-50">
                      <tr>
                        <th
                          scope="col"
                          className="px-6 py-3 text-left text-xs font-medium text-default-500 uppercase tracking-wider"
                        >
                          Description
                        </th>
                        <th
                          scope="col"
                          className="px-6 py-3 text-center text-xs font-medium text-default-500 uppercase tracking-wider"
                        >
                          Rate
                        </th>
                        <th
                          scope="col"
                          className="px-6 py-3 text-center text-xs font-medium text-default-500 uppercase tracking-wider"
                        >
                          Quantity
                        </th>
                        <th
                          scope="col"
                          className="px-6 py-3 text-right text-xs font-medium text-default-500 uppercase tracking-wider"
                        >
                          Amount
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-default-200">
                      {groupedItems["Overtime"].map((item) => (
                        <tr key={item.id} className="hover:bg-default-50">
                          <td className="px-6 py-3 max-w-xs">
                            <div
                              className="text-sm font-medium text-default-900 truncate"
                              title={item.description}
                            >
                              {item.description}
                            </div>
                            <div className="text-xs text-default-500">
                              {item.pay_code_id}
                            </div>
                          </td>
                          <td className="px-6 py-3 whitespace-nowrap text-center">
                            <div className="text-sm text-default-900">
                              {item.rate_unit === "Percent" ? (
                                <>{item.rate}%</>
                              ) : (
                                <>
                                  {formatCurrency(item.rate)}
                                  <span className="text-xs text-default-500 ml-1">
                                    /{item.rate_unit}
                                  </span>
                                </>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-3 whitespace-nowrap text-center">
                            <div className="text-sm text-default-900">
                              {item.quantity}
                              <span className="text-xs text-default-500 ml-1">
                                {item.rate_unit === "Hour"
                                  ? "hours"
                                  : item.rate_unit === "Day"
                                  ? "days"
                                  : item.rate_unit === "Fixed"
                                  ? ""
                                  : item.rate_unit === "Percent"
                                  ? "units"
                                  : item.rate_unit.toLowerCase()}
                              </span>
                            </div>
                          </td>
                          <td className="px-6 py-3 whitespace-nowrap text-right">
                            <div className="text-sm font-medium text-default-900">
                              {formatCurrency(item.amount)}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-default-50 border-t-2 border-default-200">
                      <tr>
                        <td
                          colSpan={3}
                          className="px-6 py-3 text-right text-sm font-medium text-default-600"
                        >
                          Total Overtime Pay
                        </td>
                        <td className="px-6 py-3 text-right text-sm font-semibold text-default-900">
                          {formatCurrency(overtimeTotal)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )}

            {/* Commission Records */}
            {commissionRecords.length > 0 && (
              <div className="mb-6">
                <h3 className="text-md font-medium text-default-700 mb-2">
                  {commissionRecords.length > 0
                    ? commissionRecords
                        .map((record) => record.description)
                        .join(" + ")
                    : "Commission"}
                </h3>
                <div className="border rounded-lg overflow-x-auto">
                  <table className="min-w-full divide-y divide-default-200">
                    <thead className="bg-default-50">
                      <tr>
                        <th
                          scope="col"
                          className="px-6 py-3 text-left text-xs font-medium text-default-500 uppercase tracking-wider"
                        >
                          Date
                        </th>
                        <th
                          scope="col"
                          className="px-6 py-3 text-left text-xs font-medium text-default-500 uppercase tracking-wider"
                        >
                          Description
                        </th>
                        <th
                          scope="col"
                          className="px-6 py-3 text-right text-xs font-medium text-default-500 uppercase tracking-wider"
                        >
                          Amount
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-default-200">
                      {commissionRecords.map((record) => (
                        <tr key={record.id} className="hover:bg-default-50">
                          <td className="px-6 py-3 whitespace-nowrap text-sm text-default-900">
                            {format(
                              new Date(record.commission_date),
                              "dd MMM yyyy"
                            )}
                          </td>
                          <td className="px-6 py-3 max-w-xs">
                            <div
                              className="text-sm font-medium text-default-900 truncate"
                              title={record.description}
                            >
                              {record.description}
                            </div>
                          </td>
                          <td className="px-6 py-3 whitespace-nowrap text-right">
                            <div className="text-sm font-medium text-default-900">
                              {formatCurrency(record.amount)}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-default-50 border-t-2 border-default-200">
                      <tr>
                        <td
                          colSpan={2}
                          className="px-6 py-3 text-right text-sm font-medium text-default-600"
                        >
                          Total{" "}
                          {commissionRecords.length > 0
                            ? commissionRecords
                                .map((record) => record.description)
                                .join(" + ")
                            : "Commission"}
                        </td>
                        <td className="px-6 py-3 text-right text-sm font-semibold text-default-900">
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
              <div>
                <h2 className="text-lg font-medium text-default-800 mb-2">
                  Leave Records This Month
                </h2>
                <div className="border rounded-lg overflow-x-auto">
                  <table className="min-w-full divide-y divide-default-200">
                    <thead className="bg-default-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-default-600">
                          Date
                        </th>
                        <th className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wider text-default-600">
                          Leave Type
                        </th>
                        <th className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wider text-default-600">
                          Days
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-default-600">
                          Amount Paid
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-default-200">
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
                            <td className="px-4 py-3 text-sm text-default-900">
                              {format(
                                new Date(record.date.replace(/-/g, "/")),
                                "dd MMM yyyy"
                              )}
                            </td>
                            <td className="px-4 py-3 text-center">
                              <span
                                className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getLeaveTypeColor(
                                  record.leave_type
                                )}`}
                              >
                                {getLeaveTypeDisplay(record.leave_type)}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-center text-sm text-default-900">
                              {Math.round(record.days_taken)}
                            </td>
                            <td className="px-4 py-3 text-right text-sm font-medium text-default-900">
                              {formatCurrency(record.amount_paid)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot className="bg-default-50 border-t-2 border-default-200">
                      <tr>
                        <td
                          colSpan={3}
                          className="px-4 py-3 text-right text-sm font-medium text-default-600"
                        >
                          Total leave this month (
                          {monthlyLeaveRecords.reduce(
                            (sum, record) =>
                              sum + (Number(record.days_taken) || 0),
                            0
                          )}{" "}
                          day
                          {monthlyLeaveRecords.reduce(
                            (sum, record) =>
                              sum + (Number(record.days_taken) || 0),
                            0
                          ) !== 1
                            ? "s"
                            : ""}
                          )
                        </td>
                        <td className="px-4 py-3 text-right text-sm font-semibold text-default-900">
                          {formatCurrency(
                            monthlyLeaveRecords.reduce(
                              (sum, record) =>
                                sum + (Number(record.amount_paid) || 0),
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
        </div>
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
