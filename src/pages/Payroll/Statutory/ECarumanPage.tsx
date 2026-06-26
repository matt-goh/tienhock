// src/pages/Payroll/ECarumanPage.tsx
import { useState, useEffect, useRef, useMemo } from "react";
import { Link } from "react-router-dom";
import {
  IconFileDownload,
  IconBuildingBank,
  IconShieldCheck,
  IconReceipt,
  IconLoader2,
  IconAlertTriangle,
  IconExternalLink,
} from "@tabler/icons-react";
import toast from "react-hot-toast";
import TimeNavigator from "../../../components/TimeNavigator";
import { api } from "../../../routes/utils/api";
import MissingEPFNumberDialog, {
  MissingEPFEmployee,
} from "../../../components/Payroll/MissingEPFNumberDialog";

// File System Access API types
interface FileSystemWritableFileStream extends WritableStream {
  write(data: string | BufferSource | Blob): Promise<void>;
  close(): Promise<void>;
}

interface FileSystemFileHandle {
  createWritable(): Promise<FileSystemWritableFileStream>;
}

interface FileSystemDirectoryHandle {
  getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<FileSystemDirectoryHandle>;
  getFileHandle(name: string, options?: { create?: boolean }): Promise<FileSystemFileHandle>;
}

declare global {
  interface Window {
    showDirectoryPicker?: () => Promise<FileSystemDirectoryHandle>;
  }
}

interface EPFPreviewData {
  count: number;
  data: {
    employee_id: number;
    member_no: string;
    ic_no: string;
    name: string;
    salary: number;
    em_share: number;
    emp_share: number;
  }[];
  totals: {
    salary: number;
    em_share: number;
    emp_share: number;
    total_contribution: number;
  };
}

interface SOCSOPreviewData {
  count: number;
  data: {
    employee_id: number;
    ic_no: string;
    name: string;
    salary: number;
    socso_employer: number;
    socso_employee: number;
    keilatan_amount: number;
    skbbk_amount: number;
    eis_employer: number;
    eis_employee: number;
  }[];
  totals: {
    salary: number;
    socso_employer: number;
    socso_employee: number;
    socso_total: number;
    keilatan_amount: number;
    skbbk_amount: number;
    eis_employer: number;
    eis_employee: number;
    eis_total: number;
    total_contribution: number;
  };
}

interface SIPPreviewData {
  count: number;
  data: {
    employee_id: number;
    ic_no: string;
    name: string;
    date_joined: string | null;
    eis_employer: number;
    eis_employee: number;
    sip_total: number;
  }[];
  totals: {
    eis_employer: number;
    eis_employee: number;
    sip_total: number;
  };
}

interface IncomeTaxPreviewData {
  count: number;
  data: {
    employee_id: number;
    ic_no: string;
    income_tax_no: string;
    nationality: string;
    name: string;
    pcb_amount: number;
  }[];
  totals: {
    pcb_amount: number;
  };
}

interface MissingEPFNoData {
  count: number;
  data: MissingEPFEmployee[];
}

interface PreviewState {
  epf: EPFPreviewData | null;
  socso: SOCSOPreviewData | null;
  sip: SIPPreviewData | null;
  income_tax: IncomeTaxPreviewData | null;
  missing_epf_no: MissingEPFNoData | null;
}

// SOCSO/SIP Employer Code - This should match your company's PERKESO registration
const SOCSO_EMPLOYER_CODE = "F9600025897Z";
// Company SSM/MyCoID number for SIP export
const SIP_MYCOID = "953309-T";
// LHDN E Number for Income Tax/PCB export (from sample: 9112779708)
const LHDN_E_NUMBER = "9112779708";

// Format IC number as ######-##-####
const formatIC = (ic: string): string => {
  if (!ic) return "";
  const digits = ic.replace(/\D/g, "");
  if (digits.length !== 12) return ic;
  return `${digits.slice(0, 6)}-${digits.slice(6, 8)}-${digits.slice(8, 12)}`;
};

