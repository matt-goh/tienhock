// src/pages/GreenTarget/Payroll/DriverTripEntryPage.tsx
import React, { useState, useEffect, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import Button from "../../../components/Button";
import BackButton from "../../../components/BackButton";
import LoadingSpinner from "../../../components/LoadingSpinner";
import MonthNavigator from "../../../components/MonthNavigator";
import toast from "react-hot-toast";
import { api } from "../../../routes/utils/api";
import {
  IconTruck,
  IconRefresh,
  IconCheck,
  IconX,
  IconMapPin,
} from "@tabler/icons-react";
import { format } from "date-fns";

interface GTPayrollEmployee {
  id: number;
  employee_id: string;
  job_type: "OFFICE" | "DRIVER";
  employee_name: string;
}

interface DriverTrip {
  id?: number;
  driver_id: string;
  driver_name?: string;
  year: number;
  month: number;
  trip_count: number;
  completed_rental_ids: number[];
  auto_calculated: boolean;
}

interface Rental {
  rental_id: number;
  date_placed: string;
  date_picked: string | null;
  driver: string;
  customer_id: number;
  customer_name: string;
  location_id: number;
  location_address: string;
  dumpster_id: number;
  dumpster_name: string;
}

const DriverTripEntryPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // Form state
  const currentDate = new Date();
  const [formData, setFormData] = useState({
    logMonth: parseInt(searchParams.get("month") || "") || currentDate.getMonth() + 1,
    logYear: parseInt(searchParams.get("year") || "") || currentDate.getFullYear(),
  });

  const [drivers, setDrivers] = useState<GTPayrollEmployee[]>([]);
  const [driverTrips, setDriverTrips] = useState<Record<string, DriverTrip>>({});
  const [rentals, setRentals] = useState<Rental[]>([]);
  const [selectedDriver, setSelectedDriver] = useState<string>("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isAutoCalculating, setIsAutoCalculating] = useState(false);

  // Computed date for MonthNavigator
  const selectedMonthDate = useMemo(() => {
    return new Date(formData.logYear, formData.logMonth - 1, 1);
  }, [formData.logMonth, formData.logYear]);

  // Fetch data
  useEffect(() => {
    fetchData();
  }, [formData.logMonth, formData.logYear]);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      // Fetch GT DRIVER employees and existing trips
      const [employeesResponse, tripsResponse] = await Promise.all([
        api.get("/greentarget/api/payroll-employees"),
        api.get(`/greentarget/api/driver-trips?year=${formData.logYear}&month=${formData.logMonth}`),
      ]);

      const driverEmployees = employeesResponse.filter(
        (e: GTPayrollEmployee) => e.job_type === "DRIVER"
      );
      setDrivers(driverEmployees);

      // Build trips map
      const tripsMap: Record<string, DriverTrip> = {};
      tripsResponse.forEach((trip: DriverTrip) => {
        tripsMap[trip.driver_id] = trip;
      });
      setDriverTrips(tripsMap);

      // Select first driver by default
      if (driverEmployees.length > 0 && !selectedDriver) {
        setSelectedDriver(driverEmployees[0].employee_id);
      }
    } catch (error) {
      console.error("Error fetching data:", error);
      toast.error("Failed to load data");
    } finally {
      setIsLoading(false);
    }
  };

  // Fetch rentals when driver changes
  useEffect(() => {
    if (selectedDriver) {
      fetchRentals();
    }
  }, [selectedDriver, formData.logMonth, formData.logYear]);

  const fetchRentals = async () => {
    try {
      const response = await api.get(
        `/greentarget/api/driver-trips/rentals?year=${formData.logYear}&month=${formData.logMonth}&driver_id=${selectedDriver}`
      );
      setRentals(response);
    } catch (error) {
      console.error("Error fetching rentals:", error);
    }
  };

  const handleMonthChange = (newMonth: Date) => {
    setFormData({
      logMonth: newMonth.getMonth() + 1,
      logYear: newMonth.getFullYear(),
    });
  };

  const handleAutoCalculate = async () => {
    setIsAutoCalculating(true);
    try {
      const response = await api.get(
        `/greentarget/api/driver-trips/auto-calculate?year=${formData.logYear}&month=${formData.logMonth}`
      );

      // Save all drivers' trips
      if (response.drivers?.length > 0) {
        await api.post("/greentarget/api/driver-trips/bulk", {
          year: formData.logYear,
          month: formData.logMonth,
          drivers: response.drivers.map((d: { driver_id: string; trip_count: number; rental_ids: number[] }) => ({
            driver_id: d.driver_id,
            trip_count: d.trip_count,
            completed_rental_ids: d.rental_ids,
          })),
        });

        toast.success(`Auto-calculated trips for ${response.drivers.length} driver(s)`);
        await fetchData();
      } else {
        toast.info("No completed rentals found for this month");
      }
    } catch (error) {
      console.error("Error auto-calculating:", error);
      toast.error("Failed to auto-calculate trips");
    } finally {
      setIsAutoCalculating(false);
    }
  };

  const handleTripCountChange = (driverId: string, count: number) => {
    setDriverTrips((prev) => ({
      ...prev,
      [driverId]: {
        ...prev[driverId],
        driver_id: driverId,
        year: formData.logYear,
        month: formData.logMonth,
        trip_count: count,
        completed_rental_ids: prev[driverId]?.completed_rental_ids || [],
        auto_calculated: false,
      },
    }));
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      // Save all driver trips
      const driversToSave = Object.values(driverTrips);

      if (driversToSave.length === 0) {
        toast.error("No trip data to save");
        return;
      }

      await api.post("/greentarget/api/driver-trips/bulk", {
        year: formData.logYear,
        month: formData.logMonth,
        drivers: driversToSave.map((trip) => ({
          driver_id: trip.driver_id,
          trip_count: trip.trip_count,
          completed_rental_ids: trip.completed_rental_ids,
        })),
      });

      toast.success("Driver trips saved successfully");
      navigate("/greentarget/payroll");
    } catch (error) {
      console.error("Error saving trips:", error);
      toast.error("Failed to save trips");
    } finally {
      setIsSaving(false);
    }
  };

  // Calculate totals
  const totalTrips = Object.values(driverTrips).reduce(
    (sum, trip) => sum + (trip.trip_count || 0),
    0
  );

  // Get selected driver's rentals
  const driverRentals = rentals.filter((r) => r.driver === selectedDriver);
  const completedRentals = driverRentals.filter((r) => r.date_picked !== null);

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-3">
      {/* Header */}
      <div className="flex items-center gap-4">
        <BackButton fallbackPath="/greentarget/payroll" />
        <div>
          <h1 className="text-2xl font-semibold text-default-800 dark:text-gray-100">
            Driver Trips
          </h1>
          <p className="text-sm text-default-500 dark:text-gray-400">
            Track completed deliveries for DRIVER employees
          </p>
        </div>
      </div>

      {/* Month Navigator */}
      <MonthNavigator
        selectedMonth={selectedMonthDate}
        onMonthChange={handleMonthChange}
      />

      {/* No Drivers State */}
      {drivers.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-8 text-center">
          <IconTruck size={48} className="mx-auto text-default-300 dark:text-gray-600 mb-4" />
          <h3 className="text-lg font-medium text-default-800 dark:text-gray-200 mb-2">
            No DRIVER Employees
          </h3>
          <p className="text-default-500 dark:text-gray-400 mb-4">
            Add DRIVER employees to GT Payroll first.
          </p>
          <Button
            variant="outline"
            onClick={() => navigate("/greentarget/payroll")}
          >
            Go to Payroll
          </Button>
        </div>
      ) : (
        <>
          {/* Auto Calculate Button */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-medium text-default-800 dark:text-gray-200">
                  Auto-Calculate from Rentals
                </h3>
                <p className="text-sm text-default-500 dark:text-gray-400">
                  Count completed rentals (with pickup date) for each driver
                </p>
              </div>
              <Button
                variant="outline"
                onClick={handleAutoCalculate}
                disabled={isAutoCalculating}
                className="flex items-center gap-2"
              >
                {isAutoCalculating ? (
                  <LoadingSpinner size="xs" hideText />
                ) : (
                  <IconRefresh size={18} />
                )}
                Auto-Calculate
              </Button>
            </div>
          </div>

          {/* Driver Trip Summary */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
            <div className="px-4 py-3 border-b border-default-200 dark:border-gray-700">
              <h3 className="font-medium text-default-800 dark:text-gray-200">
                Trip Summary
              </h3>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-default-50 dark:bg-gray-700">
                <tr>
                  <th className="px-4 py-3 text-left text-default-600 dark:text-gray-300 font-medium">
                    Driver
                  </th>
                  <th className="px-4 py-3 text-center text-default-600 dark:text-gray-300 font-medium w-40">
                    Trip Count
                  </th>
                  <th className="px-4 py-3 text-center text-default-600 dark:text-gray-300 font-medium w-32">
                    Status
                  </th>
                  <th className="px-4 py-3 text-center text-default-600 dark:text-gray-300 font-medium w-32">
                    Details
                  </th>
                </tr>
              </thead>
              <tbody>
                {drivers.map((driver) => {
                  const trip = driverTrips[driver.employee_id];
                  const tripCount = trip?.trip_count || 0;

                  return (
                    <tr
                      key={driver.employee_id}
                      className={`border-b border-default-100 dark:border-gray-700 ${
                        selectedDriver === driver.employee_id
                          ? "bg-amber-50 dark:bg-amber-900/20"
                          : ""
                      }`}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <IconTruck size={18} className="text-amber-500" />
                          <span className="font-medium text-default-800 dark:text-gray-200">
                            {driver.employee_name}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <input
                          type="number"
                          min="0"
                          value={tripCount}
                          onChange={(e) =>
                            handleTripCountChange(
                              driver.employee_id,
                              parseInt(e.target.value) || 0
                            )
                          }
                          className="w-20 px-2 py-1 text-center border border-default-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-default-800 dark:text-gray-200 rounded"
                        />
                      </td>
                      <td className="px-4 py-3 text-center">
                        {trip?.auto_calculated ? (
                          <span className="inline-flex items-center gap-1 px-2 py-1 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 rounded text-xs">
                            <IconCheck size={14} />
                            Auto
                          </span>
                        ) : tripCount > 0 ? (
                          <span className="inline-flex items-center gap-1 px-2 py-1 bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-400 rounded text-xs">
                            Manual
                          </span>
                        ) : (
                          <span className="text-default-400 dark:text-gray-500 text-xs">
                            Not set
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setSelectedDriver(driver.employee_id)}
                          className={
                            selectedDriver === driver.employee_id
                              ? "text-amber-600 dark:text-amber-400"
                              : ""
                          }
                        >
                          View
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="bg-default-50 dark:bg-gray-700">
                <tr>
                  <td className="px-4 py-3 font-medium text-default-800 dark:text-gray-200">
                    Total
                  </td>
                  <td className="px-4 py-3 text-center font-semibold text-amber-600 dark:text-amber-400">
                    {totalTrips}
                  </td>
                  <td colSpan={2}></td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Selected Driver's Rentals */}
          {selectedDriver && (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
              <div className="px-4 py-3 border-b border-default-200 dark:border-gray-700">
                <h3 className="font-medium text-default-800 dark:text-gray-200">
                  Rentals for{" "}
                  {drivers.find((d) => d.employee_id === selectedDriver)?.employee_name}
                </h3>
                <p className="text-sm text-default-500 dark:text-gray-400">
                  {completedRentals.length} completed / {driverRentals.length} total
                </p>
              </div>
              {driverRentals.length === 0 ? (
                <div className="p-4 text-center text-default-500 dark:text-gray-400">
                  No rentals assigned to this driver for this month
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-default-50 dark:bg-gray-700">
                    <tr>
                      <th className="px-4 py-2 text-left text-default-600 dark:text-gray-300 font-medium">
                        Date Placed
                      </th>
                      <th className="px-4 py-2 text-left text-default-600 dark:text-gray-300 font-medium">
                        Customer
                      </th>
                      <th className="px-4 py-2 text-left text-default-600 dark:text-gray-300 font-medium">
                        Location
                      </th>
                      <th className="px-4 py-2 text-center text-default-600 dark:text-gray-300 font-medium w-32">
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {driverRentals.map((rental) => (
                      <tr
                        key={rental.rental_id}
                        className="border-b border-default-100 dark:border-gray-700"
                      >
                        <td className="px-4 py-2 text-default-800 dark:text-gray-200">
                          {format(new Date(rental.date_placed), "dd MMM yyyy")}
                        </td>
                        <td className="px-4 py-2 text-default-800 dark:text-gray-200">
                          {rental.customer_name}
                        </td>
                        <td className="px-4 py-2">
                          <div className="flex items-center gap-1 text-default-600 dark:text-gray-400">
                            <IconMapPin size={14} />
                            <span className="truncate max-w-[200px]">
                              {rental.location_address || "N/A"}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-2 text-center">
                          {rental.date_picked ? (
                            <span className="inline-flex items-center gap-1 px-2 py-1 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 rounded text-xs">
                              <IconCheck size={14} />
                              Completed
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-1 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 rounded text-xs">
                              <IconX size={14} />
                              Pending
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => navigate("/greentarget/payroll")}>
              Cancel
            </Button>
            <Button
              color="emerald"
              variant="filled"
              onClick={handleSave}
              disabled={isSaving || totalTrips === 0}
            >
              {isSaving ? (
                <>
                  <LoadingSpinner size="xs" hideText />
                  <span className="ml-2">Saving...</span>
                </>
              ) : (
                "Save Trips"
              )}
            </Button>
          </div>
        </>
      )}
    </div>
  );
};

export default DriverTripEntryPage;
