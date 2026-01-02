import React, { useState } from "react";
import { Payment } from "../../types/types";
import Button from "../../components/Button";
import ConfirmationDialog from "../../components/ConfirmationDialog";
import { IconCircleCheck, IconBan } from "@tabler/icons-react";
import {
  confirmPayment,
  cancelPayment,
} from "../../utils/invoice/InvoiceUtils";
import toast from "react-hot-toast";
import { useCustomersCache } from "../../utils/catalogue/useCustomerCache";

interface PaymentTableProps {
  payments: Payment[];
  onViewPayment: (payment: Payment) => void;
  onRefresh: () => void;
}

const PaymentTable: React.FC<PaymentTableProps> = ({
  payments,
  onViewPayment,
  onRefresh,
}) => {
  const [confirmingPaymentId, setConfirmingPaymentId] = useState<number | null>(
    null
  );
  const [cancellingPaymentId, setCancellingPaymentId] = useState<number | null>(
    null
  );
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState<Payment | null>(null);
  const { customers } = useCustomersCache();

  const formatCurrency = (amount: number | string): string => {
    const num = Number(amount);
    return isNaN(num)
      ? "RM 0.00"
      : num.toLocaleString("en-MY", {
          style: "currency",
          currency: "MYR",
        });
  };

  const formatDate = (dateString: string): string => {
    return new Date(dateString).toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  };

  const handleConfirmPayment = async () => {
    if (!selectedPayment) return;

    setConfirmingPaymentId(selectedPayment.payment_id);
    setShowConfirmDialog(false);
    const toastId = toast.loading("Confirming payment(s)...");

    try {
      const confirmedPayments = await confirmPayment(
        selectedPayment.payment_id
      );
      let successMessage = "Payment confirmed successfully.";
      if (confirmedPayments.length > 1) {
        successMessage = `${confirmedPayments.length} payments with reference '${selectedPayment.payment_reference}' have been confirmed.`;
      }
      toast.success(successMessage, { id: toastId });
      onRefresh(); // This will refetch all payments and update the table
    } catch (error) {
      // Error is already toasted by InvoiceUtils, just log it and dismiss loading.
      console.error("Error confirming payment:", error);
      toast.dismiss(toastId);
    } finally {
      setConfirmingPaymentId(null);
      setSelectedPayment(null);
    }
  };

  const handleCancelPayment = async () => {
    if (!selectedPayment) return;

    setCancellingPaymentId(selectedPayment.payment_id);
    setShowCancelDialog(false);

    try {
      await cancelPayment(selectedPayment.payment_id);
      toast.success("Payment cancelled successfully");
      onRefresh();
    } catch (error) {
      console.error("Error cancelling payment:", error);
    } finally {
      setCancellingPaymentId(null);
      setSelectedPayment(null);
    }
  };

  const getStatusBadge = (status?: string) => {
    switch (status) {
      case "pending":
        return (
          <span className="inline-flex px-2 py-1 text-xs font-medium rounded-full bg-yellow-100 dark:bg-yellow-900/50 text-yellow-700 dark:text-yellow-400">
            Pending
          </span>
        );
      case "overpaid":
        return (
          <span className="inline-flex px-2 py-1 text-xs font-medium rounded-full bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-400">
            Overpaid
          </span>
        );
      case "cancelled":
        return (
          <span className="inline-flex px-2 py-1 text-xs font-medium rounded-full bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-400">
            Cancelled
          </span>
        );
      default:
        return (
          <span className="inline-flex px-2 py-1 text-xs font-medium rounded-full bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-400">
            Settled
          </span>
        );
    }
  };

  // Group payments by payment_reference
  const groupedPayments = payments.reduce((acc, payment) => {
    const key = payment.payment_reference || `single_${payment.payment_id}`;
    if (!acc[key]) {
      acc[key] = [];
    }
    acc[key].push(payment);
    return acc;
  }, {} as Record<string, Payment[]>);

  // Sort groups so that groups with any pending payments appear at the top
  const sortedGroupEntries = Object.entries(groupedPayments).sort(([, groupA], [, groupB]) => {
    // Check if any payment in group A has pending status
    const groupAHasPending = groupA.some(p => p.status === 'pending');
    // Check if any payment in group B has pending status
    const groupBHasPending = groupB.some(p => p.status === 'pending');
    
    // First priority: groups with pending payments go to top
    if (groupAHasPending && !groupBHasPending) return -1;
    if (!groupAHasPending && groupBHasPending) return 1;
    
    // Second priority: sort by payment date (newest first)
    const dateA = new Date(groupA[0].payment_date).getTime();
    const dateB = new Date(groupB[0].payment_date).getTime();
    return dateB - dateA;
  });

  if (payments.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-8 text-center">
        <p className="text-gray-500 dark:text-gray-400">
          No payments found for the selected filters.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead className="bg-gray-50 dark:bg-gray-900/50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Date
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Reference
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Invoice(s)
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Customer
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Method
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Status
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Amount
              </th>
              <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
            {sortedGroupEntries.map(
              ([reference, paymentGroup]) => {
                const isGrouped = paymentGroup.length > 1;
                const firstPayment = paymentGroup[0];
                const totalAmount = paymentGroup.reduce(
                  (sum, p) => sum + (p.amount_paid || 0),
                  0
                );

                if (isGrouped) {
                  // Render grouped payments
                  return (
                    <React.Fragment key={reference}>
                      <tr className="bg-gray-50 dark:bg-gray-900/50">
                        <td className="px-6 py-3 whitespace-nowrap text-sm">
                          {formatDate(firstPayment.payment_date)}
                        </td>
                        <td className="px-6 py-3 whitespace-nowrap">
                          <span className="font-medium text-gray-900 dark:text-gray-100">
                            {firstPayment.payment_reference}
                          </span>
                          <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">
                            ({paymentGroup.length} invoices)
                          </span>
                        </td>
                        <td
                          className="px-6 py-3 text-sm text-gray-500"
                          colSpan={2}
                        >
                          Multiple invoices
                        </td>
                        <td className="px-6 py-3 whitespace-nowrap">
                          <span className="inline-flex px-2 py-1 text-xs font-medium rounded-full bg-blue-50 dark:bg-blue-900/50 text-blue-700 dark:text-blue-400 capitalize">
                            {firstPayment.payment_method.replace("_", " ")}
                          </span>
                        </td>
                        <td className="px-6 py-3 whitespace-nowrap">
                          {getStatusBadge(firstPayment.status)}
                        </td>
                        <td className="px-6 py-3 whitespace-nowrap text-right font-medium text-green-600 dark:text-green-400">
                          {formatCurrency(totalAmount)}
                        </td>
                        <td className="px-6 py-3 whitespace-nowrap text-center">
                          -
                        </td>
                      </tr>
                      {paymentGroup.map((payment) => (
                        <tr key={payment.payment_id} className="bg-white dark:bg-gray-800">
                          <td className="px-6 py-3 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400 pl-12">
                            └
                          </td>
                          <td className="px-6 py-3 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                            -
                          </td>
                          <td className="px-6 py-3 whitespace-nowrap">
                            <button
                              onClick={() => onViewPayment(payment)}
                              className="text-sm text-sky-600 dark:text-sky-400 hover:text-sky-800 dark:hover:text-sky-300 hover:underline"
                            >
                              {payment.invoice_id}
                            </button>
                          </td>
                          <td
                            className="px-6 py-3 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100"
                            title={payment.customerid}
                          >
                            <div className="truncate max-w-60">
                              {payment.customer_name}
                            </div>
                          </td>
                          <td className="px-6 py-3 whitespace-nowrap">-</td>
                          <td className="px-6 py-3 whitespace-nowrap">
                            {getStatusBadge(payment.status)}
                          </td>
                          <td className="px-6 py-3 whitespace-nowrap text-right font-medium text-green-600 dark:text-green-400">
                            {formatCurrency(payment.amount_paid)}
                          </td>
                          <td className="px-6 py-3 whitespace-nowrap text-center">
                            <div className="flex justify-center gap-1">
                              {payment.status === "pending" && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  color="sky"
                                  onClick={() => {
                                    setSelectedPayment(payment);
                                    setShowConfirmDialog(true);
                                  }}
                                  disabled={
                                    confirmingPaymentId === payment.payment_id
                                  }
                                  title="Confirm Payment"
                                >
                                  <IconCircleCheck size={16} />
                                </Button>
                              )}
                              {payment.status !== "cancelled" && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  color="rose"
                                  onClick={() => {
                                    setSelectedPayment(payment);
                                    setShowCancelDialog(true);
                                  }}
                                  disabled={
                                    cancellingPaymentId === payment.payment_id
                                  }
                                  title="Cancel Payment"
                                >
                                  <IconBan size={16} />
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </React.Fragment>
                  );
                } else {
                  // Render single payment
                  const payment = paymentGroup[0];
                  return (
                    <tr key={payment.payment_id}>
                      <td className="px-6 py-3 whitespace-nowrap text-sm">
                        {formatDate(payment.payment_date)}
                      </td>
                      <td className="px-6 py-3 whitespace-nowrap">
                        <span className="font-mono text-sm text-gray-600 dark:text-gray-400">
                          {payment.payment_reference || "-"}
                        </span>
                      </td>
                      <td className="px-6 py-3 whitespace-nowrap">
                        <button
                          onClick={() => onViewPayment(payment)}
                          className="text-sky-600 dark:text-sky-400 text-sm hover:text-sky-800 dark:hover:text-sky-300 hover:underline"
                        >
                          {payment.invoice_id}
                        </button>
                      </td>
                      <td
                        className="px-6 py-3 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100"
                        title={payment.customerid}
                      >
                        <div className="truncate max-w-60">
                          {payment.customer_name}
                        </div>
                      </td>
                      <td className="px-6 py-3 whitespace-nowrap">
                        <span className="inline-flex px-2 py-1 text-xs font-medium rounded-full bg-blue-50 dark:bg-blue-900/50 text-blue-700 dark:text-blue-400 capitalize">
                          {payment.payment_method.replace("_", " ")}
                        </span>
                      </td>
                      <td className="px-6 py-3 whitespace-nowrap">
                        {getStatusBadge(payment.status)}
                      </td>
                      <td className="px-6 py-3 whitespace-nowrap text-right font-medium text-green-600 dark:text-green-400">
                        {formatCurrency(payment.amount_paid)}
                      </td>
                      <td className="px-6 py-3 whitespace-nowrap text-center">
                        <div className="flex justify-center gap-1">
                          {payment.status === "pending" && (
                            <Button
                              size="sm"
                              variant="outline"
                              color="sky"
                              onClick={() => {
                                setSelectedPayment(payment);
                                setShowConfirmDialog(true);
                              }}
                              disabled={
                                confirmingPaymentId === payment.payment_id
                              }
                              title="Confirm Payment"
                            >
                              <IconCircleCheck size={16} />
                            </Button>
                          )}
                          {payment.status !== "cancelled" && (
                            <Button
                              size="sm"
                              variant="outline"
                              color="rose"
                              onClick={() => {
                                setSelectedPayment(payment);
                                setShowCancelDialog(true);
                              }}
                              disabled={
                                cancellingPaymentId === payment.payment_id
                              }
                              title="Cancel Payment"
                            >
                              <IconBan size={16} />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                }
              }
            )}
          </tbody>
        </table>
      </div>

      {/* Confirmation Dialogs */}
      <ConfirmationDialog
        isOpen={showConfirmDialog}
        onClose={() => {
          setShowConfirmDialog(false);
          setSelectedPayment(null);
        }}
        onConfirm={handleConfirmPayment}
        title="Confirm Payment"
        message={`Are you sure you want to confirm this ${
          selectedPayment?.payment_method
        } payment of ${formatCurrency(selectedPayment?.amount_paid || 0)}?`}
        confirmButtonText="Confirm Payment"
        variant="success"
      />

      <ConfirmationDialog
        isOpen={showCancelDialog}
        onClose={() => {
          setShowCancelDialog(false);
          setSelectedPayment(null);
        }}
        onConfirm={handleCancelPayment}
        title="Cancel Payment"
        message={`Are you sure you want to cancel this payment of ${formatCurrency(
          selectedPayment?.amount_paid || 0
        )}?`}
        confirmButtonText="Cancel Payment"
        variant="danger"
      />
    </>
  );
};

export default PaymentTable;
