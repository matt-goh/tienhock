import React, { useState, useEffect, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { IconPlus, IconSearch, IconX } from "@tabler/icons-react";
import Button from "../../components/Button";
import LoadingSpinner from "../../components/LoadingSpinner";
import TimeNavigator from "../../components/TimeNavigator";
import Pagination from "../../components/Invoice/Pagination";
import { api } from "../../routes/utils/api";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";
import {
  Payment,
  PaymentCancellationErrorData,
} from "../../types/types";
import PaymentTable from "../../components/Invoice/PaymentTable";
import PaymentForm, {
  type PaymentFormInitialValues,
} from "../../components/Invoice/PaymentForm";
import PaymentCancellationErrorDialog from "../../components/Invoice/PaymentCancellationErrorDialog";
import ReceiptDetailsDialog from "../../components/Invoice/ReceiptDetailsDialog";
import StyledListbox from "../../components/StyledListbox";
import { useScrollRestoration } from "../../hooks/useScrollRestoration";
import {
  usePersistedFilters,
  reviveDate,
} from "../../hooks/usePersistedFilters";

interface PaymentFilters {
  dateRange: {
    start: Date | null;
    end: Date | null;
  };
  paymentMethod: string | null;
  status: string | null;
  searchTerm: string;
}

const FILTERS_STORAGE_KEY = "paymentList";
const PAYMENTS_PAGE_SIZE = 200;

const getDefaultFilters = (): PaymentFilters => {
  const start = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const end = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0);
  end.setHours(23, 59, 59, 999); // Set to end of day

  return {
    dateRange: { start, end },
    paymentMethod: null,
    status: "active", // Default to active payments
    searchTerm: "",
  };
};

// Dates survive the JSON round-trip as ISO strings, so rebuild them here.
// An unusable cache returns null and the default month is used instead.
const reviveFilters = (cached: any): PaymentFilters | null => {
  const start = reviveDate(cached?.dateRange?.start);
  const end = reviveDate(cached?.dateRange?.end);
  if (!start || !end) return null;
  return {
    dateRange: { start, end },
    paymentMethod:
      typeof cached.paymentMethod === "string" ? cached.paymentMethod : null,
    status: typeof cached.status === "string" ? cached.status : null,
    searchTerm: typeof cached.searchTerm === "string" ? cached.searchTerm : "",
  };
};

