// src/pages/Payroll/MeeProductionListPage.tsx
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { IconPlus } from "@tabler/icons-react";
import Button from "../../components/Button";
import LoadingSpinner from "../../components/LoadingSpinner";

const MeeProductionListPage: React.FC = () => {
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  const handleAddEntry = () => {
    navigate("/payroll/mee-machine-entry");
  };

  return (
    <div className="relative w-full mx-4 md:mx-6">
      <div className="mb-6 flex flex-col md:flex-row justify-between items-center">
        <h1 className="text-xl font-semibold text-default-800">
          Mee Production Records
        </h1>
        <div className="mt-4 md:mt-0">
          <Button
            onClick={handleAddEntry}
            icon={IconPlus}
            color="sky"
            variant="filled"
          >
            New Machine Entry
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20">
          <LoadingSpinner />
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-default-200 shadow-sm">
          <div className="p-6 text-center text-default-500">
            <p>No production records found.</p>
            <p className="mt-2">
              Click the "New Machine Entry" button to record work hours.
            </p>
          </div>

          {/* Future table structure for records */}
          {/* 
          <table className="min-w-full divide-y divide-default-200">
            <thead className="bg-default-100">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-default-600">
                  Date
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-default-600">
                  Worker
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-default-600">
                  Machine
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-default-600">
                  Hours
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-default-600">
                  Production
                </th>
                <th className="w-28 px-4 py-3 text-center text-xs font-medium uppercase tracking-wider text-default-600">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-default-200 bg-white">
              {/* Record rows will go here */}
          {/* </tbody>
          </table> */}
        </div>
      )}
    </div>
  );
};

export default MeeProductionListPage;
