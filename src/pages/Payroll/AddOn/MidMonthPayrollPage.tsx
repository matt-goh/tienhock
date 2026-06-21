// src/pages/Payroll/MidMonthPayrollPage.tsx
import React, { useState, useEffect, useMemo, useRef } from "react";
import { format } from "date-fns";
import {
  IconPlus,
  IconEdit,
  IconTrash,
  IconCash,
  IconRefresh,
  IconPrinter,
  IconFileExport,
  IconSearch,
  IconX,
} from "@tabler/icons-react";
import Button from "../../../components/Button";
import LoadingSpinner from "../../../components/LoadingSpinner";
import ConfirmationDialog from "../../../components/ConfirmationDialog";
import {
  getMidMonthPayrolls,
  deleteMidMonthPayroll,
  getMonthName,
  MidMonthPayroll,
} from "../../../utils/payroll/midMonthPayrollUtils";
import YearNavigator from "../../../components/YearNavigator";
import MonthNavigator from "../../../components/MonthNavigator";
import AddMidMonthPayrollModal from "../../../components/Payroll/AddMidMonthPayrollModal";
import EditMidMonthPayrollModal from "../../../components/Payroll/EditMidMonthPayrollModal";
import {
  generateMidMonthPayrollReportPDF,
  MidMonthPayrollReportPDFData,
} from "../../../utils/payroll/MidMonthPayrollReportPDF";
import { api } from "../../../routes/utils/api";
import { useStaffsCache } from "../../../utils/catalogue/useStaffsCache";
import toast from "react-hot-toast";

