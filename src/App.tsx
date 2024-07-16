// src/App.tsx
import React, { useState } from "react";
import "./App.css";
import Table from "./components/Table";
import Sidebar from "./components/Sidebar";
import NewStaffModal from "./components/NewStaffModal";
import CatalogueTable from "./components/CatalogueTable";
import MeeProduction from "./components/MeeProduction";
import { ColumnConfig, Data } from "./types/types";

const App: React.FC = () => {
  const initialData: Data[] = [
    {
      staffId: "JIRIM_MM",
      staffName: "Jirim Ilut",
      kerja: "Mee Foreman",
      kerjaPerJam: 7,
      Done: true,
      bag: 1,
      rate: 0.7,
      amount: 5.6,
    },
    {
      staffId: "",
      staffName: "",
      kerja: "",
      kerjaPerJam: 0,
      Done: true,
      bag: 0,
      rate: 0,
      amount: 0,
    },
  ];

  const columns: ColumnConfig[] = [
    { id: "staffId", header: "Staff ID", type: "string", width: 300 },
    { id: "staffName", header: "Staff Name", type: "string", width: 400 },
    { id: "kerja", header: "Kerja", type: "string", width: 400 },
    { id: "kerjaPerJam", header: "Kerja/Jam", type: "number", width: 200 },
    { id: "Done", header: "Done", type: "checkbox", width: 150 },
    { id: "bag", header: "Bag", type: "number", width: 200 },
    { id: "rate", header: "Rate", type: "rate", width: 200 },
    { id: "amount", header: "Amount", type: "amount", width: 250 },
    { id: "actions", header: "Actions", type: "action", width: 100 },
  ];

  return (
    <div className="App">
      <aside className="">{/* <Sidebar /> */}</aside>
      <main className="">
        {/* <MeeProduction /> */}
        <Table initialData={initialData} columns={columns} />
        {/* <CatalogueTable /> */}
      </main>
      {/* <NewStaffModal /> */}
    </div>
  );
};

export default App;
