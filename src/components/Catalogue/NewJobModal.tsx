// src/components/Catalogue/NewJobModal.tsx

"use client";

import React, { useState, Fragment, useEffect, useCallback } from "react";
import {
  Dialog,
  Transition,
  TransitionChild,
  Fieldset,
  Legend,
  Field,
  Label,
  Input,
  Combobox,
  ComboboxInput,
  ComboboxButton,
  ComboboxOptions,
  ComboboxOption,
  DialogPanel,
} from "@headlessui/react";
import clsx from "clsx";
import { IconCheck, IconChevronDown } from "@tabler/icons-react";
import { Job, SelectOption } from "../../types/types"; // Assuming SelectOption is defined in types
import { api } from "../../routes/utils/api";
import Button from "../Button"; // Assuming Button component exists
import toast from "react-hot-toast"; // For potential API errors

interface Section {
  id: string; // Usually corresponds to the name in this context based on usage
  name: string;
}

interface NewJobModalProps {
  isOpen: boolean;
  onClose: () => void;
  // Updated prop type: Expects ID to be included in the job data passed back
  onJobAdded: (job: Omit<Job, "newId">) => Promise<void>;
}

const NewJobModal: React.FC<NewJobModalProps> = ({
  isOpen,
  onClose,
  onJobAdded,
}) => {
  const [formData, setFormData] = useState<{
    id: string;
    name: string;
    section: string[];
  }>({
    id: "",
    name: "",
    section: [],
  });
  const [error, setError] = useState<string | null>(null); // Changed initial state to null
  const [sectionQuery, setSectionQuery] = useState("");
  const [sections, setSections] = useState<Section[]>([]);
  const [loadingSections, setLoadingSections] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const fetchSections = useCallback(async () => {
    setLoadingSections(true);
    setError(null); // Clear previous errors
    try {
      // Assuming api.get returns the data directly, cast the type after awaiting
      const response = await api.get("/api/sections");
      const data = response as Section[]; // Assert the type here
      // Ensure 'All Section' is not included if it comes from the API
      const filteredData = data.filter((s) => s.name !== "All Section");
      setSections(filteredData);
    } catch (error) {
      console.error("Error fetching sections:", error);
      setError("Failed to load sections. Cannot add job without sections.");
      toast.error("Failed to load sections");
    } finally {
      setLoadingSections(false);
    }
  }, []);

  // Fetch sections when modal opens or if it's already open and sections haven't loaded
  useEffect(() => {
    if (isOpen && sections.length === 0) {
      fetchSections();
    }
  }, [isOpen, sections.length, fetchSections]);

  // Reset form when modal closes
  useEffect(() => {
    if (!isOpen) {
      // Delay reset slightly to allow exit animation
      const timer = setTimeout(() => {
        setFormData({ id: "", name: "", section: [] });
        setSectionQuery("");
        setError(null);
        setIsSaving(false);
      }, 300); // Match animation duration
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  const filteredSections =
    sectionQuery === ""
      ? sections
      : sections.filter((section) =>
          section.name.toLowerCase().includes(sectionQuery.toLowerCase())
        );

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  // Handler for the sections combobox
  const handleSectionChange = (selectedNames: string[]) => {
    setFormData((prev) => ({
      ...prev,
      section: selectedNames, // Store array of names
    }));
  };

  const validateForm = (): boolean => {
    if (!formData.id.trim()) {
      setError("Job ID cannot be empty.");
      return false;
    }
    if (/\s/.test(formData.id.trim())) {
      setError("Job ID cannot contain spaces.");
      return false;
    }
    if (!formData.name.trim()) {
      setError("Job Name cannot be empty.");
      return false;
    }
    if (formData.section.length === 0) {
      setError("At least one Section must be selected.");
      return false;
    }
    setError(null);
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm() || isSaving || loadingSections) {
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      // Pass the complete formData (which now includes ID) to the parent
      await onJobAdded(formData);
      // onClose(); // Close is handled by the parent upon successful save
    } catch (error: any) {
      console.error("Error in onJobAdded:", error);
      setError(error.message || "Failed to add job");
      // No need for toast here, error is displayed in the modal
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog
        as="div"
        className="relative z-50"
        onClose={!isSaving ? onClose : () => {}}
      >
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
              {/* Updated DialogPanel structure and styling */}
              <DialogPanel className="w-full max-w-lg transform rounded-2xl bg-white p-6 text-left align-middle shadow-xl transition-all">
                <Dialog.Title
                  as="h3"
                  className="text-lg font-semibold leading-6 text-gray-900"
                >
                  Add New Job
                </Dialog.Title>
                <form onSubmit={handleSubmit} className="mt-4">
                  {/* Removed Fieldset, using div structure */}
                  <div className="space-y-4">
                    {/* ID Field */}
                    <Field>
                      <Label className="block text-sm font-medium text-default-700">
                        Job ID <span className="text-red-500">*</span>
                      </Label>
                      <Input
                        className={clsx(
                          "mt-1 block w-full rounded-lg border border-default-300 bg-white py-2 px-3 text-default-900 shadow-sm",
                          "focus:outline-none focus:ring-1 focus:ring-sky-500 focus:border-sky-500 sm:text-sm",
                          "disabled:bg-gray-100 disabled:cursor-not-allowed"
                        )}
                        name="id"
                        value={formData.id}
                        onChange={handleChange}
                        required
                        disabled={isSaving}
                        placeholder="e.g., LORRY01 (no spaces)"
                      />
                    </Field>
                    {/* Name Field */}
                    <Field>
                      <Label className="block text-sm font-medium text-default-700">
                        Job Name <span className="text-red-500">*</span>
                      </Label>
                      <Input
                        className={clsx(
                          "mt-1 block w-full rounded-lg border border-default-300 bg-white py-2 px-3 text-default-900 shadow-sm",
                          "focus:outline-none focus:ring-1 focus:ring-sky-500 focus:border-sky-500 sm:text-sm",
                          "disabled:bg-gray-100 disabled:cursor-not-allowed"
                        )}
                        name="name"
                        value={formData.name}
                        onChange={handleChange}
                        required
                        disabled={isSaving}
                        placeholder="e.g., Lorry Driver"
                      />
                    </Field>
                    {/* Section Field */}
                    <Field>
                      <Label className="block text-sm font-medium text-default-700">
                        Section(s) <span className="text-red-500">*</span>
                      </Label>
                      {/* Using FormCombobox structure directly */}
                      <Combobox
                        value={formData.section}
                        onChange={handleSectionChange}
                        multiple
                        disabled={isSaving || loadingSections}
                        name="section"
                      >
                        <div className="relative mt-1">
                          <div
                            className={clsx(
                              "relative w-full cursor-default overflow-hidden rounded-lg border border-default-300 bg-white text-left shadow-sm",
                              "focus-within:ring-1 focus-within:ring-sky-500 focus-within:border-sky-500",
                              isSaving || loadingSections ? "bg-gray-100" : ""
                            )}
                          >
                            <ComboboxInput
                              className={clsx(
                                "w-full border-none py-2 pl-3 pr-10 text-sm leading-5 text-gray-900 focus:ring-0",
                                isSaving || loadingSections
                                  ? "bg-gray-100 cursor-not-allowed"
                                  : ""
                              )}
                              displayValue={(selectedSections: string[]) =>
                                selectedSections.join(", ") ||
                                (loadingSections ? "Loading sections..." : "")
                              }
                              onChange={(event) =>
                                setSectionQuery(event.target.value)
                              }
                              placeholder={
                                loadingSections
                                  ? "Loading..."
                                  : "Select or search sections"
                              }
                              disabled={isSaving || loadingSections}
                            />
                            <ComboboxButton className="absolute inset-y-0 right-0 flex items-center pr-2">
                              <IconChevronDown
                                size={20}
                                className="text-gray-400"
                                aria-hidden="true"
                              />
                            </ComboboxButton>
                          </div>
                          <Transition
                            as={Fragment}
                            leave="transition ease-in duration-100"
                            leaveFrom="opacity-100"
                            leaveTo="opacity-0"
                            afterLeave={() => setSectionQuery("")}
                          >
                            <ComboboxOptions className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-md bg-white py-1 text-base shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none sm:text-sm">
                              {loadingSections ? (
                                <div className="relative cursor-default select-none py-2 px-4 text-gray-700">
                                  Loading...
                                </div>
                              ) : filteredSections.length === 0 &&
                                sectionQuery !== "" ? (
                                <div className="relative cursor-default select-none py-2 px-4 text-gray-700">
                                  No sections found.
                                </div>
                              ) : (
                                filteredSections.map((section) => (
                                  <ComboboxOption
                                    key={section.id} // Assuming section.id is unique (might be section.name if backend uses name as key)
                                    className={({ active }) =>
                                      `relative cursor-pointer select-none py-2 pl-10 pr-4 ${
                                        active
                                          ? "bg-sky-100 text-sky-900"
                                          : "text-gray-900"
                                      }`
                                    }
                                    value={section.name} // Value is the name string
                                  >
                                    {({ selected, active }) => (
                                      <>
                                        <span
                                          className={`block truncate ${
                                            selected
                                              ? "font-medium"
                                              : "font-normal"
                                          }`}
                                        >
                                          {section.name}
                                        </span>
                                        {selected ? (
                                          <span
                                            className={`absolute inset-y-0 left-0 flex items-center pl-3 ${
                                              active
                                                ? "text-sky-700"
                                                : "text-sky-600"
                                            }`}
                                          >
                                            <IconCheck
                                              size={20}
                                              aria-hidden="true"
                                            />
                                          </span>
                                        ) : null}
                                      </>
                                    )}
                                  </ComboboxOption>
                                ))
                              )}
                            </ComboboxOptions>
                          </Transition>
                        </div>
                      </Combobox>
                    </Field>
                  </div>{" "}
                  {/* End space-y-4 */}
                  {/* Error Display */}
                  {error && (
                    <p className="text-red-600 text-sm mt-3 text-center">
                      {error}
                    </p>
                  )}
                  {/* Action Buttons */}
                  <div className="mt-6 flex justify-end space-x-3">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={onClose}
                      disabled={isSaving} // Disable cancel during save
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      color="sky"
                      variant="filled"
                      disabled={isSaving || loadingSections} // Disable save if loading or saving
                    >
                      {isSaving ? "Adding..." : "Add Job"}
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

export default NewJobModal;
