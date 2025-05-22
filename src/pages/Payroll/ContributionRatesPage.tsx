// src/pages/Payroll/ContributionRatesPage.tsx
import React from "react";
import Tab from "../../components/Tab";
import EPFRatesTab from "../../components/Payroll/ContributionRates/EPFRatesTab";
import SOCSORatesTab from "../../components/Payroll/ContributionRates/SOCSORatesTab";
import SIPRatesTab from "../../components/Payroll/ContributionRates/SIPRatesTab";

const ContributionRatesPage: React.FC = () => {
  return (
    <div className="relative w-full space-y-4 mx-4 md:mx-6 -mt-8">
      <div className="flex flex-col md:flex-row justify-between items-center">
        <h1 className="text-xl font-semibold text-default-800">
          EPF, SOCSO & SIP Rates
        </h1>
      </div>

      <div className="bg-white rounded-lg border border-default-200 shadow-sm p-6">
        <Tab labels={["EPF Rates", "SOCSO Rates", "SIP Rates"]} tabWidth="w-32">
          <EPFRatesTab />
          <SOCSORatesTab />
          <SIPRatesTab />
        </Tab>
      </div>
    </div>
  );
};

export default ContributionRatesPage;
