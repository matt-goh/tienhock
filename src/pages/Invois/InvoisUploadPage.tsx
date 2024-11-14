import React, { useState, useEffect } from "react";
import { IconSend, IconTrash } from "@tabler/icons-react";
import TableEditing from "../../components/Table/TableEditing";
import toast from "react-hot-toast";
import { ColumnConfig, InvoiceData } from "../../types/types";
import { useLocation, useNavigate } from "react-router-dom";
import Button from "../../components/Button";
import { fetchInvoices, getInvoices, updateInvoice } from "./InvoisUtils";
import { API_BASE_URL } from "../../configs/config";

const InvoisUploadPage: React.FC = () => {
  const [fileData, setFileData] = useState<InvoiceData[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    loadInvoices();
  }, []);

  const loadInvoices = async () => {
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
  };

  const handleSubmit = async () => {
    if (fileData.length === 0) {
      toast.error("No invoices to submit");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      // First, check for duplicate invoice numbers
      const invoiceNumbers = fileData.map((invoice) => invoice.invoiceno);
      const checkDuplicatesResponse = await fetch(
        `${API_BASE_URL}/api/invoices/check-bulk-duplicates`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ invoiceNumbers }),
        }
      );

      if (!checkDuplicatesResponse.ok) {
        throw new Error(
          `HTTP error! status: ${checkDuplicatesResponse.status}`
        );
      }

      const duplicatesResult = await checkDuplicatesResponse.json();

      if (duplicatesResult.duplicates.length > 0) {
        const duplicateList = duplicatesResult.duplicates.join(", ");
        toast.error(`Duplicate invoice numbers found: ${duplicateList}`);
        setIsSubmitting(false);
        return;
      }

      // If no duplicates, proceed with submission
      const response = await fetch(`${API_BASE_URL}/api/invoices/bulk-submit`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(fileData),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      toast.success(result.message);
      setFileData([]); // Clear the file data after successful submission
      navigate("/stock/invois");
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
    navigate(`/stock/invois/imported/${invoiceId}`, {
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
      const response = await fetch(`${API_BASE_URL}/api/invoices/clear`, {
        method: "POST",
      });
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      setFileData([]);
      toast.success("All data cleared successfully");
      navigate("/stock/invois");
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
        {fileData.length > 0 && (
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
          onChange={(newData: InvoiceData[]) => {
            setTimeout(() => {
              newData.forEach((invoice) => updateInvoice(invoice));
              setFileData(getInvoices());
            }, 0);
          }}
          tableKey="invois"
        />
      )}
    </div>
  );
};

export default InvoisUploadPage;
