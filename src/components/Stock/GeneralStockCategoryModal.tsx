// src/components/Stock/GeneralStockCategoryModal.tsx
import React, { Fragment, useEffect, useState } from "react";
import {
  Dialog,
  DialogPanel,
  DialogTitle,
  Transition,
  TransitionChild,
} from "@headlessui/react";
import {
  IconCategory2,
  IconCheck,
  IconPencil,
  IconPlus,
  IconTrash,
  IconX,
} from "@tabler/icons-react";
import toast from "react-hot-toast";
import Button from "../Button";
import { api } from "../../routes/utils/api";
import { GeneralStockCategory } from "../../types/types";

interface GeneralStockCategoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  categories: GeneralStockCategory[];
  onChanged: () => Promise<void> | void;
}

const GeneralStockCategoryModal: React.FC<GeneralStockCategoryModalProps> = ({
  isOpen,
  onClose,
  categories,
  onChanged,
}) => {
  const [newName, setNewName] = useState<string>("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingName, setEditingName] = useState<string>("");
  const [isBusy, setIsBusy] = useState<boolean>(false);

  useEffect(() => {
    if (isOpen) {
      setNewName("");
      setEditingId(null);
      setEditingName("");
    }
  }, [isOpen]);

  const handleAdd = async (): Promise<void> => {
    const name = newName.trim();
    if (!name || isBusy) return;

    setIsBusy(true);
    try {
      await api.post("/api/general-purchases/general-stock/categories", {
        name,
        sort_order: categories.length + 1,
      });
      setNewName("");
      await onChanged();
      toast.success("Category added");
    } catch (error: unknown) {
      console.error("Error adding general stock category:", error);
      toast.error(error instanceof Error ? error.message : "Failed to add category");
    } finally {
      setIsBusy(false);
    }
  };

  const startEditing = (category: GeneralStockCategory): void => {
    setEditingId(category.id);
    setEditingName(category.name);
  };

  const cancelEditing = (): void => {
    setEditingId(null);
    setEditingName("");
  };

  const handleUpdate = async (category: GeneralStockCategory): Promise<void> => {
    const name = editingName.trim();
    if (!name || isBusy) return;
    if (name === category.name) {
      cancelEditing();
      return;
    }

    setIsBusy(true);
    try {
      await api.put(`/api/general-purchases/general-stock/categories/${category.id}`, {
        name,
        sort_order: category.sort_order,
        is_active: category.is_active,
      });
      cancelEditing();
      await onChanged();
      toast.success("Category updated");
    } catch (error: unknown) {
      console.error("Error updating general stock category:", error);
      toast.error(error instanceof Error ? error.message : "Failed to update category");
    } finally {
      setIsBusy(false);
    }
  };

  const handleDelete = async (category: GeneralStockCategory): Promise<void> => {
    if (isBusy) return;
    if (!window.confirm(`Remove category "${category.name}"?`)) return;

    setIsBusy(true);
    try {
      await api.delete(`/api/general-purchases/general-stock/categories/${category.id}`);
      await onChanged();
      toast.success("Category removed");
    } catch (error: unknown) {
      console.error("Error removing general stock category:", error);
      toast.error(error instanceof Error ? error.message : "Failed to remove category");
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={onClose}>
        <TransitionChild
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black/50 dark:bg-black/70" />
        </TransitionChild>

        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4 text-center">
            <TransitionChild
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <DialogPanel className="my-auto flex max-h-[calc(100vh-3rem)] w-full max-w-md transform flex-col overflow-hidden rounded-2xl border border-default-200 bg-white text-left align-middle shadow-xl ring-1 ring-black/5 transition-all dark:border-gray-700 dark:bg-gray-800 dark:shadow-black/40 dark:ring-white/10">
                {/* Header */}
                <div className="flex items-start justify-between gap-3 border-b border-default-200 bg-default-50 px-5 py-4 dark:border-gray-700 dark:bg-gray-900/60">
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-100 text-indigo-600 dark:bg-indigo-900/40 dark:text-indigo-300">
                      <IconCategory2 size={20} />
                    </span>
                    <div>
                      <DialogTitle
                        as="h3"
                        className="text-base font-semibold text-default-800 dark:text-gray-100"
                      >
                        Manage Categories
                      </DialogTitle>
                      <p className="text-xs text-default-500 dark:text-gray-400">
                        Add, rename, or remove general stock categories.
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={onClose}
                    className="rounded-lg p-1 text-default-400 transition-colors hover:bg-default-100 hover:text-default-700 dark:text-gray-500 dark:hover:bg-gray-700 dark:hover:text-gray-200"
                    aria-label="Close"
                  >
                    <IconX size={18} />
                  </button>
                </div>

                {/* Add row */}
                <div className="border-b border-default-200 px-5 py-3 dark:border-gray-700">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newName}
                      onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                        setNewName(event.target.value)
                      }
                      onKeyDown={(event: React.KeyboardEvent<HTMLInputElement>) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          handleAdd();
                        }
                      }}
                      placeholder="New category name"
                      className="h-9 flex-1 rounded-lg border border-default-300 bg-white px-3 text-sm text-default-900 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                    />
                    <Button
                      type="button"
                      color="sky"
                      size="sm"
                      icon={IconPlus}
                      onClick={handleAdd}
                      disabled={!newName.trim() || isBusy}
                    >
                      Add
                    </Button>
                  </div>
                </div>

                {/* List */}
                <div className="flex-1 overflow-y-auto px-5 py-3">
                  {categories.length === 0 ? (
                    <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
                      <IconCategory2 size={32} className="text-default-300 dark:text-gray-600" />
                      <p className="text-sm text-default-500 dark:text-gray-400">
                        No categories yet. Add one above to get started.
                      </p>
                    </div>
                  ) : (
                    <ul className="space-y-1.5">
                      {categories.map((category: GeneralStockCategory) => {
                        const isEditing = editingId === category.id;

                        return (
                          <li
                            key={category.id}
                            className="flex items-center gap-2 rounded-lg border border-default-200 bg-default-50/60 px-3 py-2 dark:border-gray-700 dark:bg-gray-900/40"
                          >
                            {isEditing ? (
                              <>
                                <input
                                  type="text"
                                  value={editingName}
                                  onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                                    setEditingName(event.target.value)
                                  }
                                  onKeyDown={(event: React.KeyboardEvent<HTMLInputElement>) => {
                                    if (event.key === "Enter") {
                                      event.preventDefault();
                                      handleUpdate(category);
                                    } else if (event.key === "Escape") {
                                      cancelEditing();
                                    }
                                  }}
                                  autoFocus
                                  className="h-8 flex-1 rounded-md border border-sky-300 bg-white px-2 text-sm text-default-900 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 dark:border-sky-700 dark:bg-gray-700 dark:text-gray-100"
                                />
                                <button
                                  type="button"
                                  onClick={() => handleUpdate(category)}
                                  disabled={!editingName.trim() || isBusy}
                                  className="rounded-md p-1.5 text-emerald-600 transition-colors hover:bg-emerald-50 disabled:opacity-40 dark:text-emerald-400 dark:hover:bg-emerald-900/30"
                                  title="Save"
                                >
                                  <IconCheck size={16} />
                                </button>
                                <button
                                  type="button"
                                  onClick={cancelEditing}
                                  className="rounded-md p-1.5 text-default-400 transition-colors hover:bg-default-100 hover:text-default-700 dark:text-gray-500 dark:hover:bg-gray-700 dark:hover:text-gray-200"
                                  title="Cancel"
                                >
                                  <IconX size={16} />
                                </button>
                              </>
                            ) : (
                              <>
                                <span className="flex-1 truncate text-sm font-medium text-default-700 dark:text-gray-200">
                                  {category.name}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => startEditing(category)}
                                  className="rounded-md p-1.5 text-default-400 transition-colors hover:bg-default-100 hover:text-sky-600 dark:text-gray-500 dark:hover:bg-gray-700 dark:hover:text-sky-300"
                                  title="Rename"
                                >
                                  <IconPencil size={16} />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDelete(category)}
                                  disabled={isBusy}
                                  className="rounded-md p-1.5 text-default-400 transition-colors hover:bg-rose-50 hover:text-rose-600 disabled:opacity-40 dark:text-gray-500 dark:hover:bg-rose-900/20 dark:hover:text-rose-300"
                                  title="Remove"
                                >
                                  <IconTrash size={16} />
                                </button>
                              </>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>

                {/* Footer */}
                <div className="flex justify-end border-t border-default-200 px-5 py-3 dark:border-gray-700">
                  <Button type="button" variant="outline" size="sm" onClick={onClose}>
                    Done
                  </Button>
                </div>
              </DialogPanel>
            </TransitionChild>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
};

export default GeneralStockCategoryModal;
