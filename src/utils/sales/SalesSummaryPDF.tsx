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
    padding: 20,
    fontFamily: "Helvetica",
    fontSize: 9,
    lineHeight: 1.3,
  },
  companyHeader: {
    fontSize: 12,
    fontFamily: "Helvetica-Bold",
    marginBottom: 4,
    textAlign: "left",
  },
  reportTitle: {
    fontFamily: "Helvetica", // Keep it normal weight for subtitle
    marginBottom: 3,
    textAlign: "left",
  },
  table: {},
  tableHeader: {
    flexDirection: "row",
    borderTopWidth: 0.5,
    borderTopColor: "#333",
    borderBottomWidth: 0.5,
    borderBottomColor: "#333",
    paddingVertical: 2,
    marginBottom: 4, // Space below header
    backgroundColor: "#f8f8f8", // Light grey for header background
  },
  tableRow: {
    flexDirection: "row",
  },
  // Standard Column Styles
  colID: { width: "18%", paddingHorizontal: 3 },
  colDescription: { width: "42%", paddingHorizontal: 3 },
  colQty: { width: "15%", textAlign: "right", paddingRight: 8 },
  colAmount: { width: "25%", textAlign: "right", paddingRight: 3 },
  headerText: {
    fontFamily: "Helvetica-Bold",
  },
  dashedLineAboveSubtotal: {
    flexDirection: "row",
    marginTop: 1, // Space before dashed line
    paddingTop: 1,
  },
  // Generic dashed line cell style (apply width and paddingRight dynamically)
  dashedLineCell: {
    borderTopWidth: 0.5,
    borderTopColor: "#333",
    borderTopStyle: "dashed",
    height: 1,
    marginTop: 1,
  },
  categorySubtotalRow: {
    paddingTop: 2,
    paddingBottom: 1.5,
    borderBottomWidth: 0.5,
    borderBottomColor: "#ccc",
    backgroundColor: "#fafafa", // Subtle background for subtotals
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
    paddingTop: 3, // More space above grand total
    borderTopWidth: 1, // Thicker line for grand total
    borderTopColor: "#000",
    borderBottomWidth: 1,
    borderBottomColor: "#000",
  },
  breakdownSection: {
    flexDirection: "row",
    marginTop: 3,
    marginBottom: 12,
  },
  leftBreakdownColumn: {
    width: "50%",
    paddingRight: 15, // Space between columns
  },
  rightBreakdownColumn: {
    width: "50%",
    paddingRight: 3, // No padding on right column
  },
  breakdownRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 0.5, // Tighter spacing
    paddingVertical: 0.5,
  },
  breakdownLabel: {},
  breakdownValue: {
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
    marginBottom: 6, // Space between category sections
  },
  grandTotalSection: {
    marginTop: -7,
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
    // Format: Month YYYY, e.g., May 2025
    const monthYearFormatted = `${dateForMonthName.toLocaleDateString("en-US", {
      month: "long",
    })} ${dateForMonthName.getFullYear()}`;

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
            title="MONTHLY SUMMARY SALES"
            monthFormat={monthYearFormatted}
          />
        )}
        {data.mee_salesmen && (
          <SalesmenPage
            data={data.mee_salesmen}
            title="MONTHLY SUMMARY MEE SALES"
            monthFormat={monthYearFormatted}
            productType="MEE"
          />
        )}
        {data.bihun_salesmen && (
          <SalesmenPage
            data={data.bihun_salesmen}
            title="MONTHLY SUMMARY BIHUN SALES"
            monthFormat={monthYearFormatted}
            productType="BIHUN"
          />
        )}
        {data.jp_salesmen && (
          <SalesmenPage
            data={data.jp_salesmen}
            title="MONTHLY SUMMARY JELLYPOLLY SALES"
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
      <Text style={styles.companyHeader}>TIEN HOCK FOOD INDUSTRIES S/B</Text>
      <Text style={styles.reportTitle}>
        Monthly Summary Sales as at {monthFormat}
      </Text>

      {/* Single Table Header */}
      <View style={styles.tableHeader}>
        <Text style={[styles.colID, styles.headerText]}>ID</Text>
        <Text style={[styles.colDescription, styles.headerText]}>
          Description
        </Text>
        <Text style={[styles.colQty, styles.headerText]}>Quantity</Text>
        <Text style={[styles.colAmount, styles.headerText]}>Amount</Text>
      </View>

      {/* All Categories Content */}
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
            {/* Product rows */}
            {category.products?.map((product: any, index: number) => (
              <View
                key={`${key}-${index}-${product.code}`}
                style={styles.tableRow}
              >
                <Text style={styles.colID}>{product.code}</Text>
                <Text style={styles.colDescription}>{product.description}</Text>
                <Text style={styles.colQty}>
                  {product.quantity > 0 ? formatNumber(product.quantity) : ""}
                </Text>
                <Text style={styles.colAmount}>
                  {formatCurrency(product.amount)}
                </Text>
              </View>
            ))}

            {/* Direct deduction for categories without products */}
            {(!category.products || category.products.length === 0) &&
              category.amount !== 0 && (
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
            <View style={[styles.tableRow, styles.categorySubtotalRow]}>
              <Text style={styles.colID}></Text>
              <Text style={styles.colDescription}></Text>
              <Text style={[styles.colQty]}>
                {formatNumber(category.quantity)}
              </Text>
              <Text style={[styles.colAmount]}>
                {formatCurrency(category.amount)}
              </Text>
            </View>
          </View>
        );
      })}

      {/* ADJ - Rounding Adjustment (if provided as a category, similar to sample) */}
      {categories.total_rounding &&
        categories.total_rounding.products &&
        categories.total_rounding.products.length > 0 &&
        categories.total_rounding.amount !== 0 && (
          <View key="total_rounding_display" style={styles.categorySection}>
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
            <View style={[styles.tableRow, styles.categorySubtotalRow]}>
              <Text style={styles.colID}></Text>
              <Text style={styles.colDescription}></Text>
              <Text style={[styles.colQty]}>
                {formatNumber(categories.total_rounding.quantity)}
              </Text>
              <Text style={[styles.colAmount]}>
                {formatCurrency(categories.total_rounding.amount)}
              </Text>
            </View>
          </View>
        )}

      {/* Grand Total Section */}
      <View style={styles.grandTotalSection}>
        <View style={[styles.tableRow, styles.totalRow]}>
          <Text style={[styles.colID, styles.headerText]}>Grand Total:</Text>
          <Text style={styles.colDescription}></Text>
          <Text style={[styles.colQty, styles.headerText]}>
            {formatNumber(totals.totalQuantity || 0)}
          </Text>
          <Text style={[styles.colAmount, styles.headerText]}>
            {formatCurrency(totals.grandTotalAmount)}
          </Text>
        </View>
      </View>

      {/* Breakdown section remains the same */}
      <View style={styles.breakdownSection}>
        <View style={styles.leftBreakdownColumn}>
          <View style={styles.breakdownRow}>
            <Text style={styles.breakdownLabel}>Mee =</Text>
            <Text style={styles.breakdownValue}>
              {formatNumber(totals.meeQuantity || 0)}
            </Text>
          </View>
          <View style={styles.breakdownRow}>
            <Text style={styles.breakdownLabel}>Bihun =</Text>
            <Text style={styles.breakdownValue}>
              {formatNumber(totals.bihunQuantity || 0)}
            </Text>
          </View>
          <View style={styles.breakdownRow}>
            <Text style={styles.breakdownLabel}>Mee + Bihun =</Text>
            <Text style={styles.breakdownValue}>
              {formatNumber(totals.meeBihunQuantity || 0)}
            </Text>
          </View>
          <View style={styles.breakdownRow}>
            <Text style={styles.breakdownLabel}>Jelly Polly =</Text>
            <Text style={styles.breakdownValue}>
              {formatNumber(totals.jpQuantity || 0)}
            </Text>
          </View>
          <View style={styles.breakdownSeparator} />
          <View style={styles.breakdownRow}>
            <Text style={styles.breakdownLabel}>Cash Sales =</Text>
            <Text style={styles.breakdownValue}>
              {formatCurrency(totals.cashSalesAmount || 0)}
            </Text>
          </View>
          <View style={styles.breakdownRow}>
            <Text style={styles.breakdownLabel}>CR Sales =</Text>
            <Text style={styles.breakdownValue}>
              {formatCurrency(totals.creditSalesAmount || 0)}
            </Text>
          </View>
          <View style={styles.breakdownSeparator} />
          <View style={styles.breakdownRow}>
            <Text style={[styles.breakdownLabel, styles.headerText]}>
              Grand Total =
            </Text>
            <Text style={[styles.breakdownValue, styles.headerText]}>
              {formatCurrency(totals.grandTotalInvoicesAmount || 0)}
            </Text>
          </View>
        </View>
        <View style={styles.rightBreakdownColumn}>
          <View style={styles.breakdownRow}>
            <Text style={styles.breakdownLabel}>Mee =</Text>
            <Text style={styles.breakdownValue}>
              {formatCurrency(totals.meeAmount || 0)}
            </Text>
          </View>
          <View style={styles.breakdownRow}>
            <Text style={styles.breakdownLabel}>Bihun =</Text>
            <Text style={styles.breakdownValue}>
              {formatCurrency(totals.bihunAmount || 0)}
            </Text>
          </View>
          <View style={styles.breakdownRow}>
            <Text style={styles.breakdownLabel}>Mee + Bihun =</Text>
            <Text style={styles.breakdownValue}>
              {formatCurrency(totals.meeBihunAmount || 0)}
            </Text>
          </View>
          <View style={styles.breakdownRow}>
            <Text style={styles.breakdownLabel}>Jelly Polly =</Text>
            <Text style={styles.breakdownValue}>
              {formatCurrency(totals.jpAmount || 0)}
            </Text>
          </View>
          <View style={styles.breakdownSeparator} />
          <View style={styles.breakdownRow}>
            <Text style={[styles.breakdownLabel, styles.headerText]}>
              Grand Total =
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
      <Text style={styles.companyHeader}>TIEN HOCK FOOD INDUSTRIES S/B</Text>
      <Text style={styles.reportTitle}>
        {title} as at {monthFormat}
      </Text>
      <View style={styles.tableHeader}>
        <Text style={[styles.colID, styles.headerText]}>ID</Text>
        <Text style={[styles.colDescription, styles.headerText]}>
          Description
        </Text>
        <Text style={[styles.colQty, styles.headerText]}>Quantity</Text>
        <Text style={[styles.colAmount, styles.headerText]}>Amount</Text>
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
          <Text style={styles.salesmanHeader}>Return Products</Text>
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
        Monthly Summary Sales as at {monthFormat}
      </Text>

      <View style={styles.table}>
        <View style={styles.tableHeader}>
          <Text style={[styles.sisaColID, styles.headerText]}>ID</Text>
          <Text style={[styles.sisaColDescription, styles.headerText]}>
            Description
          </Text>
          <Text style={[styles.sisaColQty, styles.headerText]}>Quantity</Text>
          <Text style={[styles.sisaColUPrice, styles.headerText]}>U/Price</Text>
          <Text style={[styles.sisaColAmount, styles.headerText]}>Amount</Text>
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
          <Text style={[styles.sisaColID, styles.headerText]}>Total :</Text>
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
        <View style={styles.leftBreakdownColumn}>
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
        <View style={styles.rightBreakdownColumn}>
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
