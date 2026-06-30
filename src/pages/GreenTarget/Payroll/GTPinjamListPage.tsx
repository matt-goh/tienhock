// src/pages/GreenTarget/Payroll/GTPinjamListPage.tsx
// Green Target pinjam entry page. Same flow as the Tien Hock Pinjam System page
// but scoped to GT payroll employees and the greentarget.pinjam_records table.
import React, { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  IconPlus,
  IconEdit,
  IconTrash,
  IconCash,
  IconRefresh,
  IconPrinter,
  IconDownload,
} from "@tabler/icons-react";
import Button from "../../../components/Button";
import LoadingSpinner from "../../../components/LoadingSpinner";
import ConfirmationDialog from "../../../components/ConfirmationDialog";
import PinjamFormModal from "../../../components/Payroll/PinjamFormModal";
import { api } from "../../../routes/utils/api";
import TimeNavigator from "../../../components/TimeNavigator";
import {
  generatePinjamPDF,
  PinjamPDFData,
} from "../../../utils/payroll/PinjamPDF";
import toast from "react-hot-toast";

interface PinjamRecord {
  id: number;
  employee_id: string;
  employee_name: string;
  year: number;
  month: number;
  amount: number;
  description: string;
  pinjam_type: "mid_month" | "monthly";
  created_by: string;
  created_at: string;
  updated_at: string | null;
}

interface MidMonthPayroll {
  employee_id: string;
  employee_name: string;
  amount: number;
}

interface EmployeePayrollSummary {
  employee_payroll_id?: number;
  employee_id: string;
  employee_name: string;
  net_pay: number;
  setelah_digenapkan?: number;
}

interface PinjamSummary {
  employee_id: string;
  employee_name: string;
  mid_month: {
    total_amount: number;
    details: string[];
    record_count: number;
  };
  monthly: {
    total_amount: number;
    details: string[];
    record_count: number;
  };
}

interface GTPayrollEmployee {
  employee_id: string;
  employee_name: string;
  job_type: string;
}

interface EmployeePinjamData {
  employee_payroll_id?: number;
  employee_id: string;
  employee_name: string;
  midMonthPay: number;
  netPay: number;
  setelahDigenapkan?: number;
  midMonthPinjam: number;
  midMonthPinjamDetails: string[];
  monthlyPinjam: number;
  monthlyPinjamDetails: string[];
  gajiGenap: number;
}

// Default to the previous month during the first week (1st-7th), else current month
const getDefaultPinjamMonth = (
  today: Date = new Date()
): { year: number; month: number } => {
  const monthOffset = today.getDate() <= 7 ? -1 : 0;
  const d = new Date(today.getFullYear(), today.getMonth() + monthOffset, 1);
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
};

