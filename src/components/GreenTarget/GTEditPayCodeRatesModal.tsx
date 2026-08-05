// src/components/GreenTarget/GTEditPayCodeRatesModal.tsx
// Green Target counterpart of Catalogue/EditEmployeePayCodeRatesModal. The TH
// modal is not reusable here: TH saves a single override row per request
// (PUT /employee-pay-codes/:employeeId/:payCodeId) while GT replaces the
// employee's whole GT override set (PUT /greentarget/api/employee-pay-codes/
// :employeeId { mappings: [...] }), and the schedule endpoints differ
// (/:employeeId/schedules + DELETE /schedules/:id). Visual style mirrors the
// TH modal.
import React, { useState, useEffect, useCallback, Fragment } from "react";
import {
  Dialog,
  DialogPanel,
  DialogTitle,
  Transition,
  TransitionChild,
} from "@headlessui/react";
import { IconRotateClockwise, IconTrash, IconPlus } from "@tabler/icons-react";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";

import Button from "../Button";
import { api } from "../../routes/utils/api";
import {
  GTPayCodeOverride,
  GTPayRateSchedule,
  GTSubRates,
  toNullableNumber,
} from "../../utils/greenTarget/gtPayRates";

const GT_API_BASE = "/greentarget/api/employee-pay-codes";

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

interface EditRatesState {
  biasa: string;
  ahad: string;
  umum: string;
}

// Only a blank field means "no GT override" (fall back to the shared rate).
// 0 is a real override and must survive as 0 rather than collapse into null.
const parseRateOverride = (value: string): number | null => {
  const trimmedValue = value.trim();
  if (trimmedValue === "") return null;
  const numericValue = Number(trimmedValue);
  return Number.isFinite(numericValue) ? numericValue : NaN;
};

const formatRate = (value: number | string | null | undefined): string =>
  (toNullableNumber(value) ?? 0).toFixed(2);

/** fmt a possibly-null scheduled rate, falling back to the inherited base. */
const fmtScheduled = (
  value: number | string | null | undefined,
  base: number | string | null | undefined,
  inheritedLabel: string
): string => {
  const rate = toNullableNumber(value);
  return rate === null
    ? `(${inheritedLabel} ${formatRate(base)})`
    : rate.toFixed(2);
};

interface GTRateSchedulePanelProps {
  employeeId: string;
  payCodeId: string;
  /** Rate an empty scheduled sub-rate falls back to (GT override ?? shared). */
  baseRates: GTSubRates;
  /** Called after any add/delete so the page can refresh its schedule map. */
  onSchedulesChanged: () => void;
}

