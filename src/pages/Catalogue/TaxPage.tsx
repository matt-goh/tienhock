import React, { useState, useEffect, useCallback } from "react";
import Table from "../../components/Table/Table";
import { ColumnConfig } from "../../types/types";
import toast from "react-hot-toast";
import _ from "lodash";
import { api } from "../../routes/utils/api";
import LoadingSpinner from "../../components/LoadingSpinner";

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
        const result = await api.delete("/api/taxes", taxNamesToDelete);

        setTaxes((prevTaxes) =>
          prevTaxes.filter((tax) => !result.deletedTaxNames.includes(tax.name))
        );

        toast.success("Selected taxes deleted successfully");
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
    <div className={`relative`}>
      <div className="flex flex-col items-center justify-center w-auto">
        <div
          className={`relative w-full text-left text-lg font-medium text-default-700 mb-6`}
        >
          Tax Catalogue
        </div>
        <div className="relative">
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
    </div>
  );
};

export default TaxPage;
