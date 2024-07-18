import React, { useState, useEffect } from "react";
import Table from "./Table";
import { ColumnConfig, Data } from "../types/types";
import NewJobModal from "./NewJobModal";

const CatalogueJob: React.FC = () => {
  const [jobs, setJobs] = useState<Data[]>([]);
  const [loading, setLoading] = useState(true);

  const columns: ColumnConfig[] = [
    { id: "id", header: "ID", type: "readonly" },
    { id: "name", header: "Name", type: "readonly" },
    { id: "section", header: "Section", type: "readonly" },
  ];

  useEffect(() => {
    fetchJobs();
  }, []);

  const fetchJobs = async () => {
    try {
      setLoading(true);
      const response = await fetch("http://localhost:5000/api/jobs");
      if (!response.ok) {
        throw new Error("Failed to fetch jobs");
      }
      const data = await response.json();
      setJobs(data);
    } catch (error) {
      console.error("Error fetching jobs:", error);
      // Handle error (e.g., show error message to user)
    } finally {
      setLoading(false);
    }
  };

  const dataFound = jobs.length > 0;

  return (
    <div className="flex justify-center py-[60px]">
      <div className="flex-col">
        {dataFound ? (
          ""
        ) : (
          <p className="text-center text-gray-500">
            No data found.
          </p>
        )}
        <div
          className={`flex ${   
            dataFound ? "justify-end mb-4" : "justify-center mt-4"
          }`}
        >
          <NewJobModal onJobAdded={fetchJobs} />
        </div>
        {loading ? (
          <p>Loading...</p>
        ) : (
          dataFound && <Table initialData={jobs} columns={columns} />
        )}
      </div>
    </div>
  );
};

export default CatalogueJob;
