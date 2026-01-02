import React, { useState } from "react";
import Tab from "../../components/Tab";
import SalesByProductsPage from "./SalesByProductsPage";
import SalesBySalesmanPage from "./SalesBySalesmanPage";
import SalesSummarySelectionTooltip from "../../components/Sales/SalesSummarySelectionTooltip";

const SalesSummaryPage: React.FC = () => {
  const [activeTab] = useState(0);

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Sales Summary</h1>
        <SalesSummarySelectionTooltip activeTab={activeTab} />
      </div>

      <Tab labels={["Salesman", "Products"]} defaultActiveTab={0}>
        <SalesBySalesmanPage />
        <SalesByProductsPage />
      </Tab>
    </div>
  );
};

export default SalesSummaryPage;
