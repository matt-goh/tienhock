// src/pages/Accounting/DebtorsReportPage.tsx
import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  IconDownload,
  IconChevronDown,
  IconChevronRight,
  IconAlertCircle,
  IconUser,
  IconBuildingStore,
  IconRefresh,
  IconPhone,
  IconFileText,
  IconReceipt,
  IconCheck,
} from "@tabler/icons-react";
import MonthNavigator from "../../components/MonthNavigator";
import Button from "../../components/Button";
import LoadingSpinner from "../../components/LoadingSpinner";
import { api } from "../../routes/utils/api";
import { useCompany } from "../../contexts/CompanyContext";
import { generateDebtorsReportPDF } from "../../utils/accounting/DebtorsReportPDF";
import { generateCustomerStatementPDF } from "../../utils/accounting/CustomerStatementPDF";
import { generateGeneralStatementPDF } from "../../utils/accounting/GeneralStatementPDF";
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
  address?: string;
  city?: string;
  state?: string;
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

  const handlePrintStatement = async (customer: Customer): Promise<void> => {
    if (allTimeMode) {
      toast.error("Please select a specific month to print statement");
      return;
    }

    try {
      const loadingToast = toast.loading("Generating statement...");
      const month = selectedMonth.getMonth() + 1;
      const year = selectedMonth.getFullYear();

      const statementData = await api.get(
        `/api/debtors/statement/${customer.customer_id}?month=${month}&year=${year}`
      );

      await generateCustomerStatementPDF(statementData, "print");
      toast.dismiss(loadingToast);
      toast.success("Statement generated");
    } catch (error) {
      console.error("Error generating customer statement:", error);
      toast.error("Failed to generate statement");
    }
  };

  const handlePrintGeneralStatement = async (): Promise<void> => {
    if (allTimeMode) {
      toast.error("Please select a specific month to print general statement");
      return;
    }

    try {
      const loadingToast = toast.loading("Generating trade debtor list...");
      const month = selectedMonth.getMonth() + 1;
      const year = selectedMonth.getFullYear();

      const statementData = await api.get(
        `/api/debtors/general-statement?month=${month}&year=${year}`
      );

      await generateGeneralStatementPDF(statementData, "print");
      toast.dismiss(loadingToast);
      toast.success("Trade debtor list generated");
    } catch (error) {
      console.error("Error generating general statement:", error);
      toast.error("Failed to generate trade debtor list");
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
    // Recalculate all totals based on filtered data
    filtered.grand_total_amount = filtered.salesmen.reduce(
      (sum, salesman) =>
        sum +
        salesman.customers.reduce(
          (customerSum, customer) => customerSum + customer.total_amount,
          0
        ),
      0
    );
    filtered.grand_total_paid = filtered.salesmen.reduce(
      (sum, salesman) =>
        sum +
        salesman.customers.reduce(
          (customerSum, customer) => customerSum + customer.total_paid,
          0
        ),
      0
    );
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
      <div className="flex justify-center items-center h-96">
        <LoadingSpinner />
      </div>
    );
  }

  if (error || !debtorsData) {
    return (
      <div className="text-center py-12 border border-default-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800">
        <IconAlertCircle size={48} className="text-rose-500 dark:text-rose-400 mb-4 mx-auto" />
        <h3 className="text-lg font-medium text-default-800 dark:text-gray-100 mb-2">
          Error Loading Report
        </h3>
        <p className="text-default-500 dark:text-gray-400 mb-6">{error}</p>
        <Button onClick={handleRefresh} icon={IconRefresh} variant="outline">
          Refresh
        </Button>
      </div>
    );
  }

  const filteredData = filterData(debtorsData);

  return (
    <div className="space-y-3">
      {/* Header Row */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-2 mb-3">
        {/* Left side: Month Navigator + Stats */}
        <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-3">
          <MonthNavigator
            selectedMonth={selectedMonth}
            onChange={handleMonthChange}
            showGoToCurrentButton={false}
            size="sm"
          />

          {/* Compact Stats */}
          <div className="flex items-center flex-wrap gap-x-3 gap-y-1 text-sm">
            <div className="flex items-center gap-1.5">
              <IconReceipt size={16} className="text-sky-600 dark:text-sky-400" />
              <span className="font-semibold text-default-700 dark:text-gray-200">
                RM {formatCurrency(filteredData.grand_total_amount)}
              </span>
              <span className="text-default-400 dark:text-gray-400">total</span>
            </div>
            <span className="text-default-300 dark:text-gray-600">•</span>
            <div className="flex items-center gap-1.5">
              <IconCheck size={16} className="text-emerald-600 dark:text-emerald-400" />
              <span className="font-semibold text-emerald-700 dark:text-emerald-300">
                RM {formatCurrency(filteredData.grand_total_paid)}
              </span>
              <span className="text-default-400 dark:text-gray-400">paid</span>
            </div>
            <span className="text-default-300 dark:text-gray-600">•</span>
            <div className="flex items-center gap-1.5">
              <IconAlertCircle size={16} className="text-rose-600 dark:text-rose-400" />
              <span className="font-semibold text-rose-700 dark:text-rose-300">
                RM {formatCurrency(filteredData.grand_total_balance)}
              </span>
              <span className="text-default-400 dark:text-gray-400">outstanding</span>
            </div>
            <span className="text-default-300 dark:text-gray-600">|</span>
            {/* All Time Toggle */}
            <button
              onClick={handleAllTimeToggle}
              className={`px-3 py-1 rounded-full border text-sm font-medium transition-colors whitespace-nowrap ${
                allTimeMode
                  ? "bg-sky-100 dark:bg-sky-900/40 border-sky-300 dark:border-sky-700 text-sky-700 dark:text-sky-300"
                  : "bg-default-50 dark:bg-gray-700 border-default-300 dark:border-gray-600 text-default-600 dark:text-gray-300 hover:bg-default-100 dark:hover:bg-gray-600"
              }`}
            >
              All Time
            </button>
          </div>
        </div>

        {/* Right side: Search + Actions */}
        <div className="flex space-x-2">
          <div className="relative">
            <input
              type="text"
              placeholder="Search customers..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="px-3 py-1 border border-default-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-full text-sm focus:outline-none focus:ring-1 focus:ring-sky-500 dark:focus:ring-sky-400 focus:border-sky-500 dark:focus:border-sky-400 w-[154px] placeholder-gray-400 dark:placeholder-gray-500"
            />
            {searchTerm && (
              <button
                type="button"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-default-400 dark:text-gray-400 hover:text-default-700 dark:hover:text-gray-300 transition-colors"
                onClick={() => setSearchTerm("")}
                title="Clear search"
              >
                ×
              </button>
            )}
          </div>
          <Button
            onClick={handleRefresh}
            variant="outline"
            size="sm"
            icon={IconRefresh}
          >
            Refresh
          </Button>
          <Button
            onClick={handlePrint}
            size="sm"
            icon={IconDownload}
            disabled={loading}
          >
            Report
          </Button>
          <Button
            onClick={handlePrintGeneralStatement}
            size="sm"
            variant="outline"
            icon={IconReceipt}
            disabled={loading || allTimeMode}
            title={allTimeMode ? "Select a specific month to print debtor list" : "Print debtor list for all customers"}
          >
            Debtor List
          </Button>
        </div>
      </div>

      {/* Report Content */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-default-200 dark:border-gray-700">
        {filteredData.salesmen.length === 0 ? (
          <div className="text-center py-8">
            <IconUser size={48} className="text-default-400 dark:text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-default-800 dark:text-gray-100 mb-2">
              No Results Found
            </h3>
            <p className="text-default-500 dark:text-gray-400">
              {searchTerm
                ? "No customers match your search criteria."
                : "No debtors data available for the selected period."}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-default-200 dark:divide-gray-700">
            {filteredData.salesmen.map((salesman) => (
              <div key={salesman.salesman_id} className="p-4">
                {/* Salesman Header */}
                <div
                  className="flex items-center justify-between cursor-pointer hover:bg-default-50 dark:hover:bg-gray-700 -m-4 px-4 py-3 rounded-lg transition-colors"
                  onClick={() => toggleSalesman(salesman.salesman_id)}
                >
                  <div className="flex items-center gap-3">
                    {expandedSalesmen.has(salesman.salesman_id) ? (
                      <IconChevronDown size={20} className="text-default-500 dark:text-gray-400" />
                    ) : (
                      <IconChevronRight size={20} className="text-default-500 dark:text-gray-400" />
                    )}
                    <IconUser size={20} className="text-sky-600 dark:text-sky-400" />
                    <div>
                      <h3 className="text-lg font-semibold text-default-800 dark:text-gray-100">
                        {salesman.salesman_name}
                      </h3>
                      <p className="text-sm text-default-500 dark:text-gray-400">
                        {salesman.customers.length} customer
                        {salesman.customers.length !== 1 ? "s" : ""}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-default-500 dark:text-gray-400">Outstanding</p>
                    <p className="text-lg font-bold text-rose-600 dark:text-rose-400">
                      RM {formatCurrency(salesman.total_balance)}
                    </p>
                  </div>
                </div>

                {/* Customers */}
                {expandedSalesmen.has(salesman.salesman_id) && (
                  <div className="mt-4 ml-8 space-y-3">
                    {salesman.customers.map((customer) => (
                      <div
                        key={customer.customer_id}
                        className="border border-default-200 dark:border-gray-700 rounded-lg"
                      >
                        {/* Customer Header */}
                        <div
                          className="flex items-center justify-between p-3 cursor-pointer hover:bg-default-50 dark:hover:bg-gray-700 transition-colors"
                          onClick={() => toggleCustomer(customer.customer_id)}
                        >
                          <div className="flex items-center gap-8">
                            <div className="flex items-center gap-3">
                              {expandedCustomers.has(customer.customer_id) ? (
                                <IconChevronDown
                                  size={16}
                                  className="text-default-500 dark:text-gray-400"
                                />
                              ) : (
                                <IconChevronRight
                                  size={16}
                                  className="text-default-500 dark:text-gray-400"
                                />
                              )}
                              <IconBuildingStore
                                size={16}
                                className="text-sky-600 dark:text-sky-400"
                              />
                              <div>
                                <span
                                  className="font-medium text-default-800 dark:text-gray-100 hover:text-sky-600 dark:hover:text-sky-400 hover:underline cursor-pointer"
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
                                <p className="text-sm text-default-500 dark:text-gray-400">
                                  ID: {customer.customer_id} •{" "}
                                  {customer.invoices.length} invoice
                                  {customer.invoices.length !== 1 ? "s" : ""}
                                </p>
                              </div>
                            </div>
                            {customer.phone_number && (
                              <div className="flex items-center gap-2 text-default-600 dark:text-gray-400">
                                <IconPhone
                                  size={16}
                                  className="text-default-500 dark:text-gray-400"
                                />
                                <span className="font-medium">
                                  {customer.phone_number}
                                </span>
                              </div>
                            )}
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="text-right">
                              <p className="text-xs text-default-500 dark:text-gray-400">Balance</p>
                              <p className="font-semibold text-rose-600 dark:text-rose-400">
                                RM {formatCurrency(customer.total_balance)}
                              </p>
                            </div>
                            <Button
                              size="sm"
                              variant="outline"
                              icon={IconFileText}
                              disabled={allTimeMode}
                              title={allTimeMode ? "Select a specific month to print statement" : "Print Statement"}
                              onClick={(e) => {
                                e.stopPropagation();
                                handlePrintStatement(customer);
                              }}
                            >
                              Statement
                            </Button>
                            <Button
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleCustomerClick(customer.customer_id);
                              }}
                            >
                              Invoices
                            </Button>
                          </div>
                        </div>

                        {/* Customer Details */}
                        {expandedCustomers.has(customer.customer_id) && (
                          <div className="border-t border-default-200 dark:border-gray-700 p-3">
                            {/* Customer Summary */}
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
                              <div>
                                <p className="text-xs text-default-500 dark:text-gray-400 uppercase">
                                  Total Amount
                                </p>
                                <p className="font-medium text-default-800 dark:text-gray-100">
                                  RM {formatCurrency(customer.total_amount)}
                                </p>
                              </div>
                              <div>
                                <p className="text-xs text-default-500 dark:text-gray-400 uppercase">
                                  Total Paid
                                </p>
                                <p className="font-medium text-emerald-600 dark:text-emerald-400">
                                  RM {formatCurrency(customer.total_paid)}
                                </p>
                              </div>
                              <div>
                                <p className="text-xs text-default-500 dark:text-gray-400 uppercase">
                                  Credit Limit
                                </p>
                                <p className="font-medium text-default-800 dark:text-gray-100">
                                  RM {formatCurrency(customer.credit_limit)}
                                </p>
                              </div>
                              <div>
                                <p className="text-xs text-default-500 dark:text-gray-400 uppercase">
                                  Credit Balance
                                </p>
                                <p className="font-medium text-default-800 dark:text-gray-100">
                                  RM {formatCurrency(customer.credit_balance)}
                                </p>
                              </div>
                            </div>

                            {/* Invoices Table */}
                            <div className="overflow-x-auto">
                              <table className="min-w-full text-sm">
                                <thead>
                                  <tr className="bg-default-100 dark:bg-gray-900/50">
                                    <th className="px-3 py-2 text-left text-xs font-medium text-default-500 dark:text-gray-400 uppercase">
                                      #
                                    </th>
                                    <th className="px-3 py-2 text-left text-xs font-medium text-default-500 dark:text-gray-400 uppercase">
                                      Invoice No.
                                    </th>
                                    <th className="px-3 py-2 text-left text-xs font-medium text-default-500 dark:text-gray-400 uppercase">
                                      Date
                                    </th>
                                    <th className="px-3 py-2 text-right text-xs font-medium text-default-500 dark:text-gray-400 uppercase">
                                      Amount
                                    </th>
                                    <th className="px-3 py-2 text-left text-xs font-medium text-default-500 dark:text-gray-400 uppercase">
                                      Payment Method
                                    </th>
                                    <th className="px-3 py-2 text-left text-xs font-medium text-default-500 dark:text-gray-400 uppercase">
                                      Reference
                                    </th>
                                    <th className="px-3 py-2 text-left text-xs font-medium text-default-500 dark:text-gray-400 uppercase">
                                      Payment Date
                                    </th>
                                    <th className="px-3 py-2 text-right text-xs font-medium text-default-500 dark:text-gray-400 uppercase">
                                      Paid Amount
                                    </th>
                                    <th className="px-3 py-2 text-right text-xs font-medium text-default-500 dark:text-gray-400 uppercase">
                                      Balance
                                    </th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-default-200 dark:divide-gray-700">
                                  {customer.invoices.map((invoice, index) => (
                                    <React.Fragment key={invoice.invoice_id}>
                                      {invoice.payments.length === 0 ? (
                                        <tr
                                          className="hover:bg-default-50 dark:hover:bg-gray-700 cursor-pointer text-default-800 dark:text-gray-100"
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
                                          <td className="px-3 py-2 text-default-400 dark:text-gray-500">
                                            -
                                          </td>
                                          <td className="px-3 py-2 text-default-400 dark:text-gray-500">
                                            -
                                          </td>
                                          <td className="px-3 py-2 text-default-400 dark:text-gray-500">
                                            -
                                          </td>
                                          <td className="px-3 py-2 text-right text-default-400 dark:text-gray-500">
                                            -
                                          </td>
                                          <td className="px-3 py-2 text-right font-medium text-rose-600 dark:text-rose-400">
                                            RM {formatCurrency(invoice.balance)}
                                          </td>
                                        </tr>
                                      ) : (
                                        invoice.payments.map(
                                          (payment, paymentIndex) => (
                                            <tr
                                              key={`${invoice.invoice_id}-${payment.payment_id}`}
                                              className={`hover:bg-default-50 dark:hover:bg-gray-700 text-default-800 dark:text-gray-100 ${
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
                                              <td className="px-3 py-2 text-right text-emerald-600 dark:text-emerald-400">
                                                RM{" "}
                                                {formatCurrency(payment.amount)}
                                              </td>
                                              {paymentIndex === 0 && (
                                                <td
                                                  className="px-3 py-2 text-right font-medium text-rose-600 dark:text-rose-400"
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
