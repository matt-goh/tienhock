// src/utils/stock/MaterialStockPDFMake.ts
// Monthly Material Stock report PDF (pdfMake), printed from the Material Stock
// entry page for the active tab (MEE / BIHUN / SHARED) and selected month.
//
// Two layouts, chosen by the page's Running Balance toggle:
//   - toggle OFF (portrait): MATERIAL · UNIT COST · STOCK COUNT QTY · VALUE —
//     the physical count sheet, with an opening/purchases/closing reference
//     totals strip in the footer.
//   - toggle ON (landscape): adds OPENING, PURCHASES and CLOSING qty/value
//     columns so the month reads as a full running-balance movement report.
// Stock Kilang (finished goods) rows are appended for MEE/BIHUN and folded
// into the Grand Total, matching the page footer.
import pdfMake from "pdfmake/build/pdfmake";
import * as pdfFonts from "pdfmake/build/vfs_fonts";
import { TDocumentDefinitions, TableCell, Content } from "pdfmake/interfaces";
import TienHockLogo from "../tienhock.png";
import {
  type CompanyInfo,
  TIENHOCK_INFO,
} from "../invoice/einvoice/companyInfo";
import { printPdfBlob } from "../pdfPrintFallback";
import {
  MaterialCategory,
  MaterialWithStock,
  StockEntryRow,
} from "../../types/types";

// Initialize pdfmake with the bundled fonts (same pattern as AccountLedgerPDFMake)
(pdfMake as any).vfs = (pdfFonts as any).pdfMake?.vfs || pdfFonts;

export interface MaterialStockKilangPdfItem {
  product_id: string;
  name: string;
  unit_cost: number;
  quantity: number;
  value: number;
}

export interface MaterialStockReportData {
  productLine: "mee" | "bihun" | "shared";
  year: number;
  month: number; // 1-12
  showRunningBalance: boolean;
  // When true, materials with no stock count this month are not drawn (the
  // page's "show empty rows" checkbox). Section/grand totals still cover the
  // full month, mirroring the page footer.
  hideEmptyRows?: boolean;
  materials: MaterialWithStock[];
  stockKilang: MaterialStockKilangPdfItem[];
}

// Shared report palette (matches AccountLedgerPDFMake / DebtorsReportPDF)
const colors = {
  textPrimary: "#0f172a",
  textSecondary: "#475569",
  textMuted: "#64748b",
  borderDark: "#334155",
  borderLight: "#e2e8f0",
  fillLight: "#f8fafc",
  fillSection: "#eef2f7",
  fillTotals: "#f1f5f9",
  fillKilang: "#ecfdf5",
};

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const PRODUCT_LINE_LABELS: Record<MaterialStockReportData["productLine"], string> = {
  mee: "MEE",
  bihun: "BIHUN",
  shared: "SHARED",
};

const CATEGORY_LABELS: Record<MaterialCategory, string> = {
  ingredient: "Ingredients",
  raw_material: "Raw Materials",
  packing_material: "Packing Materials",
};

const CATEGORY_ORDER: MaterialCategory[] = [
  "ingredient",
  "raw_material",
  "packing_material",
];

const fmt = (n: number): string =>
  new Intl.NumberFormat("en-MY", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);

const fmtQty = (n: number): string =>
  new Intl.NumberFormat("en-MY", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 4,
  }).format(n);

const fmtCost = (n: number): string =>
  new Intl.NumberFormat("en-MY", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(n);

// Zero quantities/values print blank — keeps the count sheet clean for
// handwritten counts; totals are still computed from the real numbers.
const fmtQtyOrBlank = (n: number): string => (n === 0 ? "" : fmtQty(n));
const fmtOrBlank = (n: number): string => (n === 0 ? "" : fmt(n));

// Same "empty" rule as the page: nothing was counted this month. Unit cost
// alone does not make a row interesting — every row carries a default cost.
const materialHasCount = (material: MaterialWithStock): boolean =>
  material.adjustment_quantity !== 0 ||
  (material.variants || []).some(
    (variant: StockEntryRow): boolean => variant.adjustment_quantity !== 0
  );

// pdfMake needs images as data URLs; the bundler gives us an asset URL, so
// fetch it once and cache the conversion. Returns null if it can't be loaded
// (the letterhead then renders without the logo).
let cachedLogoDataUrl: string | null | undefined;
const loadLogoDataUrl = async (): Promise<string | null> => {
  if (cachedLogoDataUrl !== undefined) return cachedLogoDataUrl;
  try {
    const response = await fetch(TienHockLogo);
    const blob = await response.blob();
    cachedLogoDataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error("Failed to read logo"));
      reader.readAsDataURL(blob);
    });
  } catch (err) {
    console.warn("Material stock PDF: could not load logo", err);
    cachedLogoDataUrl = null;
  }
  return cachedLogoDataUrl;
};

