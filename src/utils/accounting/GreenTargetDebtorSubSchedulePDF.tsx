import React from "react";
import {
  Document,
  Page,
  StyleSheet,
  Text,
  View,
  pdf,
} from "@react-pdf/renderer";
import type {
  GreenTargetDebtorSubScheduleResponse,
  GreenTargetDebtorSubScheduleRow,
} from "../../types/greenTargetDebtorSubSchedule";
import { GREENTARGET_INFO } from "../invoice/einvoice/companyInfo";
import { printPdfFrameWithFallback } from "../pdfPrintFallback";
import {
  getPaperSizePreference,
  getReactPdfPageSize,
  type PdfPaperSize,
} from "../pdf/paperSize";

const ROWS_PER_PAGE = 44;

const styles = StyleSheet.create({
  page: {
    paddingTop: 24,
    paddingBottom: 30,
    paddingHorizontal: 28,
    fontFamily: "Courier",
    fontSize: 8,
    color: "#000000",
  },
  header: {
    marginBottom: 8,
  },
  companyName: {
    fontFamily: "Courier-Bold",
    fontSize: 10,
    textAlign: "center",
    textDecoration: "underline",
  },
  title: {
    marginTop: 3,
    fontFamily: "Courier-Bold",
    fontSize: 9,
    textAlign: "center",
    textDecoration: "underline",
  },
  reportMeta: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 9,
    fontSize: 7.5,
  },
  doubleLine: {
    height: 3,
    marginVertical: 3,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: "#000000",
  },
  singleLine: {
    marginVertical: 3,
    borderBottomWidth: 1,
    borderColor: "#000000",
  },
  tableHeader: {
    flexDirection: "row",
    alignItems: "flex-end",
    minHeight: 28,
    paddingVertical: 3,
    fontFamily: "Courier-Bold",
    fontSize: 7.2,
  },
  tableRow: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 11,
    paddingVertical: 1.5,
  },
  totalRow: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 18,
    paddingVertical: 4,
    fontFamily: "Courier-Bold",
  },
  accountColumn: {
    width: "20%",
    paddingRight: 4,
  },
  particularColumn: {
    width: "36%",
    paddingRight: 6,
  },
  amountColumn: {
    width: "14.6667%",
    paddingLeft: 3,
    textAlign: "right",
  },
  pageNumber: {
    position: "absolute",
    bottom: 16,
    left: 0,
    right: 0,
    textAlign: "center",
    fontSize: 7,
  },
});

const formatAmount = (amount: number): string => {
  const normalizedAmount: number = Number(amount || 0);
  if (Math.abs(normalizedAmount) <= 0.005) return ".00";
  const absoluteAmount: string = Math.abs(normalizedAmount).toLocaleString(
    "en-MY",
    {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }
  );
  return normalizedAmount < 0 ? `-${absoluteAmount}` : absoluteAmount;
};

const getMovementLabel = (year: number, month: number): string => {
  return new Date(year, month - 1, 1)
    .toLocaleDateString("en-MY", {
      month: "short",
      year: "numeric",
    })
    .toUpperCase();
};

const chunkRows = (
  rows: GreenTargetDebtorSubScheduleRow[]
): GreenTargetDebtorSubScheduleRow[][] => {
  if (rows.length === 0) return [[]];

  const pages: GreenTargetDebtorSubScheduleRow[][] = [];
  for (let index: number = 0; index < rows.length; index += ROWS_PER_PAGE) {
    pages.push(rows.slice(index, index + ROWS_PER_PAGE));
  }
  return pages;
};

interface GreenTargetDebtorSubSchedulePDFProps {
  data: GreenTargetDebtorSubScheduleResponse;
  paperSize?: PdfPaperSize;
}

const GreenTargetDebtorSubSchedulePDF: React.FC<
  GreenTargetDebtorSubSchedulePDFProps
