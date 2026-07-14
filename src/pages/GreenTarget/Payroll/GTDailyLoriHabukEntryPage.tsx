// src/pages/GreenTarget/Payroll/GTDailyLoriHabukEntryPage.tsx
// Green Target Daily Lori Habuk driver entry (Phase 3). Date-centric: pick a
// date, see each DRIVER employee as a card with that day's trip lines. Rentals
// prefill PLACEMENT/PICKUP/ADDON lines; manual habuk trips are added on top.
// Monthly processing reads the saved lines (not live rentals).
import React, { useState, useEffect, useMemo, useCallback } from "react";
import { format } from "date-fns";
import {
  IconRefresh,
  IconPlus,
  IconTrash,
  IconDeviceFloppy,
  IconTruck,
  IconEraser,
} from "@tabler/icons-react";
import Button from "../../../components/Button";
import LoadingSpinner from "../../../components/LoadingSpinner";
import ConfirmationDialog from "../../../components/ConfirmationDialog";
import TimeNavigator, { TimeRange } from "../../../components/TimeNavigator";
import { FormCombobox, SelectOption } from "../../../components/FormComponents";
import { useJobPayCodeMappings } from "../../../utils/catalogue/useJobPayCodeMappings";
import { api } from "../../../routes/utils/api";
import toast from "react-hot-toast";
import GTLeaveSection from "./GTLeaveSection";

const API_BASE = "/greentarget/api/daily-lori-habuk";

type SourceType = "PLACEMENT" | "PICKUP" | "ADDON" | "MANUAL" | "DERIVED";

interface TripLine {
  key: string;
  pay_code_id: string;
  description: string;
  quantity: number;
  rate_used: number;
  amount: number;
  rate_unit: string;
  source_type: SourceType;
  rental_id: number | null;
  is_manual: boolean;
}

interface DriverEntry {
  employee_id: string;
  employee_name: string;
  saved: boolean;
  status: string | null;
  lines: TripLine[];
  dirty: boolean;
  savingState: boolean;
}

