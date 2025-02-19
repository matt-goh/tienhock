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
  ExtendedInvoiceData,
  InvoiceData,
  ProductItem,
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
import {
  dateInputToTimestamp,
  formatDateForInput,
} from "../../utils/invoice/dateUtils";
import TableEditableCell from "../../components/Table/TableEditableCell";

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
  const [previousPath, setPreviousPath] = useState("/sales/invoice");
  const [invoiceData, setInvoiceData] = useState<ExtendedInvoiceData>(() => {
    if (location.state?.isNewInvoice) {
      return {
        billNumber: 0,
        salespersonId: "",
        customerId: "",
        createdDate: new Date().toLocaleDateString("en-GB"),
        paymentType: "Invoice",
        products: [],
        totalMee: 0,
        totalBihun: 0,
        totalNonTaxable: 0,
        totalTaxable: 0,
        totalAdjustment: 0,
        displayProducts: [],
        customerName: "",
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
    console.log(invoiceData);
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

  const calculateTotal = (item: ProductItem): number => {
    if (!item) return 0;

    // For subtotal/total rows, return their total directly
    if (item.issubtotal || item.istotal) {
      return parseFloat(item.total || "0");
    }

    // Calculate regular product total
    const regularTotal = item.quantity * item.price;
    // Subtract returned items value
    const returnCredit = item.returnProduct * item.price;
    // Apply discount
    const afterDiscount = regularTotal - returnCredit - (item.discount || 0);
    // Add tax
    const afterTax = afterDiscount + (item.tax || 0);
    // FOC items don't affect total
    return afterTax;
  };

  const calculateOverallTotal = (products: ProductItem[]): number => {
    return products.reduce((total, item) => {
      if (item.issubtotal || item.istotal) {
        return total;
      }
      return total + calculateTotal(item);
    }, 0);
  };

  const fetchCustomers = useCallback(
    async (search: string, page: number) => {
      setIsFetchingCustomers(true);
      try {
        const data = await api.get(
          `/api/customers/combobox?salesman=${
            invoiceData?.salespersonid || ""
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
    [invoiceData?.salespersonid]
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
  }, [invoiceData?.salespersonid, fetchCustomers]);

  useEffect(() => {
    if (invoiceData) {
      setInvoiceData((prev: ExtendedInvoiceData): ExtendedInvoiceData => {
        const normalizedProducts = prev.products.map((product) => ({
          uid: product.uid || crypto.randomUUID(),
          code: product.code,
          price: product.price || 0,
          quantity: product.quantity || 0,
          description: product.description || "",
          freeProduct: product.freeProduct || 0,
          returnProduct: product.returnProduct || 0,
          tax: product.tax || 0,
          discount: product.discount || 0,
          total: product.total,
          issubtotal: product.issubtotal || false,
          istotal: product.istotal || false,
        }));

        return {
          ...prev,
          products: normalizedProducts,
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

  const addTotalRow = (
    items: ProductItem[],
    totalAmount: string
  ): ProductItem[] => {
    const existingTotalRow = items.find((item) => item.istotal);
    if (existingTotalRow) {
      return items.map((item) =>
        item.istotal ? { ...item, total: totalAmount } : item
      );
    } else {
      return [
        ...items,
        {
          uid: crypto.randomUUID(),
          code: "",
          description: "Total:",
          quantity: 0,
          price: 0,
          total: totalAmount,
          freeProduct: 0,
          returnProduct: 0,
          tax: 0,
          discount: 0,
          istotal: true,
          issubtotal: false,
        },
      ];
    }
  };

  const orderDetailsWithTotal = useMemo(() => {
    if (!invoiceData) return [];

    const regularItems = invoiceData.products.filter(
      (product) => !product.istotal
    );
    const totalAmount = calculateOverallTotal(regularItems).toFixed(2);
    return addTotalRow(regularItems, totalAmount);
  }, [invoiceData, calculateOverallTotal, addTotalRow]);

  const recalculateSubtotals = (details: ProductItem[]): ProductItem[] => {
    const result: ProductItem[] = [];
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
        // Update running total for non-total rows
        if (!item.istotal) {
          runningTotal += calculateTotal(item);
        }
      }
    }

    return result;
  };

  const handleSpecialRowDelete = (code: string) => {
    setInvoiceData((prevData: ExtendedInvoiceData): ExtendedInvoiceData => {
      // Filter out the row with the given code
      const newProducts = prevData.products.filter(
        (item) => item.code !== code
      );

      // Recalculate totals
      let totalMee = 0;
      let totalBihun = 0;
      let totalNonTaxable = 0;
      let totalTaxable = 0;

      newProducts.forEach((product) => {
        if (product.issubtotal || product.istotal) return;

        const total = calculateTotal(product);

        if (product.code.startsWith("1-")) {
          totalMee += total;
        } else if (product.code.startsWith("2-")) {
          totalBihun += total;
        }

        if (product.code.startsWith("S-") || product.code.startsWith("MEQ-")) {
          totalNonTaxable += total;
        } else {
          totalTaxable += total;
        }
      });

      return {
        ...prevData,
        products: newProducts,
        totalMee,
        totalBihun,
        totalNonTaxable,
        totalTaxable,
      };
    });
  };

  const getAvailableProducts = useCallback(() => {
    const usedProducts = invoiceData?.products.map((item) => item.code);
    return products.filter((p) => !usedProducts?.includes(p.id));
  }, [products, invoiceData]);

  const addNewRow = () => {
    const availableProducts = getAvailableProducts();

    if (availableProducts.length === 0) {
      toast.error("All products have been added to the invoice.");
      return null;
    }

    const randomProduct =
      availableProducts[Math.floor(Math.random() * availableProducts.length)];

    return {
      uid: crypto.randomUUID(),
      code: randomProduct.id,
      description: randomProduct.description,
      quantity: 1,
      price: 0,
      freeProduct: 0,
      returnProduct: 0,
      tax: 0,
      discount: 0,
      issubtotal: false,
      istotal: false,
    };
  };

  const newRowAddedRef = useRef(false);

  // Reset newRowAddedRef after each render
  useEffect(() => {
    newRowAddedRef.current = false;
  });

  // HC
  const handleChange = useCallback(
    (updatedItems: ProductItem[]) => {
      setTimeout(() => {
        setInvoiceData((prevData: ExtendedInvoiceData): ExtendedInvoiceData => {
          // Filter out total row from updated items
          const filteredItems = updatedItems.filter((item) => !item.istotal);

          let updatedProducts = filteredItems.map((item) => {
            // If this is a new row (no uid), assign one
            if (!item.uid) {
              return {
                ...item,
                uid: crypto.randomUUID(),
              };
            }
            return item;
          });

          // Handle new rows added through TableEditing
          if (newRowAddedRef.current) {
            const newItem = addNewRow();
            if (newItem) {
              updatedProducts = [...updatedProducts, newItem];
            }
          }

          // Add total row back
          const total = calculateOverallTotal(updatedProducts).toFixed(2);
          const productsWithTotal = addTotalRow(updatedProducts, total);

          return {
            ...prevData,
            products: productsWithTotal,
          };
        });
      }, 0);
    },
    [calculateOverallTotal, addNewRow, addTotalRow]
  );

  const handleAddSubtotal = () => {
    setInvoiceData((prevData: ExtendedInvoiceData): ExtendedInvoiceData => {
      // Calculate subtotal from non-total rows up to this point
      const currentProducts = prevData.products;
      let runningTotal = 0;

      for (const product of currentProducts) {
        if (product.istotal || product.issubtotal) continue;
        runningTotal += calculateTotal(product);
      }

      const newProduct: ProductItem = {
        uid: crypto.randomUUID(),
        code: "SUBTOTAL",
        description: "Subtotal",
        quantity: 0,
        price: 0,
        freeProduct: 0,
        returnProduct: 0,
        tax: 0,
        discount: 0,
        total: runningTotal.toFixed(2),
        issubtotal: true,
        istotal: false,
      };

      // Insert before total but after all regular items
      const totalRowIndex = prevData.products.findIndex((item) => item.istotal);
      const newProducts = [...prevData.products];
      if (totalRowIndex !== -1) {
        newProducts.splice(totalRowIndex, 0, newProduct);
      } else {
        newProducts.push(newProduct);
      }

      return {
        ...prevData,
        products: newProducts,
      };
    });
  };

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

    if (!invoiceData.id) {
      toast.error("Please enter an invoice number before saving.");
      return;
    }

    setIsSaving(true);
    try {
      // Format products for saving
      const productsToSave = invoiceData.products.map((product) => ({
        ...product,
        tax: product.tax || 0,
        discount: product.discount || 0,
        total: calculateTotal(product).toFixed(2),
      }));

      const dataToSave: ExtendedInvoiceData = {
        ...invoiceData,
        products: productsToSave,
      };

      let savedInvoice;
      if (isNewInvoice) {
        const created = await createInvoice(dataToSave);
        savedInvoice = {
          ...created,
          customerName: created.customerid || "",
          isEditing: false,
        };
        toast.success("New invoice created successfully");
      } else {
        const saveToDb = location.pathname.includes("/sales/invoice/details");
        const saved = await saveInvoice(dataToSave, saveToDb);
        savedInvoice = {
          ...saved,
          customerName: saved.customerid || "",
          isEditing: false,
        };
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
    setInvoiceData((prevData: ExtendedInvoiceData): ExtendedInvoiceData => {
      if (!prevData) return prevData;

      const newItem = addNewRow();
      if (!newItem) return prevData;

      // Remove total row if it exists
      const productsWithoutTotal = prevData.products.filter(
        (item) => !item.istotal
      );

      // Add new item
      const newProducts = [...productsWithoutTotal, newItem];

      // Recalculate totals
      let totalMee = 0;
      let totalBihun = 0;
      let totalNonTaxable = 0;
      let totalTaxable = 0;

      newProducts.forEach((product) => {
        if (product.issubtotal || product.istotal) return;

        const total = calculateTotal(product);

        if (product.code.startsWith("1-")) {
          totalMee += total;
        } else if (product.code.startsWith("2-")) {
          totalBihun += total;
        }

        if (product.code.startsWith("S-") || product.code.startsWith("MEQ-")) {
          totalNonTaxable += total;
        } else {
          totalTaxable += total;
        }
      });

      // Add total row back
      const total = calculateOverallTotal(newProducts).toFixed(2);
      const withTotal = addTotalRow(newProducts, total);

      return {
        ...prevData,
        products: withTotal,
        totalMee,
        totalBihun,
        totalNonTaxable,
        totalTaxable,
      };
    });
  };

  const renderActionButtons = () => {
    const hasRegularItems = orderDetailsWithTotal.length > 1;

    const renderButton = (text: string, onClick?: () => void) => (
      <Button onClick={onClick} variant="outline" size="md">
        {text}
      </Button>
    );

    return (
      <div className="flex justify-center items-center space-x-2 mt-8 text-default-700">
        {!hasRegularItems && renderButton("Add Order", handleAddRegularItem)}
      </div>
    );
  };

  // PC
  const productColumns: ColumnConfig[] = [
    {
      id: "code",
      header: "ID",
      type: "readonly",
      width: 120,
    },
    {
      id: "description",
      header: "Product",
      type: "combobox",
      width: 350,
      options: products.map((p) => p.description),
      cell: (info: { getValue: () => any; row: { original: ProductItem } }) => (
        <TableEditableCell
          value={info.getValue()}
          onChange={(newDescription) => {
            const matchingProduct = products.find(
              (p) => p.description === newDescription
            );
            if (matchingProduct) {
              const updatedProducts = invoiceData.products.map((product) => {
                if (product.uid === info.row.original.uid) {
                  return {
                    ...product,
                    code: matchingProduct.id,
                    description: matchingProduct.description,
                  };
                }
                return product;
              });
              handleChange(updatedProducts);
            }
          }}
          type="combobox"
          editable={true}
          focus={false}
          onKeyDown={() => {}}
          isSorting={false}
          previousCellValue={info.getValue()}
          options={products.map((p) => p.description)}
        />
      ),
    },
    {
      id: "quantity",
      header: "QTY",
      type: "number",
      width: 80,
      cell: (info: { getValue: () => any; row: { original: ProductItem } }) => (
        <input
          type="number"
          min="0"
          value={info.getValue()}
          onChange={(e) => {
            const newValue = Math.max(0, parseInt(e.target.value, 10) || 0);
            const updatedProducts = invoiceData.products.map((product) => {
              if (product.code === info.row.original.code) {
                return {
                  ...product,
                  quantity: newValue,
                };
              }
              return product;
            });
            handleChange(updatedProducts);
          }}
          className="w-full h-full px-6 py-3 text-right outline-none bg-transparent"
        />
      ),
    },
    {
      id: "price",
      header: "Price",
      type: "float",
      width: 100,
      cell: (info: { getValue: () => any; row: { original: ProductItem } }) => (
        <input
          type="number"
          step="0.01"
          min="0"
          value={info.getValue()}
          onChange={(e) => {
            const newValue = Math.max(0, parseFloat(e.target.value) || 0);
            const updatedProducts = invoiceData.products.map((product) => {
              if (product.code === info.row.original.code) {
                return {
                  ...product,
                  price: newValue,
                };
              }
              return product;
            });
            handleChange(updatedProducts);
          }}
          className="w-full h-full px-6 py-3 text-right outline-none bg-transparent"
        />
      ),
    },
    {
      id: "freeProduct",
      header: "FOC",
      type: "number",
      width: 80,
      cell: (info: { getValue: () => any; row: { original: ProductItem } }) => (
        <input
          type="number"
          min="0"
          value={info.getValue()}
          onChange={(e) => {
            const newValue = Math.max(0, parseInt(e.target.value, 10) || 0);
            const updatedProducts = invoiceData.products.map((product) => {
              if (product.code === info.row.original.code) {
                return {
                  ...product,
                  freeProduct: newValue,
                };
              }
              return product;
            });
            handleChange(updatedProducts);
          }}
          className="w-full h-full px-6 py-3 text-right outline-none bg-transparent"
        />
      ),
    },
    {
      id: "returnProduct",
      header: "RTN",
      type: "number",
      width: 80,
      cell: (info: { getValue: () => any; row: { original: ProductItem } }) => (
        <input
          type="number"
          min="0"
          value={info.getValue()}
          onChange={(e) => {
            const newValue = Math.max(0, parseInt(e.target.value, 10) || 0);
            const updatedProducts = invoiceData.products.map((product) => {
              if (product.code === info.row.original.code) {
                return {
                  ...product,
                  returnProduct: newValue,
                };
              }
              return product;
            });
            handleChange(updatedProducts);
          }}
          className="w-full h-full px-6 py-3 text-right outline-none bg-transparent"
        />
      ),
    },
    {
      id: "discount",
      header: "Disc",
      type: "float",
      width: 100,
      cell: (info: { getValue: () => any; row: { original: ProductItem } }) => (
        <input
          type="number"
          step="0.01"
          min="0"
          value={info.getValue()}
          onChange={(e) => {
            const newValue = Math.max(0, parseFloat(e.target.value) || 0);
            const updatedProducts = invoiceData.products.map((product) => {
              if (product.code === info.row.original.code) {
                return {
                  ...product,
                  discount: newValue,
                };
              }
              return product;
            });
            handleChange(updatedProducts);
          }}
          className="w-full h-full px-6 py-3 text-right outline-none bg-transparent"
        />
      ),
    },
    {
      id: "tax",
      header: "Tax",
      type: "float",
      width: 100,
      cell: (info: { getValue: () => any; row: { original: ProductItem } }) => (
        <input
          type="number"
          step="0.01"
          min="0"
          value={info.getValue()}
          onChange={(e) => {
            const newValue = Math.max(0, parseFloat(e.target.value) || 0);
            const updatedProducts = invoiceData.products.map((product) => {
              if (product.code === info.row.original.code) {
                return {
                  ...product,
                  tax: newValue,
                };
              }
              return product;
            });
            handleChange(updatedProducts);
          }}
          className="w-full h-full px-6 py-3 text-right outline-none bg-transparent"
        />
      ),
    },
    {
      id: "total",
      header: "Total",
      type: "amount",
      width: 100,
      cell: (info: { getValue: () => any; row: { original: ProductItem } }) => (
        <div className="w-full h-full px-6 py-3 text-right">
          {calculateTotal(info.row.original).toFixed(2)}
        </div>
      ),
    },
    { id: "action", header: "", type: "action", width: 50 },
  ];

  // Add this function to map the type value to its display name
  const getTypeDisplayName = (type: "C" | "I") => {
    return type === "C" ? "Cash" : "Invoice";
  };

  return (
    <div className="px-4 max-w-7xl mx-auto">
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
                ? `${
                    invoiceData.paymenttype
                      ? invoiceData.paymenttype === "Invoice"
                        ? "I"
                        : "C"
                      : ""
                  }${invoiceData.id ?? ""}`
                : ""
            }
            onChange={(e) => {
              const newValue = e.target.value;
              setInvoiceData((prev) => {
                if (!prev) {
                  // Return a default ExtendedInvoiceData object instead of null
                  return {
                    id: "",
                    salespersonid: "",
                    customerid: "",
                    createddate: new Date().toLocaleDateString("en-GB"),
                    paymenttype: "Invoice",
                    products: [],
                    totalMee: 0,
                    totalBihun: 0,
                    totalNonTaxable: 0,
                    totalTaxable: 0,
                    totalAdjustment: 0,
                    customerName: "",
                    type: (newValue.charAt(0) as "C" | "I") || "I",
                    date: new Date().toLocaleDateString("en-GB"),
                    time: new Date().toLocaleTimeString("en-GB"),
                    customer: "",
                    customername: "",
                    salesman: "",
                  };
                }
                return {
                  ...prev,
                  type: (newValue.charAt(0) as "C" | "I") || prev.paymenttype,
                  billNumber: newValue.slice(1),
                };
              });
            }}
          />
          <FormListbox
            name="type"
            label="Type"
            value={getTypeDisplayName(invoiceData.paymenttype as "C" | "I")}
            onChange={(value) => {
              setInvoiceData((prev) => {
                // Instead of potentially returning null, return a new ExtendedInvoiceData
                const updatedData: ExtendedInvoiceData = {
                  ...prev,
                  paymenttype: value === "Cash" ? "Cash" : "Invoice",
                };
                return updatedData;
              });
            }}
            options={[
              { id: "C", name: "Cash" },
              { id: "I", name: "Invoice" },
            ]}
          />
          <FormInput
            name="date"
            label="Date"
            type="date"
            value={formatDateForInput(invoiceData.createddate)}
            onChange={(e) => {
              setInvoiceData((prev) => ({
                ...prev,
                createddate: dateInputToTimestamp(e.target.value),
              }));
            }}
          />
        </div>
        <div className="rounded-lg space-y-2">
          <FormInput
            name="customerId"
            label="Customer ID"
            value={invoiceData.customerid}
            disabled
          />
          <CustomerCombobox
            name="customer"
            label="Customer"
            value={invoiceData?.customerid ? [invoiceData.customerid] : []}
            onChange={(value: string[] | null) => {
              setInvoiceData((prev) => {
                const selectedCustomerName = value ? value[0] : "";
                const selectedCustomer = customers.find(
                  (c) => c.name === selectedCustomerName
                );

                // Create an updated state object that maintains ExtendedInvoiceData type
                const updatedData: ExtendedInvoiceData = {
                  ...prev,
                  // Ensure all required fields from ExtendedInvoiceData are present
                  customerid: selectedCustomer?.id || prev.customerid,
                  id: prev.id,
                  salespersonid: prev.salespersonid,
                  createddate: prev.createddate,
                  paymenttype: prev.paymenttype,
                  products: prev.products,
                  totalMee: prev.totalMee,
                  totalBihun: prev.totalBihun,
                  totalNonTaxable: prev.totalNonTaxable,
                  totalTaxable: prev.totalTaxable,
                  totalAdjustment: prev.totalAdjustment,
                };

                return updatedData;
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
            value={invoiceData.salespersonid}
            onChange={(value) => {
              setInvoiceData((prev) => {
                // Create an updated state object that maintains ExtendedInvoiceData type
                const updatedData: ExtendedInvoiceData = {
                  ...prev,
                  customerid: prev.customerid,
                  id: prev.id,
                  salespersonid: prev.salespersonid,
                  createddate: prev.createddate,
                  paymenttype: prev.paymenttype,
                  products: prev.products,
                  totalMee: prev.totalMee,
                  totalBihun: prev.totalBihun,
                  totalNonTaxable: prev.totalNonTaxable,
                  totalTaxable: prev.totalTaxable,
                  totalAdjustment: prev.totalAdjustment,
                };

                return updatedData;
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
              <Button onClick={handleAddSubtotal} variant="outline" size="md">
                Subtotal
              </Button>
            </div>
          </div>
          <TableEditing<ProductItem>
            initialData={orderDetailsWithTotal}
            columns={productColumns}
            onChange={handleChange}
            onSpecialRowDelete={handleSpecialRowDelete}
            tableKey="orderDetails"
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
