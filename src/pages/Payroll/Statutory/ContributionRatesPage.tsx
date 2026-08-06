// src/pages/Payroll/ContributionRatesPage.tsx
import React from "react";
import Tab from "../../../components/Tab";
import EPFRatesTab from "../../../components/Payroll/ContributionRates/EPFRatesTab";
import SOCSORatesTab from "../../../components/Payroll/ContributionRates/SOCSORatesTab";
import SIPRatesTab from "../../../components/Payroll/ContributionRates/SIPRatesTab";
import IncomeTaxRatesTab from "../../../components/Payroll/ContributionRates/IncomeTaxRatesTab";
import { usePersistedUrlNumber } from "../../../hooks/usePersistedFilters";
import { useScrollRestoration } from "../../../hooks/useScrollRestoration";
import { useContributionRatesCache } from "../../../utils/payroll/useContributionRatesCache";
import { useTranslation } from "react-i18next";

const ContributionRatesPage: React.FC = () => {
  const { t } = useTranslation("payroll");
  // A ?tab= param wins on mount, otherwise the last tab used
  const [activeTab, setActiveTab] = usePersistedUrlNumber(
    "contributionRatesTab",
    "tab",
    0,
    3,
    () => 0
  );

  // Reads the shared 24h rates cache purely to know when the tables have
  // rendered, so the scroll restore isn't clamped against an empty page.
  const { isLoading } = useContributionRatesCache();
  useScrollRestoration("contribution-rates", !isLoading);

  return (
    <div className="space-y-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-default-200 dark:border-gray-700 shadow-sm px-6 py-4">
        <Tab
          labels={[
            t("EPF Rates"),
            t("SOCSO Rates"),
            t("SIP Rates"),
            t("Income Tax Rates"),
          ]}
          tabWidth="w-40"
          defaultActiveTab={activeTab}
          onTabChange={setActiveTab}
        >
          <EPFRatesTab />
          <SOCSORatesTab />
          <SIPRatesTab />
          <IncomeTaxRatesTab />
        </Tab>
      </div>
    </div>
  );
};

export default ContributionRatesPage;
