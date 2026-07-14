// src/pages/GreenTarget/Payroll/GTCutiReportPage.tsx
// Green Target leave (cuti) report — ported from JPCutiReportPage. Staff are the
// GT payroll-employee subset of public.staffs; balances/records come from the GT
// leave-management route (greentarget.leave_records ledger).
import React, { useState, useMemo, useEffect } from "react";
import { useStaffsCache } from "../../../utils/catalogue/useStaffsCache";
import {
  getGroupedStaffIdsByEmployeeId,
  groupStaffsByName,
} from "../../../utils/payroll/groupStaffsByName";
import { FormCombobox } from "../../../components/FormComponents";
import { Employee } from "../../../types/types";
import {
  IconCalendar,
  IconBriefcase,
  IconUserCircle,
  IconClockHour4,
  IconAlertCircle,
  IconId,
  IconWorld,
  IconSearch,
  IconPrinter,
} from "@tabler/icons-react";
import LoadingSpinner from "../../../components/LoadingSpinner";
import Button from "../../../components/Button";
import { getMonthName } from "../../../utils/payroll/payrollUtils";
import { api } from "../../../routes/utils/api";
import { calculateYearsOfService } from "../../../utils/payroll/leaveCalculationService";
import {
  generateSingleCutiReportPDF,
  generateBatchCutiReportPDF,
  CutiReportData,
  CutiBatchReportData,
} from "../../../utils/payroll/CutiReportPDF";
import toast from "react-hot-toast";

// --- Types for API Data ---
interface LeaveBalance {
  id: number;
  employee_id: string;
  year: number;
  cuti_umum_total: number;
  cuti_tahunan_total: number;
  cuti_sakit_total: number;
  cuti_rawatan_total: number;
}

interface LeaveTaken {
  cuti_umum?: number;
  cuti_sakit?: number;
  cuti_tahunan?: number;
  cuti_rawatan?: number;
}

interface LeaveRecord {
  id: number;
  employee_id: string;
  leave_date: string;
  leave_type: "cuti_umum" | "cuti_sakit" | "cuti_tahunan" | "cuti_rawatan";
  days_taken: number;
  amount_paid: number;
}

// --- Employee Card Component ---
interface EmployeeCardProps {
  employee: Employee;
  groupedIds: string[];
  onClick: (employee: Employee) => void;
}

const EmployeeCard: React.FC<EmployeeCardProps> = ({
  employee,
  groupedIds,
  onClick,
}) => {
  const jobDisplay = Array.isArray(employee.job)
    ? employee.job.join(", ")
    : employee.job || "N/A";
  const hasCollapsedIds: boolean = groupedIds.length > 1;
  const groupedIdsText: string = groupedIds.join(", ");

  return (
    <button
      onClick={() => onClick(employee)}
      className="block w-full p-4 border border-default-200 dark:border-gray-700 rounded-lg shadow-sm hover:shadow-md hover:border-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-opacity-50 text-left bg-white dark:bg-gray-800 h-full min-h-[116px]"
    >
      <h3
        className="text-base font-semibold text-default-800 dark:text-gray-100 truncate mb-1"
        title={employee.name}
      >
        {employee.name}
      </h3>
      <p className="text-xs text-default-500 dark:text-gray-400 uppercase mb-2">
        ID: {employee.id}
      </p>
      {hasCollapsedIds && (
        <p
          className="text-xs text-sky-600 dark:text-sky-400 mb-2 line-clamp-2"
          title={groupedIdsText}
        >
          Collapsed IDs: {groupedIdsText}
        </p>
      )}
      <p className="text-sm text-default-600 dark:text-gray-300 line-clamp-2" title={jobDisplay}>
        <span className="font-medium">Job:</span> {jobDisplay}
      </p>
    </button>
  );
};

