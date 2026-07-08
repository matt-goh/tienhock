import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { format } from "date-fns";
import {
  IconArrowNarrowRight,
  IconDownload,
  IconExternalLink,
  IconEye,
  IconFile,
  IconHelpCircle,
  IconInfoCircle,
  IconRefresh,
  IconSend,
  IconTrash,
  IconUpload,
  IconX,
} from "@tabler/icons-react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import toast from "react-hot-toast";
import BackButton from "../../../components/BackButton";
import Button from "../../../components/Button";
import Checkbox from "../../../components/Checkbox";
import ConfirmationDialog from "../../../components/ConfirmationDialog";
import SelfBilledEligibilityDialog from "../../../components/Accounting/SelfBilledEligibilityDialog";
import SellerTypeHelpDialog from "../../../components/Accounting/SellerTypeHelpDialog";
import { FormInput, FormListbox } from "../../../components/FormComponents";
import AccountCodeCombobox from "../../../components/Accounting/AccountCodeCombobox";
import GeneralStockItemCombobox from "../../../components/Accounting/GeneralStockItemCombobox";
import SupplierPaymentInlineSection, {
  buildSupplierPaymentPayload,
  createDefaultSupplierPaymentDraft,
  SupplierPaymentDraft,
  syncSupplierPaymentDraftAmount,
  validateSupplierPaymentDraft,
} from "../../../components/Accounting/SupplierPaymentInlineSection";
import LoadingSpinner from "../../../components/LoadingSpinner";
import { MALAYSIAN_STATE_OPTIONS } from "../../../constants/einvoiceCodes";
import { useGeneralStockSearch } from "../../../hooks/useGeneralStockSearch";
import { api } from "../../../routes/utils/api";
import {
  GeneralStockCategory,
  GeneralStockRow,
  SelfBilledEInvoiceStatus,
  SelfBilledForeignSupplier,
  SelfBilledInvoice,
  SelfBilledInvoiceInput,
  SelfBilledInvoiceLine,
  SelfBilledInvoiceStatus,
} from "../../../types/types";

