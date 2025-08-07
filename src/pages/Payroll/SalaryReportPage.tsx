// src/pages/Payroll/SalaryReportPage.tsx
import React, { useState, useEffect, useMemo } from "react";
import { IconRefresh, IconFileText } from "@tabler/icons-react";
import Button from "../../components/Button";
import LoadingSpinner from "../../components/LoadingSpinner";
import { FormListbox } from "../../components/FormComponents";
import { api } from "../../routes/utils/api";
import { getMonthName } from "../../utils/payroll/midMonthPayrollUtils";

interface SalaryReportData {
  no: number;
  staff_id: string;
  staff_name: string;
  payment_preference: string;
  gaji_genap: number;
  total_pinjam: number;
  final_total: number;
  net_pay: number;
  mid_month_amount: number;
}

interface SalaryReportResponse {
  year: number;
  month: number;
  data: SalaryReportData[];
  total_records: number;
  summary: {
    total_gaji_genap: number;
    total_pinjam: number;
    total_final: number;
  };
}

const SalaryReportPage: React.FC = () => {
  // State
  const [reportData, setReportData] = useState<SalaryReportResponse | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Filters
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth() + 1);

  // Generate year and month options
  const yearOptions = useMemo(() => {
    const years = [];
    for (let year = currentYear - 2; year <= currentYear + 1; year++) {
      years.push({ id: year, name: year.toString() });
    }
    return years;
  }, [currentYear]);

  const monthOptions = useMemo(
    () =>
      Array.from({ length: 12 }, (_, i) => ({
        id: i + 1,
        name: getMonthName(i + 1),
      })),
    []
  );

  // Load salary report on mount and filter changes
  useEffect(() => {
    fetchSalaryReport();
  }, [currentYear, currentMonth]);

  const fetchSalaryReport = async () => {
    setIsLoading(true);
    try {
      const response = await api.get(
        `/api/salary-report?year=${currentYear}&month=${currentMonth}`
      );
      setReportData(response);
    } catch (error) {
      console.error("Error fetching salary report:", error);
      setReportData(null);
    } finally {
      setIsLoading(false);
    }
  };

  const formatCurrency = (amount: number): string => {
    return new Intl.NumberFormat("en-MY", {
      style: "currency",
      currency: "MYR",
    }).format(amount);
  };

  return (
    <div className="relative w-full space-y-4 mx-4 md:mx-6">
      <div className="flex flex-col md:flex-row justify-between items-center">
        <h1 className="text-xl font-semibold text-default-800">
          Salary Report
        </h1>
        <div className="flex space-x-3 mt-4 md:mt-0">
          <Button
            onClick={fetchSalaryReport}
            icon={IconRefresh}
            variant="outline"
            disabled={isLoading}
          >
            Refresh
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg border border-default-200 shadow-sm p-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <FormListbox
            name="year"
            label="Year"
            value={currentYear.toString()}
            onChange={(value) => setCurrentYear(Number(value))}
            options={yearOptions}
          />
          <FormListbox
            name="month"
            label="Month"
            value={currentMonth.toString()}
            onChange={(value) => setCurrentMonth(Number(value))}
            options={monthOptions}
          />
          {reportData && (
            <div className="flex items-end">
              <div className="text-sm text-default-600">
                <div className="font-medium">
                  Total: {reportData.total_records} employees
                </div>
                <div className="font-medium">
                  Grand Total: {formatCurrency(reportData.summary.total_final)}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Salary Report Table */}
      <div className="bg-white rounded-lg border border-default-200 shadow-sm">
        <div className="px-6 py-4 border-b border-default-200">
          <h2 className="text-lg font-medium text-default-800">
            {getMonthName(currentMonth)} {currentYear} Salary Report
          </h2>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <LoadingSpinner />
          </div>
        ) : !reportData || reportData.data.length === 0 ? (
          <div className="text-center py-12 text-default-500">
            <IconFileText className="mx-auto h-12 w-12 text-default-300 mb-4" />
            <p className="text-lg font-medium">No salary data found</p>
            <p>
              No salary data available for {getMonthName(currentMonth)} {currentYear}
            </p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-default-200">
                <thead className="bg-default-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-default-500 uppercase tracking-wider">
                      NO.
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-default-500 uppercase tracking-wider">
                      STAFF/ID
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-default-500 uppercase tracking-wider">
                      GAJI/GENAP
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-default-500 uppercase tracking-wider">
                      TOTAL PINJAM
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-default-500 uppercase tracking-wider">
                      TOTAL
                    </th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-default-500 uppercase tracking-wider">
                      PREFERRED PAYMENT
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-default-200">
                  {reportData.data.map((item) => (
                    <tr key={item.staff_id} className="hover:bg-default-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-default-900">
                        {item.no}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-default-900">
                          {item.staff_id} - {item.staff_name}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-default-900 text-right">
                        {formatCurrency(item.gaji_genap)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-default-900 text-right">
                        {formatCurrency(item.total_pinjam)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-default-900 text-right">
                        {formatCurrency(item.final_total)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-default-900 text-center">
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                          item.payment_preference === 'Bank' 
                            ? 'bg-sky-100 text-sky-800'
                            : 'bg-emerald-100 text-emerald-800'
                        }`}>
                          {item.payment_preference}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Summary Footer */}
            <div className="bg-default-50 px-6 py-4 border-t border-default-200">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center space-y-2 md:space-y-0">
                <div className="text-sm text-default-600">
                  <span className="font-medium">Total Records:</span> {reportData.total_records}
                </div>
                <div className="flex flex-col md:flex-row space-y-1 md:space-y-0 md:space-x-6 text-sm">
                  <div className="text-default-700">
                    <span className="font-medium">Total Gaji/Genap:</span>{" "}
                    <span className="text-default-900">
                      {formatCurrency(reportData.summary.total_gaji_genap)}
                    </span>
                  </div>
                  <div className="text-default-700">
                    <span className="font-medium">Total Pinjam:</span>{" "}
                    <span className="text-default-900">
                      {formatCurrency(reportData.summary.total_pinjam)}
                    </span>
                  </div>
                  <div className="text-sky-700">
                    <span className="font-semibold">Grand Total:</span>{" "}
                    <span className="font-bold text-sky-800">
                      {formatCurrency(reportData.summary.total_final)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default SalaryReportPage;