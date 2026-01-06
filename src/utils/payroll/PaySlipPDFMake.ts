// src/utils/payroll/PaySlipPDFMake.ts
import pdfMake from 'pdfmake/build/pdfmake';
import * as pdfFonts from 'pdfmake/build/vfs_fonts';
import { TDocumentDefinitions, Content, TableCell, ContentTable } from 'pdfmake/interfaces';
import { EmployeePayroll, MidMonthPayroll } from '../../types/types';
import { getMonthName, consolidatePayrollItems, groupConsolidatedItemsByType, ConsolidatedPayrollItem } from './payrollUtils';

// Initialize pdfmake with fonts (uses bundled Roboto font which is similar to Helvetica)
(pdfMake as any).vfs = (pdfFonts as any).pdfMake?.vfs || pdfFonts;

// Types
interface IndividualJobPayroll {
  job_type: string;
  items: any[];
  leave_records?: any[];
  commission_records?: any[];
  gross_pay_portion: number;
}

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
  return new Intl.NumberFormat('en-MY', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
};

const prettifyLeaveType = (leaveType: string): string => {
  return leaveType
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
};

const itemBelongsToJobByName = (description: string, payCode: string, jobType: string): boolean => {
  const descLower = (description || '').toLowerCase();
  const payCodeLower = (payCode || '').toLowerCase();
  const jobLower = jobType.toLowerCase();
  return descLower.includes(jobLower) || payCodeLower.includes(jobLower);
};

// Split grouped payroll into individual job payrolls
const splitGroupedPayroll = (payroll: EmployeePayroll): IndividualJobPayroll[] => {
  if (!payroll.job_type || !payroll.job_type.includes(', ')) {
    return [{
      job_type: payroll.job_type,
      items: payroll.items || [],
      leave_records: payroll.leave_records || [],
      commission_records: payroll.commission_records || [],
      gross_pay_portion: payroll.gross_pay
    }];
  }

  const jobTypes = payroll.job_type.split(', ').map(job => job.trim());
  const individualJobs: IndividualJobPayroll[] = [];
  const allItems = payroll.items || [];
  const allLeaveRecords = payroll.leave_records || [];
  const allCommissionRecords = payroll.commission_records || [];

  jobTypes.forEach(jobType => {
    const jobItems = allItems.filter(item => {
      if (item.job_type) {
        return item.job_type === jobType;
      }
      const matchesByName = jobTypes.some(jt => itemBelongsToJobByName(item.description, item.pay_code_id, jt));
      if (!matchesByName) {
        return true;
      }
      return itemBelongsToJobByName(item.description, item.pay_code_id, jobType);
    });

    const jobLeaveRecords = [...allLeaveRecords];
    const jobCommissionRecords = allCommissionRecords.filter(record => {
      const hasJobMatch = jobTypes.some(jt => itemBelongsToJobByName(record.description, '', jt));
      if (!hasJobMatch) {
        return true;
      }
      return itemBelongsToJobByName(record.description, '', jobType);
    });

    const jobGrossPay = jobItems.reduce((sum, item) => sum + (item.amount || 0), 0) +
                        jobLeaveRecords.reduce((sum, record) => sum + (record.amount_paid || 0), 0) +
                        jobCommissionRecords.reduce((sum, record) => sum + (record.amount || 0), 0);

    individualJobs.push({
      job_type: jobType,
      items: jobItems,
      leave_records: jobLeaveRecords,
      commission_records: jobCommissionRecords,
      gross_pay_portion: jobGrossPay
    });
  });

  return individualJobs;
};

