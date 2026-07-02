// src/configs/jpPayrollJobConfigs.ts
// Jelly Polly payroll job/page configuration, mirroring payrollJobConfigs.ts.
// JP staff membership is user-managed via jellypolly.payroll_employees
// (job_type below), NOT via staffs.job — jobIds here point at the JP_* rows in
// public.jobs and are used for pay-code mappings and work-log entry job_id.

import { JobTypeConfig, JobTypeConfigs } from "./payrollJobConfigs";

// Assignment job types available on the JP Staff Assignment page.
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
    description: "Daily plastic machine entry (30ml / 70ml cartons)",
  },
  {
    id: "PRODUCTION",
    label: "Production",
    description: "JP production entry workers (packing)",
  },
];

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
