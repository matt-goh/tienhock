// src/pages/GreenTarget/Payroll/GTMidMonthPayrollPage.tsx
// Green Target mid-month advance entry page. Same flow as the Tien Hock
// Mid-month Payrolls page but scoped to GT payroll employees and the
// greentarget.mid_month_payrolls table.
import React, { useState, useEffect, useMemo, Fragment } from "react";
import { format } from "date-fns";
import {
  Dialog,
  DialogPanel,
  DialogTitle,
  Transition,
  TransitionChild,
} from "@headlessui/react";
import {
  IconPlus,
  IconEdit,
  IconTrash,
  IconCash,
  IconRefresh,
  IconPrinter,
  IconDownload,
  IconFileText,
} from "@tabler/icons-react";
import Button from "../../../components/Button";
import LoadingSpinner from "../../../components/LoadingSpinner";
import ConfirmationDialog from "../../../components/ConfirmationDialog";
import {
  FormCombobox,
  FormInput,
  FormListbox,
} from "../../../components/FormComponents";
import TimeNavigator from "../../../components/TimeNavigator";
import { api } from "../../../routes/utils/api";
import { getMonthName } from "../../../utils/payroll/payrollUtils";
import { useStaffsCache } from "../../../utils/catalogue/useStaffsCache";
import {
  generateMidMonthPayrollReportPDF,
  MidMonthPayrollReportPDFData,
} from "../../../utils/payroll/MidMonthPayrollReportPDF";
import toast from "react-hot-toast";

const GT_COMPANY_NAME = "GREEN TARGET SDN. BHD.";

interface GTMidMonthPayroll {
  id: number;
  employee_id: string;
  employee_name: string;
  year: number;
  month: number;
  amount: number;
  payment_method: "Cash" | "Bank" | "Cheque";
  status: "Pending" | "Paid" | "Cancelled";
  created_at: string;
}

interface GTPayrollEmployee {
  employee_id: string;
  employee_name: string;
  job_type: string;
}

const PAYMENT_METHOD_OPTIONS = [
  { id: "Cash", name: "Cash" },
  { id: "Bank", name: "Bank" },
  { id: "Cheque", name: "Cheque" },
];

interface GTMidMonthPayrollModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  currentYear: number;
  currentMonth: number;
  employees: GTPayrollEmployee[];
  editingPayroll: GTMidMonthPayroll | null;
}

