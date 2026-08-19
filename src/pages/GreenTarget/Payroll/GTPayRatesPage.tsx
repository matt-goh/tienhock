// src/pages/GreenTarget/Payroll/GTPayRatesPage.tsx
// Green Target "Employee Pay Rates": manage GT-scoped pay-rate overrides and
// scheduled rate changes on top of the shared Tien Hock catalogue. For
// dual-company staff (e.g. the directors) the shared rate IS the Tien Hock
// rate — GT overrides/schedules let GT pay a different rate without touching
// TH. Resolution: GT schedule > GT override > shared (see gtPayRates.ts).
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { IconChevronDown, IconChevronRight, IconPencil } from "@tabler/icons-react";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";

import BackButton from "../../../components/BackButton";
import LoadingSpinner from "../../../components/LoadingSpinner";
import MonthNavigator from "../../../components/MonthNavigator";
import GTEditPayCodeRatesModal from "../../../components/GreenTarget/GTEditPayCodeRatesModal";
import { api } from "../../../routes/utils/api";
import { useGTPayrollEmployees } from "../../../utils/greenTarget/useGTPayrollEmployees";
import { useJobPayCodeMappings } from "../../../utils/catalogue/useJobPayCodeMappings";
import {
  groupGTOverridesByEmployee,
  resolveGTPayRates,
  toNullableNumber,
  GTRateSource,
  GTPayCodeOverride,
  GTPayRateSchedule,
  GTSubRates,
} from "../../../utils/greenTarget/gtPayRates";

const GT_OFFICE_JOB = "OFFICE";

// One pay code row after the shared merge (employee mapping wins over the
// OFFICE job mapping), carrying the resolved shared sub-rates.
interface MergedPayCode {
  pay_code_id: string;
  description: string;
  pay_type: string;
  rate_unit: string;
  source: "job" | "employee";
  shared: GTSubRates;
}

interface EditingTarget {
  employeeId: string;
  employeeName: string;
  payCode: MergedPayCode;
}

