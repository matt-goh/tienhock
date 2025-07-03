// src/pages/Accounting/DebtorsReportPage.tsx
import React, { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  IconSearch,
  IconDownload,
  IconAlertCircle,
  IconPhone,
} from "@tabler/icons-react";
import toast from "react-hot-toast";
import Button from "../../components/Button";
import { greenTargetApi } from "../../routes/greentarget/api";
import LoadingSpinner from "../../components/LoadingSpinner";

interface Debtor {
  customer_id: number;
  name: string;
  phone_numbers: string[];
  total_invoiced: number;
  total_paid: number;
  balance: number;
  has_overdue?: boolean;
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

  //   // Get debtors report
  //   router.get("/debtors", async (req, res) => {
  //     try {
  //       const query = `
  //         SELECT
  //           c.customer_id,
  //           c.name,
  //           /* Collect unique phone numbers as an array */
  //           ARRAY_REMOVE(ARRAY_AGG(DISTINCT NULLIF(ph.phone_number, '')), NULL) as phone_numbers,

  //           -- Get pre-aggregated invoice and payment data from subquery
  //           invoice_data.total_invoiced,
  //           invoice_data.total_paid,
  //           invoice_data.balance,

  //           -- Add new field to check for overdue invoices (as a subquery)
  //           (SELECT EXISTS(
  //             SELECT 1 FROM greentarget.invoices oi
  //             WHERE oi.customer_id = c.customer_id
  //             AND oi.status = 'overdue'
  //             AND oi.status != 'cancelled'
  //           )) as has_overdue

  //         FROM greentarget.customers c
  //         -- Collect phone numbers from both customer and locations (existing logic)
  //         LEFT JOIN LATERAL (
  //           SELECT c.phone_number
  //           UNION
  //           SELECT l.phone_number
  //           FROM greentarget.rentals r
  //           JOIN greentarget.locations l ON r.location_id = l.location_id
  //           WHERE r.customer_id = c.customer_id
  //         ) ph ON true

  //         -- Use a subquery to pre-aggregate invoice and payment data per customer
  //         LEFT JOIN (
  //           SELECT
  //             i.customer_id,
  //             SUM(CASE WHEN i.status != 'cancelled' THEN i.total_amount ELSE 0 END) as total_invoiced,
  //             SUM(
  //               COALESCE(
  //                 (SELECT SUM(amount_paid)
  //                 FROM greentarget.payments p
  //                 WHERE p.invoice_id = i.invoice_id
  //                 AND (p.status IS NULL OR p.status = 'active')
  //                 ), 0
  //               )
  //             ) as total_paid,
  //             SUM(CASE WHEN i.status != 'cancelled' THEN i.total_amount ELSE 0 END) -
  //             SUM(
  //               COALESCE(
  //                 (SELECT SUM(amount_paid)
  //                 FROM greentarget.payments p
  //                 WHERE p.invoice_id = i.invoice_id
  //                 AND (p.status IS NULL OR p.status = 'active')
  //                 ), 0
  //               )
  //             ) as balance
  //           FROM greentarget.invoices i
  //           GROUP BY i.customer_id
  //         ) invoice_data ON c.customer_id = invoice_data.customer_id

  //         -- Group by customer for phone number aggregation
  //         GROUP BY c.customer_id, c.name, invoice_data.total_invoiced, invoice_data.total_paid, invoice_data.balance

  //         -- Filter Groups: Only include customers who have a positive outstanding balance
  //         HAVING invoice_data.balance > 0.001 -- Use a small threshold for floating point comparison

  //         -- Order by the calculated balance
  //         ORDER BY invoice_data.balance DESC;
  //       `;

  //       const result = await pool.query(query);
  //       // Ensure numeric types are returned correctly
  //       const debtors = result.rows.map((debtor) => ({
  //         ...debtor,
  //         phone_numbers: debtor.phone_numbers || [], // Ensure phone_numbers is always an array
  //         total_invoiced: parseFloat(debtor.total_invoiced || 0),
  //         total_paid: parseFloat(debtor.total_paid || 0),
  //         balance: parseFloat(debtor.balance || 0),
  //         has_overdue: !!debtor.has_overdue,
  //       }));
  //       res.json(debtors);
  //     } catch (error) {
  //       console.error("Error fetching debtors report:", error);
  //       res.status(500).json({
  //         message: "Error fetching debtors report",
  //         error: error.message,
  //       });
  //     }
  //   });

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

