// src/pages/AdjustmentDocs/AdjustmentDocsFormPage.tsx
import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  IconCopy,
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
import toast from "react-hot-toast";
import {
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
import { AdjustmentDocTypeBadge } from "../../components/AdjustmentDocs/AdjustmentDocBadge";

interface LineState extends AdjustmentDocLine {
  uid: string;
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

const parseType = (s: string | null): AdjustmentDocType | null => {
  if (s === "credit" || s === "credit_note") return "credit_note";
  if (s === "debit" || s === "debit_note") return "debit_note";
  if (s === "refund" || s === "refund_note") return "refund_note";
  return null;
};

const AdjustmentDocsFormPage: React.FC = () => {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const type = parseType(params.get("type"));
  const urlInvoiceId = params.get("invoiceId") || "";
  const paymentIdParam = params.get("paymentId");
  const linkedPaymentId = paymentIdParam ? parseInt(paymentIdParam, 10) : null;

  // Effective invoice id — starts from URL but can be set by the in-form picker
  // when the user opened the page without a preselected invoice.
  const [invoiceId, setInvoiceId] = useState<string>(urlInvoiceId);

  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showBackConfirm, setShowBackConfirm] = useState(false);

  const [invoice, setInvoice] = useState<ExtendedInvoiceData | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [linkedPayment, setLinkedPayment] = useState<Payment | null>(null);

  // Invoice picker state (only used when no invoiceId in URL)
  const [pickerQuery, setPickerQuery] = useState("");
  const [pickerResults, setPickerResults] = useState<any[]>([]);
  const [pickerLoading, setPickerLoading] = useState(false);

  const [reason, setReason] = useState("");
  const [lines, setLines] = useState<LineState[]>([]);
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

  const isCN = type === "credit_note";
  const isDN = type === "debit_note";
  const isRN = type === "refund_note";

  // ----- Validate type only (invoiceId can be picked in-form) -----
  useEffect(() => {
    if (!type) {
      toast.error("Missing required parameter: type");
      navigate("/sales/adjustment-docs", { replace: true });
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
        const response: any = await api.get(`/api/invoices?${params.toString()}`);
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
        const inv = (await api.get(`/api/invoices/${invoiceId}`)) as ExtendedInvoiceData;
        if (!inv) {
          toast.error(`Invoice ${invoiceId} not found`);
          navigate("/sales/adjustment-docs", { replace: true });
          return;
        }
        if (inv.invoice_status === "cancelled") {
          toast.error("Cannot create adjustment for a cancelled invoice");
          navigate(`/sales/invoice/${invoiceId}`, { replace: true });
          return;
        }
        setInvoice(inv);

        const pays = (await api.get(
          `/api/payments?invoice_id=${invoiceId}&include_cancelled=false`
        )) as Payment[];
        setPayments(pays || []);

        // Standalone RN: validate linked payment is overpaid
        if (isRN && linkedPaymentId) {
          const lp = (pays || []).find(
            (p) => p.payment_id === linkedPaymentId && p.status === "overpaid"
          );
          if (!lp) {
            toast.error(
              "Linked payment not found or not in overpaid status"
            );
            navigate(`/sales/invoice/${invoiceId}`, { replace: true });
            return;
          }
          setLinkedPayment(lp);
        }

        // Default CN pair toggle: ON if there are any active/overpaid payments
        if (isCN) {
          const hasPaidAny = (pays || []).some((p) =>
            ["active", "overpaid"].includes(p.status || "")
          );
          setIssuePairedRefund(hasPaidAny);
        }

        // Pre-fill lines:
        //  - CN/DN: copy original line items as starting point
        //  - RN standalone: single line for the overpaid amount
        if (isRN && linkedPaymentId) {
          const overpaidAmt = (pays || []).find(
            (p) => p.payment_id === linkedPaymentId
          )?.amount_paid;
          setLines([
            {
              uid: crypto.randomUUID(),
              code: "REFUND",
              description: `Refund of overpaid Payment #${linkedPaymentId}`,
              quantity: 1,
              price: Number(overpaidAmt || 0),
              tax: 0,
              total: Number(overpaidAmt || 0),
              issubtotal: false,
            },
          ]);
        } else if (inv.products && inv.products.length > 0) {
          setLines(
            inv.products
              .filter((p) => !p.issubtotal && !p.istotal)
              .map((p) => ({
                uid: crypto.randomUUID(),
                code: p.code,
                description: p.description || "",
                quantity: Number(p.quantity || 0),
                price: Number(p.price || 0),
                tax: Number(p.tax || 0),
                total: Number(p.total || 0),
                issubtotal: false,
              }))
          );
        } else {
          setLines([
            {
              uid: crypto.randomUUID(),
              code: "",
              description: "",
              quantity: 1,
              price: 0,
              tax: 0,
              total: 0,
              issubtotal: false,
            },
          ]);
        }
      } catch (error: any) {
        console.error(error);
        toast.error(error?.message || "Failed to load invoice");
        navigate("/sales/adjustment-docs", { replace: true });
      } finally {
        setIsLoading(false);
      }
    };

    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, invoiceId, linkedPaymentId]);

  // ----- Totals (sen-safe) -----
  const totals = useMemo(() => {
    const subtotals: number[] = [];
    const taxes: number[] = [];
    lines.forEach((l) => {
      if (l.issubtotal) return;
      const qty = Number(l.quantity || 0);
      const price = Number(l.price || 0);
      const subtotal =
        l.code === "OTH" || l.code === "LESS" || l.code === "REFUND"
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

  // ----- Line item handlers -----
  const updateLine = useCallback(
    (uid: string, patch: Partial<LineState>) => {
      setLines((prev) =>
        prev.map((l) => {
          if (l.uid !== uid) return l;
          const next = { ...l, ...patch };
          const qty = Number(next.quantity || 0);
          const price = Number(next.price || 0);
          const tax = Number(next.tax || 0);
          const lineTotal =
            next.code === "OTH" || next.code === "LESS" || next.code === "REFUND"
              ? addMoney(price, tax)
              : addMoney(multiplyMoney(price, qty), tax);
          next.total = roundMoney(lineTotal);
          return next;
        })
      );
    },
    []
  );

  const addLine = () => {
    setLines((prev) => [
      ...prev,
      {
        uid: crypto.randomUUID(),
        code: "",
        description: "",
        quantity: 1,
        price: 0,
        tax: 0,
        total: 0,
        issubtotal: false,
      },
    ]);
  };

  const removeLine = (uid: string) => {
    setLines((prev) => prev.filter((l) => l.uid !== uid));
  };

  const copyFromOriginal = () => {
    if (!invoice?.products) return;
    setLines(
      invoice.products
        .filter((p: ProductItem) => !p.issubtotal && !p.istotal)
        .map((p: ProductItem) => ({
          uid: crypto.randomUUID(),
          code: p.code,
          description: p.description || "",
          quantity: Number(p.quantity || 0),
          price: Number(p.price || 0),
          tax: Number(p.tax || 0),
          total: Number(p.total || 0),
          issubtotal: false,
        }))
    );
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
    });
    if (totals.totalamountpayable <= 0)
      errors.push("Document total must be greater than 0");

    if (isRN) {
      if (!refundMethod) errors.push("Refund method required");
      if (refundMethod !== "cash" && !bankAccount)
        errors.push("Bank account required for non-cash refund");
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

    if (isCN && issuePairedRefund) {
      if (refundMethod !== "cash" && !bankAccount)
        errors.push("Paired refund requires bank account for non-cash method");
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
      }

      if (isCN && issuePairedRefund) {
        payload.paired_refund = {
          totalamountpayable: totals.totalamountpayable,
          total_excluding_tax: totals.total_excluding_tax,
          tax_amount: totals.tax_amount,
          rounding: totals.rounding,
          refund_method: refundMethod,
          refund_reference: refundReference || null,
          bank_account: refundMethod === "cash" ? "CASH" : bankAccount,
          reason: reason || null,
          lines: payload.lines,
        };
      }

      const response = await api.post("/api/adjustment-docs", payload);
      toast.success(response.message || "Document created", { id: toastId });
      navigate(`/sales/adjustment-docs/${response.document.id}`, {
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
      navigate(invoice ? `/sales/invoice/${invoice.id}` : "/sales/adjustment-docs");
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
              <BackButton onClick={() => navigate("/sales/adjustment-docs")} />
              <div className="h-6 w-px bg-default-300 dark:bg-gray-600" />
              <h1 className="text-xl font-semibold text-default-900 dark:text-gray-100">
                New {TYPE_LABEL[type]} — Select Invoice
              </h1>
            </div>
          </div>

          <div className="p-4 border-b border-default-200 dark:border-gray-700">
            <p className="text-sm text-default-600 dark:text-gray-300 mb-3">
              Pilih invois yang anda mahu laraskan. Senarai di bawah hanya
              memaparkan <strong>50 invois terkini</strong> — gunakan kotak
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

  const showRefundFields = isRN || (isCN && issuePairedRefund);

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
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <div className="text-default-500 dark:text-gray-400 text-xs uppercase tracking-wider">
                Original Invoice
              </div>
              <div className="font-medium text-default-900 dark:text-gray-100">
                {invoice.id}
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
          </div>
          {linkedPayment && (
            <div className="mt-3 p-3 rounded-lg bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800 text-sm">
              <span className="font-medium text-indigo-800 dark:text-indigo-300">
                Refunding overpaid Payment #{linkedPayment.payment_id}
              </span>
              <span className="ml-2 text-indigo-700 dark:text-indigo-400">
                (Available: RM {Number(linkedPayment.amount_paid).toFixed(2)})
              </span>
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
                ? "e.g. Goods returned damaged"
                : isDN
                ? "e.g. Late payment fee"
                : "e.g. Refund of overpayment"
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
                  Copy from Original
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
                        step="0.01"
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
                        step="0.01"
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
              <div className="bg-default-50 dark:bg-gray-900/30 rounded-lg p-3 border border-default-200 dark:border-gray-700">
                <button
                  type="button"
                  onClick={() => setIssuePairedRefund(!issuePairedRefund)}
                  className="flex items-center gap-2 text-left w-full"
                  disabled={isSaving}
                >
                  {issuePairedRefund ? (
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
                      Recommended when invoice has been paid — pays the credited
                      amount back to the customer.
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
          navigate(invoice ? `/sales/invoice/${invoice.id}` : "/sales/adjustment-docs")
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
