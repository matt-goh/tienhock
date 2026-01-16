// src/pages/Catalogue/OthersPage.tsx
import React, { useState, useEffect, useCallback } from "react";
import { IconPlus, IconPencil, IconTrash, IconCheck, IconX } from "@tabler/icons-react";
import toast from "react-hot-toast";
import { api } from "../../routes/utils/api";
import { useStaffFormOptions } from "../../hooks/useStaffFormOptions";
import LoadingSpinner from "../../components/LoadingSpinner";

interface EntityItem {
  id: string;
  name: string;
  originalId?: string;
}

interface TaxItem {
  name: string;
  rate: number;
  originalName?: string;
}

interface EntityConfig {
  key: string;
  title: string;
  apiEndpoint: string;
  singularName: string;
  fields: { key: string; label: string; type: "text" | "number" }[];
}

const ENTITY_CONFIGS: EntityConfig[] = [
  {
    key: "sections",
    title: "Section",
    apiEndpoint: "sections",
    singularName: "section",
    fields: [
      { key: "id", label: "ID", type: "text" },
      { key: "name", label: "Name", type: "text" },
    ],
  },
  {
    key: "banks",
    title: "Bank",
    apiEndpoint: "banks",
    singularName: "bank",
    fields: [
      { key: "id", label: "ID", type: "text" },
      { key: "name", label: "Name", type: "text" },
    ],
  },
  {
    key: "nationalities",
    title: "Nationality",
    apiEndpoint: "nationalities",
    singularName: "nationality",
    fields: [
      { key: "id", label: "ID", type: "text" },
      { key: "name", label: "Name", type: "text" },
    ],
  },
  {
    key: "races",
    title: "Race",
    apiEndpoint: "races",
    singularName: "race",
    fields: [
      { key: "id", label: "ID", type: "text" },
      { key: "name", label: "Name", type: "text" },
    ],
  },
  {
    key: "agama",
    title: "Agama",
    apiEndpoint: "agama",
    singularName: "agama",
    fields: [
      { key: "id", label: "ID", type: "text" },
      { key: "name", label: "Name", type: "text" },
    ],
  },
];

