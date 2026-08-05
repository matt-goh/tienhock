// src/utils/stock/EstimatedReportPDF.tsx
// PDF printout of the monthly "Estimated P&L & Unit Cost" report (MEE & BIHUN).
// Each report page prints its OWN view for both product lines: the P&L page
// prints MEE P&L + BIHUN P&L, the Unit Cost page prints MEE + BIHUN Unit Cost.
// Content is 1:1 with the live report response, never hardcoded.
// Doc: docs/Account/ESTIMATED_REPORT_HANDOVER.md (Phase 5)
import React from "react";
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  pdf,
  Image,
} from "@react-pdf/renderer";
import TienHockLogo from "../tienhock.png";
import { TIENHOCK_INFO } from "../invoice/einvoice/companyInfo";
import { printPdfBlob } from "../pdfPrintFallback";
import {
  getPaperSizePreference,
  getReactPdfPageSize,
  PdfPaperSize,
} from "../pdf/paperSize";

type ProductLine = "mee" | "bihun";

type EstimatedReportView = "pl" | "unitCost";

interface ReportPeriod {
  year: number;
  month: number;
  monthKey: string;
  label: string;
}

interface PLProductRow {
  lineKey: string;
  lineId: number;
  kind: "product" | "foc" | "group";
  code: string | null;
  description: string;
  bags: number | null;
  amount: number | null;
}

interface PLStockRow {
  lineKey: string;
  lineId: number;
  code: string | null;
  description: string;
  amount: number;
}

interface PLReturnsRow extends PLStockRow {
  bags: number;
}

interface PLReport {
  products: PLProductRow[];
  totals: { bags: number; amount: number };
  closingStock: PLStockRow[];
  closingStockTotal: number;
  closingStockPlusSales: number;
  openingStock: PLStockRow[];
  openingStockTotal: number;
  purchases: PLStockRow[];
  purchaseTotal: number;
  returns: PLReturnsRow[];
  returnsTotal: number;
  openingPlusPurchasesPlusReturns: number;
  usage: number;
  gross: number;
  expenses: number;
  expenseBreakdown: {
    salary: number;
    salesman: number;
    habuk: number;
    expenses: number;
    machineRepair: number;
  };
  profitLoss: number;
  addBack: number;
  finalProfitLoss: number;
  accumulative: number;
}

interface UnitCostRow {
  lineKey: string;
  lineId: number;
  code: string | null;
  description: string;
  amount: number;
  unit: number;
}

interface UnitCostGroup {
  key: string;
  rows: UnitCostRow[];
  subtotal: { amount: number; unit: number };
}

interface UnitCostReport {
  bagsSold: number;
  sales: { amount: number; unit: number };
  production: { bags: number; lineKey: string | null };
  groups: UnitCostGroup[];
  totalBeforeRepair: { amount: number; unit: number };
  machineRepair: { rows: UnitCostRow[]; amount: number; unit: number };
  total: { amount: number; unit: number };
  addBack: { amount: number; unit: number };
  finalUnitCost: number;
}

interface MonthlyTrailEntry {
  year: number;
  month: number;
  monthKey: string;
  profitLoss: number;
  accumulative: number;
}

interface ProductLineReport {
  productLine: ProductLine;
  period: ReportPeriod;
  pl: PLReport;
  unitCost: UnitCostReport;
  anchor: { asOfDate: string; accumulative: number } | null;
  monthlyTrail: MonthlyTrailEntry[];
  warnings: string[];
}

interface EstimatedReportResponse {
  period: ReportPeriod & { start: string; end: string };
  reports: Partial<Record<ProductLine, ProductLineReport>>;
}

const colors = {
  textPrimary: "#0f172a",
  textSecondary: "#475569",
  textMuted: "#64748b",
  borderDark: "#334155",
  border: "#cbd5e1",
  success: "#166534",
  danger: "#b91c1c",
};

