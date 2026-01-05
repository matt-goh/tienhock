// src/pages/GreenTarget/Dumpsters/DumpsterListPage.tsx
import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  IconSearch,
  IconCalendar,
  IconChevronLeft,
  IconChevronRight,
  IconPlus,
  IconCheck,
  IconChevronDown,
  IconMapPin,
  IconUser,
  IconTruck,
  IconCalendarTime,
} from "@tabler/icons-react";
import { createPortal } from "react-dom";
import {
  Listbox,
  ListboxButton,
  ListboxOption,
  ListboxOptions,
} from "@headlessui/react";
import { toast } from "react-hot-toast";
import ConfirmationDialog from "../../../components/ConfirmationDialog";
import Button from "../../../components/Button";
import { greenTargetApi } from "../../../routes/greentarget/api";
import LoadingSpinner from "../../../components/LoadingSpinner";

interface Dumpster {
  tong_no: string;
  status: "Available" | "Rented" | "Maintenance";
}

interface Rental {
  rental_id: number;
  customer_id: number;
  customer_name: string;
  tong_no: string;
  date_placed: string;
  date_picked: string | null;
  driver: string;
  location_address?: string | null;
}

interface DumpsterStatus {
  type: "available" | "rented" | "maintenance";
  rental?: Rental;
}

