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

  const getAvailableProducts = useCallback(
    (tableType: "details" | "foc" | "returned") => {
      const usedProducts = invoiceData?.orderDetails
        .filter((item) => {
          switch (tableType) {
            case "details":
              return !item.isFoc && !item.isReturned;
            case "foc":
              return item.isFoc;
            case "returned":
              return item.isReturned;
          }
        })
        .map((item) => item.code);

      return products.filter((p) => !usedProducts?.includes(p.id));
    },
    [products, invoiceData]
  );

  const addNewRow = useCallback(
    (tableType: "details" | "foc" | "returned") => {
      const availableProducts = getAvailableProducts(tableType);

      if (availableProducts.length === 0) {
        toast.error(`All products have been added to the ${tableType} table.`);
        return null;
      }

      const randomProduct =
        availableProducts[Math.floor(Math.random() * availableProducts.length)];

      const newItem: OrderDetail = {
        code: randomProduct.id,
        productName: randomProduct.description,
        qty: 1,
        price: tableType === "details" ? 0 : 0,
        total: "0",
        isFoc: tableType === "foc",
        isReturned: tableType === "returned",
      };

      return newItem;
    },
    [getAvailableProducts]
  );

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

          const filteredItems = updatedItems.filter((item) => !item.isTotal);
          // Separate order details from FOC and returned items
          const currentOrderDetails = prevInvoiceData.orderDetails.filter(
            (item) => !item.isTotal && !item.isFoc && !item.isReturned
          );
          const focItems = prevInvoiceData.orderDetails.filter(
            (item) => item.isFoc
          );
          const returnedItems = prevInvoiceData.orderDetails.filter(
            (item) => item.isReturned
          );
          let updatedOrderDetails: OrderDetail[];
          // Check if it's a deletion operation
          if (filteredItems.length < currentOrderDetails.length) {
            // It's a deletion operation
            updatedOrderDetails = filteredItems;
          } else {
            // It's a regular update operation
            const newItems = updatedItems.filter(
              (item) =>
                !item.code && !item.isTotal && !item.isFoc && !item.isReturned
            );
            // Update existing items
            updatedOrderDetails = currentOrderDetails.map((item) => {
              const updatedItem = updatedItems.find(
                (updated) => updated.code === item.code
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
              const newItem = addNewRow("details");
              if (newItem) {
                updatedOrderDetails.push(newItem);
                newRowAddedRef.current = true;
              }
            }
          }

          // Calculate total for order details
          const totalAmount = calculateTotal(updatedOrderDetails);

          // Add total row
          const totalRow = {
            code: "",
            productName: "Total:",
            qty: 0,
            price: 0,
            total: totalAmount,
            isTotal: true,
          };

          // Combine updated order details with FOC and returned items
          const combinedOrderDetails = [
            ...updatedOrderDetails,
            ...focItems,
            ...returnedItems,
            totalRow,
          ];
          return {
            ...prevInvoiceData,
            orderDetails: combinedOrderDetails,
          };
        });
      }, 0);
    },
    [calculateTotal, addNewRow]
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
        const filteredItems = updatedItems.filter((item) => !item.isTotal);
        // Separate FOC items from regular and returned items
        const currentFocItems = prevInvoiceData.orderDetails.filter(
          (item) => item.isFoc && !item.isTotal
        );
        const regularItems = prevInvoiceData.orderDetails.filter(
          (item) => !item.isFoc && !item.isReturned
        );
        const returnedItems = prevInvoiceData.orderDetails.filter(
          (item) => item.isReturned
        );
        let updatedFocItems: OrderDetail[];

        // Check if it's a deletion operation
        if (filteredItems.length < currentFocItems.length) {
          // It's a deletion operation
          updatedFocItems = filteredItems;
        } else {
          // It's a regular update operation
          const newItems = updatedItems.filter(
            (item) => !item.code && !item.isTotal && item.isFoc
          );
          // Update existing items
          updatedFocItems = currentFocItems.map((item) => {
            const updatedItem = updatedItems.find(
              (updated) => updated.code === item.code && updated.isFoc
            );
            if (updatedItem) {
              return {
                ...item,
                qty: updatedItem.qty !== undefined ? updatedItem.qty : item.qty,
                price:
                  updatedItem.price !== undefined
                    ? updatedItem.price
                    : item.price,
                productName: updatedItem.productName || item.productName,
                total: (
                  (updatedItem.qty !== undefined ? updatedItem.qty : item.qty) *
                  (updatedItem.price !== undefined
                    ? updatedItem.price
                    : item.price)
                ).toFixed(2),
                isFoc: true, // Ensure isFoc remains true
              };
            }
            return item;
          });

          // Add only one new item if there are any and we haven't added one in this render cycle
          if (newItems.length > 0 && !newFocRowAddedRef.current) {
            const newItem = addNewRow("foc");
            if (newItem) {
              updatedFocItems.push(newItem);
              newFocRowAddedRef.current = true;
            }
          }
        }

        // Calculate total for FOC items
        const totalAmount = calculateTotal(updatedFocItems);

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
        // Combine updated FOC items with regular and returned items
        const combinedOrderDetails = [
          ...regularItems,
          ...updatedFocItems,
          ...returnedItems,
          totalRow,
        ];
        return {
          ...prevInvoiceData,
          orderDetails: combinedOrderDetails,
        };
      });
    }, 0);
  };

  const handleReturnedChange = (updatedItems: OrderDetail[]) => {
    setTimeout(() => {
      setInvoiceData((prevInvoiceData) => {
        if (!prevInvoiceData) return null;

        const filteredItems = updatedItems.filter((item) => !item.isTotal);
        // Separate returned items from regular and FOC items
        const currentReturnedItems = prevInvoiceData.orderDetails.filter(
          (item) => item.isReturned && !item.isTotal
        );
        const regularItems = prevInvoiceData.orderDetails.filter(
          (item) => !item.isFoc && !item.isReturned
        );
        const focItems = prevInvoiceData.orderDetails.filter(
          (item) => item.isFoc
        );
        let updatedReturnedItems: OrderDetail[];

        // Check if it's a deletion operation
        if (filteredItems.length < currentReturnedItems.length) {
          // It's a deletion operation
          updatedReturnedItems = filteredItems;
        } else {
          // It's a regular update operation
          const newItems = updatedItems.filter(
            (item) => !item.code && !item.isTotal && item.isReturned
          );
          // Update existing items
          updatedReturnedItems = currentReturnedItems.map((item) => {
            const updatedItem = updatedItems.find(
              (updated) => updated.code === item.code && updated.isReturned
            );
            if (updatedItem) {
              return {
                ...item,
                qty: updatedItem.qty !== undefined ? updatedItem.qty : item.qty,
                price:
                  updatedItem.price !== undefined
                    ? updatedItem.price
                    : item.price,
                productName: updatedItem.productName || item.productName,
                total: (
                  (updatedItem.qty !== undefined ? updatedItem.qty : item.qty) *
                  (updatedItem.price !== undefined
                    ? updatedItem.price
                    : item.price)
                ).toFixed(2),
                isReturned: true, // Ensure isReturned remains true
              };
            }
            return item;
          });

          // Add only one new item if there are any and we haven't added one in this render cycle
          if (newItems.length > 0 && !newReturnedRowAddedRef.current) {
            const newItem = addNewRow("returned");
            if (newItem) {
              updatedReturnedItems.push(newItem);
              newReturnedRowAddedRef.current = true;
            }
          }
        }

        // Calculate total for returned items
        const totalAmount = calculateTotal(updatedReturnedItems);

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

        // Combine updated returned items with regular and FOC items
        const combinedOrderDetails = [
          ...regularItems,
          ...focItems,
          ...updatedReturnedItems,
          totalRow,
        ];
        return {
          ...prevInvoiceData,
          orderDetails: combinedOrderDetails,
        };
      });
    }, 0);
  };

  const renderActionButtons = () => {
    const hasFOC = focItemsWithTotal.length > 1;
    const hasReturned = returnedItemsWithTotal.length > 1;

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

            // Get all current order details
            const allOrderDetails = invoiceData.orderDetails.map((item) => {
              if (item.code === updatedItem.code) {
                return updatedItem;
              }
              return item;
            });

            // Update all order details, including the modified item
            handleChange(allOrderDetails);
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
            const newValue = Math.max(1, parseInt(e.target.value, 10) || 1);
            const updatedItem = {
              ...info.row.original,
              price: newValue,
              total: (newValue * info.row.original.price).toFixed(2),
            };

            // Get all current order details
            const allOrderDetails = invoiceData.orderDetails.map((item) => {
              if (item.code === updatedItem.code) {
                return updatedItem;
              }
              return item;
            });

            // Update all order details, including the modified item
            handleChange(allOrderDetails);
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
            const updatedItem = {
              ...info.row.original,
              qty: newValue,
              total: (newValue * info.row.original.price).toFixed(2),
            };

            // Get all current order details
            const allOrderDetails = invoiceData.orderDetails.map((item) => {
              if (item.code === updatedItem.code) {
                return updatedItem;
              }
              return item;
            });
            // Update all order details, including the modified item
            handleFocChange(allOrderDetails);
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
            const newValue = Math.max(1, parseInt(e.target.value, 10) || 1);
            const updatedItem = {
              ...info.row.original,
              price: newValue,
              total: (newValue * info.row.original.price).toFixed(2),
            };

            // Get all current order details
            const allOrderDetails = invoiceData.orderDetails.map((item) => {
              if (item.code === updatedItem.code) {
                return updatedItem;
              }
              return item;
            });

            // Update all order details, including the modified item
            handleFocChange(allOrderDetails);
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
            const updatedItem = {
              ...info.row.original,
              qty: newValue,
              total: (newValue * info.row.original.price).toFixed(2),
            };

            // Get all current order details
            const allOrderDetails = invoiceData.orderDetails.map((item) => {
              if (item.code === updatedItem.code) {
                return updatedItem;
              }
              return item;
            });

            // Update all order details, including the modified item
            handleReturnedChange(allOrderDetails);
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
            const newValue = Math.max(1, parseInt(e.target.value, 10) || 1);
            const updatedItem = {
              ...info.row.original,
              price: newValue,
              total: (newValue * info.row.original.price).toFixed(2),
            };

            // Get all current order details
            const allOrderDetails = invoiceData.orderDetails.map((item) => {
              if (item.code === updatedItem.code) {
                return updatedItem;
              }
              return item;
            });

            // Update all order details, including the modified item
            handleReturnedChange(allOrderDetails);
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
