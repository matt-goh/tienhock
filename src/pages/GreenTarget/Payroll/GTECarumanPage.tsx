// src/pages/GreenTarget/Payroll/GTECarumanPage.tsx
// Green Target E-Caruman (Phase 6): EPF / SOCSO+EIS/SIP / PCB statutory exports.
// Mirrors the Tien Hock ECarumanPage but on the greentarget schema, with the
// employer registration codes editable on the page and persisted in the DB
// (greentarget.payroll_settings).
import React, { useState, useEffect, useCallback } from "react";
import {
  IconRefresh,
  IconDownload,
  IconDeviceFloppy,
  IconAlertTriangle,
} from "@tabler/icons-react";
import Button from "../../../components/Button";
import LoadingSpinner from "../../../components/LoadingSpinner";
import TimeNavigator, { TimeRange } from "../../../components/TimeNavigator";
import { FormInput } from "../../../components/FormComponents";
import { api } from "../../../routes/utils/api";
import toast from "react-hot-toast";

const API_BASE = "/greentarget/api/e-caruman";

interface ExportFile {
  path: string;
  filename: string;
  content: string;
  count: number;
}

interface Preview {
  epf: { count: number; totals: any } | null;
  socso: { count: number; totals: any } | null;
  sip: { count: number; totals: any } | null;
  income_tax: { count: number; totals: any } | null;
  missing_epf_no: { count: number; data: { name: string }[] } | null;
}

interface Codes {
  perkeso_employer_code: string;
  mycoid_ssm: string;
  lhdn_e_number: string;
}

