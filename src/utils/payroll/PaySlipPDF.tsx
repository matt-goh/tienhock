// src/utils/payroll/PaySlipPDF.tsx
import React from "react";
import { Page, Text, View, StyleSheet, Document } from "@react-pdf/renderer";
import { EmployeePayroll, MidMonthPayroll } from "../../types/types";
import { groupItemsByType, getMonthName } from "./payrollUtils";

// Create styles
const styles = StyleSheet.create({
  page: {
    padding: 20,
    fontFamily: "Helvetica",
    fontSize: 9,
    lineHeight: 1.3,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 5,
  },
  companySection: {
    flex: 1,
    marginRight: 15,
  },
  companyName: {
    fontSize: 14,
    fontFamily: "Helvetica-Bold",
    marginBottom: 6,
  },
  employeeInfoTable: {
    marginTop: 5,
  },
  employeeInfoRow: {
    flexDirection: "row",
    marginBottom: 3,
  },
  employeeInfoLabel: {
    width: 55,
  },
  employeeInfoColon: {
    width: 10,
  },
  employeeInfoValue: {
    flex: 1,
  },
  payslipTitle: {
    fontFamily: "Helvetica-Bold",
    marginBottom: 4,
  },
  table: {
    display: "flex",
    borderStyle: "solid",
    borderWidth: 1,
    borderColor: "#000",
  },
  tableHeaderRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#000",
    backgroundColor: "#f0f0f0",
    paddingVertical: 3,
    alignItems: "center",
  },
  tableRow: {
    flexDirection: "row",
  },
  tableColHeader: {
    borderRightWidth: 1,
    borderRightColor: "#000",
    paddingHorizontal: 5,
  },
  tableCol: {
    borderRightWidth: 1,
    borderRightColor: "#000",
    paddingHorizontal: 5,
    paddingTop: 3,
    fontSize: 8,
  },
  descriptionCol: {
    flex: 3,
  },
  rateCol: {
    flex: 1,
    textAlign: "right",
  },
  descriptionNoteCol: {
    flex: 1.5,
    textAlign: "left",
  },
  amountCol: {
    flex: 1,
    textAlign: "right",
  },
  subtotalRow: {
    backgroundColor: "#f8f9fa", // Very light gray background
    borderTopWidth: 0.5,
    borderTopColor: "#000",
    borderBottomWidth: 1,
    borderBottomColor: "#000",
  },
  jumlahGajiKasarRow: {
    borderBottomWidth: 1,
    borderBottomColor: "#000",
  },
  jumlahGajiBersihRow: {
    borderTopWidth: 0.5,
    borderTopColor: "#000",
    borderBottomWidth: 1,
    borderBottomColor: "#000",
  },
  jumlahRow: {
    borderTopWidth: 0.5,
    borderTopColor: "#000",
  },
  grandTotalRow: {
    borderTopWidth: 1,
    borderTopColor: "#000",
    backgroundColor: "#f8f9fa", // Very light gray background
  },
  totalText: {
    fontFamily: "Helvetica-Bold",
  },
  notesSection: {
    marginTop: 3,
    fontSize: 8,
    fontFamily: "Helvetica-Oblique",
  },
  signatureSection: {
    marginTop: 50,
    flexDirection: "row",
  },
  signatureBlock: {
    flex: 1,
  },
  signatureLine: {
    borderBottomWidth: 1,
    borderBottomColor: "#000",
    width: "80%",
    marginBottom: 5,
  },
  jobCategoryRow: {
    flexDirection: "row",
    backgroundColor: "#e8e8e8",
    borderTopWidth: 0.5,
    borderTopColor: "#000",
    borderBottomWidth: 0.5,
    borderBottomColor: "#ccc",
  },
  jobCategoryText: {
    fontFamily: "Helvetica-Bold",
    fontSize: 8,
    paddingVertical: 2,
    paddingLeft: 2,
  },
  jobCategoryTotal: {
    fontFamily: "Helvetica-Bold",
    fontSize: 8,
    paddingVertical: 2,
    textAlign: "right",
    paddingRight: 2,
  },
});

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

interface IndividualJobPayroll {
  job_type: string;
  items: any[];
  leave_records?: any[];
  commission_records?: any[];
  gross_pay_portion: number;
}

// Helper function to check if an item belongs to a specific job (fallback for legacy items without job_type)
const itemBelongsToJobByName = (description: string, payCode: string, jobType: string): boolean => {
  const descLower = (description || '').toLowerCase();
  const payCodeLower = (payCode || '').toLowerCase();
  const jobLower = jobType.toLowerCase();

  // Check if description or pay_code contains the job name
  return descLower.includes(jobLower) || payCodeLower.includes(jobLower);
};

