import React, {
  useState,
  useEffect,
  useRef,
  useMemo,
  useCallback,
} from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  ColumnConfig,
  InvoiceData,
  InvoiceFilterOptions,
  ProductData,
} from "../../types/types";
import { deleteInvoice, getInvoices, fetchDbInvoices } from "./InvoisUtils";
import {
  IconCloudUpload,
  IconEye,
  IconPlus,
  IconPrinter,
  IconSearch,
} from "@tabler/icons-react";
import ConfirmationDialog from "../../components/ConfirmationDialog";
import InvoiceFilterMenu from "../../components/Invois/InvoiceFilterMenu";
import FilterSummary from "../../components/Invois/FilterSummary";
import TableEditing from "../../components/Table/TableEditing";
import EInvoisMenu from "../../components/Invois/EInvoisMenu";
import Button from "../../components/Button";
import toast from "react-hot-toast";
import PrintPDFOverlay from "./PrintPDFOverlay";
import PDFDownloadHandler from "./PDFDownloadHandler";
import { api } from "../../routes/utils/api";

const STORAGE_KEY = "invoisDateFilters";

const InvoisPage: React.FC = () => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  // Function to get initial dates from localStorage
  const getInitialDates = () => {
    const savedFilters = localStorage.getItem(STORAGE_KEY);
    if (savedFilters) {
      const { start, end } = JSON.parse(savedFilters);
      return {
        start: start ? new Date(start) : today,
        end: end ? new Date(end) : tomorrow,
      };
    }
    return {
      start: today,
      end: tomorrow,
    };
  };

  const [invoices, setInvoices] = useState<InvoiceData[]>([]);
  const [filteredInvoices, setFilteredInvoices] = useState<InvoiceData[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDeleteConfirmation, setShowDeleteConfirmation] = useState(false);
  const [selectedCount, setSelectedCount] = useState(0);
  const [isAllSelected, setIsAllSelected] = useState(false);
  const [selectedInvoices, setSelectedInvoices] = useState<InvoiceData[]>([]);
  const [filters, setFilters] = useState<InvoiceFilterOptions>({
    salesmanFilter: null,
    applySalesmanFilter: true,
    customerFilter: null,
    applyCustomerFilter: true,
    dateRangeFilter: getInitialDates(),
    applyDateRangeFilter: true,
    invoiceTypeFilter: null,
    applyInvoiceTypeFilter: true,
    applyProductFilter: false,
  });
  const [searchTerm, setSearchTerm] = useState("");
  const [productData, setProductData] = useState<ProductData[]>([]);
  const [isDateRangeFocused, setIsDateRangeFocused] = useState(false);
  const [showPrintOverlay, setShowPrintOverlay] = useState(false);
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

  useEffect(() => {
    const loadInvoices = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const fetchedInvoices = await fetchDbInvoices(filters);
        setInvoices(fetchedInvoices);
        setFilteredInvoices(fetchedInvoices);
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
    };

    loadInvoices();
  }, []);

  const handleSelectionChange = useCallback(
    (count: number, allSelected: boolean, selectedRows: InvoiceData[]) => {
      setSelectedCount(count);
      setIsAllSelected(allSelected);
      setSelectedInvoices(selectedRows);
    },
    []
  );

  const handleBulkDelete = async () => {
    // Close the dialog immediately
    setShowDeleteConfirmation(false);

    try {
      const deletePromises = selectedInvoices.map((invoice) =>
        deleteInvoice(invoice.id)
      );
      await Promise.all(deletePromises);

      // Reset filters to initial state
      setFilters({
        salesmanFilter: null,
        applySalesmanFilter: true,
        customerFilter: null,
        applyCustomerFilter: true,
        dateRangeFilter: getInitialDates(),
        applyDateRangeFilter: true,
        invoiceTypeFilter: null,
        applyInvoiceTypeFilter: true,
        applyProductFilter: false,
      });

      setSearchTerm("");

      // Load fresh data
      const fetchedInvoices = await fetchDbInvoices({
        salesmanFilter: null,
        applySalesmanFilter: true,
        customerFilter: null,
        applyCustomerFilter: true,
        dateRangeFilter: getInitialDates(),
        applyDateRangeFilter: true,
        invoiceTypeFilter: null,
        applyInvoiceTypeFilter: true,
        applyProductFilter: false,
      });
      setInvoices(fetchedInvoices);

      // Reset selection states
      setSelectedCount(0);
      setIsAllSelected(false);
      setSelectedInvoices([]);

      toast.success("Selected invoices deleted successfully");
    } catch (error) {
      console.error("Error deleting invoices:", error);
      toast.error("Failed to delete invoices. Please try again.");
    }
  };

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

    // Customer filter
    if (
      filters.applyCustomerFilter &&
      filters.customerFilter &&
      filters.customerFilter.length > 0
    ) {
      const customerSet = new Set(filters.customerFilter);
      filtered = filtered.filter((invoice) =>
        customerSet.has(invoice.customername)
      );
      console.log("After customer filter:", {
        selectedCustomers: filters.customerFilter,
        filteredCount: filtered.length,
      });
    }

    // Salesman filter
    if (
      filters.applySalesmanFilter &&
      filters.salesmanFilter &&
      filters.salesmanFilter.length > 0
    ) {
      const salesmanSet = new Set(filters.salesmanFilter);
      filtered = filtered.filter((invoice) =>
        salesmanSet.has(invoice.salesman)
      );
    }

    // Date filter
    if (filters.dateRangeFilter?.start || filters.dateRangeFilter?.end) {
      filtered = filtered.filter((invoice) => {
        const invoiceDate = parseDate(invoice.date);
        const startDate = filters.dateRangeFilter?.start;
        const endDate = filters.dateRangeFilter?.end;

        return (
          (!startDate || invoiceDate >= startDate) &&
          (!endDate || invoiceDate < endDate)
        );
      });
    }

    // Invoice type filter
    if (filters.applyInvoiceTypeFilter && filters.invoiceTypeFilter) {
      filtered = filtered.filter(
        (invoice) => invoice.type === filters.invoiceTypeFilter
      );
    }

    if (filters.applyProductFilter) {
      // Reset selection when switching to product view
      setSelectedCount(0);
      setIsAllSelected(false);
      setSelectedInvoices([]);
      const products: { [key: string]: ProductData } = {};

      filtered.forEach((invoice) => {
        invoice.orderDetails.forEach((detail) => {
          if (!detail.isfoc && !detail.isreturned) {
            const key = `${detail.code}-${detail.productname}`;
            if (products[key]) {
              products[key].qty += parseFloat(detail.qty.toString()) || 0;
              products[key].amount += parseFloat(detail.total) || 0;
            } else {
              products[key] = {
                code: detail.code,
                productname: detail.productname,
                qty: parseFloat(detail.qty.toString()) || 0,
                amount: parseFloat(detail.total) || 0,
              };
            }
          }
        });
      });

      const sortedProducts = Object.values(products)
        .filter(
          (product) => product.productname != null && product.productname !== ""
        )
        .map((product) => ({
          ...product,
          qty: Number(product.qty.toFixed(2)),
          amount: Number(product.amount.toFixed(2)),
        }))
        .sort((a, b) => a.productname.localeCompare(b.productname));

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
              productname: `${currentGroup} Subtotal`,
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
          productname: `${currentGroup} Subtotal`,
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
    setSelectedCount(0);
    setIsAllSelected(false);
    setSelectedInvoices([]);
  }, [invoices]);

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

  // Function to save dates to localStorage
  const saveDatesToStorage = (startDate: Date | null, endDate: Date | null) => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        start: startDate?.toISOString(),
        end: endDate?.toISOString(),
      })
    );
  };

  const handleFilterChange = (newFilters: InvoiceFilterOptions) => {
    // Save dates to localStorage
    saveDatesToStorage(
      newFilters.dateRangeFilter?.start ?? null,
      newFilters.dateRangeFilter?.end ?? null
    );

    // Only reload data if date range changes
    if (
      newFilters.dateRangeFilter?.start?.getTime() !==
        filters.dateRangeFilter?.start?.getTime() ||
      newFilters.dateRangeFilter?.end?.getTime() !==
        filters.dateRangeFilter?.end?.getTime()
    ) {
      const loadInvoices = async () => {
        try {
          const fetchedInvoices = await fetchDbInvoices(newFilters);
          setInvoices(fetchedInvoices);
        } catch (error) {
          console.error("Error loading invoices:", error);
          toast.error("Failed to load invoices");
        }
      };
      loadInvoices();
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
      await api.post("/api/invoices/upload", newFileData);

      const updatedInvoices = getInvoices();
      setInvoices(updatedInvoices);

      toast.success(`Successfully processed ${validFiles.length} file(s)`);

      // Navigate to the upload page with the updated invoices
      navigate("/sales/invois/imported", {
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
              productname: "", // This will be filled by the server
              qty: Number(qty) || 0,
              price: Number((parseFloat(price) / 100).toFixed(2)),
              total: (parseFloat(total) / 100).toFixed(2),
              isfoc: false,
              isreturned: false,
            };

            const items = [baseItem];

            if (Number(foc) > 0) {
              items.push({
                ...baseItem,
                qty: Number(foc),
                price: Number((parseFloat(price) / 100).toFixed(2)),
                total: (Number(baseItem.price) * Number(foc)).toFixed(2),
                isfoc: true,
              });
            }

            if (Number(returned) > 0) {
              items.push({
                ...baseItem,
                qty: Number(returned),
                price: Number((parseFloat(price) / 100).toFixed(2)),
                total: (Number(baseItem.price) * Number(returned)).toFixed(2),
                isreturned: true,
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
    navigate("/sales/invois/details", {
      state: {
        isNewInvoice: true,
        previousPath: location.pathname,
      },
    });
  };

  const handleInvoiceClick = (invoiceId: string, invoiceData: InvoiceData) => {
    navigate(`/sales/invois/details`, {
      state: {
        invoiceData,
        isNewInvoice: false,
        previousPath: location.pathname,
      },
    });
  };

  const handlePDFClick = () => {
    // Determine which invoices to use for the PDF
    const invoicesToUse =
      selectedCount > 0 ? selectedInvoices : filteredInvoices;

    // Store the data in sessionStorage before opening the window
    sessionStorage.setItem("PDF_DATA", JSON.stringify(invoicesToUse));

    // Open the window and remove the data after it's opened
    const pdfWindow = window.open("/pdf-viewer", "_blank");
    if (pdfWindow) {
      // Clean up the storage after a delay to ensure the new window has time to read it
      setTimeout(() => {
        sessionStorage.removeItem("PDF_DATA");
      }, 1000);
    }
  };

  const handlePrintPDF = () => {
    const invoicesToUse =
      selectedCount > 0 ? selectedInvoices : filteredInvoices;
    setShowPrintOverlay(true);
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
    { id: "code", header: "Code", type: "readonly", width: 180 },
    { id: "productname", header: "Product Name", type: "readonly", width: 400 },
    { id: "qty", header: "Quantity", type: "number", width: 180 },
    { id: "amount", header: "Amount", type: "amount", width: 180 },
  ];

  const salesmanOptions = useMemo(() => {
    return Array.from(new Set(invoices.map((invoice) => invoice.salesman)));
  }, [invoices]);

  const customerOptions = useMemo(() => {
    return Array.from(new Set(invoices.map((invoice) => invoice.customername)));
  }, [invoices]);

  const formatDateForInput = (date: Date | null): string => {
    if (!date) return "";
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, "0");
    const day = date.getDate().toString().padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const getDateRangeInfo = (start: Date, end: Date) => {
    const oneMonthMs = 30 * 24 * 60 * 60 * 1000;
    const rangeDuration = end.getTime() - start.getTime();
    return {
      isWithinMonth: rangeDuration <= oneMonthMs,
      isValidDirection: rangeDuration > 0,
      rangeDuration,
    };
  };

  const adjustDateRange = (
    newDate: Date,
    type: "start" | "end",
    currentRange: { start: Date | null; end: Date | null }
  ): { start: Date; end: Date } => {
    const oneMonthMs = 32 * 24 * 60 * 60 * 1000;

    if (!currentRange.start || !currentRange.end) {
      // If we don't have both dates, set the other date one month apart
      if (type === "start") {
        return {
          start: newDate,
          end: new Date(newDate.getTime() + oneMonthMs),
        };
      } else {
        return {
          start: new Date(newDate.getTime() - oneMonthMs),
          end: newDate,
        };
      }
    }

    // Get the other existing date
    const otherDate = type === "start" ? currentRange.end : currentRange.start;

    // Check if the new range would exceed one month
    const rangeInfo = getDateRangeInfo(
      type === "start" ? newDate : currentRange.start,
      type === "end" ? newDate : currentRange.end
    );

    if (!rangeInfo.isValidDirection) {
      // If dates are in wrong order, adjust the other date to maintain order
      return type === "start"
        ? {
            start: newDate,
            end: new Date(newDate.getTime() + 24 * 60 * 60 * 1000),
          } // one day later
        : {
            start: new Date(newDate.getTime() - 24 * 60 * 60 * 1000),
            end: newDate,
          }; // one day earlier
    }

    if (!rangeInfo.isWithinMonth) {
      // If range exceeds one month, adjust the other date to maintain one month maximum
      return type === "start"
        ? { start: newDate, end: new Date(newDate.getTime() + oneMonthMs) }
        : { start: new Date(newDate.getTime() - oneMonthMs), end: newDate };
    }

    // If range is valid (within a month), return new date with existing other date
    return {
      start: type === "start" ? newDate : currentRange.start,
      end: type === "end" ? newDate : currentRange.end,
    };
  };

  const handleDateChange = (type: "start" | "end", value: string) => {
    if (!value) {
      const newDateRange = {
        ...filters.dateRangeFilter,
        [type]: null,
      };
      handleFilterChange({
        ...filters,
        dateRangeFilter: newDateRange,
      });
      return;
    }

    const [year, month, day] = value.split("-").map(Number);
    const newDate = new Date(year, month - 1, day);

    // Get adjusted date range
    const adjustedRange = adjustDateRange(
      newDate,
      type,
      filters.dateRangeFilter
    );

    handleFilterChange({
      ...filters,
      dateRangeFilter: adjustedRange,
    });
  };

  if (isLoading) {
    return <div>Loading...</div>;
  }

  if (error) {
    return <div>Error: {error}</div>;
  }

  return (
    <div className="px-6">
      <div className="flex flex-col">
        {/* Page Header aligned with table (excluding checkbox width) */}
        <div
          className={`flex items-start justify-between pb-4 ${
            !filters.applyProductFilter ? "pl-[45px]" : ""
          }`}
        >
          <h1 className="text-3xl font-semibold text-default-900">
            Invois {selectedCount > 0 && `(${selectedCount})`}
          </h1>
          <div className="flex items-center gap-3">
            {selectedCount > 0 && (
              <button
                onClick={() => setShowDeleteConfirmation(true)}
                className="inline-flex items-center px-4 py-2 text-rose-500 font-medium border-2 border-rose-400 hover:border-rose-500 active:border-rose-600 bg-white hover:bg-rose-500 active:bg-rose-600 hover:text-white active:text-rose-100 rounded-full transition-colors duration-200"
              >
                Delete
              </button>
            )}
            <Button
              onClick={handlePDFClick}
              icon={IconEye}
              iconSize={16}
              iconStroke={2}
              variant="outline"
              disabled={selectedCount === 0}
            >
              View
            </Button>

            <PDFDownloadHandler
              invoices={selectedCount > 0 ? selectedInvoices : filteredInvoices}
              disabled={selectedCount === 0}
            />

            <Button
              onClick={handlePrintPDF}
              icon={IconPrinter}
              iconSize={16}
              iconStroke={2}
              variant="outline"
              disabled={selectedCount === 0}
            >
              Print
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".txt"
              onChange={handleFileUpload}
              className="hidden"
              id="fileUpload"
              multiple
            />
            <div className="flex items-center gap-3">
              <EInvoisMenu
                selectedInvoices={selectedInvoices}
                dateRange={filters.dateRangeFilter}
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
        </div>

        {/* Filters Section */}
        <div
          className={`space-y-4 ${
            !filters.applyProductFilter ? "ml-[45px]" : ""
          }`}
        >
          <div className="flex gap-4">
            {/* Search Bar */}
            <div className="w-[350px]">
              <div className="relative">
                <IconSearch
                  className="absolute left-4 top-1/2 transform -translate-y-1/2 text-default-400"
                  size={20}
                />
                <input
                  type="text"
                  placeholder="Search invoices..."
                  className="w-full pl-11 pr-4 py-2 bg-white border border-default-300 rounded-full focus:border-default-500"
                  value={searchTerm}
                  onChange={handleSearchChange}
                />
              </div>
            </div>

            {/* Date Range */}
            <div className="flex-1">
              <div
                className={`flex items-center bg-white border ${
                  isDateRangeFocused
                    ? "border-default-500"
                    : "border-default-300"
                } rounded-full px-4`}
              >
                <div className="flex items-center gap-3 flex-1">
                  <input
                    type="date"
                    value={formatDateForInput(
                      filters.dateRangeFilter?.start ?? null
                    )}
                    onChange={(e) => handleDateChange("start", e.target.value)}
                    onFocus={() => setIsDateRangeFocused(true)}
                    onBlur={() => setIsDateRangeFocused(false)}
                    className="flex-1 px-2 py-2 rounded-full bg-transparent outline-none"
                  />
                  <span className="text-default-400">to</span>
                  <input
                    type="date"
                    value={formatDateForInput(
                      filters.dateRangeFilter?.end ?? null
                    )}
                    onChange={(e) => handleDateChange("end", e.target.value)}
                    onFocus={() => setIsDateRangeFocused(true)}
                    onBlur={() => setIsDateRangeFocused(false)}
                    className="flex-1 px-2 py-2 rounded-full bg-transparent outline-none"
                  />
                </div>
              </div>
            </div>

            {/* Filter Menu */}
            <div className="flex justify-end">
              <InvoiceFilterMenu
                onFilterChange={handleFilterChange}
                currentFilters={filters}
                salesmanOptions={salesmanOptions}
                customerOptions={customerOptions}
                today={today}
                tomorrow={tomorrow}
              />
            </div>
          </div>

          {/* Filter Summary */}
          <FilterSummary filters={filters} />
        </div>

        {/* Table Section */}
        <div className="bg-white overflow-hidden">
          {filters.applyProductFilter ? (
            <>
              {productData.length > 0 ? (
                <div className="w-full">
                  <TableEditing<ProductData>
                    initialData={productData}
                    columns={productColumns}
                    onChange={() => {}}
                    tableKey="invois-products"
                  />
                </div>
              ) : (
                <div className="flex items-center justify-center h-[200px]">
                  <p className="text-default-500">No product data found.</p>
                </div>
              )}
            </>
          ) : filteredInvoices.length > 0 ? (
            <TableEditing<InvoiceData>
              initialData={filteredInvoices}
              columns={invoiceColumns}
              onChange={setInvoices}
              onSelectionChange={handleSelectionChange}
              tableKey="invois"
            />
          ) : (
            <div className="py-16">
              <p className="text-center text-default-500">No invoices found.</p>
            </div>
          )}
        </div>

        <ConfirmationDialog
          isOpen={showDeleteConfirmation}
          onClose={() => setShowDeleteConfirmation(false)}
          onConfirm={handleBulkDelete}
          title="Delete Confirmation"
          message={
            isAllSelected
              ? "Are you sure you want to delete all invoices? This action cannot be undone."
              : `Are you sure you want to delete ${selectedCount} selected invoice${
                  selectedCount === 1 ? "" : "s"
                }? This action cannot be undone.`
          }
          confirmButtonText="Delete"
        />
      </div>
      {showPrintOverlay && (
        <PrintPDFOverlay
          invoices={selectedCount > 0 ? selectedInvoices : filteredInvoices}
          onComplete={() => setShowPrintOverlay(false)}
        />
      )}
    </div>
  );
};

export default InvoisPage;
