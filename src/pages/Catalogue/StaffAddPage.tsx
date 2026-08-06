import React, { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import Tab from "../../components/Tab";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";
import ConfirmationDialog from "../../components/ConfirmationDialog";
import { Employee } from "../../types/types";
import BackButton from "../../components/BackButton";
import { useSmartBack } from "../../hooks/useSmartBack";
import Button from "../../components/Button";
import {
  FormInput,
  FormListbox,
  FormCombobox,
} from "../../components/FormComponents";
import { api } from "../../routes/utils/api";
import { useStaffFormOptions } from "../../hooks/useStaffFormOptions";
import SelectedTagsDisplay from "../../components/Catalogue/SelectedTagsDisplay";
import { useStaffsCache } from "../../utils/catalogue/useStaffsCache";
import { useJobsCache } from "../../utils/catalogue/useJobsCache";

interface SelectOption {
  id: string;
  name: string;
}

const STAFF_ID_WHITESPACE_REGEX: RegExp = /\s/;

const StaffAddPage: React.FC = () => {
  const navigate = useNavigate();
  const { t } = useTranslation("catalogue");
  const goBack = useSmartBack("/catalogue/staff");
  const location = useLocation();
  const maritalStatusOptions = [
    { id: "Single", name: t("Single") },
    { id: "Married", name: t("Married") },
  ];

  const spouseEmploymentOptions = [
    { id: "Employed", name: t("Employed") },
    { id: "Unemployed", name: t("Unemployed") },
  ];

  // Per-staff statutory contribution overrides ("auto" sentinel maps to ""/NULL on save)
  const contributionAgeOptions = [
    { id: "auto", name: t("Auto (from birthdate)") },
    { id: "under_60", name: t("Treat as Under 60") },
    { id: "over_60", name: t("Treat as 60 & Above") },
    { id: "none", name: t("Not Eligible") },
  ];
  const epfNationalityOptions = [
    { id: "auto", name: t("Auto (from nationality)") },
    { id: "local", name: t("Local") },
    { id: "foreign", name: t("Foreign") },
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
  });

  const initialFormDataRef = useRef<Employee>({ ...formData });
  const [isFormChanged, setIsFormChanged] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showBackConfirmation, setShowBackConfirmation] = useState(false);
  const [jobQuery, setJobQuery] = useState("");
  const [locationQuery, setLocationQuery] = useState("");
  const { allStaffs, refreshStaffs } = useStaffsCache();
  const { options } = useStaffFormOptions();
  const { jobs } = useJobsCache();

  const genderOptions = [
    { id: "Male", name: t("Male") },
    { id: "Female", name: t("Female") },
  ];

  const documentOptions = [
    { id: "NI", name: t("NI") },
    { id: "OI", name: t("OI") },
    { id: "PP", name: t("PP") },
    { id: "IM", name: t("IM") },
  ];

  const paymentTypeOptions = [
    { id: "Delivery", name: t("Delivery") },
    { id: "Money", name: t("Money") },
    { id: "Commission", name: t("Commission") },
  ];

  const paymentPreferenceOptions = [
    { id: "Bank", name: t("Bank") },
    { id: "Cash", name: t("Cash") },
    { id: "Cheque", name: t("Cheque") },
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

  // Utility function: Convert option ID to display name
  const mapIdToDisplayName = (
    id: string | undefined,
    options: SelectOption[]
  ): string => {
    if (!id || id === "") return "";

    const option = options.find((opt) => opt.id === id);
    if (option) return option.name;

    console.warn(`Could not map ID "${id}" to any option name`);
    return "";
  };

  useEffect(() => {
    // Check if form data has changed by comparing with the initial ref
    const hasChanged =
      JSON.stringify(formData) !== JSON.stringify(initialFormDataRef.current);
    setIsFormChanged(hasChanged);
  }, [formData]);

  // Handle pre-fill data when creating new staff from "Add Same-Name Staff" button
  useEffect(() => {
    if (location.state?.prefillData) {
      const prefillData = location.state.prefillData;
      setFormData((prev) => ({
        ...prev,
        ...prefillData,
        id: "", // Ensure ID is empty
        job: [], // Ensure job is empty
      }));
      // Update the initial form data ref so form change detection works correctly
      initialFormDataRef.current = {
        ...initialFormDataRef.current,
        ...prefillData,
        id: "",
        job: [],
      };
      // Clear the navigation state to prevent re-applying on subsequent renders
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);

  const handleBackClick = () => {
    if (isFormChanged) {
      setShowBackConfirmation(true);
    } else {
      goBack();
    }
  };

  const handleConfirmBack = () => {
    setShowBackConfirmation(false);
    goBack();
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
      const formattedValue = formatICNumber(value);
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
        }
        return;
      }
      setFormData((prevData) => ({
        ...prevData,
        [name]: value,
      }));
    },
    []
  );

  const checkDuplicateId = async (id: string): Promise<Employee | null> => {
    try {
      const existingStaff = allStaffs.find((staff) => staff.id.trim() === id);
      return existingStaff || null;
    } catch (error) {
      console.error("Error checking ID:", error);
      return null; // Continue with submission on check error
    }
  };

  const validateForm = async (): Promise<boolean> => {
    const requiredFields: (keyof Employee)[] = ["id", "name"];

    for (const field of requiredFields) {
      if (!formData[field]) {
        toast.error(
          t(`${field.charAt(0).toUpperCase() + field.slice(1)} is required.`)
        );
        return false;
      }
    }

    if (STAFF_ID_WHITESPACE_REGEX.test(formData.id)) {
      toast.error(t("Staff ID cannot contain whitespace."));
      const idField = document.getElementById("id");
      if (idField) {
        idField.focus();
      }
      return false;
    }

    // Check for duplicate ID before submission
    const existingStaff = await checkDuplicateId(formData.id);
    if (existingStaff) {
      if (existingStaff.dateResigned) {
        toast.error(
          t(
            "A staff member with this ID already exists (Resigned: {{date}})",
            { date: existingStaff.dateResigned }
          )
        );
      } else {
        toast.error(t("A staff member with this ID already exists"));
      }

      // Focus on the ID field
      const idField = document.getElementById("id");
      if (idField) {
        idField.focus();
      }

      return false;
    }

    // Email validation (only if email is not empty)
    if (formData.email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(formData.email)) {
        toast.error(
          t("Please enter a valid email address or leave it empty.")
        );
        return false;
      }
    }

    return true;
  };

  const handleSubmit = async (e: { preventDefault: () => void }) => {
    e.preventDefault();

    if (!(await validateForm())) {
      return;
    }

    setIsSaving(true);

    // Convert option IDs back to display names for storage
    const dataToSend = {
      ...formData,
      // Convert IDs back to display names for database storage
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
    };

    try {
      await api.post("/api/staffs", dataToSend);

      // Refresh the cache after successful creation
      await refreshStaffs();

      toast.success(t("Staff member created successfully!"));
      // Show the staff member just created. `replace` drops this form from
      // history, so Back returns to wherever the user started.
      navigate(`/catalogue/staff/${formData.id}`, { replace: true });
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t("An unexpected error occurred")
      );
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
      value={formData[name]?.toString() ?? ""}
      onChange={handleInputChange}
      type={type}
    />
  );

  const renderContributionSelect = (
    name: keyof Employee,
    label: string,
    selectOptions: SelectOption[]
  ) => (
    <div className="space-y-2">
      <label
        htmlFor={name}
        className="block text-sm font-medium text-default-700 dark:text-gray-200 truncate"
        title={label}
      >
        {label}
      </label>
      <select
        id={name}
        name={name}
        value={formData[name]?.toString() ?? ""}
        onChange={(event: React.ChangeEvent<HTMLSelectElement>) =>
          handleListboxChange(name, event.target.value)
        }
        className="block w-full px-3 py-2 border border-default-300 dark:border-gray-600 rounded-lg shadow-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-sky-500 dark:focus:ring-sky-400 focus:border-sky-500 dark:focus:border-sky-400 sm:text-sm"
      >
        {selectOptions.map((option: SelectOption) => (
          <option key={option.id} value={option.id}>
            {option.name}
          </option>
        ))}
      </select>
    </div>
  );

  const renderListbox = (
    name: keyof Employee,
    label: string,
    options: SelectOption[]
  ) => (
    <FormListbox
      name={name}
      label={label}
      value={formData[name]?.toString() ?? ""}
      onChange={(value) => handleListboxChange(name, value)}
      options={options}
    />
  );

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

  return (
    <div className="space-y-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-default-200 dark:border-gray-700">
        <div className="px-6 py-4 border-b border-default-200 dark:border-gray-700">
          <div className="flex items-center gap-4">
            <BackButton onClick={handleBackClick} />
            <div className="h-6 w-px bg-default-300 dark:bg-gray-600"></div>
            <div>
              <h1 className="text-xl font-semibold text-default-900 dark:text-gray-100">
                {t("Add New Staff")}
              </h1>
              <p className="mt-1 text-sm text-default-500 dark:text-gray-400">
                {t(
                  "Enter the new staff member's information here. Click \"Save\" when you are done."
                )}
              </p>
            </div>
          </div>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="p-6">
            <Tab
              labels={[
                t("Personal"),
                t("Work"),
                t("Documents"),
                t("Additional"),
              ]}
            >
              <div className="space-y-6 mt-5">
                <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                  {renderInput("id", t("ID"))}
                  {renderInput("name", t("Name"))}
                </div>
                <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                  {renderInput("telephoneNo", t("Telephone Number"))}
                  {renderInput("email", t("Email"), "email")}
                </div>
                <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
                  {renderListbox("gender", t("Gender"), genderOptions)}
                  {renderListbox(
                    "nationality",
                    t("Nationality"),
                    options.nationalities
                  )}
                  {renderInput("birthdate", t("Birthdate"), "date")}
                </div>
                <div className="grid grid-cols-1 gap-6">
                  {renderInput("address", t("Address"))}
                </div>
              </div>
              <div className="space-y-6 mt-5">
                <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
                  {renderCombobox("job", t("Job"), jobs, jobQuery, setJobQuery)}
                  {renderCombobox(
                    "location",
                    t("Location"),
                    options.locations,
                    locationQuery,
                    setLocationQuery
                  )}
                  {renderInput("dateJoined", t("Date Joined"), "date")}
                </div>
              </div>
              <div className="space-y-6 mt-5">
                <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
                  {renderInput("icNo", t("IC Number"))}
                  {renderInput("bankAccountNumber", t("Bank Account Number"))}
                  {renderInput("epfNo", t("EPF Number"))}
                  {renderInput("incomeTaxNo", t("Income Tax Number"))}
                  {renderInput("socsoNo", t("SOCSO Number"))}
                  {renderListbox("document", t("Document"), documentOptions)}
                  {renderListbox(
                    "department",
                    t("Department"),
                    departmentOptions
                  )}
                  {renderInput("kwspNumber", t("KWSP Number"))}
                </div>
                <div className="border-t border-default-200 dark:border-gray-700 pt-6 mt-6">
                  <h3 className="text-base font-medium text-default-800 dark:text-gray-100 mb-4">
                    {t("Income Tax Information")}
                  </h3>
                  <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
                    {renderListbox(
                      "maritalStatus",
                      t("Marital Status"),
                      maritalStatusOptions
                    )}
                    {formData.maritalStatus === "Married" &&
                      renderListbox(
                        "spouseEmploymentStatus",
                        t("Spouse Employment Status"),
                        spouseEmploymentOptions
                      )}
                    {renderInput(
                      "numberOfChildren",
                      t("Number of Children"),
                      "number"
                    )}
                  </div>
                </div>
                <div className="border-t border-default-200 dark:border-gray-700 pt-6 mt-6">
                  <h3 className="text-base font-medium text-default-800 dark:text-gray-100 mb-1">
                    {t("Contribution Settings")}
                  </h3>
                  <p className="text-sm text-default-500 dark:text-gray-400 mb-4">
                    {t(
                      "Override how EPF, SOCSO and SIP are applied for this staff. Leave as Auto to follow the staff's birthdate and nationality. \"Not Eligible\" removes that contribution entirely."
                    )}
                  </p>
                  <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
                    {renderContributionSelect(
                      "epfAgeOverride",
                      t("EPF Age"),
                      contributionAgeOptions
                    )}
                    {renderContributionSelect(
                      "epfNationalityOverride",
                      t("EPF Rate Type"),
                      epfNationalityOptions
                    )}
                    {renderContributionSelect(
                      "socsoAgeOverride",
                      t("SOCSO Age"),
                      contributionAgeOptions
                    )}
                    {renderContributionSelect(
                      "sipAgeOverride",
                      t("SIP Age"),
                      contributionAgeOptions
                    )}
                  </div>
                </div>
              </div>
              <div className="space-y-6 mt-5">
                <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
                  {renderListbox(
                    "paymentType",
                    t("Payment Type"),
                    paymentTypeOptions
                  )}
                  {renderListbox(
                    "paymentPreference",
                    t("Payment Preference"),
                    paymentPreferenceOptions
                  )}
                  {renderListbox("race", t("Race"), options.races)}
                  {renderListbox("agama", t("Agama"), options.agama)}
                  {renderInput("dateResigned", t("Date Resigned"), "date")}
                </div>
              </div>
            </Tab>
          </div>
          <div className="p-6 flex justify-end items-center space-x-3 border-t border-default-200 dark:border-gray-700">
            <Button
              type="submit"
              variant="boldOutline"
              size="lg"
              disabled={isSaving || !isFormChanged}
            >
              {t("save", { ns: "common" })}
            </Button>
          </div>
        </form>
      </div>
      <ConfirmationDialog
        isOpen={showBackConfirmation}
        onClose={() => setShowBackConfirmation(false)}
        onConfirm={handleConfirmBack}
        title={t("Discard Changes")}
        message={t(
          "Are you sure you want to go back? All unsaved changes will be lost."
        )}
        confirmButtonText={t("confirm", { ns: "common" })}
      />
    </div>
  );
};

export default StaffAddPage;
