import { useEffect, useState, useRef } from "react";
import { pdf, Document } from "@react-pdf/renderer";
import InvoicePDF from "./InvoicePDF";
import { InvoiceData } from "../../../types/types";
import toast from "react-hot-toast";
import { generatePDFFilename } from "./generatePDFFilename";
import LoadingSpinner from "../../../components/LoadingSpinner";
import { api } from "../../../routes/utils/api";

const PrintPDFOverlay = ({
  invoices,
  onComplete,
}: {
  invoices: InvoiceData[];
  onComplete: () => void;
}) => {
  const [isPrinting, setIsPrinting] = useState(true);
  const [isGenerating, setIsGenerating] = useState(true);
  const hasPrintedRef = useRef(false);
  const resourcesRef = useRef<{
    printFrame: HTMLIFrameElement | null;
    container: HTMLDivElement | null;
    pdfUrl: string | null;
  }>({
    printFrame: null,
    container: null,
    pdfUrl: null,
  });
  const [customerNames, setCustomerNames] = useState<Record<string, string>>(
    {}
  );

  useEffect(() => {
    const cleanup = () => {
      if (resourcesRef.current.pdfUrl) {
        URL.revokeObjectURL(resourcesRef.current.pdfUrl);
      }
      if (
        resourcesRef.current.printFrame &&
        resourcesRef.current.printFrame.parentNode
      ) {
        document.body.removeChild(resourcesRef.current.printFrame);
      }
      if (
        resourcesRef.current.container &&
        resourcesRef.current.container.parentNode
      ) {
        document.body.removeChild(resourcesRef.current.container);
      }
      resourcesRef.current = {
        printFrame: null,
        container: null,
        pdfUrl: null,
      };
      setIsPrinting(false);
      setIsGenerating(false);
      onComplete();
    };

    const generateAndPrint = async () => {
      if (hasPrintedRef.current) return;

      try {
        const container = document.createElement("div");
        container.style.position = "absolute";
        container.style.left = "-9999px";
        document.body.appendChild(container);
        resourcesRef.current.container = container;

        const pdfComponent = (
          <Document title={generatePDFFilename(invoices).replace(".pdf", "")}>
            <InvoicePDF invoices={invoices} customerNames={customerNames} />
          </Document>
        );

        const pdfBlob = await pdf(pdfComponent).toBlob();
        const pdfUrl = URL.createObjectURL(pdfBlob);
        resourcesRef.current.pdfUrl = pdfUrl;
        setIsGenerating(false);

        const printFrame = document.createElement("iframe");
        printFrame.style.display = "none";
        document.body.appendChild(printFrame);
        resourcesRef.current.printFrame = printFrame;

        printFrame.onload = () => {
          if (!hasPrintedRef.current && printFrame?.contentWindow) {
            hasPrintedRef.current = true;
            printFrame.contentWindow.print();
            setTimeout(() => {
              cleanup();
            }, 100);
          }
        };

        printFrame.src = pdfUrl;
      } catch (error) {
        console.error("Error generating PDF:", error);
        toast.error("Error preparing document for print. Please try again.");
        cleanup();
      }
    };

    if (isPrinting) {
      generateAndPrint();
    }

    return cleanup;
  }, [invoices, isPrinting, onComplete]);

  // Customer names fetching logic remains unchanged
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
        const CACHE_KEY = "customers_cache";
        const cachedData = localStorage.getItem(CACHE_KEY);
        let customersFromCache: Record<string, string> = {};
        let idsToFetch: string[] = [...missingCustomerIds];

        if (cachedData) {
          const { data } = JSON.parse(cachedData);
          if (Array.isArray(data)) {
            customersFromCache = data.reduce((map, customer) => {
              if (missingCustomerIds.includes(customer.id)) {
                map[customer.id] = customer.name;
                idsToFetch = idsToFetch.filter((id) => id !== customer.id);
              }
              return map;
            }, {} as Record<string, string>);
          }
        }

        let customersFromApi: Record<string, string> = {};
        if (idsToFetch.length > 0) {
          customersFromApi = await api.post("/api/customers/names", {
            customerIds: idsToFetch,
          });
        }

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
        setCustomerNames((prev) => ({ ...prev, ...fallbackNames }));
      }
    };

    fetchCustomerNames();
  }, [invoices, customerNames]);

  return isPrinting ? (
    <div className="fixed inset-0 flex items-center justify-center z-50">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div className="relative bg-white rounded-xl shadow-2xl p-6 min-w-[300px] transform scale-110">
        <div className="flex flex-col items-center gap-3">
          <LoadingSpinner size="sm" hideText />
          <p className="text-base font-medium text-default-900">
            {isGenerating
              ? "Preparing document for printing..."
              : "Opening print dialog..."}
          </p>
          <p className="text-sm text-default-500">Please wait a moment</p>
        </div>
      </div>
    </div>
  ) : null;
};

export default PrintPDFOverlay;