const GTRateSchedulePanel: React.FC<GTRateSchedulePanelProps> = ({
  employeeId,
  payCodeId,
  baseRates,
  onSchedulesChanged,
}) => {
  const { t } = useTranslation("common");
  const now = new Date();
  const [schedules, setSchedules] = useState<GTPayRateSchedule[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    year: now.getFullYear().toString(),
    month: (now.getMonth() + 1).toString(),
    biasa: "",
    ahad: "",
    umum: "",
    notes: "",
  });

  const fetchSchedules = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api.get(
        `${GT_API_BASE}/${employeeId}/schedules`
      );
      const all: GTPayRateSchedule[] = response?.schedules || [];
      setSchedules(
        all
          .filter((s) => s.pay_code_id === payCodeId)
          .sort(
            (a, b) =>
              a.effective_year * 12 +
              a.effective_month -
              (b.effective_year * 12 + b.effective_month)
          )
      );
    } catch (err) {
      console.error("Error loading GT rate schedules:", err);
    } finally {
      setLoading(false);
    }
  }, [employeeId, payCodeId]);

  useEffect(() => {
    fetchSchedules();
  }, [fetchSchedules]);

  const handleField = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const { name, value } = e.target;
    if (name === "notes") {
      setForm((p) => ({ ...p, notes: value }));
      return;
    }
    if (name === "year") {
      if (value === "" || /^\d{0,4}$/.test(value))
        setForm((p) => ({ ...p, year: value }));
      return;
    }
    if (value === "" || /^\d*\.?\d*$/.test(value)) {
      setForm((p) => ({ ...p, [name]: value }));
    }
  };

  const handleAdd = async (): Promise<void> => {
    const biasa = parseRateOverride(form.biasa);
    const ahad = parseRateOverride(form.ahad);
    const umum = parseRateOverride(form.umum);
    const hasInvalidRate = [biasa, ahad, umum].some(
      (rate: number | null): boolean => rate !== null && !Number.isFinite(rate)
    );
    if (hasInvalidRate) {
      toast.error(t("Rates must be valid numbers."));
      return;
    }
    if (biasa === null && ahad === null && umum === null) {
      toast.error(t("Enter at least one rate for the change."));
      return;
    }
    setSaving(true);
    try {
      await api.post(`${GT_API_BASE}/${employeeId}/schedules`, {
        pay_code_id: payCodeId,
        effective_year: parseInt(form.year, 10),
        effective_month: parseInt(form.month, 10),
        rate_biasa: biasa,
        rate_ahad: ahad,
        rate_umum: umum,
        notes: form.notes.trim() || null,
      });
      toast.success(t("Rate change saved"));
      setForm((p) => ({ ...p, biasa: "", ahad: "", umum: "", notes: "" }));
      await fetchSchedules();
      onSchedulesChanged();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || t("Failed to save rate change"));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number): Promise<void> => {
    try {
      await api.delete(`${GT_API_BASE}/schedules/${id}`);
      toast.success(t("Rate change removed"));
      await fetchSchedules();
      onSchedulesChanged();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || t("Failed to remove rate change"));
    }
  };

  const monthLabel = (year: number, month: number): string =>
    `${t(MONTHS[month - 1])} ${year}`;

  return (
    <div className="mt-4 border-t pt-4 border-gray-100 dark:border-gray-700">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-default-700 dark:text-gray-200">
          {t("Scheduled rate changes")}
        </span>
        <span className="text-xs text-gray-500 dark:text-gray-400">
          {t("Applies from the effective month onward")}
        </span>
      </div>

      <div className="mt-2 space-y-1">
        {loading ? (
          <p className="text-xs text-gray-500">{t("loading")}</p>
        ) : schedules.length === 0 ? (
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {t("No scheduled changes.")}
          </p>
        ) : (
          schedules.map((s) => (
            <div
              key={s.id}
              className="flex items-center justify-between rounded bg-sky-50 dark:bg-sky-900/20 px-2 py-1 text-xs"
            >
              <span className="font-medium text-sky-800 dark:text-sky-300 w-28 shrink-0">
                {t("From")} {monthLabel(s.effective_year, s.effective_month)}
              </span>
              <span className="flex-1 text-default-600 dark:text-gray-300">
                B {fmtScheduled(s.rate_biasa, baseRates.biasa, t("base"))} · A{" "}
                {fmtScheduled(s.rate_ahad, baseRates.ahad, t("base"))} · U{" "}
                {fmtScheduled(s.rate_umum, baseRates.umum, t("base"))}
                {s.notes ? ` — ${s.notes}` : ""}
              </span>
              <button
                type="button"
                onClick={() => handleDelete(s.id)}
                className="ml-2 p-1 text-gray-400 hover:text-red-600 shrink-0"
                title={t("Remove this change")}
              >
                <IconTrash size={15} />
              </button>
            </div>
          ))
        )}
      </div>

      {/* Add a change */}
      <div className="mt-3 grid grid-cols-12 gap-2 items-end">
        <div className="col-span-3">
          <label className="block text-xs text-default-500 dark:text-gray-400">
            {t("From")}
          </label>
          <select
            value={form.month}
            onChange={(e) => setForm((p) => ({ ...p, month: e.target.value }))}
            className="mt-1 w-full rounded border border-default-300 dark:border-gray-600 p-1 text-xs bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            disabled={saving}
          >
            {MONTHS.map((m, i) => (
              <option key={m} value={i + 1}>
                {t(m)}
              </option>
            ))}
          </select>
        </div>
        <div className="col-span-3">
          <label className="block text-xs text-default-500 dark:text-gray-400">
            {t("Year")}
          </label>
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
          <label className="block text-xs text-default-500 dark:text-gray-400">
            {t("Biasa")}
          </label>
          <input
            type="text"
            inputMode="decimal"
            name="biasa"
            value={form.biasa}
            onChange={handleField}
            placeholder={formatRate(baseRates.biasa)}
            className="mt-1 w-full rounded border border-default-300 dark:border-gray-600 p-1 text-xs text-right bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            disabled={saving}
          />
        </div>
        <div className="col-span-2">
          <label className="block text-xs text-default-500 dark:text-gray-400">
            {t("Ahad")}
          </label>
          <input
            type="text"
            inputMode="decimal"
            name="ahad"
            value={form.ahad}
            onChange={handleField}
            placeholder={formatRate(baseRates.ahad)}
            className="mt-1 w-full rounded border border-default-300 dark:border-gray-600 p-1 text-xs text-right bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            disabled={saving}
          />
        </div>
        <div className="col-span-2">
          <label className="block text-xs text-default-500 dark:text-gray-400">
            {t("Umum")}
          </label>
          <input
            type="text"
            inputMode="decimal"
            name="umum"
            value={form.umum}
            onChange={handleField}
            placeholder={formatRate(baseRates.umum)}
            className="mt-1 w-full rounded border border-default-300 dark:border-gray-600 p-1 text-xs text-right bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            disabled={saving}
          />
        </div>
      </div>
      <div className="mt-2 flex items-center justify-between gap-2">
        <input
          type="text"
          name="notes"
          value={form.notes}
          onChange={handleField}
          placeholder={t("Notes (optional)")}
          className="flex-1 rounded border border-default-300 dark:border-gray-600 p-1 text-xs bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
          disabled={saving}
        />
        <button
          type="button"
          onClick={handleAdd}
          disabled={saving}
          className="inline-flex shrink-0 items-center gap-1 rounded-full px-3 py-1 text-xs font-medium bg-sky-50 dark:bg-sky-900/40 text-sky-700 dark:text-sky-300 hover:bg-sky-100 disabled:opacity-50"
        >
          <IconPlus size={14} /> {t("Add rate change")}
        </button>
      </div>
    </div>
  );
};

