// src/pages/Invoice/EInvoiceConsolidatedPage.tsx
import React, { useState, useEffect, useCallback } from "react";
import { api } from "../../routes/utils/api";
import {
  Listbox,
  ListboxButton,
  ListboxOption,
  ListboxOptions,
} from "@headlessui/react";
import {
  IconChevronDown,
  IconCheck,
  IconFileSad,
  IconFileInvoice,
} from "@tabler/icons-react";
import LoadingSpinner from "../../components/LoadingSpinner";
import TableEditing from "../../components/Table/TableEditing";
import {
  ColumnConfig,
  DocumentStatus,
  LoginResponse,
  SubmissionState,
} from "../../types/types";
import {
  parseDatabaseTimestamp,
  formatDisplayDate,
} from "../../utils/invoice/dateUtils";
import Button from "../../components/Button";
import toast from "react-hot-toast";
import { SubmissionDisplay } from "../../components/Invoice/SubmissionDisplay";
import { StatusIndicator } from "../../components/StatusIndicator";
import { useLocation, useNavigate } from "react-router-dom";

interface MonthOption {
  id: number;
  name: string;
}

interface Product {
  issubtotal?: boolean;
  istotal?: boolean;
  tax: number;
}

interface EligibleInvoice {
  id: string;
  salespersonid: string;
  customerid: string;
  createddate: string;
  paymenttype: string;
  amount: number;
  rounding: number;
  totalamountpayable: number;
  products?: Product[];
}

