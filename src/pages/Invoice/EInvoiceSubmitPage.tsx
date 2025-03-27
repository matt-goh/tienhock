// src/pages/Invoice/EInvoiceSubmitPage.tsx
import React, { useState, useEffect, useCallback, useRef } from "react";
import { api } from "../../routes/utils/api";
import { ColumnConfig, ExtendedInvoiceData } from "../../types/types";
import TableEditing from "../../components/Table/TableEditing";
import EInvoiceMenu from "../../components/Invoice/EInvoiceMenu";
import Button from "../../components/Button";
import { IconRefresh } from "@tabler/icons-react";
import LoadingSpinner from "../../components/LoadingSpinner";
import {
  parseDatabaseTimestamp,
  formatDisplayDate,
} from "../../utils/invoice/dateUtils";
import { useLocation, useNavigate } from "react-router-dom";

const EInvoiceSubmitPage: React.FC = () => {
  const [invoices, setInvoices] = useState<ExtendedInvoiceData[]>([]);
  const [selectedInvoices, setSelectedInvoices] = useState<
    ExtendedInvoiceData[]
  >([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [customerNames, setCustomerNames] = useState<Record<string, string>>(
    {}
  );
  const clearSelectionRef = useRef<(() => void) | null>(null);
  const location = useLocation();
  const navigate = useNavigate();

  const fetchInvoices = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const endDate = new Date();
      endDate.setHours(23, 59, 59, 999);
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 2);
      startDate.setHours(0, 0, 0, 0);

      // Use the new endpoint specifically for eligible invoices
      const response = await api.get(
        `/api/einvoice/eligible-for-submission?startDate=${startDate
          .getTime()
          .toString()}&endDate=${endDate.getTime().toString()}`
      );

      if (!response.success) {
        throw new Error(
          response.message || "Failed to fetch eligible invoices"
        );
      }

      setInvoices(response.data);
    } catch (err) {
      console.error("Error fetching invoices:", err);
      setError("Failed to fetch invoices. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchInvoices();
  }, [fetchInvoices]);

  const handleSelectionChange = useCallback(
    (
      count: number,
      allSelected: boolean,
      selectedRows: ExtendedInvoiceData[]
    ) => {
      setTimeout(() => {
        setSelectedInvoices(selectedRows);
      }, 0);
    },
    []
  );

  const handleInvoiceClick = (invoiceData: ExtendedInvoiceData) => {
    navigate(`/sales/invoice/details`, {
      state: {
        invoiceData,
        isNewInvoice: false,
        previousPath: location.pathname,
      },
    });
  };

  const handleSubmissionComplete = useCallback(() => {
    setSelectedInvoices([]);
    if (clearSelectionRef.current) clearSelectionRef.current();
  }, []);

  useEffect(() => {
    const fetchCustomerNames = async () => {
      const uniqueCustomerIds = Array.from(
        new Set(invoices.map((invoice) => invoice.customerid))
      );

      const missingCustomerIds = uniqueCustomerIds.filter(
        (id) => !(id in customerNames)
      );

      if (missingCustomerIds.length === 0) return;

      try {
        // First check local cache
        const CACHE_KEY = "customers_cache";
        const cachedData = localStorage.getItem(CACHE_KEY);
        let customersFromCache: Record<string, string> = {};
        let idsToFetch: string[] = [...missingCustomerIds];

        if (cachedData) {
          const { data } = JSON.parse(cachedData);

          if (Array.isArray(data)) {
            // Create map from cached data
            customersFromCache = data.reduce((map, customer) => {
              if (missingCustomerIds.includes(customer.id)) {
                map[customer.id] = customer.name;
                // Remove from idsToFetch since we got it from cache
                idsToFetch = idsToFetch.filter((id) => id !== customer.id);
              }
              return map;
            }, {} as Record<string, string>);
          }
        }

        // If we still have IDs to fetch, make API call
        let customersFromApi: Record<string, string> = {};
        if (idsToFetch.length > 0) {
          customersFromApi = await api.post("/api/customers/names", {
            customerIds: idsToFetch,
          });
        }

        // Combine results from cache and API
        setCustomerNames((prev) => ({
          ...prev,
          ...customersFromCache,
          ...customersFromApi,
        }));
      } catch (error) {
        console.error("Error fetching customer names:", error);
        const fallbackNames = missingCustomerIds.reduce<Record<string, string>>(
          (map, id) => {
            map[id] = id;
            return map;
          },
          {}
        );
        setCustomerNames((prev) => ({
          ...prev,
          ...fallbackNames,
        }));
      }
    };

    fetchCustomerNames();
  }, [invoices, customerNames]);

  useEffect(() => {
    handleSubmissionComplete();
  }, [invoices, handleSubmissionComplete]);

  const invoiceColumns: ColumnConfig[] = [
    {
      id: "id",
      header: "Invoice",
      type: "readonly",
      width: 150,
      cell: (info: {
        getValue: () => any;
        row: { original: ExtendedInvoiceData };
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
        row: { original: ExtendedInvoiceData };
      }) => {
        const timestamp = info.getValue();
        const { date } = parseDatabaseTimestamp(timestamp);
        return (
          <button
            onClick={() => handleInvoiceClick(info.row.original)}
            className="w-full h-full px-6 py-3 text-left outline-none bg-transparent cursor-pointer group-hover:font-semibold"
          >
            {formatDisplayDate(date)}
          </button>
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
        row: { original: ExtendedInvoiceData };
      }) => (
        <button
          onClick={() => handleInvoiceClick(info.row.original)}
          className="w-full h-full px-6 py-3 text-left outline-none bg-transparent cursor-pointer group-hover:font-semibold"
        >
          {info.getValue()}
        </button>
      ),
    },
    {
      id: "customerid",
      header: "Customer",
      type: "readonly",
      width: 500,
      cell: (info: {
        getValue: () => any;
        row: { original: ExtendedInvoiceData };
      }) => (
        <button
          onClick={() => handleInvoiceClick(info.row.original)}
          className="w-full h-full px-6 py-3 text-left outline-none bg-transparent cursor-pointer group-hover:font-semibold"
        >
          {customerNames[info.getValue()] || info.getValue()}
        </button>
      ),
    },
    {
      id: "totalamountpayable",
      header: "Amount",
      type: "amount",
      width: 150,
      cell: (info: {
        getValue: () => any;
        row: { original: ExtendedInvoiceData };
      }) => (
        <button
          onClick={() => handleInvoiceClick(info.row.original)}
          className="w-full h-full px-6 py-3 text-right outline-none bg-transparent cursor-pointer group-hover:font-semibold"
        >
          {Number(info.getValue() || 0).toFixed(2)}
        </button>
      ),
    },
  ];

  return (
    <div className="flex flex-col mt-4">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-3xl font-semibold text-default-900">
          Submit e-Invoices
        </h1>
        <div className="flex items-center gap-3">
          {invoices.length > 0 && (
            <EInvoiceMenu
              selectedInvoices={selectedInvoices}
              onSubmissionComplete={handleSubmissionComplete}
              clearSelection={() => clearSelectionRef.current?.()}
            />
          )}
          <Button
            onClick={fetchInvoices}
            disabled={isLoading}
            variant="outline"
            icon={IconRefresh}
          >
            Refresh
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8">
          <LoadingSpinner />
        </div>
      ) : error ? (
        <div className="bg-rose-50 text-rose-600 p-4 rounded-lg mb-4">
          {error}
        </div>
      ) : invoices.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-8 bg-default-50 rounded-lg border border-default-200">
          <h3 className="text-lg font-medium text-default-700 mb-2">
            No Invoices Found
          </h3>
          <p className="text-default-500 text-center">
            There are no invoices available for submission in the last 3 days.
          </p>
        </div>
      ) : (
        <div className="ml-[-44.1px]">
          <TableEditing<ExtendedInvoiceData>
            initialData={invoices}
            columns={invoiceColumns}
            onChange={setInvoices}
            onSelectionChange={handleSelectionChange}
            onClearSelection={(fn) => {
              clearSelectionRef.current = fn;
            }}
            tableKey="einvoice-submit"
          />
        </div>
      )}
    </div>
  );
};

export default EInvoiceSubmitPage;
