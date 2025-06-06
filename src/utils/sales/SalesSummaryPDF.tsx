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

const ROWS_PER_PAGE = 60; // Approximate number of rows per page
const HEADER_ROWS = 2; // Company header + report title
const TABLE_HEADER_ROWS = 1; // Table header row
const SECTION_SEPARATOR_ROWS = 1; // Space between sections
const CATEGORY_SUBTOTAL_ROWS = 3; // Dashed line + subtotal + spacing
const BREAKDOWN_SECTION_ROWS = 20; // Approximate rows for breakdown sections
const SALESMAN_HEADER_ROWS = 1; // Salesman name header

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
    paddingTop: 3, // More space above header
    marginBottom: 4, // Space below header
    backgroundColor: "#f8f8f8", // Light grey for header background
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 1, // Consistent padding for rows
  },
  // Standard Column Styles
  colID: { width: "18%", paddingHorizontal: 3 },
  colDescription: { width: "42%", paddingHorizontal: 3 },
  colQty: { width: "15%", textAlign: "right", paddingRight: 8 },
  colAmount: { width: "25%", textAlign: "right", paddingRight: 3 },
  boldText: {
    fontFamily: "Helvetica-Bold",
  },
  dashedLineAboveSubtotal: {
    flexDirection: "row",
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
    paddingVertical: 2,
    borderBottomWidth: 0.5,
    borderBottomColor: "#ccc",
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
  sectionTitle: {
    // For "Quantity Breakdown", "Amount Breakdown"
    fontFamily: "Helvetica-Bold",
    marginBottom: 3, // Space after section title
    marginTop: 2, // Space before section title
  },
  breakdownSection: {
    flexDirection: "row",
    marginTop: 3,
    marginBottom: 6,
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
    marginVertical: 2,
    paddingHorizontal: 3,
    textAlign: "left", // Ensure salesman name is left aligned
  },
  categorySection: {
    marginBottom: 3, // Space between category sections
  },
  grandTotalSection: {
    marginTop: -4,
  },
  // Column Styles for Sisa Sales Page (5 columns)
  sisaColID: { width: "15%", paddingHorizontal: 3 }, // STOCK
  sisaColQty: { width: "12%", textAlign: "right", paddingRight: 8 }, // QTY
  sisaColDescription: { width: "38%", paddingHorizontal: 3 }, // DESCRIPTION
  sisaColUPrice: { width: "15%", textAlign: "right", paddingRight: 8 }, // U/PRICE
  sisaColAmount: { width: "20%", textAlign: "right", paddingRight: 3 }, // AMOUNT
  sectionSeparator: {
    borderBottomWidth: 1,
    borderBottomColor: "#ccc",
  },
  sectionHeader: {
    marginVertical: 5,
  },
});

const calculateAllSalesRows = (data: any, allProducts: any[]): number => {
  const { categories } = data;
  let totalRows = HEADER_ROWS + TABLE_HEADER_ROWS;

  // Count rows for each category
  Object.entries(categories).forEach(([key, category]: [string, any]) => {
    if (key === "total_rounding" && category === 0) return;

    if (category.products && category.products.length > 0) {
      totalRows += category.products.length; // Product rows
      totalRows += CATEGORY_SUBTOTAL_ROWS; // Subtotal with dashed line
    } else if (category.amount !== 0) {
      totalRows += 1; // Single row for direct deduction
      totalRows += CATEGORY_SUBTOTAL_ROWS;
    }
  });

  // Grand total section
  totalRows += 2; // Grand total row with borders

  // Breakdown section
  totalRows += BREAKDOWN_SECTION_ROWS;

  return totalRows;
};

const calculateSalesmenRows = (data: any): number => {
  const { salesmen, foc, returns } = data;
  let totalRows = HEADER_ROWS + TABLE_HEADER_ROWS;

  // Count rows for each salesman
  Object.entries(salesmen).forEach(([_, salesmanData]: [string, any]) => {
    if (salesmanData.products.length > 0) {
      totalRows += SALESMAN_HEADER_ROWS;
      totalRows += salesmanData.products.length;
      totalRows += CATEGORY_SUBTOTAL_ROWS;
    }
  });

  // FOC section
  if (foc && foc.products && foc.products.length > 0) {
    totalRows += SALESMAN_HEADER_ROWS;
    totalRows += foc.products.length;
    totalRows += CATEGORY_SUBTOTAL_ROWS;
  }

  // Returns section
  if (returns && returns.products && returns.products.length > 0) {
    totalRows += SALESMAN_HEADER_ROWS;
    totalRows += returns.products.length;
    totalRows += CATEGORY_SUBTOTAL_ROWS;
  }

  return totalRows;
};

