import React, { useState, useRef, useEffect } from "react";
import { IconCloudUpload, IconTrash } from "@tabler/icons-react";
import Table from "../components/Table";
import toast from "react-hot-toast";
import { ColumnConfig, InvoiceData } from "../types/types";
import { useNavigate } from "react-router-dom";
import Button from "../components/Button";

const InvoisUploadPage: React.FC = () => {
  const [fileData, setFileData] = useState<InvoiceData[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    fetchInvoices();
  }, []);

  const fetchInvoices = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch("http://localhost:5000/api/invoices");
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      if (Array.isArray(data)) {
        setFileData(data);
      } else {
        throw new Error("Received data is not an array");
      }
    } catch (error) {
      console.error("Error fetching invoices:", error);
      setError(
        error instanceof Error ? error.message : "An unknown error occurred"
      );
      toast.error(
        `Failed to fetch invoices: ${
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

      // Fetch updated invoice list
      await fetchInvoices();

      toast.success(`Successfully processed ${validFiles.length} file(s)`);
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
          invoiceNo,
          orderNo,
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

        const [customerId, customerName] = customer.split("\t");

        const orderDetails = orderDetailsString
          .split("E&")
          .filter(Boolean)
          .map((item) => {
            const [code, qty, price, total, foc, returned] = item.split("&&");
            return {
              code: code || "",
              qty: Number(qty) || 0,
              price: Number((parseFloat(price) / 100).toFixed(2)),
              total: (parseFloat(total) / 100).toFixed(2),
              foc: parseInt(foc, 10) || 0,
              returned: parseInt(returned, 10) || 0,
              productName: "", // This will be filled by the server
            };
          });

        return {
          id: invoiceNo,
          invoiceNo,
          orderNo,
          date,
          type,
          customer: customerId,
          customerName: customerName || customerId,
          salesman,
          totalAmount,
          time,
          orderDetails,
        };
      });
  };

  const handleInvoiceClick = (invoiceId: string, invoiceData: InvoiceData) => {
    navigate(`/stock/invois/new/${invoiceId}`, { state: { invoiceData } });
  };

  const handleClearData = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch("http://localhost:5000/api/invoices/clear", {
        method: "POST",
      });
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      setFileData([]);
      toast.success("All data cleared successfully");
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
      id: "invoiceNo",
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
      id: "customerName",
      header: "Customer",
      type: "readonly",
      width: 350,
      cell: (info: { getValue: () => any; row: { original: InvoiceData } }) => (
        <div className="w-full h-full px-6 py-3 text-left outline-none bg-transparent">
          {info.row.original.customerName || info.row.original.customer}
        </div>
      ),
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
      <h1 className="text-2xl text-center font-medium text-gray-700 mb-4">
        Import Invois
      </h1>
      <div
        className={`flex mb-4 ${
          fileData.length > 0 ? "justify-end" : "justify-center"
        }`}
      >
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
          additionalClasses={fileData.length > 0 ? "mr-2" : ""}
        >
          Upload Documents
        </Button>
        {fileData.length > 0 && (
          <button
            onClick={handleClearData}
            className="flex items-center px-4 py-2 font-medium text-red-600 border border-red-600 rounded-full hover:bg-red-50 active:bg-red-100 transition-colors duration-200"
          >
            <IconTrash className="mr-2 h-4 w-4" /> Clear
          </button>
        )}
      </div>
      {fileData.length > 0 && (
        <Table<InvoiceData>
          initialData={fileData}
          columns={columns}
          onChange={(newData: InvoiceData[]) => {
            setFileData(newData);
          }}
          onDelete={() => Promise.resolve()}
          isEditing={false}
          onToggleEditing={() => {}}
          onSave={() => {}}
          onCancel={() => {}}
          tableKey="invois"
        />
      )}
    </div>
  );
};

export default InvoisUploadPage;
