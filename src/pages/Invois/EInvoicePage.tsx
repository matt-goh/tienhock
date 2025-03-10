// src/pages/Invois/EInvoicePage.tsx
import React from "react";
import Tab from "../../components/Tab";
import EInvoiceConsolidatedPage from "./EInvoiceConsolidatedPage";
import EInvoiceSubmitPage from "./EInvoiceSubmitPage";
import EInvoiceHistoryPage from "./EInvoiceHistoryPage";

const EInvoicePage: React.FC = () => {
  return (
    <div className="flex flex-col px-12">
      <Tab labels={["Consolidate", "Submit", "History"]}>
        <EInvoiceConsolidatedPage />
        <EInvoiceSubmitPage />
        <EInvoiceHistoryPage />
      </Tab>
    </div>
  );
};

export default EInvoicePage;