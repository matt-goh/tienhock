import React, { useState, useEffect, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Table from "../components/Table";
import { ColumnConfig, InvoiceData, OrderDetail } from "../types/types";
import BackButton from "../components/BackButton";

const InvoisDetailsPage: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
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
        price: "Total:",
        total: calculateTotal,
        discount: "",
        isTotal: true,
        foc: 0,
        returned: 0,
      },
    ];
  }, [orderDetails, calculateTotal]);

  const returnedGoods = useMemo(() => {
    return orderDetails.filter((item) => item.returned > 0);
  }, [orderDetails]);

  const focItems = useMemo(() => {
    return orderDetails.filter((item) => item.foc > 0);
  }, [orderDetails]);

  if (!invoiceData) {
    return <div>No invoice data found.</div>;
  }

  const handleBackClick = () => {
    navigate("/stock/invois/new");
  };

  const returnedGoodsColumns: ColumnConfig[] = [
    { id: "code", header: "ID", type: "readonly", width: 120 },
    { id: "productName", header: "PRODUCT", type: "readonly", width: 300 },
    { id: "returned", header: "QUANTITY", type: "readonly", width: 150 },
    { id: "price", header: "PRICE", type: "readonly", width: 100 },
    { id: "total", header: "AMOUNT", type: "amount", width: 100 },
  ];

  const focItemsColumns: ColumnConfig[] = [
    { id: "code", header: "ID", type: "readonly", width: 120 },
    { id: "productName", header: "PRODUCT", type: "readonly", width: 300 },
    { id: "foc", header: "QUANTITY", type: "readonly", width: 150 },
    { id: "price", header: "PRICE", type: "readonly", width: 100 },
    { id: "total", header: "AMOUNT", type: "amount", width: 100 },
  ];

  return (
    <div className="px-4 max-w-6xl mx-auto">
      <BackButton onClick={handleBackClick} className="" />
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

      <h2 className="text-xl font-semibold mb-4">Order Details</h2>
      <Table<OrderDetail>
        initialData={orderDetailsWithTotal}
        columns={columns}
        onChange={handleChange}
        onDelete={() => Promise.resolve()}
        isEditing={false}
        onToggleEditing={() => {}}
        onSave={() => {}}
        onCancel={() => {}}
        tableKey="orderDetails"
      />

      <h2 className="text-xl font-semibold mt-8 mb-4">Returned Goods</h2>
      <Table<OrderDetail>
        initialData={returnedGoods}
        columns={returnedGoodsColumns}
        onChange={() => {}}
        onDelete={() => Promise.resolve()}
        isEditing={false}
        onToggleEditing={() => {}}
        onSave={() => {}}
        onCancel={() => {}}
        tableKey="returnedGoods"
      />

      <h2 className="text-xl font-semibold mt-8 mb-4">FOC Items</h2>
      <Table<OrderDetail>
        initialData={focItems}
        columns={focItemsColumns}
        onChange={() => {}}
        onDelete={() => Promise.resolve()}
        isEditing={false}
        onToggleEditing={() => {}}
        onSave={() => {}}
        onCancel={() => {}}
        tableKey="focItems"
      />
    </div>
  );
};

export default InvoisDetailsPage;
