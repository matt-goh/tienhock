// src/utils/invoice/PDF/InvoicePDF.tsx
import React from "react";
import { Page, Text, View, StyleSheet, Image } from "@react-pdf/renderer";
import { InvoiceData, ProductItem } from "../../../types/types";
import { TIENHOCK_INFO } from "../einvoice/companyInfo";
import TienHockLogo from "../../tienhock.png";

interface InvoicePDFProps {
  invoices: InvoiceData[];
  customerNames?: Record<string, string>;
  companyContext?: "tienhock" | "jellypolly";
}

const ROWS_PER_PAGE = 30;
const HEADER_ROWS = 2;
const TABLE_HEADER_ROWS = 2;
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
    paddingLeft: 30,
    paddingRight: 30,
    fontFamily: "Helvetica",
    fontSize: 10,
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
    fontSize: 8,
    color: "#64748B",
    fontFamily: "Helvetica-Bold",
    textTransform: "uppercase",
    letterSpacing: 0.3,
    marginBottom: 1,
  },
  infoValue: {
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
    fontFamily: "Helvetica-Bold",
    color: "#374151",
  },
  cellText: {
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
    alignItems: "center",
  },
  roundingLabel: {
    fontSize: 8,
    marginRight: 2,
    color: "#9CA3AF", // Light gray color
    fontFamily: "Helvetica-Bold",
  },
  roundingValue: {
    fontSize: 8,
    color: "#9CA3AF", // Light gray color
    fontFamily: "Helvetica-Bold",
  },
  summaryLabel: {
    width: 120,
    textAlign: "right",
    marginRight: 8,
  },
  summaryValue: {
    width: 50,
    textAlign: "right",
    fontFamily: "Helvetica-Bold",
  },
  summary: {
    paddingTop: 5,
  },
  summaryHeaderRow: {
    flexDirection: "row",
    paddingBottom: 4,
  },
  summaryDataRow: {
    flexDirection: "row",
    marginBottom: 2,
  },
  summaryTypeCol: {
    width: "11%",
    paddingLeft: 4,
  },
  summaryCountCol: {
    width: "10%",
    textAlign: "center",
  },
  summaryAmountCol: {
    width: "15%",
    textAlign: "right",
  },
  summaryTotalCol: {
    width: "18%",
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
  companyContext = "tienhock",
}) => {
  const getProcessedProducts = (products: ProductItem[]) => {
    const orderedRows: ProductItem[] = [];
    const regularProductsAggregated = new Map<
      string, // Key: product.code + '-' + product.description for regular items
      { foc: number; returned: number }
    >();

    // First pass: Aggregate FOC/Returned for regular (non-LESS, non-subtotal) products
    products.forEach((product) => {
      if (product.istotal || product.issubtotal || product.code === "LESS") {
        return;
      }
      const key = `${product.code}-${product.description}`;
      if (!regularProductsAggregated.has(key)) {
        regularProductsAggregated.set(key, { foc: 0, returned: 0 });
      }
      const agg = regularProductsAggregated.get(key)!;
      agg.foc += product.freeProduct || 0;
      agg.returned += product.returnProduct || 0;
    });

    const processedRegularProductKeys = new Set<string>(); // Tracks unique regular products already added to orderedRows

    // Second pass: Build orderedRows, ensuring correct order and handling for all item types
    products.forEach((product) => {
      if (product.istotal) return; // Skip grand total rows configured for some old UIs

      if (product.issubtotal) {
        orderedRows.push({
          ...product,
          description: "Subtotal", // Standardize description for PDF
        });
      } else if (product.code === "LESS") {
        // Add LESS rows directly. Each is unique.
        // Ensure their price is negative for calculation and display.
        // Tax, FOC, Return should be 0 for display.
        orderedRows.push({
          ...product, // Includes the unique uid
          price:
            product.price < 0 ? product.price : -(Number(product.price) || 0),
          freeProduct: 0,
          returnProduct: 0,
          tax: 0,
          // Recalculate total for PDF based on these PDF-specific values
          total: (
            (product.quantity || 0) *
            (product.price < 0 ? product.price : -(Number(product.price) || 0))
          ).toFixed(2),
        });
      } else {
        // Regular product
        const key = `${product.code}-${product.description}`;
        if (!processedRegularProductKeys.has(key)) {
          // First occurrence of this regular product, show aggregated FOC/Return
          const aggData = regularProductsAggregated.get(key);
          orderedRows.push({
            ...product, // Includes uid
            freeProduct: aggData?.foc || 0,
            returnProduct: aggData?.returned || 0,
          });
          processedRegularProductKeys.add(key);
        }
        // Subsequent identical regular products are not added to orderedRows again
        // as their FOC/Return is already aggregated into the first instance.
        // Their values will still be part of itemsForTotalCalculation.
      }
    });

    // For total calculation, use all original items except istotal/issubtotal.
    // Ensure 'LESS' items have negative price and zero tax for these calculations.
    const itemsForTotalCalculation = products
      .filter((p) => !p.istotal && !p.issubtotal)
      .map((p) => {
        if (p.code === "LESS") {
          return {
            ...p,
            price: p.price < 0 ? p.price : -(Number(p.price) || 0),
            tax: 0,
          };
        }
        return p;
      });

    return {
      itemsForTotalCalculation,
      orderedRows,
    };
  };

  const calculateInvoiceRows = (invoice: InvoiceData) => {
    const { orderedRows } = getProcessedProducts(invoice.products);
    return TABLE_HEADER_ROWS + orderedRows.length + 1;
  };

  const paginateInvoices = (invoicesToPaginate: InvoiceData[]) => {
    if (!invoicesToPaginate || invoicesToPaginate.length === 0) {
      return [];
    }

    const pages: InvoiceData[][] = [];
    let currentPage: InvoiceData[] = [];
    let currentPageRows = HEADER_ROWS;
    const MAX_CONTENT_ROWS = ROWS_PER_PAGE - HEADER_ROWS;

    invoicesToPaginate.forEach((invoice, index) => {
      const invoiceRows = calculateInvoiceRows(invoice);
      const isLastInvoiceOnOverallList =
        index === invoicesToPaginate.length - 1;
      const summaryRowsNeeded = isLastInvoiceOnOverallList ? SUMMARY_ROWS : 0;

      let startNewPage = false;

      if (
        currentPageRows +
          invoiceRows +
          (currentPage.length > 0 && isLastInvoiceOnOverallList
            ? summaryRowsNeeded
            : 0) >
          ROWS_PER_PAGE &&
        currentPage.length > 0
      ) {
        // If adding this invoice (and summary if it's the last overall) exceeds page and current page is not empty
        startNewPage = true;
      } else if (invoiceRows > MAX_CONTENT_ROWS && currentPage.length === 0) {
        // If a single invoice is too large for one page and it's the start of a new page
        // It will just take its own page(s) - this case is simplified, assumes it fits one page.
        // Complex splitting of a single invoice's items is not handled here.
      }

      if (startNewPage) {
        pages.push(currentPage);
        currentPage = [];
        currentPageRows = HEADER_ROWS;
      }

      currentPage.push(invoice);
      currentPageRows += invoiceRows;

      // If this is the last invoice overall, and it's added to the current page,
      // add summary rows if they fit. If they don't, the summary will go to a new page.
      // This logic is implicitly handled by checking `currentPageRows + invoiceRows + summaryRowsNeeded` above.
    });

    // Add the last page if it has any invoices
    if (currentPage.length > 0) {
      // If it's the last page overall, and it needs summary rows that were not accounted for because it started a new page
      if (
        pages.length > 0 &&
        invoicesToPaginate.length > 0 &&
        currentPage[currentPage.length - 1].id ===
          invoicesToPaginate[invoicesToPaginate.length - 1].id
      ) {
        if (currentPageRows + SUMMARY_ROWS > ROWS_PER_PAGE) {
          pages.push(currentPage); // Push current page without summary
          currentPage = []; // Start a new page for summary (or with last invoice if it was moved)
          // This case needs more refinement if summary *must* be on same page as last item of last invoice.
          // For now, if summary doesn't fit, it might spill or be on a new page with just summary.
          // The current `calculateInvoiceRows` doesn't account for summary on its own.
          // Let's assume summary will be pushed with the last page content.
        }
      }
      pages.push(currentPage);
    }
    return pages;
  };

  // Render the table
  const renderTable = (invoice: InvoiceData) => {
    const { itemsForTotalCalculation, orderedRows } = getProcessedProducts(
      invoice.products
    );

    const subtotal = itemsForTotalCalculation.reduce((sum, item) => {
      const quantity = Number(item.quantity) || 0;
      const price = Number(item.price) || 0;
      return sum + quantity * price;
    }, 0);

    const tax = itemsForTotalCalculation.reduce((sum, item) => {
      return sum + (Number(item.tax) || 0);
    }, 0);

    const rounding = Number(invoice.rounding || 0);
    const total = subtotal + tax + rounding;

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

        {/* Table Rows - render from orderedRows */}
        {orderedRows.map((productRow, index) => {
          const quantity = Number(productRow.quantity) || 0;
          const price = Number(productRow.price) || 0;
          const itemSubtotal = quantity * price;
          const itemTax = Number(productRow.tax) || 0;
          // For 'LESS' rows, productRow.total was recalculated in getProcessedProducts
          // For other rows, it's (qty * price) + tax.
          const itemTotal =
            productRow.code === "LESS"
              ? Number(productRow.total)
              : itemSubtotal + itemTax;

          return (
            // Use productRow.uid which should be unique for each item from the form
            <View
              key={productRow.uid || `row-${productRow.code}-${index}`}
              style={styles.tableRow}
            >
              <Text style={[styles.productCol, styles.cellText]}>
                {productRow.description}
              </Text>
              <Text style={[styles.focCol, styles.cellText]}>
                {!productRow.issubtotal ? productRow.freeProduct || "0" : ""}
              </Text>
              <Text style={[styles.rtnCol, styles.cellText]}>
                {!productRow.issubtotal ? productRow.returnProduct || "0" : ""}
              </Text>
              <Text style={[styles.qtyCol, styles.cellText]}>
                {!productRow.issubtotal ? quantity : ""}
              </Text>
              <Text style={[styles.priceCol, styles.cellText]}>
                {!productRow.issubtotal ? price.toFixed(2) : ""}
              </Text>
              <Text style={[styles.subtotalCol, styles.cellText]}>
                {!productRow.issubtotal ? itemSubtotal.toFixed(2) : ""}
              </Text>
              <Text style={[styles.taxCol, styles.cellText]}>
                {!productRow.issubtotal ? itemTax.toFixed(2) : ""}
              </Text>
              <Text style={[styles.totalCol, styles.cellText]}>
                {productRow.issubtotal
                  ? Number(productRow.total).toFixed(2) // Subtotal row uses its own total
                  : itemTotal.toFixed(2)}
              </Text>
            </View>
          );
        })}

        {/* Table Footer/Summary */}
        <View style={styles.tableSummary}>
          <View style={styles.tableSummaryRow}>
            {rounding !== 0 && (
              <>
                <Text style={styles.roundingLabel}>Rounding</Text>
                <Text style={styles.roundingValue}>{rounding.toFixed(2)}</Text>
              </>
            )}
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

  const pdfPages = paginateInvoices(invoices);

  const totals = invoices.reduce(
    (acc, invoice) => {
      const { itemsForTotalCalculation } = getProcessedProducts(
        invoice.products
      );

      const subtotal = itemsForTotalCalculation.reduce((sum, item) => {
        const quantity = Number(item.quantity) || 0;
        const price = Number(item.price) || 0;
        return sum + quantity * price;
      }, 0);

      const tax = itemsForTotalCalculation.reduce((sum, item) => {
        return sum + (Number(item.tax) || 0);
      }, 0);

      const rounding = Number(invoice.rounding) || 0;
      // invoice.totalamountpayable should be correct as it comes from the invoice data
      // which is calculated on the form page considering all deductions.

      if (invoice.paymenttype === "CASH") {
        acc.cashSubtotal += subtotal;
        acc.cashTax += tax;
        acc.cashRounding += rounding;
        acc.cashTotal += invoice.totalamountpayable;
        acc.cashCount++;
      } else {
        acc.invoiceSubtotal += subtotal;
        acc.invoiceTax += tax;
        acc.invoiceRounding += rounding;
        acc.invoiceTotal += invoice.totalamountpayable;
        acc.invoiceCount++;
      }
      return acc;
    },
    {
      cashSubtotal: 0,
      cashTax: 0,
      cashRounding: 0,
      cashTotal: 0,
      cashCount: 0,
      invoiceSubtotal: 0,
      invoiceTax: 0,
      invoiceRounding: 0,
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
            <Text style={styles.infoLabel}>Status</Text>
            <Text style={styles.infoValue}>
              {invoice.invoice_status.charAt(0).toUpperCase() +
                invoice.invoice_status.slice(1)}
            </Text>
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
      {pdfPages.map(
        (
          pageInvoices,
          pageIndex
        ) => (
          <Page key={`page-${pageIndex}`} size="A4" style={styles.page}>
            {pageIndex === 0 && (
              <View style={styles.header}>
                <Image src={TienHockLogo} style={styles.logo} />
                <View style={styles.headerTextContainer}>
                  <Text style={styles.companyName}>
                    {companyContext === "jellypolly"
                      ? "JELLY POLLY FOOD INDUSTRIES"
                      : TIENHOCK_INFO.name}
                  </Text>
                  <Text style={styles.companyDetails}>
                    {TIENHOCK_INFO.address_pdf}
                  </Text>
                  <Text style={styles.companyDetails}>
                    Tel: {TIENHOCK_INFO.phone}
                  </Text>
                </View>
              </View>
            )}

            {pageInvoices.map((invoice, invoiceIndex) => (
              <View
                key={`invoice-${pageIndex}-${invoice.id}-${invoiceIndex}`} // Use invoice.id for more stable key
                style={styles.invoice}
              >
                {renderInvoiceInfoRows(invoice)}
                {renderTable(invoice)}
              </View>
            ))}

            {/* Check if this is the last page of the entire document */}
            {pageIndex === pdfPages.length - 1 && (
              <View style={styles.summary}>
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
                  <Text style={[styles.summaryAmountCol, styles.bold]}>
                    Rounding
                  </Text>
                  <Text style={[styles.summaryTotalCol, styles.bold]}>
                    Total Payable
                  </Text>
                </View>

                {/* Cash Row */}
                {totals.cashCount > 0 && (
                  <View style={styles.summaryDataRow}>
                    <Text style={styles.summaryTypeCol}>Cash</Text>
                    <Text style={styles.summaryCountCol}>
                      {totals.cashCount}
                    </Text>
                    <Text style={styles.summaryAmountCol}>
                      {totals.cashSubtotal.toFixed(2)}
                    </Text>
                    <Text style={styles.summaryAmountCol}>
                      {totals.cashTax.toFixed(2)}
                    </Text>
                    <Text style={styles.summaryAmountCol}>
                      {(totals.cashSubtotal + totals.cashTax).toFixed(2)}
                    </Text>
                    <Text style={styles.summaryAmountCol}>
                      {totals.cashRounding.toFixed(2)}
                    </Text>
                    <Text style={styles.summaryTotalCol}>
                      {totals.cashTotal.toFixed(2)}
                    </Text>
                  </View>
                )}

                {/* Credit Row */}
                {totals.invoiceCount > 0 && (
                  <View style={styles.summaryDataRow}>
                    <Text style={styles.summaryTypeCol}>Invoice</Text>
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
                    <Text style={styles.summaryAmountCol}>
                      {totals.invoiceRounding.toFixed(2)}
                    </Text>
                    <Text style={styles.summaryTotalCol}>
                      {totals.invoiceTotal.toFixed(2)}
                    </Text>
                  </View>
                )}

                {/* Total Row */}
                <View style={[styles.summaryDataRow, styles.grandTotalRow]}>
                  <Text style={[styles.summaryTypeCol, styles.bold]}>
                    Total
                  </Text>
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
                  <Text style={[styles.summaryAmountCol, styles.bold]}>
                    {(totals.invoiceRounding + totals.cashRounding).toFixed(2)}
                  </Text>
                  <Text style={[styles.summaryTotalCol, styles.bold]}>
                    {(totals.cashTotal + totals.invoiceTotal).toFixed(2)}
                  </Text>
                </View>
              </View>
            )}
          </Page>
        )
      )}
    </>
  );
};

export default InvoicePDF;