const DumpsterListPage: React.FC = () => {
  const navigate = useNavigate();
  const [dumpsters, setDumpsters] = useState<Dumpster[]>([]);
  const [rentals, setRentals] = useState<Rental[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("All");
  const [startDate, setStartDate] = useState<Date>(() => {
    const today = new Date();
    return new Date(today.getFullYear(), today.getMonth(), 1);
  });
  const [currentPage, setCurrentPage] = useState(1);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [dumpsterToDelete, setDumpsterToDelete] = useState<Dumpster | null>(
    null
  );

  const ITEMS_PER_PAGE = 100;

  // Fetch dumpsters and rentals on component mount
  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [dumpstersData, rentalsData] = await Promise.all([
        greenTargetApi.getDumpsters(),
        greenTargetApi.getRentals(),
      ]);
      setDumpsters(dumpstersData);
      setRentals(rentalsData);
    } catch (err) {
      console.error("Error fetching data:", err);
      toast.error("Failed to load dumpster data");
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (dumpsterToDelete) {
      try {
        await greenTargetApi.deleteDumpster(dumpsterToDelete.tong_no);
        setDumpsters(
          dumpsters.filter((d) => d.tong_no !== dumpsterToDelete.tong_no)
        );
        toast.success("Dumpster deleted successfully");
      } catch (err: any) {
        console.error("Error deleting dumpster:", err);
        if (err.message && err.message.includes("being used")) {
          toast.error(
            "Cannot delete dumpster: it is being used in one or more rentals"
          );
        } else {
          toast.error("Failed to delete dumpster");
        }
      } finally {
        setIsDeleteDialogOpen(false);
        setDumpsterToDelete(null);
      }
    }
  };

  // Generate a date range
  const getDateRange = (startDate: Date, days: number) => {
    const dates = [];
    for (let i = 0; i < days; i++) {
      const date = new Date(startDate);
      date.setDate(startDate.getDate() + i);
      dates.push(date);
    }
    return dates;
  };

  // Get days in the current month
  const getDaysInMonth = (date: Date) => {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  };

  const dateRange = getDateRange(startDate, getDaysInMonth(startDate));

  // Check if a date falls within a rental period
  const isDateInRental = (date: Date, rental: Rental) => {
    const rentalStart = new Date(rental.date_placed);
    rentalStart.setHours(0, 0, 0, 0);

    const rentalEnd = rental.date_picked ? new Date(rental.date_picked) : null;
    if (rentalEnd) rentalEnd.setHours(23, 59, 59, 999);

    const checkDate = new Date(date);
    checkDate.setHours(12, 0, 0, 0);

    if (!rentalEnd) {
      // If no pickup date, assume it's still rented
      return checkDate >= rentalStart;
    }

    return checkDate >= rentalStart && checkDate <= rentalEnd;
  };

  // Get dumpster status for a specific date
  const getDumpsterStatus = (
    dumpster: Dumpster,
    date: Date
  ): DumpsterStatus => {
    if (dumpster.status === "Maintenance") {
      return { type: "maintenance" };
    }

    const rental = rentals.find(
      (r) => r.tong_no === dumpster.tong_no && isDateInRental(date, r)
    );

    if (rental) {
      return { type: "rented", rental };
    }

    return { type: "available" };
  };

  // Get background color based on status
  const getStatusColor = (status: DumpsterStatus) => {
    switch (status.type) {
      case "available":
        return "bg-green-500";
      case "rented":
        return "bg-rose-500";
      case "maintenance":
        return "bg-amber-400";
      default:
        return "bg-default-200";
    }
  };

  // Format date for display
  const formatDate = (date: Date) => {
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  };

  const formatDetailDate = (dateString: string) => {
    const date = new Date(dateString);
    return date
      .toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      })
      .replace(/\//g, "/");
  };

  // Navigate to previous/next month
  const navigatePeriod = (direction: "prev" | "next") => {
    const newDate = new Date(startDate);
    if (direction === "prev") {
      newDate.setMonth(newDate.getMonth() - 1);
    } else {
      newDate.setMonth(newDate.getMonth() + 1);
    }
    setStartDate(newDate);
  };

  // Filter dumpsters based on search and status
  const filteredDumpsters = dumpsters.filter((dumpster) => {
    const matchesSearch = dumpster.tong_no
      .toLowerCase()
      .includes(searchTerm.toLowerCase());
    const matchesStatus =
      statusFilter === "All" || dumpster.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  // Paginate the filtered dumpsters
  const paginatedDumpsters = filteredDumpsters.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  const totalPages = Math.ceil(filteredDumpsters.length / ITEMS_PER_PAGE);

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  // Handle dumpster cell click - navigate to dumpster detail form
  const handleDumpsterCellClick = (dumpster: Dumpster) => {
    navigate(`/greentarget/dumpsters/${encodeURIComponent(dumpster.tong_no)}`);
  };

  // Now we'll use a tooltip instead of a modal for status details
  const [tooltipData, setTooltipData] = useState<{
    dumpster: Dumpster;
    date: Date;
    status: DumpsterStatus;
    position: { top: number; left: number };
    rowIndex: number;
  } | null>(null);

  const tooltipTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleStatusHover = (
    e: React.MouseEvent,
    dumpster: Dumpster,
    date: Date,
    status: DumpsterStatus,
    rowIndex: number
  ) => {
    e.stopPropagation(); // Prevent cell click navigation

    // Get position for the tooltip
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    // For first 2 rows, position below; otherwise position above
    const position = {
      top: rowIndex < 2 ? rect.bottom + 10 : rect.top - 10,
      left: rect.left + rect.width / 2,
    };

    // Clear any existing timeout
    if (tooltipTimeoutRef.current) {
      clearTimeout(tooltipTimeoutRef.current);
    }

    // Set tooltip data with a small delay
    tooltipTimeoutRef.current = setTimeout(() => {
      setTooltipData({ dumpster, date, status, position, rowIndex });
    }, 100);
  };

  const handleTooltipLeave = () => {
    if (tooltipTimeoutRef.current) {
      clearTimeout(tooltipTimeoutRef.current);
    }

    // Hide tooltip with a slight delay
    tooltipTimeoutRef.current = setTimeout(() => {
      setTooltipData(null);
    }, 200);
  };

  if (loading) {
    return (
      <div className="mt-40 w-full flex items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl text-default-700 dark:text-gray-200 font-bold">
          Dumpsters ({filteredDumpsters.length})
        </h1>
        <div className="flex space-x-3">
          <div className="relative">
            <IconSearch
              className="absolute left-3 top-1/2 transform -translate-y-1/2 text-default-400"
              size={22}
            />
            <input
              type="text"
              placeholder="Search"
              className="w-full pl-11 py-2 border border-default-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-default-900 dark:text-gray-100 placeholder:text-default-400 dark:placeholder:text-gray-400 focus:border-default-500 dark:focus:border-gray-500 rounded-full"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="w-48">
            <Listbox value={statusFilter} onChange={setStatusFilter}>
              <div className="relative">
                <ListboxButton className="w-full rounded-full border border-default-300 dark:border-gray-600 bg-white dark:bg-gray-800 py-2 pl-3 pr-10 text-left focus:outline-none focus:border-default-500">
                  <span className="pl-2 block truncate">
                    {statusFilter === "All"
                      ? "All Statuses"
                      : statusFilter === "Available"
                      ? "Available"
                      : statusFilter === "Rented"
                      ? "Rented"
                      : "Maintenance"}
                  </span>
                  <span className="absolute inset-y-0 right-0 flex items-center pr-4 pointer-events-none">
                    <IconChevronDown
                      className="h-5 w-5 text-default-400"
                      aria-hidden="true"
                    />
                  </span>
                </ListboxButton>
                <ListboxOptions className="absolute z-10 w-full p-1 mt-1 border bg-white dark:bg-gray-800 dark:border-gray-600 max-h-60 rounded-lg overflow-auto focus:outline-none shadow-lg">
                  <ListboxOption
                    className={({ active }) =>
                      `relative cursor-pointer select-none rounded py-2 pl-3 pr-9 ${
                        active
                          ? "bg-default-100 dark:bg-gray-700 text-default-900 dark:text-gray-100"
                          : "text-default-900 dark:text-gray-100"
                      }`
                    }
                    value="All"
                  >
                    {({ selected }) => (
                      <>
                        <span
                          className={`block truncate ${
                            selected ? "font-medium" : "font-normal"
                          }`}
                        >
                          All Statuses
                        </span>
                        {selected && (
                          <span className="absolute inset-y-0 right-0 flex items-center pr-3 text-default-600 dark:text-gray-300">
                            <IconCheck className="h-5 w-5" aria-hidden="true" />
                          </span>
                        )}
                      </>
                    )}
                  </ListboxOption>
                  <ListboxOption
                    className={({ active }) =>
                      `relative cursor-pointer select-none rounded py-2 pl-3 pr-9 ${
                        active
                          ? "bg-default-100 dark:bg-gray-700 text-default-900 dark:text-gray-100"
                          : "text-default-900 dark:text-gray-100"
                      }`
                    }
                    value="Available"
                  >
                    {({ selected }) => (
                      <>
                        <span
                          className={`block truncate ${
                            selected ? "font-medium" : "font-normal"
                          }`}
                        >
                          Available
                        </span>
                        {selected && (
                          <span className="absolute inset-y-0 right-0 flex items-center pr-3 text-default-600 dark:text-gray-300">
                            <IconCheck className="h-5 w-5" aria-hidden="true" />
                          </span>
                        )}
                      </>
                    )}
                  </ListboxOption>
                  <ListboxOption
                    className={({ active }) =>
                      `relative cursor-pointer select-none rounded py-2 pl-3 pr-9 ${
                        active
                          ? "bg-default-100 dark:bg-gray-700 text-default-900 dark:text-gray-100"
                          : "text-default-900 dark:text-gray-100"
                      }`
                    }
                    value="Rented"
                  >
                    {({ selected }) => (
                      <>
                        <span
                          className={`block truncate ${
                            selected ? "font-medium" : "font-normal"
                          }`}
                        >
                          Rented
                        </span>
                        {selected && (
                          <span className="absolute inset-y-0 right-0 flex items-center pr-3 text-default-600 dark:text-gray-300">
                            <IconCheck className="h-5 w-5" aria-hidden="true" />
                          </span>
                        )}
                      </>
                    )}
                  </ListboxOption>
                  <ListboxOption
                    className={({ active }) =>
                      `relative cursor-pointer select-none rounded py-2 pl-3 pr-9 ${
                        active
                          ? "bg-default-100 dark:bg-gray-700 text-default-900 dark:text-gray-100"
                          : "text-default-900 dark:text-gray-100"
                      }`
                    }
                    value="Maintenance"
                  >
                    {({ selected }) => (
                      <>
                        <span
                          className={`block truncate ${
                            selected ? "font-medium" : "font-normal"
                          }`}
                        >
                          Maintenance
                        </span>
                        {selected && (
                          <span className="absolute inset-y-0 right-0 flex items-center pr-3 text-default-600 dark:text-gray-300">
                            <IconCheck className="h-5 w-5" aria-hidden="true" />
                          </span>
                        )}
                      </>
                    )}
                  </ListboxOption>
                </ListboxOptions>
              </div>
            </Listbox>
          </div>
          <Button
            onClick={() => navigate("/greentarget/dumpsters/new")}
            icon={IconPlus}
            variant="outline"
          >
            Add Dumpster
          </Button>
        </div>
      </div>

      {/* Availability Calendar */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-default-200 dark:border-gray-700 overflow-hidden shadow-sm mb-6">
        <div className="border-b border-default-200 dark:border-gray-700 px-4 py-3 flex justify-between items-center bg-default-50 dark:bg-gray-900/50">
          <div className="flex items-center">
            <IconCalendar size={18} className="text-default-500 dark:text-gray-400 mr-2" />
            <h3 className="font-medium text-default-900 dark:text-gray-100">
              Dumpster Availability Timeline
            </h3>
          </div>

          {/* Navigation buttons */}
          <div className="flex items-center space-x-6">
            <div className="flex items-center space-x-3 bg-white dark:bg-gray-800 border border-default-200 dark:border-gray-700 px-3 py-1 rounded-full shadow-sm">
              <div className="w-2.5 h-2.5 rounded-full bg-green-500"></div>
              <span className="text-sm text-default-600 dark:text-gray-300">Available</span>

              <div className="w-2.5 h-2.5 rounded-full bg-rose-500"></div>
              <span className="text-sm text-default-600 dark:text-gray-300">Rented</span>

              <div className="w-2.5 h-2.5 rounded-full bg-amber-400"></div>
              <span className="text-sm text-default-600 dark:text-gray-300">Maintenance</span>
            </div>

            <div className="flex items-center border border-default-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 shadow-sm overflow-hidden">
              <button
                onClick={() => {
                  const today = new Date();
                  setStartDate(new Date(today.getFullYear(), today.getMonth(), 1));
                }}
                className="text-sm font-medium text-default-700 dark:text-gray-200 px-3 py-1 hover:bg-default-100 dark:hover:bg-gray-600 transition-colors"
                title="Go to current month"
              >
                {startDate.toLocaleDateString("en-US", {
                  month: "long",
                  year: "numeric",
                })}
              </button>
              <div className="w-px h-5 bg-default-300 dark:bg-gray-600"></div>
              <div className="flex items-center">
                <button
                  onClick={() => navigatePeriod("prev")}
                  className="p-1.5 hover:bg-default-100 dark:hover:bg-gray-600 transition-colors"
                  title="Previous month"
                >
                  <IconChevronLeft size={18} className="text-default-700 dark:text-gray-200" />
                </button>
                <div className="w-px h-5 bg-default-300 dark:bg-gray-600"></div>
                <button
                  onClick={() => navigatePeriod("next")}
                  className="p-1.5 hover:bg-default-100 dark:hover:bg-gray-600 transition-colors"
                  title="Next month"
                >
                  <IconChevronRight size={18} className="text-default-700 dark:text-gray-200" />
                </button>
              </div>
            </div>
          </div>
        </div>

        {filteredDumpsters.length === 0 ? (
          <div className="p-8 text-center text-default-500 dark:text-gray-400">
            No dumpsters match your search criteria.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <div
              className="min-w-max grid"
              style={{
                gridTemplateColumns: `minmax(90px, auto) repeat(${dateRange.length}, minmax(22px, 1fr))`,
              }}
            >
              {/* Header Row: Dates */}
              <div className="bg-default-50 dark:bg-gray-900/50 py-2 px-2 sticky left-0 z-10 text-sm font-medium text-default-600 dark:text-gray-300 border-b border-r border-default-200 dark:border-gray-700">
                Dumpster
              </div>
              {dateRange.map((date, index) => {
                // Highlight today
                const isToday =
                  new Date().toDateString() === date.toDateString();
                return (
                  <div
                    key={index}
                    className={`bg-default-50 dark:bg-gray-900/50 py-2 px-0 text-center text-xs font-medium border-b border-default-200 dark:border-gray-700 ${
                      index < dateRange.length - 1 ? "border-r" : ""
                    } ${
                      isToday ? "text-sky-700 dark:text-sky-400 bg-sky-50 dark:bg-sky-900/30" : "text-default-600 dark:text-gray-300"
                    }`}
                  >
                    {formatDate(date)}
                    {isToday && (
                      <div className="h-0.5 w-4 bg-sky-500 mx-auto mt-1 rounded-full"></div>
                    )}
                  </div>
                );
              })}

              {/* Dumpster Rows */}
              {paginatedDumpsters.map((dumpster, dumpsterIndex) => (
                <React.Fragment key={dumpster.tong_no}>
                  <div
                    className={`py-2 px-3 sticky left-0 z-10 bg-white dark:bg-gray-800 font-medium ${
                      dumpster.status === "Available"
                        ? "text-green-700 dark:text-green-400"
                        : dumpster.status === "Maintenance"
                        ? "text-amber-700 dark:text-amber-400"
                        : "text-default-700 dark:text-gray-200"
                    } border-r border-default-200 dark:border-gray-700 ${
                      dumpsterIndex < paginatedDumpsters.length - 1
                        ? "border-b"
                        : ""
                    } hover:bg-default-50 dark:hover:bg-gray-700 cursor-pointer transition-colors`}
                    onClick={() => handleDumpsterCellClick(dumpster)}
                  >
                    <div className="flex items-center">
                      <div
                        className={`w-2 h-2 rounded-full mr-2 ${
                          dumpster.status === "Available"
                            ? "bg-green-500"
                            : dumpster.status === "Maintenance"
                            ? "bg-amber-400"
                            : dumpster.status === "Rented"
                            ? "bg-rose-500"
                            : "bg-default-300"
                        }`}
                      ></div>
                      {dumpster.tong_no}
                    </div>
                  </div>
                  {dateRange.map((date, dateIndex) => {
                    const status = getDumpsterStatus(dumpster, date);
                    // Highlight today's column
                    const isToday =
                      new Date().toDateString() === date.toDateString();

                    return (
                      <div
                        key={dateIndex}
                        className={`py-2 px-0.5 ${
                          dumpsterIndex < paginatedDumpsters.length - 1
                            ? "border-b"
                            : ""
                        } ${
                          dateIndex < dateRange.length - 1 ? "border-r" : ""
                        } border-default-200 dark:border-gray-700 flex justify-center items-center hover:bg-default-50 dark:hover:bg-gray-700 cursor-pointer transition-colors ${
                          isToday ? "bg-sky-50/30 dark:bg-sky-900/20" : ""
                        }`}
                        onClick={() => handleDumpsterCellClick(dumpster)}
                      >
                        <div
                          className={`w-5 h-5 rounded-full ${getStatusColor(
                            status
                          )} cursor-help hover:ring-2 hover:ring-offset-1 hover:ring-default-300 transition-all`}
                          onMouseEnter={(e) =>
                            handleStatusHover(e, dumpster, date, status, dumpsterIndex)
                          }
                          onMouseLeave={handleTooltipLeave}
                        ></div>
                      </div>
                    );
                  })}
                </React.Fragment>
              ))}
            </div>
          </div>
        )}

        {/* Status Tooltip */}
        {tooltipData &&
          createPortal(
            <div
              className={`fixed z-[9999] bg-white dark:bg-gray-800 border border-default-200 dark:border-gray-700 shadow-lg rounded-lg p-3 transform -translate-x-1/2 ${
                tooltipData.rowIndex < 2 ? "" : "-translate-y-full"
              }`}
              style={{
                top: `${tooltipData.position.top}px`,
                left: `${tooltipData.position.left}px`,
                maxWidth: "320px",
              }}
              onMouseEnter={() => {
                if (tooltipTimeoutRef.current) {
                  clearTimeout(tooltipTimeoutRef.current);
                }
              }}
              onMouseLeave={handleTooltipLeave}
            >
              <div className="space-y-2">
                <div className="flex flex-col gap-1">
                  <div className="flex items-center justify-between gap-1.5">
                    <div className="flex items-center gap-1.5">
                      <div
                        className={`w-3 h-3 rounded-full ${getStatusColor(
                          tooltipData.status
                        )}`}
                      ></div>
                      <span
                        className={`text-sm font-medium ${
                          tooltipData.status.type === "available"
                            ? "text-green-700"
                            : tooltipData.status.type === "rented"
                            ? "text-rose-700"
                            : "text-amber-700"
                        }`}
                      >
                        {tooltipData.status.type === "available"
                          ? "Available"
                          : tooltipData.status.type === "rented"
                          ? "Rented"
                          : "Under Maintenance"}
                      </span>
                    </div>
                    <span className="text-xs text-default-500 dark:text-gray-400">
                      {formatDetailDate(
                        tooltipData.date.toISOString().split("T")[0]
                      )}
                    </span>
                  </div>
                </div>

                <div className="font-medium text-default-800 dark:text-gray-100">
                  Dumpster: {tooltipData.dumpster.tong_no}
                </div>

                {tooltipData.status.type === "rented" &&
                  tooltipData.status.rental && (
                    <div className="space-y-1.5 text-sm border-t border-default-100 dark:border-gray-700 pt-2 mt-1">
                      <div className="flex items-start gap-2">
                        <IconUser
                          size={16}
                          className="mt-0.5 text-default-400 shrink-0"
                        />
                        <span className="text-default-700 dark:text-gray-200">
                          {tooltipData.status.rental.customer_name}
                        </span>
                      </div>

                      {tooltipData.status.rental.location_address && (
                        <div className="flex items-start gap-2">
                          <IconMapPin
                            size={16}
                            className="mt-0.5 text-default-400 shrink-0"
                          />
                          <span className="text-default-600 dark:text-gray-300 text-sm">
                            {tooltipData.status.rental.location_address}
                          </span>
                        </div>
                      )}

                      <div className="flex items-start gap-2">
                        <IconCalendarTime
                          size={16}
                          className="mt-0.5 text-default-400 shrink-0"
                        />
                        <div className="flex flex-col">
                          <span className="text-default-600 dark:text-gray-300 text-sm">
                            Placed:{" "}
                            {formatDetailDate(
                              tooltipData.status.rental.date_placed
                            )}
                          </span>
                          {tooltipData.status.rental.date_picked ? (
                            <span className="text-default-600 dark:text-gray-300 text-sm">
                              Pickup:{" "}
                              {formatDetailDate(
                                tooltipData.status.rental.date_picked
                              )}
                            </span>
                          ) : (
                            <span className="text-green-600 text-sm">
                              Ongoing rental
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-start gap-2">
                        <IconTruck
                          size={16}
                          className="mt-0.5 text-default-400 shrink-0"
                        />
                        <span className="text-default-600 dark:text-gray-300 text-sm">
                          Driver: {tooltipData.status.rental.driver}
                        </span>
                      </div>

                      <div className="flex justify-end pt-1.5">
                        <button
                          className="text-sm text-sky-600 dark:text-sky-400 hover:text-sky-800 font-medium"
                          onClick={() => {
                            navigate(
                              `/greentarget/rentals/${tooltipData.status.rental?.rental_id}`
                            );
                            setTooltipData(null);
                          }}
                        >
                          View rental details →
                        </button>
                      </div>
                    </div>
                  )}
              </div>
            </div>,
            document.body
          )}
      </div>

      {/* Pagination Controls */}
      {filteredDumpsters.length > ITEMS_PER_PAGE && (
        <div className="mt-6 flex justify-between items-center text-default-700 dark:text-gray-200">
          <button
            className="pl-2.5 pr-4 py-2 inline-flex items-center justify-center rounded-full font-medium transition-colors duration-200 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 bg-background hover:bg-default-100 dark:hover:bg-gray-700 dark:bg-gray-800 active:bg-default-200"
            onClick={() => handlePageChange(currentPage - 1)}
            disabled={currentPage === 1}
          >
            <IconChevronLeft className="w-5 h-5 mr-2" /> Previous
          </button>
          <div className="flex space-x-2">
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              // Logic to determine which page numbers to show
              let pageNum = i + 1;
              if (totalPages > 5) {
                if (currentPage <= 3) {
                  pageNum = i + 1;
                } else if (currentPage >= totalPages - 2) {
                  pageNum = totalPages - 4 + i;
                } else {
                  pageNum = currentPage - 2 + i;
                }
              }

              return (
                <button
                  key={i}
                  onClick={() => handlePageChange(pageNum)}
                  className={`inline-flex items-center justify-center rounded-full text-sm transition-colors duration-200 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 h-10 w-10 hover:bg-default-100 dark:hover:bg-gray-700 active:bg-default-200 dark:active:bg-gray-600 ${
                    pageNum === currentPage
                      ? "border border-default-200 dark:border-gray-600 font-semibold"
                      : "font-medium"
                  }`}
                >
                  {pageNum}
                </button>
              );
            })}
          </div>
          <button
            className="pl-4 pr-2.5 py-2 inline-flex items-center justify-center rounded-full font-medium transition-colors duration-200 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 bg-background hover:bg-default-100 dark:hover:bg-gray-700 dark:bg-gray-800 active:bg-default-200"
            onClick={() => handlePageChange(currentPage + 1)}
            disabled={currentPage === totalPages}
          >
            Next <IconChevronRight className="w-5 h-5 ml-2" />
          </button>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <ConfirmationDialog
        isOpen={isDeleteDialogOpen}
        onClose={() => setIsDeleteDialogOpen(false)}
        onConfirm={handleConfirmDelete}
        title="Delete Dumpster"
        message={`Are you sure you want to delete dumpster ${dumpsterToDelete?.tong_no}? This action cannot be undone.`}
        confirmButtonText="Delete"
        variant="danger"
      />
    </div>
  );
};

export default DumpsterListPage;
