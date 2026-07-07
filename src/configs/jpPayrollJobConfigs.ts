// src/configs/jpPayrollJobConfigs.ts
// Jelly Polly payroll job/page configuration, mirroring payrollJobConfigs.ts.
// JP staff membership is derived from jellypolly.staffs.job (the staff's JP_*
// job ids), exactly like TH — manage it on the JP Job page or the staff form.
// jobIds here point at the JP_* rows in jellypolly.jobs and are used for
// pay-code mappings, work-log entry job_id, and page membership.

import { JobTypeConfig, JobTypeConfigs } from "./payrollJobConfigs";

export type JPJobType =
  | "OFFICE"
  | "MAINTENANCE"
  | "SALESMAN"
  | "SALESMAN_IKUT"
  | "ICE_POLLY"
  | "JELLY_CUP"
  | "PLASTIC"
  | "PRODUCTION";

// JP payroll job types (used for payroll section labels).
export interface JPJobTypeInfo {
  id: string;
  label: string;
  description: string;
}

export const JP_JOB_TYPES: JPJobTypeInfo[] = [
  {
    id: "OFFICE",
    label: "Office",
    description: "Monthly office payroll (hours + pay codes)",
  },
  {
    id: "MAINTENANCE",
    label: "Maintenance",
    description: "Monthly maintenance payroll (hours + pay codes)",
  },
  {
    id: "SALESMAN",
    label: "Salesman",
    description: "Daily salesman entry (cartons sold from JP invoices)",
  },
  {
    id: "SALESMAN_IKUT",
    label: "Salesman Ikut",
    description: "Lorry followers for the daily salesman entry",
  },
  {
    id: "ICE_POLLY",
    label: "Daily Ice-Polly Machine",
    description: "Daily Ice-Polly machine work entry",
  },
  {
    id: "JELLY_CUP",
    label: "Daily Jelly Cup Machine",
    description: "Daily Jelly Cup machine work entry",
  },
  {
    id: "PLASTIC",
    label: "Daily Machine Plastic",
    description: "Daily plastic machine pay-code entry",
  },
  {
    id: "PRODUCTION",
    label: "Production",
    description: "JP production entry workers (packing)",
  },
];

// Exact JP job type -> jellypolly.jobs id(s) mapping. Holding one of these
// jobs in staffs.job makes a staff a member of the corresponding page.
export const JP_JOB_TYPE_TO_JOB_IDS: Record<JPJobType, string[]> = {
  OFFICE: ["JP_OFFICE"],
  MAINTENANCE: ["JP_MAINTEN"],
  SALESMAN: ["JP_SALESMAN"],
  SALESMAN_IKUT: ["JP_SALESMAN_IKUT"],
  ICE_POLLY: ["JP_ICE_POLLY"],
  JELLY_CUP: ["JP_JELLY_CUP"],
  PLASTIC: ["JP_PLASTIC"],
  PRODUCTION: ["JP_PACKING"],
};

// Every JP job id that grants payroll membership.
export const JP_ALL_JOB_IDS: string[] = Object.values(
  JP_JOB_TYPE_TO_JOB_IDS
).flat();

// True when the staff's job array contains one of the given JP job ids.
export const staffHoldsJPJob = (
  staffJob: string[] | null | undefined,
  jobIds: string[]
): boolean =>
  Array.isArray(staffJob) && staffJob.some((jobId) => jobIds.includes(jobId));

export const JP_JOB_CONFIGS: JobTypeConfigs = {
  OFFICE: {
    id: "OFFICE",
    name: "Office",
    section: ["OFFICE"],
    entryMode: "monthly",
    defaultHours: 1,
    jobIds: ["JP_OFFICE"],
    contextFields: [],
  },

  MAINTENANCE: {
    id: "MAINTENANCE",
    name: "Maintenance",
    section: ["MAINTENANCE"],
    entryMode: "monthly",
    defaultHours: 176,
    jobIds: ["JP_MAINTEN"],
    contextFields: [],
  },

  SALESMAN: {
    id: "SALESMAN",
    name: "Salesman",
    section: ["SALESMAN"],
    replaceUnits: "Ctn",
    contextFields: [],
    jobIds: ["JP_SALESMAN", "JP_SALESMAN_IKUT"],
  },

  ICE_POLLY: {
    id: "ICE_POLLY",
    name: "Daily Ice-Polly Machine",
    section: ["ICE_POLLY"],
    defaultShifts: [1, 2],
    requiresOvertimeCalc: true,
    defaultHours: 7,
    jobIds: ["JP_ICE_POLLY"],
    contextFields: [
      {
        id: "totalBungkus",
        label: "Bungkusan",
        type: "number",
        required: false,
        defaultValue: 0,
        min: 0,
        // No linkedPayCode — bungkusan is informational only (stored in context_data)
        displayInSummary: true,
      },
    ],
  },

  JELLY_CUP: {
    id: "JELLY_CUP",
    name: "Daily Jelly Cup Machine",
    section: ["JELLY_CUP"],
    defaultShifts: [1, 2],
    requiresOvertimeCalc: true,
    defaultHours: 7,
    jobIds: ["JP_JELLY_CUP"],
    contextFields: [
      {
        id: "totalBungkus",
        label: "Bungkusan",
        type: "number",
        required: false,
        defaultValue: 0,
        min: 0,
        displayInSummary: true,
      },
    ],
  },

  PLASTIC: {
    id: "PLASTIC",
    name: "Daily Machine Plastic",
    section: ["PLASTIC"],
    defaultShifts: [1, 2],
    defaultHours: 7,
    jobIds: ["JP_PLASTIC"],
    contextFields: [],
  },
};

export const getJPJobConfig = (jobType: string): JobTypeConfig | undefined => {
  return JP_JOB_CONFIGS[jobType];
};

export const getJobIds = (jobType: string): string[] => {
  const config: JobTypeConfig | undefined = JP_JOB_CONFIGS[jobType];
  return config?.jobIds || [];
};

// Same helper as payrollJobConfigs — re-exported so JP pages import everything
// from one config module.
export { getContextLinkedPayCodes } from "./payrollJobConfigs";