// Helper function to split grouped payroll into individual job payrolls
// Uses the job_type field stored with each payroll item for accurate splitting
const splitGroupedPayroll = (payroll: EmployeePayroll): IndividualJobPayroll[] => {
  // Check if this is a grouped payroll (contains comma-separated job types)
  if (!payroll.job_type || !payroll.job_type.includes(", ")) {
    // Not a grouped payroll, return single job
    return [{
      job_type: payroll.job_type,
      items: payroll.items || [],
      leave_records: payroll.leave_records || [],
      commission_records: payroll.commission_records || [],
      gross_pay_portion: payroll.gross_pay
    }];
  }

  // Split the job types
  const jobTypes = payroll.job_type.split(", ").map(job => job.trim());
  const individualJobs: IndividualJobPayroll[] = [];

  const allItems = payroll.items || [];
  const allLeaveRecords = payroll.leave_records || [];
  const allCommissionRecords = payroll.commission_records || [];

  // For each job type, collect items that belong to that job
  jobTypes.forEach(jobType => {
    // Filter items using the job_type field (primary) or fallback to name matching for legacy items
    const jobItems = allItems.filter(item => {
      // If item has job_type field, use it for accurate matching
      if (item.job_type) {
        return item.job_type === jobType;
      }
      // Fallback for legacy items without job_type: use name matching
      // Items without job_type and no name match are included in all jobs as shared items
      const matchesByName = jobTypes.some(jt => itemBelongsToJobByName(item.description, item.pay_code_id, jt));
      if (!matchesByName) {
        return true; // No job identifier found - include in all job pages
      }
      return itemBelongsToJobByName(item.description, item.pay_code_id, jobType);
    });

    // Leave records - include all since they're tied to the employee, not a specific job
    const jobLeaveRecords = [...allLeaveRecords];

    // Commission records - check for job-specific identifiers
    const jobCommissionRecords = allCommissionRecords.filter(record => {
      const hasJobMatch = jobTypes.some(jt => itemBelongsToJobByName(record.description, '', jt));
      if (!hasJobMatch) {
        return true; // No job identifier found - include in all job pages
      }
      return itemBelongsToJobByName(record.description, '', jobType);
    });

    // Calculate gross pay portion for this job
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

// Individual Job Page Component (without statutory deductions)
const IndividualJobPage: React.FC<{
  individualJob: IndividualJobPayroll;
  payroll: EmployeePayroll;
  companyName: string;
  staffDetails?: any;
  year: number;
  month: number;
  monthName: string;
  isGrouped: boolean;
  jobIndex: number;
  totalJobs: number;
}> = ({
  individualJob,
  payroll,
  companyName,
  staffDetails,
  year,
  month,
  monthName,
  isGrouped,
  jobIndex,
  totalJobs,
}) => {
  const groupedItems = groupItemsByType(individualJob.items || []) || { Base: [], Tambahan: [], Overtime: [] };

  // Get employee-job mapping for displaying which staff ID worked this job
  const employeeJobMapping = payroll.employee_job_mapping || {};

  // Helper function to get employee ID for a given job type (reverse lookup from mapping)
  const getEmployeeIdForJob = (jobType: string): string | null => {
    for (const [employeeId, job] of Object.entries(employeeJobMapping)) {
      if (job === jobType) {
        return employeeId;
      }
    }
    return null;
  };

  // Get the employee ID for this individual job
  const jobEmployeeId = getEmployeeIdForJob(individualJob.job_type);

  // Helper function to group items by hours and maintain order
  const groupItemsByHours = (items: any[]) => {
    const groupsArray: { hours: number; items: any[] }[] = [];
    const groupsMap = new Map<number, any[]>();

    items.forEach((item) => {
      const hours = item.quantity;
      if (!groupsMap.has(hours)) {
        groupsMap.set(hours, []);
      }
      groupsMap.get(hours)!.push(item);
    });

    items.forEach((item) => {
      const hours = item.quantity;
      if (!groupsArray.some((group) => group.hours === hours)) {
        groupsArray.push({
          hours,
          items: groupsMap.get(hours)!,
        });
      }
    });

    return groupsArray;
  };

  // Group base items by hours
  const baseGroupedByHours = groupItemsByHours(groupedItems.Base || []);
  const baseTotalAmount = (groupedItems.Base || []).reduce(
    (sum, item) => sum + (item.amount || 0),
    0
  );
  const baseTotalRates = (groupedItems.Base || []).reduce(
    (sum, item) => sum + (item.rate || 0),
    0
  );

  const tambahanTotalAmount = (groupedItems["Tambahan"] || []).reduce(
    (sum, item) => sum + (item.amount || 0),
    0
  );

  // Group leave records by leave type and sum amounts
  const groupedLeaveRecords = (individualJob.leave_records || []).reduce(
    (acc, record) => {
      const leaveType = record.leave_type;
      if (!acc[leaveType]) {
        acc[leaveType] = {
          leave_type: leaveType,
          total_days: 0,
          total_amount: 0,
        };
      }
      acc[leaveType].total_days += record.days_taken;
      acc[leaveType].total_amount += record.amount_paid;
      return acc;
    },
    {} as Record<
      string,
      { leave_type: string; total_days: number; total_amount: number }
    >
  );

  const leaveRecordsArray: { leave_type: string; total_days: number; total_amount: number }[] = Object.values(groupedLeaveRecords);
  const leaveTotalAmount = leaveRecordsArray.reduce(
    (sum, record) => sum + (record.total_amount || 0),
    0
  );

  // Commission records data
  const commissionRecords = individualJob.commission_records || [];
  const commissionTotalAmount = commissionRecords.reduce(
    (sum, record) => sum + (record.amount || 0),
    0
  );

  const combinedTambahanTotal =
    tambahanTotalAmount + leaveTotalAmount + commissionTotalAmount;

  // Group additional items by hours
  const overtimeGroupedByHours = groupItemsByHours(groupedItems.Overtime || []);
  const overtimeTotalAmount = (groupedItems.Overtime || []).reduce(
    (sum, item) => sum + (item.amount || 0),
    0
  );

  // Find the hour group with the maximum hours (latest/most hours)
  const maxHoursGroup = baseGroupedByHours.length > 0 
    ? baseGroupedByHours.reduce((maxGroup, currentGroup) => {
        return currentGroup.hours > maxGroup.hours ? currentGroup : maxGroup;
      }, baseGroupedByHours[0])
    : null;

  // Calculate rate using the maximum hours group
  const averageBaseRate =
    maxHoursGroup && maxHoursGroup.hours > 0
      ? baseTotalAmount / maxHoursGroup.hours
      : 0;

  // Helper function to format currency
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-MY", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  };

  // Helper function to prettify leave type text
  const prettifyLeaveType = (leaveType: string) => {
    return leaveType
      .split("_")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(" ");
  };

  // Helper function to format description based on rate unit
  const formatDescription = (item: any) => {
    switch (item.rate_unit) {
      case "Hour":
        return `${item.quantity.toFixed(0)} Hour${
          item.quantity > 1 ? "s" : ""
        }`;
      case "Bag":
        return `${item.quantity.toFixed(0)} Bag${item.quantity > 1 ? "s" : ""}`;
      case "Trip":
        return `${item.quantity.toFixed(0)} Trip${
          item.quantity > 1 ? "s" : ""
        }`;
      case "Day":
        return `${item.quantity.toFixed(0)} Day${item.quantity > 1 ? "s" : ""}`;
      case "Percent":
        return `${item.quantity.toFixed(0)} Unit${
          item.quantity > 1 ? "s" : ""
        }`;
      case "Fixed":
        return monthName;
      default:
        return "";
    }
  };

  return (
    <Page size="A4" style={styles.page}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.companySection}>
          <Text style={styles.companyName}>{companyName}</Text>
          {/* Employee Information */}
          <View style={styles.employeeInfoTable}>
            <View style={styles.employeeInfoRow}>
              <Text style={styles.employeeInfoLabel}>Employee</Text>
              <Text style={styles.employeeInfoColon}>:</Text>
              <Text style={styles.employeeInfoValue}>
                {staffDetails?.name || payroll.employee_name}{jobEmployeeId ? ` (${jobEmployeeId})` : ''}
              </Text>
            </View>
            <View style={styles.employeeInfoRow}>
              <Text style={styles.employeeInfoLabel}>IC No.</Text>
              <Text style={styles.employeeInfoColon}>:</Text>
              <Text style={styles.employeeInfoValue}>
                {staffDetails?.icNo || "N/A"}
              </Text>
            </View>
            <View style={styles.employeeInfoRow}>
              <Text style={styles.employeeInfoLabel}>Kerja</Text>
              <Text style={styles.employeeInfoColon}>:</Text>
              <Text style={styles.employeeInfoValue}>
                {individualJob.job_type}
              </Text>
            </View>
            <View style={[styles.employeeInfoRow, { marginBottom: 0 }]}>
              <Text style={styles.employeeInfoLabel}>Bahagian</Text>
              <Text style={styles.employeeInfoColon}>:</Text>
              <Text style={styles.employeeInfoValue}>
                {staffDetails?.section || payroll.section}
              </Text>
            </View>
          </View>
        </View>
      </View>

      {/* Pay Slip Title */}
      <Text style={styles.payslipTitle}>
        Slip Gaji Pajak {jobEmployeeId ? ` - ${jobEmployeeId}` : ''} Untuk Bulan {monthName} {year}
        {isGrouped && ` - Kerja ${jobIndex + 1} of ${totalJobs} (Individual Breakdown)`}
      </Text>

      {/* Main Table */}
      <View style={styles.table}>
        {/* Table Header */}
        <View style={styles.tableHeaderRow}>
          <View style={[styles.tableColHeader, styles.descriptionCol]}>
            <Text>Kerja</Text>
          </View>
          <View style={[styles.tableColHeader, styles.rateCol]}>
            <Text>Rate</Text>
          </View>
          <View style={[styles.tableColHeader, styles.descriptionNoteCol]}>
            <Text>Description</Text>
          </View>
          <View
            style={[
              styles.tableColHeader,
              styles.amountCol,
              { borderRightWidth: 0 },
            ]}
          >
            <Text>Amount</Text>
          </View>
        </View>

        {/* Base Pay Items - Grouped by hours */}
        {baseGroupedByHours.map((group, groupIndex) =>
          group.items.map((item, itemIndex) => (
            <View
              key={`base-${group.hours}-${itemIndex}`}
              style={styles.tableRow}
              wrap={false}
            >
              <View style={[styles.tableCol, styles.descriptionCol]}>
                <View style={{ height: 12, overflow: "hidden" }}>
                  <Text>{item.description}</Text>
                </View>
              </View>
              <View style={[styles.tableCol, styles.rateCol]}>
                <Text>
                  {item.rate_unit === "Percent"
                    ? `${item.rate}%`
                    : item.rate.toFixed(2)}
                </Text>
              </View>
              <View style={[styles.tableCol, styles.descriptionNoteCol]}>
                <Text>{itemIndex === 0 ? `${group.hours} Jam` : ""}</Text>
              </View>
              <View
                style={[
                  styles.tableCol,
                  styles.amountCol,
                  { borderRightWidth: 0 },
                ]}
              >
                <Text>{formatCurrency(item.amount)}</Text>
              </View>
            </View>
          ))
        )}

        {/* Base Pay Subtotal Row */}
        {(groupedItems.Base && groupedItems.Base.length > 0) && (
          <View style={[styles.tableRow, styles.subtotalRow]} wrap={false}>
            <View style={[styles.tableCol, styles.descriptionCol]}>
              <Text></Text>
            </View>
            <View style={[styles.tableCol, styles.rateCol]}>
              <Text style={{ fontFamily: "Helvetica-Bold" }}>
                {baseTotalRates.toFixed(2)}
              </Text>
            </View>
            <View style={[styles.tableCol, styles.descriptionNoteCol]}>
              <Text style={{ fontFamily: "Helvetica-Bold" }}>
                Rate/Jam : {averageBaseRate.toFixed(2)}
              </Text>
            </View>
            <View
              style={[
                styles.tableCol,
                styles.amountCol,
                { borderRightWidth: 0 },
              ]}
            >
              <Text style={{ fontFamily: "Helvetica-Bold" }}>
                {formatCurrency(baseTotalAmount)}
              </Text>
            </View>
          </View>
        )}

        {/* Tambahan Pay Items */}
        {((groupedItems["Tambahan"] && groupedItems["Tambahan"].length > 0) ||
          leaveRecordsArray.length > 0 ||
          commissionRecords.length > 0) && (
          <>
            {/* Tambahan Items */}
            {(groupedItems["Tambahan"] || []).map((item, index) => (
              <View key={`tambahan-${index}`} style={styles.tableRow} wrap={false}>
                <View style={[styles.tableCol, styles.descriptionCol]}>
                  <View style={{ height: 12, overflow: "hidden" }}>
                    <Text>{item.description}</Text>
                  </View>
                </View>
                <View style={[styles.tableCol, styles.rateCol]}>
                  <Text>
                    {item.rate_unit === "Percent"
                      ? `${item.rate}%`
                      : item.rate.toFixed(2)}
                  </Text>
                </View>
                <View style={[styles.tableCol, styles.descriptionNoteCol]}>
                  <Text>{formatDescription(item)}</Text>
                </View>
                <View
                  style={[
                    styles.tableCol,
                    styles.amountCol,
                    { borderRightWidth: 0 },
                  ]}
                >
                  <Text>{formatCurrency(item.amount)}</Text>
                </View>
              </View>
            ))}

            {/* Commission Records in Tambahan Section */}
            {commissionRecords.map((commission, index) => (
              <View
                key={`tambahan-commission-${index}`}
                style={styles.tableRow}
                wrap={false}
              >
                <View style={[styles.tableCol, styles.descriptionCol]}>
                  <View style={{ height: 12, overflow: "hidden" }}>
                    <Text>{commission.description}</Text>
                  </View>
                </View>
                <View style={[styles.tableCol, styles.rateCol]}>
                  <Text></Text>
                </View>
                <View style={[styles.tableCol, styles.descriptionNoteCol]}>
                  <Text>Advance</Text>
                </View>
                <View
                  style={[
                    styles.tableCol,
                    styles.amountCol,
                    { borderRightWidth: 0 },
                  ]}
                >
                  <Text>{formatCurrency(commission.amount)}</Text>
                </View>
              </View>
            ))}

            {/* Leave Records */}
            {leaveRecordsArray.map((leaveRecord: any, index) => (
              <View key={`leave-${index}`} style={styles.tableRow} wrap={false}>
                <View style={[styles.tableCol, styles.descriptionCol]}>
                  <View style={{ height: 12, overflow: "hidden" }}>
                    <Text>{prettifyLeaveType(leaveRecord.leave_type)}</Text>
                  </View>
                </View>
                <View style={[styles.tableCol, styles.rateCol]}>
                  <Text></Text>
                </View>
                <View style={[styles.tableCol, styles.descriptionNoteCol]}>
                  <Text>{leaveRecord.total_days} Hari</Text>
                </View>
                <View
                  style={[
                    styles.tableCol,
                    styles.amountCol,
                    { borderRightWidth: 0 },
                  ]}
                >
                  <Text>{formatCurrency(leaveRecord.total_amount)}</Text>
                </View>
              </View>
            ))}

            {/* Tambahan Subtotal Row */}
            <View style={[styles.tableRow, styles.subtotalRow]} wrap={false}>
              <View style={[styles.tableCol, styles.descriptionCol]}>
                <Text></Text>
              </View>
              <View style={[styles.tableCol, styles.rateCol]}>
                <Text></Text>
              </View>
              <View style={[styles.tableCol, styles.descriptionNoteCol]}>
                <Text style={{ fontFamily: "Helvetica-Bold" }}>Subtotal</Text>
              </View>
              <View
                style={[
                  styles.tableCol,
                  styles.amountCol,
                  { borderRightWidth: 0 },
                ]}
              >
                <Text style={{ fontFamily: "Helvetica-Bold" }}>
                  {formatCurrency(combinedTambahanTotal)}
                </Text>
              </View>
            </View>
          </>
        )}

        {/* Overtime Pay Items */}
        {(groupedItems.Overtime && groupedItems.Overtime.length > 0) && (
          <>
            {/* Overtime Items - Grouped by hours */}
            {overtimeGroupedByHours.map((group, groupIndex) =>
              group.items.map((item, itemIndex) => (
                <View
                  key={`overtime-${group.hours}-${itemIndex}`}
                  style={styles.tableRow}
                  wrap={false}
                >
                  <View style={[styles.tableCol, styles.descriptionCol]}>
                    <View style={{ height: 12, overflow: "hidden" }}>
                      <Text>{item.description}</Text>
                    </View>
                  </View>
                  <View style={[styles.tableCol, styles.rateCol]}>
                    <Text>
                      {item.rate_unit === "Percent"
                        ? `${item.rate}%`
                        : item.rate.toFixed(2)}
                    </Text>
                  </View>
                  <View style={[styles.tableCol, styles.descriptionNoteCol]}>
                    <Text>
                      {itemIndex === 0 ? `${group.hours} Jam OT` : ""}
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.tableCol,
                      styles.amountCol,
                      { borderRightWidth: 0 },
                    ]}
                  >
                    <Text>{formatCurrency(item.amount)}</Text>
                  </View>
                </View>
              ))
            )}

            {/* Overtime Subtotal Row */}
            {(groupedItems.Overtime && groupedItems.Overtime.length > 0) && (
              <View style={[styles.tableRow, styles.subtotalRow]} wrap={false}>
                <View style={[styles.tableCol, styles.descriptionCol]}>
                  <Text></Text>
                </View>
                <View style={[styles.tableCol, styles.rateCol]}>
                  <Text style={{ fontFamily: "Helvetica-Bold" }}>
                    {(groupedItems.Overtime || []).reduce(
                      (sum, item) => sum + (item.rate || 0),
                      0
                    ).toFixed(2)}
                  </Text>
                </View>
                <View style={[styles.tableCol, styles.descriptionNoteCol]}>
                  <Text style={{ fontFamily: "Helvetica-Bold" }}>Subtotal</Text>
                </View>
                <View
                  style={[
                    styles.tableCol,
                    styles.amountCol,
                    { borderRightWidth: 0 },
                  ]}
                >
                  <Text style={{ fontFamily: "Helvetica-Bold" }}>
                    {formatCurrency(overtimeTotalAmount)}
                  </Text>
                </View>
              </View>
            )}
          </>
        )}

        {/* Job Gross Pay Row (without deductions for individual job pages) */}
        <View style={[styles.tableRow, styles.grandTotalRow, { borderTopWidth: 0.5 }]} wrap={false}>
          <View style={[styles.tableCol, styles.descriptionCol]}>
            <Text></Text>
          </View>
          <View style={[styles.tableCol, styles.rateCol]}>
            <Text></Text>
          </View>
          <View style={[styles.tableCol, styles.descriptionNoteCol]}>
            <Text style={styles.totalText}>
              {isGrouped ? `${jobEmployeeId} Gross Pay` : "Jumlah Gaji Kasar"}
            </Text>
          </View>
          <View
            style={[styles.tableCol, styles.amountCol, { borderRightWidth: 0 }]}
          >
            <Text style={styles.totalText}>
              {formatCurrency(individualJob.gross_pay_portion)}
            </Text>
          </View>
        </View>
      </View>

      {/* Footer Section - Notice and Signature grouped together to prevent separation */}
      <View wrap={false}>
        <View style={styles.notesSection}>
          <Text>
            *** Individual job breakdown - {isGrouped ? "No deductions applied to individual jobs" : ""}
          </Text>
        </View>

        {/* Signature Section */}
        <View style={styles.signatureSection}>
          <View style={styles.signatureBlock}></View>
          <View style={styles.signatureBlock}>
            <Text style={{ textAlign: "right" }}>RECEIVED BY</Text>
            <View style={[styles.signatureLine, { marginLeft: "auto" }]}></View>
          </View>
        </View>
      </View>
    </Page>
  );
};

