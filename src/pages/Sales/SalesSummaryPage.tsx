import React, { useState } from "react";
import Tab from "../../components/Tab";
import SalesByProductsPage from "./SalesByProductsPage";
import SalesBySalesmanPage from "./SalesBySalesmanPage";
import SalesSummarySelectionTooltip from "../../components/Sales/SalesSummarySelectionTooltip";

const SalesSummaryPage: React.FC = () => {
  const [activeTab] = useState(0);

  return (
    <div className="w-full p-6 pt-0 mx-4">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-bold">Sales Summary</h1>
        <SalesSummarySelectionTooltip activeTab={activeTab} />
      </div>

      <Tab labels={["Products", "Salesman"]} defaultActiveTab={0}>
        <SalesByProductsPage />
        <SalesBySalesmanPage />
      </Tab>
    </div>
  );
};

export default SalesSummaryPage;
