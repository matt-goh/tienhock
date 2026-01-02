// src/components/Catalogue/LocationModal.tsx
import React, { useState, useEffect } from "react";
import { Dialog, DialogPanel, DialogTitle } from "@headlessui/react";
import { IconX } from "@tabler/icons-react";
import { Location } from "../../utils/catalogue/useLocationsCache";
import Button from "../Button";

interface LocationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (location: Location) => Promise<void>;
  initialData: Location | null;
  existingLocations: Location[];
}

const LocationModal: React.FC<LocationModalProps> = ({
  isOpen,
  onClose,
  onSave,
  initialData,
  existingLocations,
}) => {
  const [formData, setFormData] = useState<Location>({
    id: "",
    name: "",
  });
  const [error, setError] = useState<string>("");
  const [isSaving, setIsSaving] = useState(false);

  const isEditing = !!initialData;

  useEffect(() => {
    if (isOpen) {
      if (initialData) {
        setFormData({
          id: initialData.id,
          name: initialData.name,
          originalId: initialData.id,
        });
      } else {
        setFormData({ id: "", name: "" });
      }
      setError("");
    }
  }, [isOpen, initialData]);

  const handleChange = (field: keyof Location, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setError("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    // Validation
    if (!formData.id.trim()) {
      setError("Location ID is required");
      return;
    }

    if (!formData.name.trim()) {
      setError("Location name is required");
      return;
    }

    // Check for duplicate ID (only for new or if ID changed)
    const isDuplicate = existingLocations.some(
      (loc) =>
        loc.id === formData.id.trim() &&
        loc.id !== initialData?.id
    );

    if (isDuplicate) {
      setError(`Location ID "${formData.id}" already exists`);
      return;
    }

    setIsSaving(true);
    try {
      await onSave({
        ...formData,
        id: formData.id.trim(),
        name: formData.name.trim(),
      });
      onClose();
    } catch (err: any) {
      setError(err.message || "Failed to save location");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={isOpen} onClose={onClose} className="relative z-50">
      <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <DialogPanel className="w-full max-w-md rounded-xl bg-white dark:bg-gray-800 shadow-xl">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-default-200 dark:border-gray-700">
            <DialogTitle className="text-lg font-semibold text-default-800 dark:text-gray-100">
              {isEditing ? "Edit Location" : "Add New Location"}
            </DialogTitle>
            <button
              onClick={onClose}
              className="p-1 rounded-lg hover:bg-default-100 dark:hover:bg-gray-700 text-default-500 dark:text-gray-400"
            >
              <IconX size={20} />
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            {/* ID Field */}
            <div>
              <label className="block text-sm font-medium text-default-700 dark:text-gray-200 mb-1">
                Location ID
              </label>
              <input
                type="text"
                value={formData.id}
                onChange={(e) => handleChange("id", e.target.value)}
                placeholder="e.g., 25"
                className="w-full px-3 py-2 rounded-lg border border-default-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-default-900 dark:text-gray-100 placeholder:text-default-400 dark:placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent"
                disabled={isSaving}
              />
              <p className="mt-1 text-xs text-default-500 dark:text-gray-400">
                Two-digit code (e.g., 01, 02, 25)
              </p>
            </div>

            {/* Name Field */}
            <div>
              <label className="block text-sm font-medium text-default-700 dark:text-gray-200 mb-1">
                Location Name
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => handleChange("name", e.target.value)}
                placeholder="e.g., New Department"
                className="w-full px-3 py-2 rounded-lg border border-default-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-default-900 dark:text-gray-100 placeholder:text-default-400 dark:placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent"
                disabled={isSaving}
              />
            </div>

            {/* Error Message */}
            {error && (
              <div className="p-3 rounded-lg bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800">
                <p className="text-sm text-rose-600 dark:text-rose-400">{error}</p>
              </div>
            )}

            {/* Actions */}
            <div className="flex justify-end gap-3 pt-2">
              <Button
                type="button"
                onClick={onClose}
                variant="outline"
                color="default"
                disabled={isSaving}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="filled"
                color="sky"
                disabled={isSaving}
              >
                {isSaving ? "Saving..." : isEditing ? "Update" : "Create"}
              </Button>
            </div>
          </form>
        </DialogPanel>
      </div>
    </Dialog>
  );
};

export default LocationModal;
