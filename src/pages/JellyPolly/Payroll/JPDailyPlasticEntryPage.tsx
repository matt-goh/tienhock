// src/pages/JellyPolly/Payroll/JPDailyPlasticEntryPage.tsx
// Jelly Polly Daily Machine Plastic entry. One card per plastic staff member,
// with saved pay-code lines stored in JP daily work-log activities.
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import {
  IconDeviceFloppy,
  IconEraser,
  IconPlus,
  IconRefresh,
  IconTrash,
} from "@tabler/icons-react";
import toast from "react-hot-toast";
import Button from "../../../components/Button";
import LoadingSpinner from "../../../components/LoadingSpinner";
import ConfirmationDialog from "../../../components/ConfirmationDialog";
import TimeNavigator, { TimeRange } from "../../../components/TimeNavigator";
import { FormCombobox, SelectOption } from "../../../components/FormComponents";
import { api } from "../../../routes/utils/api";
import {
  EmployeePayCodeDetails,
  useJPJobPayCodeMappings,
} from "../../../utils/JellyPolly/useJPJobPayCodeMappings";
import { useJPEffectiveRates } from "../../../utils/JellyPolly/useJPEffectiveRates";
import { useHolidayCache } from "../../../utils/payroll/useHolidayCache";
import { JobPayCodeDetails } from "../../../types/types";

const API_BASE = "/jellypolly/api/daily-plastic";
const JOB_ID = "JP_PLASTIC";

type DayType = "Biasa" | "Ahad" | "Umum";
type PayCodeSource = "job" | "employee";

interface PlasticLine {
  key: string;
  pay_code_id: string;
  description: string;
  quantity: number;
  rate_used: number;
  amount: number;
  rate_unit: string;
}

interface PlasticEntry {
  employee_id: string;
  employee_name: string;
  saved: boolean;
  status: string | null;
  lines: PlasticLine[];
  dirty: boolean;
  savingState: boolean;
}

interface PlasticPayCode {
  id: string;
  description: string;
  pay_type: string;
  rate_unit: string;
  rate_biasa: number | null;
  rate_ahad: number | null;
  rate_umum: number | null;
  override_rate_biasa: number | null;
  override_rate_ahad: number | null;
  override_rate_umum: number | null;
  is_active: boolean;
  source: PayCodeSource;
}

interface ApiPlasticLine {
  pay_code_id: string;
  description?: string | null;
  quantity?: number | string | null;
  rate_used?: number | string | null;
  amount?: number | string | null;
  rate_unit?: string | null;
}

interface ApiPlasticEntry {
  employee_id: string;
  employee_name: string;
  saved: boolean;
  status: string | null;
  lines?: ApiPlasticLine[];
}

const round2 = (value: number): number => Math.round(value * 100) / 100;
const lineAmount = (rate: number, quantity: number): number =>
  round2(rate * quantity);

let keyCounter = 0;
const newKey = (): string => `plastic-line-${Date.now()}-${keyCounter++}`;

