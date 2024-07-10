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
  Listbox,
  Combobox,
  ComboboxInput,
  ComboboxButton,
  ComboboxOptions,
  ComboboxOption,
  ListboxButton,
  ListboxOptions,
  ListboxOption,
  DialogPanel,
} from "@headlessui/react";
import clsx from "clsx";

interface NewWorkerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (worker: any) => void;
}

const genders = ["Male", "Female"];
const paymentTypes = ["Delivery", "M", "Cash"];
const jobs = [
  "Giling Beras",
  "Mesin Depan",
  "Foreman Mee",
  "Packing Mee",
  "Office",
];

const NewStaffModal: React.FC<NewWorkerModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
}) => {
  const [formData, setFormData] = useState({
    id: "",
    name: "",
    section: "",
    job: [] as string[],
    description: "",
    location: "",
    gender: genders[0],
    payment_type: paymentTypes[0],
  });

  const [query, setQuery] = useState("");

  const filteredJobs =
    query === ""
      ? jobs
      : jobs.filter((job) => job.toLowerCase().includes(query.toLowerCase()));

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
      const response = await fetch("http://localhost:5000/api/staff", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        throw new Error("Failed to submit form");
      }

      const result = await response.json();
      console.log(result.message);
      onSubmit(formData);
      onClose();
    } catch (error) {
      console.error(error);
      // Handle error (e.g., display an error message)
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
                      Staff Entry
                    </Legend>
                    <Field>
                      <Label className=" font-medium text-gray-900">
                        Staff ID
                      </Label>
                      <Input
                        className={clsx(
                          "mt-3 block w-full rounded-lg border border-gray-300 bg-white py-2 px-4  text-gray-900",
                          "focus:outline-none focus:border-sky-300"
                        )}
                        name="id"
                        value={formData.id}
                        onChange={handleChange}
                        required
                      />
                    </Field>
                    <div className="flex w-full">
                      <Field className="w-2/3 mr-2">
                        <Label className=" font-medium text-gray-900">
                          Staff Name
                        </Label>
                        <Input
                          className={clsx(
                            "mt-3 block w-full rounded-lg border border-gray-300 bg-white py-2 px-4 text-gray-900",
                            "focus:outline-none focus:border-sky-300"
                          )}
                          name="name"
                          value={formData.name}
                          onChange={handleChange}
                          required
                        />
                      </Field>
                      <Field className="w-1/3">
                        <Label className=" font-medium text-gray-900">
                          Gender
                        </Label>
                        <Listbox
                          value={formData.gender}
                          onChange={(value) =>
                            setFormData((prev) => ({
                              ...prev,
                              gender: value,
                            }))
                          }
                        >
                          {({ open }) => (
                            <div className="relative mt-3">
                              <ListboxButton
                                className={`relative w-full cursor-default rounded-lg border border-gray-300 bg-white py-2 pl-4 pr-10 text-left focus:outline-none focus:border-sky-300`}
                              >
                                <span className="block truncate">
                                  {formData.gender}
                                </span>
                              </ListboxButton>
                              <Transition
                                show={open}
                                as={Fragment}
                                leave="transition ease-in duration-100"
                                leaveFrom="opacity-100"
                                leaveTo="opacity-0"
                              >
                                <ListboxOptions
                                  static
                                  className="absolute z-10 w-full p-1 mt-11 border bg-white max-h-60 rounded-lg overflow-auto focus:outline-none"
                                >
                                  {genders.map((gender, index) => (
                                    <ListboxOption
                                      key={index}
                                      className={`relative cursor-pointer select-none rounded py-2 pl-4 pr-4 text-gray-900 data-[focus]:bg-sky-100 data-[focus]:text-sky-900`}
                                      value={gender}
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
                                            {gender}
                                          </span>
                                          {selected && (
                                            <span className="absolute inset-y-0 right-0 flex items-center pr-3 text-sky-600">
                                              <svg
                                                xmlns="http://www.w3.org/2000/svg"
                                                width="22"
                                                height="22"
                                                viewBox="0 0 24 24"
                                                fill="none"
                                                stroke="currentColor"
                                                strokeWidth="2"
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                                className="icon icon-tabler icons-tabler-outline icon-tabler-check"
                                              >
                                                <path
                                                  stroke="none"
                                                  d="M0 0h24v24H0z"
                                                  fill="none"
                                                />
                                                <path d="M5 12l5 5l10 -10" />
                                              </svg>
                                            </span>
                                          )}
                                        </>
                                      )}
                                    </ListboxOption>
                                  ))}
                                </ListboxOptions>
                              </Transition>
                            </div>
                          )}
                        </Listbox>
                      </Field>
                    </div>
                    <Field className="w-full mr-2">
                      <Label className=" font-medium text-gray-900">Job</Label>
                      <Combobox
                        multiple
                        value={formData.job}
                        onChange={(value) =>
                          setFormData((prev) => ({
                            ...prev,
                            job: value,
                          }))
                        }
                      >
                        {({ open }) => (
                          <div className="relative mt-3">
                            <ComboboxInput
                              className={clsx(
                                "mt-3 block w-full rounded-lg border border-gray-300 bg-white py-2 pl-3 pr-10 text-gray-900",
                                "focus:outline-none focus:border-sky-300"
                              )}
                              displayValue={() => formData.job.join(", ")}
                              onChange={(event) => setQuery(event.target.value)}
                            />
                            <ComboboxButton className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-500">
                              <svg
                                xmlns="http://www.w3.org/2000/svg"
                                width="22"
                                height="22"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                className="icon icon-tabler icons-tabler-outline icon-tabler-chevron-down"
                              >
                                <path
                                  stroke="none"
                                  d="M0 0h24v24H0z"
                                  fill="none"
                                />
                                <path d="M6 9l6 6 6-6" />
                              </svg>
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
                                {filteredJobs.map((job, index) => (
                                  <ComboboxOption
                                    key={index}
                                    className={`relative cursor-pointer select-none rounded py-2 pl-4 pr-4 text-gray-900 data-[focus]:bg-sky-100 data-[focus]:text-sky-900`}
                                    value={job}
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
                                          {job}
                                        </span>
                                        {selected && (
                                          <span className="absolute inset-y-0 right-0 flex items-center pr-3 text-sky-600">
                                            <svg
                                              xmlns="http://www.w3.org/2000/svg"
                                              width="22"
                                              height="22"
                                              viewBox="0 0 24 24"
                                              fill="none"
                                              stroke="currentColor"
                                              strokeWidth="2"
                                              strokeLinecap="round"
                                              strokeLinejoin="round"
                                              className="icon icon-tabler icons-tabler-outline icon-tabler-check"
                                            >
                                              <path
                                                stroke="none"
                                                d="M0 0h24v24H0z"
                                                fill="none"
                                              />
                                              <path d="M5 12l5 5 10-10" />
                                            </svg>
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
                    <div className="flex w-full">
                      <Field className="w-1/2">
                        <Label className=" font-medium text-gray-900">
                          Section
                        </Label>
                        <Input
                          className={clsx(
                            "mt-3 block w-full rounded-lg border border-gray-300 bg-white py-2 px-4 text-gray-900",
                            "focus:outline-none focus:border-sky-300"
                          )}
                          name="section"
                          value={formData.section}
                          onChange={handleChange}
                          disabled
                        />
                      </Field>
                      <div className="mx-1"></div>
                      <Field className="w-1/2">
                        <Label className="font-medium text-gray-900">
                          Location
                        </Label>
                        <Input
                          className={clsx(
                            "mt-3 block w-full rounded-lg border border-gray-300 bg-white py-2 px-4 text-gray-900",
                            "focus:outline-none focus:border-sky-300"
                          )}
                          name="location"
                          value={formData.location}
                          onChange={handleChange}
                          disabled
                        />
                      </Field>
                    </div>
                    <Field>
                      <Label className="font-medium text-gray-900">
                        Description
                      </Label>
                      <Input
                        className={clsx(
                          "mt-3 block w-full rounded-lg border border-gray-300 bg-white py-2 px-4 text-gray-900",
                          "focus:outline-none focus:border-sky-300"
                        )}
                        name="description"
                        value={formData.description}
                        onChange={handleChange}
                        required
                      />
                    </Field>
                    <Field>
                      <Label className="font-medium text-gray-900">
                        Payment Type
                      </Label>
                      <Listbox
                        value={formData.payment_type}
                        onChange={(value) =>
                          setFormData((prev) => ({
                            ...prev,
                            payment_type: value,
                          }))
                        }
                      >
                        {({ open }) => (
                          <div className="relative mt-3">
                            <ListboxButton
                              className={`relative w-full cursor-default rounded-lg border border-gray-300 bg-white py-2 pl-4 pr-10 text-left focus:outline-none focus:border-sky-300`}
                            >
                              <span className="block truncate">
                                {formData.payment_type}
                              </span>
                            </ListboxButton>
                            <Transition
                              show={open}
                              as={Fragment}
                              leave="transition ease-in duration-100"
                              leaveFrom="opacity-100"
                              leaveTo="opacity-0"
                            >
                              <ListboxOptions
                                static
                                className="absolute z-10 w-full p-1 mt-11 border bg-white max-h-60 rounded-lg overflow-auto focus:outline-none"
                              >
                                {paymentTypes.map((type, index) => (
                                  <ListboxOption
                                    key={index}
                                    className={({ active }) =>
                                      `relative cursor-pointer select-none rounded py-2 pl-6 pr-4 ${
                                        active
                                          ? "bg-sky-100 text-sky-900"
                                          : "text-gray-900"
                                      }`
                                    }
                                    value={type}
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
                                          {type}
                                        </span>
                                        {selected && (
                                          <span className="absolute inset-y-0 right-0 flex items-center pr-3 text-sky-600">
                                            <svg
                                              xmlns="http://www.w3.org/2000/svg"
                                              width="22"
                                              height="22"
                                              viewBox="0 0 24 24"
                                              fill="none"
                                              stroke="currentColor"
                                              strokeWidth="2"
                                              strokeLinecap="round"
                                              strokeLinejoin="round"
                                              className="icon icon-tabler icons-tabler-outline icon-tabler-check"
                                            >
                                              <path
                                                stroke="none"
                                                d="M0 0h24v24H0z"
                                                fill="none"
                                              />
                                              <path d="M5 12l5 5l10 -10" />
                                            </svg>
                                          </span>
                                        )}
                                      </>
                                    )}
                                  </ListboxOption>
                                ))}
                              </ListboxOptions>
                            </Transition>
                          </div>
                        )}
                      </Listbox>
                    </Field>
                    <div className="!mt-6 flex justify-end">
                      <button
                        type="button"
                        onClick={onClose}
                        className="mr-2 px-6 py-3 text-sm font-medium text-gray-7 00 bg-gray-200 rounded-full hover:bg-gray-300/80 active:bg-gray-300 focus:outline-none"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="px-6 py-3 text-sm font-medium text-white bg-sky-500 rounded-full hover:bg-sky-600/80 active:bg-sky-600 focus:outline-none"
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
  );
};

export default NewStaffModal;
