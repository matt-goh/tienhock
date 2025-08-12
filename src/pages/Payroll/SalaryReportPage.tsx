// src/pages/Payroll/SalaryReportPage.tsx
import React, { useState, useEffect, useMemo } from "react";
import {
  IconRefresh,
  IconFileText,
  IconPrinter,
  IconDownload,
  IconFileExport,
  IconLink,
} from "@tabler/icons-react";
import {
  Dialog,
  DialogPanel,
  DialogTitle,
  Transition,
  TransitionChild,
} from "@headlessui/react";
import Button from "../../components/Button";
import LoadingSpinner from "../../components/LoadingSpinner";
import { FormListbox } from "../../components/FormComponents";
import Tab from "../../components/Tab";
import { api } from "../../routes/utils/api";
import { getMonthName } from "../../utils/payroll/midMonthPayrollUtils";
import {
  generateSalaryReportPDF,
  SalaryReportPDFData,
} from "../../utils/payroll/SalaryReportPDF";
import {
  generateBankReportPDF,
  BankReportPDFData,
} from "../../utils/payroll/BankReportPDF";
import { useStaffsCache } from "../../utils/catalogue/useStaffsCache";
import toast from "react-hot-toast";

// Location mapping with proper order
const LOCATION_MAP: { [key: string]: string } = {
  "01": "DIRECTOR'S REMUNERATION",
  "02": "OFFICE",
  "03": "SALESMAN",
  "04": "IKUT LORI",
  "05": "PENGANGKUTAN HABUK",
  "06": "JAGA BOILER",
  "07": "MESIN & SANGKUT MEE",
  "08": "PACKING MEE",
  "09": "MESIN BIHUN",
  "10": "SANGKUT BIHUN",
  "11": "PACKING BIHUN",
  "12": "PEKEBUN",
  "13": "TUKANG SAPU",
  "14": "KILANG KERJA LUAR",
  "15": "OTHER SABARINA",
  "16": "COMM-MESIN MEE",
  "17": "COMM-MESIN BIHUN",
  "18": "COMM-KILANG",
  "19": "COMM-LORI",
  "20": "COMM-BOILER",
  "21": "COMM-FORKLIFT/CASE",
  "22": "KILANG HABUK",
  "23": "CUTI TAHUNAN",
  "24": "SPECIAL OT",
};

// Location order with headers
interface LocationOrderItem {
  type: "location" | "header";
  id?: string;
  text?: string;
}

const LOCATION_ORDER: LocationOrderItem[] = [
  { type: "location", id: "01" },
  { type: "location", id: "02" },
  { type: "location", id: "03" },
  { type: "location", id: "04" },
  { type: "location", id: "05" },
  { type: "location", id: "06" },
  { type: "location", id: "07" },
  { type: "location", id: "08" },
  { type: "location", id: "09" },
  { type: "location", id: "10" },
  { type: "location", id: "11" },
  { type: "location", id: "12" },
  { type: "location", id: "13" },
  { type: "header", text: "KERJA LUAR MAINTENANCE" },
  { type: "location", id: "14" },
  { type: "location", id: "15" },
  { type: "header", text: "COMMISSION" },
  { type: "location", id: "16" },
  { type: "location", id: "17" },
  { type: "location", id: "18" },
  { type: "location", id: "19" },
  { type: "location", id: "20" },
  { type: "location", id: "21" },
  { type: "location", id: "22" },
  { type: "location", id: "23" },
  { type: "location", id: "24" },
];

interface SalaryReportData {
  no: number;
  staff_id: string;
  staff_name: string;
  payment_preference: string;
  gaji_genap: number;
  total_pinjam: number;
  final_total: number;
  net_pay: number;
  mid_month_amount: number;
}

interface SalaryReportResponse {
  year: number;
  month: number;
  data: SalaryReportData[];
  total_records: number;
  summary: {
    total_gaji_genap: number;
    total_pinjam: number;
    total_final: number;
  };
  comprehensive?: ComprehensiveSalaryData;
  bank_data?: {
    no: number;
    staff_name: string;
    icNo: string;
    bankAccountNumber: string;
    total: number;
    payment_preference: string;
  }[];
}

