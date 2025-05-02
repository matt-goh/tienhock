// src/components/Payroll/BatchPrintModal.tsx
import React, { Fragment, useState, useRef } from "react";
import {
  Dialog,
  DialogPanel,
  DialogTitle,
  Transition,
  TransitionChild,
} from "@headlessui/react";
import Button from "../Button";
import {
  IconPrinter,
  IconDownload,
  IconChevronDown,
  IconChevronUp,
  IconChecks,
} from "@tabler/icons-react";
import PaySlipPreview from "./PaySlipPreview";
import Checkbox from "../Checkbox";
import LoadingSpinner from "../LoadingSpinner";
import { BatchPaySlipPDFButton } from "../../utils/payroll/PDFDownloadButton";

interface EmployeePayroll {
  id: number;
  employee_id: string;
  employee_name: string;
  job_type: string;
  section: string;
  gross_pay: number;
  net_pay: number;
  year: number;
  month: number;
  items: any[];
}

interface BatchPrintModalProps {
  isOpen: boolean;
  onClose: () => void;
  payrolls: EmployeePayroll[];
  payrollMonth: string;
  payrollYear: number;
}

interface EmployeeGroup {
  jobType: string;
  employees: EmployeePayroll[];
  isExpanded: boolean;
}

const BatchPrintModal: React.FC<BatchPrintModalProps> = ({
  isOpen,
  onClose,
  payrolls,
  payrollMonth,
  payrollYear,
}) => {
  const [isPrinting, setIsPrinting] = useState(false);
  const [selectedEmployees, setSelectedEmployees] = useState<
    Record<number, boolean>
  >({});
  const [employeeGroups, setEmployeeGroups] = useState<EmployeeGroup[]>([]);
  const [selectAll, setSelectAll] = useState(true);
  const printContainerRef = useRef<HTMLDivElement>(null);

  // Group employees by job type
  React.useEffect(() => {
    if (isOpen && payrolls.length > 0) {
      // Group payrolls by job type
      const groupedByJobType: Record<string, EmployeePayroll[]> = {};

      payrolls.forEach((payroll) => {
        if (!groupedByJobType[payroll.job_type]) {
          groupedByJobType[payroll.job_type] = [];
        }
        groupedByJobType[payroll.job_type].push(payroll);
      });

      // Convert to array of employee groups
      const groups: EmployeeGroup[] = Object.entries(groupedByJobType).map(
        ([jobType, employees]) => ({
          jobType,
          employees,
          isExpanded: true,
        })
      );

      setEmployeeGroups(groups);

      // Initialize with all employees selected
      const initialSelection: Record<number, boolean> = {};
      payrolls.forEach((payroll) => {
        initialSelection[payroll.id] = true;
      });
      setSelectedEmployees(initialSelection);
      setSelectAll(true);
    }
  }, [isOpen, payrolls]);

  const toggleJobTypeExpansion = (index: number) => {
    setEmployeeGroups((prev) => {
      const updated = [...prev];
      updated[index] = {
        ...updated[index],
        isExpanded: !updated[index].isExpanded,
      };
      return updated;
    });
  };

  const toggleEmployeeSelection = (id: number) => {
    setSelectedEmployees((prev) => {
      const updated = { ...prev };
      updated[id] = !updated[id];
      return updated;
    });
  };

  const toggleSelectAll = () => {
    const newSelectAll = !selectAll;
    setSelectAll(newSelectAll);

    // Select or deselect all employees
    const updatedSelection: Record<number, boolean> = {};
    payrolls.forEach((payroll) => {
      updatedSelection[payroll.id] = newSelectAll;
    });
    setSelectedEmployees(updatedSelection);
  };

  const handlePrint = () => {
    setIsPrinting(true);

    // Create a new window for printing
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      alert("Please allow popups for this website");
      setIsPrinting(false);
      return;
    }

    // Filter selected payrolls
    const selectedPayrolls = payrolls.filter((p) => selectedEmployees[p.id]);

    // Get the HTML for selected pay slips
    let paySlipsHtml = "";
    selectedPayrolls.forEach((payroll, index) => {
      // Create a temporary div to render the pay slip
      const tempDiv = document.createElement("div");
      tempDiv.className = "mb-8 pay-slip-container";

      // Render the PaySlipPreview component
      const paySlipElement = document.createElement("div");
      paySlipElement.innerHTML = `
        <div class="pay-slip-header">
          <h2 style="text-align: center; font-size: 18px; font-weight: bold; text-transform: uppercase; margin-bottom: 0;">
            Tien Hock
          </h2>
          <p style="text-align: center; margin-top: 4px; margin-bottom: 16px;">
            Pay Slip for ${payrollMonth} ${payrollYear}
          </p>
          
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-top: 16px;">
            <div>
              <p style="font-size: 12px; color: #6b7280; margin-bottom: 4px;">Employee ID</p>
              <p style="font-weight: 500; margin-top: 0;">${
                payroll.employee_id
              }</p>
            </div>
            <div>
              <p style="font-size: 12px; color: #6b7280; margin-bottom: 4px;">Name</p>
              <p style="font-weight: 500; margin-top: 0;">${
                payroll.employee_name
              }</p>
            </div>
            <div>
              <p style="font-size: 12px; color: #6b7280; margin-bottom: 4px;">Job Type</p>
              <p style="font-weight: 500; margin-top: 0;">${
                payroll.job_type
              }</p>
            </div>
            <div>
              <p style="font-size: 12px; color: #6b7280; margin-bottom: 4px;">Section</p>
              <p style="font-weight: 500; margin-top: 0;">${payroll.section}</p>
            </div>
          </div>
        </div>
        
        <div class="pay-slip-details" style="margin-top: 16px;">
          <!-- Pay items would be rendered here -->
        </div>
        
        <div style="margin-top: 32px; border-top: 1px solid #e5e7eb; padding-top: 16px;">
          <div style="display: flex; justify-content: space-between; padding: 8px 0;">
            <span style="font-weight: 500;">Gross Pay:</span>
            <span style="font-weight: 500;">RM ${payroll.gross_pay.toFixed(
              2
            )}</span>
          </div>
          
          <div style="display: flex; justify-content: space-between; padding: 8px 0; border-top: 1px solid #e5e7eb; margin-top: 8px;">
            <span style="font-weight: 500;">Net Pay:</span>
            <span style="font-weight: 500;">RM ${payroll.net_pay.toFixed(
              2
            )}</span>
          </div>
        </div>
        
        <div style="margin-top: 48px; display: grid; grid-template-columns: 1fr 1fr; gap: 32px;">
          <div style="text-align: center;">
            <div style="height: 40px; border-bottom: 1px solid #d1d5db; margin-bottom: 8px;"></div>
            <p style="font-size: 12px; color: #6b7280;">Employee Signature</p>
          </div>
          <div style="text-align: center;">
            <div style="height: 40px; border-bottom: 1px solid #d1d5db; margin-bottom: 8px;"></div>
            <p style="font-size: 12px; color: #6b7280;">Employer Signature</p>
          </div>
        </div>
      `;

      tempDiv.appendChild(paySlipElement);

      // Add page break if not the last pay slip
      if (index < selectedPayrolls.length - 1) {
        tempDiv.innerHTML += '<div class="page-break"></div>';
      }

      paySlipsHtml += tempDiv.innerHTML;
    });

    // Add print-specific CSS
    const printCss = `
      <style>
        @page {
          size: A4;
          margin: 2cm;
        }
        body {
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          line-height: 1.5;
          color: #111827;
        }
        .page-break {
          page-break-after: always;
        }
        .pay-slip-container {
          padding: 0;
          margin-bottom: 20px;
        }
      </style>
    `;

    // Write to the new window
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Pay Slips - ${payrollMonth} ${payrollYear}</title>
          ${printCss}
        </head>
        <body>
          ${paySlipsHtml}
        </body>
      </html>
    `);

    printWindow.document.close();

    // Wait for content to load before printing
    printWindow.onload = function () {
      printWindow.focus();
      printWindow.print();
      printWindow.onafterprint = function () {
        printWindow.close();
        setIsPrinting(false);
      };
    };
  };

  const selectedCount = Object.values(selectedEmployees).filter(Boolean).length;
  const selectedPayrolls = payrolls.filter(
    (payroll) => selectedEmployees[payroll.id]
  );
  
  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={onClose}>
        <TransitionChild
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
        </TransitionChild>

        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            <TransitionChild
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <DialogPanel className="w-full max-w-3xl transform overflow-hidden rounded-2xl bg-white shadow-xl transition-all">
                <div className="p-6 bg-default-50 border-b border-default-200 flex justify-between items-center">
                  <DialogTitle
                    as="h3"
                    className="text-lg font-medium leading-6 text-gray-900"
                  >
                    Print Pay Slips - {payrollMonth} {payrollYear}
                  </DialogTitle>

                  <div className="flex space-x-2">
                    <Button
                      onClick={handlePrint}
                      icon={IconPrinter}
                      variant="filled"
                      color="sky"
                      size="sm"
                      disabled={isPrinting || selectedCount === 0}
                    >
                      {isPrinting
                        ? "Preparing..."
                        : `Print Selected (${selectedCount})`}
                    </Button>
                    <BatchPaySlipPDFButton
                      payrolls={selectedPayrolls}
                      buttonText={`Download (${selectedCount})`}
                      disabled={selectedCount === 0}
                      size="sm"
                    />
                  </div>
                </div>

                <div className="p-6">
                  <div className="mb-4 flex justify-between items-center">
                    <div className="flex items-center">
                      <Checkbox
                        checked={selectAll}
                        onChange={toggleSelectAll}
                        label="Select All Employees"
                      />
                    </div>
                    <div className="text-sm text-default-500">
                      {selectedCount} of {payrolls.length} selected
                    </div>
                  </div>

                  {isPrinting ? (
                    <div className="flex flex-col items-center justify-center h-40">
                      <LoadingSpinner />
                      <p className="mt-4 text-default-600">
                        Preparing pay slips for printing...
                      </p>
                    </div>
                  ) : (
                    <div className="max-h-96 overflow-y-auto">
                      {employeeGroups.map((group, index) => (
                        <div key={group.jobType} className="mb-4">
                          <div
                            className="flex justify-between items-center p-2 bg-default-50 border border-default-200 rounded-lg cursor-pointer"
                            onClick={() => toggleJobTypeExpansion(index)}
                          >
                            <div className="font-medium flex items-center">
                              {group.isExpanded ? (
                                <IconChevronUp
                                  size={18}
                                  className="mr-2 text-default-500"
                                />
                              ) : (
                                <IconChevronDown
                                  size={18}
                                  className="mr-2 text-default-500"
                                />
                              )}
                              {group.jobType} ({group.employees.length})
                            </div>
                          </div>

                          {group.isExpanded && (
                            <div className="mt-2 border border-default-200 rounded-lg overflow-hidden">
                              <table className="min-w-full divide-y divide-default-200">
                                <thead className="bg-default-50">
                                  <tr>
                                    <th
                                      scope="col"
                                      className="w-10 px-3 py-2 text-left text-xs font-medium text-default-500 uppercase tracking-wider"
                                    ></th>
                                    <th
                                      scope="col"
                                      className="px-3 py-2 text-left text-xs font-medium text-default-500 uppercase tracking-wider"
                                    >
                                      Employee
                                    </th>
                                    <th
                                      scope="col"
                                      className="px-3 py-2 text-left text-xs font-medium text-default-500 uppercase tracking-wider"
                                    >
                                      Section
                                    </th>
                                    <th
                                      scope="col"
                                      className="px-3 py-2 text-right text-xs font-medium text-default-500 uppercase tracking-wider"
                                    >
                                      Amount
                                    </th>
                                  </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-default-200">
                                  {group.employees.map((employee) => (
                                    <tr
                                      key={employee.id}
                                      className="hover:bg-default-50 cursor-pointer"
                                      onClick={() =>
                                        toggleEmployeeSelection(employee.id)
                                      }
                                    >
                                      <td
                                        className="px-3 py-2"
                                        onClick={(e) => e.stopPropagation()}
                                      >
                                        <Checkbox
                                          checked={
                                            !!selectedEmployees[employee.id]
                                          }
                                          onChange={() =>
                                            toggleEmployeeSelection(employee.id)
                                          }
                                          size={18}
                                          checkedColor="text-sky-600"
                                        />
                                      </td>
                                      <td className="px-3 py-2 whitespace-nowrap">
                                        <div className="text-sm font-medium text-default-900">
                                          {employee.employee_name}
                                        </div>
                                        <div className="text-xs text-default-500">
                                          {employee.employee_id}
                                        </div>
                                      </td>
                                      <td className="px-3 py-2 whitespace-nowrap text-sm text-default-600">
                                        {employee.section}
                                      </td>
                                      <td className="px-3 py-2 whitespace-nowrap text-right text-sm font-medium">
                                        RM {employee.net_pay.toFixed(2)}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="flex justify-end mt-6">
                    <Button
                      onClick={onClose}
                      variant="outline"
                      disabled={isPrinting}
                    >
                      Close
                    </Button>
                  </div>
                </div>

                {/* Hidden Pay Slips for Printing */}
                <div ref={printContainerRef} className="hidden">
                  {/* Pay slips will be rendered here before printing */}
                </div>
              </DialogPanel>
            </TransitionChild>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
};

export default BatchPrintModal;
