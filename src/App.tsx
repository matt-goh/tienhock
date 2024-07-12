// src/App.tsx
import React, { useState } from "react";
import "./App.css";
import Table from "./components/Table";
import Sidebar from "./components/Sidebar";
import NewStaffModal from "./components/NewStaffModal";
import CatalogueTable from "./components/CatalogueTable";

const App: React.FC = () => {
  return (
    <div className="App">
      <aside className="">
        <Sidebar />
      </aside>
      <main className="">
        {/* <Table /> */}
        <CatalogueTable />
      </main>
      <NewStaffModal />
    </div>
  );
};

export default App;
