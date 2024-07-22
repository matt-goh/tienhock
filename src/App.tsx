// src/App.tsx
import React, { useState } from "react";
import "./App.css";
import Table from "./components/Table";
import Sidebar from "./components/Sidebar";
import NewStaffModal from "./components/NewStaffModal";
import MeeProduction from "./components/MeeProduction";
import { ColumnConfig, Data } from "./types/types";
import CatalogueJob from "./components/CatalogueJob";

const App: React.FC = () => {
  const initialData: Data[] = [
    {
      id: "1", // Add this line
      staffId: "JIRIM_MM",
      staffName: "Jirim Ilut",
      kerja: "Mee Foreman",
      jamPerDay: 7,
      done: true,
      bag: 1,
      rate: 0.7,
      amount: 0,
    },
  ];

  const columns: ColumnConfig[] = [
    { id: "staffId", header: "Staff ID", type: "string", width: 400 },
    { id: "staffName", header: "Staff Name", type: "string", width: 400 },
    { id: "kerja", header: "Kerja", type: "string", width: 300 },
    { id: "done", header: "Done", type: "checkbox", width: 50 },
    { id: "bag", header: "Bag", type: "number", width: 50 },
    { id: "jamPerDay", header: "Jam", type: "number", width: 50 },
    { id: "rate", header: "Rate", type: "rate", width: 50 },
    { id: "amount", header: "Amount", type: "amount", width: 150 },
    { id: "actions", header: "Actions", type: "action", width: 50 },
  ];
  const handleDeleteProducts = async (selectedIds: string[]) => {

    try {
      for (const productId of selectedIds) {
        // First, remove the association from the job_products table
        await fetch(`http://localhost:5000/api/job_products`, {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            productId: productId,
          }),
        });

        // Then, delete the product itself
        await fetch(`http://localhost:5000/api/products/${productId}`, {
          method: "DELETE",
        });
      }
    } catch (error) {
      console.error("Error deleting products:", error);
      // Handle error (e.g., show error message to user)
    }
  };

  return (
    <div className="App">
      {/* <aside className=""><Sidebar /></aside> */}
      <main className="">
        {/* <CatalogueJob /> */}
        {/* <MeeProduction /> */}
        <Table
          initialData={initialData}
          columns={columns}
          onDelete={handleDeleteProducts}
        />
      </main>
    </div>
  );
};

export default App;
