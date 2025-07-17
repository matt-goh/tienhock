// src/pages/Payroll/CutiManagementPage.tsx
import React from "react";
import Tab from "../../components/Tab";
import HolidayCalendarPage from "./HolidayCalendarPage";
import CutiReportPage from "./CutiReportPage";

const CutiManagementPage: React.FC = () => {
  return (
    <div className="relative w-full space-y-4 mx-4 md:mx-6 -mt-8">
      <div className="flex flex-col md:flex-row justify-between items-center">
        <h1 className="text-xl font-semibold text-default-800">
          Cuti Management
        </h1>
      </div>

      <div className="bg-white rounded-lg border border-default-200 shadow-sm p-6">
        <Tab labels={["Cuti Report", "Holiday Calendar"]} tabWidth="w-36">
          <CutiReportPage />
          <HolidayCalendarPage />
        </Tab>
      </div>
    </div>
  );
};

export default CutiManagementPage;