const styles = StyleSheet.create({
  page: {
    paddingTop: 20,
    paddingBottom: 30,
    paddingLeft: 40,
    paddingRight: 40,
    fontFamily: "Helvetica",
    fontSize: 9,
    color: colors.textPrimary,
  },
  pageNumber: {
    position: "absolute",
    fontSize: 8,
    bottom: 20,
    left: 0,
    right: 0,
    textAlign: "center",
    color: colors.textMuted,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
    gap: 12,
  },
  logo: {
    width: 50,
    height: 50,
  },
  headerTextContainer: {
    flex: 1,
  },
  companyName: {
    fontSize: 14,
    fontFamily: "Helvetica-Bold",
    color: colors.textPrimary,
  },
  reportTitle: {
    fontSize: 12,
    fontFamily: "Helvetica-Bold",
    marginTop: 3,
    color: colors.textSecondary,
  },
  periodText: {
    fontSize: 9,
    color: colors.textMuted,
    marginTop: 2,
  },
  section: {
    marginBottom: 6,
  },
  sectionTitle: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    color: colors.textPrimary,
    marginBottom: 2,
    textTransform: "uppercase",
  },
  tableHeader: {
    flexDirection: "row",
    borderBottomWidth: 0.75,
    borderBottomColor: colors.borderDark,
    paddingVertical: 2,
  },
  th: {
    fontSize: 7.5,
    fontFamily: "Helvetica-Bold",
    color: colors.textMuted,
    textTransform: "uppercase",
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 1.5,
    borderBottomWidth: 0.25,
    borderBottomColor: colors.border,
  },
  colCode: {
    width: 70,
    fontSize: 8.5,
    color: colors.textSecondary,
  },
  colDesc: {
    flex: 1,
    fontSize: 8.5,
    color: colors.textSecondary,
    paddingRight: 6,
  },
  colBags: {
    width: 55,
    textAlign: "right",
    fontSize: 8.5,
    fontFamily: "Courier",
  },
  colAmount: {
    width: 80,
    textAlign: "right",
    fontSize: 8.5,
    fontFamily: "Courier",
  },
  colUnit: {
    width: 70,
    textAlign: "right",
    fontSize: 8.5,
    fontFamily: "Courier",
  },
  emptyText: {
    fontSize: 8.5,
    color: colors.textMuted,
    paddingLeft: 15,
  },
  subtotal: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 3,
    marginTop: 2,
    borderTopWidth: 0.5,
    borderTopColor: colors.border,
  },
  subtotalLabel: {
    flex: 1,
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    color: colors.textPrimary,
  },
  subtotalAmount: {
    width: 80,
    textAlign: "right",
    fontSize: 9,
    fontFamily: "Courier-Bold",
  },
  subtotalUnit: {
    width: 70,
    textAlign: "right",
    fontSize: 9,
    fontFamily: "Courier-Bold",
  },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 1.5,
    paddingLeft: 15,
  },
  infoLabel: {
    fontSize: 9,
    color: colors.textMuted,
  },
  infoValue: {
    fontSize: 9,
    fontFamily: "Courier",
    color: colors.textSecondary,
  },
  lineItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 2,
    paddingLeft: 15,
  },
  lineItemLabel: {
    flex: 1,
    fontSize: 9,
    color: colors.textSecondary,
  },
  lineItemAmount: {
    width: 80,
    textAlign: "right",
    fontSize: 9,
    fontFamily: "Courier",
  },
  lineItemAmountWide: {
    width: 190,
    textAlign: "right",
    fontSize: 9,
    fontFamily: "Courier",
  },
  boldRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 3,
    marginBottom: 6,
  },
  boldRowLabel: {
    flex: 1,
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
  },
  boldRowAmount: {
    width: 80,
    textAlign: "right",
    fontSize: 9,
    fontFamily: "Courier-Bold",
  },
  addBackRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 4,
    paddingHorizontal: 4,
    marginBottom: 6,
    backgroundColor: "#f0f9ff",
    borderWidth: 0.5,
    borderColor: "#bae6fd",
  },
  majorTotal: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 5,
    marginBottom: 6,
    borderTopWidth: 1.5,
    borderBottomWidth: 1.5,
    borderColor: colors.borderDark,
    backgroundColor: "#f8fafc",
  },
  majorTotalLabel: {
    flex: 1,
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    color: colors.textPrimary,
    paddingLeft: 4,
  },
  majorTotalAmount: {
    width: 80,
    textAlign: "right",
    fontSize: 10,
    fontFamily: "Courier-Bold",
    paddingRight: 4,
  },
  majorTotalUnit: {
    width: 90,
    textAlign: "right",
    fontSize: 9,
    fontFamily: "Courier",
    color: colors.textMuted,
    paddingRight: 4,
  },
  finalTotal: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 6,
    marginBottom: 6,
    borderTopWidth: 2,
    borderBottomWidth: 2,
    borderColor: colors.textPrimary,
    backgroundColor: "#eff6ff",
  },
  finalTotalLabel: {
    flex: 1,
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    color: colors.textPrimary,
    paddingLeft: 4,
  },
  finalTotalAmount: {
    width: 110,
    textAlign: "right",
    fontSize: 11,
    fontFamily: "Courier-Bold",
    paddingRight: 4,
  },
  anchorCaption: {
    fontSize: 7,
    color: colors.textMuted,
  },
  warnings: {
    marginTop: 8,
    fontSize: 7,
    color: colors.textMuted,
  },
  generatedAt: {
    marginTop: 8,
    fontSize: 7,
    color: colors.textMuted,
    textAlign: "right",
  },
});

