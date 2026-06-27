import React, { useEffect, useMemo, useState } from "react";
import {
  IconDownload,
  IconExternalLink,
  IconFileInvoice,
  IconPaperclip,
  IconPencil,
  IconPlus,
  IconRefresh,
  IconSearch,
  IconSelectAll,
  IconSend,
  IconSquare,
  IconSquareCheckFilled,
  IconSquareMinusFilled,
  IconX,
} from "@tabler/icons-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import toast from "react-hot-toast";
import Button from "../../../components/Button";
import ConfirmationDialog from "../../../components/ConfirmationDialog";
import TimeNavigator from "../../../components/TimeNavigator";
import SubmissionResultsModal from "../../../components/Invoice/SubmissionResultsModal";
import LoadingSpinner from "../../../components/LoadingSpinner";
import { FormListbox } from "../../../components/FormComponents";
import { api } from "../../../routes/utils/api";
import {
  SelfBilledEInvoiceStatus,
  SelfBilledInvoiceStatus,
  SelfBilledInvoiceListItem,
} from "../../../types/types";

interface SubmissionDocument {
  internalId: string;
  uuid: string;
  longId?: string;
  status?: string;
  dateTimeReceived?: string;
  dateTimeValidated?: string;
}

interface RejectedSubmissionDocument {
  internalId: string;
  error: {
    code: string;
    message: string;
    target?: string;
    details?: Array<{
      code?: string;
      message: string;
      target?: string;
    }>;
  };
}

interface SelfBilledSubmissionResult {
  success: boolean;
  message: string;
  shouldStopAtValidation?: boolean;
  acceptedDocuments?: SubmissionDocument[];
  rejectedDocuments?: RejectedSubmissionDocument[];
  pendingUpdated?: Array<{
    id: string;
    status: string;
    longId?: string;
  }>;
  pendingFailed?: Array<{
    id: string;
    error: string;
  }>;
  overallStatus: string;
  submissionUid?: string;
  documentCount?: number;
  dateTimeReceived?: string;
}

interface ApiError extends Error {
  status?: number;
  data?: SelfBilledSubmissionResult;
}

const invoiceStatusOptions = [
  { id: "", name: "All Docs" },
  { id: "active", name: "Active" },
  { id: "cancelled", name: "Cancelled" },
];

const eInvoiceStatusOptions = [
  { id: "", name: "All E-Invoice" },
  { id: "draft", name: "Not Submitted" },
  { id: "pending", name: "Pending" },
  { id: "valid", name: "Valid" },
  { id: "invalid", name: "Invalid" },
  { id: "cancelled", name: "Cancelled" },
];

const getStatusLabel = (status: SelfBilledEInvoiceStatus): string => {
  if (!status) return "Not Submitted";
  return status.charAt(0).toUpperCase() + status.slice(1);
};

const getStatusClasses = (status: SelfBilledEInvoiceStatus): string => {
  switch (status) {
    case "valid":
      return "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300";
    case "pending":
      return "bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-300";
    case "invalid":
      return "bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300";
    case "cancelled":
      return "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300";
    default:
      return "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300";
  }
};

const getInvoiceStatusLabel = (status: SelfBilledInvoiceStatus): string => {
  return status === "cancelled" ? "Cancelled" : "Active";
};

const getInvoiceStatusClasses = (status: SelfBilledInvoiceStatus): string => {
  if (status === "cancelled") {
    return "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300";
  }
  return "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300";
};

