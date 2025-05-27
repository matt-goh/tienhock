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
    padding: 30,
    fontFamily: "Helvetica",
    fontSize: 9,
    lineHeight: 1.4,
  },
  companyHeader: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    marginBottom: 3,
    textAlign: "left",
  },
  reportTitle: {
    fontSize: 10,
    marginBottom: 2,
    textAlign: "left",
  },
  table: {
    marginBottom: 15,
  },
  tableHeader: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: "#000",
    borderBottomWidth: 1,
    borderBottomColor: "#000",
    marginBottom: 2,
    paddingVertical: 2,
    paddingTop: 3,
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 1,
    minHeight: 14,
  },
  colID: {
    width: "15%",
    paddingHorizontal: 2,
  },
  colQty: {
    width: "12%",
    textAlign: "right",
    paddingRight: 8,
  },
  colDescription: {
    width: "45%",
    paddingHorizontal: 2,
  },
  colAmount: {
    width: "20%",
    textAlign: "right",
  },
  headerText: {
    fontFamily: "Helvetica-Bold",
  },
  solidLine: {
    borderBottomWidth: 1,
    borderBottomColor: "#000",
    marginVertical: 2,
  },
  subtotalRow: {
    paddingTop: 2,
  },
  totalRow: {
    fontFamily: "Helvetica-Bold",
    paddingVertical: 3,
  },
  sectionTitle: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
  },
  breakdownSection: {
    flexDirection: "row",
    marginTop: 10,
    marginBottom: 20,
  },
  breakdownColumn: {
    width: "50%",
    paddingHorizontal: 10,
  },
  breakdownRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 2,
  },
  breakdownLabel: {
    fontSize: 8,
  },
  breakdownValue: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
  },
  salesmanSection: {
    marginBottom: 2,
  },
  salesmanHeader: {
    fontFamily: "Helvetica-Bold",
    marginBottom: 3,
    marginTop: 3,
  },
  pageNumber: {
    position: "absolute",
    fontSize: 8,
    bottom: 20,
    right: 30,
    color: "#666",
  },
});

// Helper function to format numbers with commas
const formatNumber = (num: number): string => {
  return num.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
};

