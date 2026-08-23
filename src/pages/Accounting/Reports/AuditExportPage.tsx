import React, { useMemo, useState } from "react";
import {
  IconArchive,
  IconDownload,
  IconFileSpreadsheet,
} from "@tabler/icons-react";
import { format } from "date-fns";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import Button from "../../../components/Button";
import TimeNavigator, {
  type TimeRange,
} from "../../../components/TimeNavigator";
import { api } from "../../../routes/utils/api";

type DownloadKind = "pack" | "ledgers" | "debtors";

interface DownloadDefinition {
  endpoint: string;
  filename: string;
}

const FIRST_AUDIT_YEAR: number = 2026;

const getDefaultAuditYear = (): number => {
  const today: Date = new Date();
  const workflowYear: number =
    today.getMonth() <= 2 ? today.getFullYear() - 1 : today.getFullYear();
  return Math.max(FIRST_AUDIT_YEAR, workflowYear);
};

const getDownloadDefinition = (
  kind: DownloadKind,
  year: number,
  version: string
): DownloadDefinition => {
  const shortYear: string = String(year).slice(-2);
  if (kind === "pack") {
    return {
      endpoint: `/api/audit-exports/pack/${year}?version=${encodeURIComponent(version)}`,
      filename: `TIEN_HOCK_AUDIT_LEDGERS_${year}_${version}.zip`,
    };
  }
  if (kind === "ledgers") {
    return {
      endpoint: `/api/audit-exports/ledgers/${year}?version=${encodeURIComponent(version)}`,
      filename: `EXCEL_THLD_(JAN-DEC${shortYear})_${version}.xlsx`,
    };
  }
  return {
    endpoint: `/api/audit-exports/debtors/${year}?version=${encodeURIComponent(version)}`,
    filename: `EXCEL_THDB_(Jan-Dec${shortYear})_${version}.xlsx`,
  };
};

const downloadBlob = (blob: Blob, filename: string): void => {
  const objectUrl: string = URL.createObjectURL(blob);
  const link: HTMLAnchorElement = document.createElement("a");
  link.href = objectUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout((): void => URL.revokeObjectURL(objectUrl), 1000);
};

