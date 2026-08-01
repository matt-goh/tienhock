// src/pages/GreenTarget/Invoices/InvoiceFormPage.tsx
import React, {
  useState,
  useEffect,
  useCallback,
  useMemo,
  Fragment,
} from "react";
import { format } from "date-fns";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import toast from "react-hot-toast";
import ConfirmationDialog from "../../../components/ConfirmationDialog";
import BackButton from "../../../components/BackButton";
import { useSmartBack } from "../../../hooks/useSmartBack";
import Button from "../../../components/Button";
import { greenTargetApi } from "../../../routes/greentarget/api";
import LoadingSpinner from "../../../components/LoadingSpinner";
import { api } from "../../../routes/utils/api";
import {
  Listbox,
  ListboxOption,
  ListboxOptions,
  Transition,
  ListboxButton as HeadlessListboxButton,
} from "@headlessui/react";
import {
  IconChevronDown,
  IconCheck,
  IconSearch,
  IconSquareCheckFilled,
  IconSquare,
} from "@tabler/icons-react";
import clsx from "clsx";
import { SelectOption } from "../../../components/FormComponents";
import GTInvoiceAccountFields, {
  GT_DEFAULT_REVENUE_ACCOUNT,
} from "../../../components/GreenTarget/GTInvoiceAccountFields";
import { formatLocationDisplay } from "../../../utils/greenTarget/formatLocationDisplay";
import { toCents } from "../../../utils/moneyUtils";
import SubmissionResultsModal from "../../../components/Invoice/SubmissionResultsModal";
import { EInvoiceSubmissionResult } from "../../../types/types";
import type {
  CreateGreenTargetPaymentInput,
  GreenTargetPayment,
  GreenTargetRevenueSplit,
} from "../../../types/greenTargetTypes";

// Interfaces
interface Customer {
  customer_id: number;
  tin_number: string;
  id_number: string;
  name: string;
  phone_number?: string | null; // Added phone number for Combobox display
  debtor_account_code?: string | null;
}

interface Rental {
  rental_id: number;
  customer_id: number;
  tong_no: string;
  date_placed: string;
  date_picked: string | null;
  location_address?: string;
  location_site?: string | null;
  driver: string;
  customer_name?: string; // For display perhaps
  invoice_info?: {
    invoice_id: number;
    invoice_number: string;
    status: string;
  } | null;
}

interface RentalGroup {
  customer_id: number;
  customer_name: string;
  rentals: Rental[];
}

interface PaginatedRentals {
  data: Rental[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// One page of the billable-rental picker. The backend caps `limit` at 100.
const RENTALS_PER_PAGE = 20;

interface Invoice {
  invoice_id?: number;
  invoice_number?: string;
  type: "regular";
  customer_id: number; // Store as number
  rental_ids?: number[]; // Changed to array for multiple rentals
  amount_before_tax: number;
  tax_amount: number;
  total_amount?: number; // Calculated
  date_issued: string; // YYYY-MM-DD
  debtor_account_code: string;
  revenue_splits: GreenTargetRevenueSplit[];
  edit_dependencies?: {
    has_receipts: boolean;
    has_adjustments: boolean;
    journal_manual_override: boolean;
  };
}

const toLocalDateInputValue = (value: string | null | undefined): string => {
  if (!value) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return format(date, "yyyy-MM-dd");
};

// Payment method options
const paymentMethodOptions: SelectOption[] = [
  { id: "cash", name: "Cash" },
  { id: "cheque", name: "Cheque" },
  { id: "bank_transfer", name: "Bank Transfer" },
  { id: "online", name: "Online Payment" },
];

const InvoiceFormPage: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isEditMode = !!id;
  const goBack = useSmartBack(
    isEditMode && id ? `/greentarget/invoices/${id}` : "/greentarget/invoices"
  );
  const location = useLocation();
  const rentalData = location.state; // Data passed from RentalListPage potentially

  // Form State
  const [formData, setFormData] = useState<Invoice>({
    type: "regular",
    customer_id: 0,
    amount_before_tax: 200, // Default value?
    tax_amount: 0,
    date_issued: format(new Date(), "yyyy-MM-dd"),
    rental_ids: [], // Changed to array
    debtor_account_code: "",
    revenue_splits: [
      {
        line_number: 1,
        account_code: GT_DEFAULT_REVENUE_ACCOUNT,
        amount: 200,
      },
    ],
  });
  const [initialFormData, setInitialFormData] = useState<Invoice | null>(null); // For change detection

  // Reference Data State
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [availableRentals, setAvailableRentals] = useState<Rental[]>([]);
  const [selectedRentals, setSelectedRentals] = useState<Rental[]>([]); // Changed to array

  // UI State
  const [rentalQuery, setRentalQuery] = useState(""); // Rental picker search box
  const [appliedRentalQuery, setAppliedRentalQuery] = useState(""); // Debounced
  const [rentalPage, setRentalPage] = useState(1);
  const [rentalTotal, setRentalTotal] = useState(0);
  const [rentalTotalPages, setRentalTotalPages] = useState(1);
  const [rentalsLoading, setRentalsLoading] = useState(true);
  const [isFormChanged, setIsFormChanged] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showBackConfirmation, setShowBackConfirmation] = useState(false);
  const [loading, setLoading] = useState(true); // Start loading
  const [error, setError] = useState<string | null>(null);
  const [isAmountManuallyChanged, setIsAmountManuallyChanged] = useState(false);

  // Payment/E-invoice State (only for create mode)
  const [isPaid, setIsPaid] = useState(false);
  const [paymentDate, setPaymentDate] = useState<string>(
    format(new Date(), "yyyy-MM-dd")
  );
  const [paymentMethod, setPaymentMethod] = useState<
    GreenTargetPayment["payment_method"]
  >("cash");
  const [paymentInternalReference, setPaymentInternalReference] =
    useState<string>("");
  const [paymentReference, setPaymentReference] = useState("");
  const [submitAsEinvoice, setSubmitAsEinvoice] = useState(false);
  const [showSubmissionResultsModal, setShowSubmissionResultsModal] =
    useState(false);
  const [submissionResults, setSubmissionResults] =
    useState<EInvoiceSubmissionResult | null>(null);
  const [isSubmittingEInvoice, setIsSubmittingEInvoice] = useState(false);

  // Invoice number validation state
  const [invoiceNumberValidation, setInvoiceNumberValidation] = useState<{
    isValidating: boolean;
    isValid: boolean;
    isDuplicate: boolean;
    message: string;
  }>({
    isValidating: false,
    isValid: true,
    isDuplicate: false,
    message: "",
  });

  // --- EFFECTS ---

  // Set initial form data (only once after customers load or if editing)
  useEffect(() => {
    if (!isEditMode && customers.length > 0 && initialFormData === null) {
      const defaultInitialState: Invoice = {
        type: "regular",
        customer_id: 0,
        amount_before_tax: 200,
        tax_amount: 0,
        date_issued: format(new Date(), "yyyy-MM-dd"),
        rental_ids: [], // Changed to array
        debtor_account_code: "",
        revenue_splits: [
          {
            line_number: 1,
            account_code: GT_DEFAULT_REVENUE_ACCOUNT,
            amount: 200,
          },
        ],
      };
      setInitialFormData(defaultInitialState);
      // Apply rentalData if it exists
      if (rentalData?.customer_id) {
        const rentalIds = rentalData.rental_id ? [rentalData.rental_id] : [];
        const rentalCustomer = customers.find(
          (customer: Customer): boolean =>
            customer.customer_id === Number(rentalData.customer_id)
        );
        setFormData((prev) => ({
          ...prev,
          ...defaultInitialState,
          customer_id: rentalData.customer_id,
          rental_ids: rentalIds,
          debtor_account_code: rentalCustomer?.debtor_account_code || "",
        }));
        setInitialFormData((prev) => ({
          ...(prev ?? defaultInitialState),
          customer_id: rentalData.customer_id,
          rental_ids: rentalIds,
          debtor_account_code: rentalCustomer?.debtor_account_code || "",
        }));
      } else {
        setFormData(defaultInitialState); // Set form state too
      }
      setLoading(false); // Finish loading for create mode
    } else if (isEditMode && initialFormData === null && id) {
      // If editing, initialFormData is set after fetchInvoiceDetails
      // setLoading(false) happens in fetchInvoiceDetails
    } else if (!isEditMode && customers.length === 0 && !loading) {
      // Handle case where customers couldn't load in create mode
      setError("Could not load customer data. Cannot create invoice.");
      setLoading(false);
    }
  }, [isEditMode, customers, initialFormData, rentalData, id, loading]);