// Helper function to format currency
const formatCurrency = (amount: number): string => {
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
    const monthName = new Date(year, month).toLocaleDateString("en-US", {
      month: "long",
      year: "numeric",
    });

    const doc = (
      <Document title={`Sales Summary - ${monthName}`}>
        {data.all_sales && (
          <AllSalesPage data={data.all_sales} monthFormat={monthName} />
        )}
        {data.all_salesmen && (
          <SalesmenPage
            data={data.all_salesmen}
            title="Summary of all sales by salesman"
            monthFormat={monthName}
          />
        )}
        {data.mee_salesmen && (
          <SalesmenPage
            data={data.mee_salesmen}
            title="Summary of Mee sales by salesmen"
            monthFormat={monthName}
            productType="MEE"
          />
        )}
        {data.bihun_salesmen && (
          <SalesmenPage
            data={data.bihun_salesmen}
            title="Summary of Bihun sales by salesmen"
            monthFormat={monthName}
            productType="BIHUN"
          />
        )}
        {data.jp_salesmen && (
          <SalesmenPage
            data={data.jp_salesmen}
            title="Summary of Jellypolly sales by salesmen"
            monthFormat={monthName}
            productType="JP"
          />
        )}
        {data.sisa_sales && (
          <SisaSalesPage data={data.sisa_sales} monthFormat={monthName} />
        )}
      </Document>
    );

    const pdfBlob = await pdf(doc).toBlob();

    if (action === "download") {
      const url = URL.createObjectURL(pdfBlob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `Sales_Summary_${monthName.replace(" ", "_")}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } else {
      // Print - Fixed version
      const url = URL.createObjectURL(pdfBlob);
      const printFrame = document.createElement("iframe");
      printFrame.style.display = "none";
      document.body.appendChild(printFrame);

      printFrame.onload = () => {
        if (printFrame.contentWindow) {
          printFrame.contentWindow?.print();

          const handleFocus = () => {
            window.removeEventListener("focus", handleFocus);
            setTimeout(() => {
              document.body.removeChild(printFrame);
              URL.revokeObjectURL(url);
            }, 100);
          };

          window.addEventListener("focus", handleFocus);

          setTimeout(() => {
            window.removeEventListener("focus", handleFocus);
            if (document.body.contains(printFrame)) {
              document.body.removeChild(printFrame);
              URL.revokeObjectURL(url);
            }
          }, 60000);
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
  return (
    <Page size="A4" style={styles.page}>
      <Text style={styles.companyHeader}>TIEN HOCK FOOD INDUSTRIES S/B</Text>
      <Text style={styles.reportTitle}>
        Summary of all sales as at {monthFormat}
      </Text>

      <View style={styles.table}>
        {/* Table Header */}
        <View style={styles.tableHeader}>
          <Text style={[styles.colID, styles.headerText]}>ID</Text>
          <Text style={[styles.colQty, styles.headerText]}>Quantity</Text>
          <Text style={[styles.colDescription, styles.headerText]}>
            Description
          </Text>
          <Text style={[styles.colAmount, styles.headerText]}>Amount</Text>
        </View>

        {/* Category rows */}
        {Object.entries(categories).map(([key, category]: [string, any]) => {
          if (key === "total_rounding") return null;
          if (category.quantity === 0 && category.amount === 0) return null;

          const rows = category.products.map((product: any, index: number) => (
            <View key={`${key}-${index}`} style={styles.tableRow}>
              <Text style={styles.colID}>{product.code}</Text>
              <Text style={styles.colQty}>
                {product.quantity > 0 ? formatNumber(product.quantity) : "0"}
              </Text>
              <Text style={styles.colDescription}>{product.description}</Text>
              <Text style={styles.colAmount}>
                {formatCurrency(product.amount)}
              </Text>
            </View>
          ));

          return (
            <React.Fragment key={key}>
              {rows}
              {/* Category subtotal */}
              {category.products.length > 1 && (
                <>
                  <View style={styles.solidLine} />
                  <View style={[styles.tableRow, styles.subtotalRow]}>
                    <Text style={styles.colID}></Text>
                    <Text style={styles.colQty}>
                      {formatNumber(category.quantity)}
                    </Text>
                    <Text style={styles.colDescription}></Text>
                    <Text style={styles.colAmount}>
                      {formatCurrency(category.amount)}
                    </Text>
                  </View>
                  <View style={styles.solidLine} />
                </>
              )}
            </React.Fragment>
          );
        })}

        {/* LESS row */}
        {categories.less && categories.less.amount !== 0 && (
          <>
            <View style={styles.tableRow}>
              <Text style={styles.colID}>LESS</Text>
              <Text style={styles.colQty}>0</Text>
              <Text style={styles.colDescription}>LESS</Text>
              <Text style={styles.colAmount}>
                {formatCurrency(categories.less.amount)}
              </Text>
            </View>
            <View style={styles.solidLine} />
            <View style={[styles.tableRow, styles.subtotalRow]}>
              <Text style={styles.colID}></Text>
              <Text style={styles.colQty}>0</Text>
              <Text style={styles.colDescription}></Text>
              <Text style={styles.colAmount}>
                {formatCurrency(categories.less.amount)}
              </Text>
            </View>
            <View style={styles.solidLine} />
          </>
        )}

        {/* Grand Total */}
        <View style={styles.solidLine} />
        <View style={[styles.tableRow, styles.totalRow]}>
          <Text style={styles.colID}>Total :</Text>
          <Text style={[styles.colQty, styles.headerText]}>
            {formatNumber(totals.totalQuantity || 0)}
          </Text>
          <Text style={styles.colDescription}></Text>
          <Text style={[styles.colAmount, styles.headerText]}>
            {formatCurrency(totals.grandTotal)}
          </Text>
        </View>
        <View style={styles.solidLine} />
        {/* Breakdown section */}
        <View style={styles.breakdownSection}>
          <View style={styles.breakdownColumn}>
            <Text style={[styles.sectionTitle]}>Quantity Breakdown</Text>
            <View style={styles.breakdownRow}>
              <Text style={styles.breakdownLabel}>Mee + Bihun:</Text>
              <Text style={styles.breakdownValue}>
                {formatNumber(totals.meeBihunQuantity || 0)}
              </Text>
            </View>
            <View style={styles.breakdownRow}>
              <Text style={styles.breakdownLabel}>Jelly Polly:</Text>
              <Text style={styles.breakdownValue}>
                {formatNumber(totals.jpQuantity || 0)}
              </Text>
            </View>
            <View
              style={[
                styles.breakdownRow,
                { borderTopWidth: 0.5, paddingTop: 2 },
              ]}
            >
              <Text style={styles.breakdownLabel}>Total Quantity:</Text>
              <Text style={styles.breakdownValue}>
                {formatNumber(totals.totalQuantity || 0)}
              </Text>
            </View>
          </View>
        </View>
        <View style={styles.breakdownSection}>
          <View style={styles.breakdownColumn}>
            <Text style={[styles.sectionTitle]}>Amount Breakdown</Text>
            <View style={styles.breakdownRow}>
              <Text style={styles.breakdownLabel}>Mee + Bihun:</Text>
              <Text style={styles.breakdownValue}>
                {formatCurrency(totals.meeBihunAmount || 0)}
              </Text>
            </View>
            <View style={styles.breakdownRow}>
              <Text style={styles.breakdownLabel}>Jelly Polly:</Text>
              <Text style={styles.breakdownValue}>
                {formatCurrency(totals.jpAmount || 0)}
              </Text>
            </View>
            <View style={styles.breakdownRow}>
              <Text style={styles.breakdownLabel}>Cash Sales:</Text>
              <Text style={styles.breakdownValue}>
                {formatCurrency(totals.cashSales.amount)}
              </Text>
            </View>
            <View style={styles.breakdownRow}>
              <Text style={styles.breakdownLabel}>Credit Sales:</Text>
              <Text style={styles.breakdownValue}>
                {formatCurrency(totals.creditSales.amount)}
              </Text>
            </View>
            <View
              style={[
                styles.breakdownRow,
                { borderTopWidth: 0.5, paddingTop: 2 },
              ]}
            >
              <Text style={styles.breakdownLabel}>Grand Total:</Text>
              <Text style={styles.breakdownValue}>
                {formatCurrency(totals.grandTotal)}
              </Text>
            </View>
          </View>
        </View>
      </View>
    </Page>
  );
};

// Component for Salesmen Summary Pages
const SalesmenPage: React.FC<{
  data: any;
  title: string;
  monthFormat: string;
  productType?: string;
}> = ({ data, title, monthFormat, productType }) => {
  const { salesmen, foc, returns } = data;

  return (
    <Page size="A4" style={styles.page}>
      <Text style={styles.companyHeader}>TIEN HOCK FOOD INDUSTRIES S/B</Text>
      <Text style={styles.reportTitle}>
        {title} as at {monthFormat}
      </Text>

      {/* Table Header */}
      <View style={styles.tableHeader}>
        <Text style={[styles.colID, styles.headerText]}>ID</Text>
        <Text style={[styles.colQty, styles.headerText]}>Quantity</Text>
        <Text style={[styles.colDescription, styles.headerText]}>
          Description
        </Text>
        <Text style={[styles.colAmount, styles.headerText]}>Amount</Text>
      </View>

      {/* Salesmen sections */}
      {Object.entries(salesmen).map(
        ([salesmanId, salesmanData]: [string, any]) => {
          return (
            <View key={salesmanId} style={styles.salesmanSection}>
              <Text style={styles.salesmanHeader}>{salesmanId}</Text>
              <View style={styles.solidLine} />

              {salesmanData.products.map((product: any, index: number) => (
                <View key={index} style={styles.tableRow}>
                  <Text style={styles.colID}>{product.code}</Text>
                  <Text style={styles.colQty}>
                    {formatNumber(product.quantity)}
                  </Text>
                  <Text style={styles.colDescription}>
                    {product.description}
                  </Text>
                  <Text style={styles.colAmount}>
                    {formatCurrency(product.amount)}
                  </Text>
                </View>
              ))}

              <View style={styles.solidLine} />
              <View style={[styles.tableRow, styles.subtotalRow]}>
                <Text style={styles.colID}></Text>
                <Text style={[styles.colQty, styles.headerText]}>
                  {formatNumber(salesmanData.total.quantity)}
                </Text>
                <Text style={styles.colDescription}></Text>
                <Text style={[styles.colAmount, styles.headerText]}>
                  {formatCurrency(salesmanData.total.amount)}
                </Text>
              </View>
              <View style={styles.solidLine} />
            </View>
          );
        }
      )}

      {/* FOC section */}
      {foc && foc.length > 0 && (
        <View style={styles.salesmanSection}>
          <Text style={styles.salesmanHeader}>FOC</Text>
          <View style={styles.solidLine} />
          {foc.map((product: any, index: number) => (
            <View key={index} style={styles.tableRow}>
              <Text style={styles.colID}>{product.code}</Text>
              <Text style={styles.colQty}>
                {formatNumber(product.quantity)}
              </Text>
              <Text style={styles.colDescription}>{product.description}</Text>
              <Text style={styles.colAmount}>.00</Text>
            </View>
          ))}
          <View style={styles.solidLine} />
          <View style={[styles.tableRow, styles.subtotalRow]}>
            <Text style={styles.colID}></Text>
            <Text style={[styles.colQty, styles.headerText]}>
              {formatNumber(
                foc.reduce((sum: number, p: any) => sum + p.quantity, 0)
              )}
            </Text>
            <Text style={styles.colDescription}></Text>
            <Text style={[styles.colAmount, styles.headerText]}>.00</Text>
          </View>
        </View>
      )}

      {/* Returns section */}
      {returns && returns.length > 0 && (
        <View style={styles.salesmanSection}>
          <Text style={styles.salesmanHeader}>Return Products</Text>
          <View style={styles.solidLine} />
          {returns.map((product: any, index: number) => (
            <View key={index} style={styles.tableRow}>
              <Text style={styles.colID}>{product.code}</Text>
              <Text style={styles.colQty}>
                {formatNumber(product.quantity)}
              </Text>
              <Text style={styles.colDescription}>{product.description}</Text>
              <Text style={styles.colAmount}>-</Text>
            </View>
          ))}
          <View style={styles.solidLine} />
          <View style={[styles.tableRow, styles.subtotalRow]}>
            <Text style={styles.colID}></Text>
            <Text style={[styles.colQty, styles.headerText]}>
              {formatNumber(
                returns.reduce((sum: number, p: any) => sum + p.quantity, 0)
              )}
            </Text>
            <Text style={styles.colDescription}></Text>
            <Text style={[styles.colAmount, styles.headerText]}>-</Text>
          </View>
        </View>
      )}
    </Page>
  );
};

// Component for Sisa Sales Summary
const SisaSalesPage: React.FC<{ data: any; monthFormat: string }> = ({
  data,
  monthFormat,
}) => {
  return (
    <Page size="A4" style={styles.page}>
      <Text style={styles.companyHeader}>TIEN HOCK FOOD INDUSTRIES S/B</Text>
      <Text style={styles.reportTitle}>
        Summary of Sisa sales as at {monthFormat}
      </Text>

      <View style={styles.table}>
        <View style={styles.tableHeader}>
          <Text style={[styles.colID, styles.headerText]}>ID</Text>
          <Text style={[styles.colQty, styles.headerText]}>Quantity</Text>
          <Text style={[styles.colDescription, styles.headerText]}>
            Description
          </Text>
          <Text style={[styles.colAmount, styles.headerText]}>U/Price</Text>
          <Text style={[styles.colAmount, styles.headerText]}>Amount</Text>
        </View>

        {/* Render each category */}
        {["empty_bag", "sbh", "smee"].map((categoryKey) => {
          const category = data[categoryKey];
          if (!category || category.products.length === 0) return null;

          return (
            <React.Fragment key={categoryKey}>
              {category.products.map((product: any, index: number) => (
                <View key={`${categoryKey}-${index}`} style={styles.tableRow}>
                  <Text style={styles.colID}>{product.code}</Text>
                  <Text style={styles.colQty}>
                    {formatNumber(product.quantity)}
                  </Text>
                  <Text style={styles.colDescription}>
                    {product.description}
                  </Text>
                  <Text style={styles.colAmount}></Text>
                  <Text style={styles.colAmount}>
                    {formatCurrency(product.amount)}
                  </Text>
                </View>
              ))}
              <View style={styles.solidLine} />
              <View style={[styles.tableRow, styles.subtotalRow]}>
                <Text style={styles.colID}></Text>
                <Text style={styles.colQty}>
                  {formatNumber(category.quantity)}
                </Text>
                <Text style={styles.colDescription}></Text>
                <Text style={styles.colAmount}></Text>
                <Text style={styles.colAmount}>
                  {formatCurrency(category.amount)}
                </Text>
              </View>
              <View style={styles.solidLine} />
            </React.Fragment>
          );
        })}

        {/* TOTAL */}
        <View style={styles.solidLine} />
        <View style={[styles.tableRow, styles.totalRow]}>
          <Text style={styles.colID}>Total :</Text>
          <Text style={[styles.colQty, styles.headerText]}>
            {formatNumber(
              (data.empty_bag?.quantity || 0) +
                (data.sbh?.quantity || 0) +
                (data.smee?.quantity || 0)
            )}
          </Text>
          <Text style={styles.colDescription}></Text>
          <Text style={styles.colAmount}></Text>
          <Text style={[styles.colAmount, styles.headerText]}>
            {formatCurrency(
              (data.empty_bag?.amount || 0) +
                (data.sbh?.amount || 0) +
                (data.smee?.amount || 0)
            )}
          </Text>
        </View>
        <View style={styles.solidLine} />
      </View>

      {/* Breakdown section */}
      <View style={styles.breakdownSection}>
        <View style={styles.breakdownColumn}>
          <Text style={[styles.sectionTitle, { fontSize: 9 }]}>
            Quantity Breakdown
          </Text>
          <View style={styles.breakdownRow}>
            <Text style={styles.breakdownLabel}>EMPTY_BAG:</Text>
            <Text style={styles.breakdownValue}>
              {data.empty_bag.quantity.toLocaleString()}
            </Text>
          </View>
          <View style={styles.breakdownRow}>
            <Text style={styles.breakdownLabel}>SBH:</Text>
            <Text style={styles.breakdownValue}>
              {data.sbh.quantity.toLocaleString()}
            </Text>
          </View>
          <View style={styles.breakdownRow}>
            <Text style={styles.breakdownLabel}>SMEE:</Text>
            <Text style={styles.breakdownValue}>
              {data.smee.quantity.toLocaleString()}
            </Text>
          </View>
        </View>
        <View style={styles.breakdownColumn}>
          <Text style={[styles.sectionTitle, { fontSize: 9 }]}>
            Amount Breakdown
          </Text>
          <View style={styles.breakdownRow}>
            <Text style={styles.breakdownLabel}>EMPTY_BAG:</Text>
            <Text style={styles.breakdownValue}>
              {data.empty_bag.amount.toFixed(2)}
            </Text>
          </View>
          <View style={styles.breakdownRow}>
            <Text style={styles.breakdownLabel}>SBH:</Text>
            <Text style={styles.breakdownValue}>
              {data.sbh.amount.toFixed(2)}
            </Text>
          </View>
          <View style={styles.breakdownRow}>
            <Text style={styles.breakdownLabel}>SMEE:</Text>
            <Text style={styles.breakdownValue}>
              {data.smee.amount.toFixed(2)}
            </Text>
          </View>
        </View>
      </View>
    </Page>
  );
};
