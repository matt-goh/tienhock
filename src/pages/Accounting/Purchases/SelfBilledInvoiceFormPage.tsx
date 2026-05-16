import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  IconCopy,
  IconPlus,
  IconRefresh,
  IconSend,
  IconTrash,
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

const formatAmount = (amount: number, currency: string): string => {
  return new Intl.NumberFormat("en-MY", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(amount);
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
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState<boolean>(false);
  const [showCancelDialog, setShowCancelDialog] = useState<boolean>(false);

  const canEdit =
    existingInvoice?.invoice_status !== "cancelled" &&
    existingInvoice?.einvoice_status !== "pending" &&
    existingInvoice?.einvoice_status !== "valid";

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
          previousLines.map((line: SelfBilledInvoiceLine) => ({
            ...line,
            amount_myr: Number((toNumber(line.amount_foreign) * newRate).toFixed(2)),
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

        if (
          field === "quantity" ||
          field === "unit_price_foreign" ||
          field === "amount_foreign"
        ) {
          const quantity = toNumber(nextLine.quantity);
          const unitPrice = toNumber(nextLine.unit_price_foreign);
          const amountForeign =
            field === "amount_foreign"
              ? toNumber(value)
              : Number((quantity * unitPrice).toFixed(2));
          nextLine.amount_foreign = amountForeign;
          nextLine.amount_myr = Number((amountForeign * fxRate).toFixed(2));
        }

        return nextLine;
      })
    );
  };

  const addLine = (): void => {
    setLines((previousLines: SelfBilledInvoiceLine[]) => [
      ...previousLines,
      createDefaultLine(previousLines.length + 1),
    ]);
  };

  const duplicateLine = (index: number): void => {
    setLines((previousLines: SelfBilledInvoiceLine[]) => {
      const duplicatedLine: SelfBilledInvoiceLine = {
        ...previousLines[index],
        id: undefined,
        line_number: previousLines.length + 1,
      };
      return [...previousLines, duplicatedLine];
    });
  };

  const removeLine = (index: number): void => {
    setLines((previousLines: SelfBilledInvoiceLine[]) =>
      previousLines
        .filter((_: SelfBilledInvoiceLine, lineIndex: number) => lineIndex !== index)
        .map((line: SelfBilledInvoiceLine, lineIndex: number) => ({
          ...line,
          line_number: lineIndex + 1,
        }))
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
    const invalidLineIndex = lines.findIndex(
      (line: SelfBilledInvoiceLine) =>
        !line.description.trim() ||
        toNumber(line.quantity) <= 0 ||
        toNumber(line.amount_foreign) <= 0 ||
        toNumber(line.amount_myr) <= 0
    );
    if (invalidLineIndex >= 0) {
      toast.error(`Line ${invalidLineIndex + 1} is incomplete`);
      return false;
    }
    return true;
  };

  const buildPayload = (): SelfBilledInvoiceInput => ({
    foreign_supplier_id: supplier.id || existingInvoice?.foreign_supplier_id || null,
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
    lines: lines.map((line: SelfBilledInvoiceLine, index: number) => ({
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
      notes: line.notes || null,
    })),
  });

  const saveInvoice = async (): Promise<number | null> => {
    if (!validateBeforeSave()) return null;

    setSaving(true);
    try {
      const payload = buildPayload();
      if (isEditMode && id) {
        await api.put(`/api/self-billed-invoices/${id}`, payload);
        toast.success("Self-billed invoice updated");
        await loadInvoice();
        return Number.parseInt(id, 10);
      }

      const response = await api.post("/api/self-billed-invoices", payload);
      const newId = response.invoice.id as number;
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
        </div>
      </div>

      {existingInvoice?.uuid && (
        <div className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-800 dark:border-sky-800 dark:bg-sky-900/20 dark:text-sky-200">
          <div className="grid gap-2 md:grid-cols-3">
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
          </div>
        </div>
      )}

      <div className="grid gap-2 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="space-y-2">
          <section className="rounded-lg border border-default-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-800">
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
                name="transaction_type"
                label="Transaction Type"
                value={formData.transaction_type}
                onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                  updateFormField("transaction_type", event.target.value)
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

              <label className="flex h-[38px] items-center gap-2 self-end rounded-lg border border-default-300 bg-white px-3 text-sm text-default-700 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200">
                <input
                  type="checkbox"
                  checked={formData.has_supporting_document}
                  onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                    updateFormField(
                      "has_supporting_document",
                      event.target.checked
                    )
                  }
                  disabled={!canEdit}
                  className="h-4 w-4 rounded border-default-300 text-sky-600 focus:ring-sky-500"
                />
                Supporting document
              </label>
            </div>
          </section>

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

          <section className="rounded-lg border border-default-200 bg-white dark:border-gray-700 dark:bg-gray-800">
            <div className="flex items-center justify-between border-b border-default-200 px-3 py-2 dark:border-gray-700">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-default-600 dark:text-gray-300">
                Lines
              </h2>
              {canEdit && (
                <Button
                  type="button"
                  icon={IconPlus}
                  size="sm"
                  variant="outline"
                  className="h-8 rounded-lg"
                  onClick={addLine}
                >
                  Add Line
                </Button>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-[1160px] w-full divide-y divide-default-200 dark:divide-gray-700">
                <thead className="bg-default-50 dark:bg-gray-900/50">
                  <tr>
                    <th className="w-12 px-2 py-1.5 text-left text-xs font-medium uppercase text-default-500 dark:text-gray-400">
                      #
                    </th>
                    <th className="min-w-72 px-2 py-1.5 text-left text-xs font-medium uppercase text-default-500 dark:text-gray-400">
                      Description
                    </th>
                    <th className="w-24 px-2 py-1.5 text-right text-xs font-medium uppercase text-default-500 dark:text-gray-400">
                      Qty
                    </th>
                    <th className="w-32 px-2 py-1.5 text-right text-xs font-medium uppercase text-default-500 dark:text-gray-400">
                      Unit
                    </th>
                    <th className="w-32 px-2 py-1.5 text-right text-xs font-medium uppercase text-default-500 dark:text-gray-400">
                      Foreign
                    </th>
                    <th className="w-32 px-2 py-1.5 text-right text-xs font-medium uppercase text-default-500 dark:text-gray-400">
                      MYR
                    </th>
                    <th className="w-24 px-2 py-1.5 text-left text-xs font-medium uppercase text-default-500 dark:text-gray-400">
                      Class
                    </th>
                    <th className="w-36 px-2 py-1.5 text-left text-xs font-medium uppercase text-default-500 dark:text-gray-400">
                      Tax
                    </th>
                    <th className="w-32 px-2 py-1.5 text-right text-xs font-medium uppercase text-default-500 dark:text-gray-400">
                      Tax MYR
                    </th>
                    <th className="w-44 px-2 py-1.5 text-left text-xs font-medium uppercase text-default-500 dark:text-gray-400">
                      Exemption
                    </th>
                    <th className="w-32 px-2 py-1.5 text-left text-xs font-medium uppercase text-default-500 dark:text-gray-400">
                      Customs Ref.
                    </th>
                    <th className="w-20 px-2 py-1.5 text-center text-xs font-medium uppercase text-default-500 dark:text-gray-400">
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-default-200 dark:divide-gray-700">
                  {lines.map((line: SelfBilledInvoiceLine, index: number) => (
                    <tr key={`${line.id || "new"}-${index}`}>
                      <td className="px-2 py-1.5 text-sm text-default-500 dark:text-gray-400">
                        {index + 1}
                      </td>
                      <td className="px-2 py-1.5">
                        <input
                          type="text"
                          value={line.description}
                          onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                            updateLineField(index, "description", event.target.value)
                          }
                          disabled={!canEdit}
                          className="w-full rounded border border-transparent bg-transparent px-2 py-1.5 text-sm text-default-900 hover:border-default-300 focus:border-sky-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-sky-500 disabled:cursor-not-allowed dark:text-gray-100 dark:hover:border-gray-600 dark:focus:bg-gray-700"
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <input
                          type="number"
                          value={line.quantity}
                          min={0}
                          step="0.001"
                          onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                            updateLineField(index, "quantity", event.target.value)
                          }
                          disabled={!canEdit}
                          className="w-full rounded border border-transparent bg-transparent px-2 py-1.5 text-right text-sm font-mono text-default-900 hover:border-default-300 focus:border-sky-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-sky-500 disabled:cursor-not-allowed dark:text-gray-100 dark:hover:border-gray-600 dark:focus:bg-gray-700"
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <input
                          type="number"
                          value={line.unit_price_foreign}
                          min={0}
                          step="0.0001"
                          onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                            updateLineField(
                              index,
                              "unit_price_foreign",
                              event.target.value
                            )
                          }
                          disabled={!canEdit}
                          className="w-full rounded border border-transparent bg-transparent px-2 py-1.5 text-right text-sm font-mono text-default-900 hover:border-default-300 focus:border-sky-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-sky-500 disabled:cursor-not-allowed dark:text-gray-100 dark:hover:border-gray-600 dark:focus:bg-gray-700"
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <input
                          type="number"
                          value={line.amount_foreign}
                          min={0}
                          step="0.01"
                          onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                            updateLineField(
                              index,
                              "amount_foreign",
                              event.target.value
                            )
                          }
                          disabled={!canEdit}
                          className="w-full rounded border border-transparent bg-transparent px-2 py-1.5 text-right text-sm font-mono text-default-900 hover:border-default-300 focus:border-sky-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-sky-500 disabled:cursor-not-allowed dark:text-gray-100 dark:hover:border-gray-600 dark:focus:bg-gray-700"
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <input
                          type="number"
                          value={line.amount_myr}
                          min={0}
                          step="0.01"
                          onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                            updateLineField(index, "amount_myr", event.target.value)
                          }
                          disabled={!canEdit}
                          className="w-full rounded border border-transparent bg-transparent px-2 py-1.5 text-right text-sm font-mono text-default-900 hover:border-default-300 focus:border-sky-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-sky-500 disabled:cursor-not-allowed dark:text-gray-100 dark:hover:border-gray-600 dark:focus:bg-gray-700"
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <input
                          type="text"
                          value={line.classification_code}
                          onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                            updateLineField(
                              index,
                              "classification_code",
                              event.target.value
                            )
                          }
                          disabled={!canEdit}
                          className="w-full rounded border border-transparent bg-transparent px-2 py-1.5 text-sm font-mono text-default-900 hover:border-default-300 focus:border-sky-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-sky-500 disabled:cursor-not-allowed dark:text-gray-100 dark:hover:border-gray-600 dark:focus:bg-gray-700"
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <FormListbox
                          name={`tax_type_${index}`}
                          value={line.tax_type}
                          onChange={(value: string) =>
                            updateLineField(index, "tax_type", value)
                          }
                          options={taxTypeOptions}
                          disabled={!canEdit}
                          className="[&_button]:py-1.5"
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <input
                          type="number"
                          value={line.tax_amount_myr}
                          min={0}
                          step="0.01"
                          onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                            updateLineField(
                              index,
                              "tax_amount_myr",
                              event.target.value
                            )
                          }
                          disabled={!canEdit}
                          className="w-full rounded border border-transparent bg-transparent px-2 py-1.5 text-right text-sm font-mono text-default-900 hover:border-default-300 focus:border-sky-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-sky-500 disabled:cursor-not-allowed dark:text-gray-100 dark:hover:border-gray-600 dark:focus:bg-gray-700"
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <input
                          type="text"
                          value={line.tax_exemption_reason || ""}
                          onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                            updateLineField(
                              index,
                              "tax_exemption_reason",
                              event.target.value
                            )
                          }
                          disabled={!canEdit || line.tax_type !== "E"}
                          placeholder={line.tax_type === "E" ? "Reason" : "-"}
                          className="w-full rounded border border-transparent bg-transparent px-2 py-1.5 text-sm text-default-900 placeholder:text-default-400 hover:border-default-300 focus:border-sky-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-sky-500 disabled:cursor-not-allowed disabled:text-default-400 dark:text-gray-100 dark:placeholder:text-gray-500 dark:hover:border-gray-600 dark:focus:bg-gray-700 dark:disabled:text-gray-500"
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <input
                          type="text"
                          value={line.customs_form_reference || ""}
                          onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                            updateLineField(
                              index,
                              "customs_form_reference",
                              event.target.value
                            )
                          }
                          disabled={!canEdit}
                          className="w-full rounded border border-transparent bg-transparent px-2 py-1.5 text-sm text-default-900 hover:border-default-300 focus:border-sky-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-sky-500 disabled:cursor-not-allowed dark:text-gray-100 dark:hover:border-gray-600 dark:focus:bg-gray-700"
                        />
                      </td>
                      <td className="px-2 py-1.5 text-center">
                        {canEdit && (
                          <div className="flex items-center justify-center gap-1">
                            <button
                              type="button"
                              onClick={() => duplicateLine(index)}
                              className="rounded p-1 text-default-500 hover:bg-default-100 hover:text-default-800 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-100"
                              title="Duplicate line"
                            >
                              <IconCopy size={16} />
                            </button>
                            {lines.length > 1 && (
                              <button
                                type="button"
                                onClick={() => removeLine(index)}
                                className="rounded p-1 text-rose-500 hover:bg-rose-50 hover:text-rose-700 dark:text-rose-400 dark:hover:bg-rose-900/20 dark:hover:text-rose-300"
                                title="Remove line"
                              >
                                <IconTrash size={16} />
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-lg border border-default-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-800">
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-default-700 dark:text-gray-200">
                  Supporting Document Notes
                </label>
                <textarea
                  value={formData.supporting_document_notes}
                  onChange={(event: React.ChangeEvent<HTMLTextAreaElement>) =>
                    updateFormField(
                      "supporting_document_notes",
                      event.target.value
                    )
                  }
                  disabled={!canEdit}
                  rows={3}
                  className="w-full rounded-lg border border-default-300 bg-white px-2 py-1.5 text-sm text-default-900 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 disabled:opacity-60 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-default-700 dark:text-gray-200">
                  Notes
                </label>
                <textarea
                  value={formData.notes}
                  onChange={(event: React.ChangeEvent<HTMLTextAreaElement>) =>
                    updateFormField("notes", event.target.value)
                  }
                  disabled={!canEdit}
                  rows={3}
                  className="w-full rounded-lg border border-default-300 bg-white px-2 py-1.5 text-sm text-default-900 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 disabled:opacity-60 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                />
              </div>
            </div>
          </section>
        </div>

        <aside className="space-y-2 xl:sticky xl:top-14 xl:self-start">
          <section className="rounded-lg border border-default-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-800">
            <div className="grid gap-3">
              <FormListbox
                name="currency_code"
                label="Currency"
                value={formData.currency_code}
                onChange={(value: string) => updateFormField("currency_code", value)}
                options={CURRENCY_OPTIONS}
                disabled={!canEdit}
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
                disabled={!canEdit}
                required
              />
            </div>
          </section>

          <section className="rounded-lg border border-default-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-800">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-default-600 dark:text-gray-300">
              Totals
            </h2>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between gap-4">
                <span className="text-default-500 dark:text-gray-400">
                  Foreign subtotal
                </span>
                <span className="font-mono font-semibold text-default-900 dark:text-gray-100">
                  {formatAmount(totals.foreign, formData.currency_code)}
                </span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-default-500 dark:text-gray-400">
                  MYR subtotal
                </span>
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
                  <span className="font-medium text-default-700 dark:text-gray-200">
                    Payable
                  </span>
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
