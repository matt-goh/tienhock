import React, { useState, useEffect, useCallback, useMemo } from "react";
import _ from "lodash";
import Table from "../components/Table";
import { ColumnConfig, JobCategory } from "../types/types";
import toast from "react-hot-toast";
import {
  Listbox,
  ListboxButton,
  ListboxOption,
  ListboxOptions,
} from "@headlessui/react";
import { IconCheck, IconChevronDown } from "@tabler/icons-react";

const CatalogueJobCategoryPage: React.FC = () => {
  const [jobCategories, setJobCategories] = useState<JobCategory[]>([]);
  const [editedJobCategories, setEditedJobCategories] = useState<JobCategory[]>(
    []
  );
  const [sections, setSections] = useState<string[]>(["All Section"]);
  const [selectedSection, setSelectedSection] = useState<string>("All Section");
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);

  const jobCategoryColumns: ColumnConfig[] = useMemo(() => {
    const baseColumns: ColumnConfig[] = [
      {
        id: "id",
        header: "ID",
        type: isEditing ? "string" : "readonly",
        width: 200,
      },
      {
        id: "category",
        header: "Category",
        type: isEditing ? "string" : "readonly",
        width: 500,
      },
      {
        id: "gaji",
        header: "Gaji",
        type: isEditing ? "string" : "readonly",
        width: 50,
      },
      {
        id: "ikut",
        header: "Ikut",
        type: isEditing ? "string" : "readonly",
        width: 50,
      },
      {
        id: "jv",
        header: "JV",
        type: isEditing ? "string" : "readonly",
        width: 50,
      },
    ];

    if (selectedSection === "All Section" || isEditing) {
      baseColumns.splice(2, 0, {
        id: "section",
        header: "Section",
        type: isEditing ? "listbox" : "readonly",
        width: 200,
        options: sections,
      });
    }

    return baseColumns;
  }, [isEditing, selectedSection]);

  const fetchSections = useCallback(async () => {
    try {
      const response = await fetch("http://localhost:5000/api/sections");
      if (!response.ok) throw new Error("Failed to fetch sections");
      const data = await response.json();
      setSections([...data.map((section: { name: string }) => section.name)]);
    } catch (error) {
      console.error("Error fetching sections:", error);
      toast.error("Failed to fetch sections. Please try again.");
    }
  }, []);

  const fetchJobCategories = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch("http://localhost:5000/api/job-categories");
      if (!response.ok) throw new Error("Failed to fetch job categories");
      const data = await response.json();
      setJobCategories(data);
    } catch (error) {
      console.error("Error fetching job categories:", error);
      toast.error("Failed to fetch job categories. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchJobCategories();
    fetchSections();
  }, [fetchJobCategories, fetchSections]);

  useEffect(() => {
    if (isEditing) {
      setEditedJobCategories([...jobCategories]);
    }
  }, [isEditing, jobCategories]);

  const handleDataChange = useCallback((updatedData: JobCategory[]) => {
    setTimeout(() => setEditedJobCategories(updatedData), 0);
  }, []);

  const handleDeleteJobCategories = useCallback(
    async (selectedIndices: number[]) => {
      const categoriesToDelete = selectedIndices.map(
        (index) => jobCategories[index]
      );
      const categoryIdsToDelete = categoriesToDelete.map(
        (category) => category.id
      );

      try {
        const response = await fetch(
          `http://localhost:5000/api/job-categories`,
          {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ jobCategoryIds: categoryIdsToDelete }),
          }
        );

        if (!response.ok) {
          throw new Error("Failed to delete job categories on the server");
        }

        setJobCategories((prevCategories) =>
          prevCategories.filter(
            (category) => !categoryIdsToDelete.includes(category.id)
          )
        );

        toast.success("Selected job categories deleted successfully");
        setIsEditing(false);
      } catch (error) {
        console.error("Error deleting selected job categories:", error);
        toast.error("Failed to delete job categories. Please try again.");
      }
    },
    [jobCategories]
  );

  const handleSave = useCallback(async () => {
    try {
      // Check for invalid job category objects
      const invalidCategory = editedJobCategories.find(
        (category) =>
          !category || typeof category.id !== "string" || !category.id.trim()
      );
      if (invalidCategory) {
        toast.error("All job categories must have a valid ID");
        return;
      }

      // Check for duplicate job category IDs
      const jobCategoryIds = new Set();
      const duplicateJobCategoryId = editedJobCategories.find((category) => {
        if (jobCategoryIds.has(category.id)) {
          return true;
        }
        jobCategoryIds.add(category.id);
        return false;
      });

      if (duplicateJobCategoryId) {
        toast.error(`Duplicate Job Category ID: ${duplicateJobCategoryId.id}`);
        return;
      }

      const jobCategoriesToUpdate = editedJobCategories.map((category) => ({
        ...category,
        newId: category.id !== category.originalId ? category.id : undefined,
        id: category.originalId || category.id,
        category: category.category || "",
        section: category.section || "",
        gaji: category.gaji || "",
        ikut: category.ikut || "",
        jv: category.jv || "",
      }));

      const response = await fetch(
        "http://localhost:5000/api/job-categories/batch",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jobCategories: jobCategoriesToUpdate,
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(
          errorData.message || "An error occurred while saving job categories"
        );
      }

      const result = await response.json();
      setJobCategories(
        result.jobCategories.map((category: JobCategory) => ({
          ...category,
          originalId: category.id,
        }))
      );
      setIsEditing(false);
      toast.success("Changes saved successfully");
    } catch (error) {
      console.error("Error updating job categories:", error);
      toast.error((error as Error).message);
    }
  }, [editedJobCategories]);

  const handleCancel = useCallback(() => {
    setIsEditing(false);
    setEditedJobCategories([]);
  }, []);

  const handleToggleEditing = useCallback(() => {
    setIsEditing((prev) => !prev);
  }, []);

  const filteredJobCategories = useMemo(() => {
    if (selectedSection === "All Section") {
      return isEditing ? editedJobCategories : jobCategories;
    }
    return (isEditing ? editedJobCategories : jobCategories).filter(
      (category) => category.section === selectedSection
    );
  }, [selectedSection, isEditing, editedJobCategories, jobCategories]);

  const renderSectionListbox = () => (
    <>
      <span className="font-semibold mr-2">Section:</span>
      <Listbox value={selectedSection} onChange={setSelectedSection}>
        <div className="relative">
          <ListboxButton className="w-48 rounded-lg border border-gray-300 bg-white py-2 pl-3 pr-10 text-left focus:outline-none focus:border-gray-400">
            <span className="block truncate">{selectedSection}</span>
            <span className="absolute inset-y-0 right-0 flex items-center pr-2 pointer-events-none">
              <IconChevronDown
                className="h-5 w-5 text-gray-400"
                aria-hidden="true"
              />
            </span>
          </ListboxButton>
          <ListboxOptions className="absolute z-10 w-full p-1 mt-1 border bg-white max-h-60 rounded-lg overflow-auto focus:outline-none shadow-lg">
            {sections.map((section) => (
              <ListboxOption
                key={section}
                className={({ active }) =>
                  `relative cursor-pointer select-none rounded py-2 pl-3 pr-9 ${
                    active ? "bg-gray-100 text-gray-900" : "text-gray-900"
                  }`
                }
                value={section}
              >
                {({ selected }) => (
                  <>
                    <span
                      className={`block truncate ${
                        selected ? "font-medium" : "font-normal"
                      }`}
                    >
                      {section}
                    </span>
                    {selected && (
                      <span className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-600">
                        <IconCheck className="h-5 w-5" aria-hidden="true" />
                      </span>
                    )}
                  </>
                )}
              </ListboxOption>
            ))}
          </ListboxOptions>
        </div>
      </Listbox>
    </>
  );

  if (loading) {
    return <p className="mt-4 text-center">Loading...</p>;
  }

  return (
    <div className={`relative`}>
      <div className="flex flex-col items-start">
        <div className={`w-full flex justify-between items-center mb-4`}>
          {isEditing ? (
            <></>
          ) : (
            <div className="flex items-center">{renderSectionListbox()}</div>
          )}
          <div
            className={`w-full text-lg text-center font-medium text-gray-700`}
          >
            Job Category
          </div>
          <div className="w-48"></div>
        </div>
        <div className="w-full">
          <div className="relative">
            <Table
              initialData={filteredJobCategories}
              columns={jobCategoryColumns}
              onShowDeleteButton={() => {}}
              onDelete={handleDeleteJobCategories}
              onChange={handleDataChange}
              isEditing={isEditing}
              onToggleEditing={handleToggleEditing}
              onSave={handleSave}
              onCancel={handleCancel}
              tableKey="catalogueJobCategory"
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default CatalogueJobCategoryPage;