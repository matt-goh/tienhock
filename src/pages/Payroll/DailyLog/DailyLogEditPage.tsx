// src/pages/Payroll/DailyLogEditPage.tsx
import React, { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import LoadingSpinner from "../../../components/LoadingSpinner";
import { api } from "../../../routes/utils/api";
import toast from "react-hot-toast";
import DailyLogEntryPage from "./DailyLogEntryPage";
import Button from "../../../components/Button";
import { getJobConfig } from "../../../configs/payrollJobConfigs";

interface DailyLogEditPageProps {
  jobType: string;
}

const DailyLogEditPage: React.FC<DailyLogEditPageProps> = ({ jobType }) => {
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
      const response = await api.get(`/api/daily-work-logs/${id}`);
      if (response.status === "Processed") {
        toast.error("Cannot edit processed work log");
        navigate(`/payroll/${jobType.toLowerCase()}-production/${id}`);
        return;
      }
      setWorkLog(response);
    } catch (error) {
      console.error("Error fetching work log details:", error);
      toast.error("Failed to fetch work log details");
      navigate(`/payroll/${jobType.toLowerCase()}-production`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleBack = () => {
    navigate(`/payroll/${jobType.toLowerCase()}-production/${id}`);
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
        <p className="text-default-500 dark:text-gray-400">Work log not found</p>
        <Button onClick={handleBack} className="mt-4" variant="outline">
          Back to List
        </Button>
      </div>
    );
  }

  // Pass the existing work log data to the entry form
  return (
    <DailyLogEntryPage
      mode="edit"
      existingWorkLog={workLog}
      onCancel={handleBack}
      jobType={jobType}
    />
  );
};

export default DailyLogEditPage;
