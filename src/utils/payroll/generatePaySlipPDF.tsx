// src/utils/payroll/generatePaySlipPDF.tsx
import { pdf, Document } from "@react-pdf/renderer";
import PaySlipPDF from "./PaySlipPDF";
import { EmployeePayroll } from "../../types/types";

/**
 * Generate a PDF blob for a single employee payroll
 * @param payroll The employee payroll data
 * @param companyName Optional company name
 * @returns Promise with PDF blob
 */
export const generateSinglePaySlipPDF = async (
  payroll: EmployeePayroll,
  companyName = "TIEN HOCK FOOD INDUSTRIES S/B",
  staffDetails?: {
    name: string;
    icNo: string;
    jobName: string;
    section: string;
  }
): Promise<Blob> => {
  return await pdf(
    <Document>
      <PaySlipPDF
        payroll={payroll}
        companyName={companyName}
        staffDetails={staffDetails}
      />
    </Document>
  ).toBlob();
};

/**
 * Generate a PDF blob for multiple employee payrolls
 * @param payrolls Array of employee payroll data
 * @param companyName Optional company name
 * @returns Promise with PDF blob
 */
export const generateBatchPaySlipsPDF = async (
  payrolls: EmployeePayroll[],
  companyName = "TIEN HOCK FOOD INDUSTRIES S/B",
  staffDetailsMap?: Record<
    string,
    {
      name: string;
      icNo: string;
      jobName: string;
      section: string;
    }
  >
): Promise<Blob> => {
  // Create a single document with multiple pages
  const pdfDoc = pdf(
    <Document>
      {payrolls.map((payroll, index) => (
        <PaySlipPDF
          key={index}
          payroll={payroll}
          companyName={companyName}
          staffDetails={staffDetailsMap?.[payroll.employee_id]}
        />
      ))}
    </Document>
  );

  return await pdfDoc.toBlob();
};

/**
 * Download a single payslip as PDF
 * @param payroll The employee payroll data
 * @param companyName Optional company name
 */
export const downloadSinglePaySlip = async (
  payroll: EmployeePayroll,
  companyName = "Tien Hock",
  staffDetails?: {
    name: string;
    icNo: string;
    jobName: string;
    section: string;
  }
): Promise<void> => {
  const blob = await generateSinglePaySlipPDF(
    payroll,
    companyName,
    staffDetails
  );
  const fileName = `PaySlip-${payroll.employee_id}-${payroll.year}-${payroll.month}.pdf`;

  // Create download link
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

/**
 * Download multiple payslips as a single PDF
 * @param payrolls Array of employee payroll data
 * @param companyName Optional company name
 */
export const downloadBatchPaySlips = async (
  payrolls: EmployeePayroll[],
  companyName = "Tien Hock",
  staffDetailsMap?: Record<
    string,
    {
      name: string;
      icNo: string;
      jobName: string;
      section: string;
    }
  >
): Promise<void> => {
  const blob = await generateBatchPaySlipsPDF(
    payrolls,
    companyName,
    staffDetailsMap
  );

  // Get month/year info from the first payroll
  const month = payrolls[0]?.month || new Date().getMonth() + 1;
  const year = payrolls[0]?.year || new Date().getFullYear();

  const fileName = `PaySlips-Batch-${year}-${month}.pdf`;

  // Create download link
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};
