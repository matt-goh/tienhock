// src/pages/Catalogue/LocationPage.tsx
import React, { useState, useMemo, useCallback, useEffect } from "react";
import {
  IconPlus,
  IconPencil,
  IconTrash,
  IconSearch,
  IconMapPin,
  IconHelp,
} from "@tabler/icons-react";
import toast from "react-hot-toast";
import { api } from "../../routes/utils/api";
import {
  useLocationsCache,
  Location,
} from "../../utils/catalogue/useLocationsCache";
import LoadingSpinner from "../../components/LoadingSpinner";
import Button from "../../components/Button";
import ConfirmationDialog from "../../components/ConfirmationDialog";
import LocationModal from "../../components/Catalogue/LocationModal";

interface JobMapping {
  job_id: string;
  job_name: string;
  section: string;
}

interface EmployeeMapping {
  employee_id: string;
  employee_name: string;
}

interface LocationWithMappings extends Location {
  jobs: JobMapping[];
  jobCount: number;
  employees: EmployeeMapping[];
  employeeCount: number;
}

interface DependencyInfo {
  hasDependencies: boolean;
  jobs: Array<{ job_id: string; job_name: string }>;
  accounts: Array<{ id: number; mapping_type: string; account_code: string }>;
  staffs: Array<{ id: string; name: string }>;
}

