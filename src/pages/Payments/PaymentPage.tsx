import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { IconCash, IconPlus, IconSearch } from "@tabler/icons-react";
import Button from "../../components/Button";
import LoadingSpinner from "../../components/LoadingSpinner";
import DateRangePicker from "../../components/DateRangePicker";
import MonthNavigator from "../../components/MonthNavigator";
import { api } from "../../routes/utils/api";
import toast from "react-hot-toast";
import { Payment } from "../../types/types";
import PaymentTable from "../../components/Invoice/PaymentTable";
import PaymentForm from "../../components/Invoice/PaymentForm";
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

  // Use Date object for month navigation
  const [selectedMonth, setSelectedMonth] = useState<Date>(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

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

  const handleDateChange = useCallback(
    (newDateRange: { start: Date; end: Date }) => {
      setFilters((prev) => ({
        ...prev,
        dateRange: newDateRange,
      }));
    },
    []
  );

  // Handle month change from MonthNavigator
  const handleMonthChange = useCallback((newDate: Date) => {
    setSelectedMonth(newDate);

    // Create start date (1st of the selected month)
    const startDate = new Date(newDate.getFullYear(), newDate.getMonth(), 1);
    startDate.setHours(0, 0, 0, 0);

    // Create end date (last day of the selected month)
    const endDate = new Date(newDate.getFullYear(), newDate.getMonth() + 1, 0);
    endDate.setHours(23, 59, 59, 999);

    setFilters((prev) => ({
      ...prev,
      dateRange: { start: startDate, end: endDate },
    }));
  }, []);

  const handleNewPayment = () => {
    setSelectedPayment(null);
    setShowPaymentForm(true);
  };

  const handlePaymentCreated = () => {
    setShowPaymentForm(false);
    fetchPayments();
  };

  const handleViewPayment = (payment: Payment) => {
    navigate(`/sales/invoice/${payment.invoice_id}`, {
      state: { scrollToPayments: true },
    });
  };

  return (
    <div className="pb-4 max-w-full mx-auto px-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <IconCash size={28} className="text-gray-700" />
          Payment Management
        </h1>
        <Button onClick={handleNewPayment} icon={IconPlus} size="md">
          New Payment
        </Button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 mb-4">
        <div className="p-4">
          <div className="flex flex-wrap items-center gap-4">
            {/* Search */}
            <div className="relative flex-1 min-w-[200px]">
              <IconSearch
                className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"
                size={18}
              />
              <input
                type="text"
                placeholder="Search"
                title="Search payments by invoice, reference, or amount"
                className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent h-[40px]"
                value={filters.searchTerm}
                onChange={(e) =>
                  setFilters((prev) => ({
                    ...prev,
                    searchTerm: e.target.value,
                  }))
                }
              />
            </div>

            {/* Date Range Picker */}
            <DateRangePicker
              dateRange={{
                start: filters.dateRange.start || new Date(),
                end: filters.dateRange.end || new Date(),
              }}
              onDateChange={handleDateChange}
            />

            {/* Month Navigator */}
            <MonthNavigator
              selectedMonth={selectedMonth}
              onChange={handleMonthChange}
              showGoToCurrentButton={false}
              dateRange={{
                start: filters.dateRange.start || new Date(),
                end: filters.dateRange.end || new Date(),
              }}
            />

            {/* Payment Method Filter */}
            <div className="w-40">
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
                ]}
                placeholder="All Methods"
                rounded="lg"
              />
            </div>

            {/* Status Filter */}
            <div className="w-40">
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
        />
      )}

      {/* Payment Form Modal */}
      {showPaymentForm && (
        <PaymentForm
          payment={selectedPayment}
          onClose={() => setShowPaymentForm(false)}
          onSuccess={handlePaymentCreated}
          dateRange={filters.dateRange}
        />
      )}
    </div>
  );
};

export default PaymentPage;
