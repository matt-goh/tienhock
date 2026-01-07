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
import LoadingSpinner from "../LoadingSpinner";
import { ContextField, getJobConfig } from "../../configs/payrollJobConfigs";
import ContextLinkedBadge from "./ContextLinkedBadge";
import {
  IconBriefcase,
  IconLink,
  IconUser,
  IconPackage,
  IconPlus,
  IconCheck,
  IconSearch,
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
  salesmanProducts?: any[];
  locationType?: "Local" | "Outstation";
  hasUnsavedChanges?: boolean;
  onNavigateAttempt?: (to: string) => void;
  logDate?: string;
  isDoubled?: boolean;
}

// Paycodes that are doubled when x2 is active for SALESMAN_IKUT (for visual indicator)
const DOUBLED_PAYCODES = ["BILL", "ELAUN_MT", "ELAUN_MO", "IKUT", "4-COMM_MUAT_MEE", "5-COMM_MUAT_BH"];
// Fixed paycodes that have their amounts doubled (not units)
const FIXED_DOUBLED_PAYCODES = ["ELAUN_MT", "ELAUN_MO", "IKUT"];

// Helper function to apply x2 doubling to activities for SALESMAN_IKUT
const applyDoubling = (activities: ActivityItem[], isDoubled: boolean): ActivityItem[] => {
  if (!isDoubled) return activities;

  return activities.map(activity => {
    if (FIXED_DOUBLED_PAYCODES.includes(activity.payCodeId) && activity.isSelected) {
      return {
        ...activity,
        calculatedAmount: activity.rate * 2,
      };
    }
    return activity;
  });
};