const AuditExportPage: React.FC = () => {
  const { t } = useTranslation("accounting");
  const currentYear: number = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState<number>(
    getDefaultAuditYear
  );
  const [activeDownload, setActiveDownload] =
    useState<DownloadKind | null>(null);
  const auditYearRange = useMemo(
    (): TimeRange => ({
      start: new Date(selectedYear, 0, 1),
      end: new Date(selectedYear, 11, 31, 23, 59, 59, 999),
    }),
    [selectedYear]
  );
  const earliestAuditDate: Date = useMemo(
    (): Date => new Date(FIRST_AUDIT_YEAR, 0, 1),
    []
  );

  const handleAuditYearChange = (range: TimeRange): void => {
    const year: number = range.start.getFullYear();
    if (year < FIRST_AUDIT_YEAR || year > currentYear) return;
    setSelectedYear(year);
  };

  const handleDownload = async (kind: DownloadKind): Promise<void> => {
    if (activeDownload !== null) return;
    const version: string = format(new Date(), "yyyyMMdd-HHmmss");
    const definition: DownloadDefinition = getDownloadDefinition(
      kind,
      selectedYear,
      version
    );
    const loadingToast: string = toast.loading(t("Preparing audit export..."));
    setActiveDownload(kind);
    try {
      const blob: Blob = await api.downloadBlob(definition.endpoint);
      downloadBlob(blob, definition.filename);
      toast.success(t("Audit export downloaded"));
    } catch (error: unknown) {
      console.error("Failed to download audit export:", error);
      toast.error(t("Failed to generate audit export"));
    } finally {
      toast.dismiss(loadingToast);
      setActiveDownload(null);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-default-900 dark:text-gray-100">
            {t("Audit Excel Export")}
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-default-500 dark:text-gray-400">
            {t(
              "Prepare the annual detailed ledgers requested by the auditors."
            )}
          </p>
        </div>

        <div className="flex w-full flex-col gap-1 text-sm text-default-600 dark:text-gray-300 sm:w-44">
          <span className="font-medium">{t("Audit year")}</span>
          <TimeNavigator
            range={auditYearRange}
            onChange={handleAuditYearChange}
            modes={["year"]}
            presets={false}
            allowFuture={false}
            minDate={earliestAuditDate}
            size="sm"
            pickerPlacement="bottom-right"
            disabled={activeDownload !== null}
            className="w-full"
            triggerClassName="flex-1 justify-between"
          />
        </div>
      </div>

      <div className="rounded-xl border border-sky-200 bg-sky-50 p-5 dark:border-sky-800 dark:bg-sky-950/30">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-sky-800 dark:text-sky-200">
              <IconArchive size={22} stroke={1.7} />
              <h2 className="text-lg font-semibold">
                {t("Complete audit ledger pack")}
              </h2>
            </div>
            <p className="mt-1 max-w-3xl text-sm text-sky-700 dark:text-sky-300">
              {t(
                "Download both workbooks from the same database read, together with their file hashes and control totals."
              )}
            </p>
          </div>
          <Button
            onClick={(): Promise<void> => handleDownload("pack")}
            disabled={activeDownload !== null}
            icon={IconDownload}
            color="sky"
            variant="filled"
            additionalClasses="w-full lg:w-auto"
          >
            {activeDownload === "pack"
              ? t("Preparing...")
              : t("Download both files")}
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-default-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
          <div className="flex items-center gap-2 text-default-800 dark:text-gray-100">
            <IconFileSpreadsheet size={22} stroke={1.7} />
            <h2 className="text-lg font-semibold">{t("LEDGERS workbook")}</h2>
          </div>
          <p className="mt-2 min-h-10 text-sm text-default-500 dark:text-gray-400">
            {t(
              "General-ledger accounts with brought-forward balances, posted entries and running balances."
            )}
          </p>
          <Button
            onClick={(): Promise<void> => handleDownload("ledgers")}
            disabled={activeDownload !== null}
            icon={IconDownload}
            variant="outline"
            additionalClasses="mt-4 w-full"
          >
            {activeDownload === "ledgers"
              ? t("Preparing...")
              : t("Download LEDGERS XLSX")}
          </Button>
        </div>

        <div className="rounded-xl border border-default-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
          <div className="flex items-center gap-2 text-default-800 dark:text-gray-100">
            <IconFileSpreadsheet size={22} stroke={1.7} />
            <h2 className="text-lg font-semibold">{t("DEBTORS workbook")}</h2>
          </div>
          <p className="mt-2 min-h-10 text-sm text-default-500 dark:text-gray-400">
            {t(
              "Customer debtor ledgers from the general ledger, including signed credit balances."
            )}
          </p>
          <Button
            onClick={(): Promise<void> => handleDownload("debtors")}
            disabled={activeDownload !== null}
            icon={IconDownload}
            variant="outline"
            additionalClasses="mt-4 w-full"
          >
            {activeDownload === "debtors"
              ? t("Preparing...")
              : t("Download DEBTORS XLSX")}
          </Button>
        </div>
      </div>

      <div className="rounded-xl border border-default-200 bg-default-50 p-4 text-sm text-default-600 dark:border-gray-700 dark:bg-gray-900/40 dark:text-gray-300">
        <p>
          {t(
            "Only posted journal entries are included. Opening balances follow the same anchor rules as Account Ledger."
          )}
        </p>
        {selectedYear === currentYear && (
          <p className="mt-2 text-amber-700 dark:text-amber-300">
            {t(
              "The current year is still open. Regenerate the files after year-end and after all approved adjustments."
            )}
          </p>
        )}
        <p className="mt-2">
          {t(
            "The manifest verifies the downloaded files and control totals. Keep the frozen database backup and report version separately for the audit record."
          )}
        </p>
      </div>
    </div>
  );
};

export default AuditExportPage;