const GTCutiReportPage: React.FC = () => {
  const { staffs: allStaffs, loading: loadingStaffs } = useStaffsCache();
  const [selectedStaffId, setSelectedStaffId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [currentYear] = useState(new Date().getFullYear());

  // GT payroll-employee ids (OFFICE + DRIVER). The report is scoped to these.
  const [gtEmployeeIds, setGtEmployeeIds] = useState<Set<string>>(new Set());
  const [loadingGtEmployees, setLoadingGtEmployees] = useState(true);

  // State for API data
  const [loadingReport, setLoadingReport] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);
  const [leaveBalances, setLeaveBalances] = useState<LeaveBalance | null>(null);
  const [leaveTaken, setLeaveTaken] = useState<LeaveTaken>({});
  const [leaveRecords, setLeaveRecords] = useState<LeaveRecord[]>([]);
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);

  useEffect(() => {
    const fetchGtEmployees = async () => {
      setLoadingGtEmployees(true);
      try {
        const rows: any[] = await api.get("/greentarget/api/payroll-employees");
        setGtEmployeeIds(new Set((rows || []).map((r) => r.employee_id)));
      } catch (error) {
        console.error("Failed to fetch GT payroll employees:", error);
        toast.error("Failed to load Green Target employees");
      } finally {
        setLoadingGtEmployees(false);
      }
    };
    fetchGtEmployees();
  }, []);

  // Only Green Target payroll staff.
  const gtStaffs = useMemo(
    () => allStaffs.filter((s) => gtEmployeeIds.has(s.id)),
    [allStaffs, gtEmployeeIds]
  );

  // Multi-ID employees share one leave entitlement bucket on the backend,
  // so present one card / option per full name on this page too.
  const dedupedStaffs = useMemo(() => groupStaffsByName(gtStaffs), [gtStaffs]);
  const groupedStaffIdsByEmployeeId = useMemo(
    () => getGroupedStaffIdsByEmployeeId(gtStaffs),
    [gtStaffs]
  );

  const staffOptions = useMemo(
    () =>
      dedupedStaffs.map((staff) => {
        const groupedIds: string[] =
          groupedStaffIdsByEmployeeId.get(staff.id) || [staff.id];
        const groupedIdsLabel: string =
          groupedIds.length > 1
            ? ` | Collapsed IDs: ${groupedIds.join(", ")}`
            : "";

        return {
          id: staff.id,
          name: `${staff.name} (${staff.id})${groupedIdsLabel}`,
        };
      }),
    [dedupedStaffs, groupedStaffIdsByEmployeeId]
  );

  const selectedStaff = useMemo(
    () => dedupedStaffs.find((s) => s.id === selectedStaffId) || null,
    [selectedStaffId, dedupedStaffs]
  );

  // Filtered employees for card display
  const filteredEmployees = useMemo(() => {
    if (!searchQuery.trim()) return dedupedStaffs;

    const query = searchQuery.toLowerCase();
    return dedupedStaffs.filter((staff) => {
      const name = staff.name.toLowerCase();
      const groupedIds: string[] =
        groupedStaffIdsByEmployeeId.get(staff.id) || [staff.id];
      const groupedIdsText: string = groupedIds.join(" ").toLowerCase();
      const job = Array.isArray(staff.job)
        ? staff.job.join(", ").toLowerCase()
        : String(staff.job || "").toLowerCase();

      return (
        name.includes(query) ||
        groupedIdsText.includes(query) ||
        job.includes(query)
      );
    });
  }, [dedupedStaffs, groupedStaffIdsByEmployeeId, searchQuery]);

  // Handle employee card click
  const handleEmployeeCardClick = (employee: Employee) => {
    setSelectedStaffId(employee.id);
  };

  useEffect(() => {
    const fetchLeaveData = async () => {
      if (!selectedStaffId) return;

      setLoadingReport(true);
      setReportError(null);
      setLeaveBalances(null);
      setLeaveTaken({});
      setLeaveRecords([]);

      try {
        const [balanceRes, recordsRes] = await Promise.all([
          api.get(
            `/greentarget/api/leave-management/balances/${selectedStaffId}/${currentYear}`
          ),
          api.get(
            `/greentarget/api/leave-management/records/${selectedStaffId}/${currentYear}`
          ),
        ]);

        setLeaveBalances(balanceRes.balance);
        setLeaveTaken(balanceRes.taken);
        setLeaveRecords(recordsRes);
      } catch (error: any) {
        console.error("Failed to fetch leave data:", error);
        setReportError(
          error.response?.data?.message || "Failed to load leave report."
        );
      } finally {
        setLoadingReport(false);
      }
    };

    fetchLeaveData();
  }, [selectedStaffId, currentYear]);

  const yearsOfService = useMemo(
    () =>
      selectedStaff
        ? calculateYearsOfService(new Date(selectedStaff.dateJoined))
        : 0,
    [selectedStaff]
  );

  const monthlySummary = useMemo(() => {
    const summary: Record<
      number,
      {
        cuti_umum: { days: number; amount: number };
        cuti_sakit: { days: number; amount: number };
        cuti_tahunan: { days: number; amount: number };
        cuti_rawatan: { days: number; amount: number };
      }
    > = {};

    for (let i = 1; i <= 12; i++) {
      summary[i] = {
        cuti_umum: { days: 0, amount: 0 },
        cuti_sakit: { days: 0, amount: 0 },
        cuti_tahunan: { days: 0, amount: 0 },
        cuti_rawatan: { days: 0, amount: 0 },
      };
    }

    leaveRecords.forEach((record) => {
      const month = new Date(record.leave_date).getMonth() + 1;
      if (summary[month] && record.leave_type) {
        const leaveTypeData = summary[month][record.leave_type];
        if (leaveTypeData) {
          leaveTypeData.days += Number(record.days_taken);
          leaveTypeData.amount += Number(record.amount_paid || 0);
        }
      }
    });

    return summary;
  }, [leaveRecords]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-MY", {
      style: "currency",
      currency: "MYR",
    }).format(amount);
  };

  // Single employee PDF generation
  const generateSinglePDF = async (action: "download" | "print") => {
    if (!selectedStaff || !leaveBalances) {
      toast.error("No employee data available to generate PDF");
      return;
    }

    setIsGeneratingPDF(true);
    try {
      const pdfData: CutiReportData = {
        employee: {
          id: selectedStaff.id,
          name: selectedStaff.name,
          job: selectedStaff.job,
          dateJoined: selectedStaff.dateJoined,
          icNo: selectedStaff.icNo,
          nationality: selectedStaff.nationality,
        },
        year: currentYear,
        yearsOfService: yearsOfService,
        leaveBalance: leaveBalances,
        leaveTaken: leaveTaken,
        monthlySummary: monthlySummary,
      };

      await generateSingleCutiReportPDF(pdfData, action);

      const actionText =
        action === "download" ? "downloaded" : "generated for printing";
      toast.success(`Leave report ${actionText} successfully`);
    } catch (error) {
      console.error("Error generating PDF:", error);
      toast.error("Failed to generate PDF");
    } finally {
      setIsGeneratingPDF(false);
    }
  };

  // Batch PDF generation for all employees
  const generateBatchPDF = async (action: "download" | "print") => {
    if (filteredEmployees.length === 0) {
      toast.error("No employees available to generate batch PDF");
      return;
    }

    setIsGeneratingPDF(true);
    try {
      toast.loading("Fetching batch leave report data...");

      const employeeIds = filteredEmployees.map((emp) => emp.id);

      const batchResponse = await api.post(
        "/greentarget/api/leave-management/batch-reports",
        {
          employeeIds,
          year: currentYear,
        }
      );

      if (!batchResponse.employees || batchResponse.employees.length === 0) {
        toast.error("No leave data found for selected employees");
        return;
      }

      const validEmployeeData: CutiReportData[] = batchResponse.employees.map(
        (empData: any) => ({
          employee: {
            id: empData.employee.id,
            name: empData.employee.name,
            job: empData.employee.job,
            dateJoined: empData.employee.dateJoined,
            icNo: empData.employee.icNo,
            nationality: empData.employee.nationality,
          },
          year: currentYear,
          yearsOfService: empData.yearsOfService,
          leaveBalance: empData.leaveBalance,
          leaveTaken: empData.leaveTaken,
          monthlySummary: empData.monthlySummary,
        })
      );

      const batchData: CutiBatchReportData = {
        year: currentYear,
        employees: validEmployeeData,
        summary: batchResponse.summary,
      };

      toast.dismiss();
      await generateBatchCutiReportPDF(batchData, action);

      toast.success(
        `Batch leave report generated successfully (${validEmployeeData.length} employees)`
      );
    } catch (error) {
      console.error("Error generating batch PDF:", error);
      toast.error("Failed to generate batch PDF");
    } finally {
      setIsGeneratingPDF(false);
    }
  };

  const renderStaffHeader = (staff: Employee) => {
    const groupedIds: string[] =
      groupedStaffIdsByEmployeeId.get(staff.id) || [staff.id];
    const hasCollapsedIds: boolean = groupedIds.length > 1;
    const groupedIdsText: string = groupedIds.join(", ");

    return (
      <div className="bg-white dark:bg-gray-800 px-6 py-4 rounded-xl border border-default-200 dark:border-gray-700">
        <div className="flex items-center justify-between gap-4 mb-4">
          <div className="flex items-center gap-4">
            <IconUserCircle size={48} className="text-default-400 dark:text-gray-500" />
            <div>
              <h2 className="text-xl font-bold text-default-800 dark:text-gray-100">
                {staff.name}
              </h2>
              <p className="text-default-500 dark:text-gray-400">{staff.id}</p>
              {hasCollapsedIds && (
                <p className="text-sm text-sky-600 dark:text-sky-400">
                  Collapsed IDs: {groupedIdsText}
                </p>
              )}
            </div>
          </div>

          {/* Single Employee Print Controls */}
          <div>
            <Button
              onClick={() => generateSinglePDF("print")}
              icon={IconPrinter}
              color="green"
              variant="outline"
              disabled={!leaveBalances || isGeneratingPDF}
            >
              Print Report
            </Button>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mt-4 border-t border-default-200 dark:border-gray-700 pt-4">
          <div className="flex items-center gap-2">
            <IconBriefcase size={20} className="text-default-500 dark:text-gray-400" />
            <div>
              <p className="text-xs text-default-500 dark:text-gray-400">Job</p>
              <p className="text-sm font-medium text-default-800 dark:text-gray-100">
                {(Array.isArray(staff.job) ? staff.job.join(", ") : staff.job) ||
                  "N/A"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <IconCalendar size={20} className="text-default-500 dark:text-gray-400" />
            <div>
              <p className="text-xs text-default-500 dark:text-gray-400">Date Joined</p>
              <p className="text-sm font-medium text-default-800 dark:text-gray-100">
                {staff.dateJoined
                  ? new Date(staff.dateJoined).toLocaleDateString()
                  : "N/A"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <IconClockHour4 size={20} className="text-default-500 dark:text-gray-400" />
            <div>
              <p className="text-xs text-default-500 dark:text-gray-400">Years of Service</p>
              <p className="text-sm font-medium text-default-800 dark:text-gray-100">
                {yearsOfService} years
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <IconId size={20} className="text-default-500 dark:text-gray-400" />
            <div>
              <p className="text-xs text-default-500 dark:text-gray-400">IC No.</p>
              <p className="text-sm font-medium text-default-800 dark:text-gray-100">
                {staff.icNo || "N/A"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <IconWorld size={20} className="text-default-500 dark:text-gray-400" />
            <div>
              <p className="text-xs text-default-500 dark:text-gray-400">Nationality</p>
              <p className="text-sm font-medium text-default-800 dark:text-gray-100">
                {staff.nationality || "N/A"}
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderLeaveBalanceSummary = (balances: LeaveBalance) => {
    const remainingTahunan =
      balances.cuti_tahunan_total - (leaveTaken.cuti_tahunan || 0);
    const remainingSakit =
      balances.cuti_sakit_total - (leaveTaken.cuti_sakit || 0);
    const remainingUmum =
      balances.cuti_umum_total - (leaveTaken.cuti_umum || 0);
    const remainingRawatan =
      balances.cuti_rawatan_total - (leaveTaken.cuti_rawatan || 0);

    return (
      <div className="bg-white dark:bg-gray-800 p-6 rounded-xl border border-default-200 dark:border-gray-700">
        <h3 className="text-lg font-semibold text-default-800 dark:text-gray-100 mb-4">
          Leave Balances ({currentYear})
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-sky-50 dark:bg-sky-900/30 p-4 rounded-lg border border-sky-200 dark:border-sky-800">
            <p className="font-semibold text-sky-800 dark:text-sky-300">Cuti Tahunan</p>
            <div className="flex justify-between items-baseline mt-2">
              <span className="text-2xl font-bold text-sky-600 dark:text-sky-400">
                {remainingTahunan}
              </span>
              <span className="text-sm text-sky-500 dark:text-sky-400">
                / {balances.cuti_tahunan_total} days
              </span>
            </div>
          </div>
          <div className="bg-amber-50 dark:bg-amber-900/30 p-4 rounded-lg border border-amber-200 dark:border-amber-800">
            <p className="font-semibold text-amber-800 dark:text-amber-300">Cuti Sakit</p>
            <div className="flex justify-between items-baseline mt-2">
              <span className="text-2xl font-bold text-amber-600 dark:text-amber-400">
                {remainingSakit}
              </span>
              <span className="text-sm text-amber-500 dark:text-amber-400">
                / {balances.cuti_sakit_total} days
              </span>
            </div>
          </div>
          <div className="bg-emerald-50 dark:bg-emerald-900/30 p-4 rounded-lg border border-emerald-200 dark:border-emerald-800">
            <p className="font-semibold text-emerald-800 dark:text-emerald-300">Cuti Umum</p>
            <div className="flex justify-between items-baseline mt-2">
              <span className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                {remainingUmum}
              </span>
              <span className="text-sm text-emerald-500 dark:text-emerald-400">
                / {balances.cuti_umum_total} days
              </span>
            </div>
          </div>
          <div className="bg-violet-50 dark:bg-violet-900/30 p-4 rounded-lg border border-violet-200 dark:border-violet-800">
            <p className="font-semibold text-violet-800 dark:text-violet-300">Cuti Rawatan</p>
            <div className="flex justify-between items-baseline mt-2">
              <span className="text-2xl font-bold text-violet-600 dark:text-violet-400">
                {remainingRawatan}
              </span>
              <span className="text-sm text-violet-500 dark:text-violet-400">
                / {balances.cuti_rawatan_total} days
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderMonthlyLeaveTable = () => {
    if (!leaveBalances) return null;

    const calculateRunningBalances = () => {
      const results: Record<
        number,
        {
          tahunanBalance: number;
          sakitBalance: number;
          umumBalance: number;
          rawatanBalance: number;
        }
      > = {};

      let cumulativeTahunan = 0;
      let cumulativeSakit = 0;
      let cumulativeUmum = 0;
      let cumulativeRawatan = 0;

      for (let month = 1; month <= 12; month++) {
        const monthData = monthlySummary[month];
        cumulativeTahunan += monthData.cuti_tahunan.days;
        cumulativeSakit += monthData.cuti_sakit.days;
        cumulativeUmum += monthData.cuti_umum.days;
        cumulativeRawatan += monthData.cuti_rawatan.days;

        results[month] = {
          tahunanBalance: leaveBalances.cuti_tahunan_total - cumulativeTahunan,
          sakitBalance: leaveBalances.cuti_sakit_total - cumulativeSakit,
          umumBalance: leaveBalances.cuti_umum_total - cumulativeUmum,
          rawatanBalance: leaveBalances.cuti_rawatan_total - cumulativeRawatan,
        };
      }

      return results;
    };

    const runningBalances = calculateRunningBalances();

    const cellDays = (value: number, tone: string) => (
      <span
        className={`px-2 py-1 rounded-full text-xs font-medium ${
          value > 0
            ? tone
            : "bg-default-100 dark:bg-gray-700 text-default-500 dark:text-gray-400"
        }`}
      >
        {value || "0"}
      </span>
    );

    const cellBalance = (value: number, tone: string) => (
      <span
        className={`px-3 py-1 rounded-full ${
          value < 0
            ? "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300"
            : tone
        }`}
      >
        {value}
      </span>
    );

    return (
      <div className="bg-white dark:bg-gray-800 p-6 rounded-xl border border-default-200 dark:border-gray-700">
        <h3 className="text-lg font-semibold text-default-800 dark:text-gray-100 mb-4">
          Monthly Leave Details ({currentYear})
        </h3>
        <div className="overflow-x-auto">
          <table className="min-w-full border border-default-200 dark:border-gray-700 rounded-lg text-sm">
            <thead>
              <tr className="bg-default-100 dark:bg-gray-800">
                <th className="py-3 px-4 text-left font-semibold text-default-700 dark:text-gray-200 uppercase border-r border-default-300 dark:border-gray-600">
                  Month
                </th>
                <th className="py-3 px-4 text-center font-semibold text-sky-800 dark:text-sky-300 uppercase border-r border-default-300 dark:border-gray-600">
                  Cuti Tahunan
                </th>
                <th className="py-3 px-4 text-center font-semibold text-amber-800 dark:text-amber-300 uppercase border-r border-default-300 dark:border-gray-600">
                  Cuti Sakit
                </th>
                <th className="py-3 px-4 text-center font-semibold text-emerald-800 dark:text-emerald-300 uppercase border-r border-default-300 dark:border-gray-600">
                  Cuti Umum
                </th>
                <th className="py-3 px-4 text-center font-semibold text-violet-800 dark:text-violet-300 uppercase">
                  Cuti Rawatan
                </th>
              </tr>
              <tr className="bg-default-50 dark:bg-gray-900/50 text-xs">
                <th className="py-2 px-4 border-r border-default-300 dark:border-gray-600" />
                {["sky", "amber", "emerald", "violet"].map((c) => (
                  <th
                    key={c}
                    className="py-2 px-2 text-center border-r border-default-200 dark:border-gray-700 text-default-500 dark:text-gray-400"
                  >
                    <div className="flex justify-around">
                      <span>Days</span>
                      <span>Amount</span>
                      <span>Balance</span>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-800">
              {Object.entries(monthlySummary).map(([month, summary]) => {
                const monthNum = parseInt(month);
                const balances = runningBalances[monthNum];
                return (
                  <tr
                    key={month}
                    className="border-b border-default-200 dark:border-gray-700 hover:bg-default-50 dark:hover:bg-gray-700/30"
                  >
                    <td className="py-3 px-4 whitespace-nowrap font-semibold text-default-800 dark:text-gray-100 border-r border-default-300 dark:border-gray-600">
                      {getMonthName(monthNum)}
                    </td>
                    <td className="py-3 px-2 border-r border-default-200 dark:border-gray-700">
                      <div className="flex justify-around items-center">
                        {cellDays(
                          summary.cuti_tahunan.days,
                          "bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-300"
                        )}
                        <span className="text-default-600 dark:text-gray-300">
                          {formatCurrency(summary.cuti_tahunan.amount)}
                        </span>
                        {cellBalance(
                          balances.tahunanBalance,
                          "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300"
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-2 border-r border-default-200 dark:border-gray-700">
                      <div className="flex justify-around items-center">
                        {cellDays(
                          summary.cuti_sakit.days,
                          "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300"
                        )}
                        <span className="text-default-600 dark:text-gray-300">
                          {formatCurrency(summary.cuti_sakit.amount)}
                        </span>
                        {cellBalance(
                          balances.sakitBalance,
                          "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-2 border-r border-default-200 dark:border-gray-700">
                      <div className="flex justify-around items-center">
                        {cellDays(
                          summary.cuti_umum.days,
                          "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300"
                        )}
                        <span className="text-default-600 dark:text-gray-300">
                          {formatCurrency(summary.cuti_umum.amount)}
                        </span>
                        {cellBalance(
                          balances.umumBalance,
                          "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300"
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-2">
                      <div className="flex justify-around items-center">
                        {cellDays(
                          summary.cuti_rawatan.days,
                          "bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-300"
                        )}
                        <span className="text-default-600 dark:text-gray-300">
                          {formatCurrency(summary.cuti_rawatan.amount)}
                        </span>
                        {cellBalance(
                          balances.rawatanBalance,
                          "bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300"
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Legend */}
        <div className="mt-4 flex flex-wrap gap-4 text-xs text-default-600 dark:text-gray-300 bg-default-50 dark:bg-gray-900/50 p-3 rounded-lg">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-sky-500"></div>
            <span>
              <strong>Cuti Tahunan:</strong> Annual leave based on years of
              service
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-amber-500"></div>
            <span>
              <strong>Cuti Sakit:</strong> Sick leave (available any day)
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
            <span>
              <strong>Cuti Umum:</strong> Public holiday leave
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-violet-500"></div>
            <span>
              <strong>Cuti Rawatan:</strong> Hospital leave (60 days per year)
            </span>
          </div>
        </div>
      </div>
    );
  };

  const isLoading = loadingStaffs || loadingGtEmployees;

  return (
    <div className="relative w-full mb-2">
      {/* --- Conditional Rendering: Show Cards or Detail View --- */}
      {!selectedStaffId && !isLoading && (
        <>
          <div className="flex flex-col md:flex-row justify-between items-center gap-4 mb-4">
            {/* Search Input */}
            <div className="flex-1 max-w-md">
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <IconSearch size={20} className="text-default-400 dark:text-gray-500" />
                </div>
                <input
                  type="text"
                  className="block w-full pl-10 pr-3 py-2 border border-default-300 dark:border-gray-600 rounded-full leading-5 bg-white placeholder-default-500 dark:placeholder:text-gray-400 focus:outline-none focus:placeholder-default-400 focus:ring-1 focus:ring-sky-500 focus:border-sky-500 sm:text-sm dark:bg-transparent dark:text-gray-100"
                  placeholder="Search employees by name, ID, or job..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            </div>

            {/* Batch Print Controls */}
            <div className="flex-shrink-0">
              <Button
                onClick={() => generateBatchPDF("print")}
                icon={IconPrinter}
                color="green"
                variant="outline"
                disabled={filteredEmployees.length === 0 || isGeneratingPDF}
              >
                Print All ({filteredEmployees.length})
              </Button>
            </div>
          </div>

          {/* --- Employee Card Grid --- */}
          <div className="overflow-y-auto border border-default-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 shadow-sm p-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {filteredEmployees.map((employee) => (
                <EmployeeCard
                  key={employee.id}
                  employee={employee}
                  groupedIds={
                    groupedStaffIdsByEmployeeId.get(employee.id) || [employee.id]
                  }
                  onClick={handleEmployeeCardClick}
                />
              ))}
            </div>

            {filteredEmployees.length === 0 && (
              <div className="text-center py-16 border border-dashed border-default-300 dark:border-gray-600 rounded-lg">
                <p className="text-default-600 dark:text-gray-300">
                  {searchQuery
                    ? `No employees found matching "${searchQuery}"`
                    : "No Green Target payroll employees found."}
                </p>
              </div>
            )}
          </div>
        </>
      )}

      {/* --- Loading State --- */}
      {isLoading && !selectedStaffId && (
        <div className="flex justify-center items-center h-40">
          <LoadingSpinner />
          <span className="ml-3 text-default-600 dark:text-gray-300">Loading employees...</span>
        </div>
      )}

      {/* --- Detail View (Employee Selected) --- */}
      {selectedStaffId && (
        <>
          <div className="mb-4 mt-1 flex flex-col md:flex-row md:items-center md:justify-between gap-4 rounded-lg border border-default-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 shadow-sm">
            <div className="flex-shrink-0">
              <button
                onClick={() => {
                  setSelectedStaffId(null);
                  setSearchQuery("");
                }}
                className="text-sm text-sky-600 dark:text-sky-400 hover:text-sky-800 font-medium flex items-center gap-1"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M10 19l-7-7m0 0l7-7m-7 7h18"
                  />
                </svg>
                Back to Employee List
              </button>
            </div>
            <div className="flex-1 md:max-w-lg">
              <FormCombobox
                name="staff"
                label="Select Staff"
                value={selectedStaffId || ""}
                onChange={(value) => setSelectedStaffId(value as string)}
                options={staffOptions}
                query={searchQuery}
                setQuery={setSearchQuery}
                placeholder="Search by name or ID..."
                mode="single"
                disabled={isLoading}
              />
            </div>
          </div>

          {loadingReport && (
            <div className="flex justify-center items-center h-40">
              <LoadingSpinner />
            </div>
          )}

          {!loadingReport && reportError && (
            <div className="text-center py-16 bg-white dark:bg-gray-800 rounded-xl border border-dashed border-rose-300">
              <IconAlertCircle className="mx-auto text-rose-500 h-12 w-12" />
              <p className="mt-4 text-rose-600 font-medium">{reportError}</p>
            </div>
          )}

          {!loadingReport && !reportError && selectedStaff && (
            <div className="space-y-4">
              {renderStaffHeader(selectedStaff)}
              {leaveBalances && renderLeaveBalanceSummary(leaveBalances)}
              {renderMonthlyLeaveTable()}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default GTCutiReportPage;