// Group items by job type for display with category headers
const groupItemsByJobType = (
  items: any[],
  isGroupedPayroll: boolean,
  jobTypes: string[],
  employeeJobMapping: Record<string, string>
): { jobType: string | null; items: any[] }[] => {
  if (!isGroupedPayroll) {
    return [{ jobType: null, items }];
  }

  const getItemJobType = (item: any): string | null => {
    if (item.source_employee_id && employeeJobMapping[item.source_employee_id]) {
      const mappedJobType = employeeJobMapping[item.source_employee_id];
      if (jobTypes.includes(mappedJobType)) {
        return mappedJobType;
      }
    }
    if (item.job_type && jobTypes.includes(item.job_type)) {
      return item.job_type;
    }
    const descLower = (item.description || '').toLowerCase();
    const payCodeLower = (item.pay_code_id || '').toLowerCase();
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

  items.forEach(item => {
    const jobType = getItemJobType(item);
    if (!itemsByJob.has(jobType)) {
      itemsByJob.set(jobType, []);
    }
    itemsByJob.get(jobType)!.push(item);
  });

  jobTypes.forEach(jobType => {
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
  options: { bold?: boolean; fillColor?: string; borderTop?: boolean; borderBottom?: boolean } = {}
): TableCell[] => {
  const baseStyle: any = { fontSize: 8 };
  if (options.bold) baseStyle.bold = true;
  if (options.fillColor) baseStyle.fillColor = options.fillColor;

  return [
    { text: description, fontSize: 8, bold: options.bold, fillColor: options.fillColor, noWrap: false },
    { text: rate, alignment: 'right', fontSize: 8, bold: options.bold, fillColor: options.fillColor },
    { text: descNote, fontSize: 8, bold: options.bold, fillColor: options.fillColor },
    { text: amount, alignment: 'right', fontSize: 8, bold: options.bold, fillColor: options.fillColor },
  ];
};

// Create job category header row (no total displayed in header for combined payrolls)
const createJobCategoryRow = (jobType: string, employeeId: string | null): TableCell[] => {
  const label = `[ ${jobType}${employeeId ? ` (${employeeId})` : ''} ]`;
  return [
    { text: label, colSpan: 4, bold: true, fillColor: '#e8e8e8', fontSize: 8 },
    {},
    {},
    {},
  ];
};

// Create job subtotal row (only for combined payrolls)
const createJobSubtotalRow = (jobType: string, total: string): TableCell[] => {
  return [
    { text: '', fillColor: '#f0f0f0', fontSize: 8 },
    { text: '', fillColor: '#f0f0f0', fontSize: 8 },
    { text: `${jobType} Subtotal`, bold: true, fillColor: '#f0f0f0', fontSize: 8 },
    { text: total, alignment: 'right', bold: true, fillColor: '#f0f0f0', fontSize: 8 },
  ];
};

// Build main payroll page content
const buildMainPayrollPage = (
  payroll: EmployeePayroll,
  companyName: string,
  staffDetails: any,
  midMonthPayroll: MidMonthPayroll | null | undefined,
  year: number,
  month: number,
  monthName: string
): Content[] => {
  const isGroupedPayroll = payroll.job_type && payroll.job_type.includes(', ');
  const jobTypes = isGroupedPayroll ? payroll.job_type.split(', ').map(job => job.trim()) : [payroll.job_type];
  const employeeJobMapping = payroll.employee_job_mapping || {};

  const getEmployeeIdForJob = (jobType: string): string | null => {
    for (const [employeeId, job] of Object.entries(employeeJobMapping)) {
      if (job === jobType) return employeeId;
    }
    return null;
  };

  // Consolidate items for cleaner PDF output
  const consolidatedItems = consolidatePayrollItems(payroll.items || []);
  const groupedConsolidatedItems = groupConsolidatedItemsByType(consolidatedItems);

  // Group consolidated items by job type
  const baseItemsByJob = groupItemsByJobType(groupedConsolidatedItems.Base || [], isGroupedPayroll || false, jobTypes, employeeJobMapping);
  const tambahanItemsByJob = groupItemsByJobType(groupedConsolidatedItems.Tambahan || [], isGroupedPayroll || false, jobTypes, employeeJobMapping);
  const overtimeItemsByJob = groupItemsByJobType(groupedConsolidatedItems.Overtime || [], isGroupedPayroll || false, jobTypes, employeeJobMapping);

  // Calculate totals - use consolidated items for consistency with recalculated amounts
  const consolidatedBaseItems = groupedConsolidatedItems.Base || [];
  const baseTotalAmount = consolidatedBaseItems.reduce((sum, item) => sum + (item.total_amount || 0), 0);
  const tambahanTotalAmount = (groupedConsolidatedItems.Tambahan || []).reduce((sum, item) => sum + (item.total_amount || 0), 0);
  const overtimeTotalAmount = (groupedConsolidatedItems.Overtime || []).reduce((sum, item) => sum + (item.total_amount || 0), 0);

  // Detect predominant rate unit for Base items (Hour vs Bag) - use consolidated items
  const bagBasedItems = consolidatedBaseItems.filter(item => item.rate_unit === 'Bag');
  const hourBasedItems = consolidatedBaseItems.filter(item => item.rate_unit === 'Hour');
  const isBagBased = bagBasedItems.length > hourBasedItems.length;
  const rateUnitLabel = isBagBased ? 'Bag' : 'Jam';

  // Leave records
  const groupedLeaveRecords = (payroll.leave_records || []).reduce((acc, record) => {
    const leaveType = record.leave_type;
    if (!acc[leaveType]) {
      acc[leaveType] = { leave_type: leaveType, total_days: 0, total_amount: 0 };
    }
    acc[leaveType].total_days += record.days_taken;
    acc[leaveType].total_amount += record.amount_paid;
    return acc;
  }, {} as Record<string, { leave_type: string; total_days: number; total_amount: number }>);
  const leaveRecordsArray = Object.values(groupedLeaveRecords);
  const leaveTotalAmount = leaveRecordsArray.reduce((sum, record) => sum + (record.total_amount || 0), 0);

  // Commission records
  const commissionRecords = payroll.commission_records || [];
  const commissionTotalAmount = commissionRecords.reduce((sum, record) => sum + record.amount, 0);
  const combinedTambahanTotal = tambahanTotalAmount + leaveTotalAmount + commissionTotalAmount;

  // Calculate effective hourly rate (total amount / hours worked)
  // Note: When a worker performs multiple tasks during the same hours, each task shows the same quantity
  // So we use the first item's quantity (or most common) as the actual hours worked, not the sum
  const hourBasedItemsForRate = consolidatedBaseItems.filter(item => item.rate_unit === 'Hour');
  const representativeHours = hourBasedItemsForRate.length > 0 ? hourBasedItemsForRate[0].total_quantity : 0;
  const averageBaseRate = representativeHours > 0 ? baseTotalAmount / representativeHours : 0;

  // Mid-month and final calculations
  const midMonthPayment = midMonthPayroll ? midMonthPayroll.amount : 0;
  const isMainten = payroll.job_type === 'MAINTEN' || payroll.job_type?.includes('MAINTEN');
  const cutiTahunanRecords = leaveRecordsArray.filter(record => record.leave_type === 'cuti_tahunan');
  const cutiTahunanAmount = cutiTahunanRecords.reduce((sum, record) => sum + record.total_amount, 0);
  const additionalMaintenDeduction = isMainten ? cutiTahunanAmount : 0;
  const finalPayment = payroll.net_pay - midMonthPayment - additionalMaintenDeduction;

  // Build table body
  const tableBody: TableCell[][] = [];

  // Header row
  tableBody.push([
    { text: 'Kerja', bold: true, fillColor: '#f0f0f0', fontSize: 9 },
    { text: 'Rate', bold: true, fillColor: '#f0f0f0', alignment: 'right', fontSize: 9 },
    { text: 'Description', bold: true, fillColor: '#f0f0f0', fontSize: 9 },
    { text: 'Amount', bold: true, fillColor: '#f0f0f0', alignment: 'right', fontSize: 9 },
  ]);

  // Base Pay Items - Using consolidated items for cleaner display
  baseItemsByJob.forEach(jobGroup => {
    const jobItems = jobGroup.items as ConsolidatedPayrollItem[];
    const jobTotal = jobItems.reduce((sum, item) => sum + (item.total_amount || 0), 0);
    const jobTypeLabel = jobGroup.jobType || 'Shared';

    // Job category header for grouped payrolls
    if (isGroupedPayroll && jobGroup.jobType) {
      tableBody.push(createJobCategoryRow(jobGroup.jobType, getEmployeeIdForJob(jobGroup.jobType)));
    } else if (isGroupedPayroll && !jobGroup.jobType && jobItems.length > 0) {
      tableBody.push(createJobCategoryRow('Shared', null));
    }

    // Display consolidated items with total quantities
    jobItems.forEach(item => {
      const qtyLabel = item.rate_unit === 'Bag'
        ? `${item.total_quantity} Bag${item.total_quantity > 1 ? 's' : ''}`
        : item.rate_unit === 'Hour'
        ? `${item.total_quantity} Jam`
        : `${item.total_quantity} ${item.rate_unit}`;
      tableBody.push(createItemRow(
        item.description,
        item.rate_unit === 'Percent' ? `${item.rate}%` : item.rate.toFixed(2),
        qtyLabel,
        formatCurrency(item.total_amount)
      ));
    });

    // Add job subtotal row for combined payrolls (only when there are items)
    if (isGroupedPayroll && jobItems.length > 0) {
      tableBody.push(createJobSubtotalRow(jobTypeLabel, formatCurrency(jobTotal)));
    }
  });

  // Base subtotal row (only for single-job payrolls; combined payrolls show per-job subtotals)
  if (consolidatedBaseItems.length > 0 && !isGroupedPayroll) {
    tableBody.push([
      { text: '', fillColor: '#f8f9fa', fontSize: 8 },
      { text: '', fillColor: '#f8f9fa', fontSize: 8 },
      { text: `Rate/${rateUnitLabel}: ${averageBaseRate.toFixed(2)}`, bold: true, fillColor: '#f8f9fa', fontSize: 8 },
      { text: formatCurrency(baseTotalAmount), alignment: 'right', bold: true, fillColor: '#f8f9fa', fontSize: 8 },
    ]);
  }

  // Tambahan Items - Using consolidated items
  if ((groupedConsolidatedItems.Tambahan && groupedConsolidatedItems.Tambahan.length > 0) || leaveRecordsArray.length > 0 || commissionRecords.length > 0) {
    tambahanItemsByJob.forEach(jobGroup => {
      const jobItems = jobGroup.items as ConsolidatedPayrollItem[];
      const tambahanJobTotal = jobItems.reduce((sum, item) => sum + (item.total_amount || 0), 0);
      const jobTypeLabel = jobGroup.jobType ? `${jobGroup.jobType} - Tambahan` : 'Shared - Tambahan';

      if (isGroupedPayroll && jobGroup.jobType && jobItems.length > 0) {
        tableBody.push(createJobCategoryRow(`${jobGroup.jobType} - Tambahan`, getEmployeeIdForJob(jobGroup.jobType)));
      } else if (isGroupedPayroll && !jobGroup.jobType && jobItems.length > 0) {
        tableBody.push(createJobCategoryRow('Shared - Tambahan', null));
      }

      jobItems.forEach(item => {
        const qtyLabel = item.rate_unit === 'Fixed' ? monthName : `${item.total_quantity} ${item.rate_unit}`;
        tableBody.push(createItemRow(
          item.description,
          item.rate_unit === 'Percent' ? `${item.rate}%` : item.rate.toFixed(2),
          qtyLabel,
          formatCurrency(item.total_amount)
        ));
      });

      // Add job subtotal row for combined payrolls (only when there are items)
      if (isGroupedPayroll && jobItems.length > 0) {
        tableBody.push(createJobSubtotalRow(jobTypeLabel, formatCurrency(tambahanJobTotal)));
      }
    });

    // Commission records
    commissionRecords.forEach(commission => {
      tableBody.push(createItemRow(commission.description, '', 'Advance', formatCurrency(commission.amount)));
    });

    // Leave records
    leaveRecordsArray.forEach(leaveRecord => {
      tableBody.push(createItemRow(
        prettifyLeaveType(leaveRecord.leave_type),
        '',
        `${leaveRecord.total_days} Hari`,
        formatCurrency(leaveRecord.total_amount)
      ));
    });

    // Tambahan subtotal - only show if more than one item total
    const totalTambahanItems = (groupedConsolidatedItems.Tambahan?.length || 0) + leaveRecordsArray.length + commissionRecords.length;
    if (totalTambahanItems > 1) {
      tableBody.push([
        { text: '', fillColor: '#f8f9fa', fontSize: 8 },
        { text: '', fillColor: '#f8f9fa', fontSize: 8 },
        { text: 'Subtotal', bold: true, fillColor: '#f8f9fa', fontSize: 8 },
        { text: formatCurrency(combinedTambahanTotal), alignment: 'right', bold: true, fillColor: '#f8f9fa', fontSize: 8 },
      ]);
    }
  }

  // Overtime Items - Using consolidated items
  if (groupedConsolidatedItems.Overtime && groupedConsolidatedItems.Overtime.length > 0) {
    overtimeItemsByJob.forEach(jobGroup => {
      const jobItems = jobGroup.items as ConsolidatedPayrollItem[];
      const overtimeJobTotal = jobItems.reduce((sum, item) => sum + (item.total_amount || 0), 0);
      const jobTypeLabel = jobGroup.jobType ? `${jobGroup.jobType} - OT` : 'Shared - OT';

      if (isGroupedPayroll && jobGroup.jobType && jobItems.length > 0) {
        tableBody.push(createJobCategoryRow(`${jobGroup.jobType} - OT`, getEmployeeIdForJob(jobGroup.jobType)));
      } else if (isGroupedPayroll && !jobGroup.jobType && jobItems.length > 0) {
        tableBody.push(createJobCategoryRow('Shared - OT', null));
      }

      jobItems.forEach(item => {
        const qtyLabel = `${item.total_quantity} Jam OT`;
        tableBody.push(createItemRow(
          item.description,
          item.rate_unit === 'Percent' ? `${item.rate}%` : item.rate.toFixed(2),
          qtyLabel,
          formatCurrency(item.total_amount)
        ));
      });

      // Add job subtotal row for combined payrolls (only when there are items)
      if (isGroupedPayroll && jobItems.length > 0) {
        tableBody.push(createJobSubtotalRow(jobTypeLabel, formatCurrency(overtimeJobTotal)));
      }
    });

    // Overtime subtotal (only for single-job payrolls)
    if (!isGroupedPayroll) {
      tableBody.push([
        { text: '', fillColor: '#f8f9fa', fontSize: 8 },
        { text: '', fillColor: '#f8f9fa', fontSize: 8 },
        { text: 'Subtotal', bold: true, fillColor: '#f8f9fa', fontSize: 8 },
        { text: formatCurrency(overtimeTotalAmount), alignment: 'right', bold: true, fillColor: '#f8f9fa', fontSize: 8 },
      ]);
    }
  }

  // Jumlah Gaji Kasar
  tableBody.push([
    { text: '', fontSize: 8, fillColor: '#f8f9fa' },
    { text: '', fontSize: 8, fillColor: '#f8f9fa' },
    { text: 'Jumlah Gaji Kasar', bold: true, fontSize: 8, fillColor: '#f8f9fa' },
    { text: formatCurrency(payroll.gross_pay), alignment: 'right', bold: true, fontSize: 8, fillColor: '#f8f9fa' },
  ]);

  // Deductions
  if (payroll.deductions && payroll.deductions.length > 0) {
    const epfDeduction = payroll.deductions.find(d => d.deduction_type.toUpperCase() === 'EPF');
    const socsoDeduction = payroll.deductions.find(d => d.deduction_type.toUpperCase() === 'SOCSO');
    const sipDeduction = payroll.deductions.find(d => d.deduction_type.toUpperCase() === 'SIP');
    const incomeTaxDeduction = payroll.deductions.find(d => d.deduction_type === 'income_tax');

    if (epfDeduction) {
      tableBody.push([
        { text: 'EPF (Majikan)', fontSize: 8 },
        { text: formatCurrency(epfDeduction.employer_amount), alignment: 'right', fontSize: 8 },
        { text: 'EPF (Pekerja)', fontSize: 8 },
        { text: `(${formatCurrency(epfDeduction.employee_amount)})`, alignment: 'right', fontSize: 8 },
      ]);
    }
    if (socsoDeduction) {
      tableBody.push([
        { text: 'SOCSO (Majikan)', fontSize: 8 },
        { text: formatCurrency(socsoDeduction.employer_amount), alignment: 'right', fontSize: 8 },
        { text: 'SOCSO (Pekerja)', fontSize: 8 },
        { text: `(${formatCurrency(socsoDeduction.employee_amount)})`, alignment: 'right', fontSize: 8 },
      ]);
    }
    if (sipDeduction) {
      tableBody.push([
        { text: 'SIP (Majikan)', fontSize: 8 },
        { text: formatCurrency(sipDeduction.employer_amount), alignment: 'right', fontSize: 8 },
        { text: 'SIP (Pekerja)', fontSize: 8 },
        { text: `(${formatCurrency(sipDeduction.employee_amount)})`, alignment: 'right', fontSize: 8 },
      ]);
    }
    if (incomeTaxDeduction) {
      tableBody.push([
        { text: '', fontSize: 8 },
        { text: '', fontSize: 8 },
        { text: 'Income Tax (PCB)', fontSize: 8 },
        { text: `(${formatCurrency(incomeTaxDeduction.employee_amount)})`, alignment: 'right', fontSize: 8 },
      ]);
    }
  }

  // Jumlah Gaji Bersih
  tableBody.push([
    { text: '', fontSize: 8, fillColor: '#f8f9fa' },
    { text: '', fontSize: 8, fillColor: '#f8f9fa' },
    { text: 'Jumlah Gaji Bersih', bold: true, fontSize: 8, fillColor: '#f8f9fa' },
    { text: formatCurrency(payroll.net_pay + commissionTotalAmount), alignment: 'right', bold: true, fontSize: 8, fillColor: '#f8f9fa' },
  ]);

  // Mid-month deduction rows
  if (commissionRecords.length > 0) {
    commissionRecords.forEach(commission => {
      const cutiTahunanRecordsForCommission = leaveRecordsArray.filter(record => record.leave_type === 'cuti_tahunan');
      const cutiTahunanAmountForCommission = cutiTahunanRecordsForCommission.reduce((sum, record) => sum + record.total_amount, 0);
      const totalAmount = isMainten ? commission.amount + cutiTahunanAmountForCommission : commission.amount;
      const description = isMainten && cutiTahunanRecordsForCommission.length > 0
        ? `${commission.description} + Cuti Tahunan (Advance)`
        : `${commission.description} (Advance)`;

      tableBody.push([
        { text: description, fontSize: 8 },
        { text: '', fontSize: 8 },
        { text: '', fontSize: 8 },
        { text: `(${formatCurrency(totalAmount)})`, alignment: 'right', fontSize: 8 },
      ]);
    });
  }

  // Cuti Tahunan deduction for MAINTEN without commission
  if (commissionRecords.length === 0 && isMainten && cutiTahunanAmount > 0) {
    tableBody.push([
      { text: 'Cuti Tahunan (Advance)', fontSize: 8 },
      { text: '', fontSize: 8 },
      { text: '', fontSize: 8 },
      { text: `(${formatCurrency(cutiTahunanAmount)})`, alignment: 'right', fontSize: 8 },
    ]);
  }

  // Mid-month payment deduction
  if (midMonthPayroll) {
    tableBody.push([
      { text: 'BAYARAN PENDAHULUAN (ADVANCES PAYMENT)', fontSize: 8 },
      { text: '', fontSize: 8 },
      { text: '', fontSize: 8 },
      { text: `(${formatCurrency(midMonthPayment)})`, alignment: 'right', fontSize: 8 },
    ]);
  }

  // Jumlah row (raw final payment before rounding)
  if (midMonthPayroll || commissionRecords.length > 0 || (isMainten && cutiTahunanAmount > 0)) {
    tableBody.push([
      { text: '', fontSize: 8, fillColor: '#f8f9fa' },
      { text: '', fontSize: 8, fillColor: '#f8f9fa' },
      { text: 'Jumlah', bold: true, fontSize: 8, fillColor: '#f8f9fa' },
      { text: formatCurrency(finalPayment), alignment: 'right', bold: true, fontSize: 8, fillColor: '#f8f9fa' },
    ]);
  }

  // Use stored rounding values if available, otherwise calculate on-the-fly (backward compatibility)
  const digenapkan = payroll.digenapkan ?? (Math.ceil(finalPayment) - finalPayment);
  const setelahDigenapkan = payroll.setelah_digenapkan ?? Math.ceil(finalPayment);

  // Digenapkan row (rounding adjustment) - only show if there's an adjustment
  if (digenapkan > 0.001) {
    tableBody.push([
      { text: '', fontSize: 8 },
      { text: '', fontSize: 8 },
      { text: 'Digenapkan', fontSize: 8 },
      { text: formatCurrency(digenapkan), alignment: 'right', fontSize: 8 },
    ]);
  }

  // Jumlah Digenapkan (Grand Total - rounded amount)
  tableBody.push([
    { text: '', fillColor: '#f8f9fa', fontSize: 8 },
    { text: '', fillColor: '#f8f9fa', fontSize: 8 },
    { text: 'Jumlah Digenapkan', bold: true, fillColor: '#f8f9fa', fontSize: 8 },
    { text: formatCurrency(setelahDigenapkan), alignment: 'right', bold: true, fillColor: '#f8f9fa', fontSize: 8 },
  ]);

  // Build content array
  const content: Content[] = [
    // Company name
    { text: companyName, style: 'companyName', margin: [0, 0, 0, 6] },

    // Employee info table
    {
      columns: [
        { width: 55, text: 'Employee' },
        { width: 10, text: ':' },
        { width: '*', text: staffDetails?.name || payroll.employee_name },
      ],
      margin: [0, 0, 0, 3],
    },
    {
      columns: [
        { width: 55, text: 'IC No.' },
        { width: 10, text: ':' },
        { width: '*', text: staffDetails?.icNo || 'N/A' },
      ],
      margin: [0, 0, 0, 3],
    },
    {
      columns: [
        { width: 55, text: 'Kerja' },
        { width: 10, text: ':' },
        { width: '*', text: staffDetails?.jobName || payroll.job_type },
      ],
      margin: [0, 0, 0, 3],
    },
    {
      columns: [
        { width: 55, text: 'Bahagian' },
        { width: 10, text: ':' },
        { width: '*', text: staffDetails?.section || payroll.section },
      ],
      margin: [0, 0, 0, 5],
    },

    // Payslip title
    {
      text: `Slip Gaji Pajak (Jam/Bag/Commission) Untuk Bulan ${monthName} ${year}`,
      style: 'payslipTitle',
      margin: [0, 0, 0, 4],
    },

    // Main table
    {
      table: {
        headerRows: 1,
        dontBreakRows: true,
        widths: ['*', 60, 100, 70],
        body: tableBody,
      },
      layout: {
        hLineWidth: (i: number, node: any) => {
          if (i === 0 || i === node.table.body.length) return 1; // Outer borders
          if (i === 1) return 1; // Below header

          // Check row above the line (row i-1) for border below specific rows
          const prevRow = node.table.body[i - 1];
          if (prevRow && Array.isArray(prevRow)) {
            const descCell = prevRow[2];
            const descText = typeof descCell === 'object' ? descCell.text : descCell;
            // Add border below Rate/ subtotal and Jumlah Gaji Kasar rows
            if (typeof descText === 'string' &&
                (descText.includes('Rate/') || descText === 'Jumlah Gaji Kasar')) {
              return 0.5;
            }
            // Add light border below job category headers (fillColor: '#e8e8e8')
            if (prevRow[0]?.fillColor === '#e8e8e8') {
              return 0.5;
            }
          }

          // Add thin line above rows with fillColor (subtotals, totals, category headers)
          const row = node.table.body[i];
          if (row && Array.isArray(row) && row[0]?.fillColor) {
            return 0.5;
          }
          return 0; // No line for regular rows
        },
        vLineWidth: () => 1,
        hLineColor: () => '#000',
        vLineColor: () => '#000',
        paddingLeft: () => 5,
        paddingRight: () => 5,
        paddingTop: () => 2,
        paddingBottom: () => 2,
      },
    } as ContentTable,

    // Notice
    {
      text: '*** Perhatian : Sila kembalikan selepas tandatangan slip ini',
      style: 'notice',
      margin: [0, 3, 0, 0],
    },

    // Signature section
    {
      columns: [
        { width: '*', text: '' },
        {
          width: 'auto',
          stack: [
            { text: 'Received By', alignment: 'right' },
            { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 150, y2: 0, lineWidth: 1 }], margin: [0, 5, 0, 0] },
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
  totalJobs: number
): Content[] => {
  const employeeJobMapping = payroll.employee_job_mapping || {};

  // Consolidate items for cleaner PDF output
  const consolidatedItems = consolidatePayrollItems(individualJob.items || []);
  const groupedConsolidatedItems = groupConsolidatedItemsByType(consolidatedItems);

  const getEmployeeIdForJob = (jobType: string): string | null => {
    for (const [employeeId, job] of Object.entries(employeeJobMapping)) {
      if (job === jobType) return employeeId;
    }
    return null;
  };

  const jobEmployeeId = getEmployeeIdForJob(individualJob.job_type);

  // Calculate totals - use consolidated items for consistency with recalculated amounts
  const consolidatedBaseItems = groupedConsolidatedItems.Base || [];
  const baseTotalAmount = consolidatedBaseItems.reduce((sum, item) => sum + (item.total_amount || 0), 0);
  const tambahanTotalAmount = (groupedConsolidatedItems.Tambahan || []).reduce((sum, item) => sum + (item.total_amount || 0), 0);
  const overtimeTotalAmount = (groupedConsolidatedItems.Overtime || []).reduce((sum, item) => sum + (item.total_amount || 0), 0);

  // Detect predominant rate unit for Base items (Hour vs Bag) - use consolidated items
  const bagBasedItems = consolidatedBaseItems.filter(item => item.rate_unit === 'Bag');
  const hourBasedItems = consolidatedBaseItems.filter(item => item.rate_unit === 'Hour');
  const isBagBased = bagBasedItems.length > hourBasedItems.length;
  const rateUnitLabel = isBagBased ? 'Bag' : 'Jam';

  // Leave records
  const groupedLeaveRecords = (individualJob.leave_records || []).reduce((acc, record) => {
    const leaveType = record.leave_type;
    if (!acc[leaveType]) {
      acc[leaveType] = { leave_type: leaveType, total_days: 0, total_amount: 0 };
    }
    acc[leaveType].total_days += record.days_taken;
    acc[leaveType].total_amount += record.amount_paid;
    return acc;
  }, {} as Record<string, { leave_type: string; total_days: number; total_amount: number }>);
  const leaveRecordsArray: { leave_type: string; total_days: number; total_amount: number }[] = Object.values(groupedLeaveRecords);
  const leaveTotalAmount = leaveRecordsArray.reduce((sum, record) => sum + (record.total_amount || 0), 0);

  // Commission records
  const commissionRecords = individualJob.commission_records || [];
  const commissionTotalAmount = commissionRecords.reduce((sum, record) => sum + (record.amount || 0), 0);
  const combinedTambahanTotal = tambahanTotalAmount + leaveTotalAmount + commissionTotalAmount;

  // Calculate effective hourly rate (total amount / hours worked)
  // Note: When a worker performs multiple tasks during the same hours, each task shows the same quantity
  // So we use the first item's quantity (or most common) as the actual hours worked, not the sum
  const hourBasedItemsForRate = consolidatedBaseItems.filter(item => item.rate_unit === 'Hour');
  const representativeHours = hourBasedItemsForRate.length > 0 ? hourBasedItemsForRate[0].total_quantity : 0;
  const averageBaseRate = representativeHours > 0 ? baseTotalAmount / representativeHours : 0;

  // Build table body
  const tableBody: TableCell[][] = [];

  // Header row
  tableBody.push([
    { text: 'Kerja', bold: true, fillColor: '#f0f0f0', fontSize: 9 },
    { text: 'Rate', bold: true, fillColor: '#f0f0f0', alignment: 'right', fontSize: 9 },
    { text: 'Description', bold: true, fillColor: '#f0f0f0', fontSize: 9 },
    { text: 'Amount', bold: true, fillColor: '#f0f0f0', alignment: 'right', fontSize: 9 },
  ]);

  // Base Pay Items - Using consolidated items for cleaner display
  consolidatedBaseItems.forEach(item => {
    const qtyLabel = item.rate_unit === 'Bag'
      ? `${item.total_quantity} Bag${item.total_quantity > 1 ? 's' : ''}`
      : item.rate_unit === 'Hour'
      ? `${item.total_quantity} Jam`
      : `${item.total_quantity} ${item.rate_unit}`;
    tableBody.push(createItemRow(
      item.description,
      item.rate_unit === 'Percent' ? `${item.rate}%` : item.rate.toFixed(2),
      qtyLabel,
      formatCurrency(item.total_amount)
    ));
  });

  // Base subtotal
  if (consolidatedBaseItems.length > 0) {
    tableBody.push([
      { text: '', fillColor: '#f8f9fa', fontSize: 8 },
      { text: '', fillColor: '#f8f9fa', fontSize: 8 },
      { text: `Rate/${rateUnitLabel}: ${averageBaseRate.toFixed(2)}`, bold: true, fillColor: '#f8f9fa', fontSize: 8 },
      { text: formatCurrency(baseTotalAmount), alignment: 'right', bold: true, fillColor: '#f8f9fa', fontSize: 8 },
    ]);
  }

  // Tambahan Items - Using consolidated items
  const consolidatedTambahanItems = groupedConsolidatedItems.Tambahan || [];
  if (consolidatedTambahanItems.length > 0 || leaveRecordsArray.length > 0 || commissionRecords.length > 0) {
    consolidatedTambahanItems.forEach(item => {
      const qtyLabel = item.rate_unit === 'Fixed' ? monthName : `${item.total_quantity} ${item.rate_unit}`;
      tableBody.push(createItemRow(
        item.description,
        item.rate_unit === 'Percent' ? `${item.rate}%` : item.rate.toFixed(2),
        qtyLabel,
        formatCurrency(item.total_amount)
      ));
    });

    commissionRecords.forEach(commission => {
      tableBody.push(createItemRow(commission.description, '', 'Advance', formatCurrency(commission.amount)));
    });

    leaveRecordsArray.forEach(leaveRecord => {
      tableBody.push(createItemRow(
        prettifyLeaveType(leaveRecord.leave_type),
        '',
        `${leaveRecord.total_days} Hari`,
        formatCurrency(leaveRecord.total_amount)
      ));
    });

    // Tambahan subtotal - only show if more than one item total
    const totalTambahanItems = consolidatedTambahanItems.length + leaveRecordsArray.length + commissionRecords.length;
    if (totalTambahanItems > 1) {
      tableBody.push([
        { text: '', fillColor: '#f8f9fa', fontSize: 8 },
        { text: '', fillColor: '#f8f9fa', fontSize: 8 },
        { text: 'Subtotal', bold: true, fillColor: '#f8f9fa', fontSize: 8 },
        { text: formatCurrency(combinedTambahanTotal), alignment: 'right', bold: true, fillColor: '#f8f9fa', fontSize: 8 },
      ]);
    }
  }

  // Overtime Items - Using consolidated items
  const consolidatedOvertimeItems = groupedConsolidatedItems.Overtime || [];
  if (consolidatedOvertimeItems.length > 0) {
    consolidatedOvertimeItems.forEach(item => {
      const qtyLabel = `${item.total_quantity} Jam OT`;
      tableBody.push(createItemRow(
        item.description,
        item.rate_unit === 'Percent' ? `${item.rate}%` : item.rate.toFixed(2),
        qtyLabel,
        formatCurrency(item.total_amount)
      ));
    });

    tableBody.push([
      { text: '', fillColor: '#f8f9fa', fontSize: 8 },
      { text: '', fillColor: '#f8f9fa', fontSize: 8 },
      { text: 'Subtotal', bold: true, fillColor: '#f8f9fa', fontSize: 8 },
      { text: formatCurrency(overtimeTotalAmount), alignment: 'right', bold: true, fillColor: '#f8f9fa', fontSize: 8 },
    ]);
  }

  // Gross Pay
  tableBody.push([
    { text: '', fillColor: '#f8f9fa', fontSize: 8 },
    { text: '', fillColor: '#f8f9fa', fontSize: 8 },
    { text: isGrouped ? `${jobEmployeeId} Gross Pay` : 'Jumlah Gaji Kasar', bold: true, fillColor: '#f8f9fa', fontSize: 8 },
    { text: formatCurrency(individualJob.gross_pay_portion), alignment: 'right', bold: true, fillColor: '#f8f9fa', fontSize: 8 },
  ]);

  // Build content array
  const content: Content[] = [
    // Page break before (except first page)
    { text: '', pageBreak: 'before' },

    // Company name
    { text: companyName, style: 'companyName', margin: [0, 0, 0, 6] },

    // Employee info
    {
      columns: [
        { width: 55, text: 'Employee' },
        { width: 10, text: ':' },
        { width: '*', text: `${staffDetails?.name || payroll.employee_name}${jobEmployeeId ? ` (${jobEmployeeId})` : ''}` },
      ],
      margin: [0, 0, 0, 3],
    },
    {
      columns: [
        { width: 55, text: 'IC No.' },
        { width: 10, text: ':' },
        { width: '*', text: staffDetails?.icNo || 'N/A' },
      ],
      margin: [0, 0, 0, 3],
    },
    {
      columns: [
        { width: 55, text: 'Kerja' },
        { width: 10, text: ':' },
        { width: '*', text: individualJob.job_type },
      ],
      margin: [0, 0, 0, 3],
    },
    {
      columns: [
        { width: 55, text: 'Bahagian' },
        { width: 10, text: ':' },
        { width: '*', text: staffDetails?.section || payroll.section },
      ],
      margin: [0, 0, 0, 5],
    },

    // Payslip title
    {
      text: `Slip Gaji Pajak ${jobEmployeeId ? ` - ${jobEmployeeId}` : ''} Untuk Bulan ${monthName} ${year}${isGrouped ? ` - Kerja ${jobIndex + 1} of ${totalJobs} (Individual Breakdown)` : ''}`,
      style: 'payslipTitle',
      margin: [0, 0, 0, 4],
    },

    // Main table
    {
      table: {
        headerRows: 1,
        dontBreakRows: true,
        widths: ['*', 60, 100, 70],
        body: tableBody,
      },
      layout: {
        hLineWidth: (i: number, node: any) => {
          if (i === 0 || i === node.table.body.length) return 1; // Outer borders
          if (i === 1) return 1; // Below header

          // Check row above the line (row i-1) for border below specific rows
          const prevRow = node.table.body[i - 1];
          if (prevRow && Array.isArray(prevRow)) {
            const descCell = prevRow[2];
            const descText = typeof descCell === 'object' ? descCell.text : descCell;
            // Add border below Rate/ subtotal and Gross Pay rows
            if (typeof descText === 'string' &&
                (descText.includes('Rate/') || descText.includes('Gross Pay') || descText === 'Jumlah Gaji Kasar')) {
              return 0.5;
            }
          }

          // Add thin line above rows with fillColor (subtotals, totals)
          const row = node.table.body[i];
          if (row && Array.isArray(row) && row[0]?.fillColor) {
            return 0.5;
          }
          return 0; // No line for regular rows
        },
        vLineWidth: () => 1,
        hLineColor: () => '#000',
        vLineColor: () => '#000',
        paddingLeft: () => 5,
        paddingRight: () => 5,
        paddingTop: () => 2,
        paddingBottom: () => 2,
      },
    } as ContentTable,

    // Notice
    {
      text: `*** Individual job breakdown - ${isGrouped ? 'No deductions applied to individual jobs' : ''}`,
      style: 'notice',
      margin: [0, 3, 0, 0],
    },

    // Signature section
    {
      columns: [
        { width: '*', text: '' },
        {
          width: 'auto',
          stack: [
            { text: 'RECEIVED BY', alignment: 'right' },
            { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 150, y2: 0, lineWidth: 1 }], margin: [0, 5, 0, 0] },
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
    companyName = 'TIEN HOCK FOOD INDUSTRIES S/B',
    staffDetails,
    midMonthPayroll,
  } = props;

  if (!payroll) {
    console.error('No payroll data available');
    return;
  }

  const year = payroll.year ?? new Date().getFullYear();
  const month = payroll.month ?? new Date().getMonth() + 1;
  const monthName = getMonthName(month);

  // Check if grouped payroll
  const isGroupedPayroll = payroll.job_type && payroll.job_type.includes(', ');
  const individualJobs = isGroupedPayroll ? splitGroupedPayroll(payroll) : [];

  // Build all content
  let allContent: Content[] = [];

  // Main payroll page
  allContent = allContent.concat(
    buildMainPayrollPage(payroll, companyName, staffDetails, midMonthPayroll, year, month, monthName)
  );

  // Individual job pages for grouped payrolls
  if (isGroupedPayroll && individualJobs.length > 0) {
    individualJobs.forEach((job, index) => {
      allContent = allContent.concat(
        buildIndividualJobPage(job, payroll, companyName, staffDetails, year, month, monthName, true, index, individualJobs.length)
      );
    });
  }

  // Document definition
  const docDefinition: TDocumentDefinitions = {
    pageSize: 'A4',
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
  const employeeId = payroll.employee_id || 'unknown';
  const fileName = `PaySlip-${employeeId}-${year}-${month}.pdf`;

  pdfMake.createPdf(docDefinition).download(fileName);
};

// Function to get PDF as blob (for preview or other uses)
export const getPaySlipPDFBlob = (props: PaySlipPDFProps): Promise<Blob> => {
  return new Promise((resolve, reject) => {
    const {
      payroll,
      companyName = 'TIEN HOCK FOOD INDUSTRIES S/B',
      staffDetails,
      midMonthPayroll,
    } = props;

    if (!payroll) {
      reject(new Error('No payroll data available'));
      return;
    }

    const year = payroll.year ?? new Date().getFullYear();
    const month = payroll.month ?? new Date().getMonth() + 1;
    const monthName = getMonthName(month);

    const isGroupedPayroll = payroll.job_type && payroll.job_type.includes(', ');
    const individualJobs = isGroupedPayroll ? splitGroupedPayroll(payroll) : [];

    let allContent: Content[] = [];
    allContent = allContent.concat(
      buildMainPayrollPage(payroll, companyName, staffDetails, midMonthPayroll, year, month, monthName)
    );

    if (isGroupedPayroll && individualJobs.length > 0) {
      individualJobs.forEach((job, index) => {
        allContent = allContent.concat(
          buildIndividualJobPage(job, payroll, companyName, staffDetails, year, month, monthName, true, index, individualJobs.length)
        );
      });
    }

    const docDefinition: TDocumentDefinitions = {
      pageSize: 'A4',
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
  companyName = 'TIEN HOCK FOOD INDUSTRIES S/B',
  midMonthPayrollsMap?: Record<string, MidMonthPayrollType | null>
): Promise<Blob> => {
  return new Promise((resolve, reject) => {
    if (!payrolls || payrolls.length === 0) {
      reject(new Error('No payroll data available'));
      return;
    }

    let allContent: Content[] = [];

    payrolls.forEach((payroll, payrollIndex) => {
      const year = payroll.year ?? new Date().getFullYear();
      const month = payroll.month ?? new Date().getMonth() + 1;
      const monthName = getMonthName(month);
      const staffDetails = staffDetailsMap?.[payroll.employee_id];
      const midMonthPayroll = midMonthPayrollsMap?.[payroll.employee_id];

      const isGroupedPayroll = payroll.job_type && payroll.job_type.includes(', ');
      const individualJobs = isGroupedPayroll ? splitGroupedPayroll(payroll) : [];

      // Add page break before each payroll (except the first)
      if (payrollIndex > 0) {
        allContent.push({ text: '', pageBreak: 'before' });
      }

      // Main payroll page content (without the array wrapper for first item)
      const mainPageContent = buildMainPayrollPage(
        payroll,
        companyName,
        staffDetails,
        midMonthPayroll as MidMonthPayroll | null | undefined,
        year,
        month,
        monthName
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
              individualJobs.length
            )
          );
        });
      }
    });

    const docDefinition: TDocumentDefinitions = {
      pageSize: 'A4',
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
