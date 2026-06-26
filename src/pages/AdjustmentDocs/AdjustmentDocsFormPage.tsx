// src/pages/AdjustmentDocs/AdjustmentDocsFormPage.tsx
import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  IconCopy,
  IconExternalLink,
  IconPlus,
  IconTrash,
  IconSquare,
  IconSquareCheckFilled,
  IconSearch,
} from "@tabler/icons-react";
import Button from "../../components/Button";
import BackButton from "../../components/BackButton";
import LoadingSpinner from "../../components/LoadingSpinner";
import ConfirmationDialog from "../../components/ConfirmationDialog";
import { FormInput, FormListbox } from "../../components/FormComponents";
import { api } from "../../routes/utils/api";
import { formatAdjustmentDocId } from "../../utils/adjustments/formatDocId";
import toast from "react-hot-toast";
import {
  AdjustmentDocument,
  AdjustmentDocType,
  AdjustmentDocLine,
  ExtendedInvoiceData,
  Payment,
  ProductItem,
} from "../../types/types";
import {
  addMoney,
  multiplyMoney,
  sumMoney,
  roundMoney,
} from "../../utils/moneyUtils";
import {
  AdjustmentDocTypeBadge,
  AdjustmentDocStatusBadge,
} from "../../components/AdjustmentDocs/AdjustmentDocBadge";
import {
  AdjustmentDocsCompany,
  getAdjustmentDocsPaths,
} from "../../components/AdjustmentDocs/useAdjustmentDocsPaths";

interface LineState extends AdjustmentDocLine {
  uid: string;
}

interface Props {
  company?: AdjustmentDocsCompany;
}

const TYPE_LABEL: Record<AdjustmentDocType, string> = {
  credit_note: "Credit Note",
  debit_note: "Debit Note",
  refund_note: "Refund Note",
};

const PAYMENT_METHOD_OPTIONS = [
  { id: "cash", name: "Cash" },
  { id: "cheque", name: "Cheque" },
  { id: "bank_transfer", name: "Bank Transfer" },
  { id: "online", name: "Online" },
];

const BANK_ACCOUNT_OPTIONS = [
  { id: "BANK_PBB", name: "Public Bank Berhad" },
  { id: "BANK_ABB", name: "Alliance Bank Berhad" },
];

const MONEY_TOLERANCE = 0.005;

const parseType = (s: string | null): AdjustmentDocType | null => {
  if (s === "credit" || s === "credit_note") return "credit_note";
  if (s === "debit" || s === "debit_note") return "debit_note";
  if (s === "refund" || s === "refund_note") return "refund_note";
  return null;
};

const isFreeformAdjustmentCode = (code: string | null): boolean =>
  code === "OTH" || code === "LESS" || code === "REFUND";

const createBlankAdjustmentLine = (): LineState => ({
  uid: crypto.randomUUID(),
  code: "",
  description: "",
  quantity: 1,
  price: 0,
  tax: 0,
  total: 0,
  issubtotal: false,
});

const createCreditNoteDiscountLine = (invoiceTotal: number): LineState => {
  const discountAmount = roundMoney(Number(invoiceTotal || 0) * 0.03);
  return {
    uid: crypto.randomUUID(),
    code: "DISC",
    description: "Discount 3%",
    quantity: 1,
    price: discountAmount,
    tax: 0,
    total: discountAmount,
    issubtotal: false,
  };
};

const createOriginalInvoiceLine = (product: ProductItem): LineState => ({
  uid: crypto.randomUUID(),
  code: product.code,
  description: product.description || "",
  quantity: Number(product.quantity || 0),
  price: Number(product.price || 0),
  tax: Number(product.tax || 0),
  total: Number(product.total || 0),
  issubtotal: false,
});

const createVarianceTemplateLine = (product: ProductItem): LineState => ({
  uid: crypto.randomUUID(),
  code: product.code,
  description: product.description || "",
  quantity: 1,
  price: Number(product.price || 0),
  tax:
    Number(product.quantity || 0) > 0
      ? roundMoney(Number(product.tax || 0) / Number(product.quantity || 0))
      : Number(product.tax || 0),
  total: addMoney(
    Number(product.price || 0),
    Number(product.quantity || 0) > 0
      ? roundMoney(Number(product.tax || 0) / Number(product.quantity || 0))
      : Number(product.tax || 0)
  ),
  issubtotal: false,
});

const getActiveDebitNoteTotal = (
  adjustmentDocs: AdjustmentDocument[] | undefined
): number =>
  roundMoney(
    (adjustmentDocs || [])
      .filter(
        (doc: AdjustmentDocument) =>
          doc.status === "active" &&
          !doc.is_consolidated &&
          doc.type === "debit_note"
      )
      .reduce(
        (sum: number, doc: AdjustmentDocument) =>
          sum + Number(doc.totalamountpayable || 0),
        0
      )
  );

const getMaxCreditNoteAmount = (sourceInvoice: ExtendedInvoiceData): number =>
  roundMoney(
    Number(sourceInvoice.totalamountpayable || 0) +
      getActiveDebitNoteTotal(sourceInvoice.adjustmentDocs)
  );

