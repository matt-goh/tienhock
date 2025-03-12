import React from "react";
import { Page, Text, View, StyleSheet, Image } from "@react-pdf/renderer";
import { InvoiceData, ProductItem } from "../../../types/types";
import { COMPANY_INFO } from "../einvoice/companyInfo";

interface InvoicePDFProps {
  invoices: InvoiceData[];
  customerNames?: Record<string, string>;
}

const ROWS_PER_PAGE = 28;
const HEADER_ROWS = 3;
const TABLE_HEADER_ROWS = 3;
const SUMMARY_ROWS = 3;

// Color palette for easy customization
const colors = {
  background: "#ffffff",
  header: {
    background: "#F3F4F6",
    companyName: "#1e293b",
    companyDetails: "#334155",
  },
  table: {
    headerBackground: "#F3F4F6",
    border: "#D1D5DB",
    borderDark: "#D1D5DB",
  },
  text: {
    primary: "#111827",
    secondary: "#374151",
    bold: "#030712",
  },
  borders: {
    invoice: "#27272A",
  },
};

const styles = StyleSheet.create({
  page: {
    flexDirection: "column",
    paddingTop: 15,
    paddingBottom: 15,
    paddingLeft: 40,
    paddingRight: 40,
    fontFamily: "Helvetica",
    fontSize: 9,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 15,
    gap: 15,
  },
  headerTextContainer: {
    flex: 1,
  },
  logo: {
    width: 45,
    height: 45,
  },
  bold: {
    fontFamily: "Helvetica-Bold",
    color: colors.text.bold,
  },
  companyName: {
    fontSize: 14,
    fontFamily: "Helvetica-Bold",
    color: colors.header.companyName,
  },
  companyDetails: {
    fontSize: 10,
    marginTop: 4,
    color: colors.header.companyDetails,
    lineHeight: 1,
  },
  invoice: {
    marginBottom: 12,
    borderBottom: `1pt solid ${colors.borders.invoice}`,
    paddingBottom: 8,
  },
  infoContainer: {
    marginBottom: 4,
    paddingHorizontal: 6,
    paddingTop: 6,
    paddingBottom: 4,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.table.border,
  },
  infoRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
  },
  infoCell: {
    marginRight: 10,
    marginBottom: 2,
    minWidth: 40,
  },
  infoLabel: {
    fontSize: 7,
    color: "#64748B",
    fontFamily: "Helvetica-Bold",
    textTransform: "uppercase",
    letterSpacing: 0.3,
    marginBottom: 1,
  },
  infoValue: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    color: "#1E293B",
    letterSpacing: 0.2,
    textOverflow: "ellipsis",
    maxWidth: 200,
  },
  table: {
    width: "100%",
    marginBottom: 15,
  },
  tableContent: {
    border: `1pt solid ${colors.table.border}`,
    paddingBottom: 6,
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: colors.table.borderDark,
    borderBottomStyle: "solid",
    minHeight: 20,
    alignItems: "center",
  },
  tableHeader: {
    backgroundColor: colors.table.headerBackground,
    fontFamily: "Helvetica-Bold",
    fontSize: 9,
    borderBottomWidth: 1,
    borderBottomColor: colors.table.border,
  },
  tableCell: {
    padding: "6 8",
  },
  descriptionCell: {
    width: "45%",
    borderRightWidth: 0.5,
    borderRightColor: colors.table.border,
  },
  focCell: {
    width: "10%",
    textAlign: "right",
    borderRightWidth: 0.5,
    borderRightColor: colors.table.border,
  },
  returnCell: {
    width: "10%",
    textAlign: "right",
    borderRightWidth: 0.5,
    borderRightColor: colors.table.border,
  },
  qtyCell: {
    width: "10%",
    textAlign: "right",
    borderRightWidth: 0.5,
    borderRightColor: colors.table.border,
  },
  priceCell: {
    width: "12%",
    textAlign: "right",
    borderRightWidth: 0.5,
    borderRightColor: colors.table.border,
  },
  amountCell: {
    width: "13%",
    textAlign: "right",
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    paddingTop: 6,
    paddingRight: 8,
  },
  summary: {
    marginTop: -2,
  },
  summaryTitle: {
    paddingBottom: 8,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
    fontSize: 10,
    color: colors.text.primary,
  },
  grandTotal: {
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: colors.text.primary,
  },
  subtotalRow: {
    backgroundColor: colors.table.headerBackground,
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: colors.table.borderDark,
    borderBottomStyle: "solid",
    minHeight: 20,
    alignItems: "center",
  },
  subtotalText: {
    padding: "6 8",
    width: "45%",
    borderRightWidth: 0.5,
    borderRightColor: colors.table.border,
    fontFamily: "Helvetica-Bold",
  },
});

