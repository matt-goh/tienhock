import React from "react";
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  pdf,
} from "@react-pdf/renderer";
import { getMonthName } from "./payrollUtils";

// Color palette for professional appearance
const colors = {
  textPrimary: "#0f172a",
  textSecondary: "#475569",
  textMuted: "#64748b",
  borderDark: "#334155",
  border: "#cbd5e1",
  borderLight: "#e2e8f0",
  headerBg: "#f1f5f9",
  sectionBg: "#e2e8f0",
  totalBg: "#cbd5e1",
  grandTotalBg: "#94a3b8",
};

// Styles for A4 Landscape with 19 columns
const styles = StyleSheet.create({
  page: {
    paddingTop: 15,
    paddingBottom: 20,
    paddingLeft: 12,
    paddingRight: 12,
    fontFamily: "Helvetica",
    fontSize: 7,
    color: colors.textPrimary,
  },
  header: {
    marginBottom: 0,
  },
  companyName: {
    fontSize: 12,
    fontFamily: "Helvetica-Bold",
    marginBottom: 3,
  },
  reportTitle: {
    fontSize: 9,
    marginBottom: 2,
  },
  viewSubtitle: {
    fontSize: 9,
    marginBottom: 8,
  },
  table: {
    width: "100%",
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: colors.headerBg,
    borderTopWidth: 1,
    borderTopColor: colors.borderDark,
    borderLeftWidth: 1,
    borderLeftColor: colors.borderDark,
    borderRightWidth: 1,
    borderRightColor: colors.borderDark,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderDark,
    minHeight: 14,
    alignItems: "center",
  },
  tableHeaderSub: {
    flexDirection: "row",
    backgroundColor: colors.headerBg,
    borderLeftWidth: 1,
    borderLeftColor: colors.borderDark,
    borderRightWidth: 1,
    borderRightColor: colors.borderDark,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderDark,
    minHeight: 10,
    alignItems: "center",
  },
  tableRow: {
    flexDirection: "row",
    borderLeftWidth: 1,
    borderLeftColor: colors.borderDark,
    borderRightWidth: 1,
    borderRightColor: colors.borderDark,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.borderLight,
    minHeight: 12,
    alignItems: "center",
  },
  sectionHeaderRow: {
    flexDirection: "row",
    backgroundColor: colors.sectionBg,
    borderLeftWidth: 1,
    borderLeftColor: colors.borderDark,
    borderRightWidth: 1,
    borderRightColor: colors.borderDark,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.border,
    minHeight: 14,
    alignItems: "center",
  },
  locationHeaderRow: {
    flexDirection: "row",
    backgroundColor: "#d1d5db",
    borderLeftWidth: 1,
    borderLeftColor: colors.borderDark,
    borderRightWidth: 1,
    borderRightColor: colors.borderDark,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.border,
    minHeight: 14,
    alignItems: "center",
  },
  subtotalRow: {
    flexDirection: "row",
    backgroundColor: colors.headerBg,
    borderLeftWidth: 1,
    borderLeftColor: colors.borderDark,
    borderRightWidth: 1,
    borderRightColor: colors.borderDark,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.border,
    minHeight: 12,
    alignItems: "center",
  },
  totalRow: {
    flexDirection: "row",
    backgroundColor: colors.totalBg,
    borderLeftWidth: 1,
    borderLeftColor: colors.borderDark,
    borderRightWidth: 1,
    borderRightColor: colors.borderDark,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderDark,
    minHeight: 14,
    alignItems: "center",
  },
  carumanRow: {
    flexDirection: "row",
    backgroundColor: colors.sectionBg,
    borderLeftWidth: 1,
    borderLeftColor: colors.borderDark,
    borderRightWidth: 1,
    borderRightColor: colors.borderDark,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderDark,
    minHeight: 12,
    borderTopWidth: 0.5,
    borderTopColor: colors.border,
    alignItems: "center",
  },
  // Column definitions - 19 columns for A4 Landscape
  // Regular columns: padding 2 horizontal, 1 vertical (matching px-2 py-2 scaled down)
  // EPF/SOCSO/SIP columns: padding 1 horizontal (matching px-1 py-2 scaled down)
  colBil: { width: "2.5%", textAlign: "center", paddingVertical: 1, paddingHorizontal: 1, borderRightWidth: 0.5, borderRightColor: colors.border },
  colName: { width: "14%", textAlign: "left", paddingVertical: 1, paddingHorizontal: 2, borderRightWidth: 0.5, borderRightColor: colors.border },
  colGaji: { width: "5%", textAlign: "right", paddingVertical: 1, paddingHorizontal: 2, borderRightWidth: 0.5, borderRightColor: colors.border },
  colOt: { width: "4%", textAlign: "right", paddingVertical: 1, paddingHorizontal: 2, borderRightWidth: 0.5, borderRightColor: colors.border },
  colBonus: { width: "4.5%", textAlign: "right", paddingVertical: 1, paddingHorizontal: 2, borderRightWidth: 0.5, borderRightColor: colors.border },
  colComm: { width: "4.5%", textAlign: "right", paddingVertical: 1, paddingHorizontal: 2, borderRightWidth: 0.5, borderRightColor: colors.border },
  colGajiKasar: { width: "5.5%", textAlign: "right", paddingVertical: 1, paddingHorizontal: 2, borderRightWidth: 0.5, borderRightColor: colors.border },
  // EPF group - left border on MAJ to separate from previous section
  colEpfMaj: { width: "5%", textAlign: "right", paddingVertical: 1, paddingHorizontal: 1, borderLeftWidth: 0.5, borderLeftColor: colors.border, borderRightWidth: 0.5, borderRightColor: colors.borderLight },
  colEpfPkj: { width: "5%", textAlign: "right", paddingVertical: 1, paddingHorizontal: 1, borderRightWidth: 0.5, borderRightColor: colors.border },
  // SOCSO group - left border on MAJ to separate from EPF
  colSocsoMaj: { width: "4.5%", textAlign: "right", paddingVertical: 1, paddingHorizontal: 1, borderLeftWidth: 0.5, borderLeftColor: colors.border, borderRightWidth: 0.5, borderRightColor: colors.borderLight },
  colSocsoPkj: { width: "4.5%", textAlign: "right", paddingVertical: 1, paddingHorizontal: 1, borderRightWidth: 0.5, borderRightColor: colors.border },
  // SIP group - left border on MAJ to separate from SOCSO
  colSipMaj: { width: "4%", textAlign: "right", paddingVertical: 1, paddingHorizontal: 1, borderLeftWidth: 0.5, borderLeftColor: colors.border, borderRightWidth: 0.5, borderRightColor: colors.borderLight },
  colSipPkj: { width: "4%", textAlign: "right", paddingVertical: 1, paddingHorizontal: 1, borderRightWidth: 0.5, borderRightColor: colors.border },
  colPcb: { width: "4.5%", textAlign: "right", paddingVertical: 1, paddingHorizontal: 2, borderLeftWidth: 0.5, borderLeftColor: colors.border, borderRightWidth: 0.5, borderRightColor: colors.border },
  colGajiBersih: { width: "5.5%", textAlign: "right", paddingVertical: 1, paddingHorizontal: 2, borderRightWidth: 0.5, borderRightColor: colors.border },
  colSetengah: { width: "5.5%", textAlign: "right", paddingVertical: 1, paddingHorizontal: 2, borderRightWidth: 0.5, borderRightColor: colors.border },
  colJumlah: { width: "5.5%", textAlign: "right", paddingVertical: 1, paddingHorizontal: 2, borderRightWidth: 0.5, borderRightColor: colors.border },
  colDigenapkan: { width: "5%", textAlign: "right", paddingVertical: 1, paddingHorizontal: 1, borderRightWidth: 0.5, borderRightColor: colors.border },
  colSetelah: { width: "6.5%", textAlign: "right", paddingVertical: 1, paddingHorizontal: 2 },
  // Header text styles
  headerText: { fontSize: 6.5, fontFamily: "Helvetica-Bold", color: colors.textPrimary },
  headerTextSmall: { fontSize: 5.5, fontFamily: "Helvetica-Bold", color: colors.textPrimary, lineHeight: 1.2 },
  subHeaderText: { fontSize: 5.5, fontFamily: "Helvetica-Bold", color: colors.textSecondary },
  // Data text styles
  dataText: { fontSize: 6.5, color: colors.textPrimary },
  dataTextBold: { fontSize: 6.5, fontFamily: "Helvetica-Bold", color: colors.textPrimary },
  sectionText: { fontSize: 7, fontFamily: "Helvetica-Bold", color: colors.textPrimary },
  // Full width cell
  fullWidthCell: { width: "100%", paddingVertical: 3, paddingHorizontal: 4 },
  pageNumber: {
    position: "absolute",
    fontSize: 7,
    bottom: 10,
    left: 0,
    right: 0,
    textAlign: "center",
    color: colors.textMuted,
  },
});