const AdjustmentDocsFormPage: React.FC<Props> = ({ company = "tienhock" }) => {
  const navigate = useNavigate();
  const paths = getAdjustmentDocsPaths(company);
  const [params, setParams] = useSearchParams();
  const type = parseType(params.get("type"));
  const urlInvoiceId = params.get("invoiceId") || "";
  const paymentIdParam = params.get("paymentId");
  const linkedPaymentId = paymentIdParam ? parseInt(paymentIdParam, 10) : null;
  const pairedCreditNoteId: string = params.get("creditNoteId") || "";

  // Effective invoice id — starts from URL but can be set by the in-form picker
  // when the user opened the page without a preselected invoice.
  const [invoiceId, setInvoiceId] = useState<string>(urlInvoiceId);

  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showBackConfirm, setShowBackConfirm] = useState(false);
  // Predicted next document id for this type (preview only — the final id is
  // assigned on save and may differ if another doc is created in between).
  const [previewDocId, setPreviewDocId] = useState<string>("");

  const [invoice, setInvoice] = useState<ExtendedInvoiceData | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [linkedPayment, setLinkedPayment] = useState<Payment | null>(null);
  const [pairedCreditNote, setPairedCreditNote] =
    useState<AdjustmentDocument | null>(null);

  // Invoice picker state (only used when no invoiceId in URL)
  const [pickerQuery, setPickerQuery] = useState("");
  const [pickerResults, setPickerResults] = useState<any[]>([]);
  const [pickerLoading, setPickerLoading] = useState(false);

  const [reason, setReason] = useState("");
  const [lines, setLines] = useState<LineState[]>([]);
  const [hasLineUserEdits, setHasLineUserEdits] = useState<boolean>(false);
  const [rounding, setRounding] = useState<number>(0);

  // Refund-specific
  const [refundMethod, setRefundMethod] = useState<Payment["payment_method"]>(
    "cash"
  );
  const [bankAccount, setBankAccount] = useState<Payment["bank_account"]>(
    "BANK_PBB"
  );
  const [refundReference, setRefundReference] = useState("");

  // CN-paired-RN
  const [issuePairedRefund, setIssuePairedRefund] = useState(false);

  // Fetch the predicted next document id to preview in the header.
  useEffect(() => {
    if (!type) return;
    let cancelled = false;
    api
      .get(`${paths.apiBase}/next-number/${type}`)
      .then((res: { next_id?: string }) => {
        if (!cancelled) setPreviewDocId(res?.next_id || "");
      })
      .catch(() => {
        if (!cancelled) setPreviewDocId("");
      });
    return () => {
      cancelled = true;
    };
  }, [paths.apiBase, type]);

  const isCN = type === "credit_note";
  const isDN = type === "debit_note";
  const isRN = type === "refund_note";
  const isReplacementPairedRefund: boolean = isRN && Boolean(pairedCreditNoteId);

  const invoiceBalanceDue: number = invoice
    ? roundMoney(Number(invoice.balance_due || 0))
    : 0;
  const maxCreditNoteAmount: number = invoice
    ? getMaxCreditNoteAmount(invoice)
    : 0;

  // A paired Refund Note only makes sense when the customer has actually paid
  // and the Credit Note exceeds the current outstanding balance.
  const hasReceivedPayment: boolean =
    invoice?.paymenttype === "CASH" ||
    payments.some((p: Payment) =>
      ["active", "overpaid"].includes(p.status || "")
    );
  const balanceBeforeReplacementCreditNote: number =
    isReplacementPairedRefund && pairedCreditNote
      ? roundMoney(invoiceBalanceDue + Number(pairedCreditNote.totalamountpayable || 0))
      : invoiceBalanceDue;

  const buildInvoiceProductLines = useCallback(
    (sourceInvoice: ExtendedInvoiceData, useOriginalLines: boolean): LineState[] =>
      sourceInvoice.products
        .filter((p: ProductItem) => !p.issubtotal && !p.istotal)
        .map((p: ProductItem) =>
          useOriginalLines
            ? createOriginalInvoiceLine(p)
            : createVarianceTemplateLine(p)
        ),
    []
  );

  // ----- Validate type only (invoiceId can be picked in-form) -----
  useEffect(() => {
    if (!type) {
      toast.error("Missing required parameter: type");
      navigate(paths.uiBase, { replace: true });
    }
  }, [type, navigate]);

  // ----- Picker search (debounced) — only when no invoice selected yet -----
  useEffect(() => {
    if (invoiceId) return; // no picker needed when invoice already chosen
    let cancelled = false;
    const t = setTimeout(async () => {
      setPickerLoading(true);
      try {
        const params = new URLSearchParams();
        params.set("page", "1");
        params.set("limit", "50");
        if (pickerQuery.trim()) params.set("search", pickerQuery.trim());
        const response: any = await api.get(`${paths.invoicesSearchApi}?${params.toString()}`);
        if (cancelled) return;
        const rows = Array.isArray(response?.data)
          ? response.data
          : Array.isArray(response)
          ? response
          : [];
        // Exclude cancelled invoices from picker
        const filtered = rows.filter((r: any) => r.invoice_status !== "cancelled");
        setPickerResults(filtered);
      } catch (e) {
        if (!cancelled) setPickerResults([]);
      } finally {
        if (!cancelled) setPickerLoading(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [invoiceId, pickerQuery]);

  // ----- Load invoice + linked payment (only when invoiceId is set) -----
  useEffect(() => {
    if (!type || !invoiceId) return;

    const load = async () => {
      setIsLoading(true);
      try {
        const inv = (await api.get(
          `${paths.invoiceApiBase}/${invoiceId}`
        )) as ExtendedInvoiceData;
        if (!inv) {
          toast.error(`Invoice ${invoiceId} not found`);
          navigate(paths.uiBase, { replace: true });
          return;
        }
        if (inv.invoice_status === "cancelled") {
          toast.error("Cannot create adjustment for a cancelled invoice");
          navigate(`${paths.invoiceUiBase}/${invoiceId}`, { replace: true });
          return;
        }
        const pays = (await api.get(
          `${paths.paymentsApiBase}?invoice_id=${invoiceId}&include_cancelled=false`
        )) as Payment[];
        setPayments(pays || []);

        const docsResponse = (await api.get(
          `${paths.apiBase}?original_invoice_id=${invoiceId}&include_cancelled=false`
        )) as AdjustmentDocument[];
        const invoiceAdjustmentDocs: AdjustmentDocument[] = Array.isArray(
          docsResponse
        )
          ? docsResponse
          : [];
        const invoiceWithAdjustments: ExtendedInvoiceData = {
          ...inv,
          adjustmentDocs: invoiceAdjustmentDocs,
        };
        setInvoice(invoiceWithAdjustments);
        setPairedCreditNote(null);

        let loadedPairedCreditNote: AdjustmentDocument | null = null;
        if (isReplacementPairedRefund) {
          const creditNote = (await api.get(
            `${paths.apiBase}/${pairedCreditNoteId}`
          )) as AdjustmentDocument;
          if (
            creditNote.type !== "credit_note" ||
            creditNote.original_invoice_id !== invoiceId ||
            creditNote.status !== "active"
          ) {
            toast.error("Active Credit Note not found for this invoice");
            navigate(`${paths.invoiceUiBase}/${invoiceId}`, { replace: true });
            return;
          }
          if (creditNote.paired_with_id) {
            const pairedDoc = (await api.get(
              `${paths.apiBase}/${creditNote.paired_with_id}`
            )) as AdjustmentDocument;
            if (pairedDoc.status === "active") {
              toast.error("This Credit Note already has an active Refund Note");
              navigate(`${paths.uiBase}/${creditNote.id}`, { replace: true });
              return;
            }
          }
          loadedPairedCreditNote = creditNote;
          setPairedCreditNote(creditNote);
        }

        // Standalone RN: validate linked payment is overpaid
        if (isRN && linkedPaymentId && !isReplacementPairedRefund) {
          const lp = (pays || []).find(
            (p) => p.payment_id === linkedPaymentId && p.status === "overpaid"
          );
          if (!lp) {
            toast.error(
              "Linked payment not found or not in overpaid status"
            );
            navigate(`${paths.invoiceUiBase}/${invoiceId}`, { replace: true });
            return;
          }
          setLinkedPayment(lp);
        }

        // Default CN pair toggle: OFF. The option remains available when the
        // Credit Note exceeds the outstanding balance, but the user must opt in.
        if (isCN) {
          setIssuePairedRefund(false);
        }
        setHasLineUserEdits(false);

        // Pre-fill lines:
        //  - CN paired with RN: full original lines for full reversal/refund.
        //  - CN without RN / DN: variance-style lines.
        //  - RN standalone: single line for the overpaid amount
        if (isReplacementPairedRefund && loadedPairedCreditNote?.lines?.length) {
          const creditNoteTotal: number = roundMoney(
            Number(loadedPairedCreditNote.totalamountpayable || 0)
          );
          const balanceBeforeCreditNote: number = roundMoney(
            Number(inv.balance_due || 0) + creditNoteTotal
          );
          const refundableExcess: number = roundMoney(
            Math.min(
              creditNoteTotal,
              Math.max(0, creditNoteTotal - Math.max(balanceBeforeCreditNote, 0))
            )
          );
          setLines([
            {
              uid: crypto.randomUUID(),
              code: "REFUND",
              description: `Bayaran balik lebihan daripada Nota Kredit ${formatAdjustmentDocId(
                loadedPairedCreditNote.id
              )}`,
              quantity: 1,
              price: refundableExcess,
              tax: 0,
              total: refundableExcess,
              issubtotal: false,
            },
          ]);
        } else if (isRN && linkedPaymentId) {
          const overpaidAmt = (pays || []).find(
            (p) => p.payment_id === linkedPaymentId
          )?.amount_paid;
          setLines([
            {
              uid: crypto.randomUUID(),
              code: "REFUND",
              description: `Bayaran balik untuk bayaran lebih #${linkedPaymentId}`,
              quantity: 1,
              price: Number(overpaidAmt || 0),
              tax: 0,
              total: Number(overpaidAmt || 0),
              issubtotal: false,
            },
          ]);
        } else if (isRN) {
          // Standalone unlinked RN — no overpayment, no paired CN. Start with
          // one empty REFUND line; user fills in the amount and reason.
          setLines([
            {
              uid: crypto.randomUUID(),
              code: "REFUND",
              description: "",
              quantity: 1,
              price: 0,
              tax: 0,
              total: 0,
              issubtotal: false,
            },
          ]);
        } else if (isCN) {
          setLines([createCreditNoteDiscountLine(Number(inv.totalamountpayable || 0))]);
        } else if (isDN && inv.products && inv.products.length > 0) {
          setLines(buildInvoiceProductLines(invoiceWithAdjustments, false));
        } else {
          setLines([createBlankAdjustmentLine()]);
        }
      } catch (error: any) {
        console.error(error);
        toast.error(error?.message || "Failed to load invoice");
        navigate(paths.uiBase, { replace: true });
      } finally {
        setIsLoading(false);
      }
    };

    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    type,
    invoiceId,
    linkedPaymentId,
    pairedCreditNoteId,
    buildInvoiceProductLines,
  ]);

  // ----- Totals (sen-safe) -----
  const totals = useMemo(() => {
    const subtotals: number[] = [];
    const taxes: number[] = [];
    lines.forEach((l) => {
      if (l.issubtotal) return;
      const qty = Number(l.quantity || 0);
      const price = Number(l.price || 0);
      const subtotal =
        isFreeformAdjustmentCode(l.code)
          ? price
          : multiplyMoney(price, qty);
      subtotals.push(subtotal);
      taxes.push(Number(l.tax || 0));
    });
    const subtotal = sumMoney(subtotals);
    const taxTotal = sumMoney(taxes);
    const grand = addMoney(addMoney(subtotal, taxTotal), Number(rounding || 0));
    return {
      total_excluding_tax: roundMoney(subtotal),
      tax_amount: roundMoney(taxTotal),
      rounding: roundMoney(Number(rounding || 0)),
      totalamountpayable: roundMoney(grand),
    };
  }, [lines, rounding]);
  // Paired RN is bounded by two things:
  //   (a) the excess of the CN over the outstanding balance — only that part
  //       is "refundable" rather than a balance reduction; and
  //   (b) the value the customer has actually given us (adjusted invoice
  //       total minus current balance). We can never refund more cash than
  //       was received, even if the CN line items add up to more.
  const pairedRefundAmount: number = isCN
    ? roundMoney(
        Math.max(
          0,
          Math.min(
            totals.totalamountpayable - Math.max(invoiceBalanceDue, 0),
            maxCreditNoteAmount - Math.max(invoiceBalanceDue, 0)
          )
        )
      )
    : 0;
  const canPairRefund: boolean =
    isCN && hasReceivedPayment && pairedRefundAmount > MONEY_TOLERANCE;

  useEffect(() => {
    if (issuePairedRefund && !canPairRefund) {
      setIssuePairedRefund(false);
    }
  }, [canPairRefund, issuePairedRefund]);

  // ----- Line item handlers -----
  const updateLine = useCallback(
    (uid: string, patch: Partial<LineState>) => {
      setHasLineUserEdits(true);
      setLines((prev) =>
        prev.map((l) => {
          if (l.uid !== uid) return l;
          const next = { ...l, ...patch };
          const qty = Number(next.quantity || 0);
          const price = Number(next.price || 0);
          const tax = Number(next.tax || 0);
          const lineTotal =
            isFreeformAdjustmentCode(next.code)
              ? addMoney(price, tax)
              : addMoney(multiplyMoney(price, qty), tax);
          next.total = roundMoney(lineTotal);
          return next;
        })
      );
    },
    []
  );

  const addLine = (): void => {
    setHasLineUserEdits(true);
    setLines((prev: LineState[]) => [...prev, createBlankAdjustmentLine()]);
  };

  const removeLine = (uid: string): void => {
    setHasLineUserEdits(true);
    setLines((prev) => prev.filter((l) => l.uid !== uid));
  };

  const copyFromOriginal = (): void => {
    if (!invoice?.products) return;
    setHasLineUserEdits(true);
    setLines(buildInvoiceProductLines(invoice, isCN && issuePairedRefund));
  };

  const handlePairedRefundToggle = (): void => {
    if (!canPairRefund) return;
    const nextIssuePairedRefund: boolean = !issuePairedRefund;
    setIssuePairedRefund(nextIssuePairedRefund);

    if (!hasLineUserEdits && invoice) {
      if (nextIssuePairedRefund && invoice.products?.length) {
        setLines(buildInvoiceProductLines(invoice, true));
      } else {
        setLines([createCreditNoteDiscountLine(Number(invoice.totalamountpayable || 0))]);
      }
    }
  };

  // ----- Validation -----
  const validate = (): string[] => {
    const errors: string[] = [];
    if (lines.length === 0) errors.push("At least one line item required");
    const nonSub = lines.filter((l) => !l.issubtotal);
    if (nonSub.length === 0) errors.push("At least one product line required");
    nonSub.forEach((l, i) => {
      if (!l.code && !l.description)
        errors.push(`Line ${i + 1}: code or description required`);
      const total = Number(l.total || 0);
      if (!isFinite(total)) errors.push(`Line ${i + 1}: invalid total`);
      const qty = Number(l.quantity || 0);
      const price = Number(l.price || 0);
      const isFreeformAmount = isFreeformAdjustmentCode(l.code);
      if (!isFreeformAmount && qty <= 0)
        errors.push(`Line ${i + 1}: quantity must be greater than 0`);
      if (l.code !== "LESS" && price < 0)
        errors.push(`Line ${i + 1}: price cannot be negative`);
    });
    if (totals.totalamountpayable <= 0)
      errors.push("Document total must be greater than 0");

    if (isCN && invoice) {
      const currentBalanceDue: number = roundMoney(
        Number(invoice.balance_due || 0)
      );
      if (totals.totalamountpayable > maxCreditNoteAmount) {
        errors.push(
          `Credit Note amount cannot exceed adjusted invoice total RM ${maxCreditNoteAmount.toFixed(
            2
          )}`
        );
      }
      if (
        !hasReceivedPayment &&
        totals.totalamountpayable > currentBalanceDue
      ) {
        errors.push(
          `Credit Note amount cannot exceed unpaid balance RM ${currentBalanceDue.toFixed(
            2
          )} when the invoice has no received payment`
        );
      }
    }

    if (isRN) {
      if (!refundMethod) errors.push("Refund method required");
      if (refundMethod !== "cash" && !bankAccount)
        errors.push("Bank account required for non-cash refund");
      if (isReplacementPairedRefund && !pairedCreditNote) {
        errors.push("Credit Note link required for replacement Refund Note");
      }
      if (isReplacementPairedRefund && pairedCreditNote) {
        if (totals.totalamountpayable > pairedCreditNote.totalamountpayable) {
          errors.push(
            `Refund amount cannot exceed Credit Note amount RM ${pairedCreditNote.totalamountpayable.toFixed(
              2
            )}`
          );
        }
      }
      if (linkedPayment) {
        if (totals.totalamountpayable > linkedPayment.amount_paid) {
          errors.push(
            `Refund amount cannot exceed overpaid amount RM ${linkedPayment.amount_paid.toFixed(
              2
            )}`
          );
        }
      }
    }

    if (isCN && issuePairedRefund && canPairRefund) {
      if (refundMethod !== "cash" && !bankAccount)
        errors.push("Paired refund requires bank account for non-cash method");
    }
    if (isCN && issuePairedRefund && !canPairRefund) {
      errors.push(
        `Paired refund is only available when the Credit Note exceeds the current outstanding balance. Current outstanding balance: RM ${invoiceBalanceDue.toFixed(
          2
        )}`
      );
    }
    if (isReplacementPairedRefund && pairedCreditNote) {
      const maxReplacementRefundAmount: number = roundMoney(
        Math.min(
          Number(pairedCreditNote.totalamountpayable || 0),
          Math.max(
            0,
            Number(pairedCreditNote.totalamountpayable || 0) -
              Math.max(balanceBeforeReplacementCreditNote, 0)
          )
        )
      );
      if (maxReplacementRefundAmount <= MONEY_TOLERANCE) {
        errors.push(
          `Refund Note cannot be paired because Credit Note ${formatAdjustmentDocId(
            pairedCreditNote.id
          )} did not create a refundable excess. Issue the Credit Note alone to reduce the balance.`
        );
      } else if (totals.totalamountpayable > maxReplacementRefundAmount) {
        errors.push(
          `Refund amount cannot exceed the refundable excess RM ${maxReplacementRefundAmount.toFixed(
            2
          )} from Credit Note ${formatAdjustmentDocId(pairedCreditNote.id)}.`
        );
      }
    }

    return errors;
  };

  const handleSubmit = async () => {
    const errs = validate();
    if (errs.length) {
      errs.forEach((e) => toast.error(e));
      return;
    }
    if (!invoice || !type) return;

    setIsSaving(true);
    const toastId = toast.loading("Creating adjustment document...");
    try {
      const payload: any = {
        type,
        original_invoice_id: invoice.id,
        reason: reason || null,
        lines: lines.map((l) => ({
          code: l.code,
          description: l.description,
          quantity: l.quantity,
          price: l.price,
          tax: l.tax,
          total: l.total,
          issubtotal: l.issubtotal,
        })),
        total_excluding_tax: totals.total_excluding_tax,
        tax_amount: totals.tax_amount,
        rounding: totals.rounding,
        totalamountpayable: totals.totalamountpayable,
      };

      if (isRN) {
        payload.refund_method = refundMethod;
        payload.refund_reference = refundReference || null;
        payload.bank_account = refundMethod === "cash" ? "CASH" : bankAccount;
        if (linkedPaymentId) payload.linked_payment_id = linkedPaymentId;
        if (pairedCreditNoteId) payload.paired_credit_note_id = pairedCreditNoteId;
      }

      if (isCN && issuePairedRefund && canPairRefund) {
        const pairedRefundLines = [
          {
            code: "REFUND",
            description: `Bayaran balik lebihan daripada ${TYPE_LABEL[type]}`,
            quantity: 1,
            price: pairedRefundAmount,
            tax: 0,
            total: pairedRefundAmount,
            issubtotal: false,
          },
        ];
        payload.paired_refund = {
          totalamountpayable: pairedRefundAmount,
          total_excluding_tax: pairedRefundAmount,
          tax_amount: 0,
          rounding: 0,
          refund_method: refundMethod,
          refund_reference: refundReference || null,
          bank_account: refundMethod === "cash" ? "CASH" : bankAccount,
          reason: reason || null,
          lines: pairedRefundLines,
        };
      }

      const response = await api.post(paths.apiBase, payload);
      toast.success(response.message || "Document created", { id: toastId });
      navigate(`${paths.uiBase}/${response.document.id}`, {
        replace: true,
      });
    } catch (error: any) {
      toast.error(error?.message || "Failed to create document", { id: toastId });
    } finally {
      setIsSaving(false);
    }
  };

  const isFormDirty =
    reason.length > 0 || lines.some((l) => l.code || l.description);

  const handleBackClick = () => {
    if (isFormDirty && !isSaving) {
      setShowBackConfirm(true);
    } else {
      navigate(invoice ? `${paths.invoiceUiBase}/${invoice.id}` : paths.uiBase);
    }
  };

  if (!type) {
    return (
      <div className="mt-40 flex justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  // ----- Invoice picker (no invoiceId yet) -----
  if (!invoiceId) {
    const formatTimestamp = (ts: string | undefined): string => {
      if (!ts) return "—";
      const n = Number(ts);
      if (!isFinite(n)) return "—";
      const d = new Date(n);
      return isNaN(d.getTime()) ? "—" : d.toLocaleDateString("en-GB");
    };

    return (
      <div className="space-y-4">
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-default-200 dark:border-gray-700">
          <div className="px-6 py-3 border-b border-default-200 dark:border-gray-700 flex flex-col md:flex-row justify-between items-start md:items-center gap-2">
            <div className="flex items-center gap-3">
              <BackButton onClick={() => navigate(paths.uiBase)} />
              <div className="h-6 w-px bg-default-300 dark:bg-gray-600" />
              <h1 className="text-xl font-semibold text-default-900 dark:text-gray-100">
                {TYPE_LABEL[type]} Baru - Pilih Invois
              </h1>
            </div>
          </div>

          <div className="p-4 border-b border-default-200 dark:border-gray-700">
            <p className="text-sm text-default-600 dark:text-gray-300 mb-3">
              Pilih invois yang anda mahu laraskan. Senarai di bawah hanya
              memaparkan <strong>50 invois terkini</strong> - gunakan kotak
              carian untuk mencari invois yang lebih lama (mengikut nombor
              invois, nama pelanggan, atau jumlah).
            </p>
            <div className="relative">
              <IconSearch
                className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 dark:text-gray-500"
                size={18}
              />
              <input
                autoFocus
                type="text"
                placeholder="Cari mengikut nombor invois, nama pelanggan, atau jumlah..."
                className="w-full pl-10 pr-3 py-2 border border-default-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-default-900 dark:text-gray-100 placeholder:text-default-400 dark:placeholder:text-gray-400 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent"
                value={pickerQuery}
                onChange={(e) => setPickerQuery(e.target.value)}
              />
            </div>
          </div>

          <div>
            {pickerLoading ? (
              <div className="flex justify-center items-center py-12">
                <LoadingSpinner size="sm" />
              </div>
            ) : pickerResults.length === 0 ? (
              <div className="p-8 text-center text-sm text-default-500 dark:text-gray-400">
                {pickerQuery
                  ? "Tiada invois yang sepadan ditemui."
                  : "Tiada invois untuk dipaparkan."}
              </div>
            ) : (
              <table className="min-w-full divide-y divide-default-200 dark:divide-gray-700">
                <thead className="bg-default-50 dark:bg-gray-800 sticky top-0 z-10">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-default-500 dark:text-gray-300 uppercase">
                      Invoice
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-default-500 dark:text-gray-300 uppercase">
                      Customer
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-default-500 dark:text-gray-300 uppercase">
                      Date
                    </th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-default-500 dark:text-gray-300 uppercase">
                      Total
                    </th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-default-500 dark:text-gray-300 uppercase">
                      Balance
                    </th>
                    <th className="px-4 py-2 text-center text-xs font-medium text-default-500 dark:text-gray-300 uppercase">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-800 divide-y divide-default-100 dark:divide-gray-700">
                  {pickerResults.map((inv: any) => (
                    <tr
                      key={inv.id}
                      onClick={() => {
                        // Persist selection in URL so refresh keeps the state
                        const next = new URLSearchParams(params);
                        next.set("invoiceId", String(inv.id));
                        setParams(next, { replace: true });
                        setInvoiceId(String(inv.id));
                      }}
                      className="hover:bg-sky-50 dark:hover:bg-sky-900/20 cursor-pointer transition-colors duration-150"
                    >
                      <td className="px-4 py-2 text-sm font-medium text-default-900 dark:text-gray-100">
                        {inv.id}
                      </td>
                      <td className="px-4 py-2 text-sm text-default-700 dark:text-gray-200">
                        {inv.customerName || inv.customerid}
                      </td>
                      <td className="px-4 py-2 text-sm text-default-500 dark:text-gray-400">
                        {formatTimestamp(inv.createddate)}
                      </td>
                      <td className="px-4 py-2 text-sm text-right text-default-700 dark:text-gray-200">
                        RM {Number(inv.totalamountpayable || 0).toFixed(2)}
                      </td>
                      <td className="px-4 py-2 text-sm text-right text-default-700 dark:text-gray-200">
                        RM {Number(inv.balance_due || 0).toFixed(2)}
                      </td>
                      <td className="px-4 py-2 text-xs text-center capitalize">
                        {inv.invoice_status || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (isLoading || !invoice) {
    return (
      <div className="mt-40 flex justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  const showRefundFields = isRN || (isCN && issuePairedRefund && canPairRefund);

  return (
    <div className="space-y-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-default-200 dark:border-gray-700">
        {/* Header */}
        <div className="px-6 py-3 border-b border-default-200 dark:border-gray-700 flex flex-col md:flex-row justify-between items-start md:items-center gap-2">
          <div className="flex items-center gap-3">
            <BackButton onClick={handleBackClick} disabled={isSaving} />
            <div className="h-6 w-px bg-default-300 dark:bg-gray-600" />
            <h1 className="text-xl font-semibold text-default-900 dark:text-gray-100 flex items-center gap-2">
              New {TYPE_LABEL[type]}
              <AdjustmentDocTypeBadge type={type} />
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <Button
              onClick={handleSubmit}
              variant="filled"
              color="sky"
              size="md"
              disabled={isSaving}
            >
              {isSaving ? "Saving..." : `Create ${TYPE_LABEL[type]}`}
            </Button>
          </div>
        </div>

        {/* Original invoice summary */}
        <div className="p-4 border-b border-default-200 dark:border-gray-700 bg-default-50/60 dark:bg-gray-900/30">
          <div className="grid grid-cols-2 md:grid-cols-6 gap-4 text-sm">
            <div>
              <div className="text-default-500 dark:text-gray-400 text-xs uppercase tracking-wider">
                Document No.
              </div>
              <div
                className="font-medium text-default-900 dark:text-gray-100 w-fit"
                title="Predicted next number — the final number is assigned when you save"
              >
                {previewDocId ? formatAdjustmentDocId(previewDocId) : "—"}
              </div>
            </div>
            <div>
              <div className="text-default-500 dark:text-gray-400 text-xs uppercase tracking-wider">
                Original Invoice
              </div>
              <div
                className="font-medium text-default-900 dark:text-gray-100 flex items-center gap-1 cursor-pointer hover:text-sky-600 dark:hover:text-sky-400 w-fit"
                onClick={() => navigate(`${paths.invoiceUiBase}/${invoice.id}`)}
                title="Open invoice"
              >
                {invoice.id}
                <IconExternalLink size={14} className="text-sky-600 dark:text-sky-400" />
              </div>
            </div>
            <div>
              <div className="text-default-500 dark:text-gray-400 text-xs uppercase tracking-wider">
                Customer
              </div>
              <div className="font-medium text-default-900 dark:text-gray-100">
                {invoice.customerName || invoice.customerid}
              </div>
            </div>
            <div>
              <div className="text-default-500 dark:text-gray-400 text-xs uppercase tracking-wider">
                Invoice Total
              </div>
              <div className="font-medium text-default-900 dark:text-gray-100">
                RM {Number(invoice.totalamountpayable).toFixed(2)}
              </div>
            </div>
            <div>
              <div className="text-default-500 dark:text-gray-400 text-xs uppercase tracking-wider">
                Balance Due
              </div>
              <div className="font-medium text-default-900 dark:text-gray-100">
                RM {Number(invoice.balance_due).toFixed(2)}
              </div>
            </div>
            <div>
              <div className="text-default-500 dark:text-gray-400 text-xs uppercase tracking-wider mb-0.5">
                Invoice e-Status
              </div>
              <div className="font-medium text-default-900 dark:text-gray-100">
                <AdjustmentDocStatusBadge
                  status={
                    (invoice.invoice_status === "cancelled"
                      ? "cancelled"
                      : "active") as "active" | "cancelled"
                  }
                  einvoiceStatus={invoice.einvoice_status ?? null}
                />
              </div>
            </div>
          </div>
          {linkedPayment && (
            <div className="mt-3 p-3 rounded-lg bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800 text-sm">
              <span className="font-medium text-indigo-800 dark:text-indigo-300">
                Membayar balik bayaran lebih #{linkedPayment.payment_id}
              </span>
              <span className="ml-2 text-indigo-700 dark:text-indigo-400">
                (Tersedia: RM {Number(linkedPayment.amount_paid).toFixed(2)})
              </span>
            </div>
          )}
          {pairedCreditNote && (
            <div className="mt-3 p-3 rounded-lg bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800 text-sm">
              <span className="font-medium text-indigo-800 dark:text-indigo-300">
                Reissuing Refund Note for Credit Note{" "}
                {formatAdjustmentDocId(pairedCreditNote.id)}
              </span>
              <span className="ml-2 text-indigo-700 dark:text-indigo-400">
                (Tersedia: RM {Number(pairedCreditNote.totalamountpayable).toFixed(2)})
              </span>
            </div>
          )}
          {isRN && !linkedPayment && !pairedCreditNote && !isReplacementPairedRefund && (
            <div className="mt-3 p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-sm text-amber-800 dark:text-amber-300">
              <div className="font-medium mb-1">
                Nota Bayaran Balik sendiri (tiada bayaran lebih, tiada Nota
                Kredit berpasangan)
              </div>
              <div className="text-xs">
                Catatan perakaunan ialah{" "}
                <span className="font-mono">Dr Deposit Pelanggan / Cr Bank</span>.
                Ini sesuai untuk membayar balik baki kredit pelanggan yang masih
                belum digunakan. Jika anda juga perlu membalikkan jualan asal,
                keluarkan Nota Kredit sebaliknya (ia boleh menggandingkan Nota
                Bayaran Balik secara automatik). Untuk kes lain, catat jurnal
                pelarasan selepas mencipta RN.
              </div>
            </div>
          )}
        </div>

        {/* Reason */}
        <div className="p-4 border-b border-default-200 dark:border-gray-700">
          <label className="block text-sm font-medium text-default-700 dark:text-gray-300 mb-1">
            Reason / Description
          </label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={
              isCN
                ? "cth. Barang rosak dipulangkan"
                : isDN
                ? "cth. Caj bayaran lewat"
                : isReplacementPairedRefund
                ? `Bayaran balik gantian untuk Nota Kredit ${formatAdjustmentDocId(
                    pairedCreditNoteId
                  )}`
                : "cth. Bayaran balik untuk bayaran lebih"
            }
            rows={2}
            className="w-full px-3 py-2 border border-default-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-default-900 dark:text-gray-100 placeholder:text-default-400 dark:placeholder:text-gray-400 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent"
            disabled={isSaving}
          />
        </div>

        {/* Line Items */}
        <div className="p-4 border-b border-default-200 dark:border-gray-700">
          <div className="flex justify-between items-center mb-3">
            <h2 className="text-lg font-semibold text-default-900 dark:text-gray-100">
              Line Items
            </h2>
            <div className="flex items-center gap-2">
              {!isRN && (
                <Button
                  onClick={copyFromOriginal}
                  icon={IconCopy}
                  variant="outline"
                  size="sm"
                  disabled={isSaving}
                >
                  {isCN && issuePairedRefund
                    ? "Use Original Items"
                    : "Set Quantities to 1"}
                </Button>
              )}
              <Button
                onClick={addLine}
                icon={IconPlus}
                variant="outline"
                size="sm"
                disabled={isSaving}
              >
                Add Line
              </Button>
            </div>
          </div>
          {!isRN && (
            <div className="mb-3 rounded-lg border border-sky-200 dark:border-sky-800 bg-sky-50/70 dark:bg-sky-900/20 px-3 py-2 text-xs text-sky-800 dark:text-sky-300">
              Masukkan beza yang terlibat sahaja. Untuk pembetulan harga,
              gunakan kuantiti terlibat dan beza harga setiap item. Untuk
              pulangan, kekurangan, atau barang rosak, gunakan kuantiti
              terlibat dan harga unit asal. Nota Debit akan menambah jumlah ini
              kepada baki invois; Nota Kredit akan mengurangkannya.
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-default-200 dark:divide-gray-700 border border-default-200 dark:border-gray-700 rounded-lg">
              <thead className="bg-default-50 dark:bg-gray-900/50">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium text-default-500 dark:text-gray-300 uppercase">
                    Code
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-default-500 dark:text-gray-300 uppercase">
                    Description
                  </th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-default-500 dark:text-gray-300 uppercase w-24">
                    Qty
                  </th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-default-500 dark:text-gray-300 uppercase w-28">
                    Price
                  </th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-default-500 dark:text-gray-300 uppercase w-24">
                    Tax
                  </th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-default-500 dark:text-gray-300 uppercase w-28">
                    Total
                  </th>
                  <th className="w-12" />
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-800 divide-y divide-default-100 dark:divide-gray-700">
                {lines.map((line) => (
                  <tr key={line.uid}>
                    <td className="px-2 py-1">
                      <input
                        type="text"
                        value={line.code || ""}
                        onChange={(e) =>
                          updateLine(line.uid, { code: e.target.value })
                        }
                        className="w-full px-2 py-1 border border-default-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-default-900 dark:text-gray-100 rounded text-sm"
                        disabled={isSaving}
                      />
                    </td>
                    <td className="px-2 py-1">
                      <input
                        type="text"
                        value={line.description || ""}
                        onChange={(e) =>
                          updateLine(line.uid, { description: e.target.value })
                        }
                        className="w-full px-2 py-1 border border-default-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-default-900 dark:text-gray-100 rounded text-sm"
                        disabled={isSaving}
                      />
                    </td>
                    <td className="px-2 py-1">
                      <input
                        type="number"
                        value={line.quantity ?? 0}
                        onChange={(e) =>
                          updateLine(line.uid, { quantity: Number(e.target.value) })
                        }
                        className="w-full px-2 py-1 border border-default-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-default-900 dark:text-gray-100 rounded text-sm text-right"
                        disabled={isSaving}
                      />
                    </td>
                    <td className="px-2 py-1">
                      <input
                        type="number"
                        step="0.1"
                        value={line.price ?? 0}
                        onChange={(e) =>
                          updateLine(line.uid, { price: Number(e.target.value) })
                        }
                        className="w-full px-2 py-1 border border-default-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-default-900 dark:text-gray-100 rounded text-sm text-right"
                        disabled={isSaving}
                      />
                    </td>
                    <td className="px-2 py-1">
                      <input
                        type="number"
                        step="0.1"
                        value={line.tax ?? 0}
                        onChange={(e) =>
                          updateLine(line.uid, { tax: Number(e.target.value) })
                        }
                        className="w-full px-2 py-1 border border-default-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-default-900 dark:text-gray-100 rounded text-sm text-right"
                        disabled={isSaving}
                      />
                    </td>
                    <td className="px-3 py-1 text-right text-sm font-medium text-default-900 dark:text-gray-100">
                      {Number(line.total || 0).toFixed(2)}
                    </td>
                    <td className="px-2 py-1">
                      <button
                        onClick={() => removeLine(line.uid)}
                        disabled={isSaving || lines.length <= 1}
                        className="p-1 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded disabled:opacity-30 disabled:cursor-not-allowed"
                        title="Remove line"
                      >
                        <IconTrash size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Refund details + Totals */}
        <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Left: refund + pairing */}
          <div className="space-y-4">
            {isCN && (
              <div
                className={`bg-default-50 dark:bg-gray-900/30 rounded-lg p-3 border border-default-200 dark:border-gray-700 ${
                  !canPairRefund ? "opacity-60" : ""
                }`}
              >
                <button
                  type="button"
                  onClick={handlePairedRefundToggle}
                  className={`flex items-center gap-2 text-left w-full ${
                    !canPairRefund ? "cursor-not-allowed" : ""
                  }`}
                  disabled={isSaving || !canPairRefund}
                  title={
                    !canPairRefund
                      ? "Nota Bayaran Balik berpasangan hanya tersedia apabila jumlah Nota Kredit melebihi baki tertunggak. Lebihan sahaja akan dibayar balik."
                      : ""
                  }
                >
                  {issuePairedRefund && canPairRefund ? (
                    <IconSquareCheckFilled
                      className="text-blue-600 dark:text-blue-400 flex-shrink-0"
                      size={20}
                    />
                  ) : (
                    <IconSquare
                      className="text-default-400 dark:text-gray-500 flex-shrink-0"
                      size={20}
                    />
                  )}
                  <div>
                    <div className="font-medium text-sm text-default-900 dark:text-gray-100">
                      Keluarkan Nota Bayaran Balik berpasangan
                    </div>
                    <div className="text-xs text-default-500 dark:text-gray-400">
                      {canPairRefund
                        ? `Lebihan RM ${pairedRefundAmount.toFixed(2)} akan dibayar balik; selebihnya mengurangkan baki pelanggan.`
                        : "Tidak tersedia: jumlah Nota Kredit belum melebihi baki tertunggak. Nota Kredit sahaja akan mengurangkan baki pelanggan."}
                    </div>
                  </div>
                </button>
              </div>
            )}

            {showRefundFields && (
              <div className="space-y-3 bg-indigo-50/40 dark:bg-indigo-900/10 rounded-lg p-3 border border-indigo-200 dark:border-indigo-800">
                <div className="text-sm font-medium text-indigo-800 dark:text-indigo-300">
                  {isRN
                    ? "Butiran bayaran balik"
                    : "Butiran bayaran balik berpasangan"}
                </div>
                <FormListbox
                  name="refundMethod"
                  label="Refund Method"
                  value={refundMethod}
                  onChange={(v) =>
                    setRefundMethod(v as Payment["payment_method"])
                  }
                  options={PAYMENT_METHOD_OPTIONS}
                  disabled={isSaving}
                />
                {refundMethod !== "cash" && (
                  <FormListbox
                    name="bankAccount"
                    label="Bank Account"
                    value={bankAccount || ""}
                    onChange={(v) =>
                      setBankAccount(v as Payment["bank_account"])
                    }
                    options={BANK_ACCOUNT_OPTIONS}
                    disabled={isSaving}
                  />
                )}
                {(refundMethod === "cheque" ||
                  refundMethod === "bank_transfer" ||
                  refundMethod === "online") && (
                  <FormInput
                    name="refundReference"
                    label={
                      refundMethod === "cheque"
                        ? "Cheque Number"
                        : refundMethod === "online"
                        ? "Transaction ID"
                        : "Transaction Ref"
                    }
                    value={refundReference}
                    onChange={(e) => setRefundReference(e.target.value)}
                    placeholder="Enter reference"
                    disabled={isSaving}
                  />
                )}
              </div>
            )}
          </div>

          {/* Right: totals */}
          <div className="bg-default-50 dark:bg-gray-900/30 rounded-lg p-4 border border-default-200 dark:border-gray-700">
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-default-600 dark:text-gray-400">
                  Subtotal
                </span>
                <span className="font-medium text-default-900 dark:text-gray-100">
                  RM {totals.total_excluding_tax.toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-default-600 dark:text-gray-400">
                  Tax
                </span>
                <span className="font-medium text-default-900 dark:text-gray-100">
                  RM {totals.tax_amount.toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-default-600 dark:text-gray-400">
                  Rounding
                </span>
                <input
                  type="number"
                  step="0.01"
                  value={rounding}
                  onChange={(e) => setRounding(Number(e.target.value))}
                  className="w-24 px-2 py-1 border border-default-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-default-900 dark:text-gray-100 rounded text-sm text-right"
                  disabled={isSaving}
                />
              </div>
              <div className="border-t border-default-200 dark:border-gray-700 pt-2 mt-2 flex justify-between">
                <span className="font-semibold text-default-900 dark:text-gray-100">
                  Total Payable
                </span>
                <span className="font-bold text-lg text-default-900 dark:text-gray-100">
                  RM {totals.totalamountpayable.toFixed(2)}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <ConfirmationDialog
        isOpen={showBackConfirm}
        onClose={() => setShowBackConfirm(false)}
        onConfirm={() =>
          navigate(invoice ? `${paths.invoiceUiBase}/${invoice.id}` : paths.uiBase)
        }
        title="Discard Draft"
        message="Are you sure you want to leave? Your changes will be lost."
        confirmButtonText="Discard"
        variant="danger"
      />
    </div>
  );
};

export default AdjustmentDocsFormPage;