const PaySlipPDF: React.FC<PaySlipPDFProps> = ({
  payroll,
  companyName = "TIEN HOCK FOOD INDUSTRIES S/B",
  staffDetails,
  midMonthPayroll,
}) => {
  // Safety check
  if (!payroll) {
    return (
      <Page size="A4" style={styles.page}>
        <Text>No payroll data available</Text>
      </Page>
    );
  }

  const year = payroll.year ?? new Date().getFullYear();
  const month = payroll.month ?? new Date().getMonth() + 1;
  const monthName = getMonthName(month);

  // Check if this is a grouped payroll
  const isGrouped = payroll.job_type && payroll.job_type.includes(", ");
  
  try {
    if (isGrouped) {
      // For grouped payrolls, generate multiple pages: main combined page + individual job pages
      const individualJobs = splitGroupedPayroll(payroll);
      
      return (
        <>
          {/* Main combined payroll page (existing functionality) */}
          <MainPayrollPage
            payroll={payroll}
            companyName={companyName}
            staffDetails={staffDetails}
            midMonthPayroll={midMonthPayroll}
            year={year}
            month={month}
            monthName={monthName}
          />
          
          {/* Individual job pages (without deductions) - only render if job has items */}
          {individualJobs
            .filter(job =>
              job.items.length > 0 ||
              (job.leave_records?.length || 0) > 0 ||
              (job.commission_records?.length || 0) > 0
            )
            .map((individualJob, index) => (
              <IndividualJobPage
                key={`individual-job-${index}`}
                individualJob={individualJob}
                payroll={payroll}
                companyName={companyName}
                staffDetails={staffDetails}
                year={year}
                month={month}
                monthName={monthName}
                isGrouped={true}
                jobIndex={index}
                totalJobs={individualJobs.length}
              />
            ))}
        </>
      );
    } else {
      // For single job payrolls, return single page
      return (
        <MainPayrollPage
          payroll={payroll}
          companyName={companyName}
          staffDetails={staffDetails}
          midMonthPayroll={midMonthPayroll}
          year={year}
          month={month}
          monthName={monthName}
        />
      );
    }
  } catch (error) {
    console.error('PDF generation error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return (
      <Page size="A4" style={styles.page}>
        <Text>Error generating PDF: {errorMessage}</Text>
        <Text>Employee: {payroll.employee_name || "Unknown"}</Text>
        <Text>Job Type: {payroll.job_type || "Unknown"}</Text>
      </Page>
    );
  }
};

