// src/pages/Payroll/MonthlyLogEditPage.tsx
import React, { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import LoadingSpinner from "../../../components/LoadingSpinner";
import { api } from "../../../routes/utils/api";
import toast from "react-hot-toast";
import MonthlyLogEntryPage from "./MonthlyLogEntryPage";
import Button from "../../../components/Button";
import { getJobConfig } from "../../../configs/payrollJobConfigs";

interface MonthlyLogEditPageProps {
  jobType: string;
}

const MonthlyLogEditPage: React.FC<MonthlyLogEditPageProps> = ({ jobType }) => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(true);
  const [workLog, setWorkLog] = useState<any>(null);
  const jobConfig = getJobConfig(jobType);

  useEffect(() => {
    fetchWorkLogDetails();
  }, [id]);

  const fetchWorkLogDetails = async () => {
    if (!id) return;

    setIsLoading(true);
    try {
      const response = await api.get(`/api/monthly-work-logs/${id}`);
      if (response.status === "Processed") {
        toast.error("Cannot edit processed work log");
        navigate(`/payroll/${jobType.toLowerCase().replace("_", "-")}-monthly/${id}`);
        return;
      }
      setWorkLog(response);
    } catch (error) {
      console.error("Error fetching monthly work log details:", error);
      toast.error("Failed to fetch monthly work log details");
      navigate(`/payroll/${jobType.toLowerCase().replace("_", "-")}-monthly`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleBack = () => {
    navigate(`/payroll/${jobType.toLowerCase().replace("_", "-")}-monthly/${id}`);
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-96">
        <LoadingSpinner />
      </div>
    );
  }

  if (!workLog) {
    return (
      <div className="text-center py-12">
        <p className="text-default-500 dark:text-gray-400">Monthly work log not found</p>
        <Button onClick={handleBack} className="mt-4" variant="outline">
          Back to List
        </Button>
      </div>
    );
  }

  // Pass the existing work log data to the entry form
  return (
    <MonthlyLogEntryPage
      mode="edit"
      existingWorkLog={workLog}
      onCancel={handleBack}
      jobType={jobType}
    />
  );
};

export default MonthlyLogEditPage;