const ECarumanPage: React.FC = () => {
  // Use Date object for month navigation
  const [selectedDate, setSelectedDate] = useState<Date>(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  // Derived values for API calls
  const selectedMonth: number = selectedDate.getMonth() + 1;
  const selectedYear: number = selectedDate.getFullYear();

  const monthRange = useMemo(
    () => ({
      start: new Date(selectedYear, selectedMonth - 1, 1),
      end: new Date(selectedYear, selectedMonth, 0, 23, 59, 59, 999),
    }),
    [selectedMonth, selectedYear]
  );

  const handleTimeNavigatorChange = (range: { start: Date; end: Date }): void => {
    setSelectedDate(new Date(range.start.getFullYear(), range.start.getMonth(), 1));
  };

  const [loadingType, setLoadingType] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [preview, setPreview] = useState<PreviewState>({
    epf: null,
    socso: null,
    sip: null,
    income_tax: null,
    missing_epf_no: null,
  });
  const [showMissingEPFDialog, setShowMissingEPFDialog] = useState(false);
  const [hoveredCard, setHoveredCard] = useState<string | null>(null);
  const isTooltipHovered = useRef(false);
  const isCardHovered = useRef(false);
  const hoverTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clear timeout helper
  const clearHoverTimeout = () => {
    if (hoverTimeout.current) {
      clearTimeout(hoverTimeout.current);
      hoverTimeout.current = null;
    }
  };

  // Card hover handlers
  const handleCardMouseEnter = (cardId: string) => {
    clearHoverTimeout();
    isCardHovered.current = true;
    setHoveredCard(cardId);
  };

  const handleCardMouseLeave = () => {
    isCardHovered.current = false;
    hoverTimeout.current = setTimeout(() => {
      if (!isTooltipHovered.current) {
        setHoveredCard(null);
      }
    }, 150);
  };

  // Tooltip hover handlers
  const handleTooltipMouseEnter = () => {
    clearHoverTimeout();
    isTooltipHovered.current = true;
  };

  const handleTooltipMouseLeave = () => {
    isTooltipHovered.current = false;
    hoverTimeout.current = setTimeout(() => {
      if (!isCardHovered.current) {
        setHoveredCard(null);
      }
    }, 150);
  };

  // Fetch preview data when page loads or period changes
  useEffect(() => {
    const fetchPreviewData = async () => {
      setPreviewLoading(true);
      try {
        // Fetch all contribution previews in a single API call
        const previewData = await api.get(
          `/api/e-caruman/preview?month=${selectedMonth}&year=${selectedYear}`
        );

        setPreview({
          epf: previewData.epf,
          socso: previewData.socso,
          sip: previewData.sip,
          income_tax: previewData.income_tax,
          missing_epf_no: previewData.missing_epf_no,
        });
      } catch (error) {
        console.error("Error fetching preview data:", error);
        setPreview({ epf: null, socso: null, sip: null, income_tax: null, missing_epf_no: null });
      } finally {
        setPreviewLoading(false);
      }
    };

    fetchPreviewData();
  }, [selectedDate]);

  // Helper function to create nested directories
  const createNestedDirectory = async (
    baseDir: FileSystemDirectoryHandle,
    pathParts: string[]
  ): Promise<FileSystemDirectoryHandle> => {
    let currentDir = baseDir;
    for (const part of pathParts) {
      currentDir = await currentDir.getDirectoryHandle(part, { create: true });
    }
    return currentDir;
  };

  // Helper function to write file to directory
  const writeFileToDirectory = async (
    dir: FileSystemDirectoryHandle,
    filename: string,
    content: string
  ): Promise<void> => {
    const fileHandle = await dir.getFileHandle(filename, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(content);
    await writable.close();
  };

  const handleDownload = async (type: "epf" | "socso" | "sip" | "income_tax") => {
    if (loadingType) return; // Prevent multiple downloads

    setLoadingType(type);

    try {
      switch (type) {
        case "epf": {
          // Show warning dialog if there are employees with missing EPF numbers
          if (preview.missing_epf_no && preview.missing_epf_no.count > 0) {
            setShowMissingEPFDialog(true);
          }

          // Check if File System Access API is supported
          if (!window.showDirectoryPicker) {
            toast.error("Your browser does not support folder creation. Please use Chrome or Edge.");
            break;
          }

          // Get export data from backend
          const exportData = await api.get(
            `/api/e-caruman/epf/export?month=${selectedMonth}&year=${selectedYear}&company=TH`
          );

          if (!exportData.files || exportData.files.length === 0) {
            toast.error("No EPF contribution data found for the specified period");
            break;
          }

          // Prompt user to select download folder
          let baseDir: FileSystemDirectoryHandle;
          try {
            baseDir = await window.showDirectoryPicker();
          } catch (err) {
            // User cancelled the picker
            if ((err as Error).name === "AbortError") {
              break;
            }
            throw err;
          }

          // Create folder structure and write files
          let createdCount = 0;
          for (const file of exportData.files) {
            const pathParts = file.path.split("/");
            const targetDir = await createNestedDirectory(baseDir, pathParts);
            await writeFileToDirectory(targetDir, file.filename, file.content);
            createdCount++;
          }

          toast.success(
            `EPF files created successfully (${createdCount} file${createdCount > 1 ? "s" : ""}) in EPF/${exportData.year}/TH/${exportData.month}/`
          );
          break;
        }
        case "socso":
        case "sip": {
          // SOCSO and SIP cards both trigger the same combined PERKESO file
          // (SOCSO + EIS + SKBBK) — the 2026 gazette replaced the separate
          // BRG8A.TXT and SIP*.TXT/SIPE*.TXT submissions with one file.
          if (!window.showDirectoryPicker) {
            toast.error("Your browser does not support folder creation. Please use Chrome or Edge.");
            break;
          }

          const combinedExportData = await api.get(
            `/api/e-caruman/socso-sip/export?month=${selectedMonth}&year=${selectedYear}&company=TH&employerCode=${SOCSO_EMPLOYER_CODE}&myCoId=${SIP_MYCOID}`
          );

          if (!combinedExportData.files || combinedExportData.files.length === 0) {
            toast.error("No SOCSO/EIS contribution data found for the specified period");
            break;
          }

          let combinedBaseDir: FileSystemDirectoryHandle;
          try {
            combinedBaseDir = await window.showDirectoryPicker();
          } catch (err) {
            if ((err as Error).name === "AbortError") {
              break;
            }
            throw err;
          }

          for (const file of combinedExportData.files) {
            const pathParts = file.path.split("/");
            const targetDir = await createNestedDirectory(combinedBaseDir, pathParts);
            await writeFileToDirectory(targetDir, file.filename, file.content);
          }

          toast.success(
            `Combined SOCSO-SIP file created in SOCSO-SIP/${combinedExportData.year}/TH/${combinedExportData.month}/`
          );
          break;
        }
        case "income_tax": {
          // Check if File System Access API is supported
          if (!window.showDirectoryPicker) {
            toast.error("Your browser does not support folder creation. Please use Chrome or Edge.");
            break;
          }

          // Get export data from backend
          const incomeTaxExportData = await api.get(
            `/api/e-caruman/income-tax/export?month=${selectedMonth}&year=${selectedYear}&company=TH&eNumber=${LHDN_E_NUMBER}`
          );

          if (!incomeTaxExportData.files || incomeTaxExportData.files.length === 0) {
            toast.error("No Income Tax/PCB contribution data found for the specified period");
            break;
          }

          // Prompt user to select download folder
          let incomeTaxBaseDir: FileSystemDirectoryHandle;
          try {
            incomeTaxBaseDir = await window.showDirectoryPicker();
          } catch (err) {
            // User cancelled the picker
            if ((err as Error).name === "AbortError") {
              break;
            }
            throw err;
          }

          // Create folder structure and write files
          for (const file of incomeTaxExportData.files) {
            const pathParts = file.path.split("/");
            const targetDir = await createNestedDirectory(incomeTaxBaseDir, pathParts);
            await writeFileToDirectory(targetDir, file.filename, file.content);
          }

          toast.success(
            `Income Tax file created successfully in PCB/${incomeTaxExportData.year}/TH/${incomeTaxExportData.month}/`
          );
          break;
        }
      }
    } catch (error) {
      console.error(`Error downloading ${type} file:`, error);
      toast.error(error instanceof Error ? error.message : "Failed to download file");
    } finally {
      setLoadingType(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="mb-4 flex items-center gap-4">
        <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">e-Caruman</h1>
        <span className="text-gray-300 dark:text-gray-600">|</span>
        <TimeNavigator
          range={monthRange}
          onChange={handleTimeNavigatorChange}
          modes={["month"]}
          presets={false}
          size="sm"
        />
        <span className="text-gray-300 dark:text-gray-600 ml-auto">|</span>
        <Link
          to="/catalogue/contribution-rates"
          className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors whitespace-nowrap"
        >
          <IconExternalLink size={14} />
          Contribution Rates
        </Link>
      </div>

      {/* Download Contribution Files Section */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
        <h2 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-1">
          Download Contribution Files
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          Select the contribution type to generate and download the file for{" "}
          <span className="font-medium text-gray-700 dark:text-gray-200">
            {selectedDate.toLocaleDateString("en-MY", { month: "long", year: "numeric" })}
          </span>
        </p>
        {previewLoading ? (
          <div className="flex items-center justify-center py-8">
            <IconLoader2 size={24} className="animate-spin text-gray-400" />
            <span className="ml-2 text-gray-500 dark:text-gray-400">Loading preview data...</span>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* EPF Preview Card */}
            <div
              className={`relative border border-gray-200 dark:border-gray-700 rounded-lg p-4 cursor-pointer transition-all hover:shadow-md hover:border-blue-300 dark:hover:border-blue-400 dark:bg-gray-800 ${loadingType === "epf" ? "opacity-70" : ""}`}
              onMouseEnter={() => handleCardMouseEnter("epf")}
              onMouseLeave={handleCardMouseLeave}
              onClick={() => handleDownload("epf")}
            >
              <div className="flex items-center gap-2 mb-3">
                <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                  <IconBuildingBank size={20} className="text-blue-600 dark:text-blue-400" />
                </div>
                <h3 className="font-medium text-gray-900 dark:text-gray-100">EPF / KWSP</h3>
                {preview.missing_epf_no && preview.missing_epf_no.count > 0 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowMissingEPFDialog(true);
                    }}
                    className="flex items-center gap-1 px-2 py-0.5 bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300 rounded-full text-xs font-medium hover:bg-amber-200 dark:hover:bg-amber-900/70 transition-colors"
                    title="Click to view employees with missing EPF numbers"
                  >
                    <IconAlertTriangle size={14} />
                    {preview.missing_epf_no.count}
                  </button>
                )}
                <div className="ml-auto">
                  {loadingType === "epf" ? (
                    <IconLoader2 size={20} className="animate-spin text-blue-600 dark:text-blue-400" />
                  ) : (
                    <IconFileDownload size={20} className="text-gray-400 dark:text-gray-500" />
                  )}
                </div>
              </div>
              {preview.epf ? (
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-500 dark:text-gray-400">Employees:</span>
                    <span className="font-medium text-gray-900 dark:text-gray-100">{preview.epf.count}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500 dark:text-gray-400">Total Salary:</span>
                    <span className="font-medium text-gray-900 dark:text-gray-100">
                      RM {preview.epf.totals.salary.toLocaleString("en-MY", { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500 dark:text-gray-400">Employer Share:</span>
                    <span className="font-medium text-gray-900 dark:text-gray-100">
                      RM {preview.epf.totals.em_share.toLocaleString("en-MY")}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500 dark:text-gray-400">Employee Share:</span>
                    <span className="font-medium text-gray-900 dark:text-gray-100">
                      RM {preview.epf.totals.emp_share.toLocaleString("en-MY")}
                    </span>
                  </div>
                  <div className="flex justify-between pt-2 border-t border-gray-100 dark:border-gray-700">
                    <span className="text-gray-700 dark:text-gray-200 font-medium">Total:</span>
                    <span className="font-semibold text-blue-600 dark:text-blue-400">
                      RM {preview.epf.totals.total_contribution.toLocaleString("en-MY")}
                    </span>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-gray-400 italic">No data available</p>
              )}

              {/* EPF Detailed Tooltip */}
              {hoveredCard === "epf" && preview.epf && preview.epf.data.length > 0 && (
                <div
                  className="absolute left-0 top-full mt-2 z-[60] bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl p-4 min-w-[720px]"
                  onMouseEnter={handleTooltipMouseEnter}
                  onMouseLeave={handleTooltipMouseLeave}
                >
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="font-medium text-gray-900 dark:text-gray-100">EPF File Preview (EPFORMA2.csv)</h4>
                    <span className="text-xs text-gray-500 dark:text-gray-400">{preview.epf.count} records</span>
                  </div>
                  <div className="max-h-64 overflow-auto border border-gray-100 dark:border-gray-700 rounded">
                    <table className="w-full text-xs">
                      <thead className="bg-gray-50 dark:bg-gray-900 sticky top-0 z-10">
                        <tr>
                          <th className="px-2 py-1.5 text-left font-medium text-gray-600 dark:text-gray-300 border-b dark:border-gray-700">Member No</th>
                          <th className="px-2 py-1.5 text-left font-medium text-gray-600 dark:text-gray-300 border-b dark:border-gray-700">IC No</th>
                          <th className="px-2 py-1.5 text-left font-medium text-gray-600 dark:text-gray-300 border-b dark:border-gray-700">Name</th>
                          <th className="px-2 py-1.5 text-right font-medium text-gray-600 dark:text-gray-300 border-b dark:border-gray-700">Salary</th>
                          <th className="px-2 py-1.5 text-right font-medium text-gray-600 dark:text-gray-300 border-b dark:border-gray-700">Employer</th>
                          <th className="px-2 py-1.5 text-right font-medium text-gray-600 dark:text-gray-300 border-b dark:border-gray-700">Employee</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                        {preview.epf.data.map((row, index) => (
                          <tr key={index} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                            <td className="px-2 py-1.5 text-gray-700 dark:text-gray-200 font-mono">{row.member_no}</td>
                            <td className="px-2 py-1.5 text-gray-700 dark:text-gray-200 font-mono">{formatIC(row.ic_no)}</td>
                            <td className="px-2 py-1.5 text-gray-900 dark:text-gray-100">{row.name}</td>
                            <td className="px-2 py-1.5 text-right text-gray-700 dark:text-gray-200 font-mono">
                              {row.salary.toFixed(2)}
                            </td>
                            <td className="px-2 py-1.5 text-right text-gray-700 dark:text-gray-200 font-mono">
                              {Math.round(row.em_share)}
                            </td>
                            <td className="px-2 py-1.5 text-right text-gray-700 dark:text-gray-200 font-mono">
                              {Math.round(row.emp_share)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="bg-blue-50 dark:bg-gray-900 sticky bottom-0 z-10">
                        <tr className="font-medium">
                          <td colSpan={3} className="px-2 py-1.5 text-gray-700 dark:text-gray-200 border-t border-gray-200 dark:border-gray-700">Total</td>
                          <td className="px-2 py-1.5 text-right text-gray-700 dark:text-gray-200 font-mono border-t border-gray-200 dark:border-gray-700">
                            {preview.epf.totals.salary.toFixed(2)}
                          </td>
                          <td className="px-2 py-1.5 text-right text-blue-600 dark:text-blue-400 font-mono border-t border-gray-200 dark:border-gray-700">
                            {preview.epf.totals.em_share}
                          </td>
                          <td className="px-2 py-1.5 text-right text-blue-600 dark:text-blue-400 font-mono border-t border-gray-200 dark:border-gray-700">
                            {preview.epf.totals.emp_share}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              )}
            </div>

            {/* SOCSO/SIP Preview Card */}
            <div
              className={`relative md:col-span-2 border border-gray-200 dark:border-gray-700 rounded-lg p-4 cursor-pointer transition-all hover:shadow-md hover:border-green-300 dark:hover:border-green-400 dark:bg-gray-800 ${loadingType === "socso" ? "opacity-70" : ""}`}
              onMouseEnter={() => handleCardMouseEnter("socso")}
              onMouseLeave={handleCardMouseLeave}
              onClick={() => handleDownload("socso")}
            >
              <div className="flex items-center gap-2 mb-3">
                <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
                  <IconShieldCheck size={20} className="text-green-600 dark:text-green-400" />
                </div>
                <h3 className="font-medium text-gray-900 dark:text-gray-100">SOCSO & SIP / EIS</h3>
                <span
                  className="px-1.5 py-0.5 rounded-full bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 text-[10px] font-medium uppercase tracking-wide"
                  title="Downloads the combined SOCSO + EIS + SKBBK file"
                >
                  Combined file
                </span>
                <div className="ml-auto">
                  {loadingType === "socso" ? (
                    <IconLoader2 size={20} className="animate-spin text-green-600 dark:text-green-400" />
                  ) : (
                    <IconFileDownload size={20} className="text-gray-400 dark:text-gray-500" />
                  )}
                </div>
              </div>
              {preview.socso || preview.sip ? (
                <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_2rem_minmax(0,1fr)] md:gap-3">
                  <div className="space-y-2 text-sm">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="font-medium text-gray-900 dark:text-gray-100">SOCSO</span>
                      <span className="text-xs text-gray-400 dark:text-gray-500">Keilatan + SKBBK</span>
                    </div>
                    {preview.socso ? (
                      <>
                        <div className="flex justify-between">
                          <span className="text-gray-500 dark:text-gray-400">Employees:</span>
                          <span className="font-medium text-gray-900 dark:text-gray-100">{preview.socso.count}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-500 dark:text-gray-400">Employer Share:</span>
                          <span className="font-medium text-gray-900 dark:text-gray-100">
                            RM {preview.socso.totals.socso_employer.toLocaleString("en-MY", { minimumFractionDigits: 2 })}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-500 dark:text-gray-400">Employee Share:</span>
                          <span className="font-medium text-gray-900 dark:text-gray-100">
                            RM {preview.socso.totals.socso_employee.toLocaleString("en-MY", { minimumFractionDigits: 2 })}
                          </span>
                        </div>
                        <div className="flex justify-between pt-2 border-t border-gray-100 dark:border-gray-700">
                          <span className="text-gray-700 dark:text-gray-200 font-medium">Total:</span>
                          <span className="font-semibold text-green-600 dark:text-green-400">
                            RM {preview.socso.totals.socso_total.toLocaleString("en-MY", { minimumFractionDigits: 2 })}
                          </span>
                        </div>
                      </>
                    ) : (
                      <p className="text-sm text-gray-400 italic">No SOCSO data</p>
                    )}
                  </div>

                  <div className="hidden self-stretch items-center justify-center md:flex" aria-hidden="true">
                    <div className="h-36 w-px rounded-full bg-gray-200 dark:bg-gray-700" />
                  </div>

                  <div className="flex items-center justify-center text-3xl font-extralight leading-none text-gray-300 dark:text-gray-600 md:hidden" aria-hidden="true">
                    |
                  </div>

                  <div className="space-y-2 text-sm">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="font-medium text-gray-900 dark:text-gray-100">SIP / EIS</span>
                      <span className="text-xs text-gray-400 dark:text-gray-500">Employment Insurance</span>
                    </div>
                    {preview.sip ? (
                      <>
                        <div className="flex justify-between">
                          <span className="text-gray-500 dark:text-gray-400">Employees:</span>
                          <span className="font-medium text-gray-900 dark:text-gray-100">{preview.sip.count}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-500 dark:text-gray-400">Employer Share:</span>
                          <span className="font-medium text-gray-900 dark:text-gray-100">
                            RM {preview.sip.totals.eis_employer.toLocaleString("en-MY", { minimumFractionDigits: 2 })}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-500 dark:text-gray-400">Employee Share:</span>
                          <span className="font-medium text-gray-900 dark:text-gray-100">
                            RM {preview.sip.totals.eis_employee.toLocaleString("en-MY", { minimumFractionDigits: 2 })}
                          </span>
                        </div>
                        <div className="flex justify-between pt-2 border-t border-gray-100 dark:border-gray-700">
                          <span className="text-gray-700 dark:text-gray-200 font-medium">Total:</span>
                          <span className="font-semibold text-green-600 dark:text-green-400">
                            RM {preview.sip.totals.sip_total.toLocaleString("en-MY", { minimumFractionDigits: 2 })}
                          </span>
                        </div>
                      </>
                    ) : (
                      <p className="text-sm text-gray-400 italic">No SIP data</p>
                    )}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-gray-400 italic">No data available</p>
              )}

              {/* SOCSO/SIP Detailed Tooltip */}
              {hoveredCard === "socso" &&
                ((preview.socso && preview.socso.data.length > 0) ||
                  (preview.sip && preview.sip.data.length > 0)) && (
                <div
                  className="absolute left-0 top-full mt-2 z-[60] bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl p-4 min-w-[760px]"
                  onMouseEnter={handleTooltipMouseEnter}
                  onMouseLeave={handleTooltipMouseLeave}
                >
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="font-medium text-gray-900 dark:text-gray-100">SOCSO & SIP Preview (combined SOCSO-SIP{`{MMYY}`}.TXT)</h4>
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      SOCSO {preview.socso ? preview.socso.count : 0}{" "} records{" "}
                      <span className="text-gray-300 dark:text-gray-600">|</span>{" "}
                      SIP {preview.sip ? preview.sip.count : 0} records
                    </span>
                  </div>
                  <div className="max-h-80 space-y-4 overflow-auto">
                    {preview.socso && preview.socso.data.length > 0 && (
                      <div>
                        <div className="mb-2 text-xs font-medium text-gray-600 dark:text-gray-300">
                          SOCSO
                        </div>
                        <div className="border border-gray-100 dark:border-gray-700 rounded">
                          <table className="w-full text-xs">
                            <thead className="bg-gray-50 dark:bg-gray-900 sticky top-0 z-10">
                              <tr>
                                <th className="px-2 py-1.5 text-left font-medium text-gray-600 dark:text-gray-300 border-b dark:border-gray-700">IC No</th>
                                <th className="px-2 py-1.5 text-left font-medium text-gray-600 dark:text-gray-300 border-b dark:border-gray-700">Name</th>
                                <th className="px-2 py-1.5 text-right font-medium text-gray-600 dark:text-gray-300 border-b dark:border-gray-700">Salary</th>
                                <th className="px-2 py-1.5 text-right font-medium text-gray-600 dark:text-gray-300 border-b dark:border-gray-700">Employer</th>
                                <th className="px-2 py-1.5 text-right font-medium text-gray-600 dark:text-gray-300 border-b dark:border-gray-700">Keilatan</th>
                                <th className="px-2 py-1.5 text-right font-medium text-gray-600 dark:text-gray-300 border-b dark:border-gray-700">SKBBK</th>
                                <th className="px-2 py-1.5 text-right font-medium text-gray-600 dark:text-gray-300 border-b dark:border-gray-700">Employee Total</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                              {preview.socso.data.map((row, index) => (
                                <tr key={index} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                                  <td className="px-2 py-1.5 text-gray-700 dark:text-gray-200 font-mono">{formatIC(row.ic_no)}</td>
                                  <td className="px-2 py-1.5 text-gray-900 dark:text-gray-100">{row.name}</td>
                                  <td className="px-2 py-1.5 text-right text-gray-700 dark:text-gray-200 font-mono">
                                    {row.salary.toFixed(2)}
                                  </td>
                                  <td className="px-2 py-1.5 text-right text-gray-700 dark:text-gray-200 font-mono">
                                    {row.socso_employer.toFixed(2)}
                                  </td>
                                  <td className="px-2 py-1.5 text-right text-gray-700 dark:text-gray-200 font-mono">
                                    {row.keilatan_amount.toFixed(2)}
                                  </td>
                                  <td className="px-2 py-1.5 text-right text-gray-700 dark:text-gray-200 font-mono">
                                    {row.skbbk_amount.toFixed(2)}
                                  </td>
                                  <td className="px-2 py-1.5 text-right text-gray-700 dark:text-gray-200 font-mono">
                                    {row.socso_employee.toFixed(2)}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                            <tfoot className="bg-green-50 dark:bg-gray-900 sticky bottom-0 z-10">
                              <tr className="font-medium">
                                <td colSpan={2} className="px-2 py-1.5 text-gray-700 dark:text-gray-200 border-t border-gray-200 dark:border-gray-700">Total</td>
                                <td className="px-2 py-1.5 text-right text-gray-700 dark:text-gray-200 font-mono border-t border-gray-200 dark:border-gray-700">
                                  {preview.socso.totals.salary.toFixed(2)}
                                </td>
                                <td className="px-2 py-1.5 text-right text-green-600 dark:text-green-400 font-mono border-t border-gray-200 dark:border-gray-700">
                                  {preview.socso.totals.socso_employer.toFixed(2)}
                                </td>
                                <td className="px-2 py-1.5 text-right text-green-600 dark:text-green-400 font-mono border-t border-gray-200 dark:border-gray-700">
                                  {preview.socso.totals.keilatan_amount.toFixed(2)}
                                </td>
                                <td className="px-2 py-1.5 text-right text-green-600 dark:text-green-400 font-mono border-t border-gray-200 dark:border-gray-700">
                                  {preview.socso.totals.skbbk_amount.toFixed(2)}
                                </td>
                                <td className="px-2 py-1.5 text-right text-green-600 dark:text-green-400 font-mono border-t border-gray-200 dark:border-gray-700">
                                  {preview.socso.totals.socso_employee.toFixed(2)}
                                </td>
                              </tr>
                            </tfoot>
                          </table>
                        </div>
                      </div>
                    )}

                    {preview.sip && preview.sip.data.length > 0 && (
                      <div>
                        <div className="mb-2 text-xs font-medium text-gray-600 dark:text-gray-300">
                          SIP / EIS
                        </div>
                        <div className="border border-gray-100 dark:border-gray-700 rounded">
                          <table className="w-full text-xs">
                            <thead className="bg-gray-50 dark:bg-gray-900 sticky top-0 z-10">
                              <tr>
                                <th className="px-2 py-1.5 text-left font-medium text-gray-600 dark:text-gray-300 border-b dark:border-gray-700">IC No</th>
                                <th className="px-2 py-1.5 text-left font-medium text-gray-600 dark:text-gray-300 border-b dark:border-gray-700">Name</th>
                                <th className="px-2 py-1.5 text-right font-medium text-gray-600 dark:text-gray-300 border-b dark:border-gray-700">Employer</th>
                                <th className="px-2 py-1.5 text-right font-medium text-gray-600 dark:text-gray-300 border-b dark:border-gray-700">Employee</th>
                                <th className="px-2 py-1.5 text-right font-medium text-gray-600 dark:text-gray-300 border-b dark:border-gray-700">Total</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                              {preview.sip.data.map((row, index) => (
                                <tr key={index} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                                  <td className="px-2 py-1.5 text-gray-700 dark:text-gray-200 font-mono">{formatIC(row.ic_no)}</td>
                                  <td className="px-2 py-1.5 text-gray-900 dark:text-gray-100">{row.name}</td>
                                  <td className="px-2 py-1.5 text-right text-gray-700 dark:text-gray-200 font-mono">
                                    {row.eis_employer.toFixed(2)}
                                  </td>
                                  <td className="px-2 py-1.5 text-right text-gray-700 dark:text-gray-200 font-mono">
                                    {row.eis_employee.toFixed(2)}
                                  </td>
                                  <td className="px-2 py-1.5 text-right text-gray-700 dark:text-gray-200 font-mono">
                                    {row.sip_total.toFixed(2)}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                            <tfoot className="bg-green-50 dark:bg-gray-900 sticky bottom-0 z-10">
                              <tr className="font-medium">
                                <td colSpan={2} className="px-2 py-1.5 text-gray-700 dark:text-gray-200 border-t border-gray-200 dark:border-gray-700">Total</td>
                                <td className="px-2 py-1.5 text-right text-green-600 dark:text-green-400 font-mono border-t border-gray-200 dark:border-gray-700">
                                  {preview.sip.totals.eis_employer.toFixed(2)}
                                </td>
                                <td className="px-2 py-1.5 text-right text-green-600 dark:text-green-400 font-mono border-t border-gray-200 dark:border-gray-700">
                                  {preview.sip.totals.eis_employee.toFixed(2)}
                                </td>
                                <td className="px-2 py-1.5 text-right text-green-600 dark:text-green-400 font-mono border-t border-gray-200 dark:border-gray-700">
                                  {preview.sip.totals.sip_total.toFixed(2)}
                                </td>
                              </tr>
                            </tfoot>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Income Tax Preview Card */}
            <div
              className={`relative border border-gray-200 dark:border-gray-700 rounded-lg p-4 cursor-pointer transition-all hover:shadow-md hover:border-amber-300 dark:hover:border-amber-400 dark:bg-gray-800 ${loadingType === "income_tax" ? "opacity-70" : ""}`}
              onMouseEnter={() => handleCardMouseEnter("income_tax")}
              onMouseLeave={handleCardMouseLeave}
              onClick={() => handleDownload("income_tax")}
            >
              <div className="flex items-center gap-2 mb-3">
                <div className="p-2 bg-amber-100 dark:bg-amber-900/30 rounded-lg">
                  <IconReceipt size={20} className="text-amber-600 dark:text-amber-400" />
                </div>
                <h3 className="font-medium text-gray-900 dark:text-gray-100">Income Tax / PCB</h3>
                <div className="ml-auto">
                  {loadingType === "income_tax" ? (
                    <IconLoader2 size={20} className="animate-spin text-amber-600 dark:text-amber-400" />
                  ) : (
                    <IconFileDownload size={20} className="text-gray-400 dark:text-gray-500" />
                  )}
                </div>
              </div>
              {preview.income_tax ? (
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-500 dark:text-gray-400">Employees:</span>
                    <span className="font-medium text-gray-900 dark:text-gray-100">{preview.income_tax.count}</span>
                  </div>
                  <div className="flex justify-between pt-2 border-t border-gray-100 dark:border-gray-700">
                    <span className="text-gray-700 dark:text-gray-200 font-medium">Total PCB:</span>
                    <span className="font-semibold text-amber-600 dark:text-amber-400">
                      RM {preview.income_tax.totals.pcb_amount.toLocaleString("en-MY", { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-gray-400 italic">No data available</p>
              )}

              {/* Income Tax Detailed Tooltip */}
              {hoveredCard === "income_tax" && preview.income_tax && preview.income_tax.data.length > 0 && (
                <div
                  className="absolute right-0 top-full mt-2 z-[60] bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl p-4 min-w-[640px]"
                  onMouseEnter={handleTooltipMouseEnter}
                  onMouseLeave={handleTooltipMouseLeave}
                >
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="font-medium text-gray-900 dark:text-gray-100">Income Tax File Preview (LHDN*.TXT)</h4>
                    <span className="text-xs text-gray-500 dark:text-gray-400">{preview.income_tax.count} records</span>
                  </div>
                  <div className="max-h-64 overflow-auto border border-gray-100 dark:border-gray-700 rounded">
                    <table className="w-full text-xs">
                      <thead className="bg-gray-50 dark:bg-gray-900 sticky top-0 z-10">
                        <tr>
                          <th className="px-2 py-1.5 text-left font-medium text-gray-600 dark:text-gray-300 border-b dark:border-gray-700">Tax No</th>
                          <th className="px-2 py-1.5 text-left font-medium text-gray-600 dark:text-gray-300 border-b dark:border-gray-700">Name</th>
                          <th className="px-2 py-1.5 text-left font-medium text-gray-600 dark:text-gray-300 border-b dark:border-gray-700">IC No</th>
                          <th className="px-2 py-1.5 text-right font-medium text-gray-600 dark:text-gray-300 border-b dark:border-gray-700">PCB Amount</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                        {preview.income_tax.data.map((row, index) => (
                          <tr key={index} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                            <td className="px-2 py-1.5 text-gray-700 dark:text-gray-200 font-mono">{row.income_tax_no}</td>
                            <td className="px-2 py-1.5 text-gray-900 dark:text-gray-100">{row.name}</td>
                            <td className="px-2 py-1.5 text-gray-700 dark:text-gray-200 font-mono">{formatIC(row.ic_no)}</td>
                            <td className="px-2 py-1.5 text-right text-gray-700 dark:text-gray-200 font-mono">
                              {row.pcb_amount.toFixed(2)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="bg-amber-50 dark:bg-gray-900 sticky bottom-0 z-10">
                        <tr className="font-medium">
                          <td colSpan={3} className="px-2 py-1.5 text-gray-700 dark:text-gray-200 border-t border-gray-200 dark:border-gray-700">Total</td>
                          <td className="px-2 py-1.5 text-right text-amber-600 dark:text-amber-400 font-mono border-t border-gray-200 dark:border-gray-700">
                            {preview.income_tax.totals.pcb_amount.toFixed(2)}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Missing EPF Number Dialog */}
      <MissingEPFNumberDialog
        isOpen={showMissingEPFDialog}
        onClose={() => setShowMissingEPFDialog(false)}
        employees={preview.missing_epf_no?.data || []}
      />
    </div>
  );
};

export default ECarumanPage;
