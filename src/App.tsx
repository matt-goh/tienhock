// src/App.tsx
import { Route, BrowserRouter as Router, Routes } from "react-router-dom";
import React, { useState } from "react";
import { Toaster } from "react-hot-toast";
import CatalogueJobPage from "./pages/CatalogueJobPage";
import MeeProduction from "./components/MeeProduction";
import Sidebar from "./components/Sidebar";
import TablePlayground from "./components/TablePlayground";
import "./App.css";

const App: React.FC = () => {
  return (
    <Router>
      <Toaster
        toastOptions={{
          success: {
            style: {
              padding: "12px",
              fontSize: "0.875rem",
              lineHeight: "1.25rem",
              fontWeight: 500,
            },
          },
          error: {
            style: {
              padding: "12px",
              fontSize: "0.875rem",
              lineHeight: "1.25rem",
              fontWeight: 500,
            },
          },
        }}
      />
      <div className="App">
        <aside className="">{/* <Sidebar /> */}</aside>
        <main className="">
          <Routes>
            <Route path="/catalogue/job" element={<CatalogueJobPage />} />
          </Routes>
          {/* <MeeProduction /> */}
          {/* <TablePlayground /> */}
        </main>
      </div>
    </Router>
  );
};

export default App;