const PaymentPage: React.FC = () => {
  const navigate = useNavigate();
  const { t } = useTranslation("payments");
  const [payments, setPayments] = useState<Payment[]>([]);
  const [sortedPayments, setSortedPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState<Payment | null>(null);
  const [paymentFormInitialValues, setPaymentFormInitialValues] =
    useState<PaymentFormInitialValues | null>(null);
  const [paymentCancellationError, setPaymentCancellationError] =
    useState<PaymentCancellationErrorData | null>(null);
  const [selectedReceiptId, setSelectedReceiptId] = useState<number | null>(
    null
  );
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [totalItems, setTotalItems] = useState<number>(0);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [searchParams, setSearchParams] = useSearchParams();

  // Deep link (e.g. from a journal's "View Source" button): /sales/payments?receipt=<id>
  // opens that receipt's details dialog directly.
  useEffect(() => {
    const receiptParam = searchParams.get("receipt");
    if (receiptParam) {
      const receiptId = Number(receiptParam);
      if (Number.isInteger(receiptId) && receiptId > 0) {
        setSelectedReceiptId(receiptId);
      }
    }
  }, [searchParams]);

  const handleReceiptDialogClose = (): void => {
    setSelectedReceiptId(null);
    if (searchParams.has("receipt")) {
      searchParams.delete("receipt");
      setSearchParams(searchParams, { replace: true });
    }
  };

  // Keep the deep-link param in sync when a group is opened from the table, so
  // returning from a journal entry re-opens the same payment group dialog.
  const handleViewPaymentGroup = (receiptId: number): void => {
    setSelectedReceiptId(receiptId);
    if (searchParams.get("receipt") !== String(receiptId)) {
      searchParams.set("receipt", String(receiptId));
      setSearchParams(searchParams, { replace: true });
    }
  };

  // Filters persist across navigation so returning from an invoice/journal
  // lands on the same month, method and status the user was looking at.
  const [filters, setFilters] = usePersistedFilters<PaymentFilters>(
    FILTERS_STORAGE_KEY,
    getDefaultFilters,
    reviveFilters
  );
  const [searchDraft, setSearchDraft] = useState<string>(
    () => filters.searchTerm
  );

  // Keep the draft in sync when the committed search changes from outside
  // this input (e.g. persisted filters restored on navigation).
  useEffect((): void => {
    setSearchDraft(filters.searchTerm);
  }, [filters.searchTerm]);

  // Fetch payments
  const fetchPayments = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();

      if (filters.dateRange.start) {
        params.append(
          "startDate",
          filters.dateRange.start.getTime().toString()
        );
      }
      if (filters.dateRange.end) {
        const endDate = new Date(filters.dateRange.end);
        endDate.setHours(23, 59, 59, 999);
        params.append("endDate", endDate.getTime().toString());
      }
      if (filters.paymentMethod) {
        params.append("paymentMethod", filters.paymentMethod);
      }
      if (filters.status) {
        params.append("status", filters.status);
      }
      if (filters.searchTerm) {
        params.append("search", filters.searchTerm);
      }
      params.append("page", String(currentPage));
      params.append("limit", String(PAYMENTS_PAGE_SIZE));

      params.append("include_cancelled", "true"); // Include cancelled payments

      const response = await api.get<{
        data: Payment[];
        pagination: {
          page: number;
          limit: number;
          total: number;
          totalPages: number;
        };
      }>(`/api/payments/all?${params.toString()}`);
      setPayments(response.data);
      setTotalItems(response.pagination.total);
      setTotalPages(response.pagination.totalPages);

      // Sort payments with pending status at the top, then by date
      const sorted = [...response.data].sort((a, b) => {
        // First priority: pending status
        if (a.status === "pending" && b.status !== "pending") return -1;
        if (a.status !== "pending" && b.status === "pending") return 1;

        // Second priority: sort by payment date (newest first)
        const dateA = new Date(a.payment_date).getTime();
        const dateB = new Date(b.payment_date).getTime();
        return dateB - dateA;
      });
      setSortedPayments(sorted);
    } catch (error) {
      console.error("Error fetching payments:", error);
      toast.error(t("Failed to fetch payments"));
    } finally {
      setLoading(false);
    }
  }, [filters, currentPage]);

  useEffect(() => {
    fetchPayments();
  }, [fetchPayments]);

  // If the last rows disappear (e.g. a payment on the final page is
  // cancelled), fall back to the last valid page instead of showing empty.
  useEffect((): void => {
    if (totalPages > 0 && currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  // Restore the previous scroll position when returning (e.g. from a journal entry).
  useScrollRestoration("payment-list", !loading);

  // Unified Time Navigator change handler. Handles day, month, and custom-range
  // selections from the single TimeNavigator control.
  const handleTimeNavigatorChange = useCallback(
    (range: { start: Date; end: Date }) => {
      setCurrentPage(1);
      setFilters((prev) => ({
        ...prev,
        dateRange: { start: range.start, end: range.end },
      }));
    },
    []
  );

  const handlePageChange = (page: number): void => {
    setCurrentPage(Math.min(Math.max(1, page), totalPages));
  };

  const handleNewPayment = (): void => {
    setSelectedPayment(null);
    setPaymentFormInitialValues(null);
    setShowPaymentForm(true);
  };

  const handlePaymentCreated = (): void => {
    const shouldShowFullReferenceGroup: boolean = Boolean(
      paymentFormInitialValues?.payment_reference
    );
    setShowPaymentForm(false);
    setPaymentFormInitialValues(null);
    if (shouldShowFullReferenceGroup) {
      setCurrentPage(1);
      setFilters((previousFilters: PaymentFilters): PaymentFilters => ({
        ...previousFilters,
        status: null,
      }));
    } else {
      void fetchPayments();
    }
  };

  const handleAddPaymentToGroup = (payment: Payment): void => {
    if (
      payment.payment_method === "contra" ||
      payment.payment_method === "overpayment"
    ) {
      toast.error(
        t("Contra and overpayment credits cannot be reused as payment groups.")
      );
      return;
    }
    // The receipt's own reference is the group identity. A grouped cash receipt
    // writes `C{invoice}` onto each payment row, so reusing the row's reference
    // would open the form with one invoice's reference instead of the group's.
    const groupReference: string | null =
      payment.receipt_reference || payment.payment_reference || null;
    if (!groupReference) {
      toast.error(t("This payment group does not have a reference to reuse."));
      return;
    }

    setSelectedPayment(null);
    setPaymentFormInitialValues({
      payment_date: payment.payment_date,
      payment_method: payment.payment_method,
      payment_reference: groupReference,
      bank_account: payment.bank_account,
    });
    setShowPaymentForm(true);
  };

  const handleViewPayment = (payment: Payment) => {
    navigate(`/sales/invoice/${payment.invoice_id}`, {
      state: { scrollToPayments: true },
    });
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="mb-4 rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <div className="p-3 sm:p-4">
          <div className="flex flex-wrap items-center gap-3">
            {/* Search */}
            <div className="relative w-full min-w-0 flex-1 sm:w-auto sm:min-w-[220px]">
              <IconSearch
                className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 dark:text-gray-500"
                size={18}
              />
              <input
                type="text"
                placeholder={t("search", { ns: "common" })}
                title={t(
                  "Search payments by invoice, reference, or amount"
                )}
                className="w-full pl-10 pr-9 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900/50 text-default-900 dark:text-gray-100 placeholder:text-default-400 dark:placeholder:text-gray-400 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent h-[40px]"
                value={searchDraft}
                onChange={(e) => setSearchDraft(e.target.value)}
                onBlur={() => {
                  if (filters.searchTerm !== searchDraft) {
                    setFilters((prev) => ({
                      ...prev,
                      searchTerm: searchDraft,
                    }));
                    setCurrentPage(1);
                  }
                }}
              />
              {searchDraft && (
                <button
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    setSearchDraft("");
                    if (filters.searchTerm) {
                      setFilters((prev) => ({
                        ...prev,
                        searchTerm: "",
                      }));
                      setCurrentPage(1);
                    }
                  }}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-1 text-default-400 hover:bg-default-100 hover:text-default-700 dark:text-gray-400 dark:hover:bg-gray-600 dark:hover:text-gray-200"
                  title={t("Clear search")}
                  aria-label={t("Clear search")}
                >
                  <IconX size={14} />
                </button>
              )}
            </div>

            {/* Time Navigator */}
            <div className="w-full min-w-0 sm:w-auto">
              <TimeNavigator
                range={filters.dateRange}
                onChange={handleTimeNavigatorChange}
                className="max-w-full"
              />
            </div>

            {/* Payment Method Filter */}
            <div className="w-[calc(50%-0.375rem)] min-w-[130px] sm:w-40">
              <StyledListbox
                value={filters.paymentMethod || ""}
                onChange={(value) => {
                  setCurrentPage(1);
                  setFilters((prev) => ({
                    ...prev,
                    paymentMethod: value === "" ? null : String(value),
                  }));
                }}
                options={[
                  { id: "", name: t("All Methods") },
                  { id: "cash", name: t("Cash") },
                  { id: "cheque", name: t("Cheque") },
                  { id: "bank_transfer", name: t("Bank Transfer") },
                  { id: "online", name: t("Online") },
                  { id: "contra", name: t("Contra Credit") },
                ]}
                placeholder={t("All Methods")}
                rounded="lg"
              />
            </div>

            {/* Status Filter */}
            <div className="w-[calc(50%-0.375rem)] min-w-[130px] sm:w-40">
              <StyledListbox
                value={filters.status || ""}
                onChange={(value) => {
                  setCurrentPage(1);
                  setFilters((prev) => ({
                    ...prev,
                    status: value === "" ? null : String(value),
                  }));
                }}
                options={[
                  { id: "", name: t("All Status") },
                  { id: "active", name: t("Active") },
                  { id: "pending", name: t("Pending") },
                  { id: "overpaid", name: t("Overpaid") },
                  { id: "cancelled", name: t("Cancelled") },
                ]}
                placeholder={t("All Status")}
                rounded="lg"
              />
            </div>

            <Button
              onClick={handleNewPayment}
              icon={IconPlus}
              size="md"
              className="w-full whitespace-nowrap sm:w-auto"
            >
              {t("New Payment")}
            </Button>
          </div>
        </div>
      </div>

      {/* Payments Table */}
      {loading ? (
        <div className="flex justify-center items-center h-64">
          <LoadingSpinner />
        </div>
      ) : (
        <>
          <PaymentTable
            payments={sortedPayments}
            onViewPayment={handleViewPayment}
            onRefresh={fetchPayments}
            onCancellationError={setPaymentCancellationError}
            onAddPaymentToGroup={handleAddPaymentToGroup}
            onViewPaymentGroup={handleViewPaymentGroup}
            requiresClearanceDate
          />
          {totalPages > 1 && (
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              onPageChange={handlePageChange}
              itemsCount={sortedPayments.length}
              totalItems={totalItems}
              pageSize={PAYMENTS_PAGE_SIZE}
            />
          )}
        </>
      )}

      <PaymentCancellationErrorDialog
        error={paymentCancellationError}
        onClose={() => setPaymentCancellationError(null)}
        onViewPaymentGroup={(receiptId: number): void => {
          handleViewPaymentGroup(receiptId);
          setPaymentCancellationError(null);
        }}
        onViewJournal={(journalEntryId: number): void => {
          navigate(`/accounting/journal-entries/${journalEntryId}`);
          setPaymentCancellationError(null);
        }}
      />
      <ReceiptDetailsDialog
        isOpen={selectedReceiptId !== null}
        receiptId={selectedReceiptId}
        onClose={handleReceiptDialogClose}
        onConfirmed={async (): Promise<void> => {
          await fetchPayments();
        }}
        onCancelled={async (): Promise<void> => {
          handleReceiptDialogClose();
          await fetchPayments();
        }}
        onReferenceUpdated={async (): Promise<void> => {
          await fetchPayments();
        }}
        onDateUpdated={async (): Promise<void> => {
          await fetchPayments();
        }}
      />

      {/* Payment Form Modal */}
      {showPaymentForm && (
        <PaymentForm
          payment={selectedPayment}
          onClose={() => {
            setShowPaymentForm(false);
            setPaymentFormInitialValues(null);
          }}
          onSuccess={handlePaymentCreated}
          dateRange={filters.dateRange}
          initialValues={paymentFormInitialValues ?? undefined}
          referenceGroup={paymentFormInitialValues?.payment_reference}
        />
      )}
    </div>
  );
};

export default PaymentPage;
