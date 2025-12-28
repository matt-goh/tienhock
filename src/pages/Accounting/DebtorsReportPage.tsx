// src/pages/Accounting/DebtorsReportPage.tsx
import React, { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  IconSearch,
  IconDownload,
  IconChevronDown,
  IconChevronRight,
  IconAlertCircle,
  IconUser,
  IconCalendar,
  IconBuildingStore,
  IconRefresh,
  IconCalendarDollar,
  IconPhone,
} from "@tabler/icons-react";
import MonthNavigator from "../../components/MonthNavigator";
import Button from "../../components/Button";
import LoadingSpinner from "../../components/LoadingSpinner";
import { api } from "../../routes/utils/api";
import { useCompany } from "../../contexts/CompanyContext";
import { generateDebtorsReportPDF } from "../../utils/accounting/DebtorsReportPDF";
import toast from "react-hot-toast";

interface Payment {
  payment_id: number;
  payment_method: string;
  payment_reference: string | null;
  date: string;
  amount: number;
}

interface Invoice {
  invoice_id: string;
  invoice_number: string;
  date: string;
  amount: number;
  payments: Payment[];
  balance: number;
}

interface Customer {
  customer_id: string;
  customer_name: string;
  phone_number?: string;
  invoices: Invoice[];
  total_amount: number;
  total_paid: number;
  total_balance: number;
  credit_limit: number;
  credit_balance: number;
}

interface Salesman {
  salesman_id: string;
  salesman_name: string;
  customers: Customer[];
  total_balance: number;
}

interface DebtorsData {
  salesmen: Salesman[];
  grand_total_amount: number;
  grand_total_paid: number;
  grand_total_balance: number;
  report_date: string | number;
}


