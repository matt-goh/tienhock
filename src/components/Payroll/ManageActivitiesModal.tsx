// src/components/Payroll/ManageActivitiesModal.tsx
import React, { useState, useEffect, Fragment, useMemo } from "react";
import {
  Dialog,
  DialogPanel,
  DialogTitle,
  Transition,
  TransitionChild,
} from "@headlessui/react";
import Button from "../Button";
import { Employee } from "../../types/types";
import Checkbox from "../Checkbox";
import LoadingSpinner from "../LoadingSpinner";

interface ActivityItem {
  payCodeId: string;
  description: string;
  payType: string;
  rateUnit: string;
  rate: number;
  isDefault: boolean;
  isSelected: boolean;
  unitsProduced?: number;
  calculatedAmount: number;
}

interface ManageActivitiesModalProps {
  isOpen: boolean;
  onClose: () => void;
  employee: Employee | null;
  jobType: string;
  jobName: string;
  employeeHours: number;
  dayType: "Biasa" | "Ahad" | "Umum";
  onActivitiesUpdated: (activities: ActivityItem[]) => void;
  existingActivities?: ActivityItem[];
}

const ManageActivitiesModal: React.FC<ManageActivitiesModalProps> = ({
  isOpen,
  onClose,
  employee,
  jobType,
  jobName,
  employeeHours,
  dayType,
  onActivitiesUpdated,
  existingActivities = [],
}) => {
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectAll, setSelectAll] = useState(false);

  // Fetch available pay codes for this job when modal opens
  useEffect(() => {
    if (isOpen && employee) {
      // Only update if we have new activities or if it's the first open
      if (existingActivities && existingActivities.length > 0) {
        setActivities(existingActivities);
      } else {
        // Reset to empty if no activities
        setActivities([]);
      }
      setError(null);
    }
  }, [isOpen, employee?.id, employee?.jobType, existingActivities]);

  useEffect(() => {
    const allSelected =
      activities.length > 0 && activities.every((a) => a.isSelected);
    setSelectAll(allSelected);
  }, [activities]);

  // Calculate amounts based on rate type, hours, and units
  const calculateAmounts = (
    acts: ActivityItem[],
    hours: number
  ): ActivityItem[] => {
    return acts.map((activity) => {
      let calculatedAmount = 0;

      if (activity.isSelected) {
        switch (activity.rateUnit) {
          case "Hour":
            // For overtime pay codes, only apply to hours beyond 8
            if (activity.payType === "Overtime") {
              const overtimeHours = Math.max(0, hours - 8);
              calculatedAmount = activity.rate * overtimeHours;
            } else {
              calculatedAmount = activity.rate * hours;
            }
            break;
          case "Day":
            calculatedAmount = activity.rate; // Daily rate is fixed regardless of hours
            break;
          case "Bag":
          case "Fixed":
            calculatedAmount = activity.rate * (activity.unitsProduced || 0);
            break;
          case "Percent":
            // Percentage of some base amount (would need implementation details)
            calculatedAmount = 0; // Placeholder
            break;
          default:
            calculatedAmount = 0;
        }
      }

      return {
        ...activity,
        calculatedAmount: Number(calculatedAmount.toFixed(2)),
      };
    });
  };

  const handleSelectAll = () => {
    const newSelectAll = !selectAll;
    setSelectAll(newSelectAll);

    const updatedActivities = activities.map((activity) => ({
      ...activity,
      isSelected: newSelectAll,
    }));

    const recalculatedActivities = calculateAmounts(
      updatedActivities,
      employeeHours
    );
    setActivities(recalculatedActivities);
  };

  // Toggle selection of an activity
  const handleToggleActivity = (index: number) => {
    const newActivities = [...activities];
    newActivities[index].isSelected = !newActivities[index].isSelected;

    // Recalculate amounts after toggling
    const updatedActivities = calculateAmounts(newActivities, employeeHours);
    setActivities(updatedActivities);
  };

  // Update units produced
  const handleUnitsChange = (index: number, value: string) => {
    const newActivities = [...activities];
    newActivities[index].unitsProduced = value === "" ? 0 : Number(value);

    // Recalculate amounts after changing units
    const updatedActivities = calculateAmounts(newActivities, employeeHours);
    setActivities(updatedActivities);
  };

  // Calculate total amount
  const totalAmount = useMemo(() => {
    return activities.reduce(
      (sum, activity) =>
        activity.isSelected ? sum + activity.calculatedAmount : sum,
      0
    );
  }, [activities]);

  // Save activities
  const handleSave = () => {
    // Pass all activities back, not just selected ones
    onActivitiesUpdated(activities);
    onClose();
  };

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
              <DialogPanel className="w-full max-w-4xl transform overflow-hidden rounded-2xl bg-white p-6 text-left align-middle shadow-xl transition-all">
                <DialogTitle
                  as="h3"
                  className="text-lg font-medium leading-6 text-gray-900"
                >
                  Manage Activities for {employee?.name}
                </DialogTitle>

                <div className="mt-2">
                  <div className="grid grid-cols-3 gap-4 mb-4">
                    <div>
                      <p className="text-sm text-gray-500">Job</p>
                      <p className="font-medium">{jobName}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">Hours</p>
                      <p className="font-medium">{employeeHours} hours</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">Day Type</p>
                      <p className="font-medium">{dayType}</p>
                    </div>
                  </div>

                  {loading ? (
                    <div className="flex justify-center py-8">
                      <LoadingSpinner />
                    </div>
                  ) : error ? (
                    <div className="text-center py-4 text-red-600">{error}</div>
                  ) : (
                    <>
                      <div className="mt-4">
                        <div className="overflow-x-auto border rounded-lg">
                          {/* Table wrapper with max height and scrollbar */}
                          <div className="max-h-[30rem] overflow-y-auto">
                            <table className="min-w-full divide-y divide-gray-200">
                              <thead className="bg-gray-50 sticky top-0 z-10">
                                <tr>
                                  <th className="w-10 px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase flex items-center tracking-wider">
                                    <Checkbox
                                      checked={selectAll}
                                      onChange={handleSelectAll}
                                      size={20}
                                      checkedColor="text-sky-600"
                                      ariaLabel="Select all activities"
                                    />
                                  </th>
                                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Pay Code & Details
                                  </th>
                                  <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Units
                                  </th>
                                  <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Amount
                                  </th>
                                </tr>
                              </thead>
                              <tbody className="bg-white divide-y divide-gray-200">
                                {activities.length === 0 ? (
                                  <tr>
                                    <td
                                      colSpan={4}
                                      className="px-3 py-4 text-center text-sm text-gray-500"
                                    >
                                      No pay codes available for this job.
                                    </td>
                                  </tr>
                                ) : (
                                  activities.map((activity, index) => (
                                    <tr
                                      key={activity.payCodeId}
                                      className={`${
                                        activity.isSelected ? "bg-sky-50" : ""
                                      } cursor-pointer`}
                                      onClick={(e) => {
                                        // Prevent toggle when clicking the input
                                        if (
                                          e.target instanceof HTMLInputElement
                                        )
                                          return;
                                        handleToggleActivity(index);
                                      }}
                                    >
                                      <td className="px-3 py-4">
                                        <Checkbox
                                          checked={activity.isSelected}
                                          onChange={() => {}} // Empty handler as the row handles the toggle
                                          size={20}
                                          checkedColor="text-sky-600"
                                        />
                                      </td>
                                      <td className="px-3 py-4">
                                        <div className="text-sm font-medium text-gray-900">
                                          {activity.description}
                                          {activity.payType === "Overtime" && (
                                            <span className="ml-2 text-xs text-amber-600">
                                              (OT)
                                            </span>
                                          )}
                                        </div>
                                        <div className="text-xs text-gray-500">
                                          {activity.payType} •{" "}
                                          {activity.rateUnit}
                                          {activity.rateUnit !== "Day" && (
                                            <span className="ml-1">
                                              @ RM{activity.rate.toFixed(2)}/
                                              {activity.rateUnit}
                                            </span>
                                          )}
                                          {activity.rateUnit === "Day" && (
                                            <span className="ml-1">
                                              @ RM{activity.rate.toFixed(2)}/Day
                                            </span>
                                          )}
                                          {activity.payType === "Overtime" &&
                                            activity.rateUnit === "Hour" && (
                                              <span className="ml-1 text-amber-600">
                                                (Hours {">"} 8)
                                              </span>
                                            )}
                                        </div>
                                      </td>
                                      <td className="px-3 py-4 text-center">
                                        {activity.rateUnit === "Bag" ||
                                        activity.rateUnit === "Fixed" ? (
                                          <input
                                            type="number"
                                            className="w-16 text-center border border-gray-300 rounded p-1 pl-4 text-sm disabled:bg-gray-100"
                                            value={
                                              activity.unitsProduced?.toString() ||
                                              "0"
                                            }
                                            onChange={(e) =>
                                              handleUnitsChange(
                                                index,
                                                e.target.value
                                              )
                                            }
                                            onClick={(e) => e.stopPropagation()}
                                            disabled={!activity.isSelected}
                                            min="0"
                                            step="1"
                                          />
                                        ) : (
                                          <span className="text-sm text-gray-500">
                                            —
                                          </span>
                                        )}
                                      </td>
                                      <td className="px-3 py-4 text-right">
                                        {activity.isSelected ? (
                                          <span className="text-sm font-medium text-gray-900">
                                            RM
                                            {activity.calculatedAmount.toFixed(
                                              2
                                            )}
                                          </span>
                                        ) : (
                                          <span className="text-sm text-gray-400">
                                            RM0.00
                                          </span>
                                        )}
                                      </td>
                                    </tr>
                                  ))
                                )}
                              </tbody>
                            </table>
                          </div>
                          <div className="bg-gray-50 border-t border-gray-200">
                            <div className="px-3 py-3 flex justify-between">
                              <span className="text-sm font-medium text-gray-900">
                                Total
                              </span>
                              <span className="text-sm font-medium text-gray-900">
                                RM{totalAmount.toFixed(2)}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </>
                  )}
                </div>

                <div className="mt-6 flex justify-end space-x-3">
                  <Button
                    variant="outline"
                    onClick={onClose}
                    disabled={loading}
                  >
                    Cancel
                  </Button>
                  <Button
                    color="sky"
                    variant="filled"
                    onClick={handleSave}
                    disabled={loading}
                  >
                    Apply Activities
                  </Button>
                </div>
              </DialogPanel>
            </TransitionChild>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
};

export default ManageActivitiesModal;
