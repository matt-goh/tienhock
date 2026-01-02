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
import { api } from "../../../routes/utils/api";

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
  const [rentals, setRentals] = useState<any[]>([]);
  const [isFormChanged, setIsFormChanged] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showBackConfirmation, setShowBackConfirmation] = useState(false);
  const [isDuplicate, setIsDuplicate] = useState(false);
  const [isCheckingDuplicate, setIsCheckingDuplicate] = useState(false);
  const [loading, setLoading] = useState(isEditMode);
  const [error, setError] = useState<string | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

  useEffect(() => {
    if (isEditMode && id) {
      fetchDumpsterDetails(id);
      fetchDumpsterRentals(id);
    }
  }, [id, isEditMode]);

  useEffect(() => {
    const hasChanged =
      JSON.stringify(formData) !== JSON.stringify(initialFormData);
    setIsFormChanged(hasChanged);
  }, [formData, initialFormData]);

  // Add a debounce effect to avoid too many API calls while typing
  useEffect(() => {
    const handler = setTimeout(() => {
      if (formData.tong_no) {
        checkDuplicateTongNo(formData.tong_no);
      }
    }, 500); // 500ms debounce

    return () => {
      clearTimeout(handler);
    };
  }, [formData.tong_no]);

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

  const fetchDumpsterRentals = async (dumpsterId: string) => {
    try {
      const response = await api.get(
        `/greentarget/api/rentals?tong_no=${encodeURIComponent(dumpsterId)}`
      );
      setRentals(response || []);
    } catch (err) {
      console.error("Error fetching dumpster rentals:", err);
      setRentals([]);
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

  const checkDuplicateTongNo = async (value: string) => {
    if (!value.trim() || isEditMode) return;

    setIsCheckingDuplicate(true);
    try {
      const dumpsters = await greenTargetApi.getDumpsters();
      const duplicate = dumpsters.some(
        (d: Dumpster) => d.tong_no === value.trim()
      );
      setIsDuplicate(duplicate);
    } catch (err) {
      console.error("Error checking for duplicate dumpster:", err);
      // Don't set duplicate flag on error - better to allow submission than block incorrectly
    } finally {
      setIsCheckingDuplicate(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.tong_no) {
      toast.error("Dumpster number is required");
      return;
    }

    if (isDuplicate) {
      toast.error("A dumpster with this number already exists");
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

  const handleDeleteDumpster = async () => {
    try {
      setIsSaving(true);

      if (!formData.tong_no) {
        toast.error("Cannot delete: dumpster number is missing");
        return;
      }

      const response = await greenTargetApi.deleteDumpster(formData.tong_no);

      // Check if the response contains an error message
      if (
        response.error ||
        (response.message && response.message.includes("Cannot delete"))
      ) {
        // Show specific error message based on association type
        let errorMessage =
          response.message || "Cannot delete dumpster: unknown error occurred";

        if (response.associationType === "rentals") {
          errorMessage =
            "Cannot delete dumpster: it is currently being used in active rentals. Please complete or remove the rentals first.";
        } else if (response.associationType === "invoices") {
          errorMessage =
            "Cannot delete dumpster: it has associated invoices. Please handle the invoices first.";
        } else if (response.associationType === "payments") {
          errorMessage =
            "Cannot delete dumpster: it has associated payments. Please handle the payments first.";
        }

        toast.error(errorMessage);
      } else {
        // Show success message and navigate back to dumpster list
        toast.success("Dumpster deleted successfully");
        navigate("/greentarget/dumpsters");
      }
    } catch (error) {
      console.error("Error deleting dumpster:", error);
      if (error instanceof Error) {
        toast.error(error.message);
      } else {
        toast.error("Failed to delete dumpster");
      }
    } finally {
      setIsDeleteDialogOpen(false);
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
    <div className="space-y-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg">
        <div className="px-6 pb-4 border-b border-default-200 dark:border-gray-700">
          <div className="flex items-center gap-4">
            <BackButton onClick={handleBackClick} />
            <div className="h-6 w-px bg-default-300"></div>
            <div>
              <h1 className="text-xl font-semibold text-default-900 dark:text-gray-100">
                {isEditMode ? "Edit Dumpster" : "Add New Dumpster"}
              </h1>
              <p className="mt-1 text-sm text-default-500 dark:text-gray-400">
                {isEditMode
                  ? 'Edit dumpster details here. Click "Save" when you\'re done.'
                  : 'Enter new dumpster details here. Click "Save" when you\'re done.'}
              </p>
            </div>
          </div>
        </div>
        <form onSubmit={handleSubmit} className="p-6">
          <div className="space-y-6">
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              <div className="space-y-2">
                <label
                  htmlFor="tong_no"
                  className="text-sm font-medium text-default-700 dark:text-gray-200"
                >
                  Dumpster Number
                </label>
                <div>
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
                    className={`w-full px-3 py-2 border ${
                      isDuplicate
                        ? "border-rose-300 focus:border-rose-500"
                        : "border-default-300 focus:border-default-500"
                    } rounded-lg focus:outline-none disabled:bg-default-50`}
                  />
                  {isDuplicate && (
                    <p className="mt-1 text-sm text-rose-600">
                      A dumpster with this number already exists
                    </p>
                  )}
                  {isCheckingDuplicate && (
                    <p className="mt-1 text-sm text-default-500 dark:text-gray-400">
                      Checking availability...
                    </p>
                  )}
                </div>
              </div>

              <div className="w-full">
                <label
                  htmlFor="status"
                  className="text-sm font-medium text-default-700 dark:text-gray-200"
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
                      <ListboxButton className="w-full rounded-lg border border-default-300 dark:border-gray-600 bg-white dark:bg-gray-800 py-2 pl-3 pr-10 text-left focus:outline-none focus:border-default-500 disabled:bg-default-50 dark:bg-gray-900/50">
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
                      <ListboxOptions className="absolute z-10 w-full p-1 mt-1 border bg-white dark:bg-gray-800 max-h-60 rounded-lg overflow-auto focus:outline-none shadow-lg">
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
                                <span className="absolute inset-y-0 right-0 flex items-center pr-3 text-default-600 dark:text-gray-300">
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
                                <span className="absolute inset-y-0 right-0 flex items-center pr-3 text-default-600 dark:text-gray-300">
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
                                <span className="absolute inset-y-0 right-0 flex items-center pr-3 text-default-600 dark:text-gray-300">
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

          {isEditMode && (
            <div className="mt-8 pt-4 border-t">
              <h2 className="text-lg font-medium mb-4">Rental Schedule</h2>
              {rentals.length === 0 ? (
                <p className="text-default-500 dark:text-gray-400">
                  No rentals scheduled for this dumpster.
                </p>
              ) : (
                <div className="overflow-hidden border border-default-200 dark:border-gray-700 rounded-lg">
                  <table className="min-w-full divide-y divide-default-200 dark:divide-gray-700">
                    <thead className="bg-default-50 dark:bg-gray-900/50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-default-500 dark:text-gray-400 uppercase tracking-wider">
                          Customer
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-default-500 dark:text-gray-400 uppercase tracking-wider">
                          Placement Date
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-default-500 dark:text-gray-400 uppercase tracking-wider">
                          Pickup Date
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-default-500 dark:text-gray-400 uppercase tracking-wider">
                          Status
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white dark:bg-gray-800 divide-y divide-default-200 dark:divide-gray-700">
                      {rentals.map((rental) => {
                        const today = new Date();
                        today.setHours(0, 0, 0, 0);
                        const pickupDate = rental.date_picked
                          ? new Date(rental.date_picked)
                          : null;
                        const placementDate = new Date(rental.date_placed);

                        // A rental is currently active if:
                        // 1. It has a placement date in the past or today, AND
                        // 2. Either it has no pickup date, or the pickup date is in the future
                        const isCurrent =
                          placementDate <= today &&
                          (!pickupDate || pickupDate > today);

                        // A rental is scheduled if the placement date is in the future
                        const isScheduled = placementDate > today;

                        return (
                          <tr
                            key={rental.rental_id}
                            className="hover:bg-default-50 dark:hover:bg-gray-700"
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate(
                                `/greentarget/rentals/${rental.rental_id}`
                              );
                            }}
                          >
                            <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-default-900 dark:text-gray-100">
                              {rental.customer_name}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm text-default-600 dark:text-gray-300">
                              {new Date(
                                rental.date_placed
                              ).toLocaleDateString()}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm text-default-600 dark:text-gray-300">
                              {rental.date_picked
                                ? new Date(
                                    rental.date_picked
                                  ).toLocaleDateString()
                                : "Not set"}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap">
                              <span
                                className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                                  isCurrent
                                    ? "bg-green-100 text-green-800"
                                    : isScheduled
                                    ? "bg-amber-100 text-amber-800"
                                    : "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300"
                                }`}
                              >
                                {isCurrent
                                  ? "Ongoing"
                                  : isScheduled
                                  ? "Scheduled"
                                  : "Completed"}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          <div className="mt-6 py-3 text-right">
            {isEditMode && (
              <Button
                type="button"
                color="rose"
                variant="outline"
                onClick={() => setIsDeleteDialogOpen(true)}
                className="mr-3"
              >
                Delete
              </Button>
            )}
            <Button
              type="submit"
              variant="boldOutline"
              size="lg"
              disabled={
                isSaving || !isFormChanged || isDuplicate || isCheckingDuplicate
              }
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
      <ConfirmationDialog
        isOpen={isDeleteDialogOpen}
        onClose={() => setIsDeleteDialogOpen(false)}
        onConfirm={handleDeleteDumpster}
        title="Delete Dumpster"
        message={`Are you sure you want to delete dumpster ${formData.tong_no}? This action cannot be undone.`}
        confirmButtonText="Delete"
        variant="danger"
      />
    </div>
  );
};

export default DumpsterFormPage;
