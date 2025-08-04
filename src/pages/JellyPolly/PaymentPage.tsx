import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  IconCash,
  IconPlus,
  IconSearch,
  IconChevronDown,
  IconCheck,
} from "@tabler/icons-react";
import {
  Listbox,
  ListboxButton,
  ListboxOption,
  ListboxOptions,
  Transition,
} from "@headlessui/react";
import Button from "../../components/Button";
import LoadingSpinner from "../../components/LoadingSpinner";
import DateRangePicker from "../../components/DateRangePicker";
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

interface MonthOption {
  id: number;
  name: string;
}

const monthOptions: MonthOption[] = [
  { id: 0, name: "January" },
  { id: 1, name: "February" },
  { id: 2, name: "March" },
  { id: 3, name: "April" },
  { id: 4, name: "May" },
  { id: 5, name: "June" },
  { id: 6, name: "July" },
  { id: 7, name: "August" },
  { id: 8, name: "September" },
  { id: 9, name: "October" },
  { id: 10, name: "November" },
  { id: 11, name: "December" },
];

const PaymentPage: React.FC = () => {
  const navigate = useNavigate();
  const [payments, setPayments] = useState<Payment[]>([]);
  const [sortedPayments, setSortedPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState<Payment | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<MonthOption>(() => {
    const now = new Date();
    return monthOptions[now.getMonth()];
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

      // Use JellyPolly-specific API endpoint
      const response = await api.get(
        `/api/jellypolly/payments?${params.toString()}`
      );
      
      if (Array.isArray(response)) {
        setPayments(response);
      } else if (response.data && Array.isArray(response.data)) {
        setPayments(response.data);
      } else {
        console.warn("Unexpected payment data format:", response);
        setPayments([]);
      }
    } catch (error: any) {
      console.error("Error fetching payments:", error);
      toast.error(
        error.response?.data?.message || "Failed to fetch payments"
      );
      setPayments([]);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  // Sort payments effect
  useEffect(() => {
    const sorted = [...payments].sort((a, b) => {
      const dateA = new Date(a.payment_date).getTime();
      const dateB = new Date(b.payment_date).getTime();
      return dateB - dateA; // Most recent first
    });
    setSortedPayments(sorted);
  }, [payments]);

  // Initial fetch
  useEffect(() => {
    fetchPayments();
  }, [fetchPayments]);

  // Month change handler
  const handleMonthChange = (month: MonthOption) => {
    setSelectedMonth(month);
    
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonthIndex = now.getMonth();
    
    const targetYear = month.id > currentMonthIndex ? currentYear - 1 : currentYear;
    
    const startDate = new Date(targetYear, month.id, 1);
    startDate.setHours(0, 0, 0, 0);
    const endDate = new Date(targetYear, month.id + 1, 0);
    endDate.setHours(23, 59, 59, 999);
    
    setFilters(prev => ({
      ...prev,
      dateRange: { start: startDate, end: endDate }
    }));
  };

  // Date range change handler
  const handleDateRangeChange = (range: { start: Date | null; end: Date | null }) => {
    setFilters(prev => ({
      ...prev,
      dateRange: range
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
    { id: "cash", name: "Cash" },
    { id: "cheque", name: "Cheque" },
    { id: "bank_transfer", name: "Bank Transfer" },
    { id: "online", name: "Online" },
  ];

  // Status filter options
  const statusOptions = [
    { id: "active", name: "Active" },
    { id: "cancelled", name: "Cancelled" },
    { id: "pending", name: "Pending" },
    { id: "", name: "All Status" },
  ];

  // Payment summary calculations
  const paymentSummary = useMemo(() => {
    const activePayments = sortedPayments.filter(p => p.status !== 'cancelled');
    const totalAmount = activePayments.reduce((sum, payment) => sum + payment.amount_paid, 0);
    const averagePayment = activePayments.length > 0 ? totalAmount / activePayments.length : 0;
    
    const methodBreakdown = activePayments.reduce((acc, payment) => {
      const method = payment.payment_method || 'unknown';
      acc[method] = (acc[method] || 0) + payment.amount_paid;
      return acc;
    }, {} as Record<string, number>);

    return {
      totalPayments: activePayments.length,
      totalAmount,
      averagePayment,
      methodBreakdown,
    };
  }, [sortedPayments]);

  const formatCurrency = (amount: number): string => {
    return new Intl.NumberFormat("en-MY", {
      style: "currency",
      currency: "MYR",
    }).format(amount);
  };

  // Payment creation success handler

  const handlePaymentFormSuccess = () => {
    setShowPaymentForm(false);
    setSelectedPayment(null);
    fetchPayments(); // Refresh the list
  };

  return (
    <div className="flex flex-col w-full h-full px-4 md:px-12 -mt-6">
      <div className="space-y-3">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 flex-shrink-0">
          <h1 className="text-2xl md:text-3xl font-semibold text-default-900 md:mr-4">
            JellyPolly Payments {paymentSummary.totalPayments > 0 && `(${paymentSummary.totalPayments})`}
          </h1>
          
          <div className="flex items-center gap-2">
            <Button
              onClick={() => {
                setSelectedPayment(null);
                setShowPaymentForm(true);
              }}
              icon={IconPlus}
              variant="filled"
              color="sky"
              size="sm"
            >
              Add Payment
            </Button>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white p-4 rounded-lg border shadow-sm">
          <div className="grid grid-cols-1 md:grid-cols-6 gap-4 items-end">
            {/* Date Range */}
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Date Range
              </label>
              <DateRangePicker
                dateRange={{
                  start: filters.dateRange.start || new Date(),
                  end: filters.dateRange.end || new Date()
                }}
                onDateChange={handleDateRangeChange}
              />
            </div>

            {/* Month Selector */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Month
              </label>
              <StyledListbox
                value={selectedMonth.id}
                onChange={(value) => {
                  const month = monthOptions.find(m => m.id === value);
                  if (month) handleMonthChange(month);
                }}
                options={monthOptions.map(m => ({ id: m.id, name: m.name }))}
                placeholder="Select Month"
              />
            </div>

            {/* Payment Method Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Payment Method
              </label>
              <StyledListbox
                value={filters.paymentMethod || ""}
                onChange={(value) => setFilters(prev => ({ ...prev, paymentMethod: String(value) || null }))}
                options={paymentMethodOptions}
                placeholder="All Methods"
              />
            </div>

            {/* Status Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Status
              </label>
              <StyledListbox
                value={filters.status || ""}
                onChange={(value) => setFilters(prev => ({ ...prev, status: String(value) || null }))}
                options={statusOptions}
                placeholder="All Status"
              />
            </div>

            {/* Search */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Search
              </label>
              <div className="relative">
                <IconSearch
                  className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"
                  size={16}
                />
                <input
                  type="text"
                  placeholder="Search payments..."
                  className="w-full h-[42px] pl-10 pr-3 bg-white border border-default-300 rounded-full focus:border-sky-500 focus:ring-1 focus:ring-sky-500 outline-none text-sm"
                  value={filters.searchTerm}
                  onChange={handleSearchChange}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Payment Summary */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white p-4 rounded-lg border shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Payments</p>
                <p className="text-2xl font-bold text-gray-900">{paymentSummary.totalPayments}</p>
              </div>
              <IconCash className="h-8 w-8 text-blue-500" />
            </div>
          </div>

          <div className="bg-white p-4 rounded-lg border shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Amount</p>
                <p className="text-2xl font-bold text-gray-900">{formatCurrency(paymentSummary.totalAmount)}</p>
              </div>
              <IconCash className="h-8 w-8 text-green-500" />
            </div>
          </div>

          <div className="bg-white p-4 rounded-lg border shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Average Payment</p>
                <p className="text-2xl font-bold text-gray-900">{formatCurrency(paymentSummary.averagePayment)}</p>
              </div>
              <IconCash className="h-8 w-8 text-purple-500" />
            </div>
          </div>

          <div className="bg-white p-4 rounded-lg border shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Top Method</p>
                <p className="text-lg font-bold text-gray-900 capitalize">
                  {Object.entries(paymentSummary.methodBreakdown).sort(([,a], [,b]) => b - a)[0]?.[0] || 'N/A'}
                </p>
              </div>
              <IconCash className="h-8 w-8 text-orange-500" />
            </div>
          </div>
        </div>

        {/* Payment Table */}
        <div className="flex-1 min-h-[400px] relative">
          {loading ? (
            <div className="absolute inset-0 bg-white/60 backdrop-blur-sm flex justify-center items-center z-20 rounded-lg">
              <LoadingSpinner />
            </div>
          ) : (
            <PaymentTable
              payments={sortedPayments}
              onViewPayment={(payment) => {
                // Navigate to JellyPolly invoice instead of main company invoice
                navigate(`/jellypolly/sales/invoice/${payment.invoice_id}`, {
                  state: { scrollToPayments: true },
                });
              }}
              onRefresh={fetchPayments}
            />
          )}
        </div>
      </div>

      {/* Payment Form Modal */}
      {showPaymentForm && (
        <PaymentForm
          payment={selectedPayment}
          onClose={() => {
            setShowPaymentForm(false);
            setSelectedPayment(null);
          }}
          onSuccess={handlePaymentFormSuccess}
          dateRange={{
            start: filters.dateRange.start || new Date(),
            end: filters.dateRange.end || new Date()
          }}
        />
      )}
    </div>
  );
};

export default PaymentPage;