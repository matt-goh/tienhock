import React, { useState, useEffect, useCallback } from "react";
import _ from "lodash";
import Table from "../../components/Table/Table";
import { ColumnConfig } from "../../types/types";
import toast from "react-hot-toast";
import { api } from "../../routes/utils/api";
import LoadingSpinner from "../../components/LoadingSpinner";

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
      const data = await api.get(`/api/${apiEndpoint}`);
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

      try {
        await api.delete(`/api/${apiEndpoint}`, {
          [`${apiEndpoint}`]: itemIdsToDelete,
        });

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

      const result = await api.post(`/api/${apiEndpoint}/batch`, {
        [apiEndpoint]: itemsToUpdate,
      });

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
  }, [editedItems, originalItems, apiEndpoint]);

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
