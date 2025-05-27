import {
  pdf,
  Document,
  Page,
  Text,
  View,
  StyleSheet,
} from "@react-pdf/renderer";
import React from "react";

interface SummaryData {
  all_sales?: any;
  all_salesmen?: any;
  mee_salesmen?: any;
  bihun_salesmen?: any;
  jp_salesmen?: any;
  sisa_sales?: any;
}

const styles = StyleSheet.create({
  page: {
    paddingHorizontal: 30,
    paddingVertical: 25,
    fontFamily: "Helvetica",
    fontSize: 8,
    lineHeight: 1.4,
  },
  companyHeader: {
    fontSize: 12,
    fontFamily: "Helvetica-Bold",
    marginBottom: 2,
    textAlign: "left",
  },
  reportTitle: {
    fontSize: 9,
    fontFamily: "Helvetica", // Keep it normal weight for subtitle
    marginBottom: 1,
    textAlign: "left",
  },
  salesmanInfo: {
    fontSize: 9,
    fontFamily: "Helvetica",
    marginBottom: 8,
    textAlign: "left",
  },
  table: {
    marginBottom: 10, // Reduced bottom margin for table
  },
  tableHeader: {
    flexDirection: "row",
    borderTopWidth: 0.5,
    borderTopColor: "#333",
    borderBottomWidth: 0.5,
    borderBottomColor: "#333",
    paddingVertical: 3,
    backgroundColor: "#f8f8f8", // Light grey for header background
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 1.5,
    minHeight: 15,
  },
  // Standard Column Styles
  colID: { width: "18%", paddingHorizontal: 3 },
  colDescription: { width: "42%", paddingHorizontal: 3 },
  colQty: { width: "15%", textAlign: "right", paddingRight: 8 },
  colAmount: { width: "25%", textAlign: "right", paddingRight: 3 },

  headerText: {
    fontFamily: "Helvetica-Bold",
    fontSize: 8, // Header text size
  },
  dashedLineAboveSubtotal: {
    flexDirection: "row",
    marginTop: 1, // Space before dashed line
  },
  // Generic dashed line cell style (apply width and paddingRight dynamically)
  dashedLineCell: {
    borderTopWidth: 0.5,
    borderTopColor: "#333",
    borderTopStyle: "dashed",
    height: 1,
    marginTop: 1,
    marginBottom: 0.5,
  },
  subtotalRow: {
    paddingVertical: 1.5, // Consistent padding
    // No border here, solidLine below will handle separation
  },
  solidLine: {
    // Used to separate category/salesman blocks
    borderBottomWidth: 0.5,
    borderBottomColor: "#333",
    marginVertical: 1,
  },
  totalRow: {
    // For Grand Total row
    fontFamily: "Helvetica-Bold",
    paddingVertical: 2,
    borderTopWidth: 1, // Thicker line for grand total
    borderTopColor: "#000",
    borderBottomWidth: 1,
    borderBottomColor: "#000",
    marginTop: 2,
  },
  sectionTitle: {
    // For "Quantity Breakdown", "Amount Breakdown"
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    marginBottom: 4, // Space after section title
    marginTop: 5, // Space before section title
  },
  breakdownSection: {
    flexDirection: "row",
    marginTop: 8,
    marginBottom: 12,
  },
  breakdownColumn: {
    width: "50%",
    paddingRight: 15, // Space between columns
  },
  breakdownRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 0.5, // Tighter spacing
    paddingVertical: 0.5,
  },
  breakdownLabel: {
    fontSize: 8,
  },
  breakdownValue: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
  },
  breakdownSeparator: {
    height: 0.5,
    backgroundColor: "#888",
    marginVertical: 2,
  },
  salesmanSection: {
    // No specific style needed, separation achieved by salesmanHeader and lines
  },
  salesmanHeader: {
    // For Salesman Name
    fontFamily: "Helvetica-Bold",
    fontSize: 10,
    marginTop: 10, // More space before a new salesman block
    marginBottom: 3,
    textAlign: "left", // Ensure salesman name is left aligned
  },
  pageNumber: {
    position: "absolute",
    fontSize: 7,
    bottom: 15,
    right: 30,
    color: "#555",
  },
  categorySection: {
    marginBottom: 8, // Space between category sections
  },
  categoryHeader: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    marginBottom: 3,
    marginTop: 6,
    paddingVertical: 2,
    backgroundColor: "#f3f3f3",
    paddingHorizontal: 3,
  },
  salesmanSectionContainer: {
    marginBottom: 12, // More space between salesmen
    borderWidth: 0.5,
    borderColor: "#ddd",
    borderRadius: 2,
    overflow: "hidden",
  },
  salesmanHeaderEnhanced: {
    fontFamily: "Helvetica-Bold",
    fontSize: 10,
    paddingVertical: 4,
    paddingHorizontal: 6,
    backgroundColor: "#f0f0f0",
    borderBottomWidth: 0.5,
    borderBottomColor: "#333",
  },
  salesmanContent: {
    paddingTop: 2,
  },
  grandTotalSection: {
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 2,
    borderTopColor: "#000",
  },
  // Column Styles for Sisa Sales Page (5 columns)
  sisaColID: { width: "15%", paddingHorizontal: 3 }, // STOCK
  sisaColQty: { width: "12%", textAlign: "right", paddingRight: 8 }, // QTY
  sisaColDescription: { width: "38%", paddingHorizontal: 3 }, // DESCRIPTION
  sisaColUPrice: { width: "15%", textAlign: "right", paddingRight: 8 }, // U/PRICE
  sisaColAmount: { width: "20%", textAlign: "right", paddingRight: 3 }, // AMOUNT
});

