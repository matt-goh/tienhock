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
    companyName: "#1e293b",
    companyDetails: "#334155",
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
    marginBottom: 6,
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
    marginBottom: 2,
    borderBottom: `1pt solid ${colors.borders.invoice}`,
    paddingBottom: 5,
  },
  infoContainer: {
    paddingTop: 6,
    paddingBottom: 4,
    paddingLeft: 8,
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
  tableHeader: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: "#000",
    borderTopWidth: 0.5,
    borderTopColor: "#000",
    paddingTop: 4,
    paddingBottom: 4,
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: "#666",
    paddingVertical: 4,
  },
  productCol: {
    width: "36%",
    paddingLeft: 8,
    paddingRight: 4,
  },
  focCol: {
    width: "7%",
    textAlign: "center",
  },
  rtnCol: {
    width: "7%",
    textAlign: "center",
  },
  qtyCol: {
    width: "7%",
    textAlign: "center",
  },
  priceCol: {
    width: "10%",
    textAlign: "right",
  },
  subtotalCol: {
    width: "12%",
    textAlign: "right",
  },
  taxCol: {
    width: "10%",
    textAlign: "right",
  },
  totalCol: {
    width: "11%",
    textAlign: "right",
    paddingRight: 8,
  },
  headerText: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    color: "#374151",
  },
  cellText: {
    fontSize: 9,
    color: "#1F2937",
  },
  tableSummary: {
    alignItems: "flex-end",
    paddingRight: 8,
    marginTop: 5,
  },
  tableSummaryRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
  },
  summaryLabel: {
    width: 120,
    textAlign: "right",
    fontSize: 9,
    marginRight: 8,
  },
  summaryValue: {
    width: 50,
    textAlign: "right",
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
  },
  summary: {
    paddingTop: 5,
  },
  summaryTitle: {
    fontSize: 10,
    marginBottom: 6,
    paddingLeft: 4,
  },
  summaryHeaderRow: {
    flexDirection: "row",
    marginBottom: 2,
    paddingBottom: 2,
    borderBottomWidth: 0.5,
    borderBottomColor: "#666",
  },
  summaryDataRow: {
    flexDirection: "row",
    marginBottom: 2,
  },
  summaryTypeCol: {
    width: "16%",
    paddingLeft: 4,
  },
  summaryCountCol: {
    width: "8%",
    textAlign: "center",
  },
  summaryAmountCol: {
    width: "19%",
    textAlign: "right",
  },
  summaryTotalCol: {
    width: "19%",
    textAlign: "right",
    paddingRight: 4,
  },
  grandTotalRow: {
    marginTop: 2,
    paddingTop: 2,
    borderTopWidth: 0.5,
    borderTopColor: "#666",
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

  // Render the table
  const renderTable = (invoice: InvoiceData) => {
    const { regularItems, orderedRows } = getProcessedProducts(
      invoice.products
    );

    // Calculate totals for footer
    const subtotal = regularItems.reduce((sum, item) => {
      const quantity = item.product.quantity || 0;
      const price = item.product.price || 0;
      return sum + quantity * price;
    }, 0);

    const tax = regularItems.reduce((sum, item) => {
      return sum + (item.product.tax || 0);
    }, 0);

    const total = subtotal + tax;

    return (
      <View>
        {/* Table Header */}
        <View style={styles.tableHeader}>
          <Text style={[styles.productCol, styles.headerText]}>Product</Text>
          <Text style={[styles.focCol, styles.headerText]}>Foc</Text>
          <Text style={[styles.rtnCol, styles.headerText]}>Rtn</Text>
          <Text style={[styles.qtyCol, styles.headerText]}>Qty</Text>
          <Text style={[styles.priceCol, styles.headerText]}>U. Price</Text>
          <Text style={[styles.subtotalCol, styles.headerText]}>Subtotal</Text>
          <Text style={[styles.taxCol, styles.headerText]}>Tax</Text>
          <Text style={[styles.totalCol, styles.headerText]}>Total</Text>
        </View>

        {/* Table Rows */}
        {orderedRows.map((product, index) => {
          const item = regularItems.find(
            (i) => i.product.code === product.code
          );
          const quantity = product.quantity || 0;
          const price = product.price || 0;
          const itemSubtotal = quantity * price;
          const itemTax = product.tax || 0;
          const itemTotal = itemSubtotal + itemTax;

          return (
            <View key={index} style={styles.tableRow}>
              <Text style={[styles.productCol, styles.cellText]}>
                {product.description}
              </Text>
              <Text style={[styles.focCol, styles.cellText]}>
                {!product.issubtotal ? item?.foc || "0" : ""}
              </Text>
              <Text style={[styles.rtnCol, styles.cellText]}>
                {!product.issubtotal ? item?.returned || "0" : ""}
              </Text>
              <Text style={[styles.qtyCol, styles.cellText]}>
                {!product.issubtotal ? quantity : ""}
              </Text>
              <Text style={[styles.priceCol, styles.cellText]}>
                {!product.issubtotal ? price.toFixed(2) : ""}
              </Text>
              <Text style={[styles.subtotalCol, styles.cellText]}>
                {!product.issubtotal ? itemSubtotal.toFixed(2) : ""}
              </Text>
              <Text style={[styles.taxCol, styles.cellText]}>
                {!product.issubtotal ? itemTax.toFixed(2) : ""}
              </Text>
              <Text style={[styles.totalCol, styles.cellText]}>
                {product.issubtotal
                  ? Number(product.total).toFixed(2)
                  : itemTotal.toFixed(2)}
              </Text>
            </View>
          );
        })}

        {/* Table Footer/Summary */}
        <View style={styles.tableSummary}>
          <View style={styles.tableSummaryRow}>
            <Text style={[styles.summaryLabel, styles.headerText]}>
              Total Amount (MYR)
            </Text>
            <Text style={[styles.summaryValue, styles.headerText]}>
              {total.toFixed(2)}
            </Text>
          </View>
        </View>
      </View>
    );
  };

  const pages = paginateInvoices(invoices);

  const totals = invoices.reduce(
    (acc, invoice) => {
      // Get the products and calculate tax separately
      const { regularItems } = getProcessedProducts(invoice.products);

      // Calculate tax and subtotal for this invoice
      const subtotal = regularItems.reduce((sum, item) => {
        const quantity = item.product.quantity || 0;
        const price = item.product.price || 0;
        return sum + quantity * price;
      }, 0);

      const tax = regularItems.reduce((sum, item) => {
        return sum + (item.product.tax || 0);
      }, 0);

      if (invoice.paymenttype === "CASH") {
        acc.cashSubtotal += subtotal;
        acc.cashTax += tax;
        acc.cashTotal += invoice.totalamountpayable;
        acc.cashCount++;
      } else {
        acc.invoiceSubtotal += subtotal;
        acc.invoiceTax += tax;
        acc.invoiceTotal += invoice.totalamountpayable;
        acc.invoiceCount++;
      }
      return acc;
    },
    {
      cashSubtotal: 0,
      cashTax: 0,
      cashTotal: 0,
      cashCount: 0,
      invoiceSubtotal: 0,
      invoiceTax: 0,
      invoiceTotal: 0,
      invoiceCount: 0,
    }
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

          {pageInvoices.map((invoice, invoiceIndex) => (
            <View
              key={`invoice-${pageIndex}-${invoiceIndex}`}
              style={styles.invoice}
            >
              {renderInvoiceInfoRows(invoice)}
              {renderTable(invoice)}
            </View>
          ))}

          {pageIndex === pages.length - 1 && (
            <View style={styles.summary}>
              <Text style={[styles.bold, styles.summaryTitle]}>Summary</Text>

              {/* Header Row */}
              <View style={styles.summaryHeaderRow}>
                <Text style={[styles.summaryTypeCol, styles.bold]}>Type</Text>
                <Text style={[styles.summaryCountCol, styles.bold]}>
                  Quantity
                </Text>
                <Text style={[styles.summaryAmountCol, styles.bold]}>
                  Total Excl. Tax
                </Text>
                <Text style={[styles.summaryAmountCol, styles.bold]}>
                  Tax Amount
                </Text>
                <Text style={[styles.summaryAmountCol, styles.bold]}>
                  Total Incl. Tax
                </Text>
                <Text style={[styles.summaryTotalCol, styles.bold]}>
                  Total Payable
                </Text>
              </View>

              {/* Cash Row */}
              {totals.cashCount > 0 && (
                <View style={styles.summaryDataRow}>
                  <Text style={styles.summaryTypeCol}>Cash</Text>
                  <Text style={styles.summaryCountCol}>{totals.cashCount}</Text>
                  <Text style={styles.summaryAmountCol}>
                    {totals.cashSubtotal.toFixed(2)}
                  </Text>
                  <Text style={styles.summaryAmountCol}>
                    {totals.cashTax.toFixed(2)}
                  </Text>
                  <Text style={styles.summaryAmountCol}>
                    {(totals.cashSubtotal + totals.cashTax).toFixed(2)}
                  </Text>
                  <Text style={styles.summaryTotalCol}>
                    {totals.cashTotal.toFixed(2)}
                  </Text>
                </View>
              )}

              {/* Credit Row */}
              {totals.invoiceCount > 0 && (
                <View style={styles.summaryDataRow}>
                  <Text style={styles.summaryTypeCol}>Credit</Text>
                  <Text style={styles.summaryCountCol}>
                    {totals.invoiceCount}
                  </Text>
                  <Text style={styles.summaryAmountCol}>
                    {totals.invoiceSubtotal.toFixed(2)}
                  </Text>
                  <Text style={styles.summaryAmountCol}>
                    {totals.invoiceTax.toFixed(2)}
                  </Text>
                  <Text style={styles.summaryAmountCol}>
                    {(totals.invoiceSubtotal + totals.invoiceTax).toFixed(2)}
                  </Text>
                  <Text style={styles.summaryTotalCol}>
                    {totals.invoiceTotal.toFixed(2)}
                  </Text>
                </View>
              )}

              {/* Total Row */}
              <View style={[styles.summaryDataRow, styles.grandTotalRow]}>
                <Text style={[styles.summaryTypeCol, styles.bold]}>Total</Text>
                <Text style={[styles.summaryCountCol, styles.bold]}>
                  {totals.cashCount + totals.invoiceCount}
                </Text>
                <Text style={[styles.summaryAmountCol, styles.bold]}>
                  {(totals.cashSubtotal + totals.invoiceSubtotal).toFixed(2)}
                </Text>
                <Text style={[styles.summaryAmountCol, styles.bold]}>
                  {(totals.cashTax + totals.invoiceTax).toFixed(2)}
                </Text>
                <Text style={[styles.summaryAmountCol, styles.bold]}>
                  {(
                    totals.cashSubtotal +
                    totals.cashTax +
                    totals.invoiceSubtotal +
                    totals.invoiceTax
                  ).toFixed(2)}
                </Text>
                <Text style={[styles.summaryTotalCol, styles.bold]}>
                  {(totals.cashTotal + totals.invoiceTotal).toFixed(2)}
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