// Types
interface EmployeeSalaryData {
  no: number;
  employee_payroll_id: number | null;
  staff_id: string;
  staff_name: string;
  gaji: number;
  ot: number;
  bonus: number;
  comm: number;
  gaji_kasar: number;
  epf_majikan: number;
  epf_pekerja: number;
  socso_majikan: number;
  socso_pekerja: number;
  sip_majikan: number;
  sip_pekerja: number;
  pcb: number;
  gaji_bersih: number;
  setengah_bulan: number;
  jumlah: number;
  digenapkan: number;
  setelah_digenapkan: number;
}

interface GrandTotals {
  gaji: number;
  ot: number;
  bonus: number;
  comm: number;
  gaji_kasar: number;
  epf_majikan: number;
  epf_pekerja: number;
  socso_majikan: number;
  socso_pekerja: number;
  sip_majikan: number;
  sip_pekerja: number;
  pcb: number;
  gaji_bersih: number;
  setengah_bulan: number;
  jumlah: number;
  digenapkan: number;
  setelah_digenapkan: number;
}

interface LocationSalaryData {
  location: string;
  employees: {
    employee_payroll_id: number;
    staff_id: string;
    staff_name: string;
    gaji: number;
    ot: number;
    bonus: number;
    comm: number;
    gaji_kasar: number;
    epf_majikan: number;
    epf_pekerja: number;
    socso_majikan: number;
    socso_pekerja: number;
    sip_majikan: number;
    sip_pekerja: number;
    pcb: number;
    gaji_bersih: number;
    setengah_bulan: number;
    jumlah: number;
    digenapkan: number;
    setelah_digenapkan: number;
  }[];
  totals: GrandTotals;
}