const formatDate = (value: string): string => {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("en-MY", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

const formatAmount = (amount: number | string, currency: string): string => {
  const numericAmount = Number(amount || 0);
  return new Intl.NumberFormat("en-MY", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(numericAmount);
};

const formatFileSize = (bytes?: number | null): string => {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};


const formatDateForApi = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const canSubmitInvoice = (invoice: SelfBilledInvoiceListItem): boolean => {
  return (
    invoice.purchase_kind !== "local" &&
    invoice.invoice_status !== "cancelled" &&
    (invoice.einvoice_status === null || invoice.einvoice_status === "invalid")
  );
};

const getMyInvoisPortalUrl = (
  invoice: SelfBilledInvoiceListItem
): string | null => {
  if (
    !invoice.uuid ||
    !invoice.long_id ||
    (invoice.einvoice_status !== "valid" &&
      invoice.einvoice_status !== "cancelled")
  ) {
    return null;
  }

  return `https://myinvois.hasil.gov.my/${invoice.uuid}/share/${invoice.long_id}`;
};

const getInvoicePath = (invoice: SelfBilledInvoiceListItem, selectedMonth: Date): string => {
  const month = `${selectedMonth.getFullYear()}-${String(selectedMonth.getMonth() + 1).padStart(2, "0")}`;
  return invoice.purchase_kind === "local"
    ? `/stock/general-purchases/local/${invoice.id}?month=${month}`
    : `/stock/general-purchases/${invoice.id}?month=${month}`;
};

const GeneralPurchaseInvoiceListPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [invoices, setInvoices] = useState<SelfBilledInvoiceListItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [total, setTotal] = useState<number>(0);
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [selectedInvoiceStatus, setSelectedInvoiceStatus] = useState<string>("");
  const [selectedEInvoiceStatus, setSelectedEInvoiceStatus] = useState<string>("");
  const [selectedInvoiceIds, setSelectedInvoiceIds] = useState<Set<number>>(
    new Set()
  );
  const [showEInvoiceConfirm, setShowEInvoiceConfirm] =
    useState<boolean>(false);
  const [showSubmissionResults, setShowSubmissionResults] =
    useState<boolean>(false);
  const [submissionResults, setSubmissionResults] =
    useState<SelfBilledSubmissionResult | null>(null);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [refreshingInvoiceId, setRefreshingInvoiceId] = useState<number | null>(
    null
  );

  const [selectedMonth, setSelectedMonth] = useState<Date>(() => {
    const param = searchParams.get("month");
    if (param) {
      const [year, month] = param.split("-").map(Number);
      if (year && month >= 1 && month <= 12) {
        return new Date(year, month - 1, 1);
      }
    }
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  const dateRange = useMemo(() => ({
    start: new Date(selectedMonth.getFullYear(), selectedMonth.getMonth(), 1),
    end: new Date(selectedMonth.getFullYear(), selectedMonth.getMonth() + 1, 0, 23, 59, 59, 999),
  }), [selectedMonth]);

  const handleTimeNavigatorChange = (range: { start: Date; end: Date }): void => {
    const date = range.start;
    setSelectedMonth(date);
    setSearchParams({ month: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}` }, { replace: true });
  };

  const fetchInvoices = async (): Promise<void> => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.append("limit", "100");
      if (searchTerm) params.append("search", searchTerm);
      if (selectedInvoiceStatus) {
        params.append("invoice_status", selectedInvoiceStatus);
      }
      if (selectedEInvoiceStatus) {
        params.append("einvoice_status", selectedEInvoiceStatus);
      }
      params.append("start_date", formatDateForApi(dateRange.start));
      params.append("end_date", formatDateForApi(dateRange.end));

      const response = await api.get(
        `/api/general-purchases?${params.toString()}`
      );
      setInvoices(response.invoices || []);
      setTotal(response.total || 0);
    } catch (error) {
      console.error("Error fetching general purchases:", error);
      toast.error("Failed to load general purchases");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer: number = window.setTimeout(
      () => fetchInvoices(),
      searchTerm ? 300 : 0
    );
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedInvoiceStatus, selectedEInvoiceStatus, dateRange, searchTerm]);

  const totals = useMemo(() => {
    return invoices.reduce(
      (accumulator, invoice) => ({
        foreign: accumulator.foreign + Number(invoice.total_foreign_amount || 0),
        myr: accumulator.myr + Number(invoice.payable_amount_myr || 0),
      }),
      { foreign: 0, myr: 0 }
    );
  }, [invoices]);

  const selectedInvoices = useMemo(() => {
    return invoices.filter((invoice: SelfBilledInvoiceListItem) =>
      selectedInvoiceIds.has(invoice.id)
    );
  }, [invoices, selectedInvoiceIds]);

  const eligibleSelectedInvoices = useMemo(() => {
    return selectedInvoices.filter((invoice: SelfBilledInvoiceListItem) =>
      canSubmitInvoice(invoice)
    );
  }, [selectedInvoices]);

  const selectedTotalMyr = useMemo(() => {
    return selectedInvoices.reduce(
      (sum: number, invoice: SelfBilledInvoiceListItem) =>
        sum + Number(invoice.payable_amount_myr || 0),
      0
    );
  }, [selectedInvoices]);

  const allVisibleSelected =
    invoices.length > 0 &&
    invoices.every((invoice: SelfBilledInvoiceListItem) =>
      selectedInvoiceIds.has(invoice.id)
    );

  const clearSearch = (): void => {
    setSearchTerm("");
  };

  const toggleInvoiceSelection = (invoiceId: number): void => {
    setSelectedInvoiceIds((previous: Set<number>) => {
      const nextSelected = new Set(previous);
      if (nextSelected.has(invoiceId)) {
        nextSelected.delete(invoiceId);
      } else {
        nextSelected.add(invoiceId);
      }
      return nextSelected;
    });
  };

  const toggleSelectionBar = (): void => {
    if (selectedInvoiceIds.size > 0) {
      setSelectedInvoiceIds(new Set());
      return;
    }

    setSelectedInvoiceIds(
      new Set(invoices.map((invoice: SelfBilledInvoiceListItem) => invoice.id))
    );
  };

  const toggleVisibleSelection = (): void => {
    setSelectedInvoiceIds((previous: Set<number>) => {
      const nextSelected = new Set(previous);
      if (allVisibleSelected) {
        invoices.forEach((invoice: SelfBilledInvoiceListItem) => {
          nextSelected.delete(invoice.id);
        });
      } else {
        invoices.forEach((invoice: SelfBilledInvoiceListItem) => {
          nextSelected.add(invoice.id);
        });
      }
      return nextSelected;
    });
  };

  const handleBulkSubmitEInvoice = (): void => {
    if (selectedInvoiceIds.size === 0) return;

    if (eligibleSelectedInvoices.length === 0) {
      toast.error(
        "No selected foreign purchases are eligible for e-invoice submission."
      );
      return;
    }

    if (eligibleSelectedInvoices.length < selectedInvoiceIds.size) {
      const ineligibleCount =
        selectedInvoiceIds.size - eligibleSelectedInvoices.length;
      toast.error(
        `${ineligibleCount} selected invoice(s) will be skipped because they are cancelled locally or already pending, valid, or cancelled in MyInvois.`,
        { duration: 6000 }
      );
    }

    setShowEInvoiceConfirm(true);
  };

  const downloadSupportingDocument = async (
    event: React.MouseEvent<HTMLButtonElement>,
    invoice: SelfBilledInvoiceListItem
  ): Promise<void> => {
    event.stopPropagation();
    if (!invoice.supporting_document_filename) return;

    try {
      const blob = await api.downloadBlob(
        `/api/general-purchases/${invoice.id}/supporting-document`
      );
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = invoice.supporting_document_filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error: unknown) {
      console.error("Error downloading supporting document:", error);
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to download supporting document"
      );
    }
  };

  const refreshEInvoiceStatus = async (
    event: React.MouseEvent<HTMLButtonElement>,
    invoice: SelfBilledInvoiceListItem
  ): Promise<void> => {
    event.stopPropagation();
    if (!invoice.uuid || refreshingInvoiceId !== null) return;

    setRefreshingInvoiceId(invoice.id);
    try {
      await api.put(`/api/general-purchases/${invoice.id}/refresh-status`, {});
      toast.success("E-Invoice status refreshed");
      await fetchInvoices();
    } catch (error: unknown) {
      console.error("Error refreshing self-billed status:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to refresh E-Invoice"
      );
    } finally {
      setRefreshingInvoiceId(null);
    }
  };

  const confirmBulkSubmitEInvoice = async (): Promise<void> => {
    setShowEInvoiceConfirm(false);

    const invoiceIds = eligibleSelectedInvoices.map(
      (invoice: SelfBilledInvoiceListItem) => invoice.id
    );

    if (invoiceIds.length === 0) {
      toast.error("No eligible self-billed invoices found to submit.");
      return;
    }

    setSubmissionResults(null);
    setSubmitting(true);
    setShowSubmissionResults(true);

    try {
      const response = (await api.post("/api/general-purchases/submit", {
        invoiceIds,
      })) as SelfBilledSubmissionResult;

      setSubmissionResults(response);

      const acceptedCount = response.acceptedDocuments?.length || 0;
      const rejectedCount = response.rejectedDocuments?.length || 0;

      if (acceptedCount > 0 && rejectedCount === 0) {
        toast.success(`Submitted ${acceptedCount} foreign purchase(s)`);
      } else if (acceptedCount > 0 && rejectedCount > 0) {
        toast.success(
          `Partial success: ${acceptedCount} accepted, ${rejectedCount} rejected`
        );
      } else {
        toast.error(response.message || "E-invoice submission failed");
      }

      setSelectedInvoiceIds(new Set());
      await fetchInvoices();
    } catch (error: unknown) {
      const apiError = error as ApiError;
      console.error("Error submitting self-billed invoices:", apiError);
      if (apiError.data) {
        setSubmissionResults(apiError.data);
      } else {
        setShowSubmissionResults(false);
      }
      toast.error(apiError.message || "Failed to submit self-billed invoices");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-col gap-2 rounded-lg border border-default-200 bg-white px-3 py-2 shadow-sm dark:border-gray-700 dark:bg-gray-800 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-lg font-semibold text-default-900 dark:text-gray-100">
            {total > 0 && !loading ? `${total} ` : ""}General Purchases
          </h1>
          <span className="hidden text-default-300 dark:text-gray-600 sm:inline">
            |
          </span>
          <TimeNavigator
            range={dateRange}
            onChange={handleTimeNavigatorChange}
            modes={["month"]}
            presets={false}
            size="sm"
          />
          <span className="hidden text-default-300 dark:text-gray-600 sm:inline">
            |
          </span>
          <div className="flex h-8 items-center rounded-lg border border-default-200 bg-default-50 px-3 text-sm dark:border-gray-700 dark:bg-gray-900/40">
            <span className="mr-2 text-default-500 dark:text-gray-400">MYR</span>
            <span className="font-mono font-semibold text-default-900 dark:text-gray-100">
              {totals.myr.toLocaleString("en-MY", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div
            className="relative h-8 w-full sm:w-48"
            title="Search by purchase number, supplier, order, or platform"
          >
            <IconSearch
              size={16}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-default-400 dark:text-gray-500"
            />
            <input
              type="text"
              value={searchTerm}
              onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                setSearchTerm(event.target.value)
              }
              placeholder="Search"
              className="h-8 w-full rounded-lg border border-default-300 bg-white pl-9 pr-8 text-sm text-default-900 outline-none placeholder:text-default-400 focus:border-sky-500 focus:ring-1 focus:ring-sky-500 dark:border-gray-600 dark:bg-gray-900/50 dark:text-gray-100 dark:placeholder:text-gray-500"
            />
            {searchTerm && (
              <button
                type="button"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-default-400 hover:text-default-700 dark:text-gray-400 dark:hover:text-gray-200"
                onClick={clearSearch}
                title="Clear search"
              >
                <IconX size={15} />
              </button>
            )}
          </div>

          <div className="h-8 w-full sm:w-32">
            <FormListbox
              name="invoice_status"
              value={selectedInvoiceStatus}
              onChange={setSelectedInvoiceStatus}
              options={invoiceStatusOptions}
              className="[&_button]:h-8 [&_button]:py-1"
            />
          </div>

          <div className="h-8 w-full sm:w-40">
            <FormListbox
              name="einvoice_status"
              value={selectedEInvoiceStatus}
              onChange={setSelectedEInvoiceStatus}
              options={eInvoiceStatusOptions}
              className="[&_button]:h-8 [&_button]:py-1"
            />
          </div>

          <Button
            type="button"
            icon={IconRefresh}
            variant="outline"
            size="sm"
            className="h-8 w-8 rounded-lg !px-0"
            onClick={fetchInvoices}
          />
          <Button
            type="button"
            icon={IconPlus}
            color="sky"
            variant="filled"
            size="sm"
            className="h-8 rounded-lg !px-3"
            onClick={() => navigate(`/stock/general-purchases/new/local?month=${selectedMonth.getFullYear()}-${String(selectedMonth.getMonth() + 1).padStart(2, "0")}`)}
          >
            New Local
          </Button>
          <Button
            type="button"
            icon={IconPlus}
            color="amber"
            variant="outline"
            size="sm"
            className="h-8 rounded-lg !px-3"
            onClick={() => navigate(`/stock/general-purchases/new/foreign?month=${selectedMonth.getFullYear()}-${String(selectedMonth.getMonth() + 1).padStart(2, "0")}`)}
          >
            New Foreign
          </Button>
        </div>
      </div>

      {!loading && invoices.length > 0 && (
        <div className="flex flex-col gap-2 rounded-lg border border-default-200 bg-white px-3 py-2 shadow-sm dark:border-gray-700 dark:bg-gray-800 sm:flex-row sm:items-center sm:justify-between">
          <button
            type="button"
            className="flex min-h-8 flex-1 flex-wrap items-center gap-2 rounded-lg px-1 text-left transition-colors hover:bg-default-50 focus:outline-none focus:ring-2 focus:ring-sky-500 dark:hover:bg-gray-700/50"
            onClick={toggleSelectionBar}
            title={
              selectedInvoiceIds.size > 0
                ? "Clear selection"
                : "Select all visible general purchases"
            }
          >
            <span className="rounded-full p-1">
              {selectedInvoiceIds.size > 0 ? (
                <IconSquareMinusFilled
                  className="text-sky-600 dark:text-sky-400"
                  size={20}
                />
              ) : (
                <IconSelectAll
                  className="text-default-400 dark:text-gray-500"
                  size={20}
                />
              )}
            </span>
            {selectedInvoiceIds.size > 0 ? (
              <span className="flex flex-wrap items-center gap-x-2 text-sm font-medium text-sky-800 dark:text-sky-300">
                <span>{selectedInvoiceIds.size} selected</span>
                <span className="hidden h-4 border-r border-sky-300 dark:border-sky-600 sm:inline" />
                <span>
                  {formatAmount(selectedTotalMyr, "MYR")}
                </span>
                <span className="hidden h-4 border-r border-sky-300 dark:border-sky-600 sm:inline" />
                <span>{eligibleSelectedInvoices.length} eligible</span>
              </span>
            ) : (
              <span className="text-sm text-default-500 dark:text-gray-400">
                Select foreign purchases to submit
              </span>
            )}
          </button>

          <div
            className="flex items-center"
            onClick={(event: React.MouseEvent<HTMLDivElement>) =>
              event.stopPropagation()
            }
          >
            {selectedInvoiceIds.size > 0 && (
              <Button
                type="button"
                icon={IconSend}
                color="amber"
                variant="outline"
                size="sm"
                className="h-8 rounded-lg"
                disabled={submitting}
                onClick={handleBulkSubmitEInvoice}
              >
                Submit e-Invoice
              </Button>
            )}
          </div>
        </div>
      )}

      <div className="overflow-hidden rounded-lg border border-default-200 bg-white dark:border-gray-700 dark:bg-gray-800">
        {loading ? (
          <div className="flex justify-center py-16">
            <LoadingSpinner />
          </div>
        ) : invoices.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-default-500 dark:text-gray-400">
            <IconFileInvoice size={32} className="mb-2" />
            <p className="text-sm">No general purchases found.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-default-200 dark:divide-gray-700">
              <thead className="bg-default-50 dark:bg-gray-900/50">
                <tr>
                  <th className="w-10 px-3 py-2 text-left">
                    <button
                      type="button"
                      className="rounded p-1 text-default-400 hover:bg-default-100 hover:text-sky-600 dark:text-gray-500 dark:hover:bg-gray-700 dark:hover:text-sky-400"
                      onClick={toggleVisibleSelection}
                      title={
                        allVisibleSelected
                          ? "Clear selection"
                          : "Select all visible general purchases"
                      }
                    >
                      {allVisibleSelected ? (
                        <IconSquareCheckFilled size={18} />
                      ) : (
                        <IconSquare size={18} />
                      )}
                    </button>
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-default-500 dark:text-gray-400">
                    Date
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-default-500 dark:text-gray-400">
                    Document
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-default-500 dark:text-gray-400">
                    Supplier
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-default-500 dark:text-gray-400">
                    Reference
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-default-500 dark:text-gray-400">
                    Doc
                  </th>
                  <th className="px-3 py-2 text-right text-xs font-medium uppercase tracking-wider text-default-500 dark:text-gray-400">
                    Foreign
                  </th>
                  <th className="px-3 py-2 text-right text-xs font-medium uppercase tracking-wider text-default-500 dark:text-gray-400">
                    MYR
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-default-500 dark:text-gray-400">
                    Status
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-default-500 dark:text-gray-400">
                    E-Invoice
                  </th>
                  <th className="px-3 py-2 text-right text-xs font-medium uppercase tracking-wider text-default-500 dark:text-gray-400">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-default-200 dark:divide-gray-700">
                {invoices.map((invoice: SelfBilledInvoiceListItem) => {
                  const portalUrl = getMyInvoisPortalUrl(invoice);
                  return (
                  <tr
                    key={invoice.id}
                    onClick={() =>
                      navigate(getInvoicePath(invoice, selectedMonth))
                    }
                    className={`cursor-pointer hover:bg-default-50 dark:hover:bg-gray-700/50 ${
                      selectedInvoiceIds.has(invoice.id)
                        ? "bg-sky-50/70 dark:bg-sky-900/20"
                        : ""
                    }`}
                  >
                    <td className="whitespace-nowrap px-3 py-2 text-sm">
                      <button
                        type="button"
                        onClick={(
                          event: React.MouseEvent<HTMLButtonElement>
                        ) => {
                          event.stopPropagation();
                          toggleInvoiceSelection(invoice.id);
                        }}
                        className="rounded p-1 text-default-400 hover:bg-default-100 hover:text-sky-600 dark:text-gray-500 dark:hover:bg-gray-700 dark:hover:text-sky-400"
                        title={
                          selectedInvoiceIds.has(invoice.id)
                            ? "Deselect invoice"
                            : "Select invoice"
                        }
                      >
                        {selectedInvoiceIds.has(invoice.id) ? (
                          <IconSquareCheckFilled size={18} />
                        ) : (
                          <IconSquare size={18} />
                        )}
                      </button>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-sm text-default-700 dark:text-gray-300">
                      {formatDate(invoice.purchase_date)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-sm font-medium text-default-900 dark:text-gray-100">
                      {invoice.self_billed_no}
                      <span
                        className={`ml-2 inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${
                          invoice.purchase_kind === "local"
                            ? "bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-300"
                            : "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300"
                        }`}
                      >
                        {invoice.purchase_kind === "local" ? "Local" : "Foreign"}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-sm text-default-700 dark:text-gray-300">
                      <span className="block truncate">{invoice.supplier_name}</span>
                    </td>
                    <td className="px-3 py-2 text-sm text-default-600 dark:text-gray-400">
                      <div className="max-w-xs truncate">
                        {[invoice.platform, invoice.order_no]
                          .filter(Boolean)
                          .join(" / ") || "-"}
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-sm">
                      {invoice.has_supporting_document &&
                      invoice.supporting_document_filename ? (
                        <button
                          type="button"
                          onClick={(event: React.MouseEvent<HTMLButtonElement>) =>
                            downloadSupportingDocument(event, invoice)
                          }
                          className="inline-flex items-center gap-1 rounded px-2 py-1 text-sky-700 hover:bg-sky-50 hover:text-sky-900 dark:text-sky-300 dark:hover:bg-sky-900/20 dark:hover:text-sky-200"
                          title={`${invoice.supporting_document_filename} ${formatFileSize(
                            invoice.supporting_document_size
                          )}`}
                        >
                          <IconPaperclip size={15} />
                          <IconDownload size={14} />
                        </button>
                      ) : (
                        <span className="text-default-300 dark:text-gray-600">-</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right text-sm font-mono text-default-700 dark:text-gray-300">
                      {formatAmount(
                        invoice.purchase_kind === "local" ? 0 : invoice.total_foreign_amount,
                        invoice.purchase_kind === "local" ? "MYR" : invoice.currency_code
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right text-sm font-mono text-default-900 dark:text-gray-100">
                      {formatAmount(invoice.payable_amount_myr, "MYR")}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-sm">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${getInvoiceStatusClasses(
                          invoice.invoice_status
                        )}`}
                      >
                        {getInvoiceStatusLabel(invoice.invoice_status)}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-sm">
                      <div className="flex items-center gap-1.5">
                        {invoice.purchase_kind === "local" ? (
                          <span className="inline-flex rounded-full bg-default-100 px-2.5 py-1 text-xs font-medium text-default-600 dark:bg-gray-700 dark:text-gray-300">
                            Not Required
                          </span>
                        ) : (
                          <span
                            className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${getStatusClasses(
                              invoice.einvoice_status
                            )}`}
                          >
                            {getStatusLabel(invoice.einvoice_status)}
                          </span>
                        )}
                        {portalUrl && (
                          <a
                            href={portalUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(event: React.MouseEvent<HTMLAnchorElement>) =>
                              event.stopPropagation()
                            }
                            className="rounded p-1 text-sky-600 hover:bg-sky-50 hover:text-sky-800 dark:text-sky-300 dark:hover:bg-sky-900/30 dark:hover:text-sky-100"
                            title="View in MyInvois Portal"
                          >
                            <IconExternalLink size={15} />
                          </a>
                        )}
                        {invoice.purchase_kind !== "local" && invoice.uuid && (
                          <button
                            type="button"
                            onClick={(
                              event: React.MouseEvent<HTMLButtonElement>
                            ) => refreshEInvoiceStatus(event, invoice)}
                            disabled={refreshingInvoiceId !== null}
                            className="rounded p-1 text-default-500 hover:bg-default-100 hover:text-sky-700 disabled:cursor-not-allowed disabled:opacity-50 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-sky-300"
                            title="Refresh E-Invoice status"
                          >
                            <IconRefresh
                              size={15}
                              className={
                                refreshingInvoiceId === invoice.id
                                  ? "animate-spin"
                                  : undefined
                              }
                            />
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right">
                      <button
                        type="button"
                        onClick={(event: React.MouseEvent<HTMLButtonElement>) => {
                          event.stopPropagation();
                          navigate(
                            getInvoicePath(invoice, selectedMonth)
                          );
                        }}
                        className="rounded p-1 text-default-500 hover:bg-default-100 hover:text-default-800 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-100"
                        title="Open general purchase"
                      >
                        <IconPencil size={17} />
                      </button>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <SubmissionResultsModal
        isOpen={showSubmissionResults}
        onClose={() => setShowSubmissionResults(false)}
        results={submissionResults}
        isLoading={submitting}
      />

      <ConfirmationDialog
        isOpen={showEInvoiceConfirm}
        onClose={() => setShowEInvoiceConfirm(false)}
        onConfirm={confirmBulkSubmitEInvoice}
        title="Submit Selected Foreign Purchases"
        message={`You are about to submit ${eligibleSelectedInvoices.length} eligible foreign purchase(s) to MyInvois. Continue?`}
        confirmButtonText="Submit e-Invoices"
        variant="default"
      />
    </div>
  );
};

export default GeneralPurchaseInvoiceListPage;