// Comprehensive salary data for location-based reporting
interface LocationSalaryData {
  location: string;
  employees: {
    staff_id: string;
    staff_name: string;
    gaji: number; // Base Pay + Tambahan
    ot: number; // Overtime total
    bonus: number; // Bonus amount
    comm: number; // Commission amount
    gaji_kasar: number; // Gross pay
    epf_majikan: number;
    epf_pekerja: number;
    socso_majikan: number;
    socso_pekerja: number;
    sip_majikan: number;
    sip_pekerja: number;
    pcb: number; // Income tax
    gaji_bersih: number; // Net pay + commission
    setengah_bulan: number; // Mid month pay
    jumlah: number; // GAJI BERSIH - 1/2 BULAN
    jumlah_digenapkan: number; // Rounding (empty in new system)
    setelah_digenapkan: number; // Same as JUMLAH
  }[];
  totals: {
    gaji: number;
    ot: number;
    bonus: number;
    comm: number;
    gaji_kasar: number;
    epf_majikan: number;
    epf_pekerja: number;
    socso_majikan: number;
    socso_pekerja: number;
    sip_majikan: number;
    sip_pekerja: number;
    pcb: number;
    gaji_bersih: number;
    setengah_bulan: number;
    jumlah: number;
    jumlah_digenapkan: number;
    setelah_digenapkan: number;
  };
}

interface ComprehensiveSalaryData {
  year: number;
  month: number;
  locations: LocationSalaryData[];
  grand_totals: {
    gaji: number;
    ot: number;
    bonus: number;
    comm: number;
    gaji_kasar: number;
    epf_majikan: number;
    epf_pekerja: number;
    socso_majikan: number;
    socso_pekerja: number;
    sip_majikan: number;
    sip_pekerja: number;
    pcb: number;
    gaji_bersih: number;
    setengah_bulan: number;
    jumlah: number;
    jumlah_digenapkan: number;
    setelah_digenapkan: number;
  };
}

