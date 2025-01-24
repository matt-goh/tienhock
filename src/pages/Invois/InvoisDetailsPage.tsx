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
import {
  updateInvoice,
  deleteInvoice,
  saveInvoice,
  createInvoice,
} from "../../utils/invoice/InvoisUtils";
import { FormInput, FormListbox } from "../../components/FormComponents";
import { debounce } from "lodash";
import {
  Combobox,
  ComboboxInput,
  ComboboxButton,
  ComboboxOptions,
  ComboboxOption,
} from "@headlessui/react";
import { IconChevronDown, IconCheck } from "@tabler/icons-react";
import ConfirmationDialog from "../../components/ConfirmationDialog";
import { api } from "../../routes/utils/api";

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
  const [searchValue, setSearchValue] = useState("");
  const searchTimeoutRef = useRef<NodeJS.Timeout>();

  const handleSearch = (searchText: string) => {
    setSearchValue(searchText);

    // Clear existing timeout
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    // Set new timeout for debouncing
    searchTimeoutRef.current = setTimeout(() => {
      setQuery(searchText);
    }, 300);
  };

  const handleCustomerSelection = (customer: SelectOption | null) => {
    setSelectedCustomer(customer);
    onChange(customer ? [customer.name] : null);
  };

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, []);

  return (
    <div className="my-2 space-y-2">
      <label htmlFor={name} className="text-sm font-medium text-default-700">
        {label}
      </label>
      <Combobox value={selectedCustomer} onChange={handleCustomerSelection}>
        <div className="relative">
          <ComboboxInput
            className="w-full cursor-input rounded-lg border border-default-300 bg-white py-2 pl-4 pr-10 text-left focus:outline-none focus:border-default-500"
            displayValue={(customer: SelectOption | null) =>
              customer?.name || ""
            }
            onChange={(event) => handleSearch(event.target.value)}
            placeholder="Search customers..."
          />
          <ComboboxButton className="absolute inset-y-0 right-2 flex items-center pr-2">
            <IconChevronDown
              className="h-5 w-5 text-default-400"
              aria-hidden="true"
            />
          </ComboboxButton>
          <ComboboxOptions className="absolute z-20 w-full p-1 mt-1 border bg-white max-h-60 rounded-lg overflow-auto focus:outline-none shadow-lg">
            {options.length === 0 ? (
              <div className="relative cursor-default select-none py-2 px-4 text-default-700">
                {isLoading ? "Loading..." : "No customers found."}
              </div>
            ) : (
              <>
                {options.map((customer) => (
                  <ComboboxOption
                    key={customer.id}
                    value={customer}
                    className={({ active }) =>
                      `relative cursor-pointer select-none rounded py-2 pl-4 pr-12 ${
                        active
                          ? "bg-default-100 text-default-900"
                          : "text-default-900"
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
                              className="h-5 w-5 text-default-600"
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
                    className="w-full py-2 text-center text-sm rounded text-sky-500 hover:text-sky-600 hover:bg-default-100 focus:outline-none"
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
  const [previousPath, setPreviousPath] = useState("/sales/invois");
  const [invoiceData, setInvoiceData] = useState<InvoiceData | null>(() => {
    if (location.state?.isNewInvoice) {
      return {
        id: "",
        invoiceNo: "",
        orderNo: "",
        date: new Date().toLocaleDateString("en-GB"),
        time: new Date().toLocaleTimeString("en-US", {
          hour: "2-digit",
          minute: "2-digit",
        }),
        type: "I",
        customer: "",
        customername: "",
        salesman: "",
        totalAmount: "0",
        orderDetails: [],
      };
    }
    return location.state?.invoiceData || null;
  });
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
  const [isNewInvoice, setIsNewInvoice] = useState(() => {
    if (location.state?.isNewInvoice) {
      return true;
    }
    // Check if the invoice has an id, if not, it's a new invoice
    return !location.state?.invoiceData?.id;
  });
  const [isFormChanged, setIsFormChanged] = useState(false);
  const [showBackConfirmation, setShowBackConfirmation] = useState(false);
  const [showDeleteConfirmation, setShowDeleteConfirmation] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (invoiceData) {
      updateInvoice(invoiceData);
    }
  }, [invoiceData]);

  useEffect(() => {
    if (location.state?.previousPath) {
      setPreviousPath(location.state.previousPath);
    }
  }, [location]);

  useEffect(() => {
    const hasChanged =
      JSON.stringify(invoiceData) !== JSON.stringify(initialInvoiceData);
    setIsFormChanged(hasChanged);
  }, [invoiceData, initialInvoiceData]);

  const calculateTotal = useCallback((items: OrderDetail[]) => {
    return items
      .reduce((sum, detail) => {
        if (detail.isless) {
          return sum - parseFloat(detail.total || "0");
        }
        if (detail.istax) {
          return sum + parseFloat(detail.total || "0");
        }
        if (detail.issubtotal || detail.istotal) {
          return sum;
        }
        return sum + parseFloat(detail.total || "0");
      }, 0)
      .toFixed(2);
  }, []);

  const calculateOverallTotal = useCallback(
    (orderDetails: OrderDetail[]) => {
      const regularItems = orderDetails.filter(
        (item) => !item.isfoc && !item.isreturned && !item.istotal
      );
      return calculateTotal(regularItems);
    },
    [calculateTotal]
  );

  const fetchCustomers = useCallback(
    async (search: string, page: number) => {
      setIsFetchingCustomers(true);
      try {
        const data = await api.get(
          `/api/customers/combobox?salesman=${
            invoiceData?.salesman || ""
          }&search=${search}&page=${page}&limit=20`
        );
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

  useEffect(() => {
    if (invoiceData) {
      setInvoiceData((prev) => {
        if (!prev) return null;

        const normalizedOrderDetails = prev.orderDetails.map((detail) => {
          // Handle special rows
          if (detail.isless || detail.istax) {
            return normalizeSpecialRow(detail, detail.isless ? "Less" : "Tax");
          }
          return {
            ...detail,
            // Normalize standard fields
            productname: detail.productname,
            isless: detail.isless || false,
            istax: detail.istax || false,
            isfoc: detail.isfoc || false,
            isreturned: detail.isreturned || false,
            istotal: detail.istotal || false,
            issubtotal: detail.issubtotal || false,
          };
        });

        return {
          ...prev,
          orderDetails: normalizedOrderDetails,
        };
      });
    }
  }, [initialInvoiceData]); // Run when initial data is loaded

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
        const data = await api.get("/api/products/combobox");
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
      const data: Employee[] = await api.get("/api/staffs?salesmenOnly=true");
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
      const existingTotalRow = items.find((item) => item.istotal);
      if (existingTotalRow) {
        return items.map((item) =>
          item.istotal ? { ...item, total: totalAmount } : item
        );
      } else {
        return [
          ...items,
          {
            code: "",
            productname: "Total:",
            qty: 0,
            price: 0,
            total: totalAmount,
            istotal: true,
          },
        ];
      }
    },
    []
  );

  const orderDetailsWithTotal = useMemo(() => {
    if (!invoiceData) return [];
    const regularItems = invoiceData.orderDetails.filter(
      (item) => !item.isfoc && !item.isreturned
    );
    const totalAmount = calculateTotal(regularItems);
    return addTotalRow(regularItems, totalAmount);
  }, [invoiceData, calculateTotal, addTotalRow]);

  const recalculateSubtotals = useCallback(
    (details: OrderDetail[]): OrderDetail[] => {
      const result: OrderDetail[] = [];
      let runningTotal = 0;

      // First pass: calculate running total and maintain order
      for (const item of details) {
        if (item.issubtotal) {
          // When we hit a subtotal, add it with the current running total
          result.push({
            ...item,
            total: runningTotal.toFixed(2),
          });
          // Don't reset running total - it should continue accumulating
        } else {
          // Add the non-subtotal item as-is
          result.push(item);
          // Update running total based on item type
          if (item.isless) {
            runningTotal -= parseFloat(item.total || "0");
          } else if (item.istax) {
            runningTotal += parseFloat(item.total || "0");
          } else if (!item.istotal) {
            runningTotal += parseFloat(item.total || "0");
          }
        }
      }

      return result;
    },
    []
  );

  const handleSpecialRowDelete = useCallback(
    (code: string) => {
      setInvoiceData((prevData) => {
        if (!prevData) return null;
        const newDetails = prevData.orderDetails.filter(
          (item) => item.code !== code
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
              return !item.isfoc && !item.isreturned;
            case "foc":
              return item.isfoc;
            case "returned":
              return item.isreturned;
            default:
              return false;
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
        productname: randomProduct.description,
        qty: 1,
        price: tableType === "details" ? 0 : 0,
        total: "0",
        isfoc: tableType === "foc",
        isreturned: tableType === "returned",
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

          const prevRegularItems = prevInvoiceData.orderDetails.filter(
            (item) => !item.istotal && !item.isfoc && !item.isreturned
          );

          // Filter out total row from updated items
          const filteredItems = updatedItems.filter((item) => !item.istotal);

          // Get other types of items to preserve
          const focItems = prevInvoiceData.orderDetails.filter(
            (item) => item.isfoc
          );
          const returnedItems = prevInvoiceData.orderDetails.filter(
            (item) => item.isreturned
          );

          let updatedOrderDetails: OrderDetail[];

          // Check if this is a deletion operation
          if (filteredItems.length < prevRegularItems.length) {
            // For deletion, maintain the exact order from filteredItems
            updatedOrderDetails = filteredItems;
          } else {
            // For updates/additions, maintain original order while updating values
            updatedOrderDetails = prevRegularItems.map((item) => {
              // If this is a subtotal, preserve its position
              if (item.issubtotal) return item;

              const updatedItem = filteredItems.find(
                (updated) => updated.code === item.code
              );
              if (!updatedItem) return item;

              // Handle product name changes
              if (updatedItem.productname !== item.productname) {
                const matchingProduct = products.find(
                  (p) => p.description === updatedItem.productname
                );
                if (matchingProduct) {
                  updatedItem.code = matchingProduct.id;
                }
              }

              // Return updated item
              if (item.isless || item.istax) {
                return {
                  ...item,
                  ...updatedItem,
                  total: updatedItem.total,
                };
              }
              return {
                ...item,
                ...updatedItem,
                total: (updatedItem.qty * updatedItem.price).toFixed(2),
              };
            });

            // Handle new items
            const newItems = filteredItems.filter(
              (item) =>
                !item.code && !item.istotal && !item.isfoc && !item.isreturned
            );

            if (newItems.length > 0 && !newRowAddedRef.current) {
              const newItem = addNewRow("details");
              if (newItem) {
                updatedOrderDetails.push(newItem);
                newRowAddedRef.current = true;
              }
            }
          }

          // Recalculate the subtotals while maintaining positions
          updatedOrderDetails = recalculateSubtotals(updatedOrderDetails);

          // Calculate total
          const totalAmount = calculateTotal(updatedOrderDetails);

          // Add total row
          const totalRow = {
            code: "",
            productname: "Total:",
            qty: 0,
            price: 0,
            total: totalAmount,
            istotal: true,
          };

          // Combine everything
          const combinedOrderDetails = [
            ...updatedOrderDetails,
            ...focItems,
            ...returnedItems,
            totalRow,
          ];

          // Calculate overall total
          const overallTotalAmount =
            calculateOverallTotal(combinedOrderDetails);

          return {
            ...prevInvoiceData,
            orderDetails: combinedOrderDetails,
            totalAmount: overallTotalAmount,
          };
        });
      }, 0);
    },
    [
      calculateTotal,
      addNewRow,
      products,
      calculateOverallTotal,
      recalculateSubtotals,
    ]
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

  const normalizeSpecialRow = useCallback(
    (row: OrderDetail, type: "Less" | "Tax") => {
      // If this is an existing row (has invoiceid), preserve its original productname
      if (row.invoiceid || row.code) {
        return {
          // Keep existing properties
          invoiceid: row.invoiceid || "",
          code: row.code,
          productname: row.productname, // Keep original description
          qty: row.qty || 1,
          price: row.price || 0,
          total: row.total || "0",
          // Set flags
          isfoc: false,
          isreturned: false,
          istotal: false,
          issubtotal: false,
          isless: type === "Less",
          istax: type === "Tax",
        };
      }

      // Only generate new code and description for new rows
      const nextNumber = getNextSpecialRowNumber(type.toUpperCase());
      return {
        invoiceid: "",
        code: `${type.toUpperCase()}-${nextNumber}`,
        productname: `${type} ${nextNumber}`, // Only set default name for new rows
        qty: 1,
        price: 0,
        total: "0",
        isfoc: false,
        isreturned: false,
        istotal: false,
        issubtotal: false,
        isless: type === "Less",
        istax: type === "Tax",
      };
    },
    [getNextSpecialRowNumber]
  );

  const insertBeforeTotal = (
    orderDetails: OrderDetail[],
    newItem: OrderDetail
  ) => {
    const totalIndex = orderDetails.findIndex((item) => item.istotal);
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
      const newItem = normalizeSpecialRow({} as OrderDetail, "Less");
      return {
        ...prevData,
        orderDetails: insertBeforeTotal(prevData.orderDetails, newItem),
      };
    });
  };

  const handleAddTax = () => {
    setInvoiceData((prevData) => {
      if (!prevData) return null;
      const newItem = normalizeSpecialRow({} as OrderDetail, "Tax");
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

      // Calculate subtotal only from non-special rows up to this point
      const currentItems = prevData.orderDetails;
      let runningTotal = 0;

      for (const item of currentItems) {
        if (item.istotal || item.issubtotal) continue;
        if (item.isless) {
          runningTotal -= parseFloat(item.total || "0");
          continue;
        }
        if (item.istax) {
          runningTotal += parseFloat(item.total || "0");
          continue;
        }
        if (!item.isfoc && !item.isreturned) {
          runningTotal += parseFloat(item.total || "0");
        }
      }

      const newItem: OrderDetail = {
        code: `SUBTOTAL-${nextNumber}`,
        productname: `Subtotal ${nextNumber}`,
        qty: 0,
        price: 0,
        total: runningTotal.toFixed(2),
        issubtotal: true,
        // Add other required properties with default values
        isless: false,
        istax: false,
        isfoc: false,
        isreturned: false,
        istotal: false,
      };

      // Insert before total but after all regular items
      const totalRowIndex = prevData.orderDetails.findIndex(
        (item) => item.istotal
      );
      const newOrderDetails = [...prevData.orderDetails];
      if (totalRowIndex !== -1) {
        newOrderDetails.splice(totalRowIndex, 0, newItem);
      } else {
        newOrderDetails.push(newItem);
      }

      return {
        ...prevData,
        orderDetails: newOrderDetails,
      };
    });
  };

  const focItemsWithTotal = useMemo(() => {
    if (!invoiceData) return [];
    const focItems = invoiceData.orderDetails.filter((item) => item.isfoc);
    const totalAmount = calculateTotal(focItems);
    return addTotalRow(focItems, totalAmount);
  }, [invoiceData, calculateTotal, addTotalRow]);

  const returnedItemsWithTotal = useMemo(() => {
    if (!invoiceData) return [];
    const returnedItems = invoiceData.orderDetails.filter(
      (item) => item.isreturned
    );
    const totalAmount = calculateTotal(returnedItems);
    return addTotalRow(returnedItems, totalAmount);
  }, [invoiceData, calculateTotal, addTotalRow]);

  if (!invoiceData) {
    return <div>No invoice data found.</div>;
  }

  const handleBackClick = () => {
    if (isFormChanged && !isNewInvoice) {
      setShowBackConfirmation(true);
    } else {
      navigate(previousPath);
    }
  };

  const handleConfirmBack = () => {
    setShowBackConfirmation(false);
    navigate(previousPath);
  };

  const handleDeleteClick = () => {
    setShowDeleteConfirmation(true);
  };

  const handleSaveClick = async () => {
    if (!invoiceData) return;

    if (!invoiceData.invoiceno) {
      toast.error("Please enter an invoice number before saving.");
      return;
    }

    setIsSaving(true);
    try {
      let savedInvoice;
      if (isNewInvoice) {
        savedInvoice = await createInvoice(invoiceData);
        toast.success("New invoice created successfully");
      } else {
        // Determine if we're saving to the database or server memory
        const saveToDb = location.pathname.includes("/sales/invois/details");
        savedInvoice = await saveInvoice(invoiceData, saveToDb);
        toast.success(
          saveToDb
            ? "Invoice updated successfully in database"
            : "Invoice updated successfully in memory"
        );
      }
      navigate(previousPath);
      setInvoiceData(savedInvoice);
      setIsFormChanged(false);
      setIsNewInvoice(false);
    } catch (error) {
      if (error instanceof Error) {
        toast.error(
          `Failed to ${isNewInvoice ? "create" : "save"} invoice: ${
            error.message
          }`
        );
      } else {
        toast.error(
          `An unknown error occurred while ${
            isNewInvoice ? "creating" : "saving"
          } the invoice.`
        );
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (invoiceData) {
      try {
        await deleteInvoice(invoiceData.id);
        toast.success("Invoice deleted successfully");
        navigate(previousPath);
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
        (item) => item.istotal
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
        (item) => item.istotal && item.isfoc
      );
      const newOrderDetails = [...prevData.orderDetails];

      if (totalIndex !== -1) {
        newOrderDetails.splice(totalIndex, 0, newItem);
      } else {
        const lastFocIndex = newOrderDetails
          .map((item) => item.isfoc)
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
        (item) => item.istotal && item.isreturned
      );
      const newOrderDetails = [...prevData.orderDetails];

      if (totalIndex !== -1) {
        newOrderDetails.splice(totalIndex, 0, newItem);
      } else {
        const lastReturnedIndex = newOrderDetails
          .map((item) => item.isreturned)
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
        const filteredItems = updatedItems.filter((item) => !item.istotal);
        const currentFocItems = prevInvoiceData.orderDetails.filter(
          (item) => item.isfoc && !item.istotal
        );
        const regularItems = prevInvoiceData.orderDetails.filter(
          (item) => !item.isfoc && !item.isreturned
        );
        const returnedItems = prevInvoiceData.orderDetails.filter(
          (item) => item.isreturned
        );
        let updatedFocItems: OrderDetail[];

        if (filteredItems.length < currentFocItems.length) {
          updatedFocItems = filteredItems;
        } else {
          const newItems = updatedItems.filter(
            (item) => !item.code && !item.istotal && item.isfoc
          );
          updatedFocItems = currentFocItems.map((item) => {
            const updatedItem = updatedItems.find(
              (updated) => updated.code === item.code && updated.isfoc
            );
            if (updatedItem) {
              // Check if the product name has changed
              if (updatedItem.productname !== item.productname) {
                // Find the matching product in the products array
                const matchingProduct = products.find(
                  (p) => p.description === updatedItem.productname
                );
                if (matchingProduct) {
                  // Update the code to match the new product
                  updatedItem.code = matchingProduct.id;
                }
              }
              return {
                ...item,
                code: updatedItem.code || item.code,
                productname: updatedItem.productname || item.productname,
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
                isfoc: true,
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
          productname: "Total:",
          qty: 0,
          price: 0,
          total: totalAmount,
          istotal: true,
          isfoc: true,
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

        const filteredItems = updatedItems.filter((item) => !item.istotal);
        const currentReturnedItems = prevInvoiceData.orderDetails.filter(
          (item) => item.isreturned && !item.istotal
        );
        const regularItems = prevInvoiceData.orderDetails.filter(
          (item) => !item.isfoc && !item.isreturned
        );
        const focItems = prevInvoiceData.orderDetails.filter(
          (item) => item.isfoc
        );
        let updatedReturnedItems: OrderDetail[];

        if (filteredItems.length < currentReturnedItems.length) {
          updatedReturnedItems = filteredItems;
        } else {
          const newItems = updatedItems.filter(
            (item) => !item.code && !item.istotal && item.isreturned
          );
          updatedReturnedItems = currentReturnedItems.map((item) => {
            const updatedItem = updatedItems.find(
              (updated) => updated.code === item.code && updated.isreturned
            );
            if (updatedItem) {
              // Check if the product name has changed
              if (updatedItem.productname !== item.productname) {
                // Find the matching product in the products array
                const matchingProduct = products.find(
                  (p) => p.description === updatedItem.productname
                );
                if (matchingProduct) {
                  // Update the code to match the new product
                  updatedItem.code = matchingProduct.id;
                }
              }
              return {
                ...item,
                code: updatedItem.code || item.code,
                productname: updatedItem.productname || item.productname,
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
                isreturned: true,
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
          productname: "Total:",
          qty: 0,
          price: 0,
          total: totalAmount,
          istotal: true,
          isreturned: true,
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
      <div className="flex justify-center items-center space-x-2 mt-8 text-default-700">
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
      id: "productname",
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
            const newValue = parseFloat(e.target.value) || 0;
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
        const isEditable = info.row.original.isless || info.row.original.istax;
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
      id: "productname",
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
            const newValue = parseFloat(e.target.value) || 0;
            const updatedItem = {
              ...info.row.original,
              price: newValue,
              total: (newValue * info.row.original.qty).toFixed(2),
            };

            const allOrderDetails = invoiceData.orderDetails.map((item) => {
              if (item.code === updatedItem.code) {
                return updatedItem;
              }
              return item;
            });

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
          {info.row.original.istotal
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
      id: "productname",
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
            const newValue = parseFloat(e.target.value) || 0;
            const updatedItem = {
              ...info.row.original,
              price: newValue,
              total: (newValue * info.row.original.qty).toFixed(2),
            };

            const allOrderDetails = invoiceData.orderDetails.map((item) => {
              if (item.code === updatedItem.code) {
                return updatedItem;
              }
              return item;
            });

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
          {info.row.original.istotal
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

  // Function to convert date from various formats to "YYYY-MM-DD"
  const formatDateForInput = (dateString: string) => {
    if (!dateString) return "";

    // Handle ISO timestamp format
    if (dateString.includes("T")) {
      try {
        const date = new Date(dateString);
        // Use toISOString() and slice to get just the date part
        return date.toISOString().slice(0, 10);
      } catch (error) {
        console.warn(`Error parsing ISO date: ${dateString}`, error);
        return "";
      }
    }

    // Check if the date is already in "YYYY-MM-DD" format
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
      return dateString;
    }

    // Split for "DD/MM/YYYY" format
    const parts = dateString.split("/");

    // Ensure we have exactly 3 parts
    if (parts.length !== 3) {
      console.warn(`Unexpected date format: ${dateString}`);
      return "";
    }

    const [day, month, year] = parts;

    // Pad day and month if needed, using default values if conversion fails
    const paddedDay = day.padStart(2, "0");
    const paddedMonth = month.padStart(2, "0");

    return `${year}-${paddedMonth}-${paddedDay}`;
  };

  // Updated formatDateForState to handle ISO timestamp
  const formatDateForState = (dateString: string) => {
    if (!dateString) return "";

    // Handle ISO timestamp format
    if (dateString.includes("T")) {
      try {
        const date = new Date(dateString);
        // Convert to local date string format
        return date.toLocaleDateString("en-GB");
      } catch (error) {
        console.warn(`Error parsing ISO date: ${dateString}`, error);
        return "";
      }
    }

    // Check if the date is in "DD/MM/YYYY" format
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(dateString)) {
      return dateString;
    }

    // Split for "YYYY-MM-DD" format
    const parts = dateString.split("-");

    // Ensure we have exactly 3 parts
    if (parts.length !== 3) {
      console.warn(`Unexpected date format: ${dateString}`);
      return "";
    }

    const [year, month, day] = parts;

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
        <div className="space-x-2">
          {!isNewInvoice && (
            <Button onClick={handleDeleteClick} variant="outline" color="rose">
              Delete
            </Button>
          )}
          <Button
            onClick={handleSaveClick}
            variant="outline"
            disabled={isSaving || (!isNewInvoice && !isFormChanged)}
          >
            {isSaving ? "Saving..." : isNewInvoice ? "Create" : "Save"}
          </Button>
        </div>
      </div>
      <h1 className="text-2xl font-bold mb-4">Invoice Details</h1>

      <div className="grid grid-cols-2 gap-6 mb-6">
        <div className="rounded-lg space-y-2">
          <FormInput
            name="invoiceno"
            label="Invoice No"
            value={
              invoiceData
                ? `${invoiceData.type || ""}${invoiceData.invoiceno || ""}`
                : ""
            }
            onChange={(e) => {
              const newValue = e.target.value;
              setInvoiceData((prev) => {
                if (!prev) return null;
                return {
                  ...prev,
                  type: (newValue.charAt(0) as "C" | "I") || prev.type,
                  invoiceno: newValue.slice(1),
                };
              });
            }}
          />
          <FormInput
            name="orderno"
            label="Order No"
            value={invoiceData.orderno}
            onChange={(e) => {
              setInvoiceData((prev) => {
                if (!prev) return null;
                return {
                  ...prev,
                  orderno: e.target.value,
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
        </div>
        <div className="rounded-lg space-y-2">
          <FormInput
            name="customerId"
            label="Customer ID"
            value={invoiceData.customer}
            disabled
          />
          <CustomerCombobox
            name="customer"
            label="Customer"
            value={invoiceData?.customername ? [invoiceData.customername] : []}
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
                  customername: selectedCustomerName,
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
