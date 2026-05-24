// src/utils/adjustments/PDF/AdjustmentDocPDF.tsx
// Adjustment-doc (CN/DN/RN) PDF — mirrors the formal MyInvois e-Invoice layout
// from EInvoicePDF.tsx / InvoiceSoloPDF.tsx. QR + UUID + validation footer
// render only when `qrCodeData` is provided (i.e. the doc is a valid e-invoice).
import React from "react";
import { Page, StyleSheet, View, Text, Image } from "@react-pdf/renderer";
import { AdjustmentDocType } from "../../../types/types";
import { CompanyInfo, JELLYPOLLY_INFO } from "../../invoice/einvoice/companyInfo";
import TienHockLogo from "../../tienhock.png";

const stateOptions = [
  { id: "01", name: "Johor" },
  { id: "02", name: "Kedah" },
  { id: "03", name: "Kelantan" },
  { id: "04", name: "Melaka" },
  { id: "05", name: "Negeri Sembilan" },
  { id: "06", name: "Pahang" },
  { id: "07", name: "Pulau Pinang" },
  { id: "08", name: "Perak" },
  { id: "09", name: "Perlis" },
  { id: "10", name: "Selangor" },
  { id: "11", name: "Terengganu" },
  { id: "12", name: "Sabah" },
  { id: "13", name: "Sarawak" },
  { id: "14", name: "Wilayah Persekutuan Kuala Lumpur" },
  { id: "15", name: "Wilayah Persekutuan Labuan" },
  { id: "16", name: "Wilayah Persekutuan Putrajaya" },
  { id: "17", name: "N/A" },
];

const getStateName = (stateId: string): string => {
  const state = stateOptions.find((s) => s.id === stateId);
  return state ? state.name : stateId;
};

const formatTime12Hour = (timeString: string): string => {
  const [hours, minutes] = timeString.split(":").map(Number);
  if (isNaN(hours) || isNaN(minutes)) return timeString;
  const period = hours >= 12 ? "PM" : "AM";
  const displayHours = hours === 0 ? 12 : hours > 12 ? hours - 12 : hours;
  return `${displayHours}:${minutes.toString().padStart(2, "0")} ${period}`;
};

const TYPE_LABEL: Record<AdjustmentDocType, { title: string; footer: string }> = {
  credit_note: { title: "CREDIT NOTE", footer: "Credit Note" },
  debit_note: { title: "DEBIT NOTE", footer: "Debit Note" },
  refund_note: { title: "REFUND NOTE", footer: "Refund Note" },
};

export interface AdjustmentDocPDFData {
  company: CompanyInfo;
  doc: {
    id: string;
    type: AdjustmentDocType;
    originalInvoiceId: string;
    uuid: string;
    long_id: string;
    datetime_validated: string;
    submission_id: string;
    rounding: number;
    date: string;
    time: string;
    reason: string | null;
    refund?: {
      method: string | null;
      bank_account: string | null;
      reference: string | null;
    };
  };
  buyer: {
    name: string;
    tin: string;
    reg_no: string;
    sst_no: string | null;
    address: string;
    city: string;
    state: string;
    contact: string;
    email: string;
  };
  amounts: {
    subtotal: number;
    tax: number;
    total: number;
  };
  orderDetails: Array<{
    description: string;
    qty: number;
    price: string | number;
    total: string | number;
    tax: number;
  }>;
}

