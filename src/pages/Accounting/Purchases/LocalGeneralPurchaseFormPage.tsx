import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { format } from "date-fns";
import {
  IconDownload,
  IconEye,
  IconFile,
  IconTrash,
  IconUpload,
  IconX,
} from "@tabler/icons-react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import toast from "react-hot-toast";
import BackButton from "../../../components/BackButton";
import Button from "../../../components/Button";
import ConfirmationDialog from "../../../components/ConfirmationDialog";
import { FormInput, FormListbox } from "../../../components/FormComponents";
import AccountCodeCombobox from "../../../components/Accounting/AccountCodeCombobox";
import SupplierPaymentInlineSection, {
  buildSupplierPaymentPayload,
  createDefaultSupplierPaymentDraft,
  SupplierPaymentDraft,
  syncSupplierPaymentDraftAmount,
  validateSupplierPaymentDraft,
} from "../../../components/Accounting/SupplierPaymentInlineSection";
import LoadingSpinner from "../../../components/LoadingSpinner";
import { api } from "../../../routes/utils/api";
import {
  GeneralStockCategory,
  SelfBilledForeignSupplier,
  SelfBilledInvoice,
  SelfBilledInvoiceInput,
  SelfBilledInvoiceLine,
} from "../../../types/types";

interface LocalGeneralPurchaseFormData {
  purchase_date: string;
  supplier_name: string;
  order_no: string;
  payment_reference: string;
  description: string;
  amount_myr: string;
  balance_quantity: string;
  general_stock_category_id: string;
  account_code: string;
  notes: string;
}

interface SupplierPaymentSummary {
  payment_id: number;
  payment_date: string;
  amount_paid: number;
  payment_method: string;
  bank_account: string | null;
  payment_reference: string | null;
  internal_reference: string | null;
  journal_reference_no: string | null;
  status: "active" | "pending" | "cancelled";
}

const today = format(new Date(), "yyyy-MM-dd");

const toLocalDateInputValue = (value: string | null | undefined): string => {
  if (!value) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return format(date, "yyyy-MM-dd");
};

const localSupplierStub: SelfBilledForeignSupplier = {
  supplier_name: "",
  tin_number: "EI00000000030",
  id_type: "BRN",
  id_number: "NA",
  sst_number: "NA",
  ttx_number: "NA",
  msic_code: "00000",
  business_activity_description: "NA",
  address_line_0: "NA",
  address_line_1: "",
  address_line_2: "",
  city: "NA",
  postcode: "",
  state_code: "17",
  country_code: "MYS",
  contact_number: "NA",
  email: "",
  notes: "",
  is_active: true,
};

