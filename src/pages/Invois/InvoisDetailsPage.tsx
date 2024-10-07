import React, {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
} from "react";
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

  const calculateTotal = useCallback((items: OrderDetail[]) => {
    return items
      .reduce((sum, detail) => {
        if (detail.isTotal) {
          return sum;
        }
        if (detail.isLess) {
          return sum - parseFloat(detail.total || "0");
        }
        if (detail.isTax) {
          return sum + parseFloat(detail.total || "0");
        }
        if (detail.isSubtotal || detail.isTotal) {
          return sum;
        }
        return sum + parseFloat(detail.total || "0");
      }, 0)
      .toFixed(2);
  }, []);

  useEffect(() => {
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
          },
        ];
      }
    },
    []
  );

  const orderDetailsWithTotal = useMemo(() => {
    if (!invoiceData) return [];
    const regularItems = invoiceData.orderDetails.filter(
      (item) => !item.isFoc && !item.isReturned
    );
    const totalAmount = calculateTotal(regularItems);
    return addTotalRow(regularItems, totalAmount);
  }, [invoiceData, calculateTotal, addTotalRow]);

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
      setInvoiceData((prevData) => {
        if (!prevData) return null;
        const newDetails = prevData.orderDetails.filter(
          (item) =>
            (rowType === "less" && !item.isLess) ||
            (rowType === "tax" && !item.isTax) ||
            (rowType === "subtotal" && !item.isSubtotal)
        );
        return {
          ...prevData,
          orderDetails: recalculateSubtotals(newDetails),
        };
      });
    },
    [recalculateSubtotals]
  );

  const getRandomProduct = useCallback(() => {
    const availableProducts = products.filter(
      (p) => !invoiceData?.orderDetails.some((item) => item.code === p.id)
    );
    return availableProducts[
      Math.floor(Math.random() * availableProducts.length)
    ];
  }, [products, invoiceData]);

  const newRowAddedRef = useRef(false);
  const newFocRowAddedRef = useRef(false);
  const newReturnedRowAddedRef = useRef(false);

  // Reset newRowAddedRef after each render
  useEffect(() => {
    newRowAddedRef.current = false;
    newFocRowAddedRef.current = false;
    newReturnedRowAddedRef.current = false;
  });

  // HC
  const handleChange = useCallback(
    (updatedItems: OrderDetail[]) => {
      setTimeout(() => {
        setInvoiceData((prevInvoiceData) => {
          if (!prevInvoiceData) return null;

          let updatedOrderDetails = prevInvoiceData.orderDetails.filter(
            (item) => !item.isTotal
          );
          const newItems = updatedItems.filter((item) => !item.code);

          // Update existing items
          updatedOrderDetails = updatedOrderDetails.map((item) => {
            const updatedItem = updatedItems.find(
              (updated) =>
                updated.code === item.code &&
                updated.isFoc === item.isFoc &&
                updated.isReturned === item.isReturned
            );
            if (updatedItem) {
              return {
                ...item,
                ...updatedItem,
                total: (updatedItem.qty * updatedItem.price).toFixed(2),
              };
            }
            return item;
          });

          // Add only one new item if there are any and we haven't added one in this render cycle
          if (newItems.length > 0 && !newRowAddedRef.current) {
            const randomProduct = getRandomProduct();
            const newItem = {
              ...newItems[0],
              code: randomProduct.id,
              productName: randomProduct.description,
              qty: 1,
              total: (newItems[0].qty * newItems[0].price).toFixed(2),
            };
            updatedOrderDetails.push(newItem);
            newRowAddedRef.current = true;
          }

          // Calculate total
          const regularItems = updatedOrderDetails.filter(
            (item) => !item.isTotal && !item.isFoc && !item.isReturned
          );
          const totalAmount = calculateTotal(regularItems);

          // Add total row
          const totalRow = {
            code: "",
            productName: "Total:",
            qty: 0,
            price: 0,
            total: totalAmount,
            isTotal: true,
          };
          updatedOrderDetails.push(totalRow);

          return {
            ...prevInvoiceData,
            orderDetails: updatedOrderDetails,
          };
        });
      }, 0);
    },
    [calculateTotal, getRandomProduct]
  );

  const handleAddLess = () => {
    setInvoiceData((prevData) => {
      if (!prevData) return null;
      return {
        ...prevData,
        orderDetails: [
          ...prevData.orderDetails,
          {
            code: "LESS",
            productName: "Less",
            qty: 1,
            price: 0,
            total: "0",
            isLess: true,
          },
        ],
      };
    });
  };

  const handleAddTax = () => {
    setInvoiceData((prevData) => {
      if (!prevData) return null;
      return {
        ...prevData,
        orderDetails: [
          ...prevData.orderDetails,
          {
            code: "TAX",
            productName: "Tax",
            qty: 1,
            price: 0,
            total: "0",
            isTax: true,
          },
        ],
      };
    });
  };

  const handleAddSubtotal = () => {
    setInvoiceData((prevData) => {
      if (!prevData) return null;
      const subtotalAmount = calculateTotal(
        prevData.orderDetails.filter(
          (item) => !item.isSubtotal && !item.isFoc && !item.isReturned
        )
      );
      return {
        ...prevData,
        orderDetails: [
          ...prevData.orderDetails,
          {
            code: "SUBTOTAL",
            productName: "Subtotal",
            qty: 0,
            price: 0,
            total: subtotalAmount,
            isSubtotal: true,
          },
        ],
      };
    });
  };

  const focItemsWithTotal = useMemo(() => {
    if (!invoiceData) return [];
    const focItems = invoiceData.orderDetails.filter((item) => item.isFoc);
    const totalAmount = calculateTotal(focItems);
    return addTotalRow(focItems, totalAmount);
  }, [invoiceData, calculateTotal, addTotalRow]);

  const returnedItemsWithTotal = useMemo(() => {
    if (!invoiceData) return [];
    const returnedItems = invoiceData.orderDetails.filter(
      (item) => item.isReturned
    );
    const totalAmount = calculateTotal(returnedItems);
    return addTotalRow(returnedItems, totalAmount);
  }, [invoiceData, calculateTotal, addTotalRow]);

  if (!invoiceData) {
    return <div>No invoice data found.</div>;
  }

  const handleBackClick = () => {
    navigate("/stock/invois/new");
  };

  const handleAddFOC = () => {
    setInvoiceData((prevData) => {
      if (!prevData) return null;
      return {
        ...prevData,
        orderDetails: [
          ...prevData.orderDetails,
          {
            code: "",
            productName: "",
            qty: 1,
            price: 0,
            total: "0",
            isFoc: true,
          },
        ],
      };
    });
  };

  const handleAddReturnedGoods = () => {
    setInvoiceData((prevData) => {
      if (!prevData) return null;
      return {
        ...prevData,
        orderDetails: [
          ...prevData.orderDetails,
          {
            code: "",
            productName: "",
            qty: 1,
            price: 0,
            total: "0",
            isReturned: true,
          },
        ],
      };
    });
  };

  // HFC
  const handleFocChange = (updatedItems: OrderDetail[]) => {
    setTimeout(() => {
      setInvoiceData((prevInvoiceData) => {
        if (!prevInvoiceData) return null;

        console.log("Previous orderDetails:", prevInvoiceData.orderDetails);

        let updatedOrderDetails = prevInvoiceData.orderDetails.filter(
          (item) => !item.isTotal
        );
        const newItems = updatedItems.filter((item) => !item.code);

        console.log("New FOC items:", newItems);

        // Update existing items
        updatedOrderDetails = updatedOrderDetails.map((item) => {
          const updatedItem = updatedItems.find(
            (updated) => updated.code === item.code && item.isFoc // Only update FOC items
          );
          if (updatedItem) {
            return {
              ...item,
              ...updatedItem,
              total: (updatedItem.qty * updatedItem.price).toFixed(2),
            };
          }
          return item;
        });

        // Add only one new item if there are any and we haven't added one in this render cycle
        if (newItems.length > 0 && !newFocRowAddedRef.current) {
          const randomProduct = getRandomProduct();
          const newItem = {
            ...newItems[0],
            code: randomProduct.id,
            productName: randomProduct.description,
            qty: 1,
            price: 0,
            total: "0",
            isFoc: true,
          };
          updatedOrderDetails.push(newItem);
          newFocRowAddedRef.current = true;
          console.log("Added new FOC item:", newItem);
        }

        // Calculate total
        const focItems = updatedOrderDetails.filter((item) => item.isFoc);
        const totalAmount = calculateTotal(focItems);

        // Add total row
        const totalRow = {
          code: "",
          productName: "Total:",
          qty: 0,
          price: 0,
          total: totalAmount,
          isTotal: true,
          isFoc: true,
        };
        updatedOrderDetails = [
          ...updatedOrderDetails.filter((item) => !item.isTotal),
          totalRow,
        ];

        console.log("Final updatedOrderDetails:", updatedOrderDetails);

        return {
          ...prevInvoiceData,
          orderDetails: updatedOrderDetails,
        };
      });
    }, 0);
  };

  const handleReturnedChange = (updatedItems: OrderDetail[]) => {
    setTimeout(() => {
      setInvoiceData((prevInvoiceData) => {
        if (!prevInvoiceData) return null;

        console.log("Previous orderDetails:", prevInvoiceData.orderDetails);

        let updatedOrderDetails = prevInvoiceData.orderDetails.filter(
          (item) => !item.isTotal
        );
        const newItems = updatedItems.filter((item) => !item.code);

        console.log("New returned items:", newItems);

        // Update existing items
        updatedOrderDetails = updatedOrderDetails.map((item) => {
          const updatedItem = updatedItems.find(
            (updated) => updated.code === item.code && item.isReturned // Only update returned items
          );
          if (updatedItem) {
            return {
              ...item,
              ...updatedItem,
              total: (updatedItem.qty * updatedItem.price).toFixed(2),
            };
          }
          return item;
        });

        // Add only one new item if there are any and we haven't added one in this render cycle
        if (newItems.length > 0 && !newReturnedRowAddedRef.current) {
          const randomProduct = getRandomProduct();
          const newItem = {
            ...newItems[0],
            code: randomProduct.id,
            productName: randomProduct.description,
            qty: 1,
            price: 0,
            total: "0",
            isReturned: true,
          };
          updatedOrderDetails.push(newItem);
          newReturnedRowAddedRef.current = true;
          console.log("Added new returned item:", newItem);
        }

        // Calculate total
        const returnedItems = updatedOrderDetails.filter(
          (item) => item.isReturned
        );
        const totalAmount = calculateTotal(returnedItems);

        // Add total row
        const totalRow = {
          code: "",
          productName: "Total:",
          qty: 0,
          price: 0,
          total: totalAmount,
          isTotal: true,
          isReturned: true,
        };
        updatedOrderDetails = [
          ...updatedOrderDetails.filter((item) => !item.isTotal),
          totalRow,
        ];

        console.log("Final updatedOrderDetails:", updatedOrderDetails);

        return {
          ...prevInvoiceData,
          orderDetails: updatedOrderDetails,
        };
      });
    }, 0);
  };

  const renderActionButtons = () => {
    const hasFOC = invoiceData.orderDetails.some((item) => item.isFoc);
    const hasReturned = invoiceData.orderDetails.some(
      (item) => item.isReturned
    );

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
            handleChange([updatedItem]);
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
      id: "qty",
      header: "QUANTITY",
      type: "number",
      width: 150,
      cell: (info: { getValue: () => any; row: { original: OrderDetail } }) => (
        <input
          type="number"
          min="1"
          value={Math.max(1, Number(info.row.original.qty) || 1)}
          onChange={(e) => {
            const newValue = Math.max(1, parseInt(e.target.value, 10) || 1);
            const updatedItem = { ...info.row.original, qty: newValue };
            handleFocChange([updatedItem]);
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
                info.row.original.qty
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
      id: "qty",
      header: "QUANTITY",
      type: "number",
      width: 150,
      cell: (info: { getValue: () => any; row: { original: OrderDetail } }) => (
        <input
          type="number"
          min="1"
          value={Math.max(1, Number(info.row.original.qty) || 1)}
          onChange={(e) => {
            const newValue = Math.max(1, parseInt(e.target.value, 10) || 1);
            const updatedItem = { ...info.row.original, qty: newValue };
            handleReturnedChange([updatedItem]);
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
                info.row.original.qty
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

      {focItemsWithTotal.length > 1 && (
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

      {returnedItemsWithTotal.length > 1 && (
        <>
          <h2 className="text-xl font-semibold mt-8 mb-4">Returned Goods</h2>
          <TableEditing<OrderDetail>
            initialData={returnedItemsWithTotal}
            columns={returnedGoodsColumns}
            onChange={handleReturnedChange}
            tableKey="returnedGoods"
          />
        </>
      )}
      {renderActionButtons()}
    </div>
  );
};

export default InvoisDetailsPage;
