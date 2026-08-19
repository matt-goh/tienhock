import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { useTranslation } from "react-i18next";
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
import GreenTargetReceiptDetailsDialog from "./GreenTargetReceiptDetailsDialog";

interface GreenTargetPaymentTableProps {
  payments: GreenTargetPayment[];
  onViewPayment: (payment: GreenTargetPayment) => void;
  onRefresh: () => void | Promise<void>;
  selectedReceiptId: number | null;
  onSelectReceipt: (receiptId: number | null) => void;
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
  selectedReceiptId,
  onSelectReceipt,
}) => {
  const navigate = useNavigate();
  const { t } = useTranslation("greentarget");
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
  const [selectedPaymentGroup, setSelectedPaymentGroup] = useState<
    GreenTargetPayment[]
  >([]);
  const [clearanceDate, setClearanceDate] = useState<string>(
    format(new Date(), "yyyy-MM-dd")
  );

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
    format(new Date(dateString), "dd/MM/yyyy");

  const handleConfirmPayment = async (): Promise<void> => {
    if (!selectedPayment || confirmingPaymentId !== null) {
      return;
    }
    if (!clearanceDate) {
      toast.error(t("Bank clearance / posting date is required"));
      return;
    }

    setConfirmingPaymentId(selectedPayment.payment_id);
    setShowConfirmDialog(false);
    const toastId: string = toast.loading(t("Confirming payment..."));

    try {
      await greenTargetApi.confirmPayment(
        selectedPayment.payment_id,
        clearanceDate
      );
      toast.success(
        selectedPaymentGroup.length > 1
          ? t("Receipt confirmed successfully")
          : t("Payment confirmed successfully"),
        { id: toastId }
      );
      await onRefresh();
    } catch (error: unknown) {
      console.error("Error confirming payment:", error);
      toast.error(
        getApiErrorMessage(error, t("Failed to confirm payment")),
        { id: toastId }
      );
    } finally {
      setConfirmingPaymentId(null);
      setSelectedPayment(null);
      setSelectedPaymentGroup([]);
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
      toast.success(
        selectedPaymentGroup.length > 1
          ? t("Receipt cancelled successfully")
          : t("Payment cancelled successfully")
      );
      await onRefresh();
    } catch (error: unknown) {
      console.error("Error cancelling payment:", error);
      toast.error(
        getApiErrorMessage(error, t("Failed to cancel payment"))
      );
    } finally {
      setCancellingPaymentId(null);
      setSelectedPayment(null);
      setSelectedPaymentGroup([]);
    }
  };

  const openConfirmDialog = (
    payment: GreenTargetPayment,
    paymentGroup: GreenTargetPayment[] = [payment]
  ): void => {
    const today: string = format(new Date(), "yyyy-MM-dd");
    const receivedDate: string = format(
      new Date(payment.payment_date),
      "yyyy-MM-dd"
    );
    setSelectedPayment(payment);
    setSelectedPaymentGroup(paymentGroup);
    setClearanceDate(receivedDate > today ? receivedDate : today);
    setShowConfirmDialog(true);
  };

  const openCancelDialog = (
    payment: GreenTargetPayment,
    paymentGroup: GreenTargetPayment[] = [payment]
  ): void => {
    setSelectedPayment(payment);
    setSelectedPaymentGroup(paymentGroup);
    setShowCancelDialog(true);
  };

  const getStatusBadge = (
    status?: GreenTargetPayment["status"]
  ): React.ReactNode => {
    switch (status) {
      case "pending":
        return (
          <span className="inline-flex rounded-full bg-yellow-100 px-2 py-1 text-xs font-medium text-yellow-700 dark:bg-yellow-900/50 dark:text-yellow-300">
            {t("Pending")}
          </span>
        );
      case "cancelled":
        return (
          <span className="inline-flex rounded-full bg-red-100 px-2 py-1 text-xs font-medium text-red-700 dark:bg-red-900/50 dark:text-red-300">
            {t("Cancelled")}
          </span>
        );
      default:
        return (
          <span className="inline-flex rounded-full bg-green-100 px-2 py-1 text-xs font-medium text-green-700 dark:bg-green-900/50 dark:text-green-300">
            {t("Settled")}
          </span>
        );
    }
  };

  const groupedPayments: Record<string, GreenTargetPayment[]> = payments.reduce(
    (
      groups: Record<string, GreenTargetPayment[]>,
      payment: GreenTargetPayment
    ): Record<string, GreenTargetPayment[]> => {
      const groupKey: string = payment.receipt_id
        ? `receipt_${payment.receipt_id}`
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

      const firstDate: string = format(
        new Date(firstGroup[0].payment_date),
        "yyyy-MM-dd"
      );
      const secondDate: string = format(
        new Date(secondGroup[0].payment_date),
        "yyyy-MM-dd"
      );
      return secondDate.localeCompare(firstDate);
    }
  );
  const selectedPaymentTotal: number = selectedPaymentGroup.reduce(
    (sum: number, payment: GreenTargetPayment): number =>
      sum + Number(payment.amount_paid || 0),
    0
  );

  const renderPaymentActions = (
    payment: GreenTargetPayment,
    paymentGroup: GreenTargetPayment[] = [payment]
  ): React.ReactNode => (
    <div className="flex justify-center gap-1">
      {payment.status === "pending" && (
        <Button
          type="button"
          size="sm"
          variant="outline"
          color="sky"
          onClick={(): void => openConfirmDialog(payment, paymentGroup)}
          disabled={
            confirmingPaymentId === payment.payment_id ||
            cancellingPaymentId === payment.payment_id
          }
          title={t("Confirm Payment")}
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
          onClick={(): void => openCancelDialog(payment, paymentGroup)}
          disabled={
            cancellingPaymentId === payment.payment_id ||
            confirmingPaymentId === payment.payment_id
          }
          title={t("Cancel Payment")}
        >
          <IconBan size={16} />
        </Button>
      )}
    </div>
  );

  // A pre-cutover receipt owns no journal: its money is already inside the
  // imported Jan-Jun ledger, in the CD_SD counter-cash leg of the invoice's
  // own '#/#' journal. Link there so cash collections are traceable too.
  const renderJournalLink = (
    payment: GreenTargetPayment
  ): React.ReactNode => {
    const journalEntryId: number | null =
      payment.journal_entry_id ?? payment.imported_journal_entry_id ?? null;

    if (!journalEntryId) {
      return (
        <span
          className="text-xs text-gray-400 dark:text-gray-500"
          title={t(
            "This collection predates the imported ledger, so it sits inside the opening balances rather than a journal entry."
          )}
        >
          -
        </span>
      );
    }

    const isImported: boolean = !payment.journal_entry_id;

    return (
      <button
        type="button"
        onClick={(): void =>
          navigate(`/greentarget/accounting/journal-entries/${journalEntryId}`)
        }
        className="inline-flex items-center gap-1 text-xs text-sky-600 hover:text-sky-800 hover:underline dark:text-sky-400 dark:hover:text-sky-300"
                title={
          isImported
            ? t(
                "Collected in the imported ledger, inside entry {{reference}} — click to view it",
                {
                  reference:
                    payment.imported_journal_reference ?? journalEntryId,
                }
              )
            : t("View journal entry")
        }
      >
        <IconReceipt size={14} />
        <span>{t("View Journal")}</span>
        {isImported && (
          <span className="rounded-full bg-amber-100 px-1.5 py-px text-[10px] font-medium text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
            {t("Imported")}
          </span>
        )}
      </button>
    );
  };

  const receiptDetailsDialog: React.ReactNode = (
    <GreenTargetReceiptDetailsDialog
      receiptId={selectedReceiptId}
      isOpen={selectedReceiptId !== null}
      onClose={(): void => onSelectReceipt(null)}
      onChanged={onRefresh}
    />
  );

  if (payments.length === 0) {
    return (
      <>
        <div className="rounded-xl border border-gray-200 bg-white p-8 text-center shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <p className="text-gray-500 dark:text-gray-400">
            {t("No payments found for the selected filters.")}
          </p>
        </div>
        {receiptDetailsDialog}
      </>
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
                <th className={`${tableHeaderClassName} text-left`}>
                  {t("Date Received")}
                </th>
                <th className={`${tableHeaderClassName} text-left`}>
                  {t("GT Reference No.")}
                </th>
                <th className={`${tableHeaderClassName} text-left`}>
                  {t("Cheque / Transaction Ref")}
                </th>
                <th className={`${tableHeaderClassName} text-left`}>
                  {t("Invoice(s)")}
                </th>
                <th className={`${tableHeaderClassName} text-left`}>
                  {t("Customer")}
                </th>
                <th className={`${tableHeaderClassName} text-left`}>
                  {t("Method")}
                </th>
                <th className={`${tableHeaderClassName} text-left`}>
                  {t("Status")}
                </th>
                <th className={`${tableHeaderClassName} text-left`}>
                  {t("Journal Entry")}
                </th>
                <th className={`${tableHeaderClassName} text-right`}>
                  {t("Amount")}
                </th>
                <th className={`${tableHeaderClassName} text-center`}>
                  {t("Actions")}
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
                            <button
                              type="button"
                              onClick={(): void => {
                                if (firstPayment.receipt_id) {
                                  onSelectReceipt(firstPayment.receipt_id);
                                }
                              }}
                              disabled={!firstPayment.receipt_id}
                              className="block max-w-full truncate font-mono font-semibold text-sky-700 hover:underline disabled:cursor-default disabled:text-gray-900 disabled:no-underline dark:text-sky-300 dark:disabled:text-gray-100"
                              title={
                                firstPayment.receipt_id
                                  ? t("View the complete receipt group")
                                  : firstPayment.internal_reference || ""
                              }
                            >
                              {firstPayment.internal_reference || "-"}
                            </button>
                            <span className="mt-1 inline-flex rounded-full bg-sky-100 px-2 py-0.5 text-xs font-medium text-sky-700 dark:bg-sky-900/50 dark:text-sky-300">
                              {t("{{count}} invoices", {
                                count: paymentGroup.length,
                              })}
                            </span>
                          </td>
                          <td className="max-w-[180px] px-3 py-3 font-mono text-sm text-gray-600 dark:text-gray-400">
                            <span
                              className="block truncate"
                              title={firstPayment.payment_reference || ""}
                            >
                              {firstPayment.payment_reference || "-"}
                            </span>
                          </td>
                          <td
                            className="px-3 py-3 text-sm text-gray-500 dark:text-gray-400"
                            colSpan={2}
                          >
                            {t("Multiple invoices")}
                          </td>
                          <td className="px-3 py-3">
                            <span className="inline-flex rounded-full bg-blue-50 px-2 py-1 text-xs font-medium capitalize text-blue-700 dark:bg-blue-900/50 dark:text-blue-300">
                              {t(
                                firstPayment.payment_method.replace("_", " ")
                              )}
                            </span>
                          </td>
                          <td className="px-3 py-3">
                            {getStatusBadge(groupStatus)}
                          </td>
                          <td className="whitespace-nowrap px-3 py-3">
                            {renderJournalLink(firstPayment)}
                          </td>
                          <td className="px-3 py-3 text-right font-medium text-green-600 dark:text-green-400">
                            {formatCurrency(totalAmount)}
                          </td>
                          <td className="px-3 py-3 text-center">
                            {renderPaymentActions(
                              firstPayment,
                              paymentGroup
                            )}
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
                                    {t("Grouped invoice")}
                                  </span>
                                </td>
                                <td className="px-3 py-3" />
                                <td className="px-3 py-3" />
                                <td className="px-3 py-3">
                                  <button
                                    type="button"
                                    onClick={(): void =>
                                      onViewPayment(payment)
                                    }
                                    className="inline-flex rounded-md bg-sky-50 px-2 py-1 font-mono text-sm font-medium text-sky-700 hover:bg-sky-100 hover:text-sky-800 dark:bg-sky-900/30 dark:text-sky-300 dark:hover:bg-sky-900/50 dark:hover:text-sky-200"
                                  >
                                    {payment.invoice_number || payment.invoice_id}
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
                                <td className="px-3 py-3 text-center text-sm text-gray-400 dark:text-gray-500">
                                  -
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
                        <button
                          type="button"
                          onClick={(): void => {
                            if (firstPayment.receipt_id) {
                              onSelectReceipt(firstPayment.receipt_id);
                            }
                          }}
                          disabled={!firstPayment.receipt_id}
                          className="block max-w-full truncate font-mono text-sm text-sky-700 hover:underline disabled:cursor-default disabled:text-gray-600 disabled:no-underline dark:text-sky-300 dark:disabled:text-gray-400"
                          title={
                            firstPayment.receipt_id
                              ? t("View the complete receipt group")
                              : firstPayment.internal_reference || ""
                          }
                        >
                          {firstPayment.internal_reference || "-"}
                        </button>
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 font-mono text-sm text-gray-500 dark:text-gray-400">
                        {firstPayment.payment_reference || "-"}
                      </td>
                      <td className="px-3 py-3">
                        <button
                          type="button"
                          onClick={(): void => onViewPayment(firstPayment)}
                          className="inline-flex rounded-md bg-sky-50 px-2 py-1 font-mono text-sm font-medium text-sky-700 hover:bg-sky-100 hover:text-sky-800 dark:bg-sky-900/30 dark:text-sky-300 dark:hover:bg-sky-900/50 dark:hover:text-sky-200"
                        >
                          {firstPayment.invoice_number || firstPayment.invoice_id}
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
                          {t(firstPayment.payment_method.replace("_", " "))}
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
            setSelectedPaymentGroup([]);
          }}
          onConfirm={(): void => {
            void handleConfirmPayment();
          }}
          title={
            selectedPaymentGroup.length > 1
              ? t("Confirm pending receipt?")
              : t("Confirm pending payment?")
          }
          message={
            <div className="space-y-3">
              {selectedPaymentGroup.length > 1 ? (
                <p>
                  {t(
                    "Confirm the pending {{method}} payment of {{amount}} across {{count}} invoices?",
                    {
                      method: selectedPayment.payment_method.replace("_", " "),
                      amount: formatCurrency(selectedPaymentTotal),
                      count: selectedPaymentGroup.length,
                    }
                  )}
                </p>
              ) : (
                <p>
                  {t(
                    "Confirm the pending {{method}} payment of {{amount}}?",
                    {
                      method: selectedPayment.payment_method.replace("_", " "),
                      amount: formatCurrency(selectedPaymentTotal),
                    }
                  )}
                </p>
              )}
              <p className="text-xs text-default-500 dark:text-gray-400">
                {t(
                  "Confirming updates all related invoice balances and creates one consolidated PBB_1 receipt journal."
                )}
              </p>
              <div>
                <label
                  htmlFor="gt-clearance-date"
                  className="mb-1 block text-xs font-medium text-default-600 dark:text-gray-300"
                >
                  {t("Bank clearance / posting date")}
                </label>
                <input
                  id="gt-clearance-date"
                  type="date"
                  value={clearanceDate}
                  min={
                    selectedPayment.payment_date
                      ? format(
                          new Date(selectedPayment.payment_date),
                          "yyyy-MM-dd"
                        )
                      : undefined
                  }
                  onChange={(event: React.ChangeEvent<HTMLInputElement>): void =>
                    setClearanceDate(event.target.value)
                  }
                  required
                  className="w-full rounded-lg border border-default-300 bg-white px-3 py-2 text-sm text-default-900 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                />
              </div>
            </div>
          }
          confirmButtonText={
            selectedPaymentGroup.length > 1
              ? t("Confirm Receipt")
              : t("Confirm Payment")
          }
          variant="success"
        />
      )}

      <ConfirmationDialog
        isOpen={showCancelDialog}
        onClose={(): void => {
          setShowCancelDialog(false);
          setSelectedPayment(null);
          setSelectedPaymentGroup([]);
        }}
        onConfirm={handleCancelPayment}
        title={
          selectedPaymentGroup.length > 1
            ? t("Cancel Receipt")
            : t("Cancel Payment")
        }
        message={
          <div className="space-y-2">
            {selectedPaymentGroup.length > 1 ? (
              <p>
                {t(
                  "Are you sure you want to cancel this payment of {{amount}} across {{count}} invoices?",
                  {
                    amount: formatCurrency(selectedPaymentTotal),
                    count: selectedPaymentGroup.length,
                  }
                )}
              </p>
            ) : (
              <p>
                {t(
                  "Are you sure you want to cancel this payment of {{amount}}?",
                  { amount: formatCurrency(selectedPaymentTotal) }
                )}
              </p>
            )}
            {selectedPayment?.status === "pending" && (
              <p className="text-xs text-default-500 dark:text-gray-400">
                {t(
                  "This pending payment has not reduced the invoice balance, so cancelling it will leave that balance unchanged."
                )}
              </p>
            )}
          </div>
        }
        confirmButtonText={
          selectedPaymentGroup.length > 1
            ? t("Cancel Receipt")
            : t("Cancel Payment")
        }
        variant="danger"
      />

      {receiptDetailsDialog}
    </>
  );
};

export default GreenTargetPaymentTable;
