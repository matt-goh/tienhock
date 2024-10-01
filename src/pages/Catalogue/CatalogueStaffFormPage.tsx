import React, { useState, useEffect, Fragment, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  IconChevronDown,
  IconCheck,
} from "@tabler/icons-react";
import {
  Listbox,
  Transition,
  Combobox,
  ComboboxInput,
  ComboboxButton,
  ComboboxOptions,
  ComboboxOption,
  ListboxOption,
  ListboxOptions,
  ListboxButton,
} from "@headlessui/react";
import Tab from "../../components/Tab";
import clsx from "clsx";
import toast from "react-hot-toast";
import DeleteDialog from "../../components/DeleteDialog";
import { Employee } from "../../types/types";
import BackButton from "../../components/BackButton";
import Button from "../../components/Button";

interface SelectOption {
  id: string;
  name: string;
}

const CatalogueStaffFormPage: React.FC = () => {
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
  const [showBackConfirmation, setShowBackConfirmation] = useState(false);
  const [nationalities, setNationalities] = useState<SelectOption[]>([]);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [races, setRaces] = useState<SelectOption[]>([]);
  const [agamas, setAgamas] = useState<SelectOption[]>([]);
  const [jobs, setJobs] = useState<SelectOption[]>([]);
  const [locations, setLocations] = useState<SelectOption[]>([]);
  const [jobQuery, setJobQuery] = useState("");
  const [locationQuery, setLocationQuery] = useState("");
  const [loading, setLoading] = useState(isEditMode);
  const [error, setError] = useState<string | null>(null);

  const genderOptions = [
    { id: "male", name: "Male" },
    { id: "female", name: "Female" },
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

  useEffect(() => {
    const hasChanged =
      JSON.stringify(formData) !== JSON.stringify(initialFormData);
    setIsFormChanged(hasChanged);
  }, [formData, initialFormData]);

  useEffect(() => {
    if (isEditMode) {
      fetchStaffDetails();
    } else {
      setInitialFormData({ ...formData });
    }
    fetchOptions("nationalities", setNationalities);
    fetchOptions("races", setRaces);
    fetchOptions("agamas", setAgamas);
    fetchOptions("jobs", setJobs);
    fetchOptions("locations", setLocations);
  }, [id]);

  const fetchStaffDetails = async () => {
    try {
      setLoading(true);
      const response = await fetch(`http://localhost:5000/api/staffs/${id}`);
      if (!response.ok) {
        throw new Error("Failed to fetch staff details");
      }
      const data = await response.json();

      // The job and location arrays now contain IDs, so we don't need to convert them
      setFormData(data);
      setInitialFormData(data);
      setError(null);
    } catch (err) {
      setError("Failed to fetch staff details. Please try again later.");
      console.error("Error fetching staff details:", err);
    } finally {
      setLoading(false);
    }
  };

  const fetchOptions = async (
    endpoint: string,
    setter: React.Dispatch<React.SetStateAction<SelectOption[]>>
  ) => {
    try {
      const response = await fetch(`http://localhost:5000/api/${endpoint}`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      setter(data);
    } catch (error) {
      console.error(`Error fetching ${endpoint}:`, error);
    }
  };

  const handleDeleteClick = () => {
    setIsDeleteDialogOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (id) {
      try {
        const response = await fetch(`http://localhost:5000/api/staffs/${id}`, {
          method: "DELETE",
        });
        if (!response.ok) {
          throw new Error("Failed to delete staff member");
        }
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
    const requiredFields: (keyof Employee)[] = ["id", "name"];

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

    const dataToSend = {
      ...formData,
      birthdate: formData.birthdate || null,
      dateJoined: formData.dateJoined || null,
      dateResigned: formData.dateResigned || null,
    };

    try {
      let url = "http://localhost:5000/api/staffs";
      let method = "POST";

      if (isEditMode) {
        if (id !== formData.id) {
          // ID has changed, use PUT method with the new ID
          url = `http://localhost:5000/api/staffs/${id}`;
          method = "PUT";
          dataToSend.newId = formData.id; // Add newId field to indicate ID change
        } else {
          // ID hasn't changed, use regular PUT
          url = `http://localhost:5000/api/staffs/${id}`;
          method = "PUT";
        }
      }

      const response = await fetch(url, {
        method: method,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(dataToSend),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(
          errorData.message ||
            `An error occurred while ${
              isEditMode ? "updating" : "creating"
            } the staff member.`
        );
      }

      const data = await response.json();
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
    }
  };

  const renderInput = (
    name: keyof Employee,
    label: string,
    type: string = "text"
  ) => (
    <div className="space-y-2">
      <label htmlFor={name} className="text-sm font-medium text-gray-700">
        {label}
      </label>
      <input
        type={type}
        id={name}
        name={name}
        value={formData[name] || ""}
        onChange={handleInputChange}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-gray-500"
      />
    </div>
  );

  const renderListbox = (
    name: keyof Employee,
    label: string,
    options: SelectOption[]
  ) => (
    <div className="space-y-2">
      <label htmlFor={name} className="text-sm font-medium text-gray-700">
        {label}
      </label>
      <Listbox
        value={formData[name]}
        onChange={(value) =>
          handleListboxChange(
            name,
            Array.isArray(value) ? value.join(",") : value
          )
        }
      >
        <div className="relative mt-1">
          <ListboxButton
            className={clsx(
              "relative w-full rounded-lg border border-gray-300 bg-white py-2 pl-3 pr-10 text-left",
              "focus:outline-none focus:border-gray-400"
            )}
          >
            <span className="block truncate">{formData[name] || "Select"}</span>
            <span className="absolute inset-y-0 right-0 flex items-center pr-2 pointer-events-none">
              <IconChevronDown size={20} className="text-gray-500" />
            </span>
          </ListboxButton>
          <Transition
            as={Fragment}
            leave="transition ease-in duration-100"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <ListboxOptions className="absolute z-10 w-full p-1 mt-1 border bg-white max-h-60 rounded-lg overflow-auto focus:outline-none">
              {options.map((option) => (
                <ListboxOption
                  key={option.id}
                  className={({ active }) =>
                    `relative cursor-pointer select-none rounded py-2 px-4 ${
                      active ? "bg-gray-100" : "text-gray-900"
                    }`
                  }
                  value={option.name}
                >
                  {({ selected }) => (
                    <>
                      <span
                        className={`block truncate ${
                          selected ? "font-medium" : "font-normal"
                        }`}
                      >
                        {option.name}
                      </span>
                      {selected ? (
                        <span className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-600">
                          <IconCheck stroke={2} size={22} />
                        </span>
                      ) : null}
                    </>
                  )}
                </ListboxOption>
              ))}
            </ListboxOptions>
          </Transition>
        </div>
      </Listbox>
    </div>
  );

  const renderCombobox = (
    name: "job" | "location",
    label: string,
    options: SelectOption[],
    query: string,
    setQuery: React.Dispatch<React.SetStateAction<string>>
  ) => (
    <div className="space-y-2">
      <label htmlFor={name} className="text-sm font-medium text-gray-700">
        {label}
      </label>
      <Combobox
        multiple
        value={formData[name] ?? ""}
        onChange={(value) => handleComboboxChange(name, value)}
      >
        {({ open }) => (
          <div className="relative mt-1">
            <ComboboxInput
              className={clsx(
                "w-full rounded-lg border border-gray-300 bg-white py-2 pl-3 pr-10 text-gray-900",
                "focus:outline-none focus:border-gray-400"
              )}
              displayValue={(selected: string[]) =>
                selected
                  .map((id) => options.find((option) => option.id === id)?.name)
                  .join(", ")
              }
              onChange={(event) => setQuery(event.target.value)}
            />
            <ComboboxButton className="absolute inset-y-0 right-0 flex items-center pr-2 text-gray-500">
              <IconChevronDown stroke={2} size={20} />
            </ComboboxButton>
            <Transition
              show={open}
              as={Fragment}
              leave="transition ease-in duration-100"
              leaveFrom="opacity-100"
              leaveTo="opacity-0"
            >
              <ComboboxOptions className="absolute z-10 w-full p-1 mt-1 border bg-white max-h-60 rounded-lg overflow-auto focus:outline-none">
                {options.length === 0 ||
                (options.length > 0 &&
                  query !== "" &&
                  options.filter((option) =>
                    option.name.toLowerCase().includes(query.toLowerCase())
                  ).length === 0) ? (
                  <div className="relative cursor-default select-none py-2 px-4 text-gray-700">
                    No {name}s found.
                  </div>
                ) : (
                  options
                    .filter((option) =>
                      option.name.toLowerCase().includes(query.toLowerCase())
                    )
                    .map((option) => (
                      <ComboboxOption
                        key={option.id}
                        className={({ active }) =>
                          `relative cursor-pointer select-none rounded py-2 px-4 ${
                            active ? "bg-gray-100" : "text-gray-900"
                          }`
                        }
                        value={option.id}
                      >
                        {({ selected }) => (
                          <>
                            <span
                              className={`block truncate ${
                                selected ? "font-medium" : "font-normal"
                              }`}
                            >
                              {option.name}
                            </span>
                            {selected ? (
                              <span className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-600">
                                <IconCheck stroke={2} size={22} />
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
        )}
      </Combobox>
    </div>
  );

  if (loading) {
    return <div>Loading...</div>;
  }

  if (error) {
    return <div>Error: {error}</div>;
  }

  return (
    <div className="container mx-auto px-4">
      <BackButton onClick={handleBackClick} className="ml-5" />
      <div className="bg-white rounded-lg">
        <div className="pl-6">
          <h1 className="text-xl font-semibold text-gray-900">
            {isEditMode ? "Edit Staff" : "Add New Staff"}
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            {isEditMode
              ? 'Edit maklumat kakitangan di sini. Klik "Save" apabila anda selesai.'
              : 'Masukkan maklumat kakitangan baharu di sini. Klik "Save" apabila anda selesai.'}
          </p>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="pl-6 pt-5">
            <Tab labels={["Personal", "Work", "Documents", "Additional"]}>
              <div className="space-y-6">
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
                  {renderListbox("nationality", "Nationality", nationalities)}
                  {renderInput("birthdate", "Birthdate", "date")}
                </div>
                <div className="grid grid-cols-1 gap-6">
                  {renderInput("address", "Address")}
                </div>
              </div>
              <div className="space-y-6">
                <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
                  {renderCombobox("job", "Job", jobs, jobQuery, setJobQuery)}
                  {renderCombobox(
                    "location",
                    "Location",
                    locations,
                    locationQuery,
                    setLocationQuery
                  )}
                  {renderInput("dateJoined", "Date Joined", "date")}
                </div>
              </div>
              <div className="space-y-6">
                <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
                  {renderInput("icNo", "IC Number")}
                  {renderInput("bankAccountNumber", "Bank Account Number")}
                  {renderInput("epfNo", "EPF Number")}
                  {renderInput("incomeTaxNo", "Income Tax Number")}
                  {renderInput("socsoNo", "SOCSO Number")}
                  {renderListbox("document", "Document", documentOptions)}
                </div>
              </div>
              <div className="space-y-6">
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
                  {renderListbox("race", "Race", races)}
                  {renderListbox("agama", "Agama", agamas)}
                  {renderInput("dateResigned", "Date Resigned", "date")}
                </div>
              </div>
            </Tab>
          </div>
          <div className="mt-8 py-3 space-x-3 text-right">
            {isEditMode && (
              <button
                type="button"
                className="px-5 py-2 border border-rose-400 hover:border-rose-500 bg-white hover:bg-rose-500 active:bg-rose-600 active:border-rose-600 rounded-full font-medium text-base text-rose-500 hover:text-gray-100 active:text-gray-200 transition-colors duration-200"
                onClick={handleDeleteClick}
              >
                Delete
              </button>
            )}
            <Button type="submit" variant="boldOutline" size="lg">
              Save
            </Button>
          </div>
        </form>
      </div>
      <DeleteDialog
        isOpen={isDeleteDialogOpen}
        onClose={() => setIsDeleteDialogOpen(false)}
        onConfirm={handleConfirmDelete}
        title="Delete Staff"
        message={`Are you sure you want to remove ${formData.name} from the staff list? This action cannot be undone.`}
        confirmButtonText="Delete"
      />
      <DeleteDialog
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

export default CatalogueStaffFormPage;