interface ComprehensiveSalaryData {
  year: number;
  month: number;
  locations: LocationSalaryData[];
  grand_totals: GrandTotals;
}

interface LocationOrderItem {
  type: "location" | "header";
  id?: string;
  text?: string;
}

export interface SalaryReportPDFProps {
  reportType: "employee-individual" | "employee-grouped" | "location";
  periodType: "monthly" | "yearly";
  year: number;
  month?: number;
  employees?: EmployeeSalaryData[];
  comprehensiveData?: ComprehensiveSalaryData | null;
  grandTotals?: GrandTotals;
  locationMap: Record<string, string>;
  locationOrder: LocationOrderItem[];
}

// Helper functions
const formatCurrency = (amount: number | undefined | null): string => {
  if (amount === undefined || amount === null) return ".00";
  if (amount === 0) return ".00";
  return new Intl.NumberFormat("en-MY", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
};

const truncateName = (name: string, maxLength: number = 30): string => {
  if (!name) return "";
  if (name.length <= maxLength) return name;
  return name.substring(0, maxLength - 3) + "...";
};

// Safely convert employee data to GrandTotals format
const toGrandTotals = (emp: {
  gaji?: number;
  ot?: number;
  bonus?: number;
  comm?: number;
  gaji_kasar?: number;
  epf_majikan?: number;
  epf_pekerja?: number;
  socso_majikan?: number;
  socso_pekerja?: number;
  sip_majikan?: number;
  sip_pekerja?: number;
  pcb?: number;
  gaji_bersih?: number;
  setengah_bulan?: number;
  jumlah?: number;
  digenapkan?: number;
  setelah_digenapkan?: number;
}): GrandTotals => ({
  gaji: emp.gaji ?? 0,
  ot: emp.ot ?? 0,
  bonus: emp.bonus ?? 0,
  comm: emp.comm ?? 0,
  gaji_kasar: emp.gaji_kasar ?? 0,
  epf_majikan: emp.epf_majikan ?? 0,
  epf_pekerja: emp.epf_pekerja ?? 0,
  socso_majikan: emp.socso_majikan ?? 0,
  socso_pekerja: emp.socso_pekerja ?? 0,
  sip_majikan: emp.sip_majikan ?? 0,
  sip_pekerja: emp.sip_pekerja ?? 0,
  pcb: emp.pcb ?? 0,
  gaji_bersih: emp.gaji_bersih ?? 0,
  setengah_bulan: emp.setengah_bulan ?? 0,
  jumlah: emp.jumlah ?? 0,
  digenapkan: emp.digenapkan ?? 0,
  setelah_digenapkan: emp.setelah_digenapkan ?? 0,
});

const buildReportTitle = (
  periodType: "monthly" | "yearly",
  year: number,
  month?: number
): string => {
  if (periodType === "yearly") {
    return `REPORT : SALARY WAGES FOR THE YEAR ${year}`;
  }
  const monthName = month ? getMonthName(month).toUpperCase() : "";
  return `REPORT : SALARY WAGES FOR THE MONTH OF ${monthName}, ${year}`;
};

const buildViewSubtitle = (
  reportType: "employee-individual" | "employee-grouped" | "location"
): string => {
  switch (reportType) {
    case "employee-individual":
      return "BY NAME (GROUP)";
    case "employee-grouped":
      return "BY LOCATION";
    case "location":
      return "LOCATION:-";
    default:
      return "";
  }
};

// Table Header Component
const TableHeader: React.FC<{ isLocationReport: boolean }> = ({
  isLocationReport,
}) => {
  const nameHeader = isLocationReport ? "BAHAGIAN KERJA" : "NAMA PEKERJA";

  // Combined widths for spanning headers
  const epfWidth = "10%"; // 5% + 5%
  const socsoWidth = "9%"; // 4.5% + 4.5%
  const sipWidth = "8%"; // 4% + 4%

  return (
    <View fixed>
      {/* Main Header Row */}
      <View style={styles.tableHeader} wrap={false}>
        <View style={styles.colBil}>
          <Text style={styles.headerText}>BIL</Text>
        </View>
        <View style={styles.colName}>
          <Text style={styles.headerText}>{nameHeader}</Text>
        </View>
        <View style={styles.colGaji}>
          <Text style={styles.headerText}>GAJI</Text>
        </View>
        <View style={styles.colOt}>
          <Text style={styles.headerText}>OT</Text>
        </View>
        <View style={styles.colBonus}>
          <Text style={styles.headerText}>BONUS</Text>
        </View>
        <View style={styles.colComm}>
          <Text style={styles.headerText}>COMM</Text>
        </View>
        <View style={styles.colGajiKasar}>
          <Text style={styles.headerText}>G. KASAR</Text>
        </View>
        {/* EPF spanning 2 columns */}
        <View style={{ width: epfWidth, textAlign: "center", paddingVertical: 1, borderLeftWidth: 0.5, borderLeftColor: colors.border, borderRightWidth: 0.5, borderRightColor: colors.border }}>
          <Text style={[styles.headerText, { textAlign: "center" }]}>EPF</Text>
        </View>
        {/* SOCSO spanning 2 columns */}
        <View style={{ width: socsoWidth, textAlign: "center", paddingVertical: 1, borderLeftWidth: 0.5, borderLeftColor: colors.border, borderRightWidth: 0.5, borderRightColor: colors.border }}>
          <Text style={[styles.headerText, { textAlign: "center" }]}>SOCSO</Text>
        </View>
        {/* SIP spanning 2 columns */}
        <View style={{ width: sipWidth, textAlign: "center", paddingVertical: 1, borderLeftWidth: 0.5, borderLeftColor: colors.border, borderRightWidth: 0.5, borderRightColor: colors.border }}>
          <Text style={[styles.headerText, { textAlign: "center" }]}>SIP</Text>
        </View>
        <View style={styles.colPcb}>
          <Text style={styles.headerText}>PCB</Text>
        </View>
        <View style={styles.colGajiBersih}>
          <Text style={styles.headerText}>G. BERSIH</Text>
        </View>
        <View style={styles.colSetengah}>
          <Text style={styles.headerText}>1/2 BULAN</Text>
        </View>
        <View style={styles.colJumlah}>
          <Text style={styles.headerText}>JUMLAH</Text>
        </View>
        <View style={styles.colDigenapkan}>
          <Text style={styles.headerText}>DIGENAP</Text>
        </View>
        <View style={styles.colSetelah}>
          <Text style={styles.headerText}>S. DIGENAP</Text>
        </View>
      </View>
      {/* Sub Header Row for MAJ/PKJ */}
      <View style={styles.tableHeaderSub} wrap={false}>
        <View style={styles.colBil}><Text style={styles.subHeaderText}></Text></View>
        <View style={styles.colName}><Text style={styles.subHeaderText}></Text></View>
        <View style={styles.colGaji}><Text style={styles.subHeaderText}></Text></View>
        <View style={styles.colOt}><Text style={styles.subHeaderText}></Text></View>
        <View style={styles.colBonus}><Text style={styles.subHeaderText}></Text></View>
        <View style={styles.colComm}><Text style={styles.subHeaderText}></Text></View>
        <View style={styles.colGajiKasar}><Text style={styles.subHeaderText}></Text></View>
        <View style={[styles.colEpfMaj, { textAlign: "center" }]}><Text style={styles.subHeaderText}>MAJ</Text></View>
        <View style={[styles.colEpfPkj, { textAlign: "center" }]}><Text style={styles.subHeaderText}>PKJ</Text></View>
        <View style={[styles.colSocsoMaj, { textAlign: "center" }]}><Text style={styles.subHeaderText}>MAJ</Text></View>
        <View style={[styles.colSocsoPkj, { textAlign: "center" }]}><Text style={styles.subHeaderText}>PKJ</Text></View>
        <View style={[styles.colSipMaj, { textAlign: "center" }]}><Text style={styles.subHeaderText}>MAJ</Text></View>
        <View style={[styles.colSipPkj, { textAlign: "center" }]}><Text style={styles.subHeaderText}>PKJ</Text></View>
        <View style={styles.colPcb}><Text style={styles.subHeaderText}></Text></View>
        <View style={styles.colGajiBersih}><Text style={styles.subHeaderText}></Text></View>
        <View style={styles.colSetengah}><Text style={styles.subHeaderText}></Text></View>
        <View style={styles.colJumlah}><Text style={styles.subHeaderText}></Text></View>
        <View style={styles.colDigenapkan}><Text style={styles.subHeaderText}></Text></View>
        <View style={styles.colSetelah}><Text style={styles.subHeaderText}></Text></View>
      </View>
    </View>
  );
};

// Data Row Component
const DataRow: React.FC<{
  bil: string | number;
  name: string;
  data: GrandTotals;
  isBold?: boolean;
  rowStyle?: any;
}> = ({ bil, name, data, isBold = false, rowStyle }) => {
  const textStyle = isBold ? styles.dataTextBold : styles.dataText;

  return (
    <View style={rowStyle || styles.tableRow} wrap={false}>
      <View style={styles.colBil}><Text style={textStyle}>{bil}</Text></View>
      <View style={styles.colName}><Text style={textStyle}>{name}</Text></View>
      <View style={styles.colGaji}><Text style={textStyle}>{formatCurrency(data.gaji)}</Text></View>
      <View style={styles.colOt}><Text style={textStyle}>{formatCurrency(data.ot)}</Text></View>
      <View style={styles.colBonus}><Text style={textStyle}>{formatCurrency(data.bonus)}</Text></View>
      <View style={styles.colComm}><Text style={textStyle}>{formatCurrency(data.comm)}</Text></View>
      <View style={styles.colGajiKasar}><Text style={textStyle}>{formatCurrency(data.gaji_kasar)}</Text></View>
      <View style={styles.colEpfMaj}><Text style={textStyle}>{formatCurrency(data.epf_majikan)}</Text></View>
      <View style={styles.colEpfPkj}><Text style={textStyle}>{formatCurrency(data.epf_pekerja)}</Text></View>
      <View style={styles.colSocsoMaj}><Text style={textStyle}>{formatCurrency(data.socso_majikan)}</Text></View>
      <View style={styles.colSocsoPkj}><Text style={textStyle}>{formatCurrency(data.socso_pekerja)}</Text></View>
      <View style={styles.colSipMaj}><Text style={textStyle}>{formatCurrency(data.sip_majikan)}</Text></View>
      <View style={styles.colSipPkj}><Text style={textStyle}>{formatCurrency(data.sip_pekerja)}</Text></View>
      <View style={styles.colPcb}><Text style={textStyle}>{formatCurrency(data.pcb)}</Text></View>
      <View style={styles.colGajiBersih}><Text style={textStyle}>{formatCurrency(data.gaji_bersih)}</Text></View>
      <View style={styles.colSetengah}><Text style={textStyle}>{formatCurrency(data.setengah_bulan)}</Text></View>
      <View style={styles.colJumlah}><Text style={textStyle}>{formatCurrency(data.jumlah)}</Text></View>
      <View style={styles.colDigenapkan}><Text style={textStyle}>{formatCurrency(data.digenapkan)}</Text></View>
      <View style={styles.colSetelah}><Text style={textStyle}>{formatCurrency(data.setelah_digenapkan)}</Text></View>
    </View>
  );
};

// Section Header Row - with minPresenceAhead to prevent orphan headers
const SectionHeaderRow: React.FC<{ text: string }> = ({ text }) => (
  <View style={styles.sectionHeaderRow} wrap={false} minPresenceAhead={30}>
    <View style={styles.fullWidthCell}>
      <Text style={[styles.sectionText, { textAlign: "center" }]}>
        --- {text} ---
      </Text>
    </View>
  </View>
);

// Location Header Row - with minPresenceAhead to prevent orphan headers
const LocationHeaderRow: React.FC<{ locationId: string; locationName: string }> = ({
  locationId,
  locationName,
}) => (
  <View style={styles.locationHeaderRow} wrap={false} minPresenceAhead={30}>
    <View style={styles.fullWidthCell}>
      <Text style={styles.sectionText}>
        LOCATION : {locationId} - {locationName}
      </Text>
    </View>
  </View>
);

// Caruman Totals Row (combined EPF, SOCSO, SIP totals)
const CarumanTotalsRow: React.FC<{ totals: GrandTotals }> = ({ totals }) => {
  const epfTotal = (totals.epf_majikan || 0) + (totals.epf_pekerja || 0);
  const socsoTotal = (totals.socso_majikan || 0) + (totals.socso_pekerja || 0);
  const sipTotal = (totals.sip_majikan || 0) + (totals.sip_pekerja || 0);

  return (
    <View style={styles.carumanRow} wrap={false}>
      <View style={styles.colBil}><Text style={styles.dataText}></Text></View>
      <View style={styles.colName}><Text style={styles.dataTextBold}>CARUMAN TOTALS:</Text></View>
      <View style={styles.colGaji}><Text style={styles.dataText}></Text></View>
      <View style={styles.colOt}><Text style={styles.dataText}></Text></View>
      <View style={styles.colBonus}><Text style={styles.dataText}></Text></View>
      <View style={styles.colComm}><Text style={styles.dataText}></Text></View>
      <View style={styles.colGajiKasar}><Text style={styles.dataText}></Text></View>
      <View style={styles.colEpfMaj}>
        <Text style={[styles.dataTextBold, { textAlign: "right" }]}>{formatCurrency(epfTotal)}</Text>
      </View>
      <View style={styles.colEpfPkj}><Text style={styles.dataText}></Text></View>
      <View style={styles.colSocsoMaj}>
        <Text style={[styles.dataTextBold, { textAlign: "right" }]}>{formatCurrency(socsoTotal)}</Text>
      </View>
      <View style={styles.colSocsoPkj}><Text style={styles.dataText}></Text></View>
      <View style={styles.colSipMaj}>
        <Text style={[styles.dataTextBold, { textAlign: "right" }]}>{formatCurrency(sipTotal)}</Text>
      </View>
      <View style={styles.colSipPkj}><Text style={styles.dataText}></Text></View>
      <View style={styles.colPcb}><Text style={styles.dataText}></Text></View>
      <View style={styles.colGajiBersih}><Text style={styles.dataText}></Text></View>
      <View style={styles.colSetengah}><Text style={styles.dataText}></Text></View>
      <View style={styles.colJumlah}><Text style={styles.dataText}></Text></View>
      <View style={styles.colDigenapkan}><Text style={styles.dataText}></Text></View>
      <View style={styles.colSetelah}><Text style={styles.dataText}></Text></View>
    </View>
  );
};

// Employee Individual Report Content
const EmployeeIndividualContent: React.FC<{
  employees: EmployeeSalaryData[];
  grandTotals: GrandTotals;
}> = ({ employees, grandTotals }) => (
  <>
    <TableHeader isLocationReport={false} />
    {employees.slice(0, -1).map((emp, index) => {
      const fullName = `${(emp.staff_id || '').toUpperCase()} - ${(emp.staff_name || '').toUpperCase()}`;
      const displayName = truncateName(fullName, 35);
      return (
        <DataRow
          key={index}
          bil={index + 1}
          name={displayName}
          data={toGrandTotals(emp)}
        />
      );
    })}
    {/* Wrap last employee with totals to prevent separation */}
    <View wrap={false}>
      {employees.length > 0 && (() => {
        const lastEmp = employees[employees.length - 1];
        const fullName = `${(lastEmp.staff_id || '').toUpperCase()} - ${(lastEmp.staff_name || '').toUpperCase()}`;
        const displayName = truncateName(fullName, 35);
        return (
          <DataRow
            key={employees.length - 1}
            bil={employees.length}
            name={displayName}
            data={toGrandTotals(lastEmp)}
          />
        );
      })()}
      <DataRow bil="" name="TOTAL :" data={grandTotals} isBold rowStyle={styles.totalRow} />
      <CarumanTotalsRow totals={grandTotals} />
    </View>
  </>
);

// Employee Grouped by Location Content
const EmployeeGroupedContent: React.FC<{
  comprehensiveData: ComprehensiveSalaryData;
  locationMap: Record<string, string>;
  locationOrder: LocationOrderItem[];
  grandTotals: GrandTotals;
}> = ({ comprehensiveData, locationMap, locationOrder, grandTotals }) => {
  // Process locations: merge 16-24 into 14
  const locationsCopy = JSON.parse(
    JSON.stringify(comprehensiveData.locations)
  ) as LocationSalaryData[];
  const commissionLocCodes = ["16", "17", "18", "19", "20", "21", "22", "23", "24"];
  const commissionLocs = locationsCopy.filter((loc) =>
    commissionLocCodes.includes(loc.location)
  );
  const regularLocs = locationsCopy.filter(
    (loc) => !commissionLocCodes.includes(loc.location)
  );

  // Merge commission employees into location 14
  const loc14 = regularLocs.find((loc) => loc.location === "14");
  if (loc14 && commissionLocs.length > 0) {
    const commissionEmployees = commissionLocs.flatMap((loc) => loc.employees);
    const existingStaffIds = new Set(loc14.employees.map((e) => e.staff_id));
    commissionEmployees.forEach((emp) => {
      if (!existingStaffIds.has(emp.staff_id)) {
        loc14.employees.push(emp);
        existingStaffIds.add(emp.staff_id);
      }
    });
    // Recalculate loc14 totals
    loc14.totals = loc14.employees.reduce(
      (acc, emp) => ({
        gaji: acc.gaji + emp.gaji,
        ot: acc.ot + emp.ot,
        bonus: acc.bonus + emp.bonus,
        comm: acc.comm + emp.comm,
        gaji_kasar: acc.gaji_kasar + emp.gaji_kasar,
        epf_majikan: acc.epf_majikan + emp.epf_majikan,
        epf_pekerja: acc.epf_pekerja + emp.epf_pekerja,
        socso_majikan: acc.socso_majikan + emp.socso_majikan,
        socso_pekerja: acc.socso_pekerja + emp.socso_pekerja,
        sip_majikan: acc.sip_majikan + emp.sip_majikan,
        sip_pekerja: acc.sip_pekerja + emp.sip_pekerja,
        pcb: acc.pcb + emp.pcb,
        gaji_bersih: acc.gaji_bersih + emp.gaji_bersih,
        setengah_bulan: acc.setengah_bulan + emp.setengah_bulan,
        jumlah: acc.jumlah + emp.jumlah,
        digenapkan: acc.digenapkan + emp.digenapkan,
        setelah_digenapkan: acc.setelah_digenapkan + emp.setelah_digenapkan,
      }),
      {
        gaji: 0, ot: 0, bonus: 0, comm: 0, gaji_kasar: 0,
        epf_majikan: 0, epf_pekerja: 0, socso_majikan: 0, socso_pekerja: 0,
        sip_majikan: 0, sip_pekerja: 0, pcb: 0, gaji_bersih: 0,
        setengah_bulan: 0, jumlah: 0, digenapkan: 0, setelah_digenapkan: 0,
      }
    );
  }

  // Filter location order to exclude commission locations
  const nonCommissionOrder = locationOrder.filter(
    (item) =>
      item.type === "header" ||
      (item.type === "location" && !commissionLocCodes.includes(item.id || ""))
  );

  return (
    <>
      <TableHeader isLocationReport={false} />
      {nonCommissionOrder.map((item, idx) => {
        if (item.type === "header") {
          return <SectionHeaderRow key={`header-${idx}`} text={item.text || ""} />;
        }

        const locationData = regularLocs.find((loc) => loc.location === item.id);
        if (!locationData || locationData.employees.length === 0) return null;

        const locationName = locationMap[item.id || ""] || item.id || "";

        return (
          <React.Fragment key={`loc-${item.id}`}>
            <LocationHeaderRow locationId={item.id || ""} locationName={locationName} />
            {locationData.employees.slice(0, -1).map((emp, empIdx) => {
              const fullName = `${(emp.staff_id || '').toUpperCase()} - ${(emp.staff_name || '').toUpperCase()}`;
              const displayName = truncateName(fullName, 35);
              return (
                <DataRow
                  key={empIdx}
                  bil={empIdx + 1}
                  name={displayName}
                  data={toGrandTotals(emp)}
                />
              );
            })}
            {/* Wrap last employee and subtotal together to prevent separation */}
            <View wrap={false}>
              {locationData.employees.length > 0 && (() => {
                const lastEmp = locationData.employees[locationData.employees.length - 1];
                const fullName = `${(lastEmp.staff_id || '').toUpperCase()} - ${(lastEmp.staff_name || '').toUpperCase()}`;
                const displayName = truncateName(fullName, 35);
                return (
                  <DataRow
                    key={locationData.employees.length - 1}
                    bil={locationData.employees.length}
                    name={displayName}
                    data={toGrandTotals(lastEmp)}
                  />
                );
              })()}
              <DataRow
                bil=""
                name={truncateName(`${locationName} SUBTOTAL`, 35)}
                data={locationData.totals}
                isBold
                rowStyle={styles.subtotalRow}
              />
            </View>
          </React.Fragment>
        );
      })}
      {/* Wrap grand totals together to prevent separation */}
      <View wrap={false}>
        <DataRow bil="" name="TOTAL :" data={grandTotals} isBold rowStyle={styles.totalRow} />
        <CarumanTotalsRow totals={grandTotals} />
      </View>
    </>
  );
};

// Location Totals Content
const LocationTotalsContent: React.FC<{
  comprehensiveData: ComprehensiveSalaryData;
  locationMap: Record<string, string>;
  locationOrder: LocationOrderItem[];
  grandTotals: GrandTotals;
}> = ({ comprehensiveData, locationMap, locationOrder, grandTotals }) => (
  <>
    <TableHeader isLocationReport={true} />
    {locationOrder.map((item, idx) => {
      if (item.type === "header") {
        return <SectionHeaderRow key={`header-${idx}`} text={item.text || ""} />;
      }

      const locationData = comprehensiveData.locations.find(
        (loc) => loc.location === item.id
      );
      const locationName = locationMap[item.id || ""] || item.id || "";
      const locationNumber = item.id || "";

      if (locationData) {
        return (
          <DataRow
            key={`loc-${item.id}`}
            bil={locationNumber}
            name={truncateName(locationName, 35)}
            data={locationData.totals}
          />
        );
      }

      // Empty location row
      const emptyData: GrandTotals = {
        gaji: 0, ot: 0, bonus: 0, comm: 0, gaji_kasar: 0,
        epf_majikan: 0, epf_pekerja: 0, socso_majikan: 0, socso_pekerja: 0,
        sip_majikan: 0, sip_pekerja: 0, pcb: 0, gaji_bersih: 0,
        setengah_bulan: 0, jumlah: 0, digenapkan: 0, setelah_digenapkan: 0,
      };
      return (
        <DataRow
          key={`loc-${item.id}`}
          bil={locationNumber}
          name={truncateName(locationName, 35)}
          data={emptyData}
        />
      );
    })}
    {/* Wrap grand totals together to prevent separation */}
    <View wrap={false}>
      <DataRow bil="" name="TOTAL :" data={grandTotals} isBold rowStyle={styles.totalRow} />
      <CarumanTotalsRow totals={grandTotals} />
    </View>
  </>
);

// No Data Content
const NoDataContent: React.FC = () => (
  <>
    <TableHeader isLocationReport={false} />
    <View style={[styles.tableRow, { justifyContent: "center", minHeight: 40 }]}>
      <View style={{ width: "100%", paddingVertical: 10 }}>
        <Text style={[styles.dataText, { textAlign: "center" }]}>
          No data available for this report
        </Text>
      </View>
    </View>
  </>
);

// Main PDF Document Component
const SalaryReportPDF: React.FC<SalaryReportPDFProps> = ({
  reportType,
  periodType,
  year,
  month,
  employees,
  comprehensiveData,
  grandTotals,
  locationMap,
  locationOrder,
}) => {
  const reportTitle = buildReportTitle(periodType, year, month);
  const viewSubtitle = buildViewSubtitle(reportType);

  let content: React.ReactNode = <NoDataContent />;

  if (reportType === "employee-individual" && employees && employees.length > 0 && grandTotals) {
    content = <EmployeeIndividualContent employees={employees} grandTotals={grandTotals} />;
  } else if (reportType === "employee-grouped" && comprehensiveData && comprehensiveData.locations.length > 0 && grandTotals) {
    content = (
      <EmployeeGroupedContent
        comprehensiveData={comprehensiveData}
        locationMap={locationMap}
        locationOrder={locationOrder}
        grandTotals={grandTotals}
      />
    );
  } else if (reportType === "location" && comprehensiveData && comprehensiveData.locations.length > 0) {
    content = (
      <LocationTotalsContent
        comprehensiveData={comprehensiveData}
        locationMap={locationMap}
        locationOrder={locationOrder}
        grandTotals={comprehensiveData.grand_totals}
      />
    );
  }

  return (
    <Document
      title={`Salary Report ${periodType === "yearly" ? year : `${getMonthName(month || 1)} ${year}`}`}
    >
      <Page size="A4" orientation="landscape" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.companyName}>TIEN HOCK FOOD INDUSTRIES S/B (953309-T)</Text>
          <Text style={styles.reportTitle}>{reportTitle}</Text>
          <Text style={styles.viewSubtitle}>{viewSubtitle}</Text>
        </View>

        {/* Table */}
        <View style={styles.table}>{content}</View>

        {/* Page Number */}
        <Text
          style={styles.pageNumber}
          render={({ pageNumber, totalPages }) =>
            `Page ${pageNumber} of ${totalPages}`
          }
          fixed
        />
      </Page>
    </Document>
  );
};

