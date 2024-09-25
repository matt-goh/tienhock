import React, { useState, useEffect, useMemo } from "react";
import { useParams, Link, useLocation } from "react-router-dom";
import Table from "../components/Table";
import { ColumnConfig } from "../types/types";

interface OrderDetail {
  code: string;
  productName: string;
  qty: string;
  price: string;
  total: string;
  discount: string;
  other: string;
  isTotal?: boolean;
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
}

const InvoisDetailsPage: React.FC = () => {
  const location = useLocation();
  const invoiceData = location.state?.invoiceData as InvoiceData;
  const [orderDetails, setOrderDetails] = useState<OrderDetail[]>([]);

  useEffect(() => {
    if (invoiceData && invoiceData.orderDetails) {
      setOrderDetails(invoiceData.orderDetails);
    }
  }, [invoiceData]);

  const columns: ColumnConfig[] = [
    { id: "code", header: "ID", type: "readonly", width: 120 },
    { id: "productName", header: "PRODUCT", type: "readonly", width: 300 },
    { id: "qty", header: "QUANTITY", type: "readonly", width: 100 },
    { id: "price", header: "PRICE", type: "readonly", width: 100 },
    { id: "total", header: "AMOUNT", type: "amount", width: 100 },
  ];

  const handleDelete = async (selectedIds: number[]): Promise<void> => {
    console.log("Delete function called with ids:", selectedIds);
    return Promise.resolve();
  };

  const handleChange = (newData: OrderDetail[]) => {
    setOrderDetails(newData);
  };

  const calculateTotal = useMemo(() => {
    return orderDetails
      .reduce((sum, detail) => sum + parseFloat(detail.total || "0"), 0)
      .toFixed(2);
  }, [orderDetails]);

  const orderDetailsWithTotal = useMemo(() => {
    return [
      ...orderDetails,
      {
        id: "total-row",
        code: "",
        productName: "",
        qty: "",
        price: "",
        total: calculateTotal,
        discount: "",
        other: "",
        isTotal: true,
      },
    ];
  }, [orderDetails, calculateTotal]);

  if (!invoiceData) {
    return <div>No invoice data found.</div>;
  }

  return (
    <div className="p-4 max-w-6xl mx-auto">
      <Link
        to="/statement/invois"
        className="text-blue-600 hover:text-blue-800 mb-4 inline-block"
      >
        &larr; Back to Invois
      </Link>
      <h1 className="text-2xl font-bold mb-4">Invoice Details</h1>

      <div className="grid grid-cols-2 gap-6 mb-6">
        <div className="bg-gray-100 p-4 rounded-lg">
          <h2 className="text-lg font-semibold mb-2">Invoice Information</h2>
          <p>
            <strong>Invoice No:</strong> {invoiceData.type}
            {invoiceData.invoiceNo}
          </p>
          <p>
            <strong>Order No:</strong> {invoiceData.orderNo}
          </p>
          <p>
            <strong>Date:</strong> {invoiceData.date}
          </p>
          <p>
            <strong>Time:</strong> {invoiceData.time}
          </p>
          <p>
            <strong>Type:</strong>{" "}
            {invoiceData.type === "C" ? "Cash" : "Invoice"}
          </p>
        </div>
        <div className="bg-gray-100 p-4 rounded-lg">
          <h2 className="text-lg font-semibold mb-2">Customer Information</h2>
          <p>
            <strong>Customer ID:</strong> {invoiceData.customer}
          </p>
          <p>
            <strong>Customer:</strong> {invoiceData.customerName}
          </p>
          <p>
            <strong>Salesman:</strong> {invoiceData.salesman}
          </p>
        </div>
      </div>

      <h2 className="text-xl font-semibold mb-2">Order Details</h2>
      <Table<OrderDetail>
        initialData={orderDetailsWithTotal}
        columns={columns}
        onChange={handleChange}
        onDelete={handleDelete}
        isEditing={false}
        onToggleEditing={() => {}}
        onSave={() => {}}
        onCancel={() => {}}
        tableKey="orderDetails"
      />

      <div className="mt-6 grid grid-cols-2 gap-6">
        <div className="bg-gray-100 p-4 rounded-lg">
          <h2 className="text-lg font-semibold mb-2">Amount Details</h2>
          <p>
            <strong>Total Amount:</strong> {invoiceData.totalAmount}
          </p>
          <p>
            <strong>Discount:</strong> {invoiceData.discount}
          </p>
          <p>
            <strong>Net Amount:</strong> {invoiceData.netAmount}
          </p>
          <p>
            <strong>Rounding:</strong> {invoiceData.rounding}
          </p>
        </div>
        <div className="bg-gray-100 p-4 rounded-lg">
          <h2 className="text-lg font-semibold mb-2">Payment Details</h2>
          <p>
            <strong>Payable Amount:</strong> {invoiceData.payableAmount}
          </p>
          <p>
            <strong>Cash:</strong> {invoiceData.cash}
          </p>
          <p>
            <strong>Balance:</strong> {invoiceData.balance}
          </p>
        </div>
      </div>
    </div>
  );
};

export default InvoisDetailsPage;
