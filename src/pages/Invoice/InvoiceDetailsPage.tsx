// src/pages/Invoice/InvoiceDetailsPage.tsx (Abandoned)
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
} from "../../utils/invoice/InvoiceUtils";
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
import { CustomerCombobox } from "../../components/Invoice/CustomerCombobox";
import { useProductsCache } from "../../utils/invoice/useProductsCache";
import { useSalesmanCache } from "../../utils/catalogue/useSalesmanCache";

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
  const [showCancelConfirmation, setShowCancelConfirmation] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const { products } = useProductsCache();
  const { salesmen: salesmenData, isLoading: salesmenLoading } =
    useSalesmanCache();

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

  useEffect(() => {
    if (salesmenData.length > 0) {
      const salesmenIds = salesmenData.map((employee) => employee.id);
      setSalesmen(["All Salesmen", ...salesmenIds]);
    }
  }, [salesmenData]);

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
      const data = await api.get(`/api/customer-products/${customerId}`);
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

  const orderDetailsWithTotal = useMemo(() => {
    if (!invoiceData || !Array.isArray(invoiceData.products)) {
      return [];
    }

    // Get regular items (not total row)
    const regularItems = invoiceData.products.filter(
      (product) => !product.istotal
    );

    // Get existing total row to preserve rounding
    const existingTotalRow = invoiceData.products.find((item) => item.istotal);

    // Explicitly get the rounding value, ensuring it's a number
    const rounding = parseFloat(
      // Check total row first, then invoiceData, default to 0
      String(
        (existingTotalRow?.rounding !== undefined
          ? String(existingTotalRow.rounding)
          : String(invoiceData.rounding)) || "0"
      )
    );

    // Calculate subtotal (amount before tax and rounding)
    const subtotalAmount = regularItems.reduce((total, item) => {
      if (item.issubtotal) return total;
      return total + (item.quantity || 0) * (item.price || 0);
    }, 0);

    // Calculate tax amount
    const taxAmount = regularItems.reduce((total, item) => {
      if (item.issubtotal) return total;
      return total + (item.tax || 0);
    }, 0);

    // Calculate total amount including rounding
    const totalAmountPayable = subtotalAmount + taxAmount + rounding;

    // Create or update total row with explicit rounding property
    const totalRow = {
      uid: existingTotalRow?.uid || crypto.randomUUID(),
      code: "TOTAL",
      description: "Total:",
      quantity: 0,
      price: 0,
      freeProduct: 0,
      returnProduct: 0,
      tax: 0,
      total: totalAmountPayable.toFixed(2),
      istotal: true,
      issubtotal: false,
      rounding: rounding, // Explicit rounding value
      amount: subtotalAmount.toFixed(2),
    };

    return [...regularItems, totalRow];
  }, [invoiceData]);

  const getAvailableProducts = useCallback(() => {
    // Check if product list is available
    if (!products || products.length === 0) {
      console.warn("No products data available");
      return [];
    }

    // If no invoice data or products, return all products
    if (!invoiceData?.products || invoiceData.products.length === 0) {
      return products;
    }

    // Get currently used product codes (excluding subtotal and total rows)
    const usedProductCodes = invoiceData.products
      .filter((item) => !item.issubtotal && !item.istotal && item.code)
      .map((item) => item.code);

    // First try to find products that haven't been used yet
    const unusedProducts = products.filter(
      (p) => !usedProductCodes.includes(p.id)
    );

    // If we have unused products, return them, otherwise return all products
    return unusedProducts.length > 0 ? unusedProducts : products;
  }, [products, invoiceData?.products]);

  const addNewRow = useCallback(() => {
    // Get available products
    const availableProducts = getAvailableProducts();

    // Safeguard - if there are no products, return a placeholder
    if (!availableProducts || availableProducts.length === 0) {
      console.error("No products available for selection");
      return {
        uid: crypto.randomUUID(),
        code: "",
        description: "",
        quantity: 1,
        price: 0,
        freeProduct: 0,
        returnProduct: 0,
        tax: 0,
        total: "0",
        issubtotal: false,
        istotal: false,
      };
    }

    // Select a random product
    const randomIndex = Math.floor(Math.random() * availableProducts.length);
    const randomProduct = availableProducts[randomIndex];

    // Check for custom pricing
    const customProduct = customerProducts.find(
      (cp) => cp.product_id === randomProduct.id && cp.is_available
    );

    // Determine price - prioritize custom pricing
    const price = customProduct
      ? Number(customProduct.custom_price)
      : Number(randomProduct.price_per_unit) || 0;

    // Create and return the new product item
    return {
      uid: crypto.randomUUID(),
      code: randomProduct.id,
      description: randomProduct.description || "",
      quantity: 1, // Default quantity 1
      price: price,
      freeProduct: 0,
      returnProduct: 0,
      tax: 0,
      total: price.toFixed(2), // Initial total is just the price
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
          // Extract total row to get any rounding changes
          const totalRow = updatedItems.find((item) => item.istotal);
          const filteredItems = updatedItems.filter((item) => !item.istotal);

          // Get the updated rounding value (ensure it's a number with 2 decimal places max)
          const roundingValue =
            totalRow && totalRow.rounding !== undefined
              ? Math.round(
                  (parseFloat(totalRow.rounding.toString()) || 0) * 100
                ) / 100
              : prevData.rounding || 0;

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
                quantity: 1,
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

          // Get rounding from existing total row or use current rounding value
          const existingTotalRow = prevData.products.find((row) => row.istotal);
          const rounding =
            existingTotalRow?.rounding !== undefined
              ? existingTotalRow.rounding
              : prevData.rounding || 0;

          // Calculate total amount payable (tax inclusive + rounding)
          const totalAmountPayable = subtotalAmount + taxAmount + roundingValue;

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
              rounding: roundingValue,
              amount: subtotalAmount.toFixed(2),
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
            total_excluding_tax: subtotalAmount, // Tax exclusive amount
            rounding: roundingValue,
            totalamountpayable: totalAmountPayable, // Tax inclusive amount
          };
        });
      }, 0);
    },
    [addNewRow, getAvailableProducts, customerProducts]
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

  const handleCancelClick= () => {
    setShowCancelConfirmation(true);
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

          toast.success("New invoice created successfully");
          navigate(previousPath);
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
            .filter((product) => !product.istotal)
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

          toast.success("Invoice updated successfully in database");

          navigate(previousPath);
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

  const handleConfirmCancel = async () => {
    if (invoiceData) {
      try {
        const toastId = toast.loading("Cancelling invoice...");
        await deleteInvoice(invoiceData.id);
        toast.dismiss(toastId);
        toast.success("Invoice cancelled successfully");
        navigate(previousPath);
      } catch (error) {
        console.error("Error cancelling invoice:", error);
        toast.error("Failed to cancel invoice. Please try again.");
      }
    }
    setShowCancelConfirmation(false);
  };

  const handleAddRegularItem = () => {
    newRowAddedRef.current = true;
    // Get a new random product item
    const newItem = addNewRow();

    setInvoiceData((prevData) => {
      if (!prevData) return prevData;

      // Get current products without the total row
      const productsWithoutTotal = prevData.products.filter(
        (item) => !item.istotal
      );

      // Add the new item
      const updatedProducts = [...productsWithoutTotal, newItem];

      // Get existing rounding value
      const existingTotalRow = prevData.products.find((item) => item.istotal);
      const rounding = parseFloat(
        String(
          (existingTotalRow?.rounding !== undefined
            ? existingTotalRow.rounding
            : prevData.rounding) || 0
        )
      );

      // Calculate new totals
      const subtotal = updatedProducts.reduce((sum, item) => {
        if (item.issubtotal) return sum;
        return sum + (item.quantity || 0) * (item.price || 0);
      }, 0);

      const taxAmount = updatedProducts.reduce((sum, item) => {
        if (item.issubtotal) return sum;
        return sum + (item.tax || 0);
      }, 0);

      const totalAmount = subtotal + taxAmount + rounding;

      // Create new total row
      const newTotalRow = {
        uid: existingTotalRow?.uid || crypto.randomUUID(),
        code: "TOTAL",
        description: "Total:",
        quantity: 0,
        price: 0,
        freeProduct: 0,
        returnProduct: 0,
        tax: 0,
        total: totalAmount.toFixed(2),
        istotal: true,
        issubtotal: false,
        rounding: rounding,
        amount: subtotal.toFixed(2),
      };

      // Return updated invoice data with new product and totals
      return {
        ...prevData,
        products: [...updatedProducts, newTotalRow],
        amount: subtotal,
        rounding: rounding,
        totalamountpayable: totalAmount,
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
            <Button onClick={handleCancelClick} variant="outline" color="rose">
              Cancel Invoice
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
        isOpen={showCancelConfirmation}
        onClose={() => setShowCancelConfirmation(false)}
        onConfirm={handleConfirmCancel}
        title="Cancel Invoice"
        message={`Are you sure you want to cancel this invoice? The invoice will be archived and can be viewed in the Cancelled Invoices section.`}
        confirmButtonText="Cancel Invoice"
        variant="danger"
      />
    </div>
  );
};

export default InvoiceDetailsPage;