const toNumber = (value: number | string | null | undefined): number => {
  const parsed: number = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const formatCurrency = (amount: number): string =>
  new Intl.NumberFormat("en-MY", {
    style: "currency",
    currency: "MYR",
  }).format(amount);

const normalizeJobPayCode = (
  payCode: JobPayCodeDetails,
  source: PayCodeSource
): PlasticPayCode => ({
  id: payCode.id,
  description: payCode.description || payCode.id,
  pay_type: payCode.pay_type,
  rate_unit: payCode.rate_unit || "Fixed",
  rate_biasa: payCode.rate_biasa,
  rate_ahad: payCode.rate_ahad,
  rate_umum: payCode.rate_umum,
  override_rate_biasa: payCode.override_rate_biasa,
  override_rate_ahad: payCode.override_rate_ahad,
  override_rate_umum: payCode.override_rate_umum,
  is_active: payCode.is_active,
  source,
});

const normalizeEmployeePayCode = (
  payCode: EmployeePayCodeDetails,
  source: PayCodeSource
): PlasticPayCode => ({
  id: payCode.id,
  description: payCode.description || payCode.id,
  pay_type: payCode.pay_type,
  rate_unit: payCode.rate_unit || "Fixed",
  rate_biasa: payCode.rate_biasa,
  rate_ahad: payCode.rate_ahad,
  rate_umum: payCode.rate_umum,
  override_rate_biasa: payCode.override_rate_biasa,
  override_rate_ahad: payCode.override_rate_ahad,
  override_rate_umum: payCode.override_rate_umum,
  is_active: payCode.is_active,
  source,
});

const dayRate = (payCode: PlasticPayCode, dayType: DayType): number => {
  const biasaRate: number = toNumber(
    payCode.override_rate_biasa ?? payCode.rate_biasa
  );
  if (dayType === "Ahad") {
    return toNumber(
      payCode.override_rate_ahad ?? payCode.rate_ahad ?? biasaRate
    );
  }
  if (dayType === "Umum") {
    return toNumber(
      payCode.override_rate_umum ?? payCode.rate_umum ?? biasaRate
    );
  }
  return biasaRate;
};

const JPDailyPlasticEntryPage: React.FC = () => {
  const {
    detailedMappings,
    employeeMappings,
    loading: loadingPayCodes,
  } = useJPJobPayCodeMappings();
  const { resolveEffectiveRates, getEffectiveRate } = useJPEffectiveRates();
  const { isHoliday, getHolidayDescription } = useHolidayCache();

  const [selectedDate, setSelectedDate] = useState<string>(
    format(new Date(), "yyyy-MM-dd")
  );
  const [entries, setEntries] = useState<PlasticEntry[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [payCodeQueries, setPayCodeQueries] = useState<Record<string, string>>(
    {}
  );
  const [clearTarget, setClearTarget] = useState<PlasticEntry | null>(null);
  const [isClearing, setIsClearing] = useState<boolean>(false);

  const selectedDateValue = useMemo<Date>(
    () => new Date(`${selectedDate}T00:00:00`),
    [selectedDate]
  );

  const dayType = useMemo<DayType>(() => {
    if (isHoliday(selectedDateValue)) return "Umum";
    if (selectedDateValue.getDay() === 0) return "Ahad";
    return "Biasa";
  }, [isHoliday, selectedDateValue]);

  const dayRange = useMemo<TimeRange>(
    () => ({ start: selectedDateValue, end: selectedDateValue }),
    [selectedDateValue]
  );

  const fetchEntries = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    try {
      const response = await api.get(`${API_BASE}?date=${selectedDate}`);
      const loadedEntries: PlasticEntry[] = (
        (response?.entries || []) as ApiPlasticEntry[]
      ).map(
        (entry: ApiPlasticEntry): PlasticEntry => ({
          employee_id: entry.employee_id,
          employee_name: entry.employee_name,
          saved: entry.saved,
          status: entry.status,
          dirty: false,
          savingState: false,
          lines: (entry.lines || []).map(
            (line: ApiPlasticLine): PlasticLine => {
              const quantity: number = toNumber(line.quantity);
              const rate: number = toNumber(line.rate_used);
              return {
                key: newKey(),
                pay_code_id: line.pay_code_id,
                description: line.description || line.pay_code_id,
                quantity,
                rate_used: rate,
                amount: toNumber(line.amount),
                rate_unit: line.rate_unit || "Fixed",
              };
            }
          ),
        })
      );
      setEntries(loadedEntries);
      setPayCodeQueries({});
    } catch (error: unknown) {
      console.error("Error loading daily plastic:", error);
      toast.error("Failed to load Daily Machine Plastic");
    } finally {
      setIsLoading(false);
    }
  }, [selectedDate]);

  useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

  const employeeIdsKey = useMemo<string>(
    () =>
      entries
        .map((entry: PlasticEntry): string => entry.employee_id)
        .sort()
        .join("|"),
    [entries]
  );

  useEffect(() => {
    if (loadingPayCodes || !employeeIdsKey) {
      resolveEffectiveRates(null, null, []);
      return;
    }

    const year: number = parseInt(selectedDate.slice(0, 4), 10);
    const month: number = parseInt(selectedDate.slice(5, 7), 10);
    const employeeIds: string[] = employeeIdsKey.split("|");
    const seen: Set<string> = new Set<string>();
    const tuples: {
      employee_id: string;
      job_id: string;
      pay_code_id: string;
    }[] = [];

    for (const employeeId of employeeIds) {
      const payCodes: (JobPayCodeDetails | EmployeePayCodeDetails)[] = [
        ...(detailedMappings[JOB_ID] || []),
        ...(employeeMappings[employeeId] || []),
      ];

      for (const payCode of payCodes) {
        const key: string = `${employeeId}|${JOB_ID}|${payCode.id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        tuples.push({
          employee_id: employeeId,
          job_id: JOB_ID,
          pay_code_id: payCode.id,
        });
      }
    }

    resolveEffectiveRates(year, month, tuples);
  }, [
    detailedMappings,
    employeeIdsKey,
    employeeMappings,
    loadingPayCodes,
    resolveEffectiveRates,
    selectedDate,
  ]);

  const applyEffectiveRate = useCallback(
    (payCode: PlasticPayCode, employeeId: string): PlasticPayCode => {
      const effectiveRate = getEffectiveRate(employeeId, JOB_ID, payCode.id);
      if (!effectiveRate) return payCode;
      return {
        ...payCode,
        override_rate_biasa: effectiveRate.rate_biasa,
        override_rate_ahad: effectiveRate.rate_ahad,
        override_rate_umum: effectiveRate.rate_umum,
      };
    },
    [getEffectiveRate]
  );

  const payCodesByEmployee = useMemo<Record<string, PlasticPayCode[]>>(() => {
    const result: Record<string, PlasticPayCode[]> = {};

    for (const entry of entries) {
      const merged: Map<string, PlasticPayCode> = new Map<
        string,
        PlasticPayCode
      >();

      for (const payCode of detailedMappings[JOB_ID] || []) {
        const normalized: PlasticPayCode = normalizeJobPayCode(payCode, "job");
        if (normalized.is_active !== false) {
          merged.set(normalized.id, normalized);
        }
      }

      for (const payCode of employeeMappings[entry.employee_id] || []) {
        const normalized: PlasticPayCode = normalizeEmployeePayCode(
          payCode,
          "employee"
        );
        if (normalized.is_active !== false) {
          merged.set(normalized.id, normalized);
        }
      }

      result[entry.employee_id] = Array.from(merged.values())
        .map((payCode: PlasticPayCode): PlasticPayCode =>
          applyEffectiveRate(payCode, entry.employee_id)
        )
        .sort((a: PlasticPayCode, b: PlasticPayCode): number =>
          a.id.localeCompare(b.id)
        );
    }

    return result;
  }, [applyEffectiveRate, detailedMappings, employeeMappings, entries]);

  const payCodeMapByEmployee = useMemo<
    Record<string, Record<string, PlasticPayCode>>
  >(() => {
    const result: Record<string, Record<string, PlasticPayCode>> = {};
    for (const [employeeId, payCodes] of Object.entries(payCodesByEmployee)) {
      result[employeeId] = {};
      for (const payCode of payCodes) {
        result[employeeId][payCode.id] = payCode;
      }
    }
    return result;
  }, [payCodesByEmployee]);

  const setLineQuery =
    (key: string): React.Dispatch<React.SetStateAction<string>> =>
    (value: React.SetStateAction<string>): void => {
      setPayCodeQueries((prev: Record<string, string>) => ({
        ...prev,
        [key]:
          typeof value === "function"
            ? value(prev[key] || "")
            : value,
      }));
    };

  const handleTimeChange = (range: TimeRange): void => {
    setSelectedDate(format(range.start, "yyyy-MM-dd"));
  };

  const updateEntryLines = (
    employeeId: string,
    mutate: (lines: PlasticLine[]) => PlasticLine[]
  ): void => {
    setEntries((prev: PlasticEntry[]) =>
      prev.map((entry: PlasticEntry): PlasticEntry =>
        entry.employee_id === employeeId
          ? {
              ...entry,
              lines: mutate(entry.lines),
              dirty: true,
            }
          : entry
      )
    );
  };

  const handlePayCodeChange = (
    employeeId: string,
    key: string,
    payCodeId: string
  ): void => {
    updateEntryLines(employeeId, (lines: PlasticLine[]): PlasticLine[] =>
      lines.map((line: PlasticLine): PlasticLine => {
        if (line.key !== key) return line;
        const payCode: PlasticPayCode | undefined =
          payCodeMapByEmployee[employeeId]?.[payCodeId];
        const rate: number = payCode ? dayRate(payCode, dayType) : line.rate_used;
        const rateUnit: string = payCode?.rate_unit || line.rate_unit;
        return {
          ...line,
          pay_code_id: payCodeId,
          description: payCode?.description || payCodeId,
          rate_used: rate,
          rate_unit: rateUnit,
          amount: lineAmount(rate, line.quantity),
        };
      })
    );
  };

  const handleNumberChange = (
    employeeId: string,
    key: string,
    field: "quantity" | "rate_used",
    value: string
  ): void => {
    const parsed: number = Number.parseFloat(value);
    const nextValue: number = Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
    updateEntryLines(employeeId, (lines: PlasticLine[]): PlasticLine[] =>
      lines.map((line: PlasticLine): PlasticLine => {
        if (line.key !== key) return line;
        const nextLine: PlasticLine = { ...line, [field]: nextValue };
        nextLine.amount = lineAmount(nextLine.rate_used, nextLine.quantity);
        return nextLine;
      })
    );
  };

  const handleAddLine = (employeeId: string): void => {
    updateEntryLines(employeeId, (lines: PlasticLine[]): PlasticLine[] => [
      ...lines,
      {
        key: newKey(),
        pay_code_id: "",
        description: "",
        quantity: 1,
        rate_used: 0,
        amount: 0,
        rate_unit: "Fixed",
      },
    ]);
  };

  const handleRemoveLine = (employeeId: string, key: string): void => {
    updateEntryLines(employeeId, (lines: PlasticLine[]): PlasticLine[] =>
      lines.filter((line: PlasticLine): boolean => line.key !== key)
    );
  };

  const handleSave = async (entry: PlasticEntry): Promise<void> => {
    const validLines: PlasticLine[] = entry.lines.filter(
      (line: PlasticLine): boolean => !!line.pay_code_id
    );
    if (validLines.length === 0) {
      toast.error(
        entry.saved
          ? "Add at least one pay code, or use Clear to remove this staff's saved log."
          : "Add at least one pay code before saving."
      );
      return;
    }

    setEntries((prev: PlasticEntry[]) =>
      prev.map((currentEntry: PlasticEntry): PlasticEntry =>
        currentEntry.employee_id === entry.employee_id
          ? { ...currentEntry, savingState: true }
          : currentEntry
      )
    );

    try {
      await api.post(API_BASE, {
        date: selectedDate,
        employee_id: entry.employee_id,
        status: "Submitted",
        lines: validLines.map((line: PlasticLine) => ({
          pay_code_id: line.pay_code_id,
          quantity: line.quantity,
          rate_used: line.rate_used,
          amount: line.amount,
        })),
      });

      toast.success(`Saved ${entry.employee_name}'s plastic entry`);
      setEntries((prev: PlasticEntry[]) =>
        prev.map((currentEntry: PlasticEntry): PlasticEntry =>
          currentEntry.employee_id === entry.employee_id
            ? {
                ...currentEntry,
                saved: true,
                status: "Submitted",
                dirty: false,
                savingState: false,
                lines: validLines,
              }
            : currentEntry
        )
      );
    } catch (error: unknown) {
      console.error("Error saving daily plastic:", error);
      const message: string =
        error instanceof Error ? error.message : "Failed to save plastic entry";
      toast.error(message);
      setEntries((prev: PlasticEntry[]) =>
        prev.map((currentEntry: PlasticEntry): PlasticEntry =>
          currentEntry.employee_id === entry.employee_id
            ? { ...currentEntry, savingState: false }
            : currentEntry
        )
      );
    }
  };

  const handleClear = async (): Promise<void> => {
    if (!clearTarget) return;
    setIsClearing(true);
    try {
      await api.delete(
        `${API_BASE}?date=${selectedDate}&employee_id=${encodeURIComponent(
          clearTarget.employee_id
        )}`
      );
      toast.success(`Cleared ${clearTarget.employee_name}'s plastic entry`);
      setClearTarget(null);
      await fetchEntries();
    } catch (error: unknown) {
      console.error("Error clearing daily plastic:", error);
      toast.error("Failed to clear saved plastic entry");
    } finally {
      setIsClearing(false);
    }
  };

  const entryTotal = (entry: PlasticEntry): number =>
    round2(
      entry.lines.reduce(
        (sum: number, line: PlasticLine): number => sum + (line.amount || 0),
        0
      )
    );

  const dayTypeClassName: string =
    dayType === "Umum"
      ? "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300"
      : dayType === "Ahad"
      ? "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300"
      : "bg-default-100 dark:bg-gray-700 text-default-700 dark:text-gray-200";

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row justify-between md:items-end gap-3">
        <div>
          <h1 className="text-xl font-semibold text-default-800 dark:text-gray-100">
            Daily Machine Plastic
          </h1>
        </div>
        <div className="flex items-end flex-wrap gap-3">
          <div>
            <label className="block text-sm font-medium text-default-700 dark:text-gray-200 mb-1">
              Date
            </label>
            <TimeNavigator
              range={dayRange}
              onChange={handleTimeChange}
              modes={["day"]}
              presets={false}
              allowFuture
              size="sm"
            />
          </div>
          <span
            className={`inline-flex items-center px-3 py-2 rounded-lg text-sm font-medium ${dayTypeClassName}`}
          >
            {dayType}
            {dayType === "Umum" &&
              getHolidayDescription(selectedDateValue) && (
                <span className="ml-1 text-xs font-normal">
                  ({getHolidayDescription(selectedDateValue)})
                </span>
              )}
          </span>
          <Button
            onClick={fetchEntries}
            icon={IconRefresh}
            variant="outline"
            disabled={isLoading}
          >
            Refresh
          </Button>
        </div>
      </div>

      {isLoading || loadingPayCodes ? (
        <div className="flex justify-center py-16">
          <LoadingSpinner />
        </div>
      ) : entries.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-default-200 dark:border-gray-700 shadow-sm p-8 text-center">
          <p className="text-default-500 dark:text-gray-400">
            No staff assigned to Daily Machine Plastic.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {entries.map((entry: PlasticEntry) => {
            const payCodes: PlasticPayCode[] =
              payCodesByEmployee[entry.employee_id] || [];
            const payCodeOptions: SelectOption[] = payCodes.map(
              (payCode: PlasticPayCode): SelectOption => ({
                id: payCode.id,
                name: payCode.id,
                job: payCode.description,
              })
            );

            return (
              <div
                key={entry.employee_id}
                className="bg-white dark:bg-gray-800 rounded-lg border border-default-200 dark:border-gray-700 shadow-sm"
              >
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 px-5 py-3 border-b border-default-200 dark:border-gray-700">
                  <div className="flex items-center gap-3 min-w-0">
                    <h2 className="text-base font-semibold text-default-800 dark:text-gray-100 truncate">
                      {entry.employee_name}{" "}
                      <span className="font-normal text-default-500 dark:text-gray-400">
                        ({entry.employee_id})
                      </span>
                    </h2>
                    {entry.saved ? (
                      <span className="inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                        Saved
                      </span>
                    ) : (
                      <span className="inline-flex rounded-full bg-default-100 px-2 py-0.5 text-[11px] font-medium text-default-600 dark:bg-gray-700 dark:text-gray-300">
                        Unsaved
                      </span>
                    )}
                    {entry.dirty && (
                      <span className="inline-flex rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-medium text-rose-700 dark:bg-rose-900/40 dark:text-rose-300">
                        Unsaved changes
                      </span>
                    )}
                  </div>
                  <div className="text-sm font-semibold text-default-800 dark:text-gray-100 md:text-right">
                    {formatCurrency(entryTotal(entry))}
                  </div>
                </div>

                <div className="px-5 py-3">
                  {entry.lines.length === 0 ? (
                    <p className="text-sm text-default-500 dark:text-gray-400 py-2">
                      No codes for this day.
                    </p>
                  ) : (
                    <div className="space-y-2 overflow-visible">
                      <div className="hidden md:grid grid-cols-[minmax(220px,1fr)_96px_80px_130px_32px] gap-3 text-xs font-medium text-default-500 dark:text-gray-400 uppercase tracking-wider items-end">
                        <div>Pay Code</div>
                        <div className="text-right">Rate</div>
                        <div className="text-right">Qty</div>
                        <div className="text-right">Amount</div>
                        <div></div>
                      </div>
                      <div className="divide-y divide-default-100 dark:divide-gray-700/70 overflow-visible">
                        {entry.lines.map((line: PlasticLine) => (
                          <div
                            key={line.key}
                            className="grid grid-cols-1 md:grid-cols-[minmax(220px,1fr)_96px_80px_130px_32px] gap-3 py-2 overflow-visible md:items-start"
                          >
                            <div className="relative">
                              <label className="md:hidden block text-xs font-medium text-default-500 dark:text-gray-400 uppercase mb-1">
                                Pay Code
                              </label>
                              <div className="[&_.overflow-hidden]:h-10 [&_.overflow-hidden]:box-border [&_input]:h-full [&_input]:py-0">
                                <FormCombobox
                                  name={`paycode-${line.key}`}
                                  label=""
                                  mode="single"
                                  value={line.pay_code_id || undefined}
                                  onChange={(value: string | string[] | null) =>
                                    handlePayCodeChange(
                                      entry.employee_id,
                                      line.key,
                                      (Array.isArray(value)
                                        ? value[0]
                                        : value) || ""
                                    )
                                  }
                                  options={payCodeOptions}
                                  query={payCodeQueries[line.key] || ""}
                                  setQuery={setLineQuery(line.key)}
                                  placeholder="Code"
                                />
                              </div>
                            </div>
                            <div>
                              <label className="md:hidden block text-xs font-medium text-default-500 dark:text-gray-400 uppercase mb-1">
                                Rate
                              </label>
                              <input
                                type="number"
                                step="0.01"
                                min={0}
                                value={line.rate_used}
                                onChange={(
                                  event: React.ChangeEvent<HTMLInputElement>
                                ) =>
                                  handleNumberChange(
                                    entry.employee_id,
                                    line.key,
                                    "rate_used",
                                    event.target.value
                                  )
                                }
                                className="h-10 w-full rounded-lg border border-default-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 text-sm text-right text-default-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-sky-500"
                              />
                            </div>
                            <div>
                              <label className="md:hidden block text-xs font-medium text-default-500 dark:text-gray-400 uppercase mb-1">
                                Qty
                              </label>
                              <input
                                type="number"
                                step="0.01"
                                min={0}
                                value={line.quantity}
                                onChange={(
                                  event: React.ChangeEvent<HTMLInputElement>
                                ) =>
                                  handleNumberChange(
                                    entry.employee_id,
                                    line.key,
                                    "quantity",
                                    event.target.value
                                  )
                                }
                                className="h-10 w-full rounded-lg border border-default-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 text-sm text-right text-default-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-sky-500"
                              />
                            </div>
                            <div className="text-right font-medium text-default-900 dark:text-gray-100">
                              <label className="md:hidden block text-xs font-medium text-default-500 dark:text-gray-400 uppercase mb-1">
                                Amount
                              </label>
                              <div className="h-10 flex items-center justify-end">
                                {formatCurrency(line.amount)}
                                <span className="ml-1 text-xs text-default-400 dark:text-gray-500">
                                  /{line.rate_unit}
                                </span>
                              </div>
                            </div>
                            <div className="flex justify-end md:h-10 md:items-center">
                              <button
                                type="button"
                                onClick={() =>
                                  handleRemoveLine(entry.employee_id, line.key)
                                }
                                className="h-8 w-8 inline-flex items-center justify-center rounded-full text-rose-600 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-900/50"
                                title="Remove code"
                              >
                                <IconTrash size={16} />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="flex items-center justify-between mt-3">
                    <Button
                      onClick={() => handleAddLine(entry.employee_id)}
                      icon={IconPlus}
                      variant="outline"
                      size="sm"
                    >
                      Add Code
                    </Button>
                    <div className="flex items-center gap-2">
                      {entry.saved && (
                        <Button
                          onClick={() => setClearTarget(entry)}
                          icon={IconEraser}
                          color="rose"
                          variant="outline"
                          size="sm"
                        >
                          Clear
                        </Button>
                      )}
                      <Button
                        onClick={() => handleSave(entry)}
                        icon={IconDeviceFloppy}
                        color="sky"
                        size="sm"
                        disabled={entry.savingState}
                      >
                        {entry.savingState ? "Saving..." : "Save"}
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <ConfirmationDialog
        isOpen={!!clearTarget}
        onClose={() => {
          if (!isClearing) setClearTarget(null);
        }}
        onConfirm={handleClear}
        title="Clear saved plastic entry"
        message={`Clear ${
          clearTarget?.employee_name ?? "this staff"
        }'s saved plastic entry for ${selectedDate}? This cannot be undone.`}
        confirmButtonText={isClearing ? "Clearing..." : "Clear"}
        variant="danger"
      />
    </div>
  );
};

export default JPDailyPlasticEntryPage;
