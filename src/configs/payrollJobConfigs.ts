// src/configs/payrollJobConfigs.ts

export type ContextFieldType = "number" | "text" | "select" | "date";

export interface ContextFieldOption {
  id: string | number;
  label: string;
}

export interface ContextField {
  id: string;
  label: string;
  type: ContextFieldType;
  required?: boolean;
  defaultValue?: any;
  linkedPayCode?: string; // Pay code ID that uses this context value as units
  options?: ContextFieldOption[]; // For select type
  min?: number;
  max?: number;
  displayInSummary?: boolean;
}

export interface JobTypeConfig {
  id: string;
  name: string;
  section: string[];
  defaultShifts: number[];
  contextFields: ContextField[];
  requiresOvertimeCalc: boolean;
  defaultHours: number;
  jobIds: string[];
}

export interface JobTypeConfigs {
  [key: string]: JobTypeConfig;
}

export const JOB_CONFIGS: JobTypeConfigs = {
  // MEE Production
  MEE: {
    id: "MEE",
    name: "Mee Production",
    section: ["MEE"],
    defaultShifts: [1, 2], // Day and Night
    requiresOvertimeCalc: true,
    defaultHours: 7,
    jobIds: ["MEE_FOREMAN", "MEE_TEPUNG", "MEE_ROLL", "MEE_SANGKUT"],
    contextFields: [
      {
        id: "totalBags",
        label: "Jumlah Tepung (Bags)",
        type: "number",
        required: true,
        defaultValue: 50,
        min: 0,
        linkedPayCode: "TEPUNG_S1", // This pay code will use totalBags as units
        displayInSummary: true,
      },
    ],
  },

  STEAM: {
    id: "STEAM",
    name: "Steam Production",
    section: ["STEAM"],
    defaultShifts: [1, 2], // Day and Night
    requiresOvertimeCalc: true,
    defaultHours: 7,
    jobIds: [],
    contextFields: [
      {
        id: "coalUsage",
        label: "Arang (Bag)",
        type: "number",
        required: true,
        defaultValue: 0,
        min: 0,
        linkedPayCode: "STEAM_COAL_01", // Coal usage pay code
        displayInSummary: true,
      },
    ],
  },

  MAINTENANCE: {
    id: "MAINTENANCE",
    name: "Maintenance Work",
    section: ["MAINTENANCE"],
    defaultShifts: [1, 2], // Day and Night
    requiresOvertimeCalc: true,
    defaultHours: 8,
    jobIds: [],
    contextFields: [],
  },
};

// Helper functions to work with job configs
export const getJobConfig = (jobType: string): JobTypeConfig | undefined => {
  return JOB_CONFIGS[jobType];
};

export const getContextLinkedPayCodes = (jobConfig: JobTypeConfig) => {
  return jobConfig.contextFields
    .filter((field) => field.linkedPayCode)
    .reduce((acc, field) => {
      acc[field.linkedPayCode!] = field;
      return acc;
    }, {} as Record<string, ContextField>);
};

export const getJobsBySection = (section: string): JobTypeConfig[] => {
  return Object.values(JOB_CONFIGS).filter((job) =>
    job.section.includes(section)
  );
};

export const getJobIds = (jobType: string): string[] => {
  const config = JOB_CONFIGS[jobType];
  return config?.jobIds || [];
};
