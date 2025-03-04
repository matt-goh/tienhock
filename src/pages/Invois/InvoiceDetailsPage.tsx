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
  CustomProduct,
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
  createInvoice,
  checkDuplicateInvoiceNo,
} from "../../utils/invoice/InvoisUtils";
import { FormInput, FormListbox } from "../../components/FormComponents";
import ConfirmationDialog from "../../components/ConfirmationDialog";
import { api } from "../../routes/utils/api";
import {
  dateInputToTimestamp,
  formatDateForInput,
  parseDatabaseTimestamp,
} from "../../utils/invoice/dateUtils";
import TableEditableCell from "../../components/Table/TableEditableCell";
import { debounce } from "lodash";
import { CustomerCombobox } from "../../components/Invois/CustomerCombobox";
import { useProductsCache } from "../../utils/invoice/useProductsCache";

const InvoiceDetailsPage: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [previousPath, setPreviousPath] = useState("/sales/invoice");
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [invoiceData, setInvoiceData] = useState<ExtendedInvoiceData>(() => {
    if (location.state?.isNewInvoice) {
      return {
        id: "",
        products: [],
        amount: 0,
        rounding: 0,
        totalamountpayable: 0,
      };
    }
    const data = location.state?.invoiceData;
    return data ? { ...data, originalId: data.id } : null;
  });
  const [salesmen, setSalesmen] = useState<string[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCustomerName, setSelectedCustomerName] = useState<string>(
    () => invoiceData?.customerName || ""
  );
  const [customerQuery, setCustomerQuery] = useState("");
  const [customerPage, setCustomerPage] = useState(1);
  const [customerProducts, setCustomerProducts] = useState<CustomProduct[]>([]);
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
  const { products } = useProductsCache();

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
    const regularTotal = (item.quantity || 0) * (item.price || 0);

    // Add tax
    const afterTax = regularTotal + (item.tax || 0);

    // Calculate final total
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

  const fetchCustomerProducts = useCallback(async (customerId: string) => {
    if (!customerId) return;
    try {
      console.log(`Fetching customer products for ID: ${customerId}`);
      const data = await api.get(`/api/customer-products/${customerId}`);
      console.log("Fetched customer products:", data);
      setCustomerProducts(data);
    } catch (error) {
      console.error("Error fetching customer products:", error);
    }
  }, []);

  // Initialize once at mount
  useEffect(() => {
    // Handle both initial load and salesperson changes
    if (isInitialLoad || (!isInitialLoad && invoiceData?.salespersonid)) {
      setCustomers([]);
      setCustomerPage(1);
      setCustomerQuery("");
      if (isInitialLoad) {
        setIsInitialLoad(false);
      }
    }
  }, [invoiceData?.salespersonid, isInitialLoad]);

  useEffect(() => {
    // Only fetch if we have a valid customer ID and we're not creating a new invoice from scratch
    if (invoiceData?.customerid && invoiceData.customerid !== "") {
      console.log("Fetching customer products for:", invoiceData.customerid);
      fetchCustomerProducts(invoiceData.customerid);
    }
  }, [invoiceData?.customerid, fetchCustomerProducts]);

  const debouncedFetchCustomers = useMemo(
    () =>
      debounce((search: string) => {
        setIsFetchingCustomers(true);
        setCustomerPage(1);
        fetchCustomers(search, 1).finally(() => {
          setIsFetchingCustomers(false);
        });
      }, 300),
    [fetchCustomers]
  );

  // Handle search changes after initial load
  useEffect(() => {
    if (customerQuery !== undefined) {
      debouncedFetchCustomers(customerQuery);
    }
  }, [customerQuery, debouncedFetchCustomers]);

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

  // Effect to update prices when customer changes
  useEffect(() => {
    if (invoiceData?.products.length > 0 && customerProducts.length > 0) {
      setInvoiceData((prev) => ({
        ...prev,
        products: prev.products.map((product) => {
          if (product.issubtotal || product.istotal) return product;

          // Check if there's a custom price for this product
          const customProduct = customerProducts.find(
            (cp) => cp.product_id === product.code && cp.is_available
          );

          if (customProduct) {
            return {
              ...product,
              price: Number(customProduct.custom_price),
            };
          }

          // If no custom price, check for regular product price
          const regularProduct = products.find((p) => p.id === product.code);
          if (
            regularProduct &&
            regularProduct.price_per_unit &&
            product.price === 0
          ) {
            return {
              ...product,
              price: Number(regularProduct.price_per_unit),
            };
          }

          return product;
        }),
      }));
    }
  }, [customerProducts, products]);

  useEffect(() => {
    if (invoiceData?.products.length > 0 && products.length > 0) {
      const needsUpdate = invoiceData.products.some(
        (product) =>
          (!product.description &&
            products.find((p) => p.id === product.code)?.description) ||
          (product.price === 0 &&
            products.find((p) => p.id === product.code)?.price_per_unit)
      );

      if (needsUpdate) {
        setInvoiceData((prev) => ({
          ...prev,
          products: prev.products.map((product) => {
            const matchingProduct = products.find((p) => p.id === product.code);
            const customProduct = customerProducts.find(
              (cp) => cp.product_id === product.code && cp.is_available
            );

            let updates = {};

            if (matchingProduct && !product.description) {
              updates = {
                ...updates,
                description: matchingProduct.description,
              };
            }

            if (product.price === 0) {
              // Prioritize custom price over regular price
              const price = customProduct
                ? Number(customProduct.custom_price)
                : matchingProduct
                ? Number(matchingProduct.price_per_unit)
                : 0;

              if (price > 0) {
                updates = { ...updates, price };
              }
            }

            return Object.keys(updates).length > 0
              ? { ...product, ...updates }
              : product;
          }),
        }));
      }
    }
  }, [products, customerProducts]);

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
          istotal: true,
          issubtotal: false,
        },
      ];
    }
  };

  const orderDetailsWithTotal = useMemo(() => {
    if (!invoiceData || !Array.isArray(invoiceData.products)) {
      return [];
    }

    const regularItems = invoiceData.products.filter(
      (product) => !product.istotal
    );
    const totalAmount = calculateOverallTotal(regularItems).toFixed(2);
    return addTotalRow(regularItems, totalAmount);
  }, [invoiceData, calculateOverallTotal, addTotalRow]);

  const getAvailableProducts = useCallback(() => {
    // If no products are available for new selection,
    // return all products to start over
    if (products.length === 0) return [];

    const usedProducts = invoiceData?.products
      .filter((item) => !item.issubtotal && !item.istotal)
      .map((item) => item.code);

    // Get unused products first
    const unusedProducts = products.filter(
      (p) => !usedProducts?.includes(p.id)
    );

    // If no unused products, return all products to start over
    return unusedProducts.length > 0 ? unusedProducts : products;
  }, [products, invoiceData]);

  const addNewRow = useCallback((): ProductItem => {
    const availableProducts = getAvailableProducts();
    const randomProduct =
      availableProducts[Math.floor(Math.random() * availableProducts.length)];

    // Check if there's a custom price for this product
    const customProduct = customerProducts.find(
      (cp) => cp.product_id === randomProduct.id && cp.is_available
    );

    const price = customProduct
      ? Number(customProduct.custom_price)
      : Number(randomProduct.price_per_unit) || 0;

    return {
      uid: crypto.randomUUID(),
      code: randomProduct.id,
      description: randomProduct.description,
      quantity: 1,
      price: price,
      freeProduct: 0,
      returnProduct: 0,
      tax: 0,
      total: "0",
      issubtotal: false,
      istotal: false,
    };
  }, [getAvailableProducts, customerProducts]);

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

          // Map items and handle new rows
          let updatedProducts = filteredItems.map((item) => {
            // If this is a new row (no uid), create it with a random product
            if (!item.uid) {
              const availableProducts = getAvailableProducts();
              const randomProduct =
                availableProducts[
                  Math.floor(Math.random() * availableProducts.length)
                ];

              // Check if there's a custom price for this product
              const customProduct = customerProducts.find(
                (cp) => cp.product_id === randomProduct.id && cp.is_available
              );

              const price = customProduct
                ? Number(customProduct.custom_price)
                : Number(randomProduct.price_per_unit) || 0;

              return {
                ...item,
                uid: crypto.randomUUID(),
                code: randomProduct.id,
                description: randomProduct.description,
                price: price,
              };
            }
            return item;
          });

          // Initialize variables for recalculation
          let recalculatedProducts: ProductItem[] = [];
          let currentSubtotalSum = 0;

          // Process each product and calculate subtotals
          updatedProducts.forEach((item) => {
            if (item.issubtotal) {
              // When we hit a subtotal row, add it with the accumulated sum
              recalculatedProducts.push({
                ...item,
                total: currentSubtotalSum.toFixed(2),
              });
            } else {
              // For regular products, calculate their total and add to current sum
              const regularTotal = (item.quantity || 0) * (item.price || 0);
              const productTotal = regularTotal + (item.tax || 0);
              currentSubtotalSum += productTotal;

              recalculatedProducts.push({
                ...item,
                total: productTotal.toFixed(2),
              });
            }
          });

          // Calculate tax exclusive amount (subtotal)
          const subtotalAmount = recalculatedProducts.reduce((sum, item) => {
            if (item.issubtotal) return sum;
            const regularTotal = (item.quantity || 0) * (item.price || 0);
            return sum + regularTotal;
          }, 0);

          // Calculate tax amount only
          const taxAmount = recalculatedProducts.reduce((sum, item) => {
            if (item.issubtotal) return sum;
            return sum + (item.tax || 0);
          }, 0);

          const rounding = prevData.rounding || 0;

          // Calculate total amount payable (tax inclusive + rounding)
          const totalAmountPayable = subtotalAmount + taxAmount + rounding;

          // Add the total row
          const productsWithTotal = [
            ...recalculatedProducts,
            {
              uid: crypto.randomUUID(),
              code: "",
              description: "Total:",
              quantity: 0,
              price: 0,
              freeProduct: 0,
              returnProduct: 0,
              tax: 0,
              total: totalAmountPayable.toFixed(2),
              istotal: true,
              issubtotal: false,
            },
          ];

          // If this is a new row addition
          if (newRowAddedRef.current) {
            const newItem = addNewRow();
            if (newItem) {
              productsWithTotal.splice(
                productsWithTotal.length - 1,
                0,
                newItem
              );
            }
          }

          return {
            ...prevData,
            products: productsWithTotal,
            amount: subtotalAmount, // Tax exclusive amount
            rounding: rounding,
            totalamountpayable: totalAmountPayable, // Tax inclusive amount
          };
        });
      }, 0);
    },
    [addNewRow, getAvailableProducts]
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

  const validateInvoiceData = (data: ExtendedInvoiceData): string[] => {
    const errors: string[] = [];

    if (!data.id) {
      errors.push("Invoice number is required");
    }

    if (!data.createddate) {
      errors.push("Created date is required");
    }

    if (!data.salespersonid) {
      errors.push("Salesman selection is required");
    }

    if (!data.customerid) {
      errors.push("Customer selection is required");
    }

    return errors;
  };

  const handleSaveClick = async () => {
    if (!invoiceData) return;

    // Validate required fields
    const validationErrors = validateInvoiceData(invoiceData);
    if (validationErrors.length > 0) {
      validationErrors.forEach((error) => toast.error(error));
      return;
    }

    setIsSaving(true);
    try {
      if (isNewInvoice) {
        try {
          // Check for duplicate before proceeding
          const isDuplicate = await checkDuplicateInvoiceNo(invoiceData.id);
          if (isDuplicate) {
            toast.error(
              "This invoice number already exists. Please use a different number."
            );
            return;
          }

          // Format products for saving - including all required fields
          const productsToSave = invoiceData.products
            .filter((product) => !product.istotal && !product.issubtotal)
            .map((product) => ({
              code: product.code,
              quantity: product.quantity || 0,
              price: product.price || 0,
              freeProduct: product.freeProduct || 0,
              returnProduct: product.returnProduct || 0,
              tax: product.tax || 0,
              total: product.total,
              description: product.description,
              issubtotal: product.issubtotal || false,
            }));

          const dataToSave: ExtendedInvoiceData = {
            id: invoiceData.id,
            salespersonid: invoiceData.salespersonid,
            customerid: invoiceData.customerid,
            customername: invoiceData.customername,
            createddate: invoiceData.createddate,
            paymenttype: invoiceData.paymenttype || "INVOICE",
            amount: invoiceData.amount || 0,
            rounding: invoiceData.rounding || 0,
            totalamountpayable: invoiceData.totalamountpayable || 0,
            products: productsToSave,
            customerName: invoiceData.customerName,
          };

          // Try to create the invoice
          const created = await createInvoice(dataToSave);
          const savedInvoice = {
            ...created,
            customerName: created.customerid || "",
            isEditing: false,
          };

          toast.success("New invoice created successfully");
          navigate(previousPath);
          setInvoiceData(savedInvoice);
          setIsFormChanged(false);
          setIsNewInvoice(false);
        } catch (error) {
          if (error instanceof Error) {
            if (error.message.includes("duplicate")) {
              toast.error(
                "This invoice number already exists. Please use a different number."
              );
            } else {
              toast.error(`Failed to create invoice: ${error.message}`);
            }
          } else {
            toast.error(
              "An unexpected error occurred while creating the invoice"
            );
          }
          return;
        }
      } else {
        // Handle existing invoice update
        try {
          const productsToSave = invoiceData.products
            .filter((product) => !product.istotal && !product.issubtotal)
            .map((product) => ({
              code: product.code,
              quantity: product.quantity || 0,
              price: product.price || 0,
              freeProduct: product.freeProduct || 0,
              returnProduct: product.returnProduct || 0,
              tax: product.tax || 0,
              total: product.total,
              description: product.description,
            }));

          const dataToSave: ExtendedInvoiceData = {
            id: invoiceData.id,
            originalId: invoiceData.originalId,
            salespersonid: invoiceData.salespersonid,
            customerid: invoiceData.customerid,
            customername: invoiceData.customername,
            createddate: invoiceData.createddate,
            paymenttype: invoiceData.paymenttype || "INVOICE",
            amount: invoiceData.amount || 0,
            rounding: invoiceData.rounding || 0,
            totalamountpayable: invoiceData.totalamountpayable || 0,
            products: productsToSave,
            customerName: invoiceData.customerName,
          };

          const saved = await updateInvoice(dataToSave);
          const savedInvoice = {
            ...saved,
            customerName: saved.customerid || "",
            isEditing: false,
          };

          toast.success("Invoice updated successfully in database");

          navigate(previousPath);
          setInvoiceData(savedInvoice);
          setIsFormChanged(false);
        } catch (error) {
          if (error instanceof Error) {
            toast.error(`Failed to update invoice: ${error.message}`);
          } else {
            toast.error(
              "An unexpected error occurred while updating the invoice"
            );
          }
          return;
        }
      }
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

      // Add total row back
      const finalProducts = [
        ...newProducts,
        {
          code: "TOTAL",
          quantity: 0,
          price: 0,
          freeProduct: 0,
          returnProduct: 0,
          tax: 0,
          total: "0",
          istotal: true,
        },
      ];

      return {
        ...prevData,
        products: finalProducts,
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
      width: 400,
      options: products.map((p) => p.description),
      cell: (info: { getValue: () => any; row: { original: ProductItem } }) => (
        <TableEditableCell
          value={info.getValue() ?? ""}
          onChange={(newDescription) => {
            const matchingProduct = products.find(
              (p) => p.description === newDescription
            );
            if (matchingProduct) {
              // Check if there's a custom price for this product
              const customProduct = customerProducts.find(
                (cp) => cp.product_id === matchingProduct.id && cp.is_available
              );

              const price = customProduct
                ? Number(customProduct.custom_price)
                : Number(matchingProduct.price_per_unit) || 0;

              const updatedProducts = invoiceData.products.map((product) => {
                if (product.uid === info.row.original.uid) {
                  return {
                    ...product,
                    code: matchingProduct.id,
                    description: matchingProduct.description,
                    price: price,
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
          options={products.map((p) => p.description || "")}
        />
      ),
    },
    {
      id: "quantity",
      header: "QTY",
      type: "number",
      width: 130,
      cell: (info: { getValue: () => any; row: { original: ProductItem } }) => (
        <input
          type="number"
          min="0"
          value={info.getValue() ?? 0}
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
      width: 130,
      cell: (info: { getValue: () => any; row: { original: ProductItem } }) => (
        <input
          type="number"
          step="0.01"
          min="0"
          value={info.getValue() ?? 0}
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
      width: 100,
    },
    {
      id: "returnProduct",
      header: "RTN",
      type: "number",
      width: 100,
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
          value={info.getValue() ?? 0}
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
      width: 120,
      cell: (info: { getValue: () => any; row: { original: ProductItem } }) => (
        <div className="w-full h-full px-6 py-3 text-right">
          {calculateTotal(info.row.original).toFixed(2)}
        </div>
      ),
    },
    { id: "action", header: "", type: "action", width: 50 },
  ];

  // Add this function to map the type value to its display name
  const getTypeDisplayName = (type: "CASH" | "INVOICE") => {
    return type === "CASH" ? "Cash" : "Invoice";
  };

  // Add this helper function near the top of the component
  const getFormattedInvoiceNumber = (
    paymentType: string,
    id: string
  ): string => {
    const prefix = paymentType === "CASH" ? "C" : "I";
    return `${prefix}${id || ""}`;
  };

  return (
    <div className="px-6 max-w-7xl w-full">
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
            value={getFormattedInvoiceNumber(
              invoiceData?.paymenttype || "INVOICE",
              invoiceData?.id || ""
            )}
            onChange={(e) => {
              const newValue = e.target.value;
              // Extract the type (first character) and number (rest of the string)
              const type = newValue.charAt(0).toUpperCase();
              const number = newValue.slice(1);

              setInvoiceData((prev) => {
                if (!prev) return prev;
                return {
                  ...prev,
                  id: number, // Update the ID with the number portion
                  paymenttype: type === "C" ? "CASH" : "INVOICE", // Update payment type based on first character
                };
              });
            }}
          />
          <FormListbox
            name="type"
            label="Type"
            value={getTypeDisplayName(
              invoiceData.paymenttype as "CASH" | "INVOICE"
            )}
            onChange={(value) => {
              setInvoiceData((prev) => {
                // Instead of potentially returning null, return a new ExtendedInvoiceData
                const updatedData: ExtendedInvoiceData = {
                  ...prev,
                  paymenttype: value === "Cash" ? "CASH" : "INVOICE",
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
          />{" "}
          <FormInput
            name="time"
            label="Time"
            type="time"
            value={
              parseDatabaseTimestamp(
                invoiceData.createddate
              ).formattedTime?.slice(0, 5) ?? ""
            } // Just take HH:mm part
            onChange={(e) => {
              const [hours, minutes] = e.target.value.split(":").map(Number);
              const currentDate = new Date(parseInt(invoiceData.createddate));
              currentDate.setHours(hours, minutes);

              setInvoiceData((prev) => ({
                ...prev,
                createddate: currentDate.getTime().toString(),
              }));
            }}
          />
        </div>
        <div className="rounded-lg space-y-2">
          <FormListbox
            name="salesman"
            label="Salesman"
            value={invoiceData.salespersonid || ""}
            onChange={(value) => {
              setInvoiceData((prev) => {
                if (!prev) return prev;

                return {
                  ...prev,
                  salespersonid: value || "", // Directly update the salespersonid with the selected value
                };
              });
            }}
            options={salesmen.map((id) => ({ id, name: id }))}
          />
          <CustomerCombobox
            name="customer"
            label="Customer"
            value={selectedCustomerName ? [selectedCustomerName] : []}
            onChange={(value: string[] | null) => {
              const selectedCustomerName = value ? value[0] : "";
              const selectedCustomer = customers.find(
                (c) => c.name === selectedCustomerName
              );

              // Set the selected customer name state
              setSelectedCustomerName(selectedCustomerName);

              // Update the invoice data
              setInvoiceData((prev) => {
                const customerId = selectedCustomer?.id || "";

                // Log the selected customer ID for debugging
                console.log("Customer selected, ID:", customerId);

                return {
                  ...prev,
                  customerid: customerId,
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
          <FormInput
            name="customerId"
            label="Customer ID"
            value={invoiceData.customerid || ""}
            disabled
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

export default InvoiceDetailsPage;
