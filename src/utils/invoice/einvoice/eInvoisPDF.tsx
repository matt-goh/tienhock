// src/utils/invoice/einvoice/eInvoisPDF.tsx
import React from "react";
import { Page, StyleSheet, View, Text, Image } from "@react-pdf/renderer";
import { EInvoicePDFData } from "../../../services/einvoice-pdf.service";

// State mapping
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
  const state = stateOptions.find((state) => state.id === stateId);
  return state ? state.name : stateId;
};

// Define styles
const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontSize: 10,
    fontFamily: "Helvetica",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 20,
  },
  section: {
    marginBottom: 20,
  },
  companySection: {
    flexDirection: "row",
    flex: 1,
    marginRight: 20,
  },
  logo: {
    width: 80,
    height: 80,
    marginRight: 15,
  },
  companyInfo: {
    flex: 1,
    justifyContent: "center",
    color: "#111827",
  },
  companyName: {
    fontFamily: "Helvetica-Bold",
    marginBottom: 4,
  },
  companyDetail: {
    fontSize: 9,
    marginBottom: 2,
  },
  qrCode: {
    width: 75,
    height: 75,
    alignSelf: "flex-start",
  },
  title: {
    fontSize: 14,
    fontFamily: "Helvetica-Bold",
    marginBottom: 15,
    textAlign: "center",
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  col50: {
    width: "50%",
    paddingRight: 10,
    marginBottom: 8,
  },
  label: {
    color: "#6B7280",
    marginBottom: 2,
    fontSize: 8,
  },
  value: {
    fontSize: 9,
  },
  bold: {
    fontFamily: "Helvetica-Bold",
  },
  table: {
    marginTop: 15,
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: "#F9FAFB",
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
    padding: 8,
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
    padding: 8,
  },
  tableCell: {
    fontSize: 9,
  },
  summary: {
    marginTop: 20,
    alignItems: "flex-end",
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginBottom: 4,
  },
  summaryLabel: {
    width: 100,
    textAlign: "right",
    marginRight: 10,
  },
  summaryValue: {
    width: 80,
    textAlign: "right",
  },
  footer: {
    position: "absolute",
    bottom: 30,
    left: 0,
    right: 0,
    textAlign: "center",
    color: "#6B7280",
    fontSize: 8,
  },
});

interface Props {
  data: EInvoicePDFData;
  qrCodeData: string;
}

const EInvoisPDF: React.FC<Props> = ({ data, qrCodeData }) => {
  return (
    <Page size="A4" style={styles.page}>
      {/* Header Section */}
      <View style={styles.header}>
        <View style={styles.companySection}>
          <Image src="../tienhock.png" style={styles.logo} />
          <View style={styles.companyInfo}>
            <Text style={styles.companyName}>{data.company.name || ""}</Text>
            <Text style={styles.companyDetail}>
              Reg. No: {data.company.reg_no || ""}
            </Text>
            <Text style={styles.companyDetail}>
              {data.company.address || ""}
            </Text>
            <Text style={styles.companyDetail}>
              {data.company.postcode || ""}, {data.company.city || ""}{", "}
              {data.company.state || ""}
            </Text>
            <Text style={styles.companyDetail}>
              Tel: {data.company.phone || ""}
            </Text>
            <Text style={styles.companyDetail}>
              Email: {data.company.email || ""}
            </Text>
          </View>
        </View>
        <Image src={qrCodeData} style={styles.qrCode} />
      </View>

      {/* E-Invoice Title */}
      <Text style={styles.title}>E-INVOICE</Text>

      {/* Company Registration Details */}
      <View style={styles.section}>
        <View style={styles.grid}>
          <View style={styles.col50}>
            <Text style={styles.label}>Supplier TIN</Text>
            <Text style={styles.value}>{data.company.tin || ""}</Text>
          </View>
          <View style={styles.col50}>
            <Text style={styles.label}>Invoice Number</Text>

            <Text style={styles.value}>{data.invoice.number || ""}</Text>
          </View>
          <View style={styles.col50}>
            <Text style={styles.label}>Supplier BRN / IC / Passport No</Text>
            <Text style={styles.value}>{data.company.reg_no || ""}</Text>
          </View>
          <View style={styles.col50}>
            <Text style={styles.label}>UUID</Text>
            <Text style={styles.value}>{data.invoice.uuid || ""}</Text>
          </View>
          <View style={styles.col50}>
            <Text style={styles.label}>Supplier SST ID</Text>
            <Text style={styles.value}>{data.company.sst_id || ""}</Text>
          </View>
          <View style={styles.col50}>
            <Text style={styles.label}>Issued Date</Text>
            <Text style={styles.value}>{data.invoice.date || ""}</Text>
          </View>
        </View>
      </View>

      {/* Buyer Information */}
      <View style={styles.section}>
        <View style={styles.grid}>
          <View style={styles.col50}>
            <Text style={styles.label}>Buyer TIN</Text>
            <Text style={styles.value}>{data.buyer.tin || ""}</Text>
          </View>
          <View style={styles.col50}>
            <Text style={styles.label}>Buyer SST No</Text>
            <Text style={styles.value}>{data.buyer.sst_no || "NA"}</Text>
          </View>
          <View style={styles.col50}>
            <Text style={styles.label}>Buyer Name</Text>
            <Text style={styles.value}>{data.buyer.name || ""}</Text>
          </View>
          <View style={styles.col50}>
            <Text style={styles.label}>Buyer Contact No</Text>
            <Text style={styles.value}>{data.buyer.contact || ""}</Text>
          </View>
          <View style={styles.col50}>
            <Text style={styles.label}>Buyer Reg / IC / Passport No</Text>
            <Text style={styles.value}>{data.buyer.reg_no || ""}</Text>
          </View>
          <View style={styles.col50}>
            <Text style={styles.label}>Buyer Email</Text>
            <Text style={styles.value}>{data.buyer.email || ""}</Text>
          </View>
        </View>
        <View style={[styles.col50, { width: "100%" }]}>
          <Text style={styles.label}>Buyer Address</Text>
          <Text style={styles.value}>
            {data.buyer.address || ""}
            {data.buyer.city && data.buyer.state
              ? `, ${data.buyer.city}, ${getStateName(data.buyer.state)}`
              : ""}
          </Text>
        </View>
      </View>

      {/* Summary Section */}
      <View style={styles.summary}>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Subtotal</Text>
          <Text style={styles.summaryValue}>
            RM {data.amounts.subtotal?.toFixed(2) || "0.00"}
          </Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Tax Amount</Text>
          <Text style={styles.summaryValue}>
            RM {data.amounts.tax?.toFixed(2) || "0.00"}
          </Text>
        </View>
        <View style={[styles.summaryRow, styles.bold]}>
          <Text style={styles.summaryLabel}>Total</Text>
          <Text style={styles.summaryValue}>
            RM {data.amounts.total?.toFixed(2) || "0.00"}
          </Text>
        </View>
      </View>

      {/* Footer */}
      <Text style={styles.footer}>
        This document is computer generated e-Invoice.
      </Text>
    </Page>
  );
};

export default EInvoisPDF;