  // Form change detection
  useEffect(() => {
    if (initialFormData) {
      setIsFormChanged(
        JSON.stringify(formData) !== JSON.stringify(initialFormData)
      );
    }
  }, [formData, initialFormData]);

  // Fetch customers on mount
  useEffect(() => {
    fetchCustomers();
  }, []);

  // Fetch invoice details if editing
  useEffect(() => {
    if (isEditMode && id) {
      fetchInvoiceDetails(parseInt(id));
    }
  }, [id, isEditMode]);

  // Update submitAsEinvoice when customer changes
  useEffect(() => {
    if (formData.customer_id > 0 && customers.length > 0) {
      const customer = customers.find(
        (c) => c.customer_id === formData.customer_id
      );
      if (customer) {
        setSubmitAsEinvoice(!!(customer.tin_number && customer.id_number));
      }
    }
  }, [formData.customer_id, customers]);

  // Edit mode keeps the customer-scoped list so the invoice's own rentals show.
  useEffect(() => {
    if (isEditMode && formData.customer_id > 0) {
      fetchAvailableRentals(formData.customer_id);
    }
  }, [isEditMode, formData.customer_id]);

  // The selection is authoritative and must survive paging and searching, so a
  // rental is only ever added here — never dropped because the page it came
  // from is no longer loaded. Ids that arrive from outside the picker (edit
  // mode, or a rental handed over by another page) are hydrated from whichever
  // page happens to contain them.
  useEffect(() => {
    const rentalIds: number[] = formData.rental_ids || [];
    if (rentalIds.length === 0) {
      if (selectedRentals.length > 0) setSelectedRentals([]);
      return;
    }
    const missingIds: number[] = rentalIds.filter(
      (rentalId: number): boolean =>
        !selectedRentals.some((r: Rental): boolean => r.rental_id === rentalId)
    );
    if (missingIds.length === 0) return;
    const hydrated: Rental[] = availableRentals.filter((r: Rental): boolean =>
      missingIds.includes(r.rental_id)
    );
    if (hydrated.length > 0) {
      setSelectedRentals((current: Rental[]): Rental[] => [
        ...current,
        ...hydrated,
      ]);
    }
  }, [availableRentals, formData.rental_ids, selectedRentals]);

  // Auto-calculate invoice amount based on selected rentals (RM 200 per rental)
  useEffect(() => {
    // Only auto-calculate if we're in create mode for regular invoices and amount hasn't been manually changed
    if (
      !isEditMode &&
      formData.type === "regular" &&
      selectedRentals.length > 0 &&
      !isAmountManuallyChanged
    ) {
      const calculatedAmount = selectedRentals.length * 200;

      // Only update if the amount is different to prevent infinite loops
      if (formData.amount_before_tax !== calculatedAmount) {
        setFormData((prev) => ({
          ...prev,
          amount_before_tax: calculatedAmount,
        }));
      }
    } else if (
      !isEditMode &&
      formData.type === "regular" &&
      selectedRentals.length === 0 &&
      !isAmountManuallyChanged
    ) {
      // Reset to default amount when no rentals selected
      if (formData.amount_before_tax !== 200) {
        setFormData((prev) => ({
          ...prev,
          amount_before_tax: 200,
        }));
      }
    }
  }, [
    selectedRentals.length,
    isEditMode,
    formData.type,
    formData.amount_before_tax,
    isAmountManuallyChanged,
  ]);

  // Group the loaded page by customer so the list stays readable and the
  // one-customer-per-invoice rule is obvious.
  const rentalGroups: RentalGroup[] = useMemo((): RentalGroup[] => {
    const groups = new Map<number, RentalGroup>();
    availableRentals.forEach((rental: Rental): void => {
      const group: RentalGroup | undefined = groups.get(rental.customer_id);
      if (group) {
        group.rentals.push(rental);
      } else {
        groups.set(rental.customer_id, {
          customer_id: rental.customer_id,
          customer_name:
            rental.customer_name || `Customer #${rental.customer_id}`,
          rentals: [rental],
        });
      }
    });

    return Array.from(groups.values()).sort(
      (a: RentalGroup, b: RentalGroup): number =>
        a.customer_name.localeCompare(b.customer_name)
    );
  }, [availableRentals]);

  // --- DATA FETCHING ---

  const fetchCustomers = async () => {
    try {
      const data = await greenTargetApi.getCustomers();
      setCustomers(data || []);
    } catch (err) {
      console.error("Error fetching customers:", err);
      toast.error("Failed load customers.");
    }
  };

  const fetchBillableRentals = useCallback(async (): Promise<void> => {
    setRentalsLoading(true);
    try {
      const params = new URLSearchParams({
        no_invoice: "true",
        page: rentalPage.toString(),
        limit: RENTALS_PER_PAGE.toString(),
      });
      if (appliedRentalQuery) params.set("search", appliedRentalQuery);
      // Once the first rental fixes the customer, only their rentals can be
      // added, so the list narrows instead of paging past everyone else's.
      if (formData.customer_id > 0) {
        params.set("customer_id", formData.customer_id.toString());
      }
      const response: PaginatedRentals = await api.get(
        `/greentarget/api/rentals?${params.toString()}`
      );
      // A narrowing filter can leave us past the end of the result set.
      const lastPage: number = Math.max(1, response.pagination.totalPages);
      if (rentalPage > lastPage) {
        setRentalPage(lastPage);
        return;
      }
      setAvailableRentals(response.data);
      setRentalTotal(response.pagination.total);
      setRentalTotalPages(lastPage);
    } catch (err) {
      console.error("Error fetching billable rentals:", err);
      toast.error("Failed load rentals.");
      setAvailableRentals([]);
      setRentalTotal(0);
      setRentalTotalPages(1);
    } finally {
      setRentalsLoading(false);
    }
  }, [appliedRentalQuery, formData.customer_id, rentalPage]);

  // Create mode lists every rental that can still be invoiced, across all
  // customers, so the user picks the work first and the customer follows.
  useEffect(() => {
    if (!isEditMode) {
      fetchBillableRentals();
    }
  }, [isEditMode, fetchBillableRentals]);

  // Searching is server-side, so it must reach every page, not just the one
  // currently loaded. Any new search restarts at page 1.
  useEffect(() => {
    const timer = setTimeout(() => {
      setAppliedRentalQuery(rentalQuery.trim());
      setRentalPage(1);
    }, 350);
    return () => clearTimeout(timer);
  }, [rentalQuery]);

