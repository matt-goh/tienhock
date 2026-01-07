// src/components/Payroll/ManageActivitiesModal.tsx
import React, { useState, useEffect, Fragment, useMemo, useRef } from "react";
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
import { calculateActivitiesAmounts, calculateActivityAmount } from "../../utils/payroll/calculateActivityAmount";
import SafeLink from "../SafeLink";

export interface ActivityItem {
  payCodeId: string;
  description: string;
  payType: string;
  rateUnit: string;
  rate: number;
  isDefault: boolean;
  isSelected: boolean;
  unitsProduced?: number;
  hoursApplied?: number;
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
  hasUnsavedChanges?: boolean;
  onNavigateAttempt?: (to: string) => void;
  logDate?: string; // Log date for calculating Saturday OT threshold
  isDoubled?: boolean; // Whether x2 doubling is active for SALESMAN_IKUT
}

// Paycodes that are doubled when x2 is active for SALESMAN_IKUT (for visual indicator)
const DOUBLED_PAYCODES = ["BILL", "ELAUN_MT", "ELAUN_MO", "IKUT", "4-COMM_MUAT_MEE", "5-COMM_MUAT_BH"];
// Fixed paycodes that have their amounts doubled (not units)
const FIXED_DOUBLED_PAYCODES = ["ELAUN_MT", "ELAUN_MO", "IKUT"];

