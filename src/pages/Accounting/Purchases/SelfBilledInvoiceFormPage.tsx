import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  IconDownload,
  IconEye,
  IconExternalLink,
  IconFile,
  IconRefresh,
  IconSend,
  IconTrash,
  IconUpload,
  IconX,
} from "@tabler/icons-react";
import { useNavigate, useParams } from "react-router-dom";
import toast from "react-hot-toast";
import BackButton from "../../../components/BackButton";
import Button from "../../../components/Button";
import ConfirmationDialog from "../../../components/ConfirmationDialog";
import { FormInput, FormListbox } from "../../../components/FormComponents";
import LoadingSpinner from "../../../components/LoadingSpinner";
import { COUNTRY_OPTIONS, CURRENCY_OPTIONS } from "../../../constants/einvoiceCodes";
import { api } from "../../../routes/utils/api";
import {
  SelfBilledEInvoiceStatus,
  SelfBilledForeignSupplier,
  SelfBilledInvoice,
  SelfBilledInvoiceStatus,
  SelfBilledInvoiceInput,
  SelfBilledInvoiceLine,
} from "../../../types/types";

interface SelfBilledFormData {
  purchase_date: string;
  transaction_type: string;
  platform: string;
  order_no: string;
  payment_reference: string;
  shipping_method: string;
  shipping_number: string;
  has_supporting_document: boolean;
  supporting_document_notes: string;
  currency_code: string;
  fx_rate: string;
  notes: string;
}

const today = new Date().toISOString().slice(0, 10);

const defaultSupplier: SelfBilledForeignSupplier = {
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
  city: "",
  postcode: "",
  state_code: "17",
  country_code: "CHN",
  contact_number: "NA",
  email: "",
  notes: "",
  is_active: true,
};

const defaultFormData: SelfBilledFormData = {
  purchase_date: today,
  transaction_type: "Importation of goods",
  platform: "TAOBAO",
  order_no: "",
  payment_reference: "",
  shipping_method: "TAOBAO AIR SHIPPING",
  shipping_number: "",
  has_supporting_document: false,
  supporting_document_notes: "",
  currency_code: "CNY",
  fx_rate: "0.6000",
  notes: "",
};

const createDefaultLine = (lineNumber: number): SelfBilledInvoiceLine => ({
  line_number: lineNumber,
  description: "",
  quantity: 1,
  unit_price_foreign: 0,
  amount_foreign: 0,
  amount_myr: 0,
  classification_code: "034",
  tax_type: "06",
  tax_rate: 0,
  tax_amount_myr: 0,
  tax_exemption_reason: "",
  customs_form_reference: "",
  notes: "",
});

const taxTypeOptions = [
  { id: "06", name: "06 - Not Applicable" },
  { id: "01", name: "01 - Sales Tax" },
  { id: "02", name: "02 - Service Tax" },
  { id: "E", name: "E - Tax Exemption" },
];

const getStatusLabel = (status: SelfBilledEInvoiceStatus): string => {
  if (!status) return "Not Submitted";
  return status.charAt(0).toUpperCase() + status.slice(1);
};

const getStatusClasses = (status: SelfBilledEInvoiceStatus): string => {
  switch (status) {
    case "valid":
      return "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300";
    case "pending":
      return "bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-300";
    case "invalid":
      return "bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300";
    case "cancelled":
      return "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300";
    default:
      return "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300";
  }
};

const getInvoiceStatusLabel = (status: SelfBilledInvoiceStatus): string => {
  return status === "cancelled" ? "Cancelled" : "Active";
};

const getInvoiceStatusClasses = (status: SelfBilledInvoiceStatus): string => {
  if (status === "cancelled") {
    return "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300";
  }
  return "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300";
};

