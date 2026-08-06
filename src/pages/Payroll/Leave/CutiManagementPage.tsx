// src/pages/Payroll/CutiManagementPage.tsx
import React from "react";
import Tab from "../../../components/Tab";
import CutiReportPage from "./CutiReportPage";
import HolidayCalendarPage from "./HolidayCalendarPage";
import { usePersistedNumber } from "../../../hooks/usePersistedFilters";
import { useTranslation } from "react-i18next";

const CutiManagementPage: React.FC = () => {
  const { t } = useTranslation("payroll");
  const tabLabels = [
    t("Leave Report"),
    t("Holiday Calendar"),
  ];

  const [activeTab, setActiveTab] = usePersistedNumber(
    "cutiManagementTab",
    0,
    tabLabels.length - 1,
    () => 0
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row justify-between items-center">
        <div>
          <h1 className="text-xl font-semibold text-default-800 dark:text-gray-100">
            {t("Leave Management")}
          </h1>
          <p className="mt-1 text-sm text-default-600 dark:text-gray-300">
            {t("Manage employee leave and holidays.")}
          </p>
        </div>
      </div>

      <div>
        <Tab
          labels={tabLabels}
          tabWidth="w-36"
          defaultActiveTab={activeTab}
          onTabChange={setActiveTab}
        >
          <CutiReportPage />
          <HolidayCalendarPage />
        </Tab>
      </div>
    </div>
  );
};

export default CutiManagementPage;
