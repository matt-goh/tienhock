// src/pages/JellyPolly/Payroll/JPDailyPlasticEntryPage.tsx
// Jelly Polly Daily Machine Plastic entry (JP-exclusive page).
// Per staff row: 30ml cartons, 70ml cartons; page-level day/night shift.
// Stored as a jellypolly.daily_work_logs header (section PLASTIC) with one
// entry per staff and JP_CTN_30ML / JP_CTN_70ML activities. Staff with
// multiple IDs enter cartons under their sub IDs; payroll processing rolls the
// pay up into the HEAD id (source_employee_id keeps the sub ID).
import React, { useState, useEffect, useMemo, useCallback } from "react";
import { format } from "date-fns";
import { IconDeviceFloppy, IconTrash } from "@tabler/icons-react";
import toast from "react-hot-toast";
import Button from "../../../components/Button";
import LoadingSpinner from "../../../components/LoadingSpinner";
import ConfirmationDialog from "../../../components/ConfirmationDialog";
import TimeNavigator from "../../../components/TimeNavigator";
import { api } from "../../../routes/utils/api";
import { useJPStaffsCache } from "../../../utils/JellyPolly/useJPStaffsCache";
import { useJPJobPayCodeMappings } from "../../../utils/JellyPolly/useJPJobPayCodeMappings";
import { useHolidayCache } from "../../../utils/payroll/useHolidayCache";

const SECTION = "PLASTIC";
const JOB_ID = "JP_PLASTIC";
const PAY_CODE_30ML = "JP_CTN_30ML";
const PAY_CODE_70ML = "JP_CTN_70ML";

type DayType = "Biasa" | "Ahad" | "Umum";

interface PlasticRow {
  employeeId: string;
  employeeName: string;
  headStaffId: string | null;
  cartons30ml: number;
  cartons70ml: number;
}

interface RateSet {
  rate_biasa: number;
  rate_ahad: number;
  rate_umum: number;
}