  const fetchAvailableRentals = async (customerId: number) => {
    if (!customerId || customerId <= 0) {
      setAvailableRentals([]);
      setSelectedRentals([]);
      setRentalsLoading(false);
      return;
    }
    setRentalsLoading(true);
    try {
      const params = new URLSearchParams({
        customer_id: customerId.toString(),
      });
      const data: Rental[] = await api.get(
        `/greentarget/api/rentals?${params.toString()}`
      );
      const available = data.filter(
        (r) =>
          // Include rentals with no invoice info
          !r.invoice_info ||
          // OR include rentals being edited in edit mode
          (isEditMode && initialFormData?.rental_ids?.includes(r.rental_id)) ||
          // OR include rentals with cancelled invoices (not active)
          (r.invoice_info && r.invoice_info.status === "cancelled")
      );
      setAvailableRentals(available);
      // Reset selections if current ones are no longer valid
      const validSelectedRentals = selectedRentals.filter(
        (selectedRental) =>
          available.some((r) => r.rental_id === selectedRental.rental_id) ||
          (isEditMode &&
            initialFormData?.rental_ids?.includes(selectedRental.rental_id))
      );

      if (validSelectedRentals.length !== selectedRentals.length) {
        setSelectedRentals(validSelectedRentals);
        setFormData((prev) => ({
          ...prev,
          rental_ids: validSelectedRentals.map((r) => r.rental_id),
        }));
      }
    } catch (err) {
      console.error("Error fetching rentals:", err);
      toast.error("Failed load rentals.");
      setAvailableRentals([]);
      setSelectedRentals([]);
    } finally {
      setRentalsLoading(false);
    }
  };

  const fetchInvoiceDetails = async (invoiceId: number) => {
    try {
      setLoading(true);
      const data = await greenTargetApi.getInvoice(invoiceId);
      if (!data.invoice) throw new Error("Invoice not found");
      const inv = data.invoice;
      const parsed: Invoice = {
        invoice_id: inv.invoice_id,
        invoice_number: inv.invoice_number,
        type: inv.type,
        customer_id: inv.customer_id,
        rental_ids: inv.rental_details
          ? inv.rental_details.map((r: any) => r.rental_id)
          : [],
        amount_before_tax: parseFloat(inv.amount_before_tax.toString()),
        tax_amount: parseFloat(inv.tax_amount.toString()),
        date_issued: toLocalDateInputValue(inv.date_issued),
        debtor_account_code: inv.debtor_account_code || "",
        revenue_splits:
          Array.isArray(inv.revenue_splits) && inv.revenue_splits.length > 0
            ? inv.revenue_splits.map(
                (split: GreenTargetRevenueSplit): GreenTargetRevenueSplit => ({
                  line_number: Number(split.line_number),
                  account_code: split.account_code,
                  amount: Number(split.amount),
                })
              )
            : [
                {
                  line_number: 1,
                  account_code:
                    inv.revenue_account_code || GT_DEFAULT_REVENUE_ACCOUNT,
                  amount: Number(inv.total_amount),
                },
              ],
        edit_dependencies: inv.edit_dependencies,
      };
      setFormData(parsed);
      setInitialFormData(parsed);
      setError(null);
    } catch (err: any) {
      setError(`Fetch error: ${err.message || "Unknown"}`);
      console.error("Error fetch invoice:", err);
    } finally {
      setLoading(false);
    }
  };

  // --- HELPERS ---

  // Debounced invoice number validation
  const validateInvoiceNumber = useCallback(
    async (invoiceNumber: string) => {
      if (!invoiceNumber || !invoiceNumber.trim()) {
        setInvoiceNumberValidation({
          isValidating: false,
          isValid: true,
          isDuplicate: false,
          message: "",
        });
        return;
      }

      setInvoiceNumberValidation((prev) => ({
        ...prev,
        isValidating: true,
      }));

      try {
        const result = await greenTargetApi.checkInvoiceNumber(
          invoiceNumber.trim(),
          isEditMode && formData.invoice_id ? formData.invoice_id : undefined
        );

        setInvoiceNumberValidation({
          isValidating: false,
          isValid: result.available,
          isDuplicate: result.exists,
          message: result.exists
            ? `Invoice number already exists${
                result.existing_id ? ` (ID: ${result.existing_id})` : ""
              }`
            : "",
        });
      } catch (error) {
        console.error("Error validating invoice number:", error);
        setInvoiceNumberValidation({
          isValidating: false,
          isValid: false,
          isDuplicate: false,
          message: "Error validating invoice number",
        });
      }
    },
    [isEditMode, formData.invoice_id]
  );

