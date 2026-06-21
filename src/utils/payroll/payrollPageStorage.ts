const LAST_ACCESSED_PAYROLL_MONTH_STORAGE_KEY: string =
  "payroll-last-accessed-month";
const LAST_ACCESSED_SALARY_REPORT_TAB_STORAGE_KEY: string =
  "salary-report-last-accessed-tab";
const SALARY_REPORT_TAB_COUNT: number = 5;

export const readLastAccessedPayrollMonth = (): Date | null => {
  try {
    const storedMonth: string | null = localStorage.getItem(
      LAST_ACCESSED_PAYROLL_MONTH_STORAGE_KEY
    );
    const matchedMonth: RegExpExecArray | null = storedMonth
      ? /^(\d{4})-(0[1-9]|1[0-2])$/.exec(storedMonth)
      : null;

    if (!matchedMonth) return null;

    const year: number = Number(matchedMonth[1]);
    const month: number = Number(matchedMonth[2]);

    return new Date(year, month - 1, 1);
  } catch {
    return null;
  }
};

export const saveLastAccessedPayrollMonth = (selectedMonth: Date): void => {
  try {
    const year: number = selectedMonth.getFullYear();
    const month: string = String(selectedMonth.getMonth() + 1).padStart(2, "0");
    localStorage.setItem(
      LAST_ACCESSED_PAYROLL_MONTH_STORAGE_KEY,
      `${year}-${month}`
    );
  } catch {
    // Ignore storage failures so the payroll pages remain usable.
  }
};

export const readLastAccessedSalaryReportTab = (): number | null => {
  try {
    const storedTab: string | null = localStorage.getItem(
      LAST_ACCESSED_SALARY_REPORT_TAB_STORAGE_KEY
    );
    if (!storedTab) return null;

    const tab: number = Number(storedTab);

    return Number.isInteger(tab) && tab >= 0 && tab < SALARY_REPORT_TAB_COUNT
      ? tab
      : null;
  } catch {
    return null;
  }
};

export const saveLastAccessedSalaryReportTab = (activeTab: number): void => {
  if (
    !Number.isInteger(activeTab) ||
    activeTab < 0 ||
    activeTab >= SALARY_REPORT_TAB_COUNT
  ) {
    return;
  }

  try {
    localStorage.setItem(
      LAST_ACCESSED_SALARY_REPORT_TAB_STORAGE_KEY,
      activeTab.toString()
    );
  } catch {
    // Ignore storage failures so the payroll pages remain usable.
  }
};
