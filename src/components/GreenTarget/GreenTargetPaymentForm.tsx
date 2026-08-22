import React, { useCallback, useEffect, useRef, useState } from "react";
import { format } from "date-fns";
import { useTranslation } from "react-i18next";
import { IconTrash, IconX } from "@tabler/icons-react";
import toast from "react-hot-toast";
import { greenTargetApi } from "../../routes/greentarget/api";
import {
  CreateGreenTargetPaymentBatchInput,
  GreenTargetInvoice,
  GreenTargetPayment,
} from "../../types/greenTargetTypes";
import Button from "../Button";
import ConfirmationDialog from "../ConfirmationDialog";
import { FormInput } from "../FormComponents";
import PillSelect, { PillSelectOption } from "../PillSelect";
import TimeNavigator, { type TimeRange } from "../TimeNavigator";
import GreenTargetInvoiceSelectionTable from "./GreenTargetInvoiceSelectionTable";
import GTReceiptJoinPanel, {
  type GTReceiptJoinConfirmation,
  type GTReceiptJoinLookupState,
  useGTReceiptJoinConfirmation,
  useGTReceiptJoinLookup,
} from "./GTReceiptJoinPanel";

const PAYMENT_METHOD_OPTIONS: ReadonlyArray<PillSelectOption<string>> = [
  { value: "cash", label: "Cash" },
  { value: "cheque", label: "Cheque" },
  { value: "bank_transfer", label: "Bank Transfer" },
  { value: "online", label: "Online" },
];

interface GreenTargetPaymentFormProps {
  payment: GreenTargetPayment | null;
  onClose: () => void;
  onSuccess: (paymentDate: string) => void;
  dateRange: {
    start: Date | null;
    end: Date | null;
  };
}

interface InvoicePaymentAllocation {
  invoice: GreenTargetInvoice;
  amountToPay: number;
}

interface PaymentFormData {
  payment_date: string;
  payment_method: GreenTargetPayment["payment_method"];
  internal_reference: string;
  payment_reference: string;
}

interface ApiErrorShape {
  message?: string;
  error?: string;
  data?: {
    message?: string;
    error?: string;
  };
  response?: {
    data?: {
      message?: string;
      error?: string;
    };
  };
}

const getInitialInvoiceDateRange = (): TimeRange => {
  const end: Date = new Date();
  end.setHours(23, 59, 59, 999);

  const start: Date = new Date(end);
  start.setFullYear(start.getFullYear() - 1);
  start.setHours(0, 0, 0, 0);

  return { start, end };
};

// A receipt's stored date is a timestamp, so it must go through date-fns
// rather than an ISO substring, which would land on the previous day in KL.
const toLocalDateInputValue = (value: string | null): string => {
  if (!value) return "";
  const parsed: Date = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "" : format(parsed, "yyyy-MM-dd");
};

const getPaymentDateRange = (value: string): TimeRange => {
  const match: RegExpMatchArray | null = value.match(
    /^(\d{4})-(\d{2})-(\d{2})$/
  );
  const start: Date = match
    ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
    : new Date();
  start.setHours(0, 0, 0, 0);

  const end: Date = new Date(start);
  end.setHours(23, 59, 59, 999);
  return { start, end };
};

const getApiErrorMessage = (error: unknown): string => {
  if (typeof error !== "object" || error === null) {
    return "Failed to record payment";
  }

  const apiError: ApiErrorShape = error as ApiErrorShape;
  return (
    apiError.response?.data?.message ||
    apiError.data?.message ||
    apiError.message ||
    apiError.response?.data?.error ||
    apiError.data?.error ||
    apiError.error ||
    "Failed to record payment"
  );
};