// Compact table for id/name entities
const EntityTable: React.FC<{
  config: EntityConfig;
  data: EntityItem[];
  onSave: (items: EntityItem[]) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onAdd: (item: EntityItem) => Promise<void>;
}> = ({ config, data, onSave, onDelete, onAdd }) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<{ id: string; name: string }>({ id: "", name: "" });
  const [isAdding, setIsAdding] = useState(false);
  const [newItem, setNewItem] = useState<{ id: string; name: string }>({ id: "", name: "" });
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const handleEdit = (item: EntityItem) => {
    setEditingId(item.id);
    setEditValues({ id: item.id, name: item.name });
  };

  const handleSaveEdit = async () => {
    if (!editValues.id.trim() || !editValues.name.trim()) {
      toast.error("ID and Name cannot be empty");
      return;
    }
    const originalItem = data.find((item) => item.id === editingId);
    if (!originalItem) return;

    const updatedItem: EntityItem = {
      ...editValues,
      originalId: originalItem.originalId || originalItem.id,
    };

    await onSave([updatedItem]);
    setEditingId(null);
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditValues({ id: "", name: "" });
  };

  const handleAddNew = async () => {
    if (!newItem.id.trim() || !newItem.name.trim()) {
      toast.error("ID and Name cannot be empty");
      return;
    }
    if (data.some((item) => item.id === newItem.id)) {
      toast.error(`ID "${newItem.id}" already exists`);
      return;
    }
    await onAdd({ id: newItem.id, name: newItem.name });
    setNewItem({ id: "", name: "" });
    setIsAdding(false);
  };

  const handleDelete = async (id: string) => {
    await onDelete(id);
    setDeleteConfirmId(null);
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-default-200 dark:border-gray-700 overflow-hidden">
      <div className="px-4 py-3 bg-default-50 dark:bg-gray-700 border-b border-default-200 dark:border-gray-700">
        <h3 className="text-sm font-semibold text-default-700 dark:text-gray-200">{config.title}</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-default-50 dark:bg-gray-700">
              {config.fields.map((field) => (
                <th
                  key={field.key}
                  className="px-3 py-2 text-left text-xs font-medium text-default-500 dark:text-gray-400 uppercase tracking-wider"
                >
                  {field.label}
                </th>
              ))}
              <th className="px-3 py-2 text-right text-xs font-medium text-default-500 dark:text-gray-400 uppercase tracking-wider w-20">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-default-100 dark:divide-gray-700">
            {data.map((item) => (
              <tr key={item.id} className="hover:bg-default-50 dark:hover:bg-gray-700/50">
                {editingId === item.id ? (
                  <>
                    <td className="px-3 py-2">
                      <input
                        type="text"
                        value={editValues.id}
                        onChange={(e) => setEditValues({ ...editValues, id: e.target.value })}
                        className="w-full px-2 py-1 text-sm border border-default-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-default-700 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        autoFocus
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="text"
                        value={editValues.name}
                        onChange={(e) => setEditValues({ ...editValues, name: e.target.value })}
                        className="w-full px-2 py-1 text-sm border border-default-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-default-700 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex justify-end space-x-1">
                        <button
                          onClick={handleSaveEdit}
                          className="p-1 text-green-600 dark:text-green-500 hover:bg-green-100 dark:hover:bg-green-900/30 rounded"
                        >
                          <IconCheck size={16} />
                        </button>
                        <button
                          onClick={handleCancelEdit}
                          className="p-1 text-red-600 dark:text-red-500 hover:bg-red-100 dark:hover:bg-red-900/30 rounded"
                        >
                          <IconX size={16} />
                        </button>
                      </div>
                    </td>
                  </>
                ) : (
                  <>
                    <td className="px-3 py-2 text-default-700 dark:text-gray-300">{item.id}</td>
                    <td className="px-3 py-2 text-default-700 dark:text-gray-300">{item.name}</td>
                    <td className="px-3 py-2 text-right">
                      {deleteConfirmId === item.id ? (
                        <div className="flex justify-end space-x-1">
                          <button
                            onClick={() => handleDelete(item.id)}
                            className="p-1 text-red-600 dark:text-red-500 hover:bg-red-100 dark:hover:bg-red-900/30 rounded"
                            title="Confirm delete"
                          >
                            <IconCheck size={16} />
                          </button>
                          <button
                            onClick={() => setDeleteConfirmId(null)}
                            className="p-1 text-default-500 dark:text-gray-400 hover:bg-default-100 dark:hover:bg-gray-700 rounded"
                            title="Cancel"
                          >
                            <IconX size={16} />
                          </button>
                        </div>
                      ) : (
                        <div className="flex justify-end space-x-1">
                          <button
                            onClick={() => handleEdit(item)}
                            className="p-1 text-default-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/30 rounded"
                            title="Edit"
                          >
                            <IconPencil size={16} />
                          </button>
                          <button
                            onClick={() => setDeleteConfirmId(item.id)}
                            className="p-1 text-default-500 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30 rounded"
                            title="Delete"
                          >
                            <IconTrash size={16} />
                          </button>
                        </div>
                      )}
                    </td>
                  </>
                )}
              </tr>
            ))}
            {isAdding ? (
              <tr className="bg-blue-50 dark:bg-blue-900/20">
                <td className="px-3 py-2">
                  <input
                    type="text"
                    value={newItem.id}
                    onChange={(e) => setNewItem({ ...newItem, id: e.target.value })}
                    placeholder="ID"
                    className="w-full px-2 py-1 text-sm border border-default-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-default-700 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    autoFocus
                  />
                </td>
                <td className="px-3 py-2">
                  <input
                    type="text"
                    value={newItem.name}
                    onChange={(e) => setNewItem({ ...newItem, name: e.target.value })}
                    placeholder="Name"
                    className="w-full px-2 py-1 text-sm border border-default-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-default-700 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </td>
                <td className="px-3 py-2 text-right">
                  <div className="flex justify-end space-x-1">
                    <button
                      onClick={handleAddNew}
                      className="p-1 text-green-600 dark:text-green-500 hover:bg-green-100 dark:hover:bg-green-900/30 rounded"
                    >
                      <IconCheck size={16} />
                    </button>
                    <button
                      onClick={() => {
                        setIsAdding(false);
                        setNewItem({ id: "", name: "" });
                      }}
                      className="p-1 text-red-600 dark:text-red-500 hover:bg-red-100 dark:hover:bg-red-900/30 rounded"
                    >
                      <IconX size={16} />
                    </button>
                  </div>
                </td>
              </tr>
            ) : (
              <tr>
                <td colSpan={3} className="px-3 py-2">
                  <button
                    onClick={() => setIsAdding(true)}
                    className="flex items-center text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
                  >
                    <IconPlus size={16} className="mr-1" />
                    Add new
                  </button>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// Tax table with name/rate fields
const TaxTable: React.FC<{
  data: TaxItem[];
  onSave: (items: TaxItem[]) => Promise<void>;
  onDelete: (name: string) => Promise<void>;
  onAdd: (item: TaxItem) => Promise<void>;
}> = ({ data, onSave, onDelete, onAdd }) => {
  const [editingName, setEditingName] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<{ name: string; rate: number }>({ name: "", rate: 0 });
  const [isAdding, setIsAdding] = useState(false);
  const [newItem, setNewItem] = useState<{ name: string; rate: string }>({ name: "", rate: "" });
  const [deleteConfirmName, setDeleteConfirmName] = useState<string | null>(null);

  const handleEdit = (item: TaxItem) => {
    setEditingName(item.name);
    setEditValues({ name: item.name, rate: item.rate });
  };

  const handleSaveEdit = async () => {
    if (!editValues.name.trim()) {
      toast.error("Name cannot be empty");
      return;
    }
    const originalItem = data.find((item) => item.name === editingName);
    if (!originalItem) return;

    const updatedItem: TaxItem = {
      name: editValues.name,
      rate: editValues.rate,
      originalName: originalItem.originalName || originalItem.name,
    };

    await onSave([updatedItem]);
    setEditingName(null);
  };

  const handleCancelEdit = () => {
    setEditingName(null);
    setEditValues({ name: "", rate: 0 });
  };

  const handleAddNew = async () => {
    if (!newItem.name.trim()) {
      toast.error("Name cannot be empty");
      return;
    }
    const rate = parseFloat(newItem.rate) || 0;
    if (data.some((item) => item.name === newItem.name)) {
      toast.error(`Tax "${newItem.name}" already exists`);
      return;
    }
    await onAdd({ name: newItem.name, rate });
    setNewItem({ name: "", rate: "" });
    setIsAdding(false);
  };

  const handleDelete = async (name: string) => {
    await onDelete(name);
    setDeleteConfirmName(null);
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-default-200 dark:border-gray-700 overflow-hidden">
      <div className="px-4 py-3 bg-default-50 dark:bg-gray-700 border-b border-default-200 dark:border-gray-700">
        <h3 className="text-sm font-semibold text-default-700 dark:text-gray-200">Tax</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-default-50 dark:bg-gray-700">
              <th className="px-3 py-2 text-left text-xs font-medium text-default-500 dark:text-gray-400 uppercase tracking-wider">
                Name
              </th>
              <th className="px-3 py-2 text-right text-xs font-medium text-default-500 dark:text-gray-400 uppercase tracking-wider w-24">
                Rate
              </th>
              <th className="px-3 py-2 text-right text-xs font-medium text-default-500 dark:text-gray-400 uppercase tracking-wider w-20">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-default-100 dark:divide-gray-700">
            {data.map((item) => (
              <tr key={item.name} className="hover:bg-default-50 dark:hover:bg-gray-700/50">
                {editingName === item.name ? (
                  <>
                    <td className="px-3 py-2">
                      <input
                        type="text"
                        value={editValues.name}
                        onChange={(e) => setEditValues({ ...editValues, name: e.target.value })}
                        className="w-full px-2 py-1 text-sm border border-default-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-default-700 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        autoFocus
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        step="0.01"
                        value={editValues.rate}
                        onChange={(e) => setEditValues({ ...editValues, rate: parseFloat(e.target.value) || 0 })}
                        className="w-full px-2 py-1 text-sm text-right border border-default-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-default-700 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex justify-end space-x-1">
                        <button
                          onClick={handleSaveEdit}
                          className="p-1 text-green-600 dark:text-green-500 hover:bg-green-100 dark:hover:bg-green-900/30 rounded"
                        >
                          <IconCheck size={16} />
                        </button>
                        <button
                          onClick={handleCancelEdit}
                          className="p-1 text-red-600 dark:text-red-500 hover:bg-red-100 dark:hover:bg-red-900/30 rounded"
                        >
                          <IconX size={16} />
                        </button>
                      </div>
                    </td>
                  </>
                ) : (
                  <>
                    <td className="px-3 py-2 text-default-700 dark:text-gray-300">{item.name}</td>
                    <td className="px-3 py-2 text-right text-default-700 dark:text-gray-300">{item.rate}</td>
                    <td className="px-3 py-2 text-right">
                      {deleteConfirmName === item.name ? (
                        <div className="flex justify-end space-x-1">
                          <button
                            onClick={() => handleDelete(item.name)}
                            className="p-1 text-red-600 dark:text-red-500 hover:bg-red-100 dark:hover:bg-red-900/30 rounded"
                            title="Confirm delete"
                          >
                            <IconCheck size={16} />
                          </button>
                          <button
                            onClick={() => setDeleteConfirmName(null)}
                            className="p-1 text-default-500 dark:text-gray-400 hover:bg-default-100 dark:hover:bg-gray-700 rounded"
                            title="Cancel"
                          >
                            <IconX size={16} />
                          </button>
                        </div>
                      ) : (
                        <div className="flex justify-end space-x-1">
                          <button
                            onClick={() => handleEdit(item)}
                            className="p-1 text-default-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/30 rounded"
                            title="Edit"
                          >
                            <IconPencil size={16} />
                          </button>
                          <button
                            onClick={() => setDeleteConfirmName(item.name)}
                            className="p-1 text-default-500 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30 rounded"
                            title="Delete"
                          >
                            <IconTrash size={16} />
                          </button>
                        </div>
                      )}
                    </td>
                  </>
                )}
              </tr>
            ))}
            {isAdding ? (
              <tr className="bg-blue-50 dark:bg-blue-900/20">
                <td className="px-3 py-2">
                  <input
                    type="text"
                    value={newItem.name}
                    onChange={(e) => setNewItem({ ...newItem, name: e.target.value })}
                    placeholder="Name"
                    className="w-full px-2 py-1 text-sm border border-default-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-default-700 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    autoFocus
                  />
                </td>
                <td className="px-3 py-2">
                  <input
                    type="number"
                    step="0.01"
                    value={newItem.rate}
                    onChange={(e) => setNewItem({ ...newItem, rate: e.target.value })}
                    placeholder="0"
                    className="w-full px-2 py-1 text-sm text-right border border-default-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-default-700 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </td>
                <td className="px-3 py-2 text-right">
                  <div className="flex justify-end space-x-1">
                    <button
                      onClick={handleAddNew}
                      className="p-1 text-green-600 dark:text-green-500 hover:bg-green-100 dark:hover:bg-green-900/30 rounded"
                    >
                      <IconCheck size={16} />
                    </button>
                    <button
                      onClick={() => {
                        setIsAdding(false);
                        setNewItem({ name: "", rate: "" });
                      }}
                      className="p-1 text-red-600 dark:text-red-500 hover:bg-red-100 dark:hover:bg-red-900/30 rounded"
                    >
                      <IconX size={16} />
                    </button>
                  </div>
                </td>
              </tr>
            ) : (
              <tr>
                <td colSpan={3} className="px-3 py-2">
                  <button
                    onClick={() => setIsAdding(true)}
                    className="flex items-center text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
                  >
                    <IconPlus size={16} className="mr-1" />
                    Add new
                  </button>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const OthersPage: React.FC = () => {
  const { options, loading: optionsLoading, refreshOptions } = useStaffFormOptions();
  const [entityData, setEntityData] = useState<Record<string, EntityItem[]>>({});
  const [taxes, setTaxes] = useState<TaxItem[]>([]);
  const [taxLoading, setTaxLoading] = useState(true);

  // Load entity data from options
  useEffect(() => {
    if (!optionsLoading && options) {
      const data: Record<string, EntityItem[]> = {};
      ENTITY_CONFIGS.forEach((config) => {
        const items = options[config.key as keyof typeof options];
        if (Array.isArray(items)) {
          data[config.key] = items.map((item: { id: string; name: string }) => ({
            id: item.id,
            name: item.name,
            originalId: item.id,
          }));
        } else {
          data[config.key] = [];
        }
      });
      setEntityData(data);
    }
  }, [options, optionsLoading]);

  // Load taxes separately
  useEffect(() => {
    const fetchTaxes = async () => {
      try {
        setTaxLoading(true);
        const data = await api.get("/api/taxes");
        setTaxes(data.map((t: TaxItem) => ({ ...t, originalName: t.name })));
      } catch (error) {
        console.error("Error fetching taxes:", error);
        toast.error("Failed to load taxes");
      } finally {
        setTaxLoading(false);
      }
    };
    fetchTaxes();
  }, []);

  // Entity CRUD handlers
  const handleEntitySave = useCallback(
    async (config: EntityConfig, items: EntityItem[]) => {
      try {
        const payloadKey = `${config.singularName}s`;
        const itemsToUpdate = items.map((item) => ({
          id: item.originalId || item.id,
          newId: item.id !== item.originalId ? item.id : undefined,
          name: item.name,
        }));

        const result = await api.post(`/api/${config.apiEndpoint}/batch`, {
          [payloadKey]: itemsToUpdate,
        });

        const updatedItems = result[payloadKey];
        if (updatedItems) {
          setEntityData((prev) => ({
            ...prev,
            [config.key]: updatedItems.map((item: EntityItem) => ({
              ...item,
              originalId: item.id,
            })),
          }));
        }

        toast.success("Saved successfully");
        if (["nationalities", "races", "agama", "sections", "banks"].includes(config.key)) {
          await refreshOptions();
        }
      } catch (error) {
        console.error(`Error saving ${config.title}:`, error);
        toast.error((error as Error).message || "Failed to save");
      }
    },
    [refreshOptions]
  );

  const handleEntityDelete = useCallback(
    async (config: EntityConfig, id: string) => {
      try {
        await api.delete(`/api/${config.apiEndpoint}`, [id]);
        setEntityData((prev) => ({
          ...prev,
          [config.key]: prev[config.key].filter((item) => item.id !== id),
        }));
        toast.success("Deleted successfully");
        if (["nationalities", "races", "agama", "sections", "banks"].includes(config.key)) {
          await refreshOptions();
        }
      } catch (error) {
        console.error(`Error deleting ${config.title}:`, error);
        toast.error((error as Error).message || "Failed to delete");
      }
    },
    [refreshOptions]
  );

  const handleEntityAdd = useCallback(
    async (config: EntityConfig, item: EntityItem) => {
      try {
        const payloadKey = `${config.singularName}s`;
        const result = await api.post(`/api/${config.apiEndpoint}/batch`, {
          [payloadKey]: [{ id: item.id, name: item.name }],
        });

        const addedItems = result[payloadKey];
        if (addedItems && addedItems.length > 0) {
          setEntityData((prev) => ({
            ...prev,
            [config.key]: [
              ...prev[config.key],
              { ...addedItems[0], originalId: addedItems[0].id },
            ],
          }));
        }

        toast.success("Added successfully");
        if (["nationalities", "races", "agama", "sections", "banks"].includes(config.key)) {
          await refreshOptions();
        }
      } catch (error) {
        console.error(`Error adding ${config.title}:`, error);
        toast.error((error as Error).message || "Failed to add");
      }
    },
    [refreshOptions]
  );

  // Tax CRUD handlers
  const handleTaxSave = useCallback(async (editedItems: TaxItem[]) => {
    try {
      // Merge edited items with existing taxes
      const updatedTaxes = taxes.map((tax) => {
        const editedItem = editedItems.find((e) => e.originalName === tax.originalName || e.originalName === tax.name);
        if (editedItem) {
          return { name: editedItem.name, rate: editedItem.rate };
        }
        return { name: tax.name, rate: tax.rate };
      });

      const result = await api.post("/api/taxes/batch", { taxes: updatedTaxes });
      if (result.taxes) {
        setTaxes(result.taxes.map((t: TaxItem) => ({ ...t, originalName: t.name })));
      }
      toast.success("Saved successfully");
    } catch (error) {
      console.error("Error saving tax:", error);
      toast.error((error as Error).message || "Failed to save");
    }
  }, [taxes]);

  const handleTaxDelete = useCallback(async (name: string) => {
    try {
      await api.delete("/api/taxes", [name]);
      setTaxes((prev) => prev.filter((item) => item.name !== name));
      toast.success("Deleted successfully");
    } catch (error) {
      console.error("Error deleting tax:", error);
      toast.error((error as Error).message || "Failed to delete");
    }
  }, []);

  const handleTaxAdd = useCallback(async (item: TaxItem) => {
    try {
      const result = await api.post("/api/taxes/batch", { taxes: [item] });
      if (result.taxes && result.taxes.length > 0) {
        setTaxes((prev) => [...prev, { ...result.taxes[0], originalName: result.taxes[0].name }]);
      }
      toast.success("Added successfully");
    } catch (error) {
      console.error("Error adding tax:", error);
      toast.error((error as Error).message || "Failed to add");
    }
  }, []);

  if (optionsLoading || taxLoading) {
    return (
      <div className="mt-40 w-full flex items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="w-full">
      <h1 className="text-xl font-semibold text-default-700 dark:text-gray-200 mb-3">Others</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {ENTITY_CONFIGS.map((config) => (
          <EntityTable
            key={config.key}
            config={config}
            data={entityData[config.key] || []}
            onSave={(items) => handleEntitySave(config, items)}
            onDelete={(id) => handleEntityDelete(config, id)}
            onAdd={(item) => handleEntityAdd(config, item)}
          />
        ))}
        <TaxTable
          data={taxes}
          onSave={handleTaxSave}
          onDelete={handleTaxDelete}
          onAdd={handleTaxAdd}
        />
      </div>
    </div>
  );
};

export default OthersPage;
