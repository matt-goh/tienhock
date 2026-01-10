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
  defaultShifts?: number[];
  contextFields: ContextField[];
  requiresOvertimeCalc?: boolean;
  defaultHours?: number;
  jobIds: string[];
  replaceUnits?: string;
  entryMode?: "daily" | "monthly"; // Default: "daily"
}

export interface JobTypeConfigs {
  [key: string]: JobTypeConfig;
}

export const JOB_CONFIGS: JobTypeConfigs = {
  // MEE Production
  MEE: {
    // Creates a page for MEE Production
    id: "MEE",
    name: "Mee Production",
    section: ["MEE"],
    defaultShifts: [1, 2], // Day and Night
    requiresOvertimeCalc: true, // true if overtime calculation is required
    defaultHours: 7,
    jobIds: ["MEE_FOREMAN", "MEE_TEPUNG", "MEE_ROLL", "MEE_SANGKUT"], // Employees associated with these jobs will show up in this page
    contextFields: [
      {
        id: "totalBags",
        label: "Jumlah Tepung (Karung)",
        type: "number",
        required: true,
        defaultValue: 50,
        min: 0,
        linkedPayCode: "TEPUNG_S1", // This pay code will use totalBags as units
        displayInSummary: true,
      },
    ],
  },

  // BIHUN Production
  BIHUN: {
    id: "BIHUN",
    name: "Bihun Production",
    section: ["BIHUN"],
    defaultShifts: [1, 2],
    requiresOvertimeCalc: true,
    defaultHours: 7,
    jobIds: [
      "BIHUN_FOREMAN",
      "BH_BERAS",
      "BH_CAMPURAN",
      "BIHUN_SANGKUT",
      "BH_DRYER",
    ],
    contextFields: [
      {
        id: "totalBeras",
        label: "Beras (Karung)",
        type: "number",
        required: true,
        defaultValue: 50,
        min: 0,
        linkedPayCode: "BH_BERAS",
        displayInSummary: true,
      },
      {
        id: "totalSago",
        label: "Sago (Karung)",
        type: "number",
        required: true,
        defaultValue: 25,
        min: 0,
        linkedPayCode: "BH_SAGO",
        displayInSummary: true,
      },
      {
        id: "totalJagung",
        label: "Jagung (Karung)",
        type: "number",
        required: true,
        defaultValue: 20,
        min: 0,
        linkedPayCode: "BH_JAGUNG",
        displayInSummary: true,
      },
      {
        id: "totalCampuran",
        label: "Campuran (Karung)",
        type: "number",
        required: true,
        defaultValue: 8,
        min: 0,
        linkedPayCode: "BH_CAMPURAN",
        displayInSummary: true,
      },
      {
        id: "totalBungkus",
        label: "Bungkusan (Bags)",
        type: "number",
        required: true,
        defaultValue: 0,
        min: 0,
        linkedPayCode: "BH_BUNGKUSAN",
        displayInSummary: true,
      },
    ],
  },

  MAINTENANCE: {
    id: "MAINTENANCE",
    name: "Maintenance",
    section: ["MAINTENANCE"],
    entryMode: "monthly",
    defaultHours: 176, // Default monthly hours
    jobIds: ["MAINTEN"],
    contextFields: [],
  },

  BOILER: {
    id: "BOILER",
    name: "Boiler",
    section: ["BOILER"],
    defaultShifts: [1, 2],
    requiresOvertimeCalc: true,
    defaultHours: 7,
    jobIds: ["BOILER_MAN", "BOILER_JAGA"],
    contextFields: [],
  },

  SALESMAN: {
    id: "SALESMAN",
    name: "Salesman",
    section: ["SALES"],
    replaceUnits: "Bag", // This triggers the alternative DailyLogEntryPage behavior
    contextFields: [], // No context fields for salesmen
    jobIds: ["SALESMAN", "SALESMAN_IKUT"], // Job IDs for salesmen
  },

  OFFICE: {
    id: "OFFICE",
    name: "Office",
    section: ["OFFICE"],
    entryMode: "monthly",
    defaultHours: 1, // Default hours for office staff
    contextFields: [],
    jobIds: ["OFFICE"],
  },

  TUKANG_SAPU: {
    id: "TUKANG_SAPU",
    name: "Tukang Sapu",
    section: ["SAPU"],
    entryMode: "monthly",
    defaultHours: 176, // Default monthly hours
    contextFields: [],
    jobIds: ["SAPU"],
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
