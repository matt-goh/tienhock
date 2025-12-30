// src/pages/Payroll/CutiReportPage.tsx
import React, { useState, useMemo, useEffect } from "react";
import { useStaffsCache } from "../../../utils/catalogue/useStaffsCache";
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
}

interface LeaveTaken {
  cuti_umum?: number;
  cuti_sakit?: number;
  cuti_tahunan?: number;
}

interface LeaveRecord {
  id: number;
  employee_id: string;
  leave_date: string;
  leave_type: "cuti_umum" | "cuti_sakit" | "cuti_tahunan";
  days_taken: number;
  amount_paid: number;
}

// --- Employee Card Component ---
interface EmployeeCardProps {
  employee: Employee;
  onClick: (employee: Employee) => void;
}

const EmployeeCard: React.FC<EmployeeCardProps> = ({ employee, onClick }) => {
  const jobDisplay = Array.isArray(employee.job)
    ? employee.job.join(", ")
    : employee.job || "N/A";

  return (
    <button
      onClick={() => onClick(employee)}
      className="block w-full p-4 border border-default-200 rounded-lg shadow-sm hover:shadow-md hover:border-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-opacity-50 text-left bg-white h-full min-h-[104px]"
    >
      <h3
        className="text-base font-semibold text-default-800 truncate mb-1"
        title={employee.name}
      >
        {employee.name}
      </h3>
      <p className="text-xs text-default-500 uppercase mb-2">
        ID: {employee.id}
      </p>
      <p className="text-sm text-default-600 line-clamp-2" title={jobDisplay}>
        <span className="font-medium">Job:</span> {jobDisplay}
      </p>
    </button>
  );
};

