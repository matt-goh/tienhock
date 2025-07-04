// src/components/Payroll/PaySlipPreview.tsx
import React from "react";
import { EmployeePayroll, MidMonthPayroll } from "../../types/types";
import {
  groupItemsByType,
  getMonthName,
} from "../../utils/payroll/payrollUtils";

interface PaySlipPreviewProps {
  payroll: EmployeePayroll;
  companyName?: string;
  showPrintHeader?: boolean;
  className?: string;
  midMonthPayroll?: MidMonthPayroll | null;
}

const PaySlipPreview: React.FC<PaySlipPreviewProps> = ({
  payroll,
  companyName = "TIEN HOCK FOOD INDUSTRIES S/B",
  showPrintHeader = true,
  className = "",
  midMonthPayroll,
}) => {
  const groupedItems = groupItemsByType(
    payroll.items.map((item) => ({
      ...item,
      id: item.id || 0, // Ensure id is always a number
    }))
  );

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-MY", {
      style: "currency",
      currency: "MYR",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  };

  return (
    <div
      className={`bg-white border border-default-200 rounded-lg ${className}`}
    >
      {/* Pay Slip Header */}
      <div className="p-6 border-b border-default-200">
        {showPrintHeader && (
          <div className="mb-4">
            <h2 className="text-xl font-bold text-center uppercase">
              {companyName}
            </h2>
            <p className="text-center text-default-600">
              Pay Slip for {getMonthName(payroll.month)} {payroll.year}
            </p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4 mt-4">
          <div>
            <p className="text-sm text-default-500">Employee ID</p>
            <p className="font-medium">{payroll.employee_id}</p>
          </div>
          <div>
            <p className="text-sm text-default-500">Name</p>
            <p className="font-medium">{payroll.employee_name}</p>
          </div>
          <div>
            <p className="text-sm text-default-500">Job Type</p>
            <p className="font-medium">{payroll.job_type}</p>
          </div>
          <div>
            <p className="text-sm text-default-500">Section</p>
            <p className="font-medium">{payroll.section}</p>
          </div>
        </div>
      </div>

      {/* Pay Details */}
      <div className="p-6">
        <div className="space-y-6">
          {/* Base Pay Items */}
          {groupedItems["Base"].length > 0 && (
            <div>
              <h3 className="font-medium text-default-800 mb-2 border-b pb-1">
                Base Pay
              </h3>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-default-500">
                    <th className="text-left font-medium py-1">Description</th>
                    <th className="text-right font-medium py-1">Rate</th>
                    <th className="text-right font-medium py-1">Quantity</th>
                    <th className="text-right font-medium py-1">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {groupedItems["Base"].map((item) => (
                    <tr key={item.id} className="border-b border-default-100">
                      <td className="py-2 text-left">{item.description}</td>
                      <td className="py-2 text-right">
                        {formatCurrency(item.rate)}
                        <span className="text-xs text-default-500 ml-1">
                          /{item.rate_unit}
                        </span>
                      </td>
                      <td className="py-2 text-right">
                        {item.quantity}
                        <span className="text-xs text-default-500 ml-1">
                          {item.rate_unit === "Hour"
                            ? "hrs"
                            : item.rate_unit === "Day"
                            ? "days"
                            : item.rate_unit === "Fixed"
                            ? ""
                            : item.rate_unit.toLowerCase()}
                        </span>
                      </td>
                      <td className="py-2 text-right font-medium">
                        {formatCurrency(item.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Tambahan Pay Items */}
          {groupedItems["Tambahan"].length > 0 && (
            <div>
              <h3 className="font-medium text-default-800 mb-2 border-b pb-1">
                Tambahan Pay
              </h3>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-default-500">
                    <th className="text-left font-medium py-1">Description</th>
                    <th className="text-right font-medium py-1">Rate</th>
                    <th className="text-right font-medium py-1">Quantity</th>
                    <th className="text-right font-medium py-1">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {groupedItems["Tambahan"].map((item) => (
                    <tr key={item.id} className="border-b border-default-100">
                      <td className="py-2 text-left">
                        {item.description}
                        {item.is_manual && (
                          <span className="ml-2 text-xs text-default-500">
                            (Manual)
                          </span>
                        )}
                      </td>
                      <td className="py-2 text-right">
                        {formatCurrency(item.rate)}
                        <span className="text-xs text-default-500 ml-1">
                          /{item.rate_unit}
                        </span>
                      </td>
                      <td className="py-2 text-right">
                        {item.quantity}
                        <span className="text-xs text-default-500 ml-1">
                          {item.rate_unit === "Hour"
                            ? "hrs"
                            : item.rate_unit === "Day"
                            ? "days"
                            : item.rate_unit === "Fixed"
                            ? ""
                            : item.rate_unit.toLowerCase()}
                        </span>
                      </td>
                      <td className="py-2 text-right font-medium">
                        {formatCurrency(item.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Overtime Pay Items */}
          {groupedItems["Overtime"].length > 0 && (
            <div>
              <h3 className="font-medium text-default-800 mb-2 border-b pb-1">
                Overtime Pay
              </h3>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-default-500">
                    <th className="text-left font-medium py-1">Description</th>
                    <th className="text-right font-medium py-1">Rate</th>
                    <th className="text-right font-medium py-1">Quantity</th>
                    <th className="text-right font-medium py-1">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {groupedItems["Overtime"].map((item) => (
                    <tr key={item.id} className="border-b border-default-100">
                      <td className="py-2 text-left">{item.description}</td>
                      <td className="py-2 text-right">
                        {formatCurrency(item.rate)}
                        <span className="text-xs text-default-500 ml-1">
                          /{item.rate_unit}
                        </span>
                      </td>
                      <td className="py-2 text-right">
                        {item.quantity}
                        <span className="text-xs text-default-500 ml-1">
                          {item.rate_unit === "Hour"
                            ? "hrs"
                            : item.rate_unit === "Day"
                            ? "days"
                            : item.rate_unit === "Fixed"
                            ? ""
                            : item.rate_unit.toLowerCase()}
                        </span>
                      </td>
                      <td className="py-2 text-right font-medium">
                        {formatCurrency(item.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Summary */}
        <div className="border-t border-default-200">
          <div className="flex justify-between py-2">
            <span className="font-medium">Gross Pay:</span>
            <span className="font-medium">
              {formatCurrency(payroll.gross_pay)}
            </span>
          </div>

          {/* Deductions Section */}
          {payroll.deductions && payroll.deductions.length > 0 && (
            <div className="border-t border-default-200 pt-2">
              <h3 className="font-medium text-default-800 mb-3">Deductions</h3>
              <div className="space-y-3">
                {payroll.deductions
                  .sort((a, b) => {
                    const order = ["EPF", "SIP", "SOCSO", "INCOME_TAX"];
                    return (
                      order.indexOf(a.deduction_type) -
                      order.indexOf(b.deduction_type)
                    );
                  })
                  .map((deduction, index) => {
                    const deductionName =
                      deduction.deduction_type === "income_tax"
                        ? "Income Tax"
                        : deduction.deduction_type.toUpperCase();
                    return (
                      <div key={index} className="grid grid-cols-2 gap-8">
                        <div className="flex justify-between">
                          <span className="text-sm text-default-600">
                            {deductionName} (Employer):
                          </span>
                          <span className="text-sm font-medium">
                            {formatCurrency(deduction.employer_amount)}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-sm text-default-600">
                            {deductionName} (Employee):
                          </span>
                          <span className="text-sm font-medium text-rose-600">
                            -{formatCurrency(deduction.employee_amount)}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                <div className="border-t border-default-200 pt-2 mt-3">
                  <div className="flex justify-between font-medium">
                    <span className="text-default-700">
                      Total Employee Deductions:
                    </span>
                    <span className="text-rose-600">
                      -
                      {formatCurrency(
                        payroll.deductions.reduce(
                          (sum, deduction) => sum + deduction.employee_amount,
                          0
                        )
                      )}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Mid-Month Payment Section */}
          {midMonthPayroll && (
            <div className="border-t border-default-200 pt-2 mt-2">
              <div className="flex justify-between py-2">
                <span className="text-default-600">
                  Mid-Month Payment ({midMonthPayroll.payment_method}):
                </span>
                <span className="font-medium text-rose-600">
                  -{formatCurrency(midMonthPayroll.amount)}
                </span>
              </div>
            </div>
          )}

          <div className="flex justify-between py-2 border-t border-default-200 mt-2">
            <span className="font-medium">Net Pay:</span>
            <span className="font-medium">
              {formatCurrency(
                midMonthPayroll
                  ? payroll.net_pay - midMonthPayroll.amount
                  : payroll.net_pay
              )}
            </span>
          </div>
        </div>

        {/* Signature Section */}
        <div className="mt-12 grid grid-cols-2 gap-8">
          <div className="text-center">
            <div className="h-10 border-b border-default-300 mb-2"></div>
            <p className="text-sm text-default-500">Employee Signature</p>
          </div>
          <div className="text-center">
            <div className="h-10 border-b border-default-300 mb-2"></div>
            <p className="text-sm text-default-500">Employer Signature</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PaySlipPreview;