const GreenTargetPaymentForm: React.FC<GreenTargetPaymentFormProps> = ({
  onClose,
  onSuccess,
}) => {
  const { t } = useTranslation("greentarget");
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [loadingInvoices, setLoadingInvoices] = useState<boolean>(false);
  const [availableInvoices, setAvailableInvoices] = useState<
    GreenTargetInvoice[]
  >([]);
  const [invoiceDateRange, setInvoiceDateRange] = useState<TimeRange>(
    getInitialInvoiceDateRange
  );
  const [selectedInvoices, setSelectedInvoices] = useState<
    InvoicePaymentAllocation[]
  >([]);
  const [searchTerm, setSearchTerm] = useState<string>("");
  const invoiceRequestIdRef = useRef<number>(0);

  const [formData, setFormData] = useState<PaymentFormData>({
    payment_date: format(new Date(), "yyyy-MM-dd"),
    payment_method: "cash",
    internal_reference: "",
    payment_reference: "",
  });

  // One receipt can settle several invoices, so a re-used Green Target
  // reference here usually means these invoices belong to a banking event that
  // was already keyed. The invoice id is deliberately not passed: this form
  // pays many invoices at once and the server checks each one on save.
  const paymentReceiptLookup: GTReceiptJoinLookupState = useGTReceiptJoinLookup(
    formData.internal_reference,
    true
  );
  const paymentReceiptJoin: GTReceiptJoinConfirmation =
    useGTReceiptJoinConfirmation(paymentReceiptLookup);
  const joinedReceipt = paymentReceiptJoin.confirmedReceipt;
  const effectivePaymentMethod: GreenTargetPayment["payment_method"] =
    joinedReceipt ? joinedReceipt.payment_method : formData.payment_method;

  // Advance payment prompt: the received date is earlier than a selected
  // invoice's date and the user must confirm before the server allows it.
  const [advancePaymentPrompt, setAdvancePaymentPrompt] = useState<{
    invoiceNumber: string;
    invoiceDate: string;
    paymentDate: string;
  } | null>(null);

  const fetchUnpaidInvoices = useCallback(async (): Promise<void> => {
    const requestId: number = invoiceRequestIdRef.current + 1;
    invoiceRequestIdRef.current = requestId;
    setLoadingInvoices(true);

    try {
      const [invoicesResponse, paymentsResponse] = await Promise.all([
        greenTargetApi.getInvoices({
          start_date: format(invoiceDateRange.start, "yyyy-MM-dd"),
          end_date: format(invoiceDateRange.end, "yyyy-MM-dd"),
          status: "active,overdue",
        }),
        greenTargetApi.getPayments({ includeCancelled: false }),
      ]);

      const invoices: GreenTargetInvoice[] = Array.isArray(invoicesResponse)
        ? (invoicesResponse as GreenTargetInvoice[])
        : [];
      const payments: GreenTargetPayment[] = Array.isArray(paymentsResponse)
        ? (paymentsResponse as GreenTargetPayment[])
        : [];
      const invoicesWithPendingPayments: Set<string> = new Set(
        payments
          .filter(
            (candidatePayment: GreenTargetPayment): boolean =>
              candidatePayment.status === "pending"
          )
          .map((candidatePayment: GreenTargetPayment): string =>
            String(candidatePayment.invoice_id)
          )
      );
      const filteredInvoices: GreenTargetInvoice[] = invoices.filter(
        (invoice: GreenTargetInvoice): boolean =>
          !invoicesWithPendingPayments.has(String(invoice.invoice_id)) &&
          Number(invoice.current_balance) > 0
      );

      if (requestId === invoiceRequestIdRef.current) {
        setAvailableInvoices(filteredInvoices);
      }
    } catch (error: unknown) {
      console.error("Error fetching unpaid invoices:", error);
      if (requestId === invoiceRequestIdRef.current) {
        setAvailableInvoices([]);
        toast.error(t("Failed to fetch unpaid invoices"));
      }
    } finally {
      if (requestId === invoiceRequestIdRef.current) {
        setLoadingInvoices(false);
      }
    }
  }, [invoiceDateRange]);

  useEffect((): void => {
    void fetchUnpaidInvoices();
  }, [fetchUnpaidInvoices]);

  const totalPaymentAmount: number = selectedInvoices.reduce(
    (sum: number, item: InvoicePaymentAllocation): number =>
      sum + item.amountToPay,
    0
  );
  const hasInvalidAllocation: boolean = selectedInvoices.some(
    ({ invoice, amountToPay }: InvoicePaymentAllocation): boolean =>
      !Number.isFinite(amountToPay) ||
      amountToPay <= 0 ||
      amountToPay > Number(invoice.current_balance)
  );

  const processPayments = async (
    allowAdvancePayment: boolean = false
  ): Promise<void> => {
    setIsSubmitting(true);
    const toastId: string = toast.loading(t("Processing payment..."));

    try {
      const paymentReference: string = formData.payment_reference.trim();
      // A joined receipt owns the banking event; its date, method and cheque /
      // transaction reference are sent back as they are and the server uses the
      // header's values regardless.
      const paymentData: CreateGreenTargetPaymentBatchInput = {
        payment_date: joinedReceipt
          ? format(new Date(joinedReceipt.received_date), "yyyy-MM-dd")
          : formData.payment_date,
        payment_method: effectivePaymentMethod,
        payment_reference: joinedReceipt
          ? joinedReceipt.payment_reference || null
          : effectivePaymentMethod === "cheque"
          ? paymentReference || null
          : null,
        internal_reference: formData.internal_reference.trim(),
        allocations: selectedInvoices.map(
          ({ invoice, amountToPay }: InvoicePaymentAllocation) => ({
            invoice_id: invoice.invoice_id,
            amount_paid: amountToPay,
          })
        ),
        ...(joinedReceipt ? { receipt_id: joinedReceipt.receipt_id } : {}),
        ...(allowAdvancePayment ? { allow_advance_payment: true } : {}),
      };
      await greenTargetApi.createPaymentBatch(paymentData);

      toast.success(
        joinedReceipt
          ? t(
              "{{count}} invoice/invoices added to receipt {{reference}}",
              {
                count: selectedInvoices.length,
                reference: joinedReceipt.display_reference,
              }
            )
          : selectedInvoices.length === 1
          ? t("Payment recorded successfully")
          : t("Payments recorded for {{count}} invoices", {
              count: selectedInvoices.length,
            }),
        { id: toastId, duration: 6000 }
      );
      onSuccess(formData.payment_date);
    } catch (error: unknown) {
      console.error("Error creating payment:", error);
      toast.error(t(getApiErrorMessage(error)), { id: toastId });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmit = async (
    event: React.FormEvent<HTMLFormElement>
  ): Promise<void> => {
    event.preventDefault();

    if (isSubmitting) {
      return;
    }

    if (selectedInvoices.length === 0) {
      toast.error(t("Please select at least one invoice to pay"));
      return;
    }

    const invalidAllocation: InvoicePaymentAllocation | undefined =
      selectedInvoices.find(
        ({ invoice, amountToPay }: InvoicePaymentAllocation): boolean =>
          !Number.isFinite(amountToPay) ||
          amountToPay <= 0 ||
          Math.abs(amountToPay * 100 - Math.round(amountToPay * 100)) >
            0.0000001 ||
          amountToPay > Number(invoice.current_balance)
      );

    if (invalidAllocation) {
      const invoiceBalance: number = Number(
        invalidAllocation.invoice.current_balance
      );
      if (invalidAllocation.amountToPay > invoiceBalance) {
        toast.error(
          t("Payment for invoice {{number}} cannot exceed {{amount}}", {
            number: invalidAllocation.invoice.invoice_number,
            amount: formatCurrency(invoiceBalance),
          })
        );
      } else {
        toast.error(
          t(
            "Enter a payment amount of at least RM0.01 using no more than two decimal places for invoice {{number}}",
            { number: invalidAllocation.invoice.invoice_number }
          )
        );
      }
      return;
    }

    if (!formData.internal_reference.trim()) {
      toast.error(t("Green Target reference number is required"));
      return;
    }
    if (formData.internal_reference.trim().length > 50) {
      toast.error(
        t("Green Target reference number cannot exceed 50 characters")
      );
      return;
    }
    if (formData.payment_reference.trim().length > 50) {
      toast.error(t("Cheque number cannot exceed 50 characters"));
      return;
    }
    if (paymentReceiptLookup.isLooking) {
      toast.error(t("Wait for the Green Target reference check to finish"));
      return;
    }
    if (paymentReceiptLookup.receipt && !joinedReceipt) {
      toast.error(
        paymentReceiptLookup.joinable
          ? t("Confirm that these payments belong to the existing receipt")
          : t("This Green Target reference cannot accept another payment")
      );
      return;
    }

    // Advance payment: a received date earlier than a selected invoice's
    // date needs an explicit confirmation before the server accepts it.
    const effectivePaymentDate: string = joinedReceipt
      ? toLocalDateInputValue(joinedReceipt.received_date)
      : formData.payment_date;
    const advanceInvoice: GreenTargetInvoice | undefined = effectivePaymentDate
      ? selectedInvoices
          .map(
            (item: InvoicePaymentAllocation): GreenTargetInvoice =>
              item.invoice
          )
          .find((invoice: GreenTargetInvoice): boolean => {
            const invoiceDate: string = toLocalDateInputValue(
              invoice.date_issued
            );
            return Boolean(invoiceDate) && effectivePaymentDate < invoiceDate;
          })
      : undefined;
    if (advanceInvoice) {
      setAdvancePaymentPrompt({
        invoiceNumber: advanceInvoice.invoice_number,
        invoiceDate: toLocalDateInputValue(advanceInvoice.date_issued),
        paymentDate: effectivePaymentDate,
      });
      return;
    }

    await processPayments();
  };

  const handleInvoiceSelect = (invoice: GreenTargetInvoice): void => {
    setSelectedInvoices(
      (
        currentInvoices: InvoicePaymentAllocation[]
      ): InvoicePaymentAllocation[] => {
        const alreadySelected: boolean = currentInvoices.some(
          (item: InvoicePaymentAllocation): boolean =>
            item.invoice.invoice_id === invoice.invoice_id
        );
        return alreadySelected
          ? currentInvoices
          : [
              ...currentInvoices,
              { invoice, amountToPay: Number(invoice.current_balance) },
            ];
      }
    );
  };

  const handleInvoiceRemove = (invoiceId: string): void => {
    setSelectedInvoices(
      (
        currentInvoices: InvoicePaymentAllocation[]
      ): InvoicePaymentAllocation[] =>
        currentInvoices.filter(
          (item: InvoicePaymentAllocation): boolean =>
            String(item.invoice.invoice_id) !== invoiceId
        )
    );
  };

  const handleAmountChange = (invoiceId: string, amount: number): void => {
    setSelectedInvoices(
      (
        currentInvoices: InvoicePaymentAllocation[]
      ): InvoicePaymentAllocation[] =>
        currentInvoices.map(
          (item: InvoicePaymentAllocation): InvoicePaymentAllocation =>
            String(item.invoice.invoice_id) === invoiceId
              ? { ...item, amountToPay: amount }
              : item
        )
    );
  };

  const handlePaymentDateChange = (range: TimeRange): void => {
    setFormData((currentFormData: PaymentFormData): PaymentFormData => ({
      ...currentFormData,
      payment_date: format(range.start, "yyyy-MM-dd"),
    }));
  };

  const handleInvoiceDateRangeChange = (range: TimeRange): void => {
    setInvoiceDateRange(range);
  };

  const formatCurrency = (amount: number): string =>
    amount.toLocaleString("en-MY", {
      style: "currency",
      currency: "MYR",
    });

  const normalizedSearchTerm: string = searchTerm.trim().toLowerCase();
  const filteredInvoices: GreenTargetInvoice[] = availableInvoices.filter(
    (invoice: GreenTargetInvoice): boolean =>
      !normalizedSearchTerm ||
      invoice.invoice_number.toLowerCase().includes(normalizedSearchTerm) ||
      (invoice.customer_name || "")
        .toLowerCase()
        .includes(normalizedSearchTerm) ||
      String(invoice.customer_id).toLowerCase().includes(normalizedSearchTerm)
  );
  const paymentDateRange: TimeRange = getPaymentDateRange(
    joinedReceipt
      ? toLocalDateInputValue(joinedReceipt.received_date) ||
          formData.payment_date
      : formData.payment_date
  );

  return (
    <div className="fixed inset-0 z-50 flex bg-black/55 sm:p-3">
      <div className="flex h-full w-full flex-col overflow-hidden bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-900 sm:rounded-xl sm:border sm:border-gray-200">
        <div className="flex flex-shrink-0 items-center justify-end border-b border-gray-200 px-2 py-1 dark:border-gray-700 sm:px-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-shrink-0 rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:text-gray-500 dark:hover:bg-gray-800 dark:hover:text-gray-300"
            disabled={isSubmitting}
            aria-label={t("Close payment form")}
          >
            <IconX size={20} />
          </button>
        </div>

        <form
          onSubmit={handleSubmit}
          className="flex min-h-0 flex-1 flex-col"
        >
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain lg:grid lg:grid-cols-[minmax(340px,0.82fr)_minmax(560px,1.55fr)] lg:overflow-hidden">
            <div className="space-y-4 px-4 py-4 [scrollbar-gutter:stable] lg:min-h-0 lg:overflow-y-auto lg:px-5 lg:py-5">
              <section className="rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-900">
                <div className="border-b border-gray-200 px-4 py-3 dark:border-gray-700">
                  <h4 className="font-semibold text-gray-900 dark:text-gray-100">
                    {t("Payment details")}
                  </h4>
                  <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                    {t("Date, payment method and reference information.")}
                  </p>
                </div>
                <div className="space-y-4 p-4">
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-200">
                      {t("Date Received")}{" "}
                      <span className="text-red-500">*</span>
                    </label>
                    <TimeNavigator
                      range={paymentDateRange}
                      onChange={handlePaymentDateChange}
                      modes={["day"]}
                      presets={false}
                      allowFuture
                      disabled={isSubmitting || joinedReceipt !== null}
                      className="flex w-full"
                      triggerClassName="min-w-0 flex-1 justify-between"
                    />
                  </div>
                  <FormInput
                    name="internal_reference"
                    label={t("Green Target Reference No.")}
                    placeholder={t("e.g. RV26/06/62")}
                    value={formData.internal_reference}
                    onChange={(
                      event: React.ChangeEvent<HTMLInputElement>
                    ): void =>
                      setFormData(
                        (currentFormData: PaymentFormData): PaymentFormData => ({
                          ...currentFormData,
                          internal_reference: event.target.value,
                        })
                      )
                    }
                    disabled={isSubmitting}
                    required
                  />
                  <GTReceiptJoinPanel
                    lookup={paymentReceiptLookup}
                    joinConfirmed={paymentReceiptJoin.joinConfirmed}
                    onJoinConfirmedChange={paymentReceiptJoin.setJoinConfirmed}
                    disabled={isSubmitting}
                  />
                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-default-700 dark:text-gray-200 truncate">
                      {t("Payment Method")}
                    </label>
                    <PillSelect<string>
                      value={effectivePaymentMethod}
                      onChange={(value: string): void =>
                        setFormData(
                          (
                            currentFormData: PaymentFormData
                          ): PaymentFormData => ({
                            ...currentFormData,
                            payment_method:
                              value as GreenTargetPayment["payment_method"],
                            // Only a cheque carries a reference now.
                            payment_reference:
                              value === "cheque"
                                ? currentFormData.payment_reference
                                : "",
                          })
                        )
                      }
                      options={PAYMENT_METHOD_OPTIONS.map((option) => ({
                        value: option.value,
                        label: t(option.label),
                      }))}
                      disabled={isSubmitting || joinedReceipt !== null}
                      ariaLabel={t("Payment method")}
                    size="md"
                    />
                  </div>
                  {/* Cheque only: the number is how a cheque is matched to the
                      bank statement when it clears. Online and bank transfers
                      are identified by their RV number — no incoming payment in
                      the Jan-Jun legacy ledger carries a transaction id. */}
                  {effectivePaymentMethod === "cheque" && (
                    <FormInput
                      name="payment_reference"
                      label={t("Cheque No. (Optional)")}
                      placeholder={t("Cheque Number")}
                      value={
                        joinedReceipt
                          ? joinedReceipt.payment_reference || ""
                          : formData.payment_reference
                      }
                      onChange={(
                        event: React.ChangeEvent<HTMLInputElement>
                      ): void =>
                        setFormData(
                          (
                            currentFormData: PaymentFormData
                          ): PaymentFormData => ({
                            ...currentFormData,
                            payment_reference: event.target.value,
                          })
                        )
                      }
                      disabled={isSubmitting || joinedReceipt !== null}
                    />
                  )}
                </div>
              </section>

              <section className="rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-900">
                <div className="flex items-center gap-2 border-b border-gray-200 px-4 py-3 dark:border-gray-700">
                  <h4 className="font-semibold text-gray-900 dark:text-gray-100">
                    {t("Selected invoices")}
                  </h4>
                  <span className="inline-flex min-w-6 items-center justify-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                    {selectedInvoices.length}
                  </span>
                </div>

                {selectedInvoices.length === 0 ? (
                  <div className="px-4 py-8 text-center">
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-200">
                      {t("No invoices selected")}
                    </p>
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      {t(
                        "Use the invoice browser to add one or more unpaid invoices."
                      )}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2 p-3">
                    {selectedInvoices.map(
                      ({
                        invoice,
                        amountToPay,
                      }: InvoicePaymentAllocation): React.ReactNode => {
                        const invoiceBalance: number = Number(
                          invoice.current_balance
                        );
                        const isInvalidAmount: boolean =
                          !Number.isFinite(amountToPay) || amountToPay <= 0;
                        const isAboveBalance: boolean =
                          amountToPay > invoiceBalance;

                        return (
                          <div
                            key={invoice.invoice_id}
                            className={`rounded-lg border p-3 transition-colors ${
                              isInvalidAmount || isAboveBalance
                                ? "border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/30"
                                : "border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800/60"
                            }`}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <span className="inline-flex rounded-md bg-sky-50 px-2 py-1 font-mono text-sm font-medium text-sky-700 dark:bg-sky-900/40 dark:text-sky-300">
                                  {invoice.invoice_number}
                                </span>
                                <p className="mt-1.5 truncate text-sm text-gray-700 dark:text-gray-200">
                                  {invoice.customer_name || invoice.customer_id}
                                  {invoice.customer_name
                                    ? ` (${invoice.customer_id})`
                                    : ""}
                                </p>
                              </div>
                              <button
                                type="button"
                                onClick={(): void =>
                                  handleInvoiceRemove(
                                    String(invoice.invoice_id)
                                  )
                                }
                                className="flex-shrink-0 rounded-md p-2 text-red-500 hover:bg-red-100 hover:text-red-700 dark:hover:bg-red-900/40"
                                disabled={isSubmitting}
                                aria-label={t("Remove invoice {{number}}", {
                                  number: invoice.invoice_number,
                                })}
                              >
                                <IconTrash size={16} />
                              </button>
                            </div>

                            <div className="mt-3 grid grid-cols-[minmax(0,1fr)_minmax(120px,0.8fr)] items-end gap-3 border-t border-gray-200 pt-3 dark:border-gray-700">
                              <div>
                                <span className="block text-[11px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                                  {t("Balance Due")}
                                </span>
                                <span className="mt-1 block text-sm font-semibold text-gray-900 dark:text-gray-100">
                                  {formatCurrency(invoiceBalance)}
                                </span>
                              </div>
                              <label>
                                <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                                  {t("Payment amount")}
                                </span>
                                <input
                                  type="number"
                                  step="0.01"
                                  min="0.01"
                                  max={invoiceBalance}
                                  value={amountToPay}
                                  onChange={(
                                    event: React.ChangeEvent<HTMLInputElement>
                                  ): void =>
                                    handleAmountChange(
                                      String(invoice.invoice_id),
                                      event.target.value === ""
                                        ? 0
                                        : Number(event.target.value)
                                    )
                                  }
                                  inputMode="decimal"
                                  aria-invalid={
                                    isInvalidAmount || isAboveBalance
                                  }
                                  className={`w-full rounded-lg border px-3 py-2 text-right text-sm font-medium focus:outline-none focus:ring-1 focus:ring-sky-500 dark:text-gray-100 ${
                                    isInvalidAmount || isAboveBalance
                                      ? "border-red-400 bg-red-50 dark:border-red-600 dark:bg-red-950/40"
                                      : "border-gray-300 bg-white dark:border-gray-600 dark:bg-gray-900"
                                  }`}
                                  disabled={isSubmitting}
                                />
                              </label>
                            </div>

                            {isInvalidAmount && (
                              <p className="mt-2 text-xs font-medium text-red-600 dark:text-red-400">
                                {t("Enter an amount above RM0.")}
                              </p>
                            )}
                            {isAboveBalance && (
                              <p className="mt-2 text-xs font-medium text-red-600 dark:text-red-400">
                                {t("Payment cannot exceed the invoice balance.")}
                              </p>
                            )}
                          </div>
                        );
                      }
                    )}
                  </div>
                )}
              </section>
            </div>

            <div className="min-h-[30rem] border-t border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-950/40 sm:p-4 lg:min-h-0 lg:border-l lg:border-t-0 lg:p-5">
              <GreenTargetInvoiceSelectionTable
                invoices={filteredInvoices}
                selectedInvoiceIds={selectedInvoices.map(
                  (item: InvoicePaymentAllocation): string =>
                    String(item.invoice.invoice_id)
                )}
                onInvoiceSelect={handleInvoiceSelect}
                onInvoiceRemove={handleInvoiceRemove}
                searchTerm={searchTerm}
                onSearchChange={setSearchTerm}
                dateRange={invoiceDateRange}
                onDateRangeChange={handleInvoiceDateRangeChange}
                isLoading={loadingInvoices}
              />
            </div>
          </div>

          <div className="flex flex-shrink-0 flex-col gap-3 border-t border-gray-200 bg-white px-4 py-3 dark:border-gray-700 dark:bg-gray-900 sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <div className="min-w-0">
              <p className="text-xs text-gray-500 dark:text-gray-400 sm:text-sm">
                {selectedInvoices.length === 0
                  ? t("Select at least one invoice to continue.")
                  : t("{{count}} invoice/invoices selected", {
                      count: selectedInvoices.length,
                    })}
                {selectedInvoices.length > 0 &&
                  (joinedReceipt
                    ? joinedReceipt.status === "pending"
                    : effectivePaymentMethod === "cheque") && (
                    <span className="ml-1 text-amber-600 dark:text-amber-400">
                      {t("- Pending until confirmed")}
                    </span>
                  )}
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-3">
              {selectedInvoices.length > 0 && (
                <div className="mr-auto text-left sm:mr-2 sm:text-right">
                  <span className="block text-[11px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    {t("Payment total")}
                  </span>
                  <span className="block text-lg font-bold text-green-600 dark:text-green-400">
                    {formatCurrency(totalPaymentAmount)}
                  </span>
                </div>
              )}
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                disabled={isSubmitting}
              >
                {t("Cancel")}
              </Button>
              <Button
                type="submit"
                color="sky"
                disabled={
                  isSubmitting ||
                  selectedInvoices.length === 0 ||
                  hasInvalidAllocation ||
                  paymentReceiptLookup.isLooking ||
                  (paymentReceiptLookup.receipt !== null &&
                    joinedReceipt === null)
                }
              >
                {isSubmitting
                  ? t("Processing...")
                  : joinedReceipt
                  ? t("Add to Receipt")
                  : t("Record Payment")}
              </Button>
            </div>
          </div>
        </form>
        <ConfirmationDialog
          isOpen={advancePaymentPrompt !== null}
          onClose={(): void => setAdvancePaymentPrompt(null)}
          onConfirm={(): void => {
            setAdvancePaymentPrompt(null);
            void processPayments(true);
          }}
          title={t("Record Advance Payment?")}
          message={
            advancePaymentPrompt
              ? t(
                  "The payment received date ({{received}}) is before invoice {{number}}'s date ({{issued}}). Record this as an advance payment?",
                  {
                    received: advancePaymentPrompt.paymentDate,
                    number: advancePaymentPrompt.invoiceNumber,
                    issued: advancePaymentPrompt.invoiceDate,
                  }
                )
              : ""
          }
          confirmButtonText={t("Record Payment")}
          variant="default"
        />
      </div>
    </div>
  );
};

export default GreenTargetPaymentForm;
