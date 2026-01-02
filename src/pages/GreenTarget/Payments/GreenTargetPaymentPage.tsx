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
import Button from "../../../components/Button";
import LoadingSpinner from "../../../components/LoadingSpinner";
import DateRangePicker from "../../../components/DateRangePicker";
import { greenTargetApi } from "../../../routes/greentarget/api";
import toast from "react-hot-toast";
import { Payment } from "../../../types/types";
import { GreenTargetPayment } from "../../../types/greenTargetTypes";
import GreenTargetPaymentTable from "../../../components/GreenTarget/GreenTargetPaymentTable";
import GreenTargetPaymentForm from "../../../components/GreenTarget/GreenTargetPaymentForm";
import StyledListbox from "../../../components/StyledListbox";

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

const GreenTargetPaymentPage: React.FC = () => {
  const navigate = useNavigate();
  const [payments, setPayments] = useState<GreenTargetPayment[]>([]);
  const [sortedPayments, setSortedPayments] = useState<GreenTargetPayment[]>(
    []
  );
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
      // For now, fetch all payments and filter client-side
      // Backend doesn't support all filter parameters yet
      const response = await greenTargetApi.getPayments({
        includeCancelled: true,
      });
      setPayments(response);
    } catch (error) {
      console.error("Error fetching payments:", error);
      toast.error("Failed to fetch payments");
    } finally {
      setLoading(false);
    }
  }, []);

  // Client-side filtering and sorting
  const filteredAndSortedPayments = useMemo(() => {
    let filtered = [...payments];

    // Filter by date range
    if (filters.dateRange.start && filters.dateRange.end) {
      const startTime = filters.dateRange.start.getTime();
      const endTime = filters.dateRange.end.getTime() + 24 * 60 * 60 * 1000 - 1; // End of day

      filtered = filtered.filter((payment) => {
        const paymentTime = new Date(payment.payment_date).getTime();
        return paymentTime >= startTime && paymentTime <= endTime;
      });
    }

    // Filter by payment method
    if (filters.paymentMethod) {
      filtered = filtered.filter(
        (payment) => payment.payment_method === filters.paymentMethod
      );
    }

    // Filter by status
    if (filters.status) {
      if (filters.status === "active") {
        // Include both active (null, undefined, or 'active') and pending payments when 'active' is selected
        filtered = filtered.filter(
          (payment) =>
            !payment.status ||
            payment.status === "active" ||
            payment.status === "pending" ||
            payment.status === "overpaid"
        );
      } else {
        filtered = filtered.filter(
          (payment) => payment.status === filters.status
        );
      }
    }

    // Filter by search term
    if (filters.searchTerm) {
      const searchLower = filters.searchTerm.toLowerCase();
      filtered = filtered.filter(
        (payment) =>
          payment.invoice_id?.toString().toLowerCase().includes(searchLower) ||
          payment.payment_reference?.toLowerCase().includes(searchLower) ||
          payment.internal_reference?.toLowerCase().includes(searchLower) ||
          payment.amount_paid?.toString().includes(searchLower) ||
          payment.customer_name?.toLowerCase().includes(searchLower)
      );
    }

    // Sort payments with pending status at the top, then by date
    return filtered.sort((a, b) => {
      // First priority: pending status
      if (a.status === "pending" && b.status !== "pending") return -1;
      if (a.status !== "pending" && b.status === "pending") return 1;

      // Second priority: sort by payment date (newest first)
      const dateA = new Date(a.payment_date).getTime();
      const dateB = new Date(b.payment_date).getTime();
      return dateB - dateA;
    });
  }, [payments, filters]);

  // Update sorted payments when filters change
  useEffect(() => {
    setSortedPayments(filteredAndSortedPayments);
  }, [filteredAndSortedPayments]);

  useEffect(() => {
    fetchPayments();
  }, []); // Only fetch once on mount

  const handleDateChange = useCallback(
    (newDateRange: { start: Date; end: Date }) => {
      setFilters((prev) => ({
        ...prev,
        dateRange: newDateRange,
      }));
    },
    []
  );

  const handleMonthChange = useCallback((month: MonthOption) => {
    setSelectedMonth(month);

    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonthIndex = now.getMonth();

    const targetYear =
      month.id > currentMonthIndex ? currentYear - 1 : currentYear;

    const startDate = new Date(targetYear, month.id, 1);
    startDate.setHours(0, 0, 0, 0);
    const endDate = new Date(targetYear, month.id + 1, 0);
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

  const handleViewPayment = (payment: GreenTargetPayment) => {
    navigate(`/greentarget/invoices/${payment.invoice_id}`, {
      state: { scrollToPayments: true },
    });
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
          <IconCash size={28} className="text-gray-700 dark:text-gray-200" />
          Payment Management
        </h1>
        <Button onClick={handleNewPayment} icon={IconPlus} size="md">
          New Payment
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
                placeholder="Search"
                title="Search payments by invoice, reference, or amount"
                className="w-full pl-10 pr-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-default-900 dark:text-gray-100 placeholder:text-default-400 dark:placeholder:text-gray-400 rounded-full focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent"
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
            <div className="w-full sm:w-auto">
              <DateRangePicker
                dateRange={{
                  start: filters.dateRange.start || new Date(),
                  end: filters.dateRange.end || new Date(),
                }}
                onDateChange={handleDateChange}
              />
            </div>

            {/* Month Selector */}
            <div className="w-full sm:w-40">
              <Listbox value={selectedMonth} onChange={handleMonthChange}>
                <div className="relative">
                  <ListboxButton className="w-full h-[42px] rounded-full border border-default-300 dark:border-gray-600 bg-white dark:bg-gray-700 py-[9px] pl-3 pr-10 text-left focus:outline-none focus:border-default-500 text-sm text-default-900 dark:text-gray-100">
                    <span className="block truncate pl-1">
                      {selectedMonth.name}
                    </span>
                    <span className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                      <IconChevronDown
                        className="h-5 w-5 text-default-400 dark:text-gray-500"
                        aria-hidden="true"
                      />
                    </span>
                  </ListboxButton>
                  <Transition
                    leave="transition ease-in duration-100"
                    leaveFrom="opacity-100"
                    leaveTo="opacity-0"
                  >
                    <ListboxOptions className="absolute z-50 w-full p-1 mt-1 border border-default-200 dark:border-gray-700 bg-white dark:bg-gray-800 max-h-60 rounded-lg overflow-auto focus:outline-none shadow-lg text-sm">
                      {monthOptions.map((month) => (
                        <ListboxOption
                          key={month.id}
                          value={month}
                          className={({ active }) =>
                            `relative cursor-pointer select-none py-2 pl-4 pr-4 rounded-md ${
                              active
                                ? "bg-default-100 dark:bg-gray-700 text-default-900 dark:text-gray-100"
                                : "text-gray-900 dark:text-gray-100"
                            }`
                          }
                        >
                          {({ selected }) => (
                            <>
                              <span
                                className={`block truncate ${
                                  selected ? "font-medium" : "font-normal"
                                }`}
                              >
                                {month.name}
                              </span>
                              {selected && (
                                <span className="absolute inset-y-0 right-0 flex items-center pr-3 text-sky-600 dark:text-sky-400">
                                  <IconCheck
                                    className="h-5 w-5"
                                    aria-hidden="true"
                                    stroke={2.5}
                                  />
                                </span>
                              )}
                            </>
                          )}
                        </ListboxOption>
                      ))}
                    </ListboxOptions>
                  </Transition>
                </div>
              </Listbox>
            </div>

            {/* Payment Method Filter */}
            <StyledListbox
              value={filters.paymentMethod || ""}
              onChange={(value) => {
                setFilters((prev) => ({
                  ...prev,
                  paymentMethod: value === "" ? null : String(value),
                }));
              }}
              options={[
                { id: "", name: "All Methods" },
                { id: "cash", name: "Cash" },
                { id: "cheque", name: "Cheque" },
                { id: "bank_transfer", name: "Bank Transfer" },
                { id: "online", name: "Online" },
              ]}
              className="w-full sm:w-40"
              placeholder="All Methods"
            />

            {/* Status Filter */}
            <StyledListbox
              value={filters.status || ""}
              onChange={(value) => {
                setFilters((prev) => ({
                  ...prev,
                  status: value === "" ? null : String(value),
                }));
              }}
              options={[
                { id: "", name: "All Status" },
                { id: "active", name: "Active" },
                { id: "pending", name: "Pending" },
                { id: "overpaid", name: "Overpaid" },
                { id: "cancelled", name: "Cancelled" },
              ]}
              className="w-full sm:w-40"
              placeholder="All Status"
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
        <GreenTargetPaymentTable
          payments={sortedPayments}
          onViewPayment={handleViewPayment}
          onRefresh={fetchPayments}
        />
      )}

      {/* Payment Form Modal */}
      {showPaymentForm && (
        <GreenTargetPaymentForm
          payment={selectedPayment}
          onClose={() => setShowPaymentForm(false)}
          onSuccess={handlePaymentCreated}
          dateRange={filters.dateRange}
        />
      )}
    </div>
  );
};

export default GreenTargetPaymentPage;
