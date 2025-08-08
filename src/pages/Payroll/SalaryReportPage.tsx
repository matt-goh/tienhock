// src/pages/Payroll/SalaryReportPage.tsx
import React, { useState, useEffect, useMemo } from "react";
import {
  IconRefresh,
  IconFileText,
  IconPrinter,
  IconDownload,
} from "@tabler/icons-react";
import Button from "../../components/Button";
import LoadingSpinner from "../../components/LoadingSpinner";
import { FormListbox } from "../../components/FormComponents";
import Tab from "../../components/Tab";
import { api } from "../../routes/utils/api";
import { getMonthName } from "../../utils/payroll/midMonthPayrollUtils";
import {
  generateSalaryReportPDF,
  SalaryReportPDFData,
} from "../../utils/payroll/SalaryReportPDF";
import {
  generateBankReportPDF,
  BankReportPDFData,
} from "../../utils/payroll/BankReportPDF";
import { useStaffsCache } from "../../utils/catalogue/useStaffsCache";
import toast from "react-hot-toast";

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
  const [reportData, setReportData] = useState<SalaryReportResponse | null>(
    null
  );
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isGeneratingPDF, setIsGeneratingPDF] = useState<boolean>(false);

  // Filters
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth() + 1);

  // Tab state
  const [activeTab, setActiveTab] = useState(0); // 0 = Bank, 1 = Pinjam

  // Staff data
  const { staffs } = useStaffsCache();

  // Bank table data - combine staff info with salary data
  const bankTableData = useMemo(() => {
    if (!reportData || !staffs) return [];

    return reportData.data.map((salaryItem) => {
      const staff = staffs.find((s) => s.id === salaryItem.staff_id);
      return {
        no: salaryItem.no,
        staff_name: salaryItem.staff_name,
        icNo: staff?.icNo || "N/A",
        bankAccountNumber: staff?.bankAccountNumber || "N/A",
        total: salaryItem.final_total,
      };
    });
  }, [reportData, staffs]);

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

  // PDF Generation
  const generatePDF = async (action: "download" | "print") => {
    if (!reportData || reportData.data.length === 0) {
      toast.error("No data available to generate PDF");
      return;
    }

    setIsGeneratingPDF(true);
    try {
      if (activeTab === 0) {
        // Generate Bank Report PDF
        const bankPdfData: BankReportPDFData = {
          year: reportData.year,
          month: reportData.month,
          data: bankTableData,
          total_records: reportData.total_records,
          summary: {
            total_final: reportData.summary.total_final,
          },
        };

        await generateBankReportPDF(bankPdfData, action);
        const actionText =
          action === "download" ? "downloaded" : "generated for printing";
        toast.success(`Salary report ${actionText} successfully`);
      } else {
        // Generate Pinjam (Salary) Report PDF
        const pdfData: SalaryReportPDFData = {
          year: reportData.year,
          month: reportData.month,
          data: reportData.data,
          total_records: reportData.total_records,
          summary: reportData.summary,
        };

        await generateSalaryReportPDF(pdfData, action);
        const actionText =
          action === "download" ? "downloaded" : "generated for printing";
        toast.success(`Bank report ${actionText} successfully`);
      }
    } catch (error) {
      console.error("Error generating PDF:", error);
      toast.error("Failed to generate PDF");
    } finally {
      setIsGeneratingPDF(false);
    }
  };

  // Bank Table Component
  const BankTable = () => (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-default-200">
        <thead className="bg-default-50">
          <tr>
            <th className="px-6 py-3 text-left text-xs font-medium text-default-500 uppercase tracking-wider">
              NO.
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-default-500 uppercase tracking-wider">
              STAFF NAME
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-default-500 uppercase tracking-wider">
              IC NO.
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-default-500 uppercase tracking-wider">
              BANK ACCOUNT NUMBER
            </th>
            <th className="px-6 py-3 text-right text-xs font-medium text-default-500 uppercase tracking-wider">
              TOTAL
            </th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-default-200">
          {bankTableData.map((item) => (
            <tr key={item.no} className="hover:bg-default-50">
              <td className="px-6 py-4 whitespace-nowrap text-sm text-default-900">
                {item.no}
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-default-900">
                {item.staff_name}
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-default-900">
                {item.icNo}
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-default-900">
                {item.bankAccountNumber}
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-default-900 text-right">
                {formatCurrency(item.total)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  // Pinjam Table Component
  const PinjamTable = () => (
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
              PAYMENT
            </th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-default-200">
          {reportData?.data.map((item) => (
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
                <span
                  className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                    item.payment_preference === "Bank"
                      ? "bg-sky-100 text-sky-800"
                      : "bg-emerald-100 text-emerald-800"
                  }`}
                >
                  {item.payment_preference}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="relative w-full space-y-4 mx-4 mb-4 md:mx-6">
      <div className="flex flex-col md:flex-row justify-between items-center">
        <h1 className="text-xl font-semibold text-default-800">
          Salary Report
        </h1>
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
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-medium text-default-800">
              {getMonthName(currentMonth)} {currentYear} Salary Report
            </h2>
            <div className="flex space-x-3">
              <Button
                onClick={fetchSalaryReport}
                icon={IconRefresh}
                variant="outline"
                disabled={isLoading}
                size="sm"
              >
                Refresh
              </Button>
              <div className="flex space-x-2">
                <Button
                  onClick={() => generatePDF("print")}
                  icon={IconPrinter}
                  color="green"
                  variant="outline"
                  disabled={
                    !reportData ||
                    reportData.data.length === 0 ||
                    isGeneratingPDF
                  }
                  size="sm"
                >
                  Print
                </Button>
                <Button
                  onClick={() => generatePDF("download")}
                  icon={IconDownload}
                  color="blue"
                  variant="outline"
                  disabled={
                    !reportData ||
                    reportData.data.length === 0 ||
                    isGeneratingPDF
                  }
                  size="sm"
                >
                  Download
                </Button>
              </div>
            </div>
          </div>
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
              No salary data available for {getMonthName(currentMonth)}{" "}
              {currentYear}
            </p>
          </div>
        ) : (
          <>
            <div className="px-6 py-4">
              <Tab
                labels={["Bank", "Pinjam"]}
                defaultActiveTab={activeTab}
                onTabChange={setActiveTab}
              >
                <div>
                  <BankTable />
                </div>
                <div>
                  <PinjamTable />
                </div>
              </Tab>
            </div>

            {/* Summary Footer */}
            <div className="bg-default-50 px-6 py-4 border-t border-default-200">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center space-y-2 md:space-y-0">
                <div className="text-sm text-default-600">
                  <span className="font-medium">Total Records:</span>{" "}
                  {reportData.total_records}
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
