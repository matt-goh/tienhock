import React, { useCallback, useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import toast from "react-hot-toast";
import { IconX } from "@tabler/icons-react";
import BackButton from "../../../components/BackButton";
import Button from "../../../components/Button";
import ConfirmationDialog from "../../../components/ConfirmationDialog";
import { FormInput, FormListbox } from "../../../components/FormComponents";
import LoadingSpinner from "../../../components/LoadingSpinner";
import { api } from "../../../routes/utils/api";

type InvoiceSource = "purchase_invoices" | "self_billed_invoices";

interface SourceInvoice {
  id: number;
  doc_no: string;
  purchase_kind?: "foreign" | "local";
  supplier_name: string;
  invoice_date: string | null;
  total: number;
  amount_paid: number;
  balance: number;
  payment_status: "unpaid" | "partial" | "paid";
  invoice_status?: string;
}

interface SupplierPaymentDetail {
  payment_id: number;
  invoice_source: InvoiceSource;
  invoice_id: number;
  payment_date: string;
  amount_paid: number;
  payment_method: string;
  bank_account: string | null;
  payment_reference: string | null;
  internal_reference: string | null;
  journal_entry_id: number | null;
  journal_reference_no: string | null;
  notes: string | null;
  status: "active" | "pending" | "cancelled";
  cancellation_date: string | null;
  cancellation_reason: string | null;
  invoice_doc_no: string;
  supplier_name: string;
}

const paymentMethodOptions = [
  { id: "bank_transfer", name: "Bank Transfer" },
  { id: "cheque", name: "Cheque" },
  { id: "cash", name: "Cash" },
  { id: "online", name: "Online" },
];

const bankAccountOptions = [
  { id: "BANK_PBB", name: "Public Bank" },
  { id: "BANK_ABB", name: "Alliance Bank" },
];

const VALID_SOURCES: InvoiceSource[] = [
  "purchase_invoices",
  "self_billed_invoices",
];

const toNumber = (value: unknown): number => {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
};

async function loadSourceInvoice(
  source: InvoiceSource,
  invoiceId: number
): Promise<SourceInvoice | null> {
  if (source === "purchase_invoices") {
    const response = await api.get<{
      id: number;
      invoice_number: string;
      invoice_date: string;
      total_amount: number;
      amount_paid: number;
      payment_status: SourceInvoice["payment_status"];
      supplier_name?: string;
    }>(`/api/purchase-invoices/${invoiceId}`);
    if (!response) return null;
    const total = toNumber(response.total_amount);
    const paid = toNumber(response.amount_paid);
    return {
      id: response.id,
      doc_no: response.invoice_number,
      supplier_name: response.supplier_name || "Supplier",
      invoice_date: response.invoice_date || null,
      total,
      amount_paid: paid,
      balance: Math.max(0, Math.round((total - paid) * 100) / 100),
      payment_status: response.payment_status || "unpaid",
      invoice_status: "active",
    };
  }

  const response = await api.get<{
    invoice: {
      id: number;
      purchase_kind?: "foreign" | "local";
      self_billed_no: string;
      purchase_date: string;
      payable_amount_myr: number;
      amount_paid?: number;
      payment_status?: SourceInvoice["payment_status"];
      invoice_status?: string;
      local_supplier_name?: string | null;
      supplier?: { supplier_name?: string };
    };
  }>(`/api/general-purchases/${invoiceId}`);
  if (!response?.invoice) return null;
  const invoice = response.invoice;
  const total = toNumber(invoice.payable_amount_myr);
  const paid = toNumber(invoice.amount_paid);
  return {
    id: invoice.id,
    doc_no: invoice.self_billed_no,
    purchase_kind: invoice.purchase_kind || "foreign",
    supplier_name:
      invoice.supplier?.supplier_name ||
      invoice.local_supplier_name ||
      "Supplier",
    invoice_date: invoice.purchase_date || null,
    total,
    amount_paid: paid,
    balance: Math.max(0, Math.round((total - paid) * 100) / 100),
    payment_status: invoice.payment_status || "unpaid",
    invoice_status: invoice.invoice_status || "active",
  };
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-MY", {
    style: "currency",
    currency: "MYR",
    minimumFractionDigits: 2,
  }).format(value);
}

const toLocalDateInputValue = (value: string | null | undefined): string => {
  if (!value) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return format(date, "yyyy-MM-dd");
};