const JPDailyPlasticEntryPage: React.FC = () => {
  const { staffs, loading: loadingStaffs } = useJPStaffsCache();
  const { detailedMappings, loading: loadingPayCodes } =
    useJPJobPayCodeMappings();
  const { isHoliday, getHolidayDescription } = useHolidayCache();

  const [logDate, setLogDate] = useState<string>(
    format(new Date(), "yyyy-MM-dd")
  );
  const [shift, setShift] = useState<"1" | "2">("1");
  const [rows, setRows] = useState<Record<string, PlasticRow>>({});
  const [existingLogId, setExistingLogId] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [showClearDialog, setShowClearDialog] = useState<boolean>(false);

  const dayType = useMemo<DayType>(() => {
    const date = new Date(logDate);
    if (isHoliday(date)) return "Umum";
    if (date.getDay() === 0) return "Ahad";
    return "Biasa";
  }, [logDate, isHoliday]);

  const staffNameById = useMemo((): Map<string, string> => {
    return new Map(staffs.map((s) => [s.id, s.name]));
  }, [staffs]);

  // Staff holding the JP_PLASTIC job (staffs.job), sub-IDs listed individually
  const plasticStaff = useMemo(() => {
    return staffs
      .filter((staff) => Array.isArray(staff.job) && staff.job.includes(JOB_ID))
      .map((staff) => ({
        employeeId: staff.id,
        employeeName: staff.name || staff.id,
        headStaffId: staff.headStaffId ?? null,
      }))
      .sort((a, b) => a.employeeName.localeCompare(b.employeeName));
  }, [staffs]);

  // Rate per pay code for the current day type (job mapping override wins)
  const rateFor = useCallback(
    (payCodeId: string): number => {
      const mapping = (detailedMappings[JOB_ID] || []).find(
        (pc: RateSet & { id: string; override_rate_biasa: number | null }) =>
          pc.id === payCodeId
      ) as any;
      if (!mapping) return 0;
      const base =
        dayType === "Ahad"
          ? mapping.override_rate_ahad ?? mapping.rate_ahad
          : dayType === "Umum"
          ? mapping.override_rate_umum ?? mapping.rate_umum
          : mapping.override_rate_biasa ?? mapping.rate_biasa;
      return Number(base) || 0;
    },
    [detailedMappings, dayType]
  );

  const rate30ml = rateFor(PAY_CODE_30ML);
  const rate70ml = rateFor(PAY_CODE_70ML);

  // Load the saved log for this date+shift (if any) and build rows
  useEffect(() => {
    let cancelled = false;
    const loadExisting = async (): Promise<void> => {
      if (loadingStaffs) return;
      setIsLoading(true);
      try {
        const listResponse = await api.get(
          `/jellypolly/api/daily-work-logs?startDate=${logDate}&endDate=${logDate}&section=${SECTION}&shift=${shift}`
        );
        const existing = (listResponse.logs || [])[0] || null;

        const baseRows: Record<string, PlasticRow> = {};
        for (const staff of plasticStaff) {
          baseRows[staff.employeeId] = {
            employeeId: staff.employeeId,
            employeeName: staff.employeeName,
            headStaffId: staff.headStaffId,
            cartons30ml: 0,
            cartons70ml: 0,
          };
        }

        if (existing) {
          const detail = await api.get(
            `/jellypolly/api/daily-work-logs/${existing.id}`
          );
          for (const entry of detail.employeeEntries || []) {
            const row = baseRows[entry.employee_id] || {
              employeeId: entry.employee_id,
              employeeName:
                entry.employee_name ||
                staffNameById.get(entry.employee_id) ||
                entry.employee_id,
              headStaffId: null,
              cartons30ml: 0,
              cartons70ml: 0,
            };
            for (const activity of entry.activities || []) {
              if (activity.pay_code_id === PAY_CODE_30ML) {
                row.cartons30ml = Number(activity.units_produced) || 0;
              } else if (activity.pay_code_id === PAY_CODE_70ML) {
                row.cartons70ml = Number(activity.units_produced) || 0;
              }
            }
            baseRows[entry.employee_id] = row;
          }
          if (!cancelled) setExistingLogId(existing.id);
        } else if (!cancelled) {
          setExistingLogId(null);
        }

        if (!cancelled) setRows(baseRows);
      } catch (error) {
        console.error("Error loading plastic entry:", error);
        toast.error("Failed to load plastic entry");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    loadExisting();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logDate, shift, plasticStaff, loadingStaffs]);

  const handleCartonChange = (
    employeeId: string,
    field: "cartons30ml" | "cartons70ml",
    value: string
  ): void => {
    const cartons = Math.max(0, parseInt(value) || 0);
    setRows((prev) => ({
      ...prev,
      [employeeId]: { ...prev[employeeId], [field]: cartons },
    }));
  };

  const rowAmount = (row: PlasticRow): number =>
    Math.round((row.cartons30ml * rate30ml + row.cartons70ml * rate70ml) * 100) /
    100;

  const totals = useMemo(() => {
    const rowList = Object.values(rows);
    return {
      cartons30ml: rowList.reduce((sum, r) => sum + r.cartons30ml, 0),
      cartons70ml: rowList.reduce((sum, r) => sum + r.cartons70ml, 0),
      amount: rowList.reduce((sum, r) => sum + rowAmount(r), 0),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, rate30ml, rate70ml]);

  const handleSave = async (): Promise<void> => {
    const activeRows = Object.values(rows).filter(
      (row) => row.cartons30ml > 0 || row.cartons70ml > 0
    );
    if (activeRows.length === 0) {
      toast.error("Enter cartons for at least one staff member");
      return;
    }

    const employeeEntries = activeRows.map((row) => {
      const activities = [];
      if (row.cartons30ml > 0) {
        activities.push({
          payCodeId: PAY_CODE_30ML,
          rateUnit: "Ctn",
          payType: "Base",
          isSelected: true,
          unitsProduced: row.cartons30ml,
          rate: rate30ml,
          calculatedAmount:
            Math.round(row.cartons30ml * rate30ml * 100) / 100,
        });
      }
      if (row.cartons70ml > 0) {
        activities.push({
          payCodeId: PAY_CODE_70ML,
          rateUnit: "Ctn",
          payType: "Base",
          isSelected: true,
          unitsProduced: row.cartons70ml,
          rate: rate70ml,
          calculatedAmount:
            Math.round(row.cartons70ml * rate70ml * 100) / 100,
        });
      }
      return {
        employeeId: row.employeeId,
        jobType: JOB_ID,
        hours: 0,
        activities,
      };
    });

    const payload = {
      logDate,
      shift: parseInt(shift),
      dayType,
      section: SECTION,
      contextData: {},
      status: "Submitted",
      employeeEntries,
    };

    setIsSaving(true);
    try {
      if (existingLogId) {
        await api.put(`/jellypolly/api/daily-work-logs/${existingLogId}`, payload);
      } else {
        const response = await api.post("/jellypolly/api/daily-work-logs", payload);
        setExistingLogId(response.workLogId);
      }
      toast.success("Plastic entry saved and payroll updated");
    } catch (error: unknown) {
      console.error("Error saving plastic entry:", error);
      const message =
        error instanceof Error ? error.message : "Failed to save plastic entry";
      toast.error(message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleClear = async (): Promise<void> => {
    if (!existingLogId) return;
    try {
      await api.delete(`/jellypolly/api/daily-work-logs/${existingLogId}`);
      setExistingLogId(null);
      setRows((prev) => {
        const cleared: Record<string, PlasticRow> = {};
        for (const [id, row] of Object.entries(prev)) {
          cleared[id] = { ...row, cartons30ml: 0, cartons70ml: 0 };
        }
        return cleared;
      });
      toast.success("Plastic entry cleared");
    } catch (error) {
      console.error("Error clearing plastic entry:", error);
      toast.error("Failed to clear plastic entry");
    } finally {
      setShowClearDialog(false);
    }
  };

  const selectedDateRange = useMemo(
    () => ({
      start: new Date(`${logDate}T00:00:00`),
      end: new Date(`${logDate}T23:59:59`),
    }),
    [logDate]
  );

  const rowList = Object.values(rows).sort((a, b) =>
    a.employeeName.localeCompare(b.employeeName) ||
    a.employeeId.localeCompare(b.employeeId)
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row justify-between md:items-end gap-3">
        <div>
          <h1 className="text-xl font-semibold text-default-800 dark:text-gray-100">
            Daily Machine Plastic
          </h1>
          <p className="text-sm text-default-500 dark:text-gray-400">
            30ml / 70ml carton production per staff. Sub-ID entries roll up into
            the HEAD staff's payroll.
          </p>
        </div>
        <div className="flex items-end flex-wrap gap-3">
          <div>
            <label className="block text-sm font-medium text-default-700 dark:text-gray-200 mb-1">
              Date
            </label>
            <TimeNavigator
              range={selectedDateRange}
              onChange={(range: { start: Date }) =>
                setLogDate(format(range.start, "yyyy-MM-dd"))
              }
              modes={["day"]}
              presets={false}
              allowFuture
              size="sm"
            />
          </div>
          <span
            className={`inline-flex items-center px-3 py-2 rounded-lg text-sm font-medium ${
              dayType === "Umum"
                ? "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300"
                : dayType === "Ahad"
                ? "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300"
                : "bg-default-100 dark:bg-gray-700 text-default-700 dark:text-gray-200"
            }`}
          >
            {dayType}
            {dayType === "Umum" &&
              getHolidayDescription(new Date(logDate)) && (
                <span className="ml-1 text-xs font-normal">
                  ({getHolidayDescription(new Date(logDate))})
                </span>
              )}
          </span>
          {/* Day / Night shift toggle */}
          <div className="flex rounded-lg border border-default-200 dark:border-gray-600 overflow-hidden">
            {(["1", "2"] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setShift(value)}
                className={`px-4 py-2 text-sm font-medium transition-colors ${
                  shift === value
                    ? "bg-sky-600 text-white"
                    : "bg-white dark:bg-gray-800 text-default-600 dark:text-gray-300 hover:bg-default-50 dark:hover:bg-gray-700"
                }`}
              >
                {value === "1" ? "Day Shift" : "Night Shift"}
              </button>
            ))}
          </div>
        </div>
      </div>

      {isLoading || loadingPayCodes ? (
        <div className="flex justify-center py-16">
          <LoadingSpinner />
        </div>
      ) : rowList.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-8 text-center">
          <p className="text-default-500 dark:text-gray-400">
            No staff assigned to Daily Machine Plastic. Assign staff on the
            Staff Assignment page first.
          </p>
        </div>
      ) : (
        <>
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-x-auto">
            <table className="min-w-full divide-y divide-default-200 dark:divide-gray-700">
              <thead className="bg-default-50 dark:bg-gray-900/50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-default-500 dark:text-gray-400 uppercase">
                    Staff
                  </th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-default-500 dark:text-gray-400 uppercase">
                    30ml Cartons (RM {rate30ml.toFixed(2)}/ctn)
                  </th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-default-500 dark:text-gray-400 uppercase">
                    70ml Cartons (RM {rate70ml.toFixed(2)}/ctn)
                  </th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-default-500 dark:text-gray-400 uppercase">
                    Amount
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-default-100 dark:divide-gray-700/60">
                {rowList.map((row) => (
                  <tr key={row.employeeId}>
                    <td className="px-4 py-2">
                      <span className="text-sm text-default-800 dark:text-gray-200">
                        {row.employeeName}
                      </span>
                      <span className="block text-xs text-default-400 dark:text-gray-500">
                        {row.employeeId}
                        {row.headStaffId
                          ? ` · pays to ${row.headStaffId}`
                          : ""}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right">
                      <input
                        type="number"
                        min={0}
                        step={1}
                        value={row.cartons30ml === 0 ? "" : row.cartons30ml}
                        placeholder="0"
                        onChange={(e) =>
                          handleCartonChange(
                            row.employeeId,
                            "cartons30ml",
                            e.target.value
                          )
                        }
                        className="w-28 px-2 py-1.5 text-right text-sm rounded-md border border-default-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-default-800 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-sky-500"
                        disabled={isSaving}
                      />
                    </td>
                    <td className="px-4 py-2 text-right">
                      <input
                        type="number"
                        min={0}
                        step={1}
                        value={row.cartons70ml === 0 ? "" : row.cartons70ml}
                        placeholder="0"
                        onChange={(e) =>
                          handleCartonChange(
                            row.employeeId,
                            "cartons70ml",
                            e.target.value
                          )
                        }
                        className="w-28 px-2 py-1.5 text-right text-sm rounded-md border border-default-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-default-800 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-sky-500"
                        disabled={isSaving}
                      />
                    </td>
                    <td className="px-4 py-2 text-right text-sm font-medium text-default-800 dark:text-gray-200">
                      RM {rowAmount(row).toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-default-50 dark:bg-gray-900/50">
                <tr>
                  <td className="px-4 py-2 text-sm font-semibold text-default-700 dark:text-gray-200">
                    Total
                  </td>
                  <td className="px-4 py-2 text-right text-sm font-semibold text-default-700 dark:text-gray-200">
                    {totals.cartons30ml}
                  </td>
                  <td className="px-4 py-2 text-right text-sm font-semibold text-default-700 dark:text-gray-200">
                    {totals.cartons70ml}
                  </td>
                  <td className="px-4 py-2 text-right text-sm font-bold text-emerald-600 dark:text-emerald-400">
                    RM {totals.amount.toFixed(2)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          <div className="flex justify-end gap-2">
            {existingLogId && (
              <Button
                variant="outline"
                color="rose"
                icon={IconTrash}
                onClick={() => setShowClearDialog(true)}
                disabled={isSaving}
              >
                Clear Day
              </Button>
            )}
            <Button
              color="sky"
              variant="filled"
              icon={IconDeviceFloppy}
              onClick={handleSave}
              disabled={isSaving}
            >
              {isSaving ? "Saving..." : existingLogId ? "Update" : "Save"}
            </Button>
          </div>
        </>
      )}

      <ConfirmationDialog
        isOpen={showClearDialog}
        onClose={() => setShowClearDialog(false)}
        onConfirm={handleClear}
        title="Clear plastic entry"
        message={`Delete the saved plastic entry for ${logDate} (${
          shift === "1" ? "Day" : "Night"
        } shift)? Payroll will be reprocessed without it.`}
        confirmButtonText="Clear"
        variant="danger"
      />
    </div>
  );
};

export default JPDailyPlasticEntryPage;
