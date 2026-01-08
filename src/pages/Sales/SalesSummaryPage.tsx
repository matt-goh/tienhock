import React, { useState } from "react";
import SalesByProductsPage from "./SalesByProductsPage";
import SalesBySalesmanPage from "./SalesBySalesmanPage";

const SalesSummaryPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState(0);

  return (
    <div className="space-y-3">
      {activeTab === 0 ? (
        <SalesByProductsPage
          activeTab={activeTab}
          onTabChange={setActiveTab}
        />
      ) : (
        <SalesBySalesmanPage
          activeTab={activeTab}
          onTabChange={setActiveTab}
        />
      )}
    </div>
  );
};

export default SalesSummaryPage;
