// src/utils/accounting/PayrollSummaryPDFMake.ts
// Payroll Summary print (pdfMake) — the DIRECTOR vs WORKERS reconciliation sheet
// that ties payroll to the JVDR/JVSL vouchers: GAJI · BONUS · GAJI KASAR, EPF /
// SOCSO / SIP split into Majikan (M) and Pekerja (P) with totals, PCB, JUMLAH
// GAJI, JUMLAH DIGENAPKAN and GAJI BERSIH, then the JV-DIRECTOR / JV-WORKERS
// voucher totals and their grand total. Landscape A4; shared report styling.
import pdfMake from "pdfmake/build/pdfmake";
import * as pdfFonts from "pdfmake/build/vfs_fonts";
import { TDocumentDefinitions, TableCell, Content } from "pdfmake/interfaces";
import TienHockLogo from "../tienhock.png";
import { TIENHOCK_INFO } from "../invoice/einvoice/companyInfo";
import { printPdfBlob } from "../pdfPrintFallback";

(pdfMake as any).vfs = (pdfFonts as any).pdfMake?.vfs || pdfFonts;

type HeaderCellOptions = {
  rowSpan?: number;
  colSpan?: number;
  alignment?: "left" | "right" | "center";
};

export interface PayrollSummaryRow {
  gaji: number;
  bonus: number;
  gaji_kasar: number;
  epf_m: number;
  epf_p: number;
  epf_total: number;
  socso_m: number;
  socso_p: number;
  socso_total: number;
  sip_m: number;
  sip_p: number;
  sip_total: number;
  pcb: number;
  jumlah_gaji: number;
  digenapkan: number;
  gaji_bersih: number;
  jv_total: number;
}

export interface PayrollSummaryPDFData {
  periodLabel: string; // e.g. "June 2026"
  jvdr_ref: string;
  jvsl_ref: string;
  director: PayrollSummaryRow;
  workers: PayrollSummaryRow;
  total: PayrollSummaryRow;
  jvdr_total: number;
  jvsl_total: number;
  grand_total: number;
}

const colors = {
  textPrimary: "#0f172a",
  textSecondary: "#475569",
  textMuted: "#64748b",
  borderDark: "#334155",
  borderLight: "#e2e8f0",
  fillLight: "#f8fafc",
  fillTotals: "#f1f5f9",
};

// Money with 2 decimals; exact zero prints as an en-dash (matches the legacy sheet)
const fmt = (n: number): string =>
  Math.abs(n) < 0.005
    ? "-"
    : new Intl.NumberFormat("en-MY", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(n);

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
    console.warn("Payroll summary PDF: could not load logo", err);
    cachedLogoDataUrl = null;
  }
  return cachedLogoDataUrl;
};

