// src/App.tsx
import React, { useState } from "react";
import "./App.css";
import Table from "./components/Table";
import NewStaffModal from "./components/NewStaffModal";

const App: React.FC = () => {
  const [isModalOpen, setIsModalOpen] = useState(false);

  const handleAddWorker = (worker: any) => {};

  return (
    <div className="App">
      <main className="">
        <Table />
      </main>
      <button
        onClick={() => setIsModalOpen(true)}
        className="mb-4 px-4 py-2 bg-blue-600 text-white rounded-md"
      >
        Add New Worker
      </button>
      <NewStaffModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSubmit={handleAddWorker}
      />
    </div>
  );
};

export default App;
