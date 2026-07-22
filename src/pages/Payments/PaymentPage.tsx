import React, { useState, useEffect, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { IconPlus, IconSearch } from "@tabler/icons-react";
import Button from "../../components/Button";
import LoadingSpinner from "../../components/LoadingSpinner";
import TimeNavigator from "../../components/TimeNavigator";
import { api } from "../../routes/utils/api";
import toast from "react-hot-toast";
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

interface PaymentFilters {
  dateRange: {
    start: Date | null;
    end: Date | null;
  };
  paymentMethod: string | null;
  status: string | null;
  searchTerm: string;
}

const PaymentPage: React.FC = () => {
  const navigate = useNavigate();
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

  const [filters, setFilters] = useState<PaymentFilters>(() => {
    const start = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const end = new Date(
      new Date().getFullYear(),
      new Date().getMonth() + 1,
      0
    );
    end.setHours(23, 59, 59, 999); // Set to end of day

    return {
      dateRange: {
        start,
        end,
      },
      paymentMethod: null,
      status: "active", // Default to active payments
      searchTerm: "",
    };
  });

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

      params.append("include_cancelled", "true"); // Include cancelled payments

      const response = await api.get(`/api/payments/all?${params.toString()}`);
      setPayments(response);

      // Sort payments with pending status at the top, then by date
      const sorted = [...response].sort((a, b) => {
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
      toast.error("Failed to fetch payments");
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    fetchPayments();
  }, [fetchPayments]);

  // Unified Time Navigator change handler. Handles day, month, and custom-range
  // selections from the single TimeNavigator control.
  const handleTimeNavigatorChange = useCallback(
    (range: { start: Date; end: Date }) => {
      setFilters((prev) => ({
        ...prev,
        dateRange: { start: range.start, end: range.end },
      }));
    },
    []
  );

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
        "Contra and overpayment credits cannot be reused as payment groups."
      );
      return;
    }
    if (!payment.payment_reference) {
      toast.error("This payment group does not have a reference to reuse.");
      return;
    }

    setSelectedPayment(null);
    setPaymentFormInitialValues({
      payment_date: payment.payment_date,
      payment_method: payment.payment_method,
      payment_reference: payment.payment_reference,
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
                placeholder="Search"
                title="Search payments by invoice, reference, or amount"
                className="w-full pl-10 pr-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900/50 text-default-900 dark:text-gray-100 placeholder:text-default-400 dark:placeholder:text-gray-400 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent h-[40px]"
                value={filters.searchTerm}
                onChange={(e) =>
                  setFilters((prev) => ({
                    ...prev,
                    searchTerm: e.target.value,
                  }))
                }
              />
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
                onChange={(value) =>
                  setFilters((prev) => ({
                    ...prev,
                    paymentMethod: value === "" ? null : String(value),
                  }))
                }
                options={[
                  { id: "", name: "All Methods" },
                  { id: "cash", name: "Cash" },
                  { id: "cheque", name: "Cheque" },
                  { id: "bank_transfer", name: "Bank Transfer" },
                  { id: "online", name: "Online" },
                  { id: "contra", name: "Contra Credit" },
                ]}
                placeholder="All Methods"
                rounded="lg"
              />
            </div>

            {/* Status Filter */}
            <div className="w-[calc(50%-0.375rem)] min-w-[130px] sm:w-40">
              <StyledListbox
                value={filters.status || ""}
                onChange={(value) =>
                  setFilters((prev) => ({
                    ...prev,
                    status: value === "" ? null : String(value),
                  }))
                }
                options={[
                  { id: "", name: "All Status" },
                  { id: "active", name: "Active" },
                  { id: "pending", name: "Pending" },
                  { id: "overpaid", name: "Overpaid" },
                  { id: "cancelled", name: "Cancelled" },
                ]}
                placeholder="All Status"
                rounded="lg"
              />
            </div>

            <Button
              onClick={handleNewPayment}
              icon={IconPlus}
              size="md"
              className="w-full whitespace-nowrap sm:w-auto"
            >
              New Payment
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
        <PaymentTable
          payments={sortedPayments}
          onViewPayment={handleViewPayment}
          onRefresh={fetchPayments}
          onCancellationError={setPaymentCancellationError}
          onAddPaymentToGroup={handleAddPaymentToGroup}
          onViewPaymentGroup={setSelectedReceiptId}
          requiresClearanceDate
        />
      )}

      <PaymentCancellationErrorDialog
        error={paymentCancellationError}
        onClose={() => setPaymentCancellationError(null)}
        onViewPaymentGroup={(receiptId: number): void => {
          setSelectedReceiptId(receiptId);
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
