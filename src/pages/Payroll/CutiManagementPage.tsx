// src/pages/Payroll/CutiManagementPage.tsx
import React from "react";
import Tab from "../../components/Tab";
import CutiReportPage from "./CutiReportPage";
import HolidayCalendarPage from "./HolidayCalendarPage";

const CutiManagementPage: React.FC = () => {
  const tabLabels = [
    "Cuti Report",
    "Holiday Calendar",
  ];

  return (
    <div className="relative w-full space-y-4 mx-4 md:mx-6 mb-4">
      <div className="flex flex-col md:flex-row justify-between items-center">
        <div>
          <h1 className="text-xl font-semibold text-default-800">
            Leave Management
          </h1>
          <p className="mt-1 text-sm text-default-600">
            Manage employee leave and holidays.
          </p>
        </div>
      </div>

      <div className="mt-1">
        <Tab labels={tabLabels} tabWidth="w-36">
          <CutiReportPage />
          <HolidayCalendarPage />
        </Tab>
      </div>
    </div>
  );
};

export default CutiManagementPage;
