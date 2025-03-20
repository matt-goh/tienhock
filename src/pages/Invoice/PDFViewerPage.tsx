import React, { useState, useEffect } from "react";
import { InvoiceData } from "../../types/types";
import InvoicePDF from "../../utils/invoice/PDF/InvoicePDF";
import { PDFViewer, Document } from "@react-pdf/renderer";
import { generatePDFFilename } from "../../utils/invoice/PDF/generatePDFFilename";
import { api } from "../../routes/utils/api";

const PDFViewerPage: React.FC = () => {
  const [invoices, setInvoices] = useState<InvoiceData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [customerNames, setCustomerNames] = useState<Record<string, string>>(
    {}
  );

  useEffect(() => {
    try {
      // Try to get the data from sessionStorage
      const storedData = sessionStorage.getItem("PDF_DATA");
      if (storedData) {
        const parsedData = JSON.parse(storedData);
        if (Array.isArray(parsedData)) {
          setInvoices(parsedData);
          setIsLoading(false);
          return;
        }
      }

      // If no data in sessionStorage, show error
      setIsLoading(false);
      console.error("No invoice data found");
    } catch (error) {
      console.error("Error loading PDF data:", error);
      setIsLoading(false);
    }
  }, []);

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

  if (isLoading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center">
        <div className="text-lg">Loading PDF viewer...</div>
      </div>
    );
  }

  if (invoices.length === 0) {
    return (
      <div className="flex h-screen w-screen items-center justify-center">
        <div className="text-lg">No invoice data found</div>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen">
      <PDFViewer style={{ width: "100%", height: "100%" }}>
        <Document title={generatePDFFilename(invoices).replace(".pdf", "")}>
          <InvoicePDF invoices={invoices} customerNames={customerNames} />
        </Document>
      </PDFViewer>
    </div>
  );
};

export default PDFViewerPage;
