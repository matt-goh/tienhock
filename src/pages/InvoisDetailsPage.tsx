import React, { useState, useEffect } from "react";
import { useParams, Link, useLocation } from "react-router-dom";
import Table from "../components/Table";
import { ColumnConfig } from "../types/types";

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
  orderDetails: string;
}

const InvoisDetailsPage: React.FC = () => {
  const location = useLocation();
  const invoiceData = location.state?.invoiceData as InvoiceData;
  const [orderDetails, setOrderDetails] = useState<OrderDetail[]>([]);

  useEffect(() => {
    if (invoiceData && invoiceData.orderDetails) {
      const parsedOrderDetails = parseOrderDetails(invoiceData.orderDetails);
      setOrderDetails(parsedOrderDetails);
    }
  }, [invoiceData]);

  const parseOrderDetails = (orderDetailsString: any): OrderDetail[] => {
    if (Array.isArray(orderDetailsString)) {
      return orderDetailsString.map((item) => {
        const { code, qty, price, total, discount = "0", other = "0" } = item;
        return {
          code,
          qty,
          price: (parseFloat(price) / 100).toFixed(2),
          total: (parseFloat(total) / 100).toFixed(2),
          discount,
          other,
        };
      });
    } else if (typeof orderDetailsString === "string") {
      return orderDetailsString
        .split("&")
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
    } else {
      console.error("Unexpected format for orderDetailsString");
      return [];
    }
  };

  const columns: ColumnConfig[] = [
    { id: "code", header: "Code", type: "readonly", width: 100 },
    { id: "qty", header: "Quantity", type: "readonly", width: 100 },
    { id: "price", header: "Price", type: "readonly", width: 100 },
    { id: "total", header: "Total", type: "readonly", width: 100 },
    { id: "discount", header: "Discount", type: "readonly", width: 100 },
    { id: "other", header: "Other", type: "readonly", width: 100 },
  ];

  const handleDelete = async (selectedIds: number[]): Promise<void> => {
    console.log("Delete function called with ids:", selectedIds);
    return Promise.resolve();
  };

  const handleChange = (newData: OrderDetail[]) => {
    setOrderDetails(newData);
  };

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
        initialData={orderDetails}
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
