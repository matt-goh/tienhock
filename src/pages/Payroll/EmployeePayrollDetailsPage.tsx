// src/pages/Payroll/EmployeePayrollDetailsPage.tsx
import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { IconPrinter, IconPlus, IconTrash } from "@tabler/icons-react";
import Button from "../../components/Button";
import BackButton from "../../components/BackButton";
import LoadingSpinner from "../../components/LoadingSpinner";
import ConfirmationDialog from "../../components/ConfirmationDialog";
import {
  getEmployeePayrollDetails,
  deletePayrollItem,
} from "../../utils/payroll/payrollUtils";
import toast from "react-hot-toast";
import { Link } from "react-router-dom";
import AddManualItemModal from "../../components/Payroll/AddManualItemModal";
import PaySlipModal from "../../components/Payroll/PaySlipModal";
import PaySlipPreview from "../../components/Payroll/PaySlipPreview";
import Tab from "../../components/Tab";

interface PayrollItem {
  id: number;
  pay_code_id: string;
  description: string;
  rate: number;
  rate_unit: string;
  quantity: number;
  amount: number;
  is_manual: boolean;
  pay_type?: string;
}

interface EmployeePayroll {
  id: number;
  monthly_payroll_id: number;
  employee_id: string;
  employee_name: string;
  job_type: string;
  section: string;
  gross_pay: number;
  net_pay: number;
  status: string;
  payroll_status: string;
  year: number;
  month: number;
  items: PayrollItem[];
}

const EmployeePayrollDetailsPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [payroll, setPayroll] = useState<EmployeePayroll | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showAddItemModal, setShowAddItemModal] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<PayrollItem | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showPaySlipModal, setShowPaySlipModal] = useState(false);

  useEffect(() => {
    fetchEmployeePayroll();
  }, [id]);

  const fetchEmployeePayroll = async () => {
    if (!id) return;

    setIsLoading(true);
    try {
      const response = await getEmployeePayrollDetails(Number(id));
      setPayroll(response);
    } catch (error) {
      console.error("Error fetching employee payroll:", error);
      toast.error("Failed to load employee payroll details");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteItem = async () => {
    if (!itemToDelete) return;

    setIsDeleting(true);
    try {
      await deletePayrollItem(itemToDelete.id);
      toast.success("Item deleted successfully");
      await fetchEmployeePayroll();
    } catch (error) {
      console.error("Error deleting payroll item:", error);
      toast.error("Failed to delete payroll item");
    } finally {
      setIsDeleting(false);
      setShowDeleteDialog(false);
      setItemToDelete(null);
    }
  };

  const handleBack = () => {
    if (payroll) {
      navigate(`/payroll/monthly-payrolls/${payroll.monthly_payroll_id}`);
    } else {
      navigate("/payroll/monthly-payrolls");
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-MY", {
      style: "currency",
      currency: "MYR",
    }).format(amount);
  };

  const getMonthName = (month: number) => {
    return new Date(2000, month - 1, 1).toLocaleString("default", {
      month: "long",
    });
  };

  const groupItemsByType = (items: PayrollItem[]) => {
    const grouped: Record<string, PayrollItem[]> = {
      Base: [],
      Tambahan: [],
      Overtime: [],
    };

    items.forEach((item) => {
      // Use the pay_type returned from the backend
      if (item.pay_type === "Overtime") {
        grouped["Overtime"].push(item);
      } else if (item.pay_type === "Tambahan") {
        grouped["Tambahan"].push(item);
      } else if (item.pay_type === "Base") {
        grouped["Base"].push(item);
      } else {
        // Fallback for items without pay_type (using previous logic)
        if (
          item.description.toLowerCase().includes("overtime") ||
          item.description.toLowerCase().includes("ot")
        ) {
          grouped["Overtime"].push(item);
        } else if (
          item.is_manual ||
          item.description.toLowerCase().includes("tambahan")
        ) {
          grouped["Tambahan"].push(item);
        } else {
          grouped["Base"].push(item);
        }
      }
    });

    return grouped;
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-96">
        <LoadingSpinner />
      </div>
    );
  }

  if (!payroll) {
    return (
      <div className="text-center py-12">
        <p className="text-default-500">Employee payroll not found</p>
        <Button onClick={handleBack} className="mt-4" variant="outline">
          Back
        </Button>
      </div>
    );
  }

  const isEditable = payroll.payroll_status !== "Finalized";
  const groupedItems = groupItemsByType(payroll.items);

  return (
    <div className="relative w-full mx-4 md:mx-6 -mt-6">
      <BackButton onClick={handleBack} />

      <div className="bg-white rounded-lg border border-default-200 shadow-sm p-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6">
          <div>
            <h1 className="text-xl font-semibold text-default-800">
              Employee Payroll Details
            </h1>
            <p className="text-sm text-default-500 mt-1">
              {getMonthName(payroll.month)} {payroll.year}
            </p>
          </div>
          <div className="flex space-x-3 mt-4 md:mt-0">
            {isEditable && (
              <Button
                onClick={() => setShowAddItemModal(true)}
                icon={IconPlus}
                variant="outline"
              >
                Add Manual Item
              </Button>
            )}
            <Button
              onClick={() => setShowPaySlipModal(true)}
              icon={IconPrinter}
              color="sky"
            >
              View Pay Slip
            </Button>
          </div>
        </div>

        {/* Employee Information */}
        <div className="mb-8 border rounded-lg p-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <p className="text-sm text-default-500 mb-1">Employee</p>
              <p className="font-medium">
                <Link
                  to={`/catalogue/staff/${payroll.employee_id}`}
                  className="text-sky-600 hover:underline"
                >
                  {payroll.employee_name || "Unknown"}
                </Link>
              </p>
              <p className="text-sm text-default-500">{payroll.employee_id}</p>
            </div>
            <div>
              <p className="text-sm text-default-500 mb-1">Job Type</p>
              <p className="font-medium">{payroll.job_type}</p>
              <p className="text-sm text-default-500">{payroll.section}</p>
            </div>
            <div>
              <p className="text-sm text-default-500 mb-1">Status</p>
              <p className="font-medium">{payroll.payroll_status}</p>
            </div>
          </div>
        </div>

        {/* Payroll Summary */}
        <div className="mb-8">
          <h2 className="text-lg font-medium text-default-800 mb-4">
            Payroll Summary
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="border rounded-lg p-4">
              <p className="text-sm text-default-500 mb-1">Gross Pay</p>
              <p className="text-xl font-semibold text-default-800">
                {formatCurrency(payroll.gross_pay)}
              </p>
            </div>
            <div className="border rounded-lg p-4">
              <p className="text-sm text-default-500 mb-1">Net Pay</p>
              <p className="text-xl font-semibold text-default-800">
                {formatCurrency(payroll.net_pay)}
              </p>
            </div>
          </div>
        </div>

        {/* Tabs for Items and Pay Slip View */}
        <div className="mb-6">
          <Tab labels={["Payroll Items", "Pay Slip Preview"]}>
            {/* Payroll Items Tab - This will contain all the existing payroll items tables */}
            <div className="mt-4">
              <h2 className="text-lg font-medium text-default-800 mb-4">
                Payroll Items
              </h2>

              {/* Base Pay Items */}
              {groupedItems["Base"].length > 0 && (
                <div className="mb-6">
                  <h3 className="text-md font-medium text-default-700 mb-2">
                    Base Pay
                  </h3>
                  <div className="border rounded-lg overflow-hidden">
                    <table className="min-w-full divide-y divide-default-200">
                      <thead className="bg-default-50">
                        <tr>
                          <th
                            scope="col"
                            className="px-6 py-3 text-left text-xs font-medium text-default-500 uppercase tracking-wider"
                          >
                            Description
                          </th>
                          <th
                            scope="col"
                            className="px-6 py-3 text-center text-xs font-medium text-default-500 uppercase tracking-wider"
                          >
                            Rate
                          </th>
                          <th
                            scope="col"
                            className="px-6 py-3 text-center text-xs font-medium text-default-500 uppercase tracking-wider"
                          >
                            Quantity
                          </th>
                          <th
                            scope="col"
                            className="px-6 py-3 text-right text-xs font-medium text-default-500 uppercase tracking-wider"
                          >
                            Amount
                          </th>
                          {isEditable && (
                            <th
                              scope="col"
                              className="px-6 py-3 text-center text-xs font-medium text-default-500 uppercase tracking-wider"
                            >
                              Actions
                            </th>
                          )}
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-default-200">
                        {groupedItems["Base"].map((item) => (
                          <tr key={item.id} className="hover:bg-default-50">
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="text-sm font-medium text-default-900">
                                {item.description}
                              </div>
                              <div className="text-xs text-default-500">
                                {item.pay_code_id}
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-center">
                              <div className="text-sm text-default-900">
                                {formatCurrency(item.rate)}
                                <span className="text-xs text-default-500 ml-1">
                                  /{item.rate_unit}
                                </span>
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-center">
                              <div className="text-sm text-default-900">
                                {item.quantity}
                                <span className="text-xs text-default-500 ml-1">
                                  {item.rate_unit === "Hour"
                                    ? "hours"
                                    : item.rate_unit === "Day"
                                    ? "days"
                                    : item.rate_unit === "Fixed"
                                    ? ""
                                    : item.rate_unit.toLowerCase()}
                                </span>
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-right">
                              <div className="text-sm font-medium text-default-900">
                                {formatCurrency(item.amount)}
                              </div>
                            </td>
                            {isEditable && (
                              <td className="px-6 py-4 whitespace-nowrap text-center">
                                {/* Base items typically can't be deleted, so we only show action buttons for manual items */}
                                {item.is_manual && (
                                  <button
                                    onClick={() => {
                                      setItemToDelete(item);
                                      setShowDeleteDialog(true);
                                    }}
                                    className="text-rose-600 hover:text-rose-800"
                                    title="Delete Item"
                                  >
                                    <IconTrash size={18} />
                                  </button>
                                )}
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Tambahan Pay Items */}
              {groupedItems["Tambahan"].length > 0 && (
                <div className="mb-6">
                  <h3 className="text-md font-medium text-default-700 mb-2">
                    Tambahan Pay
                  </h3>
                  <div className="border rounded-lg overflow-hidden">
                    <table className="min-w-full divide-y divide-default-200">
                      <thead className="bg-default-50">
                        <tr>
                          <th
                            scope="col"
                            className="px-6 py-3 text-left text-xs font-medium text-default-500 uppercase tracking-wider"
                          >
                            Description
                          </th>
                          <th
                            scope="col"
                            className="px-6 py-3 text-center text-xs font-medium text-default-500 uppercase tracking-wider"
                          >
                            Rate
                          </th>
                          <th
                            scope="col"
                            className="px-6 py-3 text-center text-xs font-medium text-default-500 uppercase tracking-wider"
                          >
                            Quantity
                          </th>
                          <th
                            scope="col"
                            className="px-6 py-3 text-right text-xs font-medium text-default-500 uppercase tracking-wider"
                          >
                            Amount
                          </th>
                          {isEditable && (
                            <th
                              scope="col"
                              className="px-6 py-3 text-center text-xs font-medium text-default-500 uppercase tracking-wider"
                            >
                              Actions
                            </th>
                          )}
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-default-200">
                        {groupedItems["Tambahan"].map((item) => (
                          <tr key={item.id} className="hover:bg-default-50">
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="text-sm font-medium text-default-900 flex items-center">
                                {item.description}
                                {item.is_manual && (
                                  <span className="ml-2 px-1.5 py-0.5 text-xs rounded bg-default-100 text-default-600">
                                    Manual
                                  </span>
                                )}
                              </div>
                              <div className="text-xs text-default-500">
                                {item.pay_code_id}
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-center">
                              <div className="text-sm text-default-900">
                                {formatCurrency(item.rate)}
                                <span className="text-xs text-default-500 ml-1">
                                  /{item.rate_unit}
                                </span>
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-center">
                              <div className="text-sm text-default-900">
                                {item.quantity}
                                <span className="text-xs text-default-500 ml-1">
                                  {item.rate_unit === "Hour"
                                    ? "hours"
                                    : item.rate_unit === "Day"
                                    ? "days"
                                    : item.rate_unit === "Fixed"
                                    ? ""
                                    : item.rate_unit.toLowerCase()}
                                </span>
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-right">
                              <div className="text-sm font-medium text-default-900">
                                {formatCurrency(item.amount)}
                              </div>
                            </td>
                            {isEditable && (
                              <td className="px-6 py-4 whitespace-nowrap text-center">
                                <button
                                  onClick={() => {
                                    setItemToDelete(item);
                                    setShowDeleteDialog(true);
                                  }}
                                  className="text-rose-600 hover:text-rose-800"
                                  title="Delete Item"
                                >
                                  <IconTrash size={18} />
                                </button>
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Overtime Pay Items */}
              {groupedItems["Overtime"].length > 0 && (
                <div className="mb-6">
                  <h3 className="text-md font-medium text-default-700 mb-2">
                    Overtime Pay
                  </h3>
                  <div className="border rounded-lg overflow-hidden">
                    <table className="min-w-full divide-y divide-default-200">
                      <thead className="bg-default-50">
                        <tr>
                          <th
                            scope="col"
                            className="px-6 py-3 text-left text-xs font-medium text-default-500 uppercase tracking-wider"
                          >
                            Description
                          </th>
                          <th
                            scope="col"
                            className="px-6 py-3 text-center text-xs font-medium text-default-500 uppercase tracking-wider"
                          >
                            Rate
                          </th>
                          <th
                            scope="col"
                            className="px-6 py-3 text-center text-xs font-medium text-default-500 uppercase tracking-wider"
                          >
                            Quantity
                          </th>
                          <th
                            scope="col"
                            className="px-6 py-3 text-right text-xs font-medium text-default-500 uppercase tracking-wider"
                          >
                            Amount
                          </th>
                          {isEditable && (
                            <th
                              scope="col"
                              className="px-6 py-3 text-center text-xs font-medium text-default-500 uppercase tracking-wider"
                            >
                              Actions
                            </th>
                          )}
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-default-200">
                        {groupedItems["Overtime"].map((item) => (
                          <tr key={item.id} className="hover:bg-default-50">
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="text-sm font-medium text-default-900">
                                {item.description}
                              </div>
                              <div className="text-xs text-default-500">
                                {item.pay_code_id}
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-center">
                              <div className="text-sm text-default-900">
                                {formatCurrency(item.rate)}
                                <span className="text-xs text-default-500 ml-1">
                                  /{item.rate_unit}
                                </span>
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-center">
                              <div className="text-sm text-default-900">
                                {item.quantity}
                                <span className="text-xs text-default-500 ml-1">
                                  {item.rate_unit === "Hour"
                                    ? "hours"
                                    : item.rate_unit === "Day"
                                    ? "days"
                                    : item.rate_unit === "Fixed"
                                    ? ""
                                    : item.rate_unit.toLowerCase()}
                                </span>
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-right">
                              <div className="text-sm font-medium text-default-900">
                                {formatCurrency(item.amount)}
                              </div>
                            </td>
                            {isEditable && (
                              <td className="px-6 py-4 whitespace-nowrap text-center">
                                {/* Overtime items typically can't be deleted */}
                                {item.is_manual && (
                                  <button
                                    onClick={() => {
                                      setItemToDelete(item);
                                      setShowDeleteDialog(true);
                                    }}
                                    className="text-rose-600 hover:text-rose-800"
                                    title="Delete Item"
                                  >
                                    <IconTrash size={18} />
                                  </button>
                                )}
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {payroll.items.length === 0 && (
                <div className="text-center py-8 border rounded-lg">
                  <p className="text-default-500">No payroll items found.</p>
                  {isEditable && (
                    <Button
                      onClick={() => setShowAddItemModal(true)}
                      color="sky"
                      variant="outline"
                      className="mt-4"
                    >
                      Add Manual Item
                    </Button>
                  )}
                </div>
              )}
            </div>

            {/* Pay Slip Preview Tab */}
            <div className="mt-4">
              <h2 className="text-lg font-medium text-default-800 mb-4">
                Pay Slip Preview
              </h2>
              <PaySlipPreview payroll={payroll} className="max-w-4xl mx-auto" />
            </div>
          </Tab>
        </div>
      </div>

      {/* Add Manual Item Modal */}
      <AddManualItemModal
        isOpen={showAddItemModal}
        onClose={() => setShowAddItemModal(false)}
        employeePayrollId={Number(id)}
        onItemAdded={fetchEmployeePayroll}
      />

      {/* Pay Slip Modal */}
      <PaySlipModal
        isOpen={showPaySlipModal}
        onClose={() => setShowPaySlipModal(false)}
        payroll={payroll}
      />

      {/* Delete Item Confirmation Dialog */}
      <ConfirmationDialog
        isOpen={showDeleteDialog}
        onClose={() => {
          setShowDeleteDialog(false);
          setItemToDelete(null);
        }}
        onConfirm={handleDeleteItem}
        title="Delete Payroll Item"
        message={`Are you sure you want to delete this item: ${itemToDelete?.description}?`}
        confirmButtonText={isDeleting ? "Deleting..." : "Delete"}
        variant="danger"
      />
    </div>
  );
};

export default EmployeePayrollDetailsPage;