// Generate filename
const generateFileName = (
  reportType: "employee-individual" | "employee-grouped" | "location",
  periodType: "monthly" | "yearly",
  year: number,
  month?: number
): string => {
  const reportName =
    reportType === "employee-individual"
      ? "Employee"
      : reportType === "employee-grouped"
      ? "Employee_ByLocation"
      : "Location";

  const periodStr =
    periodType === "yearly" ? `${year}` : `${getMonthName(month || 1)}_${year}`;

  return `Salary_Report_${reportName}_${periodStr}.pdf`;
};

// Main export function - generate and download/print PDF
export const generateSalaryReportPDF = async (
  props: SalaryReportPDFProps,
  action: "download" | "print"
): Promise<void> => {
  try {
    const doc = <SalaryReportPDF {...props} />;
    const pdfBlob = await pdf(doc).toBlob();
    const fileName = generateFileName(props.reportType, props.periodType, props.year, props.month);

    if (action === "download") {
      const url = URL.createObjectURL(pdfBlob);
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } else {
      const url = URL.createObjectURL(pdfBlob);
      const printFrame = document.createElement("iframe");
      printFrame.style.display = "none";
      document.body.appendChild(printFrame);

      printFrame.onload = () => {
        if (printFrame.contentWindow) {
          try {
            printFrame.contentWindow.print();
          } catch (e) {
            console.error("Print failed:", e);
          }
          const cleanup = () => {
            if (document.body.contains(printFrame)) {
              document.body.removeChild(printFrame);
            }
            URL.revokeObjectURL(url);
            window.removeEventListener("focus", cleanup);
          };
          window.addEventListener("focus", cleanup, { once: true });
        }
      };
      printFrame.src = url;
    }
  } catch (error) {
    console.error("Error generating PDF:", error);
    throw error;
  }
};

// Export function to get PDF as blob
export const getSalaryReportPDFBlob = async (
  props: SalaryReportPDFProps
): Promise<Blob> => {
  const doc = <SalaryReportPDF {...props} />;
  return await pdf(doc).toBlob();
};

export default SalaryReportPDF;
