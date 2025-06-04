import { useState, useEffect } from "react";

export const useMonthSelection = (activeTab: number) => {
  const [selectedMonth, setSelectedMonth] = useState<number>();
  const [selectedYear, setSelectedYear] = useState<number>();

  useEffect(() => {
    // Listen for month selection changes from the product/salesman pages
    const handleMonthChange = (event: CustomEvent) => {
      setSelectedMonth(event.detail.month);
      setSelectedYear(event.detail.year);
    };

    window.addEventListener("monthSelectionChanged" as any, handleMonthChange);
    return () => {
      window.removeEventListener(
        "monthSelectionChanged" as any,
        handleMonthChange
      );
    };
  }, []);

  return { selectedMonth, selectedYear };
};
