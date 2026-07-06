// src/utils/accounting/JournalVoucherPDFMake.ts
// Journal Voucher print (pdfMake) — the system replacement for the legacy
// "REPORT : JOURNAL VOUCHER" print (JVDR/JVSL payroll vouchers, manual J/C/B
// entries…). Content mirrors the legacy voucher: journal no + posted status +
// date header, ACC/CODE · DESCRIPTION · DEBIT · CREDIT lines, totals, and a
// PARTICULARS footer. Styled after the shared report design language
// (AccountLedgerPDFMake): slate palette, company letterhead with logo.
import pdfMake from "pdfmake/build/pdfmake";
import * as pdfFonts from "pdfmake/build/vfs_fonts";
import { TDocumentDefinitions, TableCell, Content } from "pdfmake/interfaces";
import TienHockLogo from "../tienhock.png";
import { TIENHOCK_INFO } from "../invoice/einvoice/companyInfo";
import { printPdfBlob } from "../pdfPrintFallback";

// Initialize pdfmake with the bundled fonts (same pattern as AccountLedgerPDFMake)
(pdfMake as any).vfs = (pdfFonts as any).pdfMake?.vfs || pdfFonts;

export interface JournalVoucherPDFLine {
  line_number: number;
  account_code: string;
  particulars?: string | null;
  reference?: string | null;
  debit_amount: number;
  credit_amount: number;
}

export interface JournalVoucherPDFData {
  reference_no: string;
  entry_type: string;
  entry_type_name?: string;
  entry_date: string; // ISO string or yyyy-MM-dd
  status: string;
  description?: string | null;
  cheque_no?: string | null;
  lines: JournalVoucherPDFLine[];
  total_debit: number;
  total_credit: number;
  // code -> account description, for the DESCRIPTION fallback when a line has
  // no particulars text
  accountDescriptions: Record<string, string>;
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

const fmt = (n: number): string =>
  new Intl.NumberFormat("en-MY", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);

// Any date value -> dd/MM/yyyy in the LOCAL timezone (a serialized date column
// arrives as UTC midnight-shifted ISO; local components give the stored date)
const fmtDate = (value: string): string => {
  const plain = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (plain) return `${plain[3]}/${plain[2]}/${plain[1]}`;
  const d = new Date(value);
  if (isNaN(d.getTime())) return value;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
};

// pdfMake needs images as data URLs (same cached loader as the other reports)
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
    console.warn("Journal voucher PDF: could not load logo", err);
    cachedLogoDataUrl = null;
  }
  return cachedLogoDataUrl;
};

