import React, { useState } from "react";
import Tab from "../../components/Tab";
import SalesByProductsPage from "./SalesByProductsPage";
import SalesBySalesmanPage from "./SalesBySalesmanPage";
import SalesSummarySelectionTooltip from "../../components/Sales/SalesSummarySelectionTooltip";

const SalesSummaryPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState(0);

  return (
    <div className="space-y-3">
      <Tab
        labels={["Products", "Salesman"]}
        defaultActiveTab={0}
        onTabChange={setActiveTab}
        headerLeftContent={
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            Sales Summary
          </h1>
        }
        headerRightContent={<SalesSummarySelectionTooltip activeTab={activeTab} />}
      >
        <SalesByProductsPage />
        <SalesBySalesmanPage />
      </Tab>
    </div>
  );
};

export default SalesSummaryPage;
