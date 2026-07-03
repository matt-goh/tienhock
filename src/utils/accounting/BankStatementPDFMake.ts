// src/utils/accounting/BankStatementPDFMake.ts
// Bank statement from journal — PDF export (pdfMake). Mirrors the legacy report
// layout: DATE · JOURNAL · PARTICULARS · CHEQUE · DEBIT · CREDIT · BALANCE (DR/CR),
// opening balance brought forward, running balance per row, closing totals.
// Styled after the shared report design language (see DebtorsReportPDF): slate
// palette, company letterhead with logo, uppercase headers, hairline row rules.
import pdfMake from "pdfmake/build/pdfmake";
import * as pdfFonts from "pdfmake/build/vfs_fonts";
import { TDocumentDefinitions, TableCell, Content } from "pdfmake/interfaces";
import TienHockLogo from "../tienhock.png";
import { TIENHOCK_INFO } from "../invoice/einvoice/companyInfo";
import { printPdfFrameWithFallback } from "../pdfPrintFallback";

// Initialize pdfmake with the bundled fonts (same pattern as PaySlipPDFMake)
(pdfMake as any).vfs = (pdfFonts as any).pdfMake?.vfs || pdfFonts;

export interface BankStatementTransaction {
  line_id: number;
  journal_entry_id: number;
  reference_no: string;
  entry_type: string;
  entry_date: string; // yyyy-MM-dd
  cheque_no: string | null;
  particulars: string;
  debit: number;
  credit: number;
  balance: number;
}

export interface BankStatementData {
  account: {
    code: string;
    description: string;
    ledger_type: string;
  };
  period: {
    year: number;
    month: number;
    start_date: string;
    end_date: string;
  };
  opening_balance: number;
  opening_source?:
    | { type: "anchored"; as_of_date: string; amount: number }
    | { type: "derived" };
  transactions: BankStatementTransaction[];
  closing_balance: number;
  totals: {
    debit: number;
    credit: number;
    count: number;
  };
}

// Shared report palette (matches DebtorsReportPDF / InvoicePDF slate scheme)
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

// Balance shown with DR (debit / positive) or CR (credit / negative) suffix,
// matching the legacy report convention for a bank asset account.
const fmtBalance = (n: number): string =>
  `${fmt(Math.abs(n))} ${n >= 0 ? "DR" : "CR"}`;

// yyyy-MM-dd -> dd/MM/yyyy (no Date round-trip, avoids TZ shift)
const fmtDate = (iso: string): string => {
  const parts = iso.split("-");
  if (parts.length !== 3) return iso;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
};

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

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
    console.warn("Bank statement PDF: could not load logo", err);
    cachedLogoDataUrl = null;
  }
  return cachedLogoDataUrl;
};