const GTPinjamListPage: React.FC = () => {
  const navigate = useNavigate();

  // State
  const [pinjamRecords, setPinjamRecords] = useState<PinjamRecord[]>([]);
  const [pinjamSummary, setPinjamSummary] = useState<PinjamSummary[]>([]);
  const [midMonthPayrolls, setMidMonthPayrolls] = useState<MidMonthPayroll[]>(
    []
  );
  const [employeePayrolls, setEmployeePayrolls] = useState<
    EmployeePayrollSummary[]
  >([]);
  const [gtEmployees, setGtEmployees] = useState<GTPayrollEmployee[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingRecord, setEditingRecord] = useState<PinjamRecord | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  // Filters
  const [currentYear, setCurrentYear] = useState(
    () => getDefaultPinjamMonth().year
  );
  const [currentMonth, setCurrentMonth] = useState(
    () => getDefaultPinjamMonth().month
  );

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

  // Load data on mount and filter changes
  useEffect(() => {
    fetchAllData();
  }, [currentYear, currentMonth]);

  const fetchAllData = async () => {
    setIsLoading(true);
    try {
      const [dashboard, employees] = await Promise.all([
        api.get(
          `/greentarget/api/pinjam-records/dashboard?year=${currentYear}&month=${currentMonth}`
        ),
        api.get("/greentarget/api/payroll-employees"),
      ]);

      setPinjamRecords(dashboard.pinjamRecords || []);
      setPinjamSummary(dashboard.pinjamSummary || []);
      setMidMonthPayrolls(dashboard.midMonthPayrolls || []);
      setEmployeePayrolls(dashboard.employeePayrolls || []);
      setGtEmployees(employees || []);
    } catch (error) {
      console.error("Error fetching GT pinjam data:", error);
      toast.error("Failed to load pinjam data");
    } finally {
      setIsLoading(false);
    }
  };

  const handleEdit = (record: PinjamRecord) => {
    setEditingRecord(record);
    setShowAddModal(true);
  };

  const handleDeleteRecord = async () => {
    if (!deletingId) return;

    try {
      await api.delete(`/greentarget/api/pinjam-records/${deletingId}`);
      toast.success("Pinjam record deleted successfully");
      setShowDeleteDialog(false);
      setDeletingId(null);
      await fetchAllData();
    } catch (error) {
      console.error("Error deleting GT pinjam record:", error);
      toast.error("Failed to delete pinjam record");
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-MY", {
      style: "currency",
      currency: "MYR",
    }).format(amount);
  };

  const handleModalClose = () => {
    setShowAddModal(false);
    setEditingRecord(null);
  };

  const handleModalSuccess = () => {
    fetchAllData();
    handleModalClose();
  };

  // GT payroll employees for the pinjam form combobox
  const gtEmployeeOptions = useMemo(
    () =>
      gtEmployees.map((emp) => ({
        id: emp.employee_id,
        name: `${emp.employee_name} (${emp.employee_id})`,
      })),
    [gtEmployees]
  );

  const employeeData = useMemo<EmployeePinjamData[]>(() => {
    return pinjamSummary
      .map((summary) => {
        const midMonthRecord = midMonthPayrolls.find(
          (p) => p.employee_id === summary.employee_id
        );
        const payrollRecord = employeePayrolls.find(
          (p) => p.employee_id === summary.employee_id
        );

        const midMonthPay = Number(midMonthRecord?.amount) || 0;
        const netPay = payrollRecord?.net_pay || 0;
        const setelahDigenapkan = payrollRecord?.setelah_digenapkan;

        return {
          employee_payroll_id: payrollRecord?.employee_payroll_id,
          employee_id: summary.employee_id,
          employee_name: summary.employee_name,
          midMonthPay,
          netPay,
          setelahDigenapkan,
          midMonthPinjam: summary.mid_month.total_amount || 0,
          midMonthPinjamDetails: summary.mid_month.details || [],
          monthlyPinjam: summary.monthly.total_amount || 0,
          monthlyPinjamDetails: summary.monthly.details || [],
          gajiGenap: setelahDigenapkan ?? Math.ceil(netPay - midMonthPay),
        };
      })
      .sort((a, b) => a.employee_name.localeCompare(b.employee_name));
  }, [midMonthPayrolls, pinjamSummary, employeePayrolls]);

  // Calculate totals
  const totalMidMonthPinjam = employeeData.reduce(
    (sum, emp) => sum + emp.midMonthPinjam,
    0
  );
  const totalMonthlyPinjam = employeeData.reduce(
    (sum, emp) => sum + emp.monthlyPinjam,
    0
  );

  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);

  const generatePinjamPDFForAll = async (action: "download" | "print") => {
    if (employeeData.length === 0) {
      toast.error("No pinjam data to generate");
      return;
    }
    setIsGeneratingPDF(true);
    try {
      const pdfData: PinjamPDFData = {
        employees: employeeData.map((emp) => ({
          employee_id: emp.employee_id,
          employee_name: emp.employee_name,
          midMonthPay: emp.midMonthPay,
          netPay: emp.netPay,
          midMonthPinjam: emp.midMonthPinjam,
          midMonthPinjamDetails: emp.midMonthPinjamDetails,
          monthlyPinjam: emp.monthlyPinjam,
          monthlyPinjamDetails: emp.monthlyPinjamDetails,
          gajiGenap: emp.gajiGenap,
        })),
        year: currentYear,
        month: currentMonth,
        totalMidMonthPinjam,
        totalMonthlyPinjam,
        companyName: "GREEN TARGET SDN. BHD.",
      };
      await generatePinjamPDF(pdfData, action);
      toast.success(
        `Pinjam summary ${action === "download" ? "downloaded" : "generated"}`
      );
    } catch (error) {
      console.error("Error generating pinjam PDF:", error);
      toast.error("Failed to generate PDF");
    } finally {
      setIsGeneratingPDF(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-default-200 dark:border-gray-700 shadow-sm p-4">
        <div className="flex flex-col md:flex-row gap-4 items-end justify-between">
          <div className="flex gap-4 items-end">
            <h1 className="text-xl font-semibold text-default-800 dark:text-gray-100 self-center">
              Pinjam (Green Target)
            </h1>
            <div className="self-center h-8 border-l border-default-300 dark:border-gray-600" />
            <TimeNavigator
              range={monthRange}
              onChange={handleTimeNavigatorChange}
              modes={["month"]}
              presets={false}
            />
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 whitespace-nowrap">
              <span className="text-sm font-medium text-default-700 dark:text-gray-200">
                Total Pinjam:
              </span>
              <span className="font-semibold text-lg text-default-800 dark:text-gray-100">
                {formatCurrency(totalMidMonthPinjam + totalMonthlyPinjam)}
              </span>
            </div>
            <Button
              onClick={() => generatePinjamPDFForAll("print")}
              icon={IconPrinter}
              variant="outline"
              disabled={isGeneratingPDF || employeeData.length === 0}
              title="Print Pinjam summary"
            >
              Print
            </Button>
            <Button
              onClick={() => generatePinjamPDFForAll("download")}
              icon={IconDownload}
              variant="outline"
              disabled={isGeneratingPDF || employeeData.length === 0}
              title="Download Pinjam summary PDF"
            >
              Download
            </Button>
            <Button
              onClick={fetchAllData}
              icon={IconRefresh}
              variant="outline"
              disabled={isLoading}
            >
              Refresh
            </Button>
            <Button
              onClick={() => setShowAddModal(true)}
              icon={IconPlus}
              color="sky"
              variant="filled"
            >
              Record Pinjam
            </Button>
          </div>
        </div>
      </div>

      {/* Employee Summary Cards */}
      {employeeData.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-default-200 dark:border-gray-700 shadow-sm text-center py-12 text-default-500 dark:text-gray-400">
          <IconCash className="mx-auto h-12 w-12 text-default-300 mb-4" />
          <p className="text-lg font-medium">No pinjam records found</p>
          <p>Click "Record Pinjam" to add pinjam for GT employees</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {employeeData.map((emp) => (
            <div
              key={emp.employee_id}
              className={`bg-white dark:bg-gray-800 rounded-lg border border-default-200 dark:border-gray-700 shadow-sm p-4 ${
                emp.employee_payroll_id
                  ? "cursor-pointer hover:border-sky-300 dark:hover:border-sky-700"
                  : ""
              }`}
              onClick={() => {
                if (emp.employee_payroll_id) {
                  navigate(
                    `/greentarget/payroll/details/${emp.employee_payroll_id}`
                  );
                }
              }}
            >
              <div className="flex justify-between items-start mb-3">
                <div>
                  <p className="font-medium text-default-800 dark:text-gray-100">
                    {emp.employee_name}
                  </p>
                  <p className="text-xs text-default-400 dark:text-gray-500">
                    {emp.employee_id}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-default-500 dark:text-gray-400">
                    Gaji Genap
                  </p>
                  <p className="font-semibold text-default-800 dark:text-gray-100">
                    {formatCurrency(emp.gajiGenap)}
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="bg-blue-50 dark:bg-blue-900/20 rounded p-2">
                  <p className="text-xs font-medium text-blue-700 dark:text-blue-300 mb-1">
                    Mid-Month Pinjam
                  </p>
                  <p className="font-semibold text-blue-800 dark:text-blue-200">
                    {formatCurrency(emp.midMonthPinjam)}
                  </p>
                  {emp.midMonthPinjamDetails.length > 0 && (
                    <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                      {emp.midMonthPinjamDetails.join(", ")}
                    </p>
                  )}
                </div>
                <div className="bg-green-50 dark:bg-green-900/20 rounded p-2">
                  <p className="text-xs font-medium text-green-700 dark:text-green-300 mb-1">
                    Monthly Pinjam
                  </p>
                  <p className="font-semibold text-green-800 dark:text-green-200">
                    {formatCurrency(emp.monthlyPinjam)}
                  </p>
                  {emp.monthlyPinjamDetails.length > 0 && (
                    <p className="text-xs text-green-600 dark:text-green-400 mt-1">
                      {emp.monthlyPinjamDetails.join(", ")}
                    </p>
                  )}
                </div>
              </div>
              <div className="mt-3 pt-2 border-t border-default-100 dark:border-gray-700 flex justify-between items-center text-sm">
                <span className="text-default-500 dark:text-gray-400">
                  Final Pay (after monthly pinjam)
                </span>
                <span
                  className={`font-semibold ${
                    emp.gajiGenap - emp.monthlyPinjam < 0
                      ? "text-rose-600 dark:text-rose-400"
                      : "text-emerald-600 dark:text-emerald-400"
                  }`}
                >
                  {formatCurrency(emp.gajiGenap - emp.monthlyPinjam)}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Records Table */}
      {pinjamRecords.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-default-200 dark:border-gray-700 shadow-sm">
          <div className="px-6 py-4 border-b border-default-200 dark:border-gray-700">
            <h2 className="text-lg font-medium text-default-800 dark:text-gray-100">
              Pinjam Records
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-default-200 dark:divide-gray-700">
              <thead className="bg-default-50 dark:bg-gray-900/50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-default-500 dark:text-gray-400 uppercase tracking-wider">
                    Employee
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-default-500 dark:text-gray-400 uppercase tracking-wider">
                    Description
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-default-500 dark:text-gray-400 uppercase tracking-wider">
                    Type
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-default-500 dark:text-gray-400 uppercase tracking-wider">
                    Amount
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-default-500 dark:text-gray-400 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-800 divide-y divide-default-200 dark:divide-gray-700">
                {pinjamRecords.map((record) => (
                  <tr
                    key={record.id}
                    className="hover:bg-default-50 dark:hover:bg-gray-700"
                  >
                    <td className="px-6 py-3 whitespace-nowrap text-sm font-medium text-default-900 dark:text-gray-100">
                      {record.employee_name}
                      <span className="ml-2 text-xs text-default-400 dark:text-gray-500">
                        {record.employee_id}
                      </span>
                    </td>
                    <td className="px-6 py-3 whitespace-nowrap text-sm text-default-700 dark:text-gray-300">
                      {record.description}
                    </td>
                    <td className="px-6 py-3 whitespace-nowrap text-sm">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                          record.pinjam_type === "mid_month"
                            ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                            : "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300"
                        }`}
                      >
                        {record.pinjam_type === "mid_month"
                          ? "Mid-Month"
                          : "Monthly"}
                      </span>
                    </td>
                    <td className="px-6 py-3 whitespace-nowrap text-right text-sm font-medium text-default-900 dark:text-gray-100">
                      {formatCurrency(record.amount)}
                    </td>
                    <td className="px-6 py-3 whitespace-nowrap text-right">
                      <div className="flex items-center justify-end space-x-3">
                        <button
                          onClick={() => handleEdit(record)}
                          className="text-sky-600 dark:text-sky-400 hover:text-sky-800 dark:hover:text-sky-300"
                          title="Edit"
                        >
                          <IconEdit size={18} />
                        </button>
                        <button
                          onClick={() => {
                            setDeletingId(record.id);
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
        </div>
      )}

      {/* Add/Edit Pinjam Modal */}
      <PinjamFormModal
        isOpen={showAddModal}
        onClose={handleModalClose}
        onSuccess={handleModalSuccess}
        currentYear={currentYear}
        currentMonth={currentMonth}
        editingRecord={editingRecord}
        apiBasePath="/greentarget/api/pinjam-records"
        employeeOptions={gtEmployeeOptions}
      />

      {/* Delete Confirmation Dialog */}
      <ConfirmationDialog
        isOpen={showDeleteDialog}
        onClose={() => {
          setShowDeleteDialog(false);
          setDeletingId(null);
        }}
        onConfirm={handleDeleteRecord}
        title="Delete Pinjam Record"
        message="Are you sure you want to delete this pinjam record? This action cannot be undone."
        confirmButtonText="Delete"
        variant="danger"
      />
    </div>
  );
};

export default GTPinjamListPage;
