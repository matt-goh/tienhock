// src/utils/accounting/GeneralStatementPDF.tsx
import React from "react";
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  pdf,
} from "@react-pdf/renderer";

// Types for the general statement data
interface CustomerRow {
  account_no: string;
  particular: string;
  bal_bf: number;
  current_invoices: number;
  payment: number;
  total_due: number;
  aging_current: number;
  aging_1_month: number;
  aging_2_months: number;
  aging_3_plus: number;
}

interface Totals {
  bal_bf: number;
  current_invoices: number;
  payment: number;
  total_due: number;
  aging_current: number;
  aging_1_month: number;
  aging_2_months: number;
  aging_3_plus: number;
}

interface GeneralStatementData {
  statement_date: string;
  report_datetime: string;
  statement_month: number;
  statement_year: number;
  customers: CustomerRow[];
  totals: Totals;
}

// Styles for typewriter/monospace aesthetic
const styles = StyleSheet.create({
  page: {
    paddingTop: 20,
    paddingBottom: 30,
    paddingHorizontal: 25,
    fontFamily: "Courier",
    fontSize: 8,
    color: "#000000",
  },
  // Header Section
  headerSection: {
    marginBottom: 5,
  },
  headerTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  headerCenter: {
    flex: 1,
    alignItems: "center",
  },
  companyName: {
    fontSize: 10,
    fontFamily: "Courier-Bold",
    textAlign: "center",
    textDecoration: "underline",
  },
  title: {
    fontSize: 9,
    textAlign: "center",
    textDecoration: "underline",
    marginTop: 2,
  },
  reportInfoRight: {
    fontSize: 8,
    textAlign: "right",
    width: 220,
  },
  reportDateLeft: {
    fontSize: 8,
    marginTop: 10,
    marginBottom: 5,
  },
  // Divider
  doubleLine: {
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: "#000000",
    height: 3,
    marginTop: 3,
    marginBottom: 3,
  },
  singleLine: {
    borderBottomWidth: 1,
    borderColor: "#000000",
    marginTop: 2,
    marginBottom: 3,
  },
  // Table
  table: {
    width: "100%",
  },
  tableHeader: {
    flexDirection: "row",
    paddingVertical: 3,
    fontFamily: "Courier-Bold",
    fontSize: 7.5,
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 2,
    fontSize: 7.5,
  },
  totalRow: {
    flexDirection: "row",
    paddingVertical: 4,
    fontFamily: "Courier-Bold",
    fontSize: 7.5,
    marginTop: 4,
  },
  // Column widths - adjusted for 10 columns to match sample
  colAccountNo: { width: "8%", paddingRight: 2 },
  colParticular: { width: "24%", paddingRight: 4 },
  colBalBF: { width: "8.5%", textAlign: "right", paddingRight: 4 },
  colCurrent: { width: "8.5%", textAlign: "right", paddingRight: 4 },
  colPayment: { width: "8.5%", textAlign: "right", paddingRight: 4 },
  colTotalDue: { width: "8.5%", textAlign: "right", paddingRight: 4 },
  colAgingCurrent: { width: "8.5%", textAlign: "right", paddingRight: 4 },
  colAging1Month: { width: "8.5%", textAlign: "right", paddingRight: 4 },
  colAging2Months: { width: "8.5%", textAlign: "right", paddingRight: 4 },
  colAging3Plus: { width: "8.5%", textAlign: "right" },
});

