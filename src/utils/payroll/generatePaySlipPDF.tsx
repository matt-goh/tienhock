// src/utils/payroll/generatePaySlipPDF.tsx
import React from "react";
import { pdf } from "@react-pdf/renderer";
import PaySlipPDF from "./PaySlipPDF";

// Interface for employee payroll data
interface PayrollItem {
  id: number;
  pay_code_id: string;
  description: string;
  rate: number;
  rate_unit: string;
  quantity: number;
  amount: number;
  is_manual: boolean;
}

interface EmployeePayroll {
  id?: number;
  monthly_payroll_id?: number;
  employee_id: string;
  employee_name: string;
  job_type: string;
  section: string;
  gross_pay: number;
  net_pay: number;
  end_month_payment: number;
  year: number;
  month: number;
  items: PayrollItem[];
}

/**
 * Generate a PDF blob for a single employee payroll
 * @param payroll The employee payroll data
 * @param companyName Optional company name
 * @returns Promise with PDF blob
 */
export const generateSinglePaySlipPDF = async (
  payroll: EmployeePayroll,
  companyName = "Tien Hock"
): Promise<Blob> => {
  return await pdf(
    <PaySlipPDF payroll={payroll} companyName={companyName} />
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
  companyName = "Tien Hock"
): Promise<Blob> => {
  // Create a single document with multiple pages
  const pdfDoc = pdf(
    <>
      {payrolls.map((payroll, index) => (
        <PaySlipPDF key={index} payroll={payroll} companyName={companyName} />
      ))}
    </>
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
  companyName = "Tien Hock"
): Promise<void> => {
  const blob = await generateSinglePaySlipPDF(payroll, companyName);
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
  companyName = "Tien Hock"
): Promise<void> => {
  const blob = await generateBatchPaySlipsPDF(payrolls, companyName);

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