> = ({ data, paperSize }) => {
  const effectivePaperSize = paperSize ?? getPaperSizePreference();
  const pages: GreenTargetDebtorSubScheduleRow[][] = chunkRows(data.rows);
  const currentMonthLabel: string = getMovementLabel(
    data.statement_year,
    data.statement_month
  );
  const previousMonthLabel: string = getMovementLabel(
    data.statement_month === 1
      ? data.statement_year - 1
      : data.statement_year,
    data.statement_month === 1 ? 12 : data.statement_month - 1
  );

  return (
    <Document
      title={`CD_SD Trade Debtor Sub-Schedule ${data.statement_date}`}
    >
      {pages.map(
        (
          pageRows: GreenTargetDebtorSubScheduleRow[],
          pageIndex: number
        ) => (
          <Page key={pageIndex} size={getReactPdfPageSize(effectivePaperSize)} style={styles.page}>
            <View style={styles.header}>
              <Text style={styles.companyName}>{GREENTARGET_INFO.name}</Text>
              <Text style={styles.title}>
                CD/SD TRADE DEBTOR SUB-SCHEDULE AS AT {data.statement_date}
              </Text>
              <View style={styles.reportMeta}>
                <Text>A/C CODE: CD_SD</Text>
                <Text>
                  PAGE {pageIndex + 1} OF {pages.length}
                </Text>
              </View>
            </View>

            <View style={styles.doubleLine} />
            <View style={styles.tableHeader} fixed>
              <Text style={styles.accountColumn}>ACCOUNT NO.</Text>
              <Text style={styles.particularColumn}>PARTICULARS</Text>
              <Text style={styles.amountColumn}>
                BALANCE AS AT{"\n"}{data.statement_date}
              </Text>
              <Text style={styles.amountColumn}>
                MOVEMENT{"\n"}{currentMonthLabel}
              </Text>
              <Text style={styles.amountColumn}>
                MOVEMENT{"\n"}{previousMonthLabel}
              </Text>
            </View>
            <View style={styles.doubleLine} />

            {pageRows.map(
              (row: GreenTargetDebtorSubScheduleRow, rowIndex: number) => (
                <View
                  key={`${row.account_no}-${rowIndex}`}
                  style={styles.tableRow}
                  wrap={false}
                >
                  <Text style={styles.accountColumn}>{row.account_no}</Text>
                  <Text style={styles.particularColumn}>{row.particular}</Text>
                  <Text style={styles.amountColumn}>
                    {formatAmount(row.closing_balance)}
                  </Text>
                  <Text style={styles.amountColumn}>
                    {formatAmount(row.current_month)}
                  </Text>
                  <Text style={styles.amountColumn}>
                    {formatAmount(row.previous_month)}
                  </Text>
                </View>
              )
            )}

            {pageIndex === pages.length - 1 && (
              <>
                <View style={styles.singleLine} />
                <View style={styles.totalRow} wrap={false}>
                  <Text style={styles.accountColumn} />
                  <Text style={styles.particularColumn}>TOTAL BALANCE TO DATE</Text>
                  <Text style={styles.amountColumn}>
                    {formatAmount(data.totals.closing_balance)}
                  </Text>
                  <Text style={styles.amountColumn}>
                    {formatAmount(data.totals.current_month)}
                  </Text>
                  <Text style={styles.amountColumn}>
                    {formatAmount(data.totals.previous_month)}
                  </Text>
                </View>
                <View style={styles.doubleLine} />
              </>
            )}

            <Text style={styles.pageNumber} fixed>
              CD_SD DEBTOR SUB-SCHEDULE
            </Text>
          </Page>
        )
      )}
    </Document>
  );
};

export const printGreenTargetDebtorSubSchedulePDF = async (
  data: GreenTargetDebtorSubScheduleResponse,
  paperSize?: PdfPaperSize
): Promise<void> => {
  const pdfDocument = <GreenTargetDebtorSubSchedulePDF data={data} paperSize={paperSize} />;
  const pdfBlob: Blob = await pdf(pdfDocument).toBlob();
  const pdfUrl: string = URL.createObjectURL(pdfBlob);
  const printFrame: HTMLIFrameElement = document.createElement("iframe");
  printFrame.style.display = "none";
  document.body.appendChild(printFrame);

  printFrame.onload = (): void => {
    if (!printFrame.contentWindow) return;

    printPdfFrameWithFallback(printFrame, pdfUrl, {
      logLabel: "Green Target CD/SD debtor sub-schedule PDF",
    });

    const cleanup = (): void => {
      if (document.body.contains(printFrame)) {
        document.body.removeChild(printFrame);
      }
      URL.revokeObjectURL(pdfUrl);
      window.removeEventListener("focus", cleanup);
    };
    window.addEventListener("focus", cleanup, { once: true });
  };

  printFrame.src = pdfUrl;
};

export default GreenTargetDebtorSubSchedulePDF;
