import React, { useState, useEffect, useCallback } from "react";
import _ from "lodash";
import Table from "../components/Table";
import { ColumnConfig } from "../types/types";
import toast from "react-hot-toast";

interface Section {
  originalId: any | string;
  id: string;
  name: string;
}

const CatalogueSectionPage: React.FC = () => {
  const [sections, setSections] = useState<Section[]>([]);
  const [editedSections, setEditedSections] = useState<Section[]>([]);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);

  const sectionColumns: ColumnConfig[] = [
    { id: "id", header: "ID", type: "readonly", width: 50 },
    { id: "name", header: "Name", type: "readonly" },
  ];

  const editableSectionColumns: ColumnConfig[] = sectionColumns.map((col) => ({
    ...col,
    type: "string",
  }));

  const fetchSections = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch("http://localhost:5000/api/sections");
      if (!response.ok) throw new Error("Failed to fetch sections");
      const data = await response.json();
      setSections(data);
    } catch (error) {
      console.error("Error fetching sections:", error);
      toast.error("Failed to fetch sections. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSections();
  }, [fetchSections]);

  useEffect(() => {
    if (isEditing) {
      setEditedSections([...sections]);
    }
  }, [isEditing, sections]);

  const handleDataChange = useCallback((updatedData: Section[]) => {
    setTimeout(() => setEditedSections(updatedData), 0);
  }, []);

  const handleDeleteSections = useCallback(
    async (selectedIndices: number[]) => {
      const sectionsToDelete = selectedIndices.map((index) => sections[index]);
      const sectionIdsToDelete = sectionsToDelete.map((section) => section.id);

      try {
        const response = await fetch(`http://localhost:5000/api/sections`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sectionIds: sectionIdsToDelete }),
        });

        if (!response.ok) {
          throw new Error("Failed to delete sections on the server");
        }

        setSections((prevSections) =>
          prevSections.filter(
            (section) => !sectionIdsToDelete.includes(section.id)
          )
        );

        toast.success("Selected sections deleted successfully");
      } catch (error) {
        console.error("Error deleting selected sections:", error);
        toast.error("Failed to delete sections. Please try again.");
      }
    },
    [sections]
  );

  const handleSave = useCallback(async () => {
    try {
      const sectionsToUpdate = editedSections.map((section) => {
        if (section.id !== section.originalId) {
          return { ...section, newId: section.id, id: section.originalId };
        }
        return section;
      });

      const response = await fetch("http://localhost:5000/api/sections/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sections: sectionsToUpdate,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(
          errorData.error || "An error occurred while saving sections"
        );
      }

      const result = await response.json();
      setSections(result.sections);
      setIsEditing(false);
      toast.success("Changes saved successfully");
    } catch (error) {
      console.error("Error updating sections:", error);
      toast.error((error as Error).message);
    }
  }, [editedSections]);

  const handleCancel = useCallback(() => {
    setIsEditing(false);
    setEditedSections([]);
  }, []);

  const handleToggleEditing = useCallback(() => {
    setIsEditing((prev) => !prev);
  }, []);

  if (loading) {
    return <p className="mt-4 text-center">Loading...</p>;
  }

  return (
    <div className={`relative py-[60px]`}>
      <div className="flex flex-col items-center justify-center w-auto">
        <div
          className={`relative w-full text-left font-medium text-gray-700 mb-6`}
        >
          Section Catalogue
        </div>
        <div className="relative">
          <Table
            initialData={isEditing ? editedSections : sections}
            columns={isEditing ? editableSectionColumns : sectionColumns}
            onShowDeleteButton={() => {}}
            onDelete={handleDeleteSections}
            onChange={handleDataChange}
            isEditing={isEditing}
            onToggleEditing={handleToggleEditing}
            onSave={handleSave}
            onCancel={handleCancel}
          />
        </div>
      </div>
    </div>
  );
};

export default CatalogueSectionPage;
