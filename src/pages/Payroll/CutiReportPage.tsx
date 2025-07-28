// src/pages/Payroll/CutiReportPage.tsx

import React, { useState, useMemo, useEffect } from "react";
import { useStaffsCache } from "../../utils/catalogue/useStaffsCache";
import { FormCombobox } from "../../components/FormComponents";
import { Employee } from "../../types/types";
import {
  IconCalendar,
  IconBriefcase,
  IconUserCircle,
  IconClockHour4,
  IconAlertCircle,
  IconId,
  IconWorld,
} from "@tabler/icons-react";
import LoadingSpinner from "../../components/LoadingSpinner";
import { getMonthName } from "../../utils/payroll/payrollUtils";
import { api } from "../../routes/utils/api";
import { calculateYearsOfService } from "../../utils/payroll/leaveCalculationService";

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

  const renderStaffHeader = (staff: Employee) => (
    <div className="bg-white px-6 py-4 rounded-xl border border-default-200">
      <div className="flex items-center gap-4">
        <IconUserCircle size={48} className="text-default-400" />
        <div>
          <h2 className="text-xl font-bold text-default-800">{staff.name}</h2>
          <p className="text-default-500">{staff.id}</p>
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
                  Days
                </th>
                <th className="py-3 px-3 text-center text-xs font-medium text-sky-700 uppercase border-r border-sky-200 bg-sky-50">
                  Amount
                </th>
                <th className="py-3 px-3 text-center text-xs font-medium text-sky-700 uppercase border-r-2 border-default-300 bg-sky-50">
                  Balance
                </th>
                {/* Cuti Sakit sub-headers */}
                <th className="py-3 px-3 text-center text-xs font-medium text-amber-700 uppercase border-r border-amber-200 bg-amber-50">
                  Days
                </th>
                <th className="py-3 px-3 text-center text-xs font-medium text-amber-700 uppercase border-r border-amber-200 bg-amber-50">
                  Amount
                </th>
                <th className="py-3 px-3 text-center text-xs font-medium text-amber-700 uppercase border-r-2 border-default-300 bg-amber-50">
                  Balance
                </th>
                {/* Cuti Umum sub-headers */}
                <th className="py-3 px-3 text-center text-xs font-medium text-emerald-700 uppercase border-r border-emerald-200 bg-emerald-50">
                  Days
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
    <div className="mt-4">
      <div className="max-w-md mb-4">
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

      {(loadingStaffs || loadingReport) && <LoadingSpinner />}

      {!loadingReport && reportError && (
        <div className="text-center py-16 bg-white rounded-xl border border-dashed border-rose-300">
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

      {!loadingStaffs && !loadingReport && !selectedStaffId && (
        <div className="text-center py-16 bg-white rounded-xl border border-dashed">
          <p className="text-default-600">
            Please select a staff member to view their leave report.
          </p>
        </div>
      )}
    </div>
  );
};

export default CutiReportPage;
