// src/pages/Accounting/VoucherGeneratorPage.tsx
import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
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
} from "@tabler/icons-react";

interface VoucherLocation {
  location_id: string;
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

const VoucherGeneratorPage: React.FC = () => {
  const navigate = useNavigate();
  const [selectedMonth, setSelectedMonth] = useState<Date>(new Date());
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [previewData, setPreviewData] = useState<PreviewData | null>(null);

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

  const handleViewEntry = (reference: string) => {
    // Navigate to journal entry list with search for this reference
    navigate(`/accounting/journal-entries?search=${encodeURIComponent(reference)}`);
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="mb-4 flex flex-col lg:flex-row justify-between lg:items-center gap-4">
        <div>
          <h1 className="text-xl font-semibold text-default-800 dark:text-gray-100">
            Payroll Voucher Generator
          </h1>
          <p className="text-sm text-default-500 dark:text-gray-400 mt-1">
            Generate JVDR (Director's Remuneration) and JVSL (Staff Salary) journal vouchers
          </p>
        </div>

        <div className="flex items-center gap-3">
          <MonthNavigator
            selectedMonth={selectedMonth}
            onChange={setSelectedMonth}
            showGoToCurrentButton={true}
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
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                        <IconCheck size={14} />
                        Generated
                      </span>
                      <Button
                        onClick={() => handleViewEntry(previewData.jvdr.reference)}
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
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-default-200 dark:divide-gray-700">
                  <thead className="bg-default-50 dark:bg-gray-900/50">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wider text-default-600 dark:text-gray-400">
                        Location
                      </th>
                      <th className="px-4 py-2 text-right text-xs font-medium uppercase tracking-wider text-default-600 dark:text-gray-400">
                        Salary (DR)
                      </th>
                      <th className="px-4 py-2 text-right text-xs font-medium uppercase tracking-wider text-default-600 dark:text-gray-400">
                        EPF (DR)
                      </th>
                      <th className="px-4 py-2 text-right text-xs font-medium uppercase tracking-wider text-default-600 dark:text-gray-400">
                        SOCSO (DR)
                      </th>
                      <th className="px-4 py-2 text-right text-xs font-medium uppercase tracking-wider text-default-600 dark:text-gray-400">
                        SIP (DR)
                      </th>
                      <th className="px-4 py-2 text-right text-xs font-medium uppercase tracking-wider text-default-600 dark:text-gray-400">
                        PCB (CR)
                      </th>
                      <th className="px-4 py-2 text-right text-xs font-medium uppercase tracking-wider text-default-600 dark:text-gray-400">
                        Net Salary (CR)
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-default-200 dark:divide-gray-700 bg-white dark:bg-gray-800">
                    {previewData.jvdr.locations.map((loc) => (
                      <tr key={loc.location_id} className="hover:bg-default-50 dark:hover:bg-gray-700">
                        <td className="px-4 py-2 text-sm font-medium text-default-800 dark:text-gray-200">
                          {loc.location_id} - Director
                        </td>
                        <td className="px-4 py-2 text-sm text-right font-mono text-default-700 dark:text-gray-200">
                          <div>{formatCurrency(loc.salary)}</div>
                          <div className="text-xs text-default-400 dark:text-gray-400">{loc.accounts.salary || "N/A"}</div>
                        </td>
                        <td className="px-4 py-2 text-sm text-right font-mono text-default-700 dark:text-gray-200">
                          <div>{formatCurrency(loc.epf_employer)}</div>
                          <div className="text-xs text-default-400 dark:text-gray-400">{loc.accounts.epf_employer || "N/A"}</div>
                        </td>
                        <td className="px-4 py-2 text-sm text-right font-mono text-default-700 dark:text-gray-200">
                          <div>{formatCurrency(loc.socso_employer)}</div>
                          <div className="text-xs text-default-400 dark:text-gray-400">{loc.accounts.socso_employer || "N/A"}</div>
                        </td>
                        <td className="px-4 py-2 text-sm text-right font-mono text-default-700 dark:text-gray-200">
                          <div>{formatCurrency(loc.sip_employer)}</div>
                          <div className="text-xs text-default-400 dark:text-gray-400">{loc.accounts.sip_employer || "N/A"}</div>
                        </td>
                        <td className="px-4 py-2 text-sm text-right font-mono text-default-700 dark:text-gray-200">
                          <div>{formatCurrency(loc.pcb)}</div>
                          <div className="text-xs text-default-400 dark:text-gray-400">{loc.accounts.accrual_pcb || "N/A"}</div>
                        </td>
                        <td className="px-4 py-2 text-sm text-right font-mono text-default-700 dark:text-gray-200">
                          <div>{formatCurrency(loc.net_salary)}</div>
                          <div className="text-xs text-default-400 dark:text-gray-400">{loc.accounts.accrual_salary || "N/A"}</div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-8 text-center text-default-500 dark:text-gray-400">
                <IconAlertCircle size={32} className="mx-auto mb-2 text-amber-500" />
                <p>No director salary data for this month</p>
              </div>
            )}
          </div>

          {/* JVSL Section */}
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-default-200 dark:border-gray-700 shadow-sm overflow-hidden">
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
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                        <IconCheck size={14} />
                        Generated
                      </span>
                      <Button
                        onClick={() => handleViewEntry(previewData.jvsl.reference)}
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
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-default-200 dark:divide-gray-700">
                  <thead className="bg-default-50 dark:bg-gray-900/50">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wider text-default-600 dark:text-gray-400">
                        Location
                      </th>
                      <th className="px-4 py-2 text-right text-xs font-medium uppercase tracking-wider text-default-600 dark:text-gray-400">
                        Salary (DR)
                      </th>
                      <th className="px-4 py-2 text-right text-xs font-medium uppercase tracking-wider text-default-600 dark:text-gray-400">
                        EPF (DR)
                      </th>
                      <th className="px-4 py-2 text-right text-xs font-medium uppercase tracking-wider text-default-600 dark:text-gray-400">
                        SOCSO (DR)
                      </th>
                      <th className="px-4 py-2 text-right text-xs font-medium uppercase tracking-wider text-default-600 dark:text-gray-400">
                        SIP (DR)
                      </th>
                      <th className="px-4 py-2 text-center text-xs font-medium uppercase tracking-wider text-default-600 dark:text-gray-400">
                        Missing Mappings
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-default-200 dark:divide-gray-700 bg-white dark:bg-gray-800">
                    {previewData.jvsl.locations.map((loc) => {
                      const missingMappings = [
                        !loc.accounts.salary && loc.salary > 0 ? "Salary" : null,
                        !loc.accounts.epf_employer && loc.epf_employer > 0 ? "EPF" : null,
                        !loc.accounts.socso_employer && loc.socso_employer > 0 ? "SOCSO" : null,
                        !loc.accounts.sip_employer && loc.sip_employer > 0 ? "SIP" : null,
                      ].filter(Boolean);

                      return (
                        <tr key={loc.location_id} className="hover:bg-default-50 dark:hover:bg-gray-700">
                          <td className="px-4 py-2 text-sm font-medium text-default-800 dark:text-gray-200">
                            {loc.location_id}
                          </td>
                          <td className="px-4 py-2 text-sm text-right font-mono text-default-700 dark:text-gray-200">
                            <div>{formatCurrency(loc.salary)}</div>
                            <div className="text-xs text-default-400 dark:text-gray-400">{loc.accounts.salary || "-"}</div>
                          </td>
                          <td className="px-4 py-2 text-sm text-right font-mono text-default-700 dark:text-gray-200">
                            <div>{formatCurrency(loc.epf_employer)}</div>
                            <div className="text-xs text-default-400 dark:text-gray-400">{loc.accounts.epf_employer || "-"}</div>
                          </td>
                          <td className="px-4 py-2 text-sm text-right font-mono text-default-700 dark:text-gray-200">
                            <div>{formatCurrency(loc.socso_employer)}</div>
                            <div className="text-xs text-default-400 dark:text-gray-400">{loc.accounts.socso_employer || "-"}</div>
                          </td>
                          <td className="px-4 py-2 text-sm text-right font-mono text-default-700 dark:text-gray-200">
                            <div>{formatCurrency(loc.sip_employer)}</div>
                            <div className="text-xs text-default-400 dark:text-gray-400">{loc.accounts.sip_employer || "-"}</div>
                          </td>
                          <td className="px-4 py-2 text-sm text-center">
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
                  {previewData.jvsl.totals && (
                    <tfoot className="bg-default-100 dark:bg-gray-900/50">
                      <tr className="font-medium">
                        <td className="px-4 py-2 text-sm text-default-800 dark:text-gray-200">
                          TOTAL (Credit to Accruals)
                        </td>
                        <td className="px-4 py-2 text-sm text-right font-mono text-default-700 dark:text-gray-200">
                          <div>{formatCurrency(previewData.jvsl.totals.salary)}</div>
                          <div className="text-xs text-default-500 dark:text-gray-400">
                            {previewData.jvsl.totals.accrual_accounts.accrual_salary || "ACW_SAL"}
                          </div>
                        </td>
                        <td className="px-4 py-2 text-sm text-right font-mono text-default-700 dark:text-gray-200">
                          <div>{formatCurrency(previewData.jvsl.totals.epf_employer)}</div>
                          <div className="text-xs text-default-500 dark:text-gray-400">
                            {previewData.jvsl.totals.accrual_accounts.accrual_epf || "ACW_EPF"}
                          </div>
                        </td>
                        <td className="px-4 py-2 text-sm text-right font-mono text-default-700 dark:text-gray-200">
                          <div>{formatCurrency(previewData.jvsl.totals.socso_employer)}</div>
                          <div className="text-xs text-default-500 dark:text-gray-400">
                            {previewData.jvsl.totals.accrual_accounts.accrual_socso || "ACW_SC"}
                          </div>
                        </td>
                        <td className="px-4 py-2 text-sm text-right font-mono text-default-700 dark:text-gray-200">
                          <div>{formatCurrency(previewData.jvsl.totals.sip_employer)}</div>
                          <div className="text-xs text-default-500 dark:text-gray-400">
                            {previewData.jvsl.totals.accrual_accounts.accrual_sip || "ACW_SIP"}
                          </div>
                        </td>
                        <td className="px-4 py-2 text-sm text-center text-default-700 dark:text-gray-200">
                          PCB: {formatCurrency(previewData.jvsl.totals.pcb)}
                        </td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            ) : (
              <div className="p-8 text-center text-default-500 dark:text-gray-400">
                <IconAlertCircle size={32} className="mx-auto mb-2 text-amber-500" />
                <p>No staff salary data for this month</p>
              </div>
            )}
          </div>

          {/* Help Text */}
          <div className="p-4 bg-default-50 dark:bg-gray-900/50 rounded-lg border border-default-200 dark:border-gray-700">
            <h3 className="text-sm font-medium text-default-700 dark:text-gray-200 mb-2">Notes:</h3>
            <ul className="text-sm text-default-600 dark:text-gray-300 space-y-1 list-disc list-inside">
              <li>DR = Debit entry, CR = Credit entry</li>
              <li>Missing account codes will skip that entry during generation</li>
              <li>
                Manage account mappings in{" "}
                <button
                  onClick={() => navigate("/accounting/location-account-mappings")}
                  className="text-sky-600 dark:text-sky-400 hover:text-sky-800 dark:hover:text-sky-300 underline"
                >
                  Location Account Mappings
                </button>
              </li>
              <li>Generated vouchers can be viewed and edited in Journal Entries</li>
            </ul>
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
