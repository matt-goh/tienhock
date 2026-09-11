export interface StatementLineItem {
  note: string | null;
  name: string;
  amount: number;
}

interface StatementSection {
  items: StatementLineItem[];
  total: number;
}

export interface BalanceSheetData {
  period: { year: number; month: number; start_date: string; as_of_date: string };
  assets: { current: StatementSection; non_current: StatementSection; total: number };
  liabilities: { current: StatementSection; non_current: StatementSection; total: number };
  equity: StatementSection;
  totals: { total_assets: number; total_liabilities_equity: number; is_balanced: boolean };
}

export interface IncomeStatementData {
  period: { year: number; month: number; start_date: string; end_date: string };
  revenue: StatementSection;
  cost_of_goods_sold: StatementSection;
  gross_profit: number;
  expenses: StatementSection;
  net_profit: number;
}

export type StatementLayoutRow =
  | { kind: "heading"; key: string; label: string }
  | { kind: "item"; key: string; label: string; translateLabel: boolean; note: string; amount: number; spaceBefore: boolean }
  | { kind: "total"; key: string; label: string; amount: number; doubleRule: boolean };

// Presentation labels from the legacy statements. Other notes retain their DB names.
const labels: Record<string, string> = {
  "4": "PROPERTY, PLANT AND EQUIPMENT",
  "14-1": "INVENTORIES (FINISHED GOODS)",
  "14-2": "INVENTORIES (CHEMICAL & RAW MATERIAL)",
  "14-3": "INVENTORIES (PACKING MATERIAL)",
  "22": "TRADE RECEIVABLES",
  "8": "NON-TRADE RECEIVABLES, DEPOSIT & PREPAYMENT",
  "17": "INPUT TAX",
  "6": "CASH IN HAND",
  "19": "CASH AT BANK",
  "13": "TRADE PAYABLE",
  "1": "ACCRUALS",
  "10": "OTHER CREDITORS",
  "9": "AMOUNT DUE TO DIRECTOR",
  "16": "HIRE PURCHASE PAYABLE",
  "11": "TERM LOANS",
  "12": "TAXATION",
  "21": "SHARE CAPITAL",
  "20": "RETAINED PROFIT - B/F",
  "7": "REVENUE",
  "3-1": "OPENING INVENTORIES",
  "18-2": "OTHER INCOME",
  "18-1": "GAIN ON DISPOSAL OF PROPERTY AND EQUIPMENT",
  "5": "EXPENSES (SALARIES AND WAGES)",
  "15": "DEP. PROPERTY, PLANT & EQUIPMENT",
  "23": "HIRE PURCHASE INTEREST",
  "3": "LESS: TAX EXPENSES",
};

const sumItems = (items: StatementLineItem[]): number =>
  items.reduce((sum: number, item: StatementLineItem): number => sum + item.amount, 0);

const itemRows = (
  key: string,
  items: StatementLineItem[],
  order: string[] = []
): StatementLayoutRow[] => [...items]
  .sort((a: StatementLineItem, b: StatementLineItem): number => {
    const aIndex: number = order.indexOf(a.note ?? "");
    const bIndex: number = order.indexOf(b.note ?? "");
    return (aIndex < 0 ? order.length : aIndex) - (bIndex < 0 ? order.length : bIndex);
  })
  .map((item: StatementLineItem, index: number): StatementLayoutRow => ({
    kind: "item", key: `${key}-${index}`, label: labels[item.note ?? ""] ?? item.name,
    translateLabel: labels[item.note ?? ""] !== undefined,
    note: item.note ?? "", amount: item.amount, spaceBefore: false,
  }));

const heading = (key: string, label: string): StatementLayoutRow => ({ kind: "heading", key, label });
const total = (
  key: string, amount: number, label: string = "", doubleRule: boolean = false
): StatementLayoutRow => ({ kind: "total", key, amount, label, doubleRule });

// The legacy deduction block includes notes 16 and 11, although the API places
// them in non-current liabilities. This changes presentation only, not the API
// classification. Any other non-current notes remain in their own deduction block.
export const getBalanceSheetLayoutRows = (data: BalanceSheetData): StatementLayoutRow[] => {
  const legacyLoans: StatementLineItem[] = data.liabilities.non_current.items.filter(
    (item: StatementLineItem): boolean => item.note === "16" || item.note === "11"
  );
  const otherLongTerm: StatementLineItem[] = data.liabilities.non_current.items.filter(
    (item: StatementLineItem): boolean => item.note !== "16" && item.note !== "11"
  );
  const currentLiabilities: number = data.liabilities.current.total + sumItems(legacyLoans);
  const netCurrent: number = data.assets.current.total - currentLiabilities;
  const equityItems: StatementLineItem[] = data.equity.items.filter(
    (item: StatementLineItem): boolean => !(item.note === null && item.name === "Current Year Profit")
  );
  const profitItems: StatementLineItem[] = data.equity.items.filter(
    (item: StatementLineItem): boolean => item.note === null && item.name === "Current Year Profit"
  );
  const rows: StatementLayoutRow[] = [
    heading("non-current-assets", "NON-CURRENT ASSET"),
    ...itemRows("non-current-assets", data.assets.non_current.items, ["4"]),
    heading("current-assets", "CURRENT ASSETS"),
    ...itemRows("current-assets", data.assets.current.items, ["14-1", "14-2", "14-3", "22", "8", "17", "6", "19"]),
    total("current-assets-total", data.assets.current.total),
    heading("current-liabilities", "LESS: CURRENT LIABILITIES"),
    ...itemRows("current-liabilities", [...data.liabilities.current.items, ...legacyLoans], ["13", "1", "10", "9", "16", "11", "12"]),
    total("current-liabilities-total", -currentLiabilities),
    total("net-current", netCurrent, "NET CURRENT ASSETS/(LIABILITIES)"),
  ];
  if (otherLongTerm.length > 0) {
    rows.push(heading("non-current-liabilities", "LESS: NON-CURRENT LIABILITIES"),
      ...itemRows("non-current-liabilities", otherLongTerm),
      total("non-current-liabilities-total", -sumItems(otherLongTerm)));
  }
  rows.push(
    total("net-assets", data.assets.total - data.liabilities.total, "", true),
    heading("financed-by", "FINANCED BY"),
    ...itemRows("equity", equityItems, ["21", "20"]),
    ...profitItems.map((item: StatementLineItem, index: number): StatementLayoutRow => ({
      kind: "item", key: `profit-${index}`, label: "PROFIT FOR THE FINANCIAL YEAR",
      translateLabel: true, note: "DN", amount: item.amount, spaceBefore: false,
    })),
    total("financed-by-total", data.equity.total, "", true)
  );
  return rows;
};

