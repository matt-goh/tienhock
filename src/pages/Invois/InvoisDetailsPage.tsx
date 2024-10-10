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
import {
  ColumnConfig,
  Customer,
  Employee,
  InvoiceData,
  OrderDetail,
} from "../../types/types";
import BackButton from "../../components/BackButton";
import toast from "react-hot-toast";
import { updateInvoice, deleteInvoice } from "./InvoisUtils";
import { FormInput, FormListbox } from "../../components/FormComponents";
import { debounce } from "lodash";
import {
  Combobox,
  ComboboxInput,
  ComboboxButton,
  ComboboxOptions,
  ComboboxOption,
} from "@headlessui/react";
import { IconChevronDown, IconCheck, IconTrash } from "@tabler/icons-react";
import ConfirmationDialog from "../../components/ConfirmationDialog";

interface SelectOption {
  id: string;
  name: string;
}

interface ComboboxProps {
  name: string;
  label: string;
  value: string[];
  onChange: (value: string[] | null) => void;
  options: SelectOption[];
  query: string;
  setQuery: React.Dispatch<React.SetStateAction<string>>;
  onLoadMore: () => void;
  hasMore: boolean;
  isLoading: boolean;
}

const CustomerCombobox: React.FC<ComboboxProps> = ({
  name,
  label,
  value,
  onChange,
  options,
  setQuery,
  onLoadMore,
  hasMore,
  isLoading,
}) => {
  const [selectedCustomer, setSelectedCustomer] = useState<SelectOption | null>(
    value.length > 0 ? { id: value[0], name: value[0] } : null
  );

  const handleCustomerSelection = (customer: SelectOption | null) => {
    setSelectedCustomer(customer);
    onChange(customer ? [customer.name] : null);
  };

  return (
    <div className="my-2 space-y-2">
      <label htmlFor={name} className="text-sm font-medium text-gray-700">
        {label}
      </label>
      <Combobox value={selectedCustomer} onChange={handleCustomerSelection}>
        <div className="relative">
          <ComboboxInput
            className="w-full cursor-input rounded-lg border border-gray-300 bg-white py-2 pl-4 pr-10 text-left focus:outline-none focus:border-gray-400"
            displayValue={(customer: SelectOption | null) =>
              customer?.name || ""
            }
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Select a customer"
          />
          <ComboboxButton className="absolute inset-y-0 right-2 flex items-center pr-2">
            <IconChevronDown
              className="h-5 w-5 text-gray-400"
              aria-hidden="true"
            />
          </ComboboxButton>
          <ComboboxOptions className="absolute z-20 w-full p-1 mt-1 border bg-white max-h-60 rounded-lg overflow-auto focus:outline-none shadow-lg">
            {options.length === 0 ? (
              <div className="relative cursor-default select-none py-2 px-4 text-gray-700">
                No customers found.
              </div>
            ) : (
              <>
                {options.map((customer) => (
                  <ComboboxOption
                    key={customer.id}
                    value={customer}
                    className={({ active }) =>
                      `relative cursor-pointer select-none rounded py-2 pl-4 pr-12 ${
                        active ? "bg-gray-100 text-gray-900" : "text-gray-900"
                      }`
                    }
                  >
                    {({ selected, active }) => (
                      <>
                        <span
                          className={`block truncate ${
                            selected ? "font-medium" : "font-normal"
                          }`}
                        >
                          {customer.name}
                        </span>
                        {selected && (
                          <span className="absolute inset-y-0 right-0 flex items-center pr-3">
                            <IconCheck
                              className="h-5 w-5 text-gray-600"
                              aria-hidden="true"
                            />
                          </span>
                        )}
                      </>
                    )}
                  </ComboboxOption>
                ))}
                {hasMore && (
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      onLoadMore();
                    }}
                    className="w-full py-2 text-center text-sm rounded text-sky-500 hover:text-sky-600 hover:bg-gray-100 focus:outline-none"
                    disabled={isLoading}
                  >
                    {isLoading ? "Loading more..." : "Load More"}
                  </button>
                )}
              </>
            )}
          </ComboboxOptions>
        </div>
      </Combobox>
    </div>
  );
};

