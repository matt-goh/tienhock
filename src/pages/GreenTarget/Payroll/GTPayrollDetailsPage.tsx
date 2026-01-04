// src/pages/GreenTarget/Payroll/GTPayrollDetailsPage.tsx
import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  IconPlus,
  IconTrash,
  IconCash,
  IconReceipt,
  IconUser,
  IconTruck,
  IconDownload,
} from "@tabler/icons-react";
import Button from "../../../components/Button";
import BackButton from "../../../components/BackButton";
import LoadingSpinner from "../../../components/LoadingSpinner";
import ConfirmationDialog from "../../../components/ConfirmationDialog";
import { api } from "../../../routes/utils/api";
import toast from "react-hot-toast";
import { generatePaySlipPDF } from "../../../utils/payroll/PaySlipPDFMake";
import { EmployeePayroll } from "../../../types/types";

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
  job_type?: string;
}

interface Deduction {
  deduction_type: string;
  employee_amount: number;
  employer_amount: number;
  wage_amount: number;
  rate_info: {
    employee_rate?: string;
    employer_rate?: string;
  };
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
  year: number;
  month: number;
  payroll_status: string;
  ic_no: string;
  bank_account_number: string;
  epf_no: string;
  socso_no: string;
  items: PayrollItem[];
  deductions: Deduction[];
}

const GTPayrollDetailsPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [payroll, setPayroll] = useState<GTEmployeePayroll | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [itemToDelete, setItemToDelete] = useState<PayrollItem | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    fetchPayrollDetails();
  }, [id]);

  const fetchPayrollDetails = async () => {
    if (!id) return;

    setIsLoading(true);
    try {
      const response = await api.get(`/greentarget/api/employee-payrolls/${id}`);
      setPayroll(response);
    } catch (error) {
      console.error("Error fetching GT employee payroll:", error);
      toast.error("Failed to load payroll details");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteItem = async () => {
    if (!itemToDelete || !itemToDelete.id) return;

    setIsDeleting(true);
    try {
      await api.delete(`/greentarget/api/employee-payrolls/items/${itemToDelete.id}`);
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

  const handleDownloadPayslip = () => {
    if (!payroll) return;

    // Convert GT payroll format to EmployeePayroll format for PDF generator
    const pdfPayroll: EmployeePayroll = {
      id: payroll.id,
      monthly_payroll_id: payroll.monthly_payroll_id,
      employee_id: payroll.employee_id,
      employee_name: payroll.employee_name,
      job_type: payroll.job_type,
      section: payroll.section,
      gross_pay: payroll.gross_pay,
      net_pay: payroll.net_pay,
      status: payroll.payroll_status,
      year: payroll.year,
      month: payroll.month,
      items: payroll.items.map(item => ({
        id: item.id,
        pay_code_id: item.pay_code_id,
        description: item.description,
        rate: item.rate,
        rate_unit: item.rate_unit,
        quantity: item.quantity,
        amount: item.amount,
        is_manual: item.is_manual,
        pay_type: item.pay_type || "Base",
        job_type: item.job_type,
      })),
      deductions: payroll.deductions.map(d => ({
        deduction_type: d.deduction_type as "epf" | "socso" | "sip" | "income_tax",
        employee_amount: d.employee_amount,
        employer_amount: d.employer_amount,
        wage_amount: d.wage_amount,
        rate_info: {
          rate_id: 0,
          employee_rate: d.rate_info?.employee_rate || "0%",
          employer_rate: d.rate_info?.employer_rate || "0%",
        },
      })),
      leave_records: [],
      commission_records: [],
    };

    const staffDetails = {
      name: payroll.employee_name,
      icNo: payroll.ic_no || "N/A",
      jobName: payroll.job_type,
      section: payroll.section || "GREEN TARGET",
    };

    generatePaySlipPDF({
      payroll: pdfPayroll,
      companyName: "GREEN TARGET SDN. BHD.",
      staffDetails,
      midMonthPayroll: null,
    });

    toast.success("Payslip downloaded!");
  };

  const formatCurrency = (amount: number): string => {
    return new Intl.NumberFormat("en-MY", {
      style: "currency",
      currency: "MYR",
    }).format(amount);
  };

  const getMonthName = (month: number): string => {
    const months = [
      "January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December",
    ];
    return months[month - 1] || "";
  };

  const getDeductionLabel = (type: string): string => {
    switch (type) {
      case "epf":
        return "EPF (KWSP)";
      case "socso":
        return "SOCSO (PERKESO)";
      case "sip":
        return "SIP (EIS)";
      case "income_tax":
        return "Income Tax (PCB)";
      default:
        return type.toUpperCase();
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <LoadingSpinner />
      </div>
    );
  }

  if (!payroll) {
    return (
      <div className="p-6">
        <BackButton onClick={() => navigate("/greentarget/payroll")} />
        <div className="mt-4 text-center text-default-500 dark:text-gray-400">
          Payroll not found
        </div>
      </div>
    );
  }

  // Group items by pay type
  const groupedItems = payroll.items.reduce(
    (acc: Record<string, PayrollItem[]>, item) => {
      const type = item.pay_type || "Other";
      if (!acc[type]) acc[type] = [];
      acc[type].push(item);
      return acc;
    },
    {}
  );

  // Calculate totals
  const totalDeductions = payroll.deductions.reduce(
    (sum, d) => sum + d.employee_amount,
    0
  );

  const isFinalized = payroll.payroll_status === "Finalized";

  return (
    <div className="px-6 pb-6 space-y-3">
      {/* Header */}
      <div className="flex items-center gap-4">
        <BackButton onClick={() => navigate("/greentarget/payroll")} />
        <span className="text-default-300 dark:text-gray-600">|</span>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            {payroll.job_type === "OFFICE" ? (
              <IconUser size={24} className="text-sky-500" />
            ) : (
              <IconTruck size={24} className="text-amber-500" />
            )}
            <h1 className="text-2xl font-semibold text-default-800 dark:text-gray-100">
              {payroll.employee_name}
            </h1>
          </div>
          <p className="text-sm text-default-500 dark:text-gray-400">
            {getMonthName(payroll.month)} {payroll.year} - {payroll.job_type}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={handleDownloadPayslip}
            icon={IconDownload}
            iconSize={16}
          >
            Payslip
          </Button>
          <span
            className={`px-3 py-1 rounded-full text-sm font-medium ${
              isFinalized
                ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
            }`}
          >
            {payroll.payroll_status}
          </span>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-sky-100 dark:bg-sky-900/30 rounded-lg">
              <IconCash size={20} className="text-sky-600 dark:text-sky-400" />
            </div>
            <div>
              <p className="text-sm text-default-500 dark:text-gray-400">Gross Pay</p>
              <p className="text-xl font-semibold text-default-800 dark:text-gray-100">
                {formatCurrency(payroll.gross_pay)}
              </p>
            </div>
          </div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-red-100 dark:bg-red-900/30 rounded-lg">
              <IconReceipt size={20} className="text-red-600 dark:text-red-400" />
            </div>
            <div>
              <p className="text-sm text-default-500 dark:text-gray-400">Deductions</p>
              <p className="text-xl font-semibold text-red-600 dark:text-red-400">
                -{formatCurrency(totalDeductions)}
              </p>
            </div>
          </div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-100 dark:bg-emerald-900/30 rounded-lg">
              <IconCash size={20} className="text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <p className="text-sm text-default-500 dark:text-gray-400">Net Pay</p>
              <p className="text-xl font-semibold text-emerald-600 dark:text-emerald-400">
                {formatCurrency(payroll.net_pay)}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Payroll Items */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
        <div className="px-4 py-3 border-b border-default-200 dark:border-gray-700 flex justify-between items-center">
          <h3 className="font-medium text-default-800 dark:text-gray-200">
            Earnings
          </h3>
          {!isFinalized && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => toast("Add manual item feature coming soon")}
              icon={IconPlus}
              iconSize={16}
            >
              Add Item
            </Button>
          )}
        </div>
        <div className="p-4">
          {payroll.items.length === 0 ? (
            <p className="text-center text-default-400 dark:text-gray-500 py-4">
              No earnings recorded
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-default-200 dark:border-gray-700">
                  <th className="text-left py-2 text-default-600 dark:text-gray-400 font-medium">
                    Description
                  </th>
                  <th className="text-right py-2 text-default-600 dark:text-gray-400 font-medium w-24">
                    Rate
                  </th>
                  <th className="text-right py-2 text-default-600 dark:text-gray-400 font-medium w-20">
                    Qty
                  </th>
                  <th className="text-right py-2 text-default-600 dark:text-gray-400 font-medium w-28">
                    Amount
                  </th>
                  {!isFinalized && (
                    <th className="w-10"></th>
                  )}
                </tr>
              </thead>
              <tbody>
                {Object.entries(groupedItems).map(([type, items]) => (
                  <React.Fragment key={type}>
                    <tr>
                      <td
                        colSpan={isFinalized ? 4 : 5}
                        className="py-2 pt-4 text-xs font-semibold text-default-500 dark:text-gray-400 uppercase tracking-wide"
                      >
                        {type}
                      </td>
                    </tr>
                    {items.map((item) => (
                      <tr
                        key={item.id}
                        className="border-b border-default-100 dark:border-gray-700/50"
                      >
                        <td className="py-2 text-default-800 dark:text-gray-200">
                          {item.description}
                          {item.is_manual && (
                            <span className="ml-2 px-1.5 py-0.5 text-xs bg-sky-100 dark:bg-sky-900/30 text-sky-600 dark:text-sky-400 rounded">
                              Manual
                            </span>
                          )}
                        </td>
                        <td className="py-2 text-right text-default-600 dark:text-gray-400">
                          {formatCurrency(item.rate)}
                          <span className="text-xs text-default-400 dark:text-gray-500 ml-1">
                            /{item.rate_unit}
                          </span>
                        </td>
                        <td className="py-2 text-right text-default-600 dark:text-gray-400">
                          {item.quantity}
                        </td>
                        <td className="py-2 text-right font-medium text-default-800 dark:text-gray-200">
                          {formatCurrency(item.amount)}
                        </td>
                        {!isFinalized && (
                          <td className="py-2 text-right">
                            {item.is_manual && (
                              <button
                                onClick={() => {
                                  setItemToDelete(item);
                                  setShowDeleteDialog(true);
                                }}
                                className="p-1 text-red-500 hover:text-red-700 dark:hover:text-red-400"
                              >
                                <IconTrash size={16} />
                              </button>
                            )}
                          </td>
                        )}
                      </tr>
                    ))}
                  </React.Fragment>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-default-200 dark:border-gray-600">
                  <td
                    colSpan={isFinalized ? 3 : 4}
                    className="py-2 font-semibold text-default-800 dark:text-gray-200"
                  >
                    Total Earnings
                  </td>
                  <td className="py-2 text-right font-bold text-emerald-600 dark:text-emerald-400">
                    {formatCurrency(payroll.gross_pay)}
                  </td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      </div>

      {/* Deductions */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
        <div className="px-4 py-3 border-b border-default-200 dark:border-gray-700">
          <h3 className="font-medium text-default-800 dark:text-gray-200">
            Statutory Deductions
          </h3>
        </div>
        <div className="p-4">
          {payroll.deductions.length === 0 ? (
            <p className="text-center text-default-400 dark:text-gray-500 py-4">
              No deductions
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-default-200 dark:border-gray-700">
                  <th className="text-left py-2 text-default-600 dark:text-gray-400 font-medium">
                    Type
                  </th>
                  <th className="text-right py-2 text-default-600 dark:text-gray-400 font-medium">
                    Rate
                  </th>
                  <th className="text-right py-2 text-default-600 dark:text-gray-400 font-medium">
                    Employee
                  </th>
                  <th className="text-right py-2 text-default-600 dark:text-gray-400 font-medium">
                    Employer
                  </th>
                </tr>
              </thead>
              <tbody>
                {payroll.deductions.map((deduction, index) => (
                  <tr
                    key={index}
                    className="border-b border-default-100 dark:border-gray-700/50"
                  >
                    <td className="py-2 text-default-800 dark:text-gray-200">
                      {getDeductionLabel(deduction.deduction_type)}
                    </td>
                    <td className="py-2 text-right text-default-600 dark:text-gray-400 text-xs">
                      {deduction.rate_info?.employee_rate || "-"}
                    </td>
                    <td className="py-2 text-right text-red-600 dark:text-red-400 font-medium">
                      {formatCurrency(deduction.employee_amount)}
                    </td>
                    <td className="py-2 text-right text-default-600 dark:text-gray-400">
                      {formatCurrency(deduction.employer_amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-default-200 dark:border-gray-600">
                  <td
                    colSpan={2}
                    className="py-2 font-semibold text-default-800 dark:text-gray-200"
                  >
                    Total Deductions
                  </td>
                  <td className="py-2 text-right font-bold text-red-600 dark:text-red-400">
                    {formatCurrency(totalDeductions)}
                  </td>
                  <td className="py-2 text-right font-medium text-default-600 dark:text-gray-400">
                    {formatCurrency(
                      payroll.deductions.reduce((sum, d) => sum + d.employer_amount, 0)
                    )}
                  </td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      </div>

      {/* Net Pay Summary */}
      <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-lg shadow p-4">
        <div className="flex justify-between items-center">
          <span className="text-lg font-medium text-emerald-800 dark:text-emerald-300">
            Net Pay
          </span>
          <span className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
            {formatCurrency(payroll.net_pay)}
          </span>
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      <ConfirmationDialog
        isOpen={showDeleteDialog}
        onClose={() => {
          setShowDeleteDialog(false);
          setItemToDelete(null);
        }}
        onConfirm={handleDeleteItem}
        title="Delete Payroll Item"
        message={`Are you sure you want to delete "${itemToDelete?.description}"? This action cannot be undone.`}
        confirmButtonText="Delete"
        variant="danger"
      />
    </div>
  );
};

export default GTPayrollDetailsPage;
