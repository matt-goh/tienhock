// src/components/Catalogue/PayRateScheduleManager.tsx
// Embedded panel for managing effective-month-dated rate changes (pay_rate_schedules)
// for one pay code at a given scope (pay_code / job / employee). The surrounding
// modal still edits the BASE rate (in force before any scheduled change); entries
// added here apply from their effective month onward, resolved per payroll month by
// get_effective_pay_rate(). See pay_rate_schedules in the Database Schema notes.
import React, { useState, useEffect, useCallback } from "react";
import toast from "react-hot-toast";
import { IconTrash, IconPlus } from "@tabler/icons-react";
import { api } from "../../routes/utils/api";
import { PayRateSchedule, PayRateScheduleScope } from "../../types/types";

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

interface PayRateScheduleManagerProps {
  scope: PayRateScheduleScope;
  payCodeId: string;
  employeeId?: string | null;
  jobId?: string | null;
  // Base rate values, shown as placeholders so the user sees what an empty
  // (inherited) sub-rate falls back to.
  baseRates: { biasa?: number | null; ahad?: number | null; umum?: number | null };
}

type RateValue = number | string | null | undefined;

const toFiniteRate = (value: RateValue): number => {
  const numericValue = Number(value ?? 0);
  return Number.isFinite(numericValue) ? numericValue : 0;
};

const formatRate = (value: RateValue): string => toFiniteRate(value).toFixed(2);

const parseOptionalRate = (value: string): number | null => {
  const trimmedValue = value.trim();
  if (trimmedValue === "") return null;
  const numericValue = Number(trimmedValue);
  return Number.isFinite(numericValue) ? numericValue : NaN;
};

