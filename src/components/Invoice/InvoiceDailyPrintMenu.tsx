import React, { useState, useRef, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import Checkbox from "../Checkbox";
import Button from "../Button";
import { IconCalendarEvent, IconPrinter } from "@tabler/icons-react";
import LoadingSpinner from "../LoadingSpinner";
import { api } from "../../routes/utils/api";
import toast from "react-hot-toast";
import { InvoiceFilters } from "../../types/types";
import { useSalesmanCache } from "../../utils/catalogue/useSalesmanCache";
import { useCustomerNames } from "../../utils/catalogue/useCustomerNames";
import PrintPDFOverlay from "../../utils/invoice/PDF/PrintPDFOverlay";

interface InvoiceDailyPrintMenuProps {
  filters: InvoiceFilters;
  size?: "sm" | "md";
}

interface SalesmanOption {
  id: string;
  name: string;
  description?: string;
}

const InvoiceDailyPrintMenu: React.FC<InvoiceDailyPrintMenuProps> = ({
  filters,
  size = "md",
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const [selectedSalesmen, setSelectedSalesmen] = useState<
    Record<string, boolean>
  >({});
  const [isGenerating, setIsGenerating] = useState(false);
  const [invoicesToPrint, setInvoicesToPrint] = useState<any[]>([]);
  const [showPrintOverlay, setShowPrintOverlay] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const customerIds = useMemo(
    () => invoicesToPrint.map((inv) => inv.customerid),
    [invoicesToPrint]
  );
  const { salesmen: salesmenData } = useSalesmanCache();
  const { customerNames } = useCustomerNames(customerIds);

  // Convert salesmen data to options
  const salesmenOptions: SalesmanOption[] = salesmenData
    .filter((s) => s.id !== "All Salesmen")
    .map((s) => ({
      id: s.id,
      name: s.name || s.id,
    }));

  // Initialize only the first salesman as selected
  useEffect(() => {
    const initialSelections: Record<string, boolean> = {};
    salesmenOptions.forEach((opt, index) => {
      initialSelections[opt.id] = index === 0;
    });
    setSelectedSalesmen(initialSelections);
  }, [salesmenOptions.length]);

  useEffect(() => {
    if (isVisible && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setPosition({
        top: rect.bottom + 8,
        left: rect.right,
      });
    }
  }, [isVisible]);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const handleMouseEnter = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = setTimeout(() => {
      setIsVisible(true);
    }, 0);
  };

  const handleMouseLeave = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = setTimeout(() => {
      setIsVisible(false);
    }, 100);
  };

  const handleSalesmanToggle = (salesmanId: string) => {
    setSelectedSalesmen((prev) => ({
      ...prev,
      [salesmanId]: !prev[salesmanId],
    }));
  };

  const handleSelectAll = () => {
    const allSelected = salesmenOptions.every(
      (opt) => selectedSalesmen[opt.id]
    );
    const newSelections: Record<string, boolean> = {};
    salesmenOptions.forEach((opt) => {
      newSelections[opt.id] = !allSelected;
    });
    setSelectedSalesmen(newSelections);
  };

  const selectedCount = Object.values(selectedSalesmen).filter(Boolean).length;
  const allSelected = selectedCount === salesmenOptions.length;

  const formatDateRange = () => {
    if (!filters.dateRange.start || !filters.dateRange.end) {
      return "No date range selected";
    }
    const start = new Date(filters.dateRange.start);
    const end = new Date(filters.dateRange.end);

    const formatDate = (date: Date) => {
      return date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    };

    if (start.toDateString() === end.toDateString()) {
      return formatDate(start);
    }

    return `${formatDate(start)} - ${formatDate(end)}`;
  };

  const handleGenerate = async (action: "download" | "print") => {
    if (selectedCount === 0) {
      toast.error("Please select at least one salesman");
      return;
    }

    if (!filters.dateRange.start || !filters.dateRange.end) {
      toast.error("Please select a valid date range");
      return;
    }

    setIsGenerating(true);
    setIsVisible(false);

    try {
      // Build query parameters for invoice fetching
      const params = new URLSearchParams();

      // Add date range
      params.append("startDate", filters.dateRange.start.getTime().toString());
      params.append("endDate", filters.dateRange.end.getTime().toString());

      // Add selected salesmen
      const selectedSalesmenIds = Object.keys(selectedSalesmen).filter(
        (key) => selectedSalesmen[key]
      );
      params.append("salesman", selectedSalesmenIds.join(","));

      // Add invoice status filter
      params.append("invoiceStatus", "paid,Unpaid,overdue,cancelled");

      // Add limit to ensure we get all invoices
      params.append("limit", "1000");

      // Fetch invoices
      const response = await api.get(`/api/invoices?${params.toString()}`);

      if (!response || !response.data || response.data.length === 0) {
        toast.error("No invoices found for the selected criteria");
        return;
      }

      // Fetch full invoice details including products for each invoice
      const invoicesWithProducts = await Promise.all(
        response.data.map(async (invoice: any) => {
          try {
            // Fetch full invoice details including products
            const fullInvoice = await api.get(`/api/invoices/${invoice.id}`);
            return fullInvoice || invoice; // Fallback to original if fetch fails
          } catch (error) {
            console.error(
              `Failed to fetch details for invoice ${invoice.id}:`,
              error
            );
            return { ...invoice, products: [] }; // Return with empty products array on error
          }
        })
      );

      // Sort invoices by salesman and then by date
      const sortedInvoices = invoicesWithProducts.sort((a: any, b: any) => {
        // First sort by salesman
        if (a.salespersonid !== b.salespersonid) {
          return a.salespersonid.localeCompare(b.salespersonid);
        }
        // Then sort by date
        return parseInt(a.createddate) - parseInt(b.createddate);
      });

      setInvoicesToPrint(sortedInvoices);

      if (action === "print") {
        setShowPrintOverlay(true);
      }

      toast.success(`Found ${sortedInvoices.length} invoices to ${action}`);
    } catch (error) {
      console.error("Error fetching invoices:", error);
      toast.error("Failed to fetch invoices");
    } finally {
      setIsGenerating(false);
    }
  };

  const handlePrintComplete = () => {
    setShowPrintOverlay(false);
    setInvoicesToPrint([]);
  };

  const buttonClasses = size === "sm" 
    ? "flex items-center px-3 h-8 text-sm font-medium text-sky-700 bg-sky-50 hover:bg-sky-100 border border-default-300 rounded-full transition-colors"
    : "flex items-center px-4 h-[42px] text-sm font-medium text-sky-700 bg-sky-50 hover:bg-sky-100 border border-default-300 rounded-full transition-colors";

  const iconSize = size === "sm" ? 16 : 18;

  return (
    <>
      <button
        ref={buttonRef}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onClick={() => setIsVisible(true)}
        className={buttonClasses}
        type="button"
      >
        <IconCalendarEvent size={iconSize} className="mr-2" />
        Daily
      </button>

      {isVisible &&
        createPortal(
          <div
            ref={tooltipRef}
            className="fixed z-[9999] bg-white border border-default-200 shadow-lg rounded-lg p-0 w-96 opacity-0 flex flex-col"
            style={{
              top: `${position.top}px`,
              left: `${position.left}px`,
              opacity: isVisible ? 1 : 0,
              transform: `translateX(-100%)`,
              maxHeight: "80vh",
            }}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
          >
            {/* Header */}
            <div
              className="flex-shrink-0 border-b border-default-200 px-4 py-3 bg-default-50 rounded-t-lg cursor-pointer"
              onClick={handleSelectAll}
            >
              <div className="flex justify-between items-center">
                <h3 className="text-base font-medium text-default-800">
                  Daily Invoice Print Selection
                </h3>
                <div className="px-2 py-0.5 bg-sky-100 text-sky-800 rounded-full text-xs font-medium">
                  {selectedCount}/{salesmenOptions.length}
                </div>
              </div>
              <div className="flex items-center mt-2 text-sm text-sky-600 hover:text-sky-800">
                <Checkbox
                  checked={allSelected}
                  onChange={handleSelectAll}
                  size={16}
                  className="mr-1.5"
                  checkedColor="text-sky-700"
                />
                {allSelected ? "Deselect All" : "Select All"}
              </div>
            </div>

            {/* Salesmen Options */}
            <div className="flex-grow overflow-y-auto py-2 max-h-80">
              <div className="px-2 space-y-1">
                {salesmenOptions.map((salesman) => (
                  <div
                    key={salesman.id}
                    className="flex items-center px-3 py-2.5 hover:bg-default-50 rounded-lg cursor-pointer transition-colors"
                    onClick={() => handleSalesmanToggle(salesman.id)}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-default-700">
                        {salesman.name}
                      </div>
                      {salesman.description && (
                        <div className="text-xs text-default-500">
                          {salesman.description}
                        </div>
                      )}
                    </div>
                    <Checkbox
                      checked={!!selectedSalesmen[salesman.id]}
                      onChange={() => handleSalesmanToggle(salesman.id)}
                      size={18}
                      className="ml-2"
                      checkedColor="text-sky-600"
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Actions */}
            <div className="flex-shrink-0 border-t border-default-200 px-4 py-3 bg-default-50 rounded-b-lg">
              <div className="text-sm text-default-600 mb-2">
                <span className="font-medium">Date Range:</span>{" "}
                {formatDateRange()}
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={() => handleGenerate("print")}
                  disabled={selectedCount === 0}
                  icon={IconPrinter}
                  iconSize={16}
                  variant="outline"
                  size="sm"
                  className="flex-1"
                >
                  Print
                </Button>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* Print Overlay */}
      {showPrintOverlay && invoicesToPrint.length > 0 && (
        <PrintPDFOverlay
          invoices={invoicesToPrint}
          customerNames={customerNames}
          onComplete={handlePrintComplete}
        />
      )}

      {/* Loading Overlay */}
      {isGenerating && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl p-6 transform scale-110">
            <div className="flex flex-col items-center gap-4">
              <LoadingSpinner size="lg" hideText />
              <div className="text-center">
                <p className="text-lg font-medium text-default-900">
                  Fetching Invoices
                </p>
                <p className="text-sm text-default-600 mt-1">
                  This may take a few moments...
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default InvoiceDailyPrintMenu;
