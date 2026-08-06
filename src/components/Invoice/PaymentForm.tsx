// src/components/Invoice/PaymentForm.tsx
import React, { useState, useEffect, useCallback, useRef } from "react";
import { format } from "date-fns";
import {
  IconAlertTriangle,
  IconLoader2,
  IconTrash,
  IconX,
} from "@tabler/icons-react";
import Button from "../../components/Button";
import Checkbox from "../../components/Checkbox";
import { FormInput } from "../../components/FormComponents";
import PillSelect, { PillSelectOption } from "../../components/PillSelect";
import { Payment, InvoiceData } from "../../types/types";
import { api } from "../../routes/utils/api";
import toast from "react-hot-toast";
import InvoiceSelectionTable from "./InvoiceSelectionTable";
import ConfirmationDialog from "../../components/ConfirmationDialog";
import TimeNavigator, {
  type TimeRange,
} from "../../components/TimeNavigator";

export type RecordablePaymentMethod = Exclude<
  Payment["payment_method"],
  "contra" | "overpayment"
>;

const PAYMENT_METHOD_OPTIONS: ReadonlyArray<
  PillSelectOption<RecordablePaymentMethod>
> = [
  { value: "cash", label: "Cash" },
  { value: "cheque", label: "Cheque" },
  { value: "bank_transfer", label: "Bank Transfer" },
  { value: "online", label: "Online" },
];

const BANK_ACCOUNT_OPTIONS: ReadonlyArray<PillSelectOption<string>> = [
  { value: "BANK_PBB", label: "Public Bank" },
  { value: "BANK_ABB", label: "Alliance Bank" },
];

export interface PaymentFormInitialValues {
  payment_date?: string;
  payment_method?: RecordablePaymentMethod;
  payment_reference?: string;
  bank_account?: Payment["bank_account"];
  notes?: string;
}

interface PaymentFormProps {
  payment: Payment | null;
  onClose: () => void;
  onSuccess: () => void;
  dateRange: {
    start: Date | null;
    end: Date | null;
  };
  apiEndpoint?: string; // Optional API endpoint for different companies
  invoicesEndpoint?: string; // Optional invoices endpoint for different companies
  initialValues?: PaymentFormInitialValues;
  referenceGroup?: string;
}

interface InvoicePaymentAllocation {
  invoice: InvoiceData;
  amountToPay: number;
}

interface PaymentFormData {
  payment_date: string;
  payment_method: RecordablePaymentMethod;
  payment_reference: string;
  bank_account: string;
  notes: string;
}

interface PaymentCreationResult {
  isOverpayment?: boolean;
}

interface PaymentReferenceUsageRow {
  payment_id: number;
  invoice_id: string;
  payment_date: string;
  amount_paid: number | string;
  payment_method: string;
  customerid?: string | null;
}

interface ReceiptReferenceUsageRow {
  id: number;
  display_reference: string;
  received_date: string;
  payment_method: string;
  debit_account: string;
  status: string;
  origin: string;
  total_amount: number;
  allocation_count: number;
}

// Only an ERP receipt can be joined: getReceiptGroup also matches on origin, so
// a new receipt could never land in a pre-cutover import_opening group anyway.
const canJoinReceiptGroup = (receipt: ReceiptReferenceUsageRow): boolean =>
  receipt.origin === "erp";

interface PaymentReferenceUsage {
  reference: string;
  count: number;
  // Tien Hock groups payments under a receipt; Jelly Polly has stand-alone
  // payment rows. Exactly one of these is populated.
  payments?: PaymentReferenceUsageRow[];
  receipts?: ReceiptReferenceUsageRow[];
}

interface ReceiptPaymentAllocation {
  type: "invoice" | "excess";
  invoice_id?: string;
  customer_id?: string;
  amount: number;
}

interface ImportedPaymentReconciliationPreview {
  code: "IMPORTED_PAYMENT_RECONCILIATION_MATCH";
  invoice_id: string;
  customer_id: string;
  customer_name: string;
  amount: number;
  payment_reference: string;
  invoice_date: string;
  entered_payment_date: string;
  ledger_payment_date: string;
  payment_date_corrected: boolean;
  debit_account: string;
  evidence_journal_id: number;
  evidence_line_id: number;
  gl_balance: number;
  operational_balance: number;
  operational_balance_after: number;
  no_new_journal: true;
}

interface ImportedPaymentReconciliationRequest {
  allocations: ReceiptPaymentAllocation[];
  payment_reference: string;
  received_date: string;
  payment_method: RecordablePaymentMethod;
  bank_account?: string;
  notes?: string;
  expected_journal_id?: number;
  expected_line_id?: number;
}

interface ImportedPaymentReconciliationState {
  preview: ImportedPaymentReconciliationPreview;
  request: ImportedPaymentReconciliationRequest;
}

interface ApiErrorShape {
  message?: string;
  data?: {
    code?: string;
    message?: string;
    requires_confirmation?: boolean;
    candidate?: ImportedPaymentReconciliationPreview;
  };
  response?: {
    data?: {
      code?: string;
      message?: string;
      requires_confirmation?: boolean;
      candidate?: ImportedPaymentReconciliationPreview;
    };
  };
}

const getInitialPaymentDate = (value?: string): string => {
  if (!value) {
    return format(new Date(), "yyyy-MM-dd");
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }

  const parsedDate: Date = new Date(value);
  return Number.isNaN(parsedDate.getTime())
    ? format(new Date(), "yyyy-MM-dd")
    : format(parsedDate, "yyyy-MM-dd");
};

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

const formatLocalDateLabel = (value: string): string => {
  const match: RegExpMatchArray | null = value.match(
    /^(\d{4})-(\d{2})-(\d{2})$/
  );
  if (!match) return value;
  return format(
    new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])),
    "dd MMM yyyy"
  );
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
    "Failed to record payment"
  );
};

