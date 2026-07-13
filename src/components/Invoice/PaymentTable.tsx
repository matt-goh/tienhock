import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Payment,
  CashReceiptVoucherData,
  PaymentCancellationErrorData,
} from "../../types/types";
import Button from "../../components/Button";
import ConfirmationDialog from "../../components/ConfirmationDialog";
import { printCashReceiptVoucherPDF } from "../../utils/accounting/CashReceiptVoucherPDF";
import { FormListbox } from "../../components/FormComponents";
import {
  IconCircleCheck,
  IconBan,
  IconReceipt,
  IconPrinter,
  IconPlus,
} from "@tabler/icons-react";
import {
  confirmPayment,
  cancelPayment,
  getGroupedReceiptCancellationError,
  getPaymentCancellationErrorData,
} from "../../utils/invoice/InvoiceUtils";
import { api } from "../../routes/utils/api";
import toast from "react-hot-toast";
import { useCustomersCache } from "../../utils/catalogue/useCustomerCache";

interface PaymentTableProps {
  payments: Payment[];
  onViewPayment: (payment: Payment) => void;
  onRefresh: () => void;
  onCancellationError?: (error: PaymentCancellationErrorData) => void;
  onAddPaymentToGroup?: (payment: Payment) => void;
}

const PaymentTable: React.FC<PaymentTableProps> = ({
  payments,
  onViewPayment,
  onRefresh,
  onCancellationError,
  onAddPaymentToGroup,
}) => {
  const navigate = useNavigate();
  const [confirmingPaymentId, setConfirmingPaymentId] = useState<number | null>(
    null
  );
  const [cancellingPaymentId, setCancellingPaymentId] = useState<number | null>(
    null
  );
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState<Payment | null>(null);
  const [selectedBankAccount, setSelectedBankAccount] = useState<string>("BANK_PBB"); // Default to Public Bank
  const [loadingVoucherId, setLoadingVoucherId] = useState<number | null>(null);
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
        selectedPayment.payment_id,
        selectedBankAccount
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
      setSelectedBankAccount("BANK_PBB"); // Reset to default
    }
  };

  const handleCancelPaymentClick = (payment: Payment): void => {
    const groupedReceiptError = getGroupedReceiptCancellationError(payment);
    if (groupedReceiptError && onCancellationError) {
      onCancellationError(groupedReceiptError);
      return;
    }

    setSelectedPayment(payment);
    setShowCancelDialog(true);
  };

  const handleCancelPayment = async (): Promise<void> => {
    if (!selectedPayment) return;

    setCancellingPaymentId(selectedPayment.payment_id);
    setShowCancelDialog(false);

    try {
      await cancelPayment(selectedPayment.payment_id, undefined, {
        showErrorToast: !onCancellationError,
      });
      toast.success("Payment cancelled successfully");
      onRefresh();
    } catch (error: unknown) {
      console.error("Error cancelling payment:", error);
      if (onCancellationError) {
        onCancellationError(getPaymentCancellationErrorData(error));
      }
    } finally {
      setCancellingPaymentId(null);
      setSelectedPayment(null);
    }
  };

  const handlePrintVoucher = async (payment: Payment) => {
    // Receipt-backed rows print through the owning receipt's journal;
    // legacy rows fall back to their own journal.
    const journalId = payment.voucher_journal_id ?? payment.journal_entry_id;
    if (!journalId) {
      toast.error("No journal entry linked to this payment");
      return;
    }

    setLoadingVoucherId(journalId);
    try {
      const data: CashReceiptVoucherData = await api.get(
        `/api/journal-entries/${journalId}/receipt-voucher`
      );
      await printCashReceiptVoucherPDF(data);
    } catch (error) {
      console.error("Error printing voucher:", error);
      toast.error("Failed to print voucher");
    } finally {
      setLoadingVoucherId(null);
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

  // A reused reference on a different date/account is a different payment
  // event. Keep the visible grouping tied to the full reference-group identity.
  const groupedPayments: Record<string, Payment[]> = payments.reduce(
    (
      acc: Record<string, Payment[]>,
      payment: Payment
    ): Record<string, Payment[]> => {
      const paymentDate: string = String(payment.payment_date).slice(0, 10);
      const bankAccount: string =
        payment.bank_account ||
        (payment.payment_method === "cash" ? "CASH" : "BANK_PBB");
      const key: string = payment.payment_reference
        ? [
            payment.payment_reference,
            paymentDate,
            payment.payment_method,
            bankAccount,
          ].join("::")
        : `single_${payment.payment_id}`;
      if (!acc[key]) {
        acc[key] = [];
      }
      acc[key].push(payment);
      return acc;
    },
    {}
  );

  // Sort groups so that groups with any pending payments appear at the top
  const sortedGroupEntries: [string, Payment[]][] = Object.entries(
    groupedPayments
  ).sort(
    (
      [, groupA]: [string, Payment[]],
      [, groupB]: [string, Payment[]]
    ): number => {
      const groupAHasPending: boolean = groupA.some(
        (payment: Payment): boolean => payment.status === "pending"
      );
      const groupBHasPending: boolean = groupB.some(
        (payment: Payment): boolean => payment.status === "pending"
      );

      if (groupAHasPending && !groupBHasPending) return -1;
      if (!groupAHasPending && groupBHasPending) return 1;

      const dateA: string = String(groupA[0].payment_date).slice(0, 10);
      const dateB: string = String(groupB[0].payment_date).slice(0, 10);
      return dateB.localeCompare(dateA);
    }
  );

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
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
        <table className="w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead className="bg-gray-50 dark:bg-gray-900/50">
            <tr>
              <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap">
                Date
              </th>
              <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap">
                Reference
              </th>
              <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap">
                Invoice(s)
              </th>
              <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap">
                Customer
              </th>
              <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap">
                Method
              </th>
              <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap">
                Status
              </th>
              <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap">
                Journal
              </th>
              <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap">
                Amount
              </th>
              <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
            {sortedGroupEntries.map(
              ([reference, paymentGroup]) => {
                const isGrouped = paymentGroup.length > 1;
                const firstPayment = paymentGroup[0];
                const groupTemplate: Payment =
                  paymentGroup.find(
                    (payment: Payment): boolean =>
                      payment.status !== "cancelled"
                  ) ?? firstPayment;
                const totalAmount = paymentGroup.reduce(
                  (sum, p) => sum + (p.amount_paid || 0),
                  0
                );

                if (isGrouped) {
                  // Render grouped payments
                  return (
                    <React.Fragment key={reference}>
                      <tr className="bg-gray-50 dark:bg-gray-900/50">
                        <td className="px-3 py-3 text-sm">
                          {formatDate(firstPayment.payment_date)}
                        </td>
                        <td className="px-3 py-3 max-w-[150px]">
                          <div className="font-medium text-gray-900 dark:text-gray-100 truncate" title={firstPayment.payment_reference || ''}>
                            {firstPayment.payment_reference}
                          </div>
                          <div className="text-xs text-gray-500 dark:text-gray-400">
                            ({paymentGroup.length} invoices)
                          </div>
                        </td>
                        <td
                          className="px-3 py-3 text-sm text-gray-500"
                          colSpan={2}
                        >
                          Multiple invoices
                        </td>
                        <td className="px-3 py-3">
                          <span className="inline-flex px-2 py-1 text-xs font-medium rounded-full bg-blue-50 dark:bg-blue-900/50 text-blue-700 dark:text-blue-400 capitalize">
                            {firstPayment.payment_method.replace("_", " ")}
                          </span>
                        </td>
                        <td className="px-3 py-3">
                          {getStatusBadge(firstPayment.status)}
                        </td>
                        <td className="px-3 py-3 text-sm text-gray-500 dark:text-gray-400">
                          -
                        </td>
                        <td className="px-3 py-3 text-right font-medium text-green-600 dark:text-green-400">
                          {formatCurrency(totalAmount)}
                        </td>
                        <td className="px-3 py-3 text-center">
                          {onAddPaymentToGroup &&
                          groupTemplate.payment_reference ? (
                            <Button
                              size="sm"
                              variant="outline"
                              color="sky"
                              icon={IconPlus}
                              onClick={() =>
                                onAddPaymentToGroup(groupTemplate)
                              }
                              title={`Add another payment with reference ${groupTemplate.payment_reference}`}
                            >
                              Add Payment
                            </Button>
                          ) : (
                            "-"
                          )}
                        </td>
                      </tr>
                      {paymentGroup.map((payment) => (
                        <tr key={payment.payment_id} className="bg-white dark:bg-gray-800">
                          <td className="px-3 py-3 text-sm text-gray-500 dark:text-gray-400 pl-6">
                            └
                          </td>
                          <td className="px-3 py-3 text-sm text-gray-500 dark:text-gray-400">
                            -
                          </td>
                          <td className="px-3 py-3">
                            <button
                              onClick={() => onViewPayment(payment)}
                              className="text-sm text-sky-600 dark:text-sky-400 hover:text-sky-800 dark:hover:text-sky-300 hover:underline"
                            >
                              {payment.invoice_id}
                            </button>
                          </td>
                          <td
                            className="px-3 py-3 text-sm text-gray-900 dark:text-gray-100"
                            title={payment.customerid}
                          >
                            <div className="truncate">
                              {payment.customer_name}
                            </div>
                          </td>
                          <td className="px-3 py-3">-</td>
                          <td className="px-3 py-3">
                            {getStatusBadge(payment.status)}
                          </td>
                          <td className="px-3 py-3">
                            {payment.journal_entry_id ? (
                              <button
                                onClick={() => navigate(`/accounting/journal-entries/${payment.journal_entry_id}`)}
                                className="inline-flex items-center gap-1 text-xs text-sky-600 dark:text-sky-400 hover:text-sky-800 dark:hover:text-sky-300 hover:underline truncate"
                                title="View journal entry"
                              >
                                <IconReceipt size={14} className="flex-shrink-0" />
                                <span className="font-mono truncate">{payment.journal_reference_no || `#${payment.journal_entry_id}`}</span>
                              </button>
                            ) : (
                              <span className="text-xs text-gray-400 dark:text-gray-500">-</span>
                            )}
                          </td>
                          <td className="px-3 py-3 text-right font-medium text-green-600 dark:text-green-400">
                            {formatCurrency(payment.amount_paid)}
                          </td>
                          <td className="px-3 py-3 text-center">
                            <div className="flex justify-center gap-1">
                              {payment.journal_entry_id && payment.status !== "cancelled" && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  color="default"
                                  onClick={() => handlePrintVoucher(payment)}
                                  disabled={loadingVoucherId === (payment.voucher_journal_id ?? payment.journal_entry_id)}
                                  title="Print Voucher"
                                >
                                  <IconPrinter size={16} />
                                </Button>
                              )}
                              {payment.status === "pending" && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  color="sky"
                                  onClick={() => {
                                    setSelectedPayment(payment);
                                    setSelectedBankAccount(payment.bank_account || "BANK_PBB");
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
                                  onClick={() => handleCancelPaymentClick(payment)}
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
                      <td className="px-3 py-3 text-sm">
                        {formatDate(payment.payment_date)}
                      </td>
                      <td className="px-3 py-3 max-w-[150px]">
                        <span className="font-mono text-sm text-gray-600 dark:text-gray-400 truncate block" title={payment.payment_reference || ''}>
                          {payment.payment_reference || "-"}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        <button
                          onClick={() => onViewPayment(payment)}
                          className="text-sky-600 dark:text-sky-400 text-sm hover:text-sky-800 dark:hover:text-sky-300 hover:underline"
                        >
                          {payment.invoice_id}
                        </button>
                      </td>
                      <td
                        className="px-3 py-3 text-sm text-gray-900 dark:text-gray-100"
                        title={payment.customerid}
                      >
                        <div className="truncate">
                          {payment.customer_name}
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <span className="inline-flex px-2 py-1 text-xs font-medium rounded-full bg-blue-50 dark:bg-blue-900/50 text-blue-700 dark:text-blue-400 capitalize">
                          {payment.payment_method.replace("_", " ")}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        {getStatusBadge(payment.status)}
                      </td>
                      <td className="px-3 py-3">
                        {payment.journal_entry_id ? (
                          <button
                            onClick={() => navigate(`/accounting/journal-entries/${payment.journal_entry_id}`)}
                            className="inline-flex items-center gap-1 text-xs text-sky-600 dark:text-sky-400 hover:text-sky-800 dark:hover:text-sky-300 hover:underline truncate"
                            title="View journal entry"
                          >
                            <IconReceipt size={14} className="flex-shrink-0" />
                            <span className="font-mono truncate">{payment.journal_reference_no || `#${payment.journal_entry_id}`}</span>
                          </button>
                        ) : (
                          <span className="text-xs text-gray-400 dark:text-gray-500">-</span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-right font-medium text-green-600 dark:text-green-400">
                        {formatCurrency(payment.amount_paid)}
                      </td>
                      <td className="px-3 py-3 text-center">
                        <div className="flex justify-center gap-1">
                          {payment.journal_entry_id && payment.status !== "cancelled" && (
                            <Button
                              size="sm"
                              variant="outline"
                              color="default"
                              onClick={() => handlePrintVoucher(payment)}
                              disabled={loadingVoucherId === (payment.voucher_journal_id ?? payment.journal_entry_id)}
                              title="Print Voucher"
                            >
                              <IconPrinter size={16} />
                            </Button>
                          )}
                          {payment.status === "pending" && (
                            <Button
                              size="sm"
                              variant="outline"
                              color="sky"
                              onClick={() => {
                                setSelectedPayment(payment);
                                setSelectedBankAccount(payment.bank_account || "BANK_PBB");
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
                              onClick={() => handleCancelPaymentClick(payment)}
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

      {/* Confirm Payment Dialog with Bank Account Selection */}
      {showConfirmDialog && selectedPayment && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg w-full max-w-md shadow-xl">
            <div className="p-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
                Confirm Payment
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
                Are you sure you want to confirm this {selectedPayment.payment_method} payment of {formatCurrency(selectedPayment.amount_paid)}?
              </p>

              <div className="mb-4">
                <FormListbox
                  name="bank_account"
                  label="Deposit To"
                  value={selectedBankAccount}
                  onChange={(value) => setSelectedBankAccount(value)}
                  options={[
                    { id: "BANK_PBB", name: "Public Bank" },
                    { id: "BANK_ABB", name: "Alliance Bank" },
                  ]}
                  disabled={confirmingPaymentId !== null}
                />
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Select which bank account will receive this payment
                </p>
              </div>

              <div className="flex justify-end gap-3">
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowConfirmDialog(false);
                    setSelectedPayment(null);
                    setSelectedBankAccount("BANK_PBB");
                  }}
                  disabled={confirmingPaymentId !== null}
                >
                  Cancel
                </Button>
                <Button
                  color="green"
                  onClick={handleConfirmPayment}
                  disabled={confirmingPaymentId !== null}
                >
                  Confirm Payment
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

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
