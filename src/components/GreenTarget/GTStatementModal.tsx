// src/components/GreenTarget/GTStatementModal.tsx
import React, { useState, useEffect, useRef } from "react";
import { format } from "date-fns";
import { useTranslation } from "react-i18next";
import { Dialog, TransitionChild, DialogTitle } from "@headlessui/react";
import { IconX, IconChevronRight } from "@tabler/icons-react";
import Button from "../Button";
import { FormCombobox, FormListbox, SelectOption } from "../FormComponents";
import { greenTargetApi } from "../../routes/greentarget/api";
import { api } from "../../routes/utils/api";
import { toast } from "react-hot-toast";
import { pdf, Document } from "@react-pdf/renderer";
import GTStatementPDF from "../../utils/greenTarget/PDF/GTStatementPDF";
import LoadingSpinner from "../LoadingSpinner";
import { InvoiceGT } from "../../types/types";
import {
  printPdfFrameWithFallback,
  type PrintPdfFrameResult,
} from "../../utils/pdfPrintFallback";

interface GTStatementModalProps {
  isOpen: boolean;
  onClose: () => void;
  month?: number;
  year?: number;
}

interface MonthYearOption {
  id: string;
  name: string;
  month: number;
  year: number;
}

interface CustomerWithInvoiceCounts extends SelectOption {
  activeInvoiceCount: number;
  overdueInvoiceCount: number;
  totalInvoiceCount: number;
  additional_info?: string;
  debtor_account_code?: string | null;
}

interface LedgerStatementTransaction {
  date: string;
  reference: string;
  particulars: string;
  debit: number;
  credit: number;
  running_balance: number;
}

interface LedgerStatementResponse {
  customer: { id: string; name: string };
  period_start: string;
  period_end: string;
  previous_balance: number;
  transactions: LedgerStatementTransaction[];
  total_amount_due: number;
  aging: {
    current_month: number;
    one_month: number;
    two_months: number;
    three_months_plus: number;
  };
}

const shouldPreOpenPrintPreview = (): boolean =>
  window.location.hostname === "localhost" ||
  window.location.hostname === "127.0.0.1";

