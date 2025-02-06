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
    width: 120,
  },
  detailValue: {
    flex: 1,
    textAlign: "right",
  },
  title: {
    fontSize: 12,
    fontFamily: "Helvetica-Bold",
    marginBottom: 8,
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
  infoColumns: {
    flexDirection: "row",
    marginTop: 6,
  },
  column: {
    flex: 1,
    paddingRight: 15,
  },
  section: {
    marginBottom: 12,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  col50: {
    width: "50%",
    paddingRight: 10,
    marginBottom: 2,
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
            <Text style={styles.companyName}>{data.company.name}</Text>
            <Text style={styles.companyDetail}>
              Reg. No: {data.company.reg_no}
            </Text>
            <Text style={styles.companyDetail}>{data.company.address}</Text>
            <Text style={styles.companyDetail}>
              {data.company.postcode}, {data.company.city}, {data.company.state}
            </Text>
            <Text style={styles.companyDetail}>Tel: {data.company.phone}</Text>
            <Text style={styles.companyDetail}>
              Email: {data.company.email}
            </Text>
          </View>
        </View>
        <Image src={qrCodeData} style={styles.qrCode} />
      </View>

      {/* E-Invoice Title */}
      <Text style={styles.title}>e-Invoice</Text>

      {/* Key Invoice Details */}
      <View style={styles.invoiceDetails}>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Invoice Number</Text>
          <Text style={styles.detailValue}>{data.invoice.number}</Text>
        </View>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Unique ID No</Text>
          <Text style={styles.detailValue}>{data.invoice.uuid}</Text>
        </View>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Invoice Date & Time</Text>
          <Text style={styles.detailValue}>
            {data.invoice.datetime_validated}
          </Text>
        </View>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Currency</Text>
          <Text style={styles.detailValue}>MYR</Text>
        </View>
      </View>

      {/* FROM and BILLING TO Containers */}
      <View style={styles.infoContainer}>
        {/* FROM Container */}
        <View style={styles.infoBox}>
          <Text style={styles.infoTitle}>FROM</Text>
          <View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Supplier TIN</Text>
              <Text style={styles.infoValue}>{data.company.tin}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Supplier Name</Text>
              <Text style={styles.infoValue}>{data.company.name}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Supplier BRN:</Text>
              <Text style={styles.infoValue}>{data.company.reg_no}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Supplier SST No.</Text>
              <Text style={styles.infoValue}>
                {data.company.sst_id || "N/A"}
              </Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Billing Address</Text>
              <Text style={styles.infoValue}>{data.company.address}</Text>
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

        {/* BILLING TO Container */}
        <View style={styles.infoBox}>
          <Text style={styles.infoTitle}>BILLING TO</Text>
          <View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Customer TIN</Text>
              <Text style={styles.infoValue}>{data.buyer.tin}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Customer Name</Text>
              <Text style={styles.infoValue}>{data.buyer.name}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Customer Reg No.</Text>
              <Text style={styles.infoValue}>{data.buyer.reg_no}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Customer SST No.</Text>
              <Text style={styles.infoValue}>{data.buyer.sst_no || "N/A"}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Billing Address</Text>
              <Text style={styles.infoValue}>
                {data.buyer.address}
                {data.buyer.city && data.buyer.state
                  ? `, ${data.buyer.city}, ${getStateName(data.buyer.state)}`
                  : ""}
              </Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Contact No.</Text>
              <Text style={styles.infoValue}>{data.buyer.contact}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Email</Text>
              <Text style={styles.infoValue}>{data.buyer.email}</Text>
            </View>
          </View>
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
