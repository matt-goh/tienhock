// src/App.tsx
import { Route, BrowserRouter as Router, Routes } from "react-router-dom";
import React, { useState } from "react";
import CatalogueJobPage from "./pages/CatalogueJobPage";
import MeeProduction from "./components/MeeProduction";
import Sidebar from "./components/Sidebar";
import TablePlayground from "./components/TablePlayground";
import "./App.css";

const App: React.FC = () => {
  return (
    <Router>
      <div className="App">
        <aside className="">
          {/* <Sidebar /> */}
        </aside>
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
