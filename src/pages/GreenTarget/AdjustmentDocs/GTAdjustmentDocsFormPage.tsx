// src/pages/GreenTarget/AdjustmentDocs/GTAdjustmentDocsFormPage.tsx
// Phase 7 — Green Target adjustment doc create form. Forked from the TH form
// because GT field names diverge (date_issued / amount_before_tax /
// total_amount / original_invoice_number) and the line-item shape is simpler:
// description-driven, no code system, no rounding, no OTH/LESS/REFUND
// freeform logic. Standalone Refund Notes are out of scope for GT — RN is
// only ever issued via the CN form's paired-refund toggle or as a replacement
// for an existing Credit Note (?type=refund&creditNoteId=...).
import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  IconExternalLink,
  IconPlus,
  IconTrash,
  IconSquare,
  IconSquareCheckFilled,
  IconSearch,
} from "@tabler/icons-react";
import Button from "../../../components/Button";
import BackButton from "../../../components/BackButton";
import LoadingSpinner from "../../../components/LoadingSpinner";
import ConfirmationDialog from "../../../components/ConfirmationDialog";
import { FormInput, FormListbox } from "../../../components/FormComponents";
import { api } from "../../../routes/utils/api";
import { formatAdjustmentDocId } from "../../../utils/adjustments/formatDocId";
import toast from "react-hot-toast";
import { AdjustmentDocType } from "../../../types/types";
import {
  addMoney,
  multiplyMoney,
  sumMoney,
  roundMoney,
} from "../../../utils/moneyUtils";
import {
  AdjustmentDocTypeBadge,
  AdjustmentDocStatusBadge,
} from "../../../components/AdjustmentDocs/AdjustmentDocBadge";

const API_BASE = "/greentarget/api/adjustment-docs";
const UI_BASE = "/greentarget/adjustment-docs";
const INVOICES_API = "/greentarget/api/invoices";
const INVOICE_UI_BASE = "/greentarget/invoices";

const MONEY_TOLERANCE = 0.005;

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

const parseType = (s: string | null): AdjustmentDocType | null => {
  if (s === "credit" || s === "credit_note") return "credit_note";
  if (s === "debit" || s === "debit_note") return "debit_note";
  if (s === "refund" || s === "refund_note") return "refund_note";
  return null;
};

interface LineState {
  uid: string;
  description: string;
  quantity: number;
  price: number;
  tax: number;
  total: number;
  issubtotal: boolean;
}

interface GTInvoice {
  invoice_id: number;
  invoice_number: string;
  customer_id: number | null;
  customer_name: string | null;
  date_issued: string;
  amount_before_tax: number;
  tax_amount: number;
  total_amount: number;
  balance_due: number;
  status: string;
  einvoice_status?: string | null;
  uuid?: string | null;
  long_id?: string | null;
  rental_details?: Array<{
    rental_id: number;
    tong_no?: string;
    date_placed?: string;
    date_picked?: string | null;
    location_address?: string | null;
  }>;
}

interface GTPayment {
  payment_id: number;
  amount_paid: number;
  payment_method: string;
  payment_date: string;
  status: string | null;
}

interface GTAdjDoc {
  id: string;
  type: AdjustmentDocType;
  original_invoice_id: number;
  original_invoice_number: string;
  total_amount: number;
  status: string;
  paired_with_id: string | null;
  lines?: Array<{
    description: string | null;
    quantity: number | null;
    price: number | null;
    tax: number | null;
    total: number | null;
    issubtotal: boolean;
  }>;
}

const createBlankLine = (): LineState => ({
  uid: crypto.randomUUID(),
  description: "",
  quantity: 1,
  price: 0,
  tax: 0,
  total: 0,
  issubtotal: false,
});

