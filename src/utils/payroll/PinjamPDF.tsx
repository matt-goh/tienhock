// src/utils/payroll/PinjamPDF.tsx
import {
  pdf,
  Document,
  Page,
  Text,
  View,
  StyleSheet,
} from "@react-pdf/renderer";
import React from "react";
import { getMonthName } from "./payrollUtils";
import {
  printPdfFrameWithFallback,
  type PrintPdfFrameResult,
} from "../pdfPrintFallback";

interface PinjamEmployee {
  employee_id: string;
  employee_name: string;
  midMonthPay: number;
  netPay: number;
  midMonthPinjam: number;
  midMonthPinjamDetails: string[];
  monthlyPinjam: number;
  monthlyPinjamDetails: string[];
  gajiGenap: number;
}

interface PinjamPDFData {
  employees: PinjamEmployee[];
  year: number;
  month: number;
  totalMidMonthPinjam: number;
  totalMonthlyPinjam: number;
}

const styles = StyleSheet.create({
  page: {
    padding: 20,
    fontFamily: "Helvetica",
    fontSize: 9,
    lineHeight: 1.4,
    color: "#1f2937",
  },
  // Row of cards (single-sided cards pack 2 per row to save vertical space)
  cardRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 12,
    alignItems: "flex-start",
  },
  cardSpacer: {
    flex: 1,
  },

  // Employee Card Styles
  employeeCard: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 6,
  },
  employeeHeader: {
    paddingHorizontal: 10,
    paddingTop: 10,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
    borderTopLeftRadius: 6,
    borderTopRightRadius: 6,
  },
  employeeName: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    color: "#1e293b",
    marginBottom: 2,
  },
  employeeId: {
    fontSize: 8,
    color: "#64748b",
  },
  employeeContent: {
    padding: 10,
  },

  // Two Column Layout
  employeeContentColumns: {
    flexDirection: "row",
    gap: 12,
  },
  columnDivider: {
    width: 0.5,
    backgroundColor: "#e5e7eb",
    marginHorizontal: 6,
  },
  payColumn: {
    flex: 1,
  },

  // Pay Section Styles
  paySection: {
    minHeight: 100,
  },
  paySectionTitle: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    marginBottom: 6,
    color: "#374151",
    paddingBottom: 3,
    borderBottomWidth: 0.5,
    borderBottomColor: "#e5e7eb",
  },
  payRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 1.5,
  },
  payLabel: {
    fontSize: 9,
    flex: 2,
    color: "#4b5563",
  },
  payAmount: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    flex: 1,
    textAlign: "right",
    color: "#111827",
  },

  // Pinjam Details Styles
  pinjamDetailsSection: {
    marginVertical: 4,
    paddingHorizontal: 6,
    paddingTop: 6,
    borderLeftWidth: 2,
    borderLeftColor: "#f59e0b",
  },
  pinjamDetailsTitle: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    color: "#92400e",
    marginBottom: 2,
  },
  pinjamItem: {
    fontSize: 8,
    marginBottom: 2,
    color: "#6b7280",
  },

  // Amount Styles
  finalAmountRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: "#d1d5db",
  },
  finalAmountLabel: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    flex: 2,
    color: "#374151",
  },
  finalAmount: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    flex: 1,
    textAlign: "right",
    color: "#0ea5e9",
  },
  deductionAmount: {
    color: "#dc2626",
  },
  positiveAmount: {
    color: "#059669",
  },
});

const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat("en-MY", {
    style: "currency",
    currency: "MYR",
  }).format(amount);
};