const buildDocDefinition = (
  data: PayrollSummaryPDFData,
  logoDataUrl: string | null
): TDocumentDefinitions => {
  const th = (text: string, extra: HeaderCellOptions = {}): TableCell => ({
    text,
    style: "th",
    alignment: "center",
    ...extra,
  });
  const money = (n: number, bold = false): TableCell => ({
    text: fmt(n),
    style: bold ? "tdBold" : "td",
    alignment: "right",
  });

  // Two-row grouped header. Grouped columns (EPF/SOCSO/SIP) span M + P.
  const headerRow1: TableCell[] = [
    th("", { rowSpan: 2, alignment: "left" }),
    th("GAJI", { rowSpan: 2 }),
    th("BONUS", { rowSpan: 2 }),
    th("GAJI KASAR", { rowSpan: 2 }),
    th("EPF", { colSpan: 2 }),
    {},
    th("TOTAL EPF", { rowSpan: 2 }),
    th("SOCSO", { colSpan: 2 }),
    {},
    th("TOTAL SOCSO", { rowSpan: 2 }),
    th("SIP", { colSpan: 2 }),
    {},
    th("TOTAL SIP", { rowSpan: 2 }),
    th("PCB", { rowSpan: 2 }),
    th("JUMLAH GAJI", { rowSpan: 2 }),
    th("JUMLAH DIGENAPKAN", { rowSpan: 2 }),
    th("GAJI BERSIH", { rowSpan: 2 }),
  ];
  const headerRow2: TableCell[] = [
    {}, {}, {}, {},
    th("M"), th("P"),
    {},
    th("M"), th("P"),
    {},
    th("M"), th("P"),
    {}, {}, {}, {}, {},
  ];

  const dataRow = (label: string, r: PayrollSummaryRow, bold = false): TableCell[] => [
    { text: label, style: bold ? "tdBold" : "tdLabel", alignment: "left" },
    money(r.gaji, bold),
    money(r.bonus, bold),
    money(r.gaji_kasar, bold),
    money(r.epf_m, bold),
    money(r.epf_p, bold),
    money(r.epf_total, bold),
    money(r.socso_m, bold),
    money(r.socso_p, bold),
    money(r.socso_total, bold),
    money(r.sip_m, bold),
    money(r.sip_p, bold),
    money(r.sip_total, bold),
    money(r.pcb, bold),
    money(r.jumlah_gaji, bold),
    money(r.digenapkan, bold),
    money(r.gaji_bersih, bold),
  ];

  const body: TableCell[][] = [
    headerRow1,
    headerRow2,
    dataRow("DIRECTOR", data.director),
    dataRow("WORKERS", data.workers),
    dataRow("TOTAL", data.total, true),
  ];

  const colWidths = [
    52, // label
    "*", "*", "*", // gaji, bonus, gaji kasar
    "*", "*", "*", // epf m, p, total
    "*", "*", "*", // socso m, p, total
    "*", "*", "*", // sip m, p, total
    "*", // pcb
    "*", "*", "*", // jumlah gaji, digenapkan, gaji bersih
  ];

  const letterhead: Content = {
    columns: [
      ...(logoDataUrl
        ? [{ image: logoDataUrl, width: 42, height: 42, margin: [0, 0, 10, 0] as [number, number, number, number] }]
        : []),
      {
        width: "*",
        stack: [
          { text: TIENHOCK_INFO.name, style: "companyName" },
          { text: `(${TIENHOCK_INFO.reg_no})`, style: "companyDetail" },
          { text: TIENHOCK_INFO.address_pdf, style: "companyDetail" },
        ],
      },
      {
        width: "auto",
        stack: [
          { text: "PAYROLL SUMMARY", style: "reportTitle", alignment: "right" },
          { text: data.periodLabel, style: "reportSubtitle", alignment: "right" },
        ],
      },
    ],
    columnGap: 8,
    margin: [0, 0, 0, 10],
  };

  // Bottom-right reconciliation box: JV references, per-voucher totals, grand total.
  const jvBox: Content = {
    columns: [
      { width: "*", text: "" },
      {
        width: "auto",
        table: {
          body: [
            [
              { text: data.jvdr_ref, style: "jvRef" },
              { text: "JV-DIRECTOR", style: "jvRef" },
              { text: fmt(data.jvdr_total), style: "jvVal", alignment: "right" },
            ],
            [
              { text: data.jvsl_ref, style: "jvRef" },
              { text: "JV-WORKERS", style: "jvRef" },
              { text: fmt(data.jvsl_total), style: "jvVal", alignment: "right" },
            ],
            [
              { text: "", border: [false, false, false, false] },
              { text: "GRAND TOTAL", style: "jvTotalLabel", alignment: "right" },
              { text: fmt(data.grand_total), style: "jvTotalVal", alignment: "right" },
            ],
          ],
        },
        layout: {
          hLineWidth: (i: number) => (i === 2 || i === 3 ? 1 : 0),
          vLineWidth: () => 0,
          hLineColor: () => colors.borderDark,
          paddingTop: () => 2,
          paddingBottom: () => 2,
          paddingLeft: () => 8,
          paddingRight: () => 4,
        },
      },
    ],
    margin: [0, 14, 0, 0],
  };

  const generatedAt = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const generatedLabel = `Generated on ${pad(generatedAt.getDate())}/${pad(
    generatedAt.getMonth() + 1
  )}/${generatedAt.getFullYear()} ${pad(generatedAt.getHours())}:${pad(generatedAt.getMinutes())}`;

  return {
    info: { title: `Payroll Summary ${data.periodLabel}`, author: TIENHOCK_INFO.name },
    pageSize: "A4",
    pageOrientation: "landscape",
    pageMargins: [18, 20, 18, 28],
    defaultStyle: { fontSize: 7.5, lineHeight: 1.1, color: colors.textPrimary },
    footer: (currentPage: number, pageCount: number) => ({
      columns: [
        { text: generatedLabel, style: "footerText", alignment: "left" },
        { text: `Page ${currentPage} of ${pageCount}`, style: "footerText", alignment: "right" },
      ],
      margin: [18, 8, 18, 0],
    }),
    content: [
      letterhead,
      {
        table: { headerRows: 2, widths: colWidths as any, body },
        layout: {
          hLineWidth: (i: number, node: any) => {
            const last = node.table.body.length;
            if (i === 0 || i === 2 || i === last - 1 || i === last) return 1;
            return 0.5;
          },
          hLineColor: (i: number, node: any) => {
            const last = node.table.body.length;
            return i === 0 || i === 2 || i === last - 1 || i === last
              ? colors.borderDark
              : colors.borderLight;
          },
          vLineWidth: () => 0.5,
          vLineColor: () => colors.borderLight,
          fillColor: (rowIndex: number, node: any) => {
            const last = node.table.body.length;
            if (rowIndex < 2) return colors.fillLight; // header
            if (rowIndex === last - 1) return colors.fillTotals; // TOTAL row
            return null;
          },
          paddingTop: () => 3,
          paddingBottom: () => 3,
          paddingLeft: () => 3,
          paddingRight: () => 3,
        },
      },
      jvBox,
    ],
    styles: {
      companyName: { fontSize: 12, bold: true, color: colors.textPrimary },
      companyDetail: { fontSize: 7.5, color: colors.textSecondary, lineHeight: 1.25 },
      reportTitle: { fontSize: 13, bold: true, color: colors.textPrimary },
      reportSubtitle: { fontSize: 9, color: colors.textSecondary },
      th: { fontSize: 6.5, bold: true, color: colors.textSecondary },
      td: { fontSize: 7 },
      tdLabel: { fontSize: 7.5, bold: true, color: colors.textSecondary },
      tdBold: { fontSize: 7.5, bold: true },
      jvRef: { fontSize: 8, color: colors.textSecondary },
      jvVal: { fontSize: 8.5, bold: true, color: colors.textPrimary },
      jvTotalLabel: { fontSize: 8.5, bold: true, color: colors.textSecondary },
      jvTotalVal: { fontSize: 9.5, bold: true, color: colors.textPrimary },
      footerText: { fontSize: 7, color: colors.textMuted },
    },
  };
};

export const generatePayrollSummaryPDF = async (
  data: PayrollSummaryPDFData
): Promise<void> => {
  const logoDataUrl = await loadLogoDataUrl();
  const docDefinition = buildDocDefinition(data, logoDataUrl);
  const pdfBlob: Blob = await new Promise<Blob>((resolve) => {
    pdfMake.createPdf(docDefinition).getBlob(resolve);
  });
  printPdfBlob(pdfBlob, `payroll summary ${data.periodLabel}`);
};
