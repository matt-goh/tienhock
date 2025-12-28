import React, { useState, useEffect, useCallback } from "react";
import Table from "../../components/Table/Table";
import { ColumnConfig } from "../../types/types";
import toast from "react-hot-toast";
import _ from "lodash";
import { api } from "../../routes/utils/api";
import LoadingSpinner from "../../components/LoadingSpinner";
import { IconEdit } from "@tabler/icons-react";

interface Tax {
  id: number;
  name: string;
  rate: number;
}

const TaxPage: React.FC = () => {
  const [taxes, setTaxes] = useState<Tax[]>([]);
  const [editedTaxes, setEditedTaxes] = useState<Tax[]>([]);
  const [originalTaxes, setOriginalTaxes] = useState<Tax[]>([]);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);

  const taxColumns: ColumnConfig[] = [
    { id: "name", header: "Name", type: "readonly" },
    { id: "rate", header: "Rate", type: "readonly", width: 100 },
  ];

  const editableTaxColumns: ColumnConfig[] = taxColumns.map((col) => ({
    ...col,
    type: col.id === "rate" ? "rate" : "string",
  }));

  const fetchTaxes = useCallback(async () => {
    try {
      setLoading(true);
      const data = await api.get("/api/taxes");
      setTaxes(data);
    } catch (error) {
      console.error("Error fetching taxes:", error);
      toast.error("Failed to fetch taxes. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTaxes();
  }, [fetchTaxes]);

  useEffect(() => {
    if (isEditing) {
      setEditedTaxes([...taxes]);
      setOriginalTaxes([...taxes]);
    }
  }, [isEditing, taxes]);

  const handleDataChange = useCallback((updatedData: Tax[]) => {
    setTimeout(() => setEditedTaxes(updatedData), 0);
  }, []);

  const handleDeleteTaxes = useCallback(
    async (selectedIndices: number[]) => {
      const taxesToDelete = selectedIndices.map((index) => taxes[index]);

      const taxNamesToDelete = taxesToDelete.map((tax) => tax.name);

      try {
        // Pass array directly since api.js will wrap it with 'taxes' key
        const result = await api.delete("/api/taxes", taxNamesToDelete);

        if (result.deletedTaxNames?.length > 0) {
          setTaxes((prevTaxes) =>
            prevTaxes.filter(
              (tax) => !result.deletedTaxNames.includes(tax.name)
            )
          );
          toast.success("Selected taxes deleted successfully");
        } else {
          throw new Error("No taxes were deleted");
        }
        setIsEditing(false);
      } catch (error) {
        console.error("Error deleting selected taxes:", error);
        toast.error("Failed to delete taxes. Please try again.");
      }
    },
    [taxes]
  );

  const handleSave = useCallback(async () => {
    try {
      // Validate tax names
      const emptyTaxName = editedTaxes.find((tax) => !tax.name.trim());
      if (emptyTaxName) {
        toast.error("Tax name cannot be empty");
        return;
      }

      const taxNames = new Set();
      const duplicateTaxName = editedTaxes.find((tax) => {
        if (taxNames.has(tax.name)) {
          return true;
        }
        taxNames.add(tax.name);
        return false;
      });

      if (duplicateTaxName) {
        toast.error(`Duplicate tax name: ${duplicateTaxName.name}`);
        return;
      }

      // Check for changes
      const taxesChanged = !_.isEqual(editedTaxes, originalTaxes);

      if (!taxesChanged) {
        toast("No changes detected");
        setIsEditing(false);
        return;
      }

      const result = await api.post("/api/taxes/batch", {
        taxes: editedTaxes,
      });

      setTaxes(result.taxes);
      setIsEditing(false);
      toast.success("Changes saved successfully");
    } catch (error) {
      console.error("Error updating taxes:", error);
      toast.error((error as Error).message);
    }
  }, [editedTaxes, originalTaxes]);

  const handleCancel = useCallback(() => {
    setIsEditing(false);
    setEditedTaxes([]);
  }, []);

  const handleToggleEditing = useCallback(() => {
    setIsEditing((prev) => !prev);
  }, []);

  if (loading) {
    return (
      <div className="mt-40 w-full flex items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="w-full flex flex-col items-center">
      <div className="w-auto">
        {/* Header row with title and Edit/Save/Cancel buttons */}
        <div className="flex items-center justify-between mb-2">
          <div className="text-lg font-medium text-default-700">
            Tax Catalogue
          </div>
          {!isEditing ? (
            <div
              className="px-3 py-2 rounded-full hover:bg-default-100 active:bg-default-200 cursor-pointer text-default-600 font-medium flex items-center transition-colors duration-200"
              onClick={handleToggleEditing}
            >
              <IconEdit className="mr-1.5" size={18} />
              <span>Edit</span>
            </div>
          ) : (
            <div className="flex space-x-2">
              <div
                className="px-4 py-2 hover:text-sky-500 active:text-sky-600 rounded-full hover:bg-default-100 active:bg-default-200 cursor-pointer text-default-600 font-medium flex items-center border border-default-300 transition-colors duration-200"
                onClick={handleSave}
              >
                Save
              </div>
              <div
                className="px-4 py-2 hover:text-rose-500 active:text-rose-600 rounded-full hover:bg-default-100 active:bg-default-200 cursor-pointer text-default-600 font-medium flex items-center border border-default-300 transition-colors duration-200"
                onClick={handleCancel}
              >
                Cancel
              </div>
            </div>
          )}
        </div>
        <Table
          initialData={isEditing ? editedTaxes : taxes}
          columns={isEditing ? editableTaxColumns : taxColumns}
          onShowDeleteButton={() => {}}
          onDelete={handleDeleteTaxes}
          onChange={handleDataChange}
          isEditing={isEditing}
          onToggleEditing={handleToggleEditing}
          onSave={handleSave}
          onCancel={handleCancel}
          tableKey="catalogueTax"
        />
      </div>
    </div>
  );
};

export default TaxPage;