const PinjamPDFDocument: React.FC<{ data: PinjamPDFData }> = ({ data }) => {
  const { employees, year, month } = data;
  const monthName = getMonthName(month);

  const renderEmployeeCard = (employee: PinjamEmployee) => {
    const hasMid = employee.midMonthPinjam > 0;
    const hasMonthly = employee.monthlyPinjam > 0;

    const midColumn = (
      <View style={styles.payColumn}>
        <View style={styles.paySection}>
          <Text style={styles.paySectionTitle}>Mid-Month Pay</Text>

          <View style={styles.payRow}>
            <Text style={styles.payLabel}>Original Mid-Month Pay:</Text>
            <Text style={styles.payAmount}>
              {formatCurrency(employee.midMonthPay)}
            </Text>
          </View>

          {employee.midMonthPinjamDetails.length > 0 && (
            <View style={styles.pinjamDetailsSection}>
              <Text style={styles.pinjamDetailsTitle}>Pinjam Items:</Text>
              {employee.midMonthPinjamDetails.map((detail, idx) => (
                <Text key={idx} style={styles.pinjamItem}>
                  • {detail}
                </Text>
              ))}
            </View>
          )}

          <View style={styles.payRow}>
            <Text style={styles.payLabel}>Total Pinjam:</Text>
            <Text style={[styles.payAmount, styles.deductionAmount]}>
              -{formatCurrency(employee.midMonthPinjam)}
            </Text>
          </View>

          <View style={styles.finalAmountRow}>
            <Text style={styles.finalAmountLabel}>
              Jumlah Bayaran Pendahuluan:
            </Text>
            <Text style={[styles.finalAmount, styles.positiveAmount]}>
              {formatCurrency(employee.midMonthPay - employee.midMonthPinjam)}
            </Text>
          </View>
        </View>
      </View>
    );

    const monthlyColumn = (
      <View style={styles.payColumn}>
        <View style={styles.paySection}>
          <Text style={styles.paySectionTitle}>Monthly Pay (Gaji Genap)</Text>

          <View style={styles.payRow}>
            <Text style={styles.payLabel}>Original Gaji Genap:</Text>
            <Text style={styles.payAmount}>
              {formatCurrency(employee.gajiGenap)}
            </Text>
          </View>

          {employee.monthlyPinjamDetails.length > 0 && (
            <View style={styles.pinjamDetailsSection}>
              <Text style={styles.pinjamDetailsTitle}>Pinjam Items:</Text>
              {employee.monthlyPinjamDetails.map((detail, idx) => (
                <Text key={idx} style={styles.pinjamItem}>
                  • {detail}
                </Text>
              ))}
            </View>
          )}

          <View style={styles.payRow}>
            <Text style={styles.payLabel}>Total Pinjam:</Text>
            <Text style={[styles.payAmount, styles.deductionAmount]}>
              -{formatCurrency(employee.monthlyPinjam)}
            </Text>
          </View>

          <View style={styles.finalAmountRow}>
            <Text style={styles.finalAmountLabel}>Jumlah Masuk Bank:</Text>
            <Text style={[styles.finalAmount, styles.positiveAmount]}>
              {formatCurrency(employee.gajiGenap - employee.monthlyPinjam)}
            </Text>
          </View>
        </View>
      </View>
    );

    return (
      <View key={employee.employee_id} style={styles.employeeCard}>
        {/* Employee Header */}
        <View style={styles.employeeHeader}>
          <Text style={styles.employeeName}>{employee.employee_name}</Text>
          <Text style={styles.employeeId}>{employee.employee_id}</Text>
        </View>

        {/* Employee Content - only the pinjam half(s) that have records render.
            A single-sided card takes the full width; both sides show side by side. */}
        <View style={styles.employeeContent}>
          <View style={styles.employeeContentColumns}>
            {hasMid && midColumn}
            {hasMid && hasMonthly && <View style={styles.columnDivider} />}
            {hasMonthly && monthlyColumn}
          </View>
        </View>
      </View>
    );
  };

  // Pack cards into rows: single-sided cards go 2-per-row to save vertical
  // space, while a double-sided card (both halves) keeps a full row to itself.
  const isDoubleSided = (employee: PinjamEmployee): boolean =>
    employee.midMonthPinjam > 0 && employee.monthlyPinjam > 0;

  const rows: PinjamEmployee[][] = [];
  let pendingSingle: PinjamEmployee | null = null;
  employees.forEach((employee) => {
    if (isDoubleSided(employee)) {
      if (pendingSingle) {
        rows.push([pendingSingle]);
        pendingSingle = null;
      }
      rows.push([employee]);
    } else if (pendingSingle) {
      rows.push([pendingSingle, employee]);
      pendingSingle = null;
    } else {
      pendingSingle = employee;
    }
  });
  if (pendingSingle) rows.push([pendingSingle]);

  return (
    <Document title={`Pinjam Summary - ${monthName} ${year}`}>
      <Page size="A4" style={styles.page} wrap>
        {/* Card rows - react-pdf flows these across pages automatically, and
            wrap={false} keeps each row whole rather than splitting it across a
            page boundary. No company header: slips are cut out per worker. */}
        {rows.map((row, rowIndex) => (
          <View key={rowIndex} style={styles.cardRow} wrap={false}>
            {row.map((employee) => renderEmployeeCard(employee))}
            {/* Lone single-sided card keeps half width via an empty spacer. */}
            {row.length === 1 && !isDoubleSided(row[0]) && (
              <View style={styles.cardSpacer} />
            )}
          </View>
        ))}
      </Page>
    </Document>
  );
};

