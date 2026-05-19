import React, { useState } from "react";
import SalesByProductsPage from "./SalesByProductsPage";
import SalesBySalesmanPage from "./SalesBySalesmanPage";
import { SalesSummaryScope } from "../../utils/sales/SalesSummaryPDF";

interface SalesSummaryPageProps {
  scope?: SalesSummaryScope;
}

const SalesSummaryPage: React.FC<SalesSummaryPageProps> = ({
  scope = "tienhock",
}) => {
  const [activeTab, setActiveTab] = useState(0);

  return (
    <div className="space-y-3">
      {activeTab === 0 ? (
        <SalesByProductsPage
          activeTab={activeTab}
          onTabChange={setActiveTab}
          scope={scope}
        />
      ) : (
        <SalesBySalesmanPage
          activeTab={activeTab}
          onTabChange={setActiveTab}
          scope={scope}
        />
      )}
    </div>
  );
};

export default SalesSummaryPage;