interface RowNumbers {
  opening_quantity: number;
  opening_value: number;
  purchase_quantity: number;
  purchase_value: number;
  unit_cost: number;
  adjustment_quantity: number;
  adjustment_value: number;
  closing_quantity: number;
  closing_value: number;
}

const EMPTY_NUMBERS: RowNumbers = {
  opening_quantity: 0,
  opening_value: 0,
  purchase_quantity: 0,
  purchase_value: 0,
  unit_cost: 0,
  adjustment_quantity: 0,
  adjustment_value: 0,
  closing_quantity: 0,
  closing_value: 0,
};

const addNumbers = (a: RowNumbers, b: RowNumbers): RowNumbers => ({
  opening_quantity: a.opening_quantity + b.opening_quantity,
  opening_value: a.opening_value + b.opening_value,
  purchase_quantity: a.purchase_quantity + b.purchase_quantity,
  purchase_value: a.purchase_value + b.purchase_value,
  unit_cost: 0,
  adjustment_quantity: a.adjustment_quantity + b.adjustment_quantity,
  adjustment_value: a.adjustment_value + b.adjustment_value,
  closing_quantity: a.closing_quantity + b.closing_quantity,
  closing_value: a.closing_value + b.closing_value,
});

const materialNumbers = (material: MaterialWithStock): RowNumbers => ({
  opening_quantity: material.opening_quantity,
  opening_value: material.opening_value,
  purchase_quantity: material.purchase_quantity,
  purchase_value: material.purchase_value,
  unit_cost: material.unit_cost,
  adjustment_quantity: material.adjustment_quantity,
  adjustment_value: material.adjustment_value,
  closing_quantity: material.closing_quantity,
  closing_value: material.closing_value,
});

const variantNumbers = (variant: StockEntryRow): RowNumbers => ({
  opening_quantity: variant.opening_quantity,
  opening_value: variant.opening_value,
  purchase_quantity: variant.purchase_quantity,
  purchase_value: variant.purchase_value,
  unit_cost: variant.unit_cost,
  adjustment_quantity: variant.adjustment_quantity,
  adjustment_value: variant.adjustment_value,
  closing_quantity: variant.closing_quantity,
  closing_value: variant.closing_value,
});

