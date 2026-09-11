import React from "react";
import { pdf } from "@react-pdf/renderer";
import { TIENHOCK_INFO } from "../invoice/einvoice/companyInfo";
import { printPdfBlob } from "../pdfPrintFallback";
import { CoreStatementPDFDocument } from "./CoreStatementPDF";
import { type BalanceSheetData, getBalanceSheetLayoutRows, formatStatementAmount } from "./coreStatementLayout";

export const generateBalanceSheetPDF = async (data: BalanceSheetData): Promise<void> => {
  const documentTitle: string = `Balance Sheet as at ${data.period.as_of_date} - ${TIENHOCK_INFO.name}`;
  const blob: Blob = await pdf(
    <CoreStatementPDFDocument
      title="BALANCE SHEET"
      period={`As at ${data.period.as_of_date}`}
      documentTitle={documentTitle}
      rows={getBalanceSheetLayoutRows(data)}
      warning={data.totals.is_balanced ? undefined : `BALANCE SHEET IS NOT BALANCED (Difference: RM ${formatStatementAmount(Math.abs(data.totals.total_assets - data.totals.total_liabilities_equity))})`}
    />
  ).toBlob();
  printPdfBlob(blob, documentTitle);
};
