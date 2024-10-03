import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import TableEditing from "../../components/Table/TableEditing";
import Button from "../../components/Button";
import { ColumnConfig, InvoiceData, OrderDetail } from "../../types/types";
import BackButton from "../../components/BackButton";
import toast from "react-hot-toast";

const InvoisDetailsPage: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const invoiceData = location.state?.invoiceData as InvoiceData;
  const [orderDetails, setOrderDetails] = useState<OrderDetail[]>([]);
  const [focItems, setFocItems] = useState<OrderDetail[]>([]);
  const [returnedGoods, setReturnedGoods] = useState<OrderDetail[]>([]);
  const [products, setProducts] = useState<
    { id: string; description: string }[]
  >([]);

  const handleCellChange = useCallback(
    (rowIndex: number, columnId: string, value: any) => {
      setOrderDetails((prevDetails) => {
        const newDetails = [...prevDetails];
        newDetails[rowIndex] = { ...newDetails[rowIndex], [columnId]: value };
        return newDetails;
      });
    },
    []
  );

  const handleFocCellChange = useCallback(
    (rowIndex: number, columnId: string, value: any) => {
      setFocItems((prevItems) => {
        const newItems = [...prevItems];
        newItems[rowIndex] = { ...newItems[rowIndex], [columnId]: value };
        return newItems;
      });
    },
    []
  );

  const handleReturnedGoodsCellChange = useCallback(
    (rowIndex: number, columnId: string, value: any) => {
      setReturnedGoods((prevGoods) => {
        const newGoods = [...prevGoods];
        newGoods[rowIndex] = { ...newGoods[rowIndex], [columnId]: value };
        return newGoods;
      });
    },
    []
  );

  useEffect(() => {
    console.log(invoiceData);
  }, [invoiceData]);

  const columns: ColumnConfig[] = useMemo(
    () => [
      {
        id: "code",
        header: "ID",
        type: "readonly",
        width: 120,
      },
      {
        id: "productName",
        header: "PRODUCT",
        type: "combobox",
        width: 350,
        options: products.map((p) => p.description),
        onChange: (rowIndex: number, newValue: string) => {
          const product = products.find((p) => p.description === newValue);
          if (product) {
            handleCellChange(rowIndex, "productName", newValue);
            handleCellChange(rowIndex, "code", product.id);
          }
        },
      },
      { id: "qty", header: "QUANTITY", type: "number", width: 100 },
      { id: "price", header: "PRICE", type: "float", width: 100 },
      { id: "total", header: "AMOUNT", type: "amount", width: 100 },
      { id: "action", header: "", type: "action", width: 50 },
    ],
    [products, handleCellChange]
  );

  const returnedGoodsColumns: ColumnConfig[] = [
    { id: "code", header: "ID", type: "readonly", width: 120 },
    {
      id: "productName",
      header: "PRODUCT",
      type: "combobox",
      width: 350,
      options: products.map((p) => p.description),
      onChange: (rowIndex: number, newValue: string) => {
        const product = products.find((p) => p.description === newValue);
        if (product) {
          handleReturnedGoodsCellChange(rowIndex, "productName", newValue);
          handleReturnedGoodsCellChange(rowIndex, "code", product.id);
        }
      },
    },
    { id: "returned", header: "QUANTITY", type: "number", width: 150 },
    { id: "price", header: "PRICE", type: "float", width: 100 },
    {
      id: "total",
      header: "AMOUNT",
      type: "amount",
      width: 100,
      cell: (info: { getValue: () => any; row: { original: OrderDetail } }) => (
        <div className="w-full h-full px-6 py-3 text-right outline-none bg-transparent">
          {info.row.original.isTotal
            ? info.getValue()
            : (
                parseFloat(info.row.original.price.toString()) *
                info.row.original.returned
              ).toFixed(2)}
        </div>
      ),
    },
    { id: "action", header: "", type: "action", width: 50 },
  ];

  const focItemsColumns: ColumnConfig[] = [
    { id: "code", header: "ID", type: "readonly", width: 120 },
    {
      id: "productName",
      header: "PRODUCT",
      type: "combobox",
      width: 350,
      options: products.map((p) => p.description),
      onChange: (rowIndex: number, newValue: string) => {
        const product = products.find((p) => p.description === newValue);
        if (product) {
          handleFocCellChange(rowIndex, "productName", newValue);
          handleFocCellChange(rowIndex, "code", product.id);
        }
      },
    },
    { id: "foc", header: "QUANTITY", type: "number", width: 150 },
    { id: "price", header: "PRICE", type: "float", width: 100 },
    {
      id: "total",
      header: "AMOUNT",
      type: "amount",
      width: 100,
      cell: (info: { getValue: () => any; row: { original: OrderDetail } }) => (
        <div className="w-full h-full px-6 py-3 text-right outline-none bg-transparent">
          {info.row.original.isTotal
            ? info.getValue()
            : (
                parseFloat(info.row.original.price.toString()) *
                info.row.original.foc
              ).toFixed(2)}
        </div>
      ),
    },
    { id: "action", header: "", type: "action", width: 50 },
  ];

  const calculateTotal = useCallback(
    (items: OrderDetail[], key: "total" | "foc" | "returned") => {
      return items
        .reduce((sum, detail) => {
          if (detail.isLess) {
            return sum - parseFloat(detail.total || "0");
          }
          if (detail.isTax) {
            return sum + parseFloat(detail.total || "0");
          }
          if (detail.isSubtotal) {
            return sum;
          }
          const value =
            key === "total"
              ? detail.total
              : key === "foc"
              ? (parseFloat(detail.price.toString()) * detail.foc).toFixed(2)
              : (parseFloat(detail.price.toString()) * detail.returned).toFixed(
                  2
                );
          return sum + parseFloat(value || "0");
        }, 0)
        .toFixed(2);
    },
    []
  );

  useEffect(() => {
    if (invoiceData && invoiceData.orderDetails) {
      const initialOrderDetails = invoiceData.orderDetails;
      setOrderDetails(initialOrderDetails);
      setFocItems(initialOrderDetails.filter((item) => item.foc > 0));
      setReturnedGoods(initialOrderDetails.filter((item) => item.returned > 0));
    }
  }, [invoiceData, calculateTotal]);

  const fetchProducts = async () => {
    try {
      const response = await fetch(
        "http://localhost:5000/api/products/combobox"
      );
      if (!response.ok) throw new Error("Failed to fetch products");
      const data = await response.json();
      setProducts(data);
    } catch (error) {
      console.error("Error fetching products:", error);
      toast.error("Error fetching products");
      // You might want to show an error message to the user here
    }
  };

  useEffect(() => {
    fetchProducts();
  }, []);

  const addTotalRow = useCallback(
    (items: OrderDetail[], totalAmount: string): OrderDetail[] => {
      const existingTotalRow = items.find((item) => item.isTotal);
      if (existingTotalRow) {
        return items.map((item) =>
          item.isTotal ? { ...item, total: totalAmount } : item
        );
      } else {
        return [
          ...items,
          {
            code: "",
            productName: "Total:",
            qty: 0,
            price: 0,
            total: totalAmount,
            isTotal: true,
            foc: 0,
            returned: 0,
          },
        ];
      }
    },
    []
  );

  const orderDetailsWithTotal = useMemo(() => {
    const totalAmount = calculateTotal(orderDetails, "total");
    return addTotalRow(orderDetails, totalAmount);
  }, [orderDetails, calculateTotal, addTotalRow]);

  const recalculateSubtotals = useCallback(
    (details: OrderDetail[]): OrderDetail[] => {
      let runningTotal = 0;
      let lastSubtotalIndex = -1;

      return details.map((item, index) => {
        if (item.isSubtotal) {
          const subtotalItem = { ...item, total: runningTotal.toFixed(2) };
          lastSubtotalIndex = index;
          return subtotalItem;
        } else if (item.isLess) {
          runningTotal -= parseFloat(item.total || "0");
        } else if (item.isTax) {
          runningTotal += parseFloat(item.total || "0");
        } else if (!item.isTotal) {
          runningTotal += parseFloat(item.total || "0");
        }
        return item;
      });
    },
    []
  );

  const handleSpecialRowDelete = useCallback(
    (rowType: "less" | "tax" | "subtotal") => {
      setOrderDetails((prevDetails) => {
        const newDetails = prevDetails.filter(
          (item) =>
            (rowType === "less" && !item.isLess) ||
            (rowType === "tax" && !item.isTax) ||
            (rowType === "subtotal" && !item.isSubtotal)
        );
        return recalculateSubtotals(newDetails);
      });
    },
    [recalculateSubtotals]
  );

  const handleChange = useCallback(
    (newData: OrderDetail[]) => {
      setTimeout(() => {
        setOrderDetails(
          recalculateSubtotals(newData.filter((item) => !item.isTotal))
        );
      }, 0);
    },
    [recalculateSubtotals]
  );
  const handleAddLess = () => {
    setOrderDetails((prevDetails) => [
      ...prevDetails,
      {
        code: "LESS",
        productName: "Less",
        qty: 0,
        price: 0,
        total: "0",
        isLess: true,
        foc: 0,
        returned: 0,
      },
    ]);
  };

  const handleAddTax = () => {
    setOrderDetails((prevDetails) => [
      ...prevDetails,
      {
        code: "TAX",
        productName: "Tax",
        qty: 0,
        price: 0,
        total: "0",
        isTax: true,
        foc: 0,
        returned: 0,
      },
    ]);
  };

  const handleAddSubtotal = () => {
    setOrderDetails((prevDetails) => {
      const subtotalAmount = calculateTotal(
        prevDetails.filter((item) => !item.isSubtotal),
        "total"
      );
      return [
        ...prevDetails,
        {
          code: "SUBTOTAL",
          productName: "Subtotal",
          qty: 0,
          price: 0,
          total: subtotalAmount,
          isSubtotal: true,
          foc: 0,
          returned: 0,
        },
      ];
    });
  };

  const focItemsWithTotal = useMemo(() => {
    const totalAmount = calculateTotal(focItems, "foc");
    return addTotalRow(focItems, totalAmount);
  }, [focItems]);

  const returnedGoodsWithTotal = useMemo(() => {
    const totalAmount = calculateTotal(returnedGoods, "returned");
    return addTotalRow(returnedGoods, totalAmount);
  }, [returnedGoods]);

  if (!invoiceData) {
    return <div>No invoice data found.</div>;
  }

  const handleBackClick = () => {
    navigate("/stock/invois/new");
  };

  const handleAddFOC = () => {
    const newFocItem: OrderDetail = {
      code: "",
      productName: "",
      qty: 0,
      price: 0,
      total: "",
      foc: 0,
      returned: 0,
    };
    setFocItems([...focItems, newFocItem]);
  };

  const handleAddReturnedGoods = () => {
    const newReturnedItem: OrderDetail = {
      code: "",
      productName: "",
      qty: 0,
      price: 0,
      total: "",
      foc: 0,
      returned: 0,
    };
    setReturnedGoods([...returnedGoods, newReturnedItem]);
  };

  const handleFocChange = (newData: OrderDetail[]) => {
    setTimeout(() => {
      setFocItems(newData.filter((item) => !item.isTotal));
    }, 0);
  };

  const handleReturnedGoodsChange = (newData: OrderDetail[]) => {
    setTimeout(() => {
      setReturnedGoods(newData.filter((item) => !item.isTotal));
    }, 0);
  };

  const renderActionButtons = () => {
    const hasFOC = focItems.length > 0;
    const hasReturned = returnedGoods.length > 0;

    const renderButton = (text: string, onClick?: () => void) => (
      <Button onClick={onClick} variant="outline" size="md">
        {text}
      </Button>
    );

    return (
      <div className="flex justify-center items-center space-x-2 mt-8 text-gray-700">
        {!hasFOC && renderButton("Add FOC", handleAddFOC)}
        {!hasFOC && !hasReturned && <span>or</span>}
        {!hasReturned &&
          renderButton("Add Returned goods", handleAddReturnedGoods)}
      </div>
    );
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

      <div className="relative mb-6">
        <h2 className="text-xl font-semibold pt-2">Order Details</h2>
        <div className="absolute top-0 right-0 space-x-2">
          <Button onClick={handleAddLess} variant="outline" size="md">
            Less
          </Button>
          <Button onClick={handleAddTax} variant="outline" size="md">
            Tax
          </Button>
          <Button onClick={handleAddSubtotal} variant="outline" size="md">
            Subtotal
          </Button>
        </div>
      </div>
      <TableEditing<OrderDetail>
        initialData={orderDetailsWithTotal}
        columns={columns}
        onChange={handleChange}
        onSpecialRowDelete={handleSpecialRowDelete}
        tableKey="orderDetails"
      />

      {(focItems.length > 0 || focItemsWithTotal.length > 1) && (
        <>
          <h2 className="text-xl font-semibold mt-8 mb-4">FOC</h2>
          <TableEditing<OrderDetail>
            initialData={focItemsWithTotal}
            columns={focItemsColumns}
            onChange={handleFocChange}
            tableKey="focItems"
          />
        </>
      )}

      {(returnedGoods.length > 0 || returnedGoodsWithTotal.length > 1) && (
        <>
          <h2 className="text-xl font-semibold mt-8 mb-4">Returned Goods</h2>
          <TableEditing<OrderDetail>
            initialData={returnedGoodsWithTotal}
            columns={returnedGoodsColumns}
            onChange={handleReturnedGoodsChange}
            tableKey="returnedGoods"
          />
        </>
      )}
      {renderActionButtons()}
    </div>
  );
};

export default InvoisDetailsPage;