const buildDocDefinition = (
  data: JournalVoucherPDFData,
  logoDataUrl: string | null
): TDocumentDefinitions => {
  const statusLabel =
    data.status === "cancelled" ? "CANCELLED" : "POSTED";

  const headerRow: TableCell[] = [
    { text: "ACC/CODE", style: "th" },
    { text: "DESCRIPTION", style: "th" },
    { text: "DEBIT (RM)", style: "th", alignment: "right" },
    { text: "CREDIT (RM)", style: "th", alignment: "right" },
  ];

  const lineRows: TableCell[][] =
    data.lines.length > 0
      ? data.lines.map((line) => [
          { text: line.account_code, style: "tdMono" },
          {
            text:
              line.particulars ||
              data.accountDescriptions[line.account_code] ||
              "",
            style: "td",
          },
          {
            text: line.debit_amount > 0 ? fmt(line.debit_amount) : "",
            style: "tdMono",
            alignment: "right",
          },
          {
            text: line.credit_amount > 0 ? fmt(line.credit_amount) : "",
            style: "tdMono",
            alignment: "right",
          },
        ])
      : [
          [
            {
              text: "No line items",
              style: "tdMuted",
              colSpan: 4,
              alignment: "center",
              margin: [0, 6, 0, 6] as [number, number, number, number],
            },
            {}, {}, {},
          ],
        ];

  const totalsRow: TableCell[] = [
    {
      text: `TOTAL — ${data.lines.length} LINE${data.lines.length === 1 ? "" : "S"}`,
      style: "tdBold",
      colSpan: 2,
    },
    {},
    { text: fmt(data.total_debit), style: "tdBoldMono", alignment: "right" },
    { text: fmt(data.total_credit), style: "tdBoldMono", alignment: "right" },
  ];

  const tableBody: TableCell[][] = [headerRow, ...lineRows, totalsRow];

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
          {
            text: `Tel: ${TIENHOCK_INFO.phone}  ·  Email: ${TIENHOCK_INFO.email}`,
            style: "companyDetail",
          },
        ],
      },
      {
        width: "auto",
        stack: [
          { text: "JOURNAL VOUCHER", style: "reportTitle", alignment: "right" },
          {
            text: `${data.reference_no}  (${statusLabel})`,
            style: "reportSubtitle",
            alignment: "right",
          },
          {
            text: data.entry_type_name || data.entry_type,
            style: "reportSubtitle",
            alignment: "right",
          },
          {
            text: `Date: ${fmtDate(data.entry_date)}${data.cheque_no ? `  ·  Cheque: ${data.cheque_no}` : ""}`,
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
  const pad = (n: number) => String(n).padStart(2, "0");
  const generatedLabel = `Generated on ${pad(generatedAt.getDate())}/${pad(
    generatedAt.getMonth() + 1
  )}/${generatedAt.getFullYear()} ${pad(generatedAt.getHours())}:${pad(generatedAt.getMinutes())}`;

  return {
    info: {
      title: `Journal Voucher ${data.reference_no}`,
      author: TIENHOCK_INFO.name,
    },
    pageSize: "A4",
    pageOrientation: "portrait",
    pageMargins: [18, 18, 18, 30],
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
      { ...letterhead, margin: [0, 0, 0, 4] as [number, number, number, number] },
      {
        table: {
          headerRows: 1,
          widths: [70, "*", 70, 70],
          body: tableBody,
        },
        layout: {
          hLineWidth: (i: number, node: any) => {
            const last = node.table.body.length;
            if (i === 0 || i === 1 || i === last - 1 || i === last) return 1;
            return 0.5;
          },
          hLineColor: (i: number, node: any) => {
            const last = node.table.body.length;
            if (i === 0 || i === 1 || i === last - 1 || i === last)
              return colors.borderDark;
            return colors.borderLight;
          },
          vLineWidth: () => 0,
          fillColor: (rowIndex: number, node: any) => {
            const last = node.table.body.length;
            if (rowIndex === last - 1) return colors.fillTotals;
            if (rowIndex > 0 && rowIndex % 2 === 0) return colors.fillLight;
            return null;
          },
          paddingTop: () => 3,
          paddingBottom: () => 3,
          paddingLeft: () => 4,
          paddingRight: () => 4,
        },
      },
      ...(data.description
        ? [
            {
              text: [
                { text: "PARTICULARS : ", style: "particularsLabel" },
                { text: data.description, style: "particularsText" },
              ],
              margin: [0, 4, 0, 0] as [number, number, number, number],
            } as Content,
          ]
        : []),
    ],
    styles: {
      companyName: { fontSize: 13, bold: true, color: colors.textPrimary },
      companyDetail: { fontSize: 7.5, color: colors.textSecondary, lineHeight: 1.25 },
      reportTitle: { fontSize: 13, bold: true, color: colors.textPrimary },
      reportSubtitle: { fontSize: 8.5, color: colors.textSecondary, lineHeight: 1.3 },
      reportMeta: { fontSize: 7.5, color: colors.textMuted },
      th: { fontSize: 7, bold: true, color: colors.textSecondary },
      td: { fontSize: 7.5 },
      tdMono: { fontSize: 7.5 },
      tdBold: { fontSize: 7.5, bold: true },
      tdBoldMono: { fontSize: 7.5, bold: true },
      tdMuted: { fontSize: 7.5, color: colors.textMuted, italics: true },
      particularsLabel: { fontSize: 8, bold: true, color: colors.textSecondary },
      particularsText: { fontSize: 8, color: colors.textPrimary },
      footerText: { fontSize: 7, color: colors.textMuted },
    },
  };
};

// Builds the voucher PDF and opens the print dialog (with the shared mobile
// new-tab fallback).
export const generateJournalVoucherPDF = async (
  data: JournalVoucherPDFData
): Promise<void> => {
  const logoDataUrl = await loadLogoDataUrl();
  const docDefinition = buildDocDefinition(data, logoDataUrl);

  const pdfBlob: Blob = await new Promise<Blob>((resolve) => {
    pdfMake.createPdf(docDefinition).getBlob(resolve);
  });

  printPdfBlob(pdfBlob, `journal voucher ${data.reference_no}`);
};
