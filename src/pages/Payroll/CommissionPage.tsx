// src/pages/Payroll/CommissionPage.tsx
import React, { useState, useMemo } from "react";
import { useStaffsCache } from "../../utils/catalogue/useStaffsCache";
import Button from "../../components/Button";
import { IconDeviceFloppy, IconPlus, IconX } from "@tabler/icons-react";
import { FormCombobox, FormInput } from "../../components/FormComponents";
import toast from "react-hot-toast";
import { api } from "../../routes/utils/api";
import { useAuth } from "../../contexts/AuthContext";

interface CommissionEntry {
  id: number; // For unique key in list
  employeeId: string | null;
  amount: string;
  description: string;
}

const CommissionPage: React.FC = () => {
  const { staffs } = useStaffsCache();
  const { user } = useAuth();
  const [commissionDate, setCommissionDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [entries, setEntries] = useState<CommissionEntry[]>([
    { id: Date.now(), employeeId: null, amount: "", description: "" },
  ]);
  const [isSaving, setIsSaving] = useState(false);

  const maintenanceStaffOptions = useMemo(
    () =>
      staffs
        .filter((staff) => staff.job.includes("MAINTEN"))
        .map((staff) => ({
          id: staff.id,
          name: `${staff.name} (${staff.id})`,
        })),
    [staffs]
  );

  const handleEntryChange = (
    index: number,
    field: keyof CommissionEntry,
    value: any
  ) => {
    const newEntries = [...entries];
    // @ts-ignore
    newEntries[index][field] = value;
    setEntries(newEntries);
  };

  const addEntryRow = () => {
    setEntries([
      ...entries,
      { id: Date.now(), employeeId: null, amount: "", description: "" },
    ]);
  };

  const removeEntryRow = (id: number) => {
    if (entries.length > 1) {
      setEntries(entries.filter((entry) => entry.id !== id));
    }
  };

  const handleSave = async () => {
    const validEntries = entries.filter(
      (e) => e.employeeId && parseFloat(e.amount) > 0 && e.description
    );
    if (validEntries.length === 0) {
      toast.error(
        "Please add at least one valid commission entry with staff, amount, and description."
      );
      return;
    }

    setIsSaving(true);

    const promises = validEntries.map((entry) => {
      const payload = {
        employee_id: entry.employeeId,
        commission_date: commissionDate,
        amount: parseFloat(entry.amount),
        description: entry.description,
        created_by: user?.id,
      };
      return api.post("/api/commissions", payload);
    });

    try {
      await Promise.all(promises);
      toast.success(
        `${validEntries.length} commission record(s) saved successfully!`
      );
      setEntries([
        { id: Date.now(), employeeId: null, amount: "", description: "" },
      ]);
    } catch (error: any) {
      console.error("Failed to save commissions:", error);
      toast.error(
        error.response?.data?.message ||
          "Failed to save one or more commissions."
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="mt-4">
      <h1 className="text-2xl font-bold text-default-800 mb-4">
        Record Maintenance Commission
      </h1>
      <div className="bg-white p-6 rounded-xl border border-default-200 shadow-sm">
        <div className="max-w-xs mb-4">
          <FormInput
            name="commissionDate"
            label="Commission Date"
            type="date"
            value={commissionDate}
            onChange={(e) => setCommissionDate(e.target.value)}
            required
          />
        </div>

        <table className="min-w-full">
          <thead>
            <tr>
              <th className="py-2 text-left font-medium text-default-600 w-2/5">
                Staff (Maintenance)
              </th>
              <th className="py-2 px-3 text-left font-medium text-default-600 w-1/5">
                Amount (RM)
              </th>
              <th className="py-2 px-3 text-left font-medium text-default-600 w-2/5">
                Description
              </th>
              <th className="py-2 text-left font-medium text-default-600"></th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry, index) => (
              <tr key={entry.id} className="group">
                <td className="py-2 align-top">
                  <FormCombobox
                    name={`employee-${index}`}
                    label=""
                    value={entry.employeeId ?? undefined}
                    onChange={(value) =>
                      handleEntryChange(index, "employeeId", value)
                    }
                    options={maintenanceStaffOptions}
                    query=""
                    setQuery={() => {}}
                    placeholder="Select Staff..."
                    mode="single"
                  />
                </td>
                <td className="py-2 px-3 align-top">
                  <FormInput
                    name={`amount-${index}`}
                    label=""
                    type="number"
                    value={entry.amount}
                    onChange={(e) =>
                      handleEntryChange(index, "amount", e.target.value)
                    }
                    placeholder="0.00"
                    step="0.01"
                  />
                </td>
                <td className="py-2 px-3 align-top">
                  <FormInput
                    name={`description-${index}`}
                    label=""
                    type="text"
                    value={entry.description}
                    onChange={(e) =>
                      handleEntryChange(index, "description", e.target.value)
                    }
                    placeholder="e.g., Special repair work"
                  />
                </td>
                <td className="py-2 align-top">
                  {entries.length > 1 && (
                    <button
                      onClick={() => removeEntryRow(entry.id)}
                      className="p-2 text-default-400 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-opacity"
                      title="Remove row"
                    >
                      <IconX size={18} />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="flex justify-between items-center mt-6 border-t border-default-200 pt-6">
          <Button variant="outline" onClick={addEntryRow} icon={IconPlus}>
            Add Row
          </Button>
          <Button
            color="sky"
            onClick={handleSave}
            disabled={isSaving}
            icon={IconDeviceFloppy}
          >
            {isSaving ? "Saving..." : "Save Commissions"}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default CommissionPage;
