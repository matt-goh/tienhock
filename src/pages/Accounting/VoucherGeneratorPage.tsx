// src/pages/Accounting/VoucherGeneratorPage.tsx
import React, { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../../routes/utils/api";
import toast from "react-hot-toast";
import LoadingSpinner from "../../components/LoadingSpinner";
import Button from "../../components/Button";
import MonthNavigator from "../../components/MonthNavigator";
import {
  IconFileInvoice,
  IconCheck,
  IconAlertCircle,
  IconExternalLink,
  IconAlertTriangle,
  IconCash,
  IconReceipt,
  IconBuildingBank,
} from "@tabler/icons-react";

// ============================================================================
// Types
// ============================================================================

interface VoucherLocation {
  location_id: string;
  location_name: string;
  salary: number;
  epf_employer: number;
  socso_employer: number;
  sip_employer: number;
  pcb: number;
  net_salary: number;
  accounts: {
    salary: string | null;
    epf_employer: string | null;
    socso_employer: string | null;
    sip_employer: string | null;
    accrual_salary?: string | null;
    accrual_epf?: string | null;
    accrual_socso?: string | null;
    accrual_sip?: string | null;
    accrual_pcb?: string | null;
  };
}

interface VoucherData {
  reference: string;
  exists: boolean;
  entry_id: number | null;
  locations: VoucherLocation[];
  totals?: {
    salary: number;
    epf_employer: number;
    socso_employer: number;
    sip_employer: number;
    pcb: number;
    accrual_accounts: Record<string, string>;
  };
}

interface PreviewData {
  year: number;
  month: number;
  jvdr: VoucherData;
  jvsl: VoucherData;
}

// ============================================================================
// Helper Components
// ============================================================================

// Mini Summary Card for displaying totals
interface MiniSummaryCardProps {
  label: string;
  value: number;
  sublabel?: string;
  color?: "blue" | "amber" | "green" | "purple" | "default";
  icon?: React.ReactNode;
}

const MiniSummaryCard: React.FC<MiniSummaryCardProps> = ({
  label,
  value,
  sublabel,
  color = "default",
  icon,
}) => {
  const formatCurrency = (amount: number): string => {
    return new Intl.NumberFormat("en-MY", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  };

  const colorClasses = {
    blue: "bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800",
    amber: "bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800",
    green: "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800",
    purple: "bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-800",
    default: "bg-default-50 dark:bg-gray-800 border-default-200 dark:border-gray-700",
  };

  const textClasses = {
    blue: "text-blue-700 dark:text-blue-300",
    amber: "text-amber-700 dark:text-amber-300",
    green: "text-green-700 dark:text-green-300",
    purple: "text-purple-700 dark:text-purple-300",
    default: "text-default-700 dark:text-gray-300",
  };

  return (
    <div className={`p-3 rounded-lg border ${colorClasses[color]}`}>
      <div className="flex items-center gap-2 mb-1">
        {icon && <span className={`${textClasses[color]} opacity-70`}>{icon}</span>}
        <span className={`text-xs font-medium ${textClasses[color]}`}>{label}</span>
      </div>
      <div className={`text-lg font-semibold font-mono ${textClasses[color]}`}>
        {formatCurrency(value)}
      </div>
      {sublabel && (
        <div className="text-[10px] text-default-500 dark:text-gray-400 mt-0.5 font-mono">
          {sublabel}
        </div>
      )}
    </div>
  );
};

// Account Code Tooltip - shows account details on hover
interface AccountCodeTooltipProps {
  amount: number;
  accountCode: string | null;
  accountDescription?: string;
  type?: "expense" | "payable";
}

const AccountCodeTooltip: React.FC<AccountCodeTooltipProps> = ({
  amount,
  accountCode,
  accountDescription,
  type = "expense",
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const [tooltipPos, setTooltipPos] = useState({ top: 0, left: 0, placement: "top" as "top" | "bottom" });
  const triggerRef = useRef<HTMLSpanElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const hideTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const formatCurrency = (val: number): string => {
    return new Intl.NumberFormat("en-MY", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(val);
  };

  const handleMouseEnter = useCallback(() => {
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }
    setIsVisible(true);
  }, []);

  const handleMouseLeave = useCallback(() => {
    hideTimeoutRef.current = setTimeout(() => {
      setIsVisible(false);
    }, 150);
  }, []);

  useEffect(() => {
    return () => {
      if (hideTimeoutRef.current) {
        clearTimeout(hideTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (isVisible && triggerRef.current && tooltipRef.current) {
      const triggerRect = triggerRef.current.getBoundingClientRect();
      const tooltipHeight = tooltipRef.current.offsetHeight;
      const tooltipWidth = tooltipRef.current.offsetWidth;

      const spaceAbove = triggerRect.top;
      const spaceBelow = window.innerHeight - triggerRect.bottom;

      const placement: "top" | "bottom" =
        spaceAbove < tooltipHeight + 10 && spaceBelow > spaceAbove ? "bottom" : "top";

      let top: number;
      if (placement === "bottom") {
        top = triggerRect.bottom + 6;
      } else {
        top = triggerRect.top - tooltipHeight - 6;
      }

      let left = triggerRect.left + triggerRect.width / 2 - tooltipWidth / 2;
      const padding = 8;
      if (left < padding) {
        left = padding;
      } else if (left + tooltipWidth > window.innerWidth - padding) {
        left = window.innerWidth - tooltipWidth - padding;
      }

      setTooltipPos({ top, left, placement });
    }
  }, [isVisible]);

  // If no account code, show plain amount
  if (!accountCode) {
    return (
      <span className="font-mono text-default-700 dark:text-gray-200">
        {formatCurrency(amount)}
      </span>
    );
  }

  return (
    <span
      ref={triggerRef}
      className="relative inline-block cursor-help border-b border-dashed border-default-400 dark:border-gray-500 font-mono text-default-700 dark:text-gray-200"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {formatCurrency(amount)}

      {isVisible && (
        <div
          ref={tooltipRef}
          className="fixed z-[9999]"
          style={{
            top: tooltipPos.top,
            left: tooltipPos.left,
            minWidth: "180px",
            maxWidth: "240px",
          }}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          <div className="bg-gray-900 dark:bg-gray-700 text-white text-xs rounded-lg shadow-lg p-3">
            <div className="font-medium text-gray-300 dark:text-gray-200 mb-1.5 pb-1.5 border-b border-gray-700 dark:border-gray-600">
              Account Details
            </div>
            <div className="space-y-1.5">
              <div className="flex justify-between gap-2">
                <span className="text-gray-400">Code:</span>
                <span className="font-mono text-sky-400">{accountCode}</span>
              </div>
              {accountDescription && (
                <div className="flex justify-between gap-2">
                  <span className="text-gray-400">Name:</span>
                  <span className="text-gray-200 text-right">{accountDescription}</span>
                </div>
              )}
              <div className="flex justify-between gap-2">
                <span className="text-gray-400">Type:</span>
                <span className={type === "expense" ? "text-blue-400" : "text-amber-400"}>
                  {type === "expense" ? "Expense" : "Payable"}
                </span>
              </div>
            </div>
            <div
              className={`absolute left-1/2 transform -translate-x-1/2 w-2 h-2 bg-gray-900 dark:bg-gray-700 rotate-45 ${
                tooltipPos.placement === "bottom" ? "-top-1" : "-bottom-1"
              }`}
            />
          </div>
        </div>
      )}
    </span>
  );
};

// ============================================================================
// Main Component
// ============================================================================

const VoucherGeneratorPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // Initialize selectedMonth from URL params or default to current month
  const getInitialMonth = (): Date => {
    const urlYear = searchParams.get("year");
    const urlMonth = searchParams.get("month");
    if (urlYear && urlMonth) {
      return new Date(parseInt(urlYear), parseInt(urlMonth) - 1, 1);
    }
    return new Date();
  };

  const [selectedMonth, setSelectedMonth] = useState<Date>(getInitialMonth);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [previewData, setPreviewData] = useState<PreviewData | null>(null);
  const [helpLanguage, setHelpLanguage] = useState<"ms" | "en">("ms");

  // Update URL params when month changes
  const handleMonthChange = (date: Date) => {
    setSelectedMonth(date);
    setSearchParams({
      year: date.getFullYear().toString(),
      month: (date.getMonth() + 1).toString(),
    });
  };

  // Fetch preview data
  const fetchPreview = useCallback(async () => {
    setLoading(true);
    try {
      const year = selectedMonth.getFullYear();
      const month = selectedMonth.getMonth() + 1;
      const response = await api.get(`/api/journal-vouchers/preview/${year}/${month}`);
      setPreviewData(response as PreviewData);
    } catch (error) {
      console.error("Error fetching preview:", error);
      toast.error("Failed to load voucher preview");
    } finally {
      setLoading(false);
    }
  }, [selectedMonth]);

  useEffect(() => {
    fetchPreview();
  }, [fetchPreview]);

  // Generate vouchers
  const handleGenerate = async (voucherTypes: string[]) => {
    setGenerating(true);
    try {
      const year = selectedMonth.getFullYear();
      const month = selectedMonth.getMonth() + 1;

      const response = await api.post("/api/journal-vouchers/generate", {
        year,
        month,
        voucher_types: voucherTypes,
      }) as { results: { jvdr?: { created?: boolean; skipped?: boolean; message?: string }; jvsl?: { created?: boolean; skipped?: boolean; message?: string } } };

      const results = response.results;
      let successCount = 0;
      let skippedCount = 0;

      if (results.jvdr) {
        if (results.jvdr.created) successCount++;
        if (results.jvdr.skipped) skippedCount++;
      }
      if (results.jvsl) {
        if (results.jvsl.created) successCount++;
        if (results.jvsl.skipped) skippedCount++;
      }

      if (successCount > 0) {
        toast.success(`Generated ${successCount} voucher(s) successfully`);
      }
      if (skippedCount > 0) {
        toast(`${skippedCount} voucher(s) already exist`, { icon: "⚠️" });
      }

      // Refresh preview
      fetchPreview();
    } catch (error: unknown) {
      console.error("Error generating vouchers:", error);
      const errorMessage = error instanceof Error ? error.message : "Failed to generate vouchers";
      toast.error(errorMessage);
    } finally {
      setGenerating(false);
    }
  };

  const formatCurrency = (amount: number): string => {
    return new Intl.NumberFormat("en-MY", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  };

  const handleViewEntry = (entryId: number | null) => {
    if (entryId) {
      navigate(`/accounting/journal-entries/${entryId}`);
    }
  };

  // Calculate totals for JVDR
  const calculateJVDRTotals = (locations: VoucherLocation[]) => {
    const totalExpenses = locations.reduce(
      (sum, loc) => sum + loc.salary + loc.epf_employer + loc.socso_employer + loc.sip_employer,
      0
    );
    const totalPayables = locations.reduce(
      (sum, loc) => sum + loc.pcb + loc.net_salary,
      0
    );
    const totalContributions = locations.reduce(
      (sum, loc) => sum + loc.epf_employer + loc.socso_employer + loc.sip_employer,
      0
    );
    return { totalExpenses, totalPayables, totalContributions };
  };

  // Calculate totals for JVSL
  const calculateJVSLTotals = (locations: VoucherLocation[]) => {
    return {
      totalSalary: locations.reduce((sum, loc) => sum + loc.salary, 0),
      totalEPF: locations.reduce((sum, loc) => sum + loc.epf_employer, 0),
      totalSOCSO: locations.reduce((sum, loc) => sum + loc.socso_employer, 0),
      totalSIP: locations.reduce((sum, loc) => sum + loc.sip_employer, 0),
      totalPCB: locations.reduce((sum, loc) => sum + loc.pcb, 0),
      totalNetSalary: locations.reduce((sum, loc) => sum + loc.net_salary, 0),
    };
  };

  // Check for missing mappings in JVSL
  const getMissingMappings = (loc: VoucherLocation): string[] => {
    return [
      !loc.accounts.salary && loc.salary > 0 ? "Salary" : null,
      !loc.accounts.epf_employer && loc.epf_employer > 0 ? "EPF" : null,
      !loc.accounts.socso_employer && loc.socso_employer > 0 ? "SOCSO" : null,
      !loc.accounts.sip_employer && loc.sip_employer > 0 ? "SIP" : null,
    ].filter(Boolean) as string[];
  };

  const hasAnyMissingMappings = (locations: VoucherLocation[]): boolean => {
    return locations.some((loc) => getMissingMappings(loc).length > 0);
  };

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="mb-4 flex flex-col lg:flex-row justify-between lg:items-center gap-4">
        <div>
          <h1 className="text-xl font-semibold text-default-800 dark:text-gray-100">
            Payroll Voucher Generator
          </h1>
          <p className="text-sm text-default-500 dark:text-gray-400 mt-1">
            Generate journal vouchers from payroll data
          </p>
        </div>

        <div className="flex items-center gap-3">
          <MonthNavigator
            selectedMonth={selectedMonth}
            onChange={handleMonthChange}
            showGoToCurrentButton={false}
          />
          <Button
            onClick={() => handleGenerate(["JVDR", "JVSL"])}
            color="sky"
            variant="filled"
            icon={IconFileInvoice}
            iconPosition="left"
            size="md"
            disabled={loading || generating}
          >
            {generating ? "Generating..." : "Generate All"}
          </Button>
        </div>
      </div>

      {/* Loading State */}
      {loading ? (
        <div className="flex justify-center my-20">
          <LoadingSpinner />
        </div>
      ) : previewData ? (
        <div className="space-y-6">
          {/* JVDR Section */}
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-default-200 dark:border-gray-700 shadow-sm overflow-hidden">
            {/* JVDR Header */}
            <div className="p-4 border-b border-default-200 dark:border-gray-700 bg-purple-50 dark:bg-purple-900/20">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-300">
                    JVDR
                  </span>
                  <div>
                    <h2 className="text-lg font-semibold text-default-800 dark:text-gray-100">
                      Director's Remuneration
                    </h2>
                    <p className="text-sm text-default-500 dark:text-gray-400">
                      Reference: {previewData.jvdr.reference}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {previewData.jvdr.exists ? (
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300">
                        <IconCheck size={14} />
                        Generated
                      </span>
                      <Button
                        onClick={() => handleViewEntry(previewData.jvdr.entry_id)}
                        color="default"
                        variant="outline"
                        icon={IconExternalLink}
                        iconPosition="left"
                        size="sm"
                      >
                        View Entry
                      </Button>
                    </div>
                  ) : (
                    <Button
                      onClick={() => handleGenerate(["JVDR"])}
                      color="purple"
                      variant="outline"
                      icon={IconFileInvoice}
                      iconPosition="left"
                      size="sm"
                      disabled={generating || previewData.jvdr.locations.length === 0}
                    >
                      Generate JVDR
                    </Button>
                  )}
                </div>
              </div>
            </div>

            {previewData.jvdr.locations.length > 0 ? (
              <>
                {/* JVDR Summary Cards */}
                <div className="p-4 border-b border-default-200 dark:border-gray-700 bg-default-50 dark:bg-gray-900/30">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <MiniSummaryCard
                      label="Total Gross Pay"
                      value={previewData.jvdr.locations.reduce((sum, loc) => sum + loc.salary, 0)}
                      color="blue"
                      icon={<IconCash size={14} />}
                    />
                    <MiniSummaryCard
                      label="Employer Contributions"
                      value={calculateJVDRTotals(previewData.jvdr.locations).totalContributions}
                      sublabel="EPF + SOCSO + SIP"
                      color="blue"
                      icon={<IconBuildingBank size={14} />}
                    />
                    <MiniSummaryCard
                      label="Tax Payable"
                      value={previewData.jvdr.locations.reduce((sum, loc) => sum + loc.pcb, 0)}
                      sublabel="PCB to LHDN"
                      color="amber"
                      icon={<IconReceipt size={14} />}
                    />
                    <MiniSummaryCard
                      label="Net Salary Payable"
                      value={previewData.jvdr.locations.reduce((sum, loc) => sum + loc.net_salary, 0)}
                      sublabel="To pay directors"
                      color="amber"
                      icon={<IconCash size={14} />}
                    />
                  </div>
                </div>

                {/* JVDR Table */}
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-default-200 dark:divide-gray-700">
                    <thead>
                      {/* Grouped Header Row */}
                      <tr className="bg-default-50 dark:bg-gray-900/50">
                        <th rowSpan={2} className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wider text-default-600 dark:text-gray-400 border-b border-default-200 dark:border-gray-700">
                          Director
                        </th>
                        <th colSpan={4} className="px-4 py-2 text-center text-xs font-medium uppercase tracking-wider bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 border-b border-blue-200 dark:border-blue-800">
                          <div>Company Expenses</div>
                          <div className="text-[10px] font-normal normal-case mt-0.5">Recorded as costs</div>
                        </th>
                        <th colSpan={2} className="px-4 py-2 text-center text-xs font-medium uppercase tracking-wider bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 border-b border-amber-200 dark:border-amber-800">
                          <div>Amounts to Pay</div>
                          <div className="text-[10px] font-normal normal-case mt-0.5">Owed to directors/govt</div>
                        </th>
                      </tr>
                      <tr className="bg-default-50 dark:bg-gray-900/50">
                        <th className="px-4 py-2 text-right text-xs font-medium uppercase tracking-wider text-default-600 dark:text-gray-400 bg-blue-50/50 dark:bg-blue-900/10">
                          Gross Pay
                        </th>
                        <th className="px-4 py-2 text-right text-xs font-medium uppercase tracking-wider text-default-600 dark:text-gray-400 bg-blue-50/50 dark:bg-blue-900/10">
                          EPF
                        </th>
                        <th className="px-4 py-2 text-right text-xs font-medium uppercase tracking-wider text-default-600 dark:text-gray-400 bg-blue-50/50 dark:bg-blue-900/10">
                          SOCSO
                        </th>
                        <th className="px-4 py-2 text-right text-xs font-medium uppercase tracking-wider text-default-600 dark:text-gray-400 bg-blue-50/50 dark:bg-blue-900/10">
                          SIP
                        </th>
                        <th className="px-4 py-2 text-right text-xs font-medium uppercase tracking-wider text-default-600 dark:text-gray-400 bg-amber-50/50 dark:bg-amber-900/10">
                          Tax
                        </th>
                        <th className="px-4 py-2 text-right text-xs font-medium uppercase tracking-wider text-default-600 dark:text-gray-400 bg-amber-50/50 dark:bg-amber-900/10">
                          Net Salary
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-default-200 dark:divide-gray-700 bg-white dark:bg-gray-800">
                      {previewData.jvdr.locations.map((loc) => (
                        <tr key={loc.location_id} className="hover:bg-default-50 dark:hover:bg-gray-700">
                          <td className="px-4 py-2.5 text-sm font-medium text-default-800 dark:text-gray-200">
                            <span className="font-mono text-purple-600 dark:text-purple-400">{loc.location_id}</span>
                            <span className="mx-1">-</span>
                            {loc.location_name || "Director"}
                          </td>
                          <td className="px-4 py-2.5 text-sm text-right bg-blue-50/30 dark:bg-blue-900/5">
                            <AccountCodeTooltip
                              amount={loc.salary}
                              accountCode={loc.accounts.salary}
                              accountDescription="Directors Remuneration"
                              type="expense"
                            />
                          </td>
                          <td className="px-4 py-2.5 text-sm text-right bg-blue-50/30 dark:bg-blue-900/5">
                            <AccountCodeTooltip
                              amount={loc.epf_employer}
                              accountCode={loc.accounts.epf_employer}
                              accountDescription="EPF Employer Contribution"
                              type="expense"
                            />
                          </td>
                          <td className="px-4 py-2.5 text-sm text-right bg-blue-50/30 dark:bg-blue-900/5">
                            <AccountCodeTooltip
                              amount={loc.socso_employer}
                              accountCode={loc.accounts.socso_employer}
                              accountDescription="SOCSO Employer Contribution"
                              type="expense"
                            />
                          </td>
                          <td className="px-4 py-2.5 text-sm text-right bg-blue-50/30 dark:bg-blue-900/5">
                            <AccountCodeTooltip
                              amount={loc.sip_employer}
                              accountCode={loc.accounts.sip_employer}
                              accountDescription="SIP Employer Contribution"
                              type="expense"
                            />
                          </td>
                          <td className="px-4 py-2.5 text-sm text-right bg-amber-50/30 dark:bg-amber-900/5">
                            <AccountCodeTooltip
                              amount={loc.pcb}
                              accountCode={loc.accounts.accrual_pcb ?? null}
                              accountDescription="PCB Payable"
                              type="payable"
                            />
                          </td>
                          <td className="px-4 py-2.5 text-sm text-right bg-amber-50/30 dark:bg-amber-900/5">
                            <AccountCodeTooltip
                              amount={loc.net_salary}
                              accountCode={loc.accounts.accrual_salary ?? null}
                              accountDescription="Salary Payable"
                              type="payable"
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-default-100 dark:bg-gray-900/50">
                      <tr className="font-semibold">
                        <td className="px-4 py-2.5 text-sm text-default-800 dark:text-gray-200">
                          Total
                        </td>
                        <td className="px-4 py-2.5 text-sm text-right font-mono text-default-800 dark:text-gray-200 bg-blue-100/50 dark:bg-blue-900/20">
                          {formatCurrency(previewData.jvdr.locations.reduce((sum, loc) => sum + loc.salary, 0))}
                        </td>
                        <td className="px-4 py-2.5 text-sm text-right font-mono text-default-800 dark:text-gray-200 bg-blue-100/50 dark:bg-blue-900/20">
                          {formatCurrency(previewData.jvdr.locations.reduce((sum, loc) => sum + loc.epf_employer, 0))}
                        </td>
                        <td className="px-4 py-2.5 text-sm text-right font-mono text-default-800 dark:text-gray-200 bg-blue-100/50 dark:bg-blue-900/20">
                          {formatCurrency(previewData.jvdr.locations.reduce((sum, loc) => sum + loc.socso_employer, 0))}
                        </td>
                        <td className="px-4 py-2.5 text-sm text-right font-mono text-default-800 dark:text-gray-200 bg-blue-100/50 dark:bg-blue-900/20">
                          {formatCurrency(previewData.jvdr.locations.reduce((sum, loc) => sum + loc.sip_employer, 0))}
                        </td>
                        <td className="px-4 py-2.5 text-sm text-right font-mono text-default-800 dark:text-gray-200 bg-amber-100/50 dark:bg-amber-900/20">
                          {formatCurrency(previewData.jvdr.locations.reduce((sum, loc) => sum + loc.pcb, 0))}
                        </td>
                        <td className="px-4 py-2.5 text-sm text-right font-mono text-default-800 dark:text-gray-200 bg-amber-100/50 dark:bg-amber-900/20">
                          {formatCurrency(previewData.jvdr.locations.reduce((sum, loc) => sum + loc.net_salary, 0))}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </>
            ) : (
              <div className="p-8 text-center text-default-500 dark:text-gray-400">
                <IconAlertCircle size={32} className="mx-auto mb-2 text-amber-500 dark:text-amber-400" />
                <p>No director salary data for this month</p>
              </div>
            )}
          </div>

          {/* JVSL Section */}
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-default-200 dark:border-gray-700 shadow-sm overflow-hidden">
            {/* JVSL Header */}
            <div className="p-4 border-b border-default-200 dark:border-gray-700 bg-blue-50 dark:bg-blue-900/20">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300">
                    JVSL
                  </span>
                  <div>
                    <h2 className="text-lg font-semibold text-default-800 dark:text-gray-100">
                      Staff Salary Wages
                    </h2>
                    <p className="text-sm text-default-500 dark:text-gray-400">
                      Reference: {previewData.jvsl.reference}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {previewData.jvsl.exists ? (
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300">
                        <IconCheck size={14} />
                        Generated
                      </span>
                      <Button
                        onClick={() => handleViewEntry(previewData.jvsl.entry_id)}
                        color="default"
                        variant="outline"
                        icon={IconExternalLink}
                        iconPosition="left"
                        size="sm"
                      >
                        View Entry
                      </Button>
                    </div>
                  ) : (
                    <Button
                      onClick={() => handleGenerate(["JVSL"])}
                      color="sky"
                      variant="outline"
                      icon={IconFileInvoice}
                      iconPosition="left"
                      size="sm"
                      disabled={generating || previewData.jvsl.locations.length === 0}
                    >
                      Generate JVSL
                    </Button>
                  )}
                </div>
              </div>
            </div>

            {previewData.jvsl.locations.length > 0 ? (
              <>
                {/* Missing Mappings Warning */}
                {hasAnyMissingMappings(previewData.jvsl.locations) && (
                  <div className="m-4 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                    <div className="flex items-start gap-3">
                      <IconAlertTriangle className="text-amber-500 mt-0.5 flex-shrink-0" size={20} />
                      <div>
                        <h4 className="font-medium text-amber-800 dark:text-amber-300">
                          Some locations are missing account mappings
                        </h4>
                        <p className="text-sm text-amber-700 dark:text-amber-400 mt-1">
                          Amounts from locations with missing mappings won't be included in the journal voucher.
                        </p>
                        <Button
                          onClick={() => navigate("/accounting/location-account-mappings")}
                          variant="outline"
                          color="amber"
                          size="sm"
                          className="mt-2"
                          icon={IconExternalLink}
                          iconPosition="left"
                        >
                          Configure Mappings
                        </Button>
                      </div>
                    </div>
                  </div>
                )}

                {/* JVSL Summary Cards */}
                <div className="p-4 border-b border-default-200 dark:border-gray-700 bg-default-50 dark:bg-gray-900/30">
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                    <MiniSummaryCard
                      label="Total Gross Pay"
                      value={calculateJVSLTotals(previewData.jvsl.locations).totalSalary}
                      color="blue"
                      icon={<IconCash size={14} />}
                    />
                    <MiniSummaryCard
                      label="EPF (Company)"
                      value={calculateJVSLTotals(previewData.jvsl.locations).totalEPF}
                      sublabel={previewData.jvsl.totals?.accrual_accounts?.accrual_epf || "ACW_EPF"}
                      color="blue"
                    />
                    <MiniSummaryCard
                      label="SOCSO (Company)"
                      value={calculateJVSLTotals(previewData.jvsl.locations).totalSOCSO}
                      sublabel={previewData.jvsl.totals?.accrual_accounts?.accrual_socso || "ACW_SC"}
                      color="blue"
                    />
                    <MiniSummaryCard
                      label="SIP (Company)"
                      value={calculateJVSLTotals(previewData.jvsl.locations).totalSIP}
                      sublabel={previewData.jvsl.totals?.accrual_accounts?.accrual_sip || "ACW_SIP"}
                      color="blue"
                    />
                    <MiniSummaryCard
                      label="Tax Payable"
                      value={calculateJVSLTotals(previewData.jvsl.locations).totalPCB}
                      sublabel={previewData.jvsl.totals?.accrual_accounts?.accrual_pcb || "ACW_PCB"}
                      color="amber"
                    />
                    <MiniSummaryCard
                      label="Salary Payable"
                      value={calculateJVSLTotals(previewData.jvsl.locations).totalNetSalary}
                      sublabel={previewData.jvsl.totals?.accrual_accounts?.accrual_salary || "ACW_SAL"}
                      color="amber"
                    />
                  </div>
                </div>

                {/* JVSL Table */}
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-default-200 dark:divide-gray-700">
                    <thead>
                      {/* Grouped Header Row */}
                      <tr className="bg-default-50 dark:bg-gray-900/50">
                        <th rowSpan={2} className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wider text-default-600 dark:text-gray-400 border-b border-default-200 dark:border-gray-700">
                          Location
                        </th>
                        <th colSpan={4} className="px-4 py-2 text-center text-xs font-medium uppercase tracking-wider bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 border-b border-blue-200 dark:border-blue-800">
                          <div>Company Expenses</div>
                          <div className="text-[10px] font-normal normal-case mt-0.5">Recorded as costs per department</div>
                        </th>
                        <th rowSpan={2} className="px-4 py-2 text-right text-xs font-medium uppercase tracking-wider text-default-600 dark:text-gray-400 border-b border-default-200 dark:border-gray-700">
                          Total
                        </th>
                        <th rowSpan={2} className="px-4 py-2 text-center text-xs font-medium uppercase tracking-wider text-default-600 dark:text-gray-400 border-b border-default-200 dark:border-gray-700">
                          Status
                        </th>
                      </tr>
                      <tr className="bg-default-50 dark:bg-gray-900/50">
                        <th className="px-4 py-2 text-right text-xs font-medium uppercase tracking-wider text-default-600 dark:text-gray-400 bg-blue-50/50 dark:bg-blue-900/10">
                          Gross Pay
                        </th>
                        <th className="px-4 py-2 text-right text-xs font-medium uppercase tracking-wider text-default-600 dark:text-gray-400 bg-blue-50/50 dark:bg-blue-900/10">
                          EPF
                        </th>
                        <th className="px-4 py-2 text-right text-xs font-medium uppercase tracking-wider text-default-600 dark:text-gray-400 bg-blue-50/50 dark:bg-blue-900/10">
                          SOCSO
                        </th>
                        <th className="px-4 py-2 text-right text-xs font-medium uppercase tracking-wider text-default-600 dark:text-gray-400 bg-blue-50/50 dark:bg-blue-900/10">
                          SIP
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-default-200 dark:divide-gray-700 bg-white dark:bg-gray-800">
                      {previewData.jvsl.locations.map((loc) => {
                        const missingMappings = getMissingMappings(loc);
                        const locationTotal = loc.salary + loc.epf_employer + loc.socso_employer + loc.sip_employer;

                        return (
                          <tr key={loc.location_id} className="hover:bg-default-50 dark:hover:bg-gray-700">
                            <td className="px-4 py-2.5 text-sm font-medium text-default-800 dark:text-gray-200">
                              <span className="font-mono text-sky-600 dark:text-sky-400">{loc.location_id}</span>
                              <span className="mx-1">-</span>
                              <span className="truncate" title={loc.location_name}>{loc.location_name || loc.location_id}</span>
                            </td>
                            <td className="px-4 py-2.5 text-sm text-right bg-blue-50/30 dark:bg-blue-900/5">
                              <AccountCodeTooltip
                                amount={loc.salary}
                                accountCode={loc.accounts.salary}
                                accountDescription="Salary Expense"
                                type="expense"
                              />
                            </td>
                            <td className="px-4 py-2.5 text-sm text-right bg-blue-50/30 dark:bg-blue-900/5">
                              <AccountCodeTooltip
                                amount={loc.epf_employer}
                                accountCode={loc.accounts.epf_employer}
                                accountDescription="EPF Employer"
                                type="expense"
                              />
                            </td>
                            <td className="px-4 py-2.5 text-sm text-right bg-blue-50/30 dark:bg-blue-900/5">
                              <AccountCodeTooltip
                                amount={loc.socso_employer}
                                accountCode={loc.accounts.socso_employer}
                                accountDescription="SOCSO Employer"
                                type="expense"
                              />
                            </td>
                            <td className="px-4 py-2.5 text-sm text-right bg-blue-50/30 dark:bg-blue-900/5">
                              <AccountCodeTooltip
                                amount={loc.sip_employer}
                                accountCode={loc.accounts.sip_employer}
                                accountDescription="SIP Employer"
                                type="expense"
                              />
                            </td>
                            <td className="px-4 py-2.5 text-sm text-right font-mono font-medium text-default-800 dark:text-gray-200">
                              {formatCurrency(locationTotal)}
                            </td>
                            <td className="px-4 py-2.5 text-sm text-center">
                              {missingMappings.length > 0 ? (
                                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300">
                                  <IconAlertCircle size={12} />
                                  {missingMappings.join(", ")}
                                </span>
                              ) : (
                                <IconCheck size={16} className="mx-auto text-green-600 dark:text-green-400" />
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot className="bg-default-100 dark:bg-gray-900/50">
                      <tr className="font-semibold">
                        <td className="px-4 py-2.5 text-sm text-default-800 dark:text-gray-200">
                          Total ({previewData.jvsl.locations.length} locations)
                        </td>
                        <td className="px-4 py-2.5 text-sm text-right font-mono text-default-800 dark:text-gray-200 bg-blue-100/50 dark:bg-blue-900/20">
                          {formatCurrency(calculateJVSLTotals(previewData.jvsl.locations).totalSalary)}
                        </td>
                        <td className="px-4 py-2.5 text-sm text-right font-mono text-default-800 dark:text-gray-200 bg-blue-100/50 dark:bg-blue-900/20">
                          {formatCurrency(calculateJVSLTotals(previewData.jvsl.locations).totalEPF)}
                        </td>
                        <td className="px-4 py-2.5 text-sm text-right font-mono text-default-800 dark:text-gray-200 bg-blue-100/50 dark:bg-blue-900/20">
                          {formatCurrency(calculateJVSLTotals(previewData.jvsl.locations).totalSOCSO)}
                        </td>
                        <td className="px-4 py-2.5 text-sm text-right font-mono text-default-800 dark:text-gray-200 bg-blue-100/50 dark:bg-blue-900/20">
                          {formatCurrency(calculateJVSLTotals(previewData.jvsl.locations).totalSIP)}
                        </td>
                        <td className="px-4 py-2.5 text-sm text-right font-mono text-default-800 dark:text-gray-200">
                          {formatCurrency(
                            calculateJVSLTotals(previewData.jvsl.locations).totalSalary +
                            calculateJVSLTotals(previewData.jvsl.locations).totalEPF +
                            calculateJVSLTotals(previewData.jvsl.locations).totalSOCSO +
                            calculateJVSLTotals(previewData.jvsl.locations).totalSIP
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-sm text-center"></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                {/* What Will Be Generated Visual */}
                <div className="p-4 border-t border-default-200 dark:border-gray-700">
                  <h4 className="text-sm font-medium text-default-700 dark:text-gray-200 mb-3">
                    What the voucher will record:
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Expenses (Debits) */}
                    <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
                      <div className="text-xs font-semibold text-blue-700 dark:text-blue-300 uppercase tracking-wider mb-2">
                        Expenses (Debits)
                      </div>
                      <ul className="text-sm text-blue-800 dark:text-blue-200 space-y-1.5">
                        <li className="flex justify-between">
                          <span>Salary expenses by location</span>
                          <span className="font-mono">{formatCurrency(calculateJVSLTotals(previewData.jvsl.locations).totalSalary)}</span>
                        </li>
                        <li className="flex justify-between">
                          <span>EPF contributions by location</span>
                          <span className="font-mono">{formatCurrency(calculateJVSLTotals(previewData.jvsl.locations).totalEPF)}</span>
                        </li>
                        <li className="flex justify-between">
                          <span>SOCSO contributions by location</span>
                          <span className="font-mono">{formatCurrency(calculateJVSLTotals(previewData.jvsl.locations).totalSOCSO)}</span>
                        </li>
                        <li className="flex justify-between">
                          <span>SIP contributions by location</span>
                          <span className="font-mono">{formatCurrency(calculateJVSLTotals(previewData.jvsl.locations).totalSIP)}</span>
                        </li>
                      </ul>
                    </div>

                    {/* Payables (Credits) */}
                    <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
                      <div className="text-xs font-semibold text-amber-700 dark:text-amber-300 uppercase tracking-wider mb-2">
                        Payables (Credits)
                      </div>
                      <ul className="text-sm text-amber-800 dark:text-amber-200 space-y-1.5">
                        <li className="flex justify-between">
                          <span>Salary Payable ({previewData.jvsl.totals?.accrual_accounts?.accrual_salary || "ACW_SAL"})</span>
                          <span className="font-mono">{formatCurrency(calculateJVSLTotals(previewData.jvsl.locations).totalNetSalary)}</span>
                        </li>
                        <li className="flex justify-between">
                          <span>EPF Payable ({previewData.jvsl.totals?.accrual_accounts?.accrual_epf || "ACW_EPF"})</span>
                          <span className="font-mono">{formatCurrency(calculateJVSLTotals(previewData.jvsl.locations).totalEPF)}</span>
                        </li>
                        <li className="flex justify-between">
                          <span>SOCSO Payable ({previewData.jvsl.totals?.accrual_accounts?.accrual_socso || "ACW_SC"})</span>
                          <span className="font-mono">{formatCurrency(calculateJVSLTotals(previewData.jvsl.locations).totalSOCSO)}</span>
                        </li>
                        <li className="flex justify-between">
                          <span>SIP Payable ({previewData.jvsl.totals?.accrual_accounts?.accrual_sip || "ACW_SIP"})</span>
                          <span className="font-mono">{formatCurrency(calculateJVSLTotals(previewData.jvsl.locations).totalSIP)}</span>
                        </li>
                        <li className="flex justify-between">
                          <span>PCB Payable ({previewData.jvsl.totals?.accrual_accounts?.accrual_pcb || "ACW_PCB"})</span>
                          <span className="font-mono">{formatCurrency(calculateJVSLTotals(previewData.jvsl.locations).totalPCB)}</span>
                        </li>
                      </ul>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div className="p-8 text-center text-default-500 dark:text-gray-400">
                <IconAlertCircle size={32} className="mx-auto mb-2 text-amber-500 dark:text-amber-400" />
                <p>No staff salary data for this month</p>
              </div>
            )}
          </div>

          {/* Help Notes - Bilingual */}
          <div className="p-4 bg-default-50 dark:bg-gray-900/50 rounded-lg border border-default-200 dark:border-gray-700">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-medium text-default-700 dark:text-gray-200">
                {helpLanguage === "ms" ? "Cara ini berfungsi:" : "How this works:"}
              </h3>
              {/* Language Toggle */}
              <div className="flex items-center bg-default-100 dark:bg-gray-700 rounded-lg p-0.5 text-xs">
                <button
                  onClick={() => setHelpLanguage("ms")}
                  className={`px-2 py-1 rounded-md transition-colors ${
                    helpLanguage === "ms"
                      ? "bg-white dark:bg-gray-600 text-sky-600 dark:text-sky-400 font-medium shadow-sm"
                      : "text-default-500 dark:text-gray-400 hover:text-default-700"
                  }`}
                >
                  BM
                </button>
                <button
                  onClick={() => setHelpLanguage("en")}
                  className={`px-2 py-1 rounded-md transition-colors ${
                    helpLanguage === "en"
                      ? "bg-white dark:bg-gray-600 text-sky-600 dark:text-sky-400 font-medium shadow-sm"
                      : "text-default-500 dark:text-gray-400 hover:text-default-700"
                  }`}
                >
                  EN
                </button>
              </div>
            </div>

            {helpLanguage === "ms" ? (
              /* Malay Content */
              <ul className="text-sm text-default-600 dark:text-gray-300 space-y-2">
                <li className="flex items-start gap-2">
                  <span className="text-blue-500 font-bold">1.</span>
                  <span>
                    <strong>Perbelanjaan Syarikat</strong> direkodkan untuk kos gaji
                    setiap jabatan dan caruman majikan (EPF, SOCSO, SIP).
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-amber-500 font-bold">2.</span>
                  <span>
                    <strong>Jumlah Perlu Bayar</strong> menjejaki hutang syarikat kepada
                    pekerja (gaji) dan agensi kerajaan (cukai, EPF, SOCSO, SIP).
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-500 font-bold">3.</span>
                  <span>
                    Klik <strong>Generate</strong> untuk mencipta catatan jurnal.
                    Hover pada sebarang jumlah untuk melihat kod akaunnya.
                  </span>
                </li>
              </ul>
            ) : (
              /* English Content */
              <ul className="text-sm text-default-600 dark:text-gray-300 space-y-2">
                <li className="flex items-start gap-2">
                  <span className="text-blue-500 font-bold">1.</span>
                  <span>
                    <strong>Company Expenses</strong> are recorded for each department's
                    salary costs and employer contributions (EPF, SOCSO, SIP).
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-amber-500 font-bold">2.</span>
                  <span>
                    <strong>Amounts to Pay</strong> track what the company owes to
                    employees (salaries) and government agencies (tax, EPF, SOCSO, SIP).
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-500 font-bold">3.</span>
                  <span>
                    Click <strong>Generate</strong> to create the journal entry.
                    Hover over any amount to see its account code.
                  </span>
                </li>
              </ul>
            )}

            <p className="text-xs text-default-500 dark:text-gray-400 mt-3">
              {helpLanguage === "ms" ? (
                <>
                  Perlu tetapkan akaun mana yang menerima catatan?{" "}
                  <button
                    onClick={() => navigate("/accounting/location-account-mappings")}
                    className="text-sky-600 dark:text-sky-400 hover:text-sky-800 dark:hover:text-sky-300 underline"
                  >
                    Urus Pemetaan Akaun
                  </button>
                </>
              ) : (
                <>
                  Need to configure which accounts receive entries?{" "}
                  <button
                    onClick={() => navigate("/accounting/location-account-mappings")}
                    className="text-sky-600 dark:text-sky-400 hover:text-sky-800 dark:hover:text-sky-300 underline"
                  >
                    Manage Account Mappings
                  </button>
                </>
              )}
            </p>
          </div>
        </div>
      ) : (
        <div className="p-8 text-center text-default-500 dark:text-gray-400">
          No preview data available
        </div>
      )}
    </div>
  );
};

export default VoucherGeneratorPage;
