// src/pages/Payroll/CutiTahunanEntryPage.tsx
import React, { useState, useMemo, useEffect } from "react";
import { useStaffsCache } from "../../utils/catalogue/useStaffsCache";
import { useAuth } from "../../contexts/AuthContext";
import Button from "../../components/Button";
import { FormCombobox, FormInput } from "../../components/FormComponents";
import toast from "react-hot-toast";
import { api } from "../../routes/utils/api";
import { IconDeviceFloppy } from "@tabler/icons-react";
import DateRangePicker from "../../components/DateRangePicker";

const CutiTahunanEntryPage: React.FC = () => {
  const { staffs } = useStaffsCache();
  const { user } = useAuth();

  const [employeeId, setEmployeeId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [dateRange, setDateRange] = useState({
    start: new Date(),
    end: new Date(),
  });
  const [reason, setReason] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [totalDays, setTotalDays] = useState(0);

  const staffOptions = useMemo(
    () =>
      staffs.map((staff) => ({
        id: staff.id,
        name: `${staff.name} (${staff.id})`,
      })),
    [staffs]
  );

  useEffect(() => {
    // Auto-calculate total days, excluding Sundays
    const calculateDays = () => {
      let days = 0;
      let currentDate = new Date(dateRange.start);
      while (currentDate <= dateRange.end) {
        // Assuming weekends are not counted for annual leave
        if (currentDate.getDay() !== 0) {
          // 0 = Sunday
          days++;
        }
        currentDate.setDate(currentDate.getDate() + 1);
      }
      setTotalDays(days);
    };
    calculateDays();
  }, [dateRange]);

  const handleSave = async () => {
    if (!employeeId) {
      toast.error("Please select an employee.");
      return;
    }
    if (totalDays <= 0) {
      toast.error("The leave duration must be at least one day.");
      return;
    }
    if (!reason.trim()) {
      toast.error("A reason for the leave is required.");
      return;
    }

    setIsSaving(true);
    const payload = {
      employee_id: employeeId,
      start_date: dateRange.start.toISOString().split("T")[0],
      end_date: dateRange.end.toISOString().split("T")[0],
      total_days: totalDays,
      reason: reason.trim(),
      created_by: user?.id,
    };

    try {
      await api.post("/api/cuti-tahunan", payload);
      toast.success("Annual leave entry created successfully!");
      // Reset form
      setEmployeeId(null);
      setDateRange({ start: new Date(), end: new Date() });
      setReason("");
    } catch (error: any) {
      console.error("Failed to save cuti tahunan:", error);
      toast.error(
        error.response?.data?.message || "Failed to create leave entry."
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="mt-4">
      <h1 className="text-2xl font-bold text-default-800 mb-4">
        Cuti Tahunan Entry
      </h1>
      <div className="bg-white p-6 rounded-xl border border-default-200 shadow-sm space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <FormCombobox
              name="employee"
              label="Select Employee"
              value={employeeId ?? undefined}
              onChange={(value) => setEmployeeId(value as string)}
              options={staffOptions}
              query={searchQuery}
              setQuery={setSearchQuery}
              placeholder="Search for staff..."
              mode="single"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-default-700 mb-2">
              Leave Dates
            </label>
            <DateRangePicker
              dateRange={dateRange}
              onDateChange={setDateRange}
            />
          </div>
        </div>

        <div>
          <label
            htmlFor="reason"
            className="block text-sm font-medium text-default-700 mb-2"
          >
            Reason for Leave
          </label>
          <textarea
            id="reason"
            name="reason"
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="block w-full px-3 py-2 border border-default-300 rounded-lg shadow-sm focus:outline-none focus:ring-1 focus:ring-sky-500 focus:border-sky-500 sm:text-sm"
            placeholder="Enter the reason for the annual leave..."
          ></textarea>
        </div>

        <div className="bg-default-50 border border-default-200 rounded-lg p-4 flex justify-between items-center">
          <span className="font-medium text-default-700">
            Total Leave Days (excluding Sundays):
          </span>
          <span className="text-lg font-bold text-sky-600">
            {totalDays} day(s)
          </span>
        </div>

        <div className="flex justify-end pt-4">
          <Button
            color="sky"
            onClick={handleSave}
            disabled={isSaving}
            icon={IconDeviceFloppy}
          >
            {isSaving ? "Saving..." : "Save Leave Entry"}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default CutiTahunanEntryPage;
