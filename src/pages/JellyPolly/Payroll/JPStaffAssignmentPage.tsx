// src/pages/JellyPolly/Payroll/JPStaffAssignmentPage.tsx
// User-managed staff → page/job assignments for Jelly Polly payroll,
// daily machine, plastic, and production workflows. Staff come from the JP
// staff catalogue (jellypolly.staffs); assignments live in
// jellypolly.payroll_employees.
import React, { useMemo, useState } from "react";
import { IconRefresh, IconTrash, IconUsers } from "@tabler/icons-react";
import toast from "react-hot-toast";
import Button from "../../../components/Button";
import LoadingSpinner from "../../../components/LoadingSpinner";
import ConfirmationDialog from "../../../components/ConfirmationDialog";
import { FormCombobox, SelectOption } from "../../../components/FormComponents";
import { useJPStaffsCache } from "../../../utils/JellyPolly/useJPStaffsCache";
import {
  useJPPayrollEmployees,
  JPPayrollEmployee,
  JPJobType,
} from "../../../utils/JellyPolly/useJPPayrollEmployees";
import { JP_JOB_TYPES, JPJobTypeInfo } from "../../../configs/jpPayrollJobConfigs";
import { Employee } from "../../../types/types";

interface AssignmentSectionProps {
  jobType: JPJobTypeInfo;
  assigned: JPPayrollEmployee[];
  staffOptions: SelectOption[];
  onAdd: (employeeId: string, jobType: JPJobType) => Promise<void>;
  onRemoveRequest: (assignment: JPPayrollEmployee) => void;
}