const toNumber = (value: string | number | null | undefined): number => {
  const parsed =
    typeof value === "string" ? Number.parseFloat(value) : Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

const toNullableNumber = (
  value: string | number | null | undefined
): number | null => {
  if (value === "" || value === null || value === undefined) return null;
  const parsed =
    typeof value === "string" ? Number.parseFloat(value) : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const formatAmount = (amount: number, currency: string): string => {
  return new Intl.NumberFormat("en-MY", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(amount);
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

const SelfBilledInvoiceFormPage: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isEditMode = Boolean(id && id !== "new");

  const [formData, setFormData] =
    useState<SelfBilledFormData>(defaultFormData);
  const [supplier, setSupplier] =
    useState<SelfBilledForeignSupplier>(defaultSupplier);
  const [lines, setLines] = useState<SelfBilledInvoiceLine[]>([
    createDefaultLine(1),
  ]);
  const [existingInvoice, setExistingInvoice] =
    useState<SelfBilledInvoice | null>(null);
  const [supplierSuggestions, setSupplierSuggestions] = useState<
    SelfBilledForeignSupplier[]
  >([]);
  const [supplierSearchFocused, setSupplierSearchFocused] =
    useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(isEditMode);
  const [saving, setSaving] = useState<boolean>(false);
  const [savingRecords, setSavingRecords] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [supportingDocumentFile, setSupportingDocumentFile] =
    useState<File | null>(null);
  const [supportingDocumentUploading, setSupportingDocumentUploading] =
    useState<boolean>(false);
  const [s3Enabled, setS3Enabled] = useState<boolean>(true);
  const [showDeleteDialog, setShowDeleteDialog] = useState<boolean>(false);
  const [showCancelDialog, setShowCancelDialog] = useState<boolean>(false);
  const [showDocViewer, setShowDocViewer] = useState<boolean>(false);
  const [docViewerUrl, setDocViewerUrl] = useState<string | null>(null);

  const canEdit =
    existingInvoice?.invoice_status !== "cancelled" &&
    existingInvoice?.einvoice_status !== "pending" &&
    existingInvoice?.einvoice_status !== "valid" &&
    existingInvoice?.einvoice_status !== "cancelled";
  const canEditRecords =
    !isEditMode || existingInvoice?.invoice_status !== "cancelled";
  const hasMultipleSavedLines = isEditMode && lines.length > 1;
  const canEditSummary = canEdit && !hasMultipleSavedLines;
  const summaryLine = lines[0] || createDefaultLine(1);
  const canViewMyInvoisPortal =
    isEditMode &&
    Boolean(existingInvoice?.uuid) &&
    Boolean(existingInvoice?.long_id) &&
    (existingInvoice?.einvoice_status === "valid" ||
      existingInvoice?.einvoice_status === "cancelled");
  const myInvoisPortalUrl = canViewMyInvoisPortal
    ? `https://myinvois.hasil.gov.my/${existingInvoice?.uuid}/share/${existingInvoice?.long_id}`
    : null;

  const loadInvoice = useCallback(async (): Promise<void> => {
    if (!isEditMode || !id) return;

    setLoading(true);
    try {
      const response = (await api.get(
        `/api/self-billed-invoices/${id}`
      )) as SelfBilledInvoice;

      setExistingInvoice(response);
      setSupplier({
        ...defaultSupplier,
        ...response.supplier,
      });
      setFormData({
        purchase_date: response.purchase_date?.slice(0, 10) || today,
        transaction_type: response.transaction_type,
        platform: response.platform || "",
        order_no: response.order_no || "",
        payment_reference: response.payment_reference || "",
        shipping_method: response.shipping_method || "",
        shipping_number: response.shipping_number || "",
        has_supporting_document: response.has_supporting_document,
        supporting_document_notes: response.supporting_document_notes || "",
        currency_code: response.currency_code,
        fx_rate: String(response.fx_rate || "1"),
        notes: response.notes || "",
      });
      setLines(
        response.lines.length > 0
          ? response.lines.map((line: SelfBilledInvoiceLine) => ({
              ...line,
              quantity: toNumber(line.quantity),
              balance_quantity: toNullableNumber(line.balance_quantity),
              unit_price_foreign: toNumber(line.unit_price_foreign),
              amount_foreign: toNumber(line.amount_foreign),
              amount_myr: toNumber(line.amount_myr),
              tax_rate: toNumber(line.tax_rate),
              tax_amount_myr: toNumber(line.tax_amount_myr),
            }))
          : [createDefaultLine(1)]
      );
    } catch (error) {
      console.error("Error loading self-billed invoice:", error);
      toast.error("Failed to load self-billed invoice");
    } finally {
      setLoading(false);
    }
  }, [id, isEditMode]);

  useEffect(() => {
    loadInvoice();
  }, [loadInvoice]);

  useEffect(() => {
    api
      .get<{ s3Enabled: boolean }>("/api/self-billed-invoices/features")
      .then((data) => setS3Enabled(data.s3Enabled))
      .catch(() => setS3Enabled(false));
  }, []);

  useEffect(() => {
    const search = supplier.supplier_name.trim();
    if (search.length < 1) {
      setSupplierSuggestions([]);
      return;
    }

    const timer: number = window.setTimeout(async () => {
      try {
        const response = (await api.get(
          `/api/self-billed-invoices/foreign-suppliers?search=${encodeURIComponent(
            search
          )}&limit=8`
        )) as SelfBilledForeignSupplier[];
        setSupplierSuggestions(response || []);
      } catch (error) {
        console.error("Error fetching supplier suggestions:", error);
      }
    }, 200);

    return () => window.clearTimeout(timer);
  }, [supplier.supplier_name]);

  const totals = useMemo(() => {
    return lines.reduce(
      (accumulator, line) => ({
        foreign:
          accumulator.foreign + toNumber(line.amount_foreign),
        myr: accumulator.myr + toNumber(line.amount_myr),
        tax: accumulator.tax + toNumber(line.tax_amount_myr),
      }),
      { foreign: 0, myr: 0, tax: 0 }
    );
  }, [lines]);

  const updateFormField = (
    field: keyof SelfBilledFormData,
    value: string | boolean
  ): void => {
    setFormData((previous: SelfBilledFormData) => ({
      ...previous,
      [field]: value,
    }));

    if (field === "fx_rate") {
      const newRate = toNumber(value as string);
      if (newRate > 0) {
        setLines((previousLines: SelfBilledInvoiceLine[]) =>
          isEditMode && previousLines.length > 1
            ? previousLines
            : previousLines.map((line: SelfBilledInvoiceLine) => ({
                ...line,
                amount_myr: Number(
                  (toNumber(line.amount_foreign) * newRate).toFixed(2)
                ),
              }))
        );
      }
    }
  };

  const updateSupplierField = (
    field: keyof SelfBilledForeignSupplier,
    value: string | boolean
  ): void => {
    setSupplier((previous: SelfBilledForeignSupplier) => ({
      ...previous,
      [field]: value,
      tin_number: "EI00000000030",
    }));
  };

  const updateLineField = (
    index: number,
    field: keyof SelfBilledInvoiceLine,
    value: string | number
  ): void => {
    const fxRate = toNumber(formData.fx_rate) || 1;
    setLines((previousLines: SelfBilledInvoiceLine[]) =>
      previousLines.map((line: SelfBilledInvoiceLine, lineIndex: number) => {
        if (lineIndex !== index) return line;

        const nextLine: SelfBilledInvoiceLine = { ...line };
        nextLine[field] = value as never;

        if (field === "amount_foreign") {
          const amountForeign = toNumber(value);
          nextLine.quantity = 1;
          nextLine.unit_price_foreign = amountForeign;
          nextLine.amount_foreign = amountForeign;
          nextLine.amount_myr = Number((amountForeign * fxRate).toFixed(2));
        }

        return nextLine;
      })
    );
  };

  const validateBeforeSave = (): boolean => {
    if (!supplier.supplier_name.trim()) {
      toast.error("Supplier name is required");
      return false;
    }
    if (!supplier.address_line_0.trim() || !supplier.city.trim()) {
      toast.error("Supplier address and city are required");
      return false;
    }
    if (lines.length === 0) {
      toast.error("At least one line is required");
      return false;
    }
    const linesToValidate = hasMultipleSavedLines ? lines : [summaryLine];
    const invalidLineIndex = linesToValidate.findIndex(
      (line: SelfBilledInvoiceLine) =>
        !line.description.trim() ||
        (hasMultipleSavedLines && toNumber(line.quantity) <= 0) ||
        toNumber(line.amount_foreign) <= 0 ||
        toNumber(line.amount_myr) <= 0
    );
    if (invalidLineIndex >= 0) {
      toast.error(`Line ${invalidLineIndex + 1} is incomplete`);
      return false;
    }
    return true;
  };

  const buildLinePayload = (
    line: SelfBilledInvoiceLine,
    index: number
  ): SelfBilledInvoiceLine => ({
    ...line,
    line_number: index + 1,
    quantity: toNumber(line.quantity),
    unit_price_foreign: toNumber(line.unit_price_foreign),
    amount_foreign: toNumber(line.amount_foreign),
    amount_myr: toNumber(line.amount_myr),
    tax_rate: toNumber(line.tax_rate),
    tax_amount_myr: toNumber(line.tax_amount_myr),
    classification_code: line.classification_code || "034",
    tax_type: line.tax_type || "06",
    customs_form_reference: line.customs_form_reference || null,
    tax_exemption_reason: line.tax_exemption_reason || null,
    balance_quantity: toNullableNumber(line.balance_quantity),
    notes: line.notes || null,
  });

  const buildSummaryLinePayload = (
    line: SelfBilledInvoiceLine
  ): SelfBilledInvoiceLine => {
    const amountForeign = toNumber(line.amount_foreign);
    const fxRate = toNumber(formData.fx_rate) || 1;

    return {
      ...line,
      line_number: 1,
      quantity: 1,
      unit_price_foreign: amountForeign,
      amount_foreign: amountForeign,
      amount_myr: Number((amountForeign * fxRate).toFixed(2)),
      tax_rate: toNumber(line.tax_rate),
      tax_amount_myr: toNumber(line.tax_amount_myr),
      classification_code: "034",
      tax_type: line.tax_type || "06",
      customs_form_reference: null,
      tax_exemption_reason: null,
      balance_quantity: toNullableNumber(line.balance_quantity),
      notes: line.notes || null,
    };
  };

  const buildPayload = (): SelfBilledInvoiceInput => {
    const payloadLines = hasMultipleSavedLines
      ? lines.map(buildLinePayload)
      : [buildSummaryLinePayload(summaryLine)];

    return {
      foreign_supplier_id:
        supplier.id || existingInvoice?.foreign_supplier_id || null,
      supplier: {
        ...supplier,
        tin_number: "EI00000000030",
        id_number: supplier.id_number || "NA",
        sst_number: supplier.sst_number || "NA",
        ttx_number: supplier.ttx_number || "NA",
        msic_code: supplier.msic_code || "00000",
        business_activity_description:
          supplier.business_activity_description || "NA",
        state_code: supplier.state_code || "17",
        country_code: supplier.country_code || "CHN",
        contact_number: supplier.contact_number || "NA",
      },
      purchase_date: formData.purchase_date,
      transaction_type: formData.transaction_type,
      platform: formData.platform.trim() || null,
      order_no: formData.order_no.trim() || null,
      payment_reference: formData.payment_reference.trim() || null,
      shipping_method: formData.shipping_method.trim() || null,
      shipping_number: formData.shipping_number.trim() || null,
      has_supporting_document: formData.has_supporting_document,
      supporting_document_notes:
        formData.supporting_document_notes.trim() || null,
      currency_code: formData.currency_code,
      fx_rate: toNumber(formData.fx_rate),
      notes: formData.notes.trim() || null,
      lines: payloadLines,
    };
  };

  const uploadSupportingDocument = async (
    invoiceId: number
  ): Promise<boolean> => {
    if (!supportingDocumentFile || !s3Enabled) return true;

    setSupportingDocumentUploading(true);
    try {
      await api.uploadRaw(
        `/api/self-billed-invoices/${invoiceId}/supporting-document?filename=${encodeURIComponent(
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
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to upload supporting document"
      );
      return false;
    } finally {
      setSupportingDocumentUploading(false);
    }
  };

  const saveInvoice = async (): Promise<number | null> => {
    if (!validateBeforeSave()) return null;

    setSaving(true);
    try {
      const payload = buildPayload();
      if (isEditMode && id) {
        await api.put(`/api/self-billed-invoices/${id}`, payload);
        await uploadSupportingDocument(Number.parseInt(id, 10));
        toast.success("Self-billed invoice updated");
        await loadInvoice();
        return Number.parseInt(id, 10);
      }

      const response = await api.post("/api/self-billed-invoices", payload);
      const newId = response.invoice.id as number;
      await uploadSupportingDocument(newId);
      toast.success("Self-billed invoice created");
      navigate(`/accounting/self-billed-invoices/${newId}`, { replace: true });
      return newId;
    } catch (error: unknown) {
      console.error("Error saving self-billed invoice:", error);
      toast.error(error instanceof Error ? error.message : "Failed to save invoice");
      return null;
    } finally {
      setSaving(false);
    }
  };

  const saveRecordFields = async (): Promise<void> => {
    if (!id || !canEditRecords) return;

    setSavingRecords(true);
    try {
      await api.patch(`/api/self-billed-invoices/${id}/record-fields`, {
        lines: lines.map((line: SelfBilledInvoiceLine, index: number) => ({
          id: line.id,
          line_number: line.line_number || index + 1,
          balance_quantity: toNullableNumber(line.balance_quantity),
        })),
      });

      await uploadSupportingDocument(Number.parseInt(id, 10));
      toast.success("Record fields saved");
      await loadInvoice();
    } catch (error: unknown) {
      console.error("Error saving record fields:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to save record fields"
      );
    } finally {
      setSavingRecords(false);
    }
  };

  const downloadSupportingDocument = async (): Promise<void> => {
    if (!id || !existingInvoice?.supporting_document_filename) return;

    try {
      const blob = await api.downloadBlob(
        `/api/self-billed-invoices/${id}/supporting-document`
      );
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
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to download supporting document"
      );
    }
  };

  const isViewable = (filename?: string | null, contentType?: string | null): boolean => {
    if (contentType) return contentType.startsWith("image/") || contentType === "application/pdf";
    if (filename) {
      const lower = filename.toLowerCase();
      return lower.endsWith(".pdf") || /\.(jpg|jpeg|png|gif|webp)$/.test(lower);
    }
    return false;
  };

  const viewSupportingDocument = async (): Promise<void> => {
    if (!id || !existingInvoice?.supporting_document_filename) return;
    try {
      const blob = await api.downloadBlob(
        `/api/self-billed-invoices/${id}/supporting-document`
      );
      const url = window.URL.createObjectURL(blob);
      setDocViewerUrl(url);
      setShowDocViewer(true);
    } catch (error: unknown) {
      console.error("Error viewing supporting document:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to load document"
      );
    }
  };

  const closeDocViewer = (): void => {
    setShowDocViewer(false);
    if (docViewerUrl) {
      window.URL.revokeObjectURL(docViewerUrl);
      setDocViewerUrl(null);
    }
  };

  const removeSupportingDocument = async (): Promise<void> => {
    if (!id || !canEditRecords) return;

    try {
      await api.delete(`/api/self-billed-invoices/${id}/supporting-document`, {});
      setSupportingDocumentFile(null);
      toast.success("Supporting document removed");
      await loadInvoice();
    } catch (error: unknown) {
      console.error("Error removing supporting document:", error);
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to remove supporting document"
      );
    }
  };

  const submitInvoice = async (): Promise<void> => {
    const invoiceId = await saveInvoice();
    if (!invoiceId) return;

    setSubmitting(true);
    try {
      await api.post(`/api/self-billed-invoices/${invoiceId}/submit`, {});
      toast.success("Submitted to MyInvois");
      if (isEditMode) {
        await loadInvoice();
      } else {
        navigate(`/accounting/self-billed-invoices/${invoiceId}`, {
          replace: true,
        });
      }
    } catch (error: unknown) {
      console.error("Error submitting self-billed invoice:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to submit to MyInvois"
      );
    } finally {
      setSubmitting(false);
    }
  };

  const refreshStatus = async (): Promise<void> => {
    if (!id) return;
    try {
      await api.put(`/api/self-billed-invoices/${id}/refresh-status`, {});
      toast.success("Status refreshed");
      await loadInvoice();
    } catch (error: unknown) {
      console.error("Error refreshing self-billed status:", error);
      toast.error(error instanceof Error ? error.message : "Failed to refresh status");
    }
  };

  const clearStatus = async (): Promise<void> => {
    if (!id) return;
    try {
      await api.post(`/api/self-billed-invoices/${id}/clear-status`, {});
      toast.success("E-invoice status cleared");
      await loadInvoice();
    } catch (error: unknown) {
      console.error("Error clearing self-billed status:", error);
      toast.error(error instanceof Error ? error.message : "Failed to clear status");
    }
  };

  const cancelInvoice = async (): Promise<void> => {
    if (!id) return;
    try {
      await api.post(`/api/self-billed-invoices/${id}/cancel`, {
        reason: "Cancelled via system",
      });
      toast.success("Self-billed invoice cancelled");
      setShowCancelDialog(false);
      await loadInvoice();
    } catch (error: unknown) {
      console.error("Error cancelling self-billed invoice:", error);
      toast.error(error instanceof Error ? error.message : "Failed to cancel invoice");
    }
  };

  const deleteInvoice = async (): Promise<void> => {
    if (!id) return;
    try {
      await api.delete(`/api/self-billed-invoices/${id}`);
      toast.success("Self-billed invoice deleted");
      navigate("/accounting/self-billed-invoices");
    } catch (error: unknown) {
      console.error("Error deleting self-billed invoice:", error);
      toast.error(error instanceof Error ? error.message : "Failed to delete invoice");
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* Sticky header */}
      <div className="sticky top-0 z-20 -mx-1 flex flex-col gap-2 rounded-lg border border-default-200 bg-white/95 px-3 py-2 shadow-sm backdrop-blur dark:border-gray-700 dark:bg-gray-800/95 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <BackButton onClick={() => navigate("/accounting/self-billed-invoices")} />
          <span className="text-default-300 dark:text-gray-600">|</span>
          <div>
            <h1 className="text-lg font-semibold text-default-800 dark:text-gray-100">
              {isEditMode ? "Self-Billed E-Invoice" : "New Self-Billed E-Invoice"}
            </h1>
            {isEditMode && existingInvoice && (
              <div className="mt-1 flex flex-wrap items-center gap-2 text-sm">
                <span className="font-mono text-default-600 dark:text-gray-400">
                  {existingInvoice.self_billed_no}
                </span>
                <span
                  className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${getInvoiceStatusClasses(
                    existingInvoice.invoice_status
                  )}`}
                >
                  {getInvoiceStatusLabel(existingInvoice.invoice_status)}
                </span>
                <span
                  className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${getStatusClasses(
                    existingInvoice.einvoice_status
                  )}`}
                >
                  E-Invoice: {getStatusLabel(existingInvoice.einvoice_status)}
                </span>
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {myInvoisPortalUrl && (
            <a
              href={myInvoisPortalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-8 items-center gap-2 rounded-lg border border-default-300 bg-white px-3 text-sm font-medium text-default-700 hover:bg-default-50 hover:text-sky-700 focus:outline-none focus:ring-2 focus:ring-sky-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700 dark:hover:text-sky-300"
              title="View in MyInvois Portal"
            >
              <IconExternalLink size={16} />
              E-Invoice Details
            </a>
          )}
          {isEditMode && existingInvoice?.uuid && (
            <Button
              type="button"
              icon={IconRefresh}
              variant="outline"
              size="sm"
              className="h-8 rounded-lg"
              onClick={refreshStatus}
            >
              Refresh
            </Button>
          )}
          {isEditMode && existingInvoice?.einvoice_status && canEdit && (
            <Button
              type="button"
              icon={IconX}
              variant="outline"
              size="sm"
              className="h-8 rounded-lg"
              onClick={clearStatus}
            >
              Clear Status
            </Button>
          )}
          {isEditMode && existingInvoice?.invoice_status !== "cancelled" && (
            <Button
              type="button"
              icon={IconX}
              color="rose"
              variant="outline"
              size="sm"
              className="h-8 rounded-lg"
              onClick={() => setShowCancelDialog(true)}
            >
              Cancel
            </Button>
          )}
          {canEdit && (
            <Button
              type="button"
              icon={IconSend}
              color="amber"
              variant="outline"
              size="sm"
              className="h-8 rounded-lg"
              disabled={submitting || saving}
              onClick={submitInvoice}
            >
              {submitting ? "Submitting..." : "Save & Submit"}
            </Button>
          )}
          {canEdit && (
            <Button
              type="button"
              color="sky"
              variant="filled"
              size="sm"
              className="h-8 rounded-lg"
              disabled={saving || submitting}
              onClick={saveInvoice}
            >
              {saving ? "Saving..." : "Save"}
            </Button>
          )}
          {isEditMode && !canEdit && canEditRecords && (
            <Button
              type="button"
              color="sky"
              variant="filled"
              size="sm"
              className="h-8 rounded-lg"
              disabled={savingRecords || supportingDocumentUploading}
              onClick={saveRecordFields}
            >
              {savingRecords || supportingDocumentUploading
                ? "Saving..."
                : "Save Records"}
            </Button>
          )}
        </div>
      </div>

      {/* UUID info bar */}
      {existingInvoice?.uuid && (
        <div className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-800 dark:border-sky-800 dark:bg-sky-900/20 dark:text-sky-200">
          <div className="grid gap-2 md:grid-cols-4">
            <div>
              <span className="text-sky-600 dark:text-sky-300">UUID</span>
              <p className="truncate font-mono">{existingInvoice.uuid}</p>
            </div>
            <div>
              <span className="text-sky-600 dark:text-sky-300">Submission</span>
              <p className="truncate font-mono">
                {existingInvoice.submission_uid || "-"}
              </p>
            </div>
            <div>
              <span className="text-sky-600 dark:text-sky-300">Long ID</span>
              <p className="truncate font-mono">{existingInvoice.long_id || "-"}</p>
            </div>
            <div>
              {myInvoisPortalUrl ? (
                <a
                  href={myInvoisPortalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 font-medium text-sky-700 hover:text-sky-900 hover:underline dark:text-sky-200 dark:hover:text-sky-100"
                  title="View in MyInvois Portal"
                >
                  E-Invoice Details
                  <IconExternalLink size={13} />
                </a>
              ) : (
                <p className="truncate font-mono">-</p>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="grid gap-2 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="space-y-2">

          {/* ── Purchase Information ── */}
          <section className="rounded-lg border border-default-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-800">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-default-600 dark:text-gray-300">
                Purchase Information
              </h2>
              <div className="flex items-center gap-2 text-xs text-default-400 dark:text-gray-500">
                <span className="rounded bg-default-100 px-1.5 py-0.5 font-mono dark:bg-gray-700">034</span>
                <span>Importation of goods</span>
              </div>
            </div>
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
                name="platform"
                label="Platform"
                value={formData.platform}
                onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                  updateFormField("platform", event.target.value)
                }
                disabled={!canEdit}
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
              <FormInput
                name="payment_reference"
                label="Payment Reference"
                value={formData.payment_reference}
                onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                  updateFormField("payment_reference", event.target.value)
                }
                disabled={!canEdit}
              />
              <FormInput
                name="shipping_method"
                label="Shipping Method"
                value={formData.shipping_method}
                onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                  updateFormField("shipping_method", event.target.value)
                }
                disabled={!canEdit}
              />
              <FormInput
                name="shipping_number"
                label="Shipping No."
                value={formData.shipping_number}
                onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                  updateFormField("shipping_number", event.target.value)
                }
                disabled={!canEdit}
              />
            </div>
          </section>

          {/* ── Foreign Supplier ── */}
          <section className="rounded-lg border border-default-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-800">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-default-600 dark:text-gray-300">
                Foreign Supplier
              </h2>
              <span className="rounded-full bg-sky-50 px-2.5 py-1 text-xs font-medium text-sky-700 dark:bg-sky-900/30 dark:text-sky-300">
                TIN {supplier.tin_number}
              </span>
            </div>

            <div className="grid gap-3 md:grid-cols-4">
              <div className="relative">
                <FormInput
                  name="supplier_name"
                  label="Supplier Name"
                  value={supplier.supplier_name}
                  onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
                    setSupplierSearchFocused(true);
                    updateSupplierField("supplier_name", event.target.value);
                  }}
                  onBlur={() =>
                    window.setTimeout(() => setSupplierSearchFocused(false), 150)
                  }
                  disabled={!canEdit}
                  required
                />
                {canEdit &&
                  supplierSearchFocused &&
                  supplierSuggestions.length > 0 && (
                    <div className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-default-200 bg-white py-1 shadow-lg dark:border-gray-700 dark:bg-gray-800">
                      {supplierSuggestions.map(
                        (suggestion: SelfBilledForeignSupplier) => (
                          <button
                            key={suggestion.id}
                            type="button"
                            onMouseDown={(
                              event: React.MouseEvent<HTMLButtonElement>
                            ) => {
                              event.preventDefault();
                              setSupplier({
                                ...defaultSupplier,
                                ...suggestion,
                                tin_number: "EI00000000030",
                              });
                              setSupplierSearchFocused(false);
                            }}
                            className="block w-full px-3 py-2 text-left text-sm text-default-700 hover:bg-default-50 dark:text-gray-200 dark:hover:bg-gray-700"
                          >
                            <span className="block truncate font-medium">
                              {suggestion.supplier_name}
                            </span>
                            <span className="block truncate text-xs text-default-500 dark:text-gray-400">
                              {suggestion.city || "-"} /{" "}
                              {suggestion.country_code || "CHN"}
                            </span>
                          </button>
                        )
                      )}
                    </div>
                  )}
              </div>
              <FormInput
                name="id_type"
                label="ID Type"
                value={supplier.id_type}
                onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                  updateSupplierField("id_type", event.target.value)
                }
                disabled={!canEdit}
              />
              <FormInput
                name="id_number"
                label="Registration No."
                value={supplier.id_number}
                onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                  updateSupplierField("id_number", event.target.value)
                }
                disabled={!canEdit}
              />
              <FormInput
                name="address_line_0"
                label="Address"
                value={supplier.address_line_0}
                onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                  updateSupplierField("address_line_0", event.target.value)
                }
                disabled={!canEdit}
                required
              />
              <FormInput
                name="city"
                label="City"
                value={supplier.city}
                onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                  updateSupplierField("city", event.target.value)
                }
                disabled={!canEdit}
                required
              />
              <FormListbox
                name="country_code"
                label="Country"
                value={supplier.country_code}
                onChange={(value: string) =>
                  updateSupplierField("country_code", value)
                }
                options={COUNTRY_OPTIONS}
                disabled={!canEdit}
                required
              />
              <FormInput
                name="state_code"
                label="State Code"
                value={supplier.state_code}
                onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                  updateSupplierField("state_code", event.target.value)
                }
                disabled={true}
              />
              <FormInput
                name="contact_number"
                label="Contact"
                value={supplier.contact_number}
                onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                  updateSupplierField("contact_number", event.target.value)
                }
                disabled={!canEdit}
              />
            </div>
          </section>

          {/* ── Purchase Summary ── */}
          <section className="rounded-lg border border-default-200 bg-white dark:border-gray-700 dark:bg-gray-800">
            {hasMultipleSavedLines ? (
              <div className="p-3">
                <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
                  Multiple saved lines detected — edit Balance Qty below and click Save Records.
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-[700px] w-full divide-y divide-default-200 text-sm dark:divide-gray-700">
                    <thead className="bg-default-50 dark:bg-gray-900/50">
                      <tr>
                        <th className="w-10 px-2 py-2 text-left text-xs font-medium uppercase tracking-wide text-default-500 dark:text-gray-400">#</th>
                        <th className="px-2 py-2 text-left text-xs font-medium uppercase tracking-wide text-default-500 dark:text-gray-400">Description</th>
                        <th className="w-20 px-2 py-2 text-right text-xs font-medium uppercase tracking-wide text-default-500 dark:text-gray-400">Qty</th>
                        <th className="w-28 px-2 py-2 text-right text-xs font-medium uppercase tracking-wide text-default-500 dark:text-gray-400">Foreign</th>
                        <th className="w-28 px-2 py-2 text-right text-xs font-medium uppercase tracking-wide text-default-500 dark:text-gray-400">MYR</th>
                        <th className="w-28 px-2 py-2 text-right text-xs font-medium uppercase tracking-wide text-default-500 dark:text-gray-400">Tax MYR</th>
                        <th className="w-32 px-2 py-2 text-right text-xs font-medium uppercase tracking-wide text-default-500 dark:text-gray-400">Balance Qty</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-default-200 dark:divide-gray-700">
                      {lines.map((line: SelfBilledInvoiceLine, index: number) => (
                        <tr key={`${line.id || "new"}-${index}`} className="hover:bg-default-50 dark:hover:bg-gray-700/40">
                          <td className="px-2 py-2 text-default-500 dark:text-gray-400">{index + 1}</td>
                          <td className="whitespace-pre-wrap px-2 py-2 text-default-900 dark:text-gray-100">{line.description || "-"}</td>
                          <td className="px-2 py-2 text-right font-mono text-default-700 dark:text-gray-300">{toNumber(line.quantity)}</td>
                          <td className="px-2 py-2 text-right font-mono text-default-900 dark:text-gray-100">{toNumber(line.amount_foreign).toFixed(2)}</td>
                          <td className="px-2 py-2 text-right font-mono text-default-900 dark:text-gray-100">{toNumber(line.amount_myr).toFixed(2)}</td>
                          <td className="px-2 py-2 text-right font-mono text-default-900 dark:text-gray-100">{toNumber(line.tax_amount_myr).toFixed(2)}</td>
                          <td className="px-2 py-2 text-right">
                            {canEditRecords ? (
                              <input
                                type="number"
                                value={line.balance_quantity ?? ""}
                                min={0}
                                step="1"
                                onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                                  updateLineField(index, "balance_quantity", event.target.value)
                                }
                                className="w-24 rounded-md border border-default-300 bg-white px-2 py-0.5 text-right text-sm font-mono text-default-900 focus:outline-none focus:ring-1 focus:ring-sky-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                              />
                            ) : (
                              <span className="font-mono text-default-900 dark:text-gray-100">{line.balance_quantity ?? "-"}</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className="space-y-3 p-3">
                {/* Description — full width */}
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-default-700 dark:text-gray-200">
                    Description <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    value={summaryLine.description}
                    onChange={(event: React.ChangeEvent<HTMLTextAreaElement>) =>
                      updateLineField(0, "description", event.target.value)
                    }
                    disabled={!canEditSummary}
                    placeholder="Paste grouped item details here"
                    rows={4}
                    className="w-full rounded-lg border border-default-300 bg-white px-3 py-2 text-sm text-default-900 placeholder:text-default-400 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:placeholder:text-gray-500 dark:disabled:bg-gray-700 dark:disabled:text-gray-400"
                  />
                </div>

                {/* Tax + Balance — row */}
                <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                  <FormInput
                    name="balance_quantity"
                    label="Balance Quantity"
                    value={summaryLine.balance_quantity ?? ""}
                    type="number"
                    min={0}
                    step="1"
                    onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                      updateLineField(0, "balance_quantity", event.target.value)
                    }
                    disabled={!canEditRecords}
                  />
                  <FormListbox
                    name="summary_tax_type"
                    label="Tax Type"
                    value={summaryLine.tax_type}
                    onChange={(value: string) =>
                      updateLineField(0, "tax_type", value)
                    }
                    options={taxTypeOptions}
                    disabled={!canEditSummary}
                    className="[&_button]:py-2"
                  />
                  <FormInput
                    name="tax_amount_myr"
                    label="Tax (MYR)"
                    value={summaryLine.tax_amount_myr}
                    type="number"
                    min={0}
                    step="0.01"
                    onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                      updateLineField(0, "tax_amount_myr", event.target.value)
                    }
                    disabled={!canEditSummary}
                  />
                </div>
              </div>
            )}
          </section>

          {/* ── Supporting Document & Notes ── */}
          <section className="rounded-lg border border-default-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-800">
            <div className="mb-3 flex items-center gap-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-default-600 dark:text-gray-300">
                Supporting Document & Notes
              </h2>
            </div>
            <div className="grid gap-3 md:grid-cols-2 md:items-stretch">
              <div className="flex flex-col rounded-lg border border-default-300 bg-white p-3 text-sm dark:border-gray-600 dark:bg-gray-700">
                {existingInvoice?.supporting_document_filename ? (
                  <div className="flex items-start gap-2">
                    <IconFile
                      size={18}
                      className="mt-0.5 shrink-0 text-sky-600 dark:text-sky-300"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-default-900 dark:text-gray-100">
                        {existingInvoice.supporting_document_filename}
                      </p>
                      <p className="text-xs text-default-500 dark:text-gray-400">
                        {formatFileSize(existingInvoice.supporting_document_size)} —{" "}
                        {formatDateTime(
                          existingInvoice.supporting_document_uploaded_at
                        )}
                      </p>
                    </div>
                  </div>
                ) : (
                  <p className="text-default-500 dark:text-gray-400">
                    No document uploaded.
                  </p>
                )}

                {supportingDocumentFile && (
                  <div className="mb-3 flex items-center gap-2 rounded border border-sky-200 bg-sky-50 px-2 py-1 text-xs text-sky-700 dark:border-sky-800 dark:bg-sky-900/20 dark:text-sky-300">
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
                  <p className="mb-2 text-xs text-amber-600 dark:text-amber-400">
                    Document upload unavailable — S3 storage not configured.
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
                      <Button
                        type="button"
                        icon={IconEye}
                        variant="outline"
                        size="sm"
                        className="h-8 rounded-lg"
                        onClick={viewSupportingDocument}
                      >
                        View
                      </Button>
                    )}
                  {existingInvoice?.supporting_document_filename && (
                    <Button
                      type="button"
                      icon={IconDownload}
                      variant="outline"
                      size="sm"
                      className="h-8 rounded-lg"
                      onClick={downloadSupportingDocument}
                    >
                      Download
                    </Button>
                  )}
                  {existingInvoice?.supporting_document_filename && canEditRecords && (
                    <Button
                      type="button"
                      icon={IconTrash}
                      color="rose"
                      variant="outline"
                      size="sm"
                      className="h-8 rounded-lg"
                      onClick={removeSupportingDocument}
                    >
                      Remove
                    </Button>
                  )}
                </div>
              </div>

              <div className="flex flex-col space-y-2">
                <textarea
                  value={formData.notes}
                  onChange={(event: React.ChangeEvent<HTMLTextAreaElement>) =>
                    updateFormField("notes", event.target.value)
                  }
                  disabled={!canEdit}
                  placeholder="Optional notes for this invoice"
                  className="flex-1 w-full rounded-lg border border-default-300 bg-white px-3 py-2 text-sm text-default-900 placeholder:text-default-400 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:placeholder:text-gray-500 dark:disabled:bg-gray-700 dark:disabled:text-gray-400"
                />
              </div>
            </div>
          </section>
        </div>

        {/* ── Sidebar ── */}
        <aside className="space-y-2 xl:sticky xl:top-14 xl:self-start">
          <section className="rounded-lg border border-default-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-800">
            <div className="grid gap-3">
              <FormListbox
                name="currency_code"
                label="Currency"
                value={formData.currency_code}
                onChange={(value: string) => updateFormField("currency_code", value)}
                options={CURRENCY_OPTIONS}
                disabled={!canEdit || hasMultipleSavedLines}
                className="[&_button]:py-1.5"
              />
              <FormInput
                name="fx_rate"
                label="FX Rate"
                value={formData.fx_rate}
                type="number"
                step="0.0001"
                min={0}
                onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                  updateFormField("fx_rate", event.target.value)
                }
                disabled={!canEdit || hasMultipleSavedLines}
                required
              />
              <div className="border-t border-default-100 pt-3 dark:border-gray-700">
                <FormInput
                  name="amount_foreign"
                  label={`Amount (${formData.currency_code})`}
                  value={summaryLine.amount_foreign}
                  type="number"
                  min={0}
                  step="0.01"
                  onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                    updateLineField(0, "amount_foreign", event.target.value)
                  }
                  disabled={!canEditSummary}
                  required
                />
              </div>
              <div className="space-y-2">
                <label className="block truncate text-sm font-medium text-default-700 dark:text-gray-200">
                  Amount (MYR)
                </label>
                <input
                  type="number"
                  value={summaryLine.amount_myr}
                  disabled={true}
                  className="block w-full rounded-lg border border-default-300 bg-gray-50 px-3 py-2 text-right text-sm font-mono text-default-500 shadow-sm disabled:cursor-not-allowed dark:border-gray-600 dark:bg-gray-700 dark:text-gray-400"
                />
              </div>
            </div>
          </section>

          <section className="rounded-lg border border-default-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-800">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-default-600 dark:text-gray-300">
              Totals
            </h2>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between gap-4">
                <span className="text-default-500 dark:text-gray-400">
                  {formData.currency_code} subtotal
                </span>
                <span className="font-mono font-semibold text-default-900 dark:text-gray-100">
                  {formatAmount(totals.foreign, formData.currency_code)}
                </span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-default-500 dark:text-gray-400">MYR subtotal</span>
                <span className="font-mono font-semibold text-default-900 dark:text-gray-100">
                  {formatAmount(totals.myr, "MYR")}
                </span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-default-500 dark:text-gray-400">Tax</span>
                <span className="font-mono font-semibold text-default-900 dark:text-gray-100">
                  {formatAmount(totals.tax, "MYR")}
                </span>
              </div>
              <div className="border-t border-default-200 pt-2 dark:border-gray-700">
                <div className="flex justify-between gap-4">
                  <span className="font-medium text-default-700 dark:text-gray-200">Payable</span>
                  <span className="font-mono text-lg font-semibold text-default-900 dark:text-gray-100">
                    {formatAmount(totals.myr + totals.tax, "MYR")}
                  </span>
                </div>
              </div>
            </div>
          </section>

          {isEditMode && canEdit && (
            <section className="rounded-lg border border-default-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-800">
              <Button
                type="button"
                color="rose"
                variant="outline"
                size="sm"
                additionalClasses="w-full"
                className="h-8 rounded-lg"
                onClick={() => setShowDeleteDialog(true)}
              >
                Delete Draft
              </Button>
            </section>
          )}
        </aside>
      </div>

      {showDocViewer && docViewerUrl && (
        <div className="fixed inset-0 z-50 flex flex-col bg-black/80">
          <div className="flex shrink-0 items-center justify-between gap-4 bg-gray-900 px-4 py-3">
            <div className="flex min-w-0 items-center gap-2">
              <IconFile size={18} className="shrink-0 text-sky-400" />
              <span className="truncate text-sm font-medium text-gray-100">
                {existingInvoice?.supporting_document_filename}
              </span>
              <span className="shrink-0 text-xs text-gray-400">
                {formatFileSize(existingInvoice?.supporting_document_size)}
              </span>
            </div>
            <button
              type="button"
              onClick={closeDocViewer}
              className="shrink-0 rounded-lg p-1.5 text-gray-400 hover:bg-gray-700 hover:text-gray-100 focus:outline-none focus:ring-2 focus:ring-sky-500"
            >
              <IconX size={20} />
            </button>
          </div>
          <iframe
            src={docViewerUrl}
            title={existingInvoice?.supporting_document_filename ?? "Document"}
            className="min-h-0 flex-1 w-full border-0 bg-white"
          />
        </div>
      )}

      <ConfirmationDialog
        isOpen={showDeleteDialog}
        onClose={() => setShowDeleteDialog(false)}
        onConfirm={deleteInvoice}
        title="Delete Self-Billed Invoice"
        message={`Delete "${existingInvoice?.self_billed_no || "this draft"}"?`}
        confirmButtonText="Delete"
        variant="danger"
      />

      <ConfirmationDialog
        isOpen={showCancelDialog}
        onClose={() => setShowCancelDialog(false)}
        onConfirm={cancelInvoice}
        title="Cancel Self-Billed Invoice"
        message={`Cancel "${
          existingInvoice?.self_billed_no || "this draft"
        }"? This marks the local invoice as Cancelled and will also cancel the MyInvois document when possible.`}
        confirmButtonText="Cancel Invoice"
        variant="danger"
      />
    </div>
  );
};

export default SelfBilledInvoiceFormPage;