const todayIso = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const GTAdjustmentDocsFormPage: React.FC = () => {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const type = parseType(params.get("type"));
  const urlInvoiceId = params.get("invoiceId") || "";
  const pairedCreditNoteId: string = params.get("creditNoteId") || "";

  const [invoiceId, setInvoiceId] = useState<string>(urlInvoiceId);

  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showBackConfirm, setShowBackConfirm] = useState(false);
  // Predicted next document id for this type (preview only — the final id is
  // assigned on save and may differ if another doc is created in between).
  const [previewDocId, setPreviewDocId] = useState<string>("");

  const [invoice, setInvoice] = useState<GTInvoice | null>(null);
  const [payments, setPayments] = useState<GTPayment[]>([]);
  const [activeAdjustmentDocs, setActiveAdjustmentDocs] = useState<GTAdjDoc[]>([]);
  const [pairedCreditNote, setPairedCreditNote] = useState<GTAdjDoc | null>(null);

  const [pickerQuery, setPickerQuery] = useState("");
  const [pickerResults, setPickerResults] = useState<any[]>([]);
  const [pickerLoading, setPickerLoading] = useState(false);

  const [reason, setReason] = useState("");
  const [lines, setLines] = useState<LineState[]>([]);
  const [hasLineUserEdits, setHasLineUserEdits] = useState<boolean>(false);

  const [refundMethod, setRefundMethod] = useState<string>("cash");
  const [bankAccount, setBankAccount] = useState<string>("BANK_PBB");
  const [refundReference, setRefundReference] = useState("");

  const [issuePairedRefund, setIssuePairedRefund] = useState(false);

  // Fetch the predicted next document id to preview in the header.
  useEffect(() => {
    if (!type) return;
    let cancelled = false;
    api
      .get(`${API_BASE}/next-number/${type}`)
      .then((res: { next_id?: string }) => {
        if (!cancelled) setPreviewDocId(res?.next_id || "");
      })
      .catch(() => {
        if (!cancelled) setPreviewDocId("");
      });
    return () => {
      cancelled = true;
    };
  }, [type]);

  const isCN = type === "credit_note";
  const isDN = type === "debit_note";
  const isRN = type === "refund_note";
  const isReplacementPairedRefund: boolean = isRN && Boolean(pairedCreditNoteId);

  const invoiceBalanceDue: number = invoice
    ? roundMoney(Number(invoice.balance_due || 0))
    : 0;

  const activeDebitNoteTotal: number = roundMoney(
    activeAdjustmentDocs
      .filter((d) => d.type === "debit_note" && d.status === "active")
      .reduce((sum, d) => sum + Number(d.total_amount || 0), 0)
  );

  const maxCreditNoteAmount: number = invoice
    ? roundMoney(Number(invoice.total_amount || 0) + activeDebitNoteTotal)
    : 0;

  // GT considers any non-cancelled payment as "received". No 'overpaid' status.
  const hasReceivedPayment: boolean = payments.some(
    (p) => !p.status || p.status === "active"
  );

  const balanceBeforeReplacementCreditNote: number =
    isReplacementPairedRefund && pairedCreditNote
      ? roundMoney(invoiceBalanceDue + Number(pairedCreditNote.total_amount || 0))
      : invoiceBalanceDue;

  // Validate type once
  useEffect(() => {
    if (!type) {
      toast.error("Missing required parameter: type");
      navigate(UI_BASE, { replace: true });
    }
  }, [type, navigate]);

  // Picker search (debounced) when no invoice chosen yet.
  useEffect(() => {
    if (invoiceId) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      setPickerLoading(true);
      try {
        const params = new URLSearchParams();
        params.set("limit", "50");
        if (pickerQuery.trim()) params.set("search", pickerQuery.trim());
        const response: any = await api.get(
          `${INVOICES_API}?${params.toString()}`
        );
        if (cancelled) return;
        const rows = Array.isArray(response?.data)
          ? response.data
          : Array.isArray(response)
          ? response
          : [];
        const filtered = rows.filter((r: any) => r.status !== "cancelled");
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

  // Load invoice + payments + existing adjustment docs once invoice is chosen.
  useEffect(() => {
    if (!type || !invoiceId) return;

    const load = async () => {
      setIsLoading(true);
      try {
        const invResp: any = await api.get(`${INVOICES_API}/${invoiceId}`);
        if (!invResp?.invoice) {
          toast.error(`Invoice ${invoiceId} not found`);
          navigate(UI_BASE, { replace: true });
          return;
        }
        const inv: GTInvoice = invResp.invoice;
        const pays: GTPayment[] = invResp.payments || [];

        if (inv.status === "cancelled") {
          toast.error("Cannot create adjustment for a cancelled invoice");
          navigate(`${INVOICE_UI_BASE}/${invoiceId}`, { replace: true });
          return;
        }
        setInvoice(inv);
        setPayments(pays);

        const docsResp: any = await api.get(
          `${API_BASE}?original_invoice_id=${inv.invoice_id}&include_cancelled=false`
        );
        const adjDocs: GTAdjDoc[] = Array.isArray(docsResp) ? docsResp : [];
        setActiveAdjustmentDocs(adjDocs);

        let loadedPairedCreditNote: GTAdjDoc | null = null;
        if (isReplacementPairedRefund) {
          const creditNote: GTAdjDoc = await api.get(
            `${API_BASE}/${pairedCreditNoteId}`
          );
          if (
            creditNote.type !== "credit_note" ||
            creditNote.original_invoice_id !== inv.invoice_id ||
            creditNote.status !== "active"
          ) {
            toast.error("Active Credit Note not found for this invoice");
            navigate(`${INVOICE_UI_BASE}/${invoiceId}`, { replace: true });
            return;
          }
          if (creditNote.paired_with_id) {
            const pairedDoc: GTAdjDoc = await api.get(
              `${API_BASE}/${creditNote.paired_with_id}`
            );
            if (pairedDoc.status === "active") {
              toast.error("This Credit Note already has an active Refund Note");
              navigate(`${UI_BASE}/${creditNote.id}`, { replace: true });
              return;
            }
          }
          loadedPairedCreditNote = creditNote;
          setPairedCreditNote(creditNote);
        }

        // Default CN paired-refund toggle: OFF. The option remains available
        // when the Credit Note exceeds the outstanding balance, but the user
        // must opt in.
        if (isCN) {
          setIssuePairedRefund(false);
        }
        setHasLineUserEdits(false);

        // Line prefill:
        //  - Paired RN replacement: REFUND line at refundable excess
        //  - CN/DN: one line seeded with the invoice description (qty=1, price=0)
        //    The user fills in the price. GT invoices are usually single-line
        //    rentals so this is the natural starting point.
        if (isReplacementPairedRefund && loadedPairedCreditNote) {
          const creditNoteTotal = roundMoney(
            Number(loadedPairedCreditNote.total_amount || 0)
          );
          const balanceBeforeCreditNote = roundMoney(
            Number(inv.balance_due || 0) + creditNoteTotal
          );
          const refundableExcess = roundMoney(
            Math.min(
              creditNoteTotal,
              Math.max(
                0,
                creditNoteTotal - Math.max(balanceBeforeCreditNote, 0)
              )
            )
          );
          setLines([
            {
              uid: crypto.randomUUID(),
              description: `Refund excess from Credit Note ${formatAdjustmentDocId(
                loadedPairedCreditNote.id
              )}`,
              quantity: 1,
              price: refundableExcess,
              tax: 0,
              total: refundableExcess,
              issubtotal: false,
            },
          ]);
        } else if (isCN || isDN) {
          // Seed one line from the invoice's rental description summary.
          const description = buildInvoiceLineDescription(inv);
          setLines([
            {
              uid: crypto.randomUUID(),
              description,
              quantity: 1,
              price: 0,
              tax: 0,
              total: 0,
              issubtotal: false,
            },
          ]);
        } else {
          setLines([createBlankLine()]);
        }
      } catch (error: any) {
        console.error(error);
        toast.error(error?.message || "Failed to load invoice");
        navigate(UI_BASE, { replace: true });
      } finally {
        setIsLoading(false);
      }
    };

    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, invoiceId, pairedCreditNoteId]);

  // Totals (sen-safe)
  const totals = useMemo(() => {
    const subtotals: number[] = [];
    const taxes: number[] = [];
    lines.forEach((l) => {
      if (l.issubtotal) return;
      const qty = Number(l.quantity || 0);
      const price = Number(l.price || 0);
      subtotals.push(multiplyMoney(price, qty));
      taxes.push(Number(l.tax || 0));
    });
    const subtotal = sumMoney(subtotals);
    const taxTotal = sumMoney(taxes);
    const grand = addMoney(subtotal, taxTotal);
    return {
      amount_before_tax: roundMoney(subtotal),
      tax_amount: roundMoney(taxTotal),
      total_amount: roundMoney(grand),
    };
  }, [lines]);

  const pairedRefundAmount: number = isCN
    ? roundMoney(
        Math.max(
          0,
          Math.min(
            totals.total_amount - Math.max(invoiceBalanceDue, 0),
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

  // Line item handlers
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
          next.total = roundMoney(addMoney(multiplyMoney(price, qty), tax));
          return next;
        })
      );
    },
    []
  );

  const addLine = (): void => {
    setHasLineUserEdits(true);
    setLines((prev) => [...prev, createBlankLine()]);
  };

  const removeLine = (uid: string): void => {
    setHasLineUserEdits(true);
    setLines((prev) => prev.filter((l) => l.uid !== uid));
  };

  const handlePairedRefundToggle = (): void => {
    if (!canPairRefund) return;
    setIssuePairedRefund((v) => !v);
  };

  // Validation
  const validate = (): string[] => {
    const errors: string[] = [];
    const nonSub = lines.filter((l) => !l.issubtotal);
    if (nonSub.length === 0) errors.push("At least one line item required");
    nonSub.forEach((l, i) => {
      if (!l.description.trim())
        errors.push(`Line ${i + 1}: description required`);
      const qty = Number(l.quantity || 0);
      const price = Number(l.price || 0);
      if (qty <= 0) errors.push(`Line ${i + 1}: quantity must be greater than 0`);
      if (price < 0) errors.push(`Line ${i + 1}: price cannot be negative`);
      if (!isFinite(Number(l.total || 0)))
        errors.push(`Line ${i + 1}: invalid total`);
    });
    if (totals.total_amount <= 0)
      errors.push("Document total must be greater than 0");

    if (isCN && invoice) {
      if (totals.total_amount > maxCreditNoteAmount + MONEY_TOLERANCE) {
        errors.push(
          `Credit Note amount cannot exceed adjusted invoice total RM ${maxCreditNoteAmount.toFixed(2)}`
        );
      }
      if (
        !hasReceivedPayment &&
        totals.total_amount > invoiceBalanceDue + MONEY_TOLERANCE
      ) {
        errors.push(
          `Credit Note amount cannot exceed unpaid balance RM ${invoiceBalanceDue.toFixed(2)} when the invoice has no received payment`
        );
      }
    }

    if (isRN) {
      if (!refundMethod) errors.push("Refund method required");
      if (refundMethod !== "cash" && !bankAccount)
        errors.push("Bank account required for non-cash refund");
      if (!pairedCreditNoteId)
        errors.push(
          "Refund Note must be linked to a Credit Note (standalone Refund Notes are not supported for Green Target)"
        );
      if (isReplacementPairedRefund && !pairedCreditNote)
        errors.push("Credit Note link required for replacement Refund Note");
      if (isReplacementPairedRefund && pairedCreditNote) {
        if (totals.total_amount > pairedCreditNote.total_amount + MONEY_TOLERANCE) {
          errors.push(
            `Refund amount cannot exceed Credit Note amount RM ${pairedCreditNote.total_amount.toFixed(2)}`
          );
        }
        const maxReplacementRefundAmount = roundMoney(
          Math.min(
            Number(pairedCreditNote.total_amount || 0),
            Math.max(
              0,
              Number(pairedCreditNote.total_amount || 0) -
                Math.max(balanceBeforeReplacementCreditNote, 0)
            )
          )
        );
        if (maxReplacementRefundAmount <= MONEY_TOLERANCE) {
          errors.push(
            `Refund Note cannot be paired because Credit Note ${formatAdjustmentDocId(
              pairedCreditNote.id
            )} did not create a refundable excess.`
          );
        } else if (totals.total_amount > maxReplacementRefundAmount + MONEY_TOLERANCE) {
          errors.push(
            `Refund amount cannot exceed refundable excess RM ${maxReplacementRefundAmount.toFixed(
              2
            )} from Credit Note ${formatAdjustmentDocId(pairedCreditNote.id)}.`
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
        `Paired refund is only available when the Credit Note exceeds the outstanding balance. Current balance: RM ${invoiceBalanceDue.toFixed(2)}`
      );
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
        original_invoice_id: invoice.invoice_id,
        date_issued: todayIso(),
        reason: reason || null,
        lines: lines.map((l) => ({
          description: l.description,
          quantity: l.quantity,
          price: l.price,
          tax: l.tax,
          total: l.total,
          issubtotal: l.issubtotal,
        })),
        amount_before_tax: totals.amount_before_tax,
        tax_amount: totals.tax_amount,
        total_amount: totals.total_amount,
      };

      if (isRN) {
        payload.refund_method = refundMethod;
        payload.refund_reference = refundReference || null;
        payload.bank_account = refundMethod === "cash" ? "CASH" : bankAccount;
        if (pairedCreditNoteId)
          payload.paired_credit_note_id = pairedCreditNoteId;
      }

      if (isCN && issuePairedRefund && canPairRefund) {
        payload.paired_refund = {
          total_amount: pairedRefundAmount,
          amount_before_tax: pairedRefundAmount,
          tax_amount: 0,
          refund_method: refundMethod,
          refund_reference: refundReference || null,
          bank_account: refundMethod === "cash" ? "CASH" : bankAccount,
          reason: reason || null,
          lines: [
            {
              description: `Refund excess from Credit Note`,
              quantity: 1,
              price: pairedRefundAmount,
              tax: 0,
              total: pairedRefundAmount,
              issubtotal: false,
            },
          ],
        };
      }

      const response = await api.post(API_BASE, payload);
      toast.success(response.message || "Document created", { id: toastId });
      navigate(`${UI_BASE}/${response.document.id}`, { replace: true });
    } catch (error: any) {
      toast.error(error?.message || "Failed to create document", { id: toastId });
    } finally {
      setIsSaving(false);
    }
  };

  const isFormDirty =
    reason.length > 0 || lines.some((l) => l.description.trim() || l.price > 0);

  const handleBackClick = () => {
    if (isFormDirty && !isSaving) {
      setShowBackConfirm(true);
    } else {
      navigate(
        invoice ? `${INVOICE_UI_BASE}/${invoice.invoice_id}` : UI_BASE
      );
    }
  };

  if (!type) {
    return (
      <div className="mt-40 flex justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  // Invoice picker
  if (!invoiceId) {
    return (
      <div className="space-y-4">
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-default-200 dark:border-gray-700">
          <div className="px-6 py-3 border-b border-default-200 dark:border-gray-700 flex flex-col md:flex-row justify-between items-start md:items-center gap-2">
            <div className="flex items-center gap-3">
              <BackButton onClick={() => navigate(UI_BASE)} />
              <div className="h-6 w-px bg-default-300 dark:bg-gray-600" />
              <h1 className="text-xl font-semibold text-default-900 dark:text-gray-100">
                New {TYPE_LABEL[type]} — Pick Invoice
              </h1>
            </div>
          </div>

          <div className="p-4 border-b border-default-200 dark:border-gray-700">
            <p className="text-sm text-default-600 dark:text-gray-300 mb-3">
              Pick the invoice you want to adjust. The list below shows the
              <strong> 50 most recent invoices</strong> — use search to find
              older invoices.
            </p>
            <div className="relative">
              <IconSearch
                className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 dark:text-gray-500"
                size={18}
              />
              <input
                autoFocus
                type="text"
                placeholder="Search by invoice number or customer name..."
                className="w-full pl-10 pr-3 py-2 border border-default-300 dark:border-gray-600 bg-white dark:bg-gray-900/50 text-default-900 dark:text-gray-100 placeholder:text-default-400 dark:placeholder:text-gray-400 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent"
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
                  ? "No matching invoices found."
                  : "No invoices to display."}
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
                      key={inv.invoice_id}
                      onClick={() => {
                        const next = new URLSearchParams(params);
                        next.set("invoiceId", String(inv.invoice_id));
                        setParams(next, { replace: true });
                        setInvoiceId(String(inv.invoice_id));
                      }}
                      className="hover:bg-sky-50 dark:hover:bg-sky-900/20 cursor-pointer transition-colors duration-150"
                    >
                      <td className="px-4 py-2 text-sm font-medium text-default-900 dark:text-gray-100">
                        {inv.invoice_number}
                      </td>
                      <td className="px-4 py-2 text-sm text-default-700 dark:text-gray-200">
                        {inv.customer_name || "—"}
                      </td>
                      <td className="px-4 py-2 text-sm text-default-500 dark:text-gray-400">
                        {inv.date_issued
                          ? new Date(inv.date_issued).toLocaleDateString("en-GB")
                          : "—"}
                      </td>
                      <td className="px-4 py-2 text-sm text-right text-default-700 dark:text-gray-200">
                        RM {Number(inv.total_amount || 0).toFixed(2)}
                      </td>
                      <td className="px-4 py-2 text-sm text-right text-default-700 dark:text-gray-200">
                        RM {Number(inv.balance_due || inv.current_balance || 0).toFixed(2)}
                      </td>
                      <td className="px-4 py-2 text-xs text-center capitalize">
                        {inv.status || "—"}
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
                onClick={() => navigate(`${INVOICE_UI_BASE}/${invoice.invoice_id}`)}
                title="Open invoice"
              >
                {invoice.invoice_number}
                <IconExternalLink size={14} className="text-sky-600 dark:text-sky-400" />
              </div>
            </div>
            <div>
              <div className="text-default-500 dark:text-gray-400 text-xs uppercase tracking-wider">
                Customer
              </div>
              <div className="font-medium text-default-900 dark:text-gray-100">
                {invoice.customer_name ||
                  (invoice.customer_id ? `#${invoice.customer_id}` : "—")}
              </div>
            </div>
            <div>
              <div className="text-default-500 dark:text-gray-400 text-xs uppercase tracking-wider">
                Invoice Total
              </div>
              <div className="font-medium text-default-900 dark:text-gray-100">
                RM {Number(invoice.total_amount).toFixed(2)}
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
                    (invoice.status === "cancelled"
                      ? "cancelled"
                      : "active") as "active" | "cancelled"
                  }
                  einvoiceStatus={
                    (invoice.einvoice_status ?? null) as
                      | "valid"
                      | "pending"
                      | "invalid"
                      | "cancelled"
                      | null
                  }
                />
              </div>
            </div>
          </div>
          {pairedCreditNote && (
            <div className="mt-3 p-3 rounded-lg bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800 text-sm">
              <span className="font-medium text-indigo-800 dark:text-indigo-300">
                Reissuing Refund Note for Credit Note{" "}
                {formatAdjustmentDocId(pairedCreditNote.id)}
              </span>
              <span className="ml-2 text-indigo-700 dark:text-indigo-400">
                (Credit Note amount: RM {Number(pairedCreditNote.total_amount).toFixed(2)})
              </span>
            </div>
          )}
        </div>

        {/* Reason */}
        <div className="p-4 border-b border-default-200 dark:border-gray-700">
          <div>
            <label className="block text-sm font-medium text-default-700 dark:text-gray-300 mb-1">
              Reason / Description
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={
                isCN
                  ? "e.g. Rental cancelled / dumpster not delivered"
                  : isDN
                  ? "e.g. Additional rental period billed"
                  : isReplacementPairedRefund
                  ? `Replacement refund for Credit Note ${formatAdjustmentDocId(
                      pairedCreditNoteId
                    )}`
                  : "Reason for this adjustment"
              }
              rows={2}
              className="w-full px-3 py-2 border border-default-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-default-900 dark:text-gray-100 placeholder:text-default-400 dark:placeholder:text-gray-400 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent"
              disabled={isSaving}
            />
          </div>
        </div>

        {/* Line Items */}
        <div className="p-4 border-b border-default-200 dark:border-gray-700">
          <div className="flex justify-between items-center mb-3">
            <h2 className="text-lg font-semibold text-default-900 dark:text-gray-100">
              Line Items
            </h2>
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
          {!isRN && (
            <div className="mb-3 rounded-lg border border-sky-200 dark:border-sky-800 bg-sky-50/70 dark:bg-sky-900/20 px-3 py-2 text-xs text-sky-800 dark:text-sky-300">
              Enter only the amounts relevant to this adjustment. For a price
              correction, use the quantity involved and the per-unit price
              difference. For a rental cancellation or return, use the quantity
              and original unit price. A Debit Note adds to the invoice balance;
              a Credit Note reduces it.
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-default-200 dark:divide-gray-700 border border-default-200 dark:border-gray-700 rounded-lg">
              <thead className="bg-default-50 dark:bg-gray-900/50">
                <tr>
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
                        step="1"
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
                        step="1"
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
                      ? "Paired Refund Note is only available when the Credit Note amount exceeds the outstanding balance. Only the excess can be refunded."
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
                      Issue paired Refund Note
                    </div>
                    <div className="text-xs text-default-500 dark:text-gray-400">
                      {canPairRefund
                        ? `Excess RM ${pairedRefundAmount.toFixed(2)} will be refunded; remainder reduces the customer balance.`
                        : "Not available: Credit Note amount does not exceed the outstanding balance. The Credit Note alone will reduce the customer balance."}
                    </div>
                  </div>
                </button>
              </div>
            )}

            {showRefundFields && (
              <div className="space-y-3 bg-indigo-50/40 dark:bg-indigo-900/10 rounded-lg p-3 border border-indigo-200 dark:border-indigo-800">
                <div className="text-sm font-medium text-indigo-800 dark:text-indigo-300">
                  {isRN ? "Refund details" : "Paired refund details"}
                </div>
                <FormListbox
                  name="refundMethod"
                  label="Refund Method"
                  value={refundMethod}
                  onChange={(v) => setRefundMethod(String(v))}
                  options={PAYMENT_METHOD_OPTIONS}
                  disabled={isSaving}
                />
                {refundMethod !== "cash" && (
                  <FormListbox
                    name="bankAccount"
                    label="Bank Account"
                    value={bankAccount}
                    onChange={(v) => setBankAccount(String(v))}
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

          <div className="bg-default-50 dark:bg-gray-900/30 rounded-lg p-4 border border-default-200 dark:border-gray-700">
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-default-600 dark:text-gray-400">
                  Amount Before Tax
                </span>
                <span className="font-medium text-default-900 dark:text-gray-100">
                  RM {totals.amount_before_tax.toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-default-600 dark:text-gray-400">Tax</span>
                <span className="font-medium text-default-900 dark:text-gray-100">
                  RM {totals.tax_amount.toFixed(2)}
                </span>
              </div>
              <div className="border-t border-default-200 dark:border-gray-700 pt-2 mt-2 flex justify-between">
                <span className="font-semibold text-default-900 dark:text-gray-100">
                  Total Amount
                </span>
                <span className="font-bold text-lg text-default-900 dark:text-gray-100">
                  RM {totals.total_amount.toFixed(2)}
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
          navigate(
            invoice ? `${INVOICE_UI_BASE}/${invoice.invoice_id}` : UI_BASE
          )
        }
        title="Discard Draft"
        message="Are you sure you want to leave? Your changes will be lost."
        confirmButtonText="Discard"
        variant="danger"
      />
    </div>
  );
};

function buildInvoiceLineDescription(inv: GTInvoice): string {
  const rentals = inv.rental_details || [];
  if (rentals.length === 0) {
    return `Adjustment for invoice ${inv.invoice_number}`;
  }
  if (rentals.length === 1) {
    const r = rentals[0];
    return `Adjustment for dumpster ${r.tong_no || ""} rental (invoice ${inv.invoice_number})`.trim();
  }
  return `Adjustment for ${rentals.length} dumpster rentals (invoice ${inv.invoice_number})`;
}

export default GTAdjustmentDocsFormPage;
