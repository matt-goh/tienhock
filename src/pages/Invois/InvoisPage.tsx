import React, { useState, useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import TableEditing from "../../components/Table/TableEditing";
import Button from "../../components/Button";
import { ColumnConfig, InvoiceData } from "../../types/types";
import toast from "react-hot-toast";
import { deleteInvoice, getInvoices, fetchDbInvoices } from "./InvoisUtils";
import { IconCloudUpload, IconPlus } from "@tabler/icons-react";
import ConfirmationDialog from "../../components/ConfirmationDialog";

const InvoisPage: React.FC = () => {
  const [invoices, setInvoices] = useState<InvoiceData[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDeleteConfirmation, setShowDeleteConfirmation] = useState(false);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(
    null
  );
  const fileInputRef = useRef<HTMLInputElement>(null);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    loadInvoices();
  }, []);

  const loadInvoices = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const fetchedInvoices = await fetchDbInvoices();
      setInvoices(fetchedInvoices);
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

  const handleFileUpload = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const files = event.target.files;
    if (!files || files.length === 0) {
      toast.error("No files selected");
      return;
    }

    const validFiles = Array.from(files).filter((file) =>
      file.name.match(/^SLS_.+\.txt$/)
    );

    if (validFiles.length === 0) {
      toast.error(
        "No valid files found. Please upload files with the format SLS_*.txt"
      );
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const newFileData: InvoiceData[] = [];

      for (const file of validFiles) {
        const content = await readFileContent(file);
        const parsedData = parseFileContent(content);
        newFileData.push(...parsedData);
      }

      // Upload parsed data to the server
      const response = await fetch(
        "http://localhost:5000/api/invoices/upload",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(newFileData),
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();

      const updatedInvoices = getInvoices();
      setInvoices(updatedInvoices);

      toast.success(`Successfully processed ${validFiles.length} file(s)`);

      // Navigate to the upload page with the updated invoices
      navigate("/stock/invois/imported", {
        state: { importedData: updatedInvoices },
      });
    } catch (error) {
      console.error("Error processing files:", error);
      setError(
        error instanceof Error ? error.message : "An unknown error occurred"
      );
      toast.error(
        `Error processing files: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    } finally {
      setIsLoading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const readFileContent = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e: ProgressEvent<FileReader>) =>
        resolve(e.target?.result as string);
      reader.onerror = (error) => reject(error);
      reader.readAsText(file);
    });
  };

  const parseFileContent = (content: string): InvoiceData[] => {
    const lines = content.split("\n");
    return lines
      .filter((line) => line.trim() !== "")
      .map((line) => {
        const [
          invoiceno,
          orderno,
          date,
          type,
          customer,
          salesman,
          totalAmount,
          filler, // Filler fields to comply with the imported data format from Tien Hock mobile app
          filler2,
          filler3,
          filler4,
          filler5,
          filler6,
          time,
          orderDetailsString,
        ] = line.split("|");

        const [customerId, customername] = customer.split("\t");

        const orderDetails = orderDetailsString
          .split("&E&")
          .filter(Boolean)
          .flatMap((item) => {
            const [code, qty, price, total, foc, returned] = item.split("&&");
            const baseItem = {
              code: code || "",
              productName: "", // This will be filled by the server
              qty: Number(qty) || 0,
              price: Number((parseFloat(price) / 100).toFixed(2)),
              total: (parseFloat(total) / 100).toFixed(2),
              isFoc: false,
              isReturned: false,
            };

            const items = [baseItem];

            if (Number(foc) > 0) {
              items.push({
                ...baseItem,
                qty: Number(foc),
                price: Number((parseFloat(price) / 100).toFixed(2)),
                total: (Number(baseItem.price) * Number(foc)).toFixed(2),
                isFoc: true,
              });
            }

            if (Number(returned) > 0) {
              items.push({
                ...baseItem,
                qty: Number(returned),
                price: Number((parseFloat(price) / 100).toFixed(2)),
                total: (Number(baseItem.price) * Number(returned)).toFixed(2),
                isReturned: true,
              });
            }

            return items;
          });

        return {
          id: invoiceno,
          invoiceno,
          orderno,
          date,
          type,
          customer: customerId,
          customername: customername || customerId,
          salesman,
          totalAmount,
          time,
          orderDetails,
        };
      });
  };

  const handleCreateNewInvoice = () => {
    navigate("/stock/invois/details", {
      state: {
        isNewInvoice: true,
        previousPath: location.pathname,
      },
    });
  };

  const handleInvoiceClick = (invoiceId: string, invoiceData: InvoiceData) => {
    navigate(`/stock/invois/details`, {
      state: {
        invoiceData,
        isNewInvoice: false,
        previousPath: location.pathname,
      },
    });
  };

  const handleConfirmDelete = async () => {
    if (selectedInvoiceId) {
      try {
        await deleteInvoice(selectedInvoiceId);
        toast.success("Invoice deleted successfully");
        loadInvoices(); // Reload the invoices after deletion
      } catch (error) {
        console.error("Error deleting invoice:", error);
        toast.error("Failed to delete invoice. Please try again.");
      }
    }
    setShowDeleteConfirmation(false);
    setSelectedInvoiceId(null);
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
          className="w-full h-full px-6 py-3 text-left outline-none bg-transparent cursor-pointer hover:font-semibold"
        >
          {info.row.original.type}
          {info.getValue()}
        </button>
      ),
    },
    { id: "date", header: "Date", type: "readonly", width: 150 },
    { id: "customername", header: "Customer", type: "readonly", width: 350 },
    { id: "salesman", header: "Salesman", type: "readonly", width: 150 },
    { id: "totalamount", header: "Amount", type: "readonly", width: 150 },
  ];

  if (isLoading) {
    return <div>Loading...</div>;
  }

  if (error) {
    return <div>Error: {error}</div>;
  }

  return (
    <div className="p-4">
      <h1 className="text-2xl text-center font-medium text-gray-700 mb-4">
        Invois
      </h1>
      <div className="flex mb-4 space-x-2 justify-center">
        <Button
          onClick={handleCreateNewInvoice}
          icon={IconPlus}
          iconSize={16}
          iconStroke={2}
          variant="outline"
        >
          Create
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".txt"
          onChange={handleFileUpload}
          className="hidden"
          id="fileUpload"
          multiple
        />
        <Button
          onClick={() => fileInputRef.current?.click()}
          icon={IconCloudUpload}
          iconSize={16}
          iconStroke={2}
          variant="outline"
        >
          Import
        </Button>
      </div>
      {invoices.length > 0 ? (
        <TableEditing<InvoiceData>
          initialData={invoices}
          columns={columns}
          onChange={setInvoices}
          tableKey="invois"
        />
      ) : (
        <p className="text-center text-gray-500">No invoices found.</p>
      )}
      <ConfirmationDialog
        isOpen={showDeleteConfirmation}
        onClose={() => setShowDeleteConfirmation(false)}
        onConfirm={handleConfirmDelete}
        title="Delete Invoice"
        message="Are you sure you want to delete this invoice? This action cannot be undone."
        confirmButtonText="Delete"
      />
    </div>
  );
};

export default InvoisPage;