const CutiReportPage: React.FC = () => {
  const { staffs, loading: loadingStaffs } = useStaffsCache();
  const [selectedStaffId, setSelectedStaffId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [currentYear] = useState(new Date().getFullYear());

  // State for API data
  const [loadingReport, setLoadingReport] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);
  const [leaveBalances, setLeaveBalances] = useState<LeaveBalance | null>(null);
  const [leaveTaken, setLeaveTaken] = useState<LeaveTaken>({});
  const [leaveRecords, setLeaveRecords] = useState<LeaveRecord[]>([]);
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);

  const staffOptions = useMemo(
    () =>
      staffs.map((staff) => ({
        id: staff.id,
        name: `${staff.name} (${staff.id})`,
      })),
    [staffs]
  );

  const selectedStaff = useMemo(
    () => staffs.find((s) => s.id === selectedStaffId) || null,
    [selectedStaffId, staffs]
  );

  // Filtered employees for card display
  const filteredEmployees = useMemo(() => {
    if (!searchQuery.trim()) return staffs;

    const query = searchQuery.toLowerCase();
    return staffs.filter((staff) => {
      const name = staff.name.toLowerCase();
      const id = staff.id.toLowerCase();
      const job = Array.isArray(staff.job)
        ? staff.job.join(", ").toLowerCase()
        : String(staff.job || "").toLowerCase();

      return name.includes(query) || id.includes(query) || job.includes(query);
    });
  }, [staffs, searchQuery]);

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
            `/api/leave-management/balances/${selectedStaffId}/${currentYear}`
          ),
          api.get(
            `/api/leave-management/records/${selectedStaffId}/${currentYear}`
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
      }
    > = {};

    for (let i = 1; i <= 12; i++) {
      summary[i] = {
        cuti_umum: { days: 0, amount: 0 },
        cuti_sakit: { days: 0, amount: 0 },
        cuti_tahunan: { days: 0, amount: 0 },
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
      
      // Get employee IDs for the batch request
      const employeeIds = filteredEmployees.map(emp => emp.id);
      
      // Single API call for batch data
      const batchResponse = await api.post('/api/leave-management/batch-reports', {
        employeeIds,
        year: currentYear
      });

      if (!batchResponse.employees || batchResponse.employees.length === 0) {
        toast.error("No leave data found for selected employees");
        return;
      }

      // Transform the response data to match our PDF component expectations
      const validEmployeeData: CutiReportData[] = batchResponse.employees.map((empData: any) => ({
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
      }));

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

  const renderStaffHeader = (staff: Employee) => (
    <div className="bg-white px-6 py-4 rounded-xl border border-default-200">
      <div className="flex items-center justify-between gap-4 mb-4">
        <div className="flex items-center gap-4">
          <IconUserCircle size={48} className="text-default-400" />
          <div>
            <h2 className="text-xl font-bold text-default-800">{staff.name}</h2>
            <p className="text-default-500">{staff.id}</p>
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
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mt-4 border-t border-default-200 pt-4">
        <div className="flex items-center gap-2">
          <IconBriefcase size={20} className="text-default-500" />
          <div>
            <p className="text-xs text-default-500">Job</p>
            <p className="text-sm font-medium">
              {staff.job.join(", ") || "N/A"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <IconCalendar size={20} className="text-default-500" />
          <div>
            <p className="text-xs text-default-500">Date Joined</p>
            <p className="text-sm font-medium">
              {new Date(staff.dateJoined).toLocaleDateString()}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <IconClockHour4 size={20} className="text-default-500" />
          <div>
            <p className="text-xs text-default-500">Years of Service</p>
            <p className="text-sm font-medium">{yearsOfService} years</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <IconId size={20} className="text-default-500" />
          <div>
            <p className="text-xs text-default-500">IC No.</p>
            <p className="text-sm font-medium">{staff.icNo || "N/A"}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <IconWorld size={20} className="text-default-500" />
          <div>
            <p className="text-xs text-default-500">Nationality</p>
            <p className="text-sm font-medium">{staff.nationality || "N/A"}</p>
          </div>
        </div>
      </div>
    </div>
  );

  const renderLeaveBalanceSummary = (balances: LeaveBalance) => {
    const remainingTahunan =
      balances.cuti_tahunan_total - (leaveTaken.cuti_tahunan || 0);
    const remainingSakit =
      balances.cuti_sakit_total - (leaveTaken.cuti_sakit || 0);
    const remainingUmum =
      balances.cuti_umum_total - (leaveTaken.cuti_umum || 0);

    return (
      <div className="bg-white p-6 rounded-xl border border-default-200">
        <h3 className="text-lg font-semibold text-default-800 mb-4">
          Leave Balances ({currentYear})
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-sky-50 p-4 rounded-lg border border-sky-200">
            <p className="font-semibold text-sky-800">Cuti Tahunan</p>
            <div className="flex justify-between items-baseline mt-2">
              <span className="text-2xl font-bold text-sky-600">
                {remainingTahunan}
              </span>
              <span className="text-sm text-sky-500">
                / {balances.cuti_tahunan_total} days
              </span>
            </div>
          </div>
          <div className="bg-amber-50 p-4 rounded-lg border border-amber-200">
            <p className="font-semibold text-amber-800">Cuti Sakit</p>
            <div className="flex justify-between items-baseline mt-2">
              <span className="text-2xl font-bold text-amber-600">
                {remainingSakit}
              </span>
              <span className="text-sm text-amber-500">
                / {balances.cuti_sakit_total} days
              </span>
            </div>
          </div>
          <div className="bg-emerald-50 p-4 rounded-lg border border-emerald-200">
            <p className="font-semibold text-emerald-800">Cuti Umum</p>
            <div className="flex justify-between items-baseline mt-2">
              <span className="text-2xl font-bold text-emerald-600">
                {remainingUmum}
              </span>
              <span className="text-sm text-emerald-500">
                / {balances.cuti_umum_total} days
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderMonthlyLeaveTable = () => {
    if (!leaveBalances) return null;

    // Calculate running balances for each month
    const calculateRunningBalances = () => {
      const results: Record<
        number,
        {
          tahunanBalance: number;
          sakitBalance: number;
          umumBalance: number;
          tahunanCumulative: number;
          sakitCumulative: number;
          umumCumulative: number;
        }
      > = {};

      let cumulativeTahunan = 0;
      let cumulativeSakit = 0;
      let cumulativeUmum = 0;

      // Process months in order (1-12)
      for (let month = 1; month <= 12; month++) {
        const monthData = monthlySummary[month];

        // Add current month's usage to cumulative
        cumulativeTahunan += monthData.cuti_tahunan.days;
        cumulativeSakit += monthData.cuti_sakit.days;
        cumulativeUmum += monthData.cuti_umum.days;

        // Calculate remaining balance
        results[month] = {
          tahunanBalance: leaveBalances.cuti_tahunan_total - cumulativeTahunan,
          sakitBalance: leaveBalances.cuti_sakit_total - cumulativeSakit,
          umumBalance: leaveBalances.cuti_umum_total - cumulativeUmum,
          tahunanCumulative: cumulativeTahunan,
          sakitCumulative: cumulativeSakit,
          umumCumulative: cumulativeUmum,
        };
      }

      return results;
    };

    const runningBalances = calculateRunningBalances();

    return (
      <div className="bg-white p-6 rounded-xl border border-default-200">
        <h3 className="text-lg font-semibold text-default-800 mb-4">
          Monthly Leave Details ({currentYear})
        </h3>
        <div className="overflow-x-auto">
          <table className="min-w-full border border-default-200 rounded-lg">
            <thead>
              {/* Main header row with leave type categories */}
              <tr className="bg-default-100">
                <th
                  rowSpan={2}
                  className="py-4 px-4 text-left text-sm font-semibold text-default-700 uppercase align-middle border-r-2 border-default-300 bg-default-50"
                >
                  Month
                </th>
                <th
                  colSpan={3}
                  className="py-3 px-4 text-center text-sm font-semibold text-sky-800 uppercase border-b border-r-2 border-default-300 bg-sky-100"
                >
                  <div className="flex items-center justify-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-sky-500"></div>
                    Cuti Tahunan
                  </div>
                </th>
                <th
                  colSpan={3}
                  className="py-3 px-4 text-center text-sm font-semibold text-amber-800 uppercase border-b border-r-2 border-default-300 bg-amber-100"
                >
                  <div className="flex items-center justify-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-amber-500"></div>
                    Cuti Sakit
                  </div>
                </th>
                <th
                  colSpan={3}
                  className="py-3 px-4 text-center text-sm font-semibold text-emerald-800 uppercase border-b bg-emerald-100"
                >
                  <div className="flex items-center justify-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-emerald-500"></div>
                    Cuti Umum
                  </div>
                </th>
              </tr>
              {/* Sub-header row with column details */}
              <tr className="bg-default-50">
                {/* Cuti Tahunan sub-headers */}
                <th className="py-3 px-3 text-center text-xs font-medium text-sky-700 uppercase border-r border-sky-200 bg-sky-50">
                  Days Used
                </th>
                <th className="py-3 px-3 text-center text-xs font-medium text-sky-700 uppercase border-r border-sky-200 bg-sky-50">
                  Amount
                </th>
                <th className="py-3 px-3 text-center text-xs font-medium text-sky-700 uppercase border-r-2 border-default-300 bg-sky-50">
                  Balance
                </th>
                {/* Cuti Sakit sub-headers */}
                <th className="py-3 px-3 text-center text-xs font-medium text-amber-700 uppercase border-r border-amber-200 bg-amber-50">
                  Days Used
                </th>
                <th className="py-3 px-3 text-center text-xs font-medium text-amber-700 uppercase border-r border-amber-200 bg-amber-50">
                  Amount
                </th>
                <th className="py-3 px-3 text-center text-xs font-medium text-amber-700 uppercase border-r-2 border-default-300 bg-amber-50">
                  Balance
                </th>
                {/* Cuti Umum sub-headers */}
                <th className="py-3 px-3 text-center text-xs font-medium text-emerald-700 uppercase border-r border-emerald-200 bg-emerald-50">
                  Days Used
                </th>
                <th className="py-3 px-3 text-center text-xs font-medium text-emerald-700 uppercase border-r border-emerald-200 bg-emerald-50">
                  Amount
                </th>
                <th className="py-3 px-3 text-center text-xs font-medium text-emerald-700 uppercase bg-emerald-50">
                  Balance
                </th>
              </tr>
            </thead>
            <tbody className="bg-white">
              {Object.entries(monthlySummary).map(([month, summary], index) => {
                const monthNum = parseInt(month);
                const balances = runningBalances[monthNum];

                return (
                  <tr
                    key={month}
                    className={`border-b border-default-200 hover:bg-default-25 transition-colors ${
                      index % 2 === 0 ? "bg-white" : "bg-default-25"
                    }`}
                  >
                    {/* Month column */}
                    <td className="py-4 px-4 whitespace-nowrap text-sm font-semibold text-default-800 border-r-2 border-default-300 bg-default-50">
                      {getMonthName(monthNum)}
                    </td>

                    {/* Cuti Tahunan columns */}
                    <td className="py-4 px-3 whitespace-nowrap text-sm text-center text-default-700 border-r border-sky-100 bg-sky-25">
                      <span
                        className={`px-2 py-1 rounded-full text-xs font-medium ${
                          summary.cuti_tahunan.days > 0
                            ? "bg-sky-100 text-sky-800"
                            : "bg-default-100 text-default-500"
                        }`}
                      >
                        {summary.cuti_tahunan.days || "0"}
                      </span>
                    </td>
                    <td className="py-4 px-3 whitespace-nowrap text-sm text-center text-default-700 border-r border-sky-100 bg-sky-25">
                      <span className="font-medium">
                        {formatCurrency(summary.cuti_tahunan.amount)}
                      </span>
                    </td>
                    <td className="py-4 px-3 whitespace-nowrap text-sm text-center font-bold text-sky-700 border-r-2 border-default-300 bg-sky-50">
                      <span
                        className={`px-3 py-1 rounded-full text-sky-800 ${
                          balances.tahunanBalance < 0
                            ? "bg-rose-100 text-rose-800"
                            : "bg-sky-100"
                        }`}
                      >
                        {balances.tahunanBalance}
                      </span>
                    </td>

                    {/* Cuti Sakit columns */}
                    <td className="py-4 px-3 whitespace-nowrap text-sm text-center text-default-700 border-r border-amber-100 bg-amber-25">
                      <span
                        className={`px-2 py-1 rounded-full text-xs font-medium ${
                          summary.cuti_sakit.days > 0
                            ? "bg-amber-100 text-amber-800"
                            : "bg-default-100 text-default-500"
                        }`}
                      >
                        {summary.cuti_sakit.days || "0"}
                      </span>
                    </td>
                    <td className="py-4 px-3 whitespace-nowrap text-sm text-center text-default-700 border-r border-amber-100 bg-amber-25">
                      <span className="font-medium">
                        {formatCurrency(summary.cuti_sakit.amount)}
                      </span>
                    </td>
                    <td className="py-4 px-3 whitespace-nowrap text-sm text-center font-bold text-amber-700 border-r-2 border-default-300 bg-amber-50">
                      <span
                        className={`px-3 py-1 rounded-full text-amber-800 ${
                          balances.sakitBalance < 0
                            ? "bg-rose-100 text-rose-800"
                            : "bg-amber-100"
                        }`}
                      >
                        {balances.sakitBalance}
                      </span>
                    </td>

                    {/* Cuti Umum columns */}
                    <td className="py-4 px-3 whitespace-nowrap text-sm text-center text-default-700 border-r border-emerald-100 bg-emerald-25">
                      <span
                        className={`px-2 py-1 rounded-full text-xs font-medium ${
                          summary.cuti_umum.days > 0
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-default-100 text-default-500"
                        }`}
                      >
                        {summary.cuti_umum.days || "0"}
                      </span>
                    </td>
                    <td className="py-4 px-3 whitespace-nowrap text-sm text-center text-default-700 border-r border-emerald-100 bg-emerald-25">
                      <span className="font-medium">
                        {formatCurrency(summary.cuti_umum.amount)}
                      </span>
                    </td>
                    <td className="py-4 px-3 whitespace-nowrap text-sm text-center font-bold text-emerald-700 bg-emerald-50">
                      <span
                        className={`px-3 py-1 rounded-full text-emerald-800 ${
                          balances.umumBalance < 0
                            ? "bg-rose-100 text-rose-800"
                            : "bg-emerald-100"
                        }`}
                      >
                        {balances.umumBalance}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="bg-default-100 border-t-2 border-default-300">
              <tr>
                <td className="py-4 px-4 whitespace-nowrap text-sm font-bold text-default-800 border-r-2 border-default-300 bg-default-100">
                  TOTAL
                </td>

                {/* Cuti Tahunan totals */}
                <td className="py-4 px-3 whitespace-nowrap text-sm text-center font-bold text-sky-800 border-r border-sky-200 bg-sky-50">
                  <span className="px-2 py-1 rounded-full bg-sky-200 text-sky-900">
                    {Object.values(monthlySummary).reduce(
                      (sum, month) => sum + month.cuti_tahunan.days,
                      0
                    )}
                  </span>
                </td>
                <td className="py-4 px-3 whitespace-nowrap text-sm text-center font-bold text-sky-800 border-r border-sky-200 bg-sky-50">
                  <span className="font-bold">
                    {formatCurrency(
                      Object.values(monthlySummary).reduce(
                        (sum, month) => sum + month.cuti_tahunan.amount,
                        0
                      )
                    )}
                  </span>
                </td>
                <td className="py-4 px-3 whitespace-nowrap text-sm text-center font-bold text-sky-800 border-r-2 border-default-300 bg-sky-100">
                  <span
                    className={`px-3 py-1 rounded-full font-bold ${
                      leaveBalances.cuti_tahunan_total -
                        (leaveTaken.cuti_tahunan || 0) <
                      0
                        ? "bg-rose-200 text-rose-900"
                        : "bg-sky-200 text-sky-900"
                    }`}
                  >
                    {leaveBalances.cuti_tahunan_total -
                      (leaveTaken.cuti_tahunan || 0)}
                  </span>
                </td>

                {/* Cuti Sakit totals */}
                <td className="py-4 px-3 whitespace-nowrap text-sm text-center font-bold text-amber-800 border-r border-amber-200 bg-amber-50">
                  <span className="px-2 py-1 rounded-full bg-amber-200 text-amber-900">
                    {Object.values(monthlySummary).reduce(
                      (sum, month) => sum + month.cuti_sakit.days,
                      0
                    )}
                  </span>
                </td>
                <td className="py-4 px-3 whitespace-nowrap text-sm text-center font-bold text-amber-800 border-r border-amber-200 bg-amber-50">
                  <span className="font-bold">
                    {formatCurrency(
                      Object.values(monthlySummary).reduce(
                        (sum, month) => sum + month.cuti_sakit.amount,
                        0
                      )
                    )}
                  </span>
                </td>
                <td className="py-4 px-3 whitespace-nowrap text-sm text-center font-bold text-amber-800 border-r-2 border-default-300 bg-amber-100">
                  <span
                    className={`px-3 py-1 rounded-full font-bold ${
                      leaveBalances.cuti_sakit_total -
                        (leaveTaken.cuti_sakit || 0) <
                      0
                        ? "bg-rose-200 text-rose-900"
                        : "bg-amber-200 text-amber-900"
                    }`}
                  >
                    {leaveBalances.cuti_sakit_total -
                      (leaveTaken.cuti_sakit || 0)}
                  </span>
                </td>

                {/* Cuti Umum totals */}
                <td className="py-4 px-3 whitespace-nowrap text-sm text-center font-bold text-emerald-800 border-r border-emerald-200 bg-emerald-50">
                  <span className="px-2 py-1 rounded-full bg-emerald-200 text-emerald-900">
                    {Object.values(monthlySummary).reduce(
                      (sum, month) => sum + month.cuti_umum.days,
                      0
                    )}
                  </span>
                </td>
                <td className="py-4 px-3 whitespace-nowrap text-sm text-center font-bold text-emerald-800 border-r border-emerald-200 bg-emerald-50">
                  <span className="font-bold">
                    {formatCurrency(
                      Object.values(monthlySummary).reduce(
                        (sum, month) => sum + month.cuti_umum.amount,
                        0
                      )
                    )}
                  </span>
                </td>
                <td className="py-4 px-3 whitespace-nowrap text-sm text-center font-bold text-emerald-800 bg-emerald-100">
                  <span
                    className={`px-3 py-1 rounded-full font-bold ${
                      leaveBalances.cuti_umum_total -
                        (leaveTaken.cuti_umum || 0) <
                      0
                        ? "bg-rose-200 text-rose-900"
                        : "bg-emerald-200 text-emerald-900"
                    }`}
                  >
                    {leaveBalances.cuti_umum_total -
                      (leaveTaken.cuti_umum || 0)}
                  </span>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Legend */}
        <div className="mt-4 flex flex-wrap gap-4 text-xs text-default-600 bg-default-50 p-3 rounded-lg">
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
        </div>
      </div>
    );
  };

  return (
    <div className={`relative w-full mb-2`}>
      {/* --- Conditional Rendering: Show Cards or Detail View --- */}
      {!selectedStaffId && !loadingStaffs && (
        <>
          <div className="flex flex-col md:flex-row justify-between items-center gap-4 mb-4">
            {/* Search Input */}
            <div className="flex-1 max-w-md">
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <IconSearch size={20} className="text-default-400" />
                </div>
                <input
                  type="text"
                  className="block w-full pl-10 pr-3 py-2 border border-default-300 rounded-full leading-5 bg-white placeholder-default-500 focus:outline-none focus:placeholder-default-400 focus:ring-1 focus:ring-sky-500 focus:border-sky-500 sm:text-sm"
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
          <div className="max-h-[calc(100vh-300px)] overflow-y-auto border border-default-200 rounded-lg bg-white shadow-sm p-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {filteredEmployees.map((employee) => (
                <EmployeeCard
                  key={employee.id}
                  employee={employee}
                  onClick={handleEmployeeCardClick}
                />
              ))}
            </div>

            {filteredEmployees.length === 0 && searchQuery && (
              <div className="text-center py-16 border border-dashed border-default-300 rounded-lg">
                <p className="text-default-600">
                  No employees found matching "{searchQuery}"
                </p>
              </div>
            )}
          </div>
        </>
      )}

      {/* --- Loading State --- */}
      {loadingStaffs && !selectedStaffId && (
        <div className="flex justify-center items-center h-40">
          <LoadingSpinner />
          <span className="ml-3 text-default-600">Loading employees...</span>
        </div>
      )}

      {/* --- Detail View (Employee Selected) --- */}
      {selectedStaffId && (
        <>
          {/* --- Employee Selection Combobox and Info (Only shows after selection) --- */}
          <div className="mb-4 mt-1 flex flex-col md:flex-row md:items-center md:justify-between gap-4 rounded-lg border border-default-200 bg-white p-4 shadow-sm">
            <div className="flex-shrink-0">
              <button
                onClick={() => {
                  setSelectedStaffId(null);
                  setSearchQuery("");
                }}
                className="text-sm text-sky-600 hover:text-sky-800 font-medium flex items-center gap-1"
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
                disabled={loadingStaffs}
              />
            </div>
          </div>

          {/* Loading state for report */}
          {loadingReport && (
            <div className="flex justify-center items-center h-40">
              <LoadingSpinner />
            </div>
          )}

          {/* Error state */}
          {!loadingReport && reportError && (
            <div className="text-center py-16 bg-white rounded-xl border border-dashed border-rose-300">
              <IconAlertCircle className="mx-auto text-rose-500 h-12 w-12" />
              <p className="mt-4 text-rose-600 font-medium">{reportError}</p>
            </div>
          )}

          {/* Report content */}
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

export default CutiReportPage;