export interface GTEditPayCodeRatesModalProps {
  isOpen: boolean;
  onClose: () => void;
  employeeId: string;
  employeeName: string;
  payCodeId: string;
  payCodeDescription: string;
  /** Shared (Tien Hock) rates after the public employee/job/base merge. */
  sharedRates: GTSubRates;
  onSaved: () => void;
}

const GTEditPayCodeRatesModal: React.FC<GTEditPayCodeRatesModalProps> = ({
  isOpen,
  onClose,
  employeeId,
  employeeName,
  payCodeId,
  payCodeDescription,
  sharedRates,
  onSaved,
}) => {
  const { t } = useTranslation("common");
  const [mappings, setMappings] = useState<GTPayCodeOverride[]>([]);
  const [editRates, setEditRates] = useState<EditRatesState>({
    biasa: "",
    ahad: "",
    umum: "",
  });
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const existingOverride: GTPayCodeOverride | undefined = mappings.find(
    (m) => m.pay_code_id === payCodeId
  );

  // Fetch the employee's current GT override set when the modal opens — the
  // save replaces the whole set, so it must start from the server's state.
  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    setIsSaving(false);
    setEditRates({ biasa: "", ahad: "", umum: "" });
    api
      .get(`${GT_API_BASE}/${employeeId}`)
      .then((response) => {
        const rows: GTPayCodeOverride[] = response?.mappings || [];
        setMappings(rows);
        const current = rows.find((m) => m.pay_code_id === payCodeId);
        setEditRates({
          biasa: toNullableNumber(current?.override_rate_biasa)?.toString() ?? "",
          ahad: toNullableNumber(current?.override_rate_ahad)?.toString() ?? "",
          umum: toNullableNumber(current?.override_rate_umum)?.toString() ?? "",
        });
      })
      .catch((err) => {
        console.error("Error loading GT pay code overrides:", err);
        setError(t("Failed to load GT rates"));
      });
  }, [isOpen, employeeId, payCodeId, t]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    if (value === "" || /^\d*\.?\d*$/.test(value)) {
      setEditRates((prev) => ({ ...prev, [name]: value }));
    }
  };

  const handleResetRate = (rateType: keyof EditRatesState) => {
    setEditRates((prev) => ({ ...prev, [rateType]: "" }));
    setError(null);
  };

  const handleSave = async () => {
    if (isSaving) return;

    const newBiasa = parseRateOverride(editRates.biasa);
    const newAhad = parseRateOverride(editRates.ahad);
    const newUmum = parseRateOverride(editRates.umum);

    const hasInvalidRate = [newBiasa, newAhad, newUmum].some(
      (rate: number | null): boolean => rate !== null && !Number.isFinite(rate)
    );
    if (hasInvalidRate) {
      setError(t("Invalid rate value. Rates must be valid numbers."));
      return;
    }
    if (
      (newBiasa !== null && newBiasa < 0) ||
      (newAhad !== null && newAhad < 0) ||
      (newUmum !== null && newUmum < 0)
    ) {
      setError(t("Invalid rate value. Rates cannot be negative numbers."));
      return;
    }

    setIsSaving(true);
    setError(null);
    try {
      // Replace the employee's whole GT override set: update this pay code's
      // row, or drop it when every sub-rate is blank (falls back to shared).
      const allBlank =
        newBiasa === null && newAhad === null && newUmum === null;
      const nextMappings = mappings
        .filter((m) => m.pay_code_id !== payCodeId)
        .map((m) => ({
          pay_code_id: m.pay_code_id,
          is_default: m.is_default,
          override_rate_biasa: toNullableNumber(m.override_rate_biasa),
          override_rate_ahad: toNullableNumber(m.override_rate_ahad),
          override_rate_umum: toNullableNumber(m.override_rate_umum),
        }));
      if (!allBlank) {
        nextMappings.push({
          pay_code_id: payCodeId,
          is_default: existingOverride?.is_default ?? false,
          override_rate_biasa: newBiasa,
          override_rate_ahad: newAhad,
          override_rate_umum: newUmum,
        });
      }

      await api.put(`${GT_API_BASE}/${employeeId}`, {
        mappings: nextMappings,
      });
      toast.success(t("GT rates saved"));
      onSaved();
      onClose();
    } catch (err: any) {
      console.error("Error saving GT pay code rates:", err);
      setError(err?.response?.data?.message || t("Failed to save GT rates"));
      toast.error(err?.response?.data?.message || t("Failed to save GT rates"));
    } finally {
      setIsSaving(false);
    }
  };

  const handleClose = () => {
    if (!isSaving) onClose();
  };

  const renderRateField = (
    label: string,
    name: "biasa" | "ahad" | "umum",
    sharedValue: number | string | null
  ) => {
    const overridden = editRates[name] !== "";
    return (
      <div>
        <label
          htmlFor={name}
          className="block text-xs font-medium text-default-500 dark:text-gray-400"
        >
          {label}
        </label>
        <div className="relative mt-1">
          <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400">
            RM
          </span>
          <input
            type="text"
            inputMode="decimal"
            id={name}
            name={name}
            value={editRates[name]}
            onChange={handleInputChange}
            placeholder={formatRate(sharedValue)}
            disabled={isSaving}
            className={`w-full rounded-lg border ${
              overridden
                ? "border-sky-400 dark:border-sky-500"
                : "border-default-300 dark:border-gray-600"
            } bg-white dark:bg-gray-700 py-1.5 pl-9 pr-7 text-right text-sm text-gray-900 dark:text-gray-100 focus:border-sky-500 focus:ring-1 focus:ring-sky-500 disabled:bg-gray-100 dark:disabled:bg-gray-800`}
          />
          {overridden && (
            <button
              type="button"
              onClick={() => handleResetRate(name)}
              title={t("Clear GT override")}
              disabled={isSaving}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 text-gray-400 hover:text-sky-600 dark:hover:text-sky-400"
            >
              <IconRotateClockwise size={14} />
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={handleClose}>
        <TransitionChild as={Fragment}>
          <div
            className="fixed inset-0 bg-black/50 dark:bg-black/70"
            aria-hidden="true"
          />
        </TransitionChild>

        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4 text-center">
            <TransitionChild as={Fragment}>
              <DialogPanel className="w-full max-w-2xl transform overflow-hidden rounded-2xl bg-white dark:bg-gray-800 p-6 text-left align-middle shadow-xl transition-all">
                <DialogTitle
                  as="h3"
                  className="text-lg font-semibold leading-6 text-default-800 dark:text-gray-100"
                >
                  {t("Edit GT rates for {{payCodeId}}", { payCodeId })}
                </DialogTitle>
                <p className="mt-1 text-sm text-default-600 dark:text-gray-300">
                  {payCodeDescription} — {employeeName}
                </p>

                <div className="mt-6 space-y-4">
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-default-700 dark:text-gray-200">
                        {t("GT rate overrides")}
                      </span>
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        {t("Blank = use the shared Tien Hock rate")}
                      </span>
                    </div>
                    <div className="mt-2 grid grid-cols-3 gap-3">
                      {renderRateField(
                        t("Biasa (Normal)"),
                        "biasa",
                        sharedRates.biasa
                      )}
                      {renderRateField(
                        t("Ahad (Sunday)"),
                        "ahad",
                        sharedRates.ahad
                      )}
                      {renderRateField(
                        t("Umum (Holiday)"),
                        "umum",
                        sharedRates.umum
                      )}
                    </div>
                  </div>
                  <GTRateSchedulePanel
                    employeeId={employeeId}
                    payCodeId={payCodeId}
                    baseRates={{
                      biasa:
                        toNullableNumber(existingOverride?.override_rate_biasa) ??
                        toNullableNumber(sharedRates.biasa),
                      ahad:
                        toNullableNumber(existingOverride?.override_rate_ahad) ??
                        toNullableNumber(sharedRates.ahad),
                      umum:
                        toNullableNumber(existingOverride?.override_rate_umum) ??
                        toNullableNumber(sharedRates.umum),
                    }}
                    onSchedulesChanged={onSaved}
                  />
                  {error && (
                    <p className="text-sm text-red-600 dark:text-red-400 text-center">
                      {error}
                    </p>
                  )}
                </div>

                <div className="flex justify-end space-x-3 mt-1">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleClose}
                    disabled={isSaving}
                  >
                    {t("cancel")}
                  </Button>
                  <Button
                    type="button"
                    color="sky"
                    variant="filled"
                    onClick={handleSave}
                    disabled={isSaving}
                  >
                    {isSaving ? t("Saving...") : t("Save Changes")}
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

export default GTEditPayCodeRatesModal;