const calculateSisaSalesRows = (data: any): number => {
  let totalRows = HEADER_ROWS + TABLE_HEADER_ROWS;

  const categories = [
    { key: "empty_bag", data: data.empty_bag },
    { key: "sbh", data: data.sbh },
    { key: "smee", data: data.smee },
  ];

  categories.forEach(({ data: categoryData }) => {
    if (!categoryData) return;

    if (categoryData.products && categoryData.products.length > 0) {
      totalRows += categoryData.products.length;
      totalRows += CATEGORY_SUBTOTAL_ROWS;
    } else if (categoryData.quantity > 0 || categoryData.amount > 0) {
      totalRows += 1; // Single row
      totalRows += CATEGORY_SUBTOTAL_ROWS;
    }
  });

  // Grand total section
  totalRows += 2;

  // Breakdown section
  totalRows += 10; // Smaller breakdown for sisa

  return totalRows;
};

const paginateSections = (data: SummaryData, allProducts: any[]) => {
  const sections: Array<{
    type: string;
    data: any;
    rows: number;
    component: React.ReactNode;
  }> = [];

  // Calculate rows for each section
  if (data.all_sales) {
    const rows = calculateAllSalesRows(data.all_sales, allProducts);
    sections.push({
      type: "all_sales",
      data: data.all_sales,
      rows,
      component: null, // Will be set later
    });
  }

  if (data.all_salesmen) {
    const rows = calculateSalesmenRows(data.all_salesmen);
    sections.push({
      type: "all_salesmen",
      data: data.all_salesmen,
      rows,
      component: null,
    });
  }

  if (data.mee_salesmen) {
    const rows = calculateSalesmenRows(data.mee_salesmen);
    sections.push({
      type: "mee_salesmen",
      data: data.mee_salesmen,
      rows,
      component: null,
    });
  }

  if (data.bihun_salesmen) {
    const rows = calculateSalesmenRows(data.bihun_salesmen);
    sections.push({
      type: "bihun_salesmen",
      data: data.bihun_salesmen,
      rows,
      component: null,
    });
  }

  if (data.jp_salesmen) {
    const rows = calculateSalesmenRows(data.jp_salesmen);
    sections.push({
      type: "jp_salesmen",
      data: data.jp_salesmen,
      rows,
      component: null,
    });
  }

  if (data.sisa_sales) {
    const rows = calculateSisaSalesRows(data.sisa_sales);
    sections.push({
      type: "sisa_sales",
      data: data.sisa_sales,
      rows,
      component: null,
    });
  }

  // Group sections into pages
  const pages: Array<typeof sections> = [];
  let currentPage: typeof sections = [];
  let currentPageRows = 0;

  sections.forEach((section, index) => {
    const sectionRows =
      section.rows + (currentPage.length > 0 ? SECTION_SEPARATOR_ROWS : 0);

    // Check if adding this section exceeds page limit
    if (
      currentPageRows + sectionRows > ROWS_PER_PAGE &&
      currentPage.length > 0
    ) {
      pages.push(currentPage);
      currentPage = [];
      currentPageRows = 0;
    }

    currentPage.push(section);
    currentPageRows +=
      section.rows + (currentPage.length > 1 ? SECTION_SEPARATOR_ROWS : 0);
  });

  // Add the last page if it has content
  if (currentPage.length > 0) {
    pages.push(currentPage);
  }

  return pages;
};

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

// Helper function to determine product category order
const getProductCategoryOrder = (productCode: string): number => {
  const categoryOrder = [
    "1-",
    "2-",
    "MEQ-",
    "S-",
    "OTH",
    "WE-MNL",
    "WE-2UDG",
    "WE-300G",
    "WE-600G",
    "EMPTY_BAG",
    "SBH",
    "SMEE",
    "WE-360",
    "returns",
    "less",
    "total_rounding",
  ];

  // Check for exact matches first
  const exactMatch = categoryOrder.findIndex((cat) => productCode === cat);
  if (exactMatch !== -1) return exactMatch;

  // Check for prefix matches
  const prefixMatch = categoryOrder.findIndex((cat) => {
    if (cat.endsWith("-")) {
      return productCode.startsWith(cat);
    }
    if (cat === "WE-360") {
      return productCode.match(/^(WE-360\(5PK\)|WE-360|WE-3UDG|WE-420)$/);
    }
    if (cat === "EMPTY_BAG") {
      return productCode.startsWith("EMPTY_BAG");
    }
    return false;
  });

  return prefixMatch !== -1 ? prefixMatch : 999; // Unknown products go to end
};