const UNIT_COST_GROUP_LABELS: Record<string, string> = {
  ingredient: "Ingredients",
  packing: "Packing",
  salary: "Salary",
  salesman: "Salesman",
  habuk: "Habuk",
  expenses: "Expenses",
};

const EXPENSE_BREAKDOWN_LABELS: {
  key: keyof PLReport["expenseBreakdown"];
  label: string;
}[] = [
  { key: "salary", label: "Salary" },
  { key: "salesman", label: "Salesman" },
  { key: "habuk", label: "Habuk" },
  { key: "expenses", label: "Expenses" },
  { key: "machineRepair", label: "Machine Repair" },
];

const formatCurrency = (amount: number): string => {
  const formatted = new Intl.NumberFormat("en-MY", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(amount));
  return amount < 0 ? `(${formatted})` : formatted;
};

const formatBags = (bags: number): string =>
  new Intl.NumberFormat("en-MY", { maximumFractionDigits: 2 }).format(bags);

const formatUnit = (unit: number): string => unit.toFixed(6);

const signedColor = (amount: number): string =>
  amount >= 0 ? colors.success : colors.danger;

const ReportHeader: React.FC<{ title: string; line: ProductLineReport }> = ({
  title,
  line,
}) => (
  <View style={styles.header}>
    <Image src={TienHockLogo} style={styles.logo} />
    <View style={styles.headerTextContainer}>
      <Text style={styles.companyName}>{TIENHOCK_INFO.name}</Text>
      <Text style={styles.reportTitle}>
        {title} — {line.productLine.toUpperCase()}
      </Text>
      <Text style={styles.periodText}>
        For the month of {line.period.label}
      </Text>
    </View>
  </View>
);

const PLTableHeader: React.FC<{ showBags: boolean }> = ({ showBags }) => (
  <View style={styles.tableHeader}>
    <Text style={[styles.th, styles.colCode]}>Code</Text>
    <Text style={[styles.th, styles.colDesc]}>Description</Text>
    {showBags && <Text style={[styles.th, styles.colBags]}>Bags</Text>}
    <Text style={[styles.th, styles.colAmount]}>Amount</Text>
  </View>
);

const PLDataRow: React.FC<{
  row: {
    code: string | null;
    description: string;
    bags?: number | null;
    amount: number | null;
  };
  showBags: boolean;
}> = ({ row, showBags }) => (
  <View style={styles.tableRow}>
    <Text style={styles.colCode}>{row.code ?? "-"}</Text>
    <Text style={styles.colDesc}>{row.description}</Text>
    {showBags && (
      <Text style={styles.colBags}>
        {row.bags === null || row.bags === undefined
          ? "-"
          : formatBags(row.bags)}
      </Text>
    )}
    <Text style={styles.colAmount}>
      {row.amount === null ? "-" : formatCurrency(row.amount)}
    </Text>
  </View>
);

const UCTableHeader: React.FC = () => (
  <View style={styles.tableHeader}>
    <Text style={[styles.th, styles.colCode]}>Code</Text>
    <Text style={[styles.th, styles.colDesc]}>Description</Text>
    <Text style={[styles.th, styles.colAmount]}>Amount</Text>
    <Text style={[styles.th, styles.colUnit]}>Unit</Text>
  </View>
);

const UCDataRow: React.FC<{ row: UnitCostRow }> = ({ row }) => (
  <View style={styles.tableRow}>
    <Text style={styles.colCode}>{row.code ?? "-"}</Text>
    <Text style={styles.colDesc}>{row.description}</Text>
    <Text style={styles.colAmount}>{formatCurrency(row.amount)}</Text>
    <Text style={styles.colUnit}>{formatUnit(row.unit)}</Text>
  </View>
);