export const generatePinjamPDF = async (
  data: PinjamPDFData,
  action: "download" | "print"
) => {
  try {
    const monthName = getMonthName(data.month);
    const doc = <PinjamPDFDocument data={data} />;
    const pdfBlob = await pdf(doc).toBlob();

    if (action === "download") {
      const url = URL.createObjectURL(pdfBlob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `Pinjam_Summary_${monthName}_${data.year}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } else {
      // Print - Use hidden iframe to trigger print dialog directly
      const url = URL.createObjectURL(pdfBlob);
      const iframe = document.createElement("iframe");
      iframe.style.display = "none";
      iframe.style.position = "fixed";
      iframe.style.top = "-1000px";
      iframe.style.left = "-1000px";
      document.body.appendChild(iframe);

      iframe.onload = () => {
        setTimeout(() => {
          try {
            const printResult: PrintPdfFrameResult = printPdfFrameWithFallback(
              iframe,
              url,
              {
                focusBeforePrint: true,
                logLabel: "pinjam summary PDF",
              }
            );

            // Listen for print dialog events
            if (printResult.opened && !printResult.usedFallback) {
              try {
                iframe.contentWindow?.addEventListener("afterprint", () => {
                  // Cleanup after user finishes printing
                  setTimeout(() => {
                    if (document.body.contains(iframe)) {
                      document.body.removeChild(iframe);
                    }
                    URL.revokeObjectURL(url);
                  }, 500);
                });
              } catch (afterPrintError) {
                console.warn("Could not attach afterprint cleanup:", afterPrintError);
              }
            } else if (!printResult.opened) {
              setTimeout(() => {
                if (document.body.contains(iframe)) {
                  document.body.removeChild(iframe);
                }
                URL.revokeObjectURL(url);
              }, 1000);
            }
          } catch (e) {
            console.error("Print failed:", e);
            // Fallback: open in new window if iframe print fails
            window.open(url, "_blank");
            // Cleanup immediately for fallback
            setTimeout(() => {
              if (document.body.contains(iframe)) {
                document.body.removeChild(iframe);
              }
              URL.revokeObjectURL(url);
            }, 1000);
          }
        }, 1000);
      };

      iframe.onerror = () => {
        console.error("Failed to load PDF in iframe, opening in new window");
        window.open(url, "_blank");
        // Cleanup immediately for error case
        setTimeout(() => {
          if (document.body.contains(iframe)) {
            document.body.removeChild(iframe);
          }
          URL.revokeObjectURL(url);
        }, 1000);
      };

      iframe.src = url;

      // Fallback cleanup in case afterprint event doesn't fire (after 5 minutes)
      setTimeout(() => {
        if (document.body.contains(iframe)) {
          document.body.removeChild(iframe);
          URL.revokeObjectURL(url);
        }
      }, 300000);
    }
  } catch (error) {
    console.error("Error generating PDF:", error);
    throw error;
  }
};

export type { PinjamPDFData, PinjamEmployee };
