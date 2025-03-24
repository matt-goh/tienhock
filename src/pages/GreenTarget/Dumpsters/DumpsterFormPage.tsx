// src/pages/GreenTarget/Dumpsters/DumpsterFormPage.tsx
import React, { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import toast from "react-hot-toast";
import ConfirmationDialog from "../../../components/ConfirmationDialog";
import BackButton from "../../../components/BackButton";
import Button from "../../../components/Button";
import { greenTargetApi } from "../../../routes/greentarget/api";
import LoadingSpinner from "../../../components/LoadingSpinner";
import {
  Listbox,
  ListboxButton,
  ListboxOption,
  ListboxOptions,
} from "@headlessui/react";
import { IconChevronDown, IconCheck } from "@tabler/icons-react";

interface Dumpster {
  tong_no: string;
  status: "Available" | "Rented" | "Maintenance";
}

const DumpsterFormPage: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isEditMode = !!id;

  const [formData, setFormData] = useState<Dumpster>({
    tong_no: "",
    status: "Available",
  });

  const [initialFormData, setInitialFormData] = useState<Dumpster>({
    tong_no: "",
    status: "Available",
  });

  const [isFormChanged, setIsFormChanged] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showBackConfirmation, setShowBackConfirmation] = useState(false);
  const [loading, setLoading] = useState(isEditMode);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isEditMode && id) {
      fetchDumpsterDetails(id);
    }
  }, [id, isEditMode]);

  useEffect(() => {
    console.log(formData);
  }, [formData]);

  useEffect(() => {
    const hasChanged =
      JSON.stringify(formData) !== JSON.stringify(initialFormData);
    setIsFormChanged(hasChanged);
  }, [formData, initialFormData]);

  const fetchDumpsterDetails = async (dumpsterId: string) => {
    try {
      setLoading(true);
      const dumpsters = await greenTargetApi.getDumpsters();
      const dumpster = dumpsters.find(
        (d: Dumpster) => d.tong_no === dumpsterId
      );

      if (!dumpster) {
        throw new Error("Dumpster not found");
      }

      setFormData({
        tong_no: dumpster.tong_no,
        status: dumpster.status,
      });

      setInitialFormData({
        tong_no: dumpster.tong_no,
        status: dumpster.status,
      });

      setError(null);
    } catch (err) {
      setError("Failed to fetch dumpster details. Please try again later.");
      console.error("Error fetching dumpster details:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleBackClick = () => {
    if (isFormChanged) {
      setShowBackConfirmation(true);
    } else {
      navigate("/greentarget/dumpsters");
    }
  };

  const handleConfirmBack = () => {
    setShowBackConfirmation(false);
    navigate("/greentarget/dumpsters");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.tong_no) {
      toast.error("Dumpster number is required");
      return;
    }

    setIsSaving(true);

    try {
      if (isEditMode) {
        // Update existing dumpster
        await greenTargetApi.updateDumpster(id!, {
          status: formData.status,
        });
        toast.success("Dumpster updated successfully!");
      } else {
        // Create new dumpster
        await greenTargetApi.createDumpster({
          tong_no: formData.tong_no,
          status: formData.status,
        });
        toast.success("Dumpster created successfully!");
      }
      navigate("/greentarget/dumpsters");
    } catch (error: any) {
      if (error.message && error.message.includes("already exists")) {
        toast.error("A dumpster with this number already exists");
      } else {
        toast.error("An unexpected error occurred.");
      }
    } finally {
      setIsSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="mt-40 w-full flex items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  if (error) {
    return <div>Error: {error}</div>;
  }

  return (
    <div className="container mx-auto px-4">
      <BackButton onClick={handleBackClick} className="ml-5" />
      <div className="bg-white rounded-lg">
        <div className="pl-6">
          <h1 className="text-xl font-semibold text-default-900">
            {isEditMode ? "Edit Dumpster" : "Add New Dumpster"}
          </h1>
          <p className="mt-1 text-sm text-default-500">
            {isEditMode
              ? 'Edit dumpster details here. Click "Save" when you\'re done.'
              : 'Enter new dumpster details here. Click "Save" when you\'re done.'}
          </p>
        </div>
        <form onSubmit={handleSubmit} className="p-6">
          <div className="space-y-6">
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              <div className="space-y-2">
                <label
                  htmlFor="tong_no"
                  className="text-sm font-medium text-default-700"
                >
                  Dumpster Number
                </label>
                <input
                  type="text"
                  id="tong_no"
                  name="tong_no"
                  value={formData.tong_no}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      tong_no: e.target.value,
                    }))
                  }
                  disabled={isEditMode}
                  className="w-full px-3 py-2 border border-default-300 rounded-lg focus:outline-none focus:border-default-500 disabled:bg-default-50"
                />
              </div>

              <div className="w-full">
                <label
                  htmlFor="status"
                  className="text-sm font-medium text-default-700"
                >
                  Status
                </label>
                <div className="mt-2">
                  <Listbox
                    value={formData.status}
                    onChange={(newStatus) =>
                      setFormData((prev) => ({
                        ...prev,
                        status: newStatus,
                      }))
                    }
                    disabled={isEditMode && formData.status === "Rented"}
                  >
                    <div className="relative">
                      <ListboxButton className="w-full rounded-lg border border-default-300 bg-white py-2 pl-3 pr-10 text-left focus:outline-none focus:border-default-500 disabled:bg-default-50">
                        <span className="block truncate">
                          {formData.status.charAt(0).toUpperCase() +
                            formData.status.slice(1)}
                        </span>
                        <span className="absolute inset-y-0 right-0 flex items-center pr-4 pointer-events-none">
                          <IconChevronDown
                            className="h-5 w-5 text-default-400"
                            aria-hidden="true"
                          />
                        </span>
                      </ListboxButton>
                      <ListboxOptions className="absolute z-10 w-full p-1 mt-1 border bg-white max-h-60 rounded-lg overflow-auto focus:outline-none shadow-lg">
                        <ListboxOption
                          className={({ active }) =>
                            `relative cursor-pointer select-none rounded py-2 pl-3 pr-9 ${
                              active
                                ? "bg-default-100 text-default-900"
                                : "text-default-900"
                            }`
                          }
                          value="Available"
                        >
                          {({ selected }) => (
                            <>
                              <span
                                className={`block truncate ${
                                  selected ? "font-medium" : "font-normal"
                                }`}
                              >
                                Available
                              </span>
                              {selected && (
                                <span className="absolute inset-y-0 right-0 flex items-center pr-3 text-default-600">
                                  <IconCheck
                                    className="h-5 w-5"
                                    aria-hidden="true"
                                  />
                                </span>
                              )}
                            </>
                          )}
                        </ListboxOption>
                        <ListboxOption
                          className={({ active }) =>
                            `relative cursor-pointer select-none rounded py-2 pl-3 pr-9 ${
                              active
                                ? "bg-default-100 text-default-900"
                                : "text-default-900"
                            }`
                          }
                          value="Rented"
                          disabled
                        >
                          {({ selected, disabled }) => (
                            <>
                              <span
                                className={`block truncate ${
                                  selected ? "font-medium" : "font-normal"
                                } ${disabled ? "opacity-50" : ""}`}
                              >
                                Rented
                              </span>
                              {selected && (
                                <span className="absolute inset-y-0 right-0 flex items-center pr-3 text-default-600">
                                  <IconCheck
                                    className="h-5 w-5"
                                    aria-hidden="true"
                                  />
                                </span>
                              )}
                            </>
                          )}
                        </ListboxOption>
                        <ListboxOption
                          className={({ active }) =>
                            `relative cursor-pointer select-none rounded py-2 pl-3 pr-9 ${
                              active
                                ? "bg-default-100 text-default-900"
                                : "text-default-900"
                            }`
                          }
                          value="Maintenance"
                        >
                          {({ selected }) => (
                            <>
                              <span
                                className={`block truncate ${
                                  selected ? "font-medium" : "font-normal"
                                }`}
                              >
                                Maintenance
                              </span>
                              {selected && (
                                <span className="absolute inset-y-0 right-0 flex items-center pr-3 text-default-600">
                                  <IconCheck
                                    className="h-5 w-5"
                                    aria-hidden="true"
                                  />
                                </span>
                              )}
                            </>
                          )}
                        </ListboxOption>
                      </ListboxOptions>
                    </div>
                  </Listbox>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-8 py-3 text-right">
            <Button
              type="submit"
              variant="boldOutline"
              size="lg"
              disabled={isSaving || !isFormChanged}
            >
              {isSaving ? "Saving..." : "Save"}
            </Button>
          </div>
        </form>
      </div>

      <ConfirmationDialog
        isOpen={showBackConfirmation}
        onClose={() => setShowBackConfirmation(false)}
        onConfirm={handleConfirmBack}
        title="Discard Changes"
        message="Are you sure you want to go back? All unsaved changes will be lost."
        confirmButtonText="Discard"
        variant="danger"
      />
    </div>
  );
};

export default DumpsterFormPage;