const PageFooter: React.FC = () => (
  <>
    <Text style={styles.generatedAt}>
      Generated on {new Date().toLocaleString("en-MY")}
    </Text>
    <Text
      style={styles.pageNumber}
      render={({ pageNumber, totalPages }) =>
        `Page ${pageNumber} of ${totalPages}`
      }
      fixed
    />
  </>
);

const EstimatedPLPDFPage: React.FC<{
  line: ProductLineReport;
  paperSize: PdfPaperSize;
}> = ({ line, paperSize }) => {
  const pl = line.pl;
  return (
    <Page size={getReactPdfPageSize(paperSize)} style={styles.page}>
      <ReportHeader title="ESTIMATED P&L" line={line} />

      {/* PRODUCT */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Product</Text>
        <PLTableHeader showBags />
        {pl.products.map((row, index) => (
          <PLDataRow
            key={`${row.lineId}-${index}`}
            row={row}
            showBags
          />
        ))}
        <View style={styles.subtotal}>
          <Text style={styles.subtotalLabel}>
            Total Sales ({formatBags(pl.totals.bags)} bags)
          </Text>
          <Text style={styles.subtotalAmount}>
            {formatCurrency(pl.totals.amount)}
          </Text>
        </View>
      </View>

      {/* CLOSING STOCK */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Closing Stock</Text>
        <PLTableHeader showBags={false} />
        {pl.closingStock.map((row, index) => (
          <PLDataRow
            key={`${row.lineId}-${index}`}
            row={row}
            showBags={false}
          />
        ))}
        <View style={styles.subtotal}>
          <Text style={styles.subtotalLabel}>Total Closing Stock</Text>
          <Text style={styles.subtotalAmount}>
            {formatCurrency(pl.closingStockTotal)}
          </Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Closing Stock + Sales</Text>
          <Text style={styles.infoValue}>
            {formatCurrency(pl.closingStockPlusSales)}
          </Text>
        </View>
      </View>

      {/* OPENING STOCK */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Opening Stock</Text>
        <PLTableHeader showBags={false} />
        {pl.openingStock.map((row, index) => (
          <PLDataRow
            key={`${row.lineId}-${index}`}
            row={row}
            showBags={false}
          />
        ))}
        <View style={styles.subtotal}>
          <Text style={styles.subtotalLabel}>Total Opening Stock</Text>
          <Text style={styles.subtotalAmount}>
            {formatCurrency(pl.openingStockTotal)}
          </Text>
        </View>
      </View>

      {/* PURCHASE + RETURNS */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Purchase</Text>
        <PLTableHeader showBags={false} />
        {pl.purchases.map((row, index) => (
          <PLDataRow
            key={`${row.lineId}-${index}`}
            row={row}
            showBags={false}
          />
        ))}
        <View style={styles.subtotal}>
          <Text style={styles.subtotalLabel}>Total Purchase</Text>
          <Text style={styles.subtotalAmount}>
            {formatCurrency(pl.purchaseTotal)}
          </Text>
        </View>

        {pl.returns.length > 0 && (
          <View style={{ marginTop: 8 }}>
            <Text style={styles.sectionTitle}>Returns</Text>
            <PLTableHeader showBags />
            {pl.returns.map((row, index) => (
              <PLDataRow
                key={`${row.lineId}-${index}`}
                row={row}
                showBags
              />
            ))}
            <View style={styles.subtotal}>
              <Text style={styles.subtotalLabel}>Total Returns</Text>
              <Text style={styles.subtotalAmount}>
                {formatCurrency(pl.returnsTotal)}
              </Text>
            </View>
          </View>
        )}

        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Opening + Purchase + Returns</Text>
          <Text style={styles.infoValue}>
            {formatCurrency(pl.openingPlusPurchasesPlusReturns)}
          </Text>
        </View>
      </View>

      {/* USAGE */}
      <View style={styles.majorTotal}>
        <Text style={styles.majorTotalLabel}>
          USAGE (Opening + Purchase + Returns - Closing)
        </Text>
        <Text style={styles.majorTotalAmount}>{formatCurrency(pl.usage)}</Text>
      </View>

      {/* GROSS */}
      <View style={styles.boldRow}>
        <Text style={[styles.boldRowLabel, { color: signedColor(pl.gross) }]}>
          GROSS (Sales - Usage)
        </Text>
        <Text style={[styles.boldRowAmount, { color: signedColor(pl.gross) }]}>
          {formatCurrency(pl.gross)}
        </Text>
      </View>

      {/* EXPENSES */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Expenses</Text>
        {EXPENSE_BREAKDOWN_LABELS.map(({ key, label }) => (
          <View key={key} style={styles.lineItem}>
            <Text style={styles.lineItemLabel}>{label}</Text>
            <Text style={styles.lineItemAmount}>
              {formatCurrency(pl.expenseBreakdown[key])}
            </Text>
          </View>
        ))}
        <View style={styles.subtotal}>
          <Text style={styles.subtotalLabel}>Total Expenses</Text>
          <Text style={styles.subtotalAmount}>
            ({formatCurrency(pl.expenses)})
          </Text>
        </View>
      </View>

      {/* P/L */}
      <View style={styles.majorTotal}>
        <Text style={styles.majorTotalLabel}>PROFIT / (LOSS)</Text>
        <Text
          style={[
            styles.majorTotalAmount,
            { color: signedColor(pl.profitLoss) },
          ]}
        >
          {formatCurrency(pl.profitLoss)}
        </Text>
      </View>

      {/* ADD BACK (keyed on the report page) */}
      <View style={styles.addBackRow}>
        <Text style={styles.boldRowLabel}>ADD BACK</Text>
        <Text style={styles.boldRowAmount}>{formatCurrency(pl.addBack)}</Text>
      </View>

      {/* FINAL P/L */}
      <View style={styles.finalTotal}>
        <Text style={styles.finalTotalLabel}>FINAL PROFIT / (LOSS)</Text>
        <Text
          style={[
            styles.finalTotalAmount,
            { color: signedColor(pl.finalProfitLoss) },
          ]}
        >
          {formatCurrency(pl.finalProfitLoss)}
        </Text>
      </View>

      {/* ACCUMULATIVE */}
      <View style={styles.finalTotal}>
        <Text style={styles.finalTotalLabel}>ACCUMULATIVE P/L</Text>
        <Text
          style={[
            styles.finalTotalAmount,
            { color: signedColor(pl.accumulative) },
          ]}
        >
          RM {formatCurrency(pl.accumulative)}
        </Text>
      </View>

      {line.anchor && (
        <Text style={styles.anchorCaption}>
          Anchor {line.anchor.asOfDate}: RM{" "}
          {formatCurrency(line.anchor.accumulative)} ·{" "}
          {line.monthlyTrail.length} month
          {line.monthlyTrail.length === 1 ? "" : "s"} accumulated since.
        </Text>
      )}

      {line.warnings.length > 0 && (
        <View style={styles.warnings}>
          {line.warnings.map((warning, index) => (
            <Text key={index}>Warning: {warning}</Text>
          ))}
        </View>
      )}

      <PageFooter />
    </Page>
  );
};

const EstimatedUnitCostPDFPage: React.FC<{
  line: ProductLineReport;
  paperSize: PdfPaperSize;
}> = ({ line, paperSize }) => {
  const uc = line.unitCost;
  return (
    <Page size={getReactPdfPageSize(paperSize)} style={styles.page}>
      <ReportHeader title="ESTIMATED UNIT COST" line={line} />

      {/* Production & sales summary */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Production &amp; Sales Summary</Text>
        <View style={styles.lineItem}>
          <Text style={styles.lineItemLabel}>Production</Text>
          <Text style={styles.lineItemAmount}>
            {formatBags(uc.production.bags)} bags
          </Text>
        </View>
        <View style={styles.lineItem}>
          <Text style={styles.lineItemLabel}>Bags Sold</Text>
          <Text style={styles.lineItemAmount}>
            {formatBags(uc.bagsSold)} bags
          </Text>
        </View>
        <View style={styles.lineItem}>
          <Text style={styles.lineItemLabel}>Sales</Text>
          <Text style={styles.lineItemAmountWide}>
            {formatCurrency(uc.sales.amount)} ({formatUnit(uc.sales.unit)} /
            bag)
          </Text>
        </View>
      </View>

      {/* Cost groups */}
      {uc.groups.map((group) => (
        <View key={group.key} style={styles.section}>
          <Text style={styles.sectionTitle}>
            {UNIT_COST_GROUP_LABELS[group.key] ?? group.key}
          </Text>
          {group.rows.length === 0 ? (
            <Text style={styles.emptyText}>No mapped lines.</Text>
          ) : (
            <>
              <UCTableHeader />
              {group.rows.map((row, index) => (
                <UCDataRow key={`${row.lineId}-${index}`} row={row} />
              ))}
            </>
          )}
          <View style={styles.subtotal}>
            <Text style={styles.subtotalLabel}>Subtotal</Text>
            <Text style={styles.subtotalAmount}>
              {formatCurrency(group.subtotal.amount)}
            </Text>
            <Text style={styles.subtotalUnit}>
              {formatUnit(group.subtotal.unit)}
            </Text>
          </View>
        </View>
      ))}

      {/* TOTAL before repair */}
      <View style={styles.majorTotal}>
        <Text style={styles.majorTotalLabel}>TOTAL</Text>
        <Text style={styles.majorTotalAmount}>
          {formatCurrency(uc.totalBeforeRepair.amount)}
        </Text>
        <Text style={styles.majorTotalUnit}>
          {formatUnit(uc.totalBeforeRepair.unit)} / bag
        </Text>
      </View>

      {/* MACHINE REPAIR */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Machine Repair</Text>
        {uc.machineRepair.rows.length === 0 ? (
          <Text style={styles.emptyText}>No mapped lines.</Text>
        ) : (
          <>
            <UCTableHeader />
            {uc.machineRepair.rows.map((row, index) => (
              <UCDataRow key={`${row.lineId}-${index}`} row={row} />
            ))}
          </>
        )}
        <View style={styles.subtotal}>
          <Text style={styles.subtotalLabel}>Total Machine Repair</Text>
          <Text style={styles.subtotalAmount}>
            {formatCurrency(uc.machineRepair.amount)}
          </Text>
          <Text style={styles.subtotalUnit}>
            {formatUnit(uc.machineRepair.unit)}
          </Text>
        </View>
      </View>

      {/* TOTAL incl. repair */}
      <View style={styles.majorTotal}>
        <Text style={styles.majorTotalLabel}>
          TOTAL (incl. Machine Repair)
        </Text>
        <Text style={styles.majorTotalAmount}>
          {formatCurrency(uc.total.amount)}
        </Text>
        <Text style={styles.majorTotalUnit}>
          {formatUnit(uc.total.unit)} / bag
        </Text>
      </View>

      {/* ADD BACK (keyed on the Estimated P&L page) */}
      <View style={styles.addBackRow}>
        <Text style={styles.boldRowLabel}>
          ADD BACK (keyed on the Estimated P&amp;L page)
        </Text>
        <Text style={styles.boldRowAmount}>
          {formatCurrency(uc.addBack.amount)}
        </Text>
        <Text style={styles.majorTotalUnit}>
          {formatUnit(uc.addBack.unit)} / bag
        </Text>
      </View>

      {/* FINAL UNIT COST */}
      <View style={styles.finalTotal}>
        <Text style={styles.finalTotalLabel}>FINAL ESTIMATED UNIT COST</Text>
        <Text
          style={[styles.finalTotalAmount, { color: colors.success }]}
        >
          {formatUnit(uc.finalUnitCost)} / bag
        </Text>
      </View>

      <PageFooter />
    </Page>
  );
};

interface EstimatedReportPDFDocumentProps {
  data: EstimatedReportResponse;
  view: EstimatedReportView;
  productLines: ProductLine[];
  paperSize?: PdfPaperSize;
}

const EstimatedReportPDFDocument: React.FC<EstimatedReportPDFDocumentProps> = ({
  data,
  view,
  productLines,
  paperSize,
}) => {
  const effectivePaperSize = paperSize ?? getPaperSizePreference();
  return (
  <Document>
    {productLines.flatMap((productLine) => {
      const line = data.reports[productLine];
      if (!line) return [];
      return view === "pl"
        ? [
            <EstimatedPLPDFPage
              key={`${productLine}-pl`}
              line={line}
              paperSize={effectivePaperSize}
            />,
          ]
        : [
            <EstimatedUnitCostPDFPage
              key={`${productLine}-uc`}
              line={line}
              paperSize={effectivePaperSize}
            />,
          ];
    })}
  </Document>
  );
};

// `productLines` selects which product lines are printed: one line for the
// "Print MEE" / "Print BIHUN" actions, both for "Print All".
export const generateEstimatedReportPDF = async (
  data: EstimatedReportResponse,
  view: EstimatedReportView,
  productLines: ProductLine[] = ["mee", "bihun"],
  paperSize?: PdfPaperSize
): Promise<void> => {
  const blob = await pdf(
    <EstimatedReportPDFDocument
      data={data}
      view={view}
      productLines={productLines}
      paperSize={paperSize}
    />
  ).toBlob();

  printPdfBlob(blob, "estimated report PDF");
};
