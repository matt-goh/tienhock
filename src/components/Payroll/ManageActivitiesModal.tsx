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
import { ContextField } from "../../configs/payrollJobConfigs";
import ContextLinkedBadge from "./ContextLinkedBadge";
import { IconLink } from "@tabler/icons-react";
import { Link } from "react-router-dom";
import { calculateActivitiesAmounts } from "../../utils/payroll/calculateActivityAmount";

export interface ActivityItem {
  payCodeId: string;
  description: string;
  payType: string;
  rateUnit: string;
  rate: number;
  isDefault: boolean;
  isSelected: boolean;
  unitsProduced?: number;
  calculatedAmount: number;
  isContextLinked?: boolean;
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
  contextLinkedPayCodes?: Record<string, ContextField>;
  contextData?: Record<string, any>;
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
  contextLinkedPayCodes = {},
  contextData = {},
}) => {
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectAll, setSelectAll] = useState(false);
  const [originalActivities, setOriginalActivities] = useState<ActivityItem[]>(
    []
  );

  // When initializing activities, handle context-linked pay codes
  useEffect(() => {
    if (isOpen && employee) {
      if (existingActivities && existingActivities.length > 0) {
        // Check for context-linked pay codes and update their units
        const activitiesWithContext = existingActivities.map((activity) => {
          const contextField = contextLinkedPayCodes[activity.payCodeId];
          if (contextField && contextData[contextField.id] !== undefined) {
            return {
              ...activity,
              unitsProduced: contextData[contextField.id],
              isContextLinked: true,
            };
          }
          return activity;
        });

        // Use our centralized calculation function instead
        const calculatedActivities = calculateActivitiesAmounts(
          activitiesWithContext,
          employeeHours,
          contextData
        );

        setActivities(calculatedActivities);
        // Store original state for cancellation
        setOriginalActivities(JSON.parse(JSON.stringify(calculatedActivities)));
      } else {
        setActivities([]);
        setOriginalActivities([]);
      }
      setError(null);
    }
  }, [
    isOpen,
    employee?.id,
    employee?.jobType,
    existingActivities,
    contextLinkedPayCodes,
    contextData,
    employeeHours,
  ]);

  useEffect(() => {
    const allSelected =
      activities.length > 0 && activities.every((a) => a.isSelected);
    setSelectAll(allSelected);
  }, [activities]);

  const handleSelectAll = () => {
    const newSelectAll = !selectAll;
    setSelectAll(newSelectAll);

    const updatedActivities = activities.map((activity) => ({
      ...activity,
      isSelected: newSelectAll,
    }));

    const recalculatedActivities = calculateActivitiesAmounts(
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
    const updatedActivities = calculateActivitiesAmounts(
      newActivities,
      employeeHours
    );
    setActivities(updatedActivities);
  };

  // Update units produced
  const handleUnitsChange = (index: number, value: string) => {
    const newActivities = [...activities];
    newActivities[index].unitsProduced = value === "" ? 0 : Number(value);

    // Recalculate amounts after changing units
    const updatedActivities = calculateActivitiesAmounts(
      newActivities,
      employeeHours
    );
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

  const handleClose = () => {
    // Reset to original activities state
    setActivities([...originalActivities]);
    onClose();
  };

  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={handleClose}>
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
              <DialogPanel className="w-full max-w-5xl transform overflow-hidden rounded-2xl bg-white p-6 text-left align-middle shadow-xl transition-all">
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
                      <Link
                        to={`/catalogue/job?id=${jobType}`}
                        className="hover:underline hover:text-sky-600"
                      >
                        {jobName}
                      </Link>
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
                                          onChange={() =>
                                            handleToggleActivity(index)
                                          }
                                          size={20}
                                          checkedColor="text-sky-600"
                                          className="align-middle"
                                        />
                                      </td>
                                      <td className="px-3 py-4 truncate">
                                        <div className="flex flex-col">
                                          <span
                                            className="text-sm font-medium text-gray-900 w-fit"
                                            title={`${activity.description} (${activity.payCodeId})`}
                                          >
                                            <Link
                                              to={`/catalogue/pay-codes?desc=${activity.description}`}
                                              className="hover:text-sky-600 hover:underline"
                                              onClick={(e) =>
                                                e.stopPropagation()
                                              }
                                            >
                                              {activity.description.length > 85
                                                ? `${activity.description.substring(
                                                    0,
                                                    85
                                                  )}...`
                                                : activity.description}
                                            </Link>
                                            {activity.payType ===
                                              "Overtime" && (
                                              <span className="ml-2 text-xs text-amber-600">
                                                (OT)
                                              </span>
                                            )}
                                            {activity.isContextLinked && (
                                              <ContextLinkedBadge
                                                className="ml-2"
                                                contextFieldLabel={
                                                  Object.values(
                                                    contextLinkedPayCodes
                                                  ).find(
                                                    (field) =>
                                                      field.linkedPayCode ===
                                                      activity.payCodeId
                                                  )?.label || "Context"
                                                }
                                                contextValue={
                                                  contextData[
                                                    Object.values(
                                                      contextLinkedPayCodes
                                                    ).find(
                                                      (field) =>
                                                        field.linkedPayCode ===
                                                        activity.payCodeId
                                                    )?.id || ""
                                                  ]
                                                }
                                              />
                                            )}
                                          </span>
                                          <div className="text-xs text-gray-500">
                                            {activity.payType} •{" "}
                                            {activity.rateUnit}
                                            {activity.rateUnit !== "Percent" &&
                                              activity.rateUnit !== "Fixed" && (
                                                <span className="ml-1">
                                                  @ RM{activity.rate.toFixed(2)}
                                                  /{activity.rateUnit}
                                                </span>
                                              )}
                                            {activity.rateUnit ===
                                              "Percent" && (
                                              <span className="ml-1">
                                                @ {activity.rate}%
                                              </span>
                                            )}
                                            {activity.rateUnit === "Fixed" && (
                                              <span className="ml-1">
                                                @ RM{activity.rate.toFixed(2)}
                                              </span>
                                            )}
                                            {/* Show units produced for non-Hour units or when explicitly available */}
                                            {activity.unitsProduced !== null &&
                                              activity.rateUnit !== "Hour" &&
                                              activity.rateUnit !== "Fixed" && (
                                                <span className="text-default-500 ml-2">
                                                  • {activity.unitsProduced}{" "}
                                                  {activity.rateUnit ===
                                                  "Percent"
                                                    ? "Units"
                                                    : activity.rateUnit}
                                                </span>
                                              )}
                                            {activity.payType === "Overtime" &&
                                              activity.rateUnit === "Hour" && (
                                                <span className="ml-1 text-amber-600">
                                                  (Hours {">"} 8)
                                                </span>
                                              )}
                                          </div>
                                        </div>
                                      </td>
                                      <td className="px-3 py-4 text-center">
                                        {activity.rateUnit === "Bag" ||
                                        activity.rateUnit === "Trip" ||
                                        activity.rateUnit === "Day" ||
                                        (activity.rateUnit === "Percent" &&
                                          activity.isContextLinked) ? (
                                          <div className="relative">
                                            <input
                                              type="number"
                                              className={`w-16 text-center border border-gray-300 rounded p-1 pl-4 text-sm ${
                                                activity.isContextLinked
                                                  ? "bg-gray-100 cursor-not-allowed"
                                                  : "disabled:bg-gray-100"
                                              }`}
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
                                              onClick={(e) =>
                                                e.stopPropagation()
                                              }
                                              disabled={
                                                !activity.isSelected ||
                                                activity.isContextLinked
                                              }
                                              min="0"
                                              step="1"
                                              readOnly={
                                                activity.isContextLinked
                                              }
                                            />
                                            {activity.isContextLinked && (
                                              <span className="absolute -right-5 top-1/2 -translate-y-1/2">
                                                <IconLink
                                                  size={14}
                                                  className="text-sky-600"
                                                />
                                              </span>
                                            )}
                                          </div>
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
                    onClick={handleClose}
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