// Helper function to sort products by category order
const sortProductsByCategory = (products: any[]): any[] => {
  return [...products].sort((a, b) => {
    const orderA = getProductCategoryOrder(a.code);
    const orderB = getProductCategoryOrder(b.code);
    if (orderA !== orderB) {
      return orderA - orderB;
    }
    // If same category, sort by code alphabetically
    return a.code.localeCompare(b.code);
  });
};

export const generateSalesSummaryPDF = async (
  data: SummaryData,
  month: number,
  year: number,
  action: "download" | "print",
  allProducts: any[] = []
) => {
  try {
    const dateForMonthName = new Date(year, month);
    const monthYearFormatted = `${dateForMonthName.toLocaleDateString("en-US", {
      month: "long",
    })} ${dateForMonthName.getFullYear()}`;

    // Paginate sections
    const pages = paginateSections(data, allProducts);

    const doc = (
      <Document title={`Sales Summary - ${monthYearFormatted}`}>
        {pages.map((pageSections, pageIndex) => (
          <Page key={`page-${pageIndex}`} size="A4" style={styles.page}>
            {pageSections.map((section, sectionIndex) => {
              const isLastSection = sectionIndex === pageSections.length - 1;

              return (
                <React.Fragment key={`${section.type}-${sectionIndex}`}>
                  {/* Render section based on type */}
                  {section.type === "all_sales" && (
                    <AllSalesSection
                      data={section.data}
                      monthFormat={monthYearFormatted}
                      allProducts={allProducts}
                    />
                  )}

                  {section.type === "all_salesmen" && (
                    <SalesmenSection
                      data={section.data}
                      title="Monthly Summary of Sales by Salesmen"
                      monthFormat={monthYearFormatted}
                    />
                  )}

                  {section.type === "mee_salesmen" && (
                    <SalesmenSection
                      data={section.data}
                      title="Monthly Summary of Mee Sales by Salesmen"
                      monthFormat={monthYearFormatted}
                      productType="MEE"
                    />
                  )}

                  {section.type === "bihun_salesmen" && (
                    <SalesmenSection
                      data={section.data}
                      title="Monthly Summary of Bihun Sales by Salesmen"
                      monthFormat={monthYearFormatted}
                      productType="BIHUN"
                    />
                  )}

                  {section.type === "jp_salesmen" && (
                    <SalesmenSection
                      data={section.data}
                      title="Monthly Summary of JellyPolly Sales by Salesmen"
                      monthFormat={monthYearFormatted}
                      productType="JP"
                    />
                  )}

                  {section.type === "sisa_sales" && (
                    <SisaSalesSection
                      data={section.data}
                      monthFormat={monthYearFormatted}
                    />
                  )}
                </React.Fragment>
              );
            })}
          </Page>
        ))}
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
const AllSalesSection: React.FC<{
  data: any;
  monthFormat: string;
  allProducts: any[];
}> = ({ data, monthFormat, allProducts }) => {
  const { categories, totals } = data;

  // Calculate breakdown totals using product types from cache
  const calculateBreakdownTotals = () => {
    // Create a map of product codes to types for quick lookup
    const productTypeMap = allProducts.reduce((map, product) => {
      map[product.id] = product.type;
      return map;
    }, {} as Record<string, string>);

    let meeQuantity = 0,
      meeAmount = 0;
    let bihunQuantity = 0,
      bihunAmount = 0;
    let jpQuantity = 0,
      jpAmount = 0;
    let emptyBagQuantity = 0,
      emptyBagAmount = 0;
    let sisaQuantity = 0,
      sisaAmount = 0; // SBH + SMEE
    let othersQuantity = 0,
      othersAmount = 0;
    let lessQuantity = 0,
      lessAmount = 0; // LESS deductions

    // Iterate through all categories and their products
    Object.entries(categories).forEach(([key, category]: [string, any]) => {
      if (key === "total_rounding" || key === "category_returns") return;

      // Handle specific categories by key
      if (key === "category_empty_bag") {
        emptyBagQuantity += category.quantity || 0;
        emptyBagAmount += category.amount || 0;
        return;
      }

      if (key === "category_sbh" || key === "category_smee") {
        sisaQuantity += category.quantity || 0;
        sisaAmount += category.amount || 0;
        return;
      }

      if (key === "category_oth") {
        othersQuantity += category.quantity || 0;
        othersAmount += category.amount || 0;
        return;
      }

      if (key === "category_less") {
        lessQuantity += category.quantity || 0;
        lessAmount += category.amount || 0;
        return;
      }

      // Handle products by type
      if (category.products && Array.isArray(category.products)) {
        category.products.forEach((product: any) => {
          const productType = productTypeMap[product.code];
          const quantity = product.quantity || 0;
          const amount = product.amount || 0; // Use actual amount from invoice

          switch (productType) {
            case "MEE":
              meeQuantity += quantity;
              meeAmount += amount;
              break;
            case "BH":
              bihunQuantity += quantity;
              bihunAmount += amount;
              break;
            case "JP":
              jpQuantity += quantity;
              jpAmount += amount;
              break;
            case "OTH":
              othersQuantity += quantity;
              othersAmount += amount;
              break;
          }
        });
      }
    });

    return {
      meeQuantity,
      meeAmount,
      bihunQuantity,
      bihunAmount,
      meeBihunQuantity: meeQuantity + bihunQuantity,
      meeBihunAmount: meeAmount + bihunAmount,
      jpQuantity,
      jpAmount,
      emptyBagQuantity,
      emptyBagAmount,
      sisaQuantity,
      sisaAmount,
      othersQuantity,
      othersAmount,
      lessQuantity,
      lessAmount,
      cashSalesAmount: totals.cashSales?.amount || 0,
      creditSalesAmount: totals.creditSales?.amount || 0,
      grandTotalInvoicesAmount: totals.grandTotal || 0,
      totalProductsAmount:
        meeAmount +
        bihunAmount +
        jpAmount +
        emptyBagAmount +
        sisaAmount +
        othersAmount +
        lessAmount,
      totalTax: categories.total_tax || 0,
      totalRounding: categories.total_rounding || 0,
    };
  };

  const breakdownTotals = calculateBreakdownTotals();

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
    less: "Less/Deductions",
    returns: "Return Products",
    total_rounding: "Rounding Adjustments",
  };

  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.companyHeader}>TIEN HOCK FOOD INDUSTRIES S/B</Text>
      <Text style={styles.reportTitle}>
        Monthly Summary of Sales in {monthFormat}
      </Text>

      {/* Single Table Header */}
      <View style={styles.tableHeader}>
        <Text style={[styles.colID, styles.boldText]}>ID</Text>
        <Text style={[styles.colDescription, styles.boldText]}>
          Description
        </Text>
        <Text style={[styles.colQty, styles.boldText]}>Quantity</Text>
        <Text style={[styles.colAmount, styles.boldText]}>Amount</Text>
      </View>

      {/* All Categories Content */}
      {Object.entries(categories).map(([key, category]: [string, any]) => {
        if (!category.products || category.products.length === 0) {
          return null;
        }

        // Skip total_rounding if amount is 0
        if (key === "total_rounding" && category === 0) {
          return null;
        }

        return (
          <View key={key} style={styles.categorySection}>
            {/* Product rows */}
            {category.products?.map((product: any, index: number) => (
              <View
                key={`${key}-${index}-${product.code}`}
                style={[
                  styles.tableRow,
                  ...(category.products && category.products.length === 1
                    ? [{ paddingVertical: 0 }]
                    : []),
                ]}
              >
                <Text style={styles.colID}>{product.code}</Text>
                <Text style={styles.colDescription}>
                  {product.description}
                  {key === "category_returns" && " (Returned)"}
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

            {/* Dashed line above subtotal */}
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

            {/* Category subtotal */}
            <View style={[styles.tableRow, styles.categorySubtotalRow]}>
              <Text style={styles.colID}></Text>
              <Text style={styles.colDescription}></Text>
              <Text style={[styles.colQty, styles.boldText]}>
                {formatNumber(category.quantity)}
              </Text>
              <Text style={[styles.colAmount, styles.boldText]}>
                {formatCurrency(category.amount)}
              </Text>
            </View>
          </View>
        );
      })}

      {/* Grand Total Section */}
      <View style={styles.grandTotalSection}>
        <View style={[styles.tableRow, styles.totalRow]}>
          <Text style={[styles.colID, styles.boldText]}>Grand Total:</Text>
          <Text style={styles.colDescription}></Text>
          <Text style={[styles.colQty, styles.boldText]}>
            {formatNumber(
              Object.entries(categories).reduce(
                (sum: number, [key, category]: [string, any]) => {
                  // Skip total_rounding as it's not a category object
                  if (typeof category === "number") return sum;
                  // Skip category_returns and category_less quantities
                  if (
                    key === "category_returns" ||
                    key === "category_less" ||
                    key === "category_tax_rounding"
                  )
                    return sum;
                  return sum + (category.quantity || 0);
                },
                0
              )
            )}
          </Text>
          <Text style={[styles.colAmount, styles.boldText]}>
            {formatCurrency(totals.grandTotal)}
          </Text>
        </View>
      </View>

      {/* Breakdown section */}
      <View style={styles.breakdownSection} wrap={false}>
        <View style={styles.leftBreakdownColumn}>
          <Text style={styles.sectionTitle}>Quantity</Text>
          <View style={styles.breakdownRow}>
            <Text style={styles.breakdownLabel}>Mee</Text>
            <Text style={styles.breakdownValue}>
              {formatNumber(breakdownTotals.meeQuantity)}
            </Text>
          </View>
          <View style={styles.breakdownRow}>
            <Text style={styles.breakdownLabel}>Bihun</Text>
            <Text style={styles.breakdownValue}>
              {formatNumber(breakdownTotals.bihunQuantity)}
            </Text>
          </View>
          <View style={styles.breakdownSeparator} />
          <View style={styles.breakdownRow}>
            <Text style={styles.breakdownLabel}>Mee + Bihun</Text>
            <Text style={styles.breakdownValue}>
              {formatNumber(breakdownTotals.meeBihunQuantity)}
            </Text>
          </View>
          <View style={styles.breakdownRow}>
            <Text style={styles.breakdownLabel}>Jelly Polly</Text>
            <Text style={styles.breakdownValue}>
              {formatNumber(breakdownTotals.jpQuantity)}
            </Text>
          </View>
          <View style={styles.breakdownRow}>
            <Text style={styles.breakdownLabel}>Empty Bag</Text>
            <Text style={styles.breakdownValue}>
              {formatNumber(breakdownTotals.emptyBagQuantity)}
            </Text>
          </View>
          <View style={styles.breakdownRow}>
            <Text style={styles.breakdownLabel}>Sisa</Text>
            <Text style={styles.breakdownValue}>
              {formatNumber(breakdownTotals.sisaQuantity)}
            </Text>
          </View>
          <View style={styles.breakdownRow}>
            <Text style={styles.breakdownLabel}>Others</Text>
            <Text style={styles.breakdownValue}>
              {formatNumber(breakdownTotals.othersQuantity)}
            </Text>
          </View>
          <View style={styles.breakdownRow}>
            <Text style={styles.breakdownLabel}>Less</Text>
            <Text style={styles.breakdownValue}>
              {formatNumber(breakdownTotals.lessQuantity)}
            </Text>
          </View>
          <View style={styles.breakdownSeparator} />
          <View style={styles.breakdownRow}>
            <Text style={styles.breakdownLabel}>Cash Sales</Text>
            <Text style={styles.breakdownValue}>
              {totals.cashSales.count || 0}
            </Text>
          </View>
          <View style={styles.breakdownRow}>
            <Text style={styles.breakdownLabel}>CR Sales</Text>
            <Text style={styles.breakdownValue}>
              {totals.creditSales.count || 0}
            </Text>
          </View>
          <View style={styles.breakdownSeparator} />
        </View>
        <View style={styles.rightBreakdownColumn} wrap={false}>
          <Text style={styles.sectionTitle}>Amount</Text>
          <View style={styles.breakdownRow}>
            <Text style={styles.breakdownLabel}>Mee</Text>
            <Text style={styles.breakdownValue}>
              {formatCurrency(breakdownTotals.meeAmount)}
            </Text>
          </View>
          <View style={styles.breakdownRow}>
            <Text style={styles.breakdownLabel}>Bihun</Text>
            <Text style={styles.breakdownValue}>
              {formatCurrency(breakdownTotals.bihunAmount)}
            </Text>
          </View>
          <View style={styles.breakdownSeparator} />
          <View style={styles.breakdownRow}>
            <Text style={styles.breakdownLabel}>Mee + Bihun </Text>
            <Text style={styles.breakdownValue}>
              {formatCurrency(breakdownTotals.meeBihunAmount)}
            </Text>
          </View>
          <View style={styles.breakdownRow}>
            <Text style={styles.breakdownLabel}>Jelly Polly</Text>
            <Text style={styles.breakdownValue}>
              {formatCurrency(breakdownTotals.jpAmount)}
            </Text>
          </View>
          <View style={styles.breakdownRow}>
            <Text style={styles.breakdownLabel}>Empty Bag</Text>
            <Text style={styles.breakdownValue}>
              {formatCurrency(breakdownTotals.emptyBagAmount)}
            </Text>
          </View>
          <View style={styles.breakdownRow}>
            <Text style={styles.breakdownLabel}>Sisa</Text>
            <Text style={styles.breakdownValue}>
              {formatCurrency(breakdownTotals.sisaAmount)}
            </Text>
          </View>
          <View style={styles.breakdownRow}>
            <Text style={styles.breakdownLabel}>Others</Text>
            <Text style={styles.breakdownValue}>
              {formatCurrency(breakdownTotals.othersAmount)}
            </Text>
          </View>
          <View style={styles.breakdownRow}>
            <Text style={styles.breakdownLabel}>Less</Text>
            <Text style={styles.breakdownValue}>
              {formatCurrency(breakdownTotals.lessAmount)}
            </Text>
          </View>
          {/* Add Tax row only if not zero */}
          {breakdownTotals.totalTax !== 0 && (
            <View style={styles.breakdownRow}>
              <Text style={styles.breakdownLabel}>Tax</Text>
              <Text style={styles.breakdownValue}>
                {formatCurrency(breakdownTotals.totalTax)}
              </Text>
            </View>
          )}
          {/* Add Rounding row only if not zero */}
          {breakdownTotals.totalRounding !== 0 && (
            <View style={styles.breakdownRow}>
              <Text style={styles.breakdownLabel}>Rounding</Text>
              <Text style={styles.breakdownValue}>
                {formatCurrency(breakdownTotals.totalRounding)}
              </Text>
            </View>
          )}
          <View style={styles.breakdownSeparator} />
          <View style={styles.breakdownRow}>
            <Text style={styles.breakdownLabel}>Cash Sales</Text>
            <Text style={styles.breakdownValue}>
              {formatCurrency(breakdownTotals.cashSalesAmount)}
            </Text>
          </View>
          <View style={styles.breakdownRow}>
            <Text style={styles.breakdownLabel}>CR Sales</Text>
            <Text style={styles.breakdownValue}>
              {formatCurrency(breakdownTotals.creditSalesAmount)}
            </Text>
          </View>
          <View style={styles.breakdownSeparator} />
          <View style={styles.breakdownRow}>
            <Text style={[styles.breakdownLabel, styles.boldText]}>
              Grand Total
            </Text>
            <Text style={[styles.breakdownValue, styles.boldText]}>
              {formatCurrency(breakdownTotals.grandTotalInvoicesAmount)}
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
};

// Component for Salesmen Summary Pages
const SalesmenSection: React.FC<{
  data: any;
  title: string;
  monthFormat: string;
  productType?: string;
}> = ({ data, title, monthFormat }) => {
  const { salesmen, foc, returns } = data;

  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.companyHeader}>TIEN HOCK FOOD INDUSTRIES S/B</Text>
      <Text style={styles.reportTitle}>
        {title} in {monthFormat}
      </Text>

      {/* Single Table Header */}
      <View style={styles.tableHeader}>
        <Text style={[styles.colID, styles.boldText]}>ID</Text>
        <Text style={[styles.colDescription, styles.boldText]}>
          Description
        </Text>
        <Text style={[styles.colQty, styles.boldText]}>Quantity</Text>
        <Text style={[styles.colAmount, styles.boldText]}>Amount</Text>
      </View>

      {/* Salesmen Sections */}
      {Object.entries(salesmen).map(
        ([salesmanName, salesmanData]: [string, any]) => {
          if (salesmanData.products.length === 0) return null;

          // Sort products by category order
          const sortedProducts = sortProductsByCategory(salesmanData.products);

          return (
            <View key={salesmanName} style={styles.categorySection}>
              <Text style={styles.salesmanHeader}>
                {salesmanName.toUpperCase()}
              </Text>

              {/* Product rows */}
              {sortedProducts.map((product: any, index: number) => (
                <View
                  key={`${salesmanName}-${index}-${product.code}`}
                  style={[
                    styles.tableRow,
                    ...(sortedProducts.length === 1
                      ? [{ paddingVertical: 0 }]
                      : []),
                  ]}
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

              {/* Dashed line above subtotal */}
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

              {/* Salesman subtotal */}
              <View style={[styles.tableRow, styles.categorySubtotalRow]}>
                <Text style={styles.colID}></Text>
                <Text style={styles.colDescription}></Text>
                <Text style={[styles.colQty, styles.boldText]}>
                  {formatNumber(salesmanData.total.quantity)}
                </Text>
                <Text style={[styles.colAmount, styles.boldText]}>
                  {formatCurrency(salesmanData.total.amount)}
                </Text>
              </View>
            </View>
          );
        }
      )}

      {/* FOC Section */}
      {foc && foc.products && foc.products.length > 0 && (
        <View style={styles.categorySection}>
          <Text style={styles.salesmanHeader}>FOC</Text>

          {/* Sort FOC products by category order */}
          {sortProductsByCategory(foc.products).map(
            (product: any, index: number) => (
              <View
                key={`foc-${index}-${product.code}`}
                style={styles.tableRow}
              >
                <Text style={styles.colID}>{product.code}</Text>
                <Text style={styles.colDescription}>{product.description}</Text>
                <Text style={styles.colQty}>
                  {formatNumber(product.quantity)}
                </Text>
                <Text style={styles.colAmount}>0.00</Text>
              </View>
            )
          )}

          {/* Dashed line above FOC subtotal */}
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

          {/* FOC subtotal */}
          <View style={[styles.tableRow, styles.categorySubtotalRow]}>
            <Text style={styles.colID}></Text>
            <Text style={styles.colDescription}></Text>
            <Text style={[styles.colQty, styles.boldText]}>
              {formatNumber(foc.total.quantity)}
            </Text>
            <Text style={[styles.colAmount, styles.boldText]}>0.00</Text>
          </View>
        </View>
      )}

      {/* Returns Section */}
      {returns && returns.products && returns.products.length > 0 && (
        <View style={styles.categorySection}>
          <Text style={styles.salesmanHeader}>RETURN</Text>

          {/* Sort return products by category order */}
          {sortProductsByCategory(returns.products).map(
            (product: any, index: number) => (
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
                  {product.price !== 0
                    ? formatCurrency(product.price * product.quantity)
                    : "0.00"}
                </Text>
              </View>
            )
          )}

          {/* Dashed line above returns subtotal */}
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

          {/* Returns subtotal */}
          <View style={[styles.tableRow, styles.categorySubtotalRow]}>
            <Text style={styles.colID}></Text>
            <Text style={styles.colDescription}></Text>
            <Text style={[styles.colQty, styles.boldText]}>
              {formatNumber(returns.total.quantity)}
            </Text>
            <Text style={[styles.colAmount, styles.boldText]}>
              {returns.total.amount !== 0
                ? formatCurrency(returns.total.amount)
                : "0.00"}
            </Text>
          </View>
        </View>
      )}

      {/* Grand Total Section */}
      <View style={styles.grandTotalSection}>
        <View style={[styles.tableRow, styles.totalRow]}>
          <Text style={[styles.colID, styles.boldText]}>Total:</Text>
          <Text style={styles.colDescription}></Text>
          <Text style={[styles.colQty, styles.boldText]}>
            {formatNumber(
              Object.values(salesmen).reduce(
                (sum: number, salesman: any) =>
                  sum + (salesman.total?.quantity || 0),
                0
              )
            )}
          </Text>
          <Text style={[styles.colAmount, styles.boldText]}>
            {formatCurrency(
              Object.values(salesmen).reduce(
                (sum: number, salesman: any) => sum + salesman.total.amount,
                0
              )
            )}
          </Text>
        </View>
      </View>
    </View>
  );
};

// Component for Sisa Sales Summary
const SisaSalesSection: React.FC<{ data: any; monthFormat: string }> = ({
  data,
  monthFormat,
}) => {
  const categories = [
    { key: "empty_bag", data: data.empty_bag, label: "EMPTY BAG" },
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
    <View style={styles.sectionHeader}>
      <Text style={styles.companyHeader}>TIEN HOCK FOOD INDUSTRIES S/B</Text>
      <Text style={styles.reportTitle}>
        Monthly Summary of Sisa Sales in {monthFormat}
      </Text>

      {/* Single Table Header */}
      <View style={styles.tableHeader}>
        <Text style={[styles.sisaColID, styles.boldText]}>ID</Text>
        <Text style={[styles.sisaColDescription, styles.boldText]}>
          Description
        </Text>
        <Text style={[styles.sisaColQty, styles.boldText]}>Quantity</Text>
        <Text style={[styles.sisaColUPrice, styles.boldText]}>U/Price</Text>
        <Text style={[styles.sisaColAmount, styles.boldText]}>Amount</Text>
      </View>

      {/* Categories Content */}
      {categories.map(({ key, data: categoryData, label }) => {
        if (!categoryData) return null;

        // Check if category has individual products
        const hasProducts =
          categoryData.products && categoryData.products.length > 0;

        // If has products, show individual product rows
        if (hasProducts) {
          return (
            <View key={key} style={styles.categorySection}>
              {/* Product rows */}
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
                    {product.quantity > 0
                      ? formatCurrency(product.amount / product.quantity)
                      : ""}
                  </Text>
                  <Text style={styles.sisaColAmount}>
                    {formatCurrency(product.amount)}
                  </Text>
                </View>
              ))}

              {/* Dashed line above subtotal */}
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

              {/* Category subtotal */}
              <View style={[styles.tableRow, styles.categorySubtotalRow]}>
                <Text style={styles.sisaColID}></Text>
                <Text style={styles.sisaColDescription}></Text>
                <Text style={[styles.sisaColQty, styles.boldText]}>
                  {formatNumber(categoryData.quantity)}
                </Text>
                <Text style={styles.sisaColUPrice}></Text>
                <Text style={[styles.sisaColAmount, styles.boldText]}>
                  {formatCurrency(categoryData.amount)}
                </Text>
              </View>
            </View>
          );
        }

        // Handle categories with no products but have totals (like sbh, smee when no individual products)
        if (categoryData.quantity > 0 || categoryData.amount > 0) {
          return (
            <View key={key} style={styles.categorySection}>
              <View style={styles.tableRow}>
                <Text style={styles.sisaColID}>{key.toUpperCase()}</Text>
                <Text style={styles.sisaColDescription}>{label}</Text>
                <Text style={styles.sisaColQty}>
                  {formatNumber(categoryData.quantity)}
                </Text>
                <Text style={styles.sisaColUPrice}>
                  {categoryData.quantity > 0
                    ? formatCurrency(
                        categoryData.amount / categoryData.quantity
                      )
                    : ""}
                </Text>
                <Text style={styles.sisaColAmount}>
                  {formatCurrency(categoryData.amount)}
                </Text>
              </View>

              {/* Dashed line above subtotal */}
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

              {/* Category subtotal */}
              <View style={[styles.tableRow, styles.categorySubtotalRow]}>
                <Text style={styles.sisaColID}></Text>
                <Text style={styles.sisaColDescription}></Text>
                <Text style={[styles.sisaColQty, styles.boldText]}>
                  {formatNumber(categoryData.quantity)}
                </Text>
                <Text style={styles.sisaColUPrice}></Text>
                <Text style={[styles.sisaColAmount, styles.boldText]}>
                  {formatCurrency(categoryData.amount)}
                </Text>
              </View>
            </View>
          );
        }

        return null;
      })}

      {/* Grand Total Section */}
      <View style={styles.grandTotalSection}>
        <View style={[styles.tableRow, styles.totalRow]}>
          <Text style={[styles.sisaColID, styles.boldText]}>Total:</Text>
          <Text style={styles.sisaColDescription}></Text>
          <Text style={[styles.sisaColQty, styles.boldText]}>
            {formatNumber(totalSisaQuantity)}
          </Text>
          <Text style={styles.sisaColUPrice}></Text>
          <Text style={[styles.sisaColAmount, styles.boldText]}>
            {formatCurrency(totalSisaAmount)}
          </Text>
        </View>
      </View>

      {/* Breakdown section */}
      <View style={styles.breakdownSection}>
        <View style={styles.leftBreakdownColumn}>
          <Text style={styles.sectionTitle}>Quantity</Text>
          {categories.map(({ key, data: catData, label }) => {
            if (!catData) return null;
            // Show EMPTY BAG last in breakdown as per plan
            if (key === "empty_bag") return null;
            return (
              <View style={styles.breakdownRow} key={`${key}-qtybrk`}>
                <Text style={styles.breakdownLabel}>{label}</Text>
                <Text style={styles.breakdownValue}>
                  {formatNumber(catData.quantity || 0)}
                </Text>
              </View>
            );
          })}
          {/* EMPTY BAG QTY last */}
          {data.empty_bag && (
            <View style={styles.breakdownRow} key="empty_bag-qtybrk">
              <Text style={styles.breakdownLabel}>EMPTY BAG</Text>
              <Text style={styles.breakdownValue}>
                {formatNumber(data.empty_bag.quantity || 0)}
              </Text>
            </View>
          )}
        </View>
        <View style={styles.rightBreakdownColumn}>
          <Text style={styles.sectionTitle}>Amount</Text>
          {categories.map(({ key, data: catData, label }) => {
            if (!catData) return null;
            if (key === "empty_bag") return null;
            return (
              <View style={styles.breakdownRow} key={`${key}-amtbrk`}>
                <Text style={styles.breakdownLabel}>{label}</Text>
                <Text style={styles.breakdownValue}>
                  {formatCurrency(catData.amount || 0)}
                </Text>
              </View>
            );
          })}
          {/* EMPTY BAG AMOUNT last */}
          {data.empty_bag && (
            <View style={styles.breakdownRow} key="empty_bag-amtbrk">
              <Text style={styles.breakdownLabel}>EMPTY BAG</Text>
              <Text style={styles.breakdownValue}>
                {formatCurrency(data.empty_bag.amount || 0)}
              </Text>
            </View>
          )}
        </View>
      </View>
    </View>
  );
};
