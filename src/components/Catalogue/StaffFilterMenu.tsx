import React, { useState, useRef, useEffect, Fragment } from "react";
import {
  Combobox,
  ComboboxButton,
  ComboboxOption,
  ComboboxOptions,
  Transition,
} from "@headlessui/react";
import {
  IconFilter,
  IconSquareCheckFilled,
  IconSquare,
  IconChevronDown,
  IconCheck,
  IconX,
} from "@tabler/icons-react";
import { FilterOptions } from "../../types/types";
import Button from "../Button";

type StaffFilterMenuProps = {
  onFilterChange: (filters: FilterOptions) => void;
  currentFilters: FilterOptions;
  jobOptions: string[];
  locationOptions: string[];
};

const LOCATION_MAP: { [key: string]: string } = {
  "01": "DIRECTOR'S REMUNERATION",
  "02": "OFFICE",
  "03": "SALESMAN",
  "04": "IKUT LORI",
  "05": "PENGANGKUTAN HABUK",
  "06": "JAGA BOILER",
  "07": "MESIN & SANGKUT MEE",
  "08": "PACKING MEE",
  "09": "MESIN BIHUN",
  "10": "SANGKUT BIHUN",
  "11": "PACKING BIHUN",
  "12": "PEKEBUN",
  "13": "TUKANG SAPU",
  "14": "KILANG KERJA LUAR",
  "15": "OTHER SABARINA",
  "16": "COMM-MESIN MEE",
  "17": "COMM-MESIN BIHUN",
  "18": "COMM-KILANG",
  "19": "COMM-LORI",
  "20": "COMM-BOILER",
  "21": "COMM-FORKLIFT/CASE",
  "22": "KILANG HABUK",
  "23": "CUTI TAHUNAN",
  "24": "SPECIAL OT",
};

