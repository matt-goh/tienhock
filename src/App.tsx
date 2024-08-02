// src/App.tsx
import { Route, BrowserRouter as Router, Routes } from "react-router-dom";
import React, { useState } from "react";
import { Toaster } from "react-hot-toast";
import CatalogueProductPage from "./pages/CatalogueProductPage";
import CatalogueJobPage from "./pages/CatalogueJobPage";
import MeeProduction from "./components/MeeProduction";
import Sidebar from "./components/Sidebar";
import "./App.css";

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
      <div className="App">
        {/* <aside className=""><Sidebar /></aside> */}
        <main className="">
          <Routes>
            <Route path="/catalogue/job" element={<CatalogueJobPage />} />
            <Route
              path="/catalogue/product"
              element={<CatalogueProductPage />}
            />
          </Routes>
          {/* <MeeProduction /> */}
          {/* <TablePlayground /> */}
        </main>
      </div>
    </Router>
  );
};

export default App;
