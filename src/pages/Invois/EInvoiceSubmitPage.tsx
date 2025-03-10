// src/pages/Invois/EInvoiceSubmitPage.tsx
import React, { useState, useEffect, useCallback, useRef } from "react";
import { api } from "../../routes/utils/api";
import { getInvoices } from "../../utils/invoice/InvoisUtils";
import {
  ColumnConfig,
  ExtendedInvoiceData,
  InvoiceFilters,
} from "../../types/types";
import TableEditing from "../../components/Table/TableEditing";
import EInvoiceMenu from "../../components/Invois/EInvoiceMenu";
import Button from "../../components/Button";
import { IconRefresh } from "@tabler/icons-react";
import LoadingSpinner from "../../components/LoadingSpinner";
import {
  parseDatabaseTimestamp,
  formatDisplayDate,
} from "../../utils/invoice/dateUtils";

const EInvoiceSubmitPage: React.FC = () => {
  const [invoices, setInvoices] = useState<ExtendedInvoiceData[]>([]);
  const [selectedInvoices, setSelectedInvoices] = useState<
    ExtendedInvoiceData[]
  >([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const clearSelectionRef = useRef<(() => void) | null>(null);

  const fetchInvoices = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const endDate = new Date();
      endDate.setHours(23, 59, 59, 999);
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 2);
      startDate.setHours(0, 0, 0, 0);

      const filters: InvoiceFilters = {
        dateRange: { start: startDate, end: endDate },
        salespersonId: null,
        applySalespersonFilter: true,
        customerId: null,
        applyCustomerFilter: true,
        paymentType: null,
        applyPaymentTypeFilter: true,
      };

      const fetchedInvoices = await getInvoices(filters);

      const uniqueCustomerIds = Array.from(
        new Set(fetchedInvoices.map((inv) => inv.customerid))
      );
      const customerNamesMap = await api.post("/api/customers/names", {
        customerIds: uniqueCustomerIds,
      });

      const extendedInvoices = fetchedInvoices.map((inv) => ({
        ...inv,
        customerName: customerNamesMap[inv.customerid] || inv.customerid,
      }));
      setInvoices(extendedInvoices);
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
      setSelectedInvoices(selectedRows);
    },
    []
  );

  const handleSubmissionComplete = useCallback(() => {
    setSelectedInvoices([]);
    if (clearSelectionRef.current) clearSelectionRef.current();
  }, []);

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
        <div className="px-6 py-3">
          {info.row.original.paymenttype === "CASH" ? "C" : "I"}
          {info.getValue()}
        </div>
      ),
    },
    {
      id: "createddate",
      header: "Date",
      type: "readonly",
      width: 150,
      cell: (info: { getValue: () => any }) => {
        const timestamp = info.getValue();
        const { date } = parseDatabaseTimestamp(timestamp);
        return <div className="px-6 py-3">{formatDisplayDate(date)}</div>;
      },
    },
    {
      id: "salespersonid",
      header: "Salesman",
      type: "readonly",
      width: 150,
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
        <div className="px-6 py-3">
          {info.row.original.customerName || info.getValue()}
        </div>
      ),
    },
    {
      id: "totalamountpayable",
      header: "Amount",
      type: "amount",
      width: 150,
      cell: (info: { getValue: () => any }) => (
        <div className="px-6 py-3 text-right">
          {Number(info.getValue() || 0).toFixed(2)}
        </div>
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
          <EInvoiceMenu
            selectedInvoices={selectedInvoices}
            onSubmissionComplete={handleSubmissionComplete}
            clearSelection={() => clearSelectionRef.current?.()}
          />
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