// Helper function to determine if units input should be shown
const showUnitsInput = (activity: ActivityItem): boolean => {
  return (
    activity.rateUnit === "Bag" ||
    activity.rateUnit === "Trip" ||
    activity.rateUnit === "Day" ||
    activity.rateUnit === "Fixed" ||
    (activity.rateUnit === "Percent" && !!activity.isContextLinked)
  );
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
  const [originalActivities, setOriginalActivities] = useState<ActivityItem[]>([]);
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

      if (isNewEmployee || activitiesChanged) {
        prevEmployeeIdRef.current = employee.id;
        prevActivitiesRef.current = existingActivities || [];

        if (existingActivities && existingActivities.length > 0) {
          const activitiesWithContext = JSON.parse(JSON.stringify(existingActivities));

          for (let i = 0; i < activitiesWithContext.length; i++) {
            const activity = activitiesWithContext[i];

            if (isSalesman && (activity.rateUnit === "Hour" || activity.rateUnit === "Bill")) {
              activity.isSelected = false;
              activity.calculatedAmount = 0;
              continue;
            }

            if (isSalesman && activity.rateUnit === jobConfig?.replaceUnits) {
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

            const contextField = contextLinkedPayCodes[activity.payCodeId];
            if (contextField && contextData[contextField.id] !== undefined) {
              activity.unitsProduced = contextData[contextField.id];
              activity.isContextLinked = true;
            }
          }

          const calculatedActivities = calculateActivitiesAmounts(
            activitiesWithContext,
            (isSalesman || isSalesmanIkut) ? 0 : employeeHours,
            contextData,
            locationType,
            logDate
          );

          const finalActivities = isSalesmanIkut
            ? applyDoubling(calculatedActivities, isDoubled)
            : calculatedActivities;

          setActivities(finalActivities);
          setOriginalActivities(JSON.parse(JSON.stringify(finalActivities)));
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

  // Toggle selection (move between columns)
  const handleToggleActivity = (index: number) => {
    const newActivities = [...activities];
    newActivities[index].isSelected = !newActivities[index].isSelected;

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

    const finalActivities = isSalesmanIkut
      ? applyDoubling(updatedActivities, isDoubled)
      : updatedActivities;
    setActivities(finalActivities);
  };

  // Update units produced
  const handleUnitsChange = (index: number, value: string) => {
    const newActivities = [...activities];
    newActivities[index].unitsProduced = value === "" ? 0 : Number(value);

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

    const finalActivities = isSalesmanIkut
      ? applyDoubling(updatedActivities, isDoubled)
      : updatedActivities;
    setActivities(finalActivities);
  };

  // Filter, split, and sort activities (x2 doubled first when isDoubled)
  const { selectedActivities, unselectedActivities, totalAmount } = useMemo(() => {
    const searchLower = searchTerm.toLowerCase();
    const filtered = activities.filter(
      (activity) =>
        searchTerm === "" ||
        activity.description.toLowerCase().includes(searchLower) ||
        activity.payCodeId.toLowerCase().includes(searchLower)
    );

    // Sort function to group doubled paycodes first
    const sortByDoubled = (a: ActivityItem, b: ActivityItem): number => {
      if (!isDoubled) return 0;
      const aIsDoubled = DOUBLED_PAYCODES.includes(a.payCodeId);
      const bIsDoubled = DOUBLED_PAYCODES.includes(b.payCodeId);
      if (aIsDoubled && !bIsDoubled) return -1;
      if (!aIsDoubled && bIsDoubled) return 1;
      return 0;
    };

    const selected = filtered.filter(a => a.isSelected).sort(sortByDoubled);
    const unselected = filtered.filter(a => !a.isSelected).sort(sortByDoubled);
    const total = selected.reduce((sum, a) => sum + a.calculatedAmount, 0);

    return { selectedActivities: selected, unselectedActivities: unselected, totalAmount: total };
  }, [activities, searchTerm, isDoubled]);

  const handleSave = () => {
    onActivitiesUpdated(activities);
    onClose();
  };

  const handleClose = () => {
    setActivities([...originalActivities]);
    onClose();
  };

  // Get original index for an activity
  const getOriginalIndex = (payCodeId: string) => {
    return activities.findIndex(a => a.payCodeId === payCodeId);
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
                {/* Row 1: Title + Action Buttons */}
                <div className="flex items-center justify-between mb-4">
                  <DialogTitle
                    as="h3"
                    className="text-lg font-semibold text-default-800 dark:text-gray-100"
                  >
                    Manage Activities for {employee?.name}
                  </DialogTitle>
                  <div className="flex items-center space-x-3">
                    <Button variant="outline" onClick={handleClose} disabled={loading}>
                      Cancel
                    </Button>
                    <Button color="sky" variant="filled" onClick={handleSave} disabled={loading}>
                      Apply Activities
                    </Button>
                  </div>
                </div>

                {/* Row 2: Context Info + Search */}
                <div className="flex flex-wrap items-center justify-between gap-3 mb-4 pb-4 border-b border-gray-200 dark:border-gray-700">
                  <div className="flex items-center gap-2 lg:gap-4 text-sm min-w-0">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="text-gray-500 dark:text-gray-400 flex-shrink-0">Job:</span>
                      <SafeLink
                        to={`/catalogue/job?id=${jobType}`}
                        className="font-medium text-default-900 dark:text-gray-100 hover:underline hover:text-sky-600 dark:hover:text-sky-400 truncate max-w-[120px] lg:max-w-none"
                        hasUnsavedChanges={hasUnsavedChanges}
                        onNavigateAttempt={onNavigateAttempt}
                        title={jobName}
                      >
                        {jobName}
                      </SafeLink>
                    </div>
                    <span className="text-gray-300 dark:text-gray-600 flex-shrink-0">•</span>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <span className="text-gray-500 dark:text-gray-400">
                        {(isSalesman || isSalesmanIkut) ? "Location:" : "Hours:"}
                      </span>
                      <span className="font-medium text-default-900 dark:text-gray-100">
                        {(isSalesman || isSalesmanIkut) ? locationType : `${employeeHours}h`}
                      </span>
                    </div>
                    <span className="text-gray-300 dark:text-gray-600 flex-shrink-0">•</span>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <span className="text-gray-500 dark:text-gray-400">Day:</span>
                      <span className="font-medium text-default-900 dark:text-gray-100">{dayType}</span>
                    </div>
                  </div>
                  <div className="relative w-full sm:w-auto sm:flex-shrink-0">
                    <IconSearch size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      type="text"
                      className="w-full sm:w-40 lg:w-64 py-1.5 pl-9 pr-8 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-default-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 rounded-full text-sm"
                      placeholder="Search..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                    />
                    {searchTerm && (
                      <button
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                        onClick={() => setSearchTerm("")}
                      >
                        ×
                      </button>
                    )}
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
                    {/* Two-Column Layout */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                      {/* Left Panel: Selected Activities */}
                      <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden flex flex-col">
                        {/* Left Panel Header */}
                        <div className="flex-shrink-0 px-4 py-2 bg-sky-50 dark:bg-sky-900/30 border-b border-sky-200 dark:border-sky-800">
                          <div className="flex justify-between items-center">
                            <div className="flex items-center gap-2">
                              <IconCheck size={16} className="text-sky-600 dark:text-sky-400" />
                              <span className="text-sm font-medium text-sky-800 dark:text-sky-200">Selected</span>
                              <span className="px-2 py-0.5 bg-sky-100 dark:bg-sky-800 text-sky-700 dark:text-sky-300 rounded-full text-xs font-medium">
                                {selectedActivities.length}
                              </span>
                            </div>
                            <span className="text-sm font-semibold text-sky-700 dark:text-sky-300">
                              RM{totalAmount.toFixed(2)}
                            </span>
                          </div>
                        </div>
                        <div className="flex-1 overflow-y-auto max-h-[20rem] lg:max-h-[26rem]">
                          {selectedActivities.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-12 text-gray-400 dark:text-gray-500">
                              <IconCheck size={40} className="mb-2 opacity-50" />
                              <p className="text-sm">No activities selected</p>
                              <p className="text-xs mt-1">Click items on the right to add</p>
                            </div>
                          ) : (
                            selectedActivities.map((activity) => {
                              const originalIndex = getOriginalIndex(activity.payCodeId);
                              return (
                                <div
                                  key={activity.payCodeId}
                                  className="py-2.5 px-3 border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors cursor-pointer group"
                                  onClick={() => handleToggleActivity(originalIndex)}
                                >
                                  {/* Row 1: Title + Badges */}
                                  <div className="flex items-center gap-1.5 mb-1 min-w-0">
                                    <SafeLink
                                      to={`/catalogue/pay-codes?desc=${activity.payCodeId}`}
                                      hasUnsavedChanges={hasUnsavedChanges}
                                      onNavigateAttempt={onNavigateAttempt}
                                      className="font-medium text-gray-900 dark:text-gray-100 hover:text-sky-600 dark:hover:text-sky-400 hover:underline truncate"
                                      onClick={(e) => e.stopPropagation()}
                                      title={activity.description}
                                    >
                                      {activity.description}
                                    </SafeLink>
                                    <span className="flex-shrink-0 text-xs text-default-500 dark:text-gray-400 rounded-full bg-default-100 dark:bg-gray-700 px-2 py-0.5">
                                      {activity.payCodeId}
                                    </span>
                                    {isDoubled && DOUBLED_PAYCODES.includes(activity.payCodeId) && (
                                      <span className="flex-shrink-0 px-1.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300">
                                        x2
                                      </span>
                                    )}
                                    {activity.payType === "Overtime" && (
                                      <span className="flex-shrink-0 text-xs text-amber-600 dark:text-amber-400">(OT)</span>
                                    )}
                                    {activity.isContextLinked && (
                                      <ContextLinkedBadge
                                        contextFieldLabel={
                                          Object.values(contextLinkedPayCodes).find(
                                            (field) => field.linkedPayCode === activity.payCodeId
                                          )?.label || "Context"
                                        }
                                        contextValue={
                                          contextData[
                                            Object.values(contextLinkedPayCodes).find(
                                              (field) => field.linkedPayCode === activity.payCodeId
                                            )?.id || ""
                                          ]
                                        }
                                      />
                                    )}
                                    {activity.source === "employee" && (
                                      <span className="flex-shrink-0 inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium bg-sky-100 dark:bg-sky-900/50 text-sky-700 dark:text-sky-300">
                                        <IconUser size={10} className="mr-0.5" />
                                        Staff
                                      </span>
                                    )}
                                    {activity.source === "job" && (
                                      <span className="flex-shrink-0 inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300">
                                        <IconBriefcase size={10} className="mr-0.5" />
                                        Job
                                      </span>
                                    )}
                                    {isSalesman && salesmanProducts.find((p) => String(p.product_id) === String(activity.payCodeId)) && (
                                      <span className="flex-shrink-0 inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300">
                                        <IconPackage size={10} className="mr-0.5" />
                                        Product
                                      </span>
                                    )}
                                  </div>

                                  {/* Row 2: Secondary Info . Units ... Amount */}
                                  <div className="flex items-center justify-between text-xs">
                                    <div className="flex items-center gap-1">
                                      <div className="text-gray-500 dark:text-gray-400">
                                        {activity.payType} • {activity.rateUnit}
                                        {activity.rateUnit !== "Percent" && activity.rateUnit !== "Fixed" && (
                                          <span> @ RM{activity.rate.toFixed(2)}/{activity.rateUnit}</span>
                                        )}
                                        {activity.rateUnit === "Percent" && (
                                          <span> @ {activity.rate}%</span>
                                        )}
                                        {activity.rateUnit === "Fixed" && !(activity.unitsProduced && activity.unitsProduced > 0) && (
                                          <span> @ RM{activity.rate.toFixed(2)}</span>
                                        )}
                                        {activity.payType === "Overtime" && (activity.rateUnit === "Hour" || activity.rateUnit === "Bill") && (
                                          <span className="text-amber-600 dark:text-amber-400">
                                            {" "}(Hours {">"} {logDate && new Date(logDate).getDay() === 6 ? 5 : 8})
                                          </span>
                                        )}
                                      </div>
                                      {showUnitsInput(activity) && (
                                        <>
                                          <span className="text-gray-400 dark:text-gray-500">•</span>
                                          <div className="flex items-center gap-1.5">
                                            <span className="text-gray-500 dark:text-gray-400">Units:</span>
                                            <div className="relative">
                                              <input
                                                type="number"
                                                className={`w-20 text-center border border-gray-300 dark:border-gray-600 rounded py-0.5 pl-3 text-sm bg-white dark:bg-gray-700 text-default-900 dark:text-gray-100 ${
                                                  activity.isContextLinked ? "bg-gray-100 dark:bg-gray-600 cursor-not-allowed" : ""
                                                }`}
                                                value={activity.unitsProduced?.toString() || "0"}
                                                onChange={(e) => handleUnitsChange(originalIndex, e.target.value)}
                                                onClick={(e) => e.stopPropagation()}
                                                disabled={activity.isContextLinked}
                                                readOnly={activity.isContextLinked}
                                                min="0"
                                                step={activity.rateUnit === "Fixed" ? "0.01" : "1"}
                                              />
                                              {activity.isContextLinked && (
                                                <IconLink size={12} className="absolute -right-4 top-1/2 -translate-y-1/2 text-sky-600" />
                                              )}
                                            </div>
                                          </div>
                                        </>
                                      )}
                                    </div>
                                    <span className="font-semibold text-gray-900 dark:text-gray-100 text-sm">
                                      RM{activity.calculatedAmount.toFixed(2)}
                                    </span>
                                  </div>
                                </div>
                              );
                            })
                          )}
                        </div>
                      </div>

                      {/* Right Panel: Unselected Activities */}
                      <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden flex flex-col">
                        {/* Right Panel Header */}
                        <div className="flex-shrink-0 px-4 py-2 bg-gray-50 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600">
                          <div className="flex items-center gap-2">
                            <IconPlus size={16} className="text-gray-500 dark:text-gray-400" />
                            <span className="text-sm font-medium text-gray-700 dark:text-gray-200">Available</span>
                            <span className="px-2 py-0.5 bg-gray-100 dark:bg-gray-600 text-gray-600 dark:text-gray-300 rounded-full text-xs font-medium">
                              {unselectedActivities.length}
                            </span>
                          </div>
                        </div>
                        <div className="flex-1 overflow-y-auto max-h-[20rem] lg:max-h-[26rem]">
                          {unselectedActivities.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-12 text-gray-400 dark:text-gray-500">
                              <IconCheck size={40} className="mb-2 text-green-400" />
                              <p className="text-sm">
                                {activities.length === 0 ? "No pay codes available" : "All activities selected"}
                              </p>
                            </div>
                          ) : (
                            unselectedActivities.map((activity) => {
                              const originalIndex = getOriginalIndex(activity.payCodeId);
                              return (
                                <div
                                  key={activity.payCodeId}
                                  className="px-4 py-2.5 border-b border-gray-100 dark:border-gray-700 hover:bg-sky-50 dark:hover:bg-sky-900/20 transition-colors cursor-pointer group"
                                  onClick={() => handleToggleActivity(originalIndex)}
                                >
                                  <div className="flex items-center justify-between">
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-2 min-w-0">
                                        <SafeLink
                                          to={`/catalogue/pay-codes?desc=${activity.payCodeId}`}
                                          hasUnsavedChanges={hasUnsavedChanges}
                                          onNavigateAttempt={onNavigateAttempt}
                                          className="font-medium text-gray-800 dark:text-gray-100 hover:text-sky-600 dark:hover:text-sky-400 hover:underline truncate"
                                          onClick={(e) => e.stopPropagation()}
                                          title={activity.description}
                                        >
                                          {activity.description}
                                        </SafeLink>
                                        <span className="flex-shrink-0 text-xs text-default-500 dark:text-gray-400 rounded-full bg-default-100 dark:bg-gray-600 px-2 py-0.5">
                                          {activity.payCodeId}
                                        </span>
                                        {isDoubled && DOUBLED_PAYCODES.includes(activity.payCodeId) && (
                                          <span className="flex-shrink-0 px-1.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300">
                                            x2
                                          </span>
                                        )}
                                      </div>
                                      <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                                        {activity.payType} • {activity.rateUnit}
                                        {activity.rateUnit !== "Percent" && activity.rateUnit !== "Fixed" && (
                                          <span> @ RM{activity.rate.toFixed(2)}/{activity.rateUnit}</span>
                                        )}
                                        {activity.rateUnit === "Percent" && (
                                          <span> @ {activity.rate}%</span>
                                        )}
                                        {activity.rateUnit === "Fixed" && (
                                          <span> @ RM{activity.rate.toFixed(2)}</span>
                                        )}
                                      </div>
                                    </div>
                                    <IconPlus
                                      size={18}
                                      className="text-gray-300 dark:text-gray-600 group-hover:text-sky-600 dark:group-hover:text-sky-400 transition-colors flex-shrink-0 ml-2"
                                    />
                                  </div>
                                </div>
                              );
                            })
                          )}
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </DialogPanel>
            </TransitionChild>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
};

export default ManageActivitiesModal;