const DebtorsReportPage: React.FC = () => {
  const navigate = useNavigate();
  const { activeCompany } = useCompany();
  const printRef = useRef<HTMLDivElement>(null);
  const [debtorsData, setDebtorsData] = useState<DebtorsData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [expandedSalesmen, setExpandedSalesmen] = useState<Set<string>>(
    new Set()
  );
  const [expandedCustomers, setExpandedCustomers] = useState<Set<string>>(
    new Set()
  );

  // Month selection state
  const [selectedMonth, setSelectedMonth] = useState<Date>(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [allTimeMode, setAllTimeMode] = useState(false);

  // Centralized data fetching function with manual URL construction
  const fetchDebtors = useCallback(
    async (params?: { month: number; year: number }): Promise<void> => {
      let url = "/api/debtors";
      if (params && params.month && params.year) {
        url += `?month=${params.month}&year=${params.year}`;
      }

      try {
        setLoading(true);
        setError(null);

        // Make the API call with the constructed URL string
        const response = await api.get(url);
        const data = response;

        const processedData: DebtorsData = {
          ...data,
          report_date: formatDateFromTimestamp(data.report_date),
          salesmen: data.salesmen.map((salesman: Salesman) => ({
            ...salesman,
            customers: salesman.customers.map((customer: Customer) => ({
              ...customer,
              invoices: customer.invoices.map((invoice: Invoice) => ({
                ...invoice,
                date: formatDate(invoice.date),
                payments: invoice.payments.map((payment: Payment) => ({
                  ...payment,
                  date: formatDateFromTimestamp(payment.date),
                })),
              })),
            })),
          })),
        };

        setDebtorsData(processedData);

        const salesmenIds = data.salesmen.map((s: Salesman) => s.salesman_id);
        setExpandedSalesmen(new Set(salesmenIds));
      } catch (err) {
        setError("Failed to fetch debtors data. Please try again later.");
        console.error("Error fetching debtors:", err);
      } finally {
        setLoading(false);
      }
    },
    []
  );

  // Initial data fetch for the default (current) month
  useEffect(() => {
    if (allTimeMode) {
      fetchDebtors();
    } else {
      fetchDebtors({
        month: selectedMonth.getMonth() + 1,
        year: selectedMonth.getFullYear(),
      });
    }
  }, [fetchDebtors, selectedMonth, allTimeMode]);

  // Handle month selection change from MonthNavigator
  const handleMonthChange = useCallback(
    (newDate: Date) => {
      setAllTimeMode(false);
      setSelectedMonth(newDate);
    },
    []
  );

  // Toggle all time mode
  const handleAllTimeToggle = useCallback(() => {
    setAllTimeMode((prev) => !prev);
  }, []);

  const handleRefresh = () => {
    if (allTimeMode) {
      fetchDebtors();
    } else {
      fetchDebtors({
        month: selectedMonth.getMonth() + 1,
        year: selectedMonth.getFullYear(),
      });
    }
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return "N/A";
    if (/^\d+$/.test(dateString)) {
      const date = new Date(parseInt(dateString, 10));
      if (isNaN(date.getTime())) {
        return "Invalid Date";
      }
      return date.toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      });
    }
    const date = new Date(dateString);
    if (isNaN(date.getTime())) {
      return "Invalid Date";
    }
    return date.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  };

  const formatDateFromTimestamp = (timestamp: string | number): string => {
    if (!timestamp) return "N/A";
    const date = new Date(
      typeof timestamp === "number" ? timestamp * 1000 : timestamp
    );
    if (isNaN(date.getTime())) {
      return "Invalid Date";
    }
    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
  };

  const formatCurrency = (amount: number): string => {
    return new Intl.NumberFormat("en-MY", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  };

  const toggleSalesman = (salesmanId: string): void => {
    setExpandedSalesmen((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(salesmanId)) {
        newSet.delete(salesmanId);
      } else {
        newSet.add(salesmanId);
      }
      return newSet;
    });
  };

  const toggleCustomer = (customerId: string): void => {
    setExpandedCustomers((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(customerId)) {
        newSet.delete(customerId);
      } else {
        newSet.add(customerId);
      }
      return newSet;
    });
  };

  const handleCustomerClick = (customerId: string): void => {
    navigate(`/sales/invoice?customerId=${customerId}`);
  };

  const handlePrint = async (): Promise<void> => {
    if (!debtorsData) return;
    try {
      const loadingToast = toast.loading("Generating PDF...");
      const filterName = allTimeMode
        ? undefined
        : selectedMonth.toLocaleDateString("en", {
            month: "long",
            year: "numeric",
          });
      await generateDebtorsReportPDF(filteredData, "print", filterName);
      toast.dismiss(loadingToast);
      toast.success("Print dialog opened");
    } catch (error) {
      console.error("Error printing report:", error);
      toast.error("Failed to generate PDF");
    }
  };

  const filterData = (data: DebtorsData): DebtorsData => {
    if (!searchTerm) return data;
    const filtered: DebtorsData = {
      ...data,
      salesmen: data.salesmen
        .map((salesman) => ({
          ...salesman,
          customers: salesman.customers.filter(
            (customer) =>
              customer.customer_name
                .toLowerCase()
                .includes(searchTerm.toLowerCase()) ||
              customer.customer_id
                .toLowerCase()
                .includes(searchTerm.toLowerCase())
          ),
        }))
        .filter((salesman) => salesman.customers.length > 0),
    };
    filtered.grand_total_balance = filtered.salesmen.reduce(
      (sum, salesman) =>
        sum +
        salesman.customers.reduce(
          (customerSum, customer) => customerSum + customer.total_balance,
          0
        ),
      0
    );
    return filtered;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <LoadingSpinner />
        </div>
      </div>
    );
  }

  if (error || !debtorsData) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen">
        <div className="text-center max-w-md mx-auto p-6">
          <IconAlertCircle size={64} className="text-red-500 mb-4 mx-auto" />
          <h2 className="text-2xl font-semibold mb-2 text-gray-900">
            Error Loading Report
          </h2>
          <p className="text-gray-600 mb-6">{error}</p>
          <Button onClick={handleRefresh} icon={IconRefresh}>
            Refresh
          </Button>
        </div>
      </div>
    );
  }

  const filteredData = filterData(debtorsData);

  return (
    <div className="max-w-7xl w-full mx-6 mb-4">
      {/* Header Section */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 mb-4">
        <div className="p-6 border-b border-gray-200">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-default-700 flex items-center gap-3">
                <IconCalendarDollar
                  size={28}
                  stroke={2.5}
                  className="text-default-700"
                />
                Debtors Report
              </h1>
              <div className="flex items-center gap-2 mt-2">
                <IconCalendar size={16} className="text-gray-500" />
                <span className="text-gray-600">Report Date:</span>
                <span className="font-medium text-default-800">
                  {debtorsData.report_date}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Button
                onClick={handleRefresh}
                variant="outline"
                className="flex-col gap-2"
                icon={IconRefresh}
              >
                Refresh
              </Button>
              <Button
                onClick={handlePrint}
                className="flex-col gap-2"
                icon={IconDownload}
                disabled={loading}
              >
                Print Report
              </Button>
            </div>
          </div>
        </div>

        {/* Search and Summary Section */}
        <div className="p-6">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
            {/* Filters */}
            <div className="flex items-center gap-4">
              {/* Search */}
              <div className="relative flex items-center sm:max-w-xs">
                <IconSearch
                  className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"
                  size={18}
                />
                <input
                  type="text"
                  placeholder="Search customers..."
                  className="w-full pl-10 pr-10 py-2 border border-gray-300 focus:border-blue-500 rounded-full text-sm"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
                {searchTerm && (
                  <button
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700"
                    onClick={() => setSearchTerm("")}
                    title="Clear search"
                  >
                    ×
                  </button>
                )}
              </div>
              {/* Month Navigator */}
              <MonthNavigator
                selectedMonth={selectedMonth}
                onChange={handleMonthChange}
                showGoToCurrentButton={false}
              />

              {/* All Time Toggle */}
              <button
                onClick={handleAllTimeToggle}
                className={`px-4 py-2 rounded-lg border text-sm font-medium transition-colors whitespace-nowrap ${
                  allTimeMode
                    ? "bg-sky-100 border-sky-300 text-sky-700"
                    : "bg-default-50 border-default-300 text-default-600 hover:bg-default-100"
                }`}
              >
                All Time
              </button>
            </div>

            {/* Summary Cards */}
            <div className="flex-grow grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-default-100/75 rounded-lg p-4 border-l-4 border-sky-500">
                <div className="text-sm text-default-500 font-medium">
                  Total Amount
                </div>
                <div className="text-xl font-bold text-default-800">
                  RM {formatCurrency(filteredData.grand_total_amount)}
                </div>
              </div>
              <div className="bg-default-100/75 rounded-lg p-4 border-l-4 border-green-500">
                <div className="text-sm text-default-500 font-medium">
                  Total Paid
                </div>
                <div className="text-xl font-bold text-green-600">
                  RM {formatCurrency(filteredData.grand_total_paid)}
                </div>
              </div>
              <div className="bg-default-100/75 rounded-lg p-4 border-l-4 border-red-500">
                <div className="text-sm text-default-500 font-medium">
                  Total Outstanding
                </div>
                <div className="text-xl font-bold text-red-600">
                  RM {formatCurrency(filteredData.grand_total_balance)}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Report Content */}
      <div
        ref={printRef}
        className="bg-white rounded-lg shadow-sm border border-gray-200"
      >
        {filteredData.salesmen.length === 0 ? (
          <div className="text-center py-12">
            <IconUser size={48} className="text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              No Results Found
            </h3>
            <p className="text-gray-600">
              {searchTerm
                ? "No customers match your search criteria."
                : "No debtors data available for the selected period."}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {filteredData.salesmen.map((salesman) => (
              <div key={salesman.salesman_id} className="p-4">
                {/* Salesman Header */}
                <div
                  className="flex items-center justify-between cursor-pointer hover:bg-gray-50 -m-4 p-4 rounded-lg transition-colors"
                  onClick={() => toggleSalesman(salesman.salesman_id)}
                >
                  <div className="flex items-center gap-3">
                    {expandedSalesmen.has(salesman.salesman_id) ? (
                      <IconChevronDown size={20} className="text-gray-500" />
                    ) : (
                      <IconChevronRight size={20} className="text-gray-500" />
                    )}
                    <IconUser size={20} className="text-sky-600" />
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900">
                        {salesman.salesman_name}
                      </h3>
                      <p className="text-sm text-gray-600">
                        {salesman.customers.length} customer
                        {salesman.customers.length !== 1 ? "s" : ""}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-gray-600">Total Outstanding</p>
                    <p className="text-lg font-bold text-red-600">
                      RM {formatCurrency(salesman.total_balance)}
                    </p>
                  </div>
                </div>

                {/* Customers */}
                {expandedSalesmen.has(salesman.salesman_id) && (
                  <div className="mt-6 ml-8 space-y-4">
                    {salesman.customers.map((customer) => (
                      <div
                        key={customer.customer_id}
                        className="border border-gray-200 rounded-lg"
                      >
                        {/* Customer Header */}
                        <div
                          className="flex items-center justify-between p-4 cursor-pointer hover:bg-gray-50 transition-colors"
                          onClick={() => toggleCustomer(customer.customer_id)}
                        >
                          <div className="flex items-center gap-12">
                            <div className="flex items-center gap-3.5">
                              {expandedCustomers.has(customer.customer_id) ? (
                                <IconChevronDown
                                  size={16}
                                  className="text-gray-500"
                                />
                              ) : (
                                <IconChevronRight
                                  size={16}
                                  className="text-gray-500"
                                />
                              )}
                              <IconBuildingStore
                                size={16}
                                className="text-sky-600"
                              />
                              <div>
                                <span
                                  className="font-medium text-gray-900 hover:underline cursor-pointer"
                                  title={
                                    customer.customer_name ||
                                    customer.customer_id
                                  }
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    navigate(
                                      `/catalogue/customer/${customer.customer_id}`
                                    );
                                  }}
                                >
                                  {customer.customer_name ||
                                    customer.customer_id}
                                </span>
                                <p className="text-sm text-gray-600">
                                  ID: {customer.customer_id} •{" "}
                                  {customer.invoices.length} invoice
                                  {customer.invoices.length !== 1 ? "s" : ""}
                                </p>
                              </div>
                            </div>
                            {customer.phone_number && (
                              <div className="flex items-center gap-2 text-default-600">
                                <IconPhone
                                  size={16}
                                  className="text-default-600"
                                />
                                <span className="font-semibold">
                                  {customer.phone_number}
                                </span>
                              </div>
                            )}
                          </div>
                          <div className="flex items-center gap-4">
                            <div className="text-right">
                              <p className="text-sm text-gray-600">Balance</p>
                              <p className="font-bold text-red-600">
                                RM {formatCurrency(customer.total_balance)}
                              </p>
                            </div>
                            <Button
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleCustomerClick(customer.customer_id);
                              }}
                            >
                              View Invoices
                            </Button>
                          </div>
                        </div>

                        {/* Customer Details */}
                        {expandedCustomers.has(customer.customer_id) && (
                          <div className="border-t border-gray-200 p-4">
                            {/* Customer Summary */}
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                              <div>
                                <p className="text-xs text-gray-600">
                                  Total Amount
                                </p>
                                <p className="font-medium">
                                  RM {formatCurrency(customer.total_amount)}
                                </p>
                              </div>
                              <div>
                                <p className="text-xs text-gray-600">
                                  Total Paid
                                </p>
                                <p className="font-medium text-green-600">
                                  RM {formatCurrency(customer.total_paid)}
                                </p>
                              </div>
                              <div>
                                <p className="text-xs text-gray-600">
                                  Credit Limit
                                </p>
                                <p className="font-medium">
                                  RM {formatCurrency(customer.credit_limit)}
                                </p>
                              </div>
                              <div>
                                <p className="text-xs text-gray-600">
                                  Credit Balance
                                </p>
                                <p className="font-medium">
                                  RM {formatCurrency(customer.credit_balance)}
                                </p>
                              </div>
                            </div>

                            {/* Invoices Table */}
                            <div className="overflow-x-auto">
                              <table className="min-w-full text-sm">
                                <thead>
                                  <tr className="bg-gray-100">
                                    <th className="px-3 py-2 text-left font-medium text-gray-700">
                                      #
                                    </th>
                                    <th className="px-3 py-2 text-left font-medium text-gray-700">
                                      Invoice No.
                                    </th>
                                    <th className="px-3 py-2 text-left font-medium text-gray-700">
                                      Date
                                    </th>
                                    <th className="px-3 py-2 text-right font-medium text-gray-700">
                                      Amount
                                    </th>
                                    <th className="px-3 py-2 text-left font-medium text-gray-700">
                                      Payment Method
                                    </th>
                                    <th className="px-3 py-2 text-left font-medium text-gray-700">
                                      Reference
                                    </th>
                                    <th className="px-3 py-2 text-left font-medium text-gray-700">
                                      Payment Date
                                    </th>
                                    <th className="px-3 py-2 text-right font-medium text-gray-700">
                                      Paid Amount
                                    </th>
                                    <th className="px-3 py-2 text-right font-medium text-gray-700">
                                      Balance
                                    </th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200">
                                  {customer.invoices.map((invoice, index) => (
                                    <React.Fragment key={invoice.invoice_id}>
                                      {invoice.payments.length === 0 ? (
                                        <tr
                                          className="hover:bg-gray-50 cursor-pointer"
                                          onClick={() => {
                                            const basePath =
                                              activeCompany.id === "jellypolly"
                                                ? "/jellypolly"
                                                : "";
                                            navigate(
                                              `${basePath}/sales/invoice/${invoice.invoice_id}`,
                                              {
                                                state: {
                                                  showPaymentForm: true,
                                                },
                                              }
                                            );
                                          }}
                                        >
                                          <td className="px-3 py-2">
                                            {index + 1}
                                          </td>
                                          <td className="px-3 py-2 font-medium">
                                            {invoice.invoice_number}
                                          </td>
                                          <td className="px-3 py-2">
                                            {invoice.date}
                                          </td>
                                          <td className="px-3 py-2 text-right">
                                            RM {formatCurrency(invoice.amount)}
                                          </td>
                                          <td className="px-3 py-2 text-gray-500">
                                            -
                                          </td>
                                          <td className="px-3 py-2 text-gray-500">
                                            -
                                          </td>
                                          <td className="px-3 py-2 text-gray-500">
                                            -
                                          </td>
                                          <td className="px-3 py-2 text-right text-gray-500">
                                            -
                                          </td>
                                          <td className="px-3 py-2 text-right font-medium text-red-600">
                                            RM {formatCurrency(invoice.balance)}
                                          </td>
                                        </tr>
                                      ) : (
                                        invoice.payments.map(
                                          (payment, paymentIndex) => (
                                            <tr
                                              key={`${invoice.invoice_id}-${payment.payment_id}`}
                                              className={`hover:bg-gray-50 ${
                                                invoice.balance !== 0
                                                  ? "cursor-pointer"
                                                  : ""
                                              }`}
                                              onClick={() => {
                                                if (invoice.balance !== 0) {
                                                  const basePath =
                                                    activeCompany.id ===
                                                    "jellypolly"
                                                      ? "/jellypolly"
                                                      : "";
                                                  navigate(
                                                    `${basePath}/sales/invoice/${invoice.invoice_id}`,
                                                    {
                                                      state: {
                                                        showPaymentForm: true,
                                                      },
                                                    }
                                                  );
                                                }
                                              }}
                                            >
                                              {paymentIndex === 0 && (
                                                <>
                                                  <td
                                                    className="px-3 py-2"
                                                    rowSpan={
                                                      invoice.payments.length
                                                    }
                                                  >
                                                    {index + 1}
                                                  </td>
                                                  <td
                                                    className="px-3 py-2 font-medium"
                                                    rowSpan={
                                                      invoice.payments.length
                                                    }
                                                  >
                                                    {invoice.invoice_number}
                                                  </td>
                                                  <td
                                                    className="px-3 py-2"
                                                    rowSpan={
                                                      invoice.payments.length
                                                    }
                                                  >
                                                    {invoice.date}
                                                  </td>
                                                  <td
                                                    className="px-3 py-2 text-right"
                                                    rowSpan={
                                                      invoice.payments.length
                                                    }
                                                  >
                                                    RM{" "}
                                                    {formatCurrency(
                                                      invoice.amount
                                                    )}
                                                  </td>
                                                </>
                                              )}
                                              <td className="px-3 py-2">
                                                {payment.payment_method
                                                  ? payment.payment_method
                                                      .charAt(0)
                                                      .toUpperCase() +
                                                    payment.payment_method.slice(
                                                      1
                                                    )
                                                  : "-"}
                                              </td>
                                              <td className="px-3 py-2">
                                                {payment.payment_reference ||
                                                  "-"}
                                              </td>
                                              <td className="px-3 py-2">
                                                {payment.date}
                                              </td>
                                              <td className="px-3 py-2 text-right text-green-600">
                                                RM{" "}
                                                {formatCurrency(payment.amount)}
                                              </td>
                                              {paymentIndex === 0 && (
                                                <td
                                                  className="px-3 py-2 text-right font-medium text-red-600"
                                                  rowSpan={
                                                    invoice.payments.length
                                                  }
                                                >
                                                  RM{" "}
                                                  {formatCurrency(
                                                    invoice.balance
                                                  )}
                                                </td>
                                              )}
                                            </tr>
                                          )
                                        )
                                      )}
                                    </React.Fragment>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default DebtorsReportPage;