const InvoisDetailsPage: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [invoiceData, setInvoiceData] = useState<InvoiceData | null>(
    location.state?.invoiceData || null
  );
  const [products, setProducts] = useState<
    { id: string; description: string }[]
  >([]);
  const [salesmen, setSalesmen] = useState<string[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerQuery, setCustomerQuery] = useState("");
  const [customerPage, setCustomerPage] = useState(1);
  const [totalCustomerPages, setTotalCustomerPages] = useState(1);
  const [isFetchingCustomers, setIsFetchingCustomers] = useState(false);
  const [initialInvoiceData] = useState<InvoiceData | null>(
    location.state?.invoiceData || null
  );
  const [isFormChanged, setIsFormChanged] = useState(false);
  const [showBackConfirmation, setShowBackConfirmation] = useState(false);
  const [showDeleteConfirmation, setShowDeleteConfirmation] = useState(false);

  useEffect(() => {
    if (invoiceData) {
      updateInvoice(invoiceData);
    }
  }, [invoiceData]);

  useEffect(() => {
    const hasChanged =
      JSON.stringify(invoiceData) !== JSON.stringify(initialInvoiceData);
    setIsFormChanged(hasChanged);
  }, [invoiceData, initialInvoiceData]);

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

  const fetchCustomers = useCallback(
    async (search: string, page: number) => {
      setIsFetchingCustomers(true);
      try {
        const response = await fetch(
          `http://localhost:5000/api/customers/combobox?salesman=${
            invoiceData?.salesman || ""
          }&search=${search}&page=${page}&limit=20`
        );
        if (!response.ok) throw new Error("Failed to fetch customers");
        const data = await response.json();
        setCustomers((prevCustomers) =>
          page === 1 ? data.customers : [...prevCustomers, ...data.customers]
        );
        setTotalCustomerPages(data.totalPages);
        setIsFetchingCustomers(false);
      } catch (error) {
        console.error("Error fetching customers:", error);
        toast.error("Failed to fetch customers. Please try again.");
        setIsFetchingCustomers(false);
      }
    },
    [invoiceData?.salesman]
  );

  const debouncedFetchCustomers = useMemo(
    () =>
      debounce((search: string) => {
        setCustomerPage(1);
        fetchCustomers(search, 1);
      }, 300),
    [fetchCustomers]
  );

  useEffect(() => {
    debouncedFetchCustomers(customerQuery);
  }, [customerQuery, debouncedFetchCustomers]);

  useEffect(() => {
    // Reset customer data when salesman changes
    setCustomers([]);
    setCustomerPage(1);
    setCustomerQuery("");
    fetchCustomers("", 1);
  }, [invoiceData?.salesman, fetchCustomers]);

  const loadMoreCustomers = useCallback(() => {
    if (customerPage < totalCustomerPages && !isFetchingCustomers) {
      const nextPage = customerPage + 1;
      setCustomerPage(nextPage);
      fetchCustomers(customerQuery, nextPage);
    }
  }, [
    customerPage,
    totalCustomerPages,
    isFetchingCustomers,
    customerQuery,
    fetchCustomers,
  ]);

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

  const fetchSalesmen = useCallback(async () => {
    try {
      const response = await fetch(
        "http://localhost:5000/api/staffs?salesmenOnly=true"
      );
      if (!response.ok) throw new Error("Failed to fetch salesmen");
      const data: Employee[] = await response.json();
      const salesmenIds = data.map((employee) => employee.id);
      setSalesmen(["All Salesmen", ...salesmenIds]);
    } catch (error) {
      console.error("Error fetching salesmen:", error);
      toast.error("Failed to fetch salesmen. Please try again.");
    }
  }, []);

  useEffect(() => {
    fetchSalesmen();
  }, [fetchSalesmen]);

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
    (rowCode: string) => {
      setInvoiceData((prevData) => {
        if (!prevData) return null;
        const newDetails = prevData.orderDetails.filter(
          (item) => item.code !== rowCode
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
                // Check if the product name has changed
                if (updatedItem.productName !== item.productName) {
                  // Find the matching product in the products array
                  const matchingProduct = products.find(
                    (p) => p.description === updatedItem.productName
                  );
                  if (matchingProduct) {
                    // Update the code to match the new product
                    updatedItem.code = matchingProduct.id;
                  }
                }
                if (item.isLess || item.isTax) {
                  // For Less and Tax rows, use the updated total directly
                  return {
                    ...item,
                    ...updatedItem,
                    total: updatedItem.total,
                  };
                } else {
                  // For regular items, recalculate the total
                  return {
                    ...item,
                    ...updatedItem,
                    total: (updatedItem.qty * updatedItem.price).toFixed(2),
                  };
                }
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

          // Apply recalculateSubtotals here
          updatedOrderDetails = recalculateSubtotals(updatedOrderDetails);

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
    [calculateTotal, addNewRow, products] // Added products to the dependency array
  );

  const getNextSpecialRowNumber = useCallback(
    (type: string) => {
      const existingRows =
        invoiceData?.orderDetails.filter((item) =>
          item.code?.startsWith(type)
        ) || [];
      const numbers = existingRows.map((item) => {
        const match = item.code?.match(/-(\d+)$/);
        return match ? parseInt(match[1]) : 0;
      });
      const maxNumber = Math.max(0, ...numbers);
      return maxNumber + 1;
    },
    [invoiceData]
  );

  const insertBeforeTotal = (
    orderDetails: OrderDetail[],
    newItem: OrderDetail
  ) => {
    const totalIndex = orderDetails.findIndex((item) => item.isTotal);
    if (totalIndex !== -1) {
      return [
        ...orderDetails.slice(0, totalIndex),
        newItem,
        ...orderDetails.slice(totalIndex),
      ];
    }
    return [...orderDetails, newItem];
  };

  const handleAddLess = () => {
    setInvoiceData((prevData) => {
      if (!prevData) return null;
      const nextNumber = getNextSpecialRowNumber("LESS");
      const newItem = {
        code: `LESS-${nextNumber}`,
        productName: `Less ${nextNumber}`,
        qty: 1,
        price: 0,
        total: "0",
        isLess: true,
      };
      return {
        ...prevData,
        orderDetails: insertBeforeTotal(prevData.orderDetails, newItem),
      };
    });
  };

  const handleAddTax = () => {
    setInvoiceData((prevData) => {
      if (!prevData) return null;
      const nextNumber = getNextSpecialRowNumber("TAX");
      const newItem = {
        code: `TAX-${nextNumber}`,
        productName: `Tax ${nextNumber}`,
        qty: 1,
        price: 0,
        total: "0",
        isTax: true,
      };
      return {
        ...prevData,
        orderDetails: insertBeforeTotal(prevData.orderDetails, newItem),
      };
    });
  };

  const handleAddSubtotal = () => {
    setInvoiceData((prevData) => {
      if (!prevData) return null;
      const nextNumber = getNextSpecialRowNumber("SUBTOTAL");
      const subtotalAmount = calculateTotal(
        prevData.orderDetails.filter(
          (item) => !item.isSubtotal && !item.isFoc && !item.isReturned
        )
      );
      const newItem = {
        code: `SUBTOTAL-${nextNumber}`,
        productName: `Subtotal ${nextNumber}`,
        qty: 0,
        price: 0,
        total: subtotalAmount,
        isSubtotal: true,
      };
      return {
        ...prevData,
        orderDetails: insertBeforeTotal(prevData.orderDetails, newItem),
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
    if (isFormChanged) {
      setShowBackConfirmation(true);
    } else {
      navigate("/stock/invois/new");
    }
  };

  const handleConfirmBack = () => {
    setShowBackConfirmation(false);
    navigate("/stock/invois/new");
  };

  const handleDeleteClick = () => {
    setShowDeleteConfirmation(true);
  };

  const handleConfirmDelete = async () => {
    if (invoiceData) {
      try {
        await deleteInvoice(invoiceData.id);
        toast.success("Invoice deleted successfully");
        navigate("/stock/invois/new");
      } catch (error) {
        console.error("Error deleting invoice:", error);
        toast.error("Failed to delete invoice. Please try again.");
      }
    }
    setShowDeleteConfirmation(false);
  };

  const handleAddRegularItem = () => {
    setInvoiceData((prevData) => {
      if (!prevData) return null;
      const newItem = addNewRow("details");
      if (!newItem) return prevData;

      const totalIndex = prevData.orderDetails.findIndex(
        (item) => item.isTotal
      );
      const newOrderDetails = [...prevData.orderDetails];

      if (totalIndex !== -1) {
        newOrderDetails.splice(totalIndex, 0, newItem);
      } else {
        newOrderDetails.push(newItem);
      }

      return {
        ...prevData,
        orderDetails: newOrderDetails,
      };
    });
  };

  const handleAddFOC = () => {
    setInvoiceData((prevData) => {
      if (!prevData) return null;
      const newItem = addNewRow("foc");
      if (!newItem) return prevData;

      const totalIndex = prevData.orderDetails.findIndex(
        (item) => item.isTotal && item.isFoc
      );
      const newOrderDetails = [...prevData.orderDetails];

      if (totalIndex !== -1) {
        newOrderDetails.splice(totalIndex, 0, newItem);
      } else {
        const lastFocIndex = newOrderDetails
          .map((item) => item.isFoc)
          .lastIndexOf(true);
        if (lastFocIndex !== -1) {
          newOrderDetails.splice(lastFocIndex + 1, 0, newItem);
        } else {
          newOrderDetails.push(newItem);
        }
      }

      return {
        ...prevData,
        orderDetails: newOrderDetails,
      };
    });
  };

  const handleAddReturnedGoods = () => {
    setInvoiceData((prevData) => {
      if (!prevData) return null;
      const newItem = addNewRow("returned");
      if (!newItem) return prevData;

      const totalIndex = prevData.orderDetails.findIndex(
        (item) => item.isTotal && item.isReturned
      );
      const newOrderDetails = [...prevData.orderDetails];

      if (totalIndex !== -1) {
        newOrderDetails.splice(totalIndex, 0, newItem);
      } else {
        const lastReturnedIndex = newOrderDetails
          .map((item) => item.isReturned)
          .lastIndexOf(true);
        if (lastReturnedIndex !== -1) {
          newOrderDetails.splice(lastReturnedIndex + 1, 0, newItem);
        } else {
          newOrderDetails.push(newItem);
        }
      }

      return {
        ...prevData,
        orderDetails: newOrderDetails,
      };
    });
  };

  // HFC
  const handleFocChange = (updatedItems: OrderDetail[]) => {
    setTimeout(() => {
      setInvoiceData((prevInvoiceData) => {
        if (!prevInvoiceData) return null;
        const filteredItems = updatedItems.filter((item) => !item.isTotal);
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

        if (filteredItems.length < currentFocItems.length) {
          updatedFocItems = filteredItems;
        } else {
          const newItems = updatedItems.filter(
            (item) => !item.code && !item.isTotal && item.isFoc
          );
          updatedFocItems = currentFocItems.map((item) => {
            const updatedItem = updatedItems.find(
              (updated) => updated.code === item.code && updated.isFoc
            );
            if (updatedItem) {
              // Check if the product name has changed
              if (updatedItem.productName !== item.productName) {
                // Find the matching product in the products array
                const matchingProduct = products.find(
                  (p) => p.description === updatedItem.productName
                );
                if (matchingProduct) {
                  // Update the code to match the new product
                  updatedItem.code = matchingProduct.id;
                }
              }
              return {
                ...item,
                code: updatedItem.code || item.code,
                productName: updatedItem.productName || item.productName,
                qty: updatedItem.qty !== undefined ? updatedItem.qty : item.qty,
                price:
                  updatedItem.price !== undefined
                    ? updatedItem.price
                    : item.price,
                total: (
                  (updatedItem.qty !== undefined ? updatedItem.qty : item.qty) *
                  (updatedItem.price !== undefined
                    ? updatedItem.price
                    : item.price)
                ).toFixed(2),
                isFoc: true,
              };
            }
            return item;
          });

          if (newItems.length > 0 && !newFocRowAddedRef.current) {
            const newItem = addNewRow("foc");
            if (newItem) {
              updatedFocItems.push(newItem);
              newFocRowAddedRef.current = true;
            }
          }
        }

        const totalAmount = calculateTotal(updatedFocItems);

        const totalRow = {
          code: "",
          productName: "Total:",
          qty: 0,
          price: 0,
          total: totalAmount,
          isTotal: true,
          isFoc: true,
        };

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

        if (filteredItems.length < currentReturnedItems.length) {
          updatedReturnedItems = filteredItems;
        } else {
          const newItems = updatedItems.filter(
            (item) => !item.code && !item.isTotal && item.isReturned
          );
          updatedReturnedItems = currentReturnedItems.map((item) => {
            const updatedItem = updatedItems.find(
              (updated) => updated.code === item.code && updated.isReturned
            );
            if (updatedItem) {
              // Check if the product name has changed
              if (updatedItem.productName !== item.productName) {
                // Find the matching product in the products array
                const matchingProduct = products.find(
                  (p) => p.description === updatedItem.productName
                );
                if (matchingProduct) {
                  // Update the code to match the new product
                  updatedItem.code = matchingProduct.id;
                }
              }
              return {
                ...item,
                code: updatedItem.code || item.code,
                productName: updatedItem.productName || item.productName,
                qty: updatedItem.qty !== undefined ? updatedItem.qty : item.qty,
                price:
                  updatedItem.price !== undefined
                    ? updatedItem.price
                    : item.price,
                total: (
                  (updatedItem.qty !== undefined ? updatedItem.qty : item.qty) *
                  (updatedItem.price !== undefined
                    ? updatedItem.price
                    : item.price)
                ).toFixed(2),
                isReturned: true,
              };
            }
            return item;
          });

          if (newItems.length > 0 && !newReturnedRowAddedRef.current) {
            const newItem = addNewRow("returned");
            if (newItem) {
              updatedReturnedItems.push(newItem);
              newReturnedRowAddedRef.current = true;
            }
          }
        }

        const totalAmount = calculateTotal(updatedReturnedItems);

        const totalRow = {
          code: "",
          productName: "Total:",
          qty: 0,
          price: 0,
          total: totalAmount,
          isTotal: true,
          isReturned: true,
        };

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
    const hasRegularItems = orderDetailsWithTotal.length > 1;
    const hasFOC = focItemsWithTotal.length > 1;
    const hasReturned = returnedItemsWithTotal.length > 1;

    const renderButton = (text: string, onClick?: () => void) => (
      <Button onClick={onClick} variant="outline" size="md">
        {text}
      </Button>
    );

    return (
      <div className="flex justify-center items-center space-x-2 mt-8 text-gray-700">
        {!hasRegularItems && renderButton("Add Order", handleAddRegularItem)}
        {!hasRegularItems && (!hasFOC || !hasReturned) && <span>or</span>}
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
      width: 150,
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
      cell: (info: { getValue: () => any; row: { original: OrderDetail } }) => {
        const isEditable = info.row.original.isLess || info.row.original.isTax;
        return (
          <input
            type="float"
            step="0.01"
            value={
              isEditable
                ? info.getValue()
                : (info.row.original.qty * info.row.original.price).toFixed(2)
            }
            onChange={(e) => {
              if (isEditable) {
                const updatedItem = {
                  ...info.row.original,
                  total: e.target.value,
                };

                const allOrderDetails = invoiceData.orderDetails.map((item) =>
                  item.code === updatedItem.code ? updatedItem : item
                );

                handleChange(allOrderDetails);
              }
            }}
            className="w-full h-full px-6 py-3 text-right outline-none bg-transparent"
            disabled={!isEditable}
          />
        );
      },
    },
    { id: "action", header: "", type: "action", width: 50 },
  ];

  const focItemsColumns: ColumnConfig[] = [
    { id: "code", header: "ID", type: "readonly", width: 150 },
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
    { id: "code", header: "ID", type: "readonly", width: 150 },
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

  // Function to convert date from "DD/MM/YYYY" to "YYYY-MM-DD"
  const formatDateForInput = (dateString: string) => {
    if (!dateString) return "";
    const [day, month, year] = dateString.split("/");
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  };

  // Function to convert date from "YYYY-MM-DD" to "DD/MM/YYYY"
  const formatDateForState = (dateString: string) => {
    if (!dateString) return "";
    const [year, month, day] = dateString.split("-");
    return `${day}/${month}/${year}`;
  };

  // Function to convert time from "HH:MM am/pm" to "HH:MM" (24-hour format)
  const formatTimeForInput = (timeString: string) => {
    if (!timeString) return "";
    const [time, period] = timeString.toLowerCase().split(" ");
    let [hours, minutes] = time.split(":");
    if (period === "pm" && hours !== "12") {
      hours = String(parseInt(hours) + 12);
    } else if (period === "am" && hours === "12") {
      hours = "00";
    }
    return `${hours.padStart(2, "0")}:${minutes}`;
  };

  // Function to convert time from "HH:MM" (24-hour format) to "HH:MM am/pm"
  const formatTimeForState = (timeString: string) => {
    if (!timeString) return "";
    let [hours, minutes] = timeString.split(":");
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? "pm" : "am";
    hours = String(hour % 12 || 12);
    return `${hours}:${minutes} ${ampm}`;
  };

  // Add this function to map the type value to its display name
  const getTypeDisplayName = (type: "C" | "I") => {
    return type === "C" ? "Cash" : "Invoice";
  };

  return (
    <div className="px-4 max-w-6xl mx-auto">
      <div className="flex justify-between items-center mb-4">
        <BackButton onClick={handleBackClick} />
        <Button onClick={handleDeleteClick} variant="outline" color="rose">
          Delete
        </Button>
      </div>
      <h1 className="text-2xl font-bold mb-4">Invoice Details</h1>

      <div className="grid grid-cols-2 gap-6 mb-6">
        <div className="rounded-lg space-y-2">
          <FormInput
            name="invoiceNo"
            label="Invoice No"
            value={`${invoiceData.type}${invoiceData.invoiceNo}`}
            onChange={(e) => {
              const newValue = e.target.value;
              setInvoiceData((prev) => {
                if (!prev) return null;
                return {
                  ...prev,
                  type: newValue.charAt(0) as "C" | "I",
                  invoiceNo: newValue.slice(1),
                };
              });
            }}
          />
          <FormInput
            name="orderNo"
            label="Order No"
            value={invoiceData.orderNo}
            onChange={(e) => {
              setInvoiceData((prev) => {
                if (!prev) return null;
                return {
                  ...prev,
                  orderNo: e.target.value,
                };
              });
            }}
          />
          <FormInput
            name="date"
            label="Date"
            type="date"
            value={formatDateForInput(invoiceData.date)}
            onChange={(e) => {
              setInvoiceData((prev) => {
                if (!prev) return null;
                return {
                  ...prev,
                  date: formatDateForState(e.target.value),
                };
              });
            }}
          />
          <FormInput
            name="time"
            label="Time"
            type="time"
            value={formatTimeForInput(invoiceData.time)}
            onChange={(e) => {
              setInvoiceData((prev) => {
                if (!prev) return null;
                return {
                  ...prev,
                  time: formatTimeForState(e.target.value),
                };
              });
            }}
          />
          <FormListbox
            name="type"
            label="Type"
            value={getTypeDisplayName(invoiceData.type as "C" | "I")}
            onChange={(value) => {
              setInvoiceData((prev) => {
                if (!prev) return null;
                return {
                  ...prev,
                  type: value === "Cash" ? "C" : "I",
                };
              });
            }}
            options={[
              { id: "C", name: "Cash" },
              { id: "I", name: "Invoice" },
            ]}
          />
        </div>
        <div className="rounded-lg">
          <FormInput
            name="customerId"
            label="Customer ID"
            value={invoiceData.customer}
            disabled
          />
          <CustomerCombobox
            name="customer"
            label="Customer"
            value={invoiceData?.customerName ? [invoiceData.customerName] : []}
            onChange={(value: string[] | null) => {
              const selectedCustomerName = value ? value[0] : "";
              const selectedCustomer = customers.find(
                (c) => c.name === selectedCustomerName
              );
              setInvoiceData((prev) => {
                if (!prev) return null;
                return {
                  ...prev,
                  customer: selectedCustomer?.id || "",
                  customerName: selectedCustomerName,
                };
              });
            }}
            options={customers.map((c) => ({ id: c.id, name: c.name }))}
            query={customerQuery}
            setQuery={setCustomerQuery}
            onLoadMore={loadMoreCustomers}
            hasMore={customerPage < totalCustomerPages}
            isLoading={isFetchingCustomers}
          />
          <FormListbox
            name="salesman"
            label="Salesman"
            value={invoiceData.salesman}
            onChange={(value) => {
              setInvoiceData((prev) => {
                if (!prev) return null;
                return {
                  ...prev,
                  salesman: value,
                };
              });
            }}
            options={salesmen.map((id) => ({ id, name: id }))}
          />
        </div>
      </div>

      {orderDetailsWithTotal.length > 1 && (
        <>
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
        </>
      )}

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
      <ConfirmationDialog
        isOpen={showBackConfirmation}
        onClose={() => setShowBackConfirmation(false)}
        onConfirm={handleConfirmBack}
        title="Discard Changes"
        message="Are you sure you want to go back? All unsaved changes will be lost."
        confirmButtonText="Confirm"
      />
      <ConfirmationDialog
        isOpen={showDeleteConfirmation}
        onClose={() => setShowDeleteConfirmation(false)}
        onConfirm={handleConfirmDelete}
        title="Delete Invoice"
        message="Are you sure you want to delete this invoice? This action cannot be undone."
        confirmButtonText="Delete"
      />
    </div>
  );
};

export default InvoisDetailsPage;