// Helper function for currency formatting
const formatCurrency = (amount: number): string => {
  if (amount === 0) return ".00";
  // Handle negative numbers
  const isNegative = amount < 0;
  const absAmount = Math.abs(amount);
  const formatted = absAmount.toLocaleString("en-MY", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return isNegative ? `-${formatted}` : formatted;
};

// Header component that renders on each page
const PageHeader: React.FC<{
  statement_date: string;
  report_datetime: string;
  reportDateStr: string;
  pageNumber: number;
  showReportDatetime?: boolean;
}> = ({ statement_date, reportDateStr, pageNumber, report_datetime, showReportDatetime = false }) => (
  <View style={styles.headerSection}>
    <View style={styles.headerTopRow}>
      <View style={{ width: 220 }} />
      <View style={styles.headerCenter}>
        <Text style={styles.companyName}>
          TIEN HOCK FOOD INDUSTRIES SDN BHD (953309-T)
        </Text>
        <Text style={styles.title}>
          TRADE DEBTOR LIST AS AT {statement_date}
        </Text>
      </View>
      <Text style={styles.reportInfoRight}>
        REPORT DATE : {reportDateStr}          PAGE : {pageNumber}
      </Text>
    </View>
    {showReportDatetime && (
      <Text style={styles.reportDateLeft}>
        REPORT DATE : {report_datetime}
      </Text>
    )}
  </View>
);

// Table header component
const TableHeader: React.FC = () => (
  <>
    <View style={styles.tableHeader}>
      <Text style={styles.colAccountNo}>ACCOUNT NO</Text>
      <Text style={styles.colParticular}>PARTICULAR</Text>
      <Text style={styles.colBalBF}>BAL B/F($)</Text>
      <Text style={styles.colCurrent}>CURRENT ($)</Text>
      <Text style={styles.colPayment}>PAYMENT($)</Text>
      <Text style={styles.colTotalDue}>TOTAL DUE($)</Text>
      <Text style={styles.colAgingCurrent}>CURRENT ($)</Text>
      <Text style={styles.colAging1Month}>1 MONTH ($)</Text>
      <Text style={styles.colAging2Months}>2 MONTHS($)</Text>
      <Text style={styles.colAging3Plus}>ABV 3 MTHS ($)</Text>
    </View>
    <View style={styles.singleLine} />
  </>
);

// Data row component
const DataRow: React.FC<{ customer: CustomerRow }> = ({ customer }) => (
  <View style={styles.tableRow} wrap={false}>
    <Text style={styles.colAccountNo}>{customer.account_no}</Text>
    <Text style={styles.colParticular}>
      {customer.particular.length > 38
        ? customer.particular.substring(0, 38)
        : customer.particular}
    </Text>
    <Text style={styles.colBalBF}>{formatCurrency(customer.bal_bf)}</Text>
    <Text style={styles.colCurrent}>{formatCurrency(customer.current_invoices)}</Text>
    <Text style={styles.colPayment}>{formatCurrency(customer.payment)}</Text>
    <Text style={styles.colTotalDue}>{formatCurrency(customer.total_due)}</Text>
    <Text style={styles.colAgingCurrent}>{formatCurrency(customer.aging_current)}</Text>
    <Text style={styles.colAging1Month}>{formatCurrency(customer.aging_1_month)}</Text>
    <Text style={styles.colAging2Months}>{formatCurrency(customer.aging_2_months)}</Text>
    <Text style={styles.colAging3Plus}>{formatCurrency(customer.aging_3_plus)}</Text>
  </View>
);

// PDF Component using manual pagination
const GeneralStatementPDF: React.FC<{ data: GeneralStatementData }> = ({
  data,
}) => {
  const { statement_date, report_datetime, customers, totals } = data;

  // Format report date for header
  const reportDateStr = new Date()
    .toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    })
    .toUpperCase();

  // Calculate rows per page - first page has fewer due to report datetime line
  const ROWS_FIRST_PAGE = 32;
  const ROWS_PER_PAGE = 34;

  // Split customers into pages
  const pages: CustomerRow[][] = [];
  let remaining = [...customers];

  // First page
  if (remaining.length > 0) {
    pages.push(remaining.slice(0, ROWS_FIRST_PAGE));
    remaining = remaining.slice(ROWS_FIRST_PAGE);
  }

  // Subsequent pages
  while (remaining.length > 0) {
    pages.push(remaining.slice(0, ROWS_PER_PAGE));
    remaining = remaining.slice(ROWS_PER_PAGE);
  }

  // If no customers, still show at least one page
  if (pages.length === 0) {
    pages.push([]);
  }

  const totalPages = pages.length;

  return (
    <Document title={`Trade Debtor List as at ${statement_date}`}>
      {pages.map((pageCustomers, pageIndex) => (
        <Page key={pageIndex} size="A4" orientation="landscape" style={styles.page}>
          {/* Page Header */}
          <PageHeader
            statement_date={statement_date}
            report_datetime={report_datetime}
            reportDateStr={reportDateStr}
            pageNumber={pageIndex + 1}
            showReportDatetime={pageIndex === 0}
          />

          {/* Double line after header */}
          <View style={styles.doubleLine} />

          {/* Table */}
          <View style={styles.table}>
            {/* Column Headers */}
            <TableHeader />

            {/* Data Rows */}
            {pageCustomers.map((customer, index) => (
              <DataRow key={index} customer={customer} />
            ))}

            {/* Totals Row - only on last page */}
            {pageIndex === totalPages - 1 && (
              <>
                <View style={styles.singleLine} />
                <View style={styles.totalRow}>
                  <Text style={styles.colAccountNo}></Text>
                  <Text style={styles.colParticular}>TOTAL BALANCE TO DATE</Text>
                  <Text style={styles.colBalBF}>{formatCurrency(totals.bal_bf)}</Text>
                  <Text style={styles.colCurrent}>{formatCurrency(totals.current_invoices)}</Text>
                  <Text style={styles.colPayment}>{formatCurrency(totals.payment)}</Text>
                  <Text style={styles.colTotalDue}>{formatCurrency(totals.total_due)}</Text>
                  <Text style={styles.colAgingCurrent}>{formatCurrency(totals.aging_current)}</Text>
                  <Text style={styles.colAging1Month}>{formatCurrency(totals.aging_1_month)}</Text>
                  <Text style={styles.colAging2Months}>{formatCurrency(totals.aging_2_months)}</Text>
                  <Text style={styles.colAging3Plus}>{formatCurrency(totals.aging_3_plus)}</Text>
                </View>
                <View style={styles.doubleLine} />
              </>
            )}
          </View>
        </Page>
      ))}
    </Document>
  );
};

// PDF Generation Function
export const generateGeneralStatementPDF = async (
  data: GeneralStatementData,
  action: "download" | "print"
): Promise<void> => {
  try {
    const doc = <GeneralStatementPDF data={data} />;
    const pdfBlob = await pdf(doc).toBlob();

    if (action === "download") {
      const url = URL.createObjectURL(pdfBlob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `Trade_Debtor_List_${data.statement_date.replace(/\//g, "_")}.pdf`;
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
    console.error("Error generating general statement PDF:", error);
    throw error;
  }
};

export default GeneralStatementPDF;
