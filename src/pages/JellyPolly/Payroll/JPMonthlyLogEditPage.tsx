// src/pages/Payroll/JPMonthlyLogEditPage.tsx
import React, { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import LoadingSpinner from "../../../components/LoadingSpinner";
import { api } from "../../../routes/utils/api";
import toast from "react-hot-toast";
import JPMonthlyLogEntryPage from "./JPMonthlyLogEntryPage";
import Button from "../../../components/Button";
import { getJPJobConfig } from "../../../configs/jpPayrollJobConfigs";

interface JPMonthlyLogEditPageProps {
  jobType: string;
}

const JPMonthlyLogEditPage: React.FC<JPMonthlyLogEditPageProps> = ({ jobType }) => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(true);
  const [workLog, setWorkLog] = useState<any>(null);
  const jobConfig = getJPJobConfig(jobType);

  useEffect(() => {
    fetchWorkLogDetails();
  }, [id]);

  const fetchWorkLogDetails = async () => {
    if (!id) return;

    setIsLoading(true);
    try {
      const response = await api.get(`/jellypolly/api/monthly-work-logs/${id}`);
      if (response.status === "Processed") {
        toast.error("Cannot edit processed work log");
        navigate(`/jellypolly/payroll/${jobType.toLowerCase().replace("_", "-")}-monthly/${id}`);
        return;
      }
      setWorkLog(response);
    } catch (error) {
      console.error("Error fetching monthly work log details:", error);
      toast.error("Failed to fetch monthly work log details");
      navigate(`/jellypolly/payroll/${jobType.toLowerCase().replace("_", "-")}-monthly`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleBack = () => {
    navigate(`/jellypolly/payroll/${jobType.toLowerCase().replace("_", "-")}-monthly/${id}`);
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
    <JPMonthlyLogEntryPage
      mode="edit"
      existingWorkLog={workLog}
      onCancel={handleBack}
      jobType={jobType}
    />
  );
};

export default JPMonthlyLogEditPage;
