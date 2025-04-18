// src/components/Catalogue/EditJobModal.tsx
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
import { Job, SelectOption } from "../../types/types";
import { FormInput, FormCombobox } from "../FormComponents"; // Use FormCombobox for sections
import Button from "../Button";

interface EditJobModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (job: Job & { newId?: string }) => Promise<void>; // Callback with job data
  initialData: Job | null; // Must have initial data for editing
}

const EditJobModal: React.FC<EditJobModalProps> = ({
  isOpen,
  onClose,
  onSave,
  initialData,
}) => {
  // Ensure section is always treated as an array of strings for the Combobox
  const normalizeInitialData = (data: Job | null): Job => {
    // Define base data based on Job properties, excluding transient ones like newId
    const baseData: Omit<Job, "newId"> = { id: "", name: "", section: [] }; // Assuming Job might incorrectly contain newId, exclude it. Or define known fields.
    if (!data) return baseData as Job; // Return default structure if no initial data
    return {
      ...(baseData as Job), // Cast baseData back to Job type for spreading
      ...data,
      section: Array.isArray(data.section)
        ? data.section
        : data.section
        ? [data.section]
        : [],
    };
  };

  const [formData, setFormData] = useState<Job>(
    normalizeInitialData(initialData)
  );
  const [sections, setSections] = useState<SelectOption[]>([]);
  const [sectionQuery, setSectionQuery] = useState("");
  const [loadingSections, setLoadingSections] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSections = useCallback(async () => {
    setLoadingSections(true);
    try {
      const data = (await api.get("/api/sections")) as {
        id: string;
        name: string;
      }[];
      // Filter out "All Section" if present
      const filteredData = data.filter((s) => s.name !== "All Section");
      setSections(
        filteredData.map((section) => ({
          id: section.name, // Using name as ID for combobox value consistency
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
      if (initialData) {
        setFormData(normalizeInitialData(initialData));
      } else {
        // This modal should ideally not open without initialData
        console.warn("EditJobModal opened without initial data.");
        onClose(); // Close if no data
        return;
      }
      fetchSections();
      setSectionQuery("");
      setError(null);
      setIsSaving(false);
    }
  }, [isOpen, initialData, fetchSections, onClose]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSectionChange = (
    selectedSectionNames: string | string[] | null
  ) => {
    // FormCombobox returns array for multiple, string/null for single. Ensure it's always array.
    const sectionsArray = Array.isArray(selectedSectionNames)
      ? selectedSectionNames
      : selectedSectionNames
      ? [selectedSectionNames]
      : [];
    setFormData((prev) => ({
      ...prev,
      section: sectionsArray,
    }));
  };

  const validateForm = (): boolean => {
    if (!formData.id.trim()) {
      setError("Job ID cannot be empty.");
      return false;
    }
    if (!formData.name.trim()) {
      setError("Job Name cannot be empty.");
      return false;
    }
    if (!formData.section || formData.section.length === 0) {
      setError("At least one Section must be selected.");
      return false;
    }
    setError(null);
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm() || isSaving || !initialData) {
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      const dataToSend: Job = {
        // Ensure the object conforms to the Job type
        ...formData,
        // If the ID changed, use the new ID as newId.
        // Otherwise, keep the existing newId from formData (assuming Job requires newId: string).
        newId: formData.id !== initialData.id ? formData.id : formData.newId,
      };
      // Pass the object conforming to Job, which also satisfies Job & { newId?: string }
      await onSave(dataToSend);
      // onClose(); // Close handled externally
    } catch (saveError: any) {
      console.error("Error saving job:", saveError);
      setError(saveError.message || "Failed to save job.");
      toast.error(saveError.message || "Failed to save. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  // This check prevents rendering if initialData somehow becomes null after mount but before close
  if (!initialData && isOpen) {
    return null;
  }

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
              <DialogPanel className="w-full max-w-lg transform overflow-hidden rounded-2xl bg-white p-6 text-left align-middle shadow-xl transition-all">
                <DialogTitle
                  as="h3"
                  className="text-lg font-semibold leading-6 text-gray-900"
                >
                  Edit Job Information
                </DialogTitle>
                <form onSubmit={handleSubmit} className="mt-4 space-y-4">
                  <FormInput
                    label="Job ID"
                    name="id"
                    value={formData.id}
                    onChange={handleChange}
                    required
                    disabled={isSaving}
                    placeholder="Unique Job ID"
                  />
                  <FormInput
                    label="Job Name"
                    name="name"
                    value={formData.name}
                    onChange={handleChange}
                    required
                    disabled={isSaving}
                    placeholder="e.g., Lorry Driver"
                  />
                  <FormCombobox
                    label="Section(s)"
                    name="section"
                    value={formData.section} // Pass array of names
                    onChange={handleSectionChange}
                    options={sections}
                    query={sectionQuery}
                    setQuery={setSectionQuery}
                    mode="multiple" // Explicitly multiple
                    required
                    disabled={isSaving || loadingSections}
                    placeholder={
                      loadingSections ? "Loading..." : "Select section(s)"
                    }
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
                      {isSaving ? "Saving..." : "Save Changes"}
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

export default EditJobModal;
