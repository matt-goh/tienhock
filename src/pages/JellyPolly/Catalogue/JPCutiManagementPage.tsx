// src/pages/JellyPolly/Catalogue/JPCutiManagementPage.tsx
// Jelly Polly leave management: JP cuti report (jellypolly leave tables) +
// the SHARED holiday calendar (public holidays apply to both companies).
import React from "react";
import { useTranslation } from "react-i18next";
import Tab from "../../../components/Tab";
import JPCutiReportPage from "./JPCutiReportPage";
import HolidayCalendarPage from "../../Payroll/Leave/HolidayCalendarPage";
import { usePersistedNumber } from "../../../hooks/usePersistedFilters";

const JPCutiManagementPage: React.FC = () => {
  const { t } = useTranslation("jellypolly");
  const tabLabels = ["Cuti Report", "Holiday Calendar"];

  const [activeTab, setActiveTab] = usePersistedNumber(
    "jpCutiManagementTab",
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
            {t(
              "Manage Jelly Polly employee leave. The holiday calendar is shared with Tien Hock."
            )}
          </p>
        </div>
      </div>

      <div>
        <Tab
          labels={tabLabels.map((label) => t(label))}
          tabWidth="w-36"
          defaultActiveTab={activeTab}
          onTabChange={setActiveTab}
        >
          <JPCutiReportPage />
          <HolidayCalendarPage />
        </Tab>
      </div>
    </div>
  );
};

export default JPCutiManagementPage;