  const handlePrint = () => {
    // This would be implemented to export data to CSV
    toast.success("Printing functionality would be implemented here");
  };

  const handleViewInvoices = (customerId: number) => {
    // Updated to pass both customer_id and status filters
    navigate(
      `/greentarget/invoices?customer_id=${customerId}&status=active,overdue`
    );
  };

  const sortedDebtors = useMemo(() => {
    // Basic search filtering (case-insensitive)
    const filtered = debtors.filter(
      (debtor) =>
        debtor.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        debtor.customer_id.toString().includes(searchTerm) ||
        (debtor.phone_numbers &&
          debtor.phone_numbers.some((phone) => phone.includes(searchTerm)))
    );

    // Sorting logic
    return [...filtered].sort((a, b) => {
      const aValue = a[sortBy.field];
      const bValue = b[sortBy.field];

      // Handle numeric and string sorting appropriately
      if (typeof aValue === "number" && typeof bValue === "number") {
        return sortBy.direction === "asc" ? aValue - bValue : bValue - aValue;
      }
      if (typeof aValue === "string" && typeof bValue === "string") {
        if (sortBy.direction === "asc") {
          return aValue.localeCompare(bValue);
        } else {
          return bValue.localeCompare(aValue);
        }
      }
      // Fallback or handle other types if necessary
      return 0;
    });
  }, [debtors, sortBy, searchTerm]); // Added searchTerm dependency

  // Calculate summary statistics based on *filtered and sorted* debtors
  const totalOutstanding = useMemo(() => {
    return sortedDebtors.reduce((sum, debtor) => sum + debtor.balance, 0);
  }, [sortedDebtors]);