// Helper function to apply x2 doubling to activities for SALESMAN_IKUT
const applyDoubling = (activities: ActivityItem[], isDoubled: boolean): ActivityItem[] => {
  if (!isDoubled) return activities;

  return activities.map(activity => {
    // For fixed paycodes (ELAUN_MT, ELAUN_MO, IKUT), double the calculated amount
    if (FIXED_DOUBLED_PAYCODES.includes(activity.payCodeId) && activity.isSelected) {
      return {
        ...activity,
        calculatedAmount: activity.rate * 2,
      };
    }
    // For BILL, the units are already doubled in the parent, so amount is correct
    return activity;
  });
};

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
  hasUnsavedChanges = false,
  onNavigateAttempt = () => {},
  logDate,
  isDoubled = false,
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
  const isSalesmanIkut = jobType === "SALESMAN_IKUT";
  const jobConfig = getJobConfig(jobType);
  const prevEmployeeIdRef = useRef<string | null>(null);
  const prevActivitiesRef = useRef<ActivityItem[]>([]);

  const areActivitiesEqual = (
    activities1: ActivityItem[],
    activities2: ActivityItem[]
  ): boolean => {
    if (activities1.length !== activities2.length) return false;

    return activities1.every((act1, index) => {
      const act2 = activities2[index];
      return (
        act1.payCodeId === act2.payCodeId &&
        act1.isSelected === act2.isSelected &&
        act1.calculatedAmount === act2.calculatedAmount &&
        act1.unitsProduced === act2.unitsProduced
      );
    });
  };

  useEffect(() => {
    if (isOpen && employee) {
      const isNewEmployee = prevEmployeeIdRef.current !== employee.id;
      const activitiesChanged = !areActivitiesEqual(
        existingActivities || [],
        prevActivitiesRef.current
      );

      // Only process if it's a new employee OR if activities actually changed
      if (isNewEmployee || activitiesChanged) {
        prevEmployeeIdRef.current = employee.id;
        prevActivitiesRef.current = existingActivities || [];

        if (existingActivities && existingActivities.length > 0) {
          // First, make a deep copy of existing activities to avoid mutation issues
          const activitiesWithContext = JSON.parse(
            JSON.stringify(existingActivities)
          );

          // Process each activity
          for (let i = 0; i < activitiesWithContext.length; i++) {
            const activity = activitiesWithContext[i];

            // For salesman, deselect Hour-based pay codes
            if (isSalesman && (activity.rateUnit === "Hour" || activity.rateUnit === "Bill")) {
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
            (isSalesman || isSalesmanIkut) ? 0 : employeeHours,
            contextData,
            locationType,
            logDate
          );

          // Apply x2 doubling for SALESMAN_IKUT fixed paycodes
          const finalActivities = isSalesmanIkut
            ? applyDoubling(calculatedActivities, isDoubled)
            : calculatedActivities;

          setActivities(finalActivities);
          setOriginalActivities(
            JSON.parse(JSON.stringify(finalActivities))
          );
        } else {
          setActivities([]);
          setOriginalActivities([]);
        }
        setError(null);
      }
    }
  }, [
    isOpen,
    employee?.id,
    existingActivities,
    contextLinkedPayCodes,
    contextData,
    employeeHours,
    isSalesman,
    isSalesmanIkut,
    isDoubled,
    locationType,
    jobConfig,
    salesmanProducts,
    logDate,
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

    // Recalculate amounts, respecting hoursApplied for each activity
    const recalculatedActivities = updatedActivities.map(activity => ({
      ...activity,
      calculatedAmount: calculateActivityAmount(
        activity,
        activity.hoursApplied || employeeHours,
        contextData,
        locationType,
        logDate
      )
    }));

    // Apply x2 doubling for SALESMAN_IKUT fixed paycodes
    const finalActivities = isSalesmanIkut
      ? applyDoubling(recalculatedActivities, isDoubled)
      : recalculatedActivities;
    setActivities(finalActivities);
  };

  // Toggle selection of an activity
  const handleToggleActivity = (index: number) => {
    const newActivities = [...activities];
    newActivities[index].isSelected = !newActivities[index].isSelected;

    // Recalculate amounts after toggling, respecting hoursApplied for each activity
    const updatedActivities = newActivities.map(activity => ({
      ...activity,
      calculatedAmount: calculateActivityAmount(
        activity,
        activity.hoursApplied || employeeHours,
        contextData,
        locationType,
        logDate
      )
    }));

    // Apply x2 doubling for SALESMAN_IKUT fixed paycodes
    const finalActivities = isSalesmanIkut
      ? applyDoubling(updatedActivities, isDoubled)
      : updatedActivities;
    setActivities(finalActivities);
  };

  // Update units produced
  const handleUnitsChange = (index: number, value: string) => {
    const newActivities = [...activities];
    newActivities[index].unitsProduced = value === "" ? 0 : Number(value);

    // Recalculate amounts, respecting hoursApplied for each activity
    const updatedActivities = newActivities.map(activity => ({
      ...activity,
      calculatedAmount: calculateActivityAmount(
        activity,
        activity.hoursApplied || ((isSalesman || isSalesmanIkut) ? 0 : employeeHours),
        contextData,
        locationType,
        logDate
      )
    }));

    // Apply x2 doubling for SALESMAN_IKUT fixed paycodes
    const finalActivities = isSalesmanIkut
      ? applyDoubling(updatedActivities, isDoubled)
      : updatedActivities;
    setActivities(finalActivities);
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
          <div className="fixed inset-0 bg-black/50 dark:bg-black/70" aria-hidden="true" />
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
              <DialogPanel className="w-full max-w-6xl transform overflow-hidden rounded-2xl bg-white dark:bg-gray-800 p-6 text-left align-middle shadow-xl transition-all">
                <DialogTitle
                  as="h3"
                  className="text-lg font-medium leading-6 text-default-800 dark:text-gray-100"
                >
                  Manage Activities for {employee?.name}
                </DialogTitle>

                <div className="mt-2">
                  <div className="grid grid-cols-4 gap-4 mb-4">
                    <div>
                      <p className="text-sm text-gray-500 dark:text-gray-400">Job</p>
                      <SafeLink
                        to={`/catalogue/job?id=${jobType}`}
                        className="font-medium text-default-900 dark:text-gray-100 hover:underline hover:text-sky-600 dark:hover:text-sky-400"
                        hasUnsavedChanges={hasUnsavedChanges}
                        onNavigateAttempt={onNavigateAttempt}
                      >
                        {jobName}
                      </SafeLink>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        {(isSalesman || isSalesmanIkut) && locationType ? "Location" : "Hours"}
                      </p>
                      <p className="font-medium text-default-900 dark:text-gray-100">
                        {(isSalesman || isSalesmanIkut) && locationType ? (
                          <span className="flex items-center">
                            {locationType}
                          </span>
                        ) : (
                          `${employeeHours} hours`
                        )}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500 dark:text-gray-400">Day Type</p>
                      <p className="font-medium text-default-900 dark:text-gray-100">{dayType}</p>
                    </div>
                    <div className="flex w-full items-center">
                      <div className="relative w-full">
                        <input
                          type="text"
                          className="w-full p-2 pl-4 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-default-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 rounded-full text-sm"
                          placeholder="Search activities..."
                          value={searchTerm}
                          onChange={(e) => setSearchTerm(e.target.value)}
                        />
                        {searchTerm && (
                          <button
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
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
                    <div className="text-center py-3 text-red-600">{error}</div>
                  ) : (
                    <>
                      <div className="mt-4">
                        <div className="overflow-x-auto border border-gray-200 dark:border-gray-700 rounded-lg">
                          {/* Table wrapper with max height and scrollbar */}
                          <div className="max-h-[30rem] overflow-y-auto">
                            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                              <thead className="bg-gray-50 dark:bg-gray-800 sticky top-0 z-10">
                                <tr>
                                  <th className="w-10 px-3 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase flex items-center tracking-wider">
                                    <Checkbox
                                      checked={selectAll}
                                      onChange={handleSelectAll}
                                      size={20}
                                      checkedColor="text-sky-600 dark:text-sky-400"
                                      ariaLabel="Select all activities"
                                    />
                                  </th>
                                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                    Pay Code & Details
                                  </th>
                                  <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                    Units
                                  </th>
                                  <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                    Amount
                                  </th>
                                </tr>
                              </thead>
                              <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                                {activities.length === 0 ? (
                                  <tr>
                                    <td
                                      colSpan={4}
                                      className="px-3 py-3 text-center text-sm text-gray-500 dark:text-gray-400"
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
                                            className="px-3 py-3 text-center text-sm text-gray-500 dark:text-gray-400"
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
                                                ? "bg-sky-50 dark:bg-sky-900/30"
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
                                            <td className="px-3 py-3">
                                              <Checkbox
                                                checked={activity.isSelected}
                                                onChange={() =>
                                                  handleToggleActivity(
                                                    originalIndex
                                                  )
                                                }
                                                size={20}
                                                checkedColor="text-sky-600 dark:text-sky-400"
                                                className="align-middle"
                                              />
                                            </td>
                                            <td className="px-3 py-3 truncate">
                                              <div className="flex flex-col">
                                                <span
                                                  className="text-sm font-medium text-gray-900 dark:text-gray-100 w-fit"
                                                  title={`${activity.description} (${activity.payCodeId})`}
                                                >
                                                  <SafeLink
                                                    to={`/catalogue/pay-codes?desc=${activity.payCodeId}`}
                                                    hasUnsavedChanges={
                                                      hasUnsavedChanges
                                                    }
                                                    onNavigateAttempt={
                                                      onNavigateAttempt ||
                                                      (() => {})
                                                    }
                                                    className="hover:text-sky-600 dark:hover:text-sky-400 hover:underline"
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
                                                  </SafeLink>
                                                  <span className="ml-1.5 text-xs text-default-500 dark:text-gray-400 rounded-full bg-default-100 dark:bg-gray-700 px-2 py-0.5 flex-shrink-0">
                                                    {activity.payCodeId}
                                                  </span>
                                                  {isDoubled && DOUBLED_PAYCODES.includes(activity.payCodeId) && (
                                                    <span className="ml-1.5 inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300">
                                                      x2
                                                    </span>
                                                  )}
                                                  {activity.payType ===
                                                    "Overtime" && (
                                                    <span className="ml-2 text-xs text-amber-600 dark:text-amber-400">
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
                                                    <span className="ml-1.5 inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium bg-sky-100 dark:bg-sky-900/50 text-sky-700 dark:text-sky-300">
                                                      <IconUser
                                                        size={10}
                                                        className="mr-0.5"
                                                      />
                                                      Staff
                                                    </span>
                                                  )}
                                                  {activity.source ===
                                                    "job" && (
                                                    <span className="ml-1.5 inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300">
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
                                                      <span className="ml-1.5 inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300">
                                                        <IconPackage
                                                          size={10}
                                                          className="mr-0.5"
                                                        />
                                                        Product
                                                      </span>
                                                    )}
                                                </span>
                                                <div className="text-xs text-gray-500 dark:text-gray-400">
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
                                                  {/* For Fixed: only show base rate if no units provided */}
                                                  {activity.rateUnit ===
                                                    "Fixed" &&
                                                    !(activity.unitsProduced !== null && activity.unitsProduced !== undefined && activity.unitsProduced > 0) && (
                                                    <span className="ml-1">
                                                      @ RM
                                                      {activity.rate.toFixed(2)}
                                                    </span>
                                                  )}
                                                  {/* Show units produced for non-Hour units or when explicitly available */}
                                                  {activity.unitsProduced !==
                                                    null &&
                                                    activity.unitsProduced !==
                                                      undefined &&
                                                    activity.unitsProduced > 0 &&
                                                    activity.rateUnit !==
                                                      "Hour" &&
                                                    activity.rateUnit !==
                                                      "Bill" && (
                                                      <span className="text-default-500 dark:text-gray-400 ml-2">
                                                        •{" "}
                                                        {activity.rateUnit === "Fixed"
                                                          ? `RM${activity.unitsProduced.toFixed(2)}`
                                                          : `${activity.unitsProduced} ${activity.rateUnit === "Percent" ? "Units" : activity.rateUnit}`}
                                                      </span>
                                                    )}
                                                  {activity.payType ===
                                                    "Overtime" &&
                                                    (activity.rateUnit ===
                                                      "Hour" || activity.rateUnit === "Bill") && (
                                                      <span className="ml-1 text-amber-600 dark:text-amber-400">
                                                        (Hours {">"} {logDate && new Date(logDate).getDay() === 6 ? 5 : 8})
                                                      </span>
                                                    )}
                                                </div>
                                              </div>
                                            </td>
                                            <td className="px-3 py-3 text-center">
                                              {activity.rateUnit === "Bag" ||
                                              activity.rateUnit === "Trip" ||
                                              activity.rateUnit === "Day" ||
                                              activity.rateUnit === "Fixed" ||
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
                                                      className={`w-16 text-center border border-gray-300 dark:border-gray-600 rounded p-1 pl-4 text-sm bg-white dark:bg-gray-700 text-default-900 dark:text-gray-100 ${
                                                        !activity.isSelected
                                                          ? "bg-gray-100 dark:bg-gray-700 cursor-not-allowed"
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
                                                      className={`${activity.rateUnit === "Fixed" ? "w-20" : "w-16"} text-center border border-gray-300 dark:border-gray-600 rounded p-1 pl-4 text-sm bg-white dark:bg-gray-700 text-default-900 dark:text-gray-100 ${
                                                        activity.isContextLinked
                                                          ? "bg-gray-100 dark:bg-gray-700 cursor-not-allowed"
                                                          : "disabled:bg-gray-100 dark:disabled:bg-gray-700"
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
                                                      step={activity.rateUnit === "Fixed" ? "0.01" : "1"}
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
                                                <span className="text-sm text-gray-500 dark:text-gray-400">
                                                  —
                                                </span>
                                              )}
                                            </td>
                                            <td className="px-3 py-3 text-right">
                                              {activity.isSelected ? (
                                                <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                                                  RM
                                                  {activity.calculatedAmount.toFixed(
                                                    2
                                                  )}
                                                </span>
                                              ) : (
                                                <span className="text-sm text-gray-400 dark:text-gray-500">
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
                          <div className="bg-gray-50 dark:bg-gray-900/50 border-t border-gray-200 dark:border-gray-700">
                            <div className="px-3 py-3 flex justify-between">
                              <div className="text-sm font-medium text-gray-900 dark:text-gray-100 flex items-center">
                                <span>Total</span>
                                <span className="ml-2 px-2 py-0.5 bg-sky-100 dark:bg-sky-900/50 text-sky-700 dark:text-sky-300 rounded-full text-xs">
                                  {
                                    activities.filter((a) => a.isSelected)
                                      .length
                                  }{" "}
                                  activities
                                </span>
                              </div>
                              <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
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
