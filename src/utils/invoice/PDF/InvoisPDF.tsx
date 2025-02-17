import React from "react";
import { Page, Text, View, StyleSheet, Image } from "@react-pdf/renderer";
import { InvoiceData, ProductItem } from "../../../types/types";

interface InvoisPDFProps {
  invoices: InvoiceData[];
  logoData?: string | null;
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
    paddingTop: 30,
    paddingBottom: 15,
    paddingLeft: 40,
    paddingRight: 40,
    fontFamily: "Helvetica",
    fontSize: 9,
    backgroundColor: colors.background,
  },
  headerContainer: {
    backgroundColor: colors.header.background,
    borderRadius: 6,
    padding: 15,
    marginBottom: 15,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 15,
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
  invoiceInfo: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 6,
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
  infoCell: {
    padding: "3 8",
  },
  customerInfo: {
    fontSize: 10,
    color: colors.text.primary,
    fontFamily: "Helvetica",
  },
  customerLabel: {
    color: colors.text.secondary,
    marginRight: 5,
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
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
  infoLeftCell: {
    width: "65%",
  },
  infoRightCell: {
    width: "35%",
    textAlign: "right",
  },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  infoLeftSection: {
    width: "65%",
  },
  infoRightSection: {
    width: "35%",
    alignItems: "flex-end",
  },
  infoRightContainer: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 8,
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
  bold: {
    fontFamily: "Helvetica-Bold",
    color: colors.text.bold,
  },
  logo: {
    width: 45,
    height: 45,
  },
  headerTextContainer: {
    flex: 1,
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

const InvoisPDF: React.FC<InvoisPDFProps> = ({ invoices, logoData }) => {
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
    const discount = product.discount || 0;
    const tax = product.tax || 0;
    const returnQty = product.returnProduct || 0;

    // Calculate base total
    const baseTotal = (quantity - returnQty) * price;

    // Apply discounts and tax
    const afterDiscount = baseTotal - discount;
    const final = afterDiscount + tax;

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
        acc.cashTotal += invoice.totalTaxable;
        acc.cashCount++;
      } else {
        acc.invoiceTotal += invoice.totalTaxable;
        acc.invoiceCount++;
      }
      return acc;
    },
    { cashTotal: 0, invoiceTotal: 0, cashCount: 0, invoiceCount: 0 }
  );

  const renderInvoiceInfoRows = (invoice: InvoiceData) => (
    <>
      <View style={styles.infoRow}>
        <View style={styles.infoLeftSection}>
          <Text style={styles.customerInfo}>
            <Text style={styles.customerLabel}>Customer: </Text>
            {invoice.customerid}
          </Text>
        </View>
        <View style={styles.infoRightSection}>
          <View style={styles.infoRightContainer}>
            <Text style={[styles.customerInfo]}>
              <Text style={styles.customerLabel}>Type: </Text>
              {invoice.paymenttype}
            </Text>
            <Text style={styles.customerInfo}>
              <Text style={styles.customerLabel}>Invoice No: </Text>
              {invoice.id}
            </Text>
          </View>
        </View>
      </View>
      <View style={[styles.infoRow, { marginBottom: 10 }]}>
        <View style={styles.infoLeftSection}>
          <Text style={styles.customerInfo}>
            <Text style={styles.customerLabel}>Salesman: </Text>
            {invoice.salespersonid}
          </Text>
        </View>
        <View style={styles.infoRightSection}>
          <View style={styles.infoRightContainer}>
            <Text style={styles.customerInfo}>
              <Text style={styles.customerLabel}>Date: </Text>
              {invoice.createddate}
            </Text>
          </View>
        </View>
      </View>
    </>
  );

  return (
    <>
      {pages.map((pageInvoices, pageIndex) => (
        <Page key={`page-${pageIndex}`} size="A4" style={styles.page}>
          {pageIndex === 0 && (
            <View style={styles.headerContainer}>
              <View style={styles.header}>
                {logoData ? (
                  <Image src={logoData} style={styles.logo} />
                ) : (
                  <Image src="../tienhock.png" style={styles.logo} />
                )}
                <View style={styles.headerTextContainer}>
                  <Text style={styles.companyName}>
                    TIEN HOCK FOOD INDUSTRIES S/B (953309-T)
                  </Text>
                  <Text style={styles.companyDetails}>
                    Kg. Kibabaig, Penampang, Kota Kinabalu, Sabah
                  </Text>
                  <Text style={styles.companyDetails}>
                    Tel: (088)719715, 719799 Fax:(088)72645
                  </Text>
                </View>
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
                        {invoice.totalTaxable.toFixed(2)}
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

export default InvoisPDF;
