// src/pages/Payroll/CutiManagementPage.tsx
import React from "react";
import Tab from "../../components/Tab";
import CutiReportPage from "./CutiReportPage";
import CutiTahunanEntryPage from "./CutiTahunanEntryPage";
import HolidayCalendarPage from "./HolidayCalendarPage";
import CommissionPage from "./CommissionPage";

const CutiManagementPage: React.FC = () => {
  const tabLabels = [
    "Cuti Report",
    "Cuti Tahunan Entry",
    "Commission",
    "Holiday Calendar",
  ];

  return (
    <div className="w-full">
      <div className="p-6 bg-white border-b border-default-200">
        <h1 className="text-2xl font-bold text-default-900">
          Leave & Commission Management
        </h1>
        <p className="mt-1 text-sm text-default-600">
          Manage employee leave, holidays, and maintenance commissions.
        </p>
      </div>

      <Tab labels={tabLabels} tabWidth="w-36">
        <CutiReportPage />
        <CutiTahunanEntryPage />
        <CommissionPage />
        <HolidayCalendarPage />
      </Tab>
    </div>
  );
};

export default CutiManagementPage;