const SupplierPaymentFormPage: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const isEditMode = Boolean(id && id !== "new");
  const today = format(new Date(), "yyyy-MM-dd");

  const queriedSource = searchParams.get("source") as InvoiceSource | null;
  const queriedInvoiceId = searchParams.get("invoice_id");

  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [cancelling, setCancelling] = useState<boolean>(false);
  const [showCancelDialog, setShowCancelDialog] = useState<boolean>(false);
  const [existing, setExisting] = useState<SupplierPaymentDetail | null>(null);
  const [invoice, setInvoice] = useState<SourceInvoice | null>(null);

  const [formData, setFormData] = useState({
    payment_date: today,
    amount_paid: "",
    payment_method: "bank_transfer" as
      | "cash"
      | "cheque"
      | "bank_transfer"
      | "online",
    bank_account: "BANK_PBB",
    payment_reference: "",
    internal_reference: "",
    notes: "",
  });

  const source: InvoiceSource | null = useMemo(() => {
    if (existing) return existing.invoice_source;
    if (queriedSource && VALID_SOURCES.includes(queriedSource)) {
      return queriedSource;
    }
    return null;
  }, [existing, queriedSource]);

  const invoiceId: number | null = useMemo(() => {
    if (existing) return existing.invoice_id;
    if (queriedInvoiceId) return Number.parseInt(queriedInvoiceId, 10);
    return null;
  }, [existing, queriedInvoiceId]);

  const loadData = useCallback(async (): Promise<void> => {
    setLoading(true);
    try {
      if (isEditMode && id) {
        const payment = await api.get<SupplierPaymentDetail>(
          `/api/supplier-payments/${id}`
        );
        setExisting(payment);
        const inv = await loadSourceInvoice(
          payment.invoice_source,
          payment.invoice_id
        );
        setInvoice(inv);
        setFormData({
          payment_date: toLocalDateInputValue(payment.payment_date) || today,
          amount_paid: toNumber(payment.amount_paid).toFixed(2),
          payment_method: payment.payment_method as
            | "cash"
            | "cheque"
            | "bank_transfer"
            | "online",
          bank_account: payment.bank_account || "BANK_PBB",
          payment_reference: payment.payment_reference || "",
          internal_reference: payment.internal_reference || "",
          notes: payment.notes || "",
        });
      } else {
        if (
          !queriedSource ||
          !VALID_SOURCES.includes(queriedSource) ||
          !queriedInvoiceId
        ) {
          toast.error("Missing invoice context. Open from the invoice page.");
          return;
        }
        const inv = await loadSourceInvoice(
          queriedSource,
          Number.parseInt(queriedInvoiceId, 10)
        );
        if (!inv) {
          toast.error("Source invoice not found");
          return;
        }
        setInvoice(inv);
        setFormData((prev) => ({
          ...prev,
          amount_paid: inv.balance.toFixed(2),
        }));
      }
    } catch (error: unknown) {
      console.error("Error loading supplier payment context:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to load payment"
      );
    } finally {
      setLoading(false);
    }
  }, [id, isEditMode, queriedSource, queriedInvoiceId, today]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const updateField = (field: keyof typeof formData, value: string): void => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const canEdit: boolean = !isEditMode;
  const canCancel: boolean = isEditMode && existing?.status === "active";
  const invoiceUrl = useMemo((): string | null => {
    if (!source || !invoiceId) return null;
    if (source === "purchase_invoices") {
      return `/stock/material-purchases/${invoiceId}`;
    }
    return invoice?.purchase_kind === "local"
      ? `/stock/general-purchases/local/${invoiceId}`
      : `/stock/general-purchases/${invoiceId}`;
  }, [invoice?.purchase_kind, invoiceId, source]);
  const journalUrl: string | null = existing?.journal_entry_id
    ? `/accounting/journal-entries/${existing.journal_entry_id}`
    : null;

  const validateBeforeSave = (): boolean => {
    if (!invoice || !source || !invoiceId) {
      toast.error("Missing invoice context");
      return false;
    }
    if (!formData.payment_date) {
      toast.error("Payment date is required");
      return false;
    }
    const amount = toNumber(formData.amount_paid);
    if (!(amount > 0)) {
      toast.error("Amount must be greater than zero");
      return false;
    }
    if (amount - invoice.balance > 0.005) {
      toast.error(
        `Amount exceeds outstanding balance (${formatCurrency(invoice.balance)})`
      );
      return false;
    }
    if (formData.payment_method !== "cash" && !formData.bank_account) {
      toast.error("Bank account is required for non-cash payments");
      return false;
    }
    return true;
  };

  const handleSave = async (): Promise<void> => {
    if (isEditMode) {
      toast.error("Existing payments cannot be edited. Cancel and re-record.");
      return;
    }
    if (!validateBeforeSave()) return;
    setSaving(true);
    try {
      const payload = {
        invoice_source: source,
        invoice_id: invoiceId,
        payment_date: formData.payment_date,
        amount_paid: toNumber(formData.amount_paid),
        payment_method: formData.payment_method,
        bank_account:
          formData.payment_method === "cash" ? null : formData.bank_account,
        payment_reference: formData.payment_reference.trim() || null,
        internal_reference: formData.internal_reference.trim() || null,
        notes: formData.notes.trim() || null,
      };
      const response = await api.post("/api/supplier-payments", payload);
      toast.success("Supplier payment recorded");
      const newId = response.payment?.payment_id;
      if (newId) {
        navigate(`/accounting/supplier-payments/${newId}`, { replace: true });
      } else {
        navigate("/accounting/supplier-payments");
      }
    } catch (error: unknown) {
      console.error("Error recording supplier payment:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to record payment"
      );
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = async (): Promise<void> => {
    if (!existing) return;
    setCancelling(true);
    try {
      await api.put(`/api/supplier-payments/${existing.payment_id}/cancel`, {
        cancellation_reason: "Cancelled via system",
      });
      toast.success("Payment cancelled");
      setShowCancelDialog(false);
      await loadData();
    } catch (error: unknown) {
      console.error("Error cancelling supplier payment:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to cancel payment"
      );
    } finally {
      setCancelling(false);
    }
  };

  const backUrl: string = isEditMode
    ? "/accounting/supplier-payments"
    : invoiceUrl || "/accounting/supplier-payments";

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <BackButton onClick={() => navigate(backUrl)} />
          <span className="text-default-300 dark:text-gray-600">|</span>
          <div>
            <h1 className="text-lg font-semibold text-default-800 dark:text-gray-100">
              {isEditMode ? "Supplier Payment" : "Record Supplier Payment"}
            </h1>
            {existing && (
              <p className="text-sm text-default-500 dark:text-gray-400">
                {existing.internal_reference || `Payment #${existing.payment_id}`}
                {existing.status === "cancelled" && (
                  <span className="ml-2 inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700 dark:bg-gray-700 dark:text-gray-300">
                    Cancelled
                  </span>
                )}
              </p>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          {canCancel && (
            <Button
              type="button"
              icon={IconX}
              color="rose"
              variant="outline"
              size="sm"
              onClick={() => setShowCancelDialog(true)}
            >
              Cancel Payment
            </Button>
          )}
          {!isEditMode && (
            <Button
              type="button"
              color="sky"
              variant="filled"
              size="sm"
              disabled={saving}
              onClick={handleSave}
            >
              {saving ? "Saving..." : "Record Payment"}
            </Button>
          )}
        </div>
      </div>

      {invoice && (
        <section className="rounded-lg border border-default-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-800">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-default-600 dark:text-gray-300">
            Invoice
          </h2>
          <div className="grid gap-3 md:grid-cols-4 text-sm">
            <div>
              <p className="text-xs text-default-500 dark:text-gray-400">Supplier</p>
              <p className="font-medium text-default-900 dark:text-gray-100">
                {invoice.supplier_name}
              </p>
            </div>
            <div>
              <p className="text-xs text-default-500 dark:text-gray-400">Invoice No.</p>
              {invoiceUrl ? (
                <button
                  type="button"
                  onClick={() => navigate(invoiceUrl)}
                  className="text-sky-700 hover:text-sky-900 hover:underline dark:text-sky-300 dark:hover:text-sky-200"
                >
                  {invoice.doc_no}
                </button>
              ) : (
                <p className="text-default-900 dark:text-gray-100">
                  {invoice.doc_no}
                </p>
              )}
            </div>
            <div>
              <p className="text-xs text-default-500 dark:text-gray-400">Total</p>
              <p className="text-default-900 dark:text-gray-100">
                {formatCurrency(invoice.total)}
              </p>
            </div>
            <div>
              <p className="text-xs text-default-500 dark:text-gray-400">
                {isEditMode ? "Already Paid" : "Outstanding Balance"}
              </p>
              <p className="text-default-900 dark:text-gray-100">
                {isEditMode
                  ? formatCurrency(invoice.amount_paid)
                  : formatCurrency(invoice.balance)}
              </p>
            </div>
          </div>
        </section>
      )}

      <section className="rounded-lg border border-default-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-800">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-default-600 dark:text-gray-300">
          Payment Details
        </h2>
        <div className="grid gap-3 md:grid-cols-3">
          <FormInput
            name="payment_date"
            label="Payment Date"
            value={formData.payment_date}
            type="date"
            onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
              updateField("payment_date", event.target.value)
            }
            disabled={!canEdit}
            required
          />
          <FormInput
            name="amount_paid"
            label="Amount (MYR)"
            value={formData.amount_paid}
            type="number"
            min={0}
            step="0.01"
            onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
              updateField("amount_paid", event.target.value)
            }
            disabled={!canEdit}
            required
          />
          <FormListbox
            name="payment_method"
            label="Payment Method"
            value={formData.payment_method}
            onChange={(value: string) =>
              updateField("payment_method", value)
            }
            options={paymentMethodOptions}
            disabled={!canEdit}
            required
          />
          {formData.payment_method !== "cash" && (
            <FormListbox
              name="bank_account"
              label="Bank Account"
              value={formData.bank_account}
              onChange={(value: string) => updateField("bank_account", value)}
              options={bankAccountOptions}
              disabled={!canEdit}
              required
            />
          )}
          <FormInput
            name="payment_reference"
            label="Payment Reference"
            value={formData.payment_reference}
            onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
              updateField("payment_reference", event.target.value)
            }
            disabled={!canEdit}
            placeholder="Cheque no. / txn ref"
          />
          <FormInput
            name="internal_reference"
            label="PV / Internal Reference"
            value={formData.internal_reference}
            onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
              updateField("internal_reference", event.target.value)
            }
            disabled={!canEdit}
            placeholder="Auto-generated if left blank"
          />
        </div>
        <div className="mt-3 space-y-2">
          <label className="block text-sm font-medium text-default-700 dark:text-gray-200">
            Notes
          </label>
          <textarea
            value={formData.notes}
            onChange={(event: React.ChangeEvent<HTMLTextAreaElement>) =>
              updateField("notes", event.target.value)
            }
            disabled={!canEdit}
            rows={3}
            placeholder="Optional notes"
            className="w-full rounded-lg border border-default-300 bg-white px-3 py-2 text-sm text-default-900 placeholder:text-default-400 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 disabled:cursor-not-allowed disabled:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:placeholder:text-gray-500 dark:disabled:bg-gray-700"
          />
        </div>
      </section>

      {existing && (
        <section className="rounded-lg border border-default-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-800">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-default-600 dark:text-gray-300">
            Journal Posting
          </h2>
          <div className="grid gap-3 md:grid-cols-3 text-sm">
            <div>
              <p className="text-xs text-default-500 dark:text-gray-400">
                Journal Reference
              </p>
              {journalUrl && existing.journal_reference_no ? (
                <button
                  type="button"
                  onClick={() => navigate(journalUrl)}
                  className="text-sky-700 hover:text-sky-900 hover:underline dark:text-sky-300 dark:hover:text-sky-200"
                >
                  {existing.journal_reference_no}
                </button>
              ) : (
                <p className="text-default-900 dark:text-gray-100">
                  {existing.journal_reference_no || "-"}
                </p>
              )}
            </div>
            <div>
              <p className="text-xs text-default-500 dark:text-gray-400">Status</p>
              <p className="text-default-900 dark:text-gray-100">
                {existing.status}
              </p>
            </div>
            {existing.cancellation_date && (
              <div>
                <p className="text-xs text-default-500 dark:text-gray-400">
                  Cancelled At
                </p>
                <p className="text-default-900 dark:text-gray-100">
                  {new Date(existing.cancellation_date).toLocaleString("en-MY")}
                </p>
              </div>
            )}
          </div>
        </section>
      )}

      <ConfirmationDialog
        isOpen={showCancelDialog}
        onClose={() => setShowCancelDialog(false)}
        onConfirm={handleCancel}
        title="Cancel Supplier Payment"
        message="Cancel this payment? The journal entry will be reversed and the invoice's outstanding balance restored."
        confirmButtonText={cancelling ? "Cancelling..." : "Cancel Payment"}
        variant="danger"
      />
    </div>
  );
};

export default SupplierPaymentFormPage;