const fmt = (n: number | undefined): string =>
  (Number(n) || 0).toLocaleString("en-MY", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const triggerDownload = (filename: string, content: string) => {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

const downloadExportFiles = (files: ExportFile[]) => {
  files.forEach((f) => {
    const seg = f.path.split("/").pop() || "";
    const name = files.length > 1 ? `${seg}-${f.filename}` : f.filename;
    triggerDownload(name, f.content);
  });
};

const GTECarumanPage: React.FC = () => {
  const now = new Date();
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadingType, setLoadingType] = useState<string | null>(null);

  const [codes, setCodes] = useState<Codes>({
    perkeso_employer_code: "",
    mycoid_ssm: "",
    lhdn_e_number: "",
  });
  const [savingCodes, setSavingCodes] = useState(false);

  const monthRange: TimeRange = {
    start: new Date(selectedYear, selectedMonth - 1, 1),
    end: new Date(selectedYear, selectedMonth, 0, 23, 59, 59, 999),
  };

  const fetchPreview = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await api.get(
        `${API_BASE}/preview?month=${selectedMonth}&year=${selectedYear}`
      );
      setPreview(res);
    } catch (error) {
      console.error("Error loading e-caruman preview:", error);
      toast.error("Failed to load contribution data");
    } finally {
      setIsLoading(false);
    }
  }, [selectedMonth, selectedYear]);

  const fetchCodes = useCallback(async () => {
    try {
      const res = await api.get(`${API_BASE}/settings`);
      setCodes({
        perkeso_employer_code: res.perkeso_employer_code || "",
        mycoid_ssm: res.mycoid_ssm || "",
        lhdn_e_number: res.lhdn_e_number || "",
      });
    } catch (error) {
      console.error("Error loading e-caruman settings:", error);
    }
  }, []);

  useEffect(() => {
    fetchPreview();
  }, [fetchPreview]);
  useEffect(() => {
    fetchCodes();
  }, [fetchCodes]);

  const handleTimeChange = (range: TimeRange) => {
    setSelectedYear(range.start.getFullYear());
    setSelectedMonth(range.start.getMonth() + 1);
  };

  const handleSaveCodes = async () => {
    setSavingCodes(true);
    try {
      await api.put(`${API_BASE}/settings`, codes);
      toast.success("Registration codes saved");
    } catch (error) {
      console.error("Error saving codes:", error);
      toast.error("Failed to save codes");
    } finally {
      setSavingCodes(false);
    }
  };

  const handleDownload = async (
    type: "epf" | "socso" | "income_tax"
  ): Promise<void> => {
    if (loadingType) return;
    setLoadingType(type);
    try {
      let url = "";
      if (type === "epf") {
        url = `${API_BASE}/epf/export?month=${selectedMonth}&year=${selectedYear}`;
      } else if (type === "socso") {
        if (!codes.perkeso_employer_code) {
          toast.error("Enter and save the PERKESO employer code first");
          return;
        }
        url = `${API_BASE}/socso-sip/export?month=${selectedMonth}&year=${selectedYear}&employerCode=${encodeURIComponent(
          codes.perkeso_employer_code
        )}&myCoId=${encodeURIComponent(codes.mycoid_ssm)}`;
      } else {
        if (!codes.lhdn_e_number) {
          toast.error("Enter and save the LHDN E-number first");
          return;
        }
        url = `${API_BASE}/income-tax/export?month=${selectedMonth}&year=${selectedYear}&eNumber=${encodeURIComponent(
          codes.lhdn_e_number
        )}`;
      }
      const res = await api.get(url);
      if (!res.files || res.files.length === 0) {
        toast.error("No data found for the specified period");
        return;
      }
      downloadExportFiles(res.files);
      toast.success("File(s) downloaded");
    } catch (error: any) {
      console.error("Error generating export:", error);
      toast.error(
        error?.response?.data?.message || "Failed to generate export file"
      );
    } finally {
      setLoadingType(null);
    }
  };

  const Card: React.FC<{
    title: string;
    badge: string;
    count: number;
    children: React.ReactNode;
    onDownload: () => void;
    downloading: boolean;
    disabled?: boolean;
  }> = ({ title, badge, count, children, onDownload, downloading, disabled }) => (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-default-200 dark:border-gray-700 shadow-sm p-4 flex flex-col">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-base font-semibold text-default-800 dark:text-gray-100">
          {title}
        </h3>
        <span className="px-2 py-0.5 rounded-full bg-sky-100 dark:bg-sky-900/40 text-sky-700 dark:text-sky-300 text-[10px] font-medium uppercase tracking-wide">
          {badge}
        </span>
      </div>
      <div className="text-sm text-default-600 dark:text-gray-300 space-y-1 flex-1">
        <div className="flex justify-between">
          <span>Employees</span>
          <span className="font-medium text-default-800 dark:text-gray-100">
            {count}
          </span>
        </div>
        {children}
      </div>
      <Button
        onClick={onDownload}
        icon={IconDownload}
        variant="outline"
        color="sky"
        size="sm"
        className="mt-3 w-full"
        disabled={downloading || disabled || count === 0}
      >
        {downloading ? "Preparing..." : "Download"}
      </Button>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row justify-between items-center gap-3">
        <h1 className="text-xl font-semibold text-default-800 dark:text-gray-100">
          E-Caruman (Green Target)
        </h1>
        <Button
          onClick={fetchPreview}
          icon={IconRefresh}
          variant="outline"
          disabled={isLoading}
        >
          Refresh
        </Button>
      </div>

      {/* Month nav */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-default-200 dark:border-gray-700 shadow-sm p-4">
        <TimeNavigator
          range={monthRange}
          onChange={handleTimeChange}
          modes={["month"]}
          presets={false}
        />
      </div>

      {/* Employer registration codes */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-default-200 dark:border-gray-700 shadow-sm p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-default-700 dark:text-gray-200">
            Employer Registration Codes
          </h2>
          <Button
            onClick={handleSaveCodes}
            icon={IconDeviceFloppy}
            color="sky"
            size="sm"
            disabled={savingCodes}
          >
            {savingCodes ? "Saving..." : "Save"}
          </Button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <FormInput
            name="perkeso"
            label="PERKESO Employer Code"
            value={codes.perkeso_employer_code}
            onChange={(e) =>
              setCodes((c) => ({ ...c, perkeso_employer_code: e.target.value }))
            }
            placeholder="e.g. F1234567890Z"
          />
          <FormInput
            name="mycoid"
            label="MyCoID / SSM"
            value={codes.mycoid_ssm}
            onChange={(e) =>
              setCodes((c) => ({ ...c, mycoid_ssm: e.target.value }))
            }
            placeholder="e.g. 123456-X"
          />
          <FormInput
            name="lhdn"
            label="LHDN E-Number"
            value={codes.lhdn_e_number}
            onChange={(e) =>
              setCodes((c) => ({ ...c, lhdn_e_number: e.target.value }))
            }
            placeholder="e.g. 1234567890"
          />
        </div>
        <p className="mt-2 text-[11px] text-default-400 dark:text-gray-500">
          Saved to the database and reused for the SOCSO/EIS and PCB exports.
          EPF needs no code.
        </p>
      </div>

      {/* Missing EPF warning */}
      {preview?.missing_epf_no && preview.missing_epf_no.count > 0 && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 p-3 text-sm text-amber-800 dark:text-amber-300">
          <IconAlertTriangle size={18} className="mt-0.5 flex-shrink-0" />
          <div>
            <span className="font-semibold">
              {preview.missing_epf_no.count} employee(s) with EPF contributions
              but no EPF number
            </span>{" "}
            — they are excluded from the EPF file:{" "}
            {preview.missing_epf_no.data.map((e) => e.name).join(", ")}. Add
            their EPF number in Staff details.
          </div>
        </div>
      )}

      {/* Cards */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <LoadingSpinner />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card
            title="EPF (KWSP)"
            badge="CSV"
            count={preview?.epf?.count || 0}
            onDownload={() => handleDownload("epf")}
            downloading={loadingType === "epf"}
          >
            <div className="flex justify-between">
              <span>Employer</span>
              <span>{fmt(preview?.epf?.totals?.em_share)}</span>
            </div>
            <div className="flex justify-between">
              <span>Employee</span>
              <span>{fmt(preview?.epf?.totals?.emp_share)}</span>
            </div>
            <div className="flex justify-between font-medium text-default-800 dark:text-gray-100">
              <span>Total</span>
              <span>{fmt(preview?.epf?.totals?.total_contribution)}</span>
            </div>
          </Card>

          <Card
            title="SOCSO + EIS"
            badge="TXT"
            count={preview?.socso?.count || 0}
            onDownload={() => handleDownload("socso")}
            downloading={loadingType === "socso"}
            disabled={!codes.perkeso_employer_code}
          >
            <div className="flex justify-between">
              <span>SOCSO</span>
              <span>{fmt(preview?.socso?.totals?.socso_total)}</span>
            </div>
            <div className="flex justify-between">
              <span>EIS/SIP</span>
              <span>{fmt(preview?.sip?.totals?.sip_total)}</span>
            </div>
            <div className="flex justify-between">
              <span>SKBBK</span>
              <span>{fmt(preview?.socso?.totals?.skbbk_amount)}</span>
            </div>
          </Card>

          <Card
            title="PCB (LHDN)"
            badge="TXT"
            count={preview?.income_tax?.count || 0}
            onDownload={() => handleDownload("income_tax")}
            downloading={loadingType === "income_tax"}
            disabled={!codes.lhdn_e_number}
          >
            <div className="flex justify-between font-medium text-default-800 dark:text-gray-100">
              <span>Total PCB</span>
              <span>{fmt(preview?.income_tax?.totals?.pcb_amount)}</span>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
};

export default GTECarumanPage;
