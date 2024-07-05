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
  Description,
  DialogPanel,
  DialogTitle,
} from "@headlessui/react";
import clsx from "clsx";

interface NewWorkerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (worker: any) => void;
}

const NewStaffModal: React.FC<NewWorkerModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
}) => {
  const [formData, setFormData] = useState({
    staff_id: "",
    staff_name: "",
    work_location: "",
    department: "",
    job_description: "",
    gender: "",
    payment_type: "",
    kerja: "",
  });

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
    onClose();
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
                    <Legend className="text-lg font-semibold text-gray-900">
                      Staff Entry
                    </Legend>
                    <Field>
                      <Label className="text-sm/6 font-medium text-gray-900">
                        Staff ID
                      </Label>
                      <Input
                        className={clsx(
                          "mt-3 block w-full rounded-lg border border-gray-300 bg-white/5 py-1.5 px-3 text-sm/6 text-gray-900",
                          "focus:outline-none focus:border-blue-300"
                        )}
                        name="staff_id"
                        value={formData.staff_id}
                        onChange={handleChange}
                        required
                      />
                    </Field>
                    <Field>
                      <Label className="text-sm/6 font-medium text-gray-900">
                        Staff Name
                      </Label>
                      <Input
                        className={clsx(
                          "mt-3 block w-full rounded-lg border border-gray-300 bg-white/5 py-1.5 px-3 text-sm/6 text-gray-900",
                          "focus:outline-none focus:border-blue-300"
                        )}
                        name="staff_name"
                        value={formData.staff_name}
                        onChange={handleChange}
                        required
                      />
                    </Field>
                    <Field>
                      <Label className="text-sm/6 font-medium text-gray-900">
                        Gender
                      </Label>
                      <Input
                        className={clsx(
                          "mt-3 block w-full rounded-lg border border-gray-300 bg-white/5 py-1.5 px-3 text-sm/6 text-gray-900",
                          "focus:outline-none focus:border-blue-300"
                        )}
                        name="gender"
                        value={formData.gender}
                        onChange={handleChange}
                        required
                      />
                    </Field>
                    <Field>
                      <Label className="text-sm/6 font-medium text-gray-900">
                        Work Location
                      </Label>
                      <Input
                        className={clsx(
                          "mt-3 block w-full rounded-lg border border-gray-300 bg-white/5 py-1.5 px-3 text-sm/6 text-gray-900",
                          "focus:outline-none focus:border-blue-300"
                        )}
                        name="work_location"
                        value={formData.work_location}
                        onChange={handleChange}
                        required
                      />
                    </Field>
                    <Field>
                      <Label className="text-sm/6 font-medium text-gray-900">
                        Department
                      </Label>
                      <Input
                        className={clsx(
                          "mt-3 block w-full rounded-lg border border-gray-300 bg-white/5 py-1.5 px-3 text-sm/6 text-gray-900",
                          "focus:outline-none focus:border-blue-300"
                        )}
                        name="department"
                        value={formData.department}
                        onChange={handleChange}
                        required
                      />
                    </Field>
                    <Field>
                      <Label className="text-sm/6 font-medium text-gray-900">
                        Job Description
                      </Label>
                      <Input
                        className={clsx(
                          "mt-3 block w-full rounded-lg border border-gray-300 bg-white/5 py-1.5 px-3 text-sm/6 text-gray-900",
                          "focus:outline-none focus:border-blue-300"
                        )}
                        name="job_description"
                        value={formData.job_description}
                        onChange={handleChange}
                        required
                      />
                    </Field>
                    <Field>
                      <Label className="text-sm/6 font-medium text-gray-900">
                        Payment Type
                      </Label>
                      <Input
                        className={clsx(
                          "mt-3 block w-full rounded-lg border border-gray-300 bg-white/5 py-1.5 px-3 text-sm/6 text-gray-900",
                          "focus:outline-none focus:border-blue-300"
                        )}
                        name="payment_type"
                        value={formData.payment_type}
                        onChange={handleChange}
                        required
                      />
                    </Field>
                    <Field>
                      <Label className="text-sm/6 font-medium text-gray-900">
                        Kerja
                      </Label>
                      <Input
                        className={clsx(
                          "mt-3 block w-full rounded-lg border border-gray-300 bg-white/5 py-1.5 px-3 text-sm/6 text-gray-900",
                          "focus:outline-none focus:border-blue-300"
                        )}
                        name="kerja"
                        value={formData.kerja}
                        onChange={handleChange}
                        required
                      />
                    </Field>
                  <div className="mt-4 flex justify-end">
                    <button
                      type="button"
                      onClick={onClose}
                      className="mr-2 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-200 rounded-md hover:bg-gray-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
                    >
                      Cancel  
                    </button>
                    <button
                      type="submit"
                      className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
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
