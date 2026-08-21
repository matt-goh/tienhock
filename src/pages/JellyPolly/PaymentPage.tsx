// src/pages/JellyPolly/PaymentPage.tsx
import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import {
  IconCash,
  IconPlus,
  IconSearch,
} from "@tabler/icons-react";
import Button from "../../components/Button";
import LoadingSpinner from "../../components/LoadingSpinner";
import TimeNavigator from "../../components/TimeNavigator";
import { api } from "../../routes/utils/api";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";
import { Payment } from "../../types/types";
import PaymentTable from "../../components/Invoice/PaymentTable";
import PaymentForm, {
  type PaymentFormInitialValues,
} from "../../components/Invoice/PaymentForm";
import StyledListbox from "../../components/StyledListbox";
import { useScrollRestoration } from "../../hooks/useScrollRestoration";
import { refreshCreditsCache } from "../../utils/catalogue/useCustomerCache";
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

const FILTERS_STORAGE_KEY = "jpPaymentList";
const SCROLL_RESTORATION_KEY = "jp-payment-list";

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
  const { t } = useTranslation("jellypolly");
  const [payments, setPayments] = useState<Payment[]>([]);
  const [sortedPayments, setSortedPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState<Payment | null>(null);
  const [paymentFormInitialValues, setPaymentFormInitialValues] =
    useState<PaymentFormInitialValues | null>(null);

  // Filters persist across navigation so returning from an invoice lands on
  // the same month, method and status the user was looking at.
  const [filters, setFilters] = usePersistedFilters<PaymentFilters>(
    FILTERS_STORAGE_KEY,
    getDefaultFilters,
    reviveFilters
  );

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
        params.append("endDate", filters.dateRange.end.getTime().toString());
      }

      if (filters.paymentMethod) {
        params.append("paymentMethod", filters.paymentMethod);
      }

      if (filters.status) {
        params.append("status", filters.status);
      }

      if (filters.searchTerm.trim()) {
        params.append("search", filters.searchTerm.trim());
      }

      params.append("include_cancelled", "true"); // Include cancelled payments

      // Use JellyPolly-specific API endpoint
      const response = await api.get(
        `/jellypolly/api/payments/all?${params.toString()}`
      );
      setPayments(response);
    } catch (error: any) {
      console.error("Error fetching payments:", error);
      toast.error(
        error.response?.data?.message || t("Failed to fetch payments")
      );
      setPayments([]);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  // Sort payments effect - match main company logic
  useEffect(() => {
    const sorted = [...payments].sort((a, b) => {
      // First priority: pending status
      if (a.status === 'pending' && b.status !== 'pending') return -1;
      if (a.status !== 'pending' && b.status === 'pending') return 1;
      
      // Second priority: sort by payment date (newest first)
      const dateA = new Date(a.payment_date).getTime();
      const dateB = new Date(b.payment_date).getTime();
      return dateB - dateA;
    });
    setSortedPayments(sorted);
  }, [payments]);

  // Initial fetch
  useEffect(() => {
    fetchPayments();
  }, [fetchPayments]);

  // Restore the previous scroll position when returning (e.g. from an invoice).
  useScrollRestoration(SCROLL_RESTORATION_KEY, !loading);

  // Unified Time Navigator change handler. Handles day, month, and custom-range
  // selections from the single TimeNavigator control.
  const handleTimeNavigatorChange = (range: { start: Date; end: Date }) => {
    setFilters(prev => ({
      ...prev,
      dateRange: { start: range.start, end: range.end }
    }));
  };

  // Search handler
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFilters(prev => ({
      ...prev,
      searchTerm: e.target.value
    }));
  };

  // Payment method filter options
  const paymentMethodOptions = [
    { id: "", name: "All Methods" },
    { id: "cash", name: t("Cash") },
    { id: "cheque", name: t("Cheque") },
    { id: "bank_transfer", name: t("Bank Transfer") },
    { id: "online", name: t("Online") },
  ];

  // Status filter options
  const statusOptions = [
    { id: "", name: "All Status" },
    { id: "active", name: t("Active") },
    { id: "pending", name: t("Pending") },
    { id: "overpaid", name: t("Overpaid") },
    { id: "cancelled", name: t("Cancelled") },
  ];


  const handleNewPayment = () => {
    setSelectedPayment(null);
    setPaymentFormInitialValues(null);
    setShowPaymentForm(true);
  };

  const handlePaymentCreated = () => {
    setShowPaymentForm(false);
    setPaymentFormInitialValues(null);
    fetchPayments();
  };

  const handleAddPaymentToGroup = (payment: Payment) => {
    if (
      payment.payment_method === "contra" ||
      payment.payment_method === "overpayment"
    ) {
      toast.error(
        t("Contra and overpayment credits cannot be reused as payment groups.")
      );
      return;
    }

    const groupReference: string | null =
      payment.payment_reference || null;
    if (!groupReference) {
      toast.error(
        t("This payment group does not have a reference to reuse.")
      );
      return;
    }

    setSelectedPayment(null);
    setPaymentFormInitialValues({
      payment_date: payment.payment_date,
      payment_method:
        payment.payment_method as PaymentFormInitialValues["payment_method"],
      payment_reference: groupReference,
      bank_account: payment.bank_account,
    });
    setShowPaymentForm(true);
  };

  const handleCancelPaymentGroup = async (
    paymentGroup: Payment[]
  ): Promise<void> => {
    const livePayments = paymentGroup.filter(
      (payment) => payment.status !== "cancelled"
    );
    if (livePayments.length === 0) return;

    const anchor = livePayments[0];
    await api.put("/jellypolly/api/payments/group/cancel", {
      payment_reference: anchor.payment_reference,
      payment_date: format(new Date(anchor.payment_date), "yyyy-MM-dd"),
      payment_method: anchor.payment_method,
      expected_payment_ids: livePayments.map((payment) => payment.payment_id),
    });
    await refreshCreditsCache();
  };

  const handleViewPayment = (payment: Payment) => {
    navigate(`/jellypolly/sales/invoice/${payment.invoice_id}`, {
      state: { scrollToPayments: true },
    });
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
          <IconCash size={28} className="text-gray-700 dark:text-gray-200" />
          {t("JellyPolly Payment Management")}
        </h1>
        <Button onClick={handleNewPayment} icon={IconPlus} size="md">
          {t("New Payment")}
        </Button>
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 mb-4">
        <div className="p-4">
          <div className="flex flex-wrap items-center gap-4">
            {/* Search */}
            <div className="relative flex-1 min-w-[200px]">
              <IconSearch
                className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 dark:text-gray-500"
                size={18}
              />
              <input
                type="text"
                placeholder={t("Search")}
                title={t("Search payments by invoice, reference, or amount")}
                className="w-full pl-10 pr-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900/50 text-default-900 dark:text-gray-100 placeholder:text-default-400 dark:placeholder:text-gray-400 rounded-full focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent"
                value={filters.searchTerm}
                onChange={handleSearchChange}
              />
            </div>

            {/* Time Navigator */}
            <div className="w-full sm:w-auto">
              <TimeNavigator
                range={filters.dateRange}
                onChange={handleTimeNavigatorChange}
              />
            </div>

            {/* Payment Method Filter */}
            <StyledListbox
              value={filters.paymentMethod || ""}
              onChange={(value) =>
                setFilters((prev) => ({
                  ...prev,
                  paymentMethod: value === "" ? null : String(value),
                }))
              }
              options={paymentMethodOptions}
              className="w-full sm:w-40"
              placeholder={t("All Methods")}
            />

            {/* Status Filter */}
            <StyledListbox
              value={filters.status || ""}
              onChange={(value) =>
                setFilters((prev) => ({
                  ...prev,
                  status: value === "" ? null : String(value),
                }))
              }
              options={statusOptions}
              className="w-full sm:w-40"
              placeholder={t("All Status")}
            />
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
          onAddPaymentToGroup={handleAddPaymentToGroup}
          onCancelPaymentGroup={handleCancelPaymentGroup}
          requiresClearanceDate
          paymentApiEndpoint="/jellypolly/api/payments"
        />
      )}

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
          apiEndpoint="/jellypolly/api/payments"
          invoicesEndpoint="/jellypolly/api/invoices"
          initialValues={paymentFormInitialValues ?? undefined}
          referenceGroup={paymentFormInitialValues?.payment_reference}
        />
      )}
    </div>
  );
};

export default PaymentPage;