const GTMidMonthPayrollModal: React.FC<GTMidMonthPayrollModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  currentYear,
  currentMonth,
  employees,
  editingPayroll,
}) => {
  const [employeeId, setEmployeeId] = useState<string>("");
  const [amount, setAmount] = useState<number>(500);
  const [paymentMethod, setPaymentMethod] = useState<
    "Cash" | "Bank" | "Cheque"
  >("Cash");
  const [isSaving, setIsSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // Pre-fill when editing
  useEffect(() => {
    if (isOpen && editingPayroll) {
      setEmployeeId(editingPayroll.employee_id);
      setAmount(editingPayroll.amount);
      setPaymentMethod(editingPayroll.payment_method);
    } else if (isOpen) {
      setEmployeeId("");
      setAmount(500);
      setPaymentMethod("Cash");
      setSearchQuery("");
    }
  }, [isOpen, editingPayroll]);

  const employeeOptions = useMemo(
    () =>
      employees.map((emp) => ({
        id: emp.employee_id,
        name: `${emp.employee_name} (${emp.employee_id})`,
      })),
    [employees]
  );

  const handleSubmit = async () => {
    if (!editingPayroll && !employeeId) {
      toast.error("Please select an employee");
      return;
    }
    if (amount <= 0) {
      toast.error("Amount must be greater than 0");
      return;
    }

    setIsSaving(true);
    try {
      if (editingPayroll) {
        await api.put(
          `/greentarget/api/mid-month-payrolls/${editingPayroll.id}`,
          { amount, payment_method: paymentMethod }
        );
        toast.success("Mid-month payroll updated successfully");
      } else {
        await api.post("/greentarget/api/mid-month-payrolls", {
          employee_id: employeeId,
          year: currentYear,
          month: currentMonth,
          amount,
          payment_method: paymentMethod,
        });
        toast.success("Mid-month payroll created successfully");
      }
      onSuccess();
      onClose();
    } catch (error: any) {
      console.error("Error saving GT mid-month payroll:", error);
      if (error.response?.status === 409 || error?.status === 409) {
        toast.error(
          "This employee already has a mid-month payroll for this month"
        );
      } else {
        toast.error("Failed to save mid-month payroll. Please try again.");
      }
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={onClose}>
        <TransitionChild
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div
            className="fixed inset-0 bg-black/50 dark:bg-black/70"
            aria-hidden="true"
          />
        </TransitionChild>

        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            <TransitionChild
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <DialogPanel className="w-full max-w-md transform rounded-2xl bg-white dark:bg-gray-800 p-6 shadow-xl transition-all">
                <DialogTitle
                  as="h3"
                  className="text-lg font-medium leading-6 text-default-800 dark:text-gray-100 mb-4"
                >
                  {editingPayroll ? "Edit" : "Add"} Mid-month Payroll -{" "}
                  {getMonthName(currentMonth)} {currentYear}
                </DialogTitle>

                <div className="space-y-4">
                  {/* Employee Selection (locked when editing) */}
                  {editingPayroll ? (
                    <div className="text-sm text-default-700 dark:text-gray-200">
                      <span className="font-medium">Employee:</span>{" "}
                      {editingPayroll.employee_name} (
                      {editingPayroll.employee_id})
                    </div>
                  ) : (
                    <FormCombobox
                      name="employee"
                      label="Select Employee"
                      value={employeeId}
                      onChange={(value) => setEmployeeId(value as string)}
                      options={employeeOptions}
                      query={searchQuery}
                      setQuery={setSearchQuery}
                      placeholder="Search for employee..."
                      mode="single"
                    />
                  )}

                  {/* Amount */}
                  <FormInput
                    name="amount"
                    label="Amount (RM)"
                    type="number"
                    value={amount}
                    onChange={(e) => setAmount(Number(e.target.value))}
                    min={0}
                    step={1}
                    required
                  />

                  {/* Payment Method */}
                  <FormListbox
                    name="paymentMethod"
                    label="Payment Method"
                    value={paymentMethod}
                    onChange={(value) =>
                      setPaymentMethod(value as "Cash" | "Bank" | "Cheque")
                    }
                    options={PAYMENT_METHOD_OPTIONS}
                  />
                </div>

                {/* Modal Actions */}
                <div className="flex justify-end space-x-3 mt-6">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={onClose}
                    disabled={isSaving}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    color="sky"
                    variant="filled"
                    onClick={handleSubmit}
                    disabled={
                      isSaving ||
                      (!editingPayroll && !employeeId) ||
                      amount <= 0
                    }
                  >
                    {isSaving
                      ? "Saving..."
                      : editingPayroll
                      ? "Update Payroll"
                      : "Create Payroll"}
                  </Button>
                </div>
              </DialogPanel>
            </TransitionChild>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
};

const GTMidMonthPayrollPage: React.FC = () => {
  // State
  const [payrolls, setPayrolls] = useState<GTMidMonthPayroll[]>([]);
  const [gtEmployees, setGtEmployees] = useState<GTPayrollEmployee[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingPayroll, setEditingPayroll] =
    useState<GTMidMonthPayroll | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [pinjamByEmp, setPinjamByEmp] = useState<Record<string, number>>({});
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
  const [isGeneratingExport, setIsGeneratingExport] = useState(false);
  const { staffs } = useStaffsCache();

  // Filters
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth() + 1);

  // Month range for the TimeNavigator (the page always targets one month).
  const monthRange = useMemo(
    () => ({
      start: new Date(currentYear, currentMonth - 1, 1),
      end: new Date(currentYear, currentMonth, 0, 23, 59, 59, 999),
    }),
    [currentYear, currentMonth]
  );

  const handleTimeNavigatorChange = (range: { start: Date; end: Date }) => {
    setCurrentYear(range.start.getFullYear());
    setCurrentMonth(range.start.getMonth() + 1);
  };

  // Load payrolls on mount and filter changes
  useEffect(() => {
    fetchPayrolls();
  }, [currentYear, currentMonth]);

  const fetchPayrolls = async () => {
    setIsLoading(true);
    try {
      const [payrollsResponse, pinjamSummary, employees] = await Promise.all([
        api.get(
          `/greentarget/api/mid-month-payrolls?year=${currentYear}&month=${currentMonth}&limit=100`
        ),
        api.get(
          `/greentarget/api/pinjam-records/summary?year=${currentYear}&month=${currentMonth}`
        ),
        api.get("/greentarget/api/payroll-employees"),
      ]);
      setPayrolls(
        (payrollsResponse.payrolls || []).map((p: any) => ({
          ...p,
          amount: parseFloat(p.amount),
        }))
      );
      setGtEmployees(employees || []);

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
      console.error("Error fetching GT mid-month payrolls:", error);
      toast.error("Failed to load mid-month payrolls");
    } finally {
      setIsLoading(false);
    }
  };

  const handleEdit = (payroll: GTMidMonthPayroll) => {
    setEditingPayroll(payroll);
    setShowModal(true);
  };

  const handleDeletePayroll = async () => {
    if (!deletingId) return;

    try {
      await api.delete(`/greentarget/api/mid-month-payrolls/${deletingId}`);
      toast.success("Payroll deleted successfully");
      setShowDeleteDialog(false);
      setDeletingId(null);
      await fetchPayrolls();
    } catch (error) {
      console.error("Error deleting GT mid-month payroll:", error);
      toast.error("Failed to delete payroll");
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-MY", {
      style: "currency",
      currency: "MYR",
    }).format(amount);
  };

  // Calculate total amount
  const totalAmount = payrolls.reduce(
    (sum, payroll) => sum + (Number(payroll.amount) || 0),
    0
  );

  // Mid-month report PDF (mirrors Tien Hock; net = advance - mid-month pinjam)
  const generatePDF = async (action: "download" | "print") => {
    if (payrolls.length === 0) {
      toast.error("No mid-month payrolls to report");
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
        companyName: GT_COMPANY_NAME,
      };
      await generateMidMonthPayrollReportPDF(pdfData, action);
      toast.success(
        `Mid-month payroll report ${
          action === "download" ? "downloaded" : "generated for printing"
        }`
      );
    } catch (error) {
      console.error("Error generating GT mid-month PDF:", error);
      toast.error("Failed to generate PDF");
    } finally {
      setIsGeneratingPDF(false);
    }
  };

  // Public Bank (PBB/IBG) .txt bank file — only Bank-payment employees.
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

      // GT employees are single-ID — one bank line per payroll, net of pinjam.
      const dataRows = bankPayrolls
        .map((payroll) => {
          const staff = staffById.get(payroll.employee_id);
          const gross = Number(payroll.amount) || 0;
          const pinjam = pinjamByEmp[payroll.employee_id] ?? 0;
          const net = gross - pinjam;
          return { staff, fallbackName: payroll.employee_name, net };
        })
        .filter((row) => row.net > 0)
        .map((row) => [
          "PBB",
          (row.staff?.bankAccountNumber || "").replace(/-/g, ""),
          "PBBEMYKL",
          (row.staff?.name || row.fallbackName || "").replace(/,/g, " "),
          row.staff?.document || "",
          (row.staff?.icNo || "").replace(/-/g, ""),
          row.net.toFixed(2),
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
        ]);

      if (dataRows.length === 0) {
        toast.error("No payable rows after deducting pinjam");
        return;
      }

      const totalExport = dataRows.reduce(
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
        totalExport.toFixed(2),
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
      link.download = `gt-mid-month-payment-export-${currentMonth
        .toString()
        .padStart(2, "0")}-${currentYear}.txt`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      toast.success("Bank file exported");
    } catch (error) {
      console.error("Error generating GT bank export:", error);
      toast.error("Failed to generate bank file");
    } finally {
      setIsGeneratingExport(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row justify-between items-center">
        <h1 className="text-xl font-semibold text-default-800 dark:text-gray-100">
          Mid-month Payrolls (Green Target)
        </h1>
        <div className="flex space-x-3 mt-4 md:mt-0">
          <Button
            onClick={() => generatePDF("print")}
            icon={IconPrinter}
            variant="outline"
            disabled={isGeneratingPDF || payrolls.length === 0}
            title="Print mid-month report"
          >
            Print
          </Button>
          <Button
            onClick={() => generatePDF("download")}
            icon={IconDownload}
            variant="outline"
            disabled={isGeneratingPDF || payrolls.length === 0}
            title="Download mid-month report PDF"
          >
            Download
          </Button>
          <Button
            onClick={generateTextExport}
            icon={IconFileText}
            variant="outline"
            disabled={isGeneratingExport || payrolls.length === 0}
            title="Export Public Bank IBG file (Bank-payment employees)"
          >
            Bank File
          </Button>
          <Button
            onClick={fetchPayrolls}
            icon={IconRefresh}
            variant="outline"
            disabled={isLoading}
          >
            Refresh
          </Button>
          <Button
            onClick={() => {
              setEditingPayroll(null);
              setShowModal(true);
            }}
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
            <TimeNavigator
              range={monthRange}
              onChange={handleTimeNavigatorChange}
              modes={["month"]}
              presets={false}
            />
          </div>
          <div className="text-sm text-default-600 dark:text-gray-300">
            <div className="font-medium">
              Total: {payrolls.length} employees
            </div>
            <div className="font-medium">
              Amount: {formatCurrency(totalAmount)}
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
                  <th className="px-6 py-3 text-right text-xs font-medium text-default-500 dark:text-gray-400 uppercase tracking-wider">
                    Mid-Month Pinjam
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
                {payrolls.map((payroll) => (
                  <tr
                    key={payroll.id}
                    className="hover:bg-default-50 dark:hover:bg-gray-700"
                  >
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-default-900 dark:text-gray-100">
                      {payroll.employee_id}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-default-900 dark:text-gray-100">
                      {payroll.employee_name}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium text-default-900 dark:text-gray-100">
                      {formatCurrency(payroll.amount)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-default-600 dark:text-gray-300">
                      {pinjamByEmp[payroll.employee_id]
                        ? formatCurrency(pinjamByEmp[payroll.employee_id])
                        : "-"}
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

      {/* Add/Edit Modal */}
      <GTMidMonthPayrollModal
        isOpen={showModal}
        onClose={() => {
          setShowModal(false);
          setEditingPayroll(null);
        }}
        onSuccess={fetchPayrolls}
        currentYear={currentYear}
        currentMonth={currentMonth}
        employees={gtEmployees}
        editingPayroll={editingPayroll}
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

export default GTMidMonthPayrollPage;
