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
    lineHeight: 1.3,
  },
  companyHeader: {
    fontSize: 12,
    fontFamily: "Helvetica-Bold",
    marginBottom: 4,
    textAlign: "left",
  },
  reportTitle: {
    fontFamily: "Helvetica",
    marginBottom: 8,
    textAlign: "left",
  },
  summarySection: {
    marginBottom: 10,
    padding: 8,
    backgroundColor: "#f8f8f8",
    borderWidth: 0.5,
    borderColor: "#ccc",
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 3,
  },
  summaryLabel: {
    fontFamily: "Helvetica-Bold",
  },
  summaryValue: {
    fontFamily: "Helvetica-Bold",
  },
  employeeSection: {
    marginBottom: 12,
    borderWidth: 0.5,
    borderColor: "#333",
  },
  employeeHeader: {
    backgroundColor: "#f0f0f0",
    padding: 6,
    borderBottomWidth: 0.5,
    borderBottomColor: "#333",
  },
  employeeName: {
    fontFamily: "Helvetica-Bold",
    fontSize: 10,
  },
  employeeId: {
    fontSize: 8,
    color: "#666",
    marginTop: 1,
  },
  employeeContent: {
    padding: 6,
  },
  paySection: {
    marginBottom: 8,
  },
  paySectionTitle: {
    fontFamily: "Helvetica-Bold",
    marginBottom: 4,
    fontSize: 9,
  },
  payRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 2,
    paddingVertical: 1,
  },
  payLabel: {
    flex: 2,
  },
  payAmount: {
    flex: 1,
    textAlign: "right",
  },
  pinjamItems: {
    marginBottom: 4,
    paddingLeft: 8,
  },
  pinjamItem: {
    fontSize: 8,
    marginBottom: 1,
    color: "#555",
  },
  finalAmountRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingTop: 3,
    borderTopWidth: 0.5,
    borderTopColor: "#333",
    marginTop: 2,
  },
  finalAmountLabel: {
    fontFamily: "Helvetica-Bold",
    flex: 2,
  },
  finalAmount: {
    fontFamily: "Helvetica-Bold",
    flex: 1,
    textAlign: "right",
    color: "#0066cc",
  },
  deductionAmount: {
    color: "#cc0000",
  },
  totalSection: {
    marginTop: 15,
    padding: 8,
    backgroundColor: "#f0f0f0",
    borderWidth: 1,
    borderColor: "#333",
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 3,
  },
  totalLabel: {
    fontFamily: "Helvetica-Bold",
    fontSize: 10,
  },
  totalValue: {
    fontFamily: "Helvetica-Bold",
    fontSize: 10,
  },
  grandTotalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: "#333",
    paddingTop: 4,
    marginTop: 4,
  },
  grandTotalLabel: {
    fontFamily: "Helvetica-Bold",
    fontSize: 11,
  },
  grandTotalValue: {
    fontFamily: "Helvetica-Bold",
    fontSize: 11,
    color: "#0066cc",
  },
});

const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat("en-MY", {
    style: "currency",
    currency: "MYR",
  }).format(amount);
};