const toNumber = (value: string | number | null | undefined): number => {
  const parsed =
    typeof value === "string" ? Number.parseFloat(value) : Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

const toNullableNumber = (value: string | number | null | undefined): number | null => {
  if (value === "" || value === null || value === undefined) return null;
  const parsed =
    typeof value === "string" ? Number.parseFloat(value) : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const formatFileSize = (bytes?: number | null): string => {
  if (!bytes) return "-";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const formatDateTime = (value?: string | null): string => {
  if (!value) return "-";
  return new Date(value).toLocaleString("en-MY", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const formatCurrency = (amount: number): string =>
  new Intl.NumberFormat("en-MY", {
    style: "currency",
    currency: "MYR",
    minimumFractionDigits: 2,
  }).format(amount);

const isViewable = (filename?: string | null, contentType?: string | null): boolean => {
  if (contentType) return contentType.startsWith("image/") || contentType === "application/pdf";
  if (!filename) return false;
  return filename.toLowerCase().endsWith(".pdf") || /\.(jpg|jpeg|png|gif|webp)$/.test(filename.toLowerCase());
};

const LocalGeneralPurchaseFormPage: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const isEditMode = Boolean(id && id !== "new");
  const backUrl = `/stock/general-purchases${searchParams.get("month") ? `?month=${searchParams.get("month")}` : ""}`;

  const [formData, setFormData] = useState<LocalGeneralPurchaseFormData>({
    purchase_date: today,
    supplier_name: "",
    order_no: "",
    payment_reference: "",
    description: "",
    amount_myr: "",
    balance_quantity: "",
    general_stock_category_id: "",
    account_code: "",
    notes: "",
  });
  const [existingInvoice, setExistingInvoice] = useState<SelfBilledInvoice | null>(null);
  const [categories, setCategories] = useState<GeneralStockCategory[]>([]);
  const [loading, setLoading] = useState<boolean>(isEditMode);
  const [saving, setSaving] = useState<boolean>(false);
  const [s3Enabled, setS3Enabled] = useState<boolean>(true);
  const [supportingDocumentFile, setSupportingDocumentFile] = useState<File | null>(null);
  const [supportingDocumentUploading, setSupportingDocumentUploading] = useState<boolean>(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState<boolean>(false);
  const [showDocViewer, setShowDocViewer] = useState<boolean>(false);
  const [docViewerUrl, setDocViewerUrl] = useState<string | null>(null);
  const [supplierPayments, setSupplierPayments] = useState<SupplierPaymentSummary[]>([]);
  const [supplierPayment, setSupplierPayment] = useState<SupplierPaymentDraft>(
    () => createDefaultSupplierPaymentDraft(today, 0, !isEditMode)
  );
  const previousPayableAmountRef = useRef<number>(0);

  const categoryOptions = useMemo(
    () => [
      { id: "", name: "No General stock category" },
      ...categories.map((category: GeneralStockCategory) => ({
        id: String(category.id),
        name: category.name,
      })),
    ],
    [categories]
  );
  const payableAmount = useMemo<number>(
    () => Math.round(toNumber(formData.amount_myr) * 100) / 100,
    [formData.amount_myr]
  );
  const outstandingPaymentAmount = useMemo<number>(() => {
    const alreadyPaid: number = toNumber(existingInvoice?.amount_paid || 0);
    return Math.max(0, Math.round((payableAmount - alreadyPaid) * 100) / 100);
  }, [existingInvoice?.amount_paid, payableAmount]);
  const canRecordSupplierPayment: boolean =
    !isEditMode ||
    Boolean(
      existingInvoice &&
        existingInvoice.invoice_status !== "cancelled" &&
        existingInvoice.payment_status !== "paid"
    );
  const canEdit: boolean =
    !isEditMode ||
    Boolean(
      existingInvoice &&
        existingInvoice.invoice_status !== "cancelled" &&
        existingInvoice.payment_status !== "paid"
    );
  const canEditRecords: boolean = canEdit;
  const canDelete: boolean =
    isEditMode &&
    existingInvoice?.invoice_status !== "cancelled" &&
    existingInvoice?.payment_status === "unpaid";

  useEffect(() => {
    setSupplierPayment((previous: SupplierPaymentDraft) =>
      syncSupplierPaymentDraftAmount(
        previous,
        outstandingPaymentAmount,
        previousPayableAmountRef.current
      )
    );
    previousPayableAmountRef.current = outstandingPaymentAmount;
  }, [outstandingPaymentAmount]);

  const loadInvoice = useCallback(async (): Promise<void> => {
    if (!isEditMode || !id) return;

    setLoading(true);
    try {
      const { invoice, s3Enabled: fetchedS3Enabled, categories: fetchedCategories } = await api.get<{
        invoice: SelfBilledInvoice;
        s3Enabled: boolean;
        categories: GeneralStockCategory[];
      }>(`/api/general-purchases/${id}`);
      const line = invoice.lines[0];
      setExistingInvoice(invoice);
      setS3Enabled(fetchedS3Enabled);
      setCategories(fetchedCategories || []);
      setFormData({
        purchase_date: toLocalDateInputValue(invoice.purchase_date) || today,
        supplier_name: invoice.local_supplier_name || "",
        order_no: invoice.order_no || "",
        payment_reference: invoice.payment_reference || "",
        description: line?.description || "",
        amount_myr: String(toNumber(line?.amount_myr || invoice.payable_amount_myr)),
        balance_quantity: line?.balance_quantity === null || line?.balance_quantity === undefined
          ? ""
          : String(line.balance_quantity),
        general_stock_category_id: line?.general_stock_category_id ? String(line.general_stock_category_id) : "",
        account_code: line?.account_code || "",
        notes: invoice.notes || "",
      });
      setSupplierPayment((previous: SupplierPaymentDraft) => ({
        ...previous,
        payment_date: toLocalDateInputValue(invoice.purchase_date) || today,
        payment_reference: invoice.payment_reference || "",
      }));
      try {
        const payments: SupplierPaymentSummary[] = await api.get<SupplierPaymentSummary[]>(
          `/api/supplier-payments/by-invoice?invoice_source=self_billed_invoices&invoice_id=${id}&include_cancelled=true`
        );
        setSupplierPayments(Array.isArray(payments) ? payments : []);
      } catch (paymentError: unknown) {
        console.error("Error loading local purchase payments:", paymentError);
        setSupplierPayments([]);
      }
    } catch (error: unknown) {
      console.error("Error loading local general purchase:", error);
      toast.error(error instanceof Error ? error.message : "Failed to load local general purchase");
    } finally {
      setLoading(false);
    }
  }, [id, isEditMode]);

  useEffect(() => {
    loadInvoice();
  }, [loadInvoice]);

  useEffect(() => {
    if (isEditMode) return;
    api
      .get<{ s3Enabled: boolean; categories: GeneralStockCategory[] }>("/api/general-purchases/init")
      .then(({ s3Enabled, categories }) => {
        setS3Enabled(s3Enabled);
        setCategories(categories || []);
      })
      .catch((error: unknown) => {
        console.error("Error loading init data:", error);
        setS3Enabled(false);
      });
  }, [isEditMode]);

  const updateFormField = (
    field: keyof LocalGeneralPurchaseFormData,
    value: string
  ): void => {
    setFormData((previous: LocalGeneralPurchaseFormData) => ({
      ...previous,
      [field]: value,
    }));

    if (field === "purchase_date") {
      setSupplierPayment((previous: SupplierPaymentDraft) =>
        !previous.payment_date || previous.payment_date === formData.purchase_date
          ? { ...previous, payment_date: value }
          : previous
      );
    }
  };

  const validateBeforeSave = (): boolean => {
    if (!formData.supplier_name.trim()) {
      toast.error("Supplier name is required");
      return false;
    }
    if (!formData.purchase_date) {
      toast.error("Purchase date is required");
      return false;
    }
    if (!formData.description.trim()) {
      toast.error("Description is required");
      return false;
    }
    if (toNumber(formData.amount_myr) <= 0) {
      toast.error("Amount must be greater than zero");
      return false;
    }
    if (!formData.account_code.trim()) {
      toast.error("GL account is required");
      return false;
    }
    const paymentError: string | null = validateSupplierPaymentDraft(
      supplierPayment,
      outstandingPaymentAmount
    );
    if (paymentError) {
      toast.error(paymentError);
      return false;
    }
    return true;
  };

  const buildPayload = (): SelfBilledInvoiceInput => {
    const amountMyr = toNumber(formData.amount_myr);
    const line: SelfBilledInvoiceLine = {
      id: existingInvoice?.lines[0]?.id,
      line_number: 1,
      description: formData.description.trim(),
      quantity: 1,
      balance_quantity: toNullableNumber(formData.balance_quantity),
      general_stock_category_id: formData.general_stock_category_id
        ? Number.parseInt(formData.general_stock_category_id, 10)
        : null,
      unit_price_foreign: amountMyr,
      amount_foreign: amountMyr,
      amount_myr: amountMyr,
      classification_code: "034",
      tax_type: "06",
      tax_rate: 0,
      tax_amount_myr: 0,
      tax_exemption_reason: null,
      customs_form_reference: null,
      account_code: formData.account_code.trim() || null,
      notes: null,
    };

    return {
      purchase_kind: "local",
      foreign_supplier_id: null,
      local_supplier_name: formData.supplier_name.trim(),
      supplier: localSupplierStub,
      purchase_date: formData.purchase_date,
      transaction_type: "Local general purchase",
      platform: null,
      order_no: formData.order_no.trim() || null,
      payment_reference:
        (supplierPayment.enabled
          ? supplierPayment.payment_reference.trim()
          : formData.payment_reference.trim()) || null,
      shipping_method: null,
      shipping_number: null,
      has_supporting_document: Boolean(existingInvoice?.supporting_document_filename),
      supporting_document_notes: null,
      currency_code: "MYR",
      fx_rate: 1,
      notes: formData.notes.trim() || null,
      lines: [line],
    };
  };

  const uploadSupportingDocument = async (invoiceId: number): Promise<boolean> => {
    if (!supportingDocumentFile || !s3Enabled) return true;

    setSupportingDocumentUploading(true);
    try {
      await api.uploadRaw(
        `/api/general-purchases/${invoiceId}/supporting-document?filename=${encodeURIComponent(
          supportingDocumentFile.name
        )}`,
        supportingDocumentFile,
        supportingDocumentFile.type || "application/octet-stream"
      );
      setSupportingDocumentFile(null);
      toast.success("Supporting document uploaded");
      return true;
    } catch (error: unknown) {
      console.error("Error uploading supporting document:", error);
      toast.error(error instanceof Error ? error.message : "Failed to upload supporting document");
      return false;
    } finally {
      setSupportingDocumentUploading(false);
    }
  };

  const maybeRecordSupplierPayment = async (
    invoiceId: number,
    amountToSettle: number
  ): Promise<boolean> => {
    if (!supplierPayment.enabled) return false;

    try {
      await api.post(
        "/api/supplier-payments",
        buildSupplierPaymentPayload(
          supplierPayment,
          "self_billed_invoices",
          invoiceId,
          amountToSettle,
          formData.payment_reference
        )
      );
      setSupplierPayment((previous: SupplierPaymentDraft) => ({
        ...previous,
        enabled: false,
        amount_paid: "0.00",
        payment_reference: "",
        internal_reference: "",
        notes: "",
      }));
      return true;
    } catch (error: unknown) {
      const message: string =
        error instanceof Error ? error.message : "Failed to record payment";
      toast.error(`Purchase saved, but payment failed: ${message}`);
      return false;
    }
  };

  const saveInvoice = async (): Promise<void> => {
    if (!validateBeforeSave()) return;

    setSaving(true);
    try {
      const payload = buildPayload();
      if (isEditMode && id) {
        await api.put(`/api/general-purchases/${id}`, payload);
        await uploadSupportingDocument(Number.parseInt(id, 10));
        const paymentRecorded: boolean = await maybeRecordSupplierPayment(
          Number.parseInt(id, 10),
          outstandingPaymentAmount
        );
        toast.success(
          paymentRecorded
            ? "Local general purchase updated and paid"
            : "Local general purchase updated"
        );
        await loadInvoice();
        return;
      }

      const response: { invoice: { id: number } } = await api.post(
        "/api/general-purchases",
        payload
      );
      const newId: number = response.invoice.id;
      await uploadSupportingDocument(newId);
      const paymentRecorded: boolean = await maybeRecordSupplierPayment(
        newId,
        payableAmount
      );
      toast.success(
        paymentRecorded
          ? "Local general purchase created and paid"
          : "Local general purchase created"
      );
      navigate(`/stock/general-purchases/local/${newId}`, { replace: true });
    } catch (error: unknown) {
      console.error("Error saving local general purchase:", error);
      toast.error(error instanceof Error ? error.message : "Failed to save local general purchase");
    } finally {
      setSaving(false);
    }
  };

  const downloadSupportingDocument = async (): Promise<void> => {
    if (!id || !existingInvoice?.supporting_document_filename) return;

    try {
      const blob = await api.downloadBlob(`/api/general-purchases/${id}/supporting-document`);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = existingInvoice.supporting_document_filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error: unknown) {
      console.error("Error downloading supporting document:", error);
      toast.error(error instanceof Error ? error.message : "Failed to download supporting document");
    }
  };

  const viewSupportingDocument = async (): Promise<void> => {
    if (!id || !existingInvoice?.supporting_document_filename) return;

    try {
      const blob = await api.downloadBlob(`/api/general-purchases/${id}/supporting-document`);
      const url = window.URL.createObjectURL(blob);
      setDocViewerUrl(url);
      setShowDocViewer(true);
    } catch (error: unknown) {
      console.error("Error viewing supporting document:", error);
      toast.error(error instanceof Error ? error.message : "Failed to view supporting document");
    }
  };

  const removeSupportingDocument = async (): Promise<void> => {
    if (!id) return;

    try {
      await api.delete(`/api/general-purchases/${id}/supporting-document`, {});
      toast.success("Supporting document removed");
      await loadInvoice();
    } catch (error: unknown) {
      console.error("Error removing supporting document:", error);
      toast.error(error instanceof Error ? error.message : "Failed to remove supporting document");
    }
  };

  const deleteInvoice = async (): Promise<void> => {
    if (!id) return;

    try {
      await api.delete(`/api/general-purchases/${id}`);
      toast.success("Local general purchase deleted");
      navigate("/stock/general-purchases");
    } catch (error: unknown) {
      console.error("Error deleting local general purchase:", error);
      toast.error(error instanceof Error ? error.message : "Failed to delete local general purchase");
    }
  };

  useEffect(() => {
    return () => {
      if (docViewerUrl) window.URL.revokeObjectURL(docViewerUrl);
    };
  }, [docViewerUrl]);

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
              {isEditMode ? "Local General Purchase" : "New Local General Purchase"}
            </h1>
            {existingInvoice && (
              <p className="font-mono text-sm text-default-500 dark:text-gray-400">
                {existingInvoice.self_billed_no}
              </p>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          {canDelete && (
            <Button
              type="button"
              color="rose"
              variant="outline"
              size="sm"
              icon={IconTrash}
              onClick={() => setShowDeleteDialog(true)}
            >
              Delete
            </Button>
          )}
          <Button
            type="button"
            color="sky"
            variant="filled"
            size="sm"
            disabled={!canEdit || saving || supportingDocumentUploading}
            onClick={saveInvoice}
          >
            {saving ? "Saving..." : "Save"}
          </Button>
        </div>
      </div>

      {isEditMode && existingInvoice?.payment_status === "paid" && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-300">
          This purchase is fully paid and cannot be edited. Cancel the linked payment first if a correction is needed.
        </div>
      )}

      <section className="rounded-lg border border-default-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-800">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-default-600 dark:text-gray-300">
          Purchase Information
        </h2>
        <div className="grid gap-3 md:grid-cols-4">
          <FormInput
            name="purchase_date"
            label="Purchase Date"
            value={formData.purchase_date}
            type="date"
            onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
              updateFormField("purchase_date", event.target.value)
            }
            disabled={!canEdit}
            required
          />
          <FormInput
            name="supplier_name"
            label="Supplier Name"
            value={formData.supplier_name}
            onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
              updateFormField("supplier_name", event.target.value)
            }
            disabled={!canEdit}
            required
          />
          <FormInput
            name="order_no"
            label="Order No."
            value={formData.order_no}
            onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
              updateFormField("order_no", event.target.value)
            }
            disabled={!canEdit}
          />
        </div>
      </section>

      <section className="rounded-lg border border-default-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-800">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-default-600 dark:text-gray-300">
          Purchase Summary
        </h2>
        <div className="space-y-3">
          <div className="space-y-2">
            <label className="block text-sm font-medium text-default-700 dark:text-gray-200">
              Description <span className="text-red-500">*</span>
            </label>
            <textarea
              value={formData.description}
              onChange={(event: React.ChangeEvent<HTMLTextAreaElement>) =>
                updateFormField("description", event.target.value)
              }
              disabled={!canEdit}
              rows={4}
              className="w-full rounded-lg border border-default-300 bg-white px-3 py-2 text-sm text-default-900 placeholder:text-default-400 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:placeholder:text-gray-500 dark:disabled:bg-gray-700 dark:disabled:text-gray-400"
              placeholder="Purchase details"
            />
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <FormInput
              name="amount_myr"
              label="Amount (MYR)"
              value={formData.amount_myr}
              type="number"
              min={0}
              step="0.01"
              onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                updateFormField("amount_myr", event.target.value)
              }
              disabled={!canEdit}
              required
            />
            <AccountCodeCombobox
              label="GL Account"
              required
              value={formData.account_code}
              onChange={(value: string) => updateFormField("account_code", value)}
              disabled={!canEdit}
              placeholder="Pick the expense account to debit"
            />
            <FormInput
              name="balance_quantity"
              label="Balance Quantity"
              value={formData.balance_quantity}
              type="number"
              min={0}
              step="1"
              onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                updateFormField("balance_quantity", event.target.value)
              }
              disabled={!canEdit}
            />
            <FormListbox
              name="general_stock_category_id"
              label="General Category"
              value={formData.general_stock_category_id}
              onChange={(value: string) =>
                updateFormField("general_stock_category_id", value)
              }
              options={categoryOptions}
              disabled={!canEdit}
            />
          </div>
        </div>
      </section>

      {canRecordSupplierPayment && (
        <SupplierPaymentInlineSection
          draft={supplierPayment}
          outstandingAmount={outstandingPaymentAmount}
          onChange={setSupplierPayment}
          disabled={saving || supportingDocumentUploading}
        />
      )}

      {isEditMode && supplierPayments.length > 0 && (
        <section className="rounded-lg border border-default-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-800">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-default-600 dark:text-gray-300">
            Payment Info
          </h2>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-default-200 text-left text-xs uppercase tracking-wide text-default-500 dark:border-gray-700 dark:text-gray-400">
                  <th className="px-2 py-2">Reference</th>
                  <th className="px-2 py-2">Date</th>
                  <th className="px-2 py-2">Method</th>
                  <th className="px-2 py-2 text-right">Amount</th>
                  <th className="px-2 py-2">Journal</th>
                  <th className="px-2 py-2">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-default-100 dark:divide-gray-700">
                {supplierPayments.map((payment: SupplierPaymentSummary) => (
                  <tr key={payment.payment_id}>
                    <td className="px-2 py-2">
                      <button
                        type="button"
                        onClick={() =>
                          navigate(`/accounting/supplier-payments/${payment.payment_id}`)
                        }
                        className="font-mono text-sky-700 hover:text-sky-900 hover:underline dark:text-sky-300 dark:hover:text-sky-200"
                      >
                        {payment.internal_reference || `Payment #${payment.payment_id}`}
                      </button>
                      {payment.payment_reference && (
                        <div className="text-xs text-default-500 dark:text-gray-400">
                          {payment.payment_reference}
                        </div>
                      )}
                    </td>
                    <td className="px-2 py-2 text-default-700 dark:text-gray-200">
                      {formatDateTime(payment.payment_date)}
                    </td>
                    <td className="px-2 py-2 capitalize text-default-700 dark:text-gray-200">
                      {payment.payment_method.replace("_", " ")}
                      {payment.bank_account && payment.bank_account !== "CASH" && (
                        <span className="ml-1 text-xs text-default-500 dark:text-gray-400">
                          ({payment.bank_account.replace("BANK_", "")})
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-2 text-right font-mono text-default-900 dark:text-gray-100">
                      {formatCurrency(toNumber(payment.amount_paid))}
                    </td>
                    <td className="px-2 py-2 font-mono text-default-700 dark:text-gray-200">
                      {payment.journal_reference_no || "-"}
                    </td>
                    <td className="px-2 py-2 capitalize text-default-700 dark:text-gray-200">
                      {payment.status}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="rounded-lg border border-default-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-800">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-default-600 dark:text-gray-300">
          Supporting Document & Notes
        </h2>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="flex flex-col rounded-lg border border-default-300 bg-white p-3 text-sm dark:border-gray-600 dark:bg-gray-700">
            {existingInvoice?.supporting_document_filename ? (
              <div className="flex items-start gap-2">
                <IconFile size={18} className="mt-0.5 shrink-0 text-sky-600 dark:text-sky-300" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-default-900 dark:text-gray-100">
                    {existingInvoice.supporting_document_filename}
                  </p>
                  <p className="text-xs text-default-500 dark:text-gray-400">
                    {formatFileSize(existingInvoice.supporting_document_size)} -{" "}
                    {formatDateTime(existingInvoice.supporting_document_uploaded_at)}
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-default-500 dark:text-gray-400">
                No document uploaded.
              </p>
            )}

            {supportingDocumentFile && (
              <div className="mt-3 flex items-center gap-2 rounded border border-sky-200 bg-sky-50 px-2 py-1 text-xs text-sky-700 dark:border-sky-800 dark:bg-sky-900/20 dark:text-sky-300">
                <span className="min-w-0 flex-1 truncate">
                  {supportingDocumentFile.name} ({formatFileSize(supportingDocumentFile.size)})
                </span>
                <button
                  type="button"
                  onClick={() => setSupportingDocumentFile(null)}
                  className="shrink-0 rounded p-0.5 text-sky-600 hover:bg-sky-100 hover:text-sky-900 focus:outline-none focus:ring-2 focus:ring-sky-500 dark:text-sky-300 dark:hover:bg-sky-900/40 dark:hover:text-sky-100"
                >
                  <IconX size={14} />
                </button>
              </div>
            )}

            {!s3Enabled && (
              <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
                Document upload unavailable - S3 storage not configured.
              </p>
            )}

            <div className="mt-auto flex flex-wrap gap-2 pt-3">
              <label
                className={`inline-flex h-8 cursor-pointer items-center gap-2 rounded-lg border border-default-300 px-3 text-sm font-medium text-default-700 hover:bg-default-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-600 ${
                  !canEditRecords || !s3Enabled ? "pointer-events-none opacity-60" : ""
                }`}
              >
                <IconUpload size={16} />
                {existingInvoice?.supporting_document_filename ? "Replace" : "Upload"}
                <input
                  type="file"
                  accept=".pdf,.doc,.docx,image/*"
                  className="hidden"
                  disabled={!canEditRecords || !s3Enabled}
                  onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
                    setSupportingDocumentFile(event.target.files?.[0] || null);
                    event.target.value = "";
                  }}
                />
              </label>
              {existingInvoice?.supporting_document_filename &&
                isViewable(
                  existingInvoice.supporting_document_filename,
                  existingInvoice.supporting_document_content_type
                ) && (
                  <Button type="button" icon={IconEye} variant="outline" size="sm" className="h-8 rounded-lg" onClick={viewSupportingDocument}>
                    View
                  </Button>
                )}
              {existingInvoice?.supporting_document_filename && (
                <Button type="button" icon={IconDownload} variant="outline" size="sm" className="h-8 rounded-lg" onClick={downloadSupportingDocument}>
                  Download
                </Button>
              )}
              {existingInvoice?.supporting_document_filename && canEditRecords && (
                <Button type="button" icon={IconTrash} color="rose" variant="outline" size="sm" className="h-8 rounded-lg" onClick={removeSupportingDocument}>
                  Remove
                </Button>
              )}
            </div>
          </div>

          <textarea
            value={formData.notes}
            onChange={(event: React.ChangeEvent<HTMLTextAreaElement>) =>
              updateFormField("notes", event.target.value)
            }
            disabled={!canEdit}
            placeholder="Optional notes"
            className="min-h-[160px] rounded-lg border border-default-300 bg-white px-3 py-2 text-sm text-default-900 placeholder:text-default-400 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 dark:placeholder:text-gray-500 dark:disabled:bg-gray-800 dark:disabled:text-gray-400"
          />
        </div>
      </section>

      {showDocViewer && docViewerUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="flex h-[90vh] w-[90vw] flex-col overflow-hidden rounded-lg bg-white shadow-xl dark:bg-gray-900">
            <div className="flex items-center justify-between border-b border-default-200 px-4 py-2 dark:border-gray-700">
              <span className="truncate text-sm font-medium text-default-900 dark:text-gray-100">
                {existingInvoice?.supporting_document_filename}
              </span>
              <button
                type="button"
                className="rounded p-1 text-default-500 hover:bg-default-100 hover:text-default-800 dark:text-gray-300 dark:hover:bg-gray-800"
                onClick={() => setShowDocViewer(false)}
              >
                <IconX size={20} />
              </button>
            </div>
            <iframe src={docViewerUrl} title="Supporting document" className="h-full w-full bg-white" />
          </div>
        </div>
      )}

      <ConfirmationDialog
        isOpen={showDeleteDialog}
        onClose={() => setShowDeleteDialog(false)}
        onConfirm={deleteInvoice}
        title="Delete Local General Purchase"
        message={`Delete "${existingInvoice?.self_billed_no || "this draft"}"?`}
        confirmButtonText="Delete"
        variant="danger"
      />
    </div>
  );
};

export default LocalGeneralPurchaseFormPage;