// All amounts come from this one response, so the CH line and statement cannot
// mix snapshots. Only known manufacturing notes are collapsed; new COGS notes
// remain visible individually until explicitly mapped to manufacturing.
export const getIncomeStatementLayoutRows = (data: IncomeStatementData): StatementLayoutRow[] => {
  const manufacturingNotes: string[] = ["3-2", "3-3", "3-4", "3-5", "3-6", "3-7", "5-1", "14-2", "14-3"];
  const otherIncome: StatementLineItem[] = data.revenue.items.filter(
    (item: StatementLineItem): boolean => item.note === "18-1" || item.note === "18-2"
  );
  const sales: StatementLineItem[] = data.revenue.items.filter(
    (item: StatementLineItem): boolean => item.note !== "18-1" && item.note !== "18-2"
  );
  const manufacturing: StatementLineItem[] = data.cost_of_goods_sold.items.filter(
    (item: StatementLineItem): boolean => manufacturingNotes.includes(item.note ?? "")
  );
  const closing: StatementLineItem[] = data.cost_of_goods_sold.items.filter(
    (item: StatementLineItem): boolean => item.note === "14-1"
  );
  const directCosts: StatementLineItem[] = data.cost_of_goods_sold.items.filter(
    (item: StatementLineItem): boolean => item.note !== "14-1" && !manufacturingNotes.includes(item.note ?? "")
  );
  const administration: StatementLineItem[] = data.expenses.items.filter(
    (item: StatementLineItem): boolean => item.note !== "23" && item.note !== "3"
  );
  const finance: StatementLineItem[] = data.expenses.items.filter((item: StatementLineItem): boolean => item.note === "23");
  const tax: StatementLineItem[] = data.expenses.items.filter((item: StatementLineItem): boolean => item.note === "3");
  // The API's gross_profit includes other income. The legacy gross-profit line
  // precedes that income; adding it back below preserves the API's final profit.
  const grossProfit: number = data.gross_profit - sumItems(otherIncome);
  const operatingProfit: number = data.gross_profit - sumItems(administration);
  return [
    ...itemRows("sales", sales, ["7"]),
    ...(sales.length > 1 ? [total("sales-total", data.revenue.total - sumItems(otherIncome))] : []),
    heading("cost-of-sales", "LESS: COST OF SALES"),
    ...itemRows("direct-costs", directCosts, ["3-1"]),
    { kind: "item", key: "cogm", label: "COST OF GOODS MANUFACTURED", translateLabel: true,
      note: "CH", amount: sumItems(manufacturing), spaceBefore: false },
    total("before-closing", data.cost_of_goods_sold.total - sumItems(closing)),
    ...closing.map((item: StatementLineItem, index: number): StatementLayoutRow => ({
      kind: "item", key: `closing-${index}`, label: "LESS: CLOSING INVENTORIES", translateLabel: true,
      note: item.note ?? "", amount: -item.amount, spaceBefore: true,
    })),
    total("cost-of-sales-total", data.cost_of_goods_sold.total),
    total("gross-profit", grossProfit, "GROSS PROFIT"),
    heading("other-income", "ADD: OTHER OPERATING INCOME"),
    ...itemRows("other-income", otherIncome, ["18-2", "18-1"]),
    total("other-income-total", sumItems(otherIncome)),
    total("after-other-income", data.gross_profit),
    heading("administration", "LESS: ADMINISTRATIVE EXPENSES"),
    ...itemRows("administration", administration, ["5", "15"]),
    total("administration-total", sumItems(administration)),
    total("operating-profit", operatingProfit, "PROFIT FROM OPERATIONS"),
    heading("finance", "LESS: FINANCE COSTS"),
    heading("interest", "INTEREST EXPENSES"),
    ...itemRows("finance", finance),
    total("finance-total", sumItems(finance)),
    total("before-tax", operatingProfit - sumItems(finance), "PROFIT BEFORE TAXATION"),
    ...itemRows("tax", tax).map((row: StatementLayoutRow): StatementLayoutRow =>
      row.kind === "item" ? { ...row, spaceBefore: true } : row),
    total("profit", data.net_profit, "PROFIT FOR THE FINANCIAL YEAR", true),
  ];
};

export const formatStatementAmount = (amount: number): string => {
  const formatted: string = new Intl.NumberFormat("en-MY", {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(Math.abs(amount));
  return amount < 0 ? `(${formatted})` : formatted;
};
