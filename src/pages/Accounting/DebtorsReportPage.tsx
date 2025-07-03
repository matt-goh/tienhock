// src/pages/Accounting/DebtorsReportPage.tsx
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
  IconCreditCard,
} from "@tabler/icons-react";
import toast from "react-hot-toast";
import Button from "../../components/Button";
import LoadingSpinner from "../../components/LoadingSpinner";
import { api } from "../../routes/utils/api";

interface Invoice {
  invoice_id: number;
  invoice_number: string;
  date: string;
  amount: number;
  payments: Payment[];
  balance: number;
}

interface Payment {
  payment_id: number;
  bank?: string;
  cheque_number?: string;
  date: string;
  amount: number;
}

interface Customer {
  customer_id: string;
  customer_name: string;
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
  report_date: string;
}

const DebtorsReportPage: React.FC = () => {
  const navigate = useNavigate();
  const printRef = useRef<HTMLDivElement>(null);
  const [debtorsData, setDebtorsData] = useState<DebtorsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [expandedSalesmen, setExpandedSalesmen] = useState<Set<string>>(
    new Set()
  );
  const [expandedCustomers, setExpandedCustomers] = useState<Set<string>>(
    new Set()
  );

  useEffect(() => {
    fetchDebtors();
  }, []);

  const fetchDebtors = async () => {
    try {
      setLoading(true);
      const response = await api.get("/api/debtors");

      if (!response.ok) {
        throw new Error("Failed to fetch debtors data");
      }

      const data = await response.json();
      setDebtorsData(data);

      // Expand all salesmen by default
      const salesmenIds = data.salesmen.map((s: Salesman) => s.salesman_id);
      setExpandedSalesmen(new Set(salesmenIds));

      setError(null);
    } catch (err) {
      setError("Failed to fetch debtors data. Please try again later.");
      console.error("Error fetching debtors:", err);
      toast.error("Failed to load debtors report");
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount: number): string => {
    return new Intl.NumberFormat("en-MY", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  };

  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
    });
  };

  const toggleSalesman = (salesmanId: string) => {
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

  const toggleCustomer = (customerId: string) => {
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

  const handleCustomerClick = (customerId: string) => {
    // Navigate to InvoiceListPage with customer filter
    navigate(`/sales/invoice?customerId=${customerId}`);
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

    // Recalculate totals
    filtered.grand_total_balance = filtered.salesmen.reduce(
      (sum, salesman) => sum + salesman.total_balance,
      0
    );

    return filtered;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <LoadingSpinner />
      </div>
    );
  }

  if (error || !debtorsData) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen">
        <IconAlertCircle size={48} className="text-red-500 mb-4" />
        <h2 className="text-xl font-semibold mb-2">Error Loading Report</h2>
        <p className="text-gray-600 mb-4">{error || "No data available"}</p>
        <Button onClick={fetchDebtors} variant="outline">
          Retry
        </Button>
      </div>
    );
  }

  const filteredData = filterData(debtorsData);

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="mb-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Debtors Report</h1>
          <p className="text-sm text-gray-600 mt-1">
            Unpaid Bills by Salesman as at {formatDate(debtorsData.report_date)}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Search */}
          <div className="relative">
            <IconSearch
              className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"
              size={20}
            />
            <input
              type="text"
              placeholder="Search customer..."
              className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
          <h3 className="text-sm font-medium text-gray-600 mb-1">
            Total Amount
          </h3>
          <p className="text-2xl font-bold text-gray-900">
            RM {formatCurrency(filteredData.grand_total_amount)}
          </p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
          <h3 className="text-sm font-medium text-gray-600 mb-1">Total Paid</h3>
          <p className="text-2xl font-bold text-green-600">
            RM {formatCurrency(filteredData.grand_total_paid)}
          </p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
          <h3 className="text-sm font-medium text-gray-600 mb-1">
            Total Outstanding
          </h3>
          <p className="text-2xl font-bold text-red-600">
            RM {formatCurrency(filteredData.grand_total_balance)}
          </p>
        </div>
      </div>

      {/* Report Content */}
      <div ref={printRef} className="bg-white rounded-lg shadow-sm">
        {/* Print Header (hidden on screen) */}
        <div className="hidden print:block text-center mb-6">
          <h1 className="text-xl font-bold">TIEN HOCK FOOD INDUSTRIES S/B</h1>
          <h2 className="text-lg">
            REPORT: UNPAID BILLS BY SALESMAN AS AT{" "}
            {formatDate(debtorsData.report_date).toUpperCase()}
          </h2>
        </div>

        {/* Salesmen List */}
        {filteredData.salesmen.length === 0 ? (
          <div className="p-8 text-center">
            <IconAlertCircle size={48} className="mx-auto mb-4 text-gray-300" />
            <h2 className="text-lg font-medium text-gray-900 mb-1">
              No debtors found
            </h2>
            <p className="text-gray-500">
              {searchTerm
                ? "No customers match your search criteria."
                : "All customer balances are settled."}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {filteredData.salesmen.map((salesman) => (
              <div key={salesman.salesman_id} className="p-4">
                {/* Salesman Header */}
                <div
                  className="flex items-center justify-between cursor-pointer hover:bg-gray-50 -mx-4 px-4 py-2 rounded"
                  onClick={() => toggleSalesman(salesman.salesman_id)}
                >
                  <div className="flex items-center gap-2">
                    {expandedSalesmen.has(salesman.salesman_id) ? (
                      <IconChevronDown size={20} className="text-gray-500" />
                    ) : (
                      <IconChevronRight size={20} className="text-gray-500" />
                    )}
                    <IconUser size={20} className="text-gray-600" />
                    <h3 className="font-semibold text-gray-900">
                      SALESMAN: {salesman.salesman_name}
                    </h3>
                  </div>
                  <span className="text-sm font-medium text-red-600">
                    RM {formatCurrency(salesman.total_balance)}
                  </span>
                </div>

                {/* Customers List */}
                {expandedSalesmen.has(salesman.salesman_id) && (
                  <div className="mt-4 ml-7 space-y-4">
                    {salesman.customers.map((customer) => (
                      <div
                        key={customer.customer_id}
                        className="border border-gray-200 rounded-lg"
                      >
                        {/* Customer Header */}
                        <div
                          className="flex items-center justify-between p-3 bg-gray-50 cursor-pointer hover:bg-gray-100 rounded-t-lg"
                          onClick={() =>
                            toggleCustomer(
                              `${salesman.salesman_id}-${customer.customer_id}`
                            )
                          }
                        >
                          <div className="flex items-center gap-2">
                            {expandedCustomers.has(
                              `${salesman.salesman_id}-${customer.customer_id}`
                            ) ? (
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
                            <span className="font-medium text-gray-900">
                              {customer.customer_id} - {customer.customer_name}
                            </span>
                          </div>
                          <div className="flex items-center gap-4">
                            <span className="text-sm text-gray-600">
                              Balance:{" "}
                              <span className="font-semibold text-red-600">
                                RM {formatCurrency(customer.total_balance)}
                              </span>
                            </span>
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

                        {/* Invoice Details */}
                        {expandedCustomers.has(
                          `${salesman.salesman_id}-${customer.customer_id}`
                        ) && (
                          <div className="p-3">
                            {/* Invoice Table */}
                            <div className="overflow-x-auto">
                              <table className="min-w-full text-sm">
                                <thead>
                                  <tr className="border-b border-gray-200">
                                    <th className="text-left py-2 px-2 font-medium text-gray-700">
                                      NO.
                                    </th>
                                    <th className="text-left py-2 px-2 font-medium text-gray-700">
                                      REF./NO
                                    </th>
                                    <th className="text-left py-2 px-2 font-medium text-gray-700">
                                      DATE
                                    </th>
                                    <th className="text-right py-2 px-2 font-medium text-gray-700">
                                      AMOUNT
                                    </th>
                                    <th className="text-left py-2 px-2 font-medium text-gray-700">
                                      BANK
                                    </th>
                                    <th className="text-left py-2 px-2 font-medium text-gray-700">
                                      CHQ/NO
                                    </th>
                                    <th className="text-left py-2 px-2 font-medium text-gray-700">
                                      DATE
                                    </th>
                                    <th className="text-right py-2 px-2 font-medium text-gray-700">
                                      AMOUNT
                                    </th>
                                    <th className="text-right py-2 px-2 font-medium text-gray-700">
                                      BALANCE
                                    </th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {customer.invoices.map((invoice, index) => (
                                    <React.Fragment key={invoice.invoice_id}>
                                      {invoice.payments.length === 0 ? (
                                        <tr className="border-b border-gray-100">
                                          <td className="py-2 px-2">
                                            {index + 1}
                                          </td>
                                          <td className="py-2 px-2">
                                            {invoice.invoice_number}
                                          </td>
                                          <td className="py-2 px-2">
                                            {formatDate(invoice.date)}
                                          </td>
                                          <td className="py-2 px-2 text-right">
                                            {formatCurrency(invoice.amount)}
                                          </td>
                                          <td className="py-2 px-2"></td>
                                          <td className="py-2 px-2"></td>
                                          <td className="py-2 px-2"></td>
                                          <td className="py-2 px-2 text-right"></td>
                                          <td className="py-2 px-2 text-right font-medium">
                                            {formatCurrency(invoice.balance)}
                                          </td>
                                        </tr>
                                      ) : (
                                        invoice.payments.map(
                                          (payment, paymentIndex) => (
                                            <tr
                                              key={`${invoice.invoice_id}-${payment.payment_id}`}
                                              className="border-b border-gray-100"
                                            >
                                              {paymentIndex === 0 && (
                                                <>
                                                  <td
                                                    className="py-2 px-2"
                                                    rowSpan={
                                                      invoice.payments.length
                                                    }
                                                  >
                                                    {index + 1}
                                                  </td>
                                                  <td
                                                    className="py-2 px-2"
                                                    rowSpan={
                                                      invoice.payments.length
                                                    }
                                                  >
                                                    {invoice.invoice_number}
                                                  </td>
                                                  <td
                                                    className="py-2 px-2"
                                                    rowSpan={
                                                      invoice.payments.length
                                                    }
                                                  >
                                                    {formatDate(invoice.date)}
                                                  </td>
                                                  <td
                                                    className="py-2 px-2 text-right"
                                                    rowSpan={
                                                      invoice.payments.length
                                                    }
                                                  >
                                                    {formatCurrency(
                                                      invoice.amount
                                                    )}
                                                  </td>
                                                </>
                                              )}
                                              <td className="py-2 px-2">
                                                {payment.bank || ""}
                                              </td>
                                              <td className="py-2 px-2">
                                                {payment.cheque_number || ""}
                                              </td>
                                              <td className="py-2 px-2">
                                                {formatDate(payment.date)}
                                              </td>
                                              <td className="py-2 px-2 text-right">
                                                {formatCurrency(payment.amount)}
                                              </td>
                                              {paymentIndex === 0 && (
                                                <td
                                                  className="py-2 px-2 text-right font-medium"
                                                  rowSpan={
                                                    invoice.payments.length
                                                  }
                                                >
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
                                  {/* Subtotal Row */}
                                  <tr className="border-t-2 border-gray-300 font-semibold">
                                    <td
                                      colSpan={3}
                                      className="py-2 px-2 text-right"
                                    >
                                      SUB-TOTAL:
                                    </td>
                                    <td className="py-2 px-2 text-right">
                                      {formatCurrency(customer.total_amount)}
                                    </td>
                                    <td colSpan={3}></td>
                                    <td className="py-2 px-2 text-right">
                                      {formatCurrency(customer.total_paid)}
                                    </td>
                                    <td className="py-2 px-2 text-right">
                                      {formatCurrency(customer.total_balance)}
                                    </td>
                                  </tr>
                                </tbody>
                              </table>
                            </div>

                            {/* Credit Info */}
                            <div className="mt-3 flex items-center gap-6 text-sm">
                              <div className="flex items-center gap-2">
                                <IconCreditCard
                                  size={16}
                                  className="text-gray-500"
                                />
                                <span className="text-gray-600">
                                  Credit Limit:
                                </span>
                                <span className="font-medium">
                                  RM {formatCurrency(customer.credit_limit)}
                                </span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-gray-600">
                                  Credit Bal:
                                </span>
                                <span className="font-medium text-green-600">
                                  RM {formatCurrency(customer.credit_balance)}
                                </span>
                              </div>
                              <div className="flex items-center gap-2">
                                <IconCalendar
                                  size={16}
                                  className="text-gray-500"
                                />
                                <span className="text-gray-600">As at:</span>
                                <span className="font-medium">
                                  {formatDate(debtorsData.report_date)}
                                </span>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}

            {/* Grand Total */}
            <div className="p-4 bg-gray-50 border-t-2 border-gray-300">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-gray-900">GRAND TOTAL</h3>
                <div className="flex items-center gap-8">
                  <div className="text-right">
                    <p className="text-sm text-gray-600">Amount</p>
                    <p className="font-bold text-lg">
                      RM {formatCurrency(filteredData.grand_total_amount)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-gray-600">Paid</p>
                    <p className="font-bold text-lg text-green-600">
                      RM {formatCurrency(filteredData.grand_total_paid)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-gray-600">Balance</p>
                    <p className="font-bold text-lg text-red-600">
                      RM {formatCurrency(filteredData.grand_total_balance)}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default DebtorsReportPage;
