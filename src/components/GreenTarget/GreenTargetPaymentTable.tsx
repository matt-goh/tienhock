import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  IconBan,
  IconCircleCheck,
  IconReceipt,
} from "@tabler/icons-react";
import toast from "react-hot-toast";
import { greenTargetApi } from "../../routes/greentarget/api";
import { GreenTargetPayment } from "../../types/greenTargetTypes";
import Button from "../Button";
import ConfirmationDialog from "../ConfirmationDialog";

interface GreenTargetPaymentTableProps {
  payments: GreenTargetPayment[];
  onViewPayment: (payment: GreenTargetPayment) => void;
  onRefresh: () => void;
}

interface ApiErrorShape {
  message?: string;
  data?: {
    message?: string;
  };
}

const getApiErrorMessage = (error: unknown, fallback: string): string => {
  if (typeof error !== "object" || error === null) return fallback;
  const apiError: ApiErrorShape = error as ApiErrorShape;
  return apiError.data?.message || apiError.message || fallback;
};

const GreenTargetPaymentTable: React.FC<GreenTargetPaymentTableProps> = ({
  payments,
  onViewPayment,
  onRefresh,
}) => {
  const navigate = useNavigate();
  const [confirmingPaymentId, setConfirmingPaymentId] = useState<number | null>(
    null
  );
  const [cancellingPaymentId, setCancellingPaymentId] = useState<number | null>(
    null
  );
  const [showConfirmDialog, setShowConfirmDialog] = useState<boolean>(false);
  const [showCancelDialog, setShowCancelDialog] = useState<boolean>(false);
  const [selectedPayment, setSelectedPayment] =
    useState<GreenTargetPayment | null>(null);

  const formatCurrency = (amount: number | string): string => {
    const numericAmount: number = Number(amount);
    return Number.isNaN(numericAmount)
      ? "RM 0.00"
      : numericAmount.toLocaleString("en-MY", {
          style: "currency",
          currency: "MYR",
        });
  };

  const formatDate = (dateString: string): string =>
    new Date(dateString).toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });

  const handleConfirmPayment = async (): Promise<void> => {
    if (!selectedPayment || confirmingPaymentId !== null) {
      return;
    }

    setConfirmingPaymentId(selectedPayment.payment_id);
    setShowConfirmDialog(false);
    const toastId: string = toast.loading("Confirming payment...");

    try {
      await greenTargetApi.confirmPayment(selectedPayment.payment_id);
      toast.success("Payment confirmed successfully", { id: toastId });
      onRefresh();
    } catch (error: unknown) {
      console.error("Error confirming payment:", error);
      toast.error(getApiErrorMessage(error, "Failed to confirm payment"), {
        id: toastId,
      });
    } finally {
      setConfirmingPaymentId(null);
      setSelectedPayment(null);
    }
  };

  const handleCancelPayment = async (): Promise<void> => {
    if (!selectedPayment || cancellingPaymentId !== null) {
      return;
    }

    setCancellingPaymentId(selectedPayment.payment_id);
    setShowCancelDialog(false);

    try {
      await greenTargetApi.cancelPayment(selectedPayment.payment_id);
      toast.success("Payment cancelled successfully");
      onRefresh();
    } catch (error: unknown) {
      console.error("Error cancelling payment:", error);
      toast.error(getApiErrorMessage(error, "Failed to cancel payment"));
    } finally {
      setCancellingPaymentId(null);
      setSelectedPayment(null);
    }
  };

  const openConfirmDialog = (payment: GreenTargetPayment): void => {
    setSelectedPayment(payment);
    setShowConfirmDialog(true);
  };

  const openCancelDialog = (payment: GreenTargetPayment): void => {
    setSelectedPayment(payment);
    setShowCancelDialog(true);
  };

  const getStatusBadge = (
    status?: GreenTargetPayment["status"]
  ): React.ReactNode => {
    switch (status) {
      case "pending":
        return (
          <span className="inline-flex rounded-full bg-yellow-100 px-2 py-1 text-xs font-medium text-yellow-700 dark:bg-yellow-900/50 dark:text-yellow-300">
            Pending
          </span>
        );
      case "cancelled":
        return (
          <span className="inline-flex rounded-full bg-red-100 px-2 py-1 text-xs font-medium text-red-700 dark:bg-red-900/50 dark:text-red-300">
            Cancelled
          </span>
        );
      default:
        return (
          <span className="inline-flex rounded-full bg-green-100 px-2 py-1 text-xs font-medium text-green-700 dark:bg-green-900/50 dark:text-green-300">
            Settled
          </span>
        );
    }
  };

  const groupedPayments: Record<string, GreenTargetPayment[]> = payments.reduce(
    (
      groups: Record<string, GreenTargetPayment[]>,
      payment: GreenTargetPayment
    ): Record<string, GreenTargetPayment[]> => {
      const paymentDate: string = String(payment.payment_date).slice(0, 10);
      const statusGroup: "active" | "pending" | "cancelled" =
        payment.status === "pending"
          ? "pending"
          : payment.status === "cancelled"
          ? "cancelled"
          : "active";
      const groupKey: string = payment.payment_reference
        ? [
            payment.payment_reference,
            paymentDate,
            payment.payment_method,
            statusGroup,
          ].join("::")
        : `single_${payment.payment_id}`;

      if (!groups[groupKey]) {
        groups[groupKey] = [];
      }
      groups[groupKey].push(payment);
      return groups;
    },
    {}
  );

  const sortedGroupEntries: [string, GreenTargetPayment[]][] = Object.entries(
    groupedPayments
  ).sort(
    (
      [, firstGroup]: [string, GreenTargetPayment[]],
      [, secondGroup]: [string, GreenTargetPayment[]]
    ): number => {
      const firstGroupHasPending: boolean = firstGroup.some(
        (payment: GreenTargetPayment): boolean => payment.status === "pending"
      );
      const secondGroupHasPending: boolean = secondGroup.some(
        (payment: GreenTargetPayment): boolean => payment.status === "pending"
      );

      if (firstGroupHasPending && !secondGroupHasPending) {
        return -1;
      }
      if (!firstGroupHasPending && secondGroupHasPending) {
        return 1;
      }

      const firstDate: string = String(firstGroup[0].payment_date).slice(0, 10);
      const secondDate: string = String(secondGroup[0].payment_date).slice(
        0,
        10
      );
      return secondDate.localeCompare(firstDate);
    }
  );

  const renderPaymentActions = (
    payment: GreenTargetPayment
  ): React.ReactNode => (
    <div className="flex justify-center gap-1">
      {payment.status === "pending" && (
        <Button
          type="button"
          size="sm"
          variant="outline"
          color="sky"
          onClick={(): void => openConfirmDialog(payment)}
          disabled={
            confirmingPaymentId === payment.payment_id ||
            cancellingPaymentId === payment.payment_id
          }
          title="Confirm Payment"
        >
          <IconCircleCheck size={16} />
        </Button>
      )}
      {payment.status !== "cancelled" && (
        <Button
          type="button"
          size="sm"
          variant="outline"
          color="rose"
          onClick={(): void => openCancelDialog(payment)}
          disabled={
            cancellingPaymentId === payment.payment_id ||
            confirmingPaymentId === payment.payment_id
          }
          title="Cancel Payment"
        >
          <IconBan size={16} />
        </Button>
      )}
    </div>
  );

  const renderJournalLink = (
    payment: GreenTargetPayment
  ): React.ReactNode =>
    payment.journal_entry_id ? (
      <button
        type="button"
        onClick={(): void =>
          navigate(
            `/greentarget/accounting/journal-entries/${payment.journal_entry_id}`
          )
        }
        className="inline-flex items-center gap-1 text-xs text-sky-600 hover:text-sky-800 hover:underline dark:text-sky-400 dark:hover:text-sky-300"
        title="View journal entry"
      >
        <IconReceipt size={14} />
        <span className="font-mono">
          {payment.journal_reference_no || `#${payment.journal_entry_id}`}
        </span>
      </button>
    ) : (
      <span className="text-xs text-gray-400 dark:text-gray-500">-</span>
    );

  if (payments.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-8 text-center shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <p className="text-gray-500 dark:text-gray-400">
          No payments found for the selected filters.
        </p>
      </div>
    );
  }

  const tableHeaderClassName: string =
    "whitespace-nowrap px-3 py-3 text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400";

  return (
    <>
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-900/50">
              <tr>
                <th className={`${tableHeaderClassName} text-left`}>Date</th>
                <th className={`${tableHeaderClassName} text-left`}>
                  Reference
                </th>
                <th className={`${tableHeaderClassName} text-left`}>
                  Internal Ref
                </th>
                <th className={`${tableHeaderClassName} text-left`}>
                  Invoice(s)
                </th>
                <th className={`${tableHeaderClassName} text-left`}>
                  Customer
                </th>
                <th className={`${tableHeaderClassName} text-left`}>Method</th>
                <th className={`${tableHeaderClassName} text-left`}>Status</th>
                <th className={`${tableHeaderClassName} text-left`}>
                  Journal Entry
                </th>
                <th className={`${tableHeaderClassName} text-right`}>
                  Amount
                </th>
                <th className={`${tableHeaderClassName} text-center`}>
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-800">
              {sortedGroupEntries.map(
                ([groupKey, paymentGroup]: [
                  string,
                  GreenTargetPayment[]
                ]): React.ReactNode => {
                  const isGrouped: boolean = paymentGroup.length > 1;
                  const firstPayment: GreenTargetPayment = paymentGroup[0];
                  const totalAmount: number = paymentGroup.reduce(
                    (sum: number, payment: GreenTargetPayment): number =>
                      sum + Number(payment.amount_paid || 0),
                    0
                  );
                  const groupStatus: GreenTargetPayment["status"] =
                    paymentGroup.some(
                      (payment: GreenTargetPayment): boolean =>
                        payment.status === "pending"
                    )
                      ? "pending"
                      : paymentGroup.every(
                          (payment: GreenTargetPayment): boolean =>
                            payment.status === "cancelled"
                        )
                      ? "cancelled"
                      : "active";

                  if (isGrouped) {
                    return (
                      <React.Fragment key={groupKey}>
                        <tr className="bg-sky-50/80 dark:bg-sky-950/30">
                          <td className="border-l-4 border-sky-400 px-3 py-3 text-sm font-medium text-gray-800 dark:border-sky-600 dark:text-gray-100">
                            {formatDate(firstPayment.payment_date)}
                          </td>
                          <td className="max-w-[170px] px-3 py-3">
                            <div
                              className="truncate font-mono font-semibold text-gray-900 dark:text-gray-100"
                              title={firstPayment.payment_reference || ""}
                            >
                              {firstPayment.payment_reference}
                            </div>
                            <span className="mt-1 inline-flex rounded-full bg-sky-100 px-2 py-0.5 text-xs font-medium text-sky-700 dark:bg-sky-900/50 dark:text-sky-300">
                              {paymentGroup.length} invoices
                            </span>
                          </td>
                          <td
                            className="px-3 py-3 text-sm text-gray-500 dark:text-gray-400"
                            colSpan={3}
                          >
                            Multiple invoices
                          </td>
                          <td className="px-3 py-3">
                            <span className="inline-flex rounded-full bg-blue-50 px-2 py-1 text-xs font-medium capitalize text-blue-700 dark:bg-blue-900/50 dark:text-blue-300">
                              {firstPayment.payment_method.replace("_", " ")}
                            </span>
                          </td>
                          <td className="px-3 py-3">
                            {getStatusBadge(groupStatus)}
                          </td>
                          <td className="px-3 py-3 text-sm text-gray-400 dark:text-gray-500">
                            -
                          </td>
                          <td className="px-3 py-3 text-right font-medium text-green-600 dark:text-green-400">
                            {formatCurrency(totalAmount)}
                          </td>
                          <td className="px-3 py-3 text-center text-sm text-gray-400 dark:text-gray-500">
                            -
                          </td>
                        </tr>

                        {paymentGroup.map(
                          (
                            payment: GreenTargetPayment,
                            paymentIndex: number
                          ): React.ReactNode => {
                            const isLastPayment: boolean =
                              paymentIndex === paymentGroup.length - 1;

                            return (
                              <tr
                                key={payment.payment_id}
                                className="bg-white transition-colors hover:bg-sky-50/60 dark:bg-gray-800 dark:hover:bg-sky-950/20"
                              >
                                <td className="relative border-l-4 border-sky-400 px-3 py-3 pl-8 dark:border-sky-600">
                                  <span
                                    aria-hidden="true"
                                    className={`absolute left-5 w-px bg-sky-300 dark:bg-sky-700 ${
                                      isLastPayment
                                        ? "top-0 h-1/2"
                                        : "inset-y-0"
                                    }`}
                                  />
                                  <span
                                    aria-hidden="true"
                                    className="absolute left-[17px] top-1/2 h-2 w-2 -translate-y-1/2 rounded-full border-2 border-sky-400 bg-white dark:border-sky-500 dark:bg-gray-800"
                                  />
                                  <span className="sr-only">
                                    Grouped invoice
                                  </span>
                                </td>
                                <td className="px-3 py-3" />
                                <td className="whitespace-nowrap px-3 py-3 font-mono text-sm text-gray-500 dark:text-gray-400">
                                  {payment.internal_reference || "-"}
                                </td>
                                <td className="px-3 py-3">
                                  <button
                                    type="button"
                                    onClick={(): void =>
                                      onViewPayment(payment)
                                    }
                                    className="inline-flex rounded-md bg-sky-50 px-2 py-1 font-mono text-sm font-medium text-sky-700 hover:bg-sky-100 hover:text-sky-800 dark:bg-sky-900/30 dark:text-sky-300 dark:hover:bg-sky-900/50 dark:hover:text-sky-200"
                                  >
                                    {payment.invoice_id}
                                  </button>
                                </td>
                                <td
                                  className="max-w-[240px] px-3 py-3 text-sm text-gray-900 dark:text-gray-100"
                                  title={
                                    payment.customer_name ||
                                    payment.customerid ||
                                    ""
                                  }
                                >
                                  <div className="truncate">
                                    {payment.customer_name ||
                                      payment.customerid ||
                                      "-"}
                                  </div>
                                </td>
                                <td className="px-3 py-3" />
                                <td className="px-3 py-3">
                                  {getStatusBadge(payment.status)}
                                </td>
                                <td className="whitespace-nowrap px-3 py-3">
                                  {renderJournalLink(payment)}
                                </td>
                                <td className="px-3 py-3 text-right font-medium text-green-600 dark:text-green-400">
                                  {formatCurrency(payment.amount_paid)}
                                </td>
                                <td className="px-3 py-3 text-center">
                                  {renderPaymentActions(payment)}
                                </td>
                              </tr>
                            );
                          }
                        )}
                      </React.Fragment>
                    );
                  }

                  return (
                    <tr
                      key={firstPayment.payment_id}
                      className="transition-colors hover:bg-gray-50 dark:hover:bg-gray-700/60"
                    >
                      <td className="whitespace-nowrap px-3 py-3 text-sm">
                        {formatDate(firstPayment.payment_date)}
                      </td>
                      <td className="max-w-[170px] px-3 py-3">
                        <span
                          className="block truncate font-mono text-sm text-gray-600 dark:text-gray-400"
                          title={firstPayment.payment_reference || ""}
                        >
                          {firstPayment.payment_reference || "-"}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 font-mono text-sm text-gray-500 dark:text-gray-400">
                        {firstPayment.internal_reference || "-"}
                      </td>
                      <td className="px-3 py-3">
                        <button
                          type="button"
                          onClick={(): void => onViewPayment(firstPayment)}
                          className="inline-flex rounded-md bg-sky-50 px-2 py-1 font-mono text-sm font-medium text-sky-700 hover:bg-sky-100 hover:text-sky-800 dark:bg-sky-900/30 dark:text-sky-300 dark:hover:bg-sky-900/50 dark:hover:text-sky-200"
                        >
                          {firstPayment.invoice_id}
                        </button>
                      </td>
                      <td
                        className="max-w-[240px] px-3 py-3 text-sm text-gray-900 dark:text-gray-100"
                        title={
                          firstPayment.customer_name ||
                          firstPayment.customerid ||
                          ""
                        }
                      >
                        <div className="truncate">
                          {firstPayment.customer_name ||
                            firstPayment.customerid ||
                            "-"}
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <span className="inline-flex rounded-full bg-blue-50 px-2 py-1 text-xs font-medium capitalize text-blue-700 dark:bg-blue-900/50 dark:text-blue-300">
                          {firstPayment.payment_method.replace("_", " ")}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        {getStatusBadge(firstPayment.status)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3">
                        {renderJournalLink(firstPayment)}
                      </td>
                      <td className="px-3 py-3 text-right font-medium text-green-600 dark:text-green-400">
                        {formatCurrency(firstPayment.amount_paid)}
                      </td>
                      <td className="px-3 py-3 text-center">
                        {renderPaymentActions(firstPayment)}
                      </td>
                    </tr>
                  );
                }
              )}
            </tbody>
          </table>
        </div>
      </div>

      {selectedPayment && (
        <ConfirmationDialog
          isOpen={showConfirmDialog}
          onClose={(): void => {
            setShowConfirmDialog(false);
            setSelectedPayment(null);
          }}
          onConfirm={(): void => {
            void handleConfirmPayment();
          }}
          title="Confirm pending payment?"
          message={
            <div className="space-y-3">
              <p>
                Confirm the pending{" "}
                {selectedPayment.payment_method.replace("_", " ")} payment of{" "}
                <span className="font-semibold text-default-800 dark:text-gray-100">
                  {formatCurrency(selectedPayment.amount_paid)}
                </span>
                ?
              </p>
              <p className="text-xs text-default-500 dark:text-gray-400">
                Confirming updates the related invoice balance.
              </p>
            </div>
          }
          confirmButtonText="Confirm Payment"
          variant="success"
        />
      )}

      <ConfirmationDialog
        isOpen={showCancelDialog}
        onClose={(): void => {
          setShowCancelDialog(false);
          setSelectedPayment(null);
        }}
        onConfirm={handleCancelPayment}
        title="Cancel Payment"
        message={
          <div className="space-y-2">
            <p>
              Are you sure you want to cancel this payment of{" "}
              {formatCurrency(selectedPayment?.amount_paid || 0)}?
            </p>
            {selectedPayment?.status === "pending" && (
              <p className="text-xs text-default-500 dark:text-gray-400">
                This pending payment has not reduced the invoice balance, so
                cancelling it will leave that balance unchanged.
              </p>
            )}
          </div>
        }
        confirmButtonText="Cancel Payment"
        variant="danger"
      />
    </>
  );
};

export default GreenTargetPaymentTable;
