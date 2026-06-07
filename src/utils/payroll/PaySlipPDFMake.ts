// src/utils/payroll/PaySlipPDFMake.ts
import pdfMake from "pdfmake/build/pdfmake";
import * as pdfFonts from "pdfmake/build/vfs_fonts";
import {
  TDocumentDefinitions,
  Content,
  TableCell,
  ContentTable,
} from "pdfmake/interfaces";
import {
  EmployeePayroll,
  MidMonthPayroll,
  PayrollItem,
} from "../../types/types";
import {
  getMonthName,
  consolidatePayrollItems,
  filterOutLeaveDayItems,
  groupConsolidatedItemsByType,
  ConsolidatedPayrollItem,
} from "./payrollUtils";

// Initialize pdfmake with fonts (uses bundled Roboto font which is similar to Helvetica)
(pdfMake as any).vfs = (pdfFonts as any).pdfMake?.vfs || pdfFonts;

// Types
interface IndividualJobPayroll {
  job_type: string;
  items: any[];
  leave_records?: any[];
  commission_records?: any[];
  others_records?: any[];
  gross_pay_portion: number;
}

interface AdvanceRecord {
  description?: string | null;
  amount?: number | string | null;
  rate?: number | string | null;
  rate_unit?: string | null;
  quantity?: number | string | null;
  id?: number | string | null;
  pay_code_id?: string | null;
  pay_code_pay_type?: string | null;
  employee_id?: string | null;
  record_date?: string | null;
  commission_date?: string | null;
  location_code?: string | number | null;
  employee_name?: string | null;
  is_advance?: boolean | null;
}

interface MergedAdvance {
  description: string;
  merged_amount: number;
  merged_count: number;
  primary: AdvanceRecord;
  rows: AdvanceRecord[];
}

// Merge records that share a description (case-insensitive) into a single line.
// Used for both commission_records and others_records so duplicate rows collapse on display.
const mergeByDescription = (rows: AdvanceRecord[] = []): MergedAdvance[] => {
  const map = new Map<string, MergedAdvance>();
  rows.forEach((row) => {
    const key = (row.description || "").trim().toLowerCase();
    const existing = map.get(key);
    if (existing) {
      existing.merged_amount += Number(row.amount) || 0;
      existing.merged_count += 1;
      existing.rows.push(row);
    } else {
      map.set(key, {
        description: row.description || "",
        merged_amount: Number(row.amount) || 0,
        merged_count: 1,
        primary: row,
        rows: [row],
      });
    }
  });
  return Array.from(map.values());
};

const isAdvanceRecord = (record: AdvanceRecord): boolean =>
  record.is_advance !== false;

const getCommissionQuantityLabel = (record: MergedAdvance): string =>
  record.rows.every((row: AdvanceRecord) => row.is_advance === false)
    ? "Bonus"
    : "Advance";

interface CombinedAdvanceDisplay {
  // Commission records with no same-description Others row — rendered as their
  // own "Advance" earnings rows, exactly as before.
  standaloneCommissions: MergedAdvance[];
  // Each Others row paired with the commission amount folded into it (0 if none).
  othersRows: { record: MergedAdvance; foldedCommission: number }[];
}

// Fold commission records into a same-description Others row so the incentive
// shows as one combined earnings line (e.g. "Insentif Tidak Tetap" 50 commission
// + 830 Others = 880). The commission's advance deduction at the bottom of the
// payslip is built from the full commission list separately, so it is unaffected.
const combineCommissionsIntoOthers = (
  mergedCommissions: MergedAdvance[],
  mergedOthers: MergedAdvance[],
): CombinedAdvanceDisplay => {
  const descKey = (description: string): string =>
    (description || "").trim().toLowerCase();
  const othersKeys = new Set(
    mergedOthers.map((other) => descKey(other.description)),
  );
  const foldedByKey = new Map<string, number>();
  const standaloneCommissions: MergedAdvance[] = [];

  mergedCommissions.forEach((commission) => {
    const key = descKey(commission.description);
    if (othersKeys.has(key)) {
      foldedByKey.set(
        key,
        (foldedByKey.get(key) || 0) + commission.merged_amount,
      );
    } else {
      standaloneCommissions.push(commission);
    }
  });

  const othersRows = mergedOthers.map((record) => ({
    record,
    foldedCommission: foldedByKey.get(descKey(record.description)) || 0,
  }));

  return { standaloneCommissions, othersRows };
};

interface GroupedLeaveRecord {
  leave_type: string;
  total_days: number;
  total_amount: number;
  holiday_descriptions: string[];
}

// Commission records carrying this location_code are Cuti Tahunan entries
// (recorded via the Others/Incentives page). They are still paid as advances
// — and therefore still appear in the advance deduction at the bottom of the
// payslip — but they should be shown alongside other leaves and counted in
// Jumlah Cuti rather than Jumlah lain-lain.
const CUTI_TAHUNAN_COMMISSION_LOCATION_CODE = "23";

const getDescriptionKey = (description: string | null | undefined): string =>
  (description || "").trim().toLowerCase();

const isIxtPayCode = (payCodeId: string | null | undefined): boolean =>
  (payCodeId || "").toUpperCase() === "IXT";

const isIncentivePayrollItem = (item: PayrollItem): boolean =>
  isIxtPayCode(item.pay_code_id);

// Bonus paycode items (Tambahan items with pay code BONUS) are pulled out of the
// Tambahan section and folded into the incentive/commission display stream so a
// Bonus recorded as a Tambahan paycode merges (by description) with a Bonus from
// the Bonus page into one line. Advance Bonus-page records still appear in the
// advance deduction at the bottom (built separately from commission_records).
const isBonusPayCode = (payCodeId: string | null | undefined): boolean =>
  (payCodeId || "").toUpperCase() === "BONUS";

const isBonusPayrollItem = (item: PayrollItem): boolean =>
  isBonusPayCode(item.pay_code_id);

const isIncentiveOthersRecord = (record: AdvanceRecord): boolean =>
  record.pay_code_pay_type === "Tambahan" && isIxtPayCode(record.pay_code_id);

const isCutiTahunanCommission = (record: any): boolean => {
  return (
    String(record?.location_code || "") ===
      CUTI_TAHUNAN_COMMISSION_LOCATION_CODE ||
    getDescriptionKey(record?.description) === "cuti tahunan"
  );
};

const buildIncentiveRecordsFromOthers = (
  records: AdvanceRecord[] = [],
): AdvanceRecord[] =>
  records.map((record: AdvanceRecord) => ({
    ...record,
    commission_date: record.record_date || null,
    is_advance: false,
  }));

const buildIncentiveRecordsFromPayrollItems = (
  items: PayrollItem[] = [],
  employeeId: string | null | undefined,
  employeeName: string | null | undefined,
  fallbackDate: string,
): AdvanceRecord[] =>
  items.map((item: PayrollItem) => ({
    id: item.id ? -Number(item.id) : null,
    employee_id: item.source_employee_id || employeeId || null,
    employee_name: employeeName || null,
    commission_date: item.source_date || fallbackDate,
    description: item.description,
    amount: Number(item.amount) || 0,
    is_advance: false,
  }));

interface PaySlipPDFProps {
  payroll: EmployeePayroll;
  companyName?: string;
  staffDetails?: {
    name: string;
    icNo: string;
    jobName: string;
    section: string;
  };
  midMonthPayroll?: MidMonthPayroll | null;
}

// Helper functions
const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat("en-MY", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
};

const isMoneyEqual = (left: number, right: number): boolean => {
  return Math.abs(left - right) < 0.005;
};

const prettifyLeaveType = (leaveType: string): string => {
  return leaveType
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
};

const getLeaveDisplayName = (leaveRecord: GroupedLeaveRecord): string => {
  const baseLabel = prettifyLeaveType(leaveRecord.leave_type);
  if (
    leaveRecord.leave_type === "cuti_umum" &&
    leaveRecord.holiday_descriptions.length > 0
  ) {
    return `${baseLabel} - ${leaveRecord.holiday_descriptions.join(", ")}`;
  }

  return baseLabel;
};

const itemBelongsToJobByName = (
  description: string,
  payCode: string,
  jobType: string,
): boolean => {
  const descLower = (description || "").toLowerCase();
  const payCodeLower = (payCode || "").toLowerCase();
  const jobLower = jobType.toLowerCase();
  return descLower.includes(jobLower) || payCodeLower.includes(jobLower);
};

// Split grouped payroll into individual job payrolls
const splitGroupedPayroll = (
  payroll: EmployeePayroll,
): IndividualJobPayroll[] => {
  if (!payroll.job_type || !payroll.job_type.includes(", ")) {
    return [
      {
        job_type: payroll.job_type,
        items: payroll.items || [],
        leave_records: payroll.leave_records || [],
        commission_records: payroll.commission_records || [],
        others_records: (payroll as any).others_records || [],
        gross_pay_portion: payroll.gross_pay,
      },
    ];
  }

  const jobTypes = payroll.job_type.split(", ").map((job) => job.trim());
  const individualJobs: IndividualJobPayroll[] = [];
  const allItems = payroll.items || [];
  const allLeaveRecords = payroll.leave_records || [];
  const allCommissionRecords = payroll.commission_records || [];
  const allOthersRecords = (payroll as any).others_records || [];
  const employeeJobMapping = payroll.employee_job_mapping || {};

  // Leave/commission/others records each carry the sibling staff's employee_id
  // (e.g. JAINOL_PM). employee_job_mapping maps that id to the job it owns in
  // this combined payroll. Attribute each record to that one job's slip so the
  // individual breakdowns sum back to the combined total. Records whose
  // employee_id is missing from the mapping fall to the first job so the sum
  // still matches.
  const anchorJob = jobTypes[0];
  const ownerJobForRecord = (employeeId: string | undefined): string => {
    const mapped = employeeId ? employeeJobMapping[employeeId] : undefined;
    if (mapped && jobTypes.includes(mapped)) return mapped;
    return anchorJob;
  };

  jobTypes.forEach((jobType) => {
    const jobItems = allItems.filter((item) => {
      if (item.job_type) {
        return item.job_type === jobType;
      }
      const matchesByName = jobTypes.some((jt) =>
        itemBelongsToJobByName(item.description, item.pay_code_id, jt),
      );
      if (!matchesByName) {
        return true;
      }
      return itemBelongsToJobByName(
        item.description,
        item.pay_code_id,
        jobType,
      );
    });

    const jobLeaveRecords = allLeaveRecords.filter(
      (record) => ownerJobForRecord(record.employee_id) === jobType,
    );
    const jobCommissionRecords = allCommissionRecords.filter(
      (record) => ownerJobForRecord(record.employee_id) === jobType,
    );
    const jobOthersRecords = allOthersRecords.filter(
      (record: any) => ownerJobForRecord(record.employee_id) === jobType,
    );

    const jobGrossPay =
      jobItems.reduce((sum, item) => sum + (item.amount || 0), 0) +
      jobLeaveRecords.reduce(
        (sum, record) => sum + (record.amount_paid || 0),
        0,
      ) +
      jobCommissionRecords.reduce(
        (sum, record) => sum + (record.amount || 0),
        0,
      ) +
      jobOthersRecords.reduce(
        (sum: number, record: any) => sum + (record.amount || 0),
        0,
      );

    individualJobs.push({
      job_type: jobType,
      items: jobItems,
      leave_records: jobLeaveRecords,
      commission_records: jobCommissionRecords,
      others_records: jobOthersRecords,
      gross_pay_portion: jobGrossPay,
    });
  });

  return individualJobs;
};

