// src/pages/Catalogue/BasicPage.tsx
import React, { useState, useEffect, useCallback } from "react";
import _ from "lodash";
import Table from "../../components/Table/Table";
import { ColumnConfig } from "../../types/types";
import toast from "react-hot-toast";
import { api } from "../../routes/utils/api";
import LoadingSpinner from "../../components/LoadingSpinner";
import { useStaffFormOptions } from "../../hooks/useStaffFormOptions";

interface CatalogueItem {
  originalId: string;
  id: string;
  name: string;
  [key: string]: any; // Allow for additional properties
}

interface CatalogueBasicPageProps {
  title: string;
  apiEndpoint: string;
  tableKey: string;
}

const BasicPage: React.FC<CatalogueBasicPageProps> = ({
  title,
  apiEndpoint,
  tableKey,
}) => {
  const [items, setItems] = useState<CatalogueItem[]>([]);
  const [editedItems, setEditedItems] = useState<CatalogueItem[]>([]);
  const [originalItems, setOriginalItems] = useState<CatalogueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);

  // Add this line to get the refreshOptions function
  const { options, refreshOptions } = useStaffFormOptions();

  const columns: ColumnConfig[] = [
    { id: "id", header: "ID", type: "readonly", width: 200 },
    { id: "name", header: "Name", type: "readonly", width: 300 },
  ];

  const editableColumns: ColumnConfig[] = columns.map((col) => ({
    ...col,
    type: "string",
  }));

  useEffect(() => {
    // Set loading true when options or apiEndpoint changes
    setLoading(true);
    // Check if options are loaded and the specific endpoint data exists
    if (options && apiEndpoint in options) {
      // Type assertion to access options property dynamically
      const data = options[apiEndpoint as keyof typeof options];
      // Ensure the data is an array before processing
      if (Array.isArray(data)) {
        setItems(
          // Map the data from options to the CatalogueItem structure
          data.map((item: { id: string; name: string }) => ({
            ...item, // Spread existing properties (id, name)
            originalId: item.id, // Set originalId
          }))
        );
        setLoading(false); // Data loaded from options
      } else {
        // Handle case where options[apiEndpoint] is not an array
        console.error(
          `Data for ${apiEndpoint} in options is not an array:`,
          data
        );
        toast.error(`Invalid data format for ${apiEndpoint}.`);
        setItems([]); // Set items to empty array
        setLoading(false); // Stop loading
      }
    } else if (options) {
      console.warn(
        `API endpoint "${apiEndpoint}" not found in staff form options. Displaying empty list.`
      );
      setItems([]);
      setLoading(false);
    }
  }, [options, apiEndpoint]);

  useEffect(() => {
    if (isEditing) {
      setEditedItems([...items]);
      setOriginalItems([...items]);
    }
  }, [isEditing, items]);

  const handleDataChange = useCallback((updatedData: CatalogueItem[]) => {
    setTimeout(() => setEditedItems(updatedData), 0);
  }, []);

  const handleDeleteItems = useCallback(
    async (selectedIndices: number[]) => {
      const itemsToDelete = selectedIndices.map((index) => items[index]);
      const itemIdsToDelete = itemsToDelete.map((item) => item.id);

      if (!itemIdsToDelete.length) {
        toast.error("No items selected for deletion");
        return;
      }

      try {
        await api.delete(`/api/${apiEndpoint}`, itemIdsToDelete);

        // Handle the response
        setItems((prevItems) =>
          prevItems.filter((item) => !itemIdsToDelete.includes(item.id))
        );

        toast.success(`Selected ${apiEndpoint} deleted successfully`);
        setIsEditing(false);

        // Add this block to refresh options when certain entities are updated
        if (
          ["nationalities", "races", "agama", "locations"].includes(apiEndpoint)
        ) {
          await refreshOptions();
        }
      } catch (error) {
        console.error(`Error deleting selected ${apiEndpoint}:`, error);
        toast.error(`Failed to delete ${apiEndpoint}. Please try again.`);
      }
    },
    [items, apiEndpoint, refreshOptions]
  );

  const handleSave = useCallback(async () => {
    try {
      // Check for empty item IDs
      const emptyItemId = editedItems.find((item) => !item.id.trim());
      if (emptyItemId) {
        toast.error(`${_.startCase(apiEndpoint)} ID cannot be empty`);
        return;
      }

      // Check for duplicate item IDs
      const itemIds = new Set();
      const duplicateItemId = editedItems.find((item) => {
        if (itemIds.has(item.id)) {
          return true;
        }
        itemIds.add(item.id);
        return false;
      });

      if (duplicateItemId) {
        toast.error(
          `Duplicate ${_.startCase(apiEndpoint)} ID: ${duplicateItemId.id}`
        );
        return;
      }

      // Check for changes
      const itemsChanged = !_.isEqual(
        editedItems.map((item) => _.omit(item, ["originalId"])),
        originalItems.map((item) => _.omit(item, ["originalId"]))
      );

      if (!itemsChanged) {
        toast("No changes detected");
        setIsEditing(false);
        return;
      }

      const itemsToUpdate = editedItems.map((item) => ({
        ...item,
        newId: item.id !== item.originalId ? item.id : undefined,
        id: item.originalId,
      }));

      // Get the entity name (singular form) from the endpoint
      let entityName = apiEndpoint;
      if (apiEndpoint === "nationalities") {
        entityName = "nationality";
      } else if (apiEndpoint.endsWith("ies")) {
        entityName = apiEndpoint.slice(0, -3) + "y";
      } else if (apiEndpoint.endsWith("s")) {
        entityName = apiEndpoint.slice(0, -1);
      }

      const payloadKey = `${entityName}s`;

      // Send the request
      const result = await api.post(`/api/${apiEndpoint}/batch`, {
        [payloadKey]: itemsToUpdate,
      });

      // Get the response data using the same key that we sent
      const updatedItems = result[payloadKey];

      if (!updatedItems) {
        throw new Error(`No ${apiEndpoint} data received from server`);
      }

      setItems(
        updatedItems.map((item: CatalogueItem) => ({
          ...item,
          originalId: item.id,
        }))
      );

      setIsEditing(false);
      toast.success("Changes saved successfully");

      // Add this block to refresh options when certain entities are updated
      if (
        ["nationalities", "races", "agama", "locations"].includes(apiEndpoint)
      ) {
        await refreshOptions();
      }
    } catch (error) {
      console.error(`Error updating ${apiEndpoint}:`, error);
      toast.error((error as Error).message);
    }
  }, [editedItems, originalItems, apiEndpoint, refreshOptions]);

  const handleCancel = useCallback(() => {
    setIsEditing(false);
    setEditedItems([]);
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
          className={`relative w-full text-left text-lg text-default-700 font-medium mb-6`}
        >
          {title}
        </div>
        <div className="relative justify-center">
          <Table
            initialData={isEditing ? editedItems : items}
            columns={isEditing ? editableColumns : columns}
            onShowDeleteButton={() => {}}
            onDelete={handleDeleteItems}
            onChange={handleDataChange}
            isEditing={isEditing}
            onToggleEditing={handleToggleEditing}
            onSave={handleSave}
            onCancel={handleCancel}
            tableKey={tableKey}
          />
        </div>
      </div>
    </div>
  );
};

export default BasicPage;
