import React, { useState, useRef, useEffect } from "react";
import { IconCloudUpload } from "@tabler/icons-react";
import Table from "../components/Table";
import toast from "react-hot-toast";
import { ColumnConfig } from "../types/types";
import { useNavigate } from "react-router-dom";

interface OrderDetail {
  code: string;
  qty: string;
  price: string;
  total: string;
  discount: string;
  other: string;
}

interface InvoiceData {
  id: string;
  invoiceNo: string;
  orderNo: string;
  date: string;
  type: string;
  customer: string;
  customerName: string;
  salesman: string;
  totalAmount: string;
  discount: string;
  netAmount: string;
  rounding: string;
  payableAmount: string;
  cash: string;
  balance: string;
  time: string;
  orderDetails: OrderDetail[];
  isSorting?: boolean;
}

const InvoisPage: React.FC = () => {
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
          discount,
          netAmount,
          rounding,
          payableAmount,
          cash,
          balance,
          time,
          orderDetailsString,
        ] = line.split("|");

        const [customerId, customerName] = customer.split("\t");

        const orderDetails = orderDetailsString
          .split("E&")
          .filter(Boolean)
          .map((item) => {
            const [code, qty, price, total, discount, other] = item.split("&&");
            return {
              code,
              qty,
              price: (parseFloat(price) / 100).toFixed(2),
              total: (parseFloat(total) / 100).toFixed(2),
              discount: discount || "0",
              other: other || "0",
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
          discount,
          netAmount,
          rounding,
          payableAmount,
          cash,
          balance,
          time,
          orderDetails,
        };
      });
  };

  const handleInvoiceClick = (invoiceId: string, invoiceData: InvoiceData) => {
    navigate(`/statement/invois/${invoiceId}`, { state: { invoiceData } });
  };

  const handleDelete = async (selectedIds: number[]): Promise<void> => {
    return new Promise((resolve) => {
      setTimeout(() => {
        setFileData((prevData) =>
          prevData.filter((_, index) => !selectedIds.includes(index))
        );
        toast.success(`Deleted ${selectedIds.length} item(s)`);
        resolve();
      }, 1000);
    });
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
      width: 400,
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
      <h1 className="text-2xl font-bold mb-4">Invois</h1>
      <div className="mb-4">
        <input
          ref={fileInputRef}
          type="file"
          accept=".txt"
          onChange={handleFileUpload}
          className="hidden"
          id="fileUpload"
          multiple
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          className="flex items-center px-4 py-2 font-medium text-gray-700 border rounded-full hover:bg-gray-100 active:bg-gray-200 hover:text-gray-800 active:text-gray-900 transition-colors duration-200"
        >
          <IconCloudUpload className="mr-2 h-4 w-4" /> Upload Documents
        </button>
      </div>
      {fileData.length > 0 ? (
        <Table<InvoiceData>
          initialData={fileData}
          columns={columns}
          onChange={(newData: InvoiceData[]) => {
            setFileData(newData);
          }}
          onDelete={handleDelete}
          isEditing={false}
          onToggleEditing={() => {}}
          onSave={() => {}}
          onCancel={() => {}}
          tableKey="invois"
        />
      ) : (
        <p>No invoice data available. Please upload some invoices.</p>
      )}
    </div>
  );
};

export default InvoisPage;
