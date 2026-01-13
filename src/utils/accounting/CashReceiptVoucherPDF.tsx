import React from "react";
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  pdf,
  Image,
} from "@react-pdf/renderer";
import TienHockLogo from "../tienhock.png";
import { TIENHOCK_INFO } from "../invoice/einvoice/companyInfo";
import { CashReceiptVoucherData } from "../../types/types";

const colors = {
  textPrimary: "#0f172a",
  textSecondary: "#475569",
  textMuted: "#64748b",
  borderDark: "#334155",
  border: "#cbd5e1",
  borderLight: "#e2e8f0",
  header: {
    companyName: "#1e293b",
    companyDetails: "#334155",
  },
};

const styles = StyleSheet.create({
  page: {
    paddingTop: 20,
    paddingBottom: 40,
    paddingLeft: 40,
    paddingRight: 40,
    fontFamily: "Helvetica",
    fontSize: 9,
    color: colors.textPrimary,
  },
  // Header section
  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 15,
    paddingBottom: 10,
    borderBottomWidth: 2,
    borderBottomColor: colors.borderDark,
  },
  headerTextContainer: {
    flex: 1,
  },
  logo: {
    width: 50,
    height: 50,
    marginRight: 15,
  },
  companyName: {
    fontSize: 14,
    fontFamily: "Helvetica-Bold",
    color: colors.header.companyName,
  },
  companyDetails: {
    fontSize: 8,
    color: colors.header.companyDetails,
    marginTop: 2,
  },
  // Title section
  titleContainer: {
    alignItems: "center",
    marginBottom: 15,
  },
  title: {
    fontSize: 14,
    fontFamily: "Helvetica-Bold",
    color: colors.textPrimary,
    letterSpacing: 1,
  },
  // Voucher info row
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 15,
    paddingHorizontal: 5,
  },
  infoItem: {
    flexDirection: "row",
  },
  infoLabel: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    color: colors.textSecondary,
  },
  infoValue: {
    fontSize: 9,
    color: colors.textPrimary,
    marginLeft: 5,
  },
  // Main content box
  contentBox: {
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 15,
  },
  contentRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  contentRowLast: {
    borderBottomWidth: 0,
  },
  contentLabel: {
    width: "30%",
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    color: colors.textSecondary,
  },
  contentValue: {
    width: "70%",
    fontSize: 9,
    color: colors.textPrimary,
  },
  // Amount section
  amountSection: {
    backgroundColor: "#f8fafc",
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  amountRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  amountLabel: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    color: colors.textSecondary,
  },
  amountValue: {
    fontSize: 14,
    fontFamily: "Helvetica-Bold",
    color: colors.textPrimary,
  },
  amountInWords: {
    fontSize: 8,
    color: colors.textMuted,
    marginTop: 4,
    fontStyle: "italic",
  },
  // Journal entry table
  tableContainer: {
    marginBottom: 15,
  },
  tableTitle: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    color: colors.textPrimary,
    marginBottom: 8,
  },
  table: {
    borderWidth: 1,
    borderColor: colors.border,
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: "#f1f5f9",
    borderBottomWidth: 1,
    borderBottomColor: colors.borderDark,
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: colors.borderLight,
  },
  tableFooter: {
    flexDirection: "row",
    backgroundColor: "#f1f5f9",
    borderTopWidth: 1,
    borderTopColor: colors.borderDark,
  },
  cellAccount: {
    width: "50%",
    paddingVertical: 6,
    paddingHorizontal: 8,
    fontSize: 8,
  },
  cellDebit: {
    width: "25%",
    paddingVertical: 6,
    paddingHorizontal: 8,
    textAlign: "right",
    fontFamily: "Courier",
    fontSize: 8,
  },
  cellCredit: {
    width: "25%",
    paddingVertical: 6,
    paddingHorizontal: 8,
    textAlign: "right",
    fontFamily: "Courier",
    fontSize: 8,
  },
  headerCell: {
    fontFamily: "Helvetica-Bold",
    fontSize: 8,
    color: colors.textPrimary,
  },
  footerCell: {
    fontFamily: "Helvetica-Bold",
    fontSize: 8,
  },
  // Signature section
  signatureSection: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 30,
    paddingHorizontal: 20,
  },
  signatureBox: {
    width: "40%",
    alignItems: "center",
  },
  signatureLine: {
    width: "100%",
    borderBottomWidth: 1,
    borderBottomColor: colors.textPrimary,
    marginBottom: 5,
    height: 40,
  },
  signatureLabel: {
    fontSize: 8,
    color: colors.textSecondary,
  },
  // Footer
  footer: {
    position: "absolute",
    bottom: 20,
    left: 40,
    right: 40,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 7,
    color: colors.textMuted,
  },
});

