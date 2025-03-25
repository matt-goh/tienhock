import React, { useState, useEffect } from "react";
import { greenTargetApi } from "../../routes/greentarget/api";

const DumpsterAvailabilityCalendar = () => {
  // Define interface for dumpster object
  interface Dumpster {
    tong_no: string | number;
    status?: string;
  }

  const [dumpsters, setDumpsters] = useState<Dumpster[]>([]);
  const [rentals, setRentals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Fetch dumpsters and rentals on component mount
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [dumpstersData, rentalsData] = await Promise.all([
          greenTargetApi.getDumpsters(), // Fetch all dumpsters
          greenTargetApi.getRentals(), // Fetch all rentals
        ]);
        setDumpsters(dumpstersData);
        setRentals(rentalsData);
        setLoading(false);
      } catch (error) {
        console.error("Error fetching data:", error);
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  // Display loading state
  if (loading) {
    return <div>Loading...</div>;
  }

  // Generate a 30-day date range starting from today
  const getDateRange = (days: number) => {
    const today = new Date();
    const dates = [];
    for (let i = 0; i < days; i++) {
      const date = new Date(today);
      date.setDate(today.getDate() + i);
      dates.push(date.toISOString().split("T")[0]); // Format as YYYY-MM-DD
    }
    return dates;
  };

  const dateRange = getDateRange(30);

  // Check if a date falls within a rental period
  const isDateInRental = (
    date: string | number | Date,
    rental: {
      date_placed: string | number | Date;
      date_picked: string | number | Date;
    }
  ) => {
    const rentalStart = new Date(rental.date_placed);
    const rentalEnd = rental.date_picked ? new Date(rental.date_picked) : null;
    const checkDate = new Date(date);

    if (!rentalEnd) {
      // If no pickup date, assume it's still rented
      return checkDate >= rentalStart;
    }

    return checkDate >= rentalStart && checkDate <= rentalEnd;
  };

  // Define interface for dumpster object
  interface Dumpster {
    tong_no: string | number;
    status?: string;
  }

  // Determine dumpster status for a specific date
  const getDumpsterStatus = (
    dumpster: Dumpster,
    date: string,
    rentals: any[]
  ) => {
    if (dumpster.status === "Maintenance") {
      return { type: "maintenance" };
    }

    const rental = rentals.find(
      (r: {
        tong_no: any;
        date_placed: string | number | Date;
        date_picked: string | number | Date;
      }) => r.tong_no === dumpster.tong_no && isDateInRental(date, r)
    );
    if (rental) {
      return { type: "rented", rental };
    }

    return { type: "available" };
  };

  // Get background color based on status (using Tailwind CSS)
  const getStatusColor = (
    status: { type: string; rental?: undefined } | { type: string; rental: any }
  ) => {
    switch (status.type) {
      case "available":
        return "bg-green-200";
      case "rented":
        return "bg-red-200";
      case "maintenance":
        return "bg-yellow-200";
      default:
        return "bg-gray-200";
    }
  };

  // Get tooltip text for hover
  const getStatusTooltip = (
    status: { type: string; rental?: undefined } | { type: string; rental: any }
  ) => {
    switch (status.type) {
      case "available":
        return "Available";
      case "rented":
        return `Rented to ${status.rental.customer_name}`;
      case "maintenance":
        return "Under Maintenance";
      default:
        return "";
    }
  };

  // Show detailed status when a cell is clicked
  const showDetails = (
    dumpster: Dumpster,
    date: string,
    status: { type: string; rental?: undefined } | { type: string; rental: any }
  ) => {
    let message = `Dumpster ${dumpster.tong_no} on ${date}: `;
    switch (status.type) {
      case "available":
        message += "Available";
        break;
      case "rented":
        message += `Rented to ${status.rental.customer_name}\n`;
        message += `Rental ID: ${status.rental.rental_id}\n`;
        message += `Placement Date: ${status.rental.date_placed}\n`;
        message += `Pickup Date: ${status.rental.date_picked || "N/A"}`;
        break;
      case "maintenance":
        message += "Under Maintenance";
        break;
      default:
        message += "Unknown";
    }
    alert(message);
  };

  return (
    <div className="dumpster-availability-calendar">
      <div className="grid grid-cols-[auto_repeat(30,_minmax(0,_1fr))] gap-1">
        {/* Header Row: Dates */}
        <div className="col-span-1"></div> {/* Empty cell for alignment */}
        {dateRange.map((date) => (
          <div key={date} className="text-center text-sm font-medium">
            {new Date(date).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
            })}
          </div>
        ))}
        {/* Dumpster Rows */}
        {dumpsters.map((dumpster) => (
          <React.Fragment key={dumpster.tong_no}>
            <div className="text-right pr-2 font-medium">
              {dumpster.tong_no}
            </div>
            {dateRange.map((date) => {
              const status = getDumpsterStatus(dumpster, date, rentals);
              return (
                <div
                  key={date}
                  className={`h-8 w-8 rounded-full ${getStatusColor(
                    status
                  )} cursor-pointer`}
                  title={getStatusTooltip(status)}
                  onClick={() => showDetails(dumpster, date, status)}
                ></div>
              );
            })}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
};

export default DumpsterAvailabilityCalendar;
