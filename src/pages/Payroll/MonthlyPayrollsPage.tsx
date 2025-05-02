// src/pages/Payroll/MonthlyPayrollsPage.tsx
import React, { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { IconPlus, IconEye, IconClockPlay } from "@tabler/icons-react";
import Button from "../../components/Button";
import LoadingSpinner from "../../components/LoadingSpinner";
import {
  getMonthlyPayrolls,
  createMonthlyPayroll,
  getMonthName,
} from "../../utils/payroll/payrollUtils";
import CreatePayrollModal from "../../components/Payroll/CreatePayrollModal";
import toast from "react-hot-toast";

interface MonthlyPayroll {
  id: number;
  year: number;
  month: number;
  status: "Processing" | "Completed" | "Finalized";
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

const MonthlyPayrollsPage: React.FC = () => {
  const [payrolls, setPayrolls] = useState<MonthlyPayroll[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    fetchPayrolls();
  }, []);

  const fetchPayrolls = async () => {
    setIsLoading(true);
    try {
      const response = await getMonthlyPayrolls();
      setPayrolls(response);

      // Only redirect if we're on the main entry path
      // And not on the explicit list view
      if (location.pathname === "/payroll/monthly-payrolls") {
        const currentDate = new Date();
        const currentMonth = currentDate.getMonth() + 1;
        const currentYear = currentDate.getFullYear();

        const currentMonthPayroll = response.find(
          (payroll: { month: number; year: number }) =>
            payroll.month === currentMonth && payroll.year === currentYear
        );

        if (currentMonthPayroll) {
          navigate(`/payroll/monthly-payrolls/${currentMonthPayroll.id}`);
        }
      }
    } catch (error) {
      console.error("Error fetching payrolls:", error);
      toast.error("Failed to load payrolls");
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreatePayroll = async (year: number, month: number) => {
    try {
      const response = await createMonthlyPayroll(year, month);
      toast.success("Payroll created successfully");
      setShowCreateModal(false);
      await fetchPayrolls();

      // Navigate to the new payroll details page
      if (response && response.payroll && response.payroll.id) {
        navigate(`/payroll/monthly-payrolls/${response.payroll.id}`);
      }
    } catch (error: any) {
      // If a payroll already exists, offer to navigate to it
      if (error.response?.status === 409 && error.response?.data?.existing_id) {
        toast.error("A payroll already exists for this month and year");
        const existingId = error.response.data.existing_id;

        // Wait a moment to ensure the error toast is visible
        setTimeout(() => {
          const confirmed = window.confirm(
            "Would you like to view the existing payroll?"
          );
          if (confirmed) {
            navigate(`/payroll/monthly-payrolls/${existingId}`);
          }
        }, 500);
      } else {
        toast.error("Failed to create payroll");
      }
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "Processing":
        return "bg-sky-100 text-sky-700";
      case "Completed":
        return "bg-emerald-100 text-emerald-700";
      case "Finalized":
        return "bg-amber-100 text-amber-700";
      default:
        return "bg-default-100 text-default-700";
    }
  };

  return (
    <div className="relative w-full space-y-4 mx-4 md:mx-6">
      <div className="flex flex-col md:flex-row justify-between items-center">
        <h1 className="text-xl font-semibold text-default-800">
          Monthly Payrolls
        </h1>
        <div className="mt-4 md:mt-0">
          <Button
            onClick={() => setShowCreateModal(true)}
            icon={IconPlus}
            color="sky"
          >
            Create Monthly Payroll
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20">
          <LoadingSpinner />
        </div>
      ) : payrolls.length > 0 ? (
        <div className="bg-white rounded-lg border border-default-200 shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-default-200">
              <thead className="bg-default-100">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-default-600">
                    Period
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-default-600">
                    Created
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium uppercase tracking-wider text-default-600">
                    Status
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-default-600">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-default-200 bg-white">
                {payrolls.map((payroll) => (
                  <tr key={payroll.id} className="hover:bg-default-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-default-900">
                        {getMonthName(payroll.month)} {payroll.year}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-default-500">
                        {format(new Date(payroll.created_at), "dd MMM yyyy")}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(
                          payroll.status
                        )}`}
                      >
                        {payroll.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      <div className="flex items-center justify-end space-x-3">
                        <button
                          onClick={() =>
                            navigate(`/payroll/monthly-payrolls/${payroll.id}`)
                          }
                          className="text-sky-600 hover:text-sky-800"
                          title="View Details"
                        >
                          <IconEye size={18} />
                        </button>
                        {payroll.status === "Processing" && (
                          <button
                            onClick={() =>
                              navigate(
                                `/payroll/monthly-payrolls/${payroll.id}/process`
                              )
                            }
                            className="text-emerald-600 hover:text-emerald-800"
                            title="Process Payroll"
                          >
                            <IconClockPlay size={18} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-default-200 p-6 text-center">
          <p className="text-default-500">
            No payrolls found. Create your first monthly payroll.
          </p>
        </div>
      )}

      <CreatePayrollModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreatePayroll={handleCreatePayroll}
        existingPayrolls={payrolls}
      />
    </div>
  );
};

export default MonthlyPayrollsPage;
