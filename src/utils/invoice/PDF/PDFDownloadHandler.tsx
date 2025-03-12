import React, { useState, useEffect } from "react";
import { pdf, Document } from "@react-pdf/renderer";
import { InvoiceData } from "../../../types/types";
import { IconDownload, IconFileDownload } from "@tabler/icons-react";
import Button from "../../../components/Button";
import InvoicePDF from "./InvoicePDF";
import toast from "react-hot-toast";
import { generatePDFFilename } from "./generatePDFFilename";
import { api } from "../../../routes/utils/api";

interface PDFDownloadHandlerProps {
  invoices: InvoiceData[];
  disabled?: boolean;
}

const PDFDownloadHandler: React.FC<PDFDownloadHandlerProps> = ({
  invoices,
  disabled,
}) => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [customerNames, setCustomerNames] = useState<Record<string, string>>(
    {}
  );

  useEffect(() => {
    const fetchCustomerNames = async () => {
      const uniqueCustomerIds = Array.from(
        new Set(invoices.map((invoice) => invoice.customerid))
      );

      const missingCustomerIds = uniqueCustomerIds.filter(
        (id) => !(id in customerNames)
      );

      if (missingCustomerIds.length === 0) return;

      try {
        // First check local cache
        const CACHE_KEY = "customers_cache";
        const cachedData = localStorage.getItem(CACHE_KEY);
        let customersFromCache: Record<string, string> = {};
        let idsToFetch: string[] = [...missingCustomerIds];

        if (cachedData) {
          const { data } = JSON.parse(cachedData);
          if (Array.isArray(data)) {
            // Create map from cached data
            customersFromCache = data.reduce((map, customer) => {
              if (missingCustomerIds.includes(customer.id)) {
                map[customer.id] = customer.name;
                // Remove from idsToFetch since we got it from cache
                idsToFetch = idsToFetch.filter((id) => id !== customer.id);
              }
              return map;
            }, {} as Record<string, string>);
          }
        }

        // If we still have IDs to fetch, make API call
        let customersFromApi: Record<string, string> = {};
        if (idsToFetch.length > 0) {
          customersFromApi = await api.post("/api/customers/names", {
            customerIds: idsToFetch,
          });
        }

        // Combine results from cache and API
        setCustomerNames((prev) => ({
          ...prev,
          ...customersFromCache,
          ...customersFromApi,
        }));
      } catch (error) {
        console.error("Error fetching customer names:", error);
        const fallbackNames = missingCustomerIds.reduce<Record<string, string>>(
          (map, id) => {
            map[id] = id;
            return map;
          },
          {}
        );
        setCustomerNames((prev) => ({
          ...prev,
          ...fallbackNames,
        }));
      }
    };

    fetchCustomerNames();
  }, [invoices, customerNames]);

  const handleDownload = async () => {
    if (isGenerating) return;

    setIsGenerating(true);
    const toastId = toast.loading("Generating PDF...");

    try {
      // First render the PDF component
      const pdfComponent = (
        <Document title={generatePDFFilename(invoices).replace(".pdf", "")}>
          <InvoicePDF
            invoices={invoices}
            customerNames={customerNames}
          />
        </Document>
      );

      // Generate PDF blob
      const pdfBlob = await pdf(pdfComponent).toBlob();
      const pdfUrl = URL.createObjectURL(pdfBlob);

      // Create and trigger download
      const link = document.createElement("a");
      link.href = pdfUrl;
      link.download = generatePDFFilename(invoices);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      // Cleanup
      URL.revokeObjectURL(pdfUrl);
      toast.success("PDF downloaded successfully", { id: toastId });
    } catch (error) {
      console.error("Error generating PDF:", error);
      toast.error(
        `Failed to generate PDF: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
        { id: toastId }
      );
    } finally {
      setIsGenerating(false);
    }
  };

  if (!invoices || invoices.length === 0) {
    return null;
  }

  return (
    <Button
      onClick={handleDownload}
      disabled={disabled || isGenerating}
      icon={isGenerating ? IconFileDownload : IconDownload}
      iconSize={16}
      iconStroke={2}
      variant="outline"
    >
      {isGenerating ? "Generating..." : "Download"}
    </Button>
  );
};

export default PDFDownloadHandler;
