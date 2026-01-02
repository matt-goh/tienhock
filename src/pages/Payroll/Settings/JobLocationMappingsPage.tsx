// src/pages/Payroll/Settings/JobLocationMappingsPage.tsx
import React, { useState, useMemo } from "react";
import toast from "react-hot-toast";
import { useNavigate, useLocation } from "react-router-dom";
import LoadingSpinner from "../../../components/LoadingSpinner";
import Button from "../../../components/Button";
import {
  IconSearch,
  IconCheck,
  IconAlertTriangle,
  IconMapPin,
} from "@tabler/icons-react";
import {
  Listbox,
  ListboxButton,
  ListboxOption,
  ListboxOptions,
} from "@headlessui/react";
import { useJobLocationMappings } from "../../../utils/catalogue/useJobLocationMappings";
import { useJobsCache } from "../../../utils/catalogue/useJobsCache";
import { api } from "@/routes/utils/api";

// Settings navigation tabs
const SettingsTabs: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const tabs = [
    { name: "Job Location Mappings", path: "/payroll/settings/job-location-mappings" },
    { name: "Location Account Mappings", path: "/payroll/settings/location-account-mappings" },
  ];

  return (
    <div className="border-b border-default-200 dark:border-gray-700 mb-4">
      <nav className="flex space-x-6" aria-label="Tabs">
        {tabs.map((tab) => {
          const isActive = location.pathname === tab.path;
          return (
            <button
              key={tab.path}
              onClick={() => navigate(tab.path)}
              className={`py-3 px-1 border-b-2 font-medium text-sm transition-colors ${
                isActive
                  ? "border-sky-500 text-sky-600"
                  : "border-transparent text-default-500 hover:text-default-700 hover:border-default-300"
              }`}
            >
              {tab.name}
            </button>
          );
        })}
      </nav>
    </div>
  );
};

interface Job {
  id: string;
  name: string;
}

