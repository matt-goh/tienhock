// src/App.tsx
import React, { useState } from "react";
import "./App.css";
import Table from "./components/Table";
import Sidebar from "./components/Sidebar";
import NewStaffModal from "./components/NewStaffModal";

const App: React.FC = () => {
  return (
    <div className="App">
      <Sidebar />
      <main className="">
        {/* <Table /> */}
      </main>
      {/* <NewStaffModal /> */}
    </div>
  );
};

export default App;
