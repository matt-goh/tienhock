// src/pages/GreenTarget/Accounting/GTVoucherGeneratorPage.tsx
//
// Green Target salary Voucher Generator. Posts the monthly JBSL (Staff
// Salary Wages) and JWDR (Director Remuneration) journals into the GT
// ledger. Mirror of Tien Hock's Accounting/VoucherGeneratorPage, simplified
// for GT's two voucher groups (Office / Lori Habuk) plus directors. The
// driver Lori Habuk branch (BW/SS account family) is configurable below.
import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api } from "../../../routes/utils/api";
import toast from "react-hot-toast";
import LoadingSpinner from "../../../components/LoadingSpinner";
import Button from "../../../components/Button";
import MonthNavigator from "../../../components/MonthNavigator";
import ConfirmationDialog from "../../../components/ConfirmationDialog";
import ListboxSelect from "../../../components/ListboxSelect";
import { usePersistedMonth } from "../../../hooks/usePersistedFilters";
import { useScrollRestoration } from "../../../hooks/useScrollRestoration";
import {
  generatePayrollSummaryPDF,
  type PayrollSummaryPDFData,
} from "../../../utils/accounting/PayrollSummaryPDFMake";
import { GREENTARGET_INFO } from "../../../utils/invoice/einvoice/companyInfo";
import GreenTargetLogo from "../../../utils/GreenTargetLogo.png";
import {
  IconFileInvoice,
  IconCheck,
  IconAlertCircle,
  IconExternalLink,
  IconAlertTriangle,
  IconChevronDown,
  IconChevronUp,
  IconTableExport,
} from "@tabler/icons-react";

const API_BASE = "/greentarget/api/journal-vouchers";
const JOURNAL_DETAILS_PATH = "/greentarget/accounting/journal-entries";
const MONTH_NAMES: string[] = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

interface JournalLine {
  account_code: string;
  particulars: string;
  debit: number;
  credit: number;
}

interface VoucherPreview {
  reference_no: string;
  entry_date: string;
  lines: JournalLine[];
  totalDebit: number;
  totalCredit: number;
}

interface ExistingEntry {
  id: number;
  reference_no: string;
  status: string;
}

interface PreviewResponse {
  jwdr: VoucherPreview | null;
  jbsl: VoucherPreview | null;
  unmapped_drivers: string[];
  existing: {
    jwdr: ExistingEntry | null;
    jbsl: ExistingEntry | null;
  };
}

interface BranchMapping {
  employee_id: string;
  name: string;
  branch: "BW" | "SS" | null;
}

interface GenerateResult {
  created?: boolean;
  skipped?: boolean;
  message?: string;
  id?: number;
  reference?: string;
}

