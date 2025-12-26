// src/pages/Payroll/ContributionRatesPage.tsx
import React from "react";
import { useSearchParams } from "react-router-dom";
import Tab from "../../components/Tab";
import EPFRatesTab from "../../components/Payroll/ContributionRates/EPFRatesTab";
import SOCSORatesTab from "../../components/Payroll/ContributionRates/SOCSORatesTab";
import SIPRatesTab from "../../components/Payroll/ContributionRates/SIPRatesTab";
import IncomeTaxRatesTab from "../../components/Payroll/ContributionRates/IncomeTaxRatesTab";

const ContributionRatesPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const tabParam = searchParams.get("tab");
  const defaultTab = tabParam ? parseInt(tabParam, 10) : 0;

  return (
    <div className="relative w-full space-y-4 mx-4 md:mx-6">
      <div className="flex flex-col md:flex-row justify-between items-center">
        <h1 className="text-xl font-semibold text-default-800">
          Contribution Rates
        </h1>
      </div>

      <div className="bg-white rounded-lg border border-default-200 shadow-sm p-6">
        <Tab
          labels={["EPF Rates", "SOCSO Rates", "SIP Rates", "Income Tax Rates"]}
          tabWidth="w-40"
          defaultActiveTab={defaultTab}
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