const GTStatementModal: React.FC<GTStatementModalProps> = ({
  isOpen,
  onClose,
  month = new Date().getMonth(),
  year = new Date().getFullYear(),
}) => {
  const { t } = useTranslation("sales");
  const [startMonthYear, setStartMonthYear] = useState<string>(
    `${month}-${year}`
  );
  const [endMonthYear, setEndMonthYear] = useState<string | null>(null);
  const [selectedCustomers, setSelectedCustomers] = useState<string[]>([]);
  const [customerQuery, setCustomerQuery] = useState<string>("");
  const [isValidRange, setIsValidRange] = useState<boolean>(true);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [isLoadingDialogVisible, setIsLoadingDialogVisible] =
    useState<boolean>(false);
  const [printError, setPrintError] = useState<string | null>(null);
  const hasPrintedRef = useRef(false);
  const resourcesRef = useRef<{
    printFrame: HTMLIFrameElement | null;
    pdfUrl: string | null;
  }>({
    printFrame: null,
    pdfUrl: null,
  });
  const [customerOptions, setCustomerOptions] = useState<
    CustomerWithInvoiceCounts[]
  >([]);

  // Generate month-year options (current year and previous year)
  const monthYearOptions: MonthYearOption[] = [];
  const monthNames = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];

  // Add current year and previous year months
  for (let y = year; y >= year - 1; y--) {
    for (let m = 0; m < 12; m++) {
      monthYearOptions.push({
        id: `${m}-${y}`,
        name: `${monthNames[m]} ${y}`,
        month: m,
        year: y,
      });
    }
  }

  // Sort more recent months first
  monthYearOptions.sort((a, b) => {
    if (a.year !== b.year) return b.year - a.year;
    return b.month - a.month;
  });

  // Fetch customers
  useEffect(() => {
    const fetchCustomersWithInvoiceCounts = async () => {
      try {
        // Fetch both customers and invoices in parallel
        const [customers, invoices] = await Promise.all([
          greenTargetApi.getCustomers(),
          greenTargetApi.getInvoices(),
        ]);

        // Create a map to count invoices by customer
        const invoiceCounts = new Map();

        // Initialize counts for each customer
        customers.forEach(
          (customer: { customer_id: { toString: () => any } }) => {
            invoiceCounts.set(customer.customer_id.toString(), {
              active: 0,
              overdue: 0,
              total: 0,
            });
          }
        );

        // Count invoices by customer and status
        invoices.forEach(
          (invoice: {
            customer_id: { toString: () => any };
            status: string;
          }) => {
            const customerId = invoice.customer_id.toString();
            if (invoiceCounts.has(customerId)) {
              const counts = invoiceCounts.get(customerId);

              if (invoice.status === "active") {
                counts.active += 1;
                counts.total += 1;
              } else if (invoice.status === "overdue") {
                counts.overdue += 1;
                counts.total += 1;
              }
            }
          }
        );

        // Map customers to options with invoice counts
        const options = customers.map(
          (customer: {
            customer_id: { toString: () => any };
            name: any;
            phone_number: any;
            debtor_account_code?: string | null;
          }) => ({
            id: customer.customer_id.toString(),
            name: customer.name || `Customer ${customer.customer_id}`,
            phone_number: customer.phone_number,
            debtor_account_code: customer.debtor_account_code,
            activeInvoiceCount:
              invoiceCounts.get(customer.customer_id.toString())?.active || 0,
            overdueInvoiceCount:
              invoiceCounts.get(customer.customer_id.toString())?.overdue || 0,
            totalInvoiceCount:
              invoiceCounts.get(customer.customer_id.toString())?.total || 0,
          })
        );

        // Sort by total invoice count (descending)
        options.sort(
          (
            a: { totalInvoiceCount: number },
            b: { totalInvoiceCount: number }
          ) => b.totalInvoiceCount - a.totalInvoiceCount
        );

        setCustomerOptions(options);
      } catch (error) {
        console.error("Error fetching customers with invoice counts:", error);
        toast.error("Failed to load customers");
      }
    };

    if (isOpen) {
      fetchCustomersWithInvoiceCounts();
    }
  }, [isOpen]);

  useEffect(() => {
    // If no end month is selected, range is always valid
    if (!endMonthYear) {
      setIsValidRange(true);
      return;
    }

    const [startMonth, startYear] = startMonthYear.split("-").map(Number);
    const [endMonth, endYear] = endMonthYear.split("-").map(Number);

    // Compare by converting to total months
    const startTotalMonths = startYear * 12 + startMonth;
    const endTotalMonths = endYear * 12 + endMonth;

    setIsValidRange(endTotalMonths >= startTotalMonths);
  }, [startMonthYear, endMonthYear]);

  const cleanup = (fullCleanup = false) => {
    if (fullCleanup) {
      if (resourcesRef.current.pdfUrl) {
        URL.revokeObjectURL(resourcesRef.current.pdfUrl);
      }
      if (
        resourcesRef.current.printFrame &&
        resourcesRef.current.printFrame.parentNode
      ) {
        document.body.removeChild(resourcesRef.current.printFrame);
      }
      resourcesRef.current = { printFrame: null, pdfUrl: null };
      hasPrintedRef.current = false;
    }
    setIsGenerating(false);
    setIsLoadingDialogVisible(false);
  };

  const openDevPrintPreviewWindow = (): Window | null => {
    if (!shouldPreOpenPrintPreview()) return null;
    const printWindow = window.open("", "_blank");
    if (!printWindow) return null;
    printWindow.document.title = "Preparing Statement";
    printWindow.document.body.innerHTML =
      "<p style=\"font-family: sans-serif; padding: 24px;\">Preparing print preview...</p>";
    return printWindow;
  };

  const generateMultipleStatementPDFs = async (
    statements: Array<{
      invoice: InvoiceGT;
      details: Array<{
        date: string;
        description: string;
        invoiceNo: string;
        amount: number;
        balance: number;
      }>;
    }>,
    fallbackWindow: Window | null = null
  ) => {
    try {
      // Generate PDF documents for all statements
      const pages = [];

      for (const statement of statements) {
        pages.push(
          <GTStatementPDF
            key={statement.invoice.invoice_id}
            invoice={statement.invoice}
            statementDetails={statement.details}
          />
        );
      }

      // Generate a single document with all statements
      const pdfComponent = (
        <Document
          title={`Green Target Statements - ${format(new Date(), "yyyy-MM-dd")}`}
        >
          {pages}
        </Document>
      );

      const pdfBlob = await pdf(pdfComponent).toBlob();
      const pdfUrl = URL.createObjectURL(pdfBlob);
      resourcesRef.current.pdfUrl = pdfUrl;
      setIsGenerating(false);

      // Create iframe for printing
      const printFrame = document.createElement("iframe");
      printFrame.style.position = "absolute";
      printFrame.style.width = "0";
      printFrame.style.height = "0";
      printFrame.style.border = "0";
      printFrame.style.left = "-9999px"; // Hide the iframe
      document.body.appendChild(printFrame);
      resourcesRef.current.printFrame = printFrame;

      printFrame.onload = () => {
        if (!hasPrintedRef.current && printFrame?.contentWindow) {
          hasPrintedRef.current = true;
          // Small delay for content rendering in iframe
          setTimeout(() => {
            const printResult: PrintPdfFrameResult =
              printPdfFrameWithFallback(printFrame, pdfUrl, {
                fallbackWindow,
                focusBeforePrint: true,
                logLabel: "Green Target statement PDF",
                documentTitle: `Green Target Statements - ${format(
                  new Date(),
                  "yyyy-MM-dd"
                )}`,
              });

            if (printResult.opened && !printResult.usedFallback) {
              if (fallbackWindow && !fallbackWindow.closed) {
                fallbackWindow.close();
              }
              cleanup(); // Hide loading dialog, wait for user interaction
            } else if (printResult.opened) {
              setPrintError(null);
              toast.success("Print preview opened in a new tab.");
              cleanup();
            } else {
              setPrintError(
                "Could not open print preview. Please allow pop-ups for this site."
              );
              cleanup(true);
            }
          }, 500);

          // Fallback cleanup mechanism
          const onFocus = () => {
            window.removeEventListener("focus", onFocus);
            clearTimeout(fallbackTimeout);
            cleanup(true); // Full cleanup after user interaction
            onClose(); // Close the modal after printing
          };
          window.addEventListener("focus", onFocus);

          const fallbackTimeout = setTimeout(() => {
            console.warn("Print dialog focus timeout, cleaning up.");
            window.removeEventListener("focus", onFocus);
            cleanup(true); // Full cleanup after timeout
            onClose(); // Close the modal after timeout
          }, 60000); // 60 seconds timeout
        }
      };

      printFrame.onerror = (e) => {
        console.error("Iframe loading error:", e);
        setPrintError("Failed to load document for printing.");
        cleanup(true);
      };

      printFrame.src = pdfUrl;
    } catch (error) {
      if (fallbackWindow && !fallbackWindow.closed) {
        fallbackWindow.close();
      }
      console.error("Error generating PDFs for print:", error);
      setPrintError(error instanceof Error ? error.message : "Unknown error");
      toast.error("Error preparing documents for print. Please try again.");
      cleanup(true);
    }
  };

  const handleGenerate = async () => {
    if (selectedCustomers.length === 0) {
      toast.error("Please select at least one customer");
      return;
    }

    // Validate month range if endMonth is selected
    if (endMonthYear !== null) {
      const [startMonth, startYear] = startMonthYear.split("-").map(Number);
      const [endMonth, endYear] = endMonthYear.split("-").map(Number);

      // Compare by converting to total months
      const startTotalMonths = startYear * 12 + startMonth;
      const endTotalMonths = endYear * 12 + endMonth;

      if (endTotalMonths < startTotalMonths) {
        toast.error("End month cannot be before start month");
        return;
      }
    }

    setIsGenerating(true);
    setIsLoadingDialogVisible(true);
    setPrintError(null);
    const printPreviewWindow = openDevPrintPreviewWindow();

    try {
      // Convert month-year to local date strings for period/API filters.
      const [startMonth, startYear] = startMonthYear.split("-").map(Number);
      // First day of the month
      const startDate = new Date(startYear, startMonth, 1);

      let endDate: Date;
      if (endMonthYear) {
        const [endMonth, endYear] = endMonthYear.split("-").map(Number);
        // Last day of the month
        const lastDay = new Date(endYear, endMonth + 1, 0).getDate();
        endDate = new Date(endYear, endMonth, lastDay);
      } else {
        // If no end date, use last day of start month
        const lastDay = new Date(startYear, startMonth + 1, 0).getDate();
        endDate = new Date(startYear, startMonth, lastDay);
      }

      const startDateYmd = format(startDate, "yyyy-MM-dd");
      const endDateYmd = format(endDate, "yyyy-MM-dd");

      // Create statement PDFs for all selected customers
      const allPDFs = [];
      const skippedCustomers: string[] = [];

      // Process each customer
      for (const customerId of selectedCustomers) {
        // Find selected customer data
        const customer = customerOptions.find((c) => c.id === customerId);
        if (!customer) continue;

        // Statements read the debtor's GL ledger (the same engine as the
        // Account Ledger page), so the statement always reconciles to the
        // account ledger: the subledger opening balance, consolidated bills
        // and receipts keyed straight into the journal are all included by
        // construction. Customers without a linked debtor account have no
        // ledger identity and are skipped.
        const debtorCode = (customer.debtor_account_code || "").trim();
        if (!debtorCode) {
          skippedCustomers.push(customer.name);
          continue;
        }

        const statement = await api.get<LedgerStatementResponse>(
          `/greentarget/api/debtors/ledger-statement/${encodeURIComponent(
            debtorCode
          )}?start_date=${startDateYmd}&end_date=${endDateYmd}`
        );

        const totalDue: number = Number(statement.total_amount_due) || 0;

        // Create statement details (transactions during the period)
        const statementDetails = [
          // Opening balance entry
          {
            date: startDateYmd,
            description: "Balance Brought Forward",
            invoiceNo: "-",
            amount: 0, // Not a transaction itself
            balance: statement.previous_balance,
          },
          ...statement.transactions.map((tx: LedgerStatementTransaction) => ({
            date: tx.date,
            description:
              tx.particulars || (tx.debit > 0 ? "Sales" : "Payment"),
            invoiceNo: tx.reference || "-",
            amount: tx.debit > 0 ? tx.debit : -tx.credit, // Debit positive, credit negative
            balance: tx.running_balance,
          })),
        ];

        // Create a statement invoice object
        const statementInvoice = {
          invoice_id: Date.now() + parseInt(customer.id.toString()),
          invoice_number: `S${new Date().getFullYear()}/${String(
            Math.floor(Math.random() * 10000)
          ).padStart(4, "0")}`,
          type: "statement" as "statement",
          customer_id: Number(customer.id),
          customer_name: customer.name,
          customer_phone_number: customer.phone_number || undefined,
          amount_before_tax: 0, // Not relevant for statement
          tax_amount: 0, // Not relevant for statement
          total_amount: totalDue, // Current balance
          amount_paid: 0, // Not relevant for statement
          current_balance: totalDue, // Current balance
          balance_due: totalDue, // Current balance
          date_issued: new Date().toISOString(),
          statement_period_start: startDateYmd,
          statement_period_end: endDateYmd,
          status: "unpaid" as "unpaid" | "paid" | "cancelled" | "overdue",
          uuid: null,
          submission_uid: null,
          long_id: null,
          datetime_validated: null,
          is_consolidated: false,
          consolidated_invoices: null,
          einvoice_status: null,
          additional_info: customer.additional_info || "",
          agingData: {
            current: statement.aging.current_month,
            month1: statement.aging.one_month,
            month2: statement.aging.two_months,
            month3Plus: statement.aging.three_months_plus,
            total: totalDue,
          },
        };

        // Add to the list of PDFs to generate
        allPDFs.push({
          invoice: statementInvoice,
          details: statementDetails,
        });
      }

      if (allPDFs.length === 0) {
        if (printPreviewWindow && !printPreviewWindow.closed) {
          printPreviewWindow.close();
        }
        toast.error(
          t(
            "None of the selected customers have a ledger debtor account linked."
          )
        );
        cleanup(true);
        return;
      }

      // Generate and print all statements
      await generateMultipleStatementPDFs(allPDFs, printPreviewWindow);

      if (skippedCustomers.length > 0) {
        toast(
          t(
            "No ledger debtor account linked for: {{names}}. Their statements were skipped.",
            { names: skippedCustomers.join(", ") }
          ),
          { duration: 6000 }
        );
      }
    } catch (error) {
      if (printPreviewWindow && !printPreviewWindow.closed) {
        printPreviewWindow.close();
      }
      console.error("Error generating statement:", error);
      setPrintError(error instanceof Error ? error.message : "Unknown error");
      toast.error("Error generating statement. Please try again.");
      cleanup(true);
    }
  };

  return (
    <Dialog
      as="div"
      className="fixed inset-0 overflow-y-auto z-50"
      open={isOpen}
      onClose={onClose}
    >
      <div
        className="fixed inset-0 bg-black/30 backdrop-blur-sm"
        aria-hidden="true"
      />
      <div className="flex items-center justify-center min-h-screen w-full">
        <TransitionChild
          as="div"
          enter="ease-out duration-300"
          enterFrom="opacity-0 scale-95"
          enterTo="opacity-100 scale-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100 scale-100"
          leaveTo="opacity-0 scale-95"
          className={"w-full max-w-3xl mx-auto px-4 sm:px-6 lg:px-8"}
        >
          <div className="relative bg-white dark:bg-gray-800 rounded-lg max-w-2xl w-full mx-4 p-6 shadow-xl">
            <div className="flex justify-between items-center mb-4">
              <DialogTitle as="h3" className="text-lg font-medium text-default-900 dark:text-gray-100">
                Generate Statement
              </DialogTitle>
              <button
                onClick={onClose}
                className="p-2 rounded-full hover:bg-default-100 dark:hover:bg-gray-700 text-default-500 dark:text-gray-400"
              >
                <IconX size={18} />
              </button>
            </div>

            <div className="space-y-6">
              {/* Month range selection */}
              <div className="space-y-2">
                <label className="block text-sm font-medium text-default-700 dark:text-gray-200">
                  Select Month Range
                </label>
                <div className="flex items-center space-x-3">
                  <div className="flex-1">
                    <FormListbox
                      name="startMonthYear"
                      label=""
                      value={startMonthYear}
                      onChange={(value: React.SetStateAction<string>) =>
                        setStartMonthYear(value)
                      }
                      options={monthYearOptions}
                      placeholder="Start month..."
                    />
                  </div>

                  <IconChevronRight
                    size={18}
                    className="text-default-400 flex-shrink-0"
                  />

                  <div className="flex-1">
                    <FormListbox
                      name="endMonthYear"
                      label=""
                      value={endMonthYear || ""}
                      onChange={(value: any) => setEndMonthYear(value || null)}
                      options={[
                        { id: "", name: "Same as start" },
                        ...monthYearOptions,
                      ]}
                      placeholder="End month (optional)..."
                    />
                  </div>
                </div>
                <p className="text-xs text-default-500 dark:text-gray-400 mt-1">
                  {endMonthYear
                    ? `Statement will include all transactions from ${
                        monthYearOptions.find((o) => o.id === startMonthYear)
                          ?.name
                      } to ${
                        monthYearOptions.find((o) => o.id === endMonthYear)
                          ?.name
                      }`
                    : `Statement will include all transactions in ${
                        monthYearOptions.find((o) => o.id === startMonthYear)
                          ?.name
                      }`}
                </p>
                {endMonthYear && !isValidRange && (
                  <p className="text-xs text-rose-600 mt-1">
                    End month cannot be before start month
                  </p>
                )}
              </div>

              {/* Customer selection */}
              <div className="space-y-2">
                <label className="block text-sm font-medium text-default-700 dark:text-gray-200">
                  Select Customer(s)
                </label>
                <FormCombobox
                  name="customers"
                  label=""
                  value={selectedCustomers}
                  onChange={(value) => {
                    if (Array.isArray(value)) {
                      setSelectedCustomers(value);
                    } else if (value) {
                      setSelectedCustomers([value]);
                    } else {
                      setSelectedCustomers([]);
                    }
                  }}
                  options={customerOptions.map((option) => ({
                    ...option,
                    // Customize the name to include invoice counts
                    name: `${option.name} ${
                      option.phone_number ? `(${option.phone_number})` : ""
                    } - ${option.activeInvoiceCount} active, ${
                      option.overdueInvoiceCount
                    } overdue`,
                  }))}
                  query={customerQuery}
                  setQuery={setCustomerQuery}
                  mode="multiple"
                  placeholder="Select customers..."
                />

                {/* Selected customers summary */}
                {selectedCustomers.length > 0 && (
                  <div className="mt-2 p-2 bg-sky-50 dark:bg-sky-900/30 border border-sky-100 dark:border-sky-800 rounded-lg">
                    <div className="flex justify-between">
                      <p className="text-sm text-default-700 dark:text-gray-200 font-medium mb-1">
                        Selected: {selectedCustomers.length} customer
                        {selectedCustomers.length > 1 ? "s" : ""}
                      </p>
                      <button
                        className="text-xs text-sky-600 dark:text-sky-400 hover:text-sky-800 dark:hover:text-sky-300 hover:underline"
                        onClick={() => setSelectedCustomers([])}
                      >
                        Clear selection
                      </button>
                    </div>
                    <div className="max-h-36 overflow-y-auto">
                      <ul className="text-xs text-default-600 dark:text-gray-300 space-y-1">
                        {selectedCustomers.map((customerId) => {
                          const customer = customerOptions.find(
                            (c) => c.id === customerId
                          );
                          return (
                            <li key={customerId} className="flex items-center">
                              <span className="w-3 h-3 bg-sky-400 rounded-full mr-2 flex-shrink-0"></span>
                              <span className="truncate">
                                {customer?.name || `Customer #${customerId}`}
                                {customer?.phone_number &&
                                  ` (${customer.phone_number})`}
                                {customer &&
                                  ` - ${customer.activeInvoiceCount} active, ${customer.overdueInvoiceCount} overdue`}
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  </div>
                )}

                <p className="text-xs text-default-500 dark:text-gray-400 mt-1">
                  Statements will be generated for each selected customer
                </p>
              </div>
            </div>

            <div className="mt-8 flex space-x-3 justify-end">
              <Button onClick={onClose} variant="outline">
                Cancel
              </Button>
              <Button
                onClick={handleGenerate}
                variant="filled"
                color="sky"
                disabled={selectedCustomers.length === 0 || !isValidRange}
              >
                Generate Statement{selectedCustomers.length > 1 ? "s" : ""}
              </Button>
            </div>
          </div>
        </TransitionChild>
      </div>
      {isLoadingDialogVisible && (
        <div className="fixed inset-0 flex items-center justify-center z-50">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" />
          <div className="relative bg-white dark:bg-gray-800 rounded-xl shadow-2xl p-6 min-w-[240px]">
            <div className="flex flex-col items-center gap-3">
              <LoadingSpinner size="sm" hideText />
              <p className="text-base font-medium text-default-900 dark:text-gray-100">
                {isGenerating
                  ? `Preparing statement${
                      selectedCustomers.length > 1 ? "s" : ""
                    } for ${selectedCustomers.length} customer${
                      selectedCustomers.length > 1 ? "s" : ""
                    }...`
                  : "Opening print dialog..."}
              </p>
              {printError && (
                <p className="text-sm text-rose-600 mt-2 text-center">
                  {printError}
                </p>
              )}
              <button
                onClick={() => {
                  cleanup(true);
                  onClose();
                }}
                className="mt-1 text-sm text-center text-sky-600 dark:text-sky-400 hover:underline"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </Dialog>
  );
};

export default GTStatementModal;
