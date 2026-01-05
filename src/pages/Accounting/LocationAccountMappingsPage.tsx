// src/pages/Accounting/LocationAccountMappingsPage.tsx
import React, { useState, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../routes/utils/api";
import {
  useLocationMappingsCache,
  LocationAccountMapping,
  Location,
} from "../../utils/catalogue/useLocationMappingsCache";
import toast from "react-hot-toast";
import LoadingSpinner from "../../components/LoadingSpinner";
import Button from "../../components/Button";
import ConfirmationDialog from "../../components/ConfirmationDialog";
import {
  IconSearch,
  IconCheck,
  IconPlus,
  IconTrash,
  IconX,
  IconChevronDown,
  IconChevronRight,
  IconHelp,
  IconAlertTriangle,
  IconExternalLink,
  IconBriefcase,
  IconUsers,
} from "@tabler/icons-react";
import {
  Combobox,
  ComboboxInput,
  ComboboxOption,
  ComboboxOptions,
  ComboboxButton,
  Listbox,
  ListboxButton,
  ListboxOptions,
  ListboxOption,
} from "@headlessui/react";

interface LocationDetails {
  jobs: Array<{ job_id: number; job_name: string }>;
  staffs: Array<{ id: number; name: string }>;
  hasDependencies: boolean;
}

// Expected account codes from the PDF - these are the GL accounts that should receive payroll entries
interface ExpectedAccountCode {
  code: string;
  description: string;
  category: "salary" | "epf" | "socso" | "sip" | "accrual";
  mappingTypes: string[]; // What mapping types flow into this account
}

// JVDR Account Codes (Director's Remuneration - Location 01)
// Based on JVDR voucher: 12 line items
const JVDR_ACCOUNT_CODES: ExpectedAccountCode[] = [
  // Debit accounts (5 lines in voucher)
  {
    code: "MBDRS",
    description: "Directors Remuneration (Salary)",
    category: "salary",
    mappingTypes: ["salary"],
  },
  {
    code: "MBDRS",
    description: "Directors Remuneration (Rounding)",
    category: "salary",
    mappingTypes: ["rounding"],
  },
  {
    code: "MBDRE",
    description: "EPF Contribution-Director's",
    category: "epf",
    mappingTypes: ["epf_employer"],
  },
  {
    code: "MBDRSC",
    description: "SOCSO Contribution-Director's",
    category: "socso",
    mappingTypes: ["socso_employer"],
  },
  {
    code: "MBDRSIP",
    description: "Director Remuneration (SIP)",
    category: "sip",
    mappingTypes: ["sip_employer"],
  },
  // Credit accounts - Accruals (7 lines in voucher)
  {
    code: "ACD_EPF",
    description: "Accrual (EPF)",
    category: "accrual",
    mappingTypes: ["accrual_epf"],
  },
  {
    code: "ACD_SC",
    description: "Accrual (SOCSO)",
    category: "accrual",
    mappingTypes: ["accrual_socso"],
  },
  {
    code: "ACD_SIP",
    description: "Accrual (Directors' SIP)",
    category: "accrual",
    mappingTypes: ["accrual_sip"],
  },
  {
    code: "ACD_PCB",
    description: "Accrual (PCB Payables)",
    category: "accrual",
    mappingTypes: ["accrual_pcb"],
  },
  {
    code: "ACD_SAL",
    description: "Salary Director - GOH",
    category: "accrual",
    mappingTypes: ["accrual_salary"],
  },
  {
    code: "ACD_SAL",
    description: "Salary Director - WONG",
    category: "accrual",
    mappingTypes: ["accrual_salary"],
  },
  {
    code: "ACD_SAL",
    description: "Salary Ex.Director - WINNIE.G",
    category: "accrual",
    mappingTypes: ["accrual_salary"],
  },
];

// JVSL Account Codes (Staff Salary - Multiple Locations)
// Based on JVSL voucher: 73 line items matching the voucher exactly
const JVSL_ACCOUNT_CODES: ExpectedAccountCode[] = [
  // ========== SALARY/WAGES BASE (16 entries) ==========
  {
    code: "MBS_O",
    description: "Office (Salary)",
    category: "salary",
    mappingTypes: ["salary"],
  },
  {
    code: "MS_SM",
    description: "Salesman-Commission Mee",
    category: "salary",
    mappingTypes: ["commission"],
  },
  {
    code: "BS_SM",
    description: "Salesman-Commission Bihun",
    category: "salary",
    mappingTypes: ["commission"],
  },
  {
    code: "THJ_CK",
    description: "Commission Jelly",
    category: "salary",
    mappingTypes: ["commission"],
  },
  {
    code: "MBS_SMO",
    description: "Salesman-Others",
    category: "salary",
    mappingTypes: ["salary"],
  },
  {
    code: "MS_IL",
    description: "Ikut Lori-Commission Mee",
    category: "salary",
    mappingTypes: ["commission"],
  },
  {
    code: "BS_IL",
    description: "Ikut Lori-Commission Bihun",
    category: "salary",
    mappingTypes: ["commission"],
  },
  {
    code: "THJ_SM",
    description: "Tien Hock (Jelly) - Salary Salesman",
    category: "salary",
    mappingTypes: ["salary"],
  },
  {
    code: "MBS_ILO",
    description: "Ikut Lori-Others",
    category: "salary",
    mappingTypes: ["salary"],
  },
  {
    code: "MBS_JB",
    description: "Jaga Boiler (Salary)",
    category: "salary",
    mappingTypes: ["salary"],
  },
  {
    code: "MS_MM",
    description: "Mesin & Sangkut Mee (Salary)",
    category: "salary",
    mappingTypes: ["salary"],
  },
  {
    code: "MS_PM",
    description: "Packing Mee (Salary)",
    category: "salary",
    mappingTypes: ["salary"],
  },
  {
    code: "BS_MB",
    description: "Mesin & Sangkut Bihun (Salary)",
    category: "salary",
    mappingTypes: ["salary"],
  },
  {
    code: "BS_PB",
    description: "Packing Bihun (Salary)",
    category: "salary",
    mappingTypes: ["salary"],
  },
  {
    code: "MBS_TS",
    description: "Tukang Sapu (Salary)",
    category: "salary",
    mappingTypes: ["salary"],
  },
  {
    code: "MBS_M",
    description: "Maintenance (Kerja Luar Kilang)",
    category: "salary",
    mappingTypes: ["salary"],
  },

  // ========== BONUS (3 entries) ==========
  {
    code: "MBS_O",
    description: "Office (Bonus)",
    category: "salary",
    mappingTypes: ["bonus"],
  },
  {
    code: "MS_SM",
    description: "Salesman-(Bonus) Mee",
    category: "salary",
    mappingTypes: ["bonus"],
  },
  {
    code: "BS_SM",
    description: "Salesman-Commission Bihun (Bonus)",
    category: "salary",
    mappingTypes: ["bonus"],
  },

  // ========== OVERTIME (7 entries) ==========
  {
    code: "MBS_O",
    description: "Office (OT)",
    category: "salary",
    mappingTypes: ["overtime"],
  },
  {
    code: "MBS_JB",
    description: "Jaga Boiler (OT)",
    category: "salary",
    mappingTypes: ["overtime"],
  },
  {
    code: "MS_MM",
    description: "Mesin & Sangkut Mee (OT)",
    category: "salary",
    mappingTypes: ["overtime"],
  },
  {
    code: "MS_PM",
    description: "Packing Mee (OT)",
    category: "salary",
    mappingTypes: ["overtime"],
  },
  {
    code: "BS_MB",
    description: "Mesin & Sangkut Bihun (OT)",
    category: "salary",
    mappingTypes: ["overtime"],
  },
  {
    code: "MBS_TS",
    description: "Tukang Sapu (OT)",
    category: "salary",
    mappingTypes: ["overtime"],
  },
  {
    code: "MBS_M",
    description: "Maintenance (Kerja Luar Kilang) (OT)",
    category: "salary",
    mappingTypes: ["overtime"],
  },

  // ========== ROUNDING (12 entries) ==========
  {
    code: "MBS_O",
    description: "Office (RND)",
    category: "salary",
    mappingTypes: ["rounding"],
  },
  {
    code: "MS_SM",
    description: "Salesman-Commission Mee (RND)",
    category: "salary",
    mappingTypes: ["rounding"],
  },
  {
    code: "BS_SM",
    description: "Salesman-Commission Bihun (RND)",
    category: "salary",
    mappingTypes: ["rounding"],
  },
  {
    code: "MS_IL",
    description: "Ikut Lori-Commission Mee (RND)",
    category: "salary",
    mappingTypes: ["rounding"],
  },
  {
    code: "BS_IL",
    description: "Ikut Lori-Commission Bihun (RND)",
    category: "salary",
    mappingTypes: ["rounding"],
  },
  {
    code: "MBS_JB",
    description: "Jaga Boiler (RND)",
    category: "salary",
    mappingTypes: ["rounding"],
  },
  {
    code: "MS_MM",
    description: "Mesin & Sangkut Mee (RND)",
    category: "salary",
    mappingTypes: ["rounding"],
  },
  {
    code: "MS_PM",
    description: "Packing Mee (RND)",
    category: "salary",
    mappingTypes: ["rounding"],
  },
  {
    code: "BS_MB",
    description: "Mesin & Sangkut Bihun (RND)",
    category: "salary",
    mappingTypes: ["rounding"],
  },
  {
    code: "BS_PB",
    description: "Packing Bihun (RND)",
    category: "salary",
    mappingTypes: ["rounding"],
  },
  {
    code: "MBS_TS",
    description: "Tukang Sapu (RND)",
    category: "salary",
    mappingTypes: ["rounding"],
  },
  {
    code: "MBS_M",
    description: "Maintenance (Kerja Luar Kilang) (RND)",
    category: "salary",
    mappingTypes: ["rounding"],
  },

  // ========== EPF EMPLOYER (10 entries) ==========
  {
    code: "MBE_O",
    description: "Office (EPF)",
    category: "epf",
    mappingTypes: ["epf_employer"],
  },
  {
    code: "MBE_SM",
    description: "Salesman (EPF)",
    category: "epf",
    mappingTypes: ["epf_employer"],
  },
  {
    code: "MBE_IL",
    description: "Ikut Lori (EPF)",
    category: "epf",
    mappingTypes: ["epf_employer"],
  },
  {
    code: "MBE_JB",
    description: "Jaga Boiler (EPF)",
    category: "epf",
    mappingTypes: ["epf_employer"],
  },
  {
    code: "ME_MM",
    description: "Mesin Mee (EPF)",
    category: "epf",
    mappingTypes: ["epf_employer"],
  },
  {
    code: "ME_PM",
    description: "Packing Mee (EPF)",
    category: "epf",
    mappingTypes: ["epf_employer"],
  },
  {
    code: "BE_MB",
    description: "Machine Bihun (EPF)",
    category: "epf",
    mappingTypes: ["epf_employer"],
  },
  {
    code: "BE_PB",
    description: "Packing Bihun (EPF)",
    category: "epf",
    mappingTypes: ["epf_employer"],
  },
  {
    code: "MBE_TS",
    description: "Tukang Sapu (EPF)",
    category: "epf",
    mappingTypes: ["epf_employer"],
  },
  {
    code: "MBE_M",
    description: "Maintenance (EPF)",
    category: "epf",
    mappingTypes: ["epf_employer"],
  },

  // ========== SOCSO EMPLOYER (10 entries) ==========
  {
    code: "MBSC_O",
    description: "Office (SOCSO)",
    category: "socso",
    mappingTypes: ["socso_employer"],
  },
  {
    code: "MBSC_SM",
    description: "Salesman (SOCSO)",
    category: "socso",
    mappingTypes: ["socso_employer"],
  },
  {
    code: "MBSC_IL",
    description: "Ikut Lori (SOCSO)",
    category: "socso",
    mappingTypes: ["socso_employer"],
  },
  {
    code: "MBSC_JB",
    description: "Jaga Boiler (SOCSO)",
    category: "socso",
    mappingTypes: ["socso_employer"],
  },
  {
    code: "MSC_MM",
    description: "Machine Mee (SOCSO)",
    category: "socso",
    mappingTypes: ["socso_employer"],
  },
  {
    code: "MSC_PM",
    description: "Packing Mee (SOCSO)",
    category: "socso",
    mappingTypes: ["socso_employer"],
  },
  {
    code: "BSC_MB",
    description: "Machine Bihun (SOCSO)",
    category: "socso",
    mappingTypes: ["socso_employer"],
  },
  {
    code: "BSC_PB",
    description: "Packing Bihun (SOCSO)",
    category: "socso",
    mappingTypes: ["socso_employer"],
  },
  {
    code: "MBSC_TS",
    description: "Tukang Sapu (SOCSO)",
    category: "socso",
    mappingTypes: ["socso_employer"],
  },
  {
    code: "MBSC_M",
    description: "Maintenance (SOCSO)",
    category: "socso",
    mappingTypes: ["socso_employer"],
  },

  // ========== SIP EMPLOYER (9 entries) ==========
  {
    code: "MBSIP_O",
    description: "SIP Contributions (Office)",
    category: "sip",
    mappingTypes: ["sip_employer"],
  },
  {
    code: "MBSIP_SM",
    description: "SIP Contributions (Salesman)",
    category: "sip",
    mappingTypes: ["sip_employer"],
  },
  {
    code: "MBSIP_IL",
    description: "SIP Contributions (Ikut Lori)",
    category: "sip",
    mappingTypes: ["sip_employer"],
  },
  {
    code: "MBSIP_MM",
    description: "SIP Contributions (Mesin Mee)",
    category: "sip",
    mappingTypes: ["sip_employer"],
  },
  {
    code: "MBSIP_PM",
    description: "SIP Contributions (Packing Mee)",
    category: "sip",
    mappingTypes: ["sip_employer"],
  },
  {
    code: "BSIP_MB",
    description: "SIP Contributions (Mesin Bihun)",
    category: "sip",
    mappingTypes: ["sip_employer"],
  },
  {
    code: "BSIP_PB",
    description: "SIP Contributions (Packing Bihun)",
    category: "sip",
    mappingTypes: ["sip_employer"],
  },
  {
    code: "MBSIP_TS",
    description: "SIP Contributions (Tukang Sapu)",
    category: "sip",
    mappingTypes: ["sip_employer"],
  },
  {
    code: "MBSIP_M",
    description: "SIP Contributions (Maintenance)",
    category: "sip",
    mappingTypes: ["sip_employer"],
  },

  // ========== CUTI TAHUNAN & BONUS (1 entry) ==========
  {
    code: "MBS_M",
    description: "Cuti Tahunan & Bonus",
    category: "salary",
    mappingTypes: ["cuti_tahunan"],
  },

  // ========== ACCRUALS - CREDIT (5 entries) ==========
  {
    code: "ACW_EPF",
    description: "Accrual (EPF)",
    category: "accrual",
    mappingTypes: ["accrual_epf"],
  },
  {
    code: "ACW_SC",
    description: "Accrual (SOCSO)",
    category: "accrual",
    mappingTypes: ["accrual_socso"],
  },
  {
    code: "ACW_SAL",
    description: "Accrual (Salary Payables)",
    category: "accrual",
    mappingTypes: ["accrual_salary"],
  },
  {
    code: "ACW_PCB",
    description: "Accrual (PCB Payables)",
    category: "accrual",
    mappingTypes: ["accrual_pcb"],
  },
  {
    code: "ACW_SIP",
    description: "Accrual (SIP)",
    category: "accrual",
    mappingTypes: ["accrual_sip"],
  },
];
// Total: 16 + 3 + 7 + 12 + 10 + 10 + 9 + 1 + 5 = 73 entries

const CATEGORY_CONFIG = {
  salary: { label: "Salary & Wages", color: "green", icon: "💰" },
  epf: { label: "EPF Employer Contributions", color: "blue", icon: "🏦" },
  socso: { label: "SOCSO Employer Contributions", color: "purple", icon: "🏥" },
  sip: { label: "SIP Employer Contributions", color: "indigo", icon: "📋" },
  accrual: { label: "Accruals (Credit)", color: "amber", icon: "📊" },
};

const LocationAccountMappingsPage: React.FC = () => {
  // Use cached location mappings
  const {
    locations,
    accountMappings,
    jobMappings,
    employeeMappings,
    loading,
    invalidateAccountMappings,
  } = useLocationMappingsCache();

  // Get mappings from cache
  const mappings = accountMappings.mappings;

  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState<"JVDR" | "JVSL">("JVSL");

  // Collapsed sections state
  const [collapsedSections, setCollapsedSections] = useState<
    Record<string, boolean>
  >({});

  // Modal state
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedAccountCode, setSelectedAccountCode] =
    useState<ExpectedAccountCode | null>(null);
  const [selectedLocation, setSelectedLocation] = useState<string>("");
  const [selectedMappingType, setSelectedMappingType] = useState<string>("");
  const [locationSearch, setLocationSearch] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  // Delete state
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [mappingToDelete, setMappingToDelete] =
    useState<LocationAccountMapping | null>(null);

  // Help dialog state
  const [showHelpDialog, setShowHelpDialog] = useState(false);
  const [helpLanguage, setHelpLanguage] = useState<"ms" | "en">("ms");

  // Tooltip state
  const [hoveredMapping, setHoveredMapping] =
    useState<LocationAccountMapping | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState<{
    x: number;
    y: number;
    position: "below" | "above";
  } | null>(null);
  const [locationDetails, setLocationDetails] =
    useState<LocationDetails | null>(null);
  const tooltipTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const navigate = useNavigate();

  // Get expected account codes for current tab
  const expectedAccountCodes =
    activeTab === "JVDR" ? JVDR_ACCOUNT_CODES : JVSL_ACCOUNT_CODES;

  // Build mappings grouped by account code + mapping type (to handle duplicate codes)
  const mappingsByCodeAndType = useMemo(() => {
    const byCodeType: Record<string, LocationAccountMapping[]> = {};
    mappings
      .filter((m) => m.voucher_type === activeTab && m.is_active)
      .forEach((m) => {
        const key = `${m.account_code}|${m.mapping_type}`;
        if (!byCodeType[key]) {
          byCodeType[key] = [];
        }
        byCodeType[key].push(m);
      });
    return byCodeType;
  }, [mappings, activeTab]);

  // Helper to get mappings for an expected account code entry
  const getMappingsForEntry = (
    ac: ExpectedAccountCode
  ): LocationAccountMapping[] => {
    const result: LocationAccountMapping[] = [];
    ac.mappingTypes.forEach((mt) => {
      const key = `${ac.code}|${mt}`;
      const found = mappingsByCodeAndType[key] || [];
      result.push(...found);
    });
    return result;
  };

  // Filter account codes by search
  const filteredAccountCodes = useMemo(() => {
    if (!searchTerm) return expectedAccountCodes;
    const lower = searchTerm.toLowerCase();
    return expectedAccountCodes.filter(
      (ac) =>
        ac.code.toLowerCase().includes(lower) ||
        ac.description.toLowerCase().includes(lower)
    );
  }, [expectedAccountCodes, searchTerm]);

  // Group filtered account codes by category
  const groupedAccountCodes = useMemo(() => {
    const groups: Record<string, ExpectedAccountCode[]> = {};
    filteredAccountCodes.forEach((ac) => {
      if (!groups[ac.category]) {
        groups[ac.category] = [];
      }
      groups[ac.category].push(ac);
    });
    return groups;
  }, [filteredAccountCodes]);

  // Count unmapped account codes
  const unmappedCount = useMemo(() => {
    return expectedAccountCodes.filter(
      (ac) => getMappingsForEntry(ac).length === 0
    ).length;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expectedAccountCodes, mappingsByCodeAndType]);

  // Available locations for the modal (filtered)
  const availableLocations = useMemo(() => {
    // Build list based on voucher type
    let locs: Location[] = [];
    if (activeTab === "JVDR") {
      locs = [{ id: "01", name: "DIRECTOR'S REMUNERATION" }];
    } else {
      // Include 00 for accruals and all locations except 01, 05, 12, 15
      locs = [{ id: "00", name: "ACCRUALS" }];
      locations
        .filter(
          (l) =>
            l.id !== "01" && l.id !== "05" && l.id !== "12" && l.id !== "15"
        )
        .sort((a, b) => a.id.localeCompare(b.id))
        .forEach((l) => locs.push(l));
    }

    // Filter by search
    if (!locationSearch) return locs;
    const lower = locationSearch.toLowerCase();
    return locs.filter(
      (l) => l.id.includes(lower) || l.name.toLowerCase().includes(lower)
    );
  }, [activeTab, locations, locationSearch]);

  // Toggle section collapse
  const toggleSection = (category: string) => {
    setCollapsedSections((prev) => ({
      ...prev,
      [category]: !prev[category],
    }));
  };

  // Handlers
  const handleAddMapping = (accountCode: ExpectedAccountCode) => {
    setSelectedAccountCode(accountCode);
    setSelectedLocation("");
    setSelectedMappingType(accountCode.mappingTypes[0] || "");
    setLocationSearch("");
    setShowAddModal(true);
  };

  const handleDeleteClick = (mapping: LocationAccountMapping) => {
    setMappingToDelete(mapping);
    setShowDeleteDialog(true);
  };

  const handleSave = async () => {
    if (!selectedAccountCode || !selectedLocation || !selectedMappingType) {
      toast.error("Please select a location and mapping type");
      return;
    }

    // Find location name
    const loc = availableLocations.find((l) => l.id === selectedLocation);
    if (!loc) {
      toast.error("Invalid location selected");
      return;
    }

    setIsSaving(true);
    try {
      await api.post("/api/journal-vouchers/mappings", {
        location_id: selectedLocation,
        location_name: loc.name,
        mapping_type: selectedMappingType,
        account_code: selectedAccountCode.code,
        voucher_type: activeTab,
        is_active: true,
      });
      toast.success("Mapping created successfully");
      setShowAddModal(false);
      invalidateAccountMappings();
    } catch (error: unknown) {
      console.error("Error saving mapping:", error);
      const errorMessage =
        error instanceof Error ? error.message : "Failed to save mapping";
      toast.error(errorMessage);
    } finally {
      setIsSaving(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!mappingToDelete) return;

    try {
      await api.delete(`/api/journal-vouchers/mappings/${mappingToDelete.id}`);
      toast.success("Mapping deleted successfully");
      setShowDeleteDialog(false);
      setMappingToDelete(null);
      invalidateAccountMappings();
    } catch (error: unknown) {
      console.error("Error deleting mapping:", error);
      const errorMessage =
        error instanceof Error ? error.message : "Failed to delete mapping";
      toast.error(errorMessage);
    }
  };

  const getMappingTypeLabel = (type: string): string => {
    const labels: Record<string, string> = {
      salary: "Salary",
      overtime: "OT",
      bonus: "Bonus",
      commission: "Comm",
      rounding: "Rnd",
      cuti_tahunan: "CT",
      special_ot: "SOT",
      epf_employer: "EPF",
      socso_employer: "SOCSO",
      sip_employer: "SIP",
      accrual_salary: "Acc-Sal",
      accrual_epf: "Acc-EPF",
      accrual_socso: "Acc-SC",
      accrual_sip: "Acc-SIP",
      accrual_pcb: "Acc-PCB",
    };
    return labels[type] || type;
  };

  // Tooltip handlers
  const handlePillMouseEnter = async (
    mapping: LocationAccountMapping,
    event: React.MouseEvent<HTMLDivElement>
  ) => {
    // Clear any existing timeout
    if (tooltipTimeoutRef.current) {
      clearTimeout(tooltipTimeoutRef.current);
    }

    // Calculate position - check if near bottom of viewport
    const rect = event.currentTarget.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const tooltipHeight = 200; // Approximate tooltip height
    const spaceBelow = viewportHeight - rect.bottom;
    const nearBottom = spaceBelow < tooltipHeight + 20;

    if (nearBottom) {
      // Position above the pill (top middle) - overlap slightly for easy hover
      setTooltipPosition({
        x: rect.left + rect.width / 2,
        y: rect.top + 2,
        position: "above",
      });
    } else {
      // Position below the pill - overlap slightly for easy hover
      setTooltipPosition({
        x: rect.left + rect.width / 2,
        y: rect.bottom - 2,
        position: "below",
      });
    }

    // Delay showing tooltip
    tooltipTimeoutRef.current = setTimeout(() => {
      setHoveredMapping(mapping);

      // Use cached data from the hook instead of API call
      const locationId = mapping.location_id;
      const cachedJobs = jobMappings.byLocation[locationId]?.jobs || [];
      const cachedEmployees = employeeMappings.byLocation[locationId]?.employees || [];

      const details: LocationDetails = {
        jobs: cachedJobs.map((j) => ({
          job_id: parseInt(j.job_id) || 0,
          job_name: j.job_name,
        })),
        staffs: cachedEmployees.map((e) => ({
          id: parseInt(e.employee_id) || 0,
          name: e.employee_name,
        })),
        hasDependencies: cachedJobs.length > 0 || cachedEmployees.length > 0,
      };

      setLocationDetails(details);
    }, 200);
  };

  const handlePillMouseLeave = () => {
    // Add delay before closing to allow user to hover into tooltip
    if (tooltipTimeoutRef.current) {
      clearTimeout(tooltipTimeoutRef.current);
    }
    tooltipTimeoutRef.current = setTimeout(() => {
      setHoveredMapping(null);
      setLocationDetails(null);
      setTooltipPosition(null);
    }, 150);
  };

  const handleNavigateToLocation = () => {
    navigate("/catalogue/location");
    setHoveredMapping(null);
  };

  if (loading) {
    return (
      <div className="flex justify-center my-20">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="mb-4 flex flex-col items-start justify-between gap-4 md:flex-row md:items-center">
        <div>
          <h1 className="text-xl font-semibold text-default-800 dark:text-gray-100">
            Account Code Mappings
          </h1>
          <p className="text-sm text-default-500 dark:text-gray-400 mt-1">
            Manage which payroll locations flow into each GL account code
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-default-200 dark:border-gray-700">
        <div className="flex gap-4">
          <button
            onClick={() => setActiveTab("JVSL")}
            className={`py-2 px-4 text-sm font-medium border-b-2 transition-colors ${
              activeTab === "JVSL"
                ? "border-sky-500 text-sky-600 dark:text-sky-400"
                : "border-transparent text-default-500 dark:text-gray-400 hover:text-default-700 dark:hover:text-gray-200"
            }`}
          >
            JVSL - Staff Salary
          </button>
          <button
            onClick={() => setActiveTab("JVDR")}
            className={`py-2 px-4 text-sm font-medium border-b-2 transition-colors ${
              activeTab === "JVDR"
                ? "border-purple-500 text-purple-600 dark:text-purple-400"
                : "border-transparent text-default-500 dark:text-gray-400 hover:text-default-700 dark:hover:text-gray-200"
            }`}
          >
            JVDR - Director's Remuneration
          </button>
        </div>
      </div>

      {/* Search + Summary + Help */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="relative w-full sm:w-64">
            <IconSearch
              className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-default-400 dark:text-gray-500"
              stroke={1.5}
            />
            <input
              type="text"
              placeholder="Search account code..."
              className="w-full rounded-lg border border-default-300 dark:border-gray-600 bg-white dark:bg-gray-800 py-2 pl-10 pr-4 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-3 text-xs text-default-600 dark:text-gray-400">
            <span>{expectedAccountCodes.length} account codes</span>
            <span className="text-default-300 dark:text-gray-600">|</span>
            {unmappedCount > 0 ? (
              <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400 font-medium">
                <IconAlertTriangle size={14} />
                {unmappedCount} unmapped
              </span>
            ) : (
              <span className="flex items-center gap-1 text-green-600 dark:text-green-400">
                <IconCheck size={14} />
                All mapped
              </span>
            )}
          </div>
        </div>
        <button
          onClick={() => setShowHelpDialog(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-default-600 dark:text-gray-400 hover:text-sky-600 dark:hover:text-sky-400 hover:bg-default-100 dark:hover:bg-gray-700 rounded-lg transition-colors self-start sm:self-auto"
          title="Help - Learn about account mappings"
        >
          <IconHelp size={18} />
          <span>Help</span>
        </button>
      </div>

      {/* Account Codes List by Category */}
      <div className="space-y-3">
        {(
          Object.keys(CATEGORY_CONFIG) as Array<keyof typeof CATEGORY_CONFIG>
        ).map((category) => {
          const codes = groupedAccountCodes[category];
          if (!codes?.length) return null;

          const config = CATEGORY_CONFIG[category];
          const isCollapsed = collapsedSections[category];

          return (
            <div
              key={category}
              className="rounded-lg border border-default-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden"
            >
              {/* Category Header */}
              <button
                onClick={() => toggleSection(category)}
                className={`w-full flex items-center justify-between px-4 py-2.5 transition-colors ${
                  category === "salary"
                    ? "bg-green-50 dark:bg-green-900/20 hover:bg-green-100 dark:hover:bg-green-900/30"
                    : category === "epf"
                    ? "bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/30"
                    : category === "socso"
                    ? "bg-purple-50 dark:bg-purple-900/20 hover:bg-purple-100 dark:hover:bg-purple-900/30"
                    : category === "sip"
                    ? "bg-indigo-50 dark:bg-indigo-900/20 hover:bg-indigo-100 dark:hover:bg-indigo-900/30"
                    : "bg-amber-50 dark:bg-amber-900/20 hover:bg-amber-100 dark:hover:bg-amber-900/30"
                }`}
              >
                <div className="flex items-center gap-2">
                  <span>{config.icon}</span>
                  <span
                    className={`font-medium text-sm ${
                      category === "salary"
                        ? "text-green-700 dark:text-green-300"
                        : category === "epf"
                        ? "text-blue-700 dark:text-blue-300"
                        : category === "socso"
                        ? "text-purple-700 dark:text-purple-300"
                        : category === "sip"
                        ? "text-indigo-700 dark:text-indigo-300"
                        : "text-amber-700 dark:text-amber-300"
                    }`}
                  >
                    {config.label}
                  </span>
                  <span className="text-xs text-default-500 dark:text-gray-400">
                    ({codes.length})
                  </span>
                </div>
                {isCollapsed ? (
                  <IconChevronRight size={18} className="text-default-400" />
                ) : (
                  <IconChevronDown size={18} className="text-default-400" />
                )}
              </button>

              {/* Account Codes */}
              {!isCollapsed && (
                <div className="divide-y divide-default-100 dark:divide-gray-700">
                  {codes.map((ac, idx) => {
                    const accountMappings = getMappingsForEntry(ac);
                    const isMapped = accountMappings.length > 0;

                    return (
                      <div
                        key={`${ac.code}-${idx}`}
                        className={`px-3 sm:px-4 py-2 sm:py-2.5 flex flex-col md:flex-row md:items-center justify-between gap-2 md:gap-4 ${
                          !isMapped ? "bg-amber-50/50 dark:bg-amber-900/10" : ""
                        }`}
                      >
                        {/* Account Code Info */}
                        <div className="flex items-center gap-2 sm:gap-3 min-w-0 shrink-0">
                          <code className="font-mono text-xs sm:text-sm font-medium text-sky-700 dark:text-sky-400 bg-sky-50 dark:bg-sky-900/30 px-1.5 sm:px-2 py-0.5 rounded shrink-0">
                            {ac.code}
                          </code>
                          <span className="text-xs sm:text-sm text-default-700 dark:text-gray-300 truncate">
                            {ac.description}
                          </span>
                          {/* Mobile/tablet status indicator */}
                          <div className="md:hidden shrink-0">
                            {isMapped ? (
                              <IconCheck size={14} className="text-green-500" />
                            ) : (
                              <IconAlertTriangle
                                size={14}
                                className="text-amber-500"
                              />
                            )}
                          </div>
                        </div>

                        {/* Location Chips + Status */}
                        <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0 flex-wrap">
                          {/* Mapped locations */}
                          {accountMappings.length > 0 && (
                            <div className="flex items-center gap-1 flex-wrap">
                              {accountMappings.map((mapping) => (
                                <div
                                  key={mapping.id}
                                  className="group relative inline-flex items-center gap-0.5 sm:gap-1 px-1.5 sm:px-2 py-0.5 rounded bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300 text-[10px] sm:text-xs cursor-pointer hover:bg-green-200 dark:hover:bg-green-900/50 transition-colors"
                                  onMouseEnter={(e) => handlePillMouseEnter(mapping, e)}
                                  onMouseLeave={handlePillMouseLeave}
                                >
                                  <span className="font-mono">
                                    {mapping.location_id}
                                  </span>
                                  <span className="text-green-600 dark:text-green-400 text-[9px] sm:text-[10px]">
                                    {getMappingTypeLabel(mapping.mapping_type)}
                                  </span>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleDeleteClick(mapping);
                                    }}
                                    className="ml-0.5 p-0.5 rounded hover:bg-red-200 dark:hover:bg-red-800 text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                                    title="Remove mapping"
                                  >
                                    <IconX
                                      size={10}
                                      className="sm:w-3 sm:h-3"
                                    />
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Add button */}
                          <button
                            onClick={() => handleAddMapping(ac)}
                            className={`inline-flex items-center gap-0.5 sm:gap-1 px-1.5 sm:px-2 py-0.5 sm:py-1 rounded text-[10px] sm:text-xs transition-colors shrink-0 ${
                              isMapped
                                ? "border border-dashed border-default-300 dark:border-gray-600 text-default-500 dark:text-gray-400 hover:border-sky-400 hover:text-sky-500"
                                : "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 hover:bg-amber-200 dark:hover:bg-amber-900/60"
                            }`}
                            title={
                              isMapped
                                ? "Add another location"
                                : "Add location mapping"
                            }
                          >
                            <IconPlus size={12} className="sm:w-3.5 sm:h-3.5" />
                            {!isMapped && <span>Add</span>}
                          </button>

                          {/* Desktop status indicator */}
                          <div className="hidden sm:block">
                            {isMapped ? (
                              <IconCheck size={16} className="text-green-500" />
                            ) : (
                              <IconAlertTriangle
                                size={16}
                                className="text-amber-500"
                              />
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}

        {filteredAccountCodes.length === 0 && (
          <div className="text-center py-10 text-default-500 dark:text-gray-400">
            No account codes found matching "{searchTerm}"
          </div>
        )}
      </div>

      {/* Add Mapping Modal */}
      {showAddModal && selectedAccountCode && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex min-h-screen items-center justify-center p-4">
            <div
              className="fixed inset-0 bg-black/30"
              onClick={() => setShowAddModal(false)}
            />
            <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full p-6">
              <h2 className="text-lg font-semibold text-default-900 dark:text-gray-100 mb-4">
                Add Location Mapping
              </h2>

              <div className="space-y-4">
                {/* Account Code Info */}
                <div className="p-3 rounded-lg bg-sky-50 dark:bg-sky-900/20 border border-sky-200 dark:border-sky-800">
                  <div className="text-xs text-sky-600 dark:text-sky-400 mb-1">
                    Account Code
                  </div>
                  <div className="font-medium text-sky-800 dark:text-sky-200">
                    <code className="font-mono">
                      {selectedAccountCode.code}
                    </code>
                    <span className="text-sky-600 dark:text-sky-400 ml-2">
                      {selectedAccountCode.description}
                    </span>
                  </div>
                </div>

                {/* Mapping Type Selection */}
                <div>
                  <label className="block text-sm font-medium text-default-700 dark:text-gray-200 mb-2">
                    Mapping Type
                  </label>
                  <Listbox
                    value={selectedMappingType}
                    onChange={setSelectedMappingType}
                  >
                    <div className="relative">
                      <ListboxButton className="w-full rounded-lg border border-default-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 pr-10 text-left text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500">
                        <span className="block truncate">
                          {getMappingTypeLabel(selectedMappingType)}
                        </span>
                        <span className="absolute inset-y-0 right-0 flex items-center pr-2 pointer-events-none">
                          <IconChevronDown
                            size={18}
                            className="text-default-400"
                          />
                        </span>
                      </ListboxButton>
                      <ListboxOptions className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-lg bg-white dark:bg-gray-800 py-1 text-sm shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none">
                        {selectedAccountCode.mappingTypes.map((type) => (
                          <ListboxOption
                            key={type}
                            value={type}
                            className={({ focus }) =>
                              `relative cursor-pointer select-none py-2 pl-10 pr-4 ${
                                focus
                                  ? "bg-sky-100 text-sky-900 dark:bg-sky-900/50 dark:text-sky-200"
                                  : "text-gray-900 dark:text-gray-100"
                              }`
                            }
                          >
                            {({ selected }) => (
                              <>
                                <span
                                  className={`block truncate ${
                                    selected ? "font-medium" : ""
                                  }`}
                                >
                                  {getMappingTypeLabel(type)}
                                </span>
                                {selected && (
                                  <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-sky-600 dark:text-sky-400">
                                    <IconCheck size={16} />
                                  </span>
                                )}
                              </>
                            )}
                          </ListboxOption>
                        ))}
                      </ListboxOptions>
                    </div>
                  </Listbox>
                </div>

                {/* Location Selection */}
                <div>
                  <label className="block text-sm font-medium text-default-700 dark:text-gray-200 mb-2">
                    Location
                  </label>
                  <Combobox
                    value={selectedLocation}
                    onChange={(value: string) =>
                      setSelectedLocation(value || "")
                    }
                  >
                    <div className="relative">
                      <ComboboxInput
                        className="w-full rounded-lg border border-default-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 pr-10 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                        displayValue={(id: string) => {
                          if (!id) return "";
                          const loc = availableLocations.find(
                            (l) => l.id === id
                          );
                          return loc ? `${loc.id} - ${loc.name}` : id;
                        }}
                        onChange={(e) => setLocationSearch(e.target.value)}
                        placeholder="Search location..."
                      />
                      <ComboboxButton className="absolute inset-y-0 right-0 flex items-center pr-2">
                        <IconChevronDown
                          size={18}
                          className="text-default-400"
                        />
                      </ComboboxButton>
                      <ComboboxOptions className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-lg bg-white dark:bg-gray-800 py-1 text-sm shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none">
                        {availableLocations.length === 0 ? (
                          <div className="px-4 py-2 text-default-500 dark:text-gray-400">
                            No locations found
                          </div>
                        ) : (
                          availableLocations.map((loc) => (
                            <ComboboxOption
                              key={loc.id}
                              value={loc.id}
                              className={({ focus }) =>
                                `relative cursor-pointer select-none py-2 pl-10 pr-4 ${
                                  focus
                                    ? "bg-sky-100 text-sky-900 dark:bg-sky-900/50 dark:text-sky-200"
                                    : "text-gray-900 dark:text-gray-100"
                                }`
                              }
                            >
                              {({ selected }) => (
                                <>
                                  <span
                                    className={`block truncate ${
                                      selected ? "font-medium" : ""
                                    }`}
                                  >
                                    <span className="font-mono text-sky-600 dark:text-sky-400">
                                      {loc.id}
                                    </span>
                                    <span className="ml-2">{loc.name}</span>
                                  </span>
                                  {selected && (
                                    <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-sky-600 dark:text-sky-400">
                                      <IconCheck size={16} />
                                    </span>
                                  )}
                                </>
                              )}
                            </ComboboxOption>
                          ))
                        )}
                      </ComboboxOptions>
                    </div>
                  </Combobox>
                </div>
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-3 mt-6">
                <Button
                  type="button"
                  variant="outline"
                  color="default"
                  onClick={() => setShowAddModal(false)}
                  disabled={isSaving}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  variant="filled"
                  color="sky"
                  onClick={handleSave}
                  disabled={
                    isSaving || !selectedLocation || !selectedMappingType
                  }
                >
                  {isSaving ? "Saving..." : "Add Mapping"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <ConfirmationDialog
        isOpen={showDeleteDialog}
        onClose={() => setShowDeleteDialog(false)}
        onConfirm={handleConfirmDelete}
        title="Delete Mapping"
        message={`Are you sure you want to delete the mapping from Location ${mappingToDelete?.location_id} (${mappingToDelete?.location_name}) to account ${mappingToDelete?.account_code}? This action cannot be undone.`}
        variant="danger"
      />

      {/* Help Dialog */}
      {showHelpDialog && (
        <div className="fixed inset-0 z-50 overflow-hidden">
          <div className="flex min-h-screen items-center justify-center p-4">
            <div
              className="fixed inset-0 bg-black/30"
              onClick={() => setShowHelpDialog(false)}
            />
            <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full p-4 sm:p-6 max-h-[85vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-base sm:text-lg font-semibold text-default-900 dark:text-gray-100 flex items-center gap-2">
                  <IconHelp size={22} className="text-sky-500" />
                  {helpLanguage === "ms"
                    ? "Panduan Pemetaan Kod Akaun"
                    : "Account Code Mappings Guide"}
                </h2>
                <div className="flex items-center gap-2">
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
                  <button
                    onClick={() => setShowHelpDialog(false)}
                    className="p-1 text-default-400 hover:text-default-600 dark:hover:text-gray-200 rounded"
                  >
                    <IconX size={20} />
                  </button>
                </div>
              </div>

              {helpLanguage === "ms" ? (
                /* Malay Content */
                <div className="space-y-4 text-sm text-default-700 dark:text-gray-300">
                  <div>
                    <h3 className="font-semibold text-default-800 dark:text-gray-100 mb-1.5">
                      Apa itu halaman ini?
                    </h3>
                    <p>
                      Halaman ini menunjukkan semua{" "}
                      <strong>kod akaun GL</strong> yang akan menerima catatan
                      gaji apabila menjana baucar jurnal. Setiap kod akaun
                      mewakili perbelanjaan atau liabiliti tertentu dalam Carta
                      Akaun.
                    </p>
                  </div>

                  <div>
                    <h3 className="font-semibold text-default-800 dark:text-gray-100 mb-1.5">
                      Kod Akaun
                    </h3>
                    <p className="mb-2">
                      Kod akaun yang disenaraikan di sini datang dari Carta
                      Akaun sistem perakaunan anda. Ia disusun mengikut
                      kategori:
                    </p>
                    <ul className="space-y-1.5 text-xs">
                      <li className="flex items-center gap-2">
                        <span className="text-green-600">💰</span>
                        <span>
                          <strong>Gaji & Upah</strong> - Gaji asas, OT, bonus,
                          perbelanjaan komisen
                        </span>
                      </li>
                      <li className="flex items-center gap-2">
                        <span className="text-blue-600">🏦</span>
                        <span>
                          <strong>Caruman EPF Majikan</strong> - Perbelanjaan
                          caruman EPF majikan
                        </span>
                      </li>
                      <li className="flex items-center gap-2">
                        <span className="text-purple-600">🏥</span>
                        <span>
                          <strong>Caruman SOCSO Majikan</strong> - Perbelanjaan
                          caruman SOCSO majikan
                        </span>
                      </li>
                      <li className="flex items-center gap-2">
                        <span className="text-indigo-600">📋</span>
                        <span>
                          <strong>Caruman SIP Majikan</strong> - Perbelanjaan
                          caruman SIP majikan
                        </span>
                      </li>
                      <li className="flex items-center gap-2">
                        <span className="text-amber-600">📊</span>
                        <span>
                          <strong>Akruan</strong> - Liabiliti (gaji belum bayar,
                          EPF belum bayar, dll.)
                        </span>
                      </li>
                    </ul>
                  </div>

                  <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
                    <h3 className="font-semibold text-amber-800 dark:text-amber-300 mb-1.5 flex items-center gap-1.5">
                      <IconAlertTriangle size={16} />
                      Kenapa Pemetaan Penting
                    </h3>
                    <p className="text-amber-700 dark:text-amber-400">
                      Setiap jumlah gaji lokasi perlu mengalir ke akaun GL yang
                      betul.
                      <strong>
                        {" "}
                        Jika kod akaun tiada pemetaan lokasi, jumlah gaji untuk
                        akaun tersebut TIDAK AKAN muncul dalam baucar jurnal
                      </strong>{" "}
                      - bermakna perbelanjaan/liabiliti tersebut tidak akan
                      direkodkan!
                    </p>
                  </div>

                  <div>
                    <h3 className="font-semibold text-default-800 dark:text-gray-100 mb-1.5">
                      Penunjuk Status
                    </h3>
                    <ul className="space-y-2">
                      <li className="flex items-start gap-2">
                        <IconCheck
                          size={16}
                          className="text-green-500 mt-0.5 shrink-0"
                        />
                        <span>
                          <strong>Tanda hijau:</strong> Akaun mempunyai
                          sekurang-kurangnya satu lokasi dipetakan - jumlah akan
                          direkodkan.
                        </span>
                      </li>
                      <li className="flex items-start gap-2">
                        <IconAlertTriangle
                          size={16}
                          className="text-amber-500 mt-0.5 shrink-0"
                        />
                        <span>
                          <strong>Amaran kuning:</strong> Akaun TIADA lokasi
                          dipetakan - jumlah akan HILANG dari baucar!
                        </span>
                      </li>
                      <li className="flex items-start gap-2">
                        <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300 text-xs mt-0.5 shrink-0">
                          <span className="font-mono">02</span>
                          <span className="text-green-600 dark:text-green-400 text-[10px]">
                            Gaji
                          </span>
                        </div>
                        <span>
                          <strong>Cip lokasi:</strong> Menunjukkan lokasi mana
                          yang mengalir ke akaun ini dan jenis pemetaan.
                        </span>
                      </li>
                    </ul>
                  </div>

                  <div>
                    <h3 className="font-semibold text-default-800 dark:text-gray-100 mb-1.5">
                      Cara Guna
                    </h3>
                    <ol className="list-decimal list-inside space-y-1 text-xs">
                      <li>
                        Semak setiap kod akaun - pastikan semua mempunyai
                        sekurang-kurangnya satu lokasi dipetakan
                      </li>
                      <li>
                        Klik <strong>+Tambah</strong> pada mana-mana akaun yang
                        belum dipetakan (kuning) untuk menambah lokasi
                      </li>
                      <li>
                        Untuk menambah lokasi lain ke akaun yang sudah
                        dipetakan, klik butang + kecil
                      </li>
                      <li>
                        Untuk membuang pemetaan, hover di atas cip lokasi dan
                        klik X
                      </li>
                    </ol>
                  </div>
                </div>
              ) : (
                /* English Content */
                <div className="space-y-4 text-sm text-default-700 dark:text-gray-300">
                  <div>
                    <h3 className="font-semibold text-default-800 dark:text-gray-100 mb-1.5">
                      What is this page?
                    </h3>
                    <p>
                      This page shows all the <strong>GL account codes</strong>{" "}
                      that should receive payroll entries when generating
                      journal vouchers. Each account code represents a specific
                      expense or liability in the Chart of Accounts.
                    </p>
                  </div>

                  <div>
                    <h3 className="font-semibold text-default-800 dark:text-gray-100 mb-1.5">
                      The Account Codes
                    </h3>
                    <p className="mb-2">
                      The account codes listed here come from your accounting
                      system's Chart of Accounts. They are organized into
                      categories:
                    </p>
                    <ul className="space-y-1.5 text-xs">
                      <li className="flex items-center gap-2">
                        <span className="text-green-600">💰</span>
                        <span>
                          <strong>Salary & Wages</strong> - Base pay, overtime,
                          bonus, commission expenses
                        </span>
                      </li>
                      <li className="flex items-center gap-2">
                        <span className="text-blue-600">🏦</span>
                        <span>
                          <strong>EPF Employer</strong> - Employer's EPF
                          contribution expenses
                        </span>
                      </li>
                      <li className="flex items-center gap-2">
                        <span className="text-purple-600">🏥</span>
                        <span>
                          <strong>SOCSO Employer</strong> - Employer's SOCSO
                          contribution expenses
                        </span>
                      </li>
                      <li className="flex items-center gap-2">
                        <span className="text-indigo-600">📋</span>
                        <span>
                          <strong>SIP Employer</strong> - Employer's SIP
                          contribution expenses
                        </span>
                      </li>
                      <li className="flex items-center gap-2">
                        <span className="text-amber-600">📊</span>
                        <span>
                          <strong>Accruals</strong> - Liabilities (salary
                          payable, EPF payable, etc.)
                        </span>
                      </li>
                    </ul>
                  </div>

                  <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
                    <h3 className="font-semibold text-amber-800 dark:text-amber-300 mb-1.5 flex items-center gap-1.5">
                      <IconAlertTriangle size={16} />
                      Why Mapping Matters
                    </h3>
                    <p className="text-amber-700 dark:text-amber-400">
                      Each payroll location's amounts need to flow into the
                      correct GL account.
                      <strong>
                        {" "}
                        If an account code has no location mappings, payroll
                        amounts for that account will NOT appear in the journal
                        voucher
                      </strong>{" "}
                      - meaning those expenses/liabilities won't be recorded!
                    </p>
                  </div>

                  <div>
                    <h3 className="font-semibold text-default-800 dark:text-gray-100 mb-1.5">
                      Status Indicators
                    </h3>
                    <ul className="space-y-2">
                      <li className="flex items-start gap-2">
                        <IconCheck
                          size={16}
                          className="text-green-500 mt-0.5 shrink-0"
                        />
                        <span>
                          <strong>Green check:</strong> Account has at least one
                          location mapped - amounts will be recorded.
                        </span>
                      </li>
                      <li className="flex items-start gap-2">
                        <IconAlertTriangle
                          size={16}
                          className="text-amber-500 mt-0.5 shrink-0"
                        />
                        <span>
                          <strong>Amber warning:</strong> Account has NO
                          locations mapped - amounts will be MISSING from
                          vouchers!
                        </span>
                      </li>
                      <li className="flex items-start gap-2">
                        <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300 text-xs mt-0.5 shrink-0">
                          <span className="font-mono">02</span>
                          <span className="text-green-600 dark:text-green-400 text-[10px]">
                            Salary
                          </span>
                        </div>
                        <span>
                          <strong>Location chip:</strong> Shows which location's
                          amounts flow into this account and the mapping type.
                        </span>
                      </li>
                    </ul>
                  </div>

                  <div>
                    <h3 className="font-semibold text-default-800 dark:text-gray-100 mb-1.5">
                      How to Use
                    </h3>
                    <ol className="list-decimal list-inside space-y-1 text-xs">
                      <li>
                        Review each account code - ensure all have at least one
                        location mapped
                      </li>
                      <li>
                        Click <strong>+Add</strong> on any unmapped (amber)
                        account to add a location
                      </li>
                      <li>
                        To add another location to an already-mapped account,
                        click the small + button
                      </li>
                      <li>
                        To remove a mapping, hover over the location chip and
                        click the X
                      </li>
                    </ol>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Location Tooltip */}
      {hoveredMapping && tooltipPosition && (
        <div
          className="fixed z-[60] bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-default-200 dark:border-gray-700 p-3 min-w-[200px] max-w-[280px]"
          style={
            tooltipPosition.position === "above"
              ? {
                  left: `${Math.min(Math.max(tooltipPosition.x, 150), window.innerWidth - 150)}px`,
                  top: `${tooltipPosition.y}px`,
                  transform: "translate(-50%, -100%)",
                }
              : {
                  left: `${Math.min(Math.max(tooltipPosition.x, 150), window.innerWidth - 150)}px`,
                  top: `${tooltipPosition.y}px`,
                  transform: "translateX(-50%)",
                }
          }
          onMouseEnter={() => {
            if (tooltipTimeoutRef.current) {
              clearTimeout(tooltipTimeoutRef.current);
            }
          }}
          onMouseLeave={handlePillMouseLeave}
        >
          {/* Location Title - Clickable */}
          <button
            onClick={handleNavigateToLocation}
            className="w-full text-left group mb-2"
          >
            <div className="flex items-center justify-between gap-2">
              <div>
                <span className="font-mono text-sm font-bold text-sky-600 dark:text-sky-400">
                  {hoveredMapping.location_id}
                </span>
                <span className="text-sm font-medium text-default-800 dark:text-gray-100 ml-2">
                  {hoveredMapping.location_name}
                </span>
              </div>
              <IconExternalLink
                size={14}
                className="text-default-400 group-hover:text-sky-500 transition-colors shrink-0"
              />
            </div>
            <div className="text-[10px] text-sky-500 dark:text-sky-400 mt-0.5 group-hover:underline">
              View in Location Page
            </div>
          </button>

          <div className="border-t border-default-200 dark:border-gray-700 pt-2 space-y-2">
            {locationDetails ? (
              <>
                {/* Jobs */}
                <div>
                  <div className="flex items-center gap-1.5 text-xs font-medium text-default-600 dark:text-gray-400 mb-1">
                    <IconBriefcase size={12} />
                    <span>Jobs ({locationDetails.jobs.length})</span>
                  </div>
                  {locationDetails.jobs.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {locationDetails.jobs.slice(0, 6).map((job) => (
                        <span
                          key={job.job_id}
                          className="px-1.5 py-0.5 text-[10px] bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded"
                        >
                          {job.job_name}
                        </span>
                      ))}
                      {locationDetails.jobs.length > 6 && (
                        <span className="px-1.5 py-0.5 text-[10px] text-default-500">
                          +{locationDetails.jobs.length - 6} more
                        </span>
                      )}
                    </div>
                  ) : (
                    <span className="text-[10px] text-default-400 italic">No jobs mapped</span>
                  )}
                </div>

                {/* Employees */}
                <div>
                  <div className="flex items-center gap-1.5 text-xs font-medium text-default-600 dark:text-gray-400 mb-1">
                    <IconUsers size={12} />
                    <span>Employees ({locationDetails.staffs.length})</span>
                  </div>
                  {locationDetails.staffs.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {locationDetails.staffs.slice(0, 6).map((staff) => (
                        <span
                          key={staff.id}
                          className="px-1.5 py-0.5 text-[10px] bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded"
                        >
                          {staff.name}
                        </span>
                      ))}
                      {locationDetails.staffs.length > 6 && (
                        <span className="px-1.5 py-0.5 text-[10px] text-default-500">
                          +{locationDetails.staffs.length - 6} more
                        </span>
                      )}
                    </div>
                  ) : (
                    <span className="text-[10px] text-default-400 italic">No employees assigned</span>
                  )}
                </div>
              </>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
};

export default LocationAccountMappingsPage;
