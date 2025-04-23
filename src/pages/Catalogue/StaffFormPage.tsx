import React, { useState, useEffect, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Tab from "../../components/Tab";
import toast from "react-hot-toast";
import ConfirmationDialog from "../../components/ConfirmationDialog";
import { Employee } from "../../types/types";
import BackButton from "../../components/BackButton";
import Button from "../../components/Button";
import { api } from "../../routes/utils/api";
import LoadingSpinner from "../../components/LoadingSpinner";
import {
  FormCombobox,
  FormInput,
  FormListbox,
} from "../../components/FormComponents";
import { useStaffFormOptions } from "../../hooks/useStaffFormOptions";
import SelectedTagsDisplay from "../../components/Catalogue/SelectedTagsDisplay";
import { useJobsCache } from "../../utils/catalogue/useJobsCache";
import { useStaffsCache } from "../../utils/catalogue/useStaffsCache";

interface SelectOption {
  id: string;
  name: string;
}

/**
 * This form handles a special case with select dropdowns:
 * - Database stores display names (e.g., "Buddhist", "Malaysian")
 * - Form works with IDs ("B", "MAL") for selection components
 *
 * We convert between these formats:
 * - When loading: Convert display names to IDs (for form selection)
 * - When saving: Convert IDs back to display names (for database storage)
 */
const StaffFormPage: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isEditMode = !!id;
  const [formData, setFormData] = useState<Employee>({
    id: "",
    name: "",
    telephoneNo: "",
    email: "",
    gender: "",
    nationality: "",
    birthdate: "",
    address: "",
    job: [],
    location: [],
    dateJoined: "",
    icNo: "",
    bankAccountNumber: "",
    epfNo: "",
    incomeTaxNo: "",
    socsoNo: "",
    document: "",
    paymentType: "",
    paymentPreference: "",
    race: "",
    agama: "",
    dateResigned: "",
    newId: "",
  });
  const [initialFormData, setInitialFormData] = useState<Employee>({
    ...formData,
  });

  const [isFormChanged, setIsFormChanged] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showBackConfirmation, setShowBackConfirmation] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [jobQuery, setJobQuery] = useState("");
  const [locationQuery, setLocationQuery] = useState("");
  const [loading, setLoading] = useState(isEditMode);
  const [error, setError] = useState<string | null>(null);
  const { options } = useStaffFormOptions();
  const { jobs } = useJobsCache();
  const { refreshStaffs, staffs, loading: loadingStaffs } = useStaffsCache();

  const genderOptions = [
    { id: "Male", name: "Male" },
    { id: "Female", name: "Female" },
  ];

  const documentOptions = [
    { id: "NI", name: "NI" },
    { id: "OI", name: "OI" },
    { id: "PP", name: "PP" },
    { id: "IM", name: "IM" },
  ];

  const paymentTypeOptions = [
    { id: "Delivery", name: "Delivery" },
    { id: "Money", name: "Money" },
    { id: "Commission", name: "Commission" },
  ];

  const paymentPreferenceOptions = [
    { id: "Bank", name: "Bank" },
    { id: "Cash", name: "Cash" },
    { id: "Cheque", name: "Cheque" },
  ];

  // Utility function: Convert display name to option ID
  const mapDisplayNameToId = (
    displayName: string | undefined,
    options: SelectOption[]
  ): string => {
    if (!displayName || displayName === "") return "";

    // First try exact name match (case insensitive)
    const exactNameMatch = options.find(
      (opt) => opt.name.toLowerCase() === displayName.toLowerCase()
    );
    if (exactNameMatch) return exactNameMatch.id;

    // Then try partial name match
    const partialMatch = options.find(
      (opt) =>
        opt.name.toLowerCase().includes(displayName.toLowerCase()) ||
        displayName.toLowerCase().includes(opt.name.toLowerCase())
    );
    if (partialMatch) return partialMatch.id;

    // If we can't find a match, consider it might already be an ID
    const exactIdMatch = options.find((opt) => opt.id === displayName);
    if (exactIdMatch) return displayName;

    // If all else fails, return empty string
    console.warn(`Could not map "${displayName}" to any option ID`);
    return "";
  };

  // Utility function: Convert option ID to display name
  const mapIdToDisplayName = (
    id: string | undefined,
    options: SelectOption[]
  ): string => {
    if (!id || id === "") return "";

    const option = options.find((opt) => opt.id === id);
    if (option) return option.name;

    // If we can't find the ID, it might already be a display name
    const nameMatch = options.find((opt) => opt.name === id);
    if (nameMatch) return id;

    console.warn(`Could not map ID "${id}" to any option name`);
    return "";
  };

  useEffect(() => {
    const hasChanged =
      JSON.stringify(formData) !== JSON.stringify(initialFormData);
    setIsFormChanged(hasChanged);
  }, [formData, initialFormData]);

  const fetchStaffDetails = useCallback(() => {
    if (!id) return;

    // If staffs are still loading, don't proceed yet
    if (loadingStaffs) {
      return;
    }

    setLoading(true);
    // Find the staff in the cache
    const staffData = staffs.find((staff) => staff.id === id);

    // Helper function to normalize data (from cache or API)
    const normalizeData = (data: Employee): Employee => {
      return {
        ...data,
        nationality: mapDisplayNameToId(
          data.nationality,
          options.nationalities
        ),
        race: mapDisplayNameToId(data.race, options.races),
        agama: mapDisplayNameToId(data.agama, options.agama),
        // Ensure arrays for multi-selects
        job: Array.isArray(data.job) ? data.job : [],
        location: Array.isArray(data.location) ? data.location : [],
        // Ensure date fields are strings or empty strings for input type="date"
        birthdate: data.birthdate || "",
        dateJoined: data.dateJoined || "",
        dateResigned: data.dateResigned || "",
      };
    };

    if (staffData) {
      const normalizedData = normalizeData(staffData);
      setFormData(normalizedData);
      setInitialFormData(normalizedData);
      setError(null);
      setLoading(false); // Set loading false here for cache hit
    } else {
      // Fallback to API if not in cache
      api
        .get(`/api/staffs/${id}`)
        .then((data) => {
          // Convert display names to option IDs for form selection
          const normalizedData = normalizeData(data);
          setFormData(normalizedData);
          setInitialFormData(normalizedData);
          setError(null);
        })
        .catch((err) => {
          setError("Failed to fetch staff details. Please try again later.");
          console.error("Error fetching staff details:", err);
        })
        .finally(() => {
          setLoading(false); // Use finally to ensure setLoading(false) is called
        });
    }
  }, [
    id,
    staffs,
    loadingStaffs,
    options.nationalities,
    options.races,
    options.agama,
  ]); // Updated dependencies

  useEffect(() => {
    if (isEditMode) {
      fetchStaffDetails();
    } else {
      setInitialFormData({ ...formData });
    }
  }, [isEditMode, fetchStaffDetails, loadingStaffs]);

  const handleDeleteClick = () => {
    setIsDeleteDialogOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (id) {
      try {
        await api.delete(`/api/staffs/${id}`);

        // Refresh the cache
        await refreshStaffs();

        setIsDeleteDialogOpen(false);
        toast.success("Staff member deleted successfully");
        navigate("/catalogue/staff");
      } catch (err) {
        console.error("Error deleting staff member:", err);
        toast.error("Failed to delete staff member. Please try again.");
      }
    }
  };

  const handleBackClick = () => {
    if (isFormChanged) {
      setShowBackConfirmation(true);
    } else {
      navigate("/catalogue/staff");
    }
  };

  const handleConfirmBack = () => {
    setShowBackConfirmation(false);
    navigate("/catalogue/staff");
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prevData) => ({
      ...prevData,
      [name]: value,
    }));
  };

  const handleListboxChange = (name: keyof Employee, value: string) => {
    setFormData((prevData) => ({
      ...prevData,
      [name]: value,
    }));
  };

  const handleComboboxChange = useCallback(
    (name: "job" | "location", value: string[] | null) => {
      if (value === null) {
        return;
      }
      setFormData((prevData) => ({
        ...prevData,
        [name]: value,
      }));
    },
    []
  );

  const validateForm = (): boolean => {
    const requiredFields: (keyof Employee)[] = ["name"];

    for (const field of requiredFields) {
      if (!formData[field]) {
        toast.error(
          `${field.charAt(0).toUpperCase() + field.slice(1)} is required.`
        );
        return false;
      }
    }

    if (formData.email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(formData.email)) {
        toast.error("Please enter a valid email address or leave it empty.");
        return false;
      }
    }

    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    setIsSaving(true);

    // Convert option IDs back to display names for storage
    const dataToSend = {
      ...formData,
      // Convert option IDs back to display names for database
      nationality: mapIdToDisplayName(
        formData.nationality,
        options.nationalities
      ),
      race: mapIdToDisplayName(formData.race, options.races),
      agama: mapIdToDisplayName(formData.agama, options.agama),
      // Handle date fields
      birthdate: formData.birthdate || null,
      dateJoined: formData.dateJoined || null,
      dateResigned: formData.dateResigned || null,
    };

    try {
      if (isEditMode) {
        if (id !== formData.id) {
          // ID has changed, use PUT method with the new ID
          dataToSend.newId = formData.id;
          await api.put(`/api/staffs/${id}`, dataToSend);
        } else {
          // ID hasn't changed, use regular PUT
          await api.put(`/api/staffs/${id}`, dataToSend);
        }
      } else {
        // Create new staff member
        await api.post("/api/staffs", dataToSend);
      }

      // Refresh the cache after successful save
      await refreshStaffs();

      toast.success(
        `Staff member ${isEditMode ? "updated" : "created"} successfully!`
      );
      navigate("/catalogue/staff");
    } catch (error) {
      if (error instanceof Error) {
        toast.error(error.message);
      } else {
        toast.error("An unexpected error occurred.");
      }
    } finally {
      setIsSaving(false);
    }
  };

  const renderInput = (
    name: keyof Employee,
    label: string,
    type: string = "text"
  ) => (
    <FormInput
      name={name}
      label={label}
      value={(formData[name] as string) ?? ""}
      onChange={handleInputChange}
      type={type}
      disabled={isEditMode && name === "id"}
    />
  );

  const renderListbox = (
    name: keyof Employee,
    label: string,
    options: SelectOption[]
  ) => {
    const currentValue = formData[name];

    return (
      <FormListbox
        key={name}
        name={name}
        label={label}
        value={currentValue as string}
        onChange={(value) => handleListboxChange(name, value)}
        options={options}
        placeholder={`Select ${label}...`}
      />
    );
  };

  const renderCombobox = (
    name: "job" | "location",
    label: string,
    options: SelectOption[],
    query: string,
    setQuery: React.Dispatch<React.SetStateAction<string>>
  ) => (
    <div>
      <FormCombobox
        name={name}
        label={label}
        value={formData[name] as string[]}
        onChange={(value) => {
          if (typeof value === "string") {
            handleComboboxChange(name, [value]);
          } else {
            handleComboboxChange(name, value);
          }
        }}
        options={options}
        query={query}
        setQuery={setQuery}
      />
      {name === "location" ? (
        <div>
          <SelectedTagsDisplay
            selectedItems={(formData[name] as string[]).map((locId) => {
              const locationOption = options.find((opt) => opt.id === locId);
              return locationOption ? `${locationOption.name}` : locId;
            })}
            label={label}
          />
        </div>
      ) : (
        <SelectedTagsDisplay
          selectedItems={formData[name] as string[]}
          label={label}
        />
      )}
    </div>
  );

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
    <div className="container mx-auto px-4 pb-10">
      <BackButton onClick={handleBackClick} className="mt-3 mb-2" />
      <div className="bg-white rounded-lg shadow-sm border border-default-200">
        <div className="p-6 border-b border-default-200">
          <h1 className="text-xl font-semibold text-default-900">
            {isEditMode ? "Edit Staff" : "Add New Staff"}
          </h1>
          <p className="mt-1 text-sm text-default-500">
            {isEditMode
              ? 'Edit maklumat kakitangan di sini. Klik "Save" apabila anda selesai.'
              : 'Masukkan maklumat kakitangan baharu di sini. Klik "Save" apabila anda selesai.'}
          </p>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="p-6">
            <Tab labels={["Personal", "Work", "Documents", "Additional"]}>
              <div className="space-y-6 mt-5">
                <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                  {renderInput("id", "ID")}
                  {renderInput("name", "Name")}
                </div>
                <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                  {renderInput("telephoneNo", "Telephone Number")}
                  {renderInput("email", "Email", "email")}
                </div>
                <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
                  {renderListbox("gender", "Gender", genderOptions)}
                  {renderListbox(
                    "nationality",
                    "Nationality",
                    options.nationalities
                  )}
                  {renderInput("birthdate", "Birthdate", "date")}
                </div>
                <div className="grid grid-cols-1 gap-6">
                  {renderInput("address", "Address")}
                </div>
              </div>
              <div className="space-y-6 mt-5">
                <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
                  {renderCombobox("job", "Job", jobs, jobQuery, setJobQuery)}
                  {renderCombobox(
                    "location",
                    "Location",
                    options.locations,
                    locationQuery,
                    setLocationQuery
                  )}
                  {renderInput("dateJoined", "Date Joined", "date")}
                </div>
              </div>
              <div className="space-y-6 mt-5">
                <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
                  {renderInput("icNo", "IC Number")}
                  {renderInput("bankAccountNumber", "Bank Account Number")}
                  {renderInput("epfNo", "EPF Number")}
                  {renderInput("incomeTaxNo", "Income Tax Number")}
                  {renderInput("socsoNo", "SOCSO Number")}
                  {renderListbox("document", "Document", documentOptions)}
                </div>
              </div>
              <div className="space-y-6 mt-5">
                <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
                  {renderListbox(
                    "paymentType",
                    "Payment Type",
                    paymentTypeOptions
                  )}
                  {renderListbox(
                    "paymentPreference",
                    "Payment Preference",
                    paymentPreferenceOptions
                  )}
                  {renderListbox("race", "Race", options.races)}
                  {renderListbox("agama", "Agama", options.agama)}
                  {renderInput("dateResigned", "Date Resigned", "date")}
                </div>
              </div>
            </Tab>
          </div>
          <div className="p-6 flex justify-end items-center space-x-3 border-t border-default-200">
            {isEditMode && (
              <button
                type="button"
                className="px-5 py-2 border border-rose-400 hover:border-rose-500 bg-white hover:bg-rose-500 active:bg-rose-600 active:border-rose-600 rounded-full font-medium text-base text-rose-500 hover:text-default-100 active:text-default-200 transition-colors duration-200"
                onClick={handleDeleteClick}
              >
                Delete
              </button>
            )}
            <Button
              type="submit"
              variant="boldOutline"
              size="lg"
              disabled={isSaving || !isFormChanged}
            >
              Save
            </Button>
          </div>
        </form>
      </div>
      <ConfirmationDialog
        isOpen={isDeleteDialogOpen}
        onClose={() => setIsDeleteDialogOpen(false)}
        onConfirm={handleConfirmDelete}
        title="Delete Staff"
        message={`Are you sure you want to remove ${formData.name} from the staff list? This action cannot be undone.`}
        confirmButtonText="Delete"
      />
      <ConfirmationDialog
        isOpen={showBackConfirmation}
        onClose={() => setShowBackConfirmation(false)}
        onConfirm={handleConfirmBack}
        title="Discard Changes"
        message="Are you sure you want to go back? All unsaved changes will be lost."
        confirmButtonText="Confirm"
      />
    </div>
  );
};

export default StaffFormPage;
