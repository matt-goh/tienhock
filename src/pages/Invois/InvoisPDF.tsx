import React from 'react';
import { Page, Text, View, Document, StyleSheet, PDFViewer } from '@react-pdf/renderer';
import { InvoiceData } from '../../types/types';

// Define styles for the PDF
const styles = StyleSheet.create({
  page: {
    flexDirection: 'column',
    padding: 30,
    fontFamily: 'Helvetica',
  },
  header: {
    marginBottom: 20,
    borderBottom: '1pt solid black',
    paddingBottom: 10,
  },
  companyName: {
    fontSize: 12,
    fontWeight: 'bold',
  },
  companyDetails: {
    fontSize: 10,
    marginTop: 5,
  },
  invoice: {
    marginBottom: 10,
  },
  invoiceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  customerInfo: {
    fontSize: 10,
  },
  invoiceInfo: {
    fontSize: 10,
    textAlign: 'right',
  },
  table: {
    width: 'auto',
    marginBottom: 10,
    fontSize: 9,
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#000',
    borderBottomStyle: 'solid',
    alignItems: 'center',
    minHeight: 20,
  },
  tableHeader: {
    backgroundColor: '#f0f0f0',
  },
  tableCell: {
    padding: 5,
  },
  descriptionCell: {
    width: '40%',
  },
  qtyCell: {
    width: '15%',
    textAlign: 'right',
  },
  priceCell: {
    width: '15%',
    textAlign: 'right',
  },
  amountCell: {
    width: '15%',
    textAlign: 'right',
  },
  packingCell: {
    width: '15%',
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#000',
    borderTopStyle: 'solid',
    paddingTop: 5,
  },
  bold: {
    fontWeight: 'bold',
  },
  summary: {
    marginTop: 20,
    borderTopWidth: 1,
    borderTopColor: '#000',
    borderTopStyle: 'solid',
    paddingTop: 10,
  },
});

interface InvoicePDFProps {
  invoices: InvoiceData[];
}

const InvoisPDF: React.FC<InvoicePDFProps> = ({ invoices }) => {
  // Calculate totals
  const totals = invoices.reduce(
    (acc, invoice) => {
      if (invoice.type === 'C') {
        acc.cashTotal += parseFloat(invoice.totalAmount);
        acc.cashCount++;
      } else {
        acc.invoiceTotal += parseFloat(invoice.totalAmount);
        acc.invoiceCount++;
      }
      return acc;
    },
    { cashTotal: 0, invoiceTotal: 0, cashCount: 0, invoiceCount: 0 }
  );

  return (
    <PDFViewer style={{ width: '100%', height: '800px' }}>
      <Document>
        <Page size="A4" style={styles.page}>
          {/* Company Header */}
          <View style={styles.header}>
            <Text style={styles.companyName}>TIEN HOCK FOOD INDUSTRIES S/B (953309-T)</Text>
            <Text style={styles.companyDetails}>
              KG. Kibabalu, Karamunsing Kota Kinabalu, Sabah
            </Text>
            <Text style={styles.companyDetails}>
              Tel: (088)719715,719799 Fax:(088)72645
            </Text>
          </View>

          {/* Invoices */}
          {invoices.map((invoice, index) => (
            <View key={index} style={styles.invoice}>
              <View style={styles.invoiceHeader}>
                <View>
                  <Text style={styles.customerInfo}>M/S: {invoice.customername}</Text>
                  <Text style={styles.customerInfo}>GST NO: {invoice.customer}</Text>
                </View>
                <View>
                  <Text style={styles.invoiceInfo}>
                    INVOICE NO: {invoice.type}{invoice.invoiceno}
                  </Text>
                  <Text style={styles.invoiceInfo}>DATE: {invoice.date}</Text>
                  <Text style={styles.invoiceInfo}>TIME: {invoice.time}</Text>
                </View>
              </View>

              {/* Order Details Table */}
              <View style={styles.table}>
                <View style={[styles.tableRow, styles.tableHeader]}>
                  <Text style={[styles.tableCell, styles.descriptionCell]}>Description</Text>
                  <Text style={[styles.tableCell, styles.packingCell]}>Packing</Text>
                  <Text style={[styles.tableCell, styles.qtyCell]}>Qty</Text>
                  <Text style={[styles.tableCell, styles.priceCell]}>U/Price</Text>
                  <Text style={[styles.tableCell, styles.amountCell]}>Amount</Text>
                </View>

                {invoice.orderDetails.map((detail, detailIndex) => (
                  <View key={detailIndex} style={styles.tableRow}>
                    <Text style={[styles.tableCell, styles.descriptionCell]}>
                      {detail.productName}
                    </Text>
                    <Text style={[styles.tableCell, styles.packingCell]}>
                      {detail.code.includes('3KG') ? '3kg x 1bag' : 
                       detail.code.includes('1.5KG') ? '1.5kg x 1bag' : ''}
                    </Text>
                    <Text style={[styles.tableCell, styles.qtyCell]}>{detail.qty}</Text>
                    <Text style={[styles.tableCell, styles.priceCell]}>
                      {Number(detail.price).toFixed(2)}
                    </Text>
                    <Text style={[styles.tableCell, styles.amountCell]}>
                      {Number(detail.total).toFixed(2)}
                    </Text>
                  </View>
                ))}

                <View style={styles.totalRow}>
                  <Text style={[styles.tableCell, styles.bold]}>
                    Total Amount Payable: ${Number(invoice.totalAmount).toFixed(2)}
                  </Text>
                </View>
              </View>
            </View>
          ))}

          {/* Summary Section */}
          <View style={styles.summary}>
            <Text style={styles.bold}>Summary</Text>
            <Text>Cash Invoices: {totals.cashCount} (${totals.cashTotal.toFixed(2)})</Text>
            <Text>Credit Invoices: {totals.invoiceCount} (${totals.invoiceTotal.toFixed(2)})</Text>
            <Text style={styles.bold}>
              Total: ${(totals.cashTotal + totals.invoiceTotal).toFixed(2)}
            </Text>
          </View>
        </Page>
      </Document>
    </PDFViewer>
  );
};

export default InvoisPDF;