const styles = StyleSheet.create({
  page: {
    padding: 20,
    fontSize: 9,
    fontFamily: "Helvetica",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  companySection: {
    flexDirection: "row",
    flex: 1,
    marginRight: 15,
  },
  logo: {
    width: 70,
    height: 70,
    marginRight: 12,
  },
  companyInfo: {
    flex: 1,
    justifyContent: "center",
    color: "#111827",
  },
  companyName: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    marginBottom: 2,
  },
  companyDetail: {
    fontSize: 9,
    marginBottom: 1,
    lineHeight: 1.3,
  },
  qrCode: {
    width: 70,
    height: 70,
    alignSelf: "flex-start",
  },
  title: {
    fontSize: 12,
    fontFamily: "Helvetica-Bold",
    marginBottom: 8,
    textAlign: "right",
    letterSpacing: 0.5,
  },
  invoiceDetails: {
    marginBottom: 6,
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  detailLabel: {
    fontFamily: "Helvetica-Bold",
    width: 140,
  },
  detailValue: {
    flex: 1,
    textAlign: "right",
  },
  infoContainer: {
    flexDirection: "row",
    gap: 8,
  },
  infoBox: {
    flex: 1,
    border: "1 solid #9CA3AF",
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  infoTitle: {
    fontFamily: "Helvetica-Bold",
    marginBottom: 6,
    textTransform: "uppercase",
  },
  infoRow: {
    flexDirection: "row",
    lineHeight: 0.75,
  },
  infoLabel: {
    width: "35%",
    paddingRight: 6,
  },
  infoValue: {
    flex: 1,
  },
  reasonBlock: {
    marginTop: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: "#F9FAFB",
    borderRadius: 4,
    borderLeftWidth: 2,
    borderLeftColor: "#9CA3AF",
  },
  reasonLabel: {
    fontFamily: "Helvetica-Bold",
    fontSize: 9,
    marginBottom: 2,
  },
  reasonText: {
    fontSize: 9,
    fontStyle: "italic",
    color: "#374151",
  },
  bold: {
    fontFamily: "Helvetica-Bold",
  },
  table: {
    marginTop: 16,
    marginBottom: 16,
  },
  tableHeader: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#000",
    paddingBottom: 4,
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: "#666",
    paddingVertical: 4,
  },
  classCol: { width: "8%" },
  itemNameCol: { width: "44%" },
  qtyCol: { width: "5%", textAlign: "center" },
  priceCol: { width: "11%", textAlign: "right" },
  subtotalCol: { width: "11%", textAlign: "right" },
  taxCol: { width: "10%", textAlign: "right" },
  totalCol: { width: "11%", textAlign: "right" },
  headerText: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
  },
  cellText: { fontSize: 9 },
  summary: { alignItems: "flex-end" },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginBottom: 4,
  },
  summaryLabel: { width: 160, textAlign: "right" },
  summaryValue: { width: 60, textAlign: "right" },
  refundBlock: {
    marginTop: 14,
    padding: 8,
    borderWidth: 1,
    borderColor: "#C7D2FE",
    backgroundColor: "#EEF2FF",
    borderRadius: 4,
  },
  refundTitle: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    color: "#3730A3",
    marginBottom: 4,
  },
  refundRow: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  refundCell: {
    marginRight: 24,
    fontSize: 9,
    color: "#1F2937",
  },
  footer: {
    position: "absolute",
    bottom: 20,
    left: 0,
    right: 0,
    textAlign: "center",
    color: "#6B7280",
    fontSize: 8,
    lineHeight: 1.5,
  },
});

interface Props {
  data: AdjustmentDocPDFData;
  qrCodeData?: string | null;
  companyContext?: "tienhock" | "jellypolly";
}

