import React from "react";
import SalesByProductsPage from "./SalesByProductsPage";
import SalesBySalesmanPage from "./SalesBySalesmanPage";
import { SalesSummaryScope } from "../../utils/sales/SalesSummaryPDF";
import { usePersistedNumber } from "../../hooks/usePersistedFilters";

interface SalesSummaryPageProps {
  scope?: SalesSummaryScope;
}

const SalesSummaryPage: React.FC<SalesSummaryPageProps> = ({
  scope = "tienhock",
}) => {
  // Tien Hock and Jelly Polly render this page from the same component, so the
  // selected tab is cached per scope.
  const [activeTab, setActiveTab] = usePersistedNumber(
    `salesSummaryTab:${scope}`,
    0,
    1,
    () => 0
  );

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