// Main combined payroll page component (original functionality)
const MainPayrollPage: React.FC<{
  payroll: EmployeePayroll;
  companyName: string;
  staffDetails?: any;
  midMonthPayroll?: MidMonthPayroll | null;
  year: number;
  month: number;
  monthName: string;
}> = ({
  payroll,
  companyName,
  staffDetails,
  midMonthPayroll,
  year,
  month,
  monthName,
}) => {
  const groupedItems = groupItemsByType(payroll.items || []) || { Base: [], Tambahan: [], Overtime: [] };

  // Check if this is a grouped payroll (multiple jobs)
  const isGroupedPayroll = payroll.job_type && payroll.job_type.includes(", ");
  const jobTypes = isGroupedPayroll ? payroll.job_type.split(", ").map(job => job.trim()) : [payroll.job_type];

  // Get employee-job mapping for accurate item attribution
  const employeeJobMapping = payroll.employee_job_mapping || {};

  // Helper function to determine which job an item belongs to
  const getItemJobType = (item: any): string | null => {
    // First priority: use source_employee_id with employee_job_mapping for most accurate tracking
    if (item.source_employee_id && employeeJobMapping[item.source_employee_id]) {
      const mappedJobType = employeeJobMapping[item.source_employee_id];
      if (jobTypes.includes(mappedJobType)) {
        return mappedJobType;
      }
    }

    // Second priority: check if item has job_type field (set by backend)
    if (item.job_type) {
      // Verify it's one of the valid job types for this payroll
      if (jobTypes.includes(item.job_type)) {
        return item.job_type;
      }
    }

    // Fallback: check description/pay_code for job name (legacy items)
    const descLower = (item.description || '').toLowerCase();
    const payCodeLower = (item.pay_code_id || '').toLowerCase();

    for (const jobType of jobTypes) {
      const jobLower = jobType.toLowerCase();
      if (descLower.includes(jobLower) || payCodeLower.includes(jobLower)) {
        return jobType;
      }
    }
    return null; // Shared/unassigned item
  };

  // Helper function to get employee ID for a given job type (reverse lookup from mapping)
  const getEmployeeIdForJob = (jobType: string): string | null => {
    for (const [employeeId, job] of Object.entries(employeeJobMapping)) {
      if (job === jobType) {
        return employeeId;
      }
    }
    return null;
  };

  // Group items by job type for display with category headers
  const groupItemsByJobType = (items: any[]): { jobType: string | null; items: any[] }[] => {
    if (!isGroupedPayroll) {
      return [{ jobType: null, items }];
    }

    const jobGroups: { jobType: string | null; items: any[] }[] = [];
    const itemsByJob = new Map<string | null, any[]>();

    items.forEach(item => {
      const jobType = getItemJobType(item);
      if (!itemsByJob.has(jobType)) {
        itemsByJob.set(jobType, []);
      }
      itemsByJob.get(jobType)!.push(item);
    });

    // Add job-specific items first (in order of job types)
    jobTypes.forEach(jobType => {
      const jobItems = itemsByJob.get(jobType);
      if (jobItems && jobItems.length > 0) {
        jobGroups.push({ jobType, items: jobItems });
      }
    });

    // Add shared items last
    const sharedItems = itemsByJob.get(null);
    if (sharedItems && sharedItems.length > 0) {
      jobGroups.push({ jobType: null, items: sharedItems });
    }

    return jobGroups;
  };

  // Helper function to group items by hours and maintain order
  const groupItemsByHours = (items: any[]) => {
    const groupsArray: { hours: number; items: any[] }[] = [];
    const groupsMap = new Map<number, any[]>();

    // First pass: group items by hours
    items.forEach((item) => {
      const hours = item.quantity;
      if (!groupsMap.has(hours)) {
        groupsMap.set(hours, []);
      }
      groupsMap.get(hours)!.push(item);
    });

    // Convert to array format maintaining the order of first appearance
    items.forEach((item) => {
      const hours = item.quantity;
      if (!groupsArray.some((group) => group.hours === hours)) {
        groupsArray.push({
          hours,
          items: groupsMap.get(hours)!,
        });
      }
    });

    return groupsArray;
  };

  // Group items by job type for categorized display
  const baseItemsByJob = groupItemsByJobType(groupedItems.Base || []);
  const tambahanItemsByJob = groupItemsByJobType(groupedItems.Tambahan || []);
  const overtimeItemsByJob = groupItemsByJobType(groupedItems.Overtime || []);

  // Group base items by hours
  const baseGroupedByHours = groupItemsByHours(groupedItems.Base || []);
  const baseTotalAmount = (groupedItems.Base || []).reduce(
    (sum, item) => sum + (item.amount || 0),
    0
  );
  const baseTotalRates = (groupedItems.Base || []).reduce(
    (sum, item) => sum + (item.rate || 0),
    0
  );

  const tambahanTotalAmount = (groupedItems["Tambahan"] || []).reduce(
    (sum, item) => sum + (item.amount || 0),
    0
  );

  // Group leave records by leave type and sum amounts
  const groupedLeaveRecords = (payroll.leave_records || []).reduce(
    (acc, record) => {
      const leaveType = record.leave_type;
      if (!acc[leaveType]) {
        acc[leaveType] = {
          leave_type: leaveType,
          total_days: 0,
          total_amount: 0,
        };
      }
      acc[leaveType].total_days += record.days_taken;
      acc[leaveType].total_amount += record.amount_paid;
      return acc;
    },
    {} as Record<
      string,
      { leave_type: string; total_days: number; total_amount: number }
    >
  );

  const leaveRecordsArray: { leave_type: string; total_days: number; total_amount: number }[] = Object.values(groupedLeaveRecords);

  const leaveTotalAmount = leaveRecordsArray.reduce(
    (sum, record) => sum + (record.total_amount || 0),
    0
  );

  // Commission records data
  const commissionRecords = payroll.commission_records || [];
  const commissionTotalAmount = commissionRecords.reduce(
    (sum, record) => sum + record.amount,
    0
  );

  const combinedTambahanTotal =
    tambahanTotalAmount + leaveTotalAmount + commissionTotalAmount;

  // Calculate overtime total
  const overtimeTotalAmount = (groupedItems.Overtime || []).reduce(
    (sum, item) => sum + (item.amount || 0),
    0
  );

  // Find the hour group with the maximum hours (latest/most hours)
  const maxHoursGroup = baseGroupedByHours.length > 0
    ? baseGroupedByHours.reduce((maxGroup, currentGroup) => {
        return currentGroup.hours > maxGroup.hours ? currentGroup : maxGroup;
      }, baseGroupedByHours[0])
    : null;

  // Calculate rate using the maximum hours group
  const averageBaseRate =
    maxHoursGroup && maxHoursGroup.hours > 0
      ? baseTotalAmount / maxHoursGroup.hours
      : 0;

  const midMonthPayment = midMonthPayroll ? midMonthPayroll.amount : 0;

  // Calculate additional deduction for MAINTEN job type (Cuti Tahunan in commission deduction)
  const isMainten = payroll.job_type === "MAINTEN" || payroll.job_type?.includes("MAINTEN");
  const cutiTahunanRecords = leaveRecordsArray.filter(
    (record) => record.leave_type === "cuti_tahunan"
  );
  const cutiTahunanAmount = cutiTahunanRecords.reduce(
    (sum, record) => sum + record.total_amount,
    0
  );
  const additionalMaintenDeduction = isMainten ? cutiTahunanAmount : 0;

  // Final payment - subtract mid-month payment and additional MAINTEN deduction
  const finalPayment =
    payroll.net_pay - midMonthPayment - additionalMaintenDeduction;

  // Helper function to format currency
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-MY", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  };

  // Helper function to prettify leave type text
  const prettifyLeaveType = (leaveType: string) => {
    return leaveType
      .split("_")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(" ");
  };

  // Helper function to format description based on rate unit
  const formatDescription = (item: any) => {
    switch (item.rate_unit) {
      case "Hour":
        return `${item.quantity.toFixed(0)} Hour${
          item.quantity > 1 ? "s" : ""
        }`;
      case "Bag":
        return `${item.quantity.toFixed(0)} Bag${item.quantity > 1 ? "s" : ""}`;
      case "Trip":
        return `${item.quantity.toFixed(0)} Trip${
          item.quantity > 1 ? "s" : ""
        }`;
      case "Day":
        return `${item.quantity.toFixed(0)} Day${item.quantity > 1 ? "s" : ""}`;
      case "Percent":
        return `${item.quantity.toFixed(0)} Unit${
          item.quantity > 1 ? "s" : ""
        }`;
      case "Fixed":
        return monthName;
      default:
        return "";
    }
  };

  // Helper function to format employee job mapping display
  const formatEmployeeJobMapping = () => {
    if (payroll.employee_job_mapping && Object.keys(payroll.employee_job_mapping).length > 0) {
      return ` (${Object.entries(payroll.employee_job_mapping)
        .map(([empId, jobType]) => `${empId} - ${jobType}`)
        .join(', ')})`;
    }
    return ` (${payroll.employee_id})`;
  };

  return (
    <Page size="A4" style={styles.page}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.companySection}>
          <Text style={styles.companyName}>{companyName}</Text>
          {/* Employee Information */}
          <View style={styles.employeeInfoTable}>
            <View style={styles.employeeInfoRow}>
              <Text style={styles.employeeInfoLabel}>Employee</Text>
              <Text style={styles.employeeInfoColon}>:</Text>
              <Text style={styles.employeeInfoValue}>
                {staffDetails?.name || payroll.employee_name}
              </Text>
            </View>
            <View style={styles.employeeInfoRow}>
              <Text style={styles.employeeInfoLabel}>IC No.</Text>
              <Text style={styles.employeeInfoColon}>:</Text>
              <Text style={styles.employeeInfoValue}>
                {staffDetails?.icNo || "N/A"}
              </Text>
            </View>
            <View style={styles.employeeInfoRow}>
              <Text style={styles.employeeInfoLabel}>Kerja</Text>
              <Text style={styles.employeeInfoColon}>:</Text>
              <Text style={styles.employeeInfoValue}>
                {staffDetails?.jobName || payroll.job_type}
              </Text>
            </View>
            <View style={[styles.employeeInfoRow, { marginBottom: 0 }]}>
              <Text style={styles.employeeInfoLabel}>Bahagian</Text>
              <Text style={styles.employeeInfoColon}>:</Text>
              <Text style={styles.employeeInfoValue}>
                {staffDetails?.section || payroll.section}
              </Text>
            </View>
          </View>
        </View>
      </View>

      {/* Pay Slip Title - Now separate from header */}
      <Text style={styles.payslipTitle}>
        Slip Gaji Pajak (Jam/Bag/{commissionRecords.length > 0
          ? commissionRecords.map(record => record.description).join('/')
          : 'Commission'
        }) Untuk Bulan {monthName} {year}
      </Text>

      {/* Main Table */}
      <View style={styles.table}>
        {/* Table Header */}
        <View style={styles.tableHeaderRow}>
          <View style={[styles.tableColHeader, styles.descriptionCol]}>
            <Text>Kerja</Text>
          </View>
          <View style={[styles.tableColHeader, styles.rateCol]}>
            <Text>Rate</Text>
          </View>
          <View style={[styles.tableColHeader, styles.descriptionNoteCol]}>
            <Text>Description</Text>
          </View>
          <View
            style={[
              styles.tableColHeader,
              styles.amountCol,
              { borderRightWidth: 0 },
            ]}
          >
            <Text>Amount</Text>
          </View>
        </View>

        {/* Base Pay Items - Grouped by job type then by hours */}
        {baseItemsByJob.map((jobGroup, jobGroupIndex) => {
          const jobItems = jobGroup.items;
          const jobGroupedByHours = groupItemsByHours(jobItems);
          const jobTotal = jobItems.reduce((sum, item) => sum + (item.amount || 0), 0);

          return (
            <React.Fragment key={`base-job-${jobGroupIndex}`}>
              {/* Job Category Header - only show for grouped payrolls */}
              {isGroupedPayroll && jobGroup.jobType && (
                <View style={styles.jobCategoryRow} wrap={false}>
                  <View style={[styles.tableCol, { flex: 5, borderRightWidth: 0 }]}>
                    <Text style={styles.jobCategoryText}>
                      [ {jobGroup.jobType}{getEmployeeIdForJob(jobGroup.jobType) ? ` (${getEmployeeIdForJob(jobGroup.jobType)})` : ''} ]
                    </Text>
                  </View>
                  <View style={[styles.tableCol, { flex: 1.5, borderRightWidth: 0 }]}>
                    <Text style={styles.jobCategoryTotal}>
                      {formatCurrency(jobTotal)}
                    </Text>
                  </View>
                </View>
              )}
              {/* Shared items header */}
              {isGroupedPayroll && !jobGroup.jobType && jobItems.length > 0 && (
                <View style={styles.jobCategoryRow} wrap={false}>
                  <View style={[styles.tableCol, { flex: 5, borderRightWidth: 0 }]}>
                    <Text style={styles.jobCategoryText}>
                      [ Shared ]
                    </Text>
                  </View>
                  <View style={[styles.tableCol, { flex: 1.5, borderRightWidth: 0 }]}>
                    <Text style={styles.jobCategoryTotal}>
                      {formatCurrency(jobTotal)}
                    </Text>
                  </View>
                </View>
              )}
              {/* Items for this job */}
              {jobGroupedByHours.map((group, groupIndex) =>
                group.items.map((item, itemIndex) => (
                  <View
                    key={`base-${jobGroupIndex}-${group.hours}-${itemIndex}`}
                    style={styles.tableRow}
                    wrap={false}
                  >
                    <View style={[styles.tableCol, styles.descriptionCol]}>
                      <View style={{ height: 12, overflow: "hidden" }}>
                        <Text>{item.description}</Text>
                      </View>
                    </View>
                    <View style={[styles.tableCol, styles.rateCol]}>
                      <Text>
                        {item.rate_unit === "Percent"
                          ? `${item.rate}%`
                          : item.rate.toFixed(2)}
                      </Text>
                    </View>
                    <View style={[styles.tableCol, styles.descriptionNoteCol]}>
                      <Text>{itemIndex === 0 ? `${group.hours} Jam` : ""}</Text>
                    </View>
                    <View
                      style={[
                        styles.tableCol,
                        styles.amountCol,
                        { borderRightWidth: 0 },
                      ]}
                    >
                      <Text>{formatCurrency(item.amount)}</Text>
                    </View>
                  </View>
                ))
              )}
            </React.Fragment>
          );
        })}

        {/* Base Pay Subtotal Row */}
        {(groupedItems.Base && groupedItems.Base.length > 0) && (
          <View style={[styles.tableRow, styles.subtotalRow]} wrap={false}>
            <View style={[styles.tableCol, styles.descriptionCol]}>
              <Text></Text>
            </View>
            <View style={[styles.tableCol, styles.rateCol]}>
              <Text style={{ fontFamily: "Helvetica-Bold" }}>
                {baseTotalRates.toFixed(2)}
              </Text>
            </View>
            <View style={[styles.tableCol, styles.descriptionNoteCol]}>
              <Text style={{ fontFamily: "Helvetica-Bold" }}>
                Rate/Jam : {averageBaseRate.toFixed(2)}
              </Text>
            </View>
            <View
              style={[
                styles.tableCol,
                styles.amountCol,
                { borderRightWidth: 0 },
              ]}
            >
              <Text style={{ fontFamily: "Helvetica-Bold" }}>
                {formatCurrency(baseTotalAmount)}
              </Text>
            </View>
          </View>
        )}

        {/* Tambahan Pay Items */}
        {((groupedItems["Tambahan"] && groupedItems["Tambahan"].length > 0) ||
          leaveRecordsArray.length > 0 ||
          commissionRecords.length > 0) && (
          <>
            {/* Tambahan Items - Grouped by job type */}
            {tambahanItemsByJob.map((jobGroup, jobGroupIndex) => {
              const tambahanJobTotal = jobGroup.items.reduce((sum, item) => sum + (item.amount || 0), 0);
              return (
              <React.Fragment key={`tambahan-job-${jobGroupIndex}`}>
                {/* Job Category Header - only show for grouped payrolls with items */}
                {isGroupedPayroll && jobGroup.jobType && jobGroup.items.length > 0 && (
                  <View style={styles.jobCategoryRow} wrap={false}>
                    <View style={[styles.tableCol, { flex: 5, borderRightWidth: 0 }]}>
                      <Text style={styles.jobCategoryText}>
                        [ {jobGroup.jobType}{getEmployeeIdForJob(jobGroup.jobType) ? ` (${getEmployeeIdForJob(jobGroup.jobType)})` : ''} - Tambahan ]
                      </Text>
                    </View>
                    <View style={[styles.tableCol, { flex: 1.5, borderRightWidth: 0 }]}>
                      <Text style={styles.jobCategoryTotal}>
                        {formatCurrency(tambahanJobTotal)}
                      </Text>
                    </View>
                  </View>
                )}
                {/* Shared items header */}
                {isGroupedPayroll && !jobGroup.jobType && jobGroup.items.length > 0 && (
                  <View style={styles.jobCategoryRow} wrap={false}>
                    <View style={[styles.tableCol, { flex: 5, borderRightWidth: 0 }]}>
                      <Text style={styles.jobCategoryText}>
                        [ Shared - Tambahan ]
                      </Text>
                    </View>
                    <View style={[styles.tableCol, { flex: 1.5, borderRightWidth: 0 }]}>
                      <Text style={styles.jobCategoryTotal}>
                        {formatCurrency(tambahanJobTotal)}
                      </Text>
                    </View>
                  </View>
                )}
                {/* Items for this job */}
                {jobGroup.items.map((item, index) => (
                  <View key={`tambahan-${jobGroupIndex}-${index}`} style={styles.tableRow} wrap={false}>
                    <View style={[styles.tableCol, styles.descriptionCol]}>
                      <View style={{ height: 12, overflow: "hidden" }}>
                        <Text>{item.description}</Text>
                      </View>
                    </View>
                    <View style={[styles.tableCol, styles.rateCol]}>
                      <Text>
                        {item.rate_unit === "Percent"
                          ? `${item.rate}%`
                          : item.rate.toFixed(2)}
                      </Text>
                    </View>
                    <View style={[styles.tableCol, styles.descriptionNoteCol]}>
                      <Text>{formatDescription(item)}</Text>
                    </View>
                    <View
                      style={[
                        styles.tableCol,
                        styles.amountCol,
                        { borderRightWidth: 0 },
                      ]}
                    >
                      <Text>{formatCurrency(item.amount)}</Text>
                    </View>
                  </View>
                ))}
              </React.Fragment>
            );
            })}

            {/* Commission Records in Tambahan Section */}
            {commissionRecords.map((commission, index) => (
              <View
                key={`tambahan-commission-${index}`}
                style={styles.tableRow}
                wrap={false}
              >
                <View style={[styles.tableCol, styles.descriptionCol]}>
                  <View style={{ height: 12, overflow: "hidden" }}>
                    <Text>{commission.description}</Text>
                  </View>
                </View>
                <View style={[styles.tableCol, styles.rateCol]}>
                  <Text></Text>
                </View>
                <View style={[styles.tableCol, styles.descriptionNoteCol]}>
                  <Text>Advance</Text>
                </View>
                <View
                  style={[
                    styles.tableCol,
                    styles.amountCol,
                    { borderRightWidth: 0 },
                  ]}
                >
                  <Text>{formatCurrency(commission.amount)}</Text>
                </View>
              </View>
            ))}

            {/* Leave Records */}
            {leaveRecordsArray.map((leaveRecord, index) => (
              <View key={`leave-${index}`} style={styles.tableRow} wrap={false}>
                <View style={[styles.tableCol, styles.descriptionCol]}>
                  <View style={{ height: 12, overflow: "hidden" }}>
                    <Text>{prettifyLeaveType(leaveRecord.leave_type)}</Text>
                  </View>
                </View>
                <View style={[styles.tableCol, styles.rateCol]}>
                  <Text></Text>
                </View>
                <View style={[styles.tableCol, styles.descriptionNoteCol]}>
                  <Text>{leaveRecord.total_days} Hari</Text>
                </View>
                <View
                  style={[
                    styles.tableCol,
                    styles.amountCol,
                    { borderRightWidth: 0 },
                  ]}
                >
                  <Text>{formatCurrency(leaveRecord.total_amount)}</Text>
                </View>
              </View>
            ))}

            {/* Tambahan Subtotal Row */}
            <View style={[styles.tableRow, styles.subtotalRow]} wrap={false}>
              <View style={[styles.tableCol, styles.descriptionCol]}>
                <Text></Text>
              </View>
              <View style={[styles.tableCol, styles.rateCol]}>
                <Text></Text>
              </View>
              <View style={[styles.tableCol, styles.descriptionNoteCol]}>
                <Text style={{ fontFamily: "Helvetica-Bold" }}>Subtotal</Text>
              </View>
              <View
                style={[
                  styles.tableCol,
                  styles.amountCol,
                  { borderRightWidth: 0 },
                ]}
              >
                <Text style={{ fontFamily: "Helvetica-Bold" }}>
                  {formatCurrency(combinedTambahanTotal)}
                </Text>
              </View>
            </View>
          </>
        )}

        {/* Overtime Pay Items - Grouped by job type */}
        {(groupedItems.Overtime && groupedItems.Overtime.length > 0) && (
          <>
            {overtimeItemsByJob.map((jobGroup, jobGroupIndex) => {
              const jobOvertimeGroupedByHours = groupItemsByHours(jobGroup.items);
              const overtimeJobTotal = jobGroup.items.reduce((sum, item) => sum + (item.amount || 0), 0);

              return (
                <React.Fragment key={`overtime-job-${jobGroupIndex}`}>
                  {/* Job Category Header - only show for grouped payrolls with items */}
                  {isGroupedPayroll && jobGroup.jobType && jobGroup.items.length > 0 && (
                    <View style={styles.jobCategoryRow} wrap={false}>
                      <View style={[styles.tableCol, { flex: 5, borderRightWidth: 0 }]}>
                        <Text style={styles.jobCategoryText}>
                          [ {jobGroup.jobType}{getEmployeeIdForJob(jobGroup.jobType) ? ` (${getEmployeeIdForJob(jobGroup.jobType)})` : ''} - OT ]
                        </Text>
                      </View>
                      <View style={[styles.tableCol, { flex: 1.5, borderRightWidth: 0 }]}>
                        <Text style={styles.jobCategoryTotal}>
                          {formatCurrency(overtimeJobTotal)}
                        </Text>
                      </View>
                    </View>
                  )}
                  {/* Shared items header */}
                  {isGroupedPayroll && !jobGroup.jobType && jobGroup.items.length > 0 && (
                    <View style={styles.jobCategoryRow} wrap={false}>
                      <View style={[styles.tableCol, { flex: 5, borderRightWidth: 0 }]}>
                        <Text style={styles.jobCategoryText}>
                          [ Shared - OT ]
                        </Text>
                      </View>
                      <View style={[styles.tableCol, { flex: 1.5, borderRightWidth: 0 }]}>
                        <Text style={styles.jobCategoryTotal}>
                          {formatCurrency(overtimeJobTotal)}
                        </Text>
                      </View>
                    </View>
                  )}
                  {/* Items for this job */}
                  {jobOvertimeGroupedByHours.map((group) =>
                    group.items.map((item, itemIndex) => (
                      <View
                        key={`overtime-${jobGroupIndex}-${group.hours}-${itemIndex}`}
                        style={styles.tableRow}
                        wrap={false}
                      >
                        <View style={[styles.tableCol, styles.descriptionCol]}>
                          <View style={{ height: 12, overflow: "hidden" }}>
                            <Text>{item.description}</Text>
                          </View>
                        </View>
                        <View style={[styles.tableCol, styles.rateCol]}>
                          <Text>
                            {item.rate_unit === "Percent"
                              ? `${item.rate}%`
                              : item.rate.toFixed(2)}
                          </Text>
                        </View>
                        <View style={[styles.tableCol, styles.descriptionNoteCol]}>
                          <Text>
                            {itemIndex === 0 ? `${group.hours} Jam OT` : ""}
                          </Text>
                        </View>
                        <View
                          style={[
                            styles.tableCol,
                            styles.amountCol,
                            { borderRightWidth: 0 },
                          ]}
                        >
                          <Text>{formatCurrency(item.amount)}</Text>
                        </View>
                      </View>
                    ))
                  )}
                </React.Fragment>
              );
            })}

            {/* Overtime Subtotal Row */}
            <View style={[styles.tableRow, styles.subtotalRow]} wrap={false}>
              <View style={[styles.tableCol, styles.descriptionCol]}>
                <Text></Text>
              </View>
              <View style={[styles.tableCol, styles.rateCol]}>
                <Text style={{ fontFamily: "Helvetica-Bold" }}>
                  {(groupedItems.Overtime || []).reduce(
                    (sum, item) => sum + (item.rate || 0),
                    0
                  ).toFixed(2)}
                </Text>
              </View>
              <View style={[styles.tableCol, styles.descriptionNoteCol]}>
                <Text style={{ fontFamily: "Helvetica-Bold" }}>Subtotal</Text>
              </View>
              <View
                style={[
                  styles.tableCol,
                  styles.amountCol,
                  { borderRightWidth: 0 },
                ]}
              >
                <Text style={{ fontFamily: "Helvetica-Bold" }}>
                  {formatCurrency(overtimeTotalAmount)}
                </Text>
              </View>
            </View>
          </>
        )}

        {/* Jumlah Gaji Kasar Row */}
        <View style={[styles.tableRow, styles.jumlahGajiKasarRow]} wrap={false} minPresenceAhead={20}>
          <View style={[styles.tableCol, styles.descriptionCol]}>
            <Text></Text>
          </View>
          <View style={[styles.tableCol, styles.rateCol]}>
            <Text></Text>
          </View>
          <View style={[styles.tableCol, styles.descriptionNoteCol]}>
            <Text style={styles.totalText}>Jumlah Gaji Kasar</Text>
          </View>
          <View
            style={[styles.tableCol, styles.amountCol, { borderRightWidth: 0 }]}
          >
            <Text style={styles.totalText}>
              {formatCurrency(payroll.gross_pay)}
            </Text>
          </View>
        </View>

        {/* Deductions Rows */}
        {payroll.deductions && payroll.deductions.length > 0 && (
          <>
            {/* EPF Deduction */}
            {payroll.deductions
              .filter((d) => d.deduction_type.toUpperCase() === "EPF")
              .map((deduction, index) => (
                <View key="deduction-epf" style={styles.tableRow} wrap={false}>
                  <View style={[styles.tableCol, styles.descriptionCol]}>
                    <Text>EPF (Majikan)</Text>
                  </View>
                  <View style={[styles.tableCol, styles.rateCol]}>
                    <Text>{deduction.employer_amount.toFixed(2)}</Text>
                  </View>
                  <View style={[styles.tableCol, styles.descriptionNoteCol]}>
                    <Text>EPF (Pekerja)</Text>
                  </View>
                  <View
                    style={[
                      styles.tableCol,
                      styles.amountCol,
                      { borderRightWidth: 0 },
                    ]}
                  >
                    <Text>({deduction.employee_amount.toFixed(2)})</Text>
                  </View>
                </View>
              ))}

            {/* SOCSO Deduction */}
            {payroll.deductions
              .filter((d) => d.deduction_type.toUpperCase() === "SOCSO")
              .map((deduction, index) => (
                <View key="deduction-socso" style={styles.tableRow} wrap={false}>
                  <View style={[styles.tableCol, styles.descriptionCol]}>
                    <Text>SOCSO (Majikan)</Text>
                  </View>
                  <View style={[styles.tableCol, styles.rateCol]}>
                    <Text>{deduction.employer_amount.toFixed(2)}</Text>
                  </View>
                  <View style={[styles.tableCol, styles.descriptionNoteCol]}>
                    <Text>SOCSO (Pekerja)</Text>
                  </View>
                  <View
                    style={[
                      styles.tableCol,
                      styles.amountCol,
                      { borderRightWidth: 0 },
                    ]}
                  >
                    <Text>({deduction.employee_amount.toFixed(2)})</Text>
                  </View>
                </View>
              ))}

            {/* SIP Deduction */}
            {payroll.deductions
              .filter((d) => d.deduction_type.toUpperCase() === "SIP")
              .map((deduction, index) => (
                <View key="deduction-sip" style={styles.tableRow} wrap={false}>
                  <View style={[styles.tableCol, styles.descriptionCol]}>
                    <Text>SIP (Majikan)</Text>
                  </View>
                  <View style={[styles.tableCol, styles.rateCol]}>
                    <Text>{deduction.employer_amount.toFixed(2)}</Text>
                  </View>
                  <View style={[styles.tableCol, styles.descriptionNoteCol]}>
                    <Text>SIP (Pekerja)</Text>
                  </View>
                  <View
                    style={[
                      styles.tableCol,
                      styles.amountCol,
                      { borderRightWidth: 0 },
                    ]}
                  >
                    <Text>({deduction.employee_amount.toFixed(2)})</Text>
                  </View>
                </View>
              ))}

            {/* Income Tax Deduction */}
            {payroll.deductions
              .filter((d) => d.deduction_type === "income_tax")
              .map((deduction, index) => (
                <View key="deduction-income-tax" style={styles.tableRow} wrap={false}>
                  <View style={[styles.tableCol, styles.descriptionCol]}>
                    <Text></Text>
                  </View>
                  <View style={[styles.tableCol, styles.rateCol]}>
                    <Text></Text>
                  </View>
                  <View style={[styles.tableCol, styles.descriptionNoteCol]}>
                    <Text>Income Tax (Pekerja)</Text>
                  </View>
                  <View
                    style={[
                      styles.tableCol,
                      styles.amountCol,
                      { borderRightWidth: 0 },
                    ]}
                  >
                    <Text>({deduction.employee_amount.toFixed(2)})</Text>
                  </View>
                </View>
              ))}
          </>
        )}

        {/* Jumlah Gaji Bersih Row */}
        <View
          style={[
            styles.tableRow,
            styles.jumlahGajiBersihRow,
            (
              midMonthPayroll ||
              commissionRecords.length > 0 ||
              (isMainten && cutiTahunanAmount > 0)
            )
              ? {}
              : { borderBottomWidth: 0 },
          ]}
          wrap={false}
        >
          <View style={[styles.tableCol, styles.descriptionCol]}>
            <Text></Text>
          </View>
          <View style={[styles.tableCol, styles.rateCol]}>
            <Text></Text>
          </View>
          <View style={[styles.tableCol, styles.descriptionNoteCol]}>
            <Text style={styles.totalText}>Jumlah Gaji Bersih</Text>
          </View>
          <View
            style={[styles.tableCol, styles.amountCol, { borderRightWidth: 0 }]}
          >
            <Text style={styles.totalText}>
              {formatCurrency(payroll.net_pay + commissionTotalAmount)}
            </Text>
          </View>
        </View>

        {/* Commission Advance Deductions - Show below Jumlah Gaji Bersih */}
        {commissionRecords.length > 0 && (
          <>
            {commissionRecords.map((commission, index) => {
              // For MAINTEN job type, include Cuti Tahunan amounts and description
              const isMainten = payroll.job_type === "MAINTEN";
              const cutiTahunanRecords = leaveRecordsArray.filter(
                (record) => record.leave_type === "cuti_tahunan"
              );
              const cutiTahunanAmount = cutiTahunanRecords.reduce(
                (sum, record) => sum + record.total_amount,
                0
              );

              const totalAmount = isMainten
                ? commission.amount + cutiTahunanAmount
                : commission.amount;
              const description =
                isMainten && cutiTahunanRecords.length > 0
                  ? `${commission.description} + Cuti Tahunan (Advance)`
                  : `${commission.description} (Advance)`;

              return (
                <View
                  key={`commission-advance-${index}`}
                  style={styles.tableRow}
                  wrap={false}
                >
                  <View style={[styles.tableCol, styles.descriptionCol]}>
                    <Text>{description}</Text>
                  </View>
                  <View style={[styles.tableCol, styles.rateCol]}>
                    <Text></Text>
                  </View>
                  <View style={[styles.tableCol, styles.descriptionNoteCol]}>
                    <Text></Text>
                  </View>
                  <View
                    style={[
                      styles.tableCol,
                      styles.amountCol,
                      { borderRightWidth: 0 },
                    ]}
                  >
                    <Text>({formatCurrency(totalAmount)})</Text>
                  </View>
                </View>
              );
            })}
          </>
        )}

        {/* Cuti Tahunan Deduction for MAINTEN job type when no commission records */}
        {commissionRecords.length === 0 &&
          isMainten &&
          cutiTahunanAmount > 0 && (
            <View style={styles.tableRow} wrap={false}>
              <View style={[styles.tableCol, styles.descriptionCol]}>
                <Text>Cuti Tahunan (Advance)</Text>
              </View>
              <View style={[styles.tableCol, styles.rateCol]}>
                <Text></Text>
              </View>
              <View style={[styles.tableCol, styles.descriptionNoteCol]}>
                <Text></Text>
              </View>
              <View
                style={[
                  styles.tableCol,
                  styles.amountCol,
                  { borderRightWidth: 0 },
                ]}
              >
                <Text>({formatCurrency(cutiTahunanAmount)})</Text>
              </View>
            </View>
          )}

        {/* Mid Month Payment Deduction - Show if mid-month payment exists */}
        {midMonthPayroll && (
          <>
            <View style={styles.tableRow} wrap={false}>
              <View style={[styles.tableCol, styles.descriptionCol]}>
                <Text>BAYARAN PENDAHULUAN (ADVANCES PAYMENT)</Text>
              </View>
              <View style={[styles.tableCol, styles.rateCol]}>
                <Text></Text>
              </View>
              <View style={[styles.tableCol, styles.descriptionNoteCol]}>
                <Text></Text>
              </View>
              <View
                style={[
                  styles.tableCol,
                  styles.amountCol,
                  { borderRightWidth: 0 },
                ]}
              >
                <Text>({formatCurrency(midMonthPayment)})</Text>
              </View>
            </View>
          </>
        )}

        {/* Jumlah Row - Show if there are deductions (mid-month, commission, or MAINTEN Cuti Tahunan) */}
        {(midMonthPayroll ||
          commissionRecords.length > 0 ||
          (isMainten && cutiTahunanAmount > 0)) && (
          <View style={[styles.tableRow, styles.jumlahRow]} wrap={false}>
            <View style={[styles.tableCol, styles.descriptionCol]}>
              <Text></Text>
            </View>
            <View style={[styles.tableCol, styles.rateCol]}>
              <Text></Text>
            </View>
            <View style={[styles.tableCol, styles.descriptionNoteCol]}>
              <Text style={styles.totalText}>Jumlah</Text>
            </View>
            <View
              style={[
                styles.tableCol,
                styles.amountCol,
                { borderRightWidth: 0 },
              ]}
            >
              <Text style={styles.totalText}>
                {formatCurrency(finalPayment)}
              </Text>
            </View>
          </View>
        )}

        {/* Final Rounded Amount Row */}
        <View style={[styles.tableRow, styles.grandTotalRow]} wrap={false}>
          <View style={[styles.tableCol, styles.descriptionCol]}>
            <Text></Text>
          </View>
          <View style={[styles.tableCol, styles.rateCol]}>
            <Text></Text>
          </View>
          <View style={[styles.tableCol, styles.descriptionNoteCol]}>
            <Text style={styles.totalText}>Jumlah Digenapkan</Text>
          </View>
          <View
            style={[styles.tableCol, styles.amountCol, { borderRightWidth: 0 }]}
          >
            <Text style={styles.totalText}>{formatCurrency(finalPayment)}</Text>
          </View>
        </View>
      </View>

      {/* Footer Section - Notice and Signature grouped together to prevent separation */}
      <View wrap={false}>
        <View style={styles.notesSection}>
          <Text>
            *** Perhatian : Sila kembalikan selepas tandatangan slip ini
          </Text>
        </View>

        {/* Signature Section */}
        <View style={styles.signatureSection}>
          <View style={styles.signatureBlock}></View>
          <View style={styles.signatureBlock}>
            <Text style={{ textAlign: "right" }}>RECEIVED BY</Text>
            <View style={[styles.signatureLine, { marginLeft: "auto" }]}></View>
          </View>
        </View>
      </View>
    </Page>
  );
};

export default PaySlipPDF;