const EInvoiceConsolidatedPage: React.FC = () => {
  // Get current month and year
  const currentDate = new Date();
  const currentMonth = currentDate.getMonth();
  const currentYear = currentDate.getFullYear();

  // Define months
  const monthOptions: MonthOption[] = [
    { id: 0, name: "January" },
    { id: 1, name: "February" },
    { id: 2, name: "March" },
    { id: 3, name: "April" },
    { id: 4, name: "May" },
    { id: 5, name: "June" },
    { id: 6, name: "July" },
    { id: 7, name: "August" },
    { id: 8, name: "September" },
    { id: 9, name: "October" },
    { id: 10, name: "November" },
    { id: 11, name: "December" },
  ];

  // Calculate initial month and year
  const initialMonth = currentMonth === 0 ? 11 : currentMonth - 1;
  const initialYear = currentMonth === 0 ? currentYear - 1 : currentYear;

  // States
  const [selectedMonth, setSelectedMonth] = useState<MonthOption>(
    monthOptions[initialMonth]
  );
  const [selectedYear, setSelectedYear] = useState<number>(initialYear);
  const [eligibleInvoices, setEligibleInvoices] = useState<EligibleInvoice[]>(
    []
  );
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [loginResponse, setLoginResponse] = useState<LoginResponse | null>(
    null
  );
  const [isConnecting, setIsConnecting] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionState, setSubmissionState] =
    useState<SubmissionState | null>(null);

  // Selection states
  const [selectedInvoices, setSelectedInvoices] = useState<EligibleInvoice[]>(
    []
  );
  const [totals, setTotals] = useState({
    subtotal: 0,
    tax: 0,
    total: 0,
    rounding: 0,
  });
  const location = useLocation();
  const navigate = useNavigate();

  // Token validation function
  const isTokenValid = useCallback((loginData: LoginResponse): boolean => {
    if (!loginData.tokenInfo || !loginData.tokenCreationTime) return false;
    return (
      Date.now() <
      loginData.tokenCreationTime + loginData.tokenInfo.expiresIn * 1000
    );
  }, []);

  // Authentication function
  const connectToMyInvois = useCallback(async () => {
    const storedLoginData = localStorage.getItem("myInvoisLoginData");
    if (storedLoginData) {
      const parsedData = JSON.parse(storedLoginData);
      if (isTokenValid(parsedData)) {
        setLoginResponse(parsedData);
        return true;
      }
    }

    try {
      setIsConnecting(true);
      const data = await api.post("/api/einvoice/login");
      if (data.success && data.tokenInfo) {
        const loginDataWithTime = { ...data, tokenCreationTime: Date.now() };
        localStorage.setItem(
          "myInvoisLoginData",
          JSON.stringify(loginDataWithTime)
        );
        setLoginResponse(loginDataWithTime);
        return true;
      } else {
        setLoginResponse(data);
        return false;
      }
    } catch (err) {
      setLoginResponse({
        success: false,
        message: "An error occurred while connecting to MyInvois API.",
        apiEndpoint: "Unknown",
        error: err instanceof Error ? err.message : "Unknown error",
      });
      return false;
    } finally {
      setIsConnecting(false);
    }
  }, [isTokenValid]);

  // Calculate totals
  useEffect(() => {
    const calculateTotals = () => {
      let subtotal = 0;
      let total = 0;
      let taxTotal = 0;
      let roundingTotal = 0;

      selectedInvoices.forEach((invoice) => {
        subtotal += Number(invoice.amount) || 0;
        total += Number(invoice.totalamountpayable) || 0;
        roundingTotal += Number(invoice.rounding) || 0;

        // Sum up individual product taxes if available
        if (invoice.products && Array.isArray(invoice.products)) {
          invoice.products.forEach((product) => {
            if (!product.issubtotal && !product.istotal) {
              taxTotal += Number(product.tax) || 0;
            }
          });
        }
      });

      subtotal = subtotal - taxTotal;

      setTotals({
        subtotal,
        tax: taxTotal,
        total,
        rounding: roundingTotal,
      });
    };

    calculateTotals();
  }, [selectedInvoices]);

  const handleInvoiceClick = (invoiceData: EligibleInvoice) => {
    navigate(`/sales/invoice/details`, {
      state: {
        invoiceData,
        isNewInvoice: false,
        previousPath: location.pathname,
      },
    });
  };

  // Define columns for the table
  const invoiceColumns: ColumnConfig[] = [
    {
      id: "id",
      header: "Invoice",
      type: "readonly",
      width: 150,
      cell: (info: {
        getValue: () => any;
        row: { original: EligibleInvoice };
      }) => (
        <button
          onClick={() => handleInvoiceClick(info.row.original)}
          className="w-full h-full px-6 py-3 text-left outline-none bg-transparent cursor-pointer group-hover:font-semibold"
        >
          {info.row.original.paymenttype === "CASH" ? "C" : "I"}
          {info.getValue()}
        </button>
      ),
    },
    {
      id: "createddate",
      header: "Date",
      type: "readonly",
      width: 150,
      cell: (info: {
        getValue: () => any;
        row: { original: EligibleInvoice };
      }) => {
        const timestamp = info.getValue();
        const { date } = parseDatabaseTimestamp(timestamp);
        return (
          <div
            className="px-6 py-3 cursor-pointer group-hover:font-semibold"
            onClick={() => handleInvoiceClick(info.row.original)}
          >
            {formatDisplayDate(date)}
          </div>
        );
      },
    },
    {
      id: "salespersonid",
      header: "Salesman",
      type: "readonly",
      width: 150,
      cell: (info: {
        getValue: () => any;
        row: { original: EligibleInvoice };
      }) => (
        <div
          className="px-6 py-3 cursor-pointer group-hover:font-semibold"
          onClick={() => handleInvoiceClick(info.row.original)}
        >
          {info.getValue()}
        </div>
      ),
    },
    {
      id: "customerid",
      header: "Customer",
      type: "readonly",
      width: 500,
      cell: (info: {
        getValue: () => any;
        row: { original: EligibleInvoice };
      }) => (
        <div
          className="px-6 py-3 cursor-pointer group-hover:font-semibold"
          onClick={() => handleInvoiceClick(info.row.original)}
        >
          {info.getValue()}
        </div>
      ),
    },
    {
      id: "totalamountpayable",
      header: "Amount",
      type: "amount",
      width: 150,
      cell: (info: {
        getValue: () => any;
        row: { original: EligibleInvoice };
      }) => (
        <div
          className="px-6 py-3 text-right cursor-pointer group-hover:font-semibold"
          onClick={() => handleInvoiceClick(info.row.original)}
        >
          {Number(info.getValue() || 0).toFixed(2)}
        </div>
      ),
    },
  ];

  // Handler for selection changes
  const handleSelectionChange = useCallback(
    (count: number, allSelected: boolean, selectedRows: EligibleInvoice[]) => {
      setSelectedInvoices(selectedRows);
    },
    []
  );

  // Handle month change and adjust year accordingly
  const handleMonthChange = (month: MonthOption) => {
    setSelectedMonth(month);
    // If selected month is ahead of current month, show previous year
    const newYear = month.id > currentMonth ? currentYear - 1 : currentYear;
    setSelectedYear(newYear);
    setSelectedInvoices([]);
  };

  // Fetch eligible invoices function
  const fetchEligibleInvoices = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await api.get(
        `/api/einvoice/eligible-for-consolidation?month=${selectedMonth.id}&year=${selectedYear}`
      );

      if (response.success) {
        setEligibleInvoices(response.data);
      } else {
        setError(response.message || "Failed to fetch eligible invoices");
      }
    } catch (err) {
      console.error("Error fetching eligible invoices:", err);
      setError("An error occurred while fetching eligible invoices");
    } finally {
      setIsLoading(false);
    }
  }, [selectedMonth.id, selectedYear]);

  // Fetch eligible invoices when month/year changes
  useEffect(() => {
    fetchEligibleInvoices();
  }, [fetchEligibleInvoices]);

  // Handle consolidated submission
  const handleSubmitConsolidated = async () => {
    if (selectedInvoices.length === 0) {
      toast.error("Please select at least one invoice");
      return;
    }

    try {
      // First authenticate with MyInvois
      setIsSubmitting(true);

      // Check if we're already authenticated
      let isAuthenticated = false;
      if (loginResponse && isTokenValid(loginResponse)) {
        isAuthenticated = true;
      } else {
        // Try to connect
        const toastId = toast.loading("Connecting to MyInvois...");
        isAuthenticated = await connectToMyInvois();
        toast.dismiss(toastId);
      }

      if (!isAuthenticated) {
        toast.error("Failed to connect to MyInvois API");
        setIsSubmitting(false);
        return;
      }

      // Authentication successful - continue with submission
      const loadingToastId = toast.loading(
        "Submitting consolidated invoices..."
      );

      // Set initial submission state
      const initialDocuments: Record<string, DocumentStatus> = {};
      initialDocuments["consolidated"] = {
        invoiceNo: `CON-${selectedYear}${String(selectedMonth.id + 1).padStart(
          2,
          "0"
        )}`,
        currentStatus: "PROCESSING",
        summary: {
          status: "Submitted",
          receiverName: "Consolidated Buyers",
        },
      };

      setSubmissionState({
        phase: "SUBMISSION",
        tracker: {
          submissionUid: "pending",
          batchInfo: {
            size: 1, // Consolidated counts as one
            submittedAt: new Date().toISOString(),
          },
          statistics: {
            totalDocuments: 1,
            processed: 0,
            accepted: 0,
            rejected: 0,
            processing: 1,
            completed: 0,
          },
          documents: initialDocuments,
          processingUpdates: [],
          overallStatus: "InProgress",
        },
      });

      // Submit consolidated invoices
      const response = await api.post("/api/einvoice/submit-consolidated", {
        invoices: selectedInvoices.map((inv) => inv.id),
        month: selectedMonth.id,
        year: selectedYear,
      });

      toast.dismiss(loadingToastId);

      if (response.success) {
        const documents: Record<string, DocumentStatus> = {};

        documents["consolidated"] = {
          invoiceNo:
            response.consolidatedId ||
            `CON-${selectedYear}${String(selectedMonth.id + 1).padStart(
              2,
              "0"
            )}`,
          currentStatus: "COMPLETED",
          summary: {
            status: "Valid",
            receiverName: "Consolidated Buyers",
            uuid: response.uuid,
            longId: response.longId,
          },
        };

        setSubmissionState({
          phase: "COMPLETED",
          tracker: {
            submissionUid: response.submissionUid,
            batchInfo: {
              size: 1,
              submittedAt: new Date().toISOString(),
              completedAt: new Date().toISOString(),
            },
            statistics: {
              totalDocuments: 1,
              processed: 1,
              accepted: 1,
              rejected: 0,
              processing: 0,
              completed: 1,
            },
            documents,
            processingUpdates: [],
            overallStatus: "Valid",
          },
        });

        toast.success("Consolidated invoices submitted successfully");
      } else {
        throw new Error(
          response.message || "Failed to submit consolidated invoices"
        );
      }
    } catch (error: any) {
      console.error("Submission Error:", error);
      toast.dismiss();

      // Set error state
      const documents: Record<string, DocumentStatus> = {};
      documents["consolidated"] = {
        invoiceNo: `CON-${selectedYear}${String(selectedMonth.id + 1).padStart(
          2,
          "0"
        )}`,
        currentStatus: "REJECTED",
        errors: [
          {
            code: "ERR",
            message: error.message || "Failed to submit consolidated invoices",
          },
        ],
      };

      setSubmissionState({
        phase: "COMPLETED",
        tracker: {
          submissionUid: "error",
          batchInfo: {
            size: 1,
            submittedAt: new Date().toISOString(),
            completedAt: new Date().toISOString(),
          },
          statistics: {
            totalDocuments: 1,
            processed: 1,
            accepted: 0,
            rejected: 1,
            processing: 0,
            completed: 0,
          },
          documents,
          processingUpdates: [],
          overallStatus: "Invalid",
        },
      });

      toast.error(`Submission failed: ${error.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col mt-4">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-3xl font-semibold text-default-900">
          Consolidate e-Invoices
        </h1>
      </div>

      <div className="flex flex-col mb-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-60">
              <Listbox value={selectedMonth} onChange={handleMonthChange}>
                <div className="relative">
                  <ListboxButton className="w-full rounded-lg border border-default-300 bg-white py-2 pl-3 pr-10 text-left focus:outline-none focus:border-default-500">
                    <span className="block truncate pl-2">
                      {selectedMonth.name}
                    </span>
                    <span className="absolute inset-y-0 right-0 flex items-center pr-2 pointer-events-none">
                      <IconChevronDown
                        className="h-5 w-5 text-default-400"
                        aria-hidden="true"
                      />
                    </span>
                  </ListboxButton>
                  <ListboxOptions className="absolute z-10 w-full p-1 mt-1 border bg-white max-h-60 rounded-lg overflow-auto focus:outline-none shadow-lg">
                    {monthOptions.map((month) => (
                      <ListboxOption
                        key={month.id}
                        className={({ active }) =>
                          `relative cursor-pointer select-none rounded py-2 pl-3 pr-9 ${
                            active
                              ? "bg-default-100 text-default-900"
                              : "text-default-900"
                          }`
                        }
                        value={month}
                      >
                        {({ selected }) => (
                          <>
                            <span
                              className={`block truncate ${
                                selected ? "font-medium" : "font-normal"
                              }`}
                            >
                              {month.name}
                            </span>
                            {selected && (
                              <span className="absolute inset-y-0 right-0 flex items-center pr-3 text-default-600">
                                <IconCheck
                                  className="h-5 w-5"
                                  aria-hidden="true"
                                />
                              </span>
                            )}
                          </>
                        )}
                      </ListboxOption>
                    ))}
                  </ListboxOptions>
                </div>
              </Listbox>
            </div>
            <div className="text-lg font-medium text-default-700 ml-2">
              {selectedYear}
            </div>
          </div>
        </div>

        {selectedInvoices.length > 0 && (
          <div className="mt-4 p-4 bg-white rounded-lg border border-default-200 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center text-sm text-default-500 font-medium">
                {selectedInvoices.length} invoice
                {selectedInvoices.length !== 1 ? "s" : ""} selected
                {loginResponse && (
                  <div className="ml-2">
                    <StatusIndicator
                      success={loginResponse.success}
                      type="connection"
                    />
                  </div>
                )}
              </div>

              <div className="flex items-center space-x-6">
                <div className="flex flex-col items-end">
                  <span className="text-xs text-default-500">Subtotal</span>
                  <span className="text-base font-semibold text-default-700">
                    {totals.subtotal.toLocaleString("en-MY", {
                      style: "currency",
                      currency: "MYR",
                    })}
                  </span>
                </div>

                <div className="flex flex-col items-end">
                  <span className="text-xs text-default-500">Tax</span>
                  <span className="text-base font-semibold text-default-700">
                    {totals.tax.toLocaleString("en-MY", {
                      style: "currency",
                      currency: "MYR",
                    })}
                  </span>
                </div>

                <div className="flex flex-col items-end">
                  <span className="text-xs text-default-500">Rounding</span>
                  <span className="text-base font-semibold text-default-700">
                    {totals.rounding.toLocaleString("en-MY", {
                      style: "currency",
                      currency: "MYR",
                    })}
                  </span>
                </div>

                <div className="flex flex-col items-end pl-6 border-l border-default-200">
                  <span className="text-xs text-left text-default-500">
                    Total
                  </span>
                  <span className="text-lg font-semibold text-sky-600">
                    {totals.total.toLocaleString("en-MY", {
                      style: "currency",
                      currency: "MYR",
                    })}
                  </span>
                </div>

                <div className="flex items-center">
                  <Button
                    onClick={handleSubmitConsolidated}
                    icon={IconFileInvoice}
                    color="sky"
                    variant="filled"
                    disabled={
                      submissionState !== null ||
                      isConnecting ||
                      isSubmitting ||
                      selectedInvoices.length === 0
                    }
                  >
                    {isConnecting
                      ? "Connecting..."
                      : isSubmitting
                      ? "Submitting..."
                      : "Submit Consolidated"}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Submission status display */}
      {submissionState && (
        <div className="p-4 bg-white rounded-lg border border-default-200 mb-6">
          <SubmissionDisplay
            state={submissionState}
            onClose={() => {
              // Reset submission state
              setSubmissionState(null);

              // Clear selection state
              setSelectedInvoices([]);

              // Refresh the eligible invoices
              fetchEligibleInvoices();
            }}
            showDetails={true}
          />
        </div>
      )}

      {/* Display loading state */}
      {isLoading && (
        <div className="flex justify-center py-8">
          <LoadingSpinner />
        </div>
      )}

      {/* Display error message */}
      {error && (
        <div className="bg-rose-50 text-rose-600 p-4 rounded-lg mb-4">
          {error}
        </div>
      )}

      {/* Display results */}
      {!isLoading && !error && (
        <>
          {eligibleInvoices.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-8 bg-default-50 rounded-lg border border-default-200">
              <IconFileSad className="w-12 h-12 text-default-400 mb-4" />
              <h3 className="text-lg font-medium text-default-700 mb-2">
                No Eligible Invoices Found
              </h3>
              <p className="text-default-500 text-center">
                There are no invoices available for consolidation in{" "}
                {selectedMonth.name} {selectedYear}.
              </p>
            </div>
          ) : (
            <div className="ml-[-44.1px]">
              <TableEditing<EligibleInvoice>
                initialData={eligibleInvoices}
                columns={invoiceColumns}
                onSelectionChange={handleSelectionChange}
                tableKey="consolidate"
              />
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default EInvoiceConsolidatedPage;