// Group items by job type for display with category headers
const groupItemsByJobType = (
  items: any[],
  isGroupedPayroll: boolean,
  jobTypes: string[],
  employeeJobMapping: Record<string, string>,
): { jobType: string | null; items: any[] }[] => {
  if (!isGroupedPayroll) {
    return [{ jobType: null, items }];
  }

  const getItemJobType = (item: any): string | null => {
    if (
      item.source_employee_id &&
      employeeJobMapping[item.source_employee_id]
    ) {
      const mappedJobType = employeeJobMapping[item.source_employee_id];
      if (jobTypes.includes(mappedJobType)) {
        return mappedJobType;
      }
    }
    if (item.job_type && jobTypes.includes(item.job_type)) {
      return item.job_type;
    }
    const descLower = (item.description || "").toLowerCase();
    const payCodeLower = (item.pay_code_id || "").toLowerCase();
    for (const jobType of jobTypes) {
      const jobLower = jobType.toLowerCase();
      if (descLower.includes(jobLower) || payCodeLower.includes(jobLower)) {
        return jobType;
      }
    }
    return null;
  };

  const jobGroups: { jobType: string | null; items: any[] }[] = [];
  const itemsByJob = new Map<string | null, any[]>();

  items.forEach((item) => {
    const jobType = getItemJobType(item);
    if (!itemsByJob.has(jobType)) {
      itemsByJob.set(jobType, []);
    }
    itemsByJob.get(jobType)!.push(item);
  });

  jobTypes.forEach((jobType) => {
    const jobItems = itemsByJob.get(jobType);
    if (jobItems && jobItems.length > 0) {
      jobGroups.push({ jobType, items: jobItems });
    }
  });

  const sharedItems = itemsByJob.get(null);
  if (sharedItems && sharedItems.length > 0) {
    jobGroups.push({ jobType: null, items: sharedItems });
  }

  return jobGroups;
};

// Create table row for an item
const createItemRow = (
  description: string,
  rate: string,
  descNote: string,
  amount: string,
  options: {
    bold?: boolean;
    fillColor?: string;
    borderTop?: boolean;
    borderBottom?: boolean;
  } = {},
): TableCell[] => {
  const baseStyle: any = { fontSize: 8 };
  if (options.bold) baseStyle.bold = true;
  if (options.fillColor) baseStyle.fillColor = options.fillColor;

  return [
    {
      text: description,
      fontSize: 8,
      bold: options.bold,
      fillColor: options.fillColor,
      noWrap: false,
    },
    {
      text: rate,
      alignment: "right",
      fontSize: 8,
      bold: options.bold,
      fillColor: options.fillColor,
    },
    {
      text: descNote,
      fontSize: 8,
      bold: options.bold,
      fillColor: options.fillColor,
    },
    {
      text: amount,
      alignment: "right",
      fontSize: 8,
      bold: options.bold,
      fillColor: options.fillColor,
    },
  ];
};

// Create job category header row (no total displayed in header for combined payrolls)
const createJobCategoryRow = (
  jobType: string,
  employeeId: string | null,
): TableCell[] => {
  const label = `[ ${jobType}${employeeId ? ` (${employeeId})` : ""} ]`;
  return [
    { text: label, colSpan: 4, bold: true, fillColor: "#e8e8e8", fontSize: 8 },
    {},
    {},
    {},
  ];
};

// Create job subtotal row (only for combined payrolls)
const createJobSubtotalRow = (
  jobType: string,
  total: string,
  subtotalLabel: string = "Subtotal",
): TableCell[] => {
  return [
    { text: "", fillColor: "#f0f0f0", fontSize: 8 },
    { text: "", fillColor: "#f0f0f0", fontSize: 8 },
    {
      text: `${jobType} ${subtotalLabel}`,
      bold: true,
      fillColor: "#f0f0f0",
      fontSize: 8,
    },
    {
      text: total,
      alignment: "right",
      bold: true,
      fillColor: "#f0f0f0",
      fontSize: 8,
    },
  ];
};

const getTotalUnitQuantity = (item: ConsolidatedPayrollItem): number => {
  const quantity: number = Number(item.total_quantity) || 0;
  const focUnits: number = Number(item.total_foc_units) || 0;
  return quantity + focUnits;
};

interface BaseRateSummary {
  averageRate: number;
  totalUnits: number;
  totalAmount: number;
}

type BaseRateSummaryUnit = "Bag" | "Hour";
type BaseSectionCell = TableCell & {
  baseSectionBorder?: boolean;
  baseSubtotalBorder?: boolean;
};

const BASE_RATE_SUMMARY_UNITS: BaseRateSummaryUnit[] = ["Bag", "Hour"];

const isBaseRateSummaryUnit = (
  rateUnit: string,
): rateUnit is BaseRateSummaryUnit => {
  return rateUnit === "Bag" || rateUnit === "Hour";
};

