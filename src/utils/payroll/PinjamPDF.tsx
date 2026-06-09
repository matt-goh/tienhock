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
  // Header Styles
  headerSection: {
    marginBottom: 12,
    paddingBottom: 6,
    borderBottomWidth: 2,
  },
  companyHeader: {
    fontSize: 16,
    fontFamily: "Helvetica-Bold",
    marginBottom: 6,
    textAlign: "left",
    color: "#0f172a",
  },

  // Employee Card Styles
  employeeCard: {
    marginBottom: 12,
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

  // No Pinjam State
  noPinjamSection: {
    padding: 4,
    textAlign: "center",
    borderRadius: 4,
    minHeight: 100,
    justifyContent: "center",
    alignItems: "center",
    flex: 1,
  },
  noPinjamText: {
    fontSize: 9,
    color: "#9ca3af",
    fontFamily: "Helvetica",
  },
  noPinjamTitle: {
    fontSize: 9,
    color: "#6b7280",
    fontFamily: "Helvetica-Bold",
    marginBottom: 2,
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

  const renderEmployeeCard = (employee: PinjamEmployee) => (
    // wrap={false} keeps each card whole — react-pdf moves it to the next page
    // rather than splitting it across a page boundary.
    <View key={employee.employee_id} style={styles.employeeCard} wrap={false}>
      {/* Employee Header */}
      <View style={styles.employeeHeader}>
        <Text style={styles.employeeName}>{employee.employee_name}</Text>
        <Text style={styles.employeeId}>{employee.employee_id}</Text>
      </View>

      {/* Employee Content - Two Column Layout */}
      <View style={styles.employeeContent}>
        <View style={styles.employeeContentColumns}>
          {/* Mid-Month Pay Column */}
          <View style={styles.payColumn}>
            {employee.midMonthPinjam > 0 ? (
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
                    {formatCurrency(
                      employee.midMonthPay - employee.midMonthPinjam
                    )}
                  </Text>
                </View>
              </View>
            ) : (
              <View style={styles.noPinjamSection}>
                <Text style={styles.noPinjamTitle}>Mid-Month Pay</Text>
                <Text style={styles.noPinjamText}>No pinjam recorded</Text>
              </View>
            )}
          </View>

          {/* Column Divider */}
          <View style={styles.columnDivider} />

          {/* Monthly Pay Column */}
          <View style={styles.payColumn}>
            {employee.monthlyPinjam > 0 ? (
              <View style={styles.paySection}>
                <Text style={styles.paySectionTitle}>
                  Monthly Pay (Gaji Genap)
                </Text>

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
                  <Text style={styles.finalAmountLabel}>
                    Jumlah Masuk Bank:
                  </Text>
                  <Text style={[styles.finalAmount, styles.positiveAmount]}>
                    {formatCurrency(
                      employee.gajiGenap - employee.monthlyPinjam
                    )}
                  </Text>
                </View>
              </View>
            ) : (
              <View style={styles.noPinjamSection}>
                <Text style={styles.noPinjamTitle}>Monthly Pay</Text>
                <Text style={styles.noPinjamText}>No pinjam recorded</Text>
              </View>
            )}
          </View>
        </View>
      </View>
    </View>
  );

  return (
    <Document title={`Pinjam Summary - ${monthName} ${year}`}>
      <Page size="A4" style={styles.page} wrap>
        {/* Header - flows once at the top, so it appears only on the first page */}
        <View style={styles.headerSection}>
          <Text style={styles.companyHeader}>
            TIEN HOCK FOOD INDUSTRIES S/B
          </Text>
        </View>

        {/* Employee Cards - react-pdf flows these across pages automatically */}
        {employees.map((employee) => renderEmployeeCard(employee))}
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