const JobLocationMappingsPage: React.FC = () => {
  const {
    mappings,
    byJob,
    locationMap,
    loading: mappingsLoading,
    refreshData,
  } = useJobLocationMappings();
  const { jobs, loading: jobsLoading } = useJobsCache();

  const [searchTerm, setSearchTerm] = useState("");
  const [filterLocation, setFilterLocation] = useState<string>("All");
  const [isSaving, setIsSaving] = useState<string | null>(null);

  // Get location options for filtering
  const locationOptions = useMemo(() => {
    return Object.entries(locationMap).map(([code, name]) => ({
      code,
      name: `${code} - ${name}`,
    }));
  }, [locationMap]);

  // Combine jobs with their mappings
  const jobsWithMappings = useMemo(() => {
    return jobs.map((job) => ({
      ...job,
      location_code: byJob[job.id] || null,
      location_name: byJob[job.id] ? locationMap[byJob[job.id]] : null,
    }));
  }, [jobs, byJob, locationMap]);

  // Filter jobs
  const filteredJobs = useMemo(() => {
    return jobsWithMappings.filter((job) => {
      const matchesSearch =
        !searchTerm ||
        job.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
        job.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (job.location_name || "").toLowerCase().includes(searchTerm.toLowerCase());

      const matchesLocation =
        filterLocation === "All" ||
        (filterLocation === "Unmapped" && !job.location_code) ||
        job.location_code === filterLocation;

      return matchesSearch && matchesLocation;
    });
  }, [jobsWithMappings, searchTerm, filterLocation]);

  // Count unmapped jobs
  const unmappedCount = useMemo(() => {
    return jobsWithMappings.filter((job) => !job.location_code).length;
  }, [jobsWithMappings]);

  // Handle location change for a job
  const handleLocationChange = async (jobId: string, locationCode: string) => {
    setIsSaving(jobId);
    try {
      await api.put(`/api/job-location-mappings/${jobId}`, {
        location_code: locationCode,
      });
      toast.success(`Updated location for ${jobId}`);
      await refreshData();
    } catch (error) {
      console.error("Error updating location:", error);
      toast.error("Failed to update location");
    } finally {
      setIsSaving(null);
    }
  };

  const loading = mappingsLoading || jobsLoading;

  if (loading) {
    return (
      <div className="flex justify-center my-20">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Settings Navigation Tabs */}
      <SettingsTabs />

      {/* Header */}
      <div className="mb-4 flex flex-col items-start justify-between gap-4 md:flex-row md:items-center">
        <div>
          <h1 className="text-xl font-semibold text-default-800 dark:text-gray-100">
            Job Location Mappings
          </h1>
          <p className="text-sm text-default-500 dark:text-gray-400 mt-1">
            Map each job to a salary report location code. This determines how payroll amounts are grouped in the salary report.
          </p>
        </div>
        <Button
          onClick={() => refreshData()}
          variant="outline"
          size="md"
        >
          Refresh
        </Button>
      </div>

      {/* Unmapped Warning */}
      {unmappedCount > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-center gap-3">
          <IconAlertTriangle size={20} className="text-amber-600 flex-shrink-0" />
          <div>
            <p className="text-sm font-medium text-amber-800">
              {unmappedCount} job{unmappedCount > 1 ? "s" : ""} without location mapping
            </p>
            <p className="text-xs text-amber-600 mt-0.5">
              Unmapped jobs will default to location "02" (OFFICE) in the salary report.
            </p>
          </div>
          <Button
            onClick={() => setFilterLocation("Unmapped")}
            variant="outline"
            size="sm"
            className="ml-auto"
          >
            Show Unmapped
          </Button>
        </div>
      )}

      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-center gap-4">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <IconSearch
            className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-default-400"
            stroke={1.5}
          />
          <input
            type="text"
            placeholder="Search job or location..."
            className="w-full rounded-lg border border-default-300 dark:border-gray-600 py-2 pl-10 pr-4 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        {/* Location Filter */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-default-600 dark:text-gray-300">Location:</span>
          <Listbox value={filterLocation} onChange={setFilterLocation}>
            <div className="relative w-56">
              <ListboxButton className="relative w-full cursor-pointer rounded-lg border border-default-300 dark:border-gray-600 bg-white dark:bg-gray-800 py-2 pl-3 pr-10 text-left text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-sky-500 focus:border-sky-500">
                <span className="block truncate">
                  {filterLocation === "All"
                    ? "All Locations"
                    : filterLocation === "Unmapped"
                    ? "Unmapped Jobs"
                    : `${filterLocation} - ${locationMap[filterLocation]}`}
                </span>
              </ListboxButton>
              <ListboxOptions className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-md bg-white dark:bg-gray-800 py-1 text-sm shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none">
                <ListboxOption
                  value="All"
                  className={({ active }) =>
                    `relative cursor-pointer select-none py-2 pl-10 pr-4 ${
                      active ? "bg-sky-100 text-sky-900 dark:bg-sky-900/50 dark:text-sky-200" : "text-gray-900 dark:text-gray-100"
                    }`
                  }
                >
                  {({ selected }) => (
                    <>
                      <span className={`block truncate ${selected ? "font-medium" : ""}`}>
                        All Locations
                      </span>
                      {selected && (
                        <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-sky-600 dark:text-sky-400">
                          <IconCheck size={16} />
                        </span>
                      )}
                    </>
                  )}
                </ListboxOption>
                <ListboxOption
                  value="Unmapped"
                  className={({ active }) =>
                    `relative cursor-pointer select-none py-2 pl-10 pr-4 ${
                      active ? "bg-amber-100 text-amber-900" : "text-amber-700"
                    }`
                  }
                >
                  {({ selected }) => (
                    <>
                      <span className={`block truncate ${selected ? "font-medium" : ""}`}>
                        Unmapped Jobs ({unmappedCount})
                      </span>
                      {selected && (
                        <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-amber-600">
                          <IconCheck size={16} />
                        </span>
                      )}
                    </>
                  )}
                </ListboxOption>
                {locationOptions.map((loc) => (
                  <ListboxOption
                    key={loc.code}
                    value={loc.code}
                    className={({ active }) =>
                      `relative cursor-pointer select-none py-2 pl-10 pr-4 ${
                        active ? "bg-sky-100 text-sky-900 dark:bg-sky-900/50 dark:text-sky-200" : "text-gray-900 dark:text-gray-100"
                      }`
                    }
                  >
                    {({ selected }) => (
                      <>
                        <span className={`block truncate ${selected ? "font-medium" : ""}`}>
                          {loc.name}
                        </span>
                        {selected && (
                          <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-sky-600 dark:text-sky-400">
                            <IconCheck size={16} />
                          </span>
                        )}
                      </>
                    )}
                  </ListboxOption>
                ))}
              </ListboxOptions>
            </div>
          </Listbox>
        </div>
      </div>

      {/* Stats */}
      <div className="mb-4 flex items-center gap-4 text-sm text-default-600 dark:text-gray-300">
        <span>
          Total: <span className="font-medium text-default-900 dark:text-gray-100">{jobs.length}</span> jobs
        </span>
        <span>
          Showing: <span className="font-medium text-default-900 dark:text-gray-100">{filteredJobs.length}</span>
        </span>
        <span>
          Mapped: <span className="font-medium text-emerald-600">{jobs.length - unmappedCount}</span>
        </span>
        <span>
          Unmapped: <span className="font-medium text-amber-600">{unmappedCount}</span>
        </span>
      </div>

      {/* Content */}
      <div className="overflow-x-auto rounded-lg border border-default-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm">
        <table className="min-w-full divide-y divide-default-200 dark:divide-gray-700">
          <thead className="bg-default-100 dark:bg-gray-800">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-default-600 dark:text-gray-300">
                Job ID
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-default-600 dark:text-gray-300">
                Job Name
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-default-600 dark:text-gray-300 w-80">
                Salary Report Location
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-default-200 dark:divide-gray-700 bg-white dark:bg-gray-800">
            {filteredJobs.length > 0 ? (
              filteredJobs.map((job) => (
                <tr key={job.id} className="hover:bg-default-50 dark:hover:bg-gray-700">
                  <td className="px-4 py-3 text-sm">
                    <span className="font-mono text-sky-700 font-medium">
                      {job.id}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-default-700 dark:text-gray-200">
                    {job.name}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <Listbox
                      value={job.location_code || ""}
                      onChange={(value) => handleLocationChange(job.id, value)}
                      disabled={isSaving === job.id}
                    >
                      <div className="relative">
                        <ListboxButton
                          className={`relative w-full cursor-pointer rounded-lg border py-2 pl-3 pr-10 text-left text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-sky-500 focus:border-sky-500 ${
                            job.location_code
                              ? "border-default-300 bg-white"
                              : "border-amber-300 bg-amber-50"
                          } ${isSaving === job.id ? "opacity-50 cursor-wait" : ""}`}
                        >
                          {isSaving === job.id ? (
                            <span className="text-default-500 dark:text-gray-400">Saving...</span>
                          ) : job.location_code ? (
                            <span className="flex items-center gap-2">
                              <IconMapPin size={14} className="text-emerald-600" />
                              <span className="font-mono text-default-700 dark:text-gray-200">
                                {job.location_code}
                              </span>
                              <span className="text-default-500 dark:text-gray-400">-</span>
                              <span className="text-default-600 dark:text-gray-300">{job.location_name}</span>
                            </span>
                          ) : (
                            <span className="text-amber-600 flex items-center gap-2">
                              <IconAlertTriangle size={14} />
                              Select location...
                            </span>
                          )}
                        </ListboxButton>
                        <ListboxOptions className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-md bg-white dark:bg-gray-800 py-1 text-sm shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none">
                          {locationOptions.map((loc) => (
                            <ListboxOption
                              key={loc.code}
                              value={loc.code}
                              className={({ active }) =>
                                `relative cursor-pointer select-none py-2 pl-10 pr-4 ${
                                  active ? "bg-sky-100 text-sky-900 dark:bg-sky-900/50 dark:text-sky-200" : "text-gray-900 dark:text-gray-100"
                                }`
                              }
                            >
                              {({ selected }) => (
                                <>
                                  <span
                                    className={`block truncate ${
                                      selected ? "font-medium" : ""
                                    }`}
                                  >
                                    {loc.name}
                                  </span>
                                  {selected && (
                                    <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-sky-600 dark:text-sky-400">
                                      <IconCheck size={16} />
                                    </span>
                                  )}
                                </>
                              )}
                            </ListboxOption>
                          ))}
                        </ListboxOptions>
                      </div>
                    </Listbox>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={3} className="px-6 py-10 text-center text-sm text-default-500 dark:text-gray-400">
                  No jobs found.{" "}
                  {searchTerm || filterLocation !== "All"
                    ? "Try adjusting your filters."
                    : ""}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default JobLocationMappingsPage;