// Convert number to words (Malaysian Ringgit)
const numberToWords = (amount: number): string => {
  const ones = [
    "",
    "One",
    "Two",
    "Three",
    "Four",
    "Five",
    "Six",
    "Seven",
    "Eight",
    "Nine",
    "Ten",
    "Eleven",
    "Twelve",
    "Thirteen",
    "Fourteen",
    "Fifteen",
    "Sixteen",
    "Seventeen",
    "Eighteen",
    "Nineteen",
  ];
  const tens = [
    "",
    "",
    "Twenty",
    "Thirty",
    "Forty",
    "Fifty",
    "Sixty",
    "Seventy",
    "Eighty",
    "Ninety",
  ];

  const convertLessThanThousand = (n: number): string => {
    if (n === 0) return "";
    if (n < 20) return ones[n];
    if (n < 100) {
      return tens[Math.floor(n / 10)] + (n % 10 ? " " + ones[n % 10] : "");
    }
    return (
      ones[Math.floor(n / 100)] +
      " Hundred" +
      (n % 100 ? " and " + convertLessThanThousand(n % 100) : "")
    );
  };

  const wholeNumber = Math.floor(amount);
  const cents = Math.round((amount - wholeNumber) * 100);

  if (wholeNumber === 0 && cents === 0) return "Zero Ringgit Only";

  let result = "";

  if (wholeNumber >= 1000000) {
    result +=
      convertLessThanThousand(Math.floor(wholeNumber / 1000000)) + " Million ";
    const remainder = wholeNumber % 1000000;
    if (remainder >= 1000) {
      result +=
        convertLessThanThousand(Math.floor(remainder / 1000)) + " Thousand ";
    }
    if (remainder % 1000 > 0) {
      result += convertLessThanThousand(remainder % 1000);
    }
  } else if (wholeNumber >= 1000) {
    result +=
      convertLessThanThousand(Math.floor(wholeNumber / 1000)) + " Thousand ";
    if (wholeNumber % 1000 > 0) {
      result += convertLessThanThousand(wholeNumber % 1000);
    }
  } else {
    result = convertLessThanThousand(wholeNumber);
  }

  result = result.trim() + " Ringgit";

  if (cents > 0) {
    result += " and " + convertLessThanThousand(cents) + " Sen";
  }

  return result + " Only";
};

const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat("en-MY", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
};

