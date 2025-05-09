// src/utils/payroll/BatchPrintPaySlipOverlay.tsx
import React, { useEffect, useState, useRef } from "react";
import { pdf, Document } from "@react-pdf/renderer";
import PaySlipPDF from "./PaySlipPDF";
import { EmployeePayroll } from "../../types/types";
import toast from "react-hot-toast";
import LoadingSpinner from "../../components/LoadingSpinner";
import { getEmployeePayrollDetailsBatch } from "./payrollUtils";
import { useStaffsCache } from "../../utils/catalogue/useStaffsCache";
import { useJobsCache } from "../../utils/catalogue/useJobsCache";

interface BatchPrintPaySlipOverlayProps {
  payrolls: EmployeePayroll[];
  onComplete: () => void;
  companyName?: string;
}

const BatchPrintPaySlipOverlay: React.FC<BatchPrintPaySlipOverlayProps> = ({
  payrolls,
  onComplete,
  companyName = "TIEN HOCK FOOD INDUSTRIES S/B",
}) => {
  const [isPrinting, setIsPrinting] = useState(true);
  const [isGenerating, setIsGenerating] = useState(true);
  const [isLoadingDialogVisible, setIsLoadingDialogVisible] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [waitingForCache, setWaitingForCache] = useState(false);
  const hasPrintedRef = useRef(false);
  const resourcesRef = useRef<{
    printFrame: HTMLIFrameElement | null;
    pdfUrl: string | null;
  }>({
    printFrame: null,
    pdfUrl: null,
  });

  // Access the caches with their loading states
  const { staffs, loading: staffsLoading, refreshStaffs } = useStaffsCache();
  const { jobs, loading: jobsLoading, refreshJobs } = useJobsCache();

  const cleanup = (fullCleanup = false) => {
    if (fullCleanup) {
      if (resourcesRef.current.pdfUrl) {
        URL.revokeObjectURL(resourcesRef.current.pdfUrl);
      }
      if (
        resourcesRef.current.printFrame &&
        resourcesRef.current.printFrame.parentNode
      ) {
        document.body.removeChild(resourcesRef.current.printFrame);
      }
      resourcesRef.current = {
        printFrame: null,
        pdfUrl: null,
      };
      setIsPrinting(false);
      onComplete();
    }
    setIsGenerating(false);
    setIsLoadingDialogVisible(false);
  };

  useEffect(() => {
    const generateAndPrint = async () => {
      // For batch printing
      if (hasPrintedRef.current || payrolls.length === 0) return;

      // Validate payrolls
      const validPayrolls = payrolls.filter(
        (payroll) =>
          payroll && payroll.employee_id && Array.isArray(payroll.items) // Ensure items is an array
      );

      if (validPayrolls.length === 0) {
        setError("No valid payslips to print");
        toast.error("No valid payslips to print");
        cleanup(true);
        return;
      }

      try {
        // Check if caches are loading
        if (staffsLoading || jobsLoading) {
          console.log("Caches are still loading, waiting...");
          setWaitingForCache(true);

          // Wait for caches to finish loading
          for (
            let i = 0;
            i < 30 &&
            (staffsLoading ||
              jobsLoading ||
              staffs.length === 0 ||
              jobs.length === 0);
            i++
          ) {
            await new Promise((resolve) => setTimeout(resolve, 200));
          }

          setWaitingForCache(false);
        }

        console.log("Staff cache has", staffs.length, "entries");
        console.log("Jobs cache has", jobs.length, "entries");

        // Force refresh caches if they're still empty
        if (staffs.length === 0) {
          console.log("Staff cache is empty, forcing refresh...");
          try {
            await refreshStaffs();
            // Wait a moment for refresh to complete
            await new Promise((resolve) => setTimeout(resolve, 500));
          } catch (err) {
            console.error("Failed to refresh staff cache:", err);
          }
        }

        if (jobs.length === 0) {
          console.log("Jobs cache is empty, forcing refresh...");
          try {
            await refreshJobs();
            // Wait a moment for refresh to complete
            await new Promise((resolve) => setTimeout(resolve, 500));
          } catch (err) {
            console.error("Failed to refresh jobs cache:", err);
          }
        }

        // Always fetch complete payroll data
        const payrollIdsToFetch = validPayrolls
          .map((p) => p.id)
          .filter((id) => id !== undefined) as number[];

        let completePayrolls = [...validPayrolls];

        // Only fetch if there are payrolls needing complete data
        if (payrollIdsToFetch.length > 0) {
          try {
            // Use the batch function to get complete data in one API call
            const fetchedPayrolls = await getEmployeePayrollDetailsBatch(
              payrollIdsToFetch
            );
            console.log("Fetched payrolls:", fetchedPayrolls);

            // Check if we received a valid response
            if (
              fetchedPayrolls &&
              Array.isArray(fetchedPayrolls) &&
              fetchedPayrolls.length > 0
            ) {
              // Replace all payrolls with complete ones
              completePayrolls = validPayrolls.map((payroll) => {
                const completePayroll = fetchedPayrolls.find(
                  (p) => p.id === payroll.id
                );
                return completePayroll || payroll;
              });
            } else {
              console.error(
                "No valid payroll data returned from API:",
                fetchedPayrolls
              );
              // Keep using what we have
            }
          } catch (error) {
            console.error("Error fetching complete payroll data:", error);
            // Continue with what we have
          }
        }

        // Create Document with all pages
        const pdfDoc = pdf(
          <Document>
            {completePayrolls.map((payroll, index) => {
              // Get staff and job data from caches
              const employeeStaff = staffs.find(
                (staff) => staff.id === payroll.employee_id
              );
              const jobInfo = jobs.find((job) => job.id === payroll.job_type);

              console.log(
                `Payroll ${index + 1}:`,
                payroll.employee_id,
                payroll.job_type
              );
              console.log(`Staff info:`, employeeStaff || "Not found");
              console.log(`Job info:`, jobInfo || "Not found");

              const staffDetails = {
                name: employeeStaff?.name || payroll.employee_name || "",
                icNo: employeeStaff?.icNo || "",
                jobName: jobInfo?.name || payroll.job_type || "",
                section: payroll.section || "",
              };

              console.log(
                `Staff details for ${payroll.employee_id}:`,
                staffDetails
              );

              return (
                <PaySlipPDF
                  key={index}
                  payroll={payroll}
                  companyName={companyName}
                  staffDetails={staffDetails}
                />
              );
            })}
          </Document>
        );

        const pdfBlob = await pdfDoc.toBlob();
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
            // Use a slight delay to ensure content is fully loaded
            setTimeout(() => {
              printFrame.contentWindow?.print();
              cleanup(); // Hide loading dialog only
            }, 500);

            const onFocus = () => {
              window.removeEventListener("focus", onFocus);
              cleanup(true); // Full cleanup
            };
            window.addEventListener("focus", onFocus);

            const fallbackTimeout = setTimeout(() => {
              window.removeEventListener("focus", onFocus);
              cleanup(true); // Full cleanup after 60 seconds
            }, 60000);
          }
        };

        printFrame.src = pdfUrl;
      } catch (error) {
        console.error("Error generating PDF for printing:", error);
        setError(error instanceof Error ? error.message : "Unknown error");
        toast.error("Error preparing documents for print. Please try again.");
        cleanup(true);
      }
    };

    if (isPrinting) {
      generateAndPrint();
    }

    return () => {
      if (resourcesRef.current.printFrame || resourcesRef.current.pdfUrl) {
        cleanup(true);
      }
    };
  }, [
    payrolls,
    isPrinting,
    onComplete,
    companyName,
    staffs,
    jobs,
    staffsLoading,
    jobsLoading,
    refreshStaffs,
    refreshJobs,
  ]);

  return isLoadingDialogVisible ? (
    <div className="fixed inset-0 flex items-center justify-center z-50">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div className="relative bg-white rounded-xl shadow-2xl p-6 min-w-[300px] transform scale-110">
        <div className="flex flex-col items-center gap-3">
          <LoadingSpinner size="sm" hideText />
          <p className="text-base font-medium text-default-900">
            {isGenerating
              ? waitingForCache
                ? "Loading employee data..."
                : `Preparing ${payrolls.length} pay slip${
                    payrolls.length > 1 ? "s" : ""
                  } for printing...`
              : "Opening print dialog..."}
          </p>
          <p className="text-sm text-default-500">Please wait a moment</p>
          {error && (
            <p className="text-sm text-rose-600 mt-2 text-center">{error}</p>
          )}
          <button
            onClick={() => {
              cleanup(true);
            }}
            className="mt-2 text-sm text-center text-sky-600 hover:underline"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  ) : null;
};

export default BatchPrintPaySlipOverlay;
