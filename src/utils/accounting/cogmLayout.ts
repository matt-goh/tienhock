export interface CogmLineItem {
  note: string;
  name: string;
  amount: number;
}

interface CogmSection {
  items: CogmLineItem[];
  total: number;
}

export interface CogmData {
  period: {
    year: number;
    month: number;
    start_date: string;
    end_date: string;
  };
  raw_materials: CogmSection;
  packing_materials: CogmSection;
  labor_costs: CogmSection;
  other_costs: CogmSection;
  total_cogm: number;
}

export type CogmLayoutRow =
  | { kind: "heading"; key: string; label: string }
  | {
      kind: "item";
      key: string;
      label: string;
      translateLabel: boolean;
      note: string;
      amount: number;
      spaceBefore: boolean;
    }
  | { kind: "subtotal"; key: string; amount: number };

// These are report labels. Unknown notes retain their database names unchanged.
const labels: Record<string, string> = {
  "3-3": "OPENING INVENTORIES",
  "3-4": "PURCHASE OF CHEMICAL",
  "3-5": "PURCHASE OF RAW MATERIAL",
  "3-6": "FREIGHT & TRANSPORTATION",
  "14-2": "LESS: CLOSING INVENTORIES, RAW MATERIALS",
  "3-7": "OPENING INVENTORIES / PACKING MATERIAL",
  "3-2": "PURCHASE (PACKING MATERIAL)",
  "14-3": "LESS: CLOSING INVENTORIES (PACKING MATERIAL)",
  "5-1": "SALARIES AND WAGES (FACTORY WORKER)",
};

const itemRow = (
  item: CogmLineItem,
  key: string,
  spaceBefore: boolean = false
): CogmLayoutRow => ({
  kind: "item",
  key,
  label: labels[item.note] ?? item.name,
  translateLabel: labels[item.note] !== undefined,
  note: item.note,
  // The API supplies negative closing stock. The explicit LESS label supplies
  // the subtraction in the printed layout; other credit amounts keep their sign.
  amount: ["14-2", "14-3"].includes(item.note) ? -item.amount : item.amount,
  spaceBefore,
});

const materialRows = (
  key: string,
  label: string,
  items: CogmLineItem[],
  order: string[],
  closingNote: string,
  netTotal: number
): CogmLayoutRow[] => {
  if (items.length === 0) return [];

  const closing: CogmLineItem[] = items.filter(
    (item: CogmLineItem): boolean => item.note === closingNote
  );
  const purchases: CogmLineItem[] = items
    .filter((item: CogmLineItem): boolean => item.note !== closingNote)
    .sort((a: CogmLineItem, b: CogmLineItem): number => {
      const rankA: number = order.indexOf(a.note);
      const rankB: number = order.indexOf(b.note);
      return (rankA < 0 ? order.length : rankA) -
        (rankB < 0 ? order.length : rankB);
    });
  const closingAmount: number = closing.reduce(
    (sum: number, item: CogmLineItem): number => sum + item.amount, 0
  );
  const rows: CogmLayoutRow[] = [
    { kind: "heading", key, label },
    ...purchases.map((item: CogmLineItem, index: number): CogmLayoutRow =>
      itemRow(item, `${key}-purchase-${index}`)
    ),
  ];

  if (closing.length > 0) {
    rows.push({ kind: "subtotal", key: `${key}-before-closing`, amount: netTotal - closingAmount });
    rows.push(...closing.map((item: CogmLineItem, index: number): CogmLayoutRow =>
      itemRow(item, `${key}-closing-${index}`)
    ));
  }
  rows.push({ kind: "subtotal", key: `${key}-used`, amount: netTotal });
  return rows;
};

// Shared by the screen and PDF. This rearranges the existing response only;
// saved stock, API calculations and the supplied total_cogm are unchanged.
export const getCogmLayoutRows = (data: CogmData): CogmLayoutRow[] => {
  const freight: CogmLineItem[] = data.other_costs.items.filter(
    (item: CogmLineItem): boolean => item.note === "3-6"
  );
  const freightTotal: number = freight.reduce(
    (sum: number, item: CogmLineItem): number => sum + item.amount, 0
  );
  const other: CogmLineItem[] = data.other_costs.items.filter(
    (item: CogmLineItem): boolean => item.note !== "3-6"
  );
  const rows: CogmLayoutRow[] = [
    ...materialRows("raw", "COST OF RAW MATERIAL USED",
      [...data.raw_materials.items, ...freight], ["3-3", "3-4", "3-5", "3-6"],
      "14-2", data.raw_materials.total + freightTotal),
    ...materialRows("packing", "PACKING MATERIAL USED",
      data.packing_materials.items, ["3-7", "3-2"], "14-3", data.packing_materials.total),
    ...data.labor_costs.items.map((item: CogmLineItem, index: number): CogmLayoutRow =>
      itemRow(item, `labor-${index}`, index === 0)
    ),
  ];
  if (other.length > 0) {
    rows.push({ kind: "heading", key: "other", label: "Other Manufacturing Costs" });
    rows.push(...other.map((item: CogmLineItem, index: number): CogmLayoutRow =>
      itemRow(item, `other-${index}`)
    ));
    rows.push({ kind: "subtotal", key: "other-total", amount: data.other_costs.total - freightTotal });
  }
  return rows;
};

export const formatCogmAmount = (amount: number): string => {
  const formatted: string = new Intl.NumberFormat("en-MY", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(amount));
  return amount < 0 ? `(${formatted})` : formatted;
};