interface PayCodeOption {
  id: string;
  description: string;
  rate_biasa: number;
  rate_unit: string;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;
const lineAmount = (rate: number, qty: number): number => round2(rate * qty);

let keyCounter = 0;
const newKey = (): string => `line-${Date.now()}-${keyCounter++}`;

const SOURCE_BADGE: Record<SourceType, string> = {
  PLACEMENT: "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300",
  PICKUP: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300",
  ADDON: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  DERIVED: "bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300",
  MANUAL: "bg-default-100 text-default-600 dark:bg-gray-700 dark:text-gray-300",
};

const GTDailyLoriHabukEntryPage: React.FC = () => {
  const { detailedMappings } = useJobPayCodeMappings();

  const [selectedDate, setSelectedDate] = useState<string>(
    format(new Date(), "yyyy-MM-dd")
  );
  const [entries, setEntries] = useState<DriverEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  // Per-line search query for the pay-code combobox, keyed by line key.
  const [payCodeQueries, setPayCodeQueries] = useState<Record<string, string>>(
    {}
  );
  const [clearTarget, setClearTarget] = useState<DriverEntry | null>(null);
  const [isClearing, setIsClearing] = useState(false);

  // DRIVER job pay codes for the picker + rate lookups.
  const driverPayCodes: PayCodeOption[] = useMemo(() => {
    const rows = (detailedMappings["DRIVER"] as any[]) || [];
    return rows
      .map((pc) => ({
        id: pc.pay_code_id,
        description: pc.description || pc.pay_code_id,
        rate_biasa:
          pc.override_rate_biasa != null
            ? Number(pc.override_rate_biasa)
            : Number(pc.rate_biasa) || 0,
        rate_unit: pc.rate_unit || "Trip",
      }))
      .sort((a, b) => a.id.localeCompare(b.id));
  }, [detailedMappings]);

  const payCodeMap = useMemo(() => {
    const map: Record<string, PayCodeOption> = {};
    driverPayCodes.forEach((pc) => (map[pc.id] = pc));
    return map;
  }, [driverPayCodes]);

  const payCodeOptions: SelectOption[] = useMemo(
    () =>
      driverPayCodes.map((pc) => ({
        id: pc.id,
        name: `${pc.id} - ${pc.description}`,
      })),
    [driverPayCodes]
  );

  // Build a per-line setQuery compatible with FormCombobox's Dispatch signature.
  const setLineQuery =
    (key: string): React.Dispatch<React.SetStateAction<string>> =>
    (v) =>
      setPayCodeQueries((prev) => ({
        ...prev,
        [key]: typeof v === "function" ? (v as (p: string) => string)(prev[key] || "") : v,
      }));

  const fetchEntries = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await api.get(`${API_BASE}?date=${selectedDate}`);
      const loaded: DriverEntry[] = (res?.entries || []).map((e: any) => ({
        employee_id: e.employee_id,
        employee_name: e.employee_name,
        saved: e.saved,
        status: e.status,
        dirty: false,
        savingState: false,
        lines: (e.lines || []).map((l: any) => ({
          key: newKey(),
          pay_code_id: l.pay_code_id,
          description: l.description || l.pay_code_description || l.pay_code_id,
          quantity: Number(l.quantity) || 0,
          rate_used: Number(l.rate_used) || 0,
          amount: Number(l.amount) || 0,
          rate_unit: l.rate_unit || "Trip",
          source_type: (l.source_type || "MANUAL") as SourceType,
          rental_id: l.rental_id ?? null,
          is_manual: l.is_manual ?? l.source_type === "MANUAL",
        })),
      }));
      setEntries(loaded);
    } catch (error) {
      console.error("Error loading daily lori habuk:", error);
      toast.error("Failed to load Daily Lori Habuk");
    } finally {
      setIsLoading(false);
    }
  }, [selectedDate]);

  useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

  const handleTimeChange = (range: TimeRange): void => {
    setSelectedDate(format(range.start, "yyyy-MM-dd"));
  };

  const dayRange = useMemo<TimeRange>(() => {
    const d = new Date(`${selectedDate}T00:00:00`);
    return { start: d, end: d };
  }, [selectedDate]);

  const [leaveYear, leaveMonth] = useMemo(() => {
    const [y, m] = selectedDate.split("-").map(Number);
    return [y, m];
  }, [selectedDate]);

  const driverEmployees = useMemo(
    () =>
      entries.map((e) => ({ id: e.employee_id, name: e.employee_name })),
    [entries]
  );

  const updateEntryLines = (
    employeeId: string,
    mutate: (lines: TripLine[]) => TripLine[]
  ): void => {
    setEntries((prev) =>
      prev.map((entry) =>
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
    updateEntryLines(employeeId, (lines) =>
      lines.map((l) => {
        if (l.key !== key) return l;
        const pc = payCodeMap[payCodeId];
        const rate = pc ? pc.rate_biasa : l.rate_used;
        const rateUnit = pc ? pc.rate_unit : l.rate_unit;
        return {
          ...l,
          pay_code_id: payCodeId,
          description: pc?.description || payCodeId,
          rate_used: rate,
          rate_unit: rateUnit,
          amount: lineAmount(rate, l.quantity),
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
    const num = parseFloat(value);
    updateEntryLines(employeeId, (lines) =>
      lines.map((l) => {
        if (l.key !== key) return l;
        const next = { ...l, [field]: isNaN(num) ? 0 : num };
        next.amount = lineAmount(next.rate_used, next.quantity);
        return next;
      })
    );
  };

  const handleAddLine = (employeeId: string): void => {
    updateEntryLines(employeeId, (lines) => [
      ...lines,
      {
        key: newKey(),
        pay_code_id: "",
        description: "",
        quantity: 1,
        rate_used: 0,
        amount: 0,
        rate_unit: "Trip",
        source_type: "MANUAL",
        rental_id: null,
        is_manual: true,
      },
    ]);
  };

  const handleRemoveLine = (employeeId: string, key: string): void => {
    updateEntryLines(employeeId, (lines) => lines.filter((l) => l.key !== key));
  };

  const handleSave = async (entry: DriverEntry): Promise<void> => {
    const validLines = entry.lines.filter((l) => l.pay_code_id);
    if (validLines.length === 0) {
      toast.error(
        entry.saved
          ? "Add at least one trip with a pay code, or use Clear to remove this driver's saved log."
          : "Add at least one trip with a pay code before saving."
      );
      return;
    }
    setEntries((prev) =>
      prev.map((e) =>
        e.employee_id === entry.employee_id ? { ...e, savingState: true } : e
      )
    );
    try {
      await api.post(API_BASE, {
        date: selectedDate,
        employee_id: entry.employee_id,
        status: "Submitted",
        lines: validLines.map((l) => ({
          pay_code_id: l.pay_code_id,
          quantity: l.quantity,
          rate_used: l.rate_used,
          amount: l.amount,
          source_type: l.source_type,
          rental_id: l.rental_id,
          description: l.description,
          is_manual: l.is_manual,
        })),
      });
      toast.success(`Saved ${entry.employee_name}'s trips`);
      setEntries((prev) =>
        prev.map((e) =>
          e.employee_id === entry.employee_id
            ? { ...e, saved: true, status: "Submitted", dirty: false, savingState: false }
            : e
        )
      );
    } catch (error) {
      console.error("Error saving daily lori habuk:", error);
      toast.error(`Failed to save ${entry.employee_name}'s trips`);
      setEntries((prev) =>
        prev.map((e) =>
          e.employee_id === entry.employee_id ? { ...e, savingState: false } : e
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
      toast.success(`Cleared ${clearTarget.employee_name}'s saved log`);
      setClearTarget(null);
      await fetchEntries();
    } catch (error) {
      console.error("Error clearing daily lori habuk:", error);
      toast.error("Failed to clear saved log");
    } finally {
      setIsClearing(false);
    }
  };

  const entryTotal = (entry: DriverEntry): number =>
    round2(entry.lines.reduce((sum, l) => sum + (l.amount || 0), 0));

  const formatCurrency = (amount: number): string =>
    new Intl.NumberFormat("en-MY", {
      style: "currency",
      currency: "MYR",
    }).format(amount);

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row justify-between items-center">
        <h1 className="text-xl font-semibold text-default-800 dark:text-gray-100">
          Daily Lori Habuk
        </h1>
        <div className="flex space-x-3 mt-4 md:mt-0">
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

      <div className="bg-white dark:bg-gray-800 rounded-lg border border-default-200 dark:border-gray-700 shadow-sm p-4">
        <div className="flex flex-col md:flex-row gap-4 items-start justify-between">
          <TimeNavigator
            range={dayRange}
            onChange={handleTimeChange}
            modes={["day"]}
            presets={false}
          />
          <p className="text-xs text-default-500 dark:text-gray-400 max-w-md md:text-right">
            Trip pay is taken from this saved log during monthly processing.
            Rentals only prefill the lines below — a driver with no saved log for
            the month earns base salary only.
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <LoadingSpinner />
        </div>
      ) : entries.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-default-200 dark:border-gray-700 shadow-sm text-center py-12 text-default-500 dark:text-gray-400">
          <IconTruck className="mx-auto h-12 w-12 text-default-300 mb-4" />
          <p className="text-lg font-medium">No DRIVER employees found</p>
          <p>Add DRIVER employees to the GT payroll list first.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {entries.map((entry) => (
            <div
              key={entry.employee_id}
              className="bg-white dark:bg-gray-800 rounded-lg border border-default-200 dark:border-gray-700 shadow-sm"
            >
              {/* Card header */}
              <div className="flex items-center justify-between px-5 py-3 border-b border-default-200 dark:border-gray-700">
                <div className="flex items-center gap-3">
                  <h2 className="text-base font-semibold text-default-800 dark:text-gray-100">
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
                    <span className="inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                      Prefilled (not saved)
                    </span>
                  )}
                  {entry.dirty && (
                    <span className="inline-flex rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-medium text-rose-700 dark:bg-rose-900/40 dark:text-rose-300">
                      Unsaved changes
                    </span>
                  )}
                </div>
                <div className="text-sm font-semibold text-default-800 dark:text-gray-100">
                  {formatCurrency(entryTotal(entry))}
                </div>
              </div>

              {/* Lines */}
              <div className="px-5 py-3">
                {entry.lines.length === 0 ? (
                  <p className="text-sm text-default-500 dark:text-gray-400 py-2">
                    No trips for this day.
                  </p>
                ) : (
                  <div>
                    <table className="min-w-full text-sm">
                      <thead>
                        <tr className="text-left text-xs font-medium text-default-500 dark:text-gray-400 uppercase tracking-wider">
                          <th className="py-2 pr-3 w-2/5">Pay Code</th>
                          <th className="py-2 px-3">Source</th>
                          <th className="py-2 px-3 text-right">Rate</th>
                          <th className="py-2 px-3 text-right">Qty</th>
                          <th className="py-2 px-3 text-right">Amount</th>
                          <th className="py-2 pl-3 w-8"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-default-100 dark:divide-gray-700/70">
                        {entry.lines.map((line) => (
                          <tr key={line.key}>
                            <td className="py-2 pr-3 align-top">
                              <FormCombobox
                                name={`paycode-${line.key}`}
                                label=""
                                mode="single"
                                value={line.pay_code_id || undefined}
                                onChange={(val) =>
                                  handlePayCodeChange(
                                    entry.employee_id,
                                    line.key,
                                    (Array.isArray(val) ? val[0] : val) || ""
                                  )
                                }
                                options={payCodeOptions}
                                query={payCodeQueries[line.key] || ""}
                                setQuery={setLineQuery(line.key)}
                                placeholder="Select pay code..."
                              />
                            </td>
                            <td className="py-2 px-3">
                              <span
                                className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${SOURCE_BADGE[line.source_type]}`}
                              >
                                {line.source_type}
                              </span>
                            </td>
                            <td className="py-2 px-3 text-right">
                              <input
                                type="number"
                                step="0.01"
                                value={line.rate_used}
                                onChange={(e) =>
                                  handleNumberChange(
                                    entry.employee_id,
                                    line.key,
                                    "rate_used",
                                    e.target.value
                                  )
                                }
                                className="w-20 rounded-lg border border-default-300 dark:border-gray-600 bg-white dark:bg-gray-800 py-1.5 px-2 text-sm text-right text-default-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-sky-500 disabled:bg-default-50 dark:disabled:bg-gray-700/60"
                              />
                            </td>
                            <td className="py-2 px-3 text-right">
                              <input
                                type="number"
                                step="1"
                                value={line.quantity}
                                onChange={(e) =>
                                  handleNumberChange(
                                    entry.employee_id,
                                    line.key,
                                    "quantity",
                                    e.target.value
                                  )
                                }
                                className="w-16 rounded-lg border border-default-300 dark:border-gray-600 bg-white dark:bg-gray-800 py-1.5 px-2 text-sm text-right text-default-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-sky-500 disabled:bg-default-50 dark:disabled:bg-gray-700/60"
                              />
                            </td>
                            <td className="py-2 px-3 text-right font-medium text-default-900 dark:text-gray-100">
                              {formatCurrency(line.amount)}
                              <span className="ml-1 text-xs text-default-400 dark:text-gray-500">
                                /{line.rate_unit}
                              </span>
                            </td>
                            <td className="py-2 pl-3 text-right">
                              <button
                                onClick={() =>
                                  handleRemoveLine(entry.employee_id, line.key)
                                }
                                className="p-1.5 rounded-full text-rose-600 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-900/50"
                                title="Remove trip"
                              >
                                <IconTrash size={16} />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                <div className="flex items-center justify-between mt-3">
                  <Button
                    onClick={() => handleAddLine(entry.employee_id)}
                    icon={IconPlus}
                    variant="outline"
                    size="sm"
                  >
                    Add trip
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
          ))}
        </div>
      )}

      {/* Leave & Absence Recording for DRIVER staff on the selected date */}
      {!isLoading && entries.length > 0 && (
        <GTLeaveSection
          employees={driverEmployees}
          year={leaveYear}
          month={leaveMonth}
          mode="daily"
          fixedDate={selectedDate}
          loadEndpoint={`${API_BASE}/leave?date=${selectedDate}`}
          saveEndpoint={`${API_BASE}/leave`}
        />
      )}

      <ConfirmationDialog
        isOpen={!!clearTarget}
        onClose={() => {
          if (!isClearing) setClearTarget(null);
        }}
        onConfirm={handleClear}
        title="Clear saved log"
        message={`Clear ${
          clearTarget?.employee_name ?? "this driver"
        }'s saved trips for ${selectedDate}? The card will revert to the rentals-prefilled suggestion. This cannot be undone.`}
        confirmButtonText={isClearing ? "Clearing..." : "Clear"}
        variant="danger"
      />
    </div>
  );
};

export default GTDailyLoriHabukEntryPage;