const buildDocDefinition = (
  data: MaterialStockReportData,
  logoDataUrl: string | null,
  companyInfo: CompanyInfo,
  companyName: string
): TDocumentDefinitions => {
  const running: boolean = data.showRunningBalance;
  const lineLabel: string = PRODUCT_LINE_LABELS[data.productLine];
  const periodLabel: string = `${MONTH_NAMES[data.month - 1]} ${data.year}`;

  // Column count: 4 in count-only mode, 10 with the running balance columns.
  const columnCount: number = running ? 10 : 4;

  const nameCell = (
    name: string,
    code: string | null,
    options?: { bold?: boolean; indent?: boolean }
  ): TableCell => ({
    stack: [
      { text: name, style: options?.bold ? "tdBold" : "td" },
      ...(code ? [{ text: code, style: "tdCode" }] : []),
    ],
    margin: options?.indent ? ([14, 0, 0, 0] as [number, number, number, number]) : undefined,
  });

  // One data row in whichever column layout is active.
  const numberRow = (
    label: TableCell,
    numbers: RowNumbers,
    style: string,
    dashReference: boolean = false
  ): TableCell[] => {
    const ref = (value: string): TableCell => ({
      text: dashReference ? "–" : value,
      style,
      alignment: "right",
    });
    const countCells: TableCell[] = [
      { text: fmtCost(numbers.unit_cost), style, alignment: "right" },
      { text: fmtQtyOrBlank(numbers.adjustment_quantity), style, alignment: "right" },
      { text: fmtOrBlank(numbers.adjustment_value), style, alignment: "right" },
    ];
    if (!running) return [label, ...countCells];
    return [
      label,
      ref(fmtQtyOrBlank(numbers.opening_quantity)),
      ref(fmtOrBlank(numbers.opening_value)),
      ref(fmtQtyOrBlank(numbers.purchase_quantity)),
      ref(fmtOrBlank(numbers.purchase_value)),
      ...countCells,
      ref(fmtQtyOrBlank(numbers.closing_quantity)),
      ref(fmtOrBlank(numbers.closing_value)),
    ];
  };

  const sectionRow = (text: string, fillColor: string): TableCell[] => [
    { text, style: "sectionHeader", colSpan: columnCount, fillColor },
    ...Array.from({ length: columnCount - 1 }, () => ({}) as TableCell),
  ];

  // numberRow only ever produces object cells, so the spread cast is safe.
  const withTotalsFill = (cell: TableCell): TableCell =>
    ({ ...(cell as object), fillColor: colors.fillTotals }) as TableCell;

  const subtotalRow = (label: string, numbers: RowNumbers): TableCell[] =>
    numberRow({ text: label, style: "tdBold" }, numbers, "tdBold").map(
      withTotalsFill
    );

  const headerBody: TableCell[][] = running
    ? [
        [
          { text: "MATERIAL", style: "th", rowSpan: 2 },
          { text: "OPENING", style: "th", colSpan: 2, alignment: "center" },
          {},
          { text: "PURCHASES", style: "th", colSpan: 2, alignment: "center" },
          {},
          { text: "STOCK COUNT", style: "th", colSpan: 3, alignment: "center" },
          {},
          {},
          { text: "CLOSING", style: "th", colSpan: 2, alignment: "center" },
          {},
        ],
        [
          {},
          { text: "QTY", style: "th", alignment: "right" },
          { text: "RM", style: "th", alignment: "right" },
          { text: "QTY", style: "th", alignment: "right" },
          { text: "RM", style: "th", alignment: "right" },
          { text: "UNIT COST", style: "th", alignment: "right" },
          { text: "QTY", style: "th", alignment: "right" },
          { text: "RM", style: "th", alignment: "right" },
          { text: "QTY", style: "th", alignment: "right" },
          { text: "RM", style: "th", alignment: "right" },
        ],
      ]
    : [
        [
          { text: "MATERIAL", style: "th" },
          { text: "UNIT COST", style: "th", alignment: "right" },
          { text: "STOCK COUNT QTY", style: "th", alignment: "right" },
          { text: "VALUE (RM)", style: "th", alignment: "right" },
        ],
      ];

  const bodyRows: TableCell[][] = [];
  const grandNumbers: { total: RowNumbers } = { total: { ...EMPTY_NUMBERS } };
  const categoryTotals: { category: MaterialCategory; numbers: RowNumbers }[] = [];

  CATEGORY_ORDER.forEach((category: MaterialCategory) => {
    const items: MaterialWithStock[] = data.materials.filter(
      (material: MaterialWithStock): boolean => material.category === category
    );
    if (items.length === 0) return;

    // Totals always cover the full month, even when empty rows are hidden.
    let categoryNumbers: RowNumbers = { ...EMPTY_NUMBERS };
    items.forEach((material: MaterialWithStock) => {
      categoryNumbers = addNumbers(categoryNumbers, materialNumbers(material));
    });
    categoryTotals.push({ category, numbers: categoryNumbers });
    grandNumbers.total = addNumbers(grandNumbers.total, categoryNumbers);

    const visibleItems: MaterialWithStock[] = data.hideEmptyRows
      ? items.filter(materialHasCount)
      : items;
    if (visibleItems.length === 0) return;

    bodyRows.push(
      sectionRow(
        `${CATEGORY_LABELS[category].toUpperCase()} (${visibleItems.length})`,
        colors.fillSection
      )
    );

    visibleItems.forEach((material: MaterialWithStock) => {
      const numbers: RowNumbers = materialNumbers(material);

      const hasVariants: boolean = Boolean(
        material.has_variants && material.variants && material.variants.length > 0
      );
      const displayName: string = material.custom_name || material.name;

      bodyRows.push(
        numberRow(
          nameCell(displayName, material.code, { bold: hasVariants }),
          numbers,
          hasVariants ? "tdBold" : "td"
        )
      );

      if (hasVariants) {
        (material.variants || []).forEach((variant: StockEntryRow) => {
          const variantName: string =
            variant.variant_name || variant.custom_description || "Unnamed variant";
          bodyRows.push(
            numberRow(
              nameCell(variantName, null, { indent: true }),
              variantNumbers(variant),
              "tdMuted"
            )
          );
        });
      }
    });

    bodyRows.push(
      subtotalRow(`${CATEGORY_LABELS[category]} total`, categoryNumbers)
    );
  });

  const stockKilangTotal: number = data.stockKilang.reduce(
    (sum: number, item: MaterialStockKilangPdfItem): number => sum + item.value,
    0
  );

  if (data.stockKilang.length > 0) {
    bodyRows.push(
      sectionRow(
        `STOCK KILANG — FINISHED GOODS (${data.stockKilang.length})`,
        colors.fillKilang
      )
    );
    data.stockKilang.forEach((item: MaterialStockKilangPdfItem) => {
      bodyRows.push(
        numberRow(
          nameCell(item.name, item.product_id),
          {
            ...EMPTY_NUMBERS,
            unit_cost: item.unit_cost,
            adjustment_quantity: item.quantity,
            adjustment_value: item.value,
          },
          "td",
          running // dash the opening/purchases/closing cells in running mode
        )
      );
    });
    bodyRows.push(
      subtotalRow("Stock Kilang total", {
        ...EMPTY_NUMBERS,
        adjustment_value: stockKilangTotal,
      })
    );
  }

  if (data.materials.length === 0 && data.stockKilang.length === 0) {
    bodyRows.push([
      {
        text: `No materials found for ${lineLabel}`,
        style: "tdMuted",
        colSpan: columnCount,
        alignment: "center",
        margin: [0, 6, 0, 6] as [number, number, number, number],
      },
      ...Array.from({ length: columnCount - 1 }, () => ({}) as TableCell),
    ]);
  }

  // Running-balance grand-total row inside the table (count-only mode gets its
  // totals in the footer summary instead, mirroring the page footer).
  if (running && (data.materials.length > 0 || data.stockKilang.length > 0)) {
    bodyRows.push(
      numberRow(
        { text: "TOTAL", style: "tdBold" },
        {
          ...grandNumbers.total,
          adjustment_value:
            grandNumbers.total.adjustment_value + stockKilangTotal,
        },
        "tdBold"
      ).map(withTotalsFill)
    );
  }

  const tableWidths: (string | number)[] = running
    ? ["*", 48, 58, 48, 58, 52, 52, 60, 52, 60]
    : ["*", 70, 80, 90];

  const mainTable: Content = {
    table: {
      headerRows: running ? 2 : 1,
      widths: tableWidths,
      body: [...headerBody, ...bodyRows],
    },
    layout: {
      hLineWidth: (i: number, node: any) => {
        const last = node.table.body.length;
        if (i === 0 || i === (running ? 2 : 1) || i === last) return 1;
        return 0.5;
      },
      hLineColor: (i: number, node: any) => {
        const last = node.table.body.length;
        if (i === 0 || i === (running ? 2 : 1) || i === last)
          return colors.borderDark;
        return colors.borderLight;
      },
      vLineWidth: () => 0,
      paddingTop: () => 3,
      paddingBottom: () => 3,
      paddingLeft: () => 4,
      paddingRight: () => 4,
    },
  };

  // Footer summary mirroring the page tfoot: per-category count values,
  // Stock Count Total, Stock Kilang and the Grand Total, plus the running
  // balance reference line.
  const summaryRows: TableCell[][] = categoryTotals.map(
    ({ category, numbers }): TableCell[] => [
      { text: CATEGORY_LABELS[category], style: "summaryRowLabel" },
      {
        text: fmt(numbers.adjustment_value),
        style: "summaryRowValue",
        alignment: "right",
      },
    ]
  );
  summaryRows.push([
    { text: "Stock Count Total", style: "summaryTotalLabel" },
    {
      text: fmt(grandNumbers.total.adjustment_value),
      style: "summaryTotalValue",
      alignment: "right",
    },
  ]);
  if (data.stockKilang.length > 0) {
    summaryRows.push([
      { text: "Stock Kilang", style: "summaryTotalLabel" },
      {
        text: fmt(stockKilangTotal),
        style: "summaryTotalValue",
        alignment: "right",
      },
    ]);
  }
  summaryRows.push([
    { text: "GRAND TOTAL", style: "grandTotalLabel" },
    {
      text: `RM ${fmt(grandNumbers.total.adjustment_value + stockKilangTotal)}`,
      style: "grandTotalValue",
      alignment: "right",
    },
  ]);

  const summaryTable: Content = {
    table: {
      widths: ["*", 110],
      body: summaryRows,
    },
    layout: {
      hLineWidth: (i: number, node: any) =>
        i === node.table.body.length - 1 ? 1 : 0.5,
      hLineColor: (i: number, node: any) =>
        i === node.table.body.length - 1 ? colors.borderDark : colors.borderLight,
      vLineWidth: () => 0,
      paddingTop: () => 2.5,
      paddingBottom: () => 2.5,
      paddingLeft: () => 4,
      paddingRight: () => 4,
    },
    margin: [0, 6, 0, 0],
  };

  const referenceLine: Content = {
    columns: [
      { width: "*", text: "" },
      {
        width: "auto",
        table: {
          widths: ["auto", "auto", "auto"],
          body: [
            [
              {
                text: `Opening RM ${fmt(grandNumbers.total.opening_value)}`,
                style: "referenceText",
                border: [false, false, false, false],
              },
              {
                text: `Purchases RM ${fmt(grandNumbers.total.purchase_value)}`,
                style: "referenceText",
                border: [false, false, false, false],
              },
              {
                text: `Closing RM ${fmt(grandNumbers.total.closing_value)}`,
                style: "referenceText",
                border: [false, false, false, false],
              },
            ],
          ],
        },
        layout: {
          hLineWidth: () => 0,
          vLineWidth: () => 0,
          paddingLeft: () => 8,
          paddingRight: () => 0,
        },
      },
    ],
    margin: [0, 8, 0, 0],
  };

  // Letterhead: logo + company block on the left, report title block on the right
  const letterhead: Content = {
    columns: [
      ...(logoDataUrl
        ? [
            {
              image: logoDataUrl,
              width: 42,
              height: 42,
              margin: [0, 0, 10, 0] as [number, number, number, number],
            },
          ]
        : []),
      {
        width: "*",
        stack: [
          { text: companyName, style: "companyName" },
          { text: `(${companyInfo.reg_no})`, style: "companyDetail" },
          { text: companyInfo.address_pdf, style: "companyDetail" },
          {
            text: `Tel: ${companyInfo.phone}  ·  Email: ${companyInfo.email}`,
            style: "companyDetail",
          },
        ],
      },
      {
        width: "auto",
        stack: [
          { text: "MATERIAL STOCK REPORT", style: "reportTitle", alignment: "right" },
          { text: lineLabel, style: "reportSubtitle", alignment: "right" },
          { text: periodLabel, style: "reportSubtitle", alignment: "right" },
          {
            text: running ? "Running balance view" : "Stock count view",
            style: "reportMeta",
            alignment: "right",
          },
        ],
      },
    ],
    columnGap: 8,
    margin: [0, 0, 0, 8],
  };

  const generatedAt = new Date();
  const generatedLabel = `Generated on ${String(generatedAt.getDate()).padStart(2, "0")}/${String(
    generatedAt.getMonth() + 1
  ).padStart(2, "0")}/${generatedAt.getFullYear()} ${String(generatedAt.getHours()).padStart(
    2,
    "0"
  )}:${String(generatedAt.getMinutes()).padStart(2, "0")}`;

  // A4 content width: portrait 595 - 36 margins, landscape 842 - 36 margins.
  const contentWidth: number = running ? 806 : 559;

  return {
    info: {
      title: `Material Stock ${lineLabel} ${periodLabel}`,
      author: companyName,
    },
    pageSize: "A4",
    pageOrientation: running ? "landscape" : "portrait",
    pageMargins: [18, 18, 18, 40],
    defaultStyle: { fontSize: 8, lineHeight: 1.15, color: colors.textPrimary },
    footer: (currentPage: number, pageCount: number) => ({
      columns: [
        { text: generatedLabel, style: "footerText", alignment: "left" },
        {
          text: `Page ${currentPage} of ${pageCount}`,
          style: "footerText",
          alignment: "right",
        },
      ],
      margin: [18, 10, 18, 0],
    }),
    content: [
      letterhead,
      {
        canvas: [
          {
            type: "line",
            x1: 0,
            y1: 0,
            x2: contentWidth,
            y2: 0,
            lineWidth: 1.2,
            lineColor: colors.borderDark,
          },
        ],
        margin: [0, 0, 0, 10],
      },
      mainTable,
      summaryTable,
      referenceLine,
    ],
    styles: {
      companyName: { fontSize: 13, bold: true, color: colors.textPrimary },
      companyDetail: { fontSize: 7.5, color: colors.textSecondary, lineHeight: 1.25 },
      reportTitle: { fontSize: 13, bold: true, color: colors.textPrimary },
      reportSubtitle: { fontSize: 8.5, color: colors.textSecondary, lineHeight: 1.3 },
      reportMeta: { fontSize: 7.5, color: colors.textMuted },
      th: { fontSize: 7, bold: true, color: colors.textSecondary },
      sectionHeader: { fontSize: 7.5, bold: true, color: colors.textSecondary },
      td: { fontSize: 7.5 },
      tdBold: { fontSize: 7.5, bold: true },
      tdMuted: { fontSize: 7.5, color: colors.textMuted },
      tdCode: { fontSize: 6.5, color: colors.textMuted },
      summaryRowLabel: { fontSize: 8, color: colors.textSecondary },
      summaryRowValue: { fontSize: 8, color: colors.textPrimary },
      summaryTotalLabel: { fontSize: 8.5, bold: true, color: colors.textPrimary },
      summaryTotalValue: { fontSize: 8.5, bold: true, color: colors.textPrimary },
      grandTotalLabel: { fontSize: 9.5, bold: true, color: colors.textPrimary },
      grandTotalValue: { fontSize: 9.5, bold: true, color: colors.textPrimary },
      referenceText: { fontSize: 7.5, color: colors.textMuted },
      footerText: { fontSize: 7, color: colors.textMuted },
    },
  };
};

// Opens the browser print dialog for the report via a hidden iframe blob.
// If the iframe print is blocked (common on mobile browsers), the shared
// fallback opens the blob URL in a new tab instead.
export const generateMaterialStockPDF = async (
  data: MaterialStockReportData,
  options?: {
    companyInfo?: CompanyInfo;
    companyName?: string;
    includeLogo?: boolean;
  }
): Promise<void> => {
  const companyInfo: CompanyInfo = options?.companyInfo || TIENHOCK_INFO;
  const companyName: string = options?.companyName || companyInfo.name;
  const logoDataUrl: string | null =
    options?.includeLogo !== false ? await loadLogoDataUrl() : null;
  const lineLabel: string = PRODUCT_LINE_LABELS[data.productLine];
  const periodLabel: string = `${MONTH_NAMES[data.month - 1]} ${data.year}`;
  const docDefinition = buildDocDefinition(
    data,
    logoDataUrl,
    companyInfo,
    companyName
  );

  const pdfBlob: Blob = await new Promise<Blob>((resolve) => {
    pdfMake.createPdf(docDefinition).getBlob(resolve);
  });

  printPdfBlob(pdfBlob, `Material Stock ${lineLabel} ${periodLabel}`);
};
