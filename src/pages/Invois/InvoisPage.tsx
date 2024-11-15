import React, {
  useState,
  useEffect,
  useRef,
  useMemo,
  useCallback,
} from "react";
import { useLocation, useNavigate } from "react-router-dom";
import TableEditing from "../../components/Table/TableEditing";
import Button from "../../components/Button";
import {
  ColumnConfig,
  InvoiceData,
  InvoiceFilterOptions,
  ProductData,
} from "../../types/types";
import toast from "react-hot-toast";
import { deleteInvoice, getInvoices, fetchDbInvoices } from "./InvoisUtils";
import { IconCloudUpload, IconPlus, IconSearch } from "@tabler/icons-react";
import ConfirmationDialog from "../../components/ConfirmationDialog";
import InvoiceFilterMenu from "../../components/InvoiceFilterMenu";
import { API_BASE_URL } from "../../configs/config";
import FilterSummary from "../../components/FilterSummary";

const InvoisPage: React.FC = () => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const [invoices, setInvoices] = useState<InvoiceData[]>([]);
  const [filteredInvoices, setFilteredInvoices] = useState<InvoiceData[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDeleteConfirmation, setShowDeleteConfirmation] = useState(false);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(
    null
  );
  const [filters, setFilters] = useState<InvoiceFilterOptions>({
    salesmanFilter: null,
    applySalesmanFilter: true,
    customerFilter: null,
    applyCustomerFilter: true,
    dateRangeFilter: { start: today, end: tomorrow },
    applyDateRangeFilter: false,
    invoiceTypeFilter: null,
    applyInvoiceTypeFilter: true,
    applyProductFilter: false,
  });
  const [searchTerm, setSearchTerm] = useState("");
  const [productData, setProductData] = useState<ProductData[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const handleInvoicesUpdated = () => {
      setInvoices([...invoices]); // This will trigger a re-render
    };

    window.addEventListener("invoicesUpdated", handleInvoicesUpdated);

    return () => {
      window.removeEventListener("invoicesUpdated", handleInvoicesUpdated);
    };
  }, [invoices]);

  const loadInvoices = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const fetchedInvoices = await fetchDbInvoices(filters);
      setInvoices(fetchedInvoices);
    } catch (error) {
      console.error("Error loading invoices:", error);
      setError(
        error instanceof Error ? error.message : "An unknown error occurred"
      );
      toast.error(
        `Failed to load invoices: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    } finally {
      setIsLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    loadInvoices();
  }, [loadInvoices]);

  const parseDate = (dateString: string): Date => {
    const [day, month, year] = dateString.split("/").map(Number);
    return new Date(year, month - 1, day);
  };

  const applyFilters = useCallback(() => {
    let filtered = [...invoices];

    // Apply search filter
    if (searchTerm) {
      const lowercasedSearch = searchTerm.toLowerCase();
      filtered = filtered.filter((invoice) =>
        Object.values(invoice).some((value) =>
          String(value).toLowerCase().includes(lowercasedSearch)
        )
      );
    }

    if (
      filters.applySalesmanFilter &&
      filters.salesmanFilter &&
      filters.salesmanFilter.length > 0
    ) {
      filtered = filtered.filter((invoice) =>
        filters.salesmanFilter!.includes(invoice.salesman)
      );
    }

    if (
      filters.applyCustomerFilter &&
      filters.customerFilter &&
      filters.customerFilter.length > 0
    ) {
      filtered = filtered.filter((invoice) =>
        filters.customerFilter!.includes(invoice.customername)
      );
    }

    if (filters.applyDateRangeFilter && filters.dateRangeFilter) {
      filtered = filtered.filter((invoice) => {
        const invoiceDate = parseDate(invoice.date);
        return (
          (!filters.dateRangeFilter!.start ||
            invoiceDate >= filters.dateRangeFilter!.start) &&
          (!filters.dateRangeFilter!.end ||
            invoiceDate < filters.dateRangeFilter!.end)
        );
      });
    }

    if (filters.applyInvoiceTypeFilter && filters.invoiceTypeFilter) {
      filtered = filtered.filter(
        (invoice) => invoice.type === filters.invoiceTypeFilter
      );
    }

    if (filters.applyProductFilter) {
      const products: { [key: string]: ProductData } = {};

      filtered.forEach((invoice) => {
        invoice.orderDetails.forEach((detail) => {
          if (!detail.isFoc && !detail.isReturned) {
            const key = `${detail.code}-${detail.productName}`;
            if (products[key]) {
              products[key].qty += parseFloat(detail.qty.toString()) || 0;
              products[key].amount += parseFloat(detail.total) || 0;
            } else {
              products[key] = {
                code: detail.code,
                productName: detail.productName,
                qty: parseFloat(detail.qty.toString()) || 0,
                amount: parseFloat(detail.total) || 0,
              };
            }
          }
        });
      });

      const sortedProducts = Object.values(products)
        .filter(
          (product) => product.productName != null && product.productName !== ""
        )
        .map((product) => ({
          ...product,
          qty: Number(product.qty.toFixed(2)),
          amount: Number(product.amount.toFixed(2)),
        }))
        .sort((a, b) => a.productName.localeCompare(b.productName));

      const groupedProducts: ProductData[] = [];
      let currentGroup = "";
      let groupQty = 0;
      let groupAmount = 0;

      sortedProducts.forEach((product) => {
        const productGroup = getProductGroup(product.code);

        if (productGroup !== currentGroup) {
          if (currentGroup !== "") {
            groupedProducts.push({
              code: `${currentGroup} Subtotal`,
              productName: `${currentGroup} Subtotal`,
              qty: groupQty,
              amount: groupAmount,
              isSubtotalQty: true,
            });
          }
          currentGroup = productGroup;
          groupQty = 0;
          groupAmount = 0;
        }

        groupedProducts.push(product);
        groupQty += product.qty;
        groupAmount += product.amount;
      });

      // Add the last group's subtotal
      if (currentGroup !== "") {
        groupedProducts.push({
          code: `${currentGroup} Subtotal`,
          productName: `${currentGroup} Subtotal`,
          qty: groupQty,
          amount: groupAmount,
          isSubtotalQty: true,
        });
      }

      setProductData(groupedProducts);
    } else {
      setFilteredInvoices(filtered);
    }
  }, [invoices, filters, searchTerm]);

  useEffect(() => {
    applyFilters();
  }, [applyFilters]);

  const getProductGroup = (code: string): string => {
    if (code.startsWith("1-")) return "1";
    if (code.startsWith("2-")) return "2";
    if (code.startsWith("MEQ-")) return "MEQ";
    if (code.startsWith("OTH")) return "OTH";
    if (code.startsWith("S-")) return "S";
    if (code.startsWith("WE-")) return "WE";
    return "Other";
  };

  const handleFilterChange = (newFilters: InvoiceFilterOptions) => {
    if (
      newFilters.dateRangeFilter &&
      newFilters.dateRangeFilter.start &&
      newFilters.dateRangeFilter.end
    ) {
      const { start, end } = newFilters.dateRangeFilter;
      if (start.getTime() === end.getTime()) {
        const adjustedEnd = new Date(start);
        adjustedEnd.setDate(adjustedEnd.getDate() + 1);
        newFilters.dateRangeFilter.end = adjustedEnd;
      }
    }
    setFilters(newFilters);
  };

  const handleSearchChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(event.target.value);
  };

  const handleFileUpload = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const files = event.target.files;
    if (!files || files.length === 0) {
      toast.error("No files selected");
      return;
    }

    const validFiles = Array.from(files).filter((file) =>
      file.name.match(/^SLS_.+\.txt$/)
    );

    if (validFiles.length === 0) {
      toast.error(
        "No valid files found. Please upload files with the format SLS_*.txt"
      );
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const newFileData: InvoiceData[] = [];

      for (const file of validFiles) {
        const content = await readFileContent(file);
        const parsedData = parseFileContent(content);
        newFileData.push(...parsedData);
      }

      // Upload parsed data to the server
      const response = await fetch(`${API_BASE_URL}/api/invoices/upload`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(newFileData),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      await response.json();

      const updatedInvoices = getInvoices();
      setInvoices(updatedInvoices);

      toast.success(`Successfully processed ${validFiles.length} file(s)`);

      // Navigate to the upload page with the updated invoices
      navigate("/stock/invois/imported", {
        state: { importedData: updatedInvoices },
      });
    } catch (error) {
      console.error("Error processing files:", error);
      setError(
        error instanceof Error ? error.message : "An unknown error occurred"
      );
      toast.error(
        `Error processing files: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    } finally {
      setIsLoading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const readFileContent = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e: ProgressEvent<FileReader>) =>
        resolve(e.target?.result as string);
      reader.onerror = (error) => reject(error);
      reader.readAsText(file);
    });
  };

  const parseFileContent = (content: string): InvoiceData[] => {
    const lines = content.split("\n");
    return lines
      .filter((line) => line.trim() !== "")
      .map((line) => {
        const [
          invoiceno,
          orderno,
          date,
          type,
          customer,
          salesman,
          totalAmount,
          ...rest // Use rest operator to capture unused values
        ] = line.split("|");

        // Get the last two items we need from rest
        const time = rest[rest.length - 2];
        const orderDetailsString = rest[rest.length - 1];

        const [customerId, customername] = customer.split("\t");

        const orderDetails = orderDetailsString
          .split("&E&")
          .filter(Boolean)
          .flatMap((item) => {
            const [code, qty, price, total, foc, returned] = item.split("&&");
            const baseItem = {
              code: code || "",
              productName: "", // This will be filled by the server
              qty: Number(qty) || 0,
              price: Number((parseFloat(price) / 100).toFixed(2)),
              total: (parseFloat(total) / 100).toFixed(2),
              isFoc: false,
              isReturned: false,
            };

            const items = [baseItem];

            if (Number(foc) > 0) {
              items.push({
                ...baseItem,
                qty: Number(foc),
                price: Number((parseFloat(price) / 100).toFixed(2)),
                total: (Number(baseItem.price) * Number(foc)).toFixed(2),
                isFoc: true,
              });
            }

            if (Number(returned) > 0) {
              items.push({
                ...baseItem,
                qty: Number(returned),
                price: Number((parseFloat(price) / 100).toFixed(2)),
                total: (Number(baseItem.price) * Number(returned)).toFixed(2),
                isReturned: true,
              });
            }

            return items;
          });

        return {
          id: invoiceno,
          invoiceno,
          orderno,
          date,
          type,
          customer: customerId,
          customername: customername || customerId,
          salesman,
          totalAmount,
          time,
          orderDetails,
        };
      });
  };

  const handleCreateNewInvoice = () => {
    navigate("/stock/invois/details", {
      state: {
        isNewInvoice: true,
        previousPath: location.pathname,
      },
    });
  };

  const handleInvoiceClick = (invoiceId: string, invoiceData: InvoiceData) => {
    navigate(`/stock/invois/details`, {
      state: {
        invoiceData,
        isNewInvoice: false,
        previousPath: location.pathname,
      },
    });
  };

  const handleConfirmDelete = async () => {
    if (selectedInvoiceId) {
      try {
        await deleteInvoice(selectedInvoiceId);
        toast.success("Invoice deleted successfully");
        loadInvoices(); // Reload the invoices after deletion
      } catch (error) {
        console.error("Error deleting invoice:", error);
        toast.error("Failed to delete invoice. Please try again.");
      }
    }
    setShowDeleteConfirmation(false);
    setSelectedInvoiceId(null);
  };

  const invoiceColumns: ColumnConfig[] = [
    {
      id: "invoiceno",
      header: "Invoice",
      type: "readonly",
      width: 150,
      cell: (info: { getValue: () => any; row: { original: InvoiceData } }) => (
        <button
          onClick={() =>
            handleInvoiceClick(info.row.original.id, info.row.original)
          }
          className="w-full h-full px-6 py-3 text-left outline-none bg-transparent cursor-pointer hover:font-semibold"
        >
          {info.row.original.type}
          {info.getValue()}
        </button>
      ),
    },
    { id: "date", header: "Date", type: "readonly", width: 150 },
    { id: "customername", header: "Customer", type: "readonly", width: 350 },
    { id: "salesman", header: "Salesman", type: "readonly", width: 150 },
    { id: "totalamount", header: "Amount", type: "readonly", width: 150 },
  ];

  const productColumns: ColumnConfig[] = [
    { id: "code", header: "Code", type: "readonly", width: 150 },
    { id: "productName", header: "Product Name", type: "readonly", width: 350 },
    { id: "qty", header: "Quantity", type: "readonly", width: 150 },
    { id: "amount", header: "Amount", type: "readonly", width: 150 },
  ];

  const salesmanOptions = useMemo(() => {
    return Array.from(new Set(invoices.map((invoice) => invoice.salesman)));
  }, [invoices]);

  const customerOptions = useMemo(() => {
    return Array.from(new Set(invoices.map((invoice) => invoice.customername)));
  }, [invoices]);

  if (isLoading) {
    return <div>Loading...</div>;
  }

  if (error) {
    return <div>Error: {error}</div>;
  }

  return (
    <div className="px-4">
      <div className="flex justify-between items-center mb-4">
        <div className="relative flex">
          <IconSearch
            className="absolute left-3 top-1/2 transform -translate-y-1/2 text-default-400"
            size={22}
          />
          <input
            type="text"
            placeholder="Search"
            className="w-full pl-11 py-2 border border-default-300 focus:border-default-500 rounded-full"
            value={searchTerm}
            onChange={handleSearchChange}
          />
        </div>
        <h1 className="ml-2 text-2xl text-center font-medium text-default-700 mb-2">
          Invois
        </h1>
        <div className="flex space-x-2 justify-center">
          <InvoiceFilterMenu
            onFilterChange={handleFilterChange}
            currentFilters={filters}
            salesmanOptions={salesmanOptions}
            customerOptions={customerOptions}
            today={today}
            tomorrow={tomorrow}
          />
          <input
            ref={fileInputRef}
            type="file"
            accept=".txt"
            onChange={handleFileUpload}
            className="hidden"
            id="fileUpload"
            multiple
          />
          <Button
            onClick={() => fileInputRef.current?.click()}
            icon={IconCloudUpload}
            iconSize={16}
            iconStroke={2}
            variant="outline"
          >
            Import
          </Button>

          <Button
            onClick={handleCreateNewInvoice}
            icon={IconPlus}
            iconSize={16}
            iconStroke={2}
            variant="outline"
          >
            Create
          </Button>
        </div>
      </div>
      <div className="w-auto max-w-full">
        <FilterSummary filters={filters} />
        {filters.applyProductFilter ? (
          productData.length > 0 ? (
            <TableEditing<ProductData>
              initialData={productData}
              columns={productColumns}
              onChange={() => {}} // Product data is read-only
              tableKey="invois-products"
            />
          ) : (
            <p className="text-center text-default-500">
              No product data found.
            </p>
          )
        ) : filteredInvoices.length > 0 ? (
          <TableEditing<InvoiceData>
            initialData={filteredInvoices}
            columns={invoiceColumns}
            onChange={setInvoices}
            tableKey="invois"
          />
        ) : (
          <p className="text-center text-default-500">No invoices found.</p>
        )}
      </div>
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

export default InvoisPage;
