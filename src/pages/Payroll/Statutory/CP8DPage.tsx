// src/pages/Payroll/Statutory/CP8DPage.tsx
// CP8D yearly employee particulars (LHDN). Prefill from payroll, edit per
// employee, then export the P{Eno}_{Year}.TXT file. Layout: docs/C.P.8D_FORMAT.pdf.
import React, { useCallback, useEffect, useState } from "react";
import {
  IconDatabaseImport,
  IconDownload,
  IconPencil,
  IconPlus,
  IconRefresh,
  IconTrash,
  IconX,
} from "@tabler/icons-react";
import { format } from "date-fns";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";
import Button from "../../../components/Button";
import LoadingSpinner from "../../../components/LoadingSpinner";
import ConfirmationDialog from "../../../components/ConfirmationDialog";
import TimeNavigator, { TimeRange } from "../../../components/TimeNavigator";
import CP8DRecordFormModal, {
  CP8DRecord,
} from "../../../components/Payroll/CP8DRecordFormModal";
import { usePersistedNumber } from "../../../hooks/usePersistedFilters";
import { api } from "../../../routes/utils/api";

const fmt = (n: number | undefined): string =>
  (Number(n) || 0).toLocaleString("en-MY", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const triggerDownload = (filename: string, content: string) => {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

const CP8DPage: React.FC = () => {
  const { t } = useTranslation("payroll");
  const now = new Date();
  const [selectedYear, setSelectedYear] = usePersistedNumber(
    "cp8dYear",
    2000,
    2100,
    () => now.getFullYear() - 1
  );

  const [records, setRecords] = useState<CP8DRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [modalState, setModalState] = useState<{
    open: boolean;
    record: CP8DRecord | null;
  }>({ open: false, record: null });
  const [deleteTarget, setDeleteTarget] = useState<CP8DRecord | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showPrefillConfirm, setShowPrefillConfirm] = useState(false);
  const [isPrefilling, setIsPrefilling] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [derivingId, setDerivingId] = useState<number | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);

  const fetchRecords = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await api.get(`/api/cp8d/${selectedYear}`);
      setRecords(res.records || []);
    } catch (error) {
      console.error("Error loading CP8D records:", error);
      toast.error(t("Failed to load CP8D records"));
    } finally {
      setIsLoading(false);
    }
  }, [selectedYear, t]);

  useEffect(() => {
    setWarnings([]);
    fetchRecords();
  }, [fetchRecords]);

  const handlePrefill = async () => {
    setIsPrefilling(true);
    try {
      const res = await api.post(`/api/cp8d/${selectedYear}/prefill`, {});
      toast.success(
        t("Prefill complete: {{created}} added, {{skipped}} already existed", {
          created: res.created,
          skipped: res.skipped,
        })
      );
      fetchRecords();
    } catch (error) {
      console.error("Error prefilling CP8D records:", error);
      toast.error(t("Failed to prefill CP8D records"));
    } finally {
      setIsPrefilling(false);
      setShowPrefillConfirm(false);
    }
  };

  const handleDerive = async (record: CP8DRecord) => {
    setDerivingId(record.id);
    try {
      await api.post(`/api/cp8d/records/${record.id}/derive`, {});
      toast.success(
        t("{{name}} re-derived from staff and payroll data", {
          name: record.employee_name,
        })
      );
      fetchRecords();
    } catch (error) {
      console.error("Error re-deriving CP8D record:", error);
      toast.error(t("Failed to re-derive record"));
    } finally {
      setDerivingId(null);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await api.delete(`/api/cp8d/records/${deleteTarget.id}`);
      toast.success(t("CP8D record deleted"));
      setDeleteTarget(null);
      fetchRecords();
    } catch (error) {
      console.error("Error deleting CP8D record:", error);
      toast.error(t("Failed to delete CP8D record"));
    } finally {
      setIsDeleting(false);
    }
  };

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const res = await api.get(`/api/cp8d/${selectedYear}/export`);
      triggerDownload(res.filename, res.content);
      setWarnings(res.warnings || []);
      toast.success(
        t("{{filename}} downloaded ({{count}} employees)", {
          filename: res.filename,
          count: res.count,
        })
      );
    } catch (error) {
      console.error("Error exporting CP8D file:", error);
      toast.error(t("Failed to export CP8D file"));
    } finally {
      setIsExporting(false);
    }
  };

  const cellClass =
    "px-3 py-2 text-sm text-default-700 dark:text-gray-300 whitespace-nowrap";
  const moneyCellClass = `${cellClass} text-right`;
  const headerClass =
    "px-3 py-2 text-left text-xs font-medium text-default-500 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-default-800 dark:text-gray-100">
            {t("CP8D Employee Particulars")}
          </h1>
          <p className="text-sm text-default-500 dark:text-gray-400">
            {t(
              "Yearly LHDN submission file. Prefill from payroll, adjust each employee, then export the TXT file."
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <TimeNavigator
            range={{
              start: new Date(selectedYear, 0, 1),
              end: new Date(selectedYear, 11, 31, 23, 59, 59, 999),
            }}
            onChange={(range: TimeRange) =>
              setSelectedYear(range.start.getFullYear())
            }
            modes={["year"]}
            presets={false}
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          color="sky"
          icon={IconDatabaseImport}
          onClick={() => setShowPrefillConfirm(true)}
          disabled={isPrefilling}
        >
          {isPrefilling ? t("Prefilling...") : t("Prefill from Payroll")}
        </Button>
        <Button
          variant="outline"
          icon={IconPlus}
          onClick={() => setModalState({ open: true, record: null })}
        >
          {t("Add Employee")}
        </Button>
        <Button
          color="emerald"
          icon={IconDownload}
          onClick={handleExport}
          disabled={isExporting || records.length === 0}
        >
          {isExporting ? t("Exporting...") : t("Export TXT")}
        </Button>
      </div>

      {warnings.length > 0 && (
        <div className="rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 p-3">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
              {t("Export warnings ({{count}})", { count: warnings.length })}
            </p>
            <button
              onClick={() => setWarnings([])}
              className="text-amber-600 hover:text-amber-800 dark:text-amber-300"
              aria-label={t("Dismiss")}
            >
              <IconX size={16} />
            </button>
          </div>
          <ul className="mt-1 list-disc pl-5 text-xs text-amber-700 dark:text-amber-300 max-h-40 overflow-y-auto">
            {warnings.map((warning, idx) => (
              <li key={idx}>{warning}</li>
            ))}
          </ul>
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-12">
          <LoadingSpinner />
        </div>
      ) : records.length === 0 ? (
        <div className="text-center py-12 text-default-500 dark:text-gray-400">
          {t("No CP8D records for {{year}} yet", { year: selectedYear })}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-default-200 dark:border-gray-700">
          <table className="min-w-full divide-y divide-default-200 dark:divide-gray-700">
            <thead className="bg-default-50 dark:bg-gray-800">
              <tr>
                <th className={headerClass}>{t("Name")}</th>
                <th className={headerClass}>{t("ID No.")}</th>
                <th className={headerClass}>{t("TIN")}</th>
                <th className={headerClass}>{t("Cat")}</th>
                <th className={headerClass}>{t("Status")}</th>
                <th className={headerClass}>{t("Retirement / Contract End")}</th>
                <th className={`${headerClass} text-right`}>{t("Children")}</th>
                <th className={`${headerClass} text-right`}>{t("Gross")}</th>
                <th className={`${headerClass} text-right`}>{t("EPF")}</th>
                <th className={`${headerClass} text-right`}>{t("SOCSO")}</th>
                <th className={`${headerClass} text-right`}>{t("MTD")}</th>
                <th className={`${headerClass} text-center`}>{t("Actions")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-default-200 dark:divide-gray-700 bg-white dark:bg-gray-900">
              {records.map((record) => (
                <tr key={record.id}>
                  <td className={cellClass}>
                    <div className="font-medium text-default-800 dark:text-gray-100">
                      {record.employee_name}
                    </div>
                    <div className="text-xs text-default-400 dark:text-gray-500">
                      {record.employee_id}
                    </div>
                  </td>
                  <td className={cellClass}>{record.identification_no}</td>
                  <td className={cellClass}>{record.tin || "—"}</td>
                  <td className={cellClass}>{record.employee_category}</td>
                  <td className={cellClass}>{record.employee_status}</td>
                  <td className={cellClass}>
                    {record.retirement_date
                      ? format(new Date(record.retirement_date), "dd/MM/yyyy")
                      : "—"}
                  </td>
                  <td className={moneyCellClass}>{record.children_count}</td>
                  <td className={moneyCellClass}>
                    {fmt(record.gross_remuneration)}
                  </td>
                  <td className={moneyCellClass}>
                    {fmt(record.epf_contribution)}
                  </td>
                  <td className={moneyCellClass}>
                    {fmt(record.socso_contribution)}
                  </td>
                  <td className={moneyCellClass}>{fmt(record.mtd)}</td>
                  <td className={`${cellClass} text-center`}>
                    <div className="flex items-center justify-center gap-1">
                      <button
                        onClick={() =>
                          setModalState({ open: true, record })
                        }
                        className="p-1 text-sky-600 hover:text-sky-800 dark:text-sky-400 dark:hover:text-sky-200"
                        title={t("Edit")}
                      >
                        <IconPencil size={16} />
                      </button>
                      <button
                        onClick={() => handleDerive(record)}
                        disabled={derivingId === record.id}
                        className="p-1 text-emerald-600 hover:text-emerald-800 dark:text-emerald-400 dark:hover:text-emerald-200 disabled:opacity-50"
                        title={t("Re-derive from payroll")}
                      >
                        <IconRefresh size={16} />
                      </button>
                      <button
                        onClick={() => setDeleteTarget(record)}
                        className="p-1 text-rose-600 hover:text-rose-800 dark:text-rose-400 dark:hover:text-rose-200"
                        title={t("Delete")}
                      >
                        <IconTrash size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <CP8DRecordFormModal
        isOpen={modalState.open}
        onClose={() => setModalState({ open: false, record: null })}
        onSuccess={fetchRecords}
        year={selectedYear}
        record={modalState.record}
        existingEmployeeIds={records.map((r) => r.employee_id)}
      />

      <ConfirmationDialog
        isOpen={showPrefillConfirm}
        onClose={() => setShowPrefillConfirm(false)}
        onConfirm={handlePrefill}
        title={t("Prefill CP8D from payroll?")}
        message={t(
          "This adds CP8D rows for employees with payroll in {{year}} who don't have one yet. Existing rows are not changed.",
          { year: selectedYear }
        )}
        confirmButtonText={t("Prefill")}
        variant="default"
        isConfirming={isPrefilling}
      />

      <ConfirmationDialog
        isOpen={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title={t("Delete CP8D record?")}
        message={t(
          "This removes the CP8D row for {{name}} ({{year}}).",
          {
            name: deleteTarget?.employee_name ?? "",
            year: selectedYear,
          }
        )}
        variant="danger"
        isConfirming={isDeleting}
      />
    </div>
  );
};

export default CP8DPage;
