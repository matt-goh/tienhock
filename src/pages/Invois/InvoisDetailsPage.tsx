import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import TableEditing from "../../components/Table/TableEditing";
import Button from "../../components/Button";
import { ColumnConfig, InvoiceData, OrderDetail } from "../../types/types";
import BackButton from "../../components/BackButton";
import toast from "react-hot-toast";
import { updateInvoice } from "./InvoisUtils";

const InvoisDetailsPage: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [invoiceData, setInvoiceData] = useState<InvoiceData | null>(
    location.state?.invoiceData || null
  );
  const [orderDetails, setOrderDetails] = useState<OrderDetail[]>([]);
  const [focItems, setFocItems] = useState<OrderDetail[]>([]);
  const [returnedGoods, setReturnedGoods] = useState<OrderDetail[]>([]);
  const [products, setProducts] = useState<
    { id: string; description: string }[]
  >([]);

  useEffect(() => {
    if (invoiceData) {
      updateInvoice(invoiceData);
    }
  }, [invoiceData]);

  useEffect(() => {
    console.log(invoiceData);
  }, [invoiceData]);

  const calculateTotal = useCallback(
    (items: OrderDetail[], key: "total" | "foc" | "returned") => {
      return items
        .reduce((sum, detail) => {
          if (detail.isTotal) return sum;
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

  const updateInvoiceData = useCallback(
    (updatedDetails: OrderDetail[]) => {
      if (invoiceData) {
        const updatedInvoiceData = {
          ...invoiceData,
          orderDetails: updatedDetails,
        };
        setTimeout(() => {
          setInvoiceData(updatedInvoiceData);
        }, 0);
        updateInvoice(updatedInvoiceData);
      }
    },
    [invoiceData]
  );

  // HC
  const handleChange = useCallback(
    (updatedItems: OrderDetail[]) => {
      setTimeout(() => {
        setOrderDetails((prevDetails) => {
          const newDetails = updatedItems
            .filter((item) => !item.isTotal)
            .map((updatedItem) => {
              const existingItem = prevDetails.find(
                (item) => item.code === updatedItem.code
              );
              if (existingItem) {
                return {
                  ...existingItem,
                  ...updatedItem,
                  total: (updatedItem.qty * updatedItem.price).toFixed(2),
                };
              }
              return updatedItem;
            });

          // Recalculate the total
          const totalAmount = calculateTotal(newDetails, "total");

          // Add or update the total row
          const totalRow = {
            code: "",
            productName: "Total:",
            qty: 0,
            price: 0,
            total: totalAmount,
            isTotal: true,
            foc: 0,
            returned: 0,
          };

          return [...newDetails, totalRow];
        });
      }, 0);

      setTimeout(() => {
        // Update invoice data
        setInvoiceData((prevInvoiceData) => {
          if (prevInvoiceData) {
            return {
              ...prevInvoiceData,
              orderDetails: updatedItems,
            };
          }
          return prevInvoiceData;
        });
      }, 0);

      setTimeout(() => {
        // Update FOC and returned items
        setFocItems((prevItems) =>
          updateRelatedItems(prevItems, updatedItems, "foc")
        );
      }, 0);

      setTimeout(() => {
        setReturnedGoods((prevItems) =>
          updateRelatedItems(prevItems, updatedItems, "returned")
        );
      }, 0);
    },
    [calculateTotal]
  );

  const updateRelatedItems = (
    prevItems: OrderDetail[],
    updatedItems: OrderDetail[],
    key: "foc" | "returned"
  ) => {
    return prevItems.map((prevItem) => {
      const updatedItem = updatedItems.find(
        (item) => item.code === prevItem.code
      );
      if (updatedItem) {
        return {
          ...prevItem,
          [key]: updatedItem[key],
          total: (updatedItem.price * updatedItem[key]).toFixed(2),
        };
      }
      return prevItem;
    });
  };

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

  // HFC
  const handleFocChange = (newData: OrderDetail[]) => {
    const updatedFocItems = newData.filter((item) => !item.isTotal);
    setTimeout(() => {
      setFocItems(updatedFocItems);

      setOrderDetails((prevDetails) => {
        const updatedDetails = prevDetails.map((detail) => {
          const updatedFocItem = updatedFocItems.find(
            (focItem) => focItem.code === detail.code
          );
          return updatedFocItem
            ? { ...detail, foc: updatedFocItem.foc }
            : detail;
        });
        updateInvoiceData(updatedDetails);
        return updatedDetails;
      });
    }, 0);
  };

  // HRGC
  const handleReturnedGoodsChange = (newData: OrderDetail[]) => {
    const updatedReturnedGoods = newData.filter((item) => !item.isTotal);
    setTimeout(() => {
      setReturnedGoods(updatedReturnedGoods);
      setOrderDetails((prevDetails) => {
        const updatedDetails = prevDetails.map((detail) => {
          const updatedReturnedItem = updatedReturnedGoods.find(
            (returnedItem) => returnedItem.code === detail.code
          );
          return updatedReturnedItem
            ? { ...detail, returned: updatedReturnedItem.returned }
            : detail;
        });
        updateInvoiceData(updatedDetails);
        return updatedDetails;
      });
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

  const columns: ColumnConfig[] = [
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
    },
    {
      id: "qty",
      header: "QUANTITY",
      type: "number",
      width: 100,
      cell: (info: { getValue: () => any; row: { original: OrderDetail } }) => (
        <input
          type="number"
          min="1"
          value={Math.max(1, info.getValue())}
          onChange={(e) => {
            const newValue = Math.max(1, parseInt(e.target.value, 10) || 1);
            const updatedItem = {
              ...info.row.original,
              qty: newValue,
              total: (newValue * info.row.original.price).toFixed(2),
            };
            handleChange(
              orderDetails.map((item) =>
                item.code === updatedItem.code ? updatedItem : item
              )
            );
          }}
          className="w-full h-full px-6 py-3 text-right outline-none bg-transparent"
        />
      ),
    },
    {
      id: "price",
      header: "PRICE",
      type: "float",
      width: 100,
      cell: (info: { getValue: () => any; row: { original: OrderDetail } }) => (
        <input
          type="number"
          step="0.01"
          value={info.getValue()}
          onChange={(e) => {
            const newValue = parseFloat(e.target.value) || 0;
            const updatedItem = {
              ...info.row.original,
              price: newValue,
              total: (info.row.original.qty * newValue).toFixed(2),
            };
            handleChange([updatedItem]);
          }}
          className="w-full h-full px-6 py-3 text-right outline-none bg-transparent"
        />
      ),
    },
    {
      id: "total",
      header: "AMOUNT",
      type: "amount",
      width: 100,
      cell: (info: { getValue: () => any; row: { original: OrderDetail } }) => (
        <div className="w-full h-full px-6 py-3 text-right outline-none bg-transparent">
          {(info.row.original.qty * info.row.original.price).toFixed(2)}
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
    },
    {
      id: "foc",
      header: "QUANTITY",
      type: "number",
      width: 150,
      cell: (info: { getValue: () => any; row: { original: OrderDetail } }) => (
        <input
          type="number"
          min="1"
          value={Math.max(1, info.getValue())}
          onChange={(e) => {
            const newValue = Math.max(1, parseInt(e.target.value, 10) || 1);
            const updatedItem = { ...info.row.original, foc: newValue };
            handleFocChange(
              focItems.map((item) =>
                item.code === updatedItem.code ? updatedItem : item
              )
            );
          }}
          className="w-full h-full px-6 py-3 text-right outline-none bg-transparent"
        />
      ),
    },
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

  const returnedGoodsColumns: ColumnConfig[] = [
    { id: "code", header: "ID", type: "readonly", width: 120 },
    {
      id: "productName",
      header: "PRODUCT",
      type: "combobox",
      width: 350,
      options: products.map((p) => p.description),
    },
    {
      id: "returned",
      header: "QUANTITY",
      type: "number",
      width: 150,
      cell: (info: { getValue: () => any; row: { original: OrderDetail } }) => (
        <input
          type="number"
          min="1"
          value={Math.max(1, info.getValue())}
          onChange={(e) => {
            const newValue = Math.max(1, parseInt(e.target.value, 10) || 1);
            const updatedItem = { ...info.row.original, returned: newValue };
            handleReturnedGoodsChange(
              returnedGoods.map((item) =>
                item.code === updatedItem.code ? updatedItem : item
              )
            );
          }}
          className="w-full h-full px-6 py-3 text-right outline-none bg-transparent"
        />
      ),
    },
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