const MidMonthPayrollPage: React.FC = () => {
  // Get initial values from URL params or defaults
  const getInitialYear = (): number => {
    const params = new URLSearchParams(window.location.search);
    const yearParam = params.get("year");
    if (yearParam) {
      const year = parseInt(yearParam, 10);
      if (!isNaN(year) && year >= 2000 && year <= 2100) {
        return year;
      }
    }
    return new Date().getFullYear();
  };

  const getInitialMonth = (): number => {
    const params = new URLSearchParams(window.location.search);
    const monthParam = params.get("month");
    if (monthParam) {
      const month = parseInt(monthParam, 10);
      if (!isNaN(month) && month >= 1 && month <= 12) {
        return month;
      }
    }
    return new Date().getMonth() + 1;
  };

  const getInitialSearch = (): string => {
    const params: URLSearchParams = new URLSearchParams(window.location.search);
    return params.get("search") || "";
  };

  // State
  const [payrolls, setPayrolls] = useState<MidMonthPayroll[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingPayroll, setEditingPayroll] = useState<MidMonthPayroll | null>(
    null
  );
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [pinjamByEmp, setPinjamByEmp] = useState<Record<string, number>>({});
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
  const [isGeneratingExport, setIsGeneratingExport] = useState(false);
  const [isPrintDropdownOpen, setIsPrintDropdownOpen] = useState(false);
  const printDropdownTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const { staffs } = useStaffsCache();

  // Filters - initialize from URL params
  const [currentYear, setCurrentYear] = useState(getInitialYear);
  const [currentMonth, setCurrentMonth] = useState(getInitialMonth);
  const [searchQuery, setSearchQuery] = useState<string>(getInitialSearch);

  // Create Date object for MonthNavigator
  const selectedMonth = useMemo(
    () => new Date(currentYear, currentMonth - 1, 1),
    [currentYear, currentMonth]
  );

  // Update URL when year/month changes
  useEffect(() => {
    const params = new URLSearchParams();
    params.set("year", currentYear.toString());
    params.set("month", currentMonth.toString());
    if (searchQuery) {
      params.set("search", searchQuery);
    }
    const newUrl = `${window.location.pathname}?${params.toString()}`;
    window.history.replaceState({}, "", newUrl);
  }, [currentYear, currentMonth, searchQuery]);

  // Load payrolls on mount and filter changes
  useEffect(() => {
    fetchPayrolls();
  }, [currentYear, currentMonth]);

  const fetchPayrolls = async () => {
    setIsLoading(true);
    try {
      const [payrollsResponse, pinjamSummary] = await Promise.all([
        getMidMonthPayrolls({
          year: currentYear,
          month: currentMonth,
          limit: 100,
        }),
        api.get(
          `/api/pinjam-records/summary?year=${currentYear}&month=${currentMonth}`
        ),
      ]);
      setPayrolls(payrollsResponse.payrolls);

      const pinjamMap: Record<string, number> = {};
      if (Array.isArray(pinjamSummary)) {
        pinjamSummary.forEach((entry: any) => {
          const amount = Number(entry?.mid_month?.total_amount ?? 0);
          if (entry?.employee_id) {
            pinjamMap[entry.employee_id] = amount;
          }
        });
      }
      setPinjamByEmp(pinjamMap);
    } catch (error) {
      console.error("Error fetching payrolls:", error);
      toast.error("Failed to load mid-month payrolls");
    } finally {
      setIsLoading(false);
    }
  };

  const handlePrintDropdownMouseEnter = () => {
    if (printDropdownTimeoutRef.current) {
      clearTimeout(printDropdownTimeoutRef.current);
      printDropdownTimeoutRef.current = null;
    }
    setIsPrintDropdownOpen(true);
  };

  const handlePrintDropdownMouseLeave = () => {
    printDropdownTimeoutRef.current = setTimeout(() => {
      setIsPrintDropdownOpen(false);
    }, 300);
  };

  const generatePDF = async (action: "download" | "print") => {
    if (payrolls.length === 0) {
      toast.error("No data available to generate PDF");
      return;
    }

    setIsGeneratingPDF(true);
    try {
      const staffById = new Map(staffs.map((s) => [s.id, s]));

      const rows = payrolls.map((payroll, idx) => {
        const staff = staffById.get(payroll.employee_id);
        const midMonthAmount = Number(payroll.amount) || 0;
        const pinjamAmount = pinjamByEmp[payroll.employee_id] ?? 0;
        const netAmount = midMonthAmount - pinjamAmount;
        return {
          no: idx + 1,
          staff_name: payroll.employee_name,
          icNo: staff?.icNo ?? "",
          midMonthAmount,
          pinjamAmount,
          netAmount,
          total: netAmount,
          payment_preference: payroll.payment_method,
        };
      });

      const totalFinal = rows.reduce((sum, r) => sum + r.netAmount, 0);

      const pdfData: MidMonthPayrollReportPDFData = {
        year: currentYear,
        month: currentMonth,
        data: rows,
        total_records: rows.length,
        summary: { total_final: totalFinal },
      };

      await generateMidMonthPayrollReportPDF(pdfData, action);
      const actionText =
        action === "download" ? "downloaded" : "generated for printing";
      toast.success(`Mid-month payroll report ${actionText} successfully`);
    } catch (error) {
      console.error("Error generating PDF:", error);
      toast.error("Failed to generate PDF");
    } finally {
      setIsGeneratingPDF(false);
    }
  };

  const generateTextExport = async () => {
    const bankPayrolls = payrolls.filter((p) => p.payment_method === "Bank");
    if (bankPayrolls.length === 0) {
      toast.error("No Bank-payment employees available to export");
      return;
    }

    setIsGeneratingExport(true);
    try {
      const staffById = new Map(staffs.map((s) => [s.id, s]));

      const lastDayOfMonth = new Date(currentYear, currentMonth, 0).getDate();
      const paymentDate = `${lastDayOfMonth
        .toString()
        .padStart(2, "0")}/${currentMonth
        .toString()
        .padStart(2, "0")}/${currentYear}`;

      const paymentDateRow = [
        "PAYMENT DATE : (DD/MM/YYYY)",
        paymentDate,
        ...Array(19).fill(""),
      ];

      const headerRow1 = [
        "Payment Type/ Mode : PBB/IBG/REN",
        "Bene Acct No.",
        "BIC",
        "Bene Full Name",
        "ID Type: For Intrabank & IBG NI, OI, BR, PL, ML, PP For Rentas NI, OI, BR, OT",
        "Bene Identification No / Passport",
        "Payment Amount (with 2 decimal points)",
        "Recipient Reference (shown in sender and bene statement)",
        "Other Payment Details (shown in sender and bene statement)",
        "Bene Email 1",
        "Bene Email 2",
        "Bene Mobile No. 1 (charge RM0.20 per number)",
        "Bene Mobile No. 2 (charge RM0.20 per number)",
        "Joint Bene Name",
        "Joint Bene Identification No.",
        "Joint ID Type: For Intrabank & IBG NI, OI, BR, PL, ML, PP For Rentas NI, OI, BR, OT",
        "E-mail Content Line 1 (will be shown in bene email)",
        "E-mail Content Line 2 (will be shown in bene email)",
        "E-mail Content Line 3 (will be shown in bene email)",
        "E-mail Content Line 4 (will be shown in bene email)",
        "E-mail Content Line 5 (will be shown in bene email)",
      ];

      const headerRow2 = [
        "(M) - Char: 3 - A",
        "(M) - Char: 20 - N",
        "(M) - Char: 11 - A",
        "(M) - Char: 120 - A",
        "(M) - Char: 2 - A",
        "(O) - Char: 29 - AN",
        "(M) - Char: 18 - N",
        "(M) - Char: 20 - AN",
        "(O) - Char: 20 - AN",
        "(O) - Char: 70 - AN",
        "(O) - Char: 70 - AN",
        "(O) - Char: 15 - N",
        "(O) - Char: 15 - N",
        "(O) - Char: 120 - A",
        "(O) - Char: 29 - AN",
        "(O) - Char: 2 - A",
        "(O) - Char: 40 - AN",
        "(O) - Char: 40 - AN",
        "(O) - Char: 40 - AN",
        "(O) - Char: 40 - AN",
        "(O) - Char: 40 - AN",
      ];

      const dataRows = bankPayrolls
        .map((payroll) => {
          const gross = Number(payroll.amount) || 0;
          const pinjam = pinjamByEmp[payroll.employee_id] ?? 0;
          const net = gross - pinjam;
          if (net <= 0) return null;

          const staff = staffById.get(payroll.employee_id);
          return [
            "PBB",
            (staff?.bankAccountNumber || "").replace(/-/g, ""),
            "PBBEMYKL",
            (payroll.employee_name || "").replace(/,/g, " "),
            staff?.document || "",
            (staff?.icNo || "").replace(/-/g, ""),
            net.toFixed(2),
            "Mid-Month",
            "",
            "",
            "",
            "",
            "",
            "",
            "",
            "",
            "Content Line 1",
            "Content Line 2",
            "Content Line 3",
            "Content Line 4",
            "Content Line 5",
          ];
        })
        .filter((row): row is string[] => row !== null);

      if (dataRows.length === 0) {
        toast.error("No payable rows after deducting pinjam");
        return;
      }

      const totalAmount = dataRows.reduce(
        (sum, row) => sum + parseFloat(row[6]),
        0
      );

      const totalRow = [
        "TOTAL:",
        "",
        "",
        "",
        "",
        "",
        totalAmount.toFixed(2),
        ...Array(14).fill(""),
      ];

      const allRows = [
        paymentDateRow,
        headerRow1,
        headerRow2,
        ...dataRows,
        totalRow,
      ];

      const textContent = allRows.map((row) => row.join(";")).join("\r\n");
      const blob = new Blob([textContent], {
        type: "text/plain;charset=utf-8",
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `mid-month-payment-export-${currentMonth
        .toString()
        .padStart(2, "0")}-${currentYear}.txt`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      toast.success("Mid-month payment export file downloaded successfully");
    } catch (error) {
      console.error("Error generating text export:", error);
      toast.error("Failed to generate text export");
    } finally {
      setIsGeneratingExport(false);
    }
  };

  const handleEdit = (payroll: MidMonthPayroll) => {
    setEditingPayroll(payroll);
    setShowEditModal(true);
  };

  const handleDeletePayroll = async () => {
    if (!deletingId) return;

    try {
      await deleteMidMonthPayroll(deletingId);
      toast.success("Payroll deleted successfully");
      setShowDeleteDialog(false);
      setDeletingId(null);
      await fetchPayrolls();
    } catch (error) {
      console.error("Error deleting payroll:", error);
      toast.error("Failed to delete payroll");
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-MY", {
      style: "currency",
      currency: "MYR",
    }).format(amount);
  };

  const normalizedSearchQuery: string = searchQuery.trim().toLowerCase();
  const filteredPayrolls: MidMonthPayroll[] = useMemo(
    () =>
      payrolls.filter((payroll: MidMonthPayroll): boolean =>
        !normalizedSearchQuery ||
        payroll.employee_name
          .toLowerCase()
          .includes(normalizedSearchQuery) ||
        payroll.employee_id.toLowerCase().includes(normalizedSearchQuery)
      ),
    [payrolls, normalizedSearchQuery]
  );
  const filteredTotalAmount: number = filteredPayrolls.reduce(
    (sum: number, payroll: MidMonthPayroll): number =>
      sum + (Number(payroll.amount) || 0),
    0
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row justify-between items-center">
        <h1 className="text-xl font-semibold text-default-800 dark:text-gray-100">
          Mid-month Payrolls
        </h1>
        <div className="flex space-x-3 mt-4 md:mt-0">
          <Button
            onClick={fetchPayrolls}
            icon={IconRefresh}
            variant="outline"
            disabled={isLoading}
          >
            Refresh
          </Button>
          <div
            className="relative"
            onMouseEnter={handlePrintDropdownMouseEnter}
            onMouseLeave={handlePrintDropdownMouseLeave}
          >
            <Button
              onClick={() => generatePDF("print")}
              icon={IconPrinter}
              color="green"
              variant="outline"
              disabled={payrolls.length === 0 || isGeneratingPDF}
            >
              Print
            </Button>
            {isPrintDropdownOpen && (
              <div className="absolute right-0 top-full mt-1 z-50">
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-default-200 dark:border-gray-700 py-1 min-w-[140px]">
                  <button
                    onClick={() => {
                      setIsPrintDropdownOpen(false);
                      generatePDF("print");
                    }}
                    disabled={payrolls.length === 0 || isGeneratingPDF}
                    className="w-full px-3 py-2 text-left text-sm text-default-700 dark:text-gray-200 hover:bg-default-100 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Print
                  </button>
                  <button
                    onClick={() => {
                      setIsPrintDropdownOpen(false);
                      generatePDF("download");
                    }}
                    disabled={payrolls.length === 0 || isGeneratingPDF}
                    className="w-full px-3 py-2 text-left text-sm text-default-700 dark:text-gray-200 hover:bg-default-100 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Download PDF
                  </button>
                </div>
              </div>
            )}
          </div>
          <Button
            onClick={generateTextExport}
            icon={IconFileExport}
            color="purple"
            variant="outline"
            disabled={payrolls.length === 0 || isGeneratingExport}
          >
            Export
          </Button>
          <Button
            onClick={() => setShowAddModal(true)}
            icon={IconPlus}
            color="sky"
            variant="filled"
          >
            Add Payroll
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-default-200 dark:border-gray-700 shadow-sm p-4">
        <div className="flex flex-col md:flex-row gap-4 items-end justify-between">
          <div className="flex gap-4 items-end">
            <YearNavigator
              selectedYear={currentYear}
              onChange={setCurrentYear}
              showGoToCurrentButton={false}
            />
            <MonthNavigator
              selectedMonth={selectedMonth}
              onChange={(date) => {
                setCurrentYear(date.getFullYear());
                setCurrentMonth(date.getMonth() + 1);
              }}
              showGoToCurrentButton={false}
            />
          </div>
          <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-end">
            <div className="relative">
              <IconSearch
                size={16}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-default-400 dark:text-gray-500"
              />
              <input
                type="text"
                value={searchQuery}
                onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                  setSearchQuery(event.target.value)
                }
                placeholder="Search employee..."
                className="w-full rounded-lg border border-default-300 bg-white py-1.5 pl-8 pr-8 text-sm text-default-900 shadow-sm placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-sky-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:placeholder:text-gray-500 sm:w-56"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  aria-label="Clear employee search"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-default-400 hover:text-default-600 dark:text-gray-500 dark:hover:text-gray-300"
                >
                  <IconX size={14} />
                </button>
              )}
            </div>
            <div className="text-sm text-default-600 dark:text-gray-300">
              <div className="font-medium">
                Total: {filteredPayrolls.length} employees
              </div>
              <div className="font-medium">
                Amount: {formatCurrency(filteredTotalAmount)}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Payrolls Table */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-default-200 dark:border-gray-700 shadow-sm">
        <div className="px-6 py-4 border-b border-default-200 dark:border-gray-700">
          <h2 className="text-lg font-medium text-default-800 dark:text-gray-100">
            {getMonthName(currentMonth)} {currentYear}
          </h2>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <LoadingSpinner />
          </div>
        ) : payrolls.length === 0 ? (
          <div className="text-center py-12 text-default-500 dark:text-gray-400">
            <IconCash className="mx-auto h-12 w-12 text-default-300 mb-4" />
            <p className="text-lg font-medium">No payrolls found</p>
            <p>Click "Add Payroll" to create mid-month payrolls</p>
          </div>
        ) : filteredPayrolls.length === 0 ? (
          <div className="text-center py-12 text-default-500 dark:text-gray-400">
            <IconSearch className="mx-auto mb-4 h-12 w-12 text-default-300" />
            <p className="text-lg font-medium">No employees match your search</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-default-200 dark:divide-gray-700">
              <thead className="bg-default-50 dark:bg-gray-900/50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-default-500 dark:text-gray-400 uppercase tracking-wider">
                    Employee ID
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-default-500 dark:text-gray-400 uppercase tracking-wider">
                    Name
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-default-500 dark:text-gray-400 uppercase tracking-wider">
                    Amount
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-default-500 dark:text-gray-400 uppercase tracking-wider">
                    Payment Method
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-default-500 dark:text-gray-400 uppercase tracking-wider">
                    Created
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-default-500 dark:text-gray-400 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-800 divide-y divide-default-200 dark:divide-gray-700">
                {filteredPayrolls.map((payroll: MidMonthPayroll) => (
                  <tr key={payroll.id} className="hover:bg-default-50 dark:hover:bg-gray-700">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-default-900 dark:text-gray-100">
                      {payroll.employee_id}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-default-900 dark:text-gray-100">
                      {payroll.employee_name}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium text-default-900 dark:text-gray-100">
                      {formatCurrency(payroll.amount)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-default-900 dark:text-gray-100">
                      {payroll.payment_method}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-default-500 dark:text-gray-400">
                      {format(new Date(payroll.created_at), "dd MMM yyyy")}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <div className="flex items-center justify-end space-x-3">
                        <button
                          onClick={() => handleEdit(payroll)}
                          className="text-sky-600 dark:text-sky-400 hover:text-sky-800 dark:hover:text-sky-300"
                          title="Edit"
                        >
                          <IconEdit size={18} />
                        </button>
                        <button
                          onClick={() => {
                            setDeletingId(payroll.id);
                            setShowDeleteDialog(true);
                          }}
                          className="text-rose-600 dark:text-rose-400 hover:text-rose-800 dark:hover:text-rose-300"
                          title="Delete"
                        >
                          <IconTrash size={18} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modals */}
      <AddMidMonthPayrollModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSuccess={fetchPayrolls}
        currentYear={currentYear}
        currentMonth={currentMonth}
      />

      <EditMidMonthPayrollModal
        isOpen={showEditModal}
        onClose={() => {
          setShowEditModal(false);
          setEditingPayroll(null);
        }}
        onSuccess={fetchPayrolls}
        payroll={editingPayroll}
      />

      {/* Delete Confirmation Dialog */}
      <ConfirmationDialog
        isOpen={showDeleteDialog}
        onClose={() => {
          setShowDeleteDialog(false);
          setDeletingId(null);
        }}
        onConfirm={handleDeletePayroll}
        title="Delete Mid-month Payroll"
        message="Are you sure you want to delete this mid-month payroll? This action cannot be undone."
        confirmButtonText="Delete"
        variant="danger"
      />
    </div>
  );
};

export default MidMonthPayrollPage;
