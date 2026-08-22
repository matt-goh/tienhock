// src/pages/GreenTarget/Rentals/RentalDetailsPage.tsx
import React, {
  Fragment,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { format } from "date-fns";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { Trans, useTranslation } from "react-i18next";
import {
  IconChevronDown,
  IconFileInvoice,
  IconMapPin,
  IconPencil,
  IconSquare,
  IconSquareCheckFilled,
  IconTrash,
  IconTruck,
  IconX,
} from "@tabler/icons-react";
import { Dialog, Listbox, Transition } from "@headlessui/react";
import toast from "react-hot-toast";
import BackButton from "../../../components/BackButton";
import Button from "../../../components/Button";
import ConfirmationDialog from "../../../components/ConfirmationDialog";
import GreenTargetReceiptDetailsDialog from "../../../components/GreenTarget/GreenTargetReceiptDetailsDialog";
import LoadingSpinner from "../../../components/LoadingSpinner";
import { greenTargetApi } from "../../../routes/greentarget/api";
import GTInvoiceAccountFields, {
  GT_DEFAULT_REVENUE_ACCOUNT,
  GTInvoiceAccountFieldsHandle,
} from "../../../components/GreenTarget/GTInvoiceAccountFields";
import GTInvoiceLinesEditor, {
  createGTInvoiceLineDraft,
  gtInvoiceLinesTotal,
  GTInvoiceLineDraft,
} from "../../../components/GreenTarget/GTInvoiceLinesEditor";
import GTReceiptJoinPanel, {
  type GTReceiptJoinConfirmation,
  type GTReceiptJoinLookupState,
  useGTReceiptJoinConfirmation,
  useGTReceiptJoinLookup,
} from "../../../components/GreenTarget/GTReceiptJoinPanel";
import { formatLocationDisplay } from "../../../utils/greenTarget/formatLocationDisplay";
import {
  getRentalBillingStatus,
  RentalBillingStatus,
} from "../../../utils/greenTarget/rentalBillingStatus";
import { toCents } from "../../../utils/moneyUtils";
import type {
  GreenTargetInvoiceLineInput,
  GreenTargetPayment,
  GreenTargetPaymentMutationResponse,
  GreenTargetReceiptJoinCandidate,
  GreenTargetRevenueSplit,
} from "../../../types/greenTargetTypes";

// Default line description follows the revenue account selection (mirrors the
// full invoice form and the server-side default).
const gtInvoiceLineWording = (
  accountCode: string | null | undefined
): string =>
  accountCode === "TGA"
    ? "Rental Tong (A)"
    : accountCode === "TGB"
    ? "Rental Tong (B)"
    : "Waste Management";

interface PickupDestination {
  id: number;
  code: string;
  name: string;
  is_default: boolean;
}

interface RentalDetails {
  rental_id: number;
  customer_id: number;
  customer_name: string;
  customer_phone_number: string | null;
  location_id: number | null;
  location_site: string | null;
  location_address: string | null;
  // The dumpster and both dates are optional Green Target metadata.
  tong_no: string | null;
  dumpster_status: string | null;
  driver: string;
  date_placed: string | null;
  date_picked: string | null;
  remarks: string | null;
  pickup_destination: string | null;
  pickup_destination_name: string | null;
}

interface RentalPayment {
  payment_id: number;
  invoice_id: number;
  receipt_id: number | null;
  posting_date: string | null;
  payment_date: string;
  amount_paid: number | string;
  payment_method: string;
  payment_reference: string | null;
  internal_reference: string | null;
  status: string | null;
  cancellation_date: string | null;
  cancellation_reason: string | null;
}

interface LinkedInvoice {
  invoice_id: number;
  invoice_number: string;
  status: string | null;
  date_issued: string;
  total_amount: number | string;
  balance_due: number | string;
  payments: RentalPayment[];
}

interface RentalDetailsResponse {
  rental: RentalDetails;
  invoices: LinkedInvoice[];
}

interface CustomerRentalOption {
  rental_id: number;
  tong_no: string | null;
  date_placed: string | null;
  date_picked: string | null;
  location_site: string | null;
  location_address: string | null;
  invoice_info?: {
    invoice_id: number;
    invoice_number?: string;
    status: string;
    amount?: number;
  } | null;
}

const toLocalDateString = (value: string): string => {
  if (!value) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return format(date, "yyyy-MM-dd");
};

const formatDisplayDate = (value: string | null): string => {
  if (!value) return "-";
  const dateStr = toLocalDateString(value);
  if (!dateStr) return "-";
  const [year, month, day] = dateStr.split("-");
  return `${day}/${month}/${year}`;
};

const formatMoney = (value: number | string): string =>
  `RM ${Number(value).toFixed(2)}`;

const paymentMethodLabels: Record<string, string> = {
  cash: "Cash",
  cheque: "Cheque",
  bank_transfer: "Bank Transfer",
  online: "Online",
};

const getInvoiceStatusBadge = (
  status: string | null
): { label: string; classes: string } => {
  switch (status) {
    case "paid":
      return {
        label: "Paid",
        classes:
          "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400",
      };
    case "overdue":
      return {
        label: "Overdue",
        classes:
          "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400",
      };
    case "cancelled":
      return {
        label: "Cancelled",
        classes:
          "bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-400",
      };
    default:
      return {
        label: "Active",
        classes: "bg-sky-100 dark:bg-sky-900/40 text-sky-700 dark:text-sky-400",
      };
  }
};

const getPaymentStatusBadge = (
  status: string | null
): { label: string; classes: string } | null => {
  if (status === "cancelled") {
    return {
      label: "Cancelled",
      classes:
        "bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-400",
    };
  }
  if (status === "pending") {
    return {
      label: "Pending",
      classes:
        "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400",
    };
  }
  return null;
};

const RentalDetailsPage: React.FC = () => {
  const navigate = useNavigate();
  const routerLocation = useLocation();
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation("greentarget");

  const [rental, setRental] = useState<RentalDetails | null>(null);
  const [selectedReceiptId, setSelectedReceiptId] = useState<number | null>(
    null
  );
  const [invoices, setInvoices] = useState<LinkedInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Pickup modal state
  const [isPickupDialogOpen, setIsPickupDialogOpen] = useState(false);
  const [pickupDestinations, setPickupDestinations] = useState<
    PickupDestination[]
  >([]);
  const [selectedDestination, setSelectedDestination] = useState<string>("");
  const [isPickingUp, setIsPickingUp] = useState(false);

  // Delete state
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Create Invoice modal state
  const [isInvoiceModalOpen, setIsInvoiceModalOpen] = useState(false);
  const [customerRentals, setCustomerRentals] = useState<
    CustomerRentalOption[]
  >([]);
  const [isLoadingCustomerRentals, setIsLoadingCustomerRentals] =
    useState(false);
  const [selectedRentalIds, setSelectedRentalIds] = useState<number[]>([]);
  const [invoiceNumber, setInvoiceNumber] = useState<string>("");
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
  const [invoiceDeliveryOrder, setInvoiceDeliveryOrder] = useState<string>("");
  const [invoiceAmount, setInvoiceAmount] = useState<string>("200.00");
  // Editable invoice lines; the amount is derived from their total.
  const [invoiceLines, setInvoiceLines] = useState<GTInvoiceLineDraft[]>([
    createGTInvoiceLineDraft({
      description: "Rental Tong (A)",
      quantity: 1,
      unit_price: 200,
    }),
  ]);
  // The modal re-prefills the lines until the user keys anything into them.
  const linesManuallyEditedRef = useRef(false);
  // Advance payment: received date earlier than the invoice date needs an
  // explicit confirmation; the ref carries the confirmation into the retry.
  const [advancePaymentPrompt, setAdvancePaymentPrompt] = useState<{
    paymentDate: string;
  } | null>(null);
  const advancePaymentConfirmedRef = useRef(false);
  const [invoiceRevenueSplits, setInvoiceRevenueSplits] = useState<
    GreenTargetRevenueSplit[]
  >([
    {
      line_number: 1,
      account_code: GT_DEFAULT_REVENUE_ACCOUNT,
      amount: 200,
    },
  ]);
  const [invoiceDebtorAccount, setInvoiceDebtorAccount] = useState<string>("");
  const accountFieldsRef = useRef<GTInvoiceAccountFieldsHandle | null>(null);
  // The customer's saved default, loaded when the modal opens. Null means the
  // customer has never been given one, which is the only case that needs a
  // human decision here.
  const [customerDefaultDebtorAccount, setCustomerDefaultDebtorAccount] =
    useState<string | null>(null);
  const [isLoadingCustomerDefault, setIsLoadingCustomerDefault] =
    useState<boolean>(false);
  const [dateIssued, setDateIssued] = useState<string>(
    format(new Date(), "yyyy-MM-dd")
  );
  const [isCreatingInvoice, setIsCreatingInvoice] = useState(false);
  const [recordPayment, setRecordPayment] = useState(false);
  const [paymentDate, setPaymentDate] = useState<string>(
    format(new Date(), "yyyy-MM-dd")
  );
  const [paymentMethod, setPaymentMethod] = useState<
    GreenTargetPayment["payment_method"]
  >("cash");
  const [paymentInternalReference, setPaymentInternalReference] =
    useState<string>("");
  const [paymentReference, setPaymentReference] = useState<string>("");
  const paymentReceiptLookup: GTReceiptJoinLookupState =
    useGTReceiptJoinLookup(
      paymentInternalReference,
      isInvoiceModalOpen && recordPayment
    );
  const paymentReceiptJoin: GTReceiptJoinConfirmation =
    useGTReceiptJoinConfirmation(paymentReceiptLookup);
  const confirmedPaymentReceipt: GreenTargetReceiptJoinCandidate | null =
    paymentReceiptJoin.confirmedReceipt;
  const effectivePaymentMethod: GreenTargetPayment["payment_method"] =
    confirmedPaymentReceipt?.payment_method || paymentMethod;

  const fetchDetails = useCallback(async () => {
    if (!id) return;
    try {
      setLoading(true);
      const data: RentalDetailsResponse = await greenTargetApi.getRentalDetails(
        id
      );
      setRental(data.rental);
      setInvoices(data.invoices || []);
      setError(null);
    } catch (err) {
      console.error("Error fetching rental details:", err);
      setError(t("Failed to fetch rental details. Please try again."));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchDetails();
  }, [fetchDetails]);

  useEffect(() => {
    const fetchPickupDestinations = async () => {
      try {
        const data = await greenTargetApi.getPickupDestinations();
        setPickupDestinations(data);
      } catch (error) {
        console.error("Error fetching pickup destinations:", error);
      }
    };
    fetchPickupDestinations();
  }, []);

  const hasActiveInvoice: boolean = invoices.some(
    (invoice) => invoice.status !== "cancelled"
  );

  // Still gates "Mark as Picked Up"; the headline badge reports billing status.
  const isActive: boolean = rental
    ? !rental.date_picked ||
      toLocalDateString(rental.date_picked) > format(new Date(), "yyyy-MM-dd")
    : false;

  // The rental dates are optional now, so the rental's headline status reports
  // where it stands in the invoice -> payment chain. The best (non-cancelled)
  // linked invoice drives it, matching the rental list's card badge.
  const billingInvoice: LinkedInvoice | undefined = invoices.find(
    (invoice) => invoice.status !== "cancelled"
  );
  const billingStatus: RentalBillingStatus = getRentalBillingStatus(
    billingInvoice
      ? {
          status: billingInvoice.status,
          amount: billingInvoice.total_amount,
          balance_due: billingInvoice.balance_due,
        }
      : null
  );

  // --- Create Invoice modal ---

  const openInvoiceModal = useCallback(async () => {
    if (!rental) return;
    setIsInvoiceModalOpen(true);
    setSelectedRentalIds([rental.rental_id]);
    setInvoiceNumber("");
    setInvoiceNumberValidation({
      isValidating: false,
      isValid: true,
      isDuplicate: false,
      message: "",
    });
    setInvoiceDeliveryOrder("");
    setInvoiceAmount("200.00");
    setInvoiceLines([
      createGTInvoiceLineDraft({
        description: gtInvoiceLineWording(GT_DEFAULT_REVENUE_ACCOUNT),
        quantity: 1,
        unit_price: 200,
      }),
    ]);
    linesManuallyEditedRef.current = false;
    setInvoiceRevenueSplits([
      {
        line_number: 1,
        account_code: GT_DEFAULT_REVENUE_ACCOUNT,
        amount: 200,
      },
    ]);
    setInvoiceDebtorAccount("");
    setCustomerDefaultDebtorAccount(null);
    setDateIssued(format(new Date(), "yyyy-MM-dd"));
    setRecordPayment(false);
    setPaymentDate(format(new Date(), "yyyy-MM-dd"));
    setPaymentMethod("cash");
    setPaymentInternalReference("");
    setPaymentReference("");
    setIsLoadingCustomerRentals(true);
    // Preselect the customer's saved logical debtor identity when available;
    // the shared accounting block still displays where it posts in the GL.
    setIsLoadingCustomerDefault(true);
    void greenTargetApi
      .getCustomer(rental.customer_id)
      .then((customer: { debtor_account_code?: string | null }): void => {
        const defaultCode: string = customer?.debtor_account_code || "";
        setCustomerDefaultDebtorAccount(defaultCode || null);
        setInvoiceDebtorAccount(defaultCode);
      })
      .catch((customerError: unknown): void => {
        console.error("Error loading the customer's debtor account:", customerError);
      })
      .finally((): void => setIsLoadingCustomerDefault(false));
    try {
      const data: CustomerRentalOption[] = await greenTargetApi.getRentals({
        customer_id: rental.customer_id,
      });
      // Same availability rule as the invoice form: no invoice link, or only
      // cancelled links. The current rental is always listed (pinned).
      const available = data.filter(
        (r) => !r.invoice_info || r.invoice_info.status === "cancelled"
      );
      if (!available.some((r) => r.rental_id === rental.rental_id)) {
        const current = data.find((r) => r.rental_id === rental.rental_id);
        if (current) available.unshift(current);
      }
      setCustomerRentals(available);
    } catch (err) {
      console.error("Error fetching customer rentals:", err);
      toast.error(t("Failed to load this customer's rentals."));
      setCustomerRentals([]);
    } finally {
      setIsLoadingCustomerRentals(false);
    }
  }, [rental]);

  // Open the modal directly when navigated here with openInvoiceModal state
  // (from the "No Invoice" chip on the rental list).
  useEffect(() => {
    const state = routerLocation.state as { openInvoiceModal?: boolean } | null;
    if (rental && state?.openInvoiceModal && !hasActiveInvoice) {
      openInvoiceModal();
      // Clear the state so the modal doesn't reopen on a later render.
      navigate(routerLocation.pathname, { replace: true, state: {} });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rental, routerLocation.state]);

  // The revenue account behind the current splits (null when mixed) decides
  // the prefilled line description.
  const currentRevenueAccount: string | null = (() => {
    const codes = new Set(
      invoiceRevenueSplits.map(
        (split: GreenTargetRevenueSplit): string => split.account_code
      )
    );
    return codes.size === 1 ? Array.from(codes)[0] : null;
  })();

  // Prefill one line from the revenue account wording and the selected rental
  // count until the user edits the lines by hand.
  useEffect(() => {
    if (!isInvoiceModalOpen || linesManuallyEditedRef.current) return;
    setInvoiceLines([
      createGTInvoiceLineDraft({
        description: gtInvoiceLineWording(currentRevenueAccount),
        quantity: selectedRentalIds.length,
        unit_price: 200,
      }),
    ]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isInvoiceModalOpen, currentRevenueAccount, selectedRentalIds.length]);

  // The invoice amount is derived from the line items, never keyed directly.
  useEffect(() => {
    if (!isInvoiceModalOpen) return;
    setInvoiceAmount(gtInvoiceLinesTotal(invoiceLines).toFixed(2));
  }, [invoiceLines, isInvoiceModalOpen]);

  const handleInvoiceLinesChange = (nextLines: GTInvoiceLineDraft[]): void => {
    linesManuallyEditedRef.current = true;
    setInvoiceLines(nextLines);
  };

  // Debounced duplicate check, same rule as the full invoice form: a blank
  // number is valid because the server then generates one.
  useEffect(() => {
    if (!isInvoiceModalOpen) return;
    const trimmedNumber: string = invoiceNumber.trim();
    if (!trimmedNumber) {
      setInvoiceNumberValidation({
        isValidating: false,
        isValid: true,
        isDuplicate: false,
        message: "",
      });
      return;
    }

    setInvoiceNumberValidation((previous) => ({
      ...previous,
      isValidating: true,
    }));

    const timer = setTimeout((): void => {
      void greenTargetApi
        .checkInvoiceNumber(trimmedNumber)
        .then(
          (result: {
            available: boolean;
            exists: boolean;
            existing_id?: number | null;
          }): void => {
            setInvoiceNumberValidation({
              isValidating: false,
              isValid: result.available,
              isDuplicate: result.exists,
              message: result.exists
                ? result.existing_id
                  ? t("Invoice number already exists (ID: {{id}})", {
                      id: result.existing_id,
                    })
                  : t("Invoice number already exists")
                : "",
            });
          }
        )
        .catch((validationError: unknown): void => {
          console.error("Error validating invoice number:", validationError);
          setInvoiceNumberValidation({
            isValidating: false,
            isValid: false,
            isDuplicate: false,
            message: t("Error validating invoice number"),
          });
        });
    }, 500);

    return () => clearTimeout(timer);
  }, [invoiceNumber, isInvoiceModalOpen]);

  const toggleRentalSelection = (rentalId: number): void => {
    if (rentalId === rental?.rental_id) return; // current rental stays pinned
    setSelectedRentalIds((prev) =>
      prev.includes(rentalId)
        ? prev.filter((selectedId) => selectedId !== rentalId)
        : [...prev, rentalId]
    );
  };

  const handlePaymentInternalReferenceChange = (
    event: React.ChangeEvent<HTMLInputElement>
  ): void => {
    setPaymentInternalReference(event.target.value);
  };

  const handleCreateInvoice = async (): Promise<void> => {
    if (!rental) return;
    const amount = parseFloat(invoiceAmount);
    if (selectedRentalIds.length === 0) {
      toast.error(t("Select at least one rental."));
      return;
    }
    if (isNaN(amount) || amount <= 0) {
      toast.error(t("Please enter a valid amount."));
      return;
    }
    if (!dateIssued) {
      toast.error(t("Date issued is required."));
      return;
    }
    if (invoiceNumber.trim() && invoiceNumberValidation.isDuplicate) {
      toast.error(t("Invoice number already exists. Please choose a different number."));
      return;
    }
    if (invoiceNumber.trim() && invoiceNumberValidation.isValidating) {
      toast.error(t("Please wait while the invoice number is checked."));
      return;
    }
    const hasInvalidRevenueSplit: boolean =
      invoiceRevenueSplits.length === 0 ||
      invoiceRevenueSplits.some(
        (split: GreenTargetRevenueSplit): boolean =>
          !Number.isFinite(Number(split.amount)) || toCents(Number(split.amount)) <= 0
      );
    const allocatedRevenueCents: number = invoiceRevenueSplits.reduce(
      (sum: number, split: GreenTargetRevenueSplit): number =>
        sum + toCents(Number(split.amount)),
      0
    );
    if (hasInvalidRevenueSplit) {
      toast.error(
        t("Enter an amount greater than RM 0.00 for every revenue line")
      );
      return;
    }
    if (allocatedRevenueCents !== toCents(amount)) {
      toast.error(t("Revenue allocation must equal the invoice total"));
      return;
    }
    const hasInvalidLine: boolean =
      invoiceLines.length === 0 ||
      invoiceLines.some(
        (line: GTInvoiceLineDraft): boolean =>
          !line.description.trim() ||
          !Number.isFinite(Number(line.quantity)) ||
          Number(line.quantity) <= 0 ||
          !Number.isFinite(Number(line.unit_price)) ||
          Number(line.unit_price) < 0
      );
    if (hasInvalidLine) {
      toast.error(
        t(
          "Every line item needs a description, a quantity above 0 and a unit price of 0 or more"
        )
      );
      return;
    }
    if (recordPayment && !paymentInternalReference.trim()) {
      toast.error(t("Green Target Reference No. is required to record a payment."));
      return;
    }
    if (recordPayment && paymentReceiptLookup.isLooking) {
      toast.error(t("Please wait while the reference number is checked."));
      return;
    }
    if (recordPayment && paymentReceiptLookup.receipt) {
      if (!paymentReceiptLookup.joinable) {
        toast.error(t("This reference belongs to a receipt that cannot accept this payment."));
        return;
      }
      if (!confirmedPaymentReceipt) {
        toast.error(t("Confirm that this payment should join the existing receipt."));
        return;
      }
    }
    if (recordPayment && confirmedPaymentReceipt) {
      const inheritedReceivedDate: string = toLocalDateString(
        confirmedPaymentReceipt.received_date
      );
      if (!inheritedReceivedDate) {
        toast.error(t("The existing receipt has no received date."));
        return;
      }
      if (
        inheritedReceivedDate < dateIssued &&
        !advancePaymentConfirmedRef.current
      ) {
        // Advance payment: confirm before the server accepts the earlier date.
        setAdvancePaymentPrompt({ paymentDate: inheritedReceivedDate });
        return;
      }
    } else if (recordPayment) {
      if (!paymentDate) {
        toast.error(t("Payment received date is required."));
        return;
      }
      if (paymentDate < dateIssued && !advancePaymentConfirmedRef.current) {
        // Advance payment: confirm before the server accepts the earlier date.
        setAdvancePaymentPrompt({ paymentDate });
        return;
      }
    }

    setIsCreatingInvoice(true);
    try {
      // A staged CD/SD identity is only written once the invoice is actually
      // being saved, so an abandoned modal never leaves an unused debtor name.
      let debtorAccountCode: string;
      try {
        debtorAccountCode = accountFieldsRef.current
          ? await accountFieldsRef.current.ensureDebtorIdentity()
          : invoiceDebtorAccount.trim();
      } catch (identityError: unknown) {
        toast.error(
          identityError instanceof Error
            ? identityError.message
            : t("Failed to prepare the debtor identity.")
        );
        return;
      }

      const response = await greenTargetApi.createInvoice({
        type: "regular",
        invoice_number: invoiceNumber.trim() || undefined,
        delivery_order: invoiceDeliveryOrder.trim() || undefined,
        customer_id: rental.customer_id,
        rental_ids: selectedRentalIds,
        amount_before_tax: amount,
        tax_amount: 0,
        total_amount: amount,
        date_issued: dateIssued,
        debtor_account_code: debtorAccountCode,
        revenue_splits: invoiceRevenueSplits,
        lines: invoiceLines.map(
          (line: GTInvoiceLineDraft): GreenTargetInvoiceLineInput => ({
            description: line.description.trim(),
            quantity: Number(line.quantity) || 0,
            unit_price: Number(line.unit_price) || 0,
          })
        ),
      });
      toast.success(
        t("Invoice {{number}} created", {
          number: response.invoice.invoice_number,
        })
      );
      if (recordPayment) {
        try {
          const paymentResponse: GreenTargetPaymentMutationResponse =
            await greenTargetApi.createPayment({
              invoice_id: response.invoice.invoice_id,
              payment_date: confirmedPaymentReceipt
                ? toLocalDateString(confirmedPaymentReceipt.received_date)
                : paymentDate,
              amount_paid: amount,
              payment_method: effectivePaymentMethod,
              payment_reference: confirmedPaymentReceipt
                ? confirmedPaymentReceipt.payment_reference
                : paymentMethod === "cheque"
                ? paymentReference.trim() || null
                : null,
              internal_reference:
                confirmedPaymentReceipt?.display_reference ||
                paymentInternalReference.trim(),
              ...(confirmedPaymentReceipt
                ? { receipt_id: confirmedPaymentReceipt.receipt_id }
                : {}),
              ...(advancePaymentConfirmedRef.current
                ? { allow_advance_payment: true }
                : {}),
            });
          toast.success(
            paymentResponse.receipt?.joined
              ? t("Payment added to receipt {{reference}}", {
                  reference: paymentResponse.receipt.display_reference,
                })
              : t("Payment recorded")
          );
        } catch (paymentError: any) {
          console.error("Error recording payment:", paymentError);
          const paymentMessage =
            paymentError?.response?.data?.error ||
            paymentError?.response?.data?.message ||
            t("failed to record the payment.");
          toast.error(
            t("Invoice created, but {{message}}", {
              message: paymentMessage,
            })
          );
        }
      }
      navigate(`/greentarget/invoices/${response.invoice.invoice_id}`);
    } catch (error: any) {
      console.error("Error creating invoice:", error);
      const message =
        error?.response?.data?.error ||
        error?.response?.data?.message ||
        t("Failed to create invoice.");
      toast.error(message);
    } finally {
      setIsCreatingInvoice(false);
      // One-shot: a fresh advance needs a fresh confirmation.
      advancePaymentConfirmedRef.current = false;
    }
  };

  // --- Pickup ---

  const openPickupDialog = (): void => {
    const defaultDest = pickupDestinations.find((d) => d.is_default);
    setSelectedDestination(
      rental?.pickup_destination ||
        defaultDest?.code ||
        pickupDestinations[0]?.code ||
        ""
    );
    setIsPickupDialogOpen(true);
  };

  const confirmPickupRental = async (): Promise<void> => {
    if (!rental) return;

    if (!selectedDestination) {
      toast.error(t("Please select a pickup destination"));
      return;
    }

    const today = format(new Date(), "yyyy-MM-dd");
    // A rental with no placement date has no lower bound to check against.
    if (rental.date_placed && toLocalDateString(rental.date_placed) > today) {
      toast.error(t("Pickup date cannot be earlier than placement date"));
      setIsPickupDialogOpen(false);
      return;
    }

    setIsPickingUp(true);
    try {
      // remarks is passed through because the update endpoint overwrites it
      // with NULL when omitted.
      await greenTargetApi.updateRental(rental.rental_id, {
        date_picked: today,
        pickup_destination: selectedDestination,
        remarks: rental.remarks,
      });
      toast.success(t("Rental marked as picked up"));
      setIsPickupDialogOpen(false);
      fetchDetails();
    } catch (error) {
      console.error("Error updating rental:", error);
      toast.error(t("Failed to mark rental as picked up"));
    } finally {
      setIsPickingUp(false);
    }
  };

  // --- Delete ---

  const confirmDeleteRental = async (): Promise<void> => {
    if (!rental) return;

    setIsDeleting(true);
    try {
      await greenTargetApi.deleteRental(rental.rental_id);
      toast.success(t("Rental deleted successfully"));
      navigate("/greentarget/rentals");
    } catch (error: any) {
      console.error("Error deleting rental:", error);
      const message =
        error?.response?.data?.message || t("Failed to delete rental");
      toast.error(message);
      setIsDeleteDialogOpen(false);
    } finally {
      setIsDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="mt-40 w-full flex items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  if (error || !rental) {
    return (
      <div className="space-y-4">
        <BackButton fallbackPath="/greentarget/rentals" />
        <div className="text-center py-8">
          <p className="text-default-500 dark:text-gray-400">
            {error || t("Rental not found.")}
          </p>
        </div>
      </div>
    );
  }

  const locationLabel = formatLocationDisplay(
    rental.location_site,
    rental.location_address
  );

  return (
    <div className="space-y-4 w-full">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <BackButton fallbackPath="/greentarget/rentals" />
          <div className="h-6 w-px bg-default-300 dark:bg-default-700"></div>
          <h1 className="text-2xl font-bold text-default-700 dark:text-gray-200">
            {t("Rental #{{id}}", { id: rental.rental_id })}
          </h1>
          <span
            className={`text-sm px-2.5 py-0.5 rounded-full font-medium ${billingStatus.badgeClassName}`}
          >
            {t(billingStatus.label)}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {/* Only a rental that was actually placed on a date can be picked up. */}
          {rental.date_placed && isActive && (
            <Button
              onClick={openPickupDialog}
              icon={IconTruck}
              variant="outline"
              color="amber"
            >
              {t("Mark as Picked Up")}
            </Button>
          )}
          <Button
            onClick={() => navigate(`/greentarget/rentals/${rental.rental_id}/edit`)}
            icon={IconPencil}
            variant="outline"
            color="sky"
          >
            {t("Edit")}
          </Button>
          <Button
            onClick={() => setIsDeleteDialogOpen(true)}
            icon={IconTrash}
            variant="outline"
            color="rose"
          >
            {t("Delete")}
          </Button>
        </div>
      </div>

      {/* Rental info card */}
      <div className="bg-white dark:bg-gray-800 border border-default-200 dark:border-gray-700 rounded-lg shadow-sm p-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-default-400 dark:text-gray-500 mb-0.5">
              {t("Customer")}
            </p>
            <button
              onClick={() =>
                navigate(`/greentarget/customers/${rental.customer_id}`)
              }
              className="font-medium text-sky-600 dark:text-sky-400 hover:underline"
            >
              {rental.customer_name}
            </button>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-default-400 dark:text-gray-500 mb-0.5">
              {t("Location")}
            </p>
            <p className="font-medium text-default-800 dark:text-gray-200 flex items-center gap-1.5">
              {locationLabel ? (
                <>
                  <IconMapPin size={15} className="flex-shrink-0 text-default-400 dark:text-gray-500" />
                  {locationLabel}
                </>
              ) : (
                "-"
              )}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-default-400 dark:text-gray-500 mb-0.5">
              {t("Tong No")}
            </p>
            <p className="font-medium text-default-800 dark:text-gray-200">
              {rental.tong_no || "-"}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-default-400 dark:text-gray-500 mb-0.5">
              {t("Driver")}
            </p>
            <p className="font-medium text-default-800 dark:text-gray-200">
              {rental.driver}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-default-400 dark:text-gray-500 mb-0.5">
              {t("Date Placed")}
            </p>
            <p className="font-medium text-default-800 dark:text-gray-200">
              {formatDisplayDate(rental.date_placed)}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-default-400 dark:text-gray-500 mb-0.5">
              {t("Date Picked")}
            </p>
            <p className="font-medium text-default-800 dark:text-gray-200">
              {rental.date_picked
                ? formatDisplayDate(rental.date_picked)
                : t("Ongoing")}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-default-400 dark:text-gray-500 mb-0.5">
              {t("Pickup Destination")}
            </p>
            <p className="font-medium text-default-800 dark:text-gray-200">
              {rental.pickup_destination_name || rental.pickup_destination || "-"}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-default-400 dark:text-gray-500 mb-0.5">
              {t("Remarks")}
            </p>
            <p className="font-medium text-default-800 dark:text-gray-200">
              {rental.remarks || "-"}
            </p>
          </div>
        </div>
      </div>

      {/* Invoices & Payments */}
      <div className="bg-white dark:bg-gray-800 border border-default-200 dark:border-gray-700 rounded-lg shadow-sm p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-default-800 dark:text-gray-100">
            {t("Invoices & Payments")}
          </h2>
          <Button
            onClick={openInvoiceModal}
            icon={IconFileInvoice}
            variant="filled"
            color="sky"
            disabled={hasActiveInvoice}
            title={
              hasActiveInvoice
                ? t("This rental is already linked to an invoice")
                : t("Create an invoice for this rental")
            }
          >
            {t("Create Invoice")}
          </Button>
        </div>

        {invoices.length === 0 ? (
          <p className="text-sm text-default-500 dark:text-gray-400">
            {t("No invoices linked to this rental yet.")}
          </p>
        ) : (
          <div className="space-y-4">
            {invoices.map((invoice) => {
              const badge = getInvoiceStatusBadge(invoice.status);
              const isCancelled = invoice.status === "cancelled";
              return (
                <div
                  key={invoice.invoice_id}
                  className={`border border-default-200 dark:border-gray-700 rounded-lg p-4 ${
                    isCancelled ? "opacity-60" : ""
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() =>
                          navigate(`/greentarget/invoices/${invoice.invoice_id}`)
                        }
                        className="font-semibold text-sky-600 dark:text-sky-400 hover:underline"
                      >
                        {invoice.invoice_number}
                      </button>
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full font-medium ${badge.classes}`}
                      >
                        {t(badge.label)}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 text-sm">
                      <span className="text-default-500 dark:text-gray-400">
                        {formatDisplayDate(invoice.date_issued)}
                      </span>
                      <span className="font-semibold text-default-800 dark:text-gray-200">
                        {formatMoney(invoice.total_amount)}
                      </span>
                    </div>
                  </div>

                  {invoice.payments.length > 0 && (
                    <div className="mt-3 border-t border-default-100 dark:border-gray-700 pt-2">
                      <table className="w-full text-sm">
                        <tbody>
                          {invoice.payments.map((payment) => {
                            const paymentBadge = getPaymentStatusBadge(
                              payment.status
                            );
                            const isPaymentCancelled =
                              payment.status === "cancelled";
                            return (
                              <tr
                                key={payment.payment_id}
                                className={
                                  isPaymentCancelled ? "opacity-60" : ""
                                }
                              >
                                <td className="py-1.5 pr-3 text-default-600 dark:text-gray-400 whitespace-nowrap">
                                  {formatDisplayDate(payment.payment_date)}
                                </td>
                                <td className="py-1.5 pr-3 text-default-800 dark:text-gray-200">
                                  {t(
                                    paymentMethodLabels[
                                      payment.payment_method
                                    ] || payment.payment_method
                                  )}
                                </td>
                                <td className="py-1.5 pr-3 text-default-600 dark:text-gray-400">
                                  {payment.receipt_id ? (
                                    <button
                                      type="button"
                                      onClick={(): void =>
                                        setSelectedReceiptId(
                                          payment.receipt_id
                                        )
                                      }
                                      className="text-sky-600 hover:underline dark:text-sky-400"
                                      title={t(
                                        "View receipt {{reference}} and every invoice it settles",
                                        {
                                          reference:
                                            payment.internal_reference || "",
                                        }
                                      )}
                                    >
                                      {payment.internal_reference ||
                                        t("View receipt")}
                                    </button>
                                  ) : (
                                    payment.internal_reference || "-"
                                  )}
                                </td>
                                <td className="py-1.5 pr-3 text-right font-medium text-default-800 dark:text-gray-200">
                                  {formatMoney(payment.amount_paid)}
                                </td>
                                <td className="py-1.5 text-right">
                                  {paymentBadge && (
                                    <span
                                      className={`text-xs px-2 py-0.5 rounded-full font-medium ${paymentBadge.classes}`}
                                    >
                                      {t(paymentBadge.label)}
                                    </span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* One receipt can settle several invoices, so the reference opens the
          whole receipt here rather than navigating away from this rental. */}
      <GreenTargetReceiptDetailsDialog
        receiptId={selectedReceiptId}
        isOpen={selectedReceiptId !== null}
        onClose={(): void => setSelectedReceiptId(null)}
        onChanged={fetchDetails}
      />

      {/* Delete confirmation */}
      <ConfirmationDialog
        isOpen={isDeleteDialogOpen}
        onClose={() => setIsDeleteDialogOpen(false)}
        onConfirm={confirmDeleteRental}
        title={t("Delete Rental")}
        message={t(
          "Are you sure you want to delete rental #{{id}} for {{customer}}? This action cannot be undone.",
          { id: rental.rental_id, customer: rental.customer_name }
        )}
        confirmButtonText={t("Delete")}
        variant="danger"
        isConfirming={isDeleting}
      />

      {/* Advance payment confirmation */}
      <ConfirmationDialog
        isOpen={advancePaymentPrompt !== null}
        onClose={(): void => setAdvancePaymentPrompt(null)}
        onConfirm={(): void => {
          advancePaymentConfirmedRef.current = true;
          setAdvancePaymentPrompt(null);
          void handleCreateInvoice();
        }}
        title={t("Record Advance Payment?")}
        message={t(
          "The payment received date ({{received}}) is before the invoice date ({{issued}}). Record this as an advance payment?",
          {
            received: advancePaymentPrompt?.paymentDate ?? "",
            issued: dateIssued,
          }
        )}
        confirmButtonText={t("Record Payment")}
        variant="default"
      />

      {/* Pickup Modal */}
      <Transition appear show={isPickupDialogOpen} as={Fragment}>
        <Dialog
          as="div"
          className="relative z-50"
          onClose={() => setIsPickupDialogOpen(false)}
        >
          <Transition.Child
            as={Fragment}
            enter="ease-out duration-300"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="ease-in duration-200"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <div className="fixed inset-0 bg-black/25 dark:bg-black/50" />
          </Transition.Child>

          <div className="fixed inset-0 overflow-y-auto">
            <div className="flex min-h-full items-center justify-center p-4">
              <Transition.Child
                as={Fragment}
                enter="ease-out duration-300"
                enterFrom="opacity-0 scale-95"
                enterTo="opacity-100 scale-100"
                leave="ease-in duration-200"
                leaveFrom="opacity-100 scale-100"
                leaveTo="opacity-0 scale-95"
              >
                <Dialog.Panel className="w-full max-w-md transform rounded-lg bg-white dark:bg-gray-800 p-6 shadow-xl transition-all">
                  <div className="flex items-center justify-between mb-4">
                    <Dialog.Title className="text-lg font-semibold text-default-900 dark:text-gray-100">
                      {t("Mark Rental as Picked Up")}
                    </Dialog.Title>
                    <button
                      onClick={() => setIsPickupDialogOpen(false)}
                      className="text-default-400 hover:text-default-600 dark:hover:text-gray-300"
                    >
                      <IconX size={20} />
                    </button>
                  </div>

                  <p className="text-sm text-default-600 dark:text-gray-400 mb-4">
                    {t("Mark the rental for {{customer}} as picked up today.", {
                      customer: rental.customer_name,
                    })}
                  </p>

                  <div className="mb-4">
                    <label className="block text-sm font-medium text-default-700 dark:text-gray-300 mb-2">
                      {t("Pickup Destination")}{" "}
                      <span className="text-rose-500">*</span>
                    </label>
                    <Listbox
                      value={selectedDestination}
                      onChange={setSelectedDestination}
                    >
                      <div className="relative">
                        <Listbox.Button className="relative w-full cursor-pointer rounded-lg bg-white dark:bg-gray-900/50 py-2.5 pl-3 pr-10 text-left border border-default-300 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-amber-500 dark:focus:ring-amber-400">
                          <span className="block truncate text-default-800 dark:text-gray-200">
                            {pickupDestinations.find(
                              (d) => d.code === selectedDestination
                            )?.name || t("Select destination...")}
                          </span>
                          <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
                            <IconChevronDown
                              size={18}
                              className="text-default-400 dark:text-gray-500"
                            />
                          </span>
                        </Listbox.Button>
                        <Transition
                          as={Fragment}
                          leave="transition ease-in duration-100"
                          leaveFrom="opacity-100"
                          leaveTo="opacity-0"
                        >
                          <Listbox.Options className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-lg bg-white dark:bg-gray-700 py-1 shadow-lg ring-1 ring-black/5 dark:ring-white/10 focus:outline-none">
                            {pickupDestinations.map((dest) => (
                              <Listbox.Option
                                key={dest.id}
                                value={dest.code}
                                className={({ active }) =>
                                  `relative cursor-pointer select-none py-2 pl-10 pr-4 ${
                                    active
                                      ? "bg-amber-100 dark:bg-amber-900/30 text-amber-900 dark:text-amber-100"
                                      : "text-default-800 dark:text-gray-200"
                                  }`
                                }
                              >
                                {({ selected }) => (
                                  <>
                                    <span
                                      className={`block truncate ${
                                        selected ? "font-medium" : "font-normal"
                                      }`}
                                    >
                                      {dest.name}
                                      {dest.is_default && (
                                        <span className="ml-2 text-xs text-default-400 dark:text-gray-500">
                                          {t("(Default)")}
                                        </span>
                                      )}
                                    </span>
                                    {selected && (
                                      <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-amber-600 dark:text-amber-400">
                                        <IconMapPin size={16} />
                                      </span>
                                    )}
                                  </>
                                )}
                              </Listbox.Option>
                            ))}
                          </Listbox.Options>
                        </Transition>
                      </div>
                    </Listbox>
                  </div>

                  <div className="flex justify-end gap-2 mt-6">
                    <Button
                      variant="outline"
                      onClick={() => setIsPickupDialogOpen(false)}
                      disabled={isPickingUp}
                    >
                      {t("Cancel")}
                    </Button>
                    <Button
                      variant="filled"
                      color="amber"
                      onClick={confirmPickupRental}
                      disabled={isPickingUp || !selectedDestination}
                    >
                      {isPickingUp
                        ? t("Processing...")
                        : t("Confirm Pickup")}
                    </Button>
                  </div>
                </Dialog.Panel>
              </Transition.Child>
            </div>
          </div>
        </Dialog>
      </Transition>

      {/* Create Invoice Modal */}
      <Transition appear show={isInvoiceModalOpen} as={Fragment}>
        <Dialog
          as="div"
          className="relative z-50"
          onClose={() => setIsInvoiceModalOpen(false)}
        >
          <Transition.Child
            as={Fragment}
            enter="ease-out duration-300"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="ease-in duration-200"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <div className="fixed inset-0 bg-black/25 dark:bg-black/50" />
          </Transition.Child>

          <div className="fixed inset-0 overflow-y-auto">
            <div className="flex min-h-full items-center justify-center p-4">
              <Transition.Child
                as={Fragment}
                enter="ease-out duration-300"
                enterFrom="opacity-0 scale-95"
                enterTo="opacity-100 scale-100"
                leave="ease-in duration-200"
                leaveFrom="opacity-100 scale-100"
                leaveTo="opacity-0 scale-95"
              >
                <Dialog.Panel className="w-full max-w-5xl transform rounded-lg bg-white dark:bg-gray-800 p-6 shadow-xl transition-all">
                  <div className="flex items-center justify-between mb-4">
                    <Dialog.Title className="text-lg font-semibold text-default-900 dark:text-gray-100">
                      {t("Create Invoice")}
                    </Dialog.Title>
                    <button
                      onClick={() => setIsInvoiceModalOpen(false)}
                      className="text-default-400 hover:text-default-600 dark:hover:text-gray-300"
                    >
                      <IconX size={20} />
                    </button>
                  </div>

                  <p className="text-sm text-default-600 dark:text-gray-400 mb-4">
                    Invoice for{" "}
                    <span className="font-medium text-default-800 dark:text-gray-200">
                      {rental.customer_name}
                    </span>
                    . Select the rentals to bill — only this customer's
                    un-invoiced rentals are listed.
                  </p>

                  {/* Rental selection */}
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-default-700 dark:text-gray-300 mb-2">
                      {t("Rentals")} <span className="text-rose-500">*</span>
                    </label>
                    <div className="border border-default-300 dark:border-gray-600 rounded-lg max-h-56 overflow-y-auto divide-y divide-default-100 dark:divide-gray-700">
                      {isLoadingCustomerRentals ? (
                        <div className="py-6 flex items-center justify-center">
                          <LoadingSpinner />
                        </div>
                      ) : customerRentals.length === 0 ? (
                        <p className="py-4 px-3 text-sm text-default-500 dark:text-gray-400">
                          {t("No un-invoiced rentals for this customer.")}
                        </p>
                      ) : (
                        customerRentals.map((option) => {
                          const isCurrent =
                            option.rental_id === rental.rental_id;
                          const isSelected = selectedRentalIds.includes(
                            option.rental_id
                          );
                          const optionLocation = formatLocationDisplay(
                            option.location_site,
                            option.location_address
                          );
                          return (
                            <button
                              key={option.rental_id}
                              type="button"
                              onClick={() =>
                                toggleRentalSelection(option.rental_id)
                              }
                              disabled={isCurrent}
                              className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors ${
                                isCurrent
                                  ? "bg-default-50 dark:bg-gray-900/40 cursor-default"
                                  : "hover:bg-default-50 dark:hover:bg-gray-700/50"
                              }`}
                            >
                              {isSelected ? (
                                <IconSquareCheckFilled
                                  className="text-blue-600 flex-shrink-0"
                                  width={20}
                                  height={20}
                                />
                              ) : (
                                <IconSquare
                                  className="text-default-400 flex-shrink-0"
                                  width={20}
                                  height={20}
                                />
                              )}
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-medium text-default-800 dark:text-gray-200 truncate">
                                  #{option.rental_id}
                                  {option.tong_no

                                      ? t("#{{id}} — Tong {{tong}}", {

                                          id: option.rental_id,

                                          tong: option.tong_no,

                                        })

                                      : `#${option.rental_id}`}
                                  {isCurrent && (
                                    <span className="ml-2 text-xs text-default-400 dark:text-gray-500">
                                      {t("(this rental)")}
                                    </span>
                                  )}
                                </p>
                                <p className="text-xs text-default-500 dark:text-gray-400 truncate">
                                  {option.date_placed
                                    ? t("Placed {{date}}", {
                                        date: formatDisplayDate(
                                          option.date_placed
                                        ),
                                      })
                                    : t("No placement date")}
                                  {optionLocation
                                    ? ` • ${optionLocation}`
                                    : ""}
                                </p>
                              </div>
                            </button>
                          );
                        })
                      )}
                    </div>
                  </div>

                  {/* Invoice Number + Delivery Order */}
                  <div className="mb-4">
                    <div className="flex items-end justify-between gap-3">
                      <label className="block text-sm font-medium text-default-700 dark:text-gray-300">
                        {t("Invoice Number")}
                        <span className="ml-1 text-xs font-normal text-default-500 dark:text-gray-400">
                          {t("(optional - auto-generated if empty)")}
                        </span>
                      </label>
                      <label
                        htmlFor="invoice_delivery_order"
                        className="shrink-0 text-xs font-medium text-default-500 dark:text-gray-400 pb-px"
                      >
                        {t("Delivery Order")}
                      </label>
                    </div>
                    <div className="mt-2 flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="relative">
                          <input
                            type="text"
                            value={invoiceNumber}
                            onChange={(e) => setInvoiceNumber(e.target.value)}
                            disabled={isCreatingInvoice}
                            placeholder={t(
                              "Enter custom invoice number or leave blank"
                            )}
                            className={`w-full px-3 py-2 border rounded-lg text-default-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-sky-500 dark:focus:ring-sky-400 ${
                              invoiceNumberValidation.isDuplicate
                                ? "border-rose-500 bg-rose-50 dark:bg-rose-900/30"
                                : invoiceNumberValidation.isValid
                                ? "border-default-300 dark:border-gray-600 bg-white dark:bg-gray-900/50"
                                : "border-amber-500 bg-amber-50 dark:bg-amber-900/30"
                            }`}
                          />
                          {invoiceNumberValidation.isValidating && (
                            <div className="absolute inset-y-0 right-0 flex items-center pr-3">
                              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-sky-500"></div>
                            </div>
                          )}
                        </div>
                        {invoiceNumberValidation.message && (
                          <p
                            className={`mt-1 text-xs ${
                              invoiceNumberValidation.isDuplicate
                                ? "text-rose-600"
                                : "text-amber-600"
                            }`}
                          >
                            {invoiceNumberValidation.message}
                          </p>
                        )}
                        {invoiceNumber.trim() &&
                          invoiceNumberValidation.isValid &&
                          !invoiceNumberValidation.isValidating && (
                            <p className="mt-1 text-xs text-green-600">
                              {t("Invoice number is available")}
                            </p>
                          )}
                      </div>
                      <div className="w-40 shrink-0">
                        <input
                          type="text"
                          id="invoice_delivery_order"
                          value={invoiceDeliveryOrder}
                          onChange={(e) => setInvoiceDeliveryOrder(e.target.value)}
                          disabled={isCreatingInvoice}
                          maxLength={100}
                          placeholder="DO-00123"
                          className="w-full px-2.5 py-2 border border-default-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900/50 text-default-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-sky-500 dark:focus:ring-sky-400"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Amount + Date */}
                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div>
                      <label className="block text-sm font-medium text-default-700 dark:text-gray-300 mb-2">
                        {t("Amount (RM)")}{" "}
                        <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={(Number(invoiceAmount) || 0).toFixed(2)}
                        className="w-full px-3 py-2 border border-default-300 dark:border-gray-600 rounded-lg bg-gray-100 dark:bg-gray-800 font-medium text-default-700 dark:text-gray-200 cursor-default"
                        readOnly
                        tabIndex={-1}
                      />
                      <p className="mt-1 text-xs text-default-400 dark:text-gray-500">
                        {t("Derived from the line items below.")}
                      </p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-default-700 dark:text-gray-300 mb-2">
                        {t("Date Issued")}{" "}
                        <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="date"
                        value={dateIssued}
                        onChange={(e) => setDateIssued(e.target.value)}
                        className="w-full px-3 py-2 border border-default-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900/50 text-default-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-sky-500 dark:focus:ring-sky-400"
                      />
                    </div>
                  </div>

                  {/* Line Items */}
                  <div className="mb-4">
                    <GTInvoiceLinesEditor
                      lines={invoiceLines}
                      onChange={handleInvoiceLinesChange}
                      disabled={isCreatingInvoice}
                    />
                  </div>

                  <div className="mb-4 rounded-lg border border-sky-200 bg-sky-50/60 p-3 dark:border-sky-900 dark:bg-sky-950/20">
                    <GTInvoiceAccountFields
                      ref={accountFieldsRef}
                      variant="plain"
                      customerId={rental.customer_id}
                      customerName={rental.customer_name}
                      customerDefaultCode={customerDefaultDebtorAccount}
                      debtorAccountCode={invoiceDebtorAccount}
                      onDebtorChange={setInvoiceDebtorAccount}
                      dateIssued={dateIssued}
                      invoiceTotal={Number(invoiceAmount) || 0}
                      revenueSplits={invoiceRevenueSplits}
                      onRevenueSplitsChange={setInvoiceRevenueSplits}
                      disabled={isCreatingInvoice}
                      customerDefaultLoading={isLoadingCustomerDefault}
                    />
                    <p className="mt-2 text-xs text-default-500 dark:text-gray-400">
                      {t("Creates the matching Green Target sales journal.")}
                    </p>
                  </div>

                  {/* Record Payment */}
                  <div className="mb-4">
                    <button
                      type="button"
                      onClick={(): void => {
                        setRecordPayment(
                          (current: boolean): boolean => !current
                        );
                      }}
                      className="flex items-center cursor-pointer group p-1"
                    >
                      {recordPayment ? (
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
                        {t("Record Payment")}
                      </span>
                    </button>
                  </div>

                  {recordPayment && (
                    <div className="mb-4 border border-default-200 dark:border-gray-700 rounded-lg p-4 space-y-4">
                      {!confirmedPaymentReceipt && paymentMethod === "cheque" && (
                        <p className="text-xs text-default-500 dark:text-gray-400">
                          {t(
                            "Cheque payments remain pending until they are confirmed."
                          )}
                        </p>
                      )}
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-default-700 dark:text-gray-300 mb-2">
                            {t("Date Received")}{" "}
                            <span className="text-rose-500">*</span>
                          </label>
                          <input
                            type="date"
                            value={
                              confirmedPaymentReceipt
                                ? toLocalDateString(
                                    confirmedPaymentReceipt.received_date
                                  )
                                : paymentDate
                            }
                            onChange={(e) => setPaymentDate(e.target.value)}
                            readOnly={Boolean(confirmedPaymentReceipt)}
                            className={`w-full rounded-lg border border-default-300 px-3 py-2 dark:border-gray-600 ${
                              confirmedPaymentReceipt
                                ? "bg-default-100 text-default-700 dark:bg-gray-900/70 dark:text-gray-300"
                                : "bg-white text-default-900 focus:outline-none focus:ring-2 focus:ring-sky-500 dark:bg-gray-900/50 dark:text-gray-100 dark:focus:ring-sky-400"
                            }`}
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-default-700 dark:text-gray-300 mb-2">
                            {t("Method")}{" "}
                            <span className="text-rose-500">*</span>
                          </label>
                          <Listbox
                            value={effectivePaymentMethod}
                            onChange={(
                              method: GreenTargetPayment["payment_method"]
                            ): void => {
                              setPaymentMethod(method);
                              if (method !== "cheque") setPaymentReference("");
                            }}
                            disabled={Boolean(confirmedPaymentReceipt)}
                          >
                            <div className="relative">
                              <Listbox.Button
                                className={`relative w-full rounded-lg border border-default-300 py-2 pl-3 pr-10 text-left dark:border-gray-600 ${
                                  confirmedPaymentReceipt
                                    ? "cursor-default bg-default-100 text-default-700 dark:bg-gray-900/70 dark:text-gray-300"
                                    : "cursor-pointer bg-white text-default-800 focus:outline-none focus:ring-2 focus:ring-sky-500 dark:bg-gray-900/50 dark:text-gray-200 dark:focus:ring-sky-400"
                                }`}
                              >
                                <span className="block truncate">
                                  {t(
                                    paymentMethodLabels[
                                      effectivePaymentMethod
                                    ] || effectivePaymentMethod
                                  )}
                                </span>
                                {!confirmedPaymentReceipt && (
                                  <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
                                    <IconChevronDown
                                      size={18}
                                      className="text-default-400 dark:text-gray-500"
                                    />
                                  </span>
                                )}
                              </Listbox.Button>
                              <Transition
                                as={Fragment}
                                leave="transition ease-in duration-100"
                                leaveFrom="opacity-100"
                                leaveTo="opacity-0"
                              >
                                <Listbox.Options className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-lg bg-white dark:bg-gray-700 py-1 shadow-lg ring-1 ring-black/5 dark:ring-white/10 focus:outline-none">
                                  {Object.entries(paymentMethodLabels).map(
                                    ([method, label]) => (
                                      <Listbox.Option
                                        key={method}
                                        value={method}
                                        className={({ active }) =>
                                          `relative cursor-pointer select-none py-2 px-3 ${
                                            active
                                              ? "bg-sky-100 dark:bg-sky-900/30 text-sky-900 dark:text-sky-100"
                                              : "text-default-800 dark:text-gray-200"
                                          }`
                                        }
                                      >
                                        {({ selected }) => (
                                          <span
                                            className={`block truncate ${
                                              selected
                                                ? "font-medium"
                                                : "font-normal"
                                            }`}
                                          >
                                            {t(label)}
                                          </span>
                                        )}
                                      </Listbox.Option>
                                    )
                                  )}
                                </Listbox.Options>
                              </Transition>
                            </div>
                          </Listbox>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-default-700 dark:text-gray-300 mb-2">
                            {t("Green Target Reference No.")}{" "}
                            <span className="text-rose-500">*</span>
                          </label>
                          <input
                            type="text"
                            value={paymentInternalReference}
                            onChange={handlePaymentInternalReferenceChange}
                            placeholder={t("e.g. RV26/06/62")}
                            maxLength={50}
                            className="w-full px-3 py-2 border border-default-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900/50 text-default-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-sky-500 dark:focus:ring-sky-400"
                          />
                        </div>
                        {confirmedPaymentReceipt ? (
                          <div>
                            <label className="block text-sm font-medium text-default-700 dark:text-gray-300 mb-2">
                              {t("Cheque / Transaction Ref.")}
                            </label>
                            <input
                              type="text"
                              value={
                                confirmedPaymentReceipt.payment_reference || "-"
                              }
                              readOnly
                              className="w-full rounded-lg border border-default-300 bg-default-100 px-3 py-2 text-default-700 dark:border-gray-600 dark:bg-gray-900/70 dark:text-gray-300"
                            />
                          </div>
                        ) : paymentMethod === "cheque" ? (
                          <div>
                            <label className="block text-sm font-medium text-default-700 dark:text-gray-300 mb-2">
                              {t("Cheque No.")}
                            </label>
                            <input
                              type="text"
                              value={paymentReference}
                              onChange={(e) =>
                                setPaymentReference(e.target.value)
                              }
                              maxLength={50}
                              className="w-full px-3 py-2 border border-default-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900/50 text-default-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-sky-500 dark:focus:ring-sky-400"
                            />
                          </div>
                        ) : null}
                      </div>
                      <GTReceiptJoinPanel
                        lookup={paymentReceiptLookup}
                        joinConfirmed={paymentReceiptJoin.joinConfirmed}
                        onJoinConfirmedChange={
                          paymentReceiptJoin.setJoinConfirmed
                        }
                        disabled={
                          isCreatingInvoice || paymentReceiptLookup.isLooking
                        }
                      />
                    </div>
                  )}

                  <div className="flex justify-end gap-2 mt-6">
                    <Button
                      variant="outline"
                      onClick={() => setIsInvoiceModalOpen(false)}
                      disabled={isCreatingInvoice}
                    >
                      {t("Cancel")}
                    </Button>
                    <Button
                      variant="filled"
                      color="sky"
                      onClick={handleCreateInvoice}
                      disabled={
                        isCreatingInvoice ||
                        isLoadingCustomerRentals ||
                        selectedRentalIds.length === 0 ||
                        invoiceNumberValidation.isDuplicate ||
                        (recordPayment &&
                          (paymentReceiptLookup.isLooking ||
                            Boolean(
                              paymentReceiptLookup.receipt &&
                                (!paymentReceiptLookup.joinable ||
                                  !confirmedPaymentReceipt)
                            )))
                      }
                    >
                      {isCreatingInvoice
                        ? t("Creating...")
                        : t("Create Invoice")}
                    </Button>
                  </div>
                </Dialog.Panel>
              </Transition.Child>
            </div>
          </div>
        </Dialog>
      </Transition>
    </div>
  );
};

export default RentalDetailsPage;