const GTPayRatesPage: React.FC = () => {
  const { t } = useTranslation("greentarget");
  const {
    employees,
    loading: loadingEmployees,
    refreshEmployees,
  } = useGTPayrollEmployees();
  const {
    detailedMappings: jobPayCodeDetails,
    employeeMappings,
    loading: loadingPayCodes,
  } = useJobPayCodeMappings();

  const [selectedMonth, setSelectedMonth] = useState<Date>(() => new Date());
  const [gtOverrides, setGtOverrides] = useState<
    Record<string, Record<string, GTPayCodeOverride>>
  >({});
  const [gtSchedules, setGtSchedules] = useState<
    Record<string, GTPayRateSchedule[]>
  >({});
  const [loadingGTRates, setLoadingGTRates] = useState(true);
  const [expandedEmployees, setExpandedEmployees] = useState<
    Record<string, boolean>
  >({});
  const [editing, setEditing] = useState<EditingTarget | null>(null);

  const selectedYear = selectedMonth.getFullYear();
  const selectedMonthNumber = selectedMonth.getMonth() + 1;

  const fetchGTRates = useCallback(async () => {
    setLoadingGTRates(true);
    try {
      const overridesResponse = await api.get(
        "/greentarget/api/employee-pay-codes/"
      );
      setGtOverrides(
        groupGTOverridesByEmployee(overridesResponse?.mappings || [])
      );
      const scheduleEntries = await Promise.all(
        employees.map(async (emp) => {
          try {
            const schedulesResponse = await api.get(
              `/greentarget/api/employee-pay-codes/${emp.employee_id}/schedules`
            );
            return [emp.employee_id, schedulesResponse?.schedules || []] as [
              string,
              GTPayRateSchedule[]
            ];
          } catch {
            return [emp.employee_id, []] as [string, GTPayRateSchedule[]];
          }
        })
      );
      setGtSchedules(Object.fromEntries(scheduleEntries));
    } catch (error) {
      console.error("Error fetching GT pay rates:", error);
      toast.error(t("Failed to load GT pay rates"));
    } finally {
      setLoadingGTRates(false);
    }
  }, [employees, t]);

  useEffect(() => {
    if (!loadingEmployees) fetchGTRates();
  }, [loadingEmployees, fetchGTRates]);

  // Same merge the Office monthly log page uses: OFFICE job pay codes plus the
  // employee's own shared mappings, employee rows winning on the same pay code.
  const buildMergedPayCodes = useCallback(
    (employeeId: string): MergedPayCode[] => {
      const jobCodes = jobPayCodeDetails[GT_OFFICE_JOB] || [];
      const empCodes = employeeMappings[employeeId] || [];

      const merged = new Map<string, any>();
      jobCodes.forEach((pc: any) =>
        merged.set(pc.pay_code_id, { ...pc, source: "job" })
      );
      empCodes.forEach((pc: any) =>
        merged.set(pc.pay_code_id, { ...pc, source: "employee" })
      );

      return Array.from(merged.values()).map((pc: any): MergedPayCode => ({
        pay_code_id: pc.pay_code_id,
        description: pc.description,
        pay_type: pc.pay_type,
        rate_unit: pc.rate_unit,
        source: pc.source,
        shared: {
          biasa: pc.override_rate_biasa ?? pc.rate_biasa ?? null,
          ahad: pc.override_rate_ahad ?? pc.rate_ahad ?? null,
          umum: pc.override_rate_umum ?? pc.rate_umum ?? null,
        },
      }));
    },
    [jobPayCodeDetails, employeeMappings]
  );

  const toggleEmployee = (employeeId: string): void => {
    setExpandedEmployees((prev) => ({
      ...prev,
      [employeeId]: !prev[employeeId],
    }));
  };

  const handleSaved = useCallback((): void => {
    fetchGTRates();
    refreshEmployees();
  }, [fetchGTRates, refreshEmployees]);

  const renderRateTriplet = (
    rates: GTSubRates,
    blankDash: boolean
  ): React.ReactNode => {
    const render = (label: string, value: number | string | null) => {
      const rate = toNullableNumber(value);
      return (
        <span key={label} className="whitespace-nowrap">
          <span className="text-default-400 dark:text-gray-500">{label}</span>{" "}
          {rate === null && blankDash ? "—" : rate?.toFixed(2) ?? "—"}
        </span>
      );
    };
    return (
      <span className="inline-flex gap-2">
        {render("B", rates.biasa)}
        {render("A", rates.ahad)}
        {render("U", rates.umum)}
      </span>
    );
  };

  const sourceBadge = (source: GTRateSource): React.ReactNode => {
    const styles: Record<GTRateSource, string> = {
      gt_schedule:
        "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300",
      gt_override:
        "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
      shared:
        "bg-default-100 text-default-600 dark:bg-gray-700 dark:text-gray-300",
    };
    const labels: Record<GTRateSource, string> = {
      gt_schedule: t("GT schedule"),
      gt_override: t("GT rate"),
      shared: t("Shared rate"),
    };
    return (
      <span
        className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${styles[source]}`}
      >
        {labels[source]}
      </span>
    );
  };

  const isLoading = loadingEmployees || loadingPayCodes || loadingGTRates;

  const monthLabel = useMemo(
    () =>
      selectedMonth.toLocaleDateString("en-MY", {
        month: "long",
        year: "numeric",
      }),
    [selectedMonth]
  );

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-96">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header & effective month */}
      <div className="sticky top-0 z-20 bg-white dark:bg-gray-800 p-4 rounded-lg border border-default-200 dark:border-gray-700">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-4">
            <BackButton fallbackPath="/greentarget/payroll" />
            <div className="h-6 w-px bg-default-300 dark:bg-gray-600" />
            <h1 className="text-lg font-semibold text-default-800 dark:text-gray-100">
              {t("Employee Pay Rates")}
            </h1>
            <div className="w-px h-6 bg-default-300 dark:bg-gray-600" />
            <MonthNavigator
              selectedMonth={selectedMonth}
              onChange={setSelectedMonth}
              showGoToCurrentButton={true}
              allowFutureMonths={true}
            />
          </div>
        </div>
        <p className="mt-2 text-xs text-default-500 dark:text-gray-400">
          {t(
            "GT rates are layered over the shared Tien Hock catalogue: a scheduled change beats a GT override, which beats the shared rate."
          )}
        </p>
      </div>

      {/* Employee list */}
      <div className="space-y-3">
        {employees.length === 0 && (
          <div className="rounded-lg border border-default-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6 text-center text-sm text-default-500 dark:text-gray-400">
            {t("No records")}
          </div>
        )}
        {employees.map((emp) => {
          const isExpanded = !!expandedEmployees[emp.employee_id];
          const payCodes = isExpanded
            ? buildMergedPayCodes(emp.employee_id)
            : [];
          const employeeOverrides = gtOverrides[emp.employee_id] || {};
          const overrideCount = Object.keys(employeeOverrides).length;
          const scheduleCount = (gtSchedules[emp.employee_id] || []).length;

          return (
            <div
              key={emp.employee_id}
              className="rounded-lg border border-default-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden"
            >
              <button
                type="button"
                onClick={() => toggleEmployee(emp.employee_id)}
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-default-50 dark:hover:bg-gray-700/40 transition-colors"
              >
                <div className="flex items-center gap-3">
                  {isExpanded ? (
                    <IconChevronDown
                      size={18}
                      className="text-default-400 dark:text-gray-500"
                    />
                  ) : (
                    <IconChevronRight
                      size={18}
                      className="text-default-400 dark:text-gray-500"
                    />
                  )}
                  <span className="font-medium text-default-800 dark:text-gray-100">
                    {emp.employee_name}
                  </span>
                  <span className="text-xs text-default-400 dark:text-gray-500">
                    {emp.employee_id} · {emp.job_type}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  {overrideCount > 0 && (
                    <span className="rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 px-2 py-0.5 font-medium">
                      {t("{{count}} GT rate", {
                        count: overrideCount,
                      })}
                    </span>
                  )}
                  {scheduleCount > 0 && (
                    <span className="rounded-full bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300 px-2 py-0.5 font-medium">
                      {t("{{count}} scheduled", { count: scheduleCount })}
                    </span>
                  )}
                </div>
              </button>

              {isExpanded && (
                <div className="border-t border-default-200 dark:border-gray-700">
                  {payCodes.length === 0 ? (
                    <p className="px-4 py-3 text-sm text-default-500 dark:text-gray-400">
                      {t("No pay codes mapped for this employee.")}
                    </p>
                  ) : (
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-default-200 dark:border-gray-700 text-left text-xs uppercase text-default-400 dark:text-gray-500">
                          <th className="px-4 py-2 font-medium">
                            {t("Pay Code")}
                          </th>
                          <th className="px-4 py-2 font-medium">
                            {t("Shared (Tien Hock) Rate")}
                          </th>
                          <th className="px-4 py-2 font-medium">
                            {t("GT Override")}
                          </th>
                          <th className="px-4 py-2 font-medium">
                            {t("Effective Rate ({{month}})", {
                              month: monthLabel,
                            })}
                          </th>
                          <th className="px-4 py-2 font-medium">
                            {t("Source")}
                          </th>
                          <th className="px-4 py-2 font-medium w-10" />
                        </tr>
                      </thead>
                      <tbody>
                        {payCodes.map((pc) => {
                          const override = employeeOverrides[pc.pay_code_id];
                          const resolved = resolveGTPayRates({
                            payCodeId: pc.pay_code_id,
                            shared: pc.shared,
                            gtOverride: override ?? null,
                            gtSchedules:
                              gtSchedules[emp.employee_id] || [],
                            year: selectedYear,
                            month: selectedMonthNumber,
                          });
                          return (
                            <tr
                              key={pc.pay_code_id}
                              className="border-b border-default-100 dark:border-gray-700/60 last:border-0 hover:bg-default-50 dark:hover:bg-gray-700/30"
                            >
                              <td className="px-4 py-2">
                                <div className="font-medium text-default-700 dark:text-gray-200">
                                  {pc.pay_code_id}
                                </div>
                                <div className="text-xs text-default-400 dark:text-gray-500">
                                  {pc.description} · {pc.rate_unit}
                                </div>
                              </td>
                              <td className="px-4 py-2 text-default-600 dark:text-gray-300">
                                {renderRateTriplet(pc.shared, false)}
                              </td>
                              <td className="px-4 py-2 text-default-600 dark:text-gray-300">
                                {override
                                  ? renderRateTriplet(
                                      {
                                        biasa: override.override_rate_biasa,
                                        ahad: override.override_rate_ahad,
                                        umum: override.override_rate_umum,
                                      },
                                      true
                                    )
                                  : "—"}
                              </td>
                              <td className="px-4 py-2 font-medium text-default-800 dark:text-gray-100">
                                {renderRateTriplet(
                                  {
                                    biasa: resolved.rate_biasa,
                                    ahad: resolved.rate_ahad,
                                    umum: resolved.rate_umum,
                                  },
                                  false
                                )}
                              </td>
                              <td className="px-4 py-2">
                                {sourceBadge(resolved.source)}
                              </td>
                              <td className="px-4 py-2">
                                <button
                                  type="button"
                                  onClick={() =>
                                    setEditing({
                                      employeeId: emp.employee_id,
                                      employeeName: emp.employee_name,
                                      payCode: pc,
                                    })
                                  }
                                  className="p-1 text-default-400 hover:text-sky-600 dark:hover:text-sky-400"
                                  title={t("Edit GT rates")}
                                >
                                  <IconPencil size={16} />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {editing && (
        <GTEditPayCodeRatesModal
          isOpen={!!editing}
          onClose={() => setEditing(null)}
          employeeId={editing.employeeId}
          employeeName={editing.employeeName}
          payCodeId={editing.payCode.pay_code_id}
          payCodeDescription={editing.payCode.description}
          sharedRates={editing.payCode.shared}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
};

export default GTPayRatesPage;