const LocationPage: React.FC = () => {
  const { locations, isLoading, error, refreshLocations } = useLocationsCache();
  const [searchTerm, setSearchTerm] = useState("");

  // Track expanded employee lists per location
  const [expandedEmployees, setExpandedEmployees] = useState<Set<string>>(new Set());

  // Modal states
  const [showModal, setShowModal] = useState(false);
  const [locationToEdit, setLocationToEdit] = useState<Location | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [locationToDelete, setLocationToDelete] = useState<Location | null>(null);
  const [dependencyInfo, setDependencyInfo] = useState<DependencyInfo | null>(null);
  const [isCheckingDependencies, setIsCheckingDependencies] = useState(false);

  // Job mappings data
  const [jobMappingsData, setJobMappingsData] = useState<{
    locationSummary: Array<{
      location_code: string;
      location_name: string;
      jobs: JobMapping[];
    }>;
  } | null>(null);

  // Fetch job mappings summary
  const fetchJobMappings = useCallback(async () => {
    try {
      const response = await api.get("/api/locations/job-mappings");
      setJobMappingsData(response);
    } catch (err) {
      console.error("Error fetching job mappings:", err);
    }
  }, []);

  // Initial fetch on mount
  useEffect(() => {
    fetchJobMappings();
  }, [fetchJobMappings]);

  // Employee mappings data
  const [employeeMappingsData, setEmployeeMappingsData] = useState<{
    locationSummary: Array<{
      location_code: string;
      employees: EmployeeMapping[];
    }>;
  } | null>(null);

  // Fetch employee mappings summary
  const fetchEmployeeMappings = useCallback(async () => {
    try {
      const response = await api.get("/api/locations/employee-mappings");
      setEmployeeMappingsData(response);
    } catch (err) {
      console.error("Error fetching employee mappings:", err);
    }
  }, []);

  // Initial fetch on mount
  useEffect(() => {
    fetchEmployeeMappings();
  }, [fetchEmployeeMappings]);

  // Merge locations with job and employee data
  const locationsWithMappings = useMemo<LocationWithMappings[]>(() => {
    return locations.map((loc) => {
      const locationJobs =
        jobMappingsData?.locationSummary.find(
          (ls) => ls.location_code === loc.id
        )?.jobs || [];
      const locationEmployees =
        employeeMappingsData?.locationSummary.find(
          (ls) => ls.location_code === loc.id
        )?.employees || [];
      return {
        ...loc,
        jobs: locationJobs,
        jobCount: locationJobs.length,
        employees: locationEmployees,
        employeeCount: locationEmployees.length,
      };
    });
  }, [locations, jobMappingsData, employeeMappingsData]);

  // Filtered locations
  const filteredLocations = useMemo(() => {
    if (!searchTerm) return locationsWithMappings;
    const term = searchTerm.toLowerCase();
    return locationsWithMappings.filter(
      (loc: LocationWithMappings) =>
        loc.id.toLowerCase().includes(term) ||
        loc.name.toLowerCase().includes(term) ||
        loc.jobs.some(
          (j: JobMapping) =>
            j.job_id.toLowerCase().includes(term) ||
            j.job_name.toLowerCase().includes(term)
        ) ||
        loc.employees.some(
          (e: EmployeeMapping) =>
            e.employee_id.toLowerCase().includes(term) ||
            e.employee_name.toLowerCase().includes(term)
        )
    );
  }, [locationsWithMappings, searchTerm]);

  // Sorted by ID
  const sortedLocations = useMemo(() => {
    return [...filteredLocations].sort((a, b) =>
      a.id.localeCompare(b.id, undefined, { numeric: true })
    );
  }, [filteredLocations]);

  // Handlers
  const handleAddClick = () => {
    setLocationToEdit(null);
    setShowModal(true);
  };

  const handleEditClick = (location: LocationWithMappings) => {
    setLocationToEdit(location);
    setShowModal(true);
  };

  const handleDeleteClick = async (location: LocationWithMappings) => {
    setLocationToDelete(location);
    setIsCheckingDependencies(true);
    setDependencyInfo(null);

    try {
      const response = await api.get(`/api/locations/${location.id}/dependencies`);
      setDependencyInfo(response);
    } catch (err) {
      console.error("Error checking dependencies:", err);
      setDependencyInfo({
        hasDependencies: false,
        jobs: [],
        accounts: [],
        staffs: [],
      });
    } finally {
      setIsCheckingDependencies(false);
      setShowDeleteDialog(true);
    }
  };

  const handleModalClose = () => {
    setShowModal(false);
    setLocationToEdit(null);
  };

  const handleSaveLocation = useCallback(
    async (locationData: Location) => {
      const isEditing = !!locationData.originalId;

      try {
        if (isEditing) {
          await api.put(`/api/locations/${locationData.originalId}`, {
            id: locationData.id,
            name: locationData.name,
            newId: locationData.id !== locationData.originalId ? locationData.id : undefined,
          });
          toast.success("Location updated successfully");
        } else {
          await api.post("/api/locations", locationData);
          toast.success("Location created successfully");
        }
        // Don't refresh here - let onComplete handle it after modal closes
      } catch (err: any) {
        console.error("Error saving location:", err);
        throw new Error(err.message || "Failed to save location");
      }
    },
    []
  );

  const handleConfirmDelete = useCallback(async () => {
    if (!locationToDelete) return;

    if (dependencyInfo?.hasDependencies) {
      toast.error("Cannot delete location with dependencies");
      setShowDeleteDialog(false);
      return;
    }

    try {
      await api.delete("/api/locations", [locationToDelete.id]);
      toast.success("Location deleted successfully");
      setShowDeleteDialog(false);
      setLocationToDelete(null);
      setDependencyInfo(null);
      refreshLocations();
    } catch (err: any) {
      console.error("Error deleting location:", err);
      toast.error(err.message || "Failed to delete location");
    }
  }, [locationToDelete, dependencyInfo, refreshLocations]);

  if (isLoading) {
    return (
      <div className="mt-40 flex w-full items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  if (error) {
    return (
      <div className="mt-20 flex w-full items-center justify-center text-rose-600 dark:text-rose-400">
        Error loading locations: {error.message}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex flex-col items-center justify-between gap-3 md:flex-row">
        <div className="flex items-center gap-2">
          <IconMapPin className="text-sky-500 dark:text-sky-400" size={22} />
          <h1 className="text-lg font-semibold text-default-800 dark:text-gray-100">
            Location Catalogue
          </h1>
          <span className="text-sm text-default-500 dark:text-gray-400">
            ({locations.length})
          </span>
          {/* Help Tooltip */}
          <div className="relative group">
            <IconHelp
              size={18}
              className="text-default-400 dark:text-gray-500 hover:text-sky-500 dark:hover:text-sky-400 cursor-help transition-colors"
            />
            <div className="absolute left-0 top-full mt-2 w-72 p-3 bg-gray-900 dark:bg-gray-700 text-white text-xs rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50">
              <p className="font-medium mb-1">Location Management</p>
              <p className="text-gray-300 dark:text-gray-200">
                Locations organize payroll data in salary reports. Edit a location to assign jobs to it. Mapped jobs appear under the correct location in salary reports and journal vouchers.
              </p>
              <div className="absolute -top-1.5 left-2 w-3 h-3 bg-gray-900 dark:bg-gray-700 rotate-45"></div>
            </div>
          </div>
        </div>

        <div className="flex w-full items-center gap-2 md:w-auto">
          {/* Search */}
          <div className="relative flex-1 md:w-56">
            <IconSearch
              className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-default-400 dark:text-gray-400"
              stroke={1.5}
            />
            <input
              type="text"
              placeholder="Search..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full rounded-lg border border-default-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-default-900 dark:text-gray-100 py-1.5 pl-8 pr-3 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 placeholder:text-default-400 dark:placeholder:text-gray-400"
            />
          </div>

          <Button
            onClick={handleAddClick}
            color="sky"
            variant="filled"
            icon={IconPlus}
            iconPosition="left"
            size="sm"
          >
            Add
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-lg border border-default-200 dark:border-gray-700 bg-white dark:bg-gray-800">
        <table className="min-w-full">
          <thead className="bg-default-50 dark:bg-gray-800/50 border-b border-default-200 dark:border-gray-700">
            <tr>
              <th className="w-16 px-3 py-2 text-left text-xs font-semibold uppercase text-default-600 dark:text-gray-300">
                ID
              </th>
              <th className="w-48 px-3 py-2 text-left text-xs font-semibold uppercase text-default-600 dark:text-gray-300">
                Name
              </th>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-default-600 dark:text-gray-300">
                Mapped Jobs
              </th>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-default-600 dark:text-gray-300">
                Mapped Employees
              </th>
              <th className="w-20 px-3 py-2 text-center text-xs font-semibold uppercase text-default-600 dark:text-gray-300">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-default-100 dark:divide-gray-700/50">
            {sortedLocations.length > 0 ? (
              sortedLocations.map((location) => (
                <tr
                  key={location.id}
                  className="hover:bg-default-50 dark:hover:bg-gray-700/30 transition-colors"
                >
                  <td className="px-3 py-2">
                    <span className="inline-flex items-center justify-center w-8 h-6 rounded bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300 font-mono text-xs font-medium">
                      {location.id}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-sm text-default-800 dark:text-gray-200">
                    {location.name}
                  </td>
                  <td className="px-3 py-2">
                    {location.jobCount > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {location.jobs.map((job: JobMapping) => (
                          <span
                            key={job.job_id}
                            className="inline-flex items-center px-1.5 py-0.5 rounded text-xs bg-default-100 dark:bg-gray-700 text-default-600 dark:text-gray-300 border border-default-200 dark:border-gray-600"
                            title={`${job.job_id}: ${job.job_name}`}
                          >
                            {job.job_name}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-xs text-default-400 dark:text-gray-500 italic">
                        No jobs mapped
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {location.employeeCount > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {(expandedEmployees.has(location.id)
                          ? location.employees
                          : location.employees.slice(0, 5)
                        ).map((emp: EmployeeMapping) => (
                          <span
                            key={emp.employee_id}
                            className="inline-flex items-center px-1.5 py-0.5 rounded text-xs bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800"
                            title={`${emp.employee_id}: ${emp.employee_name}`}
                          >
                            {emp.employee_name}
                          </span>
                        ))}
                        {location.employeeCount > 5 && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setExpandedEmployees((prev) => {
                                const newSet = new Set(prev);
                                if (newSet.has(location.id)) {
                                  newSet.delete(location.id);
                                } else {
                                  newSet.add(location.id);
                                }
                                return newSet;
                              });
                            }}
                            className="inline-flex items-center px-1.5 py-0.5 rounded text-xs bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 transition-colors cursor-pointer"
                          >
                            {expandedEmployees.has(location.id)
                              ? "Show less"
                              : `+${location.employeeCount - 5} more`}
                          </button>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-default-400 dark:text-gray-500 italic">
                        No employees mapped
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center justify-center gap-0.5">
                      <button
                        onClick={() => handleEditClick(location)}
                        className="p-1 rounded hover:bg-sky-100 dark:hover:bg-sky-900/30 text-sky-600 dark:text-sky-400 transition-colors"
                        title="Edit"
                      >
                        <IconPencil size={16} />
                      </button>
                      <button
                        onClick={() => handleDeleteClick(location)}
                        className="p-1 rounded hover:bg-rose-100 dark:hover:bg-rose-900/30 text-rose-600 dark:text-rose-400 transition-colors"
                        title="Delete"
                      >
                        <IconTrash size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td
                  colSpan={5}
                  className="px-3 py-8 text-center text-sm text-default-500 dark:text-gray-400"
                >
                  {searchTerm
                    ? "No locations match your search."
                    : "No locations found. Add one to get started."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Modal */}
      <LocationModal
        isOpen={showModal}
        onClose={handleModalClose}
        onSave={handleSaveLocation}
        onComplete={() => {
          // Refresh all data once after modal closes
          refreshLocations();
          fetchJobMappings();
          fetchEmployeeMappings();
        }}
        initialData={locationToEdit}
        existingLocations={locations}
        initialJobMappings={locationToEdit ? (locationToEdit as LocationWithMappings).jobs : []}
        initialEmployeeMappings={locationToEdit ? (locationToEdit as LocationWithMappings).employees : []}
      />

      {/* Delete Confirmation */}
      <ConfirmationDialog
        isOpen={showDeleteDialog}
        onClose={() => {
          setShowDeleteDialog(false);
          setLocationToDelete(null);
          setDependencyInfo(null);
        }}
        onConfirm={
          dependencyInfo?.hasDependencies
            ? () => {
                setShowDeleteDialog(false);
                setLocationToDelete(null);
                setDependencyInfo(null);
              }
            : handleConfirmDelete
        }
        title={dependencyInfo?.hasDependencies ? "Cannot Delete Location" : "Delete Location"}
        message={
          isCheckingDependencies ? (
            <div className="flex items-center gap-2">
              <LoadingSpinner />
              <span>Checking dependencies...</span>
            </div>
          ) : dependencyInfo?.hasDependencies ? (
            <div className="space-y-2">
              <p className="text-rose-600 dark:text-rose-400 font-medium text-sm">
                This location has dependencies:
              </p>
              {dependencyInfo.jobs.length > 0 && (
                <div className="text-sm">
                  <span className="font-medium text-default-700 dark:text-gray-200">
                    Jobs ({dependencyInfo.jobs.length}):
                  </span>{" "}
                  <span className="text-default-600 dark:text-gray-400">
                    {dependencyInfo.jobs.slice(0, 3).map(j => j.job_name).join(", ")}
                    {dependencyInfo.jobs.length > 3 && ` +${dependencyInfo.jobs.length - 3} more`}
                  </span>
                </div>
              )}
              {dependencyInfo.staffs.length > 0 && (
                <div className="text-sm">
                  <span className="font-medium text-default-700 dark:text-gray-200">
                    Staff ({dependencyInfo.staffs.length}):
                  </span>{" "}
                  <span className="text-default-600 dark:text-gray-400">
                    {dependencyInfo.staffs.slice(0, 3).map(s => s.name).join(", ")}
                    {dependencyInfo.staffs.length > 3 && ` +${dependencyInfo.staffs.length - 3} more`}
                  </span>
                </div>
              )}
              {dependencyInfo.accounts.length > 0 && (
                <div className="text-sm">
                  <span className="font-medium text-default-700 dark:text-gray-200">
                    Account Mappings:
                  </span>{" "}
                  <span className="text-default-600 dark:text-gray-400">
                    {dependencyInfo.accounts.length}
                  </span>
                </div>
              )}
              <p className="text-xs text-default-500 dark:text-gray-400 mt-1">
                Remove dependencies before deleting.
              </p>
            </div>
          ) : (
            `Delete "${locationToDelete?.name}" (${locationToDelete?.id})?`
          )
        }
        confirmButtonText={dependencyInfo?.hasDependencies ? "OK" : "Delete"}
        variant={dependencyInfo?.hasDependencies ? "default" : "danger"}
        hideCancelButton={dependencyInfo?.hasDependencies}
      />
    </div>
  );
};

export default LocationPage;
