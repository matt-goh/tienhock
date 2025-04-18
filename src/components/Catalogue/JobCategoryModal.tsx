// src/components/Catalogue/JobCategoryModal.tsx
import React, { useState, useEffect, Fragment, useCallback } from "react";
import {
  Dialog,
  DialogPanel,
  DialogTitle,
  Transition,
  TransitionChild,
} from "@headlessui/react";
import toast from "react-hot-toast";
import { api } from "../../routes/utils/api";
import { JobCategory, SelectOption } from "../../types/types";
import { FormInput, FormListbox } from "../FormComponents"; // Assuming these exist and work as planned
import Button from "../Button"; // Assuming a standard Button component exists

interface JobCategoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (category: JobCategory) => Promise<void>; // Should trigger cache refresh externally
  initialData?: JobCategory | null;
}

const JobCategoryModal: React.FC<JobCategoryModalProps> = ({
  isOpen,
  onClose,
  onSave,
  initialData = null,
}) => {
  const [formData, setFormData] = useState<JobCategory>({
    id: "",
    category: "",
    section: "",
    gaji: "",
    ikut: "",
    jv: "",
  });
  const [sections, setSections] = useState<SelectOption[]>([]);
  const [loadingSections, setLoadingSections] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEditMode = !!initialData;

  const fetchSections = useCallback(async () => {
    setLoadingSections(true);
    try {
      // Assuming api.get returns the data directly, adjust type assertion if needed
      const data = (await api.get("/api/sections")) as {
        id: string;
        name: string;
      }[]; // Assert the type after the call
      // Ensure 'All Section' is not included if it comes from the API
      const filteredData = data.filter((s) => s.name !== "All Section");
      setSections(
        filteredData.map((section) => ({
          id: section.name, // Use name as ID for Listbox compatibility if IDs aren't stable/meaningful otherwise
          name: section.name,
        }))
      );
    } catch (fetchError) {
      console.error("Error fetching sections:", fetchError);
      toast.error("Failed to load sections. Please try again.");
      setError("Could not load required section data.");
    } finally {
      setLoadingSections(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      fetchSections();
      if (initialData) {
        setFormData(initialData);
      } else {
        // Reset for add mode
        setFormData({
          id: "",
          category: "",
          section: "",
          gaji: "",
          ikut: "",
          jv: "",
        });
      }
      setError(null); // Clear previous errors
      setIsSaving(false);
    }
  }, [isOpen, initialData, fetchSections]);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleListboxChange =
    (fieldName: keyof JobCategory) => (value: string) => {
      setFormData((prev) => ({
        ...prev,
        [fieldName]: value,
      }));
    };

  const validateForm = (): boolean => {
    if (!formData.id.trim()) {
      setError("Job Category ID cannot be empty.");
      return false;
    }
    if (!formData.category.trim()) {
      setError("Category name cannot be empty.");
      return false;
    }
    if (!formData.section) {
      setError("Section must be selected.");
      return false;
    }
    // Add other validation if needed
    setError(null);
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm() || isSaving) {
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      // Pass the originalId if it exists and is different from the current ID
      const dataToSend = {
        ...formData,
        originalId: initialData?.id,
      };
      await onSave(dataToSend);
      // No need to reset here, useEffect handles it on next open
      // onClose(); // Close is handled externally after successful save + cache refresh typically
    } catch (saveError: any) {
      console.error("Error saving job category:", saveError);
      setError(saveError.message || "Failed to save job category.");
      toast.error(saveError.message || "Failed to save. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={onClose}>
        {/* Backdrop */}
        <TransitionChild
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
        </TransitionChild>

        {/* Modal Content */}
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
              <DialogPanel className="w-full max-w-md transform overflow-hidden rounded-2xl bg-white p-6 text-left align-middle shadow-xl transition-all">
                <DialogTitle
                  as="h3"
                  className="text-lg font-semibold leading-6 text-gray-900"
                >
                  {isEditMode ? "Edit Job Category" : "Add New Job Category"}
                </DialogTitle>
                <form onSubmit={handleSubmit} className="mt-4 space-y-4">
                  <FormInput
                    label="Job Category ID"
                    name="id"
                    value={formData.id}
                    onChange={handleChange}
                    required
                    disabled={isSaving} // Optionally disable ID edit for existing records: disabled={isEditMode || isSaving}
                    placeholder="e.g., JC001"
                  />
                  <FormInput
                    label="Category Name"
                    name="category"
                    value={formData.category}
                    onChange={handleChange}
                    required
                    disabled={isSaving}
                    placeholder="e.g., Senior Technician"
                  />
                  <FormListbox
                    label="Section"
                    name="section"
                    value={formData.section}
                    onChange={handleListboxChange("section")}
                    options={sections}
                    required
                    disabled={isSaving || loadingSections}
                    placeholder={
                      loadingSections ? "Loading..." : "Select Section"
                    }
                  />
                  <FormInput
                    label="Gaji"
                    name="gaji"
                    value={formData.gaji}
                    onChange={handleChange}
                    disabled={isSaving}
                    placeholder="Optional flag (e.g., Y/N)"
                  />
                  <FormInput
                    label="Ikut"
                    name="ikut"
                    value={formData.ikut}
                    onChange={handleChange}
                    disabled={isSaving}
                    placeholder="Optional flag (e.g., Y/N)"
                  />
                  <FormInput
                    label="JV"
                    name="jv"
                    value={formData.jv}
                    onChange={handleChange}
                    disabled={isSaving}
                    placeholder="Optional flag (e.g., Y/N)"
                  />

                  {error && (
                    <p className="text-sm text-red-600 text-center">{error}</p>
                  )}

                  <div className="mt-6 flex justify-end space-x-3">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={onClose}
                      disabled={isSaving}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      color="sky"
                      variant="filled"
                      disabled={isSaving || loadingSections}
                    >
                      {isSaving ? "Saving..." : "Save Category"}
                    </Button>
                  </div>
                </form>
              </DialogPanel>
            </TransitionChild>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
};

export default JobCategoryModal;
