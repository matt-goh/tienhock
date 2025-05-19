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
import { ContextField, getJobConfig } from "../../configs/payrollJobConfigs";
import ContextLinkedBadge from "./ContextLinkedBadge";
import {
  IconBriefcase,
  IconLink,
  IconUser,
  IconPackage,
} from "@tabler/icons-react";
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
  source?: "job" | "employee";
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
  salesmanProducts?: any[]; // Products sold by this salesman
  locationType?: "Local" | "Outstation"; // Location type for salesman
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
  salesmanProducts = [],
  locationType = "Local",
}) => {
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [loading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectAll, setSelectAll] = useState(false);
  const [originalActivities, setOriginalActivities] = useState<ActivityItem[]>(
    []
  );
  const [searchTerm, setSearchTerm] = useState<string>("");
  const isSalesman = jobType === "SALESMAN";
  const jobConfig = getJobConfig(jobType);

  useEffect(() => {
    if (isOpen && employee) {
      if (existingActivities && existingActivities.length > 0) {
        // First, make a deep copy of existing activities to avoid mutation issues
        const activitiesWithContext = JSON.parse(
          JSON.stringify(existingActivities)
        );

        // Process each activity
        for (let i = 0; i < activitiesWithContext.length; i++) {
          const activity = activitiesWithContext[i];

          // For salesman, deselect Hour-based pay codes
          if (isSalesman && activity.rateUnit === "Hour") {
            activity.isSelected = false;
            activity.calculatedAmount = 0;
            continue; // Skip to next activity
          }

          // Process product-linked activities for salesmen
          if (isSalesman && activity.rateUnit === jobConfig?.replaceUnits) {
            // Find a matching product by ID
            const matchingProduct = salesmanProducts.find(
              (p) => String(p.product_id) === String(activity.payCodeId)
            );

            if (matchingProduct) {
              const quantity = parseFloat(matchingProduct.quantity) || 0;
              console.log(
                `Found matching product for ${activity.payCodeId} with quantity ${quantity}`
              );

              if (quantity > 0) {
                activity.unitsProduced = quantity;
                activity.isSelected = true;
              }
            }
          }

          // Handle context-linked fields
          const contextField = contextLinkedPayCodes[activity.payCodeId];
          if (contextField && contextData[contextField.id] !== undefined) {
            activity.unitsProduced = contextData[contextField.id];
            activity.isContextLinked = true;
          }
        }

        // Recalculate all amounts
        const calculatedActivities = calculateActivitiesAmounts(
          activitiesWithContext,
          isSalesman ? 0 : employeeHours,
          contextData,
          locationType
        );

        setActivities(calculatedActivities);
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
    existingActivities,
    contextLinkedPayCodes,
    contextData,
    employeeHours,
    isSalesman,
    locationType,
    jobConfig,
    salesmanProducts,
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

    // Use the centralized calculation function
    const updatedActivities = calculateActivitiesAmounts(
      newActivities,
      isSalesman ? 0 : employeeHours, // Use 0 hours for salesmen
      contextData,
      locationType
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
              <DialogPanel className="w-full max-w-6xl transform overflow-hidden rounded-2xl bg-white p-6 text-left align-middle shadow-xl transition-all">
                <DialogTitle
                  as="h3"
                  className="text-lg font-medium leading-6 text-gray-900"
                >
                  Manage Activities for {employee?.name}
                </DialogTitle>

                <div className="mt-2">
                  <div className="grid grid-cols-4 gap-4 mb-4">
                    <div>
                      <p className="text-sm text-gray-500">Job</p>
                      <Link
                        to={`/catalogue/job?id=${jobType}`}
                        className="font-medium hover:underline hover:text-sky-600"
                      >
                        {jobName}
                      </Link>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">
                        {isSalesman && locationType ? "Location" : "Hours"}
                      </p>
                      <p className="font-medium">
                        {isSalesman && locationType ? (
                          <span className="flex items-center">
                            {locationType}
                          </span>
                        ) : (
                          `${employeeHours} hours`
                        )}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">Day Type</p>
                      <p className="font-medium">{dayType}</p>
                    </div>
                    <div className="flex w-full items-center">
                      <div className="relative w-full">
                        <input
                          type="text"
                          className="w-full p-2 pl-4 border border-gray-300 rounded-full text-sm"
                          placeholder="Search activities..."
                          value={searchTerm}
                          onChange={(e) => setSearchTerm(e.target.value)}
                        />
                        {searchTerm && (
                          <button
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700"
                            onClick={() => setSearchTerm("")}
                            title="Clear search"
                          >
                            ×
                          </button>
                        )}
                      </div>
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
                                  (() => {
                                    const filteredActivities =
                                      activities.filter(
                                        (activity) =>
                                          searchTerm === "" ||
                                          activity.description
                                            .toLowerCase()
                                            .includes(
                                              searchTerm.toLowerCase()
                                            ) ||
                                          activity.payCodeId
                                            .toLowerCase()
                                            .includes(searchTerm.toLowerCase())
                                      );

                                    if (filteredActivities.length === 0) {
                                      return (
                                        <tr>
                                          <td
                                            colSpan={4}
                                            className="px-3 py-4 text-center text-sm text-gray-500"
                                          >
                                            No results found for "{searchTerm}".
                                          </td>
                                        </tr>
                                      );
                                    }

                                    return filteredActivities.map(
                                      (activity, index) => {
                                        // Get the original index in the full activities array
                                        const originalIndex =
                                          activities.findIndex(
                                            (a) =>
                                              a.payCodeId === activity.payCodeId
                                          );
                                        return (
                                          <tr
                                            key={activity.payCodeId}
                                            className={`${
                                              activity.isSelected
                                                ? "bg-sky-50"
                                                : ""
                                            } cursor-pointer`}
                                            onClick={(e) => {
                                              // Prevent toggle when clicking the input
                                              if (
                                                e.target instanceof
                                                HTMLInputElement
                                              )
                                                return;
                                              handleToggleActivity(
                                                originalIndex
                                              );
                                            }}
                                          >
                                            <td className="px-3 py-4">
                                              <Checkbox
                                                checked={activity.isSelected}
                                                onChange={() =>
                                                  handleToggleActivity(
                                                    originalIndex
                                                  )
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
                                                    to={`/catalogue/pay-codes?desc=${activity.payCodeId}`}
                                                    className="hover:text-sky-600 hover:underline"
                                                    onClick={(e) =>
                                                      e.stopPropagation()
                                                    }
                                                  >
                                                    {activity.description
                                                      .length > 80
                                                      ? `${activity.description.substring(
                                                          0,
                                                          80
                                                        )}...`
                                                      : activity.description}
                                                  </Link>
                                                  <span className="ml-1.5 text-xs text-default-500 rounded-full bg-default-100 px-2 py-0.5 flex-shrink-0">
                                                    {activity.payCodeId}
                                                  </span>
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
                                                  {/* Add the source badges HERE */}
                                                  {activity.source ===
                                                    "employee" && (
                                                    <span className="ml-1.5 inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium bg-sky-100 text-sky-700">
                                                      <IconUser
                                                        size={10}
                                                        className="mr-0.5"
                                                      />
                                                      Staff
                                                    </span>
                                                  )}
                                                  {activity.source ===
                                                    "job" && (
                                                    <span className="ml-1.5 inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
                                                      <IconBriefcase
                                                        size={10}
                                                        className="mr-0.5"
                                                      />
                                                      Job
                                                    </span>
                                                  )}
                                                  {isSalesman &&
                                                    salesmanProducts.find(
                                                      (p) =>
                                                        String(p.product_id) ===
                                                        String(
                                                          activity.payCodeId
                                                        )
                                                    ) && (
                                                      <span className="ml-1.5 inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700">
                                                        <IconPackage
                                                          size={10}
                                                          className="mr-0.5"
                                                        />
                                                        Product
                                                      </span>
                                                    )}
                                                </span>
                                                <div className="text-xs text-gray-500">
                                                  {activity.payType} •{" "}
                                                  {activity.rateUnit}
                                                  {activity.rateUnit !==
                                                    "Percent" &&
                                                    activity.rateUnit !==
                                                      "Fixed" && (
                                                      <span className="ml-1">
                                                        @ RM
                                                        {activity.rate.toFixed(
                                                          2
                                                        )}
                                                        /{activity.rateUnit}
                                                      </span>
                                                    )}
                                                  {activity.rateUnit ===
                                                    "Percent" && (
                                                    <span className="ml-1">
                                                      @ {activity.rate}%
                                                    </span>
                                                  )}
                                                  {activity.rateUnit ===
                                                    "Fixed" && (
                                                    <span className="ml-1">
                                                      @ RM
                                                      {activity.rate.toFixed(2)}
                                                    </span>
                                                  )}
                                                  {/* Show units produced for non-Hour units or when explicitly available */}
                                                  {activity.unitsProduced !==
                                                    null &&
                                                    activity.rateUnit !==
                                                      "Hour" &&
                                                    activity.rateUnit !==
                                                      "Fixed" && (
                                                      <span className="text-default-500 ml-2">
                                                        •{" "}
                                                        {activity.unitsProduced}{" "}
                                                        {activity.rateUnit ===
                                                        "Percent"
                                                          ? "Units"
                                                          : activity.rateUnit}
                                                      </span>
                                                    )}
                                                  {activity.payType ===
                                                    "Overtime" &&
                                                    activity.rateUnit ===
                                                      "Hour" && (
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
                                              (activity.rateUnit ===
                                                "Percent" &&
                                                activity.isContextLinked) ? (
                                                <div className="relative">
                                                  {/* For salesmen with products, show product units */}
                                                  {isSalesman &&
                                                  activity.rateUnit ===
                                                    jobConfig?.replaceUnits ? (
                                                    <input
                                                      type="number"
                                                      className={`w-16 text-center border border-gray-300 rounded p-1 pl-4 text-sm ${
                                                        !activity.isSelected
                                                          ? "bg-gray-100 cursor-not-allowed"
                                                          : ""
                                                      }`}
                                                      value={
                                                        activity.unitsProduced?.toString() ||
                                                        "0"
                                                      }
                                                      onChange={(e) =>
                                                        handleUnitsChange(
                                                          originalIndex,
                                                          e.target.value
                                                        )
                                                      }
                                                      onClick={(e) =>
                                                        e.stopPropagation()
                                                      }
                                                      disabled={
                                                        !activity.isSelected
                                                      }
                                                      min="0"
                                                      step="1"
                                                    />
                                                  ) : (
                                                    /* Standard input for non-salesman units */
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
                                                          originalIndex,
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
                                                  )}
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
                                        );
                                      }
                                    );
                                  })()
                                )}
                              </tbody>
                            </table>
                          </div>
                          <div className="bg-gray-50 border-t border-gray-200">
                            <div className="px-3 py-3 flex justify-between">
                              <div className="text-sm font-medium text-gray-900 flex items-center">
                                <span>Total</span>
                                <span className="ml-2 px-2 py-0.5 bg-sky-100 text-sky-700 rounded-full text-xs">
                                  {
                                    activities.filter((a) => a.isSelected)
                                      .length
                                  }{" "}
                                  activities
                                </span>
                              </div>
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