const formatDate = (dateStr: string): string => {
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

const formatPaymentMethod = (method: string): string => {
  const methods: Record<string, string> = {
    cash: "Cash",
    cheque: "Cheque",
    bank_transfer: "Bank Transfer",
    online: "Online Transfer",
  };
  return methods[method] || method;
};

interface CashReceiptVoucherDocumentProps {
  data: CashReceiptVoucherData;
}

const CashReceiptVoucherDocument: React.FC<CashReceiptVoucherDocumentProps> = ({
  data,
}) => {
  const totalDebit = data.lines.reduce((sum, line) => sum + line.debit_amount, 0);
  const totalCredit = data.lines.reduce(
    (sum, line) => sum + line.credit_amount,
    0
  );

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <Image src={TienHockLogo} style={styles.logo} />
          <View style={styles.headerTextContainer}>
            <Text style={styles.companyName}>{TIENHOCK_INFO.name}</Text>
            <Text style={styles.companyDetails}>
              {TIENHOCK_INFO.reg_no} | {TIENHOCK_INFO.address_pdf}
            </Text>
            <Text style={styles.companyDetails}>
              Tel: {TIENHOCK_INFO.phone} | Email: {TIENHOCK_INFO.email}
            </Text>
          </View>
        </View>

        {/* Title */}
        <View style={styles.titleContainer}>
          <Text style={styles.title}>CASH RECEIPT VOUCHER</Text>
        </View>

        {/* Voucher Info Row */}
        <View style={styles.infoRow}>
          <View style={styles.infoItem}>
            <Text style={styles.infoLabel}>Voucher No:</Text>
            <Text style={styles.infoValue}>{data.voucher_number}</Text>
          </View>
          <View style={styles.infoItem}>
            <Text style={styles.infoLabel}>Date:</Text>
            <Text style={styles.infoValue}>{formatDate(data.voucher_date)}</Text>
          </View>
        </View>

        {/* Main Content Box */}
        <View style={styles.contentBox}>
          {/* Amount Section */}
          <View style={styles.amountSection}>
            <View style={styles.amountRow}>
              <Text style={styles.amountLabel}>AMOUNT RECEIVED</Text>
              <Text style={styles.amountValue}>RM {formatCurrency(data.amount)}</Text>
            </View>
            <Text style={styles.amountInWords}>{numberToWords(data.amount)}</Text>
          </View>

          {/* Received From */}
          <View style={styles.contentRow}>
            <Text style={styles.contentLabel}>Received From:</Text>
            <Text style={styles.contentValue}>{data.customer_name}</Text>
          </View>

          {/* Being Payment For */}
          <View style={styles.contentRow}>
            <Text style={styles.contentLabel}>Being Payment For:</Text>
            <Text style={styles.contentValue}>Invoice #{data.invoice_id}</Text>
          </View>

          {/* Payment Method */}
          <View style={styles.contentRow}>
            <Text style={styles.contentLabel}>Payment Method:</Text>
            <Text style={styles.contentValue}>
              {formatPaymentMethod(data.payment_method)}
            </Text>
          </View>

          {/* Payment Reference (if any) */}
          {data.payment_reference && (
            <View style={styles.contentRow}>
              <Text style={styles.contentLabel}>Reference:</Text>
              <Text style={styles.contentValue}>{data.payment_reference}</Text>
            </View>
          )}

          {/* Deposited To */}
          <View style={[styles.contentRow, styles.contentRowLast]}>
            <Text style={styles.contentLabel}>Deposited To:</Text>
            <Text style={styles.contentValue}>
              {data.bank_account_description} ({data.bank_account})
            </Text>
          </View>
        </View>

        {/* Journal Entry Table */}
        <View style={styles.tableContainer}>
          <Text style={styles.tableTitle}>JOURNAL ENTRY</Text>
          <View style={styles.table}>
            {/* Table Header */}
            <View style={styles.tableHeader}>
              <Text style={[styles.cellAccount, styles.headerCell]}>Account</Text>
              <Text style={[styles.cellDebit, styles.headerCell]}>Debit (RM)</Text>
              <Text style={[styles.cellCredit, styles.headerCell]}>
                Credit (RM)
              </Text>
            </View>

            {/* Table Body */}
            {data.lines.map((line, index) => (
              <View key={index} style={styles.tableRow}>
                <Text style={styles.cellAccount}>
                  {line.account_code} - {line.account_description}
                </Text>
                <Text style={styles.cellDebit}>
                  {line.debit_amount > 0 ? formatCurrency(line.debit_amount) : "-"}
                </Text>
                <Text style={styles.cellCredit}>
                  {line.credit_amount > 0
                    ? formatCurrency(line.credit_amount)
                    : "-"}
                </Text>
              </View>
            ))}

            {/* Table Footer - Totals */}
            <View style={styles.tableFooter}>
              <Text style={[styles.cellAccount, styles.footerCell]}>TOTAL</Text>
              <Text style={[styles.cellDebit, styles.footerCell]}>
                {formatCurrency(totalDebit)}
              </Text>
              <Text style={[styles.cellCredit, styles.footerCell]}>
                {formatCurrency(totalCredit)}
              </Text>
            </View>
          </View>
        </View>

        {/* Signature Section */}
        <View style={styles.signatureSection}>
          <View style={styles.signatureBox}>
            <View style={styles.signatureLine} />
            <Text style={styles.signatureLabel}>Received By</Text>
          </View>
          <View style={styles.signatureBox}>
            <View style={styles.signatureLine} />
            <Text style={styles.signatureLabel}>Approved By</Text>
          </View>
        </View>

        {/* Footer */}
        <View style={styles.footer} fixed>
          <Text>
            Generated: {new Date().toLocaleString("en-MY")}
            {data.created_by && ` | Created by: ${data.created_by}`}
          </Text>
          <Text>Payment ID: {data.payment_id}</Text>
        </View>
      </Page>
    </Document>
  );
};

// Export for direct PDF generation/download
export const generateCashReceiptVoucherPDF = async (
  data: CashReceiptVoucherData
): Promise<Blob> => {
  const blob = await pdf(<CashReceiptVoucherDocument data={data} />).toBlob();
  return blob;
};

// Export for downloading
export const downloadCashReceiptVoucherPDF = async (
  data: CashReceiptVoucherData
): Promise<void> => {
  const blob = await generateCashReceiptVoucherPDF(data);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `Receipt_Voucher_${data.voucher_number.replace("/", "_")}.pdf`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

// Export the document component for BlobProvider usage in modal
export { CashReceiptVoucherDocument };
