import React, { useCallback, useEffect, useRef, useState } from "react";
import { format } from "date-fns";
import { IconTrash, IconX } from "@tabler/icons-react";
import toast from "react-hot-toast";
import { greenTargetApi } from "../../routes/greentarget/api";
import {
  GreenTargetInvoice,
  GreenTargetPayment,
} from "../../types/greenTargetTypes";
import Button from "../Button";
import { FormInput, FormListbox } from "../FormComponents";
import TimeNavigator, { type TimeRange } from "../TimeNavigator";
import GreenTargetInvoiceSelectionTable from "./GreenTargetInvoiceSelectionTable";

interface GreenTargetPaymentFormProps {
  payment: GreenTargetPayment | null;
  onClose: () => void;
  onSuccess: () => void;
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
  payment,
  onClose,
  onSuccess,
}) => {
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
    payment_method: "cheque",
    payment_reference: "",
  });

  const paymentMethodOptions: { id: string; name: string }[] = [
    { id: "cash", name: "Cash" },
    { id: "cheque", name: "Cheque" },
    { id: "bank_transfer", name: "Bank Transfer" },
    { id: "online", name: "Online" },
  ];

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
        toast.error("Failed to fetch unpaid invoices");
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

  const generateInternalReference = async (
    invoiceDateValue: string
  ): Promise<string> => {
    const paymentsResponse: unknown = await greenTargetApi.getPayments({
      includeCancelled: true,
    });
    const allPayments: GreenTargetPayment[] = Array.isArray(paymentsResponse)
      ? (paymentsResponse as GreenTargetPayment[])
      : [];
    const dateMatch: RegExpMatchArray | null = invoiceDateValue.match(
      /^(\d{4})-(\d{2})/
    );
    const parsedDate: Date = new Date(invoiceDateValue);

    if (!dateMatch && Number.isNaN(parsedDate.getTime())) {
      throw new Error("The selected invoice has an invalid issue date.");
    }

    const invoiceYear: string = dateMatch
      ? dateMatch[1].slice(-2)
      : parsedDate.getFullYear().toString().slice(-2);
    const invoiceMonth: string = dateMatch
      ? dateMatch[2]
      : (parsedDate.getMonth() + 1).toString().padStart(2, "0");
    const referencePattern: RegExp = new RegExp(
      `^RV${invoiceYear}/${invoiceMonth}/(\\d+)$`
    );
    let highestNumber: number = 0;

    allPayments.forEach((existingPayment: GreenTargetPayment): void => {
      if (!existingPayment.internal_reference) {
        return;
      }

      const referenceMatch: RegExpMatchArray | null =
        existingPayment.internal_reference.match(referencePattern);
      if (referenceMatch) {
        highestNumber = Math.max(
          highestNumber,
          Number.parseInt(referenceMatch[1], 10)
        );
      }
    });

    return `RV${invoiceYear}/${invoiceMonth}/${(highestNumber + 1)
      .toString()
      .padStart(2, "0")}`;
  };

  const processPayments = async (): Promise<void> => {
    setIsSubmitting(true);
    const toastId: string = toast.loading("Processing payment...");

    try {
      const paymentReference: string = formData.payment_reference.trim();

      for (const allocation of selectedInvoices) {
        const internalReference: string = await generateInternalReference(
          allocation.invoice.date_issued
        );
        await greenTargetApi.createPayment({
          invoice_id: allocation.invoice.invoice_id,
          payment_date: formData.payment_date,
          amount_paid: allocation.amountToPay,
          payment_method: formData.payment_method,
          payment_reference: paymentReference || null,
          internal_reference: internalReference,
        });
      }

      toast.success(
        selectedInvoices.length === 1
          ? "Payment recorded successfully"
          : `Payments recorded for ${selectedInvoices.length} invoices`,
        { id: toastId, duration: 6000 }
      );
      onSuccess();
    } catch (error: unknown) {
      console.error("Error creating payment:", error);
      toast.error(getApiErrorMessage(error), { id: toastId });
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
      toast.error("Please select at least one invoice to pay");
      return;
    }

    const invalidAllocation: InvoicePaymentAllocation | undefined =
      selectedInvoices.find(
        ({ invoice, amountToPay }: InvoicePaymentAllocation): boolean =>
          !Number.isFinite(amountToPay) ||
          amountToPay <= 0 ||
          amountToPay > Number(invoice.current_balance)
      );

    if (invalidAllocation) {
      const invoiceBalance: number = Number(
        invalidAllocation.invoice.current_balance
      );
      if (invalidAllocation.amountToPay > invoiceBalance) {
        toast.error(
          `Payment for invoice ${invalidAllocation.invoice.invoice_number} cannot exceed ${formatCurrency(
            invoiceBalance
          )}`
        );
      } else {
        toast.error(
          `Enter a payment amount greater than RM0 for invoice ${invalidAllocation.invoice.invoice_number}`
        );
      }
      return;
    }

    if (
      !formData.payment_reference.trim() &&
      selectedInvoices.length > 1
    ) {
      toast.error("Payment reference is required for multiple invoice payments");
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
    formData.payment_date
  );

  return (
    <div className="fixed inset-0 z-50 flex bg-black/55 sm:p-3">
      <div className="flex h-full w-full flex-col overflow-hidden bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-900 sm:rounded-xl sm:border sm:border-gray-200">
        <div className="flex flex-shrink-0 items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-gray-700 sm:px-5">
          <div className="min-w-0">
            <h3 className="truncate text-lg font-semibold text-gray-900 dark:text-gray-100">
              {payment ? "Edit Payment" : "Record New Payment"}
            </h3>
            <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400 sm:text-sm">
              Record a customer payment and choose the invoices it pays.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="ml-3 flex-shrink-0 rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:text-gray-500 dark:hover:bg-gray-800 dark:hover:text-gray-300"
            disabled={isSubmitting}
            aria-label="Close payment form"
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
                    Payment details
                  </h4>
                  <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                    Date, payment method and reference information.
                  </p>
                </div>
                <div className="space-y-4 p-4">
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-200">
                      Payment Date <span className="text-red-500">*</span>
                    </label>
                    <TimeNavigator
                      range={paymentDateRange}
                      onChange={handlePaymentDateChange}
                      modes={["day"]}
                      presets={false}
                      allowFuture
                      disabled={isSubmitting}
                      className="flex w-full"
                      triggerClassName="min-w-0 flex-1 justify-between"
                    />
                  </div>
                  <FormListbox
                    name="payment_method"
                    label="Payment Method"
                    value={formData.payment_method}
                    onChange={(value: string): void =>
                      setFormData(
                        (currentFormData: PaymentFormData): PaymentFormData => ({
                          ...currentFormData,
                          payment_method:
                            value as GreenTargetPayment["payment_method"],
                        })
                      )
                    }
                    options={paymentMethodOptions}
                    disabled={isSubmitting}
                  />
                  <FormInput
                    name="payment_reference"
                    label={`Payment Reference ${
                      selectedInvoices.length > 1
                        ? "(Required)"
                        : "(Optional)"
                    }`}
                    placeholder={
                      formData.payment_method === "cheque"
                        ? "Cheque number"
                        : formData.payment_method === "bank_transfer"
                        ? "Transaction reference"
                        : formData.payment_method === "online"
                        ? "Transaction ID"
                        : "Reference number"
                    }
                    value={formData.payment_reference}
                    onChange={(
                      event: React.ChangeEvent<HTMLInputElement>
                    ): void =>
                      setFormData(
                        (currentFormData: PaymentFormData): PaymentFormData => ({
                          ...currentFormData,
                          payment_reference: event.target.value,
                        })
                      )
                    }
                    disabled={isSubmitting}
                    required={selectedInvoices.length > 1}
                  />
                </div>
              </section>

              <section className="rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-900">
                <div className="flex items-center gap-2 border-b border-gray-200 px-4 py-3 dark:border-gray-700">
                  <h4 className="font-semibold text-gray-900 dark:text-gray-100">
                    Selected invoices
                  </h4>
                  <span className="inline-flex min-w-6 items-center justify-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                    {selectedInvoices.length}
                  </span>
                </div>

                {selectedInvoices.length === 0 ? (
                  <div className="px-4 py-8 text-center">
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-200">
                      No invoices selected
                    </p>
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      Use the invoice browser to add one or more unpaid invoices.
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
                                aria-label={`Remove invoice ${invoice.invoice_number}`}
                              >
                                <IconTrash size={16} />
                              </button>
                            </div>

                            <div className="mt-3 grid grid-cols-[minmax(0,1fr)_minmax(120px,0.8fr)] items-end gap-3 border-t border-gray-200 pt-3 dark:border-gray-700">
                              <div>
                                <span className="block text-[11px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                                  Balance due
                                </span>
                                <span className="mt-1 block text-sm font-semibold text-gray-900 dark:text-gray-100">
                                  {formatCurrency(invoiceBalance)}
                                </span>
                              </div>
                              <label>
                                <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                                  Payment amount
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
                                Enter an amount above RM0.
                              </p>
                            )}
                            {isAboveBalance && (
                              <p className="mt-2 text-xs font-medium text-red-600 dark:text-red-400">
                                Payment cannot exceed the invoice balance.
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
                  ? "Select at least one invoice to continue."
                  : `${selectedInvoices.length} invoice${
                      selectedInvoices.length === 1 ? "" : "s"
                    } selected`}
                {selectedInvoices.length > 0 &&
                  formData.payment_method === "cheque" && (
                    <span className="ml-1 text-amber-600 dark:text-amber-400">
                      - Pending until confirmed
                    </span>
                  )}
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-3">
              {selectedInvoices.length > 0 && (
                <div className="mr-auto text-left sm:mr-2 sm:text-right">
                  <span className="block text-[11px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    Payment total
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
                Cancel
              </Button>
              <Button
                type="submit"
                color="sky"
                disabled={
                  isSubmitting ||
                  selectedInvoices.length === 0 ||
                  hasInvalidAllocation
                }
              >
                {isSubmitting ? "Processing..." : "Record Payment"}
              </Button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

export default GreenTargetPaymentForm;
