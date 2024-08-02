// src/App.tsx
import { Route, BrowserRouter as Router, Routes } from "react-router-dom";
import React, { useState } from "react";
import { Toaster } from "react-hot-toast";
import CatalogueProductPage from "./pages/CatalogueProductPage";
import CatalogueJobPage from "./pages/CatalogueJobPage";
import MeeProduction from "./components/MeeProduction";
import Sidebar from "./components/Sidebar";

const App: React.FC = () => {
  return (
    <Router>
      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            padding: "12px",
            fontSize: "0.875rem",
            lineHeight: "1.25rem",
            fontWeight: 500,
          },
        }}
      />
      <div className="flex">
        <aside className="hidden xl:flex">
          <Sidebar />
        </aside>
        <main className="flex justify-center w-full">
          <Routes>
            <Route path="/catalogue/job" element={<CatalogueJobPage />} />
            <Route
              path="/catalogue/product"
              element={<CatalogueProductPage />}
            />
          </Routes>
          {/* <MeeProduction /> */}
        </main>
      </div>
    </Router>
  );
};

export default App;
