// src/pages/Stock/Materials/GeneralStockPage.tsx
import React from "react";
import { IconBuildingStore, IconFileInvoice, IconWorld } from "@tabler/icons-react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import Button from "../../../components/Button";
import StockAdjustmentEntryPage from "./StockAdjustmentEntryPage";

const materialStockTabs: ReadonlySet<string> = new Set(["mee", "bihun", "shared"]);

const GeneralStockPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const tab = searchParams.get("tab");

  if (tab && materialStockTabs.has(tab)) {
    return <Navigate to={`/stock/material-stock?tab=${tab}`} replace />;
  }

  return (
    <StockAdjustmentEntryPage
      mode="general"
      generalHeaderActions={
        <>
          <Button
            type="button"
            icon={IconFileInvoice}
            variant="outline"
            size="sm"
            className="h-8 rounded-lg !px-3"
            onClick={() => navigate("/stock/general-purchases")}
          >
            Purchase List
          </Button>
          <Button
            type="button"
            icon={IconBuildingStore}
            color="teal"
            variant="filled"
            size="sm"
            className="h-8 rounded-lg !px-3"
            onClick={() => navigate("/stock/general-purchases/new/local")}
          >
            New Local
          </Button>
          <Button
            type="button"
            icon={IconWorld}
            color="sky"
            variant="filled"
            size="sm"
            className="h-8 rounded-lg !px-3"
            onClick={() => navigate("/stock/general-purchases/new/foreign")}
          >
            New Foreign
          </Button>
        </>
      }
    />
  );
};

export default GeneralStockPage;
