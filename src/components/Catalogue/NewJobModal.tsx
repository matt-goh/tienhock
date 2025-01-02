"use client";

import React, { useState, Fragment, useEffect } from "react";
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
import { Job } from "../../types/types";
import { api } from "../../routes/utils/api";

interface Section {
  id: string;
  name: string;
}

interface NewJobModalProps {
  isOpen: boolean;
  onClose: () => void;
  onJobAdded: (job: Omit<Job, "id">) => Promise<void>;
}

const NewJobModal: React.FC<NewJobModalProps> = ({
  isOpen,
  onClose,
  onJobAdded,
}) => {
  const [formData, setFormData] = useState({
    id: "",
    name: "",
    section: [] as string[],
    newId: "",
  });
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [sections, setSections] = useState<Section[]>([]);

  useEffect(() => {
    if (!isOpen) {
      setFormData({ id: "", name: "", section: [], newId: "" });
      setQuery("");
      setError("");
    }
  }, [isOpen]);

  useEffect(() => {
    fetchSections();
  }, []);

  const fetchSections = async () => {
    try {
      const data = await api.get("/api/sections");
      setSections(data);
    } catch (error) {
      console.error("Error fetching sections:", error);
      setError("Failed to load sections");
    }
  };

  const filteredSections =
    query === ""
      ? sections
      : sections.filter((section) =>
          section.name.toLowerCase().includes(query.toLowerCase())
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    try {
      await onJobAdded(formData);
      setTimeout(() => onClose, 0);
    } catch (error) {
      console.error("Error:", error);
      setError((error as Error).message || "Failed to add job");
    }
  };

  return (
    <>
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
            <div className="fixed inset-0 bg-black bg-opacity-25" />
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
                <DialogPanel className="text-left align-middle shadow-xl w-full max-w-lg">
                  <form onSubmit={handleSubmit} className="">
                    <Fieldset className="transform space-y-4 rounded-xl bg-white p-8 transition-all">
                      <Legend className="text-lg font-bold text-default-900">
                        Job Entry
                      </Legend>
                      <Field>
                        <Label className="font-medium text-default-900">
                          ID
                        </Label>
                        <Input
                          className={clsx(
                            "mt-3 block w-full rounded-lg border border-default-300 bg-white py-2 px-4 text-default-900",
                            "focus:outline-none focus:border-default-500"
                          )}
                          name="id"
                          value={formData.id}
                          onChange={handleChange}
                          required
                        />
                      </Field>
                      <Field>
                        <Label className="font-medium text-default-900">
                          Name
                        </Label>
                        <Input
                          className={clsx(
                            "mt-3 block w-full rounded-lg border border-default-300 bg-white py-2 px-4 text-default-900",
                            "focus:outline-none focus:border-default-500"
                          )}
                          name="name"
                          value={formData.name}
                          onChange={handleChange}
                          required
                        />
                      </Field>
                      <Field>
                        <Label className="font-medium text-default-900">
                          Section
                        </Label>
                        <Combobox
                          multiple
                          value={formData.section}
                          onChange={(value) =>
                            setFormData((prev) => ({
                              ...prev,
                              section: value,
                            }))
                          }
                        >
                          {({ open }) => (
                            <div className="relative mt-3">
                              <ComboboxInput
                                className={clsx(
                                  "mt-3 block w-full rounded-lg border border-default-300 bg-white py-2 pl-3 pr-10 text-default-900",
                                  "focus:outline-none focus:border-default-500"
                                )}
                                displayValue={(sections: string[]) =>
                                  sections.join(", ")
                                }
                                onChange={(event) =>
                                  setQuery(event.target.value)
                                }
                              />
                              <ComboboxButton className="absolute inset-y-0 right-0 flex items-center pr-3 text-default-500">
                                <IconChevronDown stroke={2} size={22} />
                              </ComboboxButton>
                              <Transition
                                show={open}
                                as={Fragment}
                                leave="transition ease-in duration-100"
                                leaveFrom="opacity-100"
                                leaveTo="opacity-0"
                              >
                                <ComboboxOptions
                                  static
                                  className="absolute z-10 w-full p-1 mt-1 border bg-white max-h-60 rounded-lg overflow-auto focus:outline-none"
                                >
                                  {filteredSections.length === 0 &&
                                  query !== "" ? (
                                    <div className="relative cursor-default select-none py-2 px-4 text-default-700">
                                      No sections found.
                                    </div>
                                  ) : (
                                    filteredSections.map((section) => (
                                      <ComboboxOption
                                        key={section.id}
                                        className={`relative cursor-pointer select-none rounded py-2 px-4 text-default-900 hover:bg-default-100 active:bg-default-200 transition-all duration-200`}
                                        value={section.name}
                                      >
                                        {({ selected }) => (
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
                                            {selected && (
                                              <span className="absolute inset-y-0 right-0 flex items-center pr-3 text-default-600">
                                                <IconCheck
                                                  stroke={2}
                                                  size={22}
                                                />
                                              </span>
                                            )}
                                          </>
                                        )}
                                      </ComboboxOption>
                                    ))
                                  )}
                                </ComboboxOptions>
                              </Transition>
                            </div>
                          )}
                        </Combobox>
                      </Field>
                      {error && (
                        <p className="text-red-500 text-sm mt-2">{error}</p>
                      )}
                      <div className="!mt-6 flex justify-end">
                        <button
                          type="button"
                          onClick={onClose}
                          className="mr-2 px-6 py-3 text-sm font-medium text-default-700 bg-default-200 rounded-full hover:bg-default-300/75 active:bg-default-300 focus:outline-none"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          className="px-6 py-3 text-sm font-medium text-white bg-default-500 rounded-full hover:bg-default-600/90 active:bg-default-600 focus:outline-none"
                        >
                          Submit
                        </button>
                      </div>
                    </Fieldset>
                  </form>
                </DialogPanel>
              </TransitionChild>
            </div>
          </div>
        </Dialog>
      </Transition>
    </>
  );
};

export default NewJobModal;
