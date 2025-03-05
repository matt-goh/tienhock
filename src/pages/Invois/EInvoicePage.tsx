// src/pages/Invois/EInvoicePage.tsx
import React from "react";
import Tab from "../../components/Tab";
import EInvoiceConsolidatedPage from "./EInvoiceConsolidatedPage";
import EInvoiceHistoryPage from "./EInvoiceHistoryPage";

const EInvoicePage: React.FC = () => {
  return (
    <div className="flex flex-col px-6">
      <Tab labels={["Consolidated", "History"]}>
        <EInvoiceConsolidatedPage />
        <EInvoiceHistoryPage />
      </Tab>
    </div>
  );
};

export default EInvoicePage;