const StaffFilterMenu: React.FC<StaffFilterMenuProps> = ({
  onFilterChange,
  currentFilters,
  jobOptions,
  locationOptions,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const uniqueJobOptions = Array.from(new Set(jobOptions)).map(
    (job, index) => ({
      id: index.toString(),
      name: job,
    })
  );

  const handleFilterChange = (key: keyof FilterOptions, value: any) => {
    onFilterChange({ ...currentFilters, [key]: value });
  };

  const handleJobSelection = (selectedJobIds: string[]) => {
    const selectedJobs = selectedJobIds
      .map((id) => uniqueJobOptions.find((job) => job.id === id)?.name)
      .filter((job): job is string => job !== undefined);
    handleFilterChange("jobFilter", selectedJobs);
  };

  const handleLocationSelection = (selectedLocationIds: string[]) => {
    handleFilterChange("locationFilter", selectedLocationIds);
  };

  // Helper function to convert strings to Title Case
  const toTitleCase = (str: string) => {
    return str
      .toLowerCase()
      .split(" ")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  };

  const getLocationName = (locationCode: string) => {
    // Ensure the locationCode is padded to two digits
    const paddedCode = locationCode.padStart(2, "0");

    // Directly look up the location name in LOCATION_MAP
    const locationName = LOCATION_MAP[paddedCode];

    if (locationName) {
      return toTitleCase(locationName);
    } else {
      return `Unknown (${locationCode})`;
    }
  };

  const uniqueLocationOptions = Array.from(new Set(locationOptions)).map(
    (location) => ({
      id: location,
      name: getLocationName(location),
    })
  );

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  return (
    <div className="relative inline-block text-left" ref={menuRef}>
      <Button
        onClick={() => setIsOpen(!isOpen)}
        icon={IconFilter}
        variant="outline"
      >
        Filter
      </Button>
      {isOpen && (
        <div className="absolute space-y-1 right-0 mt-2 w-64 text-default-700 text-sm font-medium rounded-md bg-white shadow-lg focus:outline-none z-10">
          <div className="px-1 pt-1">
            <button
              className="group flex justify-between w-full items-center rounded-md px-2.5 py-2.5 hover:bg-default-100 active:bg-default-200 transition-colors duration-200 text-default-700"
              onClick={() =>
                handleFilterChange("showResigned", !currentFilters.showResigned)
              }
            >
              Show inactive staff
              {currentFilters.showResigned ? (
                <IconSquareCheckFilled
                  width={18}
                  height={18}
                  className="text-blue-600"
                />
              ) : (
                <IconSquare
                  width={18}
                  height={18}
                  className="text-default-400"
                />
              )}
            </button>
          </div>

          {/* Job Filter */}
          <div className="px-1">
            <Combobox
              multiple
              value={
                currentFilters.jobFilter?.map(
                  (job) =>
                    uniqueJobOptions.find((option) => option.name === job)?.id
                ) ?? []
              }
              onChange={handleJobSelection}
              disabled={!currentFilters.applyJobFilter}
            >
              {({ open }) => (
                <div className="relative">
                  <div
                    className={`flex px-2.5 py-2.5 items-center justify-between rounded-md ${
                      !currentFilters.applyJobFilter
                        ? ""
                        : "hover:bg-default-100 active:bg-default-200 transition-colors duration-200"
                    }`}
                  >
                    <ComboboxButton
                      className={`w-full text-left text-default-900 focus:outline-none ${
                        !currentFilters.applyJobFilter
                          ? "opacity-50 cursor-not-allowed"
                          : ""
                      } flex items-center`}
                    >
                      <span className="block truncate">Filter by job(s)</span>
                      <IconChevronDown
                        stroke={2}
                        size={18}
                        className="ml-2 text-default-500"
                      />
                    </ComboboxButton>
                    <button
                      className="flex items-center ml-2"
                      onClick={() =>
                        handleFilterChange(
                          "applyJobFilter",
                          !currentFilters.applyJobFilter
                        )
                      }
                    >
                      {currentFilters.applyJobFilter ? (
                        <IconSquareCheckFilled
                          width={18}
                          height={18}
                          className="text-blue-600"
                        />
                      ) : (
                        <IconSquare
                          width={18}
                          height={18}
                          stroke={2}
                          className="text-default-400"
                        />
                      )}
                    </button>
                  </div>
                  <Transition
                    show={open && currentFilters.applyJobFilter}
                    as={Fragment}
                    leave="transition ease-in duration-100"
                    leaveFrom="opacity-100"
                    leaveTo="opacity-0"
                  >
                    <ComboboxOptions className="absolute z-10 w-full mt-1 p-1 border bg-white max-h-60 rounded-lg overflow-auto focus:outline-none">
                      {uniqueJobOptions.length === 0 ? (
                        <div className="relative cursor-default select-none py-2 px-4 text-default-700">
                          No jobs found.
                        </div>
                      ) : (
                        uniqueJobOptions.map((option) => (
                          <ComboboxOption
                            key={option.id}
                            className={({ active }) =>
                              `relative cursor-pointer select-none py-2 px-4 ${
                                active ? "bg-default-100" : "text-default-900"
                              }`
                            }
                            value={option.id}
                          >
                            {({ selected }) => (
                              <>
                                <span
                                  className={`block truncate ${
                                    selected ? "font-medium" : "font-normal"
                                  }`}
                                >
                                  {option.name}
                                </span>
                                {selected ? (
                                  <span className="absolute inset-y-0 right-0 flex items-center pr-3 text-default-600">
                                    <IconCheck stroke={2} size={22} />
                                  </span>
                                ) : null}
                              </>
                            )}
                          </ComboboxOption>
                        ))
                      )}
                    </ComboboxOptions>
                  </Transition>
                </div>
              )}
            </Combobox>
          </div>
          {currentFilters.jobFilter && currentFilters.jobFilter.length > 0 && (
            <div className="px-2.5 py-1">
              <div className="flex flex-wrap gap-2">
                {currentFilters.jobFilter.map((job) => (
                  <span
                    key={job}
                    className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-sky-100 text-sky-800 cursor-pointer"
                    onClick={() =>
                      handleJobSelection(
                        currentFilters.jobFilter
                          ?.filter((j) => j !== job)
                          .map(
                            (j) =>
                              uniqueJobOptions.find(
                                (option) => option.name === j
                              )?.id
                          )
                          .filter((id): id is string => id !== undefined) ?? []
                      )
                    }
                  >
                    {job}
                    <button className="ml-1 text-sky-600 hover:text-sky-800">
                      <IconX size={14} />
                    </button>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Location Filter */}
          <div className="px-1 pb-1">
            <Combobox
              multiple
              value={currentFilters.locationFilter ?? []}
              onChange={handleLocationSelection}
              disabled={!currentFilters.applyLocationFilter}
            >
              {({ open }) => (
                <div className="relative">
                  <div
                    className={`flex px-2.5 py-2.5 items-center justify-between rounded-md ${
                      !currentFilters.applyLocationFilter
                        ? ""
                        : "hover:bg-default-100 active:bg-default-200 transition-colors duration-200"
                    }`}
                  >
                    <ComboboxButton
                      className={`w-full text-left text-default-900 focus:outline-none ${
                        !currentFilters.applyLocationFilter
                          ? "opacity-50 cursor-not-allowed"
                          : ""
                      } flex items-center`}
                    >
                      <span className="block truncate">
                        Filter by location(s)
                      </span>
                      <IconChevronDown
                        stroke={2}
                        size={18}
                        className="ml-2 text-default-500"
                      />
                    </ComboboxButton>
                    <button
                      className="flex items-center ml-2"
                      onClick={() =>
                        handleFilterChange(
                          "applyLocationFilter",
                          !currentFilters.applyLocationFilter
                        )
                      }
                    >
                      {currentFilters.applyLocationFilter ? (
                        <IconSquareCheckFilled
                          width={18}
                          height={18}
                          className="text-blue-600"
                        />
                      ) : (
                        <IconSquare
                          width={18}
                          height={18}
                          stroke={2}
                          className="text-default-400"
                        />
                      )}
                    </button>
                  </div>
                  <Transition
                    show={open && currentFilters.applyLocationFilter}
                    as={Fragment}
                    leave="transition ease-in duration-100"
                    leaveFrom="opacity-100"
                    leaveTo="opacity-0"
                  >
                    <ComboboxOptions className="absolute z-10 w-full mt-1 p-1 border bg-white max-h-60 rounded-lg overflow-auto focus:outline-none">
                      {uniqueLocationOptions.length === 0 ? (
                        <div className="relative cursor-default select-none py-2 px-4 text-default-700">
                          No locations found.
                        </div>
                      ) : (
                        uniqueLocationOptions.map((option) => (
                          <ComboboxOption
                            key={option.id}
                            className={({ active }) =>
                              `relative cursor-pointer select-none py-2 px-4 ${
                                active ? "bg-default-100" : "text-default-900"
                              }`
                            }
                            value={option.id}
                          >
                            {({ selected }) => (
                              <>
                                <span
                                  className={`block truncate ${
                                    selected ? "font-medium" : "font-normal"
                                  }`}
                                >
                                  {option.name}
                                </span>
                                {selected ? (
                                  <span className="absolute inset-y-0 right-0 flex items-center pr-3 text-default-600">
                                    <IconCheck stroke={2} size={22} />
                                  </span>
                                ) : null}
                              </>
                            )}
                          </ComboboxOption>
                        ))
                      )}
                    </ComboboxOptions>
                  </Transition>
                </div>
              )}
            </Combobox>
          </div>
          {currentFilters.locationFilter &&
            currentFilters.locationFilter.length > 0 && (
              <div className="px-2.5 py-1 pb-2">
                <div className="flex flex-wrap gap-2">
                  {currentFilters.locationFilter.map((location) => (
                    <span
                      key={location}
                      className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-sky-100 text-sky-800 cursor-pointer"
                      onClick={() =>
                        handleLocationSelection(
                          currentFilters.locationFilter?.filter(
                            (l) => l !== location
                          ) ?? []
                        )
                      }
                    >
                      {getLocationName(location)}
                      <button className="ml-1 text-sky-600 hover:text-sky-800">
                        <IconX size={14} />
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            )}
        </div>
      )}
    </div>
  );
};

export default StaffFilterMenu;