  // Debounce invoice number validation
  useEffect(() => {
    const timer = setTimeout(() => {
      if (formData.invoice_number !== initialFormData?.invoice_number) {
        validateInvoiceNumber(formData.invoice_number || "");
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [
    formData.invoice_number,
    initialFormData?.invoice_number,
    validateInvoiceNumber,
  ]);

  const isRentalActive = (
    datePickedStr: string | null | undefined
  ): boolean => {
    if (!datePickedStr) return true;
    const pickupDate: string = toLocalDateInputValue(datePickedStr);
    if (!pickupDate) return false;

    // Preserve this form's existing rule that pickup today is still selectable,
    // but compare the Malaysia-local calendar dates instead of slicing UTC.
    return pickupDate >= format(new Date(), "yyyy-MM-dd");
  };
  const getOptionName = (
    options: SelectOption[],
    value: string | number | undefined | null
  ): string => {
    if (value === undefined || value === null || value === "") return "";
    const selected = options.find(
      (opt) => opt.id.toString() === value.toString()
    );
    return selected ? selected.name : "";
  };

  const isInvoiceDateEligibleForEinvoice = (
    dateIssuedString: string | undefined | null
  ): boolean => {
    if (!dateIssuedString) return false;

    try {
      // Parse the ISO date string to a Date object
      const dateIssued = new Date(dateIssuedString);
      if (isNaN(dateIssued.getTime())) return false; // Invalid date

      const now = new Date();
      const threeDaysInMillis = 3 * 24 * 60 * 60 * 1000;
      const cutoffDate = new Date(now.getTime() - threeDaysInMillis);

      return dateIssued >= cutoffDate;
    } catch {
      return false;
    }
  };

  // --- EVENT HANDLERS ---

  const handleInputChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >
  ) => {
    const { name, value, type } = e.target;

    // If user is changing the amount_before_tax field, mark it as manually changed
    if (name === "amount_before_tax") {
      setIsAmountManuallyChanged(true);

      // Allow any numeric input without applying the less-than-200 logic during typing
      const numericValue =
        type === "number" ? (value === "" ? 0 : parseFloat(value) || 0) : 0;

      setFormData((p) => ({
        ...p,
        [name]: numericValue,
      }));
    } else {
      setFormData((p) => ({
        ...p,
        [name]:
          type === "number"
            ? value === ""
              ? 0
              : parseFloat(value) || 0
            : value,
      }));
    }
  };

  // Apply a new rental selection and keep the derived customer in sync.
  const applyRentalSelection = (nextSelectedRentals: Rental[]): void => {
    setSelectedRentals(nextSelectedRentals);
    const nextCustomerId: number =
      nextSelectedRentals.length > 0 ? nextSelectedRentals[0].customer_id : 0;
    // The list narrows to (or reopens from) the selected customer, so start
    // that new result set at its first page.
    if (nextCustomerId !== formData.customer_id) setRentalPage(1);
    setFormData((p: Invoice): Invoice => {
      if (nextCustomerId === p.customer_id) {
        return { ...p, rental_ids: nextSelectedRentals.map((r) => r.rental_id) };
      }
      const nextCustomer = customers.find(
        (customer: Customer): boolean =>
          customer.customer_id === nextCustomerId
      );
      return {
        ...p,
        customer_id: nextCustomerId,
        rental_ids: nextSelectedRentals.map((r) => r.rental_id),
        debtor_account_code: nextCustomer?.debtor_account_code || "",
      };
    });
  };

  // Handle multiple rental selection
  const handleRentalToggle = (rental: Rental) => {
    const isSelected = selectedRentals.some(
      (r) => r.rental_id === rental.rental_id
    );

    if (isSelected) {
      applyRentalSelection(
        selectedRentals.filter((r) => r.rental_id !== rental.rental_id)
      );
      return;
    }

    // One invoice bills one customer, so a rental from another customer can
    // only be added after the current selection is cleared.
    if (
      formData.customer_id > 0 &&
      rental.customer_id !== formData.customer_id
    ) {
      toast.error(
        "An invoice covers a single customer. Clear the selected rentals to bill another customer."
      );
      return;
    }

    applyRentalSelection([...selectedRentals, rental]);
  };

  const handleClearRentals = (): void => {
    applyRentalSelection([]);
    setIsAmountManuallyChanged(false);
  };
  const handlePaymentMethodChange = (methodIdString: string): void => {
    const nextPaymentMethod =
      methodIdString as GreenTargetPayment["payment_method"];
    setPaymentMethod(nextPaymentMethod);
    if (nextPaymentMethod === "cash") {
      setPaymentReference("");
    }
  };
  const handleBackClick = () => {
    if (isFormChanged) setShowBackConfirmation(true);
    else goBack();
  };
  const handleConfirmBack = () => {
    setShowBackConfirmation(false);
    goBack();
  };

  // --- FORM VALIDATION & SUBMIT ---

  const validateForm = (): boolean => {
    // Check invoice number validation
    if (formData.invoice_number && invoiceNumberValidation.isDuplicate) {
      toast.error(
        "Invoice number already exists. Please choose a different number."
      );
      return false;
    }

    if (
      formData.type === "regular" &&
      (!formData.rental_ids || formData.rental_ids.length === 0)
    ) {
      toast.error("Select at least one rental");
      return false;
    }
    if (!formData.customer_id || formData.customer_id <= 0) {
      toast.error("Select a rental to set the customer");
      return false;
    }
    if (!formData.debtor_account_code.trim()) {
      toast.error("Select or create a Trade Debtor identity");
      return false;
    }
    const invoiceTotalCents: number = toCents(
      Number(formData.amount_before_tax || 0) + Number(formData.tax_amount || 0)
    );
    const hasInvalidRevenueSplit: boolean =
      formData.revenue_splits.length === 0 ||
      formData.revenue_splits.some(
        (split: GreenTargetRevenueSplit): boolean =>
          !Number.isFinite(Number(split.amount)) || toCents(Number(split.amount)) <= 0
      );
    const allocatedRevenueCents: number = formData.revenue_splits.reduce(
      (sum: number, split: GreenTargetRevenueSplit): number =>
        sum + toCents(Number(split.amount)),
      0
    );
    if (hasInvalidRevenueSplit) {
      toast.error("Enter an amount greater than RM 0.00 for every revenue line");
      return false;
    }
    if (allocatedRevenueCents !== invoiceTotalCents) {
      toast.error("Revenue allocation must equal the invoice total");
      return false;
    }
    const selCust = customers.find(
      (c) => c.customer_id === formData.customer_id
    );
    if (!formData.date_issued) {
      toast.error("Specify issue date");
      return false;
    }
    if (formData.amount_before_tax <= 0 && formData.tax_amount <= 0) {
      toast.error("Amount > 0");
      return false;
    }
    if (!isEditMode && submitAsEinvoice) {
      if (!selCust) {
        toast.error("eInvoice: Customer missing.");
        return false;
      }
    }
    if (isPaid && !paymentMethod) {
      toast.error("Select payment method.");
      return false;
    }
    if (isPaid && !paymentDate) {
      toast.error("Enter the payment received date.");
      return false;
    }
    if (isPaid && formData.date_issued && paymentDate < formData.date_issued) {
      toast.error("Payment received date cannot be before the invoice date.");
      return false;
    }
    if (isPaid && !paymentInternalReference.trim()) {
      toast.error("Enter the Green Target reference number.");
      return false;
    }
    if (isPaid && paymentInternalReference.trim().length > 50) {
      toast.error("Green Target reference number cannot exceed 50 characters.");
      return false;
    }
    if (isPaid && paymentReference.trim().length > 50) {
      toast.error("Cheque / transaction reference cannot exceed 50 characters.");
      return false;
    }
    return true;
  };
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;
    setIsSaving(true);
    const totalAmount = formData.amount_before_tax + formData.tax_amount;
    try {
      if (isPaid) {
        const referenceAvailability =
          await greenTargetApi.checkInternalPaymentRef(
            paymentInternalReference.trim()
          );
        if (referenceAvailability.exists) {
          toast.error("This Green Target reference number is already in use.");
          return;
        }
      }
      const invData: Omit<Invoice, "invoice_id"> & {
        total_amount: number;
        invoice_id?: number;
      } = {
        type: formData.type,
        customer_id: Number(formData.customer_id),
        rental_ids: formData.rental_ids || [],
        amount_before_tax: Number(formData.amount_before_tax),
        tax_amount: Number(formData.tax_amount),
        total_amount: Number(totalAmount),
        date_issued: formData.date_issued,
        invoice_number: formData.invoice_number?.trim() || undefined,
        debtor_account_code: formData.debtor_account_code,
        revenue_splits: formData.revenue_splits,
      };
      if (isEditMode && formData.invoice_id)
        invData.invoice_id = formData.invoice_id;
      let response;
      let navId: number | null = null;
      if (isEditMode && invData.invoice_id) {
        response = await greenTargetApi.updateInvoice(
          invData.invoice_id,
          invData
        );
        toast.success("Invoice updated");
        navId = invData.invoice_id;
      } else {
        response = await greenTargetApi.createInvoice(invData);
        if (response.invoice?.invoice_id) {
          navId = response.invoice.invoice_id;
          toast.success("Invoice created");
          const selCust = customers.find(
            (c) => c.customer_id === formData.customer_id
          );

          if (
            submitAsEinvoice &&
            selCust?.tin_number &&
            selCust?.id_number &&
            navId
          ) {
            // Set state to show loading in modal immediately
            setIsSubmittingEInvoice(true);
            setSubmissionResults(null); // Clear previous results
            setShowSubmissionResultsModal(true); // Show modal immediately with loading state

            const eTid = toast.loading("Submitting e-Invoice...");
            try {
              const eRes = await greenTargetApi.submitEInvoice(navId);

              // Dismiss loading toast
              toast.dismiss(eTid);

              // Transform the response to match the expected format
              const transformedResponse = {
                success: eRes.success,
                message: eRes.message || "e-Invoice submitted successfully",
                overallStatus:
                  eRes.einvoice?.einvoice_status === "valid"
                    ? "Valid"
                    : eRes.einvoice?.einvoice_status === "pending"
                    ? "Pending"
                    : "Unknown",
                acceptedDocuments: eRes.einvoice
                  ? [
                      {
                        internalId: eRes.einvoice.invoice_number,
                        uuid: eRes.einvoice.uuid,
                        longId: eRes.einvoice.long_id,
                        status:
                          eRes.einvoice.einvoice_status === "valid"
                            ? "ACCEPTED"
                            : "Submitted",
                        dateTimeValidated: eRes.einvoice.datetime_validated,
                      },
                    ]
                  : [],
                rejectedDocuments:
                  !eRes.success && eRes.error
                    ? [
                        {
                          internalId: navId.toString(),
                          error: {
                            code: "ERROR",
                            message: eRes.error.message || "Unknown error",
                            details: eRes.error.details,
                          },
                        },
                      ]
                    : [],
              };

              // Store the transformed response for the modal
              setSubmissionResults(transformedResponse);

              // Only show minor toast if needed
              if (eRes.success && !showSubmissionResultsModal) {
                const status = eRes.einvoice?.einvoice_status || "pending";
                if (status === "valid") {
                  toast.success("e-Invoice submitted and validated");
                } else {
                  toast.success("e-Invoice submitted and pending validation");
                }
              }
            } catch (eErr) {
              console.error("e-Invoice submission error:", eErr);
              toast.error("e-Invoice submission failed", { id: eTid });

              // Format error for modal with the expected structure
              const errorMessage =
                eErr instanceof Error ? eErr.message : "Unknown error";
              setSubmissionResults({
                success: false,
                message: `e-Invoice submission failed: ${errorMessage}`,
                overallStatus: "Error",
                rejectedDocuments: [
                  {
                    internalId: navId.toString(),
                    error: {
                      code: "EINVOICE_ERROR",
                      message: errorMessage,
                    },
                  },
                ],
              });
            } finally {
              // Make sure to set the submitting state to false when done
              setIsSubmittingEInvoice(false);
            }
          }
          if (isPaid && navId) {
            const pTid = toast.loading("Recording payment...");
            try {
              const pData: CreateGreenTargetPaymentInput = {
                invoice_id: navId,
                payment_date: paymentDate,
                amount_paid: totalAmount,
                payment_method: paymentMethod,
                payment_reference: paymentReference.trim() || null,
                internal_reference: paymentInternalReference.trim(),
              };
              await greenTargetApi.createPayment(pData);
              toast.success("Payment recorded", { id: pTid });
            } catch (pErr) {
              console.error("Payment err:", pErr);
              toast.error("Invoice created, payment failed.", { id: pTid });
            }
          }
          if (navId)
            navigate(`/greentarget/invoices/${navId}`, {
              replace: true,
              state: { previousPath: "/greentarget/invoices" },
            });
        } else {
          throw new Error(response.message || "Failed create invoice");
        }
      }
    } catch (error: any) {
      console.error("Save error:", error);
      const msg = error instanceof Error ? error.message : "Unknown error";
      toast.error(`Error: ${msg}`);
    } finally {
      setIsSaving(false);
    }
  };

  // Calculate total amount for display
  const totalAmount =
    (Number(formData.amount_before_tax) || 0) +
    (Number(formData.tax_amount) || 0);
  const editDependencies = formData.edit_dependencies;
  const documentIdentityLocked: boolean = Boolean(
    isEditMode &&
      (editDependencies?.has_receipts ||
        editDependencies?.has_adjustments ||
        editDependencies?.journal_manual_override)
  );
  const revenueAllocationLocked: boolean = Boolean(
    isEditMode &&
      (editDependencies?.has_adjustments ||
        editDependencies?.journal_manual_override)
  );

  // --- RENDER ---

  if (loading) return <LoadingSpinner />;
  if (error) {
    return (
      <div className="container mx-auto px-4">
        <BackButton onClick={handleBackClick} className="ml-5" />
        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-rose-200 shadow-sm">
          <h2 className="text-xl font-semibold text-rose-700 mb-4">
            Error Loading Invoice
          </h2>
          <p className="text-default-600 dark:text-gray-300 mb-4">{error}</p>
          <Button onClick={handleBackClick} variant="outline" color="secondary">
            Go Back
          </Button>
        </div>
      </div>
    );
  }

  const selectedCustomer: Customer | undefined = customers.find(
    (c) => c.customer_id === formData.customer_id
  );
  const selectedCustomerForEinvoice = selectedCustomer;
  const canSubmitEinvoice = !!(
    selectedCustomerForEinvoice?.tin_number &&
    selectedCustomerForEinvoice?.id_number &&
    selectedCustomerForEinvoice?.phone_number
  );

  return (
    <div className="space-y-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow border border-default-200 dark:border-gray-700">
        <div className="p-6 border-b border-default-200 dark:border-gray-700">
          <div className="flex items-center gap-4">
            <BackButton onClick={handleBackClick} />
            <div className="h-6 w-px bg-default-300"></div>
            <div>
              <h1 className="text-xl font-semibold text-default-900 dark:text-gray-100">
                {isEditMode
                  ? `Edit Invoice ${
                      formData.invoice_number ? `(#${formData.invoice_number})` : ""
                    }`
                  : "Create New Invoice"}
              </h1>
              <p className="mt-1 text-sm text-default-500 dark:text-gray-400">
                {isEditMode ? "Update invoice info." : "Fill in the details."}
              </p>
            </div>
          </div>
        </div>
        {documentIdentityLocked && (
          <div className="mx-6 mt-5 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
            Invoice number, date, customer, amount, rentals, and debtor identity
            are locked because receipt/adjustment history or a detached journal
            depends on them. Revenue allocation remains editable only when no
            adjustment or detached journal exists.
          </div>
        )}
        <form onSubmit={handleSubmit} className="p-6">
          {/* First row with invoice number and customer */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Invoice Number */}
            <div className="space-y-2">
              <label
                htmlFor="invoice_number"
                className="block text-sm font-medium text-default-700 dark:text-gray-200"
              >
                Invoice Number
                {!isEditMode && (
                  <span className="text-sm font-normal text-default-500 dark:text-gray-400 ml-1">
                    (optional - auto-generated if empty)
                  </span>
                )}
              </label>
              <div className="relative">
                <input
                  type="text"
                  id="invoice_number"
                  name="invoice_number"
                  value={formData.invoice_number || ""}
                  onChange={handleInputChange}
                  disabled={isSaving || documentIdentityLocked}
                  className={clsx(
                    "block w-full px-3 py-2 border rounded-lg shadow-sm",
                    "focus:outline-none focus:ring-1 focus:ring-sky-500 focus:border-sky-500 sm:text-sm",
                    invoiceNumberValidation.isDuplicate
                      ? "border-red-500 bg-red-50 dark:bg-red-900/30"
                      : invoiceNumberValidation.isValid
                      ? "border-default-300 dark:border-gray-600 bg-white dark:bg-gray-700"
                      : "border-yellow-500 bg-yellow-50 dark:bg-yellow-900/30"
                  )}
                  placeholder="Enter custom invoice number or leave blank"
                />
                {invoiceNumberValidation.isValidating && (
                  <div className="absolute inset-y-0 right-0 flex items-center pr-3">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-sky-500"></div>
                  </div>
                )}
              </div>
              {invoiceNumberValidation.message && (
                <p
                  className={clsx(
                    "text-sm",
                    invoiceNumberValidation.isDuplicate
                      ? "text-red-600"
                      : "text-yellow-600"
                  )}
                >
                  {invoiceNumberValidation.message}
                </p>
              )}
              {formData.invoice_number &&
                invoiceNumberValidation.isValid &&
                !invoiceNumberValidation.isValidating && (
                  <p className="text-sm text-green-600">
                    Invoice number is available
                  </p>
                )}
            </div>

            {/* Invoice Date */}
            <div className="space-y-2">
              <label
                htmlFor="date_issued"
                className="block text-sm font-medium text-default-700 dark:text-gray-200"
              >
                Invoice Date <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                id="date_issued"
                name="date_issued"
                value={formData.date_issued}
                onChange={handleInputChange}
                disabled={isSaving || documentIdentityLocked}
                required
                className={clsx(
                  "block w-full px-3 py-2 border border-default-300 dark:border-gray-600 rounded-lg shadow-sm",
                  "bg-white dark:bg-gray-700",
                  "focus:outline-none focus:ring-1 focus:ring-sky-500 focus:border-sky-500 sm:text-sm"
                )}
              />
            </div>
          </div>

          {/* Second row: the customer is derived from the selected rentals */}
          <div className="mt-6">
            <div className="space-y-2">
              <span className="block text-sm font-medium text-default-700 dark:text-gray-200">
                Customer <span className="text-red-500">*</span>
              </span>
              <div className="flex items-center justify-between gap-3 rounded-lg border border-default-300 dark:border-gray-600 bg-default-50 dark:bg-gray-900/50 px-3 py-2">
                {selectedCustomer ? (
                  <div className="min-w-0">
                    <div className="truncate font-medium text-default-900 dark:text-gray-100">
                      {selectedCustomer.name}
                    </div>
                    {selectedCustomer.phone_number && (
                      <div className="text-xs text-default-500 dark:text-gray-400">
                        {selectedCustomer.phone_number}
                      </div>
                    )}
                  </div>
                ) : (
                  <span className="text-sm text-default-500 dark:text-gray-400">
                    Select a rental below — the customer is set from your
                    selection.
                  </span>
                )}
                {!isEditMode &&
                  !documentIdentityLocked &&
                  formData.customer_id > 0 && (
                    <button
                      type="button"
                      onClick={handleClearRentals}
                      className="shrink-0 text-sm text-sky-600 hover:text-sky-700 hover:underline dark:text-sky-400"
                    >
                      Change customer
                    </button>
                  )}
              </div>
            </div>
          </div>

          {/* Conditional Fields (Regular Invoice - Multiple Rental Selection) */}
          {formData.type === "regular" && (
            <div
              className={clsx(
                "mt-6",
                documentIdentityLocked && "pointer-events-none opacity-60"
              )}
              aria-disabled={documentIdentityLocked}
            >
              <div className="space-y-2">
                <label className="block text-sm font-medium text-default-700 dark:text-gray-200">
                  Select Rentals <span className="text-red-500">*</span>
                  <span className="text-sm font-normal text-default-500 dark:text-gray-400 ml-1">
                    {isEditMode
                      ? "(Rentals cannot be changed after the invoice is created)"
                      : "(Every rental still waiting to be invoiced — pick one or more from the same customer)"}
                  </span>
                </label>

                {!isEditMode && (
                  <>
                    <div className="relative">
                      <IconSearch
                        size={18}
                        className="pointer-events-none absolute inset-y-0 left-3 my-auto text-default-400 dark:text-gray-500"
                      />
                      <input
                        type="text"
                        value={rentalQuery}
                        onChange={(
                          event: React.ChangeEvent<HTMLInputElement>
                        ): void => setRentalQuery(event.target.value)}
                        placeholder="Search customer, site, address, dumpster, driver or rental no..."
                        className={clsx(
                          "block w-full pl-10 pr-3 py-2 border border-default-300 dark:border-gray-600 rounded-lg shadow-sm",
                          "bg-white dark:bg-gray-700",
                          "focus:outline-none focus:ring-1 focus:ring-sky-500 focus:border-sky-500 sm:text-sm"
                        )}
                      />
                    </div>
                    {formData.customer_id > 0 && (
                      <p className="text-xs text-default-500 dark:text-gray-400">
                        Showing only {selectedCustomer?.name || "this customer"}
                        's remaining rentals. Use "Change customer" above to
                        browse every customer again.
                      </p>
                    )}
                  </>
                )}

                {rentalsLoading ? (
                  <div className="p-4 border border-default-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-900/50 text-gray-500 dark:text-gray-400 text-center">
                    Loading rentals...
                  </div>
                ) : rentalGroups.length === 0 ? (
                  <div className="p-4 border border-default-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-900/50 text-gray-500 dark:text-gray-400 text-center">
                    {appliedRentalQuery
                      ? "No rentals match your search"
                      : "No rentals are waiting to be invoiced"}
                  </div>
                ) : (
                  <div className="border border-default-300 dark:border-gray-600 rounded-lg max-h-96 overflow-y-auto">
                    {rentalGroups.map((group: RentalGroup) => {
                      const isOtherCustomer: boolean =
                        formData.customer_id > 0 &&
                        group.customer_id !== formData.customer_id;

                      return (
                        <div key={group.customer_id}>
                          <div
                            className={clsx(
                              "sticky top-0 z-10 flex items-center justify-between gap-3 px-4 py-2",
                              "border-b border-default-200 dark:border-gray-700",
                              isOtherCustomer
                                ? "bg-gray-100 dark:bg-gray-900"
                                : "bg-default-50 dark:bg-gray-900/80"
                            )}
                          >
                            <span
                              className={clsx(
                                "truncate text-sm font-semibold",
                                isOtherCustomer
                                  ? "text-default-400 dark:text-gray-500"
                                  : "text-default-800 dark:text-gray-100"
                              )}
                            >
                              {group.customer_name}
                            </span>
                            <span className="shrink-0 text-xs text-default-500 dark:text-gray-400">
                              {group.rentals.length} rental
                              {group.rentals.length === 1 ? "" : "s"}
                            </span>
                          </div>

                          <div className="divide-y divide-default-200 dark:divide-gray-700">
                            {group.rentals.map((rental: Rental) => {
                              const isSelected = selectedRentals.some(
                                (r) => r.rental_id === rental.rental_id
                              );
                              const isActive = isRentalActive(
                                rental.date_picked
                              );
                              const locationDisplay: string =
                                formatLocationDisplay(
                                  rental.location_site,
                                  rental.location_address
                                );

                              return (
                                <div
                                  key={rental.rental_id}
                                  onClick={() =>
                                    !isEditMode && handleRentalToggle(rental)
                                  }
                                  className={clsx(
                                    "p-4 cursor-pointer transition-colors relative",
                                    isEditMode
                                      ? "cursor-not-allowed"
                                      : "hover:bg-gray-50 dark:hover:bg-gray-700",
                                    isOtherCustomer && "opacity-50",
                                    isSelected
                                      ? "bg-sky-50 dark:bg-sky-900/30 border-l-[4px] border-l-sky-400 dark:border-l-sky-500 !border-t-0 !border-r-0 !border-b-0"
                                      : ""
                                  )}
                                >
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center space-x-3">
                                      <div className="flex items-center">
                                        {isSelected ? (
                                          <IconSquareCheckFilled
                                            className="text-sky-600 dark:text-sky-400"
                                            size={20}
                                          />
                                        ) : (
                                          <IconSquare
                                            className="text-gray-400 dark:text-gray-500"
                                            size={20}
                                          />
                                        )}
                                      </div>
                                      <div>
                                        <div className="font-medium text-gray-900 dark:text-gray-100">
                                          Rental #{rental.rental_id} - Dumpster{" "}
                                          {rental.tong_no}
                                        </div>
                                        <div className="text-sm text-gray-500 dark:text-gray-400">
                                          Placed:{" "}
                                          {new Date(
                                            rental.date_placed
                                          ).toLocaleDateString()}
                                          {locationDisplay &&
                                            ` • ${locationDisplay}`}
                                        </div>
                                      </div>
                                    </div>
                                    <div className="flex items-center space-x-2">
                                      <span
                                        className={clsx(
                                          "text-xs font-medium px-2 py-1 rounded-full",
                                          isActive
                                            ? "bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300"
                                            : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400"
                                        )}
                                      >
                                        {isActive ? "Ongoing" : "Completed"}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {!isEditMode && !rentalsLoading && rentalTotal > 0 && (
                  <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                    <span className="text-xs text-default-500 dark:text-gray-400">
                      Showing {(rentalPage - 1) * RENTALS_PER_PAGE + 1}-
                      {Math.min(rentalPage * RENTALS_PER_PAGE, rentalTotal)} of{" "}
                      {rentalTotal} rental{rentalTotal === 1 ? "" : "s"}
                    </span>
                    {rentalTotalPages > 1 && (
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          color="secondary"
                          onClick={(): void =>
                            setRentalPage((page: number): number =>
                              Math.max(1, page - 1)
                            )
                          }
                          disabled={rentalPage <= 1}
                        >
                          Previous
                        </Button>
                        <span className="text-xs text-default-600 dark:text-gray-300">
                          Page {rentalPage} of {rentalTotalPages}
                        </span>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          color="secondary"
                          onClick={(): void =>
                            setRentalPage((page: number): number =>
                              Math.min(rentalTotalPages, page + 1)
                            )
                          }
                          disabled={rentalPage >= rentalTotalPages}
                        >
                          Next
                        </Button>
                      </div>
                    )}
                  </div>
                )}

                {selectedRentals.length > 0 && (
                  <div className="mt-4">
                    <div className="text-sm font-medium text-default-700 dark:text-gray-200 mb-2">
                      Selected Rentals ({selectedRentals.length})
                    </div>
                    <div className="space-y-2">
                      {selectedRentals.map((rental) => (
                        <div
                          key={rental.rental_id}
                          className="bg-sky-50 dark:bg-sky-900/30 border border-sky-200 dark:border-sky-800 rounded-lg p-3"
                        >
                          <div className="flex justify-between items-start">
                            <div>
                              <div className="font-medium text-gray-900 dark:text-gray-100">
                                Rental #{rental.rental_id} - Dumpster{" "}
                                {rental.tong_no}
                              </div>
                              <div className="text-sm text-gray-600 dark:text-gray-300 mt-1">
                                <span>Driver: {rental.driver}</span>
                                <span className="mx-2">•</span>
                                <span>
                                  Placed:{" "}
                                  {new Date(
                                    rental.date_placed
                                  ).toLocaleDateString()}
                                </span>
                                {rental.date_picked && (
                                  <>
                                    <span className="mx-2">•</span>
                                    <span>
                                      Picked:{" "}
                                      {new Date(
                                        rental.date_picked
                                      ).toLocaleDateString()}
                                    </span>
                                  </>
                                )}
                              </div>
                              {formatLocationDisplay(
                                rental.location_site,
                                rental.location_address
                              ) && (
                                <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                                  Location:{" "}
                                  {formatLocationDisplay(
                                    rental.location_site,
                                    rental.location_address
                                  )}
                                </div>
                              )}
                            </div>
                            {!isEditMode && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleRentalToggle(rental);
                                }}
                                className="text-red-600 hover:text-red-700 p-1"
                                title="Remove rental"
                              >
                                ✕
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="mt-6">
            <GTInvoiceAccountFields
              customerId={formData.customer_id || null}
              customerName={selectedCustomer?.name || null}
              customerDefaultCode={selectedCustomer?.debtor_account_code || null}
              debtorAccountCode={formData.debtor_account_code}
              dateIssued={formData.date_issued}
              invoiceTotal={totalAmount}
              revenueSplits={formData.revenue_splits}
              onDebtorChange={(accountCode: string): void =>
                setFormData((current: Invoice): Invoice => ({
                  ...current,
                  debtor_account_code: accountCode,
                }))
              }
              onRevenueSplitsChange={(splits: GreenTargetRevenueSplit[]): void =>
                setFormData((current: Invoice): Invoice => ({
                  ...current,
                  revenue_splits: splits,
                }))
              }
              disabled={isSaving}
              debtorDisabled={documentIdentityLocked}
              revenueDisabled={revenueAllocationLocked}
            />
          </div>

          {/* Amount and Tax Section */}
          <div className="mt-6 border-t dark:border-gray-700 pt-6">
            <h2 className="text-lg font-medium mb-4 dark:text-gray-100">Invoice Amount</h2>
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-4">
              <div className="space-y-2">
                <label
                  htmlFor="amount_before_tax"
                  className="block text-sm font-medium text-default-700 dark:text-gray-200"
                >
                  Amount (Excl. Tax) <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-3 flex items-center text-default-500 dark:text-gray-400 text-sm">
                    RM
                  </span>
                  <input
                    type="number"
                    id="amount_before_tax"
                    name="amount_before_tax"
                    value={formData.amount_before_tax}
                    onChange={handleInputChange}
                    disabled={isSaving || documentIdentityLocked}
                    min="0"
                    step="1"
                    required
                    className={clsx(
                      "block w-full pl-10 pr-3 py-2 border border-default-300 dark:border-gray-600 rounded-lg shadow-sm",
                      "focus:outline-none focus:ring-1 focus:ring-sky-500 focus:border-sky-500 sm:text-sm",
                      !isEditMode &&
                      formData.type === "regular" &&
                      selectedRentals.length > 0
                        ? "bg-sky-50 dark:bg-sky-900/30"
                        : "bg-white dark:bg-gray-700"
                    )}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label
                  htmlFor="tax_amount"
                  className="block text-sm font-medium text-default-700 dark:text-gray-200"
                >
                  Tax Amount
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-3 flex items-center text-default-500 dark:text-gray-400 text-sm">
                    RM
                  </span>
                  <input
                    type="number"
                    id="tax_amount"
                    name="tax_amount"
                    value={formData.tax_amount}
                    onChange={handleInputChange}
                    disabled={isSaving || documentIdentityLocked}
                    min="0"
                    step="1"
                    className={clsx(
                      "block w-full pl-10 pr-3 py-2 border border-default-300 dark:border-gray-600 rounded-lg shadow-sm",
                      "focus:outline-none focus:ring-1 focus:ring-sky-500 focus:border-sky-500 sm:text-sm bg-default-50 dark:bg-gray-900/50"
                    )}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className="block text-sm font-medium text-default-700 dark:text-gray-200">
                  Total Amount
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-3 flex items-center text-default-500 dark:text-gray-400 text-sm">
                    RM
                  </span>
                  <input
                    type="text"
                    value={totalAmount.toFixed(2)}
                    className="w-full pl-10 pr-3 py-1.5 border border-default-300 dark:border-gray-600 rounded-lg bg-gray-100 dark:bg-gray-700 font-medium text-default-700 dark:text-gray-200 cursor-default"
                    readOnly
                    tabIndex={-1}
                  />
                </div>
              </div>
              {!isEditMode && (
                <div className="space-y-2 flex items-end pb-1">
                  <div className="flex items-center h-[42px]">
                    <button
                      type="button"
                      onClick={() => setIsPaid(!isPaid)}
                      className="flex items-center cursor-pointer group p-1"
                    >
                      {isPaid ? (
                        <IconSquareCheckFilled
                          className="text-sky-600 dark:text-sky-400 group-hover:text-sky-700"
                          size={20}
                        />
                      ) : (
                        <IconSquare
                          className="text-default-400 group-hover:text-default-500 dark:text-gray-400"
                          size={20}
                        />
                      )}
                      <span className="ml-2 text-sm font-medium text-default-700 dark:text-gray-100">
                        Record Payment
                      </span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Payment Method Section */}
          {!isEditMode && isPaid && (
            <div className="mt-6 border-t dark:border-gray-700 pt-6">
              <h2 className="text-lg font-medium mb-4 dark:text-gray-100">
                Payment Info
              </h2>
              {paymentMethod === "cheque" && (
                <p className="mb-4 text-sm text-default-500 dark:text-gray-400">
                  Cheque payments remain pending until they are confirmed.
                </p>
              )}
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
                <div className="space-y-2">
                  <label
                    htmlFor="payment_date_paid"
                    className="block text-sm font-medium text-default-700 dark:text-gray-200"
                  >
                    Date Received <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    id="payment_date_paid"
                    name="payment_date_paid"
                    value={paymentDate}
                    onChange={(event: React.ChangeEvent<HTMLInputElement>): void =>
                      setPaymentDate(event.target.value)
                    }
                    required
                    className={clsx(
                      "block w-full px-3 py-2 border border-default-300 dark:border-gray-600 rounded-lg shadow-sm",
                      "bg-white dark:bg-gray-700",
                      "focus:outline-none focus:ring-1 focus:ring-sky-500 focus:border-sky-500 sm:text-sm"
                    )}
                  />
                </div>
                <div className="space-y-2">
                  <label
                    htmlFor="internal_reference_paid"
                    className="block text-sm font-medium text-default-700 dark:text-gray-200"
                  >
                    Green Target Reference No. <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    id="internal_reference_paid"
                    name="internal_reference_paid"
                    value={paymentInternalReference}
                    onChange={(event: React.ChangeEvent<HTMLInputElement>): void =>
                      setPaymentInternalReference(event.target.value)
                    }
                    placeholder="e.g. RV26/06/62"
                    maxLength={50}
                    required
                    className={clsx(
                      "block w-full px-3 py-2 border border-default-300 dark:border-gray-600 rounded-lg shadow-sm",
                      "bg-white dark:bg-gray-700",
                      "focus:outline-none focus:ring-1 focus:ring-sky-500 focus:border-sky-500 sm:text-sm"
                    )}
                  />
                </div>
                <div className="space-y-2">
                  <label
                    htmlFor="pm-paid"
                    className="block text-sm font-medium text-default-700 dark:text-gray-200"
                  >
                    Method <span className="text-red-500">*</span>
                  </label>
                  <Listbox
                    value={paymentMethod}
                    onChange={handlePaymentMethodChange}
                    name="payment_method_paid"
                  >
                    <div className="relative">
                      <HeadlessListboxButton
                        id="pm-paid"
                        className={clsx(
                          "relative w-full cursor-default rounded-lg border border-default-300 dark:border-gray-600 bg-white dark:bg-gray-900/50 py-2 pl-3 pr-10 text-left shadow-sm",
                          "focus:outline-none focus:ring-1 focus:ring-sky-500 focus:border-sky-500 sm:text-sm"
                        )}
                      >
                        <span className="block truncate">
                          {getOptionName(paymentMethodOptions, paymentMethod) ||
                            "Select"}
                        </span>
                        <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
                          <IconChevronDown
                            size={20}
                            className="text-gray-400"
                          />
                        </span>
                      </HeadlessListboxButton>
                      <Transition
                        as={Fragment}
                        leave="transition ease-in duration-100"
                        leaveFrom="opacity-100"
                        leaveTo="opacity-0"
                      >
                        <ListboxOptions
                          className={clsx(
                            "absolute z-20 max-h-60 w-full overflow-auto rounded-md bg-white dark:bg-gray-700 py-1 text-base shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none sm:text-sm",
                            "bottom-full mb-1"
                          )}
                        >
                          {paymentMethodOptions.map((o) => (
                            <ListboxOption
                              key={o.id}
                              className={({ active }) =>
                                clsx(
                                  "relative cursor-default select-none py-2 pl-3 pr-10",
                                  active
                                    ? "bg-sky-100 dark:bg-sky-900/50 text-sky-900 dark:text-sky-100"
                                    : "text-gray-900 dark:text-gray-100"
                                )
                              }
                              value={o.id.toString()}
                            >
                              {({ selected }) => (
                                <>
                                  <span
                                    className={clsx(
                                      "block truncate",
                                      selected ? "font-medium" : "font-normal"
                                    )}
                                  >
                                    {o.name}
                                  </span>
                                  {selected && (
                                    <span className="absolute inset-y-0 right-0 flex items-center pr-3 text-sky-600 dark:text-sky-400">
                                      <IconCheck size={20} />
                                    </span>
                                  )}
                                </>
                              )}
                            </ListboxOption>
                          ))}
                        </ListboxOptions>
                      </Transition>
                    </div>
                  </Listbox>
                </div>
                {paymentMethod !== "cash" && (
                  <div className="space-y-2">
                    <label
                      htmlFor="payment_reference"
                      className="block text-sm font-medium text-default-700 dark:text-gray-200"
                    >
                      {paymentMethod === "cheque"
                        ? "Cheque No. (Optional)"
                        : "Transaction Reference (Optional)"}
                    </label>
                    <input
                      type="text"
                      id="payment_reference"
                      name="payment_reference"
                      value={paymentReference}
                      maxLength={50}
                      onChange={(
                        event: React.ChangeEvent<HTMLInputElement>
                      ): void => setPaymentReference(event.target.value)}
                      className={clsx(
                        "block w-full px-3 py-2 border border-default-300 dark:border-gray-600 rounded-lg shadow-sm",
                        "bg-white dark:bg-gray-700",
                        "focus:outline-none focus:ring-1 focus:ring-sky-500 focus:border-sky-500 sm:text-sm"
                      )}
                    />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* e-Invoice Section */}
          {!isEditMode && formData.customer_id > 0 && (
            <div className="mt-6 border-t dark:border-gray-700 pt-6">
              <h2 className="text-lg font-medium mb-2 dark:text-gray-100">e-Invoice Option</h2>
              {canSubmitEinvoice ? (
                isInvoiceDateEligibleForEinvoice(formData.date_issued) ? (
                  <div className="flex items-center space-x-2">
                    <button
                      type="button"
                      onClick={() => setSubmitAsEinvoice(!submitAsEinvoice)}
                      className="flex items-center cursor-pointer group p-1"
                    >
                      {submitAsEinvoice ? (
                        <IconSquareCheckFilled
                          className="text-sky-600 dark:text-sky-400 group-hover:text-sky-700"
                          size={20}
                        />
                      ) : (
                        <IconSquare
                          className="text-default-400 group-hover:text-default-500 dark:text-gray-400"
                          size={20}
                        />
                      )}
                      <span className="ml-2 text-sm font-medium text-default-700 group-hover:text-default-900 dark:text-gray-100">
                        Submit e-Invoice upon saving
                      </span>
                    </button>
                  </div>
                ) : (
                  <div className="text-sm text-amber-600">
                    Cannot submit e-Invoice for dates older than 3 days.
                  </div>
                )
              ) : (
                <div className="flex items-center">
                  <button
                    type="button"
                    onClick={() =>
                      navigate(`/greentarget/customers/${formData.customer_id}`)
                    }
                    className="text-sm text-default-500 dark:text-gray-400 hover:text-sky-800 hover:underline focus:outline-none"
                    title="Add TIN & ID or phone number for customer"
                  >
                    Cannot submit e-Invoice. Customer missing TIN & ID or phone
                    number.
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Action Buttons */}
          <div className="mt-8 pt-5 border-t border-default-200 dark:border-gray-700 flex justify-end">
            <Button
              type="button"
              variant="outline"
              color="secondary"
              onClick={handleBackClick}
              className="mr-3"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="filled"
              color="sky"
              disabled={isSaving || (!isFormChanged && isEditMode)}
            >
              {isSaving
                ? "Saving..."
                : isEditMode
                ? "Save Changes"
                : "Create Invoice"}
            </Button>
          </div>
        </form>
      </div>
      <SubmissionResultsModal
        isOpen={showSubmissionResultsModal}
        onClose={() => setShowSubmissionResultsModal(false)}
        results={
          submissionResults
            ? {
                ...submissionResults,
                message: submissionResults.message || "", // Ensure message is always a string
                overallStatus: submissionResults.overallStatus || "Unknown", // Ensure overallStatus is always a string
              }
            : null
        }
        isLoading={isSubmittingEInvoice}
      />
      {/* Dialogs */}
      <ConfirmationDialog
        isOpen={showBackConfirmation}
        onClose={() => setShowBackConfirmation(false)}
        onConfirm={handleConfirmBack}
        title="Discard Changes"
        message="Leave without saving?"
        confirmButtonText="Discard"
        variant="danger"
      />
    </div>
  );
};

// Helper component (keep as is)
const InfoItem: React.FC<{
  label: string;
  value: string | number | null | undefined;
  highlight?: boolean;
}> = ({ label, value, highlight = false }) => (
  <div className="bg-default-50 dark:bg-gray-900/50 p-3 rounded-lg border border-default-100 dark:border-gray-700">
    <div className="text-xs text-default-500 dark:text-gray-400 mb-1">{label}</div>
    <div
      className={clsx(
        "font-medium truncate",
        highlight ? "text-green-600 dark:text-green-400" : "text-default-800 dark:text-gray-200"
      )}
    >
      {value ?? "N/A"}
    </div>
  </div>
);

export default InvoiceFormPage;
