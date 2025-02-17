// src/utils/dateUtils.ts

export const formatDateForAPI = (date: Date): string => {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
    2,
    "0"
  )}-${String(date.getDate()).padStart(2, "0")}`;
};

export const parseDatabaseTimestamp = (
  timestamp: string | number | null
): Date | null => {
  if (timestamp === null) return null;

  // Convert string to number if necessary
  const numericTimestamp =
    typeof timestamp === "string" ? parseInt(timestamp) : timestamp;

  // Check if we have a valid number
  if (isNaN(numericTimestamp)) return null;

  const date = new Date(numericTimestamp);

  // Validate the date
  if (!(date instanceof Date && !isNaN(date.getTime()))) return null;

  return date;
};

export const formatDisplayDate = (date: Date | null): string => {
  if (!date) return "";
  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
};
