import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { IconPlus, IconSearch } from "@tabler/icons-react";
import toast from "react-hot-toast";
import Button from "../../../components/Button";
import GreenTargetPaymentForm from "../../../components/GreenTarget/GreenTargetPaymentForm";
import GreenTargetPaymentTable from "../../../components/GreenTarget/GreenTargetPaymentTable";
import LoadingSpinner from "../../../components/LoadingSpinner";
import StyledListbox from "../../../components/StyledListbox";
import TimeNavigator from "../../../components/TimeNavigator";
import { greenTargetApi } from "../../../routes/greentarget/api";
import { GreenTargetPayment } from "../../../types/greenTargetTypes";

interface PaymentFilters {
  dateRange: {
    start: Date | null;
    end: Date | null;
  };
  paymentMethod: string | null;
  status: string | null;
  searchTerm: string;
}

const GreenTargetPaymentPage: React.FC = () => {
  const navigate = useNavigate();
  const [payments, setPayments] = useState<GreenTargetPayment[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [showPaymentForm, setShowPaymentForm] = useState<boolean>(false);
  const [selectedPayment, setSelectedPayment] =
    useState<GreenTargetPayment | null>(null);

  const [filters, setFilters] = useState<PaymentFilters>(() => {
    const now: Date = new Date();
    const start: Date = new Date(now.getFullYear(), now.getMonth(), 1);
    const end: Date = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    end.setHours(23, 59, 59, 999);

    return {
      dateRange: { start, end },
      paymentMethod: null,
      status: "active",
      searchTerm: "",
    };
  });

  const fetchPayments = useCallback(async (): Promise<void> => {
    setLoading(true);
    try {
      // GT's payment endpoint does not support the page filters yet, so keep
      // the complete result locally and filter it below.
      const response = (await greenTargetApi.getPayments({
        includeCancelled: true,
      })) as GreenTargetPayment[];
      setPayments(Array.isArray(response) ? response : []);
    } catch (error: unknown) {
      console.error("Error fetching payments:", error);
      toast.error("Failed to fetch payments");
    } finally {
      setLoading(false);
    }
  }, []);

  const filteredAndSortedPayments = useMemo<GreenTargetPayment[]>(() => {
    let filtered: GreenTargetPayment[] = [...payments];

    if (filters.dateRange.start && filters.dateRange.end) {
      const startDate: string = format(
        filters.dateRange.start,
        "yyyy-MM-dd"
      );
      const endDate: string = format(filters.dateRange.end, "yyyy-MM-dd");

      filtered = filtered.filter((payment: GreenTargetPayment): boolean => {
        const paymentDate: string = format(
          new Date(payment.payment_date),
          "yyyy-MM-dd"
        );
        return paymentDate >= startDate && paymentDate <= endDate;
      });
    }

    if (filters.paymentMethod) {
      filtered = filtered.filter(
        (payment: GreenTargetPayment): boolean =>
          payment.payment_method === filters.paymentMethod
      );
    }

    if (filters.status) {
      if (filters.status === "active") {
        filtered = filtered.filter(
          (payment: GreenTargetPayment): boolean =>
            !payment.status ||
            payment.status === "active" ||
            payment.status === "pending"
        );
      } else {
        filtered = filtered.filter(
          (payment: GreenTargetPayment): boolean =>
            payment.status === filters.status
        );
      }
    }

    const normalizedSearchTerm: string = filters.searchTerm.trim().toLowerCase();
    if (normalizedSearchTerm) {
      filtered = filtered.filter(
        (payment: GreenTargetPayment): boolean =>
          String(payment.invoice_id)
            .toLowerCase()
            .includes(normalizedSearchTerm) ||
          payment.payment_reference
            ?.toLowerCase()
            .includes(normalizedSearchTerm) ||
          payment.internal_reference
            ?.toLowerCase()
            .includes(normalizedSearchTerm) ||
          String(payment.amount_paid).includes(normalizedSearchTerm) ||
          payment.customer_name?.toLowerCase().includes(normalizedSearchTerm) ||
          false
      );
    }

    return filtered.sort(
      (firstPayment: GreenTargetPayment, secondPayment: GreenTargetPayment): number => {
        if (
          firstPayment.status === "pending" &&
          secondPayment.status !== "pending"
        ) {
          return -1;
        }
        if (
          firstPayment.status !== "pending" &&
          secondPayment.status === "pending"
        ) {
          return 1;
        }

        const firstDate: string = format(
          new Date(firstPayment.payment_date),
          "yyyy-MM-dd"
        );
        const secondDate: string = format(
          new Date(secondPayment.payment_date),
          "yyyy-MM-dd"
        );
        return secondDate.localeCompare(firstDate);
      }
    );
  }, [filters, payments]);

  useEffect((): void => {
    void fetchPayments();
  }, [fetchPayments]);

  const handleTimeNavigatorChange = useCallback(
    (range: { start: Date; end: Date }): void => {
      setFilters((previousFilters: PaymentFilters): PaymentFilters => ({
        ...previousFilters,
        dateRange: { start: range.start, end: range.end },
      }));
    },
    []
  );

  const handleNewPayment = (): void => {
    setSelectedPayment(null);
    setShowPaymentForm(true);
  };

  const handlePaymentCreated = (): void => {
    setShowPaymentForm(false);
    void fetchPayments();
  };

  const handleViewPayment = (payment: GreenTargetPayment): void => {
    navigate(`/greentarget/invoices/${payment.invoice_id}`, {
      state: { scrollToPayments: true },
    });
  };

  return (
    <div className="space-y-4">
      <div className="mb-4 rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <div className="p-3 sm:p-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative w-full min-w-0 flex-1 sm:w-auto sm:min-w-[220px]">
              <IconSearch
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500"
                size={18}
              />
              <input
                type="text"
                placeholder="Search"
                title="Search payments by invoice, reference, customer, or amount"
                className="h-[40px] w-full rounded-lg border border-gray-300 bg-white py-2 pl-10 pr-3 text-default-900 placeholder:text-default-400 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-sky-500 dark:border-gray-600 dark:bg-gray-900/50 dark:text-gray-100 dark:placeholder:text-gray-400"
                value={filters.searchTerm}
                onChange={(event: React.ChangeEvent<HTMLInputElement>): void =>
                  setFilters(
                    (previousFilters: PaymentFilters): PaymentFilters => ({
                      ...previousFilters,
                      searchTerm: event.target.value,
                    })
                  )
                }
              />
            </div>

            <div className="w-full min-w-0 sm:w-auto">
              <TimeNavigator
                range={filters.dateRange}
                onChange={handleTimeNavigatorChange}
                className="max-w-full"
              />
            </div>

            <div className="w-[calc(50%-0.375rem)] min-w-[130px] sm:w-40">
              <StyledListbox
                value={filters.paymentMethod || ""}
                onChange={(value: string | number): void =>
                  setFilters(
                    (previousFilters: PaymentFilters): PaymentFilters => ({
                      ...previousFilters,
                      paymentMethod: value === "" ? null : String(value),
                    })
                  )
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

            <div className="w-[calc(50%-0.375rem)] min-w-[130px] sm:w-40">
              <StyledListbox
                value={filters.status || ""}
                onChange={(value: string | number): void =>
                  setFilters(
                    (previousFilters: PaymentFilters): PaymentFilters => ({
                      ...previousFilters,
                      status: value === "" ? null : String(value),
                    })
                  )
                }
                options={[
                  { id: "", name: "All Status" },
                  { id: "active", name: "Active" },
                  { id: "pending", name: "Pending" },
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

      {loading ? (
        <div className="flex h-64 items-center justify-center">
          <LoadingSpinner />
        </div>
      ) : (
        <GreenTargetPaymentTable
          payments={filteredAndSortedPayments}
          onViewPayment={handleViewPayment}
          onRefresh={fetchPayments}
        />
      )}

      {showPaymentForm && (
        <GreenTargetPaymentForm
          payment={selectedPayment}
          onClose={(): void => setShowPaymentForm(false)}
          onSuccess={handlePaymentCreated}
          dateRange={filters.dateRange}
        />
      )}
    </div>
  );
};

export default GreenTargetPaymentPage;