const AssignmentSection: React.FC<AssignmentSectionProps> = ({
  jobType,
  assigned,
  staffOptions,
  onAdd,
  onRemoveRequest,
}) => {
  const [query, setQuery] = useState<string>("");
  const [isAdding, setIsAdding] = useState<boolean>(false);

  const assignedIds = useMemo(
    (): Set<string> => new Set(assigned.map((a) => a.employee_id)),
    [assigned]
  );

  const availableOptions = useMemo(
    (): SelectOption[] =>
      staffOptions.filter((option) => !assignedIds.has(option.id.toString())),
    [staffOptions, assignedIds]
  );

  const handleSelect = async (value: string | string[] | null): Promise<void> => {
    const employeeId: string | null = typeof value === "string" ? value : null;
    if (!employeeId || isAdding) return;
    setIsAdding(true);
    try {
      await onAdd(employeeId, jobType.id as JPJobType);
    } finally {
      setIsAdding(false);
      setQuery("");
    }
  };

  return (
    <div className="bg-white dark:bg-default-800 border border-default-200 dark:border-default-700 rounded-lg p-4 flex flex-col">
      <div className="flex items-start justify-between mb-1">
        <h2 className="text-base font-semibold text-default-800 dark:text-default-100">
          {jobType.label}
        </h2>
        <span className="text-xs font-medium text-default-500 dark:text-default-400 bg-default-100 dark:bg-default-700 rounded-full px-2 py-0.5">
          {assigned.length}
        </span>
      </div>
      <p className="text-xs text-default-500 dark:text-default-400 mb-3">
        {jobType.description}
      </p>

      {assigned.length > 0 ? (
        <ul className="divide-y divide-default-100 dark:divide-default-700 mb-3">
          {assigned.map((assignment) => (
            <li
              key={assignment.id}
              className="flex items-center justify-between py-1.5"
            >
              <div className="min-w-0">
                <span className="text-sm text-default-700 dark:text-default-200 truncate block">
                  {assignment.employee_name || assignment.employee_id}
                </span>
                <span className="text-xs text-default-400 dark:text-default-500">
                  {assignment.employee_id}
                  {assignment.head_staff_id
                    ? ` · sub-ID of ${assignment.head_staff_id}`
                    : ""}
                </span>
              </div>
              <button
                type="button"
                title="Remove from this page"
                className="text-default-400 hover:text-rose-600 dark:hover:text-rose-400 p-1"
                onClick={() => onRemoveRequest(assignment)}
              >
                <IconTrash size={16} />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-default-400 dark:text-default-500 italic mb-3">
          No staff assigned yet.
        </p>
      )}

      <div className="mt-auto">
        <FormCombobox
          name={`add-${jobType.id}`}
          label=""
          value={undefined}
          onChange={handleSelect}
          options={availableOptions}
          query={query}
          setQuery={setQuery}
          mode="single"
          disabled={isAdding}
          placeholder="Add staff..."
        />
      </div>
    </div>
  );
};

const JPStaffAssignmentPage: React.FC = () => {
  const { staffs, loading: staffsLoading } = useJPStaffsCache();
  const {
    employeesByJobType,
    loading: assignmentsLoading,
    refreshEmployees,
    addEmployee,
    removeEmployee,
  } = useJPPayrollEmployees();

  const [pendingRemoval, setPendingRemoval] = useState<JPPayrollEmployee | null>(
    null
  );

  const staffOptions = useMemo((): SelectOption[] => {
    return [...staffs]
      .sort((a: Employee, b: Employee) => a.name.localeCompare(b.name))
      .map(
        (staff: Employee): SelectOption => ({
          id: staff.id,
          name: `${staff.name} (${staff.id})`,
        })
      );
  }, [staffs]);

  const handleAdd = async (
    employeeId: string,
    jobType: JPJobType
  ): Promise<void> => {
    try {
      await addEmployee(employeeId, jobType);
      toast.success("Staff assigned");
    } catch (err: unknown) {
      const message: string =
        err instanceof Error ? err.message : "Failed to assign staff";
      toast.error(message);
    }
  };

  const handleConfirmRemove = async (): Promise<void> => {
    if (!pendingRemoval) return;
    try {
      await removeEmployee(pendingRemoval.id);
      toast.success("Staff removed");
    } catch (err: unknown) {
      const message: string =
        err instanceof Error ? err.message : "Failed to remove staff";
      toast.error(message);
    } finally {
      setPendingRemoval(null);
    }
  };

  const isLoading: boolean = staffsLoading || assignmentsLoading;

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row justify-between md:items-center gap-3">
        <div className="flex items-center gap-2">
          <IconUsers size={24} className="text-default-600 dark:text-default-300" />
          <div>
            <h1 className="text-xl font-semibold text-default-800 dark:text-gray-100">
              Staff Assignment
            </h1>
            <p className="text-sm text-default-500 dark:text-default-400">
              Assign staff to Jelly Polly payroll, daily machine, plastic, and
              production pages. A staff member can hold multiple assignments.
            </p>
          </div>
        </div>
        <Button
          onClick={() => refreshEmployees()}
          icon={IconRefresh}
          variant="outline"
        >
          Refresh
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <LoadingSpinner />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 pb-8">
          {JP_JOB_TYPES.map((jobType) => (
            <AssignmentSection
              key={jobType.id}
              jobType={jobType}
              assigned={employeesByJobType[jobType.id] || []}
              staffOptions={staffOptions}
              onAdd={handleAdd}
              onRemoveRequest={setPendingRemoval}
            />
          ))}
        </div>
      )}

      <ConfirmationDialog
        isOpen={pendingRemoval !== null}
        onClose={() => setPendingRemoval(null)}
        onConfirm={handleConfirmRemove}
        title="Remove staff assignment"
        message={
          pendingRemoval
            ? `Remove ${
                pendingRemoval.employee_name || pendingRemoval.employee_id
              } from ${
                JP_JOB_TYPES.find((j) => j.id === pendingRemoval.job_type)
                  ?.label || pendingRemoval.job_type
              }? Their existing payroll records are kept.`
            : ""
        }
        confirmButtonText="Remove"
        variant="danger"
      />
    </div>
  );
};

export default JPStaffAssignmentPage;