interface LocalGeneralPurchaseFormData {
  purchase_date: string;
  supplier_name: string;
  order_no: string;
  payment_reference: string;
  amount_myr: string;
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

// Seller categories that drive the self-billed TIN / identification rules
// (IRBM e-Invoice Specific Guideline Tables 8.2 / 8.3).
type LocalSellerType = "individual_mykad" | "individual_tin" | "business";

// General TIN for a Malaysian individual who only provides MyKad/MyTentera.
const LOCAL_INDIVIDUAL_TIN = "EI00000000010";
const INDIVIDUAL_TIN_ONLY_ID = "000000000000";

const today = format(new Date(), "yyyy-MM-dd");

const toLocalDateInputValue = (value: string | null | undefined): string => {
  if (!value) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return format(date, "yyyy-MM-dd");
};

// Supplier stub sent for plain (non-e-invoice) local purchases. The backend
// ignores it because such purchases are not linked to a supplier record.
const localSupplierStub: SelfBilledForeignSupplier = {
  supplier_name: "",
  tin_number: LOCAL_INDIVIDUAL_TIN,
  id_type: "NRIC",
  id_number: INDIVIDUAL_TIN_ONLY_ID,
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

const createDefaultLocalSupplier = (): SelfBilledForeignSupplier => ({
  supplier_name: "",
  tin_number: LOCAL_INDIVIDUAL_TIN,
  id_type: "NRIC",
  id_number: "",
  sst_number: "NA",
  ttx_number: "NA",
  msic_code: "00000",
  business_activity_description: "NA",
  address_line_0: "",
  address_line_1: "",
  address_line_2: "",
  city: "",
  postcode: "",
  state_code: "12",
  country_code: "MYS",
  contact_number: "NA",
  email: "",
  notes: "",
  is_active: true,
});

const deriveSellerType = (
  supplier: SelfBilledForeignSupplier | null | undefined
): LocalSellerType => {
  if (!supplier) return "individual_mykad";
  if ((supplier.tin_number || "") === LOCAL_INDIVIDUAL_TIN) return "individual_mykad";
  if ((supplier.id_number || "") === INDIVIDUAL_TIN_ONLY_ID) return "individual_tin";
  return "business";
};

const sellerTypeOptions = [
  { id: "individual_mykad", name: "Individual — MyKad/NRIC only" },
  { id: "individual_tin", name: "Individual — own TIN" },
  { id: "business", name: "Business / agent-dealer-distributor" },
];

const idTypeOptions = [
  { id: "NRIC", name: "NRIC (MyKad)" },
  { id: "BRN", name: "BRN (Business Reg. No.)" },
  { id: "PASSPORT", name: "Passport" },
  { id: "ARMY", name: "Army (MyTentera)" },
];

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

const formatQty = (amount: number): string => {
  return amount.toLocaleString("en-MY", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 4,
  });
};

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

const getInvoiceStatusLabel = (status: SelfBilledInvoiceStatus): string =>
  status === "cancelled" ? "Cancelled" : "Active";

const getInvoiceStatusClasses = (status: SelfBilledInvoiceStatus): string =>
  status === "cancelled"
    ? "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300"
    : "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300";

const normalizeStockDescription = (value: string | null | undefined): string =>
  (value || "").trim().replace(/\s+/g, " ").toLowerCase();

const createDefaultLine = (lineNumber: number): SelfBilledInvoiceLine => ({
  line_number: lineNumber,
  description: "",
  quantity: 1,
  balance_quantity: null,
  general_stock_category_id: null,
  unit_price_foreign: 0,
  amount_foreign: 0,
  amount_myr: 0,
  classification_code: "034",
  tax_type: "06",
  tax_rate: 0,
  tax_amount_myr: 0,
  tax_exemption_reason: null,
  customs_form_reference: null,
  account_code: null,
  stock_append_target_line_id: null,
  notes: null,
});

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
    amount_myr: "",
    account_code: "",
    notes: "",
  });
  const [lines, setLines] = useState<SelfBilledInvoiceLine[]>([
    createDefaultLine(1),
  ]);
  const [existingInvoice, setExistingInvoice] = useState<SelfBilledInvoice | null>(null);
  const [categories, setCategories] = useState<GeneralStockCategory[]>([]);
  const [loading, setLoading] = useState<boolean>(isEditMode);
  const [saving, setSaving] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [s3Enabled, setS3Enabled] = useState<boolean>(true);
  const [supportingDocumentFile, setSupportingDocumentFile] = useState<File | null>(null);
  const [supportingDocumentUploading, setSupportingDocumentUploading] = useState<boolean>(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState<boolean>(false);
  const [showCancelDialog, setShowCancelDialog] = useState<boolean>(false);
  const [showEligibilityDialog, setShowEligibilityDialog] = useState<boolean>(false);
  const [showSellerTypeHelp, setShowSellerTypeHelp] = useState<boolean>(false);
  const [showDocViewer, setShowDocViewer] = useState<boolean>(false);
  const [docViewerUrl, setDocViewerUrl] = useState<string | null>(null);
  const [supplierPayments, setSupplierPayments] = useState<SupplierPaymentSummary[]>([]);
  const [supplierPayment, setSupplierPayment] = useState<SupplierPaymentDraft>(
    () => createDefaultSupplierPaymentDraft(today, 0, !isEditMode)
  );

  // Self-billed e-invoice (optional, off by default)
  const [einvoiceEnabled, setEinvoiceEnabled] = useState<boolean>(false);
  const [sellerType, setSellerType] = useState<LocalSellerType>("individual_mykad");
  const [supplier, setSupplier] = useState<SelfBilledForeignSupplier>(
    createDefaultLocalSupplier
  );
  const [supplierSuggestions, setSupplierSuggestions] = useState<
    SelfBilledForeignSupplier[]
  >([]);
  const [supplierSearchFocused, setSupplierSearchFocused] = useState<boolean>(false);

  const previousPayableAmountRef = useRef<number>(0);
  const stockSearch = useGeneralStockSearch();

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
  const selectedStockTargetIds = useMemo<number[]>(
    () =>
      lines.reduce<number[]>((targetIds: number[], line: SelfBilledInvoiceLine) => {
        if (typeof line.stock_append_target_line_id === "number") {
          targetIds.push(line.stock_append_target_line_id);
        }
        return targetIds;
      }, []),
    [lines]
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
        existingInvoice.payment_status !== "paid" &&
        existingInvoice.einvoice_status !== "pending" &&
        existingInvoice.einvoice_status !== "valid" &&
        existingInvoice.einvoice_status !== "cancelled"
    );
  const canEditRecords: boolean = canEdit;
  const canDelete: boolean =
    isEditMode &&
    existingInvoice?.invoice_status !== "cancelled" &&
    existingInvoice?.payment_status === "unpaid" &&
    (!existingInvoice?.einvoice_status ||
      existingInvoice.einvoice_status === "invalid");
  const canViewMyInvoisPortal =
    isEditMode &&
    Boolean(existingInvoice?.uuid) &&
    Boolean(existingInvoice?.long_id) &&
    (existingInvoice?.einvoice_status === "valid" ||
      existingInvoice?.einvoice_status === "cancelled");
  const myInvoisPortalUrl = canViewMyInvoisPortal
    ? `https://myinvois.hasil.gov.my/${existingInvoice?.uuid}/share/${existingInvoice?.long_id}`
    : null;
  // Once an e-invoice document exists it can no longer be toggled off.
  const einvoiceToggleLocked =
    isEditMode &&
    Boolean(
      existingInvoice?.einvoice_status &&
        existingInvoice.einvoice_status !== "invalid"
    );

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
        supplier_name: invoice.local_supplier_name || invoice.supplier?.supplier_name || "",
        order_no: invoice.order_no || "",
        payment_reference: invoice.payment_reference || "",
        amount_myr: String(toNumber(invoice.total_excluding_tax_myr || invoice.payable_amount_myr || line?.amount_myr)),
        account_code: invoice.account_code || line?.account_code || "",
        notes: invoice.notes || "",
      });

      const hasEinvoiceSupplier = Boolean(invoice.foreign_supplier_id);
      setEinvoiceEnabled(hasEinvoiceSupplier);
      if (hasEinvoiceSupplier && invoice.supplier) {
        setSupplier({ ...createDefaultLocalSupplier(), ...invoice.supplier });
        setSellerType(deriveSellerType(invoice.supplier));
      } else {
        setSupplier(createDefaultLocalSupplier());
        setSellerType("individual_mykad");
      }

      setLines(
        invoice.lines.length > 0
          ? invoice.lines.map((invoiceLine: SelfBilledInvoiceLine) => ({
              ...invoiceLine,
              quantity: toNumber(invoiceLine.quantity),
              balance_quantity: toNullableNumber(invoiceLine.balance_quantity),
              general_stock_category_id:
                invoiceLine.general_stock_category_id || null,
              unit_price_foreign: toNumber(invoiceLine.unit_price_foreign),
              amount_foreign: toNumber(invoiceLine.amount_foreign),
              amount_myr: toNumber(invoiceLine.amount_myr),
              tax_rate: toNumber(invoiceLine.tax_rate),
              tax_amount_myr: toNumber(invoiceLine.tax_amount_myr),
              stock_append_target_line_id:
                invoiceLine.stock_append_target_line_id || null,
            }))
          : [createDefaultLine(1)]
      );
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
    void stockSearch.ensureRows(selectedStockTargetIds);
  }, [selectedStockTargetIds, stockSearch.ensureRows]);

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

  // Supplier autocomplete (shared self-billed supplier table)
  useEffect(() => {
    if (!einvoiceEnabled || !supplierSearchFocused) {
      return;
    }
    const search = formData.supplier_name.trim();
    if (search.length < 1) {
      setSupplierSuggestions([]);
      return;
    }
    const timer: number = window.setTimeout(async () => {
      try {
        const response = (await api.get(
          `/api/general-purchases/foreign-suppliers?search=${encodeURIComponent(
            search
          )}&limit=8`
        )) as SelfBilledForeignSupplier[];
        setSupplierSuggestions(response || []);
      } catch (error: unknown) {
        console.error("Error fetching supplier suggestions:", error);
      }
    }, 200);
    return () => window.clearTimeout(timer);
  }, [formData.supplier_name, einvoiceEnabled, supplierSearchFocused]);

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

  const updateSupplierField = (
    field: keyof SelfBilledForeignSupplier,
    value: string | boolean
  ): void => {
    setSupplier((previous: SelfBilledForeignSupplier) => ({
      ...previous,
      [field]: value as never,
    }));
  };

  const applySellerType = (type: LocalSellerType): void => {
    setSellerType(type);
    setSupplier((previous: SelfBilledForeignSupplier) => {
      if (type === "individual_mykad") {
        return {
          ...previous,
          tin_number: LOCAL_INDIVIDUAL_TIN,
          id_type: "NRIC",
          id_number:
            previous.id_number === INDIVIDUAL_TIN_ONLY_ID ? "" : previous.id_number,
        };
      }
      if (type === "individual_tin") {
        return {
          ...previous,
          tin_number:
            previous.tin_number === LOCAL_INDIVIDUAL_TIN ? "" : previous.tin_number,
          id_type: "NRIC",
          id_number: INDIVIDUAL_TIN_ONLY_ID,
        };
      }
      return {
        ...previous,
        tin_number:
          previous.tin_number === LOCAL_INDIVIDUAL_TIN ? "" : previous.tin_number,
        id_type: "BRN",
        id_number:
          previous.id_number === INDIVIDUAL_TIN_ONLY_ID ? "" : previous.id_number,
      };
    });
  };

  const applySupplierSuggestion = (suggestion: SelfBilledForeignSupplier): void => {
    setSupplier({ ...createDefaultLocalSupplier(), ...suggestion, country_code: "MYS" });
    setSellerType(deriveSellerType(suggestion));
    setFormData((previous: LocalGeneralPurchaseFormData) => ({
      ...previous,
      supplier_name: suggestion.supplier_name || previous.supplier_name,
    }));
    setSupplierSearchFocused(false);
    setSupplierSuggestions([]);
  };

  const updateLineField = (
    index: number,
    field: keyof SelfBilledInvoiceLine,
    value: string | number
  ): void => {
    setLines((previousLines: SelfBilledInvoiceLine[]) =>
      previousLines.map((line: SelfBilledInvoiceLine, lineIndex: number) =>
        lineIndex === index ? { ...line, [field]: value as never } : line
      )
    );
  };

  const updateLineAppendTarget = (
    index: number,
    value: string,
    selectedRow?: GeneralStockRow | null
  ): void => {
    const targetId = value ? Number.parseInt(value, 10) : null;
    const targetRow = targetId
      ? selectedRow || stockSearch.getRowById(targetId)
      : null;

    setLines((previousLines: SelfBilledInvoiceLine[]) =>
      previousLines.map((line: SelfBilledInvoiceLine, lineIndex: number) => {
        if (lineIndex !== index) return line;
        return {
          ...line,
          stock_append_target_line_id: targetId,
          description: targetRow ? targetRow.description : line.description,
          general_stock_category_id: targetRow
            ? targetRow.general_stock_category_id
            : line.general_stock_category_id,
        };
      })
    );
  };

  const addLineItem = (): void => {
    setLines((previousLines: SelfBilledInvoiceLine[]) => [
      ...previousLines,
      createDefaultLine(previousLines.length + 1),
    ]);
  };

  const removeLineItem = (index: number): void => {
    setLines((previousLines: SelfBilledInvoiceLine[]) =>
      previousLines.length <= 1
        ? previousLines
        : previousLines
            .filter((_, lineIndex: number) => lineIndex !== index)
            .map((line: SelfBilledInvoiceLine, lineIndex: number) => ({
              ...line,
              line_number: lineIndex + 1,
            }))
    );
  };

  const getSelectedGeneralStockRow = (
    line: SelfBilledInvoiceLine
  ): GeneralStockRow | null => {
    if (!line.stock_append_target_line_id) return null;
    return stockSearch.getRowById(line.stock_append_target_line_id);
  };

  const findDuplicateNewStockRow = (
    line: SelfBilledInvoiceLine
  ): GeneralStockRow | null => {
    if (line.stock_append_target_line_id) return null;

    const normalizedDescription = normalizeStockDescription(line.description);
    if (!normalizedDescription) return null;

    const originalLine = line.id
      ? existingInvoice?.lines.find(
          (existingLine: SelfBilledInvoiceLine) => existingLine.id === line.id
        )
      : null;
    if (
      originalLine &&
      normalizeStockDescription(originalLine.description) === normalizedDescription
    ) {
      return null;
    }

    return (
      stockSearch.rows.find(
        (row: GeneralStockRow) =>
          row.line_id !== line.id &&
          normalizeStockDescription(row.description) === normalizedDescription
      ) || null
    );
  };

  const validateEinvoiceSupplier = (): boolean => {
    if (!einvoiceEnabled) return true;
    if (!supplier.address_line_0.trim() || !supplier.city.trim()) {
      toast.error("Supplier address and city are required for e-invoice");
      return false;
    }
    if (sellerType !== "individual_mykad" && !supplier.tin_number.trim()) {
      toast.error("Supplier TIN is required for this seller type");
      return false;
    }
    if (sellerType !== "individual_tin" && !supplier.id_number.trim()) {
      toast.error(
        sellerType === "business"
          ? "Business registration number is required"
          : "MyKad / identification number is required"
      );
      return false;
    }
    return true;
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
    if (lines.length === 0) {
      toast.error("At least one item is required");
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
    const invalidLineIndex = lines.findIndex(
      (line: SelfBilledInvoiceLine) =>
        !line.description.trim() ||
        toNumber(line.quantity) <= 0 ||
        (Boolean(line.stock_append_target_line_id) &&
          toNumber(line.balance_quantity) <= 0)
    );
    if (invalidLineIndex >= 0) {
      toast.error(`Line ${invalidLineIndex + 1} is incomplete`);
      return false;
    }
    const duplicateLineIndex = lines.findIndex(
      (line: SelfBilledInvoiceLine) => findDuplicateNewStockRow(line) !== null
    );
    if (duplicateLineIndex >= 0) {
      const duplicateRow = findDuplicateNewStockRow(lines[duplicateLineIndex]);
      toast.error(
        `Line ${duplicateLineIndex + 1} matches existing General Stock item "${
          duplicateRow?.description || ""
        }". Select it in Stock Item to append balance instead.`
      );
      return false;
    }
    if (!validateEinvoiceSupplier()) return false;
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

  const buildSupplierPayload = (): SelfBilledForeignSupplier => {
    if (!einvoiceEnabled) return localSupplierStub;
    return {
      ...supplier,
      supplier_name: formData.supplier_name.trim(),
      tin_number:
        sellerType === "individual_mykad"
          ? LOCAL_INDIVIDUAL_TIN
          : supplier.tin_number.trim() || LOCAL_INDIVIDUAL_TIN,
      id_type: supplier.id_type || "NRIC",
      id_number:
        sellerType === "individual_tin"
          ? INDIVIDUAL_TIN_ONLY_ID
          : supplier.id_number.trim(),
      sst_number: supplier.sst_number.trim() || "NA",
      msic_code: supplier.msic_code.trim() || "00000",
      business_activity_description:
        supplier.business_activity_description.trim() || "NA",
      contact_number: supplier.contact_number.trim() || "NA",
      country_code: "MYS",
    };
  };

  const buildPayload = (): SelfBilledInvoiceInput & { einvoice_enabled: boolean } => {
    const amountMyr = toNumber(formData.amount_myr);
    const linePayloads: SelfBilledInvoiceLine[] = lines.map(
      (line: SelfBilledInvoiceLine, index: number) => {
        const selectedStockRow = getSelectedGeneralStockRow(line);

        return {
          ...line,
          line_number: index + 1,
          description: selectedStockRow
            ? selectedStockRow.description
            : line.description.trim(),
          quantity: toNumber(line.quantity),
          balance_quantity: toNullableNumber(line.balance_quantity),
          general_stock_category_id: line.general_stock_category_id || null,
          unit_price_foreign: toNumber(line.unit_price_foreign),
          amount_foreign: 0,
          amount_myr: 0,
          classification_code: "034",
          tax_type: "06",
          tax_rate: 0,
          tax_amount_myr: 0,
          tax_exemption_reason: null,
          customs_form_reference: null,
          account_code: null,
          stock_append_target_line_id: line.stock_append_target_line_id || null,
          notes: null,
        };
      }
    );

    return {
      purchase_kind: "local",
      einvoice_enabled: einvoiceEnabled,
      foreign_supplier_id: einvoiceEnabled
        ? supplier.id || existingInvoice?.foreign_supplier_id || null
        : null,
      local_supplier_name: formData.supplier_name.trim(),
      supplier: buildSupplierPayload(),
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
      account_code: formData.account_code.trim() || null,
      total_foreign_amount: amountMyr,
      total_excluding_tax_myr: amountMyr,
      tax_amount_myr: 0,
      notes: formData.notes.trim() || null,
      lines: linePayloads,
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

  const saveInvoice = async (): Promise<number | null> => {
    if (!validateBeforeSave()) return null;

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
        return Number.parseInt(id, 10);
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
      return newId;
    } catch (error: unknown) {
      console.error("Error saving local general purchase:", error);
      toast.error(error instanceof Error ? error.message : "Failed to save local general purchase");
      return null;
    } finally {
      setSaving(false);
    }
  };

  const submitEInvoice = async (): Promise<void> => {
    setShowEligibilityDialog(false);
    const invoiceId = await saveInvoice();
    if (!invoiceId) return;

    setSubmitting(true);
    try {
      await api.post(`/api/general-purchases/${invoiceId}/submit`, {});
      toast.success("Submitted to MyInvois");
      if (isEditMode) {
        await loadInvoice();
      } else {
        navigate(`/stock/general-purchases/local/${invoiceId}`, { replace: true });
      }
    } catch (error: unknown) {
      console.error("Error submitting local self-billed invoice:", error);
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
      await api.put(`/api/general-purchases/${id}/refresh-status`, {});
      toast.success("Status refreshed");
      await loadInvoice();
    } catch (error: unknown) {
      console.error("Error refreshing local self-billed status:", error);
      toast.error(error instanceof Error ? error.message : "Failed to refresh status");
    }
  };

  const clearStatus = async (): Promise<void> => {
    if (!id) return;
    try {
      await api.post(`/api/general-purchases/${id}/clear-status`, {});
      toast.success("E-invoice status cleared");
      await loadInvoice();
    } catch (error: unknown) {
      console.error("Error clearing local self-billed status:", error);
      toast.error(error instanceof Error ? error.message : "Failed to clear status");
    }
  };

  const cancelInvoice = async (): Promise<void> => {
    if (!id) return;
    try {
      await api.post(`/api/general-purchases/${id}/cancel`, {
        reason: "Cancelled via system",
      });
      toast.success("Local general purchase cancelled");
      setShowCancelDialog(false);
      await loadInvoice();
    } catch (error: unknown) {
      console.error("Error cancelling local self-billed invoice:", error);
      toast.error(error instanceof Error ? error.message : "Failed to cancel invoice");
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
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <BackButton onClick={() => navigate(backUrl)} />
          <span className="text-default-300 dark:text-gray-600">|</span>
          <div>
            <h1 className="text-lg font-semibold text-default-800 dark:text-gray-100">
              {isEditMode ? "Local General Purchase" : "New Local General Purchase"}
            </h1>
            {existingInvoice && (
              <div className="mt-1 flex flex-wrap items-center gap-2 text-sm">
                <span className="text-default-500 dark:text-gray-400">
                  {existingInvoice.self_billed_no}
                </span>
                <span
                  className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${getInvoiceStatusClasses(
                    existingInvoice.invoice_status
                  )}`}
                >
                  {getInvoiceStatusLabel(existingInvoice.invoice_status)}
                </span>
                {(einvoiceEnabled || existingInvoice.einvoice_status) && (
                  <span
                    className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${getStatusClasses(
                      existingInvoice.einvoice_status
                    )}`}
                  >
                    E-Invoice: {getStatusLabel(existingInvoice.einvoice_status)}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
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
              Refresh E-Invoice
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
          {canDelete && (
            <Button
              type="button"
              color="rose"
              variant="outline"
              size="sm"
              icon={IconTrash}
              className="h-8 rounded-lg"
              onClick={() => setShowDeleteDialog(true)}
            >
              Delete
            </Button>
          )}
          {einvoiceEnabled && canEdit && (
            <Button
              type="button"
              icon={IconSend}
              color="amber"
              variant="outline"
              size="sm"
              className="h-8 rounded-lg"
              disabled={submitting || saving}
              onClick={() => setShowEligibilityDialog(true)}
            >
              {submitting ? "Submitting..." : "Save & Submit e-Invoice"}
            </Button>
          )}
          <Button
            type="button"
            color="sky"
            variant="filled"
            size="sm"
            className="h-8 rounded-lg"
            disabled={!canEdit || saving || submitting || supportingDocumentUploading}
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
          <div className="relative">
            <FormInput
              name="supplier_name"
              label="Supplier Name"
              value={formData.supplier_name}
              onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
                if (einvoiceEnabled) setSupplierSearchFocused(true);
                updateFormField("supplier_name", event.target.value);
              }}
              onBlur={() =>
                window.setTimeout(() => setSupplierSearchFocused(false), 150)
              }
              disabled={!canEdit}
              required
            />
            {einvoiceEnabled &&
              canEdit &&
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
                          applySupplierSuggestion(suggestion);
                        }}
                        className="block w-full px-3 py-2 text-left text-sm text-default-700 hover:bg-default-50 dark:text-gray-200 dark:hover:bg-gray-700"
                      >
                        <span className="block truncate font-medium">
                          {suggestion.supplier_name}
                        </span>
                        <span className="block truncate text-xs text-default-500 dark:text-gray-400">
                          {suggestion.city || "-"} / TIN {suggestion.tin_number}
                        </span>
                      </button>
                    )
                  )}
                </div>
              )}
          </div>
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

      {/* ── Self-Billed e-Invoice (optional) ── */}
      <section className="rounded-lg border border-default-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-800">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-default-600 dark:text-gray-300">
              Self-Billed e-Invoice
            </h2>
            <p className="mt-0.5 text-xs text-default-500 dark:text-gray-400">
              Optional. Only enable when this local supplier qualifies for a
              self-billed e-invoice (agents/dealers, individuals not in business,
              interest, etc.).
            </p>
          </div>
          <Checkbox
            checked={einvoiceEnabled}
            onChange={(checked: boolean) => setEinvoiceEnabled(checked)}
            disabled={!canEdit || einvoiceToggleLocked}
            label="Issue e-invoice"
            labelPosition="left"
          />
        </div>

        {einvoiceEnabled && (
          <div className="mt-3 space-y-3 border-t border-default-200 pt-3 dark:border-gray-700">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-default-500 dark:text-gray-400">
                Not sure which seller type applies to this supplier?
              </p>
              <button
                type="button"
                onClick={() => setShowSellerTypeHelp(true)}
                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-sky-700 hover:bg-sky-50 focus:outline-none focus:ring-2 focus:ring-sky-500 dark:text-sky-300 dark:hover:bg-sky-900/30"
              >
                <IconHelpCircle size={15} />
                Which seller type?
              </button>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <FormListbox
                name="seller_type"
                label="Seller Type"
                value={sellerType}
                onChange={(value: string) =>
                  applySellerType(value as LocalSellerType)
                }
                options={sellerTypeOptions}
                disabled={!canEdit}
              />
              <FormListbox
                name="id_type"
                label="ID Type"
                value={supplier.id_type}
                onChange={(value: string) => updateSupplierField("id_type", value)}
                options={idTypeOptions}
                disabled={!canEdit}
              />
              <FormInput
                name="tin_number"
                label="Supplier TIN"
                value={supplier.tin_number}
                onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                  updateSupplierField("tin_number", event.target.value)
                }
                disabled={!canEdit || sellerType === "individual_mykad"}
              />
              <FormInput
                name="id_number"
                label={
                  sellerType === "business"
                    ? "Business Reg. No. (BRN)"
                    : "MyKad / ID Number"
                }
                value={supplier.id_number}
                onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                  updateSupplierField("id_number", event.target.value)
                }
                disabled={!canEdit || sellerType === "individual_tin"}
              />
              <FormInput
                name="contact_number"
                label="Contact No."
                value={supplier.contact_number}
                onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                  updateSupplierField("contact_number", event.target.value)
                }
                disabled={!canEdit}
              />
              <FormInput
                name="sst_number"
                label="SST No."
                value={supplier.sst_number}
                onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                  updateSupplierField("sst_number", event.target.value)
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
              <FormInput
                name="postcode"
                label="Postcode"
                value={supplier.postcode ?? ""}
                onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                  updateSupplierField("postcode", event.target.value)
                }
                disabled={!canEdit}
              />
              <FormListbox
                name="state_code"
                label="State"
                value={supplier.state_code}
                onChange={(value: string) =>
                  updateSupplierField("state_code", value)
                }
                options={MALAYSIAN_STATE_OPTIONS}
                disabled={!canEdit}
              />
              <FormInput
                name="msic_code"
                label="MSIC Code"
                value={supplier.msic_code}
                onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                  updateSupplierField("msic_code", event.target.value)
                }
                disabled={!canEdit}
              />
              <FormInput
                name="business_activity_description"
                label="Business Activity"
                value={supplier.business_activity_description}
                onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                  updateSupplierField(
                    "business_activity_description",
                    event.target.value
                  )
                }
                disabled={!canEdit}
              />
            </div>
            <p className="text-xs text-default-500 dark:text-gray-400">
              TIN used: <span className="font-medium">{
                sellerType === "individual_mykad"
                  ? LOCAL_INDIVIDUAL_TIN
                  : supplier.tin_number || "(enter TIN)"
              }</span>
              {sellerType === "individual_tin" && (
                <> · ID set to {INDIVIDUAL_TIN_ONLY_ID} per guideline concession</>
              )}
            </p>
          </div>
        )}
      </section>

      <section className="rounded-lg border border-default-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-800">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-default-600 dark:text-gray-300">
            Purchase Items
          </h2>
          {canEdit && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 rounded-lg"
              onClick={addLineItem}
            >
              Add Item
            </Button>
          )}
        </div>
        <div className="space-y-3">
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
          </div>
          <div className="space-y-3">
            {lines.map((line: SelfBilledInvoiceLine, index: number) => {
              const selectedStockRow = getSelectedGeneralStockRow(line);
              const isAppend = Boolean(line.stock_append_target_line_id);
              const newBalance =
                toNumber(selectedStockRow?.current_stock) +
                toNumber(line.balance_quantity);

              return (
                <div
                  key={`${line.id || "new"}-${index}`}
                  className="rounded-lg border border-default-200 bg-default-50/60 p-3 dark:border-gray-700 dark:bg-gray-900/30"
                >
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex h-7 min-w-7 items-center justify-center rounded-full bg-sky-100 px-2 text-xs font-semibold text-sky-800 dark:bg-sky-900/40 dark:text-sky-200">
                        {index + 1}
                      </span>
                      <span className="text-sm font-medium text-default-800 dark:text-gray-100">
                        Item {index + 1}
                      </span>
                      <span className="rounded-full bg-white px-2 py-0.5 text-xs text-default-500 ring-1 ring-default-200 dark:bg-gray-800 dark:text-gray-300 dark:ring-gray-700">
                        {isAppend ? "Existing item" : "New item"}
                      </span>
                    </div>
                    {canEdit && lines.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeLineItem(index)}
                        className="rounded p-1 text-rose-600 hover:bg-rose-50 hover:text-rose-800 focus:outline-none focus:ring-2 focus:ring-rose-500 dark:text-rose-300 dark:hover:bg-rose-900/30 dark:hover:text-rose-100"
                        title="Remove item"
                      >
                        <IconTrash size={16} />
                      </button>
                    )}
                  </div>

                  <div className="mb-3 grid gap-3 lg:grid-cols-[minmax(220px,0.8fr)_minmax(260px,1fr)]">
                    <GeneralStockItemCombobox
                      name={`stock_append_target_${index}`}
                      label="Stock Item"
                      selectedRow={selectedStockRow}
                      rows={stockSearch.searchRows}
                      query={stockSearch.query}
                      onQueryChange={stockSearch.setQuery}
                      onChange={(value: string, row: GeneralStockRow | null) =>
                        updateLineAppendTarget(index, value, row)
                      }
                      onLoadMore={stockSearch.loadMore}
                      hasMore={stockSearch.hasMore}
                      loading={stockSearch.loading}
                      loadingMore={stockSearch.loadingMore}
                      disabled={!canEdit}
                    />
                    {selectedStockRow && (
                      <div className="flex items-center gap-2.5 rounded-lg border border-indigo-200/70 bg-gradient-to-br from-indigo-50 to-white px-3 py-2 dark:border-indigo-900/60 dark:from-indigo-900/20 dark:to-gray-800/40">
                        <div className="flex min-w-0 flex-col">
                          <span className="text-[10px] font-semibold uppercase tracking-wide text-indigo-400 dark:text-indigo-300/70">
                            Current
                          </span>
                          <span className="text-sm font-medium tabular-nums text-default-700 dark:text-gray-200">
                            {formatQty(toNumber(selectedStockRow.current_stock))}
                          </span>
                        </div>
                        <IconArrowNarrowRight
                          size={18}
                          className="shrink-0 text-indigo-400 dark:text-indigo-500"
                        />
                        <div className="flex min-w-0 flex-col">
                          <span className="text-[10px] font-semibold uppercase tracking-wide text-indigo-500 dark:text-indigo-300">
                            After purchase
                          </span>
                          <span className="text-sm font-bold tabular-nums text-indigo-700 dark:text-indigo-200">
                            {formatQty(newBalance)}
                          </span>
                        </div>
                        <span className="ml-auto inline-flex shrink-0 items-center rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold tabular-nums text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
                          +{formatQty(toNumber(line.balance_quantity))}
                        </span>
                      </div>
                    )}
                    {!selectedStockRow && (
                      <div className="flex items-center gap-2 rounded-lg border border-sky-200/70 bg-sky-50/70 px-3 py-2 text-xs text-sky-700 dark:border-sky-900/60 dark:bg-sky-900/20 dark:text-sky-300">
                        <IconInfoCircle size={16} className="shrink-0" />
                        <span>
                          New item — leave this empty and just type the{" "}
                          <span className="font-semibold">Item Description</span>{" "}
                          below to register a new General Stock item (set a{" "}
                          <span className="font-semibold">Balance Qty</span> to
                          stock it).
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="grid items-stretch gap-3 xl:grid-cols-[minmax(260px,1.2fr)_minmax(420px,1fr)]">
                    <div className="flex h-full flex-col gap-1.5">
                      <label className="block text-xs font-medium uppercase tracking-wide text-default-500 dark:text-gray-400">
                        Item Description
                      </label>
                      <textarea
                        value={
                          selectedStockRow
                            ? selectedStockRow.description
                            : line.description
                        }
                        onChange={(event: React.ChangeEvent<HTMLTextAreaElement>) =>
                          updateLineField(index, "description", event.target.value)
                        }
                        disabled={!canEdit || isAppend}
                        rows={4}
                        className="min-h-[110px] flex-1 resize-y rounded-md border border-default-300 bg-white px-3 py-2 text-sm text-default-900 placeholder:text-default-400 focus:outline-none focus:ring-1 focus:ring-sky-500 disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:placeholder:text-gray-500 dark:disabled:bg-gray-700 dark:disabled:text-gray-400"
                        placeholder="Purchase details"
                      />
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <FormInput
                        name={`quantity_${index}`}
                        label="Qty"
                        value={line.quantity}
                        type="number"
                        min={0}
                        step="0.0001"
                        onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                          updateLineField(index, "quantity", event.target.value)
                        }
                        disabled={!canEdit}
                      />
                      <FormInput
                        name={`unit_price_${index}`}
                        label="Unit (MYR)"
                        value={line.unit_price_foreign}
                        type="number"
                        min={0}
                        step="1"
                        onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                          updateLineField(
                            index,
                            "unit_price_foreign",
                            event.target.value
                          )
                        }
                        disabled={!canEdit}
                      />
                      <FormInput
                        name={`balance_quantity_${index}`}
                        label="Balance Qty"
                        value={line.balance_quantity ?? ""}
                        type="number"
                        min={0}
                        step="1"
                        onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                          updateLineField(
                            index,
                            "balance_quantity",
                            event.target.value
                          )
                        }
                        disabled={!canEdit}
                      />
                      <FormListbox
                        name={`general_stock_category_${index}`}
                        label="General Category"
                        value={
                          line.general_stock_category_id
                            ? String(line.general_stock_category_id)
                            : ""
                        }
                        onChange={(value: string) =>
                          updateLineField(
                            index,
                            "general_stock_category_id",
                            value ? Number.parseInt(value, 10) : ""
                          )
                        }
                        options={categoryOptions}
                        disabled={!canEdit}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {canRecordSupplierPayment && (
        <SupplierPaymentInlineSection
          draft={supplierPayment}
          outstandingAmount={outstandingPaymentAmount}
          onChange={setSupplierPayment}
          disabled={saving || submitting || supportingDocumentUploading}
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
                        className="text-sky-700 hover:text-sky-900 hover:underline dark:text-sky-300 dark:hover:text-sky-200"
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
                    <td className="px-2 py-2 text-right text-default-900 dark:text-gray-100">
                      {formatCurrency(toNumber(payment.amount_paid))}
                    </td>
                    <td className="px-2 py-2 text-default-700 dark:text-gray-200">
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

      <SelfBilledEligibilityDialog
        isOpen={showEligibilityDialog}
        onClose={() => setShowEligibilityDialog(false)}
        onConfirm={submitEInvoice}
        submitting={submitting || saving}
      />

      <SellerTypeHelpDialog
        isOpen={showSellerTypeHelp}
        onClose={() => setShowSellerTypeHelp(false)}
      />

      <ConfirmationDialog
        isOpen={showDeleteDialog}
        onClose={() => setShowDeleteDialog(false)}
        onConfirm={deleteInvoice}
        title="Delete Local General Purchase"
        message={`Delete "${existingInvoice?.self_billed_no || "this draft"}"?`}
        confirmButtonText="Delete"
        variant="danger"
      />

      <ConfirmationDialog
        isOpen={showCancelDialog}
        onClose={() => setShowCancelDialog(false)}
        onConfirm={cancelInvoice}
        title="Cancel Local General Purchase"
        message={`Cancel "${
          existingInvoice?.self_billed_no || "this draft"
        }"? This marks the purchase as Cancelled and will also cancel the MyInvois document when one exists.`}
        confirmButtonText="Cancel Invoice"
        variant="danger"
      />
    </div>
  );
};

export default LocalGeneralPurchaseFormPage;