const formatUnitQuantity = (quantity: number): string => {
  return new Intl.NumberFormat("en-MY", {
    minimumFractionDigits: Number.isInteger(quantity) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(quantity);
};

interface RateQuantityDisplay {
  rate: string;
  quantity: string;
}

const getOthersRateQuantityDisplay = (
  record: MergedAdvance,
): RateQuantityDisplay => {
  const rows: AdvanceRecord[] =
    record.rows.length > 0 ? record.rows : [record.primary];
  const rate: number = Number(rows[0].rate) || 0;
  const rateUnit: string = rows[0].rate_unit || "";
  const hasConsistentRate: boolean = rows.every(
    (row: AdvanceRecord) =>
      (row.rate_unit || "") === rateUnit &&
      isMoneyEqual(Number(row.rate) || 0, rate),
  );

  if (!hasConsistentRate) {
    return {
      rate: "Mixed rates",
      quantity: "",
    };
  }

  if (rateUnit === "Fixed") {
    const allDirectAmountFixed: boolean = rows.every((row: AdvanceRecord) => {
      const quantity: number = Number(row.quantity) || 0;
      const amount: number = Number(row.amount) || 0;
      return amount > 0 && (rate === 0 || isMoneyEqual(quantity, amount));
    });

    if (allDirectAmountFixed) {
      return {
        rate: "Ikut amaun",
        quantity: rows.length === 1 ? "-" : `${rows.length} entries`,
      };
    }

    return {
      rate: rate.toFixed(2),
      quantity: rows.length === 1 ? "Fixed" : `Fixed x ${rows.length}`,
    };
  }

  const quantity: number = rows.reduce(
    (sum: number, row: AdvanceRecord) => sum + (Number(row.quantity) || 0),
    0,
  );

  return {
    rate: rate.toFixed(2),
    quantity: `${formatUnitQuantity(quantity)} ${rateUnit}`,
  };
};

const isOvertimeOthersRecord = (record: AdvanceRecord): boolean =>
  record.pay_code_pay_type === "Overtime";

const buildOvertimeOthersPayrollItems = (
  records: AdvanceRecord[] = [],
  employeeJobMapping: Record<string, string> = {},
  fallbackJobType?: string,
): PayrollItem[] => {
  return records.map((record: AdvanceRecord) => {
    const employeeId: string = String(record.employee_id || "");
    const mappedJobType: string | undefined = employeeJobMapping[employeeId];

    return {
      id: record.id ? -Number(record.id) : undefined,
      pay_code_id: record.pay_code_id || `OTHERS-${record.id || ""}`,
      description: record.description || "",
      pay_type: "Overtime",
      rate: Number(record.rate) || 0,
      rate_unit: record.rate_unit || "",
      quantity: Number(record.quantity) || 0,
      foc_units: 0,
      amount: Number(record.amount) || 0,
      is_manual: false,
      job_type: mappedJobType || fallbackJobType,
      source_employee_id: employeeId || null,
      source_date: record.record_date || null,
      work_log_id: null,
      work_log_type: null,
    };
  });
};

// Key used to detect when an Others (Kerja Luar OT) record lines up with an
// existing payroll line. Matches the grouping key used by consolidatePayrollItems
// (pay_code_id + rate + rate_unit) so a matched record folds into that same line.
const buildItemKey = (
  payCodeId: string | null | undefined,
  rate: number | string | null | undefined,
  rateUnit: string | null | undefined,
): string => `${payCodeId ?? ""}_${Number(rate) || 0}_${rateUnit ?? ""}`;

// Convert non-overtime Others records that match an existing payroll line into
// payroll items so they consolidate into (and display as one row with) that line
// on the payslip. The matched line is listed first during consolidation, so its
// pay_type/job_type win for the combined row.
const buildMergeableOthersPayrollItems = (
  records: AdvanceRecord[] = [],
  matchingItemsByKey: Map<string, PayrollItem>,
  employeeJobMapping: Record<string, string> = {},
  fallbackJobType?: string,
): PayrollItem[] => {
  return records.map((record: AdvanceRecord) => {
    const employeeId: string = String(record.employee_id || "");
    const mappedJobType: string | undefined = employeeJobMapping[employeeId];
    const matchingItem: PayrollItem | undefined = matchingItemsByKey.get(
      buildItemKey(record.pay_code_id, record.rate, record.rate_unit),
    );

    return {
      id: record.id ? -Number(record.id) : undefined,
      pay_code_id: record.pay_code_id || `OTHERS-${record.id || ""}`,
      description: record.description || "",
      pay_type: matchingItem?.pay_type || "Tambahan",
      rate: Number(record.rate) || 0,
      rate_unit: record.rate_unit || "",
      quantity: Number(record.quantity) || 0,
      foc_units: 0,
      amount: Number(record.amount) || 0,
      is_manual: false,
      job_type: mappedJobType || matchingItem?.job_type || fallbackJobType,
      source_employee_id: employeeId || null,
      source_date: record.record_date || null,
      work_log_id: null,
      work_log_type: null,
    };
  });
};

const getBaseRateSummaryUnits = (
  consolidatedBaseItems: ConsolidatedPayrollItem[],
): BaseRateSummaryUnit[] => {
  return BASE_RATE_SUMMARY_UNITS.filter((unit) =>
    consolidatedBaseItems.some((item) => item.rate_unit === unit),
  );
};

const shouldShowBaseRateSummary = (
  summaryItems: ConsolidatedPayrollItem[],
  _summaryUnit: BaseRateSummaryUnit,
): boolean => {
  // Always show the base subtotal (Jumlah Bag / Rate per Jam), even for a single
  // base paycode. Otherwise the base section has no subtotal while the Tambahan
  // section still shows "Jumlah Lain-lain", making it look like the base row is
  // part of the lain-lain total.
  return summaryItems.length > 0;
};

const calculateBaseRateSummary = (
  consolidatedBaseItems: ConsolidatedPayrollItem[],
  summaryUnit: BaseRateSummaryUnit,
): BaseRateSummary => {
  const summaryItems: ConsolidatedPayrollItem[] = consolidatedBaseItems.filter(
    (item) => item.rate_unit === summaryUnit,
  );
  const totalAmount: number = summaryItems.reduce(
    (sum, item) => sum + (Number(item.total_amount) || 0),
    0,
  );

  if (summaryUnit === "Bag") {
    const totalUnits: number = summaryItems.reduce(
      (sum, item) => sum + getTotalUnitQuantity(item),
      0,
    );

    return {
      averageRate: totalUnits > 0 ? totalAmount / totalUnits : 0,
      totalUnits,
      totalAmount,
    };
  }

  // Hourly rows can repeat the same hours across multiple tasks, so keep using
  // one representative hour quantity rather than summing duplicated hours.
  const representativeHours: number =
    summaryItems.length > 0 ? Number(summaryItems[0].total_quantity) || 0 : 0;
  return {
    averageRate:
      representativeHours > 0 ? totalAmount / representativeHours : 0,
    totalUnits: representativeHours,
    totalAmount,
  };
};

const createBaseRateSummaryRow = (
  _baseRateSummaryUnit: BaseRateSummaryUnit,
  baseRateSummary: BaseRateSummary,
): TableCell[] => {
  // "Jumlah Base" subtotal with just the total amount — no "Rate/Bag"/"Rate/Jam"
  // average or bag count. A worker can have several base paycodes at different
  // rates (e.g. MEE_ROLL's hourly tasks), so a single blended rate/quantity would
  // be misleading. The flagged first cell lets the layout draw the line below.
  return [
    {
      text: "",
      fillColor: "#f8f9fa",
      fontSize: 8,
      baseSubtotalBorder: true,
    } as BaseSectionCell,
    { text: "", fillColor: "#f8f9fa", fontSize: 8 },
    { text: "Jumlah Base", bold: true, fillColor: "#f8f9fa", fontSize: 8 },
    {
      text: formatCurrency(baseRateSummary.totalAmount),
      alignment: "right",
      bold: true,
      fillColor: "#f8f9fa",
      fontSize: 8,
    },
  ];
};

const createBaseSubtotalRow = (
  label: string,
  totalAmount: number,
): TableCell[] => {
  return [
    { text: "", fillColor: "#f8f9fa", fontSize: 8 },
    { text: "", fillColor: "#f8f9fa", fontSize: 8 },
    {
      text: label,
      bold: true,
      fillColor: "#f8f9fa",
      fontSize: 8,
    },
    {
      text: formatCurrency(totalAmount),
      alignment: "right",
      bold: true,
      fillColor: "#f8f9fa",
      fontSize: 8,
    },
  ];
};

const isDirectAmountFixedItem = (item: ConsolidatedPayrollItem): boolean => {
  return (
    item.rate_unit === "Fixed" &&
    Number(item.rate) === 0 &&
    Number(item.total_amount) > 0
  );
};

const getConsolidatedRateLabel = (item: ConsolidatedPayrollItem): string => {
  if (isDirectAmountFixedItem(item)) return "Ikut amaun";
  if (item.rate_unit === "Percent") return `${item.rate}%`;
  return item.rate.toFixed(2);
};

const getBaseItemQuantityLabel = (item: ConsolidatedPayrollItem): string => {
  if (isDirectAmountFixedItem(item)) return "-";

  if (item.rate_unit === "Bag") {
    return `${item.total_quantity} Bag${item.total_quantity > 1 ? "s" : ""}`;
  }

  if (item.rate_unit === "Hour") {
    return `${item.total_quantity} Jam`;
  }

  return `${item.total_quantity} ${item.rate_unit}`;
};

const getTambahanItemQuantityLabel = (
  item: ConsolidatedPayrollItem,
  monthName: string,
): string => {
  if (isDirectAmountFixedItem(item)) return "-";
  if (item.rate_unit === "Fixed") return monthName;
  return `${item.total_quantity} ${item.rate_unit}`;
};

// F/HARIAN / production-bonus descriptions carry a per-day "(N bags)" or
// "(N bags, mesin rosak)" tag. After consolidation one line spans many days, so
// that single-day count no longer matches the merged quantity column — strip it
// for display (the quantity column already shows the real total).
const stripBagCountSuffix = (description: string): string =>
  (description || "").replace(/\s*\(\d[\d.]*\s*bags?\b[^)]*\)\s*$/i, "").trim();

const markBaseSectionBorder = (row: TableCell[]): TableCell[] => {
  (row[0] as BaseSectionCell).baseSectionBorder = true;
  return row;
};

const appendBasePayRows = (
  tableBody: TableCell[][],
  consolidatedBaseItems: ConsolidatedPayrollItem[],
): void => {
  if (consolidatedBaseItems.length === 0) return;

  const baseRateSummaryUnits: BaseRateSummaryUnit[] = getBaseRateSummaryUnits(
    consolidatedBaseItems,
  );

  baseRateSummaryUnits.forEach((unit, index) => {
    const unitItems: ConsolidatedPayrollItem[] = consolidatedBaseItems.filter(
      (item) => item.rate_unit === unit,
    );

    unitItems.forEach((item, itemIndex) => {
      const row: TableCell[] = createItemRow(
        item.description,
        getConsolidatedRateLabel(item),
        getBaseItemQuantityLabel(item),
        formatCurrency(item.total_amount),
      );

      tableBody.push(
        index > 0 && itemIndex === 0 ? markBaseSectionBorder(row) : row,
      );
    });

    if (shouldShowBaseRateSummary(unitItems, unit)) {
      tableBody.push(
        createBaseRateSummaryRow(
          unit,
          calculateBaseRateSummary(unitItems, unit),
        ),
      );
    }
  });

  const otherItems: ConsolidatedPayrollItem[] = consolidatedBaseItems.filter(
    (item) => !isBaseRateSummaryUnit(item.rate_unit),
  );
  const otherTotalAmount: number = otherItems.reduce(
    (sum, item) => sum + (Number(item.total_amount) || 0),
    0,
  );

  otherItems.forEach((item, itemIndex) => {
    const row: TableCell[] = createItemRow(
      item.description,
      getConsolidatedRateLabel(item),
      getBaseItemQuantityLabel(item),
      formatCurrency(item.total_amount),
    );

    tableBody.push(
      baseRateSummaryUnits.length > 0 && itemIndex === 0
        ? markBaseSectionBorder(row)
        : row,
    );
  });

  if (otherItems.length > 0 && baseRateSummaryUnits.length > 0) {
    tableBody.push(createBaseSubtotalRow("Jumlah Lain-lain", otherTotalAmount));
  }

};

// Build main payroll page content
const buildMainPayrollPage = (
  payroll: EmployeePayroll,
  companyName: string,
  staffDetails: any,
  midMonthPayroll: MidMonthPayroll | null | undefined,
  year: number,
  month: number,
  monthName: string,
): Content[] => {
  const isGroupedPayroll = payroll.job_type && payroll.job_type.includes(", ");
  const jobTypes = isGroupedPayroll
    ? payroll.job_type.split(", ").map((job) => job.trim())
    : [payroll.job_type];
  const employeeJobMapping = payroll.employee_job_mapping || {};

  const getEmployeeIdForJob = (jobType: string): string | null => {
    for (const [employeeId, job] of Object.entries(employeeJobMapping)) {
      if (job === jobType) return employeeId;
    }
    return null;
  };

  const payrollMonthStartDate = `${year}-${String(month).padStart(2, "0")}-01`;
  const allPayrollItems: PayrollItem[] = payroll.items || [];
  const incentivePayrollItems: PayrollItem[] = allPayrollItems.filter(
    isIncentivePayrollItem,
  );
  const bonusPayrollItems: PayrollItem[] = allPayrollItems.filter(
    isBonusPayrollItem,
  );
  const standardPayrollItems: PayrollItem[] = allPayrollItems.filter(
    (item: PayrollItem) =>
      !isIncentivePayrollItem(item) && !isBonusPayrollItem(item),
  );
  const allOthersRecords: AdvanceRecord[] =
    (payroll as any).others_records || [];
  const incentiveOthersRecords: AdvanceRecord[] = allOthersRecords.filter(
    isIncentiveOthersRecord,
  );
  const standardOthersRecords: AdvanceRecord[] = allOthersRecords.filter(
    (record: AdvanceRecord) => !isIncentiveOthersRecord(record),
  );
  const overtimeOthersRecords: AdvanceRecord[] = standardOthersRecords.filter(
    isOvertimeOthersRecord,
  );
  const nonOvertimeOthersRecords: AdvanceRecord[] = standardOthersRecords.filter(
    (record: AdvanceRecord) => !isOvertimeOthersRecord(record),
  );
  // A non-overtime Others (Kerja Luar OT) record that matches an existing payroll
  // line (same pay code, rate and rate unit) is folded into that line so the work
  // and its Kerja Luar OT entry appear as a single combined row on the payslip.
  // Records with no matching line stay in the separate Others section.
  const payrollItemsByKey: Map<string, PayrollItem> = new Map();
  standardPayrollItems.forEach((item: PayrollItem) => {
    payrollItemsByKey.set(
      buildItemKey(item.pay_code_id, item.rate, item.rate_unit),
      item,
    );
  });
  const mergeableOthersRecords: AdvanceRecord[] =
    nonOvertimeOthersRecords.filter((record: AdvanceRecord) =>
      payrollItemsByKey.has(
        buildItemKey(record.pay_code_id, record.rate, record.rate_unit),
      ),
    );
  const regularOthersRecords: AdvanceRecord[] = nonOvertimeOthersRecords.filter(
    (record: AdvanceRecord) =>
      !payrollItemsByKey.has(
        buildItemKey(record.pay_code_id, record.rate, record.rate_unit),
      ),
  );
  const payrollItemsWithOvertimeOthers: PayrollItem[] = [
    ...standardPayrollItems,
    ...buildOvertimeOthersPayrollItems(
      overtimeOthersRecords,
      employeeJobMapping,
      isGroupedPayroll ? undefined : payroll.job_type,
    ),
    ...buildMergeableOthersPayrollItems(
      mergeableOthersRecords,
      payrollItemsByKey,
      employeeJobMapping,
      isGroupedPayroll ? undefined : payroll.job_type,
    ),
  ];

  // Consolidate items for cleaner PDF output (leave-day activities are excluded —
  // their amount is shown in the Cuti section, and they pay nothing under base pay).
  const consolidatedItems = consolidatePayrollItems(
    filterOutLeaveDayItems(
      payrollItemsWithOvertimeOthers,
      payroll.leave_records,
    ),
  );
  const groupedConsolidatedItems =
    groupConsolidatedItemsByType(consolidatedItems);

  // Group consolidated items by job type
  const baseItemsByJob = groupItemsByJobType(
    groupedConsolidatedItems.Base || [],
    isGroupedPayroll || false,
    jobTypes,
    employeeJobMapping,
  );
  const tambahanItemsByJob = groupItemsByJobType(
    groupedConsolidatedItems.Tambahan || [],
    isGroupedPayroll || false,
    jobTypes,
    employeeJobMapping,
  );
  const overtimeItemsByJob = groupItemsByJobType(
    groupedConsolidatedItems.Overtime || [],
    isGroupedPayroll || false,
    jobTypes,
    employeeJobMapping,
  );

  // Calculate totals - use consolidated items for consistency with recalculated amounts
  const consolidatedBaseItems = groupedConsolidatedItems.Base || [];
  const tambahanTotalAmount = (groupedConsolidatedItems.Tambahan || []).reduce(
    (sum, item) => sum + (item.total_amount || 0),
    0,
  );
  const overtimeTotalAmount = (groupedConsolidatedItems.Overtime || []).reduce(
    (sum, item) => sum + (item.total_amount || 0),
    0,
  );

  // Commission records (merged by description so duplicate rows collapse).
  // Cuti Tahunan entries are recorded via the Others/Incentives page using
  // location_code = '23'; pull them out so they can be shown as leave rather
  // than as a generic Advance/Bonus row. Only records marked as advance flow
  // through to the advance deduction at the bottom of the payslip.
  const commissionRecords: AdvanceRecord[] = payroll.commission_records || [];
  const advanceCommissionRecords: AdvanceRecord[] =
    commissionRecords.filter(isAdvanceRecord);
  const cutiTahunanCommissions = commissionRecords.filter(
    isCutiTahunanCommission,
  );
  const nonCutiCommissionRecords = commissionRecords.filter(
    (record) => !isCutiTahunanCommission(record),
  );
  const nonCutiDisplayRecords: AdvanceRecord[] = [
    ...nonCutiCommissionRecords,
    ...buildIncentiveRecordsFromOthers(incentiveOthersRecords),
    ...buildIncentiveRecordsFromPayrollItems(
      incentivePayrollItems,
      payroll.employee_id,
      payroll.employee_name,
      payrollMonthStartDate,
    ),
    ...buildIncentiveRecordsFromPayrollItems(
      bonusPayrollItems,
      payroll.employee_id,
      payroll.employee_name,
      payrollMonthStartDate,
    ),
  ];
  const commissionAdvanceTotalAmount = advanceCommissionRecords.reduce(
    (sum, record) => sum + Number(record.amount || 0),
    0,
  );
  const nonCutiCommissionTotalAmount = nonCutiDisplayRecords.reduce(
    (sum, record) => sum + Number(record.amount || 0),
    0,
  );
  const cutiTahunanCommissionTotalAmount = cutiTahunanCommissions.reduce(
    (sum, record) => sum + Number(record.amount || 0),
    0,
  );
  const mergedAdvanceCommissionRecords = mergeByDescription(
    advanceCommissionRecords,
  );
  const mergedNonCutiCommissionRecords = mergeByDescription(
    nonCutiDisplayRecords,
  );

  // Leave records — merge true leave_records together with Cuti Tahunan
  // commission entries (one day per record) so they share the same totals.
  const groupedLeaveRecords = (payroll.leave_records || []).reduce(
    (acc, record) => {
      const leaveType = record.leave_type;
      if (!acc[leaveType]) {
        acc[leaveType] = {
          leave_type: leaveType,
          total_days: 0,
          total_amount: 0,
          holiday_descriptions: [],
        };
      }
      acc[leaveType].total_days += record.days_taken;
      acc[leaveType].total_amount += record.amount_paid;
      if (
        record.holiday_description &&
        !acc[leaveType].holiday_descriptions.includes(
          record.holiday_description,
        )
      ) {
        acc[leaveType].holiday_descriptions.push(record.holiday_description);
      }
      return acc;
    },
    {} as Record<string, GroupedLeaveRecord>,
  );
  if (cutiTahunanCommissions.length > 0) {
    const existing = groupedLeaveRecords["cuti_tahunan"];
    if (existing) {
      existing.total_days += cutiTahunanCommissions.length;
      existing.total_amount += cutiTahunanCommissionTotalAmount;
    } else {
      groupedLeaveRecords["cuti_tahunan"] = {
        leave_type: "cuti_tahunan",
        total_days: cutiTahunanCommissions.length,
        total_amount: cutiTahunanCommissionTotalAmount,
        holiday_descriptions: [],
      };
    }
  }
  const leaveRecordsArray = Object.values(groupedLeaveRecords);
  const leaveTotalAmount = leaveRecordsArray.reduce(
    (sum, record) => sum + (record.total_amount || 0),
    0,
  );

  // Others (Kerja Luar OT) records - treated like commission for calculation/display
  const othersRecords: AdvanceRecord[] = regularOthersRecords;
  const othersTotalAmount = othersRecords.reduce(
    (sum: number, record: any) => sum + Number(record.amount || 0),
    0,
  );
  const mergedOthersRecords = mergeByDescription(othersRecords);

  // Mid-month and final calculations. payroll.net_pay from the comprehensive
  // endpoint is gross - statutory only, so we subtract only advance records here
  // to get the true post-advance amount that lines up with stored rounding.
  const midMonthPayment = midMonthPayroll ? midMonthPayroll.amount : 0;
  const finalPayment =
    payroll.net_pay - midMonthPayment - commissionAdvanceTotalAmount;

  // Build table body
  const tableBody: TableCell[][] = [];

  // Header row
  tableBody.push([
    { text: "Kerja", bold: true, fillColor: "#f0f0f0", fontSize: 9 },
    {
      text: "Rate",
      bold: true,
      fillColor: "#f0f0f0",
      alignment: "right",
      fontSize: 9,
    },
    { text: "Description", bold: true, fillColor: "#f0f0f0", fontSize: 9 },
    {
      text: "Amount",
      bold: true,
      fillColor: "#f0f0f0",
      alignment: "right",
      fontSize: 9,
    },
  ]);

  // Base Pay Items - grouped payrolls show per-job sections.
  if (isGroupedPayroll) {
    baseItemsByJob.forEach((jobGroup) => {
      const jobItems = jobGroup.items as ConsolidatedPayrollItem[];
      const jobTotal = jobItems.reduce(
        (sum, item) => sum + (item.total_amount || 0),
        0,
      );
      const jobTypeLabel = jobGroup.jobType || "Shared";

      if (jobGroup.jobType) {
        tableBody.push(
          createJobCategoryRow(
            jobGroup.jobType,
            getEmployeeIdForJob(jobGroup.jobType),
          ),
        );
      } else if (jobItems.length > 0) {
        tableBody.push(createJobCategoryRow("Shared", null));
      }

      appendBasePayRows(tableBody, jobItems);

      if (jobItems.length > 0) {
        tableBody.push(
          createJobSubtotalRow(jobTypeLabel, formatCurrency(jobTotal)),
        );
      }
    });
  }

  // Base pay rows (combined payrolls show per-job subtotals)
  if (consolidatedBaseItems.length > 0 && !isGroupedPayroll) {
    appendBasePayRows(tableBody, consolidatedBaseItems);
  }

  // Tambahan Items - Using consolidated items
  if (
    (groupedConsolidatedItems.Tambahan &&
      groupedConsolidatedItems.Tambahan.length > 0) ||
    leaveRecordsArray.length > 0 ||
    nonCutiDisplayRecords.length > 0 ||
    othersRecords.length > 0
  ) {
    tambahanItemsByJob.forEach((jobGroup) => {
      const jobItems = jobGroup.items as ConsolidatedPayrollItem[];
      const tambahanJobTotal = jobItems.reduce(
        (sum, item) => sum + (item.total_amount || 0),
        0,
      );
      const jobTypeLabel = jobGroup.jobType
        ? `${jobGroup.jobType} - Tambahan`
        : "Shared - Tambahan";

      if (isGroupedPayroll && jobGroup.jobType && jobItems.length > 0) {
        tableBody.push(
          createJobCategoryRow(
            `${jobGroup.jobType} - Tambahan`,
            getEmployeeIdForJob(jobGroup.jobType),
          ),
        );
      } else if (isGroupedPayroll && !jobGroup.jobType && jobItems.length > 0) {
        tableBody.push(createJobCategoryRow("Shared - Tambahan", null));
      }

      jobItems.forEach((item) => {
        tableBody.push(
          createItemRow(
            stripBagCountSuffix(item.description),
            getConsolidatedRateLabel(item),
            getTambahanItemQuantityLabel(item, monthName),
            formatCurrency(item.total_amount),
          ),
        );
      });

      // Add job subtotal row for combined payrolls (only when there are items)
      if (isGroupedPayroll && jobItems.length > 0) {
        tableBody.push(
          createJobSubtotalRow(jobTypeLabel, formatCurrency(tambahanJobTotal)),
        );
      }
    });

    // Commission records (merged duplicates). Cuti Tahunan commissions are
    // omitted here — they're rendered with the leave records below and rolled
    // into Jumlah cuti / leaveTotalAmount instead of Jumlah lain-lain. Commission
    // records that share a description with an Others row are folded into that
    // row (see combineCommissionsIntoOthers) so the incentive shows as one line.
    const { standaloneCommissions, othersRows } = combineCommissionsIntoOthers(
      mergedNonCutiCommissionRecords,
      mergedOthersRecords,
    );

    standaloneCommissions.forEach((commission) => {
      const desc =
        commission.merged_count > 1
          ? `${commission.description} (x${commission.merged_count})`
          : commission.description;
      tableBody.push(
        createItemRow(
          desc,
          "",
          getCommissionQuantityLabel(commission),
          formatCurrency(commission.merged_amount),
        ),
      );
    });

    // Others (Kerja Luar OT) records (merged duplicates). When a commission was
    // folded in, drop the rate column so the rate no longer mismatches the
    // combined amount, but keep the quantity note (e.g. "Fixed").
    othersRows.forEach(({ record: other, foldedCommission }) => {
      const desc =
        other.merged_count > 1
          ? `${other.description} (x${other.merged_count})`
          : other.description;
      const rateQuantityDisplay: RateQuantityDisplay =
        getOthersRateQuantityDisplay(other);
      const isMerged = foldedCommission > 0;
      tableBody.push(
        createItemRow(
          desc,
          isMerged ? "" : rateQuantityDisplay.rate,
          rateQuantityDisplay.quantity,
          formatCurrency(other.merged_amount + foldedCommission),
        ),
      );
    });

    const totalNonLeaveTambahanItems =
      (groupedConsolidatedItems.Tambahan?.length || 0) +
      standaloneCommissions.length +
      mergedOthersRecords.length;

    // Jumlah lain-lain (excludes cuti) — printed above the leave block so the
    // non-leave subtotal sits next to its own rows.
    if (
      totalNonLeaveTambahanItems > 1 ||
      (totalNonLeaveTambahanItems > 0 && leaveRecordsArray.length > 0)
    ) {
      tableBody.push([
        { text: "", fillColor: "#f8f9fa", fontSize: 8 },
        { text: "", fillColor: "#f8f9fa", fontSize: 8 },
        {
          text: "Jumlah Lain-lain",
          bold: true,
          fillColor: "#f8f9fa",
          fontSize: 8,
        },
        {
          text: formatCurrency(
            tambahanTotalAmount +
              nonCutiCommissionTotalAmount +
              othersTotalAmount,
          ),
          alignment: "right",
          bold: true,
          fillColor: "#f8f9fa",
          fontSize: 8,
        },
      ]);
    }

    // Leave records (including Cuti Tahunan commission entries injected above)
    leaveRecordsArray.forEach((leaveRecord) => {
      tableBody.push(
        createItemRow(
          getLeaveDisplayName(leaveRecord),
          "",
          `${leaveRecord.total_days} Hari`,
          formatCurrency(leaveRecord.total_amount),
        ),
      );
    });

    if (leaveRecordsArray.length > 0) {
      tableBody.push([
        { text: "", fillColor: "#f8f9fa", fontSize: 8 },
        { text: "", fillColor: "#f8f9fa", fontSize: 8 },
        { text: "Jumlah Cuti", bold: true, fillColor: "#f8f9fa", fontSize: 8 },
        {
          text: formatCurrency(leaveTotalAmount),
          alignment: "right",
          bold: true,
          fillColor: "#f8f9fa",
          fontSize: 8,
        },
      ]);
    }
  }

  // Overtime Items - Using consolidated items
  if (
    groupedConsolidatedItems.Overtime &&
    groupedConsolidatedItems.Overtime.length > 0
  ) {
    overtimeItemsByJob.forEach((jobGroup) => {
      const jobItems = jobGroup.items as ConsolidatedPayrollItem[];
      const overtimeJobTotal = jobItems.reduce(
        (sum, item) => sum + (item.total_amount || 0),
        0,
      );
      const jobTypeLabel = jobGroup.jobType
        ? `${jobGroup.jobType} - OT`
        : "Shared - OT";

      if (isGroupedPayroll && jobGroup.jobType && jobItems.length > 0) {
        tableBody.push(
          createJobCategoryRow(
            `${jobGroup.jobType} - OT`,
            getEmployeeIdForJob(jobGroup.jobType),
          ),
        );
      } else if (isGroupedPayroll && !jobGroup.jobType && jobItems.length > 0) {
        tableBody.push(createJobCategoryRow("Shared - OT", null));
      }

      jobItems.forEach((item) => {
        const qtyLabel = isDirectAmountFixedItem(item)
          ? "-"
          : `${item.total_quantity} Jam OT`;
        tableBody.push(
          createItemRow(
            item.description,
            getConsolidatedRateLabel(item),
            qtyLabel,
            formatCurrency(item.total_amount),
          ),
        );
      });

      // Add job subtotal row for combined payrolls (only when there are items)
      if (isGroupedPayroll && jobItems.length > 0) {
        tableBody.push(
          createJobSubtotalRow(
            jobTypeLabel,
            formatCurrency(overtimeJobTotal),
            "Jumlah OT",
          ),
        );
      }
    });

    // Overtime subtotal (only for single-job payrolls)
    if (!isGroupedPayroll) {
      tableBody.push([
        { text: "", fillColor: "#f8f9fa", fontSize: 8 },
        { text: "", fillColor: "#f8f9fa", fontSize: 8 },
        { text: "Jumlah OT", bold: true, fillColor: "#f8f9fa", fontSize: 8 },
        {
          text: formatCurrency(overtimeTotalAmount),
          alignment: "right",
          bold: true,
          fillColor: "#f8f9fa",
          fontSize: 8,
        },
      ]);
    }
  }

  // Jumlah Gaji Kasar
  tableBody.push([
    { text: "", fontSize: 8, fillColor: "#f8f9fa" },
    { text: "", fontSize: 8, fillColor: "#f8f9fa" },
    {
      text: "Jumlah Gaji Kasar",
      bold: true,
      fontSize: 8,
      fillColor: "#f8f9fa",
    },
    {
      text: formatCurrency(payroll.gross_pay),
      alignment: "right",
      bold: true,
      fontSize: 8,
      fillColor: "#f8f9fa",
    },
  ]);

  // Deductions
  if (payroll.deductions && payroll.deductions.length > 0) {
    const epfDeduction = payroll.deductions.find(
      (d) => d.deduction_type.toUpperCase() === "EPF",
    );
    const socsoDeduction = payroll.deductions.find(
      (d) => d.deduction_type.toUpperCase() === "SOCSO",
    );
    const sipDeduction = payroll.deductions.find(
      (d) => d.deduction_type.toUpperCase() === "SIP",
    );
    const incomeTaxDeduction = payroll.deductions.find(
      (d) => d.deduction_type === "income_tax",
    );

    if (epfDeduction) {
      tableBody.push([
        { text: "EPF (Majikan)", fontSize: 8 },
        {
          text: formatCurrency(epfDeduction.employer_amount),
          alignment: "right",
          fontSize: 8,
        },
        { text: "EPF (Pekerja)", fontSize: 8 },
        {
          text: `(${formatCurrency(epfDeduction.employee_amount)})`,
          alignment: "right",
          fontSize: 8,
        },
      ]);
    }
    if (socsoDeduction) {
      tableBody.push([
        { text: "SOCSO (Majikan)", fontSize: 8 },
        {
          text: formatCurrency(socsoDeduction.employer_amount),
          alignment: "right",
          fontSize: 8,
        },
        { text: "SOCSO (Pekerja)", fontSize: 8 },
        {
          text: `(${formatCurrency(socsoDeduction.employee_amount)})`,
          alignment: "right",
          fontSize: 8,
        },
      ]);
    }
    if (sipDeduction) {
      tableBody.push([
        { text: "SIP (Majikan)", fontSize: 8 },
        {
          text: formatCurrency(sipDeduction.employer_amount),
          alignment: "right",
          fontSize: 8,
        },
        { text: "SIP (Pekerja)", fontSize: 8 },
        {
          text: `(${formatCurrency(sipDeduction.employee_amount)})`,
          alignment: "right",
          fontSize: 8,
        },
      ]);
    }
    if (incomeTaxDeduction) {
      tableBody.push([
        { text: "", fontSize: 8 },
        { text: "", fontSize: 8 },
        { text: "Income Tax (PCB)", fontSize: 8 },
        {
          text: `(${formatCurrency(incomeTaxDeduction.employee_amount)})`,
          alignment: "right",
          fontSize: 8,
        },
      ]);
    }
  }

  // Jumlah Gaji Bersih = gross - statutory only. Commission is shown below as
  // an advance deduction, so it must NOT be added back here (the comprehensive
  // endpoint's net_pay already excludes commission from deductions).
  tableBody.push([
    { text: "", fontSize: 8, fillColor: "#f8f9fa" },
    { text: "", fontSize: 8, fillColor: "#f8f9fa" },
    {
      text: "Jumlah Gaji Bersih",
      bold: true,
      fontSize: 8,
      fillColor: "#f8f9fa",
    },
    {
      text: formatCurrency(payroll.net_pay),
      alignment: "right",
      bold: true,
      fontSize: 8,
      fillColor: "#f8f9fa",
    },
  ]);

  // Commission deduction rows (merged duplicates).
  if (mergedAdvanceCommissionRecords.length > 0) {
    mergedAdvanceCommissionRecords.forEach((commission) => {
      tableBody.push([
        { text: `${commission.description} (Advance)`, fontSize: 8 },
        { text: "", fontSize: 8 },
        { text: "", fontSize: 8 },
        {
          text: `(${formatCurrency(commission.merged_amount)})`,
          alignment: "right",
          fontSize: 8,
        },
      ]);
    });
  }

  // Mid-month payment deduction
  if (midMonthPayroll) {
    tableBody.push([
      { text: "BAYARAN PENDAHULUAN (ADVANCES PAYMENT)", fontSize: 8 },
      { text: "", fontSize: 8 },
      { text: "", fontSize: 8 },
      {
        text: `(${formatCurrency(midMonthPayment)})`,
        alignment: "right",
        fontSize: 8,
      },
    ]);
  }

  // Jumlah row (raw final payment before rounding)
  if (midMonthPayroll || advanceCommissionRecords.length > 0) {
    tableBody.push([
      { text: "", fontSize: 8, fillColor: "#f8f9fa" },
      { text: "", fontSize: 8, fillColor: "#f8f9fa" },
      {
        text: "Jumlah Selepas Advances",
        bold: true,
        fontSize: 8,
        fillColor: "#f8f9fa",
      },
      {
        text: formatCurrency(finalPayment),
        alignment: "right",
        bold: true,
        fontSize: 8,
        fillColor: "#f8f9fa",
      },
    ]);
  }

  // Use stored rounding values if available, otherwise calculate on-the-fly (backward compatibility)
  const digenapkan =
    payroll.digenapkan ?? Math.ceil(finalPayment) - finalPayment;
  const setelahDigenapkan =
    payroll.setelah_digenapkan ?? Math.ceil(finalPayment);

  // Digenapkan row (rounding adjustment) - only show if there's an adjustment
  if (digenapkan > 0.001) {
    tableBody.push([
      { text: "", fontSize: 8 },
      { text: "", fontSize: 8 },
      { text: "Digenapkan", fontSize: 8 },
      { text: formatCurrency(digenapkan), alignment: "right", fontSize: 8 },
    ]);
  }

  // Jumlah Digenapkan (Grand Total - rounded amount)
  tableBody.push([
    { text: "", fillColor: "#f8f9fa", fontSize: 8 },
    { text: "", fillColor: "#f8f9fa", fontSize: 8 },
    {
      text: "Jumlah Digenapkan",
      bold: true,
      fillColor: "#f8f9fa",
      fontSize: 8,
    },
    {
      text: formatCurrency(setelahDigenapkan),
      alignment: "right",
      bold: true,
      fillColor: "#f8f9fa",
      fontSize: 8,
    },
  ]);

  // Build content array
  const content: Content[] = [
    // Company name
    { text: companyName, style: "companyName", margin: [0, 0, 0, 6] },

    // Employee info (compact single-line layout with bold labels and bullet separators)
    {
      text: [
        { text: "Pekerja: ", bold: true },
        staffDetails?.name || payroll.employee_name,
        "  •  ",
        { text: "IC No.: ", bold: true },
        staffDetails?.icNo || "N/A",
        "  •  ",
        { text: "Kerja: ", bold: true },
        staffDetails?.jobName || payroll.job_type,
        "  •  ",
        { text: "Bahagian: ", bold: true },
        staffDetails?.section || payroll.section,
      ],
      margin: [0, 0, 0, 5],
    },

    // Payslip title
    {
      text: `Slip Gaji Pajak (Jam/Bag/Commission) Untuk Bulan ${monthName} ${year}`,
      style: "payslipTitle",
      margin: [0, 0, 0, 4],
    },

    // Main table
    {
      table: {
        headerRows: 1,
        dontBreakRows: true,
        widths: ["*", 60, 100, 70],
        body: tableBody,
      },
      layout: {
        hLineWidth: (i: number, node: any) => {
          if (i === 0 || i === node.table.body.length) return 1; // Outer borders
          if (i === 1) return 1; // Below header

          const row = node.table.body[i];
          if (row && Array.isArray(row) && row[0]?.baseSectionBorder) {
            return 0.5;
          }

          // Check row above the line (row i-1) for border below specific rows
          const prevRow = node.table.body[i - 1];
          if (prevRow && Array.isArray(prevRow)) {
            // Border below the base subtotal row (just an amount, flagged)
            if ((prevRow[0] as BaseSectionCell)?.baseSubtotalBorder) {
              return 0.5;
            }
            const descCell = prevRow[2];
            const descText =
              typeof descCell === "object" ? descCell.text : descCell;
            // Add border below Rate/ subtotal and Jumlah Gaji Kasar rows
            if (
              typeof descText === "string" &&
              (descText.includes("Rate/") ||
                descText === "Subtotal" ||
                descText.endsWith("Jumlah OT") ||
                descText === "Jumlah Cuti" ||
                descText === "Jumlah Lain-lain" ||
                descText === "Jumlah Gaji Kasar")
            ) {
              return 0.5;
            }
            // Add light border below job category headers (fillColor: '#e8e8e8')
            if (prevRow[0]?.fillColor === "#e8e8e8") {
              return 0.5;
            }
          }

          // Add thin line above rows with fillColor (subtotals, totals, category headers)
          if (row && Array.isArray(row) && row[0]?.fillColor) {
            return 0.5;
          }
          return 0; // No line for regular rows
        },
        vLineWidth: () => 1,
        hLineColor: () => "#000",
        vLineColor: () => "#000",
        paddingLeft: () => 5,
        paddingRight: () => 5,
        paddingTop: () => 2,
        paddingBottom: () => 2,
      },
    } as ContentTable,

    // Notice
    {
      text: "*** Perhatian : Sila kembalikan selepas tandatangan slip ini",
      style: "notice",
      margin: [0, 3, 0, 0],
    },

    // Signature section
    {
      columns: [
        { width: "*", text: "" },
        {
          width: "auto",
          stack: [
            { text: "Received By", alignment: "right" },
            {
              canvas: [
                { type: "line", x1: 0, y1: 0, x2: 150, y2: 0, lineWidth: 1 },
              ],
              margin: [0, 5, 0, 0],
            },
          ],
        },
      ],
      margin: [0, 25, 0, 0],
    },
  ];

  return content;
};

// Build individual job page content
const buildIndividualJobPage = (
  individualJob: IndividualJobPayroll,
  payroll: EmployeePayroll,
  companyName: string,
  staffDetails: any,
  year: number,
  month: number,
  monthName: string,
  isGrouped: boolean,
  jobIndex: number,
  totalJobs: number,
): Content[] => {
  const employeeJobMapping = payroll.employee_job_mapping || {};

  const payrollMonthStartDate = `${year}-${String(month).padStart(2, "0")}-01`;
  const allPayrollItems: PayrollItem[] = individualJob.items || [];
  const incentivePayrollItems: PayrollItem[] = allPayrollItems.filter(
    isIncentivePayrollItem,
  );
  const bonusPayrollItems: PayrollItem[] = allPayrollItems.filter(
    isBonusPayrollItem,
  );
  const standardPayrollItems: PayrollItem[] = allPayrollItems.filter(
    (item: PayrollItem) =>
      !isIncentivePayrollItem(item) && !isBonusPayrollItem(item),
  );
  const allOthersRecords: AdvanceRecord[] = individualJob.others_records || [];
  const incentiveOthersRecords: AdvanceRecord[] = allOthersRecords.filter(
    isIncentiveOthersRecord,
  );
  const standardOthersRecords: AdvanceRecord[] = allOthersRecords.filter(
    (record: AdvanceRecord) => !isIncentiveOthersRecord(record),
  );
  const overtimeOthersRecords: AdvanceRecord[] = standardOthersRecords.filter(
    isOvertimeOthersRecord,
  );
  const nonOvertimeOthersRecords: AdvanceRecord[] = standardOthersRecords.filter(
    (record: AdvanceRecord) => !isOvertimeOthersRecord(record),
  );
  // Fold non-overtime Others records that match an existing payroll line into that
  // line (see buildMainPayrollPage); unmatched ones stay in the Others section.
  const payrollItemsByKey: Map<string, PayrollItem> = new Map();
  standardPayrollItems.forEach((item: PayrollItem) => {
    payrollItemsByKey.set(
      buildItemKey(item.pay_code_id, item.rate, item.rate_unit),
      item,
    );
  });
  const mergeableOthersRecords: AdvanceRecord[] =
    nonOvertimeOthersRecords.filter((record: AdvanceRecord) =>
      payrollItemsByKey.has(
        buildItemKey(record.pay_code_id, record.rate, record.rate_unit),
      ),
    );
  const regularOthersRecords: AdvanceRecord[] = nonOvertimeOthersRecords.filter(
    (record: AdvanceRecord) =>
      !payrollItemsByKey.has(
        buildItemKey(record.pay_code_id, record.rate, record.rate_unit),
      ),
  );
  const payrollItemsWithOvertimeOthers: PayrollItem[] = [
    ...standardPayrollItems,
    ...buildOvertimeOthersPayrollItems(
      overtimeOthersRecords,
      employeeJobMapping,
      individualJob.job_type,
    ),
    ...buildMergeableOthersPayrollItems(
      mergeableOthersRecords,
      payrollItemsByKey,
      employeeJobMapping,
      individualJob.job_type,
    ),
  ];

  // Consolidate items for cleaner PDF output (leave-day activities are excluded —
  // their amount is shown in the Cuti section, and they pay nothing under base pay).
  const consolidatedItems = consolidatePayrollItems(
    filterOutLeaveDayItems(
      payrollItemsWithOvertimeOthers,
      individualJob.leave_records,
    ),
  );
  const groupedConsolidatedItems =
    groupConsolidatedItemsByType(consolidatedItems);

  const getEmployeeIdForJob = (jobType: string): string | null => {
    for (const [employeeId, job] of Object.entries(employeeJobMapping)) {
      if (job === jobType) return employeeId;
    }
    return null;
  };

  const jobEmployeeId = getEmployeeIdForJob(individualJob.job_type);

  // Calculate totals - use consolidated items for consistency with recalculated amounts
  const consolidatedBaseItems = groupedConsolidatedItems.Base || [];
  const tambahanTotalAmount = (groupedConsolidatedItems.Tambahan || []).reduce(
    (sum, item) => sum + (item.total_amount || 0),
    0,
  );
  const overtimeTotalAmount = (groupedConsolidatedItems.Overtime || []).reduce(
    (sum, item) => sum + (item.total_amount || 0),
    0,
  );

  // Commission records (merged duplicates). Split out Cuti Tahunan entries
  // (location_code = '23') so they render as leave instead of an Advance row.
  // Individual-job pages don't show the bottom advance deduction, so we only
  // need the non-cuti slices for display and totals.
  const commissionRecords = individualJob.commission_records || [];
  const cutiTahunanCommissions = commissionRecords.filter(
    isCutiTahunanCommission,
  );
  const nonCutiCommissionRecords = commissionRecords.filter(
    (record: any) => !isCutiTahunanCommission(record),
  );
  const nonCutiDisplayRecords: AdvanceRecord[] = [
    ...nonCutiCommissionRecords,
    ...buildIncentiveRecordsFromOthers(incentiveOthersRecords),
    ...buildIncentiveRecordsFromPayrollItems(
      incentivePayrollItems,
      jobEmployeeId || payroll.employee_id,
      staffDetails?.name || payroll.employee_name,
      payrollMonthStartDate,
    ),
    ...buildIncentiveRecordsFromPayrollItems(
      bonusPayrollItems,
      jobEmployeeId || payroll.employee_id,
      staffDetails?.name || payroll.employee_name,
      payrollMonthStartDate,
    ),
  ];
  const nonCutiCommissionTotalAmount = nonCutiDisplayRecords.reduce(
    (sum: number, record: any) => sum + Number(record.amount || 0),
    0,
  );
  const cutiTahunanCommissionTotalAmount = cutiTahunanCommissions.reduce(
    (sum: number, record: any) => sum + Number(record.amount || 0),
    0,
  );
  const mergedNonCutiCommissionRecords = mergeByDescription(
    nonCutiDisplayRecords,
  );

  // Leave records — merge true leave_records together with Cuti Tahunan
  // commission entries (one day per record) so they share the same totals.
  const groupedLeaveRecords = (individualJob.leave_records || []).reduce(
    (acc, record) => {
      const leaveType = record.leave_type;
      if (!acc[leaveType]) {
        acc[leaveType] = {
          leave_type: leaveType,
          total_days: 0,
          total_amount: 0,
          holiday_descriptions: [],
        };
      }
      acc[leaveType].total_days += record.days_taken;
      acc[leaveType].total_amount += record.amount_paid;
      if (
        record.holiday_description &&
        !acc[leaveType].holiday_descriptions.includes(
          record.holiday_description,
        )
      ) {
        acc[leaveType].holiday_descriptions.push(record.holiday_description);
      }
      return acc;
    },
    {} as Record<string, GroupedLeaveRecord>,
  );
  if (cutiTahunanCommissions.length > 0) {
    const existing = groupedLeaveRecords["cuti_tahunan"];
    if (existing) {
      existing.total_days += cutiTahunanCommissions.length;
      existing.total_amount += cutiTahunanCommissionTotalAmount;
    } else {
      groupedLeaveRecords["cuti_tahunan"] = {
        leave_type: "cuti_tahunan",
        total_days: cutiTahunanCommissions.length,
        total_amount: cutiTahunanCommissionTotalAmount,
        holiday_descriptions: [],
      };
    }
  }
  const leaveRecordsArray: GroupedLeaveRecord[] =
    Object.values(groupedLeaveRecords);
  const leaveTotalAmount = leaveRecordsArray.reduce(
    (sum, record) => sum + (record.total_amount || 0),
    0,
  );

  // Others (Kerja Luar OT) records (merged duplicates)
  const othersRecords: AdvanceRecord[] = regularOthersRecords;
  const othersTotalAmount = othersRecords.reduce(
    (sum: number, record: any) => sum + Number(record.amount || 0),
    0,
  );
  const mergedOthersRecords = mergeByDescription(othersRecords);

  // Gross pay shown on the breakdown is the sum of the subtotals actually
  // rendered above it, all derived from consolidated items (rate × total qty).
  // We must NOT use individualJob.gross_pay_portion here: that sums each day's
  // separately-rounded stored amount, which can drift a few cents from the
  // consolidated subtotals (e.g. 1195.10 vs the 1195.05 the rows add up to).
  const baseTotalAmount = consolidatedBaseItems.reduce(
    (sum, item) => sum + (item.total_amount || 0),
    0,
  );
  const breakdownGrossPay =
    Math.round(
      (baseTotalAmount +
        tambahanTotalAmount +
        overtimeTotalAmount +
        nonCutiCommissionTotalAmount +
        othersTotalAmount +
        leaveTotalAmount) *
        100,
    ) / 100;

  // Build table body
  const tableBody: TableCell[][] = [];

  // Header row
  tableBody.push([
    { text: "Kerja", bold: true, fillColor: "#f0f0f0", fontSize: 9 },
    {
      text: "Rate",
      bold: true,
      fillColor: "#f0f0f0",
      alignment: "right",
      fontSize: 9,
    },
    { text: "Description", bold: true, fillColor: "#f0f0f0", fontSize: 9 },
    {
      text: "Amount",
      bold: true,
      fillColor: "#f0f0f0",
      alignment: "right",
      fontSize: 9,
    },
  ]);

  // Base pay rows
  if (consolidatedBaseItems.length > 0) {
    appendBasePayRows(tableBody, consolidatedBaseItems);
  }

  // Tambahan Items - Using consolidated items
  const consolidatedTambahanItems = groupedConsolidatedItems.Tambahan || [];
  if (
    consolidatedTambahanItems.length > 0 ||
    leaveRecordsArray.length > 0 ||
    nonCutiDisplayRecords.length > 0 ||
    othersRecords.length > 0
  ) {
    consolidatedTambahanItems.forEach((item) => {
      tableBody.push(
        createItemRow(
          stripBagCountSuffix(item.description),
          getConsolidatedRateLabel(item),
          getTambahanItemQuantityLabel(item, monthName),
          formatCurrency(item.total_amount),
        ),
      );
    });

    // Commission records that share a description with an Others row are folded
    // into that row (see combineCommissionsIntoOthers) so the incentive shows as
    // one combined line; the rest render as their own "Advance" rows.
    const { standaloneCommissions, othersRows } = combineCommissionsIntoOthers(
      mergedNonCutiCommissionRecords,
      mergedOthersRecords,
    );

    standaloneCommissions.forEach((commission) => {
      const desc =
        commission.merged_count > 1
          ? `${commission.description} (x${commission.merged_count})`
          : commission.description;
      tableBody.push(
        createItemRow(
          desc,
          "",
          getCommissionQuantityLabel(commission),
          formatCurrency(commission.merged_amount),
        ),
      );
    });

    othersRows.forEach(({ record: other, foldedCommission }) => {
      const desc =
        other.merged_count > 1
          ? `${other.description} (x${other.merged_count})`
          : other.description;
      const rateQuantityDisplay: RateQuantityDisplay =
        getOthersRateQuantityDisplay(other);
      const isMerged = foldedCommission > 0;
      tableBody.push(
        createItemRow(
          desc,
          isMerged ? "" : rateQuantityDisplay.rate,
          rateQuantityDisplay.quantity,
          formatCurrency(other.merged_amount + foldedCommission),
        ),
      );
    });

    const totalNonLeaveTambahanItems =
      consolidatedTambahanItems.length +
      standaloneCommissions.length +
      mergedOthersRecords.length;

    // Jumlah lain-lain (excludes cuti) — printed above the leave block so the
    // non-leave subtotal sits next to its own rows.
    if (
      totalNonLeaveTambahanItems > 1 ||
      (totalNonLeaveTambahanItems > 0 && leaveRecordsArray.length > 0)
    ) {
      tableBody.push([
        { text: "", fillColor: "#f8f9fa", fontSize: 8 },
        { text: "", fillColor: "#f8f9fa", fontSize: 8 },
        {
          text: "Jumlah Lain-lain",
          bold: true,
          fillColor: "#f8f9fa",
          fontSize: 8,
        },
        {
          text: formatCurrency(
            tambahanTotalAmount +
              nonCutiCommissionTotalAmount +
              othersTotalAmount,
          ),
          alignment: "right",
          bold: true,
          fillColor: "#f8f9fa",
          fontSize: 8,
        },
      ]);
    }

    leaveRecordsArray.forEach((leaveRecord) => {
      tableBody.push(
        createItemRow(
          getLeaveDisplayName(leaveRecord),
          "",
          `${leaveRecord.total_days} Hari`,
          formatCurrency(leaveRecord.total_amount),
        ),
      );
    });

    if (leaveRecordsArray.length > 0) {
      tableBody.push([
        { text: "", fillColor: "#f8f9fa", fontSize: 8 },
        { text: "", fillColor: "#f8f9fa", fontSize: 8 },
        { text: "Jumlah Cuti", bold: true, fillColor: "#f8f9fa", fontSize: 8 },
        {
          text: formatCurrency(leaveTotalAmount),
          alignment: "right",
          bold: true,
          fillColor: "#f8f9fa",
          fontSize: 8,
        },
      ]);
    }
  }

  // Overtime Items - Using consolidated items
  const consolidatedOvertimeItems = groupedConsolidatedItems.Overtime || [];
  if (consolidatedOvertimeItems.length > 0) {
    consolidatedOvertimeItems.forEach((item) => {
      const qtyLabel = isDirectAmountFixedItem(item)
        ? "-"
        : `${item.total_quantity} Jam OT`;
      tableBody.push(
        createItemRow(
          item.description,
          getConsolidatedRateLabel(item),
          qtyLabel,
          formatCurrency(item.total_amount),
        ),
      );
    });

    tableBody.push([
      { text: "", fillColor: "#f8f9fa", fontSize: 8 },
      { text: "", fillColor: "#f8f9fa", fontSize: 8 },
      { text: "Jumlah OT", bold: true, fillColor: "#f8f9fa", fontSize: 8 },
      {
        text: formatCurrency(overtimeTotalAmount),
        alignment: "right",
        bold: true,
        fillColor: "#f8f9fa",
        fontSize: 8,
      },
    ]);
  }

  // Gross Pay
  tableBody.push([
    { text: "", fillColor: "#f8f9fa", fontSize: 8 },
    { text: "", fillColor: "#f8f9fa", fontSize: 8 },
    {
      text: isGrouped ? `${jobEmployeeId} Gross Pay` : "Jumlah Gaji Kasar",
      bold: true,
      fillColor: "#f8f9fa",
      fontSize: 8,
    },
    {
      text: formatCurrency(breakdownGrossPay),
      alignment: "right",
      bold: true,
      fillColor: "#f8f9fa",
      fontSize: 8,
    },
  ]);

  // This sibling's own mid-month advance (e.g. JASSON_PM's 200), shown on its
  // own breakdown like the legacy per-identity slips. Statutory deductions stay
  // on the combined slip; only the advance for this id is shown here.
  const advanceByEmployee = payroll.mid_month_payrolls_by_employee || {};
  const jobAdvance = jobEmployeeId
    ? Number(advanceByEmployee[jobEmployeeId]) || 0
    : 0;
  if (jobAdvance > 0) {
    tableBody.push([
      { text: "BAYARAN PENDAHULUAN (ADVANCES PAYMENT)", fontSize: 8 },
      { text: "", fontSize: 8 },
      { text: "", fontSize: 8 },
      {
        text: `(${formatCurrency(jobAdvance)})`,
        alignment: "right",
        fontSize: 8,
      },
    ]);
    tableBody.push([
      { text: "", fillColor: "#f8f9fa", fontSize: 8 },
      { text: "", fillColor: "#f8f9fa", fontSize: 8 },
      {
        text: "Jumlah Selepas Advances",
        bold: true,
        fillColor: "#f8f9fa",
        fontSize: 8,
      },
      {
        text: formatCurrency(breakdownGrossPay - jobAdvance),
        alignment: "right",
        bold: true,
        fillColor: "#f8f9fa",
        fontSize: 8,
      },
    ]);
  }

  // Build content array
  const content: Content[] = [
    // Page break before (except first page)
    { text: "", pageBreak: "before" },

    // Company name
    { text: companyName, style: "companyName", margin: [0, 0, 0, 6] },

    // Employee info (compact single-line layout separated by |)
    {
      text: [
        { text: "Pekerja: ", bold: true },
        `${staffDetails?.name || payroll.employee_name}${jobEmployeeId ? ` (${jobEmployeeId})` : ""}`,
        "  •  ",
        { text: "IC No.: ", bold: true },
        staffDetails?.icNo || "N/A",
        "  •  ",
        { text: "Kerja: ", bold: true },
        individualJob.job_type,
        "  •  ",
        { text: "Bahagian: ", bold: true },
        staffDetails?.section || payroll.section,
      ],
      margin: [0, 0, 0, 5],
    },

    // Payslip title
    {
      text: `Slip Gaji Pajak ${jobEmployeeId ? ` - ${jobEmployeeId}` : ""} Untuk Bulan ${monthName} ${year}${isGrouped ? ` - Kerja ${jobIndex + 1} of ${totalJobs} (Individual Breakdown)` : ""}`,
      style: "payslipTitle",
      margin: [0, 0, 0, 4],
    },

    // Main table
    {
      table: {
        headerRows: 1,
        dontBreakRows: true,
        widths: ["*", 60, 100, 70],
        body: tableBody,
      },
      layout: {
        hLineWidth: (i: number, node: any) => {
          if (i === 0 || i === node.table.body.length) return 1; // Outer borders
          if (i === 1) return 1; // Below header

          const row = node.table.body[i];
          if (row && Array.isArray(row) && row[0]?.baseSectionBorder) {
            return 0.5;
          }

          // Check row above the line (row i-1) for border below specific rows
          const prevRow = node.table.body[i - 1];
          if (prevRow && Array.isArray(prevRow)) {
            // Border below the base subtotal row (just an amount, flagged)
            if ((prevRow[0] as BaseSectionCell)?.baseSubtotalBorder) {
              return 0.5;
            }
            const descCell = prevRow[2];
            const descText =
              typeof descCell === "object" ? descCell.text : descCell;
            // Add border below Rate/ subtotal and Gross Pay rows
            if (
              typeof descText === "string" &&
              (descText.includes("Rate/") ||
                descText === "Subtotal" ||
                descText.endsWith("Jumlah OT") ||
                descText === "Jumlah Cuti" ||
                descText === "Jumlah Lain-lain" ||
                descText.includes("Gross Pay") ||
                descText === "Jumlah Gaji Kasar")
            ) {
              return 0.5;
            }
          }

          // Add thin line above rows with fillColor (subtotals, totals)
          if (row && Array.isArray(row) && row[0]?.fillColor) {
            return 0.5;
          }
          return 0; // No line for regular rows
        },
        vLineWidth: () => 1,
        hLineColor: () => "#000",
        vLineColor: () => "#000",
        paddingLeft: () => 5,
        paddingRight: () => 5,
        paddingTop: () => 2,
        paddingBottom: () => 2,
      },
    } as ContentTable,

    // Notice
    {
      text: `*** Individual job breakdown - ${isGrouped ? "No deductions applied to individual jobs" : ""}`,
      style: "notice",
      margin: [0, 3, 0, 0],
    },

    // Signature section
    {
      columns: [
        { width: "*", text: "" },
        {
          width: "auto",
          stack: [
            { text: "RECEIVED BY", alignment: "right" },
            {
              canvas: [
                { type: "line", x1: 0, y1: 0, x2: 150, y2: 0, lineWidth: 1 },
              ],
              margin: [0, 5, 0, 0],
            },
          ],
        },
      ],
      margin: [0, 50, 0, 0],
      unbreakable: true,
    },
  ];

  return content;
};

// Main function to generate PDF
export const generatePaySlipPDF = (props: PaySlipPDFProps): void => {
  const {
    payroll,
    companyName = "TIEN HOCK FOOD INDUSTRIES S/B",
    staffDetails,
    midMonthPayroll,
  } = props;

  if (!payroll) {
    console.error("No payroll data available");
    return;
  }

  const year = payroll.year ?? new Date().getFullYear();
  const month = payroll.month ?? new Date().getMonth() + 1;
  const monthName = getMonthName(month);

  // Check if grouped payroll
  const isGroupedPayroll = payroll.job_type && payroll.job_type.includes(", ");
  const individualJobs = isGroupedPayroll ? splitGroupedPayroll(payroll) : [];

  // Build all content
  let allContent: Content[] = [];

  // Main payroll page
  allContent = allContent.concat(
    buildMainPayrollPage(
      payroll,
      companyName,
      staffDetails,
      midMonthPayroll,
      year,
      month,
      monthName,
    ),
  );

  // Individual job pages for grouped payrolls
  if (isGroupedPayroll && individualJobs.length > 0) {
    individualJobs.forEach((job, index) => {
      allContent = allContent.concat(
        buildIndividualJobPage(
          job,
          payroll,
          companyName,
          staffDetails,
          year,
          month,
          monthName,
          true,
          index,
          individualJobs.length,
        ),
      );
    });
  }

  // Document definition
  const docDefinition: TDocumentDefinitions = {
    pageSize: "A4",
    pageMargins: [20, 20, 20, 20],
    defaultStyle: {
      fontSize: 9,
      lineHeight: 1.2,
    },
    styles: {
      companyName: {
        fontSize: 14,
        bold: true,
      },
      payslipTitle: {
        bold: true,
        fontSize: 9,
      },
      notice: {
        fontSize: 8,
        italics: true,
      },
      tableCell: {
        fontSize: 8,
      },
    },
    content: allContent,
  };

  // Generate and download PDF
  const employeeId = payroll.employee_id || "unknown";
  const fileName = `PaySlip-${employeeId}-${year}-${month}.pdf`;

  pdfMake.createPdf(docDefinition).download(fileName);
};

// Function to get PDF as blob (for preview or other uses)
export const getPaySlipPDFBlob = (props: PaySlipPDFProps): Promise<Blob> => {
  return new Promise((resolve, reject) => {
    const {
      payroll,
      companyName = "TIEN HOCK FOOD INDUSTRIES S/B",
      staffDetails,
      midMonthPayroll,
    } = props;

    if (!payroll) {
      reject(new Error("No payroll data available"));
      return;
    }

    const year = payroll.year ?? new Date().getFullYear();
    const month = payroll.month ?? new Date().getMonth() + 1;
    const monthName = getMonthName(month);

    const isGroupedPayroll =
      payroll.job_type && payroll.job_type.includes(", ");
    const individualJobs = isGroupedPayroll ? splitGroupedPayroll(payroll) : [];

    let allContent: Content[] = [];
    allContent = allContent.concat(
      buildMainPayrollPage(
        payroll,
        companyName,
        staffDetails,
        midMonthPayroll,
        year,
        month,
        monthName,
      ),
    );

    if (isGroupedPayroll && individualJobs.length > 0) {
      individualJobs.forEach((job, index) => {
        allContent = allContent.concat(
          buildIndividualJobPage(
            job,
            payroll,
            companyName,
            staffDetails,
            year,
            month,
            monthName,
            true,
            index,
            individualJobs.length,
          ),
        );
      });
    }

    const docDefinition: TDocumentDefinitions = {
      pageSize: "A4",
      pageMargins: [20, 20, 20, 20],
      defaultStyle: {
        fontSize: 9,
        lineHeight: 1.2,
      },
      styles: {
        companyName: {
          fontSize: 14,
          bold: true,
        },
        payslipTitle: {
          bold: true,
          fontSize: 9,
        },
        notice: {
          fontSize: 8,
          italics: true,
        },
        tableCell: {
          fontSize: 8,
        },
      },
      content: allContent,
    };

    pdfMake.createPdf(docDefinition).getBlob((blob: Blob) => {
      resolve(blob);
    });
  });
};

// Interface for staff details (to match PayslipManager)
interface StaffDetails {
  name: string;
  icNo: string;
  jobName: string;
  section: string;
}

// Interface for mid-month payroll
interface MidMonthPayrollType {
  employee_id: string;
  amount: number;
  [key: string]: any;
}

// Function to get batch PDF as blob
export const getBatchPaySlipPDFBlob = (
  payrolls: EmployeePayroll[],
  staffDetailsMap?: Record<string, StaffDetails>,
  companyName = "TIEN HOCK FOOD INDUSTRIES S/B",
  midMonthPayrollsMap?: Record<string, MidMonthPayrollType | null>,
): Promise<Blob> => {
  return new Promise((resolve, reject) => {
    if (!payrolls || payrolls.length === 0) {
      reject(new Error("No payroll data available"));
      return;
    }

    let allContent: Content[] = [];

    payrolls.forEach((payroll, payrollIndex) => {
      const year = payroll.year ?? new Date().getFullYear();
      const month = payroll.month ?? new Date().getMonth() + 1;
      const monthName = getMonthName(month);
      const staffDetails = staffDetailsMap?.[payroll.employee_id];
      const midMonthPayroll = midMonthPayrollsMap?.[payroll.employee_id];

      const isGroupedPayroll =
        payroll.job_type && payroll.job_type.includes(", ");
      const individualJobs = isGroupedPayroll
        ? splitGroupedPayroll(payroll)
        : [];

      // Add page break before each payroll (except the first)
      if (payrollIndex > 0) {
        allContent.push({ text: "", pageBreak: "before" });
      }

      // Main payroll page content (without the array wrapper for first item)
      const mainPageContent = buildMainPayrollPage(
        payroll,
        companyName,
        staffDetails,
        midMonthPayroll as MidMonthPayroll | null | undefined,
        year,
        month,
        monthName,
      );
      allContent = allContent.concat(mainPageContent);

      // Individual job pages for grouped payrolls
      if (isGroupedPayroll && individualJobs.length > 0) {
        individualJobs.forEach((job, index) => {
          allContent = allContent.concat(
            buildIndividualJobPage(
              job,
              payroll,
              companyName,
              staffDetails,
              year,
              month,
              monthName,
              true,
              index,
              individualJobs.length,
            ),
          );
        });
      }
    });

    const docDefinition: TDocumentDefinitions = {
      pageSize: "A4",
      pageMargins: [20, 20, 20, 20],
      defaultStyle: {
        fontSize: 9,
        lineHeight: 1.2,
      },
      styles: {
        companyName: {
          fontSize: 14,
          bold: true,
        },
        payslipTitle: {
          bold: true,
          fontSize: 9,
        },
        notice: {
          fontSize: 8,
          italics: true,
        },
        tableCell: {
          fontSize: 8,
        },
      },
      content: allContent,
    };

    pdfMake.createPdf(docDefinition).getBlob((blob: Blob) => {
      resolve(blob);
    });
  });
};

export default generatePaySlipPDF;
