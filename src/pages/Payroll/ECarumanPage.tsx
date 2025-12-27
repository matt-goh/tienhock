// src/pages/Payroll/ECarumanPage.tsx
import { useState, useEffect, useRef } from "react";
import {
  IconFileDownload,
  IconBuildingBank,
  IconShieldCheck,
  IconReceipt,
  IconLoader2,
  IconUmbrella,
} from "@tabler/icons-react";
import StyledListbox from "../../components/StyledListbox";
import toast from "react-hot-toast";
import { api } from "../../routes/utils/api";

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
    eis_employer: number;
    eis_employee: number;
  }[];
  totals: {
    salary: number;
    socso_employer: number;
    socso_employee: number;
    socso_total: number;
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

interface PreviewState {
  epf: EPFPreviewData | null;
  socso: SOCSOPreviewData | null;
  sip: SIPPreviewData | null;
  income_tax: IncomeTaxPreviewData | null;
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
  const currentDate = new Date();
  const [selectedMonth, setSelectedMonth] = useState(currentDate.getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(currentDate.getFullYear());
  const [loadingType, setLoadingType] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [preview, setPreview] = useState<PreviewState>({
    epf: null,
    socso: null,
    sip: null,
    income_tax: null,
  });
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
        });
      } catch (error) {
        console.error("Error fetching preview data:", error);
        setPreview({ epf: null, socso: null, sip: null, income_tax: null });
      } finally {
        setPreviewLoading(false);
      }
    };

    fetchPreviewData();
  }, [selectedMonth, selectedYear]);

  // Generate month options for StyledListbox
  const monthOptions = [
    { id: 1, name: "January" },
    { id: 2, name: "February" },
    { id: 3, name: "March" },
    { id: 4, name: "April" },
    { id: 5, name: "May" },
    { id: 6, name: "June" },
    { id: 7, name: "July" },
    { id: 8, name: "August" },
    { id: 9, name: "September" },
    { id: 10, name: "October" },
    { id: 11, name: "November" },
    { id: 12, name: "December" },
  ];

  // Generate year options for StyledListbox (current year and 2 years back)
  const yearOptions = Array.from({ length: 3 }, (_, i) => ({
    id: currentDate.getFullYear() - i,
    name: String(currentDate.getFullYear() - i),
  }));

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
        case "socso": {
          // Check if File System Access API is supported
          if (!window.showDirectoryPicker) {
            toast.error("Your browser does not support folder creation. Please use Chrome or Edge.");
            break;
          }

          // Get export data from backend
          const socsoExportData = await api.get(
            `/api/e-caruman/socso/export?month=${selectedMonth}&year=${selectedYear}&company=TH&employerCode=${SOCSO_EMPLOYER_CODE}`
          );

          if (!socsoExportData.files || socsoExportData.files.length === 0) {
            toast.error("No SOCSO/EIS contribution data found for the specified period");
            break;
          }

          // Prompt user to select download folder
          let socsoBaseDir: FileSystemDirectoryHandle;
          try {
            socsoBaseDir = await window.showDirectoryPicker();
          } catch (err) {
            // User cancelled the picker
            if ((err as Error).name === "AbortError") {
              break;
            }
            throw err;
          }

          // Create folder structure and write files
          let socsoCreatedCount = 0;
          for (const file of socsoExportData.files) {
            const pathParts = file.path.split("/");
            const targetDir = await createNestedDirectory(socsoBaseDir, pathParts);
            await writeFileToDirectory(targetDir, file.filename, file.content);
            socsoCreatedCount++;
          }

          toast.success(
            `SOCSO file created successfully in SOCSO/${socsoExportData.year}/TH/${socsoExportData.month}/`
          );
          break;
        }
        case "sip": {
          // Check if File System Access API is supported
          if (!window.showDirectoryPicker) {
            toast.error("Your browser does not support folder creation. Please use Chrome or Edge.");
            break;
          }

          // Get export data from backend
          const sipExportData = await api.get(
            `/api/e-caruman/sip/export?month=${selectedMonth}&year=${selectedYear}&company=TH&employerCode=${SOCSO_EMPLOYER_CODE}&myCoId=${SIP_MYCOID}`
          );

          if (!sipExportData.files || sipExportData.files.length === 0) {
            toast.error("No SIP/EIS contribution data found for the specified period");
            break;
          }

          // Prompt user to select download folder
          let sipBaseDir: FileSystemDirectoryHandle;
          try {
            sipBaseDir = await window.showDirectoryPicker();
          } catch (err) {
            // User cancelled the picker
            if ((err as Error).name === "AbortError") {
              break;
            }
            throw err;
          }

          // Create folder structure and write files
          let sipCreatedCount = 0;
          for (const file of sipExportData.files) {
            const pathParts = file.path.split("/");
            const targetDir = await createNestedDirectory(sipBaseDir, pathParts);
            await writeFileToDirectory(targetDir, file.filename, file.content);
            sipCreatedCount++;
          }

          toast.success(
            `SIP files created successfully (${sipCreatedCount} files) in SIP/${sipExportData.year}/TH/${sipExportData.month}/`
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
    <div className="p-6">
      <div className="mb-4">
        <h1 className="text-2xl font-semibold text-gray-900">e-Caruman</h1>
        <p className="mt-1 text-sm text-gray-500">
          Generate contribution files for government submission
        </p>
      </div>

      {/* Month/Year Selection */}
      <div className="mb-4 bg-white rounded-lg border border-gray-200 p-6">
        <h2 className="text-lg font-medium text-gray-900 mb-4">Select Period</h2>
        <div className="flex gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Month
            </label>
            <StyledListbox
              value={selectedMonth}
              onChange={(value) => setSelectedMonth(Number(value))}
              options={monthOptions}
              className="w-44"
              rounded="lg"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Year
            </label>
            <StyledListbox
              value={selectedYear}
              onChange={(value) => setSelectedYear(Number(value))}
              options={yearOptions}
              className="w-28"
              rounded="lg"
            />
          </div>
        </div>
      </div>

      {/* Download Contribution Files Section */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h2 className="text-lg font-medium text-gray-900 mb-1">
          Download Contribution Files
        </h2>
        <p className="text-sm text-gray-500 mb-4">
          Select the contribution type to generate and download the file for{" "}
          <span className="font-medium text-gray-700">
            {monthOptions.find((m) => m.id === selectedMonth)?.name} {selectedYear}
          </span>
        </p>
        {previewLoading ? (
          <div className="flex items-center justify-center py-8">
            <IconLoader2 size={24} className="animate-spin text-gray-400" />
            <span className="ml-2 text-gray-500">Loading preview data...</span>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* EPF Preview Card */}
            <div
              className={`relative border border-gray-200 rounded-lg p-4 cursor-pointer transition-all hover:shadow-md hover:border-blue-300 ${loadingType === "epf" ? "opacity-70" : ""}`}
              onMouseEnter={() => handleCardMouseEnter("epf")}
              onMouseLeave={handleCardMouseLeave}
              onClick={() => handleDownload("epf")}
            >
              <div className="flex items-center gap-2 mb-3">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <IconBuildingBank size={20} className="text-blue-600" />
                </div>
                <h3 className="font-medium text-gray-900">EPF / KWSP</h3>
                <div className="ml-auto">
                  {loadingType === "epf" ? (
                    <IconLoader2 size={20} className="animate-spin text-blue-600" />
                  ) : (
                    <IconFileDownload size={20} className="text-gray-400" />
                  )}
                </div>
              </div>
              {preview.epf ? (
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Employees:</span>
                    <span className="font-medium">{preview.epf.count}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Total Salary:</span>
                    <span className="font-medium">
                      RM {preview.epf.totals.salary.toLocaleString("en-MY", { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Employer Share:</span>
                    <span className="font-medium">
                      RM {preview.epf.totals.em_share.toLocaleString("en-MY")}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Employee Share:</span>
                    <span className="font-medium">
                      RM {preview.epf.totals.emp_share.toLocaleString("en-MY")}
                    </span>
                  </div>
                  <div className="flex justify-between pt-2 border-t border-gray-100">
                    <span className="text-gray-700 font-medium">Total:</span>
                    <span className="font-semibold text-blue-600">
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
                  className="absolute left-0 bottom-full mb-2 z-50 bg-white border border-gray-200 rounded-lg shadow-xl p-4 min-w-[600px]"
                  onMouseEnter={handleTooltipMouseEnter}
                  onMouseLeave={handleTooltipMouseLeave}
                >
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="font-medium text-gray-900">EPF File Preview (EPFORMA2.csv)</h4>
                    <span className="text-xs text-gray-500">{preview.epf.count} records</span>
                  </div>
                  <div className="max-h-64 overflow-auto border border-gray-100 rounded">
                    <table className="w-full text-xs">
                      <thead className="bg-gray-50 sticky top-0">
                        <tr>
                          <th className="px-2 py-1.5 text-left font-medium text-gray-600 border-b">Member No</th>
                          <th className="px-2 py-1.5 text-left font-medium text-gray-600 border-b">IC No</th>
                          <th className="px-2 py-1.5 text-left font-medium text-gray-600 border-b">Name</th>
                          <th className="px-2 py-1.5 text-right font-medium text-gray-600 border-b">Salary</th>
                          <th className="px-2 py-1.5 text-right font-medium text-gray-600 border-b">EM Share</th>
                          <th className="px-2 py-1.5 text-right font-medium text-gray-600 border-b">EMP Share</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {preview.epf.data.map((row, index) => (
                          <tr key={index} className="hover:bg-gray-50">
                            <td className="px-2 py-1.5 text-gray-700 font-mono">{row.member_no}</td>
                            <td className="px-2 py-1.5 text-gray-700 font-mono">{formatIC(row.ic_no)}</td>
                            <td className="px-2 py-1.5 text-gray-900">{row.name}</td>
                            <td className="px-2 py-1.5 text-right text-gray-700 font-mono">
                              {row.salary.toFixed(2)}
                            </td>
                            <td className="px-2 py-1.5 text-right text-gray-700 font-mono">
                              {Math.round(row.em_share)}
                            </td>
                            <td className="px-2 py-1.5 text-right text-gray-700 font-mono">
                              {Math.round(row.emp_share)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="bg-blue-50 sticky bottom-0">
                        <tr className="font-medium">
                          <td colSpan={3} className="px-2 py-1.5 text-gray-700 border-t">Total</td>
                          <td className="px-2 py-1.5 text-right text-gray-700 font-mono border-t">
                            {preview.epf.totals.salary.toFixed(2)}
                          </td>
                          <td className="px-2 py-1.5 text-right text-blue-600 font-mono border-t">
                            {preview.epf.totals.em_share}
                          </td>
                          <td className="px-2 py-1.5 text-right text-blue-600 font-mono border-t">
                            {preview.epf.totals.emp_share}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              )}
            </div>

            {/* SOCSO Preview Card */}
            <div
              className={`relative border border-gray-200 rounded-lg p-4 cursor-pointer transition-all hover:shadow-md hover:border-green-300 ${loadingType === "socso" ? "opacity-70" : ""}`}
              onMouseEnter={() => handleCardMouseEnter("socso")}
              onMouseLeave={handleCardMouseLeave}
              onClick={() => handleDownload("socso")}
            >
              <div className="flex items-center gap-2 mb-3">
                <div className="p-2 bg-green-100 rounded-lg">
                  <IconShieldCheck size={20} className="text-green-600" />
                </div>
                <h3 className="font-medium text-gray-900">SOCSO / PERKESO</h3>
                <div className="ml-auto">
                  {loadingType === "socso" ? (
                    <IconLoader2 size={20} className="animate-spin text-green-600" />
                  ) : (
                    <IconFileDownload size={20} className="text-gray-400" />
                  )}
                </div>
              </div>
              {preview.socso ? (
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Employees:</span>
                    <span className="font-medium">{preview.socso.count}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Employer Share:</span>
                    <span className="font-medium">
                      RM {preview.socso.totals.socso_employer.toLocaleString("en-MY", { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Employee Share:</span>
                    <span className="font-medium">
                      RM {preview.socso.totals.socso_employee.toLocaleString("en-MY", { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div className="flex justify-between pt-2 border-t border-gray-100">
                    <span className="text-gray-700 font-medium">Total:</span>
                    <span className="font-semibold text-green-600">
                      RM {preview.socso.totals.socso_total.toLocaleString("en-MY", { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-gray-400 italic">No data available</p>
              )}

              {/* SOCSO Detailed Tooltip */}
              {hoveredCard === "socso" && preview.socso && preview.socso.data.length > 0 && (
                <div
                  className="absolute left-0 bottom-full mb-2 z-50 bg-white border border-gray-200 rounded-lg shadow-xl p-4 min-w-[550px]"
                  onMouseEnter={handleTooltipMouseEnter}
                  onMouseLeave={handleTooltipMouseLeave}
                >
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="font-medium text-gray-900">SOCSO File Preview (BRG8A.TXT)</h4>
                    <span className="text-xs text-gray-500">{preview.socso.count} records</span>
                  </div>
                  <div className="max-h-64 overflow-auto border border-gray-100 rounded">
                    <table className="w-full text-xs">
                      <thead className="bg-gray-50 sticky top-0">
                        <tr>
                          <th className="px-2 py-1.5 text-left font-medium text-gray-600 border-b">IC No</th>
                          <th className="px-2 py-1.5 text-left font-medium text-gray-600 border-b">Name</th>
                          <th className="px-2 py-1.5 text-right font-medium text-gray-600 border-b">Salary</th>
                          <th className="px-2 py-1.5 text-right font-medium text-gray-600 border-b">Employer</th>
                          <th className="px-2 py-1.5 text-right font-medium text-gray-600 border-b">Employee</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {preview.socso.data.map((row, index) => (
                          <tr key={index} className="hover:bg-gray-50">
                            <td className="px-2 py-1.5 text-gray-700 font-mono">{formatIC(row.ic_no)}</td>
                            <td className="px-2 py-1.5 text-gray-900">{row.name}</td>
                            <td className="px-2 py-1.5 text-right text-gray-700 font-mono">
                              {row.salary.toFixed(2)}
                            </td>
                            <td className="px-2 py-1.5 text-right text-gray-700 font-mono">
                              {row.socso_employer.toFixed(2)}
                            </td>
                            <td className="px-2 py-1.5 text-right text-gray-700 font-mono">
                              {row.socso_employee.toFixed(2)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="bg-green-50 sticky bottom-0">
                        <tr className="font-medium">
                          <td colSpan={2} className="px-2 py-1.5 text-gray-700 border-t">Total</td>
                          <td className="px-2 py-1.5 text-right text-gray-700 font-mono border-t">
                            {preview.socso.totals.salary.toFixed(2)}
                          </td>
                          <td className="px-2 py-1.5 text-right text-green-600 font-mono border-t">
                            {preview.socso.totals.socso_employer.toFixed(2)}
                          </td>
                          <td className="px-2 py-1.5 text-right text-green-600 font-mono border-t">
                            {preview.socso.totals.socso_employee.toFixed(2)}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              )}
            </div>

            {/* SIP/EIS Preview Card */}
            <div
              className={`relative border border-gray-200 rounded-lg p-4 cursor-pointer transition-all hover:shadow-md hover:border-purple-300 ${loadingType === "sip" ? "opacity-70" : ""}`}
              onMouseEnter={() => handleCardMouseEnter("sip")}
              onMouseLeave={handleCardMouseLeave}
              onClick={() => handleDownload("sip")}
            >
              <div className="flex items-center gap-2 mb-3">
                <div className="p-2 bg-purple-100 rounded-lg">
                  <IconUmbrella size={20} className="text-purple-600" />
                </div>
                <h3 className="font-medium text-gray-900">SIP / EIS</h3>
                <div className="ml-auto">
                  {loadingType === "sip" ? (
                    <IconLoader2 size={20} className="animate-spin text-purple-600" />
                  ) : (
                    <IconFileDownload size={20} className="text-gray-400" />
                  )}
                </div>
              </div>
              {preview.sip ? (
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Employees:</span>
                    <span className="font-medium">{preview.sip.count}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Employer Share:</span>
                    <span className="font-medium">
                      RM {preview.sip.totals.eis_employer.toLocaleString("en-MY", { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Employee Share:</span>
                    <span className="font-medium">
                      RM {preview.sip.totals.eis_employee.toLocaleString("en-MY", { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div className="flex justify-between pt-2 border-t border-gray-100">
                    <span className="text-gray-700 font-medium">Total:</span>
                    <span className="font-semibold text-purple-600">
                      RM {preview.sip.totals.sip_total.toLocaleString("en-MY", { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-gray-400 italic">No data available</p>
              )}

              {/* SIP Detailed Tooltip */}
              {hoveredCard === "sip" && preview.sip && preview.sip.data.length > 0 && (
                <div
                  className="absolute right-0 bottom-full mb-2 z-50 bg-white border border-gray-200 rounded-lg shadow-xl p-4 min-w-[500px]"
                  onMouseEnter={handleTooltipMouseEnter}
                  onMouseLeave={handleTooltipMouseLeave}
                >
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="font-medium text-gray-900">SIP File Preview</h4>
                    <span className="text-xs text-gray-500">{preview.sip.count} records</span>
                  </div>
                  <div className="max-h-64 overflow-auto border border-gray-100 rounded">
                    <table className="w-full text-xs">
                      <thead className="bg-gray-50 sticky top-0">
                        <tr>
                          <th className="px-2 py-1.5 text-left font-medium text-gray-600 border-b">IC No</th>
                          <th className="px-2 py-1.5 text-left font-medium text-gray-600 border-b">Name</th>
                          <th className="px-2 py-1.5 text-right font-medium text-gray-600 border-b">Employer</th>
                          <th className="px-2 py-1.5 text-right font-medium text-gray-600 border-b">Employee</th>
                          <th className="px-2 py-1.5 text-right font-medium text-gray-600 border-b">Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {preview.sip.data.map((row, index) => (
                          <tr key={index} className="hover:bg-gray-50">
                            <td className="px-2 py-1.5 text-gray-700 font-mono">{formatIC(row.ic_no)}</td>
                            <td className="px-2 py-1.5 text-gray-900">{row.name}</td>
                            <td className="px-2 py-1.5 text-right text-gray-700 font-mono">
                              {row.eis_employer.toFixed(2)}
                            </td>
                            <td className="px-2 py-1.5 text-right text-gray-700 font-mono">
                              {row.eis_employee.toFixed(2)}
                            </td>
                            <td className="px-2 py-1.5 text-right text-gray-700 font-mono">
                              {row.sip_total.toFixed(2)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="bg-purple-50 sticky bottom-0">
                        <tr className="font-medium">
                          <td colSpan={2} className="px-2 py-1.5 text-gray-700 border-t">Total</td>
                          <td className="px-2 py-1.5 text-right text-purple-600 font-mono border-t">
                            {preview.sip.totals.eis_employer.toFixed(2)}
                          </td>
                          <td className="px-2 py-1.5 text-right text-purple-600 font-mono border-t">
                            {preview.sip.totals.eis_employee.toFixed(2)}
                          </td>
                          <td className="px-2 py-1.5 text-right text-purple-600 font-mono border-t">
                            {preview.sip.totals.sip_total.toFixed(2)}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              )}
            </div>

            {/* Income Tax Preview Card */}
            <div
              className={`relative border border-gray-200 rounded-lg p-4 cursor-pointer transition-all hover:shadow-md hover:border-amber-300 ${loadingType === "income_tax" ? "opacity-70" : ""}`}
              onMouseEnter={() => handleCardMouseEnter("income_tax")}
              onMouseLeave={handleCardMouseLeave}
              onClick={() => handleDownload("income_tax")}
            >
              <div className="flex items-center gap-2 mb-3">
                <div className="p-2 bg-amber-100 rounded-lg">
                  <IconReceipt size={20} className="text-amber-600" />
                </div>
                <h3 className="font-medium text-gray-900">Income Tax / PCB</h3>
                <div className="ml-auto">
                  {loadingType === "income_tax" ? (
                    <IconLoader2 size={20} className="animate-spin text-amber-600" />
                  ) : (
                    <IconFileDownload size={20} className="text-gray-400" />
                  )}
                </div>
              </div>
              {preview.income_tax ? (
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Employees:</span>
                    <span className="font-medium">{preview.income_tax.count}</span>
                  </div>
                  <div className="flex justify-between pt-2 border-t border-gray-100">
                    <span className="text-gray-700 font-medium">Total PCB:</span>
                    <span className="font-semibold text-amber-600">
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
                  className="absolute right-0 bottom-full mb-2 z-50 bg-white border border-gray-200 rounded-lg shadow-xl p-4 min-w-[500px]"
                  onMouseEnter={handleTooltipMouseEnter}
                  onMouseLeave={handleTooltipMouseLeave}
                >
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="font-medium text-gray-900">Income Tax File Preview (LHDN*.TXT)</h4>
                    <span className="text-xs text-gray-500">{preview.income_tax.count} records</span>
                  </div>
                  <div className="max-h-64 overflow-auto border border-gray-100 rounded">
                    <table className="w-full text-xs">
                      <thead className="bg-gray-50 sticky top-0">
                        <tr>
                          <th className="px-2 py-1.5 text-left font-medium text-gray-600 border-b">Tax No</th>
                          <th className="px-2 py-1.5 text-left font-medium text-gray-600 border-b">Name</th>
                          <th className="px-2 py-1.5 text-left font-medium text-gray-600 border-b">IC No</th>
                          <th className="px-2 py-1.5 text-right font-medium text-gray-600 border-b">PCB Amount</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {preview.income_tax.data.map((row, index) => (
                          <tr key={index} className="hover:bg-gray-50">
                            <td className="px-2 py-1.5 text-gray-700 font-mono">{row.income_tax_no}</td>
                            <td className="px-2 py-1.5 text-gray-900">{row.name}</td>
                            <td className="px-2 py-1.5 text-gray-700 font-mono">{formatIC(row.ic_no)}</td>
                            <td className="px-2 py-1.5 text-right text-gray-700 font-mono">
                              {row.pcb_amount.toFixed(2)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="bg-amber-50 sticky bottom-0">
                        <tr className="font-medium">
                          <td colSpan={3} className="px-2 py-1.5 text-gray-700 border-t">Total</td>
                          <td className="px-2 py-1.5 text-right text-amber-600 font-mono border-t">
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
    </div>
  );
};

export default ECarumanPage;
