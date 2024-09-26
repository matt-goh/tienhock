import React, { useState, useEffect, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Table from "../components/Table";
import Button from "../components/Button";
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

  const calculateTotal = (items: OrderDetail[], key: 'total' | 'foc' | 'returned') => {
    return items
      .reduce((sum, detail) => {
        const value = key === 'total' ? detail.total : 
                      key === 'foc' ? (parseFloat(detail.price) * detail.foc).toFixed(2) :
                      (parseFloat(detail.price) * detail.returned).toFixed(2);
        return sum + parseFloat(value || "0");
      }, 0)
      .toFixed(2);
  };

  const addTotalRow = (items: OrderDetail[], totalAmount: string): OrderDetail[] => {
    return [
      ...items,
      {
        code: "",
        qty: "",
        price: "Total:",
        total: totalAmount,
        isTotal: true,
        foc: 0,
        returned: 0,
      },
    ];
  };

  const orderDetailsWithTotal = useMemo(() => {
    const totalAmount = calculateTotal(orderDetails, 'total');
    return addTotalRow(orderDetails, totalAmount);
  }, [orderDetails]);

  const focItemsWithTotal = useMemo(() => {
    const items = orderDetails.filter((item) => item.foc > 0);
    const totalAmount = calculateTotal(items, 'foc');
    return addTotalRow(items, totalAmount);
  }, [orderDetails]);

  const returnedGoodsWithTotal = useMemo(() => {
    const items = orderDetails.filter((item) => item.returned > 0);
    const totalAmount = calculateTotal(items, 'returned');
    return addTotalRow(items, totalAmount);
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
    {
      id: "total",
      header: "AMOUNT",
      type: "amount",
      width: 100,
      cell: (info: { getValue: () => any; row: { original: OrderDetail } }) => (
        <div className="w-full h-full px-6 py-3 text-right outline-none bg-transparent">
          {info.row.original.isTotal
            ? info.getValue()
            : (parseFloat(info.row.original.price) * info.row.original.returned).toFixed(2)}
        </div>
      ),
    },
  ];

  const focItemsColumns: ColumnConfig[] = [
    { id: "code", header: "ID", type: "readonly", width: 120 },
    { id: "productName", header: "PRODUCT", type: "readonly", width: 300 },
    { id: "foc", header: "QUANTITY", type: "readonly", width: 150 },
    { id: "price", header: "PRICE", type: "readonly", width: 100 },
    {
      id: "total",
      header: "AMOUNT",
      type: "amount",
      width: 100,
      cell: (info: { getValue: () => any; row: { original: OrderDetail } }) => (
        <div className="w-full h-full px-6 py-3 text-right outline-none bg-transparent">
          {info.row.original.isTotal
            ? info.getValue()
            : (parseFloat(info.row.original.price) * info.row.original.foc).toFixed(2)}
        </div>
      ),
    },
  ];

  const renderActionButtons = () => {
    const hasFOC = focItemsWithTotal.length > 1;
    const hasReturned = returnedGoodsWithTotal.length > 1;

    const renderButton = (text: string, onClick?: () => void) => (
      <Button onClick={onClick} variant="outline" size="md">
        {text}
      </Button>
    );

    if (!hasFOC && !hasReturned) {
      return (
        <div className="flex justify-center items-center space-x-2 mt-8 text-gray-700">
          {renderButton("Add FOC")}
          <span>or</span>
          {renderButton("Add Returned goods")}
        </div>
      );
    }

    if (!hasFOC) {
      return (
        <div className="flex justify-center items-center mt-8 text-gray-700">
          {renderButton("Add FOC")}
        </div>
      );
    }

    if (!hasReturned) {
      return (
        <div className="flex justify-center items-center mt-8 text-gray-700">
          {renderButton("Add Returned goods")}
        </div>
      );
    }

    return null;
  };

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

      {focItemsWithTotal.length > 1 && (
        <>
          <h2 className="text-xl font-semibold mt-8 mb-4">FOC</h2>
          <Table<OrderDetail>
            initialData={focItemsWithTotal}
            columns={focItemsColumns}
            onChange={() => {}}
            onDelete={() => Promise.resolve()}
            isEditing={false}
            onToggleEditing={() => {}}
            onSave={() => {}}
            onCancel={() => {}}
            tableKey="focItems"
          />
        </>
      )}

      {returnedGoodsWithTotal.length > 1 && (
        <>
          <h2 className="text-xl font-semibold mt-8 mb-4">Returned Goods</h2>
          <Table<OrderDetail>
            initialData={returnedGoodsWithTotal}
            columns={returnedGoodsColumns}
            onChange={() => {}}
            onDelete={() => Promise.resolve()}
            isEditing={false}
            onToggleEditing={() => {}}
            onSave={() => {}}
            onCancel={() => {}}
            tableKey="returnedGoods"
          />
        </>
      )}
      {renderActionButtons()}
    </div>
  );
};

export default InvoisDetailsPage;