const AdjustmentDocPDF: React.FC<Props> = ({
  data,
  qrCodeData,
  companyContext = "tienhock",
}) => {
  const isValidated = Boolean(qrCodeData);
  const typeMeta = TYPE_LABEL[data.doc.type];
  const isJP = companyContext === "jellypolly";

  // Supplier display fields: for JP, override name/TIN/BRN; otherwise use company info as-is.
  const supplierName = isJP
    ? "JELLY POLLY FOOD INDUSTRIES"
    : data.company.name;
  const supplierTin = isJP ? JELLYPOLLY_INFO.tin : data.company.tin;
  const supplierRegNo = isJP ? JELLYPOLLY_INFO.reg_no : data.company.reg_no;

  return (
    <Page size="A4" style={styles.page}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.companySection}>
          <Image src={TienHockLogo} style={styles.logo} />
          <View style={styles.companyInfo}>
            <Text style={styles.companyName}>{supplierName}</Text>
            <Text style={styles.companyDetail}>Reg. No: {supplierRegNo}</Text>
            <Text style={styles.companyDetail}>{data.company.address_pdf}</Text>
            <Text style={styles.companyDetail}>
              {data.company.postcode}, {data.company.city_pdf},{" "}
              {data.company.state_pdf}
            </Text>
            <Text style={styles.companyDetail}>Tel: {data.company.phone}</Text>
            <Text style={styles.companyDetail}>
              Email: {data.company.email}
            </Text>
          </View>
        </View>
        {qrCodeData && <Image src={qrCodeData} style={styles.qrCode} />}
      </View>

      {/* Title */}
      <Text style={styles.title}>{typeMeta.title}</Text>

      {/* Doc details */}
      <View style={styles.invoiceDetails}>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Doc No.</Text>
          <Text style={styles.detailValue}>{data.doc.id}</Text>
        </View>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Original Invoice No.</Text>
          <Text style={styles.detailValue}>{data.doc.originalInvoiceId}</Text>
        </View>
        {isValidated && data.doc.uuid && (
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Unique ID No.</Text>
            <Text style={styles.detailValue}>{data.doc.uuid}</Text>
          </View>
        )}
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Issue Date & Time</Text>
          <Text style={styles.detailValue}>
            {data.doc.date} {formatTime12Hour(data.doc.time)}
          </Text>
        </View>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Currency</Text>
          <Text style={styles.detailValue}>MYR</Text>
        </View>
      </View>

      {/* FROM / BILLING TO */}
      <View style={styles.infoContainer}>
        <View style={styles.infoBox}>
          <Text style={styles.infoTitle}>FROM</Text>
          <View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Supplier TIN</Text>
              <Text style={styles.infoValue}>{supplierTin}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Supplier Name</Text>
              <Text style={styles.infoValue}>{supplierName}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Supplier BRN:</Text>
              <Text style={styles.infoValue}>{supplierRegNo}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Supplier SST No.</Text>
              <Text style={styles.infoValue}>
                {data.company.sst_id_pdf || "N/A"}
              </Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Billing Address</Text>
              <Text style={styles.infoValue}>{data.company.address_pdf}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Contact No.</Text>
              <Text style={styles.infoValue}>{data.company.phone}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Email</Text>
              <Text style={styles.infoValue}>{data.company.email}</Text>
            </View>
          </View>
        </View>

        <View style={styles.infoBox}>
          <Text style={styles.infoTitle}>BILLING TO</Text>
          <View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Customer TIN</Text>
              <Text style={styles.infoValue}>{data.buyer.tin || "-"}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Customer Name</Text>
              <Text style={styles.infoValue}>{data.buyer.name || "-"}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Customer Reg No.</Text>
              <Text style={styles.infoValue}>{data.buyer.reg_no || "-"}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Customer SST No.</Text>
              <Text style={styles.infoValue}>{data.buyer.sst_no || "N/A"}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Billing Address</Text>
              <Text style={styles.infoValue}>
                {data.buyer.address
                  ? `${data.buyer.address}${
                      data.buyer.city && data.buyer.state
                        ? `, ${data.buyer.city}, ${getStateName(data.buyer.state)}`
                        : ""
                    }`
                  : "-"}
              </Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Contact No.</Text>
              <Text style={styles.infoValue}>{data.buyer.contact || "-"}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Email</Text>
              <Text style={styles.infoValue}>{data.buyer.email || "-"}</Text>
            </View>
          </View>
        </View>
      </View>

      {/* Reason */}
      {data.doc.reason && (
        <View style={styles.reasonBlock}>
          <Text style={styles.reasonLabel}>Reason</Text>
          <Text style={styles.reasonText}>{data.doc.reason}</Text>
        </View>
      )}

      {/* Items table */}
      <View style={styles.table}>
        <View style={styles.tableHeader}>
          <Text style={[styles.classCol, styles.headerText]}>Class</Text>
          <Text style={[styles.itemNameCol, styles.headerText]}>
            Product Name
          </Text>
          <Text style={[styles.qtyCol, styles.headerText]}>Qty</Text>
          <Text style={[styles.priceCol, styles.headerText]}>U. Price</Text>
          <Text style={[styles.subtotalCol, styles.headerText]}>Subtotal</Text>
          <Text style={[styles.taxCol, styles.headerText]}>Tax</Text>
          <Text style={[styles.totalCol, styles.headerText]}>Total</Text>
        </View>

        {data.orderDetails && data.orderDetails.length > 0 ? (
          data.orderDetails.map((item, index) => (
            <View key={index} style={styles.tableRow}>
              <Text style={[styles.classCol, styles.cellText]}>022</Text>
              <Text style={[styles.itemNameCol, styles.cellText]}>
                {item.description}
              </Text>
              <Text style={[styles.qtyCol, styles.cellText]}>{item.qty}</Text>
              <Text style={[styles.priceCol, styles.cellText]}>
                {Number(item.price).toFixed(2)}
              </Text>
              <Text style={[styles.subtotalCol, styles.cellText]}>
                {(item.qty * Number(item.price)).toFixed(2)}
              </Text>
              <Text style={[styles.taxCol, styles.cellText]}>
                {Number(item.tax || 0).toFixed(2)}
              </Text>
              <Text style={[styles.totalCol, styles.cellText]}>
                {Number(item.total).toFixed(2)}
              </Text>
            </View>
          ))
        ) : (
          <View style={styles.tableRow}>
            <Text
              style={[
                styles.itemNameCol,
                styles.cellText,
                { textAlign: "center" },
              ]}
            >
              No item details available
            </Text>
            <Text style={[styles.qtyCol, styles.cellText]}></Text>
            <Text style={[styles.priceCol, styles.cellText]}></Text>
            <Text style={[styles.subtotalCol, styles.cellText]}></Text>
            <Text style={[styles.taxCol, styles.cellText]}></Text>
            <Text style={[styles.totalCol, styles.cellText]}></Text>
          </View>
        )}
      </View>

      {/* Summary */}
      <View style={styles.summary}>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Total Excl. Tax (MYR)</Text>
          <Text style={styles.summaryValue}>
            {data.amounts.subtotal?.toFixed(2) || "0.00"}
          </Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Tax Amount (MYR)</Text>
          <Text style={styles.summaryValue}>
            {data.amounts.tax?.toFixed(2) || "0.00"}
          </Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Total Incl. Tax (MYR)</Text>
          <Text style={styles.summaryValue}>
            {((data.amounts.subtotal || 0) + (data.amounts.tax || 0)).toFixed(2)}
          </Text>
        </View>
        {data.doc.rounding > 0 && (
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Total Rounding (MYR)</Text>
            <Text style={styles.summaryValue}>
              {data.doc.rounding.toFixed(2)}
            </Text>
          </View>
        )}
        <View style={[styles.summaryRow, styles.bold]}>
          <Text style={styles.summaryLabel}>Total Payable Amount (MYR)</Text>
          <Text style={styles.summaryValue}>
            {data.amounts.total?.toFixed(2) || "0.00"}
          </Text>
        </View>
      </View>

      {/* Refund Details (RN only) */}
      {data.doc.type === "refund_note" && data.doc.refund && (
        <View style={styles.refundBlock}>
          <Text style={styles.refundTitle}>Refund Details</Text>
          <View style={styles.refundRow}>
            <Text style={styles.refundCell}>
              <Text style={styles.bold}>Method: </Text>
              {data.doc.refund.method
                ? data.doc.refund.method.replace("_", " ")
                : "—"}
            </Text>
            <Text style={styles.refundCell}>
              <Text style={styles.bold}>Bank Account: </Text>
              {data.doc.refund.bank_account || "—"}
            </Text>
            <Text style={styles.refundCell}>
              <Text style={styles.bold}>Reference: </Text>
              {data.doc.refund.reference || "—"}
            </Text>
          </View>
        </View>
      )}

      {/* Footer */}
      <Text style={styles.footer}>
        This document is computer generated {typeMeta.footer}.
        {isValidated && data.doc.datetime_validated && (
          <>
            {"\n"}
            Validated on{" "}
            {new Date(data.doc.datetime_validated).toLocaleString("en-GB", {
              timeZone: "Asia/Kuala_Lumpur",
              hour12: true,
            })}
          </>
        )}
      </Text>
    </Page>
  );
};

export default AdjustmentDocPDF;