const buildDocDefinition = (
  data: BankStatementData,
  logoDataUrl: string | null
): TDocumentDefinitions => {
  const periodLabel = `${MONTH_NAMES[data.period.month - 1]} ${data.period.year}`;

  const headerRow: TableCell[] = [
    { text: "DATE", style: "th" },
    { text: "JOURNAL", style: "th" },
    { text: "PARTICULARS", style: "th" },
    { text: "CHEQUE", style: "th" },
    { text: "DEBIT (RM)", style: "th", alignment: "right" },
    { text: "CREDIT (RM)", style: "th", alignment: "right" },
    { text: "BALANCE (RM)", style: "th", alignment: "right" },
  ];

  const openingRow: TableCell[] = [
    { text: "", style: "td" },
    { text: "", style: "td" },
    { text: "BALANCE BROUGHT FORWARD", style: "tdBold", colSpan: 2 },
    {},
    { text: "", style: "td" },
    { text: "", style: "td" },
    { text: fmtBalance(data.opening_balance), style: "tdBold", alignment: "right" },
  ];

  const txRows: TableCell[][] =
    data.transactions.length > 0
      ? data.transactions.map((t) => [
          { text: fmtDate(t.entry_date), style: "td" },
          { text: t.reference_no || "", style: "td" },
          { text: t.particulars || "", style: "td" },
          { text: t.cheque_no || "", style: "td" },
          { text: t.debit > 0 ? fmt(t.debit) : "", style: "td", alignment: "right" },
          { text: t.credit > 0 ? fmt(t.credit) : "", style: "td", alignment: "right" },
          { text: fmtBalance(t.balance), style: "td", alignment: "right" },
        ])
      : [
          [
            {
              text: "No transactions in this period",
              style: "tdMuted",
              colSpan: 7,
              alignment: "center",
              margin: [0, 6, 0, 6] as [number, number, number, number],
            },
            {}, {}, {}, {}, {}, {},
          ],
        ];

  const totalsRow: TableCell[] = [
    {
      text: `TOTAL — ${data.totals.count} TRANSACTION${data.totals.count === 1 ? "" : "S"}`,
      style: "tdBold",
      colSpan: 4,
    },
    {},
    {},
    {},
    { text: fmt(data.totals.debit), style: "tdBold", alignment: "right" },
    { text: fmt(data.totals.credit), style: "tdBold", alignment: "right" },
    { text: fmtBalance(data.closing_balance), style: "tdBold", alignment: "right" },
  ];

  const tableBody: TableCell[][] = [headerRow, openingRow, ...txRows, totalsRow];

  // Letterhead: logo + company block on the left, report title block on the right
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
          { text: "BANK STATEMENT", style: "reportTitle", alignment: "right" },
          {
            text: `${data.account.code} — ${data.account.description}`,
            style: "reportSubtitle",
            alignment: "right",
          },
          { text: periodLabel, style: "reportSubtitle", alignment: "right" },
          {
            text: `${fmtDate(data.period.start_date)} to ${fmtDate(data.period.end_date)}`,
            style: "reportMeta",
            alignment: "right",
          },
        ],
      },
    ],
    columnGap: 8,
    margin: [0, 0, 0, 8],
  };

  // Summary strip mirroring the page's Opening / Movement / Closing cards
  const summaryCell = (label: string, value: string, note?: string): TableCell => ({
    stack: [
      { text: label, style: "summaryLabel" },
      { text: value, style: "summaryValue" },
      ...(note ? [{ text: note, style: "summaryNote" }] : []),
    ],
    fillColor: colors.fillLight,
    margin: [8, 6, 8, 6] as [number, number, number, number],
  });

  const openingNote =
    data.opening_source?.type === "anchored"
      ? `Anchored as of ${fmtDate(data.opening_source.as_of_date)}`
      : "Derived from prior postings";

  const summaryStrip: Content = {
    table: {
      widths: ["*", "*", "*", "*"],
      body: [
        [
          summaryCell("OPENING BALANCE", fmtBalance(data.opening_balance), openingNote),
          summaryCell("TOTAL DEBITS", fmt(data.totals.debit)),
          summaryCell("TOTAL CREDITS", fmt(data.totals.credit)),
          summaryCell("CLOSING BALANCE", fmtBalance(data.closing_balance)),
        ],
      ],
    },
    layout: {
      hLineWidth: () => 0.5,
      vLineWidth: () => 0.5,
      hLineColor: () => colors.borderLight,
      vLineColor: () => colors.borderLight,
      paddingTop: () => 0,
      paddingBottom: () => 0,
      paddingLeft: () => 0,
      paddingRight: () => 0,
    },
    margin: [0, 0, 0, 10],
  };

  const generatedAt = new Date();
  const generatedLabel = `Generated on ${String(generatedAt.getDate()).padStart(2, "0")}/${String(
    generatedAt.getMonth() + 1
  ).padStart(2, "0")}/${generatedAt.getFullYear()} ${String(generatedAt.getHours()).padStart(
    2,
    "0"
  )}:${String(generatedAt.getMinutes()).padStart(2, "0")}`;

  return {
    info: {
      title: `Bank Statement ${data.account.code} ${periodLabel}`,
      author: TIENHOCK_INFO.name,
    },
    pageSize: "A4",
    pageOrientation: "portrait",
    pageMargins: [18, 28, 18, 40],
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
          { type: "line", x1: 0, y1: 0, x2: 559, y2: 0, lineWidth: 1.2, lineColor: colors.borderDark },
        ],
        margin: [0, 0, 0, 10],
      },
      summaryStrip,
      {
        table: {
          headerRows: 1,
          widths: [44, 72, "*", 62, 56, 56, 74],
          body: tableBody,
        },
        layout: {
          hLineWidth: (i: number, node: any) => {
            const last = node.table.body.length;
            // Dark rules around the header and totals band, hairlines between rows
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
            if (rowIndex === last - 1) return colors.fillTotals; // totals row
            if (rowIndex === 1) return colors.fillLight; // opening balance row
            if (rowIndex > 1 && rowIndex % 2 === 1) return colors.fillLight; // zebra
            return null;
          },
          paddingTop: () => 3,
          paddingBottom: () => 3,
          paddingLeft: () => 4,
          paddingRight: () => 4,
        },
      },
    ],
    styles: {
      companyName: { fontSize: 13, bold: true, color: colors.textPrimary },
      companyDetail: { fontSize: 7.5, color: colors.textSecondary, lineHeight: 1.25 },
      reportTitle: { fontSize: 13, bold: true, color: colors.textPrimary },
      reportSubtitle: { fontSize: 8.5, color: colors.textSecondary, lineHeight: 1.3 },
      reportMeta: { fontSize: 7.5, color: colors.textMuted },
      summaryLabel: { fontSize: 6.5, bold: true, color: colors.textMuted },
      summaryValue: { fontSize: 10, bold: true, color: colors.textPrimary, margin: [0, 2, 0, 0] },
      summaryNote: { fontSize: 6.5, color: colors.textMuted, margin: [0, 1, 0, 0] },
      th: { fontSize: 7, bold: true, color: colors.textSecondary },
      td: { fontSize: 7.5 },
      tdBold: { fontSize: 7.5, bold: true },
      tdMuted: { fontSize: 7.5, color: colors.textMuted, italics: true },
      footerText: { fontSize: 7, color: colors.textMuted },
    },
  };
};

// Opens the browser print dialog for the statement via a hidden iframe blob.
// If the iframe print is blocked (common on mobile browsers), the shared
// fallback opens the blob URL in a new tab instead.
export const generateBankStatementPDF = async (
  data: BankStatementData
): Promise<void> => {
  const logoDataUrl = await loadLogoDataUrl();
  const docDefinition = buildDocDefinition(data, logoDataUrl);

  const pdfBlob: Blob = await new Promise<Blob>((resolve) => {
    pdfMake.createPdf(docDefinition).getBlob(resolve);
  });

  const url = URL.createObjectURL(pdfBlob);
  const printFrame = document.createElement("iframe");
  printFrame.style.display = "none";
  document.body.appendChild(printFrame);

  printFrame.onload = () => {
    if (printFrame.contentWindow) {
      printPdfFrameWithFallback(printFrame, url, {
        logLabel: "bank statement PDF",
      });
      const cleanup = () => {
        if (document.body.contains(printFrame)) {
          document.body.removeChild(printFrame);
        }
        URL.revokeObjectURL(url);
        window.removeEventListener("focus", cleanup);
      };
      window.addEventListener("focus", cleanup, { once: true });
    }
  };
  printFrame.src = url;
};
