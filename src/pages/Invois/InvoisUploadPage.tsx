import React, { useState, useEffect, useCallback } from "react";
import { IconSend, IconTrash } from "@tabler/icons-react";
import TableEditing from "../../components/Table/TableEditing";
import toast from "react-hot-toast";
import { ColumnConfig, InvoiceData } from "../../types/types";
import { useLocation, useNavigate } from "react-router-dom";
import Button from "../../components/Button";
import { fetchInvoices, getInvoices } from "./InvoisUtils";
import ConfirmationDialog from "../../components/ConfirmationDialog";
import { api } from "../../routes/utils/api";

const InvoisUploadPage: React.FC = () => {
  const [fileData, setFileData] = useState<InvoiceData[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedCount, setSelectedCount] = useState(0);
  const [isAllSelected, setIsAllSelected] = useState(false);
  const [selectedInvoices, setSelectedInvoices] = useState<InvoiceData[]>([]);
  const [showDeleteConfirmation, setShowDeleteConfirmation] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  const loadInvoices = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      await fetchInvoices();
      setFileData(getInvoices());
    } catch (error) {
      console.error("Error loading invoices:", error);
      setError(
        error instanceof Error ? error.message : "An unknown error occurred"
      );
      toast.error(
        `Failed to load invoices: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadInvoices();
  }, [loadInvoices]);

  const handleSelectionChange = useCallback(
    (count: number, allSelected: boolean, selectedRows: InvoiceData[]) => {
      setSelectedCount(count);
      setIsAllSelected(allSelected);
      setSelectedInvoices(selectedRows);
    },
    []
  );

  const handleDataChange = useCallback((newData: InvoiceData[]) => {
    setFileData(newData);
  }, []);

  const handleBulkDelete = useCallback(() => {
    setShowDeleteConfirmation(false);
    try {
      const idsToDelete = new Set(
        selectedInvoices.map((invoice) => invoice.id)
      );
      const updatedFileData = fileData.filter(
        (invoice) => !idsToDelete.has(invoice.id)
      );
      setFileData(updatedFileData);

      // Reset selection states
      setSelectedCount(0);
      setIsAllSelected(false);
      setSelectedInvoices([]);

      toast.success("Selected invoices deleted successfully");

      // If all data is deleted, navigate back to invois page
      if (updatedFileData.length === 0) {
        navigate("/sales/invois");
      }
    } catch (error) {
      console.error("Error deleting invoices:", error);
      toast.error("Failed to delete invoices. Please try again.");
    }
  }, [selectedInvoices, fileData, navigate]);

  const handleSubmit = async () => {
    if (fileData.length === 0) {
      toast.error("No invoices to submit");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      // Check for duplicate invoice numbers
      const invoiceNumbers = fileData.map((invoice) => invoice.invoiceno);
      const duplicatesResult = await api.post(
        "/api/invoices/check-bulk-duplicates",
        { invoiceNumbers }
      );

      if (duplicatesResult.duplicates.length > 0) {
        const duplicateList = duplicatesResult.duplicates.join(", ");
        toast.error(`Duplicate invoice numbers found: ${duplicateList}`);
        return;
      }

      // If no duplicates, proceed with submission
      const result = await api.post("/api/invoices/bulk-submit", fileData);

      toast.success(result.message);
      setFileData([]); // Clear the file data after successful submission
      navigate("/sales/invois");
    } catch (error) {
      console.error("Error submitting invoices:", error);
      setError(
        error instanceof Error ? error.message : "An unknown error occurred"
      );
      toast.error(
        `Failed to submit invoices: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleInvoiceClick = (invoiceId: string, invoiceData: InvoiceData) => {
    navigate(`/sales/invois/imported/${invoiceId}`, {
      state: {
        invoiceData,
        previousPath: location.pathname,
      },
    });
  };

  const handleClearData = async () => {
    setIsLoading(true);
    setError(null);
    try {
      await api.post("/api/invoices/clear");
      setFileData([]);
      toast.success("All data cleared successfully");
      navigate("/sales/invois");
    } catch (error) {
      console.error("Error clearing data:", error);
      setError(
        error instanceof Error ? error.message : "An unknown error occurred"
      );
      toast.error(
        `Failed to clear data: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    } finally {
      setIsLoading(false);
    }
  };

  const columns: ColumnConfig[] = [
    {
      id: "invoiceno",
      header: "Invoice",
      type: "readonly",
      width: 150,
      cell: (info: { getValue: () => any; row: { original: InvoiceData } }) => (
        <button
          onClick={() =>
            handleInvoiceClick(info.row.original.id, info.row.original)
          }
          disabled={info.row.original.isSorting}
          className={`w-full h-full px-6 py-3 text-left outline-none bg-transparent ${
            info.row.original.isSorting
              ? "cursor-default"
              : "cursor-pointer hover:font-semibold"
          }`}
        >
          {info.row.original.type}
          {info.getValue()}
        </button>
      ),
    },
    { id: "date", header: "Date", type: "readonly", width: 150 },
    {
      id: "customername",
      header: "Customer",
      type: "readonly",
      width: 350,
    },
    { id: "salesman", header: "Salesman", type: "readonly", width: 150 },
    { id: "totalAmount", header: "Amount", type: "readonly", width: 150 },
  ];

  if (isLoading) {
    return <div>Loading...</div>;
  }

  if (error) {
    return <div>Error: {error}</div>;
  }

  return (
    <div className="p-4">
      <h1 className="text-2xl text-center font-medium text-default-700 mb-4">
        Imported Invoices
      </h1>
      <div className={`flex mb-4 space-x-2 justify-center`}>
        {selectedCount > 0 && (
          <button
            onClick={() => setShowDeleteConfirmation(true)}
            className="px-4 py-2 text-rose-500 font-medium border-2 border-rose-400 hover:border-rose-500 active:border-rose-600 bg-white hover:bg-rose-500 active:bg-rose-600 hover:text-white active:text-rose-100 rounded-full transition-colors duration-200"
          >
            <div className="flex items-center gap-2">Delete</div>
          </button>
        )}
        {fileData.length > 0 && !selectedCount && (
          <button
            onClick={handleClearData}
            className="flex items-center px-4 py-2 font-medium text-red-600 border border-red-600 rounded-full hover:bg-red-50 active:bg-red-100 transition-colors duration-200"
          >
            <IconTrash className="mr-2 h-4 w-4" /> Clear
          </button>
        )}
        <Button
          onClick={handleSubmit}
          icon={IconSend}
          iconSize={16}
          iconStroke={2}
          variant="outline"
          disabled={isSubmitting || fileData.length === 0}
        >
          {isSubmitting ? "Submitting..." : "Submit"}
        </Button>
      </div>
      {fileData.length > 0 && (
        <TableEditing<InvoiceData>
          initialData={fileData}
          columns={columns}
          onChange={handleDataChange}
          onSelectionChange={handleSelectionChange}
          tableKey="invois"
        />
      )}
      <ConfirmationDialog
        isOpen={showDeleteConfirmation}
        onClose={() => setShowDeleteConfirmation(false)}
        onConfirm={handleBulkDelete}
        title="Delete Confirmation"
        message={
          isAllSelected
            ? "Are you sure you want to delete all invoices? This action cannot be undone."
            : `Are you sure you want to delete ${selectedCount} selected invoice${
                selectedCount === 1 ? "" : "s"
              }? This action cannot be undone.`
        }
        confirmButtonText="Delete"
      />
    </div>
  );
};

export default InvoisUploadPage;
