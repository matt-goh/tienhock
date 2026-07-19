import React, { useState, useEffect, useCallback } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import Tab from "../../components/Tab";
import toast from "react-hot-toast";
import ConfirmationDialog from "../../components/ConfirmationDialog";
import { Employee } from "../../types/types";
import BackButton from "../../components/BackButton";
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
import StaffPayCodesSection from "../../components/Catalogue/StaffPayCodesSection";
import { IconUsers, IconUserPlus, IconCrown, IconExternalLink } from "@tabler/icons-react";

interface SelectOption {
  id: string;
  name: string;
}

interface SameNameStaff {
  id: string;
  name: string;
  headStaffId: string | null;
  job: string[];
  isHead: boolean;
}

const STAFF_ID_WHITESPACE_REGEX: RegExp = /\s/;

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
  const location = useLocation();
  const { id } = useParams<{ id: string }>();
  const isEditMode = !!id;
  const maritalStatusOptions = [
    { id: "Single", name: "Single" },
    { id: "Married", name: "Married" },
  ];

  const spouseEmploymentOptions = [
    { id: "Employed", name: "Employed" },
    { id: "Unemployed", name: "Unemployed" },
  ];

  // OT pay basis for the July 2026+ OT salary formula. "" (Auto) resolves from
  // where the work is recorded: actual worked days when attendance dates or a
  // Worked Days input exist, otherwise ÷26 for monthly-logged staff. The
  // explicit options are overrides for odd cases only.
  const otPayBasisOptions = [
    { id: "", name: "Auto (from work records)" },
    { id: "monthly_26", name: "Monthly salary (÷ 26)" },
    { id: "actual_days", name: "Actual worked days" },
  ];

  // Per-staff statutory contribution overrides ("auto" sentinel maps to ""/NULL on save)
  const contributionAgeOptions = [
    { id: "auto", name: "Auto (from birthdate)" },
    { id: "under_60", name: "Treat as Under 60" },
    { id: "over_60", name: "Treat as 60 & Above" },
    { id: "none", name: "Not Eligible" },
  ];
  const epfNationalityOptions = [
    { id: "auto", name: "Auto (from nationality)" },
    { id: "local", name: "Local" },
    { id: "foreign", name: "Foreign" },
  ];

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
    maritalStatus: "Single",
    spouseEmploymentStatus: "",
    numberOfChildren: 0,
    department: "",
    kwspNumber: "",
    epfAgeOverride: "auto",
    epfNationalityOverride: "auto",
    socsoAgeOverride: "auto",
    sipAgeOverride: "auto",
    otPayBasis: "",
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
  const [modifiedFields, setModifiedFields] = useState<Set<string>>(new Set());

  // Same-name staff state for Head management
  const [sameNameStaff, setSameNameStaff] = useState<SameNameStaff[]>([]);
  const [isUniqueName, setIsUniqueName] = useState(true);
  const [loadingSameNameStaff, setLoadingSameNameStaff] = useState(false);
  const [settingHeadStaff, setSettingHeadStaff] = useState(false);

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

  const getDepartmentOptions = (
    currentDepartment?: string
  ): SelectOption[] => {
    const baseOptions: SelectOption[] = options.departments || [];
    const department: string | undefined = currentDepartment?.trim();
    if (!department) return baseOptions;

    const hasDepartment: boolean = baseOptions.some(
      (option) =>
        option.id === department ||
        option.name.toLowerCase() === department.toLowerCase()
    );

    return hasDepartment
      ? baseOptions
      : [...baseOptions, { id: department, name: department }];
  };

  const departmentOptions: SelectOption[] = getDepartmentOptions(
    formData.department
  );

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
    const hasModifications = modifiedFields.size > 0;

    // If there are tracked modifications, we need to consider the form changed
    if (hasModifications) {
      setIsFormChanged(true);
    } else {
      // Fall back to regular comparison if no tracked modifications
      const hasChanged =
        JSON.stringify(formData) !== JSON.stringify(initialFormData);
      setIsFormChanged(hasChanged);
    }
  }, [formData, initialFormData, modifiedFields]);

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
      // Create a base normalized data object
      const normalizedData = {
        ...data,
        nationality: mapDisplayNameToId(
          data.nationality,
          options.nationalities
        ),
        race: mapDisplayNameToId(data.race, options.races),
        agama: mapDisplayNameToId(data.agama, options.agama),
        // Ensure arrays for multi-selects
        job: Array.isArray(data.job) ? data.job : [],
        // Ensure date fields are strings or empty strings for input type="date"
        birthdate: data.birthdate || "",
        dateJoined: data.dateJoined || "",
        dateResigned: data.dateResigned || "",
        maritalStatus: data.maritalStatus || "Single",
        spouseEmploymentStatus: data.spouseEmploymentStatus || "",
        numberOfChildren: data.numberOfChildren || 0,
        department: mapDisplayNameToId(
          data.department,
          getDepartmentOptions(data.department)
        ),
        kwspNumber: data.kwspNumber || "",
        epfAgeOverride: data.epfAgeOverride || "auto",
        epfNationalityOverride: data.epfNationalityOverride || "auto",
        socsoAgeOverride: data.socsoAgeOverride || "auto",
        sipAgeOverride: data.sipAgeOverride || "auto",
        otPayBasis: data.otPayBasis || "",
      };

      // Preserve modified fields from current formData
      if (formData) {
        // For each modified field, keep the user's changes
        Array.from(modifiedFields).forEach((field) => {
          // @ts-ignore - field is a valid key of formData
          normalizedData[field] = formData[field];
        });
      }

      return normalizedData;
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
    options.departments,
  ]);

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

  // Fetch same-name staff for Head management
  const fetchSameNameStaff = useCallback(async () => {
    if (!id) return;

    setLoadingSameNameStaff(true);
    try {
      const response = await api.get(`/api/staffs/same-name/${id}`);
      setSameNameStaff(response.sameNameStaff || []);
      setIsUniqueName(response.isUniqueName);
    } catch (error) {
      console.error("Error fetching same-name staff:", error);
      setSameNameStaff([]);
      setIsUniqueName(true);
    } finally {
      setLoadingSameNameStaff(false);
    }
  }, [id]);

  // Fetch same-name staff when in edit mode
  useEffect(() => {
    if (isEditMode && id) {
      fetchSameNameStaff();
    }
  }, [isEditMode, id, fetchSameNameStaff]);

  // Handle pre-fill data when creating new staff from "Add Same-Name Staff" button
  useEffect(() => {
    if (!isEditMode && location.state?.prefillData) {
      setFormData((prev) => ({
        ...prev,
        ...location.state.prefillData,
        id: "", // Ensure ID is empty
        job: [], // Ensure job is empty
      }));
      // Clear the state to prevent re-applying on subsequent renders
      window.history.replaceState({}, document.title);
    }
  }, [isEditMode, location.state]);

  // Handler for setting head staff
  const handleHeadStaffChange = async (newHeadStaffId: string) => {
    if (!formData.name || settingHeadStaff) return;

    // Don't do anything if clicking on the already-selected head
    const currentHead = sameNameStaff.find((s) => s.isHead);
    if (currentHead?.id === newHeadStaffId) return;

    setSettingHeadStaff(true);
    try {
      await api.put("/api/staffs/set-head", {
        headStaffId: newHeadStaffId,
        staffName: formData.name,
      });

      // Refresh same-name staff list (this updates the isHead flags)
      await fetchSameNameStaff();

      toast.success("Head staff updated successfully");
    } catch (error) {
      console.error("Error setting head staff:", error);
      toast.error("Failed to update head staff");
    } finally {
      setSettingHeadStaff(false);
    }
  };

  // Handler for adding a new staff with the same name
  const handleAddSameNameStaff = () => {
    // Create state object with current staff data, excluding ID and job
    const prefillData = {
      name: formData.name,
      telephoneNo: formData.telephoneNo,
      email: formData.email,
      gender: formData.gender,
      nationality: formData.nationality,
      birthdate: formData.birthdate,
      address: formData.address,
      icNo: formData.icNo,
      bankAccountNumber: formData.bankAccountNumber,
      epfNo: formData.epfNo,
      incomeTaxNo: formData.incomeTaxNo,
      socsoNo: formData.socsoNo,
      paymentType: formData.paymentType,
      paymentPreference: formData.paymentPreference,
      race: formData.race,
      agama: formData.agama,
      maritalStatus: formData.maritalStatus,
      spouseEmploymentStatus: formData.spouseEmploymentStatus,
      numberOfChildren: formData.numberOfChildren,
      kwspNumber: formData.kwspNumber,
      department: formData.department,
    };

    // Navigate to new staff page with state
    navigate("/catalogue/staff/new", { state: { prefillData } });
  };

  // Format IC Number with hyphens
  const formatICNumber = (value: string): string => {
    // Remove all non-digits
    const digitsOnly = value.replace(/\D/g, '');
    
    // Limit to 12 digits
    const limited = digitsOnly.slice(0, 12);
    
    // Apply formatting: XXXXXX-XX-XXXX
    if (limited.length <= 6) {
      return limited;
    } else if (limited.length <= 8) {
      return `${limited.slice(0, 6)}-${limited.slice(6)}`;
    } else {
      return `${limited.slice(0, 6)}-${limited.slice(6, 8)}-${limited.slice(8)}`;
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    
    // Special handling for IC Number
    if (name === 'icNo') {
      // Only auto-format when the value is a numeric IC. Passport numbers
      // (e.g. P3261441B) contain letters and must be stored as typed.
      const containsLetter = /[a-zA-Z]/.test(value);
      const formattedValue = containsLetter
        ? value.toUpperCase()
        : formatICNumber(value);
      setFormData((prevData) => ({
        ...prevData,
        [name]: formattedValue,
      }));
    } else if (name === "id") {
      setFormData((prevData) => ({
        ...prevData,
        [name]: value.replace(/\s/g, ""),
      }));
    } else {
      setFormData((prevData) => ({
        ...prevData,
        [name]: value,
      }));
    }
  };

  const handleListboxChange = (name: keyof Employee, value: string) => {
    setFormData((prevData) => {
      if (prevData[name] === value) return prevData;
      return {
        ...prevData,
        [name]: value,
      };
    });
  };

  const handleComboboxChange = useCallback(
    (name: "job" | "location", value: string[] | null) => {
      if (value === null) {
        // Location may be cleared to none; other fields keep their value when
        // the search input is emptied.
        if (name === "location") {
          setFormData((prevData) => ({ ...prevData, location: [] }));
          setModifiedFields((prev) => new Set(prev).add(name));
        }
        return;
      }

      setFormData((prevData) => ({
        ...prevData,
        [name]: value,
      }));

      // Track the modification in the state
      setModifiedFields((prev) => {
        const updated = new Set(prev);
        updated.add(name);
        return updated;
      });
    },
    []
  );

  const validateForm = (): boolean => {
    const requiredFields: (keyof Employee)[] = isEditMode
      ? ["name"]
      : ["id", "name"];

    for (const field of requiredFields) {
      if (!formData[field]) {
        toast.error(
          `${field.charAt(0).toUpperCase() + field.slice(1)} is required.`
        );
        return false;
      }
    }

    if (STAFF_ID_WHITESPACE_REGEX.test(formData.id)) {
      toast.error("Staff ID cannot contain whitespace.");
      return false;
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
      department: mapIdToDisplayName(formData.department, departmentOptions),
      // Handle date fields
      birthdate: formData.birthdate || null,
      dateJoined: formData.dateJoined || null,
      dateResigned: formData.dateResigned || null,
      // Map the "auto" sentinel back to "" (backend stores NULL = auto)
      epfAgeOverride:
        formData.epfAgeOverride === "auto" ? "" : formData.epfAgeOverride,
      epfNationalityOverride:
        formData.epfNationalityOverride === "auto"
          ? ""
          : formData.epfNationalityOverride,
      socsoAgeOverride:
        formData.socsoAgeOverride === "auto" ? "" : formData.socsoAgeOverride,
      sipAgeOverride:
        formData.sipAgeOverride === "auto" ? "" : formData.sipAgeOverride,
      otPayBasis: formData.otPayBasis || "",
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

      // Reset modified fields after successful save
      setModifiedFields(new Set());

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
    options: SelectOption[],
    optionsPosition?: "top" | "bottom"
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
        optionsPosition={optionsPosition}
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
        <SelectedTagsDisplay
          selectedItems={(formData[name] as string[]).map((locId) => {
            const locationOption = options.find((opt) => opt.id === locId);
            return locationOption ? locationOption.name : locId;
          })}
          label={label}
        />
      ) : (
        <SelectedTagsDisplay
          selectedItems={formData[name] as string[]}
          label={label}
          navigable={true}
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
    <div className="space-y-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-default-200 dark:border-gray-700">
        <div className="px-6 py-3 border-b border-default-200 dark:border-gray-700 flex justify-between items-start">
          <div className="flex items-center gap-4">
            <BackButton onClick={handleBackClick} />
            <div className="h-6 w-px bg-default-300 dark:bg-gray-600"></div>
            <div className="flex-1 min-w-0">
              {/* Staff Name & ID Row */}
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-xl font-semibold text-default-900 dark:text-gray-100">
                  {formData.name || "New Staff"}
                </h1>
                {formData.id && (
                  <span className="px-2.5 py-0.5 text-sm font-mono font-medium bg-sky-100 dark:bg-sky-900/40 text-sky-700 dark:text-sky-300 rounded-full">
                    {formData.id}
                  </span>
                )}
              </div>

              {/* Staff Details Row */}
              <div className="mt-1.5 flex items-center gap-4 flex-wrap text-sm text-default-600 dark:text-gray-400">
                {/* IC Number */}
                {formData.icNo && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-default-400 dark:text-gray-500">IC:</span>
                    <span className="font-medium text-default-700 dark:text-gray-300">{formData.icNo}</span>
                  </div>
                )}

                {/* Telephone */}
                {formData.telephoneNo && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-default-400 dark:text-gray-500">Tel:</span>
                    <span className="font-medium text-default-700 dark:text-gray-300">{formData.telephoneNo}</span>
                  </div>
                )}

                {/* Jobs */}
                {formData.job && formData.job.length > 0 && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-default-400 dark:text-gray-500">Jobs:</span>
                    <div className="flex items-center gap-1 flex-wrap">
                      {formData.job.slice(0, 3).map((jobId) => (
                        <span
                          key={jobId}
                          className="px-2 py-0.5 text-xs font-medium bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 rounded"
                        >
                          {jobId}
                        </span>
                      ))}
                      {formData.job.length > 3 && (
                        <span className="px-2 py-0.5 text-xs font-medium bg-default-200 dark:bg-gray-700 text-default-600 dark:text-gray-300 rounded">
                          +{formData.job.length - 3} more
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center space-x-3">
            {isEditMode && (
              <button
                type="button"
                className="px-5 py-2 text-base font-medium rounded-full border border-rose-300 dark:border-rose-700 text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-900/20 hover:bg-rose-100 dark:hover:bg-rose-900/40 hover:border-rose-400 dark:hover:border-rose-600 active:bg-rose-200 dark:active:bg-rose-900/60 transition-colors"
                onClick={handleDeleteClick}
              >
                Delete
              </button>
            )}
            <button
              type="submit"
              form="staff-form"
              disabled={isSaving || !isFormChanged}
              className={`px-5 py-2 text-base font-medium rounded-full transition-colors ${
                isSaving || !isFormChanged
                  ? "bg-default-100 dark:bg-gray-700 text-default-400 dark:text-gray-500 cursor-not-allowed border border-default-200 dark:border-gray-600"
                  : "bg-sky-500 dark:bg-sky-600 text-white hover:bg-sky-600 dark:hover:bg-sky-500 active:bg-sky-700 dark:active:bg-sky-700 border border-sky-500 dark:border-sky-600 hover:border-sky-600 dark:hover:border-sky-500"
              }`}
            >
              {isSaving ? "Saving..." : "Save"}
            </button>
          </div>
        </div>
        <form id="staff-form" onSubmit={handleSubmit}>
          <div className="px-6 py-3">
            <Tab
              labels={["Personal", "Work", "Documents", "Additional"]}
              tabWidth="w-[104px]"
              defaultActiveTab={0}
            >
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

                {/* Head Staff Management Section */}
                {isEditMode && (
                  <div className="mt-4 p-4 bg-default-50 dark:bg-gray-800/50 rounded-lg border border-default-200 dark:border-gray-700">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <IconUsers size={18} className="text-default-500" />
                        <h4 className="text-sm font-medium text-default-700 dark:text-gray-200">
                          Same Name Staff Records
                        </h4>
                      </div>
                      <button
                        type="button"
                        onClick={handleAddSameNameStaff}
                        disabled={settingHeadStaff}
                        className={`flex items-center gap-1.5 px-3 py-1.5 text-sm bg-sky-50 dark:bg-sky-900/30 text-sky-600 dark:text-sky-400 rounded-lg hover:bg-sky-100 dark:hover:bg-sky-900/50 transition-colors ${
                          settingHeadStaff ? "opacity-50 cursor-not-allowed" : ""
                        }`}
                      >
                        <IconUserPlus size={16} />
                        Add New
                      </button>
                    </div>

                    {loadingSameNameStaff ? (
                      <div className="flex items-center justify-center py-4">
                        <LoadingSpinner />
                      </div>
                    ) : isUniqueName ? (
                      <p className="text-sm text-default-400 dark:text-gray-500 italic">
                        This staff has a unique name - no other records found.
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {sameNameStaff.map((staff) => (
                          <div
                            key={staff.id}
                            onClick={() => handleHeadStaffChange(staff.id)}
                            className={`flex items-center justify-between p-3 rounded-lg border transition-all ${
                              settingHeadStaff
                                ? "cursor-wait opacity-60"
                                : "cursor-pointer"
                            } ${
                              staff.isHead
                                ? "bg-amber-50 dark:bg-amber-900/20 border-amber-300 dark:border-amber-700"
                                : "bg-white dark:bg-gray-800 border-default-200 dark:border-gray-700 hover:border-sky-300 dark:hover:border-sky-600"
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              {/* Radio-style indicator */}
                              <div
                                className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                                  staff.isHead
                                    ? "border-amber-500 bg-amber-500"
                                    : "border-default-300 dark:border-gray-600"
                                }`}
                              >
                                {staff.isHead && (
                                  <IconCrown size={10} className="text-white" />
                                )}
                              </div>

                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="font-mono text-sm font-medium text-default-800 dark:text-gray-100">
                                    {staff.id}
                                  </span>
                                  {staff.isHead && (
                                    <span className="px-1.5 py-0.5 text-xs bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 rounded">
                                      HEAD
                                    </span>
                                  )}
                                  {staff.id === id && (
                                    <span className="px-1.5 py-0.5 text-xs bg-sky-100 dark:bg-sky-900/40 text-sky-700 dark:text-sky-300 rounded">
                                      Current
                                    </span>
                                  )}
                                </div>
                                <span className="text-xs text-default-500 dark:text-gray-400">
                                  {staff.job.length > 0
                                    ? staff.job.join(", ")
                                    : "No job assigned"}
                                </span>
                              </div>
                            </div>

                            {/* Navigate to this staff's page */}
                            {staff.id !== id && (
                              <button
                                type="button"
                                disabled={settingHeadStaff}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (!settingHeadStaff) {
                                    navigate(`/catalogue/staff/${staff.id}`);
                                  }
                                }}
                                className={`p-1.5 text-default-400 hover:text-sky-500 dark:hover:text-sky-400 ${
                                  settingHeadStaff ? "opacity-50 cursor-not-allowed" : ""
                                }`}
                                title="View this staff"
                              >
                                <IconExternalLink size={16} />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
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
                <StaffPayCodesSection employee={formData} />
              </div>
              <div className="space-y-6 mt-5">
                <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
                  {renderInput("icNo", "IC Number")}
                  {renderInput("bankAccountNumber", "Bank Account Number")}
                  {renderInput("epfNo", "EPF Number")}
                  {renderInput("incomeTaxNo", "Income Tax Number")}
                  {renderInput("socsoNo", "SOCSO Number")}
                  {renderListbox("document", "Document", documentOptions)}
                  {renderListbox("department", "Department", departmentOptions)}
                  {renderInput("kwspNumber", "KWSP Number")}
                </div>
                <div className="border-t border-default-200 dark:border-gray-700 pt-6 mt-6">
                  <h3 className="text-base font-medium text-default-800 dark:text-gray-100 mb-4">
                    Income Tax Information
                  </h3>
                  <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
                    {renderListbox(
                      "maritalStatus",
                      "Marital Status",
                      maritalStatusOptions
                    )}
                    {formData.maritalStatus === "Married" &&
                      renderListbox(
                        "spouseEmploymentStatus",
                        "Spouse Employment Status",
                        spouseEmploymentOptions
                      )}
                    {renderInput(
                      "numberOfChildren",
                      "Number of Children",
                      "number"
                    )}
                  </div>
                </div>
                <div className="border-t border-default-200 dark:border-gray-700 pt-6 mt-6">
                  <h3 className="text-base font-medium text-default-800 dark:text-gray-100 mb-1">
                    Contribution Settings
                  </h3>
                  <p className="text-sm text-default-500 dark:text-gray-400 mb-4">
                    Override how EPF, SOCSO and SIP are applied for this staff.
                    Leave as Auto to follow the staff's birthdate and
                    nationality. "Not Eligible" removes that contribution
                    entirely.
                  </p>
                  <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
                    {renderListbox(
                      "epfAgeOverride",
                      "EPF Age",
                      contributionAgeOptions,
                      "top"
                    )}
                    {renderListbox(
                      "epfNationalityOverride",
                      "EPF Rate Type",
                      epfNationalityOptions,
                      "top"
                    )}
                    {renderListbox(
                      "socsoAgeOverride",
                      "SOCSO Age",
                      contributionAgeOptions,
                      "top"
                    )}
                    {renderListbox(
                      "sipAgeOverride",
                      "SIP Age",
                      contributionAgeOptions,
                      "top"
                    )}
                    {renderListbox(
                      "otPayBasis",
                      "OT Pay Basis (from July 2026)",
                      otPayBasisOptions,
                      "top"
                    )}
                  </div>
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
