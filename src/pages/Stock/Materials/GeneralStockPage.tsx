// src/pages/Stock/Materials/GeneralStockPage.tsx
import React from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import StockAdjustmentEntryPage from "./StockAdjustmentEntryPage";

const materialStockTabs: ReadonlySet<string> = new Set(["mee", "bihun", "shared"]);

const GeneralStockPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const tab = searchParams.get("tab");

  if (tab && materialStockTabs.has(tab)) {
    return <Navigate to={`/stock/material-stock?tab=${tab}`} replace />;
  }

  return <StockAdjustmentEntryPage mode="general" />;
};

export default GeneralStockPage;
