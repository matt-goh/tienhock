// src/utils/accounting/BankStatementPDFMake.ts
// Bank statement from journal — PDF export (pdfMake). Mirrors the legacy report
// layout: DATE · JOURNAL · PARTICULARS · CHEQUE · DEBIT · CREDIT · BALANCE (DR/CR),
// opening balance brought forward, running balance per row, closing totals.
import pdfMake from "pdfmake/build/pdfmake";
import * as pdfFonts from "pdfmake/build/vfs_fonts";
import { TDocumentDefinitions, TableCell } from "pdfmake/interfaces";

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

const COMPANY_NAME = "TIEN HOCK FOOD INDUSTRIES SDN BHD (953309-T)";

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

export const generateBankStatementPDF = (data: BankStatementData): void => {
  const headerRow: TableCell[] = [
    { text: "DATE", style: "th" },
    { text: "JOURNAL", style: "th" },
    { text: "PARTICULARS", style: "th" },
    { text: "CHEQUE", style: "th" },
    { text: "DEBIT", style: "th", alignment: "right" },
    { text: "CREDIT", style: "th", alignment: "right" },
    { text: "BALANCE", style: "th", alignment: "right" },
  ];

  const openingRow: TableCell[] = [
    { text: "", style: "td" },
    { text: "", style: "td" },
    { text: "BALANCE BROUGHT FORWARD", style: "tdBold" },
    { text: "", style: "td" },
    { text: "", style: "td" },
    { text: "", style: "td" },
    { text: fmtBalance(data.opening_balance), style: "tdBold", alignment: "right" },
  ];

  const txRows: TableCell[][] = data.transactions.map((t) => [
    { text: fmtDate(t.entry_date), style: "td" },
    { text: t.reference_no || "", style: "td" },
    { text: t.particulars || "", style: "td" },
    { text: t.cheque_no || "", style: "td" },
    { text: t.debit > 0 ? fmt(t.debit) : "", style: "td", alignment: "right" },
    { text: t.credit > 0 ? fmt(t.credit) : "", style: "td", alignment: "right" },
    { text: fmtBalance(t.balance), style: "td", alignment: "right" },
  ]);

  const totalsRow: TableCell[] = [
    { text: "", style: "tdBold" },
    { text: "", style: "tdBold" },
    { text: `TOTAL (${data.totals.count} transactions)`, style: "tdBold" },
    { text: "", style: "tdBold" },
    { text: fmt(data.totals.debit), style: "tdBold", alignment: "right" },
    { text: fmt(data.totals.credit), style: "tdBold", alignment: "right" },
    { text: fmtBalance(data.closing_balance), style: "tdBold", alignment: "right" },
  ];

  const docDefinition: TDocumentDefinitions = {
    pageSize: "A4",
    pageOrientation: "landscape",
    pageMargins: [24, 28, 24, 36],
    defaultStyle: { fontSize: 8, lineHeight: 1.15 },
    footer: (currentPage: number, pageCount: number) => ({
      text: `Page ${currentPage} of ${pageCount}`,
      alignment: "right",
      fontSize: 7,
      margin: [0, 8, 24, 0],
      color: "#666666",
    }),
    content: [
      { text: COMPANY_NAME, style: "companyName", alignment: "center" },
      {
        text: "BANK STATEMENT FROM JOURNAL",
        style: "reportTitle",
        alignment: "center",
        margin: [0, 2, 0, 6],
      },
      {
        columns: [
          {
            width: "*",
            text: [
              { text: "Account: ", bold: true },
              `${data.account.code} - ${data.account.description}`,
            ],
          },
          {
            width: "auto",
            alignment: "right",
            text: [
              { text: "Period: ", bold: true },
              `${MONTH_NAMES[data.period.month - 1]} ${data.period.year}`,
            ],
          },
        ],
        margin: [0, 0, 0, 8],
      },
      {
        table: {
          headerRows: 1,
          widths: [48, 70, "*", 56, 62, 62, 78],
          body: [headerRow, openingRow, ...txRows, totalsRow],
        },
        layout: {
          hLineWidth: (i: number, node: any) =>
            i === 0 || i === 1 || i === node.table.body.length - 1 || i === node.table.body.length
              ? 0.8
              : 0.3,
          vLineWidth: () => 0.3,
          hLineColor: () => "#999999",
          vLineColor: () => "#cccccc",
          paddingTop: () => 2,
          paddingBottom: () => 2,
          paddingLeft: () => 4,
          paddingRight: () => 4,
        },
      },
    ],
    styles: {
      companyName: { fontSize: 12, bold: true },
      reportTitle: { fontSize: 9, bold: true },
      th: { fontSize: 7.5, bold: true, fillColor: "#eeeeee" },
      td: { fontSize: 7.5 },
      tdBold: { fontSize: 7.5, bold: true, fillColor: "#f5f5f5" },
    },
  };

  const fileName = `BankStatement-${data.account.code}-${data.period.year}-${String(
    data.period.month
  ).padStart(2, "0")}.pdf`;

  pdfMake.createPdf(docDefinition).download(fileName);
};