const formatAmount = (n: number): string =>
  n.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const GTVoucherGeneratorPage: React.FC = () => {
  const { t } = useTranslation("greentarget");
  const navigate = useNavigate();
  const [selectedMonth, setSelectedMonth] = usePersistedMonth(
    "gtVoucherGeneratorMonth"
  );
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [generating, setGenerating] = useState<boolean>(false);
  const [printingSummary, setPrintingSummary] = useState<boolean>(false);
  const [confirming, setConfirming] = useState<"JBSL" | "JWDR" | "ALL" | null>(null);
  const [branches, setBranches] = useState<BranchMapping[]>([]);
  const [showBranches, setShowBranches] = useState<boolean>(false);
  const [savingBranch, setSavingBranch] = useState<string | null>(null);

  useScrollRestoration("gt-voucher-generator", !loading && preview !== null);

  const year = selectedMonth.getFullYear();
  const month = selectedMonth.getMonth() + 1;

  const fetchPreview = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get(`${API_BASE}/preview/${year}/${month}`);
      setPreview(data);
    } catch (error: any) {
      console.error("Error fetching voucher preview:", error);
      toast.error(error?.message || t("Failed to load voucher preview"));
      setPreview(null);
    } finally {
      setLoading(false);
    }
  }, [year, month]);

  const fetchBranches = useCallback(async () => {
    try {
      const data = await api.get(`${API_BASE}/branch-mappings`);
      setBranches(data);
    } catch (error: any) {
      console.error("Error fetching branch mappings:", error);
      toast.error(
        error?.message || t("Failed to load driver branch mappings")
      );
    }
  }, []);

  useEffect(() => {
    fetchPreview();
  }, [fetchPreview]);

  useEffect(() => {
    fetchBranches();
  }, [fetchBranches]);

  const handleGenerate = async (types: ("JBSL" | "JWDR")[]) => {
    setGenerating(true);
    try {
      const data = await api.post(`${API_BASE}/generate`, {
        year,
        month,
        voucher_types: types,
      });
      const results: Record<string, GenerateResult> = data.results || {};
      let anyCreated = false;
      Object.entries(results).forEach(([key, r]) => {
        if (r.created) {
          anyCreated = true;
          toast.success(
            t("{{type}} created: {{reference}}", {
              type: key.toUpperCase(),
              reference: r.reference,
            })
          );
        } else if (r.skipped) {
          toast(
            t("{{type}}: {{message}}", {
              type: key.toUpperCase(),
              message: r.message,
            }),
            { icon: "ℹ️" }
          );
        }
      });
      if (anyCreated) {
        await fetchPreview();
      }
    } catch (error: any) {
      console.error("Error generating vouchers:", error);
      toast.error(error?.message || t("Failed to generate vouchers"));
    } finally {
      setGenerating(false);
      setConfirming(null);
    }
  };

  const handleBranchChange = async (employeeId: string, branch: "BW" | "SS") => {
    setSavingBranch(employeeId);
    try {
      await api.put(`${API_BASE}/branch-mappings/${employeeId}`, { branch });
      setBranches((prev) =>
        prev.map((b) => (b.employee_id === employeeId ? { ...b, branch } : b))
      );
      toast.success(
        t("Branch for {{employee}} set to {{branch}}", {
          employee: employeeId,
          branch,
        })
      );
      fetchPreview();
    } catch (error: any) {
      console.error("Error saving branch:", error);
      toast.error(error?.message || t("Failed to save branch"));
    } finally {
      setSavingBranch(null);
    }
  };

  const handlePrintSummary = async (): Promise<void> => {
    setPrintingSummary(true);
    try {
      const summary = (await api.get(
        `${API_BASE}/payroll-summary/${year}/${month}`
      )) as Omit<PayrollSummaryPDFData, "periodLabel">;
      await generatePayrollSummaryPDF(
        {
          ...summary,
          periodLabel: `${MONTH_NAMES[month - 1]} ${year}`,
        },
        {
          companyInfo: GREENTARGET_INFO,
          logoUrl: GreenTargetLogo,
          directorVoucherLabel: "DIRECTOR REMUNERATION",
          workersVoucherLabel: "STAFF SALARY WAGES",
        }
      );
    } catch (error: unknown) {
      console.error("Error printing Green Target payroll summary:", error);
      const message =
        error instanceof Error
          ? error.message
          : t("Failed to print payroll summary");
      toast.error(message);
    } finally {
      setPrintingSummary(false);
    }
  };

  const renderVoucherCard = (
    title: string,
    type: "JBSL" | "JWDR",
    voucher: VoucherPreview | null,
    existing: ExistingEntry | null
  ) => {
    const balanced =
      voucher !== null && Math.abs(voucher.totalDebit - voucher.totalCredit) <= 0.01;
    const unmapped = preview?.unmapped_drivers ?? [];
    const blocked = type === "JBSL" && unmapped.length > 0;

    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-default-200 dark:border-gray-700 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-default-200 dark:border-gray-700 bg-default-50 dark:bg-gray-900/40">
          <div className="flex items-center gap-2">
            <IconFileInvoice size={18} className="text-sky-600 dark:text-sky-400" />
            <h2 className="font-semibold text-default-800 dark:text-gray-100">
              {title}
            </h2>
            {voucher && (
              <span className="text-sm text-default-500 dark:text-gray-400">
                {voucher.reference_no}
              </span>
            )}
          </div>
          {existing ? (
            <span className="inline-flex items-center gap-1 text-sm font-medium text-emerald-700 dark:text-emerald-400">
              <IconCheck size={16} /> {t("Posted")}
            </span>
          ) : voucher ? (
            balanced && !blocked ? (
              <Button
                size="sm"
                color="sky"
                disabled={generating}
                onClick={() => setConfirming(type)}
              >
                {t("Generate")}
              </Button>
            ) : (
              <span className="inline-flex items-center gap-1 text-sm font-medium text-amber-700 dark:text-amber-400">
                <IconAlertTriangle size={16} /> {t("Blocked")}
              </span>
            )
          ) : (
            <span className="text-sm text-default-400 dark:text-gray-500">
              {t("No payroll data")}
            </span>
          )}
        </div>

        {existing && (
          <div className="px-4 py-3">
            <button
              onClick={() => navigate(`${JOURNAL_DETAILS_PATH}/${existing.id}`)}
              className="inline-flex items-center gap-1 text-sm text-sky-700 dark:text-sky-400 hover:underline"
            >
              {t("View journal entry")} <IconExternalLink size={14} />
            </button>
          </div>
        )}

        {!existing && voucher && (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-default-500 dark:text-gray-400 border-b border-default-100 dark:border-gray-700">
                  <th className="px-4 py-2 font-medium">{t("Account")}</th>
                  <th className="px-4 py-2 font-medium">{t("Particulars")}</th>
                  <th className="px-4 py-2 font-medium text-right">
                    {t("Debit")}
                  </th>
                  <th className="px-4 py-2 font-medium text-right">
                    {t("Credit")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {voucher.lines.map((line, i) => (
                  <tr
                    key={i}
                    className="border-b border-default-50 dark:border-gray-700/50 text-default-700 dark:text-gray-300"
                  >
                    <td className="px-4 py-1.5 font-mono">{line.account_code}</td>
                    <td className="px-4 py-1.5">{line.particulars}</td>
                    <td className="px-4 py-1.5 text-right tabular-nums">
                      {line.debit > 0 ? formatAmount(line.debit) : ""}
                    </td>
                    <td className="px-4 py-1.5 text-right tabular-nums">
                      {line.credit > 0 ? formatAmount(line.credit) : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="font-semibold text-default-800 dark:text-gray-100">
                  <td className="px-4 py-2" colSpan={2}>
                    {t("Total")}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {formatAmount(voucher.totalDebit)}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {formatAmount(voucher.totalCredit)}
                  </td>
                </tr>
              </tfoot>
            </table>
            {!balanced && (
              <div className="flex items-center gap-2 px-4 py-2 text-sm text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20">
                <IconAlertCircle size={16} />
                {t("Voucher is out of balance and cannot be generated.")}
              </div>
            )}
            {blocked && (
              <div className="flex items-center gap-2 px-4 py-2 text-sm text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20">
                <IconAlertCircle size={16} />
                {t(
                  "No Lori Habuk branch mapped for: {{drivers}}. Set it in Driver Branch Mapping below.",
                  { drivers: unmapped.join(", ") }
                )}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  const bothExist =
    (preview?.existing.jwdr != null || preview?.jwdr == null) &&
    (preview?.existing.jbsl != null || preview?.jbsl == null);
  const anyBlocked =
    (preview?.unmapped_drivers?.length ?? 0) > 0 && preview?.jbsl != null;

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-default-800 dark:text-gray-100">
            {t("Voucher Generator")}
          </h1>
          <p className="text-sm text-default-500 dark:text-gray-400">
            {t(
              "Generate the monthly JBSL (Staff Salary Wages) and JWDR (Director Remuneration) journals from the processed payroll."
            )}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            color="default"
            variant="outline"
            size="md"
            icon={IconTableExport}
            iconPosition="left"
            disabled={loading || printingSummary}
            onClick={handlePrintSummary}
            title={t(
              "Print the Director/Workers payroll summary that reconciles to these vouchers"
            )}
          >
            {printingSummary ? t("Preparing...") : t("Payroll Summary")}
          </Button>
          <MonthNavigator
            selectedMonth={selectedMonth}
            onChange={setSelectedMonth}
            minDate={new Date(2026, 6, 1)}
          />
          <Button
            color="sky"
            disabled={generating || loading || bothExist || anyBlocked}
            onClick={() => setConfirming("ALL")}
          >
            {t("Generate All")}
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <LoadingSpinner />
        </div>
      ) : (
        <>
          {renderVoucherCard(
            t("Staff Salary Wages (JBSL)"),
            "JBSL",
            preview?.jbsl ?? null,
            preview?.existing.jbsl ?? null
          )}
          {renderVoucherCard(
            t("Director Remuneration (JWDR)"),
            "JWDR",
            preview?.jwdr ?? null,
            preview?.existing.jwdr ?? null
          )}

          <div className="bg-white dark:bg-gray-800 rounded-lg border border-default-200 dark:border-gray-700 shadow-sm">
            <button
              className="w-full flex items-center justify-between px-4 py-3 text-left"
              onClick={() => setShowBranches((s) => !s)}
            >
              <span className="font-semibold text-default-800 dark:text-gray-100">
                {t("Driver Branch Mapping")}
              </span>
              {showBranches ? (
                <IconChevronUp size={18} className="text-default-400" />
              ) : (
                <IconChevronDown size={18} className="text-default-400" />
              )}
            </button>
            {showBranches && (
              <div className="px-4 pb-4">
                <p className="text-sm text-default-500 dark:text-gray-400 mb-3">
                  {t(
                    "Lori Habuk (driver) wages post to the BW (Bongawan) or SS account family. Office staff always post to the Office family."
                  )}
                </p>
                {branches.length === 0 ? (
                  <p className="text-sm text-default-400 dark:text-gray-500">
                    {t("No active driver employees.")}
                  </p>
                ) : (
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="text-left text-default-500 dark:text-gray-400 border-b border-default-100 dark:border-gray-700">
                        <th className="py-2 pr-4 font-medium">
                          {t("Employee")}
                        </th>
                        <th className="py-2 pr-4 font-medium">{t("Name")}</th>
                        <th className="py-2 font-medium">{t("Branch")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {branches.map((b) => (
                        <tr
                          key={b.employee_id}
                          className="border-b border-default-50 dark:border-gray-700/50 text-default-700 dark:text-gray-300"
                        >
                          <td className="py-2 pr-4 font-mono">{b.employee_id}</td>
                          <td className="py-2 pr-4">{b.name}</td>
                          <td className="py-2">
                            <ListboxSelect
                              className="w-44"
                              value={b.branch ?? ""}
                              disabled={savingBranch === b.employee_id}
                              placeholder={t("Select…")}
                              ariaLabel={t("Branch for {{employee}}", {
                                employee: b.employee_id,
                              })}
                              options={[
                                { value: "BW", label: "BW (Bongawan)" },
                                { value: "SS", label: "SS" },
                              ]}
                              onChange={(value) =>
                                handleBranchChange(
                                  b.employee_id,
                                  value as "BW" | "SS"
                                )
                              }
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </div>
        </>
      )}

      <ConfirmationDialog
        isOpen={confirming !== null}
        onClose={() => setConfirming(null)}
        onConfirm={() =>
          handleGenerate(
            confirming === "ALL" ? ["JBSL", "JWDR"] : [confirming as "JBSL" | "JWDR"]
          )
        }
        title={t("Generate Voucher")}
        message={
          confirming === "ALL"
            ? t(
                "Post the JBSL and JWDR salary journals for {{month}}/{{year}}? This writes posted journals into the Green Target ledger.",
                { month, year }
              )
            : t(
                "Post the {{type}} salary journal for {{month}}/{{year}}? This writes a posted journal into the Green Target ledger.",
                { type: confirming, month, year }
              )
        }
        confirmButtonText={generating ? t("Generating…") : t("Generate")}
        variant="default"
      />
    </div>
  );
};

export default GTVoucherGeneratorPage;