const PaymentForm: React.FC<PaymentFormProps> = ({
  onClose,
  onSuccess,
  apiEndpoint = "/api/payments", // Default to main company endpoint
  invoicesEndpoint = "/api/invoices", // Default to main company invoices endpoint
  initialValues,
  referenceGroup,
}) => {
  // Tien Hock uses the atomic grouped-receipt endpoint (one request = one
  // receipt covering every selected invoice = one journal). Other companies
  // keep the per-invoice payments endpoint.
  const useGroupedReceipt: boolean = apiEndpoint === "/api/payments";
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loadingInvoices, setLoadingInvoices] = useState(false);
  const [availableInvoices, setAvailableInvoices] = useState<InvoiceData[]>([]);
  const [invoiceDateRange, setInvoiceDateRange] = useState<TimeRange>(
    getInitialInvoiceDateRange
  );
  const [selectedInvoices, setSelectedInvoices] = useState<
    InvoicePaymentAllocation[]
  >([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [showOverpaymentConfirm, setShowOverpaymentConfirm] = useState(false);
  const [overpaymentDetails, setOverpaymentDetails] = useState<
    | {
        invoiceId: string;
        customerName: string;
        totalAmount: number;
        regularAmount: number;
        overpaidAmount: number;
      }[]
    | null
  >(null);
  const [importedReconciliation, setImportedReconciliation] =
    useState<ImportedPaymentReconciliationState | null>(null);
  // Jelly Polly has no receipt header to group payments under, so a re-used
  // reference cannot be "joined" to anything. It is reported with the payments
  // already carrying it and must be confirmed before saving.
  const [referenceUsage, setReferenceUsage] =
    useState<PaymentReferenceUsage | null>(null);
  const [isCheckingReference, setIsCheckingReference] =
    useState<boolean>(false);
  const [confirmedDuplicateReference, setConfirmedDuplicateReference] =
    useState<string | null>(null);
  const invoiceRequestIdRef = useRef<number>(0);
  const referenceRequestIdRef = useRef<number>(0);

  const [formData, setFormData] = useState<PaymentFormData>(() => ({
    payment_date: getInitialPaymentDate(initialValues?.payment_date),
    payment_method:
      initialValues?.payment_method ??
      ("cheque" as RecordablePaymentMethod),
    payment_reference: initialValues?.payment_reference ?? "",
    bank_account: initialValues?.bank_account ?? "BANK_PBB",
    notes: initialValues?.notes ?? "",
  }));

  const fetchUnpaidInvoices = useCallback(async () => {
    const requestId: number = invoiceRequestIdRef.current + 1;
    invoiceRequestIdRef.current = requestId;
    setLoadingInvoices(true);
    try {
      const params = new URLSearchParams({
        invoiceStatus: "Unpaid,Overdue",
        all: "true", // Add this to get all invoices without pagination
      });

      // Tien Hock also offers cash bills whose counter cash has not been fully
      // accounted for: they are always 'paid', so the status filter alone
      // would hide a same-day sale that was partly paid by transfer/online.
      if (useGroupedReceipt) {
        params.append("settleable", "true");
      }

      params.append("startDate", invoiceDateRange.start.getTime().toString());
      params.append("endDate", invoiceDateRange.end.getTime().toString());

      const [invoicesResponse, paymentsResponse] = await Promise.all([
        api.get(`${invoicesEndpoint}?${params.toString()}`),
        api.get(`${apiEndpoint}?include_cancelled=false`), // Get all active/pending payments
      ]);

      const invoices: InvoiceData[] = Array.isArray(invoicesResponse)
        ? invoicesResponse
        : [];
      const payments: Payment[] = Array.isArray(paymentsResponse)
        ? paymentsResponse
        : [];

      // Filter out invoices that have pending payments
      const invoicesWithPendingPayments = new Set(
        payments
          .filter((payment) => payment.status === "pending")
          .map((payment) => payment.invoice_id)
      );

      const filteredInvoices = invoices.filter(
        (invoice) =>
          !invoicesWithPendingPayments.has(invoice.id) &&
          (invoice.settleable_amount !== undefined
            ? Number(invoice.settleable_amount)
            : Number(invoice.balance_due)) > 0
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
  }, [apiEndpoint, invoiceDateRange, invoicesEndpoint]);

  // Debounced "is this reference already in use?" check. Tien Hock looks at
  // receipts (its reference is repeatable, so a match is reported, never
  // forbidden) and Jelly Polly at payments on other invoices; both must be
  // acknowledged before saving so a mis-keyed reference cannot pass silently.
  useEffect((): (() => void) => {
    const reference: string = formData.payment_reference.trim();
    const requestId: number = referenceRequestIdRef.current + 1;
    referenceRequestIdRef.current = requestId;

    // A reference group is an existing group the user deliberately opened this
    // form from, so its reference is expected to match and is not a warning.
    if (referenceGroup) {
      setReferenceUsage(null);
      setIsCheckingReference(false);
      return (): void => undefined;
    }

    if (!reference) {
      setReferenceUsage(null);
      setIsCheckingReference(false);
      return (): void => undefined;
    }

    setIsCheckingReference(true);
    const usageEndpoint: string = useGroupedReceipt
      ? `/api/receipts/by-reference/${encodeURIComponent(reference)}`
      : `${apiEndpoint}/reference-usage/${encodeURIComponent(reference)}`;
    const timeoutId: number = window.setTimeout((): void => {
      void api
        .get<PaymentReferenceUsage>(usageEndpoint)
        .then((usage: PaymentReferenceUsage): void => {
          if (referenceRequestIdRef.current !== requestId) return;
          setReferenceUsage(usage && usage.count > 0 ? usage : null);
        })
        .catch((error: unknown): void => {
          // A failed check must not block recording a payment: the server still
          // rejects a same-invoice duplicate on save.
          console.error("Error checking the payment reference:", error);
          if (referenceRequestIdRef.current !== requestId) return;
          setReferenceUsage(null);
        })
        .finally((): void => {
          if (referenceRequestIdRef.current === requestId) {
            setIsCheckingReference(false);
          }
        });
    }, 400);

    return (): void => {
      window.clearTimeout(timeoutId);
    };
  }, [apiEndpoint, formData.payment_reference, referenceGroup, useGroupedReceipt]);

  // The confirmation is stored as the reference it was given for, so editing
  // the reference always requires a fresh decision.
  const trimmedPaymentReference: string = formData.payment_reference.trim();
  const isDuplicateReferenceConfirmed: boolean =
    confirmedDuplicateReference !== null &&
    confirmedDuplicateReference === trimmedPaymentReference;

  // Tien Hock: a payment group is simply the receipts sharing a reference AND
  // its banking details, so "add another payment to this reference" is a second
  // receipt keyed with the group's own date, method and account — no existing
  // receipt or posted journal is touched. Joining is the default because a
  // re-used reference almost always means the earlier keying missed something.
  const joinableReceipt: ReceiptReferenceUsageRow | null =
    useGroupedReceipt && referenceUsage?.receipts?.length
      ? referenceUsage.receipts.find(canJoinReceiptGroup) || null
      : null;
  const joinedReceiptGroup: ReceiptReferenceUsageRow | null =
    isDuplicateReferenceConfirmed ? joinableReceipt : null;
  const groupPaymentDate: string = joinedReceiptGroup
    ? format(new Date(joinedReceiptGroup.received_date), "yyyy-MM-dd")
    : formData.payment_date;
  const groupPaymentMethod: RecordablePaymentMethod = joinedReceiptGroup
    ? (joinedReceiptGroup.payment_method as RecordablePaymentMethod)
    : formData.payment_method;
  const groupBankAccount: string =
    joinedReceiptGroup && joinedReceiptGroup.payment_method !== "cash"
      ? joinedReceiptGroup.debit_account
      : formData.bank_account;
  const bankingFieldsLocked: boolean =
    Boolean(referenceGroup) || joinedReceiptGroup !== null;

  // Auto-tick the moment a match appears, so the common case is a no-op for the
  // user. Keyed per reference, so unticking sticks and a new reference decides
  // again.
  const offeredReferenceRef = useRef<string | null>(null);
  useEffect((): void => {
    if (!useGroupedReceipt) return;
    const offered: string | null =
      referenceUsage && joinableReceipt ? referenceUsage.reference : null;
    if (offered === null) {
      offeredReferenceRef.current = null;
      return;
    }
    if (offeredReferenceRef.current === offered) return;
    offeredReferenceRef.current = offered;
    setConfirmedDuplicateReference(offered);
  }, [joinableReceipt, referenceUsage, useGroupedReceipt]);

  // Fetch unpaid invoices
  useEffect(() => {
    fetchUnpaidInvoices();
  }, [fetchUnpaidInvoices]);

  const totalPaymentAmount = selectedInvoices.reduce(
    (sum, item) => sum + item.amountToPay,
    0
  );

  // Overpayment add-on (TH only): each customer's held overpayment (CUST_DEP
  // excess) can be applied to their own selected invoices alongside the money
  // payment. Balances are fetched per selected customer; applyAmounts holds
  // the user-editable amount per customer (0 = do not apply).
  const selectedCustomerIds: string[] = [
    ...new Set(selectedInvoices.map((item) => item.invoice.customerid)),
  ].sort();
  const selectedCustomerKey = selectedCustomerIds.join(",");
  const [overpaymentBalances, setOverpaymentBalances] = useState<
    Record<string, number>
  >({});
  const [applyAmounts, setApplyAmounts] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!useGroupedReceipt || !selectedCustomerKey) {
      setOverpaymentBalances({});
      return;
    }
    let cancelled = false;
    Promise.all(
      selectedCustomerKey.split(",").map((customerId) =>
        api
          .get(
            `/api/payments/overpayment-balance/${encodeURIComponent(
              customerId
            )}`
          )
          .then(
            (res: { unapplied_overpayment?: number }) =>
              [customerId, Number(res?.unapplied_overpayment) || 0] as const
          )
          .catch((err: unknown) => {
            console.error("Error fetching overpayment balance:", err);
            return [customerId, 0] as const;
          })
      )
    ).then((entries) => {
      if (cancelled) return;
      setOverpaymentBalances(Object.fromEntries(entries));
      // Default: do NOT apply any held excess — applying it is a deliberate
      // opt-in (the user ticks the box, which pre-fills the full amount).
      // Capped against the selected settle total at submit.
      setApplyAmounts((current) => {
        const next = { ...current };
        for (const [customerId] of entries) {
          if (!(customerId in next)) next[customerId] = 0;
        }
        return next;
      });
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [useGroupedReceipt, selectedCustomerKey]);

  const roundMoney = (value: number): number => Math.round(value * 100) / 100;

  /**
   * How much a payment may still be recorded against an invoice.
   *
   * A credit invoice exposes its outstanding balance. A Tien Hock CASH bill is
   * settled the moment it is issued, so what it can still take is the counter
   * cash held in CH_REV1 — recording a transfer/online receipt against it says
   * that part of the sale was banked rather than taken over the counter.
   * Companies whose endpoint does not report it fall back to the balance due.
   */
  const settleableOf = (invoice: InvoiceData): number =>
    invoice.settleable_amount !== undefined
      ? Number(invoice.settleable_amount)
      : Number(invoice.balance_due);

  const isCashBill = (invoice: InvoiceData): boolean =>
    invoice.paymenttype === "CASH";

  /** A cash bill's collection is already cash; only banked money adds anything. */
  const hasCashBillSelected: boolean = selectedInvoices.some(
    (item: InvoicePaymentAllocation) => isCashBill(item.invoice)
  );

  /**
   * Only a credit invoice can be overpaid. A cash bill carries no balance at
   * all, so comparing against it would flag every amount as an overpayment.
   */
  const isOverpaymentAllocation = (item: InvoicePaymentAllocation): boolean =>
    !isCashBill(item.invoice) &&
    item.amountToPay > Number(item.invoice.balance_due);

  // Against a cash bill only banked money says something new: cash is already
  // what the bill recorded, and a cheque keyed here is always pending, which
  // would suppress the bill's whole cash collection until it cleared.
  const paymentMethodOptions: ReadonlyArray<
    PillSelectOption<RecordablePaymentMethod>
  > = hasCashBillSelected
    ? PAYMENT_METHOD_OPTIONS.filter(
        (option) => option.value !== "cash" && option.value !== "cheque"
      )
    : PAYMENT_METHOD_OPTIONS;

  // Selecting a cash bill can invalidate the method already chosen (the form
  // opens on "cheque"), so fall back to a method that is still offered.
  useEffect((): void => {
    if (!hasCashBillSelected) return;
    setFormData((current: PaymentFormData) =>
      current.payment_method === "cash" || current.payment_method === "cheque"
        ? { ...current, payment_method: "online" }
        : current
    );
  }, [hasCashBillSelected]);

  /** Total the selected amounts settle of one customer's invoice balances. */
  const settleSumForCustomer = (customerId: string): number =>
    roundMoney(
      selectedInvoices
        .filter((item) => item.invoice.customerid === customerId)
        .reduce(
          (sum, item) => sum + Math.min(item.amountToPay, settleableOf(item.invoice)),
          0
        )
    );

  /**
   * Splits the selection into overpayment applications (each customer's held
   * excess, oldest invoice first) and the money allocations the receipt must
   * cover. Pure applies produce no money allocations.
   */
  const computeSettlement = (): {
    overpaymentAllocations: { invoice_id: string; amount: number }[];
    moneyAllocations: ReceiptPaymentAllocation[];
    totalApplied: number;
  } => {
    const appliedByInvoice = new Map<string, number>();
    for (const [customerId, rawAmount] of Object.entries(applyAmounts)) {
      let remaining = roundMoney(rawAmount);
      if (!(remaining > 0)) continue;
      const customerSelections = selectedInvoices
        .filter((item) => item.invoice.customerid === customerId)
        .sort(
          (a, b) =>
            Number(a.invoice.createddate) - Number(b.invoice.createddate)
        );
      for (const { invoice, amountToPay } of customerSelections) {
        if (remaining <= 0.005) break;
        const settle = Math.min(amountToPay, Number(invoice.balance_due));
        const take = roundMoney(Math.min(remaining, settle));
        if (take > 0.005) {
          appliedByInvoice.set(invoice.id, take);
          remaining = roundMoney(remaining - take);
        }
      }
    }

    const moneyAllocations: ReceiptPaymentAllocation[] = [];
    for (const { invoice, amountToPay } of selectedInvoices) {
      const settleable = settleableOf(invoice);
      const applied = appliedByInvoice.get(invoice.id) || 0;
      const regular = roundMoney(Math.min(amountToPay, settleable) - applied);
      if (regular > 0.005) {
        moneyAllocations.push({
          type: "invoice",
          invoice_id: invoice.id,
          amount: regular,
        });
      }
      // A cash bill owes nothing, so anything above its collected cash is a
      // keying error rather than an overpayment (validated before submit).
      if (amountToPay > settleable && !isCashBill(invoice)) {
        moneyAllocations.push({
          type: "excess",
          customer_id: invoice.customerid,
          amount: roundMoney(amountToPay - settleable),
        });
      }
    }

    const overpaymentAllocations = [...appliedByInvoice.entries()].map(
      ([invoice_id, amount]) => ({ invoice_id, amount })
    );
    return {
      overpaymentAllocations,
      moneyAllocations,
      totalApplied: roundMoney(
        overpaymentAllocations.reduce((sum, a) => sum + a.amount, 0)
      ),
    };
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
        ({ amountToPay }: InvoicePaymentAllocation) =>
          !Number.isFinite(amountToPay) || amountToPay <= 0
      );

    if (invalidAllocation) {
      toast.error(
        `Enter a payment amount greater than RM0 for invoice ${invalidAllocation.invoice.id}`
      );
      return;
    }

    // Overpayment add-on validation (TH only): each applied amount must fit
    // the customer's available excess and their selected settle total.
    if (useGroupedReceipt) {
      for (const customerId of selectedCustomerIds) {
        const applyAmount = roundMoney(applyAmounts[customerId] || 0);
        if (!(applyAmount > 0)) continue;
        const available = overpaymentBalances[customerId] || 0;
        if (applyAmount > available + 0.005) {
          toast.error(
            `Overpayment applied for ${customerId} cannot exceed the available ${formatCurrency(
              available
            )}`
          );
          return;
        }
        const settleSum = settleSumForCustomer(customerId);
        if (applyAmount > settleSum + 0.005) {
          toast.error(
            `Overpayment applied for ${customerId} cannot exceed the selected settle total of ${formatCurrency(
              settleSum
            )}`
          );
          return;
        }
      }
    }

    const { moneyAllocations } = computeSettlement();
    if (
      !formData.payment_reference.trim() &&
      selectedInvoices.length > 1 &&
      moneyAllocations.length > 0
    ) {
      toast.error(
        "Payment reference is required for multiple invoice payments"
      );
      return;
    }

    if (isCheckingReference) {
      toast.error("Wait for the payment reference check to finish");
      return;
    }
    // Tien Hock's reference is repeatable, and the join box is ticked by
    // default, so unticking it is already a deliberate choice and needs no
    // second gate. Jelly Polly has nothing to join, so its confirmation is the
    // only thing standing between a typo and a mis-keyed reference.
    if (!useGroupedReceipt && referenceUsage && !isDuplicateReferenceConfirmed) {
      toast.error(
        "Confirm that this reference really is the same transfer, or use a different one"
      );
      return;
    }

    // A cash bill owes nothing, so it can never be overpaid: anything above
    // the cash it collected is a keying error, not a customer credit.
    const overCollectedCashBill = selectedInvoices.find(
      ({ invoice, amountToPay }) =>
        isCashBill(invoice) && amountToPay > settleableOf(invoice) + 0.005
    );
    if (overCollectedCashBill) {
      toast.error(
        `Cash bill ${overCollectedCashBill.invoice.id} only collected ${formatCurrency(
          settleableOf(overCollectedCashBill.invoice)
        )} in cash — a payment against it cannot exceed that`
      );
      return;
    }

    // Check for ALL overpayments
    const overpaymentInvoices = selectedInvoices.filter(
      ({ invoice, amountToPay }) =>
        !isCashBill(invoice) && amountToPay > invoice.balance_due
    );

    if (overpaymentInvoices.length > 0 && !useGroupedReceipt) {
      const firstOverpayment: InvoicePaymentAllocation = overpaymentInvoices[0];
      toast.error(
        `Payment for invoice ${firstOverpayment.invoice.id} cannot exceed its ${formatCurrency(
          firstOverpayment.invoice.balance_due
        )} balance`
      );
      return;
    }

    if (overpaymentInvoices.length > 0) {
      const overpaymentData = overpaymentInvoices.map(
        ({ invoice, amountToPay }) => ({
          invoiceId: invoice.id,
          customerName: invoice.customerName || invoice.customerid,
          totalAmount: amountToPay,
          regularAmount: invoice.balance_due,
          overpaidAmount: amountToPay - invoice.balance_due,
        })
      );

      setOverpaymentDetails(overpaymentData);
      setShowOverpaymentConfirm(true);
      return;
    }

    // Proceed with normal payment processing
    await processPayments();
  };

  const processPayments = async (): Promise<void> => {
    setIsSubmitting(true);
    const toastId = toast.loading("Processing payment...");
    let reconciliationRequest: ImportedPaymentReconciliationRequest | null =
      null;

    try {
      const results: PaymentCreationResult[] = [];
      const paymentReference: string = formData.payment_reference.trim();
      const notes: string = formData.notes.trim();

      let appliedTotal = 0;
      let moneyAllocationCount = 0;
      if (useGroupedReceipt) {
        // One atomic request: each customer's held overpayment is applied to
        // their invoices first, then the money receipt covers the remainder
        // (invoice allocations up to each balance due, plus a customer-owned
        // excess allocation for any new overpayment).
        const { overpaymentAllocations, moneyAllocations, totalApplied } =
          computeSettlement();
        appliedTotal = totalApplied;
        moneyAllocationCount = moneyAllocations.length;

        if (
          overpaymentAllocations.length === 0 &&
          moneyAllocations.length === 1 &&
          moneyAllocations[0].type === "invoice"
        ) {
          reconciliationRequest = {
            allocations: moneyAllocations,
            payment_reference: paymentReference,
            received_date: groupPaymentDate,
            payment_method: groupPaymentMethod,
            bank_account:
              groupPaymentMethod === "cash" ? undefined : groupBankAccount,
            notes: notes || undefined,
          };
        }

        // Joining a group means matching its banking details exactly — that is
        // what makes getReceiptGroup treat this receipt as part of it.
        const result = await api.post("/api/receipts", {
          payment_method: groupPaymentMethod,
          bank_account:
            groupPaymentMethod === "cash" ? undefined : groupBankAccount,
          display_reference: paymentReference || undefined,
          received_date: groupPaymentDate,
          notes: notes || undefined,
          allocations: moneyAllocations,
          overpayment_allocations:
            overpaymentAllocations.length > 0
              ? overpaymentAllocations
              : undefined,
        });
        results.push(result);
      } else {
        // Create payment for each selected invoice
        for (const { invoice, amountToPay } of selectedInvoices) {
          const result = await api.post(apiEndpoint, {
            invoice_id: invoice.id,
            payment_date: formData.payment_date,
            amount_paid: amountToPay,
            payment_method: formData.payment_method,
            payment_reference: paymentReference || undefined,
            bank_account: formData.payment_method === 'cash' ? 'CASH' : formData.bank_account,
            notes: notes || undefined,
            // The user has seen which other invoices carry this reference and
            // confirmed it is the same transfer.
            confirm_duplicate_reference: isDuplicateReferenceConfirmed
              ? true
              : undefined,
          });
          results.push(result);
        }
      }

      // Count overpayments
      const overpaymentCount = useGroupedReceipt
        ? overpaymentDetails?.length || 0
        : results.filter((result) => result.isOverpayment).length;

      let successMessage: string;
      if (appliedTotal > 0) {
        if (moneyAllocationCount > 0) {
          successMessage = `Payment recorded, including ${formatCurrency(
            appliedTotal
          )} overpayment applied`;
        } else {
          successMessage =
            selectedInvoices.length === 1
              ? "Overpayment applied to the invoice"
              : `Overpayment applied to ${selectedInvoices.length} invoices`;
        }
      } else if (overpaymentCount > 0) {
        if (selectedInvoices.length === 1) {
          successMessage =
            "Payment recorded; the excess remains as customer credit";
        } else {
          successMessage = `Payments recorded for ${selectedInvoices.length} invoices`;
          if (overpaymentCount === selectedInvoices.length) {
            successMessage += " - all with excess kept as customer credit";
          } else {
            successMessage += ` - ${overpaymentCount} with excess kept as customer credit`;
          }
        }
      } else {
        successMessage =
          selectedInvoices.length === 1
            ? "Payment recorded successfully"
            : `Payment recorded for ${selectedInvoices.length} invoices`;
      }

      toast.success(successMessage, { id: toastId, duration: 6000 });
      setShowOverpaymentConfirm(false);
      setOverpaymentDetails(null);
      onSuccess();
    } catch (error: unknown) {
      console.error("Error creating payment:", error);
      const apiError: ApiErrorShape =
        typeof error === "object" && error !== null
          ? (error as ApiErrorShape)
          : {};
      const errorData = apiError.response?.data || apiError.data;
      const importedCandidate = errorData?.candidate;
      if (
        useGroupedReceipt &&
        reconciliationRequest &&
        errorData?.code === "IMPORTED_PAYMENT_RECONCILIATION_MATCH" &&
        errorData.requires_confirmation === true &&
        importedCandidate
      ) {
        setImportedReconciliation({
          preview: importedCandidate,
          request: {
            ...reconciliationRequest,
            payment_reference: importedCandidate.payment_reference,
            expected_journal_id: importedCandidate.evidence_journal_id,
            expected_line_id: importedCandidate.evidence_line_id,
          },
        });
        toast.dismiss(toastId);
        return;
      }
      if (
        useGroupedReceipt &&
        errorData?.code === "IMPORTED_PAYMENT_RECONCILIATION_MATCH" &&
        importedCandidate
      ) {
        toast.error(
          `Record invoice ${importedCandidate.invoice_id} by itself, without applying held overpayment or grouping other invoices, then review the imported-ledger match again.`,
          { id: toastId, duration: 7000 }
        );
        return;
      }
      toast.error(getApiErrorMessage(error), {
        id: toastId,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmOverpayment = async (): Promise<void> => {
    setShowOverpaymentConfirm(false);
    await processPayments();
  };

  const handleConfirmImportedReconciliation = async (): Promise<void> => {
    if (!importedReconciliation || isSubmitting) return;

    setIsSubmitting(true);
    const toastId: string = toast.loading(
      "Clearing invoice from the existing ledger payment..."
    );
    try {
      await api.post(
        "/api/payments/reconcile-imported",
        importedReconciliation.request
      );
      toast.success(
        `Invoice ${importedReconciliation.preview.invoice_id} cleared using ${importedReconciliation.preview.payment_reference}. No new receipt or journal was created.`,
        { id: toastId, duration: 7000 }
      );
      setImportedReconciliation(null);
      onSuccess();
    } catch (error: unknown) {
      console.error("Error reconciling imported payment:", error);
      toast.error(getApiErrorMessage(error), { id: toastId });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleInvoiceSelect = (invoice: InvoiceData): void => {
    setSelectedInvoices((currentInvoices: InvoicePaymentAllocation[]) => {
      const existing: InvoicePaymentAllocation | undefined =
        currentInvoices.find(
          (item: InvoicePaymentAllocation) => item.invoice.id === invoice.id
        );
      return existing
        ? currentInvoices
        : [...currentInvoices, { invoice, amountToPay: settleableOf(invoice) }];
    });
  };

  const handleInvoiceRemove = (invoiceId: string): void => {
    setSelectedInvoices((currentInvoices: InvoicePaymentAllocation[]) =>
      currentInvoices.filter(
        (item: InvoicePaymentAllocation) => item.invoice.id !== invoiceId
      )
    );
  };

  const handleAmountChange = (invoiceId: string, amount: number): void => {
    setSelectedInvoices((currentInvoices: InvoicePaymentAllocation[]) =>
      currentInvoices.map((item: InvoicePaymentAllocation) =>
        item.invoice.id === invoiceId ? { ...item, amountToPay: amount } : item
      )
    );
  };

  const handleInvoiceDateRangeChange = (range: TimeRange): void => {
    setInvoiceDateRange(range);
  };

  const handlePaymentDateChange = (range: TimeRange): void => {
    setFormData((currentFormData: PaymentFormData) => ({
      ...currentFormData,
      payment_date: format(range.start, "yyyy-MM-dd"),
    }));
  };

  const formatCurrency = (amount: number): string => {
    return amount.toLocaleString("en-MY", {
      style: "currency",
      currency: "MYR",
    });
  };

  const filteredInvoices = availableInvoices.filter((invoice) => {
    if (!searchTerm) return true;
    const search = searchTerm.toLowerCase();
    return (
      invoice.id.toLowerCase().includes(search) ||
      invoice.customerName?.toLowerCase().includes(search) ||
      invoice.customerid.toLowerCase().includes(search)
    );
  });
  const paymentDateRange: TimeRange = getPaymentDateRange(
    formData.payment_date
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
              {referenceGroup && (
                <div className="rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-100">
                  This payment will use reference {referenceGroup} and appear in
                  the same payment group.
                  {formData.payment_method === "cheque" && (
                    <span className="mt-1 block text-xs text-sky-700 dark:text-sky-300">
                      The cheque will still need to be confirmed before the
                      invoice balance changes.
                    </span>
                  )}
                </div>
              )}

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
                      range={
                        joinedReceiptGroup
                          ? getPaymentDateRange(groupPaymentDate)
                          : paymentDateRange
                      }
                      onChange={handlePaymentDateChange}
                      modes={["day"]}
                      presets={false}
                      allowFuture
                      disabled={isSubmitting || bankingFieldsLocked}
                      className="flex w-full"
                      triggerClassName="min-w-0 flex-1 justify-between"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-200">
                      Payment Method
                    </label>
                    <PillSelect<RecordablePaymentMethod>
                      value={groupPaymentMethod}
                      onChange={(value: RecordablePaymentMethod) =>
                        setFormData({
                          ...formData,
                          payment_method: value,
                        })
                      }
                      options={paymentMethodOptions}
                      disabled={isSubmitting || bankingFieldsLocked}
                      ariaLabel="Payment method"
                    size="md"
                    />
                  </div>
                  {groupPaymentMethod !== "cash" && (
                    <div>
                      <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-200">
                        Deposit To
                      </label>
                      <PillSelect
                        value={groupBankAccount}
                        onChange={(value: string) =>
                          setFormData({
                            ...formData,
                            bank_account: value,
                          })
                        }
                        options={BANK_ACCOUNT_OPTIONS}
                        disabled={isSubmitting || bankingFieldsLocked}
                        ariaLabel="Deposit to"
                      size="md"
                      />
                    </div>
                  )}
                  <FormInput
                    name="payment_reference"
                    label={
                      referenceGroup
                        ? "Payment Reference (Same group)"
                        : `Payment Reference ${
                            selectedInvoices.length > 1
                              ? "(Required)"
                              : "(Optional)"
                          }`
                    }
                    placeholder={
                      groupPaymentMethod === "cheque"
                        ? "Cheque number"
                        : groupPaymentMethod === "bank_transfer"
                        ? "Transaction reference"
                        : groupPaymentMethod === "online"
                        ? "Transaction ID"
                        : "Reference number"
                    }
                    value={formData.payment_reference}
                    onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                      setFormData({
                        ...formData,
                        payment_reference: event.target.value,
                      })
                    }
                    disabled={isSubmitting || Boolean(referenceGroup)}
                    required={selectedInvoices.length > 1}
                  />
                  {isCheckingReference && (
                    <div className="flex items-center gap-2 text-xs text-default-500 dark:text-gray-400">
                      <IconLoader2 size={14} className="animate-spin" />
                      Checking this reference number...
                    </div>
                  )}
                  {referenceUsage && (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-900/20">
                      <div className="flex items-start gap-2">
                        <IconAlertTriangle
                          size={16}
                          className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-400"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                            Reference {referenceUsage.reference} is already used
                            by {referenceUsage.count}{" "}
                            {useGroupedReceipt ? "receipt" : "payment"}
                            {referenceUsage.count === 1 ? "" : "s"}.
                          </p>
                          <ul className="mt-2 space-y-1 text-xs text-amber-800 dark:text-amber-200">
                            {(referenceUsage.receipts || []).map(
                              (
                                usage: ReceiptReferenceUsageRow
                              ): React.ReactNode => (
                                <li key={usage.id}>
                                  {formatCurrency(usage.total_amount)} on{" "}
                                  {format(
                                    new Date(usage.received_date),
                                    "dd/MM/yyyy"
                                  )}{" "}
                                  — {usage.allocation_count} invoice
                                  {usage.allocation_count === 1 ? "" : "s"}
                                  {usage.status === "pending"
                                    ? " (pending cheque)"
                                    : ""}
                                </li>
                              )
                            )}
                            {(referenceUsage.payments || []).map(
                              (
                                usage: PaymentReferenceUsageRow
                              ): React.ReactNode => (
                                <li key={usage.payment_id}>
                                  Invoice {usage.invoice_id}
                                  {usage.customerid
                                    ? ` (${usage.customerid})`
                                    : ""}{" "}
                                  — {formatCurrency(Number(usage.amount_paid))}{" "}
                                  on{" "}
                                  {format(
                                    new Date(usage.payment_date),
                                    "dd/MM/yyyy"
                                  )}
                                </li>
                              )
                            )}
                          </ul>
                          {(!useGroupedReceipt || joinableReceipt) && (
                            <div className="mt-3">
                              <Checkbox
                                checked={isDuplicateReferenceConfirmed}
                                onChange={(checked: boolean): void =>
                                  setConfirmedDuplicateReference(
                                    checked ? trimmedPaymentReference : null
                                  )
                                }
                                disabled={isSubmitting}
                                size={18}
                                label={
                                  useGroupedReceipt
                                    ? "Add this payment to that group"
                                    : "This is the same transfer — record it under the same reference"
                                }
                              />
                            </div>
                          )}
                          <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
                            {useGroupedReceipt
                              ? !joinableReceipt
                                ? "That is a pre-changeover record, so this payment cannot be added to it. It will be recorded on its own, sharing only the reference number."
                                : joinedReceiptGroup
                                ? `The group's date, payment method and account are used as they are, so this payment appears under ${referenceUsage.reference} alongside the payments above. Nothing already recorded is changed.`
                                : "Unticked: this is recorded as its own payment with its own date and method, sharing only the reference number."
                              : "Each invoice keeps its own payment record; they are only linked by this reference."}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                  <FormInput
                    name="notes"
                    label="Notes (Optional)"
                    value={formData.notes}
                    onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                      setFormData({
                        ...formData,
                        notes: event.target.value,
                      })
                    }
                    disabled={isSubmitting}
                  />
                </div>
              </section>

              <section className="rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-900">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 px-4 py-3 dark:border-gray-700">
                  <div className="flex flex-wrap items-center gap-2">
                    <h4 className="font-semibold text-gray-900 dark:text-gray-100">
                      Selected invoices
                    </h4>
                    <span className="inline-flex min-w-6 items-center justify-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                      {selectedInvoices.length}
                    </span>
                  </div>
                  {selectedInvoices.some(isOverpaymentAllocation) && (
                    <span className="rounded-full bg-purple-100 px-2 py-1 text-xs text-purple-700 dark:bg-purple-900/50 dark:text-purple-300">
                      {selectedInvoices.filter(isOverpaymentAllocation).length}{" "}
                      {useGroupedReceipt ? "Overpayment(s)" : "Above balance"}
                    </span>
                  )}
                </div>

                {selectedInvoices.length === 0 ? (
                  <div className="px-4 py-8 text-center">
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-200">
                      No invoices selected
                    </p>
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      Use the invoice browser to add one or more unpaid
                      invoices.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2 p-3">
                    {selectedInvoices.map(
                      ({
                        invoice,
                        amountToPay,
                      }: InvoicePaymentAllocation) => {
                        const isOverpayment: boolean = isOverpaymentAllocation({
                          invoice,
                          amountToPay,
                        });
                        const isInvalidAmount: boolean =
                          !Number.isFinite(amountToPay) ||
                          amountToPay <= 0 ||
                          (isCashBill(invoice) &&
                            amountToPay > settleableOf(invoice) + 0.005);
                        const isUnsupportedOverpayment: boolean =
                          isOverpayment && !useGroupedReceipt;
                        const overpaidAmount: number = isOverpayment
                          ? amountToPay - invoice.balance_due
                          : 0;

                        return (
                          <div
                            key={invoice.id}
                            className={`rounded-lg border p-3 transition-colors ${
                              isInvalidAmount || isUnsupportedOverpayment
                                ? "border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/30"
                                : isOverpayment
                                ? "border-purple-200 bg-purple-50 dark:border-purple-800 dark:bg-purple-950/30"
                                : "border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800/60"
                            }`}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <span className="inline-flex rounded-md bg-sky-50 px-2 py-1 font-mono text-sm font-medium text-sky-700 dark:bg-sky-900/40 dark:text-sky-300">
                                  {invoice.paymenttype === "CASH" ? "C" : "I"}
                                  {invoice.id}
                                </span>
                                <p className="mt-1.5 truncate text-sm text-gray-700 dark:text-gray-200">
                                  {invoice.customerName || invoice.customerid}
                                  {invoice.customerName
                                    ? ` (${invoice.customerid})`
                                    : ""}
                                </p>
                              </div>
                              <button
                                type="button"
                                onClick={() =>
                                  handleInvoiceRemove(invoice.id)
                                }
                                className="flex-shrink-0 rounded-md p-2 text-red-500 hover:bg-red-100 hover:text-red-700 dark:hover:bg-red-900/40"
                                disabled={isSubmitting}
                                aria-label={`Remove invoice ${invoice.id}`}
                              >
                                <IconTrash size={16} />
                              </button>
                            </div>

                            <div className="mt-3 grid grid-cols-[minmax(0,1fr)_minmax(120px,0.8fr)] items-end gap-3 border-t border-gray-200 pt-3 dark:border-gray-700">
                              <div>
                                <span className="block text-[11px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                                  {isCashBill(invoice) ? "Cash collected" : "Balance due"}
                                </span>
                                <span className="mt-1 block text-sm font-semibold text-gray-900 dark:text-gray-100">
                                  {formatCurrency(settleableOf(invoice))}
                                </span>
                              </div>
                              <label>
                                <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                                  Payment amount
                                </span>
                                <input
                                  type="number"
                                  step="0.01"
                                  value={amountToPay}
                                  onChange={(
                                    event: React.ChangeEvent<HTMLInputElement>
                                  ) =>
                                    handleAmountChange(
                                      invoice.id,
                                      event.target.value === ""
                                        ? 0
                                        : Number(event.target.value)
                                    )
                                  }
                                  inputMode="decimal"
                                  aria-invalid={
                                    isInvalidAmount ||
                                    isUnsupportedOverpayment
                                  }
                                  className={`w-full rounded-lg border px-3 py-2 text-right text-sm font-medium focus:outline-none focus:ring-1 focus:ring-sky-500 dark:text-gray-100 ${
                                    isInvalidAmount ||
                                    isUnsupportedOverpayment
                                      ? "border-red-400 bg-red-50 dark:border-red-600 dark:bg-red-950/40"
                                      : isOverpayment
                                      ? "border-purple-400 bg-purple-50 dark:border-purple-600 dark:bg-purple-950/40"
                                      : "border-gray-300 bg-white dark:border-gray-600 dark:bg-gray-900"
                                  }`}
                                  disabled={isSubmitting}
                                />
                              </label>
                            </div>

                            {isOverpayment && (
                              <p
                                className={`mt-2 text-xs font-medium ${
                                  isUnsupportedOverpayment
                                    ? "text-red-600 dark:text-red-400"
                                    : "text-purple-600 dark:text-purple-400"
                                }`}
                              >
                                {isUnsupportedOverpayment
                                  ? "Above the invoice balance by"
                                  : "Customer credit after payment"}
                                : {formatCurrency(overpaidAmount)}
                              </p>
                            )}
                            {isInvalidAmount && (
                              <p className="mt-2 text-xs font-medium text-red-600 dark:text-red-400">
                                Enter an amount above RM0.
                              </p>
                            )}
                          </div>
                        );
                      }
                    )}

                    {useGroupedReceipt &&
                      selectedInvoices.some(isOverpaymentAllocation) && (
                        <div className="rounded-lg border border-purple-200 bg-purple-50 p-3 text-sm dark:border-purple-800 dark:bg-purple-950/30">
                          <div className="flex justify-between gap-3 text-purple-700 dark:text-purple-300">
                            <span>Applied to invoices</span>
                            <span className="font-medium">
                              {formatCurrency(
                                selectedInvoices.reduce(
                                  (
                                    sum: number,
                                    item: InvoicePaymentAllocation
                                  ) =>
                                    sum +
                                    Math.min(
                                      item.amountToPay,
                                      settleableOf(item.invoice)
                                    ),
                                  0
                                )
                              )}
                            </span>
                          </div>
                          <div className="mt-1 flex justify-between gap-3 text-purple-700 dark:text-purple-300">
                            <span>Customer credit</span>
                            <span className="font-medium">
                              {formatCurrency(
                                selectedInvoices.reduce(
                                  (
                                    sum: number,
                                    item: InvoicePaymentAllocation
                                  ) =>
                                    sum +
                                    (isOverpaymentAllocation(item)
                                      ? item.amountToPay -
                                        Number(item.invoice.balance_due)
                                      : 0),
                                  0
                                )
                              )}
                            </span>
                          </div>
                        </div>
                      )}

                    {/* Overpayment add-on: apply each customer's held excess
                        alongside (or instead of) the money payment */}
                    {useGroupedReceipt &&
                      selectedInvoices.length > 0 &&
                      selectedCustomerIds
                        .filter(
                          (customerId) =>
                            (overpaymentBalances[customerId] ?? 0) > 0.005
                        )
                        .map((customerId) => {
                          const available =
                            overpaymentBalances[customerId] ?? 0;
                          const applyAmount = applyAmounts[customerId] ?? 0;
                          const applying = applyAmount > 0.005;
                          return (
                            <div
                              key={customerId}
                              className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm dark:border-amber-800 dark:bg-amber-950/30"
                            >
                              <Checkbox
                                checked={applying}
                                onChange={(checked: boolean) =>
                                  setApplyAmounts((current) => ({
                                    ...current,
                                    [customerId]: checked
                                      ? Math.min(
                                          available,
                                          settleSumForCustomer(customerId)
                                        )
                                      : 0,
                                  }))
                                }
                                disabled={isSubmitting}
                                checkedColor="text-amber-600 dark:text-amber-400"
                                label={
                                  <span className="text-amber-900 dark:text-amber-100">
                                    Apply held overpayment for {customerId}{" "}
                                    (available {formatCurrency(available)})
                                  </span>
                                }
                              />
                              {applying && (
                                <div className="mt-2 flex items-center gap-2 pl-7">
                                  <span className="text-xs font-medium uppercase tracking-wide text-amber-700 dark:text-amber-300">
                                    Amount
                                  </span>
                                  <input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    value={applyAmount}
                                    onChange={(
                                      event: React.ChangeEvent<HTMLInputElement>
                                    ) =>
                                      setApplyAmounts((current) => ({
                                        ...current,
                                        [customerId]:
                                          event.target.value === ""
                                            ? 0
                                            : Number(event.target.value),
                                      }))
                                    }
                                    disabled={isSubmitting}
                                    className="w-32 rounded-lg border border-amber-300 bg-white px-2 py-1 text-right text-sm font-medium focus:outline-none focus:ring-1 focus:ring-amber-500 dark:border-amber-700 dark:bg-gray-900 dark:text-gray-100"
                                  />
                                </div>
                              )}
                            </div>
                          );
                        })}
                  </div>
                )}
              </section>
            </div>

            <div className="min-h-[30rem] border-t border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-950/40 sm:p-4 lg:min-h-0 lg:border-l lg:border-t-0 lg:p-5">
              <InvoiceSelectionTable
                invoices={filteredInvoices}
                selectedInvoiceIds={selectedInvoices.map(
                  (item: InvoicePaymentAllocation) => item.invoice.id
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
                  groupPaymentMethod === "cheque" && (
                    <span className="ml-1 text-amber-600 dark:text-amber-400">
                      - Pending until confirmed
                    </span>
                  )}
                {selectedInvoices.length > 0 &&
                  groupPaymentMethod === "cash" && (
                    <span className="ml-1 text-amber-600 dark:text-amber-400">
                      - Remains unbanked until Cash Bank-In
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
                  isCheckingReference ||
                  (!useGroupedReceipt &&
                    referenceUsage !== null &&
                    !isDuplicateReferenceConfirmed)
                }
              >
                {isSubmitting ? "Processing..." : "Record Payment"}
              </Button>
            </div>
          </div>
        </form>
      </div>
      {/* Overpayment Confirmation Dialog */}
      <ConfirmationDialog
        isOpen={showOverpaymentConfirm}
        onClose={() => {
          setShowOverpaymentConfirm(false);
          setOverpaymentDetails(null);
        }}
        onConfirm={handleConfirmOverpayment}
        title={`Overpayment${
          overpaymentDetails && overpaymentDetails.length > 1 ? "s" : ""
        } Detected`}
        message={
          overpaymentDetails ? (
            <div className="space-y-2 text-default-600 dark:text-gray-300">
              <p>
                {overpaymentDetails.length === 1
                  ? "The following payment exceeds the balance due:"
                  : `${overpaymentDetails.length} payments exceed their respective balance due:`}
              </p>

              <div className="space-y-2 max-h-[264px] overflow-y-auto">
                {overpaymentDetails.map((detail) => (
                  <div
                    key={detail.invoiceId}
                    className="bg-gray-50 dark:bg-gray-900/50 p-3 border border-gray-200 dark:border-gray-700 rounded-lg"
                  >
                    <div className="font-medium text-sm text-gray-800 dark:text-gray-100 mb-2">
                      Invoice {detail.invoiceId} - {detail.customerName}
                    </div>
                    <div className="space-y-1 text-sm">
                      <div className="flex justify-between">
                        <span>Total Payment:</span>
                        <span className="font-medium">
                          {formatCurrency(detail.totalAmount)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>Applied to Invoice:</span>
                        <span className="font-medium">
                          {formatCurrency(detail.regularAmount)}
                        </span>
                      </div>
                      <div className="flex justify-between border-t border-gray-200 dark:border-gray-700 pt-1 mt-1">
                        <span>Customer Credit:</span>
                        <span className="font-medium text-purple-600 dark:text-purple-300">
                          {formatCurrency(detail.overpaidAmount)}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Summary */}
              <div className="bg-purple-50 dark:bg-purple-900/30 p-3 border border-purple-200 dark:border-purple-700 rounded-lg">
                <div className="font-medium text-sm text-purple-800 dark:text-purple-200 mb-2">
                  Summary
                </div>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span>Total Applied to Invoices:</span>
                    <span className="font-medium">
                      {formatCurrency(
                        overpaymentDetails.reduce(
                          (sum, detail) => sum + detail.regularAmount,
                          0
                        )
                      )}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Total Customer Credit:</span>
                    <span className="font-medium text-purple-600 dark:text-purple-300">
                      {formatCurrency(
                        overpaymentDetails.reduce(
                          (sum, detail) => sum + detail.overpaidAmount,
                          0
                        )
                      )}
                    </span>
                  </div>
                  <div className="flex justify-between border-t border-purple-200 dark:border-purple-700 pt-1 mt-1">
                    <span>Grand Total:</span>
                    <span className="font-bold text-default-900 dark:text-gray-100">
                      {formatCurrency(
                        overpaymentDetails.reduce(
                          (sum, detail) => sum + detail.totalAmount,
                          0
                        )
                      )}
                    </span>
                  </div>
                </div>
              </div>

              <p className="text-sm text-gray-600 dark:text-gray-400">
                Each excess amount will be kept as unapplied customer credit
                and can be used later.
              </p>
            </div>
          ) : (
            ""
          )
        }
        confirmButtonText={`Confirm Overpayment${
          overpaymentDetails && overpaymentDetails.length > 1 ? "s" : ""
        }`}
        variant="default"
      />
      <ConfirmationDialog
        isOpen={importedReconciliation !== null}
        onClose={() => {
          if (!isSubmitting) setImportedReconciliation(null);
        }}
        onConfirm={() => void handleConfirmImportedReconciliation()}
        title="Payment already found in imported ledger"
        message={
          importedReconciliation ? (
            <div className="space-y-3 text-default-600 dark:text-gray-300">
              <p>
                The old ledger already contains this exact payment. Continuing
                will clear the invoice only; it will not create another receipt
                or journal.
              </p>
              <div className="space-y-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-800 dark:bg-emerald-950/30">
                <div className="flex justify-between gap-4">
                  <span>Invoice</span>
                  <span className="font-mono font-medium text-gray-900 dark:text-gray-100">
                    {importedReconciliation.preview.invoice_id}
                  </span>
                </div>
                <div className="flex justify-between gap-4">
                  <span>Customer</span>
                  <span className="text-right font-medium text-gray-900 dark:text-gray-100">
                    {importedReconciliation.preview.customer_name}
                  </span>
                </div>
                <div className="flex justify-between gap-4">
                  <span>Reference</span>
                  <span className="font-mono font-medium text-gray-900 dark:text-gray-100">
                    {importedReconciliation.preview.payment_reference}
                  </span>
                </div>
                <div className="flex justify-between gap-4">
                  <span>Amount</span>
                  <span className="font-medium text-gray-900 dark:text-gray-100">
                    {formatCurrency(importedReconciliation.preview.amount)}
                  </span>
                </div>
                <div className="flex justify-between gap-4">
                  <span>Entered date</span>
                  <span>
                    {formatLocalDateLabel(
                      importedReconciliation.preview.entered_payment_date
                    )}
                  </span>
                </div>
                <div className="flex justify-between gap-4 border-t border-emerald-200 pt-2 dark:border-emerald-800">
                  <span>Ledger date used</span>
                  <span className="font-semibold text-emerald-700 dark:text-emerald-300">
                    {formatLocalDateLabel(
                      importedReconciliation.preview.ledger_payment_date
                    )}
                  </span>
                </div>
              </div>
              {importedReconciliation.preview.payment_date_corrected && (
                <p className="text-amber-700 dark:text-amber-300">
                  The entered date differs from the imported ledger. The ledger
                  date above is authoritative and will be used in payment
                  history.
                </p>
              )}
              <a
                href={`/accounting/journal-entries/${importedReconciliation.preview.evidence_journal_id}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex font-medium text-sky-600 hover:underline dark:text-sky-400"
              >
                Review the existing journal
              </a>
            </div>
          ) : (
            ""
          )
        }
        confirmButtonText={
          isSubmitting ? "Clearing Invoice..." : "Use Existing Ledger Payment"
        }
        isConfirming={isSubmitting}
        variant="success"
      />
    </div>
  );
};

export default PaymentForm;