const PayRateScheduleManager: React.FC<PayRateScheduleManagerProps> = ({
  scope,
  payCodeId,
  employeeId = null,
  jobId = null,
  baseRates,
}) => {
  const now = new Date();
  const [schedules, setSchedules] = useState<PayRateSchedule[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    year: now.getFullYear().toString(),
    month: (now.getMonth() + 1).toString(),
    biasa: "",
    ahad: "",
    umum: "",
  });
  const resolvedBaseRates = {
    biasa: toFiniteRate(baseRates.biasa),
    ahad: toFiniteRate(baseRates.ahad),
    umum: toFiniteRate(baseRates.umum),
  };

  const fetchSchedules = useCallback(async () => {
    if (!payCodeId) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ scope, pay_code_id: payCodeId });
      if (scope === "employee" && employeeId) params.set("employee_id", employeeId);
      if (scope === "job" && jobId) params.set("job_id", jobId);
      const data: PayRateSchedule[] = await api.get(
        `/api/pay-rate-schedules?${params.toString()}`,
      );
      setSchedules(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Error loading rate schedules:", err);
    } finally {
      setLoading(false);
    }
  }, [scope, payCodeId, employeeId, jobId]);

  useEffect(() => {
    fetchSchedules();
  }, [fetchSchedules]);

  const handleField = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const { name, value } = e.target;
    if (name === "year") {
      if (value === "" || /^\d{0,4}$/.test(value)) setForm((p) => ({ ...p, year: value }));
      return;
    }
    if (value === "" || /^\d*\.?\d*$/.test(value)) {
      setForm((p) => ({ ...p, [name]: value }));
    }
  };

  const handleAdd = async (): Promise<void> => {
    const biasa = parseOptionalRate(form.biasa);
    const ahad = parseOptionalRate(form.ahad);
    const umum = parseOptionalRate(form.umum);
    const hasInvalidRate = [biasa, ahad, umum].some(
      (rate: number | null): boolean =>
        rate !== null && !Number.isFinite(rate),
    );

    if (hasInvalidRate) {
      toast.error("Rates must be valid numbers.");
      return;
    }
    if (biasa === null && ahad === null && umum === null) {
      toast.error("Enter at least one rate for the change.");
      return;
    }
    setSaving(true);
    try {
      await api.post("/api/pay-rate-schedules", {
        scope,
        pay_code_id: payCodeId,
        employee_id: scope === "employee" ? employeeId : null,
        job_id: scope === "job" ? jobId : null,
        effective_year: parseInt(form.year, 10),
        effective_month: parseInt(form.month, 10),
        rate_biasa: biasa,
        rate_ahad: ahad,
        rate_umum: umum,
      });
      toast.success("Rate change saved");
      setForm((p) => ({ ...p, biasa: "", ahad: "", umum: "" }));
      await fetchSchedules();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Failed to save rate change");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number): Promise<void> => {
    try {
      await api.delete(`/api/pay-rate-schedules/${id}`);
      toast.success("Rate change removed");
      await fetchSchedules();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Failed to remove rate change");
    }
  };

  const fmt = (v: RateValue, base?: RateValue): string =>
    v === null || v === undefined || v === ""
      ? `(base ${formatRate(base)})`
      : formatRate(v);

  // Build the effective timeline: months before the first change use the base
  // rate; each change applies from its month until the next change (or onward).
  const monthKey = (y: number, m: number) => y * 12 + m;
  const monthLabel = (y: number, m: number) => `${MONTHS[m - 1]} ${y}`;
  const prevMonthLabel = (y: number, m: number) => {
    let pm = m - 1;
    let py = y;
    if (pm === 0) {
      pm = 12;
      py -= 1;
    }
    return `${MONTHS[pm - 1]} ${py}`;
  };
  const sortedAsc = [...schedules].sort(
    (a, b) =>
      monthKey(a.effective_year, a.effective_month) -
      monthKey(b.effective_year, b.effective_month),
  );
  const rangeLabel = (idx: number) => {
    const cur = sortedAsc[idx];
    const next = sortedAsc[idx + 1];
    const start = monthLabel(cur.effective_year, cur.effective_month);
    if (!next) return `${start} onwards`;
    const end = prevMonthLabel(next.effective_year, next.effective_month);
    return start === end ? start : `${start} – ${end}`;
  };
  const firstScheduled = sortedAsc[0];

  // Live hint for the change currently being entered in the add form.
  const newKey = monthKey(
    parseInt(form.year, 10) || 0,
    parseInt(form.month, 10) || 0,
  );
  const nextAfterNew = sortedAsc.find(
    (s) => monthKey(s.effective_year, s.effective_month) > newKey,
  );
  // A change already recorded for the exact month/year being entered (saving
  // replaces it rather than creating a duplicate — enforced by a unique key).
  const existingForSelected = sortedAsc.find(
    (s) => monthKey(s.effective_year, s.effective_month) === newKey,
  );
  const newFromLabel = monthLabel(
    parseInt(form.year, 10) || 0,
    parseInt(form.month, 10) || 0,
  );
  const newUntilLabel = nextAfterNew
    ? `until ${prevMonthLabel(nextAfterNew.effective_year, nextAfterNew.effective_month)}`
    : "onwards";

  return (
    <div className="mt-4 border-t pt-4 border-gray-100 dark:border-gray-700">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-default-700 dark:text-gray-200">
          Rate timeline
        </span>
        <span className="text-xs text-gray-500 dark:text-gray-400">
          Re-process the affected month(s) to apply
        </span>
      </div>

      {/* Effective timeline: base period + each scheduled change with its range */}
      <div className="mt-2 space-y-1">
        {loading ? (
          <p className="text-xs text-gray-500">Loading…</p>
        ) : (
          <>
            {/* Base period (months before the first scheduled change) */}
            <div className="flex items-center justify-between rounded bg-default-50 dark:bg-gray-700/40 px-2 py-1 text-xs">
              <span className="font-medium text-default-600 dark:text-gray-300 w-40 shrink-0">
                {firstScheduled
                  ? `Up to ${prevMonthLabel(
                      firstScheduled.effective_year,
                      firstScheduled.effective_month,
                    )}`
                  : "All months"}
              </span>
              <span className="flex-1 text-default-500 dark:text-gray-400">
                Base rate — B {formatRate(resolvedBaseRates.biasa)} · A{" "}
                {formatRate(resolvedBaseRates.ahad)} · U{" "}
                {formatRate(resolvedBaseRates.umum)}
              </span>
              <span className="w-[23px] shrink-0" />
            </div>

            {/* Scheduled changes, each with the month range it covers */}
            {sortedAsc.map((s, idx) => (
              <div
                key={s.id}
                className="flex items-center justify-between rounded bg-sky-50 dark:bg-sky-900/20 px-2 py-1 text-xs"
              >
                <span className="font-medium text-sky-800 dark:text-sky-300 w-40 shrink-0">
                  {rangeLabel(idx)}
                </span>
                <span className="flex-1 text-default-600 dark:text-gray-300">
                  B {fmt(s.rate_biasa, resolvedBaseRates.biasa)} · A{" "}
                  {fmt(s.rate_ahad, resolvedBaseRates.ahad)} · U{" "}
                  {fmt(s.rate_umum, resolvedBaseRates.umum)}
                </span>
                <button
                  type="button"
                  onClick={() => handleDelete(s.id)}
                  className="ml-2 p-1 text-gray-400 hover:text-red-600 shrink-0"
                  title="Remove this change"
                >
                  <IconTrash size={15} />
                </button>
              </div>
            ))}
          </>
        )}
      </div>

      {/* Add a change */}
      <div className="mt-3 grid grid-cols-12 gap-2 items-end">
        <div className="col-span-3">
          <label className="block text-xs text-default-500 dark:text-gray-400">From</label>
          <select
            value={form.month}
            onChange={(e) => setForm((p) => ({ ...p, month: e.target.value }))}
            className="mt-1 w-full rounded border border-default-300 dark:border-gray-600 p-1 text-xs bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            disabled={saving}
          >
            {MONTHS.map((m, i) => (
              <option key={m} value={i + 1}>
                {m}
              </option>
            ))}
          </select>
        </div>
        <div className="col-span-3">
          <label className="block text-xs text-default-500 dark:text-gray-400">Year</label>
          <input
            type="text"
            inputMode="numeric"
            name="year"
            value={form.year}
            onChange={handleField}
            className="mt-1 w-full rounded border border-default-300 dark:border-gray-600 p-1 text-xs text-right bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            disabled={saving}
          />
        </div>
        <div className="col-span-2">
          <label className="block text-xs text-default-500 dark:text-gray-400">Biasa</label>
          <input
            type="text"
            inputMode="decimal"
            name="biasa"
            value={form.biasa}
            onChange={handleField}
            placeholder={formatRate(resolvedBaseRates.biasa)}
            className="mt-1 w-full rounded border border-default-300 dark:border-gray-600 p-1 text-xs text-right bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            disabled={saving}
          />
        </div>
        <div className="col-span-2">
          <label className="block text-xs text-default-500 dark:text-gray-400">Ahad</label>
          <input
            type="text"
            inputMode="decimal"
            name="ahad"
            value={form.ahad}
            onChange={handleField}
            placeholder={formatRate(resolvedBaseRates.ahad)}
            className="mt-1 w-full rounded border border-default-300 dark:border-gray-600 p-1 text-xs text-right bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            disabled={saving}
          />
        </div>
        <div className="col-span-2">
          <label className="block text-xs text-default-500 dark:text-gray-400">Umum</label>
          <input
            type="text"
            inputMode="decimal"
            name="umum"
            value={form.umum}
            onChange={handleField}
            placeholder={formatRate(resolvedBaseRates.umum)}
            className="mt-1 w-full rounded border border-default-300 dark:border-gray-600 p-1 text-xs text-right bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            disabled={saving}
          />
        </div>
      </div>
      <div className="mt-2 flex items-center justify-between gap-2">
        {existingForSelected ? (
          <p className="text-xs text-amber-600 dark:text-amber-400">
            A change already exists for{" "}
            <span className="font-medium">{newFromLabel}</span> (currently B{" "}
            {fmt(existingForSelected.rate_biasa, resolvedBaseRates.biasa)}) — saving will
            replace it.
          </p>
        ) : (
          <p className="text-xs text-sky-700 dark:text-sky-300">
            Applies to <span className="font-medium">{newFromLabel}</span>{" "}
            {newUntilLabel}. Earlier months keep their current rate.
          </p>
        )}
        <button
          type="button"
          onClick={handleAdd}
          disabled={saving}
          className={`inline-flex shrink-0 items-center gap-1 rounded-full px-3 py-1 text-xs font-medium disabled:opacity-50 ${
            existingForSelected
              ? "bg-amber-50 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 hover:bg-amber-100"
              : "bg-sky-50 dark:bg-sky-900/40 text-sky-700 dark:text-sky-300 hover:bg-sky-100"
          }`}
        >
          <IconPlus size={14} />{" "}
          {existingForSelected ? "Replace rate change" : "Add rate change"}
        </button>
      </div>
    </div>
  );
};

export default PayRateScheduleManager;
