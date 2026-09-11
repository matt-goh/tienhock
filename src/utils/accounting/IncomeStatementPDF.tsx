import React from "react";
import { pdf } from "@react-pdf/renderer";
import { TIENHOCK_INFO } from "../invoice/einvoice/companyInfo";
import { printPdfBlob } from "../pdfPrintFallback";
import { CoreStatementPDFDocument } from "./CoreStatementPDF";
import { type IncomeStatementData, getIncomeStatementLayoutRows } from "./coreStatementLayout";

export const generateIncomeStatementPDF = async (data: IncomeStatementData): Promise<void> => {
  const documentTitle: string = `Detailed Income Statement ${data.period.start_date} to ${data.period.end_date} - ${TIENHOCK_INFO.name}`;
  const blob: Blob = await pdf(
    <CoreStatementPDFDocument
      title="DETAIL INCOME STATEMENT"
      period={`For the period ${data.period.start_date} to ${data.period.end_date}`}
      documentTitle={documentTitle}
      rows={getIncomeStatementLayoutRows(data)}
    />
  ).toBlob();
  printPdfBlob(blob, documentTitle);
};
