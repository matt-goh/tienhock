// src/configs/journalVoucherMappings.ts
// Configuration for mapping payroll locations to account codes for journal voucher generation

// Location ID to Name mapping (same as SalaryReportPage)
export const LOCATION_MAP: { [key: string]: string } = {
  "01": "DIRECTOR'S REMUNERATION",
  "02": "OFFICE",
  "03": "SALESMAN",
  "04": "IKUT LORI",
  "06": "JAGA BOILER",
  "07": "MESIN & SANGKUT MEE",
  "08": "PACKING MEE",
  "09": "MESIN BIHUN",
  "10": "SANGKUT BIHUN",
  "11": "PACKING BIHUN",
  "13": "TUKANG SAPU",
  "14": "KILANG KERJA LUAR",
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

// Account code mapping for each location
// Note: Some locations share account codes based on category grouping
interface LocationAccountCodes {
  salary: string;        // Salary/Wages debit account
  epf_employer: string;  // EPF employer contribution debit account
  socso_employer: string; // SOCSO employer contribution debit account
  sip_employer: string;  // SIP employer contribution debit account
}

interface DirectorAccountCodes extends LocationAccountCodes {
  bonus?: string;        // Bonus account (directors only)
  accrual_salary: string;
  accrual_epf: string;
  accrual_socso: string;
  accrual_sip: string;
  accrual_pcb: string;
}

// Director's Remuneration accounts (Location 01 - JVDR voucher)
export const DIRECTOR_ACCOUNTS: DirectorAccountCodes = {
  salary: "MBDRS",           // Directors Remuneration - Salary
  bonus: "MBDRB",            // Directors Remuneration - Bonus
  epf_employer: "MBDRE",     // Directors Remuneration - EPF
  socso_employer: "MBDRSC",  // Directors Remuneration - SOCSO
  sip_employer: "MBDRSIP",   // Directors Remuneration - SIP
  accrual_salary: "ACD_SAL", // Accrual Directors Salary
  accrual_epf: "ACD_EPF",    // Accrual Directors EPF
  accrual_socso: "ACD_SC",   // Accrual Directors SOCSO
  accrual_sip: "ACD_SIP",    // Accrual Directors SIP
  accrual_pcb: "ACD_PCB",    // Accrual Directors PCB
};

// Staff account codes by location (Locations 02-24 - JVSL voucher)
// Maps location_id to account code suffixes
export const LOCATION_ACCOUNT_MAPPINGS: { [key: string]: LocationAccountCodes } = {
  "02": { // Office
    salary: "MBS_O",
    epf_employer: "MBE_O",
    socso_employer: "MBSC_O",
    sip_employer: "MBSIP_O",
  },
  "03": { // Salesman
    salary: "MBS_SMO",
    epf_employer: "MBE_SM",
    socso_employer: "MBSC_SM",
    sip_employer: "MBSIP_SM",
  },
  "04": { // Ikut Lori
    salary: "MBS_ILO",
    epf_employer: "MBE_IL",
    socso_employer: "MBSC_IL",
    sip_employer: "MBSIP_IL",
  },
  "06": { // Jaga Boiler
    salary: "MBS_JB",
    epf_employer: "MBE_JB",
    socso_employer: "MBSC_JB",
    sip_employer: "MBSIP_JB",
  },
  "07": { // Mesin & Sangkut Mee - uses Mesin Mee accounts
    salary: "MBS_MM",
    epf_employer: "MBE_MM",
    socso_employer: "MBSC_MM",
    sip_employer: "MBSIP_MM",
  },
  "08": { // Packing Mee
    salary: "MBS_PM",
    epf_employer: "MBE_PM",
    socso_employer: "MBSC_PM",
    sip_employer: "MBSIP_PM",
  },
  "09": { // Mesin Bihun
    salary: "MBS_MB",
    epf_employer: "MBE_MB",
    socso_employer: "MBSC_MB",
    sip_employer: "MBSIP_MB",
  },
  "10": { // Sangkut Bihun
    salary: "MBS_SB",
    epf_employer: "MBE_SB",
    socso_employer: "MBSC_SB",
    sip_employer: "MBSIP_SB",
  },
  "11": { // Packing Bihun
    salary: "MBS_PB",
    epf_employer: "MBE_PB",
    socso_employer: "MBSC_PB",
    sip_employer: "MBSIP_PB",
  },
  "13": { // Tukang Sapu
    salary: "MBS_TS",
    epf_employer: "MBE_TS",
    socso_employer: "MBSC_TS",
    sip_employer: "MBSIP_TS",
  },
  "14": { // Kilang Kerja Luar (Maintenance)
    salary: "MBS_M",
    epf_employer: "MBE_M",
    socso_employer: "MBSC_M",
    sip_employer: "MBSIP_M",
  },
  // Commission locations (16-21) - typically no EPF/SOCSO/SIP
  "16": { // Comm-Mesin Mee
    salary: "MBS_CMM",
    epf_employer: "",
    socso_employer: "",
    sip_employer: "",
  },
  "17": { // Comm-Mesin Bihun
    salary: "MBS_CMB",
    epf_employer: "",
    socso_employer: "",
    sip_employer: "",
  },
  "18": { // Comm-Kilang
    salary: "MBS_CK",
    epf_employer: "",
    socso_employer: "",
    sip_employer: "",
  },
  "19": { // Comm-Lori
    salary: "MBS_CL",
    epf_employer: "",
    socso_employer: "",
    sip_employer: "",
  },
  "20": { // Comm-Boiler
    salary: "MBS_CB",
    epf_employer: "",
    socso_employer: "",
    sip_employer: "",
  },
  "21": { // Comm-Forklift/Case
    salary: "MBS_CF",
    epf_employer: "",
    socso_employer: "",
    sip_employer: "",
  },
  "22": { // Kilang Habuk - uses Lori Habuk accounts
    salary: "MBS_LH",
    epf_employer: "MBE_LH",
    socso_employer: "MBSC_LH",
    sip_employer: "MBSIP_LH",
  },
  "23": { // Cuti Tahunan (Annual Leave) - special handling
    salary: "MBS_AL",
    epf_employer: "",
    socso_employer: "",
    sip_employer: "",
  },
  "24": { // Special OT - special handling
    salary: "MBS_SOT",
    epf_employer: "",
    socso_employer: "",
    sip_employer: "",
  },
};

// Staff accrual accounts (used for JVSL credits)
export const STAFF_ACCRUAL_ACCOUNTS = {
  salary: "ACW_SAL",      // Accrual Salary Payables
  epf: "ACW_EPF",         // Accrual EPF
  socso: "ACW_SC",        // Accrual SOCSO
  sip: "ACW_SIP",         // Accrual SIP
  pcb: "ACW_PCB",         // Accrual PCB Payables
};

// Entry types for journal vouchers
export const VOUCHER_ENTRY_TYPES = {
  JVDR: "JVDR",  // Journal Voucher Director's Remuneration
  JVSL: "JVSL",  // Journal Voucher Staff Salary
};

// Generate voucher reference number
export const generateVoucherReference = (type: string, month: number, year: number): string => {
  const monthStr = (month + 1).toString().padStart(2, "0"); // month is 0-indexed
  const yearStr = year.toString().slice(-2);
  return `${type}/${monthStr}/${yearStr}`;
};

// Get all staff locations (excluding director location 01)
export const getStaffLocations = (): string[] => {
  return Object.keys(LOCATION_MAP).filter(id => id !== "01");
};

// Check if location has statutory contributions
export const hasStatutoryContributions = (locationId: string): boolean => {
  const mapping = LOCATION_ACCOUNT_MAPPINGS[locationId];
  if (!mapping) return false;
  return !!(mapping.epf_employer || mapping.socso_employer || mapping.sip_employer);
};