const InvoicePDF: React.FC<InvoicePDFProps> = ({
  invoices,
  customerNames = {},
}) => {
  const getProcessedProducts = (products: ProductItem[]) => {
    // Keep track of all rows in their original order
    const orderedRows: ProductItem[] = [];

    // Map to store regular items with their FOC and returned quantities
    const regularProducts = new Map<
      string,
      {
        product: ProductItem;
        foc: number;
        returned: number;
      }
    >();

    // First pass: Process regular items to combine FOC and returned quantities
    products.forEach((product) => {
      // Skip special rows and total rows in first pass
      if (product.istotal || product.issubtotal) {
        return;
      }

      const key = `${product.code}-${product.description}`;
      if (!regularProducts.has(key)) {
        regularProducts.set(key, {
          product: {
            ...product,
            freeProduct: 0,
            returnProduct: 0,
          },
          foc: 0,
          returned: 0,
        });
      }

      const item = regularProducts.get(key)!;
      item.foc += product.freeProduct || 0;
      item.returned += product.returnProduct || 0;
    });

    // Second pass: Build the ordered rows while maintaining original sequence
    products.forEach((product) => {
      if (product.istotal) return; // Skip total rows

      if (product.issubtotal) {
        // Format description for subtotal rows
        const subtotalRow = {
          ...product,
          description: "Subtotal",
          issubtotal: true,
        };
        orderedRows.push(subtotalRow);
      } else {
        // Only process regular items once
        const key = `${product.code}-${product.description}`;
        const item = regularProducts.get(key);
        if (item && !orderedRows.some((row) => row.code === product.code)) {
          orderedRows.push(item.product);
        }
      }
    });

    return {
      regularItems: Array.from(regularProducts.values()),
      orderedRows: orderedRows,
    };
  };

  const calculateTotal = (product: ProductItem): number => {
    if (product.istotal || product.issubtotal) {
      return parseFloat(product.total || "0");
    }

    const quantity = product.quantity || 0;
    const price = product.price || 0;
    const tax = product.tax || 0;

    // Calculate base total
    const baseTotal = quantity * price;

    // Apply tax
    const final = baseTotal + tax;

    return final;
  };

  const calculateInvoiceRows = (invoice: InvoiceData) => {
    const { orderedRows } = getProcessedProducts(invoice.products);
    return TABLE_HEADER_ROWS + orderedRows.length + 1; // +1 for the total row
  };

  const paginateInvoices = (invoices: InvoiceData[]) => {
    const pages: InvoiceData[][] = [];
    let currentPage: InvoiceData[] = [];
    let currentPageRows = HEADER_ROWS;
    let remainingSpace = 0;

    // Calculate total rows needed for summary
    const summaryNeededRows = SUMMARY_ROWS;

    invoices.forEach((invoice, index) => {
      const invoiceRows = calculateInvoiceRows(invoice);
      const isLastInvoice = index === invoices.length - 1;

      // Check if adding this invoice would exceed page limit
      if (currentPageRows + invoiceRows > ROWS_PER_PAGE) {
        // If this is the last invoice, check if we need a new page for summary
        if (isLastInvoice) {
          remainingSpace = ROWS_PER_PAGE - currentPageRows;
          // If not enough space for both invoice and summary, start a new page
          if (remainingSpace < invoiceRows + summaryNeededRows) {
            pages.push(currentPage);
            currentPage = [invoice];
            currentPageRows = HEADER_ROWS + invoiceRows;
          } else {
            currentPage.push(invoice);
            currentPageRows += invoiceRows;
          }
        } else {
          // Not the last invoice, simply start a new page
          pages.push(currentPage);
          currentPage = [invoice];
          currentPageRows = HEADER_ROWS + invoiceRows;
        }
      } else {
        // Check if this is the last invoice and if we have enough space for summary
        if (
          isLastInvoice &&
          currentPageRows + invoiceRows + summaryNeededRows > ROWS_PER_PAGE
        ) {
          // Not enough space for summary, push current page and start new one
          pages.push(currentPage);
          currentPage = [invoice];
          currentPageRows = HEADER_ROWS + invoiceRows;
        } else {
          // Enough space, add to current page
          currentPage.push(invoice);
          currentPageRows += invoiceRows;
        }
      }
    });

    // Push the last page if it has any invoices
    if (currentPage.length > 0) {
      pages.push(currentPage);
    }

    return pages;
  };

  const renderTableRow = (
    product: ProductItem,
    foc: number = 0,
    returned: number = 0,
    index: number
  ) => (
    <View
      key={`row-${index}`}
      style={product.issubtotal ? styles.subtotalRow : styles.tableRow}
    >
      <Text
        style={
          product.issubtotal
            ? styles.subtotalText
            : [styles.tableCell, styles.descriptionCell]
        }
      >
        {product.description}
      </Text>
      <Text style={[styles.tableCell, styles.focCell]}>
        {!product.issubtotal ? foc || "" : ""}
      </Text>
      <Text style={[styles.tableCell, styles.returnCell]}>
        {!product.issubtotal ? returned || "" : ""}
      </Text>
      <Text style={[styles.tableCell, styles.qtyCell]}>
        {!product.issubtotal ? Math.round(product.quantity || 0) : ""}
      </Text>
      <Text style={[styles.tableCell, styles.priceCell]}>
        {!product.issubtotal ? Number(product.price || 0).toFixed(2) : ""}
      </Text>
      <Text style={[styles.tableCell, styles.amountCell]}>
        {calculateTotal(product).toFixed(2)}
      </Text>
    </View>
  );

  const pages = paginateInvoices(invoices);

  const totals = invoices.reduce(
    (acc, invoice) => {
      if (invoice.paymenttype === "Cash") {
        acc.cashTotal += invoice.totalamountpayable;
        acc.cashCount++;
      } else {
        acc.invoiceTotal += invoice.totalamountpayable;
        acc.invoiceCount++;
      }
      return acc;
    },
    { cashTotal: 0, invoiceTotal: 0, cashCount: 0, invoiceCount: 0 }
  );

  const renderInvoiceInfoRows = (invoice: InvoiceData) => {
    // Parse the timestamp to format date and time
    const date = new Date(parseInt(invoice.createddate));

    // Format time (HH:MM AM/PM)
    let hours = date.getHours();
    const minutes = String(date.getMinutes()).padStart(2, "0");
    const ampm = hours >= 12 ? "PM" : "AM";
    hours = hours % 12;
    hours = hours ? hours : 12; // Convert 0 to 12
    const formattedTime = `${String(hours).padStart(
      2,
      "0"
    )}:${minutes} ${ampm}`;

    // Format date (DD/MM/YYYY)
    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const year = date.getFullYear();
    const formattedDate = `${day}/${month}/${year}`;

    // Get customer name if available, otherwise use ID
    const customerName =
      customerNames[invoice.customerid] || invoice.customerid;

    return (
      <View style={styles.infoContainer}>
        <View style={styles.infoRow}>
          <View style={styles.infoCell}>
            <Text style={styles.infoLabel}>Invoice No</Text>
            <Text style={styles.infoValue}>{invoice.id}</Text>
          </View>
          <View style={styles.infoCell}>
            <Text style={styles.infoLabel}>Salesman</Text>
            <Text style={styles.infoValue}>{invoice.salespersonid}</Text>
          </View>
          <View style={styles.infoCell}>
            <Text style={styles.infoLabel}>Customer</Text>
            <Text style={styles.infoValue}>{customerName}</Text>
          </View>
          <View style={styles.infoCell}>
            <Text style={styles.infoLabel}>Type</Text>
            <Text style={styles.infoValue}>{invoice.paymenttype}</Text>
          </View>
          <View style={styles.infoCell}>
            <Text style={styles.infoLabel}>Time</Text>
            <Text style={styles.infoValue}>{formattedTime}</Text>
          </View>
          <View style={styles.infoCell}>
            <Text style={styles.infoLabel}>Date</Text>
            <Text style={styles.infoValue}>{formattedDate}</Text>
          </View>
        </View>
      </View>
    );
  };

  return (
    <>
      {pages.map((pageInvoices, pageIndex) => (
        <Page key={`page-${pageIndex}`} size="A4" style={styles.page}>
          {pageIndex === 0 && (
            <View style={styles.header}>
              <Image src="../tienhock.png" style={styles.logo} />
              <View style={styles.headerTextContainer}>
                <Text style={styles.companyName}>{COMPANY_INFO.name}</Text>
                <Text style={styles.companyDetails}>
                  {COMPANY_INFO.address_pdf}
                </Text>
                <Text style={styles.companyDetails}>
                  Tel: {COMPANY_INFO.phone}
                </Text>
              </View>
            </View>
          )}

          {pageInvoices.map((invoice, invoiceIndex) => {
            const { regularItems, orderedRows } = getProcessedProducts(
              invoice.products
            );

            return (
              <View
                key={`invoice-${pageIndex}-${invoiceIndex}`}
                style={styles.invoice}
              >
                <View style={styles.table}>
                  {renderInvoiceInfoRows(invoice)}
                  <View style={styles.tableContent}>
                    <View style={[styles.tableRow, styles.tableHeader]}>
                      <Text style={[styles.tableCell, styles.descriptionCell]}>
                        Description
                      </Text>
                      <Text style={[styles.tableCell, styles.focCell]}>
                        Foc
                      </Text>
                      <Text style={[styles.tableCell, styles.returnCell]}>
                        Return
                      </Text>
                      <Text style={[styles.tableCell, styles.qtyCell]}>
                        Qty
                      </Text>
                      <Text style={[styles.tableCell, styles.priceCell]}>
                        Unit/Price
                      </Text>
                      <Text style={[styles.tableCell, styles.amountCell]}>
                        Amount
                      </Text>
                    </View>

                    {orderedRows.map((row, rowIndex) => {
                      const item = regularItems.find(
                        (item) => item.product.code === row.code
                      );
                      return renderTableRow(
                        row,
                        item?.foc || 0,
                        item?.returned || 0,
                        rowIndex
                      );
                    })}

                    {/* Total row */}
                    <View key={`total-${invoiceIndex}`} style={styles.totalRow}>
                      <Text style={styles.bold}>
                        Total Amount Payable: RM{" "}
                        {invoice.totalamountpayable.toFixed(2)}
                      </Text>
                    </View>
                  </View>
                </View>
              </View>
            );
          })}

          {pageIndex === pages.length - 1 && (
            <View style={styles.summary}>
              <Text style={[styles.bold, styles.summaryTitle]}>Summary</Text>
              <View style={styles.summaryRow}>
                <Text>Cash Invoices ({totals.cashCount}):</Text>
                <Text>RM {totals.cashTotal.toFixed(2)}</Text>
              </View>
              <View style={styles.summaryRow}>
                <Text>Credit Invoices ({totals.invoiceCount}):</Text>
                <Text>RM {totals.invoiceTotal.toFixed(2)}</Text>
              </View>
              <View style={[styles.summaryRow, styles.grandTotal]}>
                <Text style={styles.bold}>Grand Total:</Text>
                <Text style={styles.bold}>
                  RM {(totals.cashTotal + totals.invoiceTotal).toFixed(2)}
                </Text>
              </View>
            </View>
          )}
        </Page>
      ))}
    </>
  );
};

export default InvoicePDF;
