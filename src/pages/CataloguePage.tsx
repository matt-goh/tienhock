import React, { useState, useEffect, useCallback } from "react";
import _ from "lodash";
import Table from "../components/Table";
import { ColumnConfig } from "../types/types";
import toast from "react-hot-toast";

interface CatalogueItem {
  originalId: string;
  id: string;
  name: string;
  [key: string]: any; // Allow for additional properties
}

interface CataloguePageProps {
  title: string;
  apiEndpoint: string;
  tableKey: string;
}

const CataloguePage: React.FC<CataloguePageProps> = ({
  title,
  apiEndpoint,
  tableKey,
}) => {
  const [items, setItems] = useState<CatalogueItem[]>([]);
  const [editedItems, setEditedItems] = useState<CatalogueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);

  const columns: ColumnConfig[] = [
    { id: "id", header: "ID", type: "readonly", width: 200 },
    { id: "name", header: "Name", type: "readonly", width: 300 },
  ];

  const editableColumns: ColumnConfig[] = columns.map((col) => ({
    ...col,
    type: "string",
  }));

  const fetchItems = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch(`http://localhost:5000/api/${apiEndpoint}`);
      if (!response.ok) throw new Error(`Failed to fetch ${apiEndpoint}`);
      const data = await response.json();
      setItems(
        data.map((item: CatalogueItem) => ({ ...item, originalId: item.id }))
      );
    } catch (error) {
      console.error(`Error fetching ${apiEndpoint}:`, error);
      toast.error(`Failed to fetch ${apiEndpoint}. Please try again.`);
    } finally {
      setLoading(false);
    }
  }, [apiEndpoint]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  useEffect(() => {
    if (isEditing) {
      setEditedItems([...items]);
    }
  }, [isEditing, items]);

  const handleDataChange = useCallback((updatedData: CatalogueItem[]) => {
    setTimeout(() => setEditedItems(updatedData), 0);
  }, []);

  const handleDeleteItems = useCallback(
    async (selectedIndices: number[]) => {
      const itemsToDelete = selectedIndices.map((index) => items[index]);
      const itemIdsToDelete = itemsToDelete.map((item) => item.id);

      try {
        const response = await fetch(
          `http://localhost:5000/api/${apiEndpoint}`,
          {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ [`${apiEndpoint}Ids`]: itemIdsToDelete }),
          }
        );

        if (!response.ok) {
          throw new Error(`Failed to delete ${apiEndpoint} on the server`);
        }

        setItems((prevItems) =>
          prevItems.filter((item) => !itemIdsToDelete.includes(item.id))
        );

        toast.success(`Selected ${apiEndpoint} deleted successfully`);
        setIsEditing(false);
      } catch (error) {
        console.error(`Error deleting selected ${apiEndpoint}:`, error);
        toast.error(`Failed to delete ${apiEndpoint}. Please try again.`);
      }
    },
    [items, apiEndpoint]
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

      const itemsToUpdate = editedItems.map((item) => ({
        ...item,
        newId: item.id !== item.originalId ? item.id : undefined,
        id: item.originalId,
      }));

      const response = await fetch(
        `http://localhost:5000/api/${apiEndpoint}/batch`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            [apiEndpoint]: itemsToUpdate,
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(
          errorData.message || `An error occurred while saving ${apiEndpoint}`
        );
      }

      const result = await response.json();
      setItems(
        result[apiEndpoint].map((item: CatalogueItem) => ({
          ...item,
          originalId: item.id,
        }))
      );
      setIsEditing(false);
      toast.success("Changes saved successfully");
    } catch (error) {
      console.error(`Error updating ${apiEndpoint}:`, error);
      toast.error((error as Error).message);
    }
  }, [editedItems, apiEndpoint]);

  const handleCancel = useCallback(() => {
    setIsEditing(false);
    setEditedItems([]);
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
          className={`relative w-full text-center text-lg text-gray-700 font-medium mb-6`}
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

export default CataloguePage;
