// src/pages/GreenTarget/DebtorsReportPage.tsx
import React, { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  IconSearch,
  IconDownload,
  IconFilter,
  IconAlertCircle,
  IconPhone,
  IconFileInvoice,
} from "@tabler/icons-react";
import toast from "react-hot-toast";
import Button from "../../components/Button";
import { greenTargetApi } from "../../routes/greentarget/api";
import LoadingSpinner from "../../components/LoadingSpinner";

interface Debtor {
  customer_id: number;
  name: string;
  phone_number: string;
  total_invoiced: number;
  total_paid: number;
  balance: number;
}

const DebtorsReportPage: React.FC = () => {
  const navigate = useNavigate();
  const [debtors, setDebtors] = useState<Debtor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [sortBy, setSortBy] = useState<{
    field: keyof Debtor;
    direction: "asc" | "desc";
  }>({ field: "balance", direction: "desc" });
  const [minBalance, setMinBalance] = useState<number | null>(null);
  const [isFilterOpen, setIsFilterOpen] = useState(false);

  useEffect(() => {
    fetchDebtors();
  }, []);

  const fetchDebtors = async () => {
    try {
      setLoading(true);
      const data = await greenTargetApi.getDebtorsReport();
      setDebtors(data);
      setError(null);
    } catch (err) {
      setError("Failed to fetch debtors. Please try again later.");
      console.error("Error fetching debtors:", err);
    } finally {
      setLoading(false);
    }
  };

  // Format currency
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-MY", {
      style: "currency",
      currency: "MYR",
    }).format(amount);
  };

  const handleSort = (field: keyof Debtor) => {
    setSortBy((prev) => {
      if (prev.field === field) {
        return { field, direction: prev.direction === "asc" ? "desc" : "asc" };
      }
      return { field, direction: "desc" };
    });
  };

  const handleExportCSV = () => {
    // This would be implemented to export data to CSV
    toast.success("Export functionality would be implemented here");
  };

  const handleViewInvoices = (customerId: number) => {
    navigate(
      `/greentarget/invoices?customer_id=${customerId}&outstanding_only=true`
    );
  };

  const filteredDebtors = useMemo(() => {
    return debtors.filter((debtor) => {
      const matchesSearch =
        debtor.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        debtor.phone_number?.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesMinBalance =
        minBalance === null || debtor.balance >= minBalance;
      return matchesSearch && matchesMinBalance;
    });
  }, [debtors, searchTerm, minBalance]);

  const sortedDebtors = useMemo(() => {
    return [...filteredDebtors].sort((a, b) => {
      const aValue = a[sortBy.field];
      const bValue = b[sortBy.field];

      if (sortBy.direction === "asc") {
        return aValue > bValue ? 1 : aValue < bValue ? -1 : 0;
      } else {
        return aValue < bValue ? 1 : aValue > bValue ? -1 : 0;
      }
    });
  }, [filteredDebtors, sortBy]);

  // Calculate summary statistics
  const totalOutstanding = useMemo(() => {
    return sortedDebtors.reduce((sum, debtor) => sum + debtor.balance, 0);
  }, [sortedDebtors]);

  const averageDebt = useMemo(() => {
    return sortedDebtors.length > 0
      ? totalOutstanding / sortedDebtors.length
      : 0;
  }, [sortedDebtors, totalOutstanding]);

  if (loading) {
    return (
      <div className="mt-40 w-full flex items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  if (error) {
    return <div>Error: {error}</div>;
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-default-900">
            Debtors Report
          </h1>
          <p className="text-default-500 mt-1">
            {sortedDebtors.length} customers with outstanding balances
          </p>
        </div>

        <div className="flex space-x-3 mt-4 md:mt-0">
          <div className="relative">
            <IconSearch
              className="absolute left-3 top-1/2 transform -translate-y-1/2 text-default-400"
              size={20}
            />
            <input
              type="text"
              placeholder="Search debtors..."
              className="pl-10 pr-4 py-2 border border-default-300 rounded-full focus:outline-none focus:border-default-500"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <Button
            onClick={() => setIsFilterOpen(!isFilterOpen)}
            icon={IconFilter}
            variant="outline"
          >
            Filter
          </Button>

          <Button
            onClick={handleExportCSV}
            icon={IconDownload}
            variant="outline"
          >
            Export
          </Button>
        </div>
      </div>

      {/* Filter Panel */}
      {isFilterOpen && (
        <div className="bg-white border border-default-200 rounded-lg p-4 mb-6 shadow-sm">
          <h2 className="text-lg font-medium mb-4">Filter Debtors</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2">
                Minimum Balance
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-3 flex items-center text-default-500">
                  RM
                </span>
                <input
                  type="number"
                  value={minBalance || ""}
                  onChange={(e) =>
                    setMinBalance(
                      e.target.value ? parseFloat(e.target.value) : null
                    )
                  }
                  className="w-full pl-10 pr-3 py-2 border border-default-300 rounded-lg focus:outline-none focus:border-default-500"
                  placeholder="Enter minimum amount"
                  min="0"
                  step="10"
                />
              </div>
            </div>
          </div>

          <div className="mt-4 flex justify-end space-x-3">
            <Button
              onClick={() => {
                setMinBalance(null);
                setSearchTerm("");
              }}
              variant="outline"
            >
              Reset
            </Button>
            <Button onClick={() => setIsFilterOpen(false)}>
              Apply Filters
            </Button>
          </div>
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        <div className="bg-white border border-default-200 rounded-lg p-4 shadow-sm">
          <h3 className="text-sm font-medium text-default-500 mb-1">
            Total Outstanding
          </h3>
          <p className="text-2xl font-bold text-default-900">
            {formatCurrency(totalOutstanding)}
          </p>
        </div>

        <div className="bg-white border border-default-200 rounded-lg p-4 shadow-sm">
          <h3 className="text-sm font-medium text-default-500 mb-1">
            Average Debt
          </h3>
          <p className="text-2xl font-bold text-default-900">
            {formatCurrency(averageDebt)}
          </p>
        </div>

        <div className="bg-white border border-default-200 rounded-lg p-4 shadow-sm">
          <h3 className="text-sm font-medium text-default-500 mb-1">
            Number of Debtors
          </h3>
          <p className="text-2xl font-bold text-default-900">
            {sortedDebtors.length}
          </p>
        </div>
      </div>

      {/* Debtors Table */}
      {sortedDebtors.length === 0 ? (
        <div className="bg-white border border-default-200 rounded-lg p-8 text-center">
          <IconAlertCircle
            size={48}
            className="mx-auto mb-4 text-default-300"
          />
          <h2 className="text-lg font-medium text-default-900 mb-1">
            No debtors found
          </h2>
          <p className="text-default-500">
            {searchTerm || minBalance
              ? "Try adjusting your filters"
              : "All invoices have been paid"}
          </p>
        </div>
      ) : (
        <div className="bg-white border border-default-200 rounded-lg overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-default-200">
              <thead className="bg-default-50">
                <tr>
                  <th
                    className="px-6 py-3 text-left text-xs font-medium text-default-500 uppercase tracking-wider cursor-pointer"
                    onClick={() => handleSort("name")}
                  >
                    Customer
                    {sortBy.field === "name" && (
                      <span className="ml-1">
                        {sortBy.direction === "asc" ? "↑" : "↓"}
                      </span>
                    )}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-default-500 uppercase tracking-wider">
                    Contact
                  </th>
                  <th
                    className="px-6 py-3 text-right text-xs font-medium text-default-500 uppercase tracking-wider cursor-pointer"
                    onClick={() => handleSort("total_invoiced")}
                  >
                    Total Invoiced
                    {sortBy.field === "total_invoiced" && (
                      <span className="ml-1">
                        {sortBy.direction === "asc" ? "↑" : "↓"}
                      </span>
                    )}
                  </th>
                  <th
                    className="px-6 py-3 text-right text-xs font-medium text-default-500 uppercase tracking-wider cursor-pointer"
                    onClick={() => handleSort("total_paid")}
                  >
                    Total Paid
                    {sortBy.field === "total_paid" && (
                      <span className="ml-1">
                        {sortBy.direction === "asc" ? "↑" : "↓"}
                      </span>
                    )}
                  </th>
                  <th
                    className="px-6 py-3 text-right text-xs font-medium text-default-500 uppercase tracking-wider cursor-pointer"
                    onClick={() => handleSort("balance")}
                  >
                    Balance
                    {sortBy.field === "balance" && (
                      <span className="ml-1">
                        {sortBy.direction === "asc" ? "↑" : "↓"}
                      </span>
                    )}
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-default-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-default-200">
                {sortedDebtors.map((debtor) => (
                  <tr key={debtor.customer_id} className="hover:bg-default-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="font-medium text-default-900">
                        {debtor.name}
                      </div>
                      <div className="text-sm text-default-500">
                        ID: {debtor.customer_id}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {debtor.phone_number && (
                        <div className="flex items-center text-sm text-default-700">
                          <IconPhone
                            size={16}
                            className="mr-2 text-default-400"
                          />
                          {debtor.phone_number}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-default-900">
                      {formatCurrency(debtor.total_invoiced)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-green-600">
                      {formatCurrency(debtor.total_paid)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium text-amber-600">
                      {formatCurrency(debtor.balance)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center text-sm font-medium">
                      <div className="flex justify-center space-x-2">
                        <button
                          onClick={() => handleViewInvoices(debtor.customer_id)}
                          className="p-1 text-blue-600 hover:text-blue-800"
                          title="View Invoices"
                        >
                          <IconFileInvoice size={20} />
                        </button>
                        {debtor.phone_number && (
                          <a
                            href={`tel:${debtor.phone_number}`}
                            className="p-1 text-green-600 hover:text-green-800"
                            title="Call Customer"
                          >
                            <IconPhone size={20} />
                          </a>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default DebtorsReportPage;