  if (loading) {
    return (
      <div className="mt-40 w-full flex items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  if (error) {
    // A slightly better error display
    return (
      <div className="container mx-auto px-4 py-8 text-center">
        <IconAlertCircle size={48} className="mx-auto mb-4 text-red-500" />
        <h2 className="text-lg font-medium text-default-900 mb-1">
          Loading Error
        </h2>
        <p className="text-default-500">{error}</p>
        <Button onClick={fetchDebtors} className="mt-4">
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      {/* --- START OF MODIFIED HEADER --- */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-default-900">
            Debtors Report
          </h1>
          <p className="text-default-500 mt-1">
            {/* Show count based on filtered results */}
            {sortedDebtors.length} customer
            {sortedDebtors.length !== 1 ? "s" : ""} with outstanding balances
          </p>
        </div>
        <div className="flex flex-col md:flex-row items-stretch md:items-center space-y-3 md:space-y-0 md:space-x-3 mt-4 md:mt-0 w-full md:w-auto">
          {/* Adjusted for better small screen layout */}
          <div className="relative flex-grow">
            {/* Allow search to grow */}
            <IconSearch
              className="absolute left-3 top-1/2 transform -translate-y-1/2 text-default-400 pointer-events-none" // Added pointer-events-none
              size={20}
            />
            <input
              type="text"
              placeholder="Search..."
              className="pl-10 pr-4 py-2 border border-default-300 rounded-full focus:outline-none focus:border-default-500"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <Button
            onClick={handlePrint}
            icon={IconDownload}
            variant="outline"
            className="w-full md:w-auto"
          >
            Print
          </Button>
        </div>
      </div>
      {/* --- END OF MODIFIED HEADER --- */}

      {/* Summary Cards - Adjusted layout for better responsiveness */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-6 mb-6">
        <div className="bg-white border border-default-200 rounded-lg p-4 shadow-sm">
          <h3 className="text-sm font-medium text-default-500 mb-1">
            Number of Debtors
          </h3>
          <p className="text-2xl font-bold text-default-900">
            {sortedDebtors.length}
          </p>
        </div>
        <div className="bg-white border border-default-200 rounded-lg p-4 shadow-sm">
          <h3 className="text-sm font-medium text-default-500 mb-1">
            Total Outstanding
          </h3>
          <p className="text-2xl font-bold text-default-900">
            {formatCurrency(totalOutstanding)}
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
            {searchTerm
              ? "No debtors match your search criteria."
              : "All customer balances are settled or there are no customers yet."}
          </p>
        </div>
      ) : (
        <div className="bg-white border border-default-200 rounded-lg overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-default-200">
              <thead className="bg-default-50">
                <tr>
                  <th
                    scope="col" // Added scope for accessibility
                    className="px-6 py-3 text-left text-xs font-medium text-default-500 uppercase tracking-wider cursor-pointer whitespace-nowrap" // Added whitespace-nowrap
                    onClick={() => handleSort("name")}
                  >
                    Customer
                    {sortBy.field === "name" && (
                      <span className="ml-1 align-middle">
                        {/* Adjusted alignment */}
                        {sortBy.direction === "asc" ? "↑" : "↓"}
                      </span>
                    )}
                  </th>
                  <th
                    scope="col" // Added scope
                    className="px-6 py-3 text-left text-xs font-medium text-default-500 uppercase tracking-wider whitespace-nowrap" // Added whitespace-nowrap
                  >
                    Contact
                  </th>
                  <th
                    scope="col" // Added scope
                    className="px-6 py-3 text-right text-xs font-medium text-default-500 uppercase tracking-wider cursor-pointer whitespace-nowrap" // Added whitespace-nowrap
                    onClick={() => handleSort("total_invoiced")}
                  >
                    Total Invoiced
                    {sortBy.field === "total_invoiced" && (
                      <span className="ml-1 align-middle">
                        {/* Adjusted alignment */}
                        {sortBy.direction === "asc" ? "↑" : "↓"}
                      </span>
                    )}
                  </th>
                  <th
                    scope="col" // Added scope
                    className="px-6 py-3 text-right text-xs font-medium text-default-500 uppercase tracking-wider cursor-pointer whitespace-nowrap" // Added whitespace-nowrap
                    onClick={() => handleSort("total_paid")}
                  >
                    Total Paid
                    {sortBy.field === "total_paid" && (
                      <span className="ml-1 align-middle">
                        {/* Adjusted alignment */}
                        {sortBy.direction === "asc" ? "↑" : "↓"}
                      </span>
                    )}
                  </th>
                  <th
                    scope="col" // Added scope
                    className="px-6 py-3 text-right text-xs font-medium text-default-500 uppercase tracking-wider cursor-pointer whitespace-nowrap" // Added whitespace-nowrap
                    onClick={() => handleSort("balance")}
                  >
                    Balance
                    {sortBy.field === "balance" && (
                      <span className="ml-1 align-middle">
                        {/* Adjusted alignment */}
                        {sortBy.direction === "asc" ? "↑" : "↓"}
                      </span>
                    )}
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-default-200">
                {sortedDebtors.map((debtor) => (
                  <tr
                    key={debtor.customer_id}
                    className="hover:bg-sky-50 cursor-pointer transition-colors"
                    onClick={() => handleViewInvoices(debtor.customer_id)}
                    title={`View invoices for ${debtor.name}`} // More descriptive title
                  >
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="font-medium text-default-900">
                        {debtor.name}
                      </div>
                      <div className="text-sm text-default-500">
                        ID: {debtor.customer_id}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {debtor.phone_numbers &&
                      debtor.phone_numbers.length > 0 ? (
                        <div className="flex flex-col space-y-1">
                          {debtor.phone_numbers.map((phone, index) => (
                            <div
                              key={index}
                              className="flex items-center text-sm text-default-700"
                            >
                              <IconPhone
                                size={16}
                                className="mr-1.5 text-default-400 flex-shrink-0"
                              />
                              <span className="truncate">{phone}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <span className="text-default-400 text-sm italic">
                          No phone number
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-default-900">
                      {formatCurrency(debtor.total_invoiced)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-green-600">
                      {formatCurrency(debtor.total_paid)}
                    </td>
                    <td
                      className={`px-6 py-4 whitespace-nowrap text-right text-sm font-medium ${
                        debtor.has_overdue ? "text-red-600" : "text-amber-600"
                      }`}
                    >
                      {formatCurrency(debtor.balance)}
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
