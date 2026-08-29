import React, { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import SalesByProductsPage from "./SalesByProductsPage";
import SalesBySalesmanPage from "./SalesBySalesmanPage";
import SalesByCustomerPage from "./SalesByCustomerPage";
import { SalesSummaryScope } from "../../utils/sales/SalesSummaryPDF";
import { usePersistedNumber } from "../../hooks/usePersistedFilters";

interface SalesSummaryPageProps {
  scope?: SalesSummaryScope;
}

const getRouteTab = (pathname: string): number | null => {
  if (pathname === "/sales/summary/customer") return 2;
  if (pathname === "/sales/summary/salesman") return 1;
  if (
    pathname === "/sales/summary" ||
    pathname === "/sales/summary/products"
  ) {
    return 0;
  }
  return null;
};

const SalesSummaryPage: React.FC<SalesSummaryPageProps> = ({
  scope = "tienhock",
}) => {
  const location = useLocation();
  const navigate = useNavigate();
  const routeTab: number | null =
    scope === "tienhock" ? getRouteTab(location.pathname) : null;
  // Tien Hock and Jelly Polly render this page from the same component, so the
  // selected tab is cached per scope.
  const [persistedTab, setPersistedTab] = usePersistedNumber(
    `salesSummaryTab:${scope}`,
    0,
    scope === "tienhock" ? 2 : 1,
    () => 0
  );
  const activeTab: number = routeTab ?? persistedTab;

  useEffect((): void => {
    if (routeTab !== null && routeTab !== persistedTab) {
      setPersistedTab(routeTab);
    }
  }, [persistedTab, routeTab, setPersistedTab]);

  const handleTabChange = (tab: number): void => {
    if (scope !== "tienhock") {
      setPersistedTab(tab);
      return;
    }

    const tabPaths: Record<number, string> = {
      0: "/sales/summary/products",
      1: "/sales/summary/salesman",
      2: "/sales/summary/customer",
    };
    const nextPath: string = tabPaths[tab] || tabPaths[0];
    setPersistedTab(tab);
    if (location.pathname !== nextPath) navigate(nextPath);
  };

  return (
    <div className="space-y-3">
      {activeTab === 0 ? (
        <SalesByProductsPage
          activeTab={activeTab}
          onTabChange={handleTabChange}
          scope={scope}
        />
      ) : activeTab === 1 ? (
        <SalesBySalesmanPage
          activeTab={activeTab}
          onTabChange={handleTabChange}
          scope={scope}
        />
      ) : (
        <SalesByCustomerPage
          activeTab={activeTab}
          onTabChange={handleTabChange}
          scope={scope}
        />
      )}
    </div>
  );
};

export default SalesSummaryPage;
