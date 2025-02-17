// dateUtils.ts

// Keep the existing formatDateForAPI function
export const formatDateForAPI = (date: Date): string => {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
    2,
    "0"
  )}-${String(date.getDate()).padStart(2, "0")}`;
};

// Updated to return both date and time
export const parseDatabaseTimestamp = (
  timestamp: string | number | null
): { date: Date | null; formattedTime: string | null } => {
  if (timestamp === null) return { date: null, formattedTime: null };

  // Convert string to number if necessary
  const numericTimestamp =
    typeof timestamp === "string" ? parseInt(timestamp) : timestamp;

  // Check if we have a valid number
  if (isNaN(numericTimestamp)) return { date: null, formattedTime: null };

  const date = new Date(numericTimestamp);

  // Validate the date
  if (!(date instanceof Date && !isNaN(date.getTime())))
    return { date: null, formattedTime: null };

  // Format time as HH:mm
  const formattedTime = date
    .toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    })
    .toLowerCase(); // Makes it like "02:47 pm"

  return { date, formattedTime };
};

export const formatDisplayDate = (date: Date | null): string => {
  if (!date) return "";
  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
};

// For HTML date input (YYYY-MM-DD since this is required for input type="date")
export const formatDateForInput = (timestamp: string | number): string => {
  const { date } = parseDatabaseTimestamp(timestamp);
  if (!date) return "";

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`; // Keep YYYY-MM-DD for HTML date input
};

// Convert from date input value to timestamp string
export const dateInputToTimestamp = (dateString: string): string => {
  const [year, month, day] = dateString.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return date.getTime().toString(); // Convert timestamp to string
};