// Helper function to format numbers with commas
const formatNumber = (num: number): string => {
  if (num == null || num === 0) return "0"; // Show "0" instead of ".00" for quantity
  return num.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
};

// Helper function to format currency
const formatCurrency = (amount: number): string => {
  if (amount == null || amount === 0) return "0.00";
  return amount.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

export const generateSalesSummaryPDF = async (
  data: SummaryData,
  month: number,
  year: number,
  action: "download" | "print"
) => {
  try {
    const dateForMonthName = new Date(year, month);
    // Format: MM/YYYY, e.g., 03/2025 for March 2025
    const monthYearFormatted = `${(dateForMonthName.getMonth() + 1)
      .toString()
      .padStart(2, "0")}/${dateForMonthName.getFullYear()}`;

    const doc = (
      <Document title={`Sales Summary - ${monthYearFormatted}`}>
        {data.all_sales && (
          <AllSalesPage
            data={data.all_sales}
            monthFormat={monthYearFormatted}
          />
        )}
        {data.all_salesmen && (
          <SalesmenPage
            data={data.all_salesmen}
            title="MONTHLY SUMMARY SALES (INVOICE/CASH/FOC)"
            monthFormat={monthYearFormatted}
          />
        )}
        {data.mee_salesmen && (
          <SalesmenPage
            data={data.mee_salesmen}
            title="MONTHLY SUMMARY MEE SALES (INVOICE/CASH/FOC)"
            monthFormat={monthYearFormatted}
            productType="MEE"
          />
        )}
        {data.bihun_salesmen && (
          <SalesmenPage
            data={data.bihun_salesmen}
            title="MONTHLY SUMMARY BIHUN SALES (INVOICE/CASH/FOC)"
            monthFormat={monthYearFormatted}
            productType="BIHUN"
          />
        )}
        {data.jp_salesmen && (
          <SalesmenPage
            data={data.jp_salesmen}
            title="MONTHLY SUMMARY JELLYPOLLY SALES (INVOICE/CASH/FOC)"
            monthFormat={monthYearFormatted}
            productType="JP"
          />
        )}
        {data.sisa_sales && (
          <SisaSalesPage
            data={data.sisa_sales}
            monthFormat={monthYearFormatted}
          />
        )}
      </Document>
    );

    const pdfBlob = await pdf(doc).toBlob();

    if (action === "download") {
      const url = URL.createObjectURL(pdfBlob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `Sales_Summary_${monthYearFormatted.replace(
        "/",
        "_"
      )}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } else {
      // Print
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
            // Fallback or error message
          } finally {
            // Robust cleanup
            const cleanup = () => {
              window.removeEventListener("focus", cleanupFocus);
              if (document.body.contains(printFrame)) {
                document.body.removeChild(printFrame);
              }
              URL.revokeObjectURL(url);
            };

            const cleanupFocus = () => {
              // Delay slightly to allow print dialog to close fully
              setTimeout(cleanup, 100);
            };

            window.addEventListener("focus", cleanupFocus);
            // Fallback timeout if focus event doesn't fire (e.g. print cancelled quickly)
            setTimeout(cleanup, 30000); // Reduced from 60s
          }
        }
      };
      printFrame.src = url;
    }
  } catch (error) {
    console.error("Error generating PDF:", error);
    throw error;
  }
};

// Component for All Sales Summary
const AllSalesPage: React.FC<{ data: any; monthFormat: string }> = ({
  data,
  monthFormat,
}) => {
  const { categories, totals } = data;

  // Define category display names
  const categoryNames: Record<string, string> = {
    "1-": "Products Starting with 1-",
    "2-": "Products Starting with 2-",
    "MEQ-": "Products Starting with MEQ-",
    "S-": "Products Starting with S-",
    OTH: "Other Products",
    "WE-MNL": "WE-MNL Products",
    "WE-2UDG": "WE-2UDG Products",
    "WE-300G": "WE-300G Products",
    "WE-600G": "WE-600G Products",
    EMPTY_BAG: "Empty Bag Products",
    SBH: "SBH Products",
    SMEE: "SMEE Products",
    "WE-360": "WE-360 Series Products",
    returns: "Return Products",
    less: "Less/Deductions",
    total_rounding: "Rounding Adjustments",
  };

  return (
    <Page size="A4" style={styles.page} wrap>
      <Text style={styles.companyHeader}>
        TIEN HOCK FOOD INDUSTRIES S/B (953309-T)
      </Text>
      <Text style={styles.reportTitle}>
        REPORT: MONTHLY SUMMARY CASH/INVOICE SALES AS AT {monthFormat}
      </Text>
      <Text style={styles.salesmanInfo}>SALESMAN: ALL</Text>

      {/* Render each category as a separate section */}
      {Object.entries(categories).map(([key, category]: [string, any]) => {
        if (
          (!category.products || category.products.length === 0) &&
          !(key === "less" && category.amount !== 0) &&
          !(key === "total_rounding" && category.amount !== 0)
        ) {
          return null;
        }

        return (
          <View key={key} style={styles.categorySection}>
            {/* Category Table */}
            <View style={styles.table}>
              <View style={styles.tableHeader}>
                <Text style={[styles.colID, styles.headerText]}>STOCK</Text>
                <Text style={[styles.colDescription, styles.headerText]}>
                  DESCRIPTION
                </Text>
                <Text style={[styles.colQty, styles.headerText]}>QTY</Text>
                <Text style={[styles.colAmount, styles.headerText]}>
                  AMOUNT
                </Text>
              </View>

              {/* Product rows */}
              {category.products?.map((product: any, index: number) => (
                <View
                  key={`${key}-${index}-${product.code}`}
                  style={styles.tableRow}
                >
                  <Text style={styles.colID}>{product.code}</Text>
                  <Text style={styles.colDescription}>
                    {product.description}
                  </Text>
                  <Text style={styles.colQty}>
                    {product.quantity > 0 ? formatNumber(product.quantity) : ""}
                  </Text>
                  <Text style={styles.colAmount}>
                    {formatCurrency(product.amount)}
                  </Text>
                </View>
              ))}

              {/* Direct deduction for categories without products */}
              {(!category.products || category.products.length === 0) && category.amount !== 0 && (
                <View style={styles.tableRow}>
                  <Text style={styles.colID}>
                    {category.id || key.toUpperCase()}
                  </Text>
                  <Text style={styles.colDescription}>
                    {category.description || categoryNames[key] || key}
                  </Text>
                  <Text style={styles.colQty}>0</Text>
                  <Text style={styles.colAmount}>
                    {formatCurrency(category.amount)}
                  </Text>
                </View>
              )}

              {/* Category subtotal */}
              <View style={styles.dashedLineAboveSubtotal}>
                <Text style={styles.colID}></Text>
                <Text style={styles.colDescription}></Text>
                <View
                  style={[
                    styles.dashedLineCell,
                    {
                      width: styles.colQty.width,
                      paddingRight: styles.colQty.paddingRight,
                    },
                  ]}
                />
                <View
                  style={[
                    styles.dashedLineCell,
                    {
                      width: styles.colAmount.width,
                      paddingRight: styles.colAmount.paddingRight,
                    },
                  ]}
                />
              </View>
              <View style={[styles.tableRow, styles.subtotalRow]}>
                <Text style={[styles.colID, styles.headerText]}>Subtotal:</Text>
                <Text style={styles.colDescription}></Text>
                <Text style={[styles.colQty, styles.headerText]}>
                  {formatNumber(category.quantity)}
                </Text>
                <Text style={[styles.colAmount, styles.headerText]}>
                  {formatCurrency(category.amount)}
                </Text>
              </View>
            </View>
          </View>
        );
      })}

      {/* ADJ - Rounding Adjustment (if provided as a category, similar to sample) */}
      {categories.total_rounding &&
        categories.total_rounding.products &&
        categories.total_rounding.products.length > 0 && (
          <React.Fragment key="total_rounding_display">
            {categories.total_rounding.products.map(
              (product: any, index: number) => (
                <View
                  key={`rounding-${index}-${product.code}`}
                  style={styles.tableRow}
                >
                  <Text style={styles.colID}>{product.code || "ADJ"}</Text>
                  <Text style={styles.colDescription}>
                    {product.description || "ROUNDING ADJ"}
                  </Text>
                  <Text style={styles.colQty}>
                    {formatNumber(product.quantity)}
                  </Text>
                  <Text style={styles.colAmount}>
                    {formatCurrency(product.amount)}
                  </Text>
                </View>
              )
            )}
            <View style={styles.dashedLineAboveSubtotal}>
              <Text style={styles.colID}></Text>
              <Text style={styles.colDescription}></Text>
              <View
                style={[
                  styles.dashedLineCell,
                  {
                    width: styles.colQty.width,
                    paddingRight: styles.colQty.paddingRight,
                  },
                ]}
              />
              <View
                style={[
                  styles.dashedLineCell,
                  {
                    width: styles.colAmount.width,
                    paddingRight: styles.colAmount.paddingRight,
                  },
                ]}
              />
            </View>
            <View
              style={[
                styles.tableRow,
                styles.subtotalRow,
                { borderBottomWidth: 0 },
              ]}
            >
              <Text style={styles.colID}></Text>
              <Text style={styles.colDescription}></Text>
              <Text style={[styles.colQty, styles.headerText]}>
                {formatNumber(categories.total_rounding.quantity)}
              </Text>
              <Text style={[styles.colAmount, styles.headerText]}>
                {formatCurrency(categories.total_rounding.amount)}
              </Text>
            </View>
            <View style={styles.solidLine} />
          </React.Fragment>
        )}

      {/* Grand Total Section */}
      <View style={styles.grandTotalSection}>
        <View style={styles.table}>
          <View style={[styles.tableRow, styles.totalRow]}>
            <Text style={[styles.colID, styles.headerText]}>GRAND TOTAL:</Text>
            <Text style={styles.colDescription}></Text>
            <Text style={[styles.colQty, styles.headerText]}>
              {formatNumber(totals.totalQuantity || 0)}
            </Text>
            <Text style={[styles.colAmount, styles.headerText]}>
              {formatCurrency(totals.grandTotalAmount)}
            </Text>
          </View>
        </View>
      </View>

      {/* Breakdown section remains the same */}
      <View style={styles.breakdownSection}>
        <View style={styles.breakdownColumn}>
          <View style={styles.breakdownRow}>
            <Text style={styles.breakdownLabel}>MEE (QTY) =</Text>
            <Text style={styles.breakdownValue}>
              {formatNumber(totals.meeQuantity || 0)}
            </Text>
          </View>
          <View style={styles.breakdownRow}>
            <Text style={styles.breakdownLabel}>BIHUN (QTY) =</Text>
            <Text style={styles.breakdownValue}>
              {formatNumber(totals.bihunQuantity || 0)}
            </Text>
          </View>
          <View style={styles.breakdownRow}>
            <Text style={styles.breakdownLabel}>MEE + BIHUN (QTY) =</Text>
            <Text style={styles.breakdownValue}>
              {formatNumber(totals.meeBihunQuantity || 0)}
            </Text>
          </View>
          <View style={styles.breakdownRow}>
            <Text style={styles.breakdownLabel}>JELLY POLLY (QTY) =</Text>
            <Text style={styles.breakdownValue}>
              {formatNumber(totals.jpQuantity || 0)}
            </Text>
          </View>
          <View style={styles.breakdownSeparator} />
          <View style={styles.breakdownRow}>
            <Text style={styles.breakdownLabel}>CASH SALES =</Text>
            <Text style={styles.breakdownValue}>
              {formatCurrency(totals.cashSalesAmount || 0)}
            </Text>
          </View>
          <View style={styles.breakdownRow}>
            <Text style={styles.breakdownLabel}>CR SALES =</Text>
            <Text style={styles.breakdownValue}>
              {formatCurrency(totals.creditSalesAmount || 0)}
            </Text>
          </View>
          <View style={styles.breakdownSeparator} />
          <View style={styles.breakdownRow}>
            <Text style={[styles.breakdownLabel, styles.headerText]}>
              GRAND TOTAL =
            </Text>
            <Text style={[styles.breakdownValue, styles.headerText]}>
              {formatCurrency(totals.grandTotalInvoicesAmount || 0)}
            </Text>
          </View>
        </View>
        <View style={styles.breakdownColumn}>
          <View style={styles.breakdownRow}>
            <Text style={styles.breakdownLabel}>MEE (AMOUNT) =</Text>
            <Text style={styles.breakdownValue}>
              {formatCurrency(totals.meeAmount || 0)}
            </Text>
          </View>
          <View style={styles.breakdownRow}>
            <Text style={styles.breakdownLabel}>BIHUN (AMOUNT) =</Text>
            <Text style={styles.breakdownValue}>
              {formatCurrency(totals.bihunAmount || 0)}
            </Text>
          </View>
          <View style={styles.breakdownRow}>
            <Text style={styles.breakdownLabel}>MEE + BIHUN (AMOUNT) =</Text>
            <Text style={styles.breakdownValue}>
              {formatCurrency(totals.meeBihunAmount || 0)}
            </Text>
          </View>
          <View style={styles.breakdownRow}>
            <Text style={styles.breakdownLabel}>JELLY POLLY (AMOUNT) =</Text>
            <Text style={styles.breakdownValue}>
              {formatCurrency(totals.jpAmount || 0)}
            </Text>
          </View>
          <View style={styles.breakdownSeparator} />
          <View style={styles.breakdownRow}>
            <Text style={[styles.breakdownLabel, styles.headerText]}>
              GRAND TOTAL =
            </Text>
            <Text style={[styles.breakdownValue, styles.headerText]}>
              {formatCurrency(totals.totalProductsAmount || 0)}
            </Text>
          </View>
        </View>
      </View>
      <Text
        style={styles.pageNumber}
        render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`}
        fixed
      />
    </Page>
  );
};

// Component for Salesmen Summary Pages
const SalesmenPage: React.FC<{
  data: any;
  title: string;
  monthFormat: string;
  productType?: string;
}> = ({ data, title, monthFormat }) => {
  const { salesmen, foc, returns } = data;

  return (
    <Page size="A4" style={styles.page} wrap>
      <Text style={styles.companyHeader}>
        TIEN HOCK FOOD INDUSTRIES S/B (953309-T)
      </Text>
      <Text style={styles.reportTitle}>
        {title} AS AT {monthFormat}
      </Text>
      <Text style={styles.salesmanInfo}>SALESMAN: ALL</Text>{" "}
      {/* Or dynamically set if per salesman view */}
      <View style={styles.tableHeader}>
        <Text style={[styles.colID, styles.headerText]}>STOCK</Text>
        <Text style={[styles.colDescription, styles.headerText]}>
          DESCRIPTION
        </Text>
        <Text style={[styles.colQty, styles.headerText]}>QTY</Text>
        <Text style={[styles.colAmount, styles.headerText]}>AMOUNT</Text>
      </View>
      {Object.entries(salesmen).map(
        ([salesmanName, salesmanData]: [string, any]) => {
          if (salesmanData.products.length === 0) return null;
          return (
            <View key={salesmanName} style={styles.salesmanSection}>
              <Text style={styles.salesmanHeader}>
                {salesmanName.toUpperCase()}
              </Text>
              {/* <View style={styles.solidLine} /> Removed line under salesman name, header stands out */}
              {salesmanData.products.map((product: any, index: number) => (
                <View
                  key={`${salesmanName}-${index}-${product.code}`}
                  style={styles.tableRow}
                >
                  <Text style={styles.colID}>{product.code}</Text>
                  <Text style={styles.colDescription}>
                    {product.description}
                  </Text>
                  <Text style={styles.colQty}>
                    {formatNumber(product.quantity)}
                  </Text>
                  <Text style={styles.colAmount}>
                    {formatCurrency(product.amount)}
                  </Text>
                </View>
              ))}
              <View style={styles.dashedLineAboveSubtotal}>
                <Text style={styles.colID}></Text>
                <Text style={styles.colDescription}></Text>
                <View
                  style={[
                    styles.dashedLineCell,
                    {
                      width: styles.colQty.width,
                      paddingRight: styles.colQty.paddingRight,
                    },
                  ]}
                />
                <View
                  style={[
                    styles.dashedLineCell,
                    {
                      width: styles.colAmount.width,
                      paddingRight: styles.colAmount.paddingRight,
                    },
                  ]}
                />
              </View>
              <View
                style={[
                  styles.tableRow,
                  styles.subtotalRow,
                  { borderBottomWidth: 0 },
                ]}
              >
                <Text style={styles.colID}></Text>
                <Text style={styles.colDescription}></Text>
                <Text style={[styles.colQty, styles.headerText]}>
                  {formatNumber(salesmanData.total.quantity)}
                </Text>
                <Text style={[styles.colAmount, styles.headerText]}>
                  {formatCurrency(salesmanData.total.amount)}
                </Text>
              </View>
              <View style={styles.solidLine} />{" "}
              {/* Line after each salesman's total */}
            </View>
          );
        }
      )}
      {/* FOC section */}
      {foc && foc.products && foc.products.length > 0 && (
        <View style={styles.salesmanSection}>
          <Text style={styles.salesmanHeader}>FOC</Text>
          {foc.products.map((product: any, index: number) => (
            <View key={`foc-${index}-${product.code}`} style={styles.tableRow}>
              <Text style={styles.colID}>{product.code}</Text>
              <Text style={styles.colDescription}>{product.description}</Text>
              <Text style={styles.colQty}>
                {formatNumber(product.quantity)}
              </Text>
              <Text style={styles.colAmount}>.00</Text>
            </View>
          ))}
          <View style={styles.dashedLineAboveSubtotal}>
            <Text style={styles.colID}></Text>
            <Text style={styles.colDescription}></Text>
            <View
              style={[
                styles.dashedLineCell,
                {
                  width: styles.colQty.width,
                  paddingRight: styles.colQty.paddingRight,
                },
              ]}
            />
            <View
              style={[
                styles.dashedLineCell,
                {
                  width: styles.colAmount.width,
                  paddingRight: styles.colAmount.paddingRight,
                  borderTopWidth: 0,
                },
              ]}
            />{" "}
            {/* No dash for amount .00 */}
          </View>
          <View
            style={[
              styles.tableRow,
              styles.subtotalRow,
              { borderBottomWidth: 0 },
            ]}
          >
            <Text style={styles.colID}></Text>
            <Text style={styles.colDescription}></Text>
            <Text style={[styles.colQty, styles.headerText]}>
              {formatNumber(foc.total.quantity)}
            </Text>
            <Text style={[styles.colAmount, styles.headerText]}>.00</Text>
          </View>
          <View style={styles.solidLine} />
        </View>
      )}
      {/* Returns section */}
      {returns && returns.products && returns.products.length > 0 && (
        <View style={styles.salesmanSection}>
          <Text style={styles.salesmanHeader}>RETURN PRODUCTS</Text>
          {returns.products.map((product: any, index: number) => (
            <View
              key={`return-${index}-${product.code}`}
              style={styles.tableRow}
            >
              <Text style={styles.colID}>{product.code}</Text>
              <Text style={styles.colDescription}>{product.description}</Text>
              <Text style={styles.colQty}>
                {formatNumber(product.quantity)}
              </Text>
              <Text style={styles.colAmount}>
                {product.amount !== 0 ? formatCurrency(product.amount) : "-"}
              </Text>
            </View>
          ))}
          <View style={styles.dashedLineAboveSubtotal}>
            <Text style={styles.colID}></Text>
            <Text style={styles.colDescription}></Text>
            <View
              style={[
                styles.dashedLineCell,
                {
                  width: styles.colQty.width,
                  paddingRight: styles.colQty.paddingRight,
                },
              ]}
            />
            <View
              style={[
                styles.dashedLineCell,
                {
                  width: styles.colAmount.width,
                  paddingRight: styles.colAmount.paddingRight,
                  borderTopWidth: 0,
                },
              ]}
            />{" "}
            {/* No dash for amount '-' */}
          </View>
          <View
            style={[
              styles.tableRow,
              styles.subtotalRow,
              { borderBottomWidth: 0 },
            ]}
          >
            <Text style={styles.colID}></Text>
            <Text style={styles.colDescription}></Text>
            <Text style={[styles.colQty, styles.headerText]}>
              {formatNumber(returns.total.quantity)}
            </Text>
            <Text style={[styles.colAmount, styles.headerText]}>
              {returns.total.amount !== 0
                ? formatCurrency(returns.total.amount)
                : "-"}
            </Text>
          </View>
          <View style={styles.solidLine} />
        </View>
      )}
      <Text
        style={styles.pageNumber}
        render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`}
        fixed
      />
    </Page>
  );
};

// Component for Sisa Sales Summary
const SisaSalesPage: React.FC<{ data: any; monthFormat: string }> = ({
  data,
  monthFormat,
}) => {
  const categories = [
    { key: "empty_bag", data: data.empty_bag, label: "EMPTY BAG" }, // Label for breakdown
    { key: "sbh", data: data.sbh, label: "SISA BIHUN" },
    { key: "smee", data: data.smee, label: "SISA MEE" },
  ];
  const totalSisaQuantity = categories.reduce(
    (sum, cat) => sum + (cat.data?.quantity || 0),
    0
  );
  const totalSisaAmount = categories.reduce(
    (sum, cat) => sum + (cat.data?.amount || 0),
    0
  );

  return (
    <Page size="A4" style={styles.page} wrap>
      <Text style={styles.companyHeader}>
        TIEN HOCK FOOD INDUSTRIES S/B (953309-T)
      </Text>
      <Text style={styles.reportTitle}>
        REPORT: MONTHLY SUMMARY SISA SALES AS AT {monthFormat}
      </Text>
      <Text style={styles.salesmanInfo}>SALESMAN: ALL</Text>

      <View style={styles.table}>
        <View style={styles.tableHeader}>
          <Text style={[styles.sisaColID, styles.headerText]}>STOCK</Text>
          <Text style={[styles.sisaColDescription, styles.headerText]}>
            DESCRIPTION
          </Text>
          <Text style={[styles.sisaColQty, styles.headerText]}>QTY</Text>
          <Text style={[styles.sisaColUPrice, styles.headerText]}>
            U/PRICE
          </Text>
          <Text style={[styles.sisaColAmount, styles.headerText]}>
            AMOUNT
          </Text>
        </View>

        {categories.map(({ key, data: categoryData }) => {
          if (!categoryData || categoryData.products.length === 0) return null;

          return (
            <React.Fragment key={key}>
              {categoryData.products.map((product: any, index: number) => (
                <View
                  key={`${key}-${index}-${product.code}`}
                  style={styles.tableRow}
                >
                  <Text style={styles.sisaColID}>{product.code}</Text>
                  <Text style={styles.sisaColDescription}>
                    {product.description}
                  </Text>
                  <Text style={styles.sisaColQty}>
                    {formatNumber(product.quantity)}
                  </Text>
                  <Text style={styles.sisaColUPrice}>
                    {product.u_price ? formatCurrency(product.u_price) : ""}
                  </Text>
                  <Text style={styles.sisaColAmount}>
                    {formatCurrency(product.amount)}
                  </Text>
                </View>
              ))}
              <View style={styles.dashedLineAboveSubtotal}>
                <Text style={styles.sisaColID}></Text>
                <Text style={styles.sisaColDescription}></Text>
                <Text style={styles.sisaColUPrice}></Text>
                <View
                  style={[
                    styles.dashedLineCell,
                    {
                      width: styles.sisaColQty.width,
                      paddingRight: styles.sisaColQty.paddingRight,
                    },
                  ]}
                />
                <View
                  style={[
                    styles.dashedLineCell,
                    {
                      width: styles.sisaColAmount.width,
                      paddingRight: styles.sisaColAmount.paddingRight,
                    },
                  ]}
                />
              </View>
              <View
                style={[
                  styles.tableRow,
                  styles.subtotalRow,
                  { borderBottomWidth: 0 },
                ]}
              >
                <Text style={styles.sisaColID}></Text>
                <Text style={styles.sisaColDescription}></Text>
                <Text style={[styles.sisaColQty, styles.headerText]}>
                  {formatNumber(categoryData.quantity)}
                </Text>
                <Text style={styles.sisaColUPrice}></Text>
                <Text style={[styles.sisaColAmount, styles.headerText]}>
                  {formatCurrency(categoryData.amount)}
                </Text>
              </View>
              <View style={styles.solidLine} />
            </React.Fragment>
          );
        })}

        {/* TOTAL */}
        <View style={[styles.tableRow, styles.totalRow]}>
          <Text style={[styles.sisaColID, styles.headerText]}>TOTAL :</Text>
          <Text style={styles.sisaColDescription}></Text>
          <Text style={[styles.sisaColQty, styles.headerText]}>
            {formatNumber(totalSisaQuantity)}
          </Text>
          <Text style={styles.sisaColUPrice}></Text>
          <Text style={[styles.sisaColAmount, styles.headerText]}>
            {formatCurrency(totalSisaAmount)}
          </Text>
        </View>
      </View>

      {/* Breakdown section */}
      <View style={styles.breakdownSection}>
        <View style={styles.breakdownColumn}>
          {categories.map(({ key, data: catData, label }) => {
            if (!catData) return null;
            // Show EMPTY BAG last in breakdown as per plan
            if (key === "empty_bag") return null;
            return (
              <View style={styles.breakdownRow} key={`${key}-qtybrk`}>
                <Text style={styles.breakdownLabel}>{label} (QTY) =</Text>
                <Text style={styles.breakdownValue}>
                  {formatNumber(catData.quantity || 0)}
                </Text>
              </View>
            );
          })}
          {/* EMPTY BAG QTY last */}
          {data.empty_bag && (
            <View style={styles.breakdownRow} key="empty_bag-qtybrk">
              <Text style={styles.breakdownLabel}>EMPTY BAG (QTY) =</Text>
              <Text style={styles.breakdownValue}>
                {formatNumber(data.empty_bag.quantity || 0)}
              </Text>
            </View>
          )}
        </View>
        <View style={styles.breakdownColumn}>
          {categories.map(({ key, data: catData, label }) => {
            if (!catData) return null;
            if (key === "empty_bag") return null;
            return (
              <View style={styles.breakdownRow} key={`${key}-amtbrk`}>
                <Text style={styles.breakdownLabel}>{label} (AMOUNT) =</Text>
                <Text style={styles.breakdownValue}>
                  {formatCurrency(catData.amount || 0)}
                </Text>
              </View>
            );
          })}
          {/* EMPTY BAG AMOUNT last */}
          {data.empty_bag && (
            <View style={styles.breakdownRow} key="empty_bag-amtbrk">
              <Text style={styles.breakdownLabel}>EMPTY BAG (AMOUNT) =</Text>
              <Text style={styles.breakdownValue}>
                {formatCurrency(data.empty_bag.amount || 0)}
              </Text>
            </View>
          )}
        </View>
      </View>
      <Text
        style={styles.pageNumber}
        render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`}
        fixed
      />
    </Page>
  );
};
