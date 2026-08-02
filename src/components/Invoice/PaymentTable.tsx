import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import {
  Payment,
  CashReceiptVoucherData,
  PaymentCancellationErrorData,
} from "../../types/types";
import Button from "../../components/Button";
import ConfirmationDialog from "../../components/ConfirmationDialog";
import TimeNavigator, {
  type TimeRange,
} from "../../components/TimeNavigator";
import { printCashReceiptVoucherPDF } from "../../utils/accounting/CashReceiptVoucherPDF";
import PillSelect, { PillSelectOption } from "../../components/PillSelect";
import {
  IconCircleCheck,
  IconBan,
  IconReceipt,
  IconPrinter,
  IconPlus,
  IconSettings,
  IconCalendarEvent,
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

const BANK_ACCOUNT_OPTIONS: ReadonlyArray<PillSelectOption<string>> = [
  { value: "BANK_PBB", label: "Public Bank" },
  { value: "BANK_ABB", label: "Alliance Bank" },
];

interface PaymentTableProps {
  payments: Payment[];
  onViewPayment: (payment: Payment) => void;
  onRefresh: () => void;
  onCancellationError?: (error: PaymentCancellationErrorData) => void;
  onAddPaymentToGroup?: (payment: Payment) => void;
  onViewPaymentGroup?: (receiptId: number) => void;
  requiresClearanceDate?: boolean;
  paymentApiEndpoint?: string;
}

const createTodayClearanceRange = (): TimeRange => {
  const today: Date = new Date();
  return { start: today, end: today };
};

// API date values arrive as timestamps or UTC-midnight `date` columns; go
// through a Date so the local calendar day is preserved either way.
const toDayRange = (value: string): TimeRange => {
  const day: Date = new Date(value);
  return { start: day, end: day };
};

const toDayString = (value: string): string =>
  format(new Date(value), "yyyy-MM-dd");

/**
 * The visible reference a payment is grouped under. For a receipt-backed row
 * this is the RECEIPT's own reference, not the payment row's: a grouped cash
 * receipt writes `C{invoice}` onto each payment row (the legacy per-invoice
 * ledger convention), so grouping on the row would split one receipt group into
 * one row per invoice and hide a payment added to an existing group.
 */
const resolveGroupReference = (payment: Payment): string | null =>
  payment.receipt_reference || payment.payment_reference || null;

const formatPaymentMethodLabel = (
  paymentMethod: Payment["payment_method"]
): string =>
  paymentMethod === "contra"
    ? "Imported ledger match"
    : paymentMethod.replace("_", " ");

const PaymentTable: React.FC<PaymentTableProps> = ({
  payments,
  onViewPayment,
  onRefresh,
  onCancellationError,
  onAddPaymentToGroup,
  onViewPaymentGroup,
  requiresClearanceDate = false,
  paymentApiEndpoint = "/api/payments",
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
  const [clearanceDateRange, setClearanceDateRange] = useState<TimeRange>(
    createTodayClearanceRange
  );
  const [loadingVoucherId, setLoadingVoucherId] = useState<number | null>(null);
  const [showDateDialog, setShowDateDialog] = useState<boolean>(false);
  const [dateEditPayment, setDateEditPayment] = useState<Payment | null>(null);
  const [paymentDateRange, setPaymentDateRange] = useState<TimeRange>(
    createTodayClearanceRange
  );
  const [accountingDateRange, setAccountingDateRange] =
    useState<TimeRange | null>(null);
  const [dateEditGroupSize, setDateEditGroupSize] = useState<number>(1);
  const [savingPaymentDate, setSavingPaymentDate] = useState<boolean>(false);
  const [paymentDateError, setPaymentDateError] = useState<string | null>(null);
  const { customers } = useCustomersCache();
  const usesTienHockReceiptAccounting: boolean =
    paymentApiEndpoint === "/api/payments";

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
    const clearanceDate: string = format(
      clearanceDateRange.start,
      "yyyy-MM-dd"
    );

    setConfirmingPaymentId(selectedPayment.payment_id);
    setShowConfirmDialog(false);
    const toastId = toast.loading("Confirming payment(s)...");

    try {
      const confirmedPayments = await confirmPayment(
        selectedPayment.payment_id,
        selectedPayment.receipt_id || !usesTienHockReceiptAccounting
          ? undefined
          : selectedBankAccount,
        requiresClearanceDate ? clearanceDate : undefined,
        paymentApiEndpoint
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
      setClearanceDateRange(createTodayClearanceRange());
    }
  };

  // Tien Hock: only a cheque's date is pure payment history — every other
  // method posts its journal on the date it was received, so correcting it
  // means cancelling and re-keying. Jelly Polly posts no journals at all.
  const canEditPaymentDate = (payment: Payment): boolean => {
    if (payment.status === "cancelled") return false;
    if (payment.is_auto_collection) return false;
    if (
      payment.payment_method === "contra" ||
      payment.payment_method === "overpayment"
    ) {
      return false;
    }
    if (!usesTienHockReceiptAccounting) return true;
    return payment.payment_method === "cheque" && Boolean(payment.receipt_id);
  };

  const handleEditDateClick = (payment: Payment, groupSize: number): void => {
    setDateEditGroupSize(groupSize);
    setDateEditPayment(payment);
    setPaymentDateRange(toDayRange(payment.payment_date));
    setAccountingDateRange(
      !usesTienHockReceiptAccounting && payment.posting_date
        ? toDayRange(payment.posting_date)
        : null
    );
    setPaymentDateError(null);
    setShowDateDialog(true);
  };

  const closeDateDialog = (): void => {
    setShowDateDialog(false);
    setDateEditPayment(null);
    setAccountingDateRange(null);
    setPaymentDateError(null);
  };

  // Keep an accounting date that merely mirrors the payment date (cash, online
  // and bank transfers post on the day they are received) moving with it, while
  // leaving a genuine cheque clearance date alone.
  const handlePaymentDateChange = (range: TimeRange): void => {
    const previousDate: string = format(paymentDateRange.start, "yyyy-MM-dd");
    setPaymentDateRange(range);
    if (
      accountingDateRange &&
      format(accountingDateRange.start, "yyyy-MM-dd") === previousDate
    ) {
      setAccountingDateRange(range);
    }
  };

  const handleSavePaymentDate = async (): Promise<void> => {
    if (!dateEditPayment || savingPaymentDate) return;

    const currentDate: string = toDayString(dateEditPayment.payment_date);
    const nextDate: string = format(paymentDateRange.start, "yyyy-MM-dd");
    const currentAccountingDate: string | null = dateEditPayment.posting_date
      ? toDayString(dateEditPayment.posting_date)
      : null;
    const nextAccountingDate: string | null = accountingDateRange
      ? format(accountingDateRange.start, "yyyy-MM-dd")
      : null;

    if (
      nextDate === currentDate &&
      nextAccountingDate === currentAccountingDate
    ) {
      closeDateDialog();
      return;
    }

    setSavingPaymentDate(true);
    setPaymentDateError(null);
    try {
      if (usesTienHockReceiptAccounting) {
        await api.patch(`/api/receipts/${dateEditPayment.receipt_id}/date`, {
          expected_received_date: currentDate,
          received_date: nextDate,
        });
      } else {
        await api.put(
          `${paymentApiEndpoint}/${dateEditPayment.payment_id}/date`,
          {
            expected_payment_date: currentDate,
            payment_date: nextDate,
            ...(nextAccountingDate &&
            nextAccountingDate !== currentAccountingDate
              ? { posting_date: nextAccountingDate }
              : {}),
          }
        );
      }
      toast.success("Payment date updated.");
      closeDateDialog();
      onRefresh();
    } catch (error: unknown) {
      console.error("Error updating payment date:", error);
      setPaymentDateError(
        error instanceof Error && error.message
          ? error.message
          : "We couldn't update this payment date. Nothing was changed."
      );
    } finally {
      setSavingPaymentDate(false);
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
        apiEndpoint: paymentApiEndpoint,
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
        <span>View Journal</span>
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
      const groupReference: string | null = resolveGroupReference(payment);
      const key: string = groupReference
        ? [
            groupReference,
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
                const groupReference: string | null =
                  resolveGroupReference(groupTemplate);
                const canAddToGroup: boolean = Boolean(
                  onAddPaymentToGroup &&
                    groupReference &&
                    groupTemplate.payment_method !== "contra"
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
                          <div className="flex items-center gap-1.5">
                            <span>{formatDate(firstPayment.payment_date)}</span>
                            {canEditPaymentDate(groupTemplate) && (
                              <button
                                type="button"
                                onClick={() =>
                                  handleEditDateClick(
                                    groupTemplate,
                                    paymentGroup.length
                                  )
                                }
                                className="rounded p-0.5 text-gray-400 transition-colors hover:bg-sky-100 hover:text-sky-700 focus:outline-none focus:ring-2 focus:ring-sky-500 dark:hover:bg-sky-900/50 dark:hover:text-sky-300"
                                title={`Correct the date for all ${paymentGroup.length} payments under ${groupReference}`}
                                aria-label="Correct payment date"
                              >
                                <IconCalendarEvent size={15} stroke={1.75} />
                              </button>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-3 max-w-[150px]">
                          <div className="truncate font-mono font-semibold text-gray-900 dark:text-gray-100" title={groupReference || ''}>
                            {groupReference}
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
                                  title={`Manage payment group ${groupReference}`}
                                >
                                  <IconSettings size={14} stroke={1.75} />
                                  <span>Manage Group</span>
                                </button>
                              )}
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          <span className="inline-flex px-2 py-1 text-xs font-medium rounded-full bg-blue-50 dark:bg-blue-900/50 text-blue-700 dark:text-blue-400 capitalize">
                            {formatPaymentMethodLabel(
                              firstPayment.payment_method
                            )}
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
                              groupReference && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  color="sky"
                                  icon={IconPlus}
                                  onClick={() =>
                                    onAddPaymentToGroup(groupTemplate)
                                  }
                                  title={`Add another payment with reference ${groupReference}`}
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
                                    setClearanceDateRange(createTodayClearanceRange());
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
                              {payment.status !== "cancelled" &&
                                payment.payment_method !== "contra" && (
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
                        <div className="flex items-center gap-1.5">
                          <span>{formatDate(payment.payment_date)}</span>
                          {canEditPaymentDate(payment) && (
                            <button
                              type="button"
                              onClick={() =>
                                handleEditDateClick(
                                  payment,
                                  Number(payment.allocation_count) || 1
                                )
                              }
                              className="rounded p-0.5 text-gray-400 transition-colors hover:bg-sky-100 hover:text-sky-700 focus:outline-none focus:ring-2 focus:ring-sky-500 dark:hover:bg-sky-900/50 dark:hover:text-sky-300"
                              title="Correct payment date"
                              aria-label="Correct payment date"
                            >
                              <IconCalendarEvent size={15} stroke={1.75} />
                            </button>
                          )}
                        </div>
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
                          {formatPaymentMethodLabel(payment.payment_method)}
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
                                setClearanceDateRange(createTodayClearanceRange());
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
                          {payment.status !== "cancelled" &&
                            payment.payment_method !== "contra" && (
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
            setClearanceDateRange(createTodayClearanceRange());
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
                {formatPaymentMethodLabel(selectedPayment.payment_method)} payment of{" "}
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

              {usesTienHockReceiptAccounting &&
              selectedConfirmationIsReceiptBacked ? (
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
              ) : usesTienHockReceiptAccounting ? (
                <div>
                  <label className="mb-1 block text-sm font-medium text-default-700 dark:text-gray-300">
                    Deposit To
                  </label>
                  <PillSelect
                    value={selectedBankAccount}
                    onChange={(value: string): void =>
                      setSelectedBankAccount(value)
                    }
                    options={BANK_ACCOUNT_OPTIONS}
                    disabled={confirmingPaymentId !== null}
                    ariaLabel="Deposit to"
                  size="md"
                  />
                  <p className="mt-1 text-xs text-default-500 dark:text-gray-400">
                    Choose the bank account for this older pending payment.
                  </p>
                </div>
              ) : null}

              {requiresClearanceDate && (
                <div>
                  <label className="mb-1 block text-sm font-medium text-default-700 dark:text-gray-300">
                    Cheque Clearance Date
                  </label>
                  <TimeNavigator
                    range={clearanceDateRange}
                    onChange={(range: TimeRange): void =>
                      setClearanceDateRange(range)
                    }
                    modes={["day"]}
                    presets={false}
                    showArrows={false}
                    size="sm"
                    disabled={confirmingPaymentId !== null}
                    className="w-full"
                    triggerClassName="w-full justify-between"
                  />
                  <p className="mt-1 text-xs text-default-500 dark:text-gray-400">
                    Use the date the bank statement shows the cheque as cleared.
                    {usesTienHockReceiptAccounting
                      ? " This date controls the bank and account-ledger reports."
                      : " This date controls Jelly Polly debtor statements."}
                  </p>
                </div>
              )}

              <p className="text-xs text-default-500 dark:text-gray-400">
                {usesTienHockReceiptAccounting
                  ? "Confirming updates the related invoice balances and creates the payment journal entries."
                  : "Confirming updates the related invoice balance using the clearance date above."}
              </p>
            </div>
          }
          confirmButtonText={
            selectedConfirmationGroupSize > 1
              ? "Confirm Pending Group"
              : "Confirm Payment"
          }
          variant="success"
          allowContentOverflow={requiresClearanceDate}
        />
      )}

      {dateEditPayment && (
        <ConfirmationDialog
          isOpen={showDateDialog}
          onClose={closeDateDialog}
          onConfirm={() => void handleSavePaymentDate()}
          title="Correct payment date"
          message={
            <div className="space-y-3">
              <p>
                Change the date recorded for this{" "}
                {formatPaymentMethodLabel(dateEditPayment.payment_method)}{" "}
                payment of{" "}
                <span className="font-semibold text-default-800 dark:text-gray-100">
                  {formatCurrency(dateEditPayment.amount_paid)}
                </span>
                .
              </p>

              {dateEditGroupSize > 1 && (
                <div className="rounded-lg border border-sky-200 bg-sky-50 p-3 text-sky-800 dark:border-sky-800 dark:bg-sky-900/30 dark:text-sky-200">
                  Reference {dateEditPayment.payment_reference} covers more than
                  one invoice. Every payment under it moves to the new date
                  together, so the group stays on one row.
                </div>
              )}

              <div>
                <label className="mb-1 block text-sm font-medium text-default-700 dark:text-gray-300">
                  Payment Date
                </label>
                <TimeNavigator
                  range={paymentDateRange}
                  onChange={handlePaymentDateChange}
                  modes={["day"]}
                  presets={false}
                  showArrows={false}
                  size="sm"
                  disabled={savingPaymentDate}
                  className="w-full"
                  triggerClassName="w-full justify-between"
                />
              </div>

              {accountingDateRange && (
                <div>
                  <label className="mb-1 block text-sm font-medium text-default-700 dark:text-gray-300">
                    {dateEditPayment.payment_method === "cheque"
                      ? "Cheque Clearance Date"
                      : "Accounting Date"}
                  </label>
                  <TimeNavigator
                    range={accountingDateRange}
                    onChange={(range: TimeRange): void =>
                      setAccountingDateRange(range)
                    }
                    modes={["day"]}
                    presets={false}
                    showArrows={false}
                    size="sm"
                    disabled={savingPaymentDate}
                    className="w-full"
                    triggerClassName="w-full justify-between"
                  />
                  <p className="mt-1 text-xs text-default-500 dark:text-gray-400">
                    This date controls Jelly Polly debtor statements and the
                    account ledger. It cannot be before the payment date.
                  </p>
                </div>
              )}

              {paymentDateError && (
                <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700 dark:border-rose-800 dark:bg-rose-900/30 dark:text-rose-300">
                  {paymentDateError}
                </div>
              )}

              <p className="text-xs text-default-500 dark:text-gray-400">
                {usesTienHockReceiptAccounting
                  ? "Amounts, invoice balances and the posted journal entry are not changed — a cheque is always posted on its clearance date."
                  : "Amounts and invoice balances are not changed."}
              </p>
            </div>
          }
          confirmButtonText={savingPaymentDate ? "Saving..." : "Save Date"}
          variant="success"
          allowContentOverflow
          isConfirming={savingPaymentDate}
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
