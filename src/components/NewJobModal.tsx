"use client";

import React, { useState, Fragment } from "react";
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

const sections = ["Section A", "Section B", "Section C"];

interface NewJobModalProps {
  onJobAdded: () => void;
}

const NewJobModal: React.FC<NewJobModalProps> = ({ onJobAdded }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState({
    id: "",
    name: "",
    section: [] as string[],
  });

  const [query, setQuery] = useState("");

  const filteredSections =
    query === ""
      ? sections
      : sections.filter((section) =>
          section.toLowerCase().includes(query.toLowerCase())
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

    try {
      const response = await fetch("http://localhost:5000/api/jobs", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to submit form");
      }

      const result = await response.json();
      console.log(result.message);
      setIsModalOpen(false);
      setFormData({
        id: "",
        name: "",
        section: [],
      });
      onJobAdded(); // Call this function to refresh the job list
    } catch (error) {
      console.error("Error:", error);
      // Handle error (e.g., display an error message to the user)
    }
  };

  return (
    <>
      <button
        onClick={() => setIsModalOpen(true)}
        className="px-4 py-2 border border-gray-300 hover:bg-gray-100 active:bg-gray-200 font-medium rounded-full focus:outline-none"
      >
        Add job
      </button>
      <Transition appear show={isModalOpen} as={Fragment}>
        <Dialog
          as="div"
          className="relative z-50"
          onClose={() => setIsModalOpen(false)}
        >
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
                    <Fieldset className="transform bg-white space-y-4 rounded-xl bg-white p-8 transition-all">
                      <Legend className="text-lg font-bold text-gray-900">
                        Job Entry
                      </Legend>
                      <Field>
                        <Label className="font-medium text-gray-900">ID</Label>
                        <Input
                          className={clsx(
                            "mt-3 block w-full rounded-lg border border-gray-300 bg-white py-2 px-4 text-gray-900",
                            "focus:outline-none focus:border-gray-400"
                          )}
                          name="id"
                          value={formData.id}
                          onChange={handleChange}
                          required
                        />
                      </Field>
                      <Field>
                        <Label className="font-medium text-gray-900">
                          Name
                        </Label>
                        <Input
                          className={clsx(
                            "mt-3 block w-full rounded-lg border border-gray-300 bg-white py-2 px-4 text-gray-900",
                            "focus:outline-none focus:border-gray-400"
                          )}
                          name="name"
                          value={formData.name}
                          onChange={handleChange}
                          required
                        />
                      </Field>
                      <Field>
                        <Label className="font-medium text-gray-900">
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
                                  "mt-3 block w-full rounded-lg border border-gray-300 bg-white py-2 pl-3 pr-10 text-gray-900",
                                  "focus:outline-none focus:border-gray-400"
                                )}
                                displayValue={(sections: string[]) =>
                                  sections.join(", ")
                                }
                                onChange={(event) =>
                                  setQuery(event.target.value)
                                }
                              />
                              <ComboboxButton className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-500">
                                <IconChevronDown
                                  stroke={2}
                                  width="22"
                                  height="22"
                                />
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
                                  {filteredSections.map((section, index) => (
                                    <ComboboxOption
                                      key={index}
                                      className={`relative cursor-pointer select-none rounded py-2 pl-4 pr-4 text-gray-900 data-[focus]:bg-gray-100 data-[focus]:text-gray-900`}
                                      value={section}
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
                                            {section}
                                          </span>
                                          {selected && (
                                            <span className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-600">
                                              <IconCheck
                                                stroke={2}
                                                width="22"
                                                height="22"
                                              />
                                            </span>
                                          )}
                                        </>
                                      )}
                                    </ComboboxOption>
                                  ))}
                                </ComboboxOptions>
                              </Transition>
                            </div>
                          )}
                        </Combobox>
                      </Field>
                      <div className="!mt-6 flex justify-end">
                        <button
                          type="button"
                          onClick={() => setIsModalOpen(false)}
                          className="mr-2 px-6 py-3 text-sm font-medium text-gray-700 bg-gray-200 rounded-full hover:bg-gray-300/75 active:bg-gray-300 focus:outline-none"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          className="px-6 py-3 text-sm font-medium text-white bg-gray-500 rounded-full hover:bg-gray-600/90 active:bg-gray-600 focus:outline-none"
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