const SalaryReportPage: React.FC = () => {
  // State
  const [reportData, setReportData] = useState<SalaryReportResponse | null>(
    null
  );
  const [comprehensiveSalaryData, setComprehensiveSalaryData] =
    useState<ComprehensiveSalaryData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isGeneratingPDF, setIsGeneratingPDF] = useState<boolean>(false);
  const [isGeneratingExport, setIsGeneratingExport] = useState<boolean>(false);
  const [showExportDialog, setShowExportDialog] = useState<boolean>(false);
  const [exportYear, setExportYear] = useState<number>(
    new Date().getFullYear()
  );
  const [exportMonth, setExportMonth] = useState<number>(
    new Date().getMonth() + 1
  );

  // Filters
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth() + 1);

  // Tab state
  const [activeTab, setActiveTab] = useState(0); // 0 = Salary, 1 = Bank, 2 = Pinjam

  // Staff data
  const { staffs } = useStaffsCache();

  // Bank table data - now comes directly from API
  const bankTableData = useMemo(() => {
    if (!reportData?.bank_data) return [];
    return reportData.bank_data;
  }, [reportData]);

  // Generate year and month options
  const yearOptions = useMemo(() => {
    const years = [];
    const startYear = new Date().getFullYear() - 5; // Go back 5 years
    const endYear = new Date().getFullYear(); // Current year
    for (let year = endYear; year >= startYear; year--) {
      years.push({ id: year, name: year.toString() });
    }
    return years;
  }, []);

  const monthOptions = useMemo(
    () =>
      Array.from({ length: 12 }, (_, i) => ({
        id: i + 1,
        name: getMonthName(i + 1),
      })),
    []
  );

  // Load salary report on mount and filter changes
  useEffect(() => {
    fetchSalaryReport();
  }, [currentYear, currentMonth]);

  const fetchSalaryReport = async () => {
    setIsLoading(true);
    try {
      const response = await api.get(
        `/api/salary-report?year=${currentYear}&month=${currentMonth}`
      );
      setReportData(response);
      setComprehensiveSalaryData(response.comprehensive);
    } catch (error) {
      console.error("Error fetching salary report:", error);
      setReportData(null);
      setComprehensiveSalaryData(null);
    } finally {
      setIsLoading(false);
    }
  };

  const formatCurrency = (amount: number): string => {
    return new Intl.NumberFormat("en-MY", {
      style: "currency",
      currency: "MYR",
    }).format(amount);
  };

  // PDF Generation
  const generatePDF = async (action: "download" | "print") => {
    if (!reportData || reportData.data.length === 0) {
      toast.error("No data available to generate PDF");
      return;
    }

    setIsGeneratingPDF(true);
    try {
      if (activeTab === 0) {
        // Salary tab - comprehensive report (will need new PDF generator)
        toast("Comprehensive salary report PDF will be implemented soon");
      } else if (activeTab === 1) {
        // Generate Bank Report PDF
        const bankPdfData: BankReportPDFData = {
          year: reportData.year,
          month: reportData.month,
          data: bankTableData,
          total_records: reportData.total_records,
          summary: {
            total_final: reportData.summary.total_final,
          },
        };

        await generateBankReportPDF(bankPdfData, action);
        const actionText =
          action === "download" ? "downloaded" : "generated for printing";
        toast.success(`Bank report ${actionText} successfully`);
      } else {
        // Generate Pinjam (Salary) Report PDF
        const pdfData: SalaryReportPDFData = {
          year: reportData.year,
          month: reportData.month,
          data: reportData.data,
          total_records: reportData.total_records,
          summary: reportData.summary,
        };

        await generateSalaryReportPDF(pdfData, action);
        const actionText =
          action === "download" ? "downloaded" : "generated for printing";
        toast.success(`Pinjam report ${actionText} successfully`);
      }
    } catch (error) {
      console.error("Error generating PDF:", error);
      toast.error("Failed to generate PDF");
    } finally {
      setIsGeneratingPDF(false);
    }
  };

  // Text Export Generation
  const generateExportURL = () => {
    // Determine server URL based on environment
    const isProduction = window.location.hostname === "tienhock.com";
    const baseURL = isProduction
      ? "https://api.tienhock.com"
      : "http://localhost:5001";
    const url = `${baseURL}/api/excel/payment-export?year=${exportYear}&month=${exportMonth}&api_key=foodmaker`;

    navigator.clipboard
      .writeText(url)
      .then(() => {
        toast.success("Export URL copied to clipboard!");
        setShowExportDialog(false);
      })
      .catch(() => {
        toast.error("Failed to copy URL to clipboard");
      });
  };

  const generateTextExport = async () => {
    if (!reportData || reportData.data.length === 0) {
      toast.error("No data available to export");
      return;
    }

    setIsGeneratingExport(true);
    try {
      // Generate payment date (last day of the month)
      const lastDayOfMonth = new Date(currentYear, currentMonth, 0).getDate();
      const paymentDate = `${lastDayOfMonth
        .toString()
        .padStart(2, "0")}/${currentMonth
        .toString()
        .padStart(2, "0")}/${currentYear}`;

      // Define payment date row
      const paymentDateRow = [
        "PAYMENT DATE : (DD/MM/YYYY)",
        paymentDate,
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
      ];

      // Define column headers with 2-row format
      const headerRow1 = [
        "Payment Type/ Mode : PBB/IBG/REN",
        "Bene Acct No.",
        "BIC",
        "Bene Full Name",
        "ID Type: For Intrabank & IBG NI, OI, BR, PL, ML, PP For Rentas NI, OI, BR, OT",
        "Bene Identification No / Passport",
        "Payment Amount (with 2 decimal points)",
        "Recipient Reference (shown in sender and bene statement)",
        "Other Payment Details (shown in sender and bene statement)",
        "Bene Email 1",
        "Bene Email 2",
        "Bene Mobile No. 1 (charge RM0.20 per number)",
        "Bene Mobile No. 2 (charge RM0.20 per number)",
        "Joint Bene Name",
        "Joint Bene Identification No.",
        "Joint ID Type: For Intrabank & IBG NI, OI, BR, PL, ML, PP For Rentas NI, OI, BR, OT",
        "E-mail Content Line 1 (will be shown in bene email)",
        "E-mail Content Line 2 (will be shown in bene email)",
        "E-mail Content Line 3 (will be shown in bene email)",
        "E-mail Content Line 4 (will be shown in bene email)",
        "E-mail Content Line 5 (will be shown in bene email)",
      ];

      const headerRow2 = [
        "(M) - Char: 3 - A",
        "(M) - Char: 20 - N",
        "(M) - Char: 11 - A",
        "(M) - Char: 120 - A",
        "(M) - Char: 2 - A",
        "(O) - Char: 29 - AN",
        "(M) - Char: 18 - N",
        "(M) - Char: 20 - AN",
        "(O) - Char: 20 - AN",
        "(O) - Char: 70 - AN",
        "(O) - Char: 70 - AN",
        "(O) - Char: 15 - N",
        "(O) - Char: 15 - N",
        "(O) - Char: 120 - A",
        "(O) - Char: 29 - AN",
        "(O) - Char: 2 - A",
        "(O) - Char: 40 - AN",
        "(O) - Char: 40 - AN",
        "(O) - Char: 40 - AN",
        "(O) - Char: 40 - AN",
        "(O) - Char: 40 - AN",
      ];

      // Generate data rows
      const dataRows = reportData.data
        .filter((row) => parseFloat(row.final_total.toString()) > 0)
        .map((row) => {
          const staff = staffs?.find((s) => s.id === row.staff_id);
          const paymentAmount = parseFloat(row.final_total.toString()).toFixed(
            2
          );

          const columns = [
            "PBB", // Column 1
            (staff?.bankAccountNumber || "").replace(/-/g, ""), // Column 2 - remove hyphens
            "PBBEMYKL", // Column 3
            (row.staff_name || "").replace(/,/g, " "), // Column 4 - remove commas
            staff?.document || "", // Column 5
            (staff?.icNo || "").replace(/-/g, ""), // Column 6 - remove hyphens
            paymentAmount, // Column 7 - plain number format
            "Salary", // Column 8
            "",
            "",
            "",
            "",
            "",
            "",
            "",
            "", // Columns 9-16
            "Content Line 1", // Column 17
            "Content Line 2", // Column 18
            "Content Line 3", // Column 19
            "Content Line 4", // Column 20
            "Content Line 5", // Column 21
          ];

          return columns;
        });

      // Calculate total payment amount
      const totalAmount = reportData.data
        .filter((row) => parseFloat(row.final_total.toString()) > 0)
        .reduce((sum, row) => sum + parseFloat(row.final_total.toString()), 0);

      // Create total row
      const totalRow = [
        "TOTAL:",
        "",
        "",
        "",
        "",
        "",
        totalAmount.toFixed(2),
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
      ];

      // Combine all rows
      const allRows = [
        paymentDateRow,
        headerRow1,
        headerRow2,
        ...dataRows,
        totalRow,
      ];

      // Convert to text format (semicolon separated)
      const textContent = allRows.map((row) => row.join(";")).join("\r\n");

      // Create and download the file
      const blob = new Blob([textContent], {
        type: "text/plain;charset=utf-8",
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `payment-export-${currentMonth
        .toString()
        .padStart(2, "0")}-${currentYear}.txt`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      toast.success("Payment export file downloaded successfully");
    } catch (error) {
      console.error("Error generating text export:", error);
      toast.error("Failed to generate text export");
    } finally {
      setIsGeneratingExport(false);
    }
  };

  // Comprehensive Salary Table Component
  const ComprehensiveSalaryTable = () => {
    if (!comprehensiveSalaryData) return null;

    return (
      <div className="overflow-x-auto">
        <table className="w-full border border-default-200 rounded-lg overflow-hidden">
          <thead className="bg-default-50 border-b border-default-200">
            <tr>
              <th className="px-2 py-2 text-center text-sm font-semibold text-default-600 uppercase tracking-wider">
                BIL
              </th>
              <th className="px-2 py-2 text-left text-sm font-semibold text-default-600 uppercase tracking-wider">
                BAHAGIAN KERJA
              </th>
              <th className="px-2 py-2 text-center text-sm font-semibold text-default-600 uppercase tracking-wider">
                GAJI
              </th>
              <th className="px-2 py-2 text-center text-sm font-semibold text-default-600 uppercase tracking-wider">
                OT
              </th>
              <th className="px-2 py-2 text-center text-sm font-semibold text-default-600 uppercase tracking-wider">
                BONUS
              </th>
              <th className="px-2 py-2 text-center text-sm font-semibold text-default-600 uppercase tracking-wider">
                COMM
              </th>
              <th className="px-2 py-2 text-center text-sm font-semibold text-default-600 uppercase tracking-wider">
                GAJI KASAR
              </th>
              <th
                className="px-1 py-2 text-center text-sm font-semibold text-default-600 uppercase tracking-wider border-l border-default-300"
                colSpan={2}
              >
                EPF
              </th>
              <th
                className="px-1 py-2 text-center text-sm font-semibold text-default-600 uppercase tracking-wider border-l border-default-300"
                colSpan={2}
              >
                SOCSO
              </th>
              <th
                className="px-1 py-2 text-center text-sm font-semibold text-default-600 uppercase tracking-wider border-l border-default-300"
                colSpan={2}
              >
                SIP
              </th>
              <th className="px-2 py-2 text-center text-sm font-semibold text-default-600 uppercase tracking-wider border-l border-default-300">
                PCB
              </th>
              <th className="px-2 py-2 text-center text-sm font-semibold text-default-600 uppercase tracking-wider">
                GAJI BERSIH
              </th>
              <th className="px-2 py-2 text-center text-sm font-semibold text-default-600 uppercase tracking-wider">
                1/2 BULAN
              </th>
              <th className="px-2 py-2 text-center text-sm font-semibold text-default-600 uppercase tracking-wider">
                JUMLAH
              </th>
              <th className="px-2 py-2 text-center text-sm font-semibold text-default-600 uppercase tracking-wider">
                JUMLAH DIGENAPKAN
              </th>
              <th className="px-2 py-2 text-center text-sm font-semibold text-default-600 uppercase tracking-wider">
                SETELAH DIGENAPKAN
              </th>
            </tr>
            <tr className="bg-default-50 border-t border-default-200">
              <th></th>
              <th></th>
              <th></th>
              <th></th>
              <th></th>
              <th></th>
              <th></th>
              <th className="px-1 py-2 text-center text-sm font-semibold text-default-400 uppercase">
                MAJ
              </th>
              <th className="px-1 py-2 text-center text-sm font-semibold text-default-400 uppercase">
                PKJ
              </th>
              <th className="px-1 py-2 text-center text-sm font-semibold text-default-400 uppercase">
                MAJ
              </th>
              <th className="px-1 py-2 text-center text-sm font-semibold text-default-400 uppercase">
                PKJ
              </th>
              <th className="px-1 py-2 text-center text-sm font-semibold text-default-400 uppercase">
                MAJ
              </th>
              <th className="px-1 py-2 text-center text-sm font-semibold text-default-400 uppercase">
                PKJ
              </th>
              <th></th>
              <th></th>
              <th></th>
              <th></th>
              <th></th>
              <th></th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-default-200">
            {LOCATION_ORDER.map((item, index) => {
              if (item.type === "header") {
                return (
                  <tr key={`header-${index}`} className="bg-default-100">
                    <td
                      colSpan={19}
                      className="px-2 py-2 text-center text-sm font-medium text-default-600 border-t border-default-300"
                    >
                      {item.text}
                    </td>
                  </tr>
                );
              }

              const locationData = comprehensiveSalaryData.locations.find(
                (loc) => loc.location === item.id
              );
              const locationNumber = item.id!;
              const locationName = LOCATION_MAP[item.id!];

              return (
                <tr key={item.id} className={index % 2 === 0 ? "bg-white" : "bg-default-25"}>
                  <td className="px-2 py-2 text-sm text-default-900 text-center">
                    {locationNumber}
                  </td>
                  <td className="px-2 py-2 text-sm text-default-600 text-left">
                    {locationName}
                  </td>
                  <td className="px-2 py-2 text-sm text-default-600 text-center">
                    {formatCurrency(locationData?.totals.gaji || 0)}
                  </td>
                  <td className="px-2 py-2 text-sm text-default-600 text-center">
                    {formatCurrency(locationData?.totals.ot || 0)}
                  </td>
                  <td className="px-2 py-2 text-sm text-default-600 text-center">
                    {formatCurrency(locationData?.totals.bonus || 0)}
                  </td>
                  <td className="px-2 py-2 text-sm text-default-600 text-center">
                    {formatCurrency(locationData?.totals.comm || 0)}
                  </td>
                  <td className="px-2 py-2 text-sm text-default-600 text-center">
                    {formatCurrency(locationData?.totals.gaji_kasar || 0)}
                  </td>
                  <td className="px-1 py-2 text-sm text-default-600 text-center border-l border-default-300">
                    {formatCurrency(locationData?.totals.epf_majikan || 0)}
                  </td>
                  <td className="px-1 py-2 text-sm text-default-600 text-center">
                    {formatCurrency(locationData?.totals.epf_pekerja || 0)}
                  </td>
                  <td className="px-1 py-2 text-sm text-default-600 text-center border-l border-default-300">
                    {formatCurrency(locationData?.totals.socso_majikan || 0)}
                  </td>
                  <td className="px-1 py-2 text-sm text-default-600 text-center">
                    {formatCurrency(locationData?.totals.socso_pekerja || 0)}
                  </td>
                  <td className="px-1 py-2 text-sm text-default-600 text-center border-l border-default-300">
                    {formatCurrency(locationData?.totals.sip_majikan || 0)}
                  </td>
                  <td className="px-1 py-2 text-sm text-default-600 text-center">
                    {formatCurrency(locationData?.totals.sip_pekerja || 0)}
                  </td>
                  <td className="px-2 py-2 text-sm text-default-600 text-center border-l border-default-300">
                    {formatCurrency(locationData?.totals.pcb || 0)}
                  </td>
                  <td className="px-2 py-2 text-sm text-default-600 text-center">
                    {formatCurrency(locationData?.totals.gaji_bersih || 0)}
                  </td>
                  <td className="px-2 py-2 text-sm text-default-600 text-center">
                    {formatCurrency(locationData?.totals.setengah_bulan || 0)}
                  </td>
                  <td className="px-2 py-2 text-sm text-default-600 text-center">
                    {formatCurrency(locationData?.totals.jumlah || 0)}
                  </td>
                  <td className="px-2 py-2 text-sm text-default-600 text-center">
                    {formatCurrency(
                      locationData?.totals.jumlah_digenapkan || 0
                    )}
                  </td>
                  <td className="px-2 py-2 text-sm text-default-600 text-center">
                    {formatCurrency(
                      locationData?.totals.setelah_digenapkan || 0
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot className="bg-default-100 border-t-2 border-default-300">
            <tr>
              <td
                colSpan={2}
                className="px-2 py-2 text-sm font-bold text-default-700 text-center"
              >
                GRAND TOTAL
              </td>
              <td className="px-2 py-2 text-sm font-bold text-default-900 text-center">
                {formatCurrency(comprehensiveSalaryData.grand_totals.gaji)}
              </td>
              <td className="px-2 py-2 text-sm font-bold text-default-900 text-center">
                {formatCurrency(comprehensiveSalaryData.grand_totals.ot)}
              </td>
              <td className="px-2 py-2 text-sm font-bold text-default-900 text-center">
                {formatCurrency(comprehensiveSalaryData.grand_totals.bonus)}
              </td>
              <td className="px-2 py-2 text-sm font-bold text-default-900 text-center">
                {formatCurrency(comprehensiveSalaryData.grand_totals.comm)}
              </td>
              <td className="px-2 py-2 text-sm font-bold text-default-900 text-center">
                {formatCurrency(
                  comprehensiveSalaryData.grand_totals.gaji_kasar
                )}
              </td>
              <td className="px-1 py-2 text-sm font-bold text-default-900 text-center border-l border-default-300">
                {formatCurrency(
                  comprehensiveSalaryData.grand_totals.epf_majikan
                )}
              </td>
              <td className="px-1 py-2 text-sm font-bold text-default-900 text-center">
                {formatCurrency(
                  comprehensiveSalaryData.grand_totals.epf_pekerja
                )}
              </td>
              <td className="px-1 py-2 text-sm font-bold text-default-900 text-center border-l border-default-300">
                {formatCurrency(
                  comprehensiveSalaryData.grand_totals.socso_majikan
                )}
              </td>
              <td className="px-1 py-2 text-sm font-bold text-default-900 text-center">
                {formatCurrency(
                  comprehensiveSalaryData.grand_totals.socso_pekerja
                )}
              </td>
              <td className="px-1 py-2 text-sm font-bold text-default-900 text-center border-l border-default-300">
                {formatCurrency(
                  comprehensiveSalaryData.grand_totals.sip_majikan
                )}
              </td>
              <td className="px-1 py-2 text-sm font-bold text-default-900 text-center">
                {formatCurrency(
                  comprehensiveSalaryData.grand_totals.sip_pekerja
                )}
              </td>
              <td className="px-2 py-2 text-sm font-bold text-default-900 text-center border-l border-default-300">
                {formatCurrency(comprehensiveSalaryData.grand_totals.pcb)}
              </td>
              <td className="px-2 py-2 text-sm font-bold text-default-900 text-center">
                {formatCurrency(
                  comprehensiveSalaryData.grand_totals.gaji_bersih
                )}
              </td>
              <td className="px-2 py-2 text-sm font-bold text-default-900 text-center">
                {formatCurrency(
                  comprehensiveSalaryData.grand_totals.setengah_bulan
                )}
              </td>
              <td className="px-2 py-2 text-sm font-bold text-default-900 text-center">
                {formatCurrency(comprehensiveSalaryData.grand_totals.jumlah)}
              </td>
              <td className="px-2 py-2 text-sm font-bold text-default-900 text-center">
                {formatCurrency(
                  comprehensiveSalaryData.grand_totals.jumlah_digenapkan
                )}
              </td>
              <td className="px-2 py-2 text-sm font-bold text-default-900 text-center">
                {formatCurrency(
                  comprehensiveSalaryData.grand_totals.setelah_digenapkan
                )}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    );
  };

  // Export Dialog Component
  const ExportDialog = () => (
    <Transition appear show={showExportDialog} as={React.Fragment}>
      <Dialog
        as="div"
        className="fixed inset-0 z-50"
        onClose={() => setShowExportDialog(false)}
      >
        <div className="min-h-screen px-4 text-center">
          <TransitionChild
            as={React.Fragment}
            enter="ease-out duration-300"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="ease-in duration-200"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <DialogPanel
              className="fixed inset-0 bg-black opacity-30"
              onClick={() => setShowExportDialog(false)}
            />
          </TransitionChild>

          <span
            className="inline-block h-screen align-middle"
            aria-hidden="true"
          >
            &#8203;
          </span>

          <TransitionChild
            as={React.Fragment}
            enter="ease-out duration-300"
            enterFrom="opacity-0 scale-95"
            enterTo="opacity-100 scale-100"
            leave="ease-in duration-200"
            leaveFrom="opacity-100 scale-100"
            leaveTo="opacity-0 scale-95"
          >
            <DialogPanel
              className="inline-block w-full max-w-md p-6 my-8 text-left align-middle transition-all transform bg-white shadow-xl rounded-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <DialogTitle
                as="h3"
                className="text-lg font-medium leading-6 text-default-900"
              >
                Export Link Generator
              </DialogTitle>
              <div className="mt-4 space-y-4">
                <FormListbox
                  name="exportYear"
                  label="Year"
                  value={exportYear.toString()}
                  onChange={(value) => setExportYear(Number(value))}
                  options={yearOptions}
                />
                <FormListbox
                  name="exportMonth"
                  label="Month"
                  value={exportMonth.toString()}
                  onChange={(value) => setExportMonth(Number(value))}
                  options={monthOptions}
                />
              </div>
              <div className="flex justify-end space-x-3 mt-6">
                <Button
                  onClick={() => setShowExportDialog(false)}
                  variant="outline"
                  size="sm"
                >
                  Cancel
                </Button>
                <Button onClick={generateExportURL} color="blue" size="sm">
                  Copy URL
                </Button>
              </div>
            </DialogPanel>
          </TransitionChild>
        </div>
      </Dialog>
    </Transition>
  );

  // Bank Table Component
  const BankTable = () => (
    <div className="overflow-x-auto">
      <table className="w-full border border-default-200 rounded-lg overflow-hidden">
        <thead className="bg-default-50 border-b border-default-200">
          <tr>
            <th className="px-2 py-2 text-left text-sm font-semibold text-default-600 uppercase tracking-wider">
              NO.
            </th>
            <th className="px-2 py-2 text-left text-sm font-semibold text-default-600 uppercase tracking-wider">
              STAFF NAME
            </th>
            <th className="px-2 py-2 text-left text-sm font-semibold text-default-600 uppercase tracking-wider">
              IC NO.
            </th>
            <th className="px-2 py-2 text-left text-sm font-semibold text-default-600 uppercase tracking-wider">
              BANK ACCOUNT NUMBER
            </th>
            <th className="px-2 py-2 text-right text-sm font-semibold text-default-600 uppercase tracking-wider">
              TOTAL
            </th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-default-200">
          {bankTableData.map((item, index) => (
            <tr key={item.no} className={index % 2 === 0 ? "bg-white" : "bg-default-25"}>
              <td className="px-2 py-2 text-sm text-default-900">
                {item.no}
              </td>
              <td className="px-2 py-2 text-sm text-default-900 font-medium">
                {item.staff_name}
              </td>
              <td className="px-2 py-2 text-sm text-default-600">
                {item.icNo}
              </td>
              <td className="px-2 py-2 text-sm text-default-600">
                {item.bankAccountNumber}
              </td>
              <td className="px-2 py-2 text-sm text-default-900 font-medium text-right">
                {formatCurrency(item.total)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  // Pinjam Table Component
  const PinjamTable = () => (
    <div className="overflow-x-auto">
      <table className="w-full border border-default-200 rounded-lg overflow-hidden">
        <thead className="bg-default-50 border-b border-default-200">
          <tr>
            <th className="px-2 py-2 text-left text-sm font-semibold text-default-600 uppercase tracking-wider">
              NO.
            </th>
            <th className="px-2 py-2 text-left text-sm font-semibold text-default-600 uppercase tracking-wider">
              STAFF/ID
            </th>
            <th className="px-2 py-2 text-right text-sm font-semibold text-default-600 uppercase tracking-wider">
              GAJI/GENAP
            </th>
            <th className="px-2 py-2 text-right text-sm font-semibold text-default-600 uppercase tracking-wider">
              TOTAL PINJAM
            </th>
            <th className="px-2 py-2 text-right text-sm font-semibold text-default-600 uppercase tracking-wider">
              TOTAL
            </th>
            <th className="px-2 py-2 text-center text-sm font-semibold text-default-600 uppercase tracking-wider">
              PAYMENT
            </th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-default-200">
          {reportData?.data.map((item, index) => (
            <tr key={item.staff_id} className={index % 2 === 0 ? "bg-white" : "bg-default-25"}>
              <td className="px-2 py-2 text-sm text-default-900">
                {item.no}
              </td>
              <td className="px-2 py-2">
                <div className="text-sm text-default-900 font-medium">
                  {item.staff_id} - {item.staff_name}
                </div>
              </td>
              <td className="px-2 py-2 text-sm text-default-600 text-right">
                {formatCurrency(item.gaji_genap)}
              </td>
              <td className="px-2 py-2 text-sm text-default-600 text-right">
                {formatCurrency(item.total_pinjam)}
              </td>
              <td className="px-2 py-2 text-sm text-default-900 font-medium text-right">
                {formatCurrency(item.final_total)}
              </td>
              <td className="px-2 py-2 text-sm text-default-900 text-center">
                <span
                  className={`inline-flex px-2 py-1 text-sm font-semibold rounded-full ${
                    item.payment_preference === "Bank"
                      ? "bg-sky-100 text-sky-800"
                      : "bg-emerald-100 text-emerald-800"
                  }`}
                >
                  {item.payment_preference}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="relative w-full space-y-4 mx-4 mb-4 md:mx-6">
      <div className="flex flex-col md:flex-row justify-between items-center">
        <h1 className="text-xl font-semibold text-default-800">
          Salary Report
        </h1>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg border border-default-200 shadow-sm p-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <FormListbox
            name="year"
            label="Year"
            value={currentYear.toString()}
            onChange={(value) => setCurrentYear(Number(value))}
            options={yearOptions}
          />
          <FormListbox
            name="month"
            label="Month"
            value={currentMonth.toString()}
            onChange={(value) => setCurrentMonth(Number(value))}
            options={monthOptions}
          />
          {reportData && (
            <div className="flex items-end">
              <div className="text-sm text-default-600">
                <div className="font-medium">
                  Total: {reportData.total_records} employees
                </div>
                <div className="font-medium">
                  Grand Total: {formatCurrency(reportData.summary.total_final)}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Salary Report Table */}
      <div className="bg-white rounded-lg border border-default-200 shadow-sm">
        <div className="px-6 py-4 border-b border-default-200">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-medium text-default-800">
              {getMonthName(currentMonth)} {currentYear} Salary Report
            </h2>
            <div className="flex space-x-3">
              <Button
                onClick={fetchSalaryReport}
                icon={IconRefresh}
                variant="outline"
                disabled={isLoading}
                size="sm"
              >
                Refresh
              </Button>
              <div className="flex space-x-2">
                <Button
                  onClick={() => generatePDF("print")}
                  icon={IconPrinter}
                  color="green"
                  variant="outline"
                  disabled={
                    !reportData ||
                    reportData.data.length === 0 ||
                    isGeneratingPDF
                  }
                  size="sm"
                >
                  Print
                </Button>
                <Button
                  onClick={() => generatePDF("download")}
                  icon={IconDownload}
                  color="blue"
                  variant="outline"
                  disabled={
                    !reportData ||
                    reportData.data.length === 0 ||
                    isGeneratingPDF
                  }
                  size="sm"
                >
                  Download
                </Button>
                {activeTab === 1 && (
                  <>
                    <Button
                      onClick={generateTextExport}
                      icon={IconFileExport}
                      color="purple"
                      variant="outline"
                      disabled={
                        !reportData ||
                        reportData.data.length === 0 ||
                        isGeneratingExport
                      }
                      size="sm"
                    >
                      Export
                    </Button>
                    <Button
                      onClick={() => setShowExportDialog(true)}
                      icon={IconLink}
                      color="orange"
                      variant="outline"
                      size="sm"
                    >
                      Export Link
                    </Button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <LoadingSpinner />
          </div>
        ) : !reportData || reportData.data.length === 0 ? (
          <div className="text-center py-12 text-default-500">
            <IconFileText className="mx-auto h-12 w-12 text-default-300 mb-4" />
            <p className="text-lg font-medium">No salary data found</p>
            <p>
              No salary data available for {getMonthName(currentMonth)}{" "}
              {currentYear}
            </p>
          </div>
        ) : (
          <>
            <div className="px-6 py-4">
              <Tab
                labels={["Salary", "Bank", "Pinjam"]}
                defaultActiveTab={activeTab}
                onTabChange={setActiveTab}
              >
                <div>
                  <ComprehensiveSalaryTable />
                </div>
                <div>
                  <BankTable />
                </div>
                <div>
                  <PinjamTable />
                </div>
              </Tab>
            </div>

            {/* Summary Footer */}
            <div className="bg-default-50 px-6 py-4 border-t border-default-200">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center space-y-2 md:space-y-0">
                <div className="text-sm text-default-600">
                  <span className="font-medium">Total Records:</span>{" "}
                  {reportData.total_records}
                </div>
                <div className="flex flex-col md:flex-row space-y-1 md:space-y-0 md:space-x-6 text-sm">
                  <div className="text-default-700">
                    <span className="font-medium">Total Gaji/Genap:</span>{" "}
                    <span className="text-default-900">
                      {formatCurrency(reportData.summary.total_gaji_genap)}
                    </span>
                  </div>
                  <div className="text-default-700">
                    <span className="font-medium">Total Pinjam:</span>{" "}
                    <span className="text-default-900">
                      {formatCurrency(reportData.summary.total_pinjam)}
                    </span>
                  </div>
                  <div className="text-sky-700">
                    <span className="font-semibold">Grand Total:</span>{" "}
                    <span className="font-bold text-sky-800">
                      {formatCurrency(reportData.summary.total_final)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Export Dialog */}
      <ExportDialog />
    </div>
  );
};

export default SalaryReportPage;
