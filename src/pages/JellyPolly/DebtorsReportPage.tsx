// src/pages/JellyPolly/DebtorsReportPage.tsx
import React, { useState, useEffect, useRef } from "react";
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
  IconCurrencyDollar,
  IconPhone,
} from "@tabler/icons-react";
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

  useEffect(() => {
    fetchDebtors();
  }, []);

  const fetchDebtors = async (): Promise<void> => {
    try {
      setLoading(true);
      setError(null);

      // Use JellyPolly-specific API endpoint
      const response = await api.get("/jellypolly/api/debtors");
      const data = response;

      // Process data with proper date conversion
      const processedData: DebtorsData = {
        ...data,
        report_date: formatDateFromTimestamp(data.report_date),
        salesmen: data.salesmen.map((salesman: Salesman) => ({
          ...salesman,
          customers: salesman.customers.map((customer: Customer) => ({
            ...customer,
            invoices: customer.invoices.map((invoice: Invoice) => ({
              ...invoice,
              date: formatDateFromTimestamp(invoice.date),
              payments: invoice.payments.map((payment: Payment) => ({
                ...payment,
                date: formatDateFromTimestamp(payment.date),
              })),
            })),
          })),
        })),
      };

      setDebtorsData(processedData);
    } catch (err: any) {
      console.error("Error fetching debtors:", err);
      setError(
        err.response?.data?.message || err.message || "Failed to load debtors"
      );
      toast.error("Failed to load debtors report");
    } finally {
      setLoading(false);
    }
  };

  const formatDateFromTimestamp = (timestamp: string | number): string => {
    if (!timestamp) return "";
    
    let dateValue: number;
    if (typeof timestamp === 'string') {
      // Try parsing as number first
      const parsed = parseInt(timestamp, 10);
      if (!isNaN(parsed)) {
        dateValue = parsed;
      } else {
        // Try parsing as ISO string
        const isoDate = new Date(timestamp);
        if (!isNaN(isoDate.getTime())) {
          dateValue = isoDate.getTime();
        } else {
          return timestamp; // Return as-is if can't parse
        }
      }
    } else {
      dateValue = timestamp;
    }

    const date = new Date(dateValue);
    if (isNaN(date.getTime())) {
      return String(timestamp); // Return as-is if invalid
    }

    return date.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  };

  const formatCurrency = (amount: number): string => {
    return new Intl.NumberFormat("en-MY", {
      style: "currency",
      currency: "MYR",
      minimumFractionDigits: 2,
    }).format(amount);
  };

  const getDaysSinceInvoice = (invoiceDate: string): number => {
    const today = new Date();
    const invDate = new Date(invoiceDate);
    const timeDiff = today.getTime() - invDate.getTime();
    return Math.floor(timeDiff / (1000 * 3600 * 24));
  };

  const getAgingCategory = (days: number): string => {
    if (days <= 30) return "0-30 days";
    if (days <= 60) return "31-60 days";
    if (days <= 90) return "61-90 days";
    return "90+ days";
  };

  const toggleSalesmanExpansion = (salesmanId: string): void => {
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

  const toggleCustomerExpansion = (customerId: string): void => {
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

  const filteredData = debtorsData
    ? {
        ...debtorsData,
        salesmen: debtorsData.salesmen
          .map((salesman) => ({
            ...salesman,
            customers: salesman.customers.filter(
              (customer) =>
                customer.customer_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                customer.customer_id.toLowerCase().includes(searchTerm.toLowerCase()) ||
                salesman.salesman_name.toLowerCase().includes(searchTerm.toLowerCase())
            ),
          }))
          .filter((salesman) => salesman.customers.length > 0),
      }
    : null;

  const handleExportPDF = async (): Promise<void> => {
    if (!filteredData) return;

    try {
      // The generateDebtorsReportPDF function handles the download internally when "download" is passed
      await generateDebtorsReportPDF(filteredData, "download");
      toast.success("Debtors report exported successfully");
    } catch (error) {
      console.error("Error exporting PDF:", error);
      toast.error("Failed to export PDF");
    }
  };

  const handleCustomerClick = (customerId: string): void => {
    navigate(`/catalogue/customer/${customerId}`);
  };

  const handleInvoiceClick = (invoiceId: string): void => {
    navigate(`/sales/invoice/${invoiceId}`);
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <LoadingSpinner />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <IconAlertCircle className="mx-auto h-12 w-12 text-red-500 mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">Error Loading Report</h3>
            <p className="text-gray-600 mb-4">{error}</p>
            <Button onClick={fetchDebtors} variant="outline" icon={IconRefresh}>
              Retry
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (!filteredData || filteredData.salesmen.length === 0) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <IconUser className="mx-auto h-12 w-12 text-gray-400 mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No Debtors Found</h3>
            <p className="text-gray-600">All customers are up to date with their payments.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-full">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <IconBuildingStore className="h-6 w-6 text-blue-600" />
            JellyPolly Debtors Report
          </h1>
          <p className="text-sm text-gray-600 mt-1 flex items-center gap-2">
            <IconCalendar className="h-4 w-4" />
            Report Date: {filteredData.report_date}
          </p>
        </div>
        
        <div className="flex items-center gap-3">
          <Button
            onClick={fetchDebtors}
            variant="outline"
            icon={IconRefresh}
            disabled={loading}
          >
            Refresh
          </Button>
          <Button
            onClick={handleExportPDF}
            variant="filled"
            color="sky"
            icon={IconDownload}
          >
            Export PDF
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-white p-4 rounded-lg border shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Total Outstanding</p>
              <p className="text-2xl font-bold text-red-600">
                {formatCurrency(filteredData.grand_total_balance)}
              </p>
            </div>
            <IconCurrencyDollar className="h-8 w-8 text-red-500" />
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg border shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Total Invoiced</p>
              <p className="text-2xl font-bold text-blue-600">
                {formatCurrency(filteredData.grand_total_amount)}
              </p>
            </div>
            <IconCalendarDollar className="h-8 w-8 text-blue-500" />
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg border shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Total Paid</p>
              <p className="text-2xl font-bold text-green-600">
                {formatCurrency(filteredData.grand_total_paid)}
              </p>
            </div>
            <IconCurrencyDollar className="h-8 w-8 text-green-500" />
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="mb-6">
        <div className="relative max-w-md">
          <IconSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={16} />
          <input
            type="text"
            placeholder="Search customers or salesmen..."
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {/* Debtors List */}
      <div className="space-y-4" ref={printRef}>
        {filteredData.salesmen.map((salesman) => (
          <div key={salesman.salesman_id} className="bg-white rounded-lg border shadow-sm">
            <div
              className="flex items-center justify-between p-4 cursor-pointer hover:bg-gray-50"
              onClick={() => toggleSalesmanExpansion(salesman.salesman_id)}
            >
              <div className="flex items-center gap-3">
                {expandedSalesmen.has(salesman.salesman_id) ? (
                  <IconChevronDown className="h-5 w-5 text-gray-400" />
                ) : (
                  <IconChevronRight className="h-5 w-5 text-gray-400" />
                )}
                <div>
                  <h3 className="font-semibold text-gray-900">
                    {salesman.salesman_name} ({salesman.salesman_id})
                  </h3>
                  <p className="text-sm text-gray-600">
                    {salesman.customers.length} customer(s)
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className="font-semibold text-red-600">
                  {formatCurrency(salesman.total_balance)}
                </p>
                <p className="text-sm text-gray-600">Outstanding</p>
              </div>
            </div>

            {expandedSalesmen.has(salesman.salesman_id) && (
              <div className="border-t border-gray-200">
                {salesman.customers.map((customer) => (
                  <div key={customer.customer_id} className="border-b border-gray-100 last:border-b-0">
                    <div
                      className="flex items-center justify-between p-4 pl-12 cursor-pointer hover:bg-gray-50"
                      onClick={() => toggleCustomerExpansion(customer.customer_id)}
                    >
                      <div className="flex items-center gap-3">
                        {expandedCustomers.has(customer.customer_id) ? (
                          <IconChevronDown className="h-4 w-4 text-gray-400" />
                        ) : (
                          <IconChevronRight className="h-4 w-4 text-gray-400" />
                        )}
                        <div>
                          <h4
                            className="font-medium text-gray-900 hover:text-blue-600 cursor-pointer"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCustomerClick(customer.customer_id);
                            }}
                          >
                            {customer.customer_name}
                          </h4>
                          <div className="flex items-center gap-4 text-sm text-gray-600">
                            <span>ID: {customer.customer_id}</span>
                            {customer.phone_number && (
                              <span className="flex items-center gap-1">
                                <IconPhone className="h-3 w-3" />
                                {customer.phone_number}
                              </span>
                            )}
                            <span>{customer.invoices.length} invoice(s)</span>
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-medium text-red-600">
                          {formatCurrency(customer.total_balance)}
                        </p>
                        <p className="text-sm text-gray-600">
                          Credit: {formatCurrency(customer.credit_limit)}
                        </p>
                      </div>
                    </div>

                    {expandedCustomers.has(customer.customer_id) && (
                      <div className="bg-gray-50 p-4 pl-16">
                        <div className="overflow-x-auto">
                          <table className="min-w-full text-sm">
                            <thead>
                              <tr className="border-b">
                                <th className="text-left py-2 font-medium text-gray-700">Invoice</th>
                                <th className="text-left py-2 font-medium text-gray-700">Date</th>
                                <th className="text-right py-2 font-medium text-gray-700">Amount</th>
                                <th className="text-right py-2 font-medium text-gray-700">Paid</th>
                                <th className="text-right py-2 font-medium text-gray-700">Balance</th>
                                <th className="text-center py-2 font-medium text-gray-700">Age</th>
                              </tr>
                            </thead>
                            <tbody>
                              {customer.invoices.map((invoice) => {
                                const days = getDaysSinceInvoice(invoice.date);
                                const category = getAgingCategory(days);
                                
                                return (
                                  <tr key={invoice.invoice_id} className="border-b border-gray-200">
                                    <td className="py-2">
                                      <button
                                        className="text-blue-600 hover:text-blue-800 font-medium"
                                        onClick={() => handleInvoiceClick(invoice.invoice_id)}
                                      >
                                        {invoice.invoice_number}
                                      </button>
                                    </td>
                                    <td className="py-2 text-gray-600">{invoice.date}</td>
                                    <td className="py-2 text-right">{formatCurrency(invoice.amount)}</td>
                                    <td className="py-2 text-right text-green-600">
                                      {formatCurrency(invoice.amount - invoice.balance)}
                                    </td>
                                    <td className="py-2 text-right font-medium text-red-600">
                                      {formatCurrency(invoice.balance)}
                                    </td>
                                    <td className="py-2 text-center">
                                      <span
                                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                          days <= 30
                                            ? "bg-green-100 text-green-800"
                                            : days <= 60
                                            ? "bg-yellow-100 text-yellow-800"
                                            : days <= 90
                                            ? "bg-orange-100 text-orange-800"
                                            : "bg-red-100 text-red-800"
                                        }`}
                                      >
                                        {days} days
                                      </span>
                                    </td>
                                  </tr>
                                );
                              })}
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
    </div>
  );
};

export default DebtorsReportPage;