import {
  pdf,
  Document,
  Page,
  Text,
  View,
  StyleSheet,
} from "@react-pdf/renderer";
import { useProductsCache } from "../invoice/useProductsCache";
import toast from "react-hot-toast";

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
    fontSize: 8,
    lineHeight: 1.2,
  },
  title: {
    fontSize: 12,
    fontFamily: "Helvetica-Bold",
    marginBottom: 10,
    textAlign: "center",
  },
  sectionTitle: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    marginTop: 10,
    marginBottom: 5,
  },
  table: {
    borderStyle: "solid",
    borderWidth: 0.5,
    borderColor: "#000",
    marginBottom: 10,
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: "#000",
    minHeight: 16,
  },
  tableHeader: {
    backgroundColor: "#f0f0f0",
    fontFamily: "Helvetica-Bold",
  },
  colId: {
    width: "15%",
    borderRightWidth: 0.5,
    borderRightColor: "#000",
    paddingLeft: 4,
    paddingRight: 2,
    paddingVertical: 2,
  },
  colDescription: {
    width: "50%",
    borderRightWidth: 0.5,
    borderRightColor: "#000",
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  colQuantity: {
    width: "15%",
    borderRightWidth: 0.5,
    borderRightColor: "#000",
    paddingHorizontal: 2,
    paddingVertical: 2,
    textAlign: "right",
  },
  colAmount: {
    width: "20%",
    paddingHorizontal: 4,
    paddingVertical: 2,
    textAlign: "right",
  },
  totalRow: {
    fontFamily: "Helvetica-Bold",
    backgroundColor: "#f8f8f8",
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
});

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
          <AllSalesPage data={data.all_sales} month={monthName} />
        )}
        {data.all_salesmen && (
          <SalesmenPage
            data={data.all_salesmen}
            title="Summary of all sales by salesmen"
            month={monthName}
          />
        )}
        {data.mee_salesmen && (
          <SalesmenPage
            data={data.mee_salesmen}
            title="Summary of Mee sales by salesmen"
            month={monthName}
          />
        )}
        {data.bihun_salesmen && (
          <SalesmenPage
            data={data.bihun_salesmen}
            title="Summary of Bihun sales by salesmen"
            month={monthName}
          />
        )}
        {data.jp_salesmen && (
          <SalesmenPage
            data={data.jp_salesmen}
            title="Summary of Jellypolly sales by salesmen"
            month={monthName}
          />
        )}
        {data.sisa_sales && (
          <SisaSalesPage data={data.sisa_sales} month={monthName} />
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
      // Print
      const url = URL.createObjectURL(pdfBlob);
      const printFrame = document.createElement("iframe");
      printFrame.style.display = "none";
      document.body.appendChild(printFrame);

      printFrame.onload = () => {
        printFrame.contentWindow?.print();
        // Clean up after printing
        setTimeout(() => {
          document.body.removeChild(printFrame);
          URL.revokeObjectURL(url);
        }, 1000);
      };

      printFrame.src = url;
    }
  } catch (error) {
    console.error("Error generating PDF:", error);
    throw error;
  }
};

// Component for All Sales Summary
const AllSalesPage: React.FC<{ data: any; month: string }> = ({
  data,
  month,
}) => {
  const { categories, totals } = data;

  return (
    <Page size="A4" style={styles.page}>
      <Text style={styles.title}>Summary of all sales - {month}</Text>

      <View style={styles.table}>
        {/* Table Header */}
        <View style={[styles.tableRow, styles.tableHeader]}>
          <Text style={styles.colId}>ID</Text>
          <Text style={styles.colDescription}>Description</Text>
          <Text style={styles.colQuantity}>Quantity</Text>
          <Text style={styles.colAmount}>Amount</Text>
        </View>

        {/* Category rows */}
        {Object.entries(categories).map(([key, category]: [string, any]) => {
          if (key === "total_rounding") return null;
          if (category.quantity === 0 && category.amount === 0) return null;

          return category.products.map((product: any, index: number) => (
            <View key={`${key}-${index}`} style={styles.tableRow}>
              <Text style={styles.colId}>{product.code}</Text>
              <Text style={styles.colDescription}>{product.description}</Text>
              <Text style={styles.colQuantity}>
                {product.quantity.toLocaleString()}
              </Text>
              <Text style={styles.colAmount}>{product.amount.toFixed(2)}</Text>
            </View>
          ));
        })}

        {/* Rounding row */}
        {categories.total_rounding !== 0 && (
          <View style={styles.tableRow}>
            <Text style={styles.colId}>ROUNDING</Text>
            <Text style={styles.colDescription}>Total Rounding</Text>
            <Text style={styles.colQuantity}>-</Text>
            <Text style={styles.colAmount}>
              {categories.total_rounding.toFixed(2)}
            </Text>
          </View>
        )}

        {/* Total row */}
        <View style={[styles.tableRow, styles.totalRow]}>
          <Text style={styles.colId}>TOTAL</Text>
          <Text style={styles.colDescription}>Grand Total</Text>
          <Text style={styles.colQuantity}>-</Text>
          <Text style={styles.colAmount}>{totals.grandTotal.toFixed(2)}</Text>
        </View>
      </View>

      {/* Breakdown section */}
      <View style={styles.breakdownSection}>
        <View style={styles.breakdownColumn}>
          {/* Add quantity breakdown details here */}
        </View>
        <View style={styles.breakdownColumn}>
          <View style={styles.breakdownRow}>
            <Text style={styles.breakdownLabel}>Cash Sales:</Text>
            <Text style={styles.breakdownValue}>
              {totals.cashSales.amount.toFixed(2)}
            </Text>
          </View>
          <View style={styles.breakdownRow}>
            <Text style={styles.breakdownLabel}>Credit Sales:</Text>
            <Text style={styles.breakdownValue}>
              {totals.creditSales.amount.toFixed(2)}
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
              {totals.grandTotal.toFixed(2)}
            </Text>
          </View>
        </View>
      </View>
    </Page>
  );
};

// Component for Salesmen Summary Pages
const SalesmenPage: React.FC<{ data: any; title: string; month: string }> = ({
  data,
  title,
  month,
}) => {
  const { salesmen, foc, returns } = data;

  return (
    <Page size="A4" style={styles.page}>
      <Text style={styles.title}>
        {title} - {month}
      </Text>

      {/* Salesmen sections */}
      {Object.entries(salesmen).map(
        ([salesmanId, salesmanData]: [string, any]) => (
          <View key={salesmanId} style={{ marginBottom: 10 }}>
            <Text style={styles.sectionTitle}>Salesman: {salesmanId}</Text>
            <View style={styles.table}>
              <View style={[styles.tableRow, styles.tableHeader]}>
                <Text style={styles.colId}>ID</Text>
                <Text style={styles.colDescription}>Description</Text>
                <Text style={styles.colQuantity}>Quantity</Text>
                <Text style={styles.colAmount}>Amount</Text>
              </View>

              {salesmanData.products.map((product: any, index: number) => (
                <View key={index} style={styles.tableRow}>
                  <Text style={styles.colId}>{product.code}</Text>
                  <Text style={styles.colDescription}>
                    {product.description}
                  </Text>
                  <Text style={styles.colQuantity}>
                    {product.quantity.toLocaleString()}
                  </Text>
                  <Text style={styles.colAmount}>
                    {product.amount.toFixed(2)}
                  </Text>
                </View>
              ))}

              <View style={[styles.tableRow, styles.totalRow]}>
                <Text style={styles.colId}>TOTAL</Text>
                <Text style={styles.colDescription}>Salesman Total</Text>
                <Text style={styles.colQuantity}>
                  {salesmanData.total.quantity.toLocaleString()}
                </Text>
                <Text style={styles.colAmount}>
                  {salesmanData.total.amount.toFixed(2)}
                </Text>
              </View>
            </View>
          </View>
        )
      )}

      {/* FOC section */}
      {foc.length > 0 && (
        <View style={{ marginBottom: 10 }}>
          <Text style={styles.sectionTitle}>FOC Products</Text>
          <View style={styles.table}>
            <View style={[styles.tableRow, styles.tableHeader]}>
              <Text style={styles.colId}>ID</Text>
              <Text style={styles.colDescription}>Description</Text>
              <Text style={styles.colQuantity}>Quantity</Text>
              <Text style={styles.colAmount}>-</Text>
            </View>
            {foc.map((product: any, index: number) => (
              <View key={index} style={styles.tableRow}>
                <Text style={styles.colId}>{product.code}</Text>
                <Text style={styles.colDescription}>{product.description}</Text>
                <Text style={styles.colQuantity}>
                  {product.quantity.toLocaleString()}
                </Text>
                <Text style={styles.colAmount}>-</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* Returns section */}
      {returns.length > 0 && (
        <View>
          <Text style={styles.sectionTitle}>Return Products</Text>
          <View style={styles.table}>
            <View style={[styles.tableRow, styles.tableHeader]}>
              <Text style={styles.colId}>ID</Text>
              <Text style={styles.colDescription}>Description</Text>
              <Text style={styles.colQuantity}>Quantity</Text>
              <Text style={styles.colAmount}>-</Text>
            </View>
            {returns.map((product: any, index: number) => (
              <View key={index} style={styles.tableRow}>
                <Text style={styles.colId}>{product.code}</Text>
                <Text style={styles.colDescription}>{product.description}</Text>
                <Text style={styles.colQuantity}>
                  {product.quantity.toLocaleString()}
                </Text>
                <Text style={styles.colAmount}>-</Text>
              </View>
            ))}
          </View>
        </View>
      )}
    </Page>
  );
};

// Component for Sisa Sales Summary
const SisaSalesPage: React.FC<{ data: any; month: string }> = ({
  data,
  month,
}) => {
  return (
    <Page size="A4" style={styles.page}>
      <Text style={styles.title}>Summary of Sisa sales - {month}</Text>

      <View style={styles.table}>
        <View style={[styles.tableRow, styles.tableHeader]}>
          <Text style={styles.colId}>ID</Text>
          <Text style={styles.colDescription}>Description</Text>
          <Text style={styles.colQuantity}>Quantity</Text>
          <Text style={styles.colAmount}>Amount</Text>
        </View>

        {/* Empty Bag products */}
        {data.empty_bag.products.map((product: any, index: number) => (
          <View key={`empty-${index}`} style={styles.tableRow}>
            <Text style={styles.colId}>{product.code}</Text>
            <Text style={styles.colDescription}>{product.description}</Text>
            <Text style={styles.colQuantity}>
              {product.quantity.toLocaleString()}
            </Text>
            <Text style={styles.colAmount}>{product.amount.toFixed(2)}</Text>
          </View>
        ))}

        {/* SBH products */}
        {data.sbh.products.map((product: any, index: number) => (
          <View key={`sbh-${index}`} style={styles.tableRow}>
            <Text style={styles.colId}>{product.code}</Text>
            <Text style={styles.colDescription}>{product.description}</Text>
            <Text style={styles.colQuantity}>
              {product.quantity.toLocaleString()}
            </Text>
            <Text style={styles.colAmount}>{product.amount.toFixed(2)}</Text>
          </View>
        ))}

        {/* SMEE products */}
        {data.smee.products.map((product: any, index: number) => (
          <View key={`smee-${index}`} style={styles.tableRow}>
            <Text style={styles.colId}>{product.code}</Text>
            <Text style={styles.colDescription}>{product.description}</Text>
            <Text style={styles.colQuantity}>
              {product.quantity.toLocaleString()}
            </Text>
            <Text style={styles.colAmount}>{product.amount.toFixed(2)}</Text>
          </View>
        ))}

        {/* Total row */}
        <View style={[styles.tableRow, styles.totalRow]}>
          <Text style={styles.colId}>TOTAL</Text>
          <Text style={styles.colDescription}>Grand Total</Text>
          <Text style={styles.colQuantity}>
            {(
              data.empty_bag.quantity +
              data.sbh.quantity +
              data.smee.quantity
            ).toLocaleString()}
          </Text>
          <Text style={styles.colAmount}>
            {(
              data.empty_bag.amount +
              data.sbh.amount +
              data.smee.amount
            ).toFixed(2)}
          </Text>
        </View>
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
