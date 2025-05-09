// src/utils/payroll/PrintPaySlipOverlay.tsx
import { useEffect, useState, useRef } from "react";
import { pdf, Document } from "@react-pdf/renderer";
import PaySlipPDF from "./PaySlipPDF";
import { EmployeePayroll } from "../../types/types";
import toast from "react-hot-toast";
import LoadingSpinner from "../../components/LoadingSpinner";
import { useStaffsCache } from "../../utils/catalogue/useStaffsCache";
import { useJobsCache } from "../../utils/catalogue/useJobsCache";
import { getEmployeePayrollDetails } from "./payrollUtils";

interface PrintPaySlipOverlayProps {
  payroll: EmployeePayroll;
  onComplete: () => void;
  companyName?: string;
}

const PrintPaySlipOverlay = ({
  payroll,
  onComplete,
  companyName = "TIEN HOCK FOOD INDUSTRIES S/B",
}: PrintPaySlipOverlayProps) => {
  const [isPrinting, setIsPrinting] = useState(true);
  const [isGenerating, setIsGenerating] = useState(true);
  const [isLoadingDialogVisible, setIsLoadingDialogVisible] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [waitingForCache, setWaitingForCache] = useState(false);
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
      onComplete();
    }
    setIsGenerating(false);
    setIsLoadingDialogVisible(false);
  };

  useEffect(() => {
    const generateAndPrint = async () => {
      if (hasPrintedRef.current) return;

      try {
        const container = document.createElement("div");
        container.style.position = "absolute";
        container.style.left = "-9999px";
        document.body.appendChild(container);
        resourcesRef.current.container = container;

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

        console.log("Staff cache data:", staffs.length, "entries");
        console.log("Jobs cache data:", jobs.length, "entries");
        console.log("Payroll data:", payroll);

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

        // Fetch detailed payroll data if we have an ID
        let completePayroll = payroll;
        if (payroll.id) {
          try {
            completePayroll = await getEmployeePayrollDetails(payroll.id);
            console.log("Fetched complete payroll:", completePayroll);
          } catch (error) {
            console.error("Error fetching complete payroll data:", error);
            // Continue with what we have
          }
        }

        // Find staff details
        const employeeId = completePayroll.employee_id || payroll.employee_id;
        const jobTypeId = completePayroll.job_type || payroll.job_type;

        console.log("Looking for employee with ID:", employeeId);
        console.log("Looking for job with ID:", jobTypeId);

        // Try from cache (now should be loaded)
        const employeeStaff = staffs.find((staff) => staff.id === employeeId);
        const jobInfo = jobs.find((job) => job.id === jobTypeId);

        if (!employeeStaff) {
          console.warn(`No staff found with ID: ${employeeId}`);
        }

        if (!jobInfo) {
          console.warn(`No job found with ID: ${jobTypeId}`);
        }

        const staffDetails = {
          name:
            employeeStaff?.name ||
            completePayroll.employee_name ||
            payroll.employee_name ||
            "",
          icNo: employeeStaff?.icNo || "",
          jobName: jobInfo?.name || jobTypeId || "",
          section: completePayroll.section || payroll.section || "",
        };

        console.log("Staff details being used:", staffDetails);

        const pdfComponent = (
          <Document>
            <PaySlipPDF
              payroll={completePayroll}
              companyName={companyName}
              staffDetails={staffDetails}
            />
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
            // Use a slight delay to ensure content is fully loaded
            setTimeout(() => {
              printFrame.contentWindow?.print();
              cleanup(); // Hide loading dialog only
            }, 500);

            const onFocus = () => {
              window.removeEventListener("focus", onFocus);
              clearTimeout(fallbackTimeout);
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
        console.error("Error generating PDF:", error);
        setError(error instanceof Error ? error.message : "Unknown error");
        toast.error("Error preparing document for print. Please try again.");
        cleanup(true);
      }
    };

    if (isPrinting) {
      generateAndPrint();
    }

    return () => {
      if (
        resourcesRef.current.printFrame ||
        resourcesRef.current.container ||
        resourcesRef.current.pdfUrl
      ) {
        cleanup(true);
      }
    };
  }, [
    payroll,
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
                : "Preparing pay slip for printing..."
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

export default PrintPaySlipOverlay;