const PinjamPDFDocument: React.FC<{ data: PinjamPDFData }> = ({ data }) => {
  const { employees, year, month, totalMidMonthPinjam, totalMonthlyPinjam } = data;
  const monthName = getMonthName(month);

  return (
    <Document title={`Pinjam Summary - ${monthName} ${year}`}>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <Text style={styles.companyHeader}>TIEN HOCK FOOD INDUSTRIES S/B</Text>
        <Text style={styles.reportTitle}>
          Pinjam Summary for {monthName} {year}
        </Text>

        {/* Summary Section */}
        <View style={styles.summarySection}>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Total Mid-Month Pinjam:</Text>
            <Text style={styles.summaryValue}>
              {formatCurrency(totalMidMonthPinjam)}
            </Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Total Monthly Pinjam:</Text>
            <Text style={styles.summaryValue}>
              {formatCurrency(totalMonthlyPinjam)}
            </Text>
          </View>
          <View style={[styles.summaryRow, styles.grandTotalRow]}>
            <Text style={styles.grandTotalLabel}>Grand Total Pinjam:</Text>
            <Text style={styles.grandTotalValue}>
              {formatCurrency(totalMidMonthPinjam + totalMonthlyPinjam)}
            </Text>
          </View>
        </View>

        {/* Employee Details */}
        {employees.map((employee, index) => (
          <View key={employee.employee_id} style={styles.employeeSection}>
            {/* Employee Header */}
            <View style={styles.employeeHeader}>
              <Text style={styles.employeeName}>{employee.employee_name}</Text>
              <Text style={styles.employeeId}>{employee.employee_id}</Text>
            </View>

            {/* Employee Content */}
            <View style={styles.employeeContent}>
              {/* Mid-Month Pay Section */}
              {employee.midMonthPinjam > 0 && (
                <View style={styles.paySection}>
                  <Text style={styles.paySectionTitle}>Mid-Month Pay</Text>
                  
                  <View style={styles.payRow}>
                    <Text style={styles.payLabel}>Original Mid-Month Pay:</Text>
                    <Text style={styles.payAmount}>
                      {formatCurrency(employee.midMonthPay)}
                    </Text>
                  </View>

                  {employee.midMonthPinjamDetails.length > 0 && (
                    <View style={styles.pinjamItems}>
                      <Text style={[styles.payLabel, { fontFamily: "Helvetica-Bold", fontSize: 8 }]}>
                        Pinjam Items:
                      </Text>
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
                    <Text style={styles.finalAmountLabel}>Final Mid-Month Pay:</Text>
                    <Text style={styles.finalAmount}>
                      {formatCurrency(employee.midMonthPay - employee.midMonthPinjam)}
                    </Text>
                  </View>
                </View>
              )}

              {/* Monthly Pay Section */}
              {employee.monthlyPinjam > 0 && (
                <View style={styles.paySection}>
                  <Text style={styles.paySectionTitle}>Monthly Pay (Gaji Genap)</Text>
                  
                  <View style={styles.payRow}>
                    <Text style={styles.payLabel}>Original Gaji Genap:</Text>
                    <Text style={styles.payAmount}>
                      {formatCurrency(employee.gajiGenap)}
                    </Text>
                  </View>

                  {employee.monthlyPinjamDetails.length > 0 && (
                    <View style={styles.pinjamItems}>
                      <Text style={[styles.payLabel, { fontFamily: "Helvetica-Bold", fontSize: 8 }]}>
                        Pinjam Items:
                      </Text>
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
                    <Text style={styles.finalAmountLabel}>Amount to Bank:</Text>
                    <Text style={styles.finalAmount}>
                      {formatCurrency(employee.gajiGenap - employee.monthlyPinjam)}
                    </Text>
                  </View>
                </View>
              )}

              {/* No pinjam state */}
              {employee.midMonthPinjam === 0 && employee.monthlyPinjam === 0 && (
                <View style={styles.paySection}>
                  <Text style={{ textAlign: "center", color: "#666", fontStyle: "italic" }}>
                    No pinjam recorded for this employee
                  </Text>
                </View>
              )}
            </View>
          </View>
        ))}

        {/* Total Section */}
        <View style={styles.totalSection}>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Total Employees:</Text>
            <Text style={styles.totalValue}>{employees.length}</Text>
          </View>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Total Mid-Month Pinjam:</Text>
            <Text style={styles.totalValue}>
              {formatCurrency(totalMidMonthPinjam)}
            </Text>
          </View>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Total Monthly Pinjam:</Text>
            <Text style={styles.totalValue}>
              {formatCurrency(totalMonthlyPinjam)}
            </Text>
          </View>
          <View style={styles.grandTotalRow}>
            <Text style={styles.grandTotalLabel}>Grand Total Pinjam:</Text>
            <Text style={styles.grandTotalValue}>
              {formatCurrency(totalMidMonthPinjam + totalMonthlyPinjam)}
            </Text>
          </View>
        </View>
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
            iframe.contentWindow?.focus();
            iframe.contentWindow?.print();
          } catch (e) {
            console.error("Print failed:", e);
            // Fallback: open in new window if iframe print fails
            window.open(url, '_blank');
          }
        }, 1000); // Give more time for PDF to load
      };

      iframe.onerror = () => {
        console.error("Failed to load PDF in iframe, opening in new window");
        window.open(url, '_blank');
      };

      iframe.src = url;

      // Cleanup after print
      setTimeout(() => {
        if (document.body.contains(iframe)) {
          document.body.removeChild(iframe);
        }
        URL.revokeObjectURL(url);
      }, 10000);
    }
  } catch (error) {
    console.error("Error generating PDF:", error);
    throw error;
  }
};

export type { PinjamPDFData, PinjamEmployee };