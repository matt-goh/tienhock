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
  IconSettings,
} from "@tabler/icons-react";
import {
  confirmPayment,
  cancelPayment,
  getGroupedReceiptCancellationError,
  getPaymentBankAccountLabel,
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
  onViewPaymentGroup?: (receiptId: number) => void;
}

const PaymentTable: React.FC<PaymentTableProps> = ({
  payments,
  onViewPayment,
  onRefresh,
  onCancellationError,
  onAddPaymentToGroup,
  onViewPaymentGroup,
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

  const handleConfirmPayment = async (): Promise<void> => {
    if (!selectedPayment || confirmingPaymentId !== null) return;

    setConfirmingPaymentId(selectedPayment.payment_id);
    setShowConfirmDialog(false);
    const toastId = toast.loading("Confirming payment(s)...");

    try {
      const confirmedPayments = await confirmPayment(
        selectedPayment.payment_id,
        selectedPayment.receipt_id ? undefined : selectedBankAccount
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

  const renderJournalLink = (payment: Payment): React.ReactNode => {
    const journalEntryId: number | null =
      payment.voucher_journal_id ?? payment.journal_entry_id ?? null;
    if (!journalEntryId) {
      return <span className="text-xs text-gray-400 dark:text-gray-500">-</span>;
    }

    return (
      <button
        type="button"
        onClick={() => navigate(`/accounting/journal-entries/${journalEntryId}`)}
        className="inline-flex items-center gap-1 text-xs text-sky-600 hover:underline dark:text-sky-400"
        title="View journal entry"
      >
        <IconReceipt size={14} className="flex-shrink-0" />
        <span className="font-mono">
          {payment.journal_reference_no || "View Journal"}
        </span>
      </button>
    );
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
  const selectedConfirmationGroupSize: number = Math.max(
    1,
    Number(selectedPayment?.allocation_count) || 1
  );
  const selectedConfirmationIsReceiptBacked: boolean = Boolean(
    selectedPayment?.receipt_id
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
                const manageableGroupPayment: Payment | undefined =
                  paymentGroup.find(
                    (payment: Payment): boolean =>
                      payment.status !== "cancelled" &&
                      Boolean(payment.receipt_id)
                  ) ??
                  paymentGroup.find(
                    (payment: Payment): boolean => Boolean(payment.receipt_id)
                  );
                const manageableReceiptId: number | null =
                  manageableGroupPayment?.receipt_id ?? null;
                const canManageGroup: boolean = Boolean(
                  onViewPaymentGroup && manageableReceiptId !== null
                );
                const canAddToGroup: boolean = Boolean(
                  onAddPaymentToGroup && groupTemplate.payment_reference
                );
                const totalAmount = paymentGroup.reduce(
                  (sum, p) => sum + (p.amount_paid || 0),
                  0
                );

                if (isGrouped) {
                  // Render grouped payments
                  return (
                    <React.Fragment key={reference}>
                      <tr className="bg-sky-50/80 dark:bg-sky-950/30">
                        <td className="border-l-4 border-sky-400 px-3 py-3 text-sm font-medium text-gray-800 dark:border-sky-600 dark:text-gray-100">
                          {formatDate(firstPayment.payment_date)}
                        </td>
                        <td className="px-3 py-3 max-w-[150px]">
                          <div className="truncate font-mono font-semibold text-gray-900 dark:text-gray-100" title={firstPayment.payment_reference || ''}>
                            {firstPayment.payment_reference}
                          </div>
                          <span className="mt-1 inline-flex rounded-full bg-sky-100 px-2 py-0.5 text-xs font-medium text-sky-700 dark:bg-sky-900/50 dark:text-sky-300">
                            {paymentGroup.length} invoices
                          </span>
                        </td>
                        <td
                          className="px-3 py-3 text-sm"
                          colSpan={2}
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            {canManageGroup &&
                              onViewPaymentGroup &&
                              manageableReceiptId !== null && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    onViewPaymentGroup(manageableReceiptId)
                                  }
                                  className="inline-flex items-center gap-1.5 rounded-md border border-sky-200 bg-white/70 px-2 py-1 text-xs font-medium text-sky-700 transition-colors hover:bg-sky-100 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-1 dark:border-sky-800 dark:bg-gray-900/40 dark:text-sky-300 dark:hover:bg-sky-900/50 dark:focus:ring-offset-gray-900"
                                  title={`Manage payment group ${groupTemplate.payment_reference}`}
                                >
                                  <IconSettings size={14} stroke={1.75} />
                                  <span>Manage Group</span>
                                </button>
                              )}
                          </div>
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
                          <div className="flex flex-wrap justify-center gap-1.5">
                            {canAddToGroup &&
                              onAddPaymentToGroup &&
                              groupTemplate.payment_reference && (
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
                              )}
                            {!canAddToGroup && "-"}
                          </div>
                        </td>
                      </tr>
                      {paymentGroup.map((payment, paymentIndex) => {
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
                                isLastPayment ? "top-0 h-1/2" : "inset-y-0"
                              }`}
                            />
                            <span
                              aria-hidden="true"
                              className="absolute left-[17px] top-1/2 h-2 w-2 -translate-y-1/2 rounded-full border-2 border-sky-400 bg-white dark:border-sky-500 dark:bg-gray-800"
                            />
                            <span className="sr-only">Grouped invoice</span>
                          </td>
                          <td className="px-3 py-3" />
                          <td className="px-3 py-3">
                            <button
                              type="button"
                              onClick={() => onViewPayment(payment)}
                              className="inline-flex rounded-md bg-sky-50 px-2 py-1 font-mono text-sm font-medium text-sky-700 hover:bg-sky-100 hover:text-sky-800 dark:bg-sky-900/30 dark:text-sky-300 dark:hover:bg-sky-900/50 dark:hover:text-sky-200"
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
                          <td className="px-3 py-3" />
                          <td className="px-3 py-3">
                            {getStatusBadge(payment.status)}
                          </td>
                          <td className="px-3 py-3">
                            {renderJournalLink(payment)}
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
                      })}
                    </React.Fragment>
                  );
                } else {
                  // Render single payment
                  const payment = paymentGroup[0];
                  const paymentReceiptId: number | null =
                    payment.receipt_id ?? null;
                  return (
                    <tr key={payment.payment_id}>
                      <td className="px-3 py-3 text-sm">
                        {formatDate(payment.payment_date)}
                      </td>
                      <td className="px-3 py-3 max-w-[150px]">
                        {onViewPaymentGroup &&
                        paymentReceiptId !== null &&
                        payment.payment_reference ? (
                          <button
                            type="button"
                            onClick={() =>
                              onViewPaymentGroup(paymentReceiptId)
                            }
                            className="block max-w-full truncate font-mono text-sm text-sky-600 hover:underline dark:text-sky-400"
                            title={`Manage payment group ${payment.payment_reference}`}
                          >
                            {payment.payment_reference}
                          </button>
                        ) : (
                          <span className="font-mono text-sm text-gray-600 dark:text-gray-400 truncate block" title={payment.payment_reference || ''}>
                            {payment.payment_reference || "-"}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <button
                          type="button"
                          onClick={() => onViewPayment(payment)}
                          className="inline-flex rounded-md bg-sky-50 px-2 py-1 font-mono text-sm font-medium text-sky-700 hover:bg-sky-100 hover:text-sky-800 dark:bg-sky-900/30 dark:text-sky-300 dark:hover:bg-sky-900/50 dark:hover:text-sky-200"
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
                        {renderJournalLink(payment)}
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

      {selectedPayment && (
        <ConfirmationDialog
          isOpen={showConfirmDialog}
          onClose={() => {
            setShowConfirmDialog(false);
            setSelectedPayment(null);
            setSelectedBankAccount("BANK_PBB");
          }}
          onConfirm={() => void handleConfirmPayment()}
          title={
            selectedConfirmationGroupSize > 1
              ? `Confirm payment group ${
                  selectedPayment.payment_reference || ""
                }?`
              : "Confirm pending payment?"
          }
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

              {selectedConfirmationGroupSize > 1 && (
                <div className="rounded-lg border border-sky-200 bg-sky-50 p-3 text-sky-800 dark:border-sky-800 dark:bg-sky-900/30 dark:text-sky-200">
                  Reference {selectedPayment.payment_reference} covers{" "}
                  {selectedConfirmationGroupSize} payments. Every payment still
                  marked Pending will be confirmed together; payments already
                  confirmed will not change.
                </div>
              )}

              {selectedConfirmationIsReceiptBacked ? (
                <div className="rounded-lg bg-default-50 p-3 dark:bg-gray-900/50">
                  <p className="text-xs text-default-500 dark:text-gray-400">
                    Deposit to
                  </p>
                  <p className="mt-1 font-semibold text-default-800 dark:text-gray-100">
                    {getPaymentBankAccountLabel(
                      selectedPayment.bank_account || "BANK_PBB"
                    )}
                  </p>
                  <p className="mt-1 text-xs text-default-500 dark:text-gray-400">
                    This is the account recorded when the payment was entered.
                  </p>
                </div>
              ) : (
                <div>
                  <FormListbox
                    name="bank_account"
                    label="Deposit To"
                    value={selectedBankAccount}
                    onChange={(value: string): void =>
                      setSelectedBankAccount(value)
                    }
                    options={[
                      { id: "BANK_PBB", name: "Public Bank" },
                      { id: "BANK_ABB", name: "Alliance Bank" },
                    ]}
                    disabled={confirmingPaymentId !== null}
                  />
                  <p className="mt-1 text-xs text-default-500 dark:text-gray-400">
                    Choose the bank account for this older pending payment.
                  </p>
                </div>
              )}

              <p className="text-xs text-default-500 dark:text-gray-400">
                Confirming updates the related invoice balances and creates the
                payment journal entries.
              </p>
            </div>
          }
          confirmButtonText={
            selectedConfirmationGroupSize > 1
              ? "Confirm Pending Group"
              : "Confirm Payment"
          }
          variant="success"
        />
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
