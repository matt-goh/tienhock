// src/pages/Stock/Materials/MaterialStockPage.tsx
import React from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import StockAdjustmentEntryPage from "./StockAdjustmentEntryPage";

const MaterialStockPage: React.FC = () => {
  const [searchParams] = useSearchParams();

  if (searchParams.get("tab") === "general") {
    return <Navigate to="/stock/entry" replace />;
  }

  return <StockAdjustmentEntryPage mode="material" />;
};

export default MaterialStockPage;
