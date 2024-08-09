import React, { useState, useEffect, Fragment } from "react";
import { useNavigate } from "react-router-dom";
import {
  IconChevronLeft,
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
import Tab from "../components/Tab";
import clsx from "clsx";
import toast from "react-hot-toast";
import DeleteDialog from "../components/DeleteDialog";

interface SelectOption {
  id: string;
  name: string;
}

interface FormData {
  id: string;
  name: string;
  telephoneNo: string;
  email: string;
  gender: string;
  nationality: string;
  birthdate: string;
  address: string;
  job: string[];
  location: string[];
  dateJoined: string;
  icNo: string;
  bankAccountNumber: string;
  epcNo: string;
  incomeTaxNo: string;
  socsoNo: string;
  document: string;
  paymentType: string;
  paymentPreference: string;
  race: string;
  agama: string;
  dateResigned: string;
}

const CatalogueAddStaffPage: React.FC = () => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState<FormData>({
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
    epcNo: "",
    incomeTaxNo: "",
    socsoNo: "",
    document: "",
    paymentType: "",
    paymentPreference: "",
    race: "",
    agama: "",
    dateResigned: "",
  });
  const [initialFormData, setInitialFormData] = useState<FormData>({
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
    epcNo: "",
    incomeTaxNo: "",
    socsoNo: "",
    document: "",
    paymentType: "",
    paymentPreference: "",
    race: "",
    agama: "",
    dateResigned: "",
  });

  const [isFormChanged, setIsFormChanged] = useState(false);
  const [showBackConfirmation, setShowBackConfirmation] = useState(false);
  const [nationalities, setNationalities] = useState<SelectOption[]>([]);
  const [races, setRaces] = useState<SelectOption[]>([]);
  const [agamas, setAgamas] = useState<SelectOption[]>([]);
  const [jobs, setJobs] = useState<SelectOption[]>([]);
  const [locations, setLocations] = useState<SelectOption[]>([]);
  const [jobQuery, setJobQuery] = useState("");
  const [locationQuery, setLocationQuery] = useState("");

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
    { id: "M", name: "M" },
    { id: "Cash", name: "Cash" },
  ];

  const paymentPreferenceOptions = [
    { id: "Bank", name: "Bank" },
    { id: "Cash", name: "Cash" },
    { id: "Cheque", name: "Cheque" },
  ];

  useEffect(() => {
    // Check if form data has changed
    const hasChanged =
      JSON.stringify(formData) !== JSON.stringify(initialFormData);
    setIsFormChanged(hasChanged);
  }, [formData, initialFormData]);

  useEffect(() => {
    setInitialFormData({ ...formData });
  }, []);

  useEffect(() => {
    fetchOptions("nationalities", setNationalities);
    fetchOptions("races", setRaces);
    fetchOptions("agamas", setAgamas);
    fetchOptions("jobs", setJobs);
    fetchOptions("locations", setLocations);
  }, []);

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

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prevData) => ({
      ...prevData,
      [name]: value,
    }));
  };

  const handleListboxChange = (name: keyof FormData, value: string) => {
    setFormData((prevData) => ({
      ...prevData,
      [name]: value,
    }));
  };

  const handleComboboxChange = (name: "job" | "location", value: string[]) => {
    setFormData((prevData) => ({
      ...prevData,
      [name]: value,
    }));
  };

  const validateForm = (): boolean => {
    const requiredFields: (keyof FormData)[] = ["id", "name"];

    for (const field of requiredFields) {
      if (!formData[field]) {
        toast.error(
          `${field.charAt(0).toUpperCase() + field.slice(1)} is required.`
        );
        return false;
      }
    }

    // Email validation (only if email is not empty)
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
      const response = await fetch("http://localhost:5000/api/staffs", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(dataToSend),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(
          errorData.message ||
            "An error occurred while creating the staff member."
        );
      }

      const data = await response.json();
      toast.success("Staff member created successfully!");
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
    name: keyof FormData,
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
        value={formData[name].toString()}
        onChange={handleInputChange}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-gray-500"
      />
    </div>
  );

  const renderListbox = (
    name: keyof FormData,
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
        value={formData[name]}
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
                {options
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
                  ))}
              </ComboboxOptions>
            </Transition>
          </div>
        )}
      </Combobox>
    </div>
  );

  return (
    <div className="container mx-auto px-4">
      <button
        onClick={handleBackClick}
        className="ml-3 mb-6 pl-2.5 pr-4 py-2 flex items-center font-medium hover:bg-gray-100 active:bg-gray-200 rounded-full text-gray-700 hover:text-gray-800 transition-colors duration-200"
      >
        <IconChevronLeft className="mr-1" size={20} />
        Back
      </button>
      <div className="bg-white rounded-lg">
        <div className="pl-6">
          <h1 className="text-xl font-semibold text-gray-900">Add New Staff</h1>
          <p className="mt-1 text-sm text-gray-500">
            Masukkan maklumat kakitangan baharu di sini. Klik "Save" apabila
            anda selesai.
          </p>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="pl-6 pt-5">
            <Tab
              labels={[
                "Personal and contact data",
                "Work data",
                "Documents",
                "Additional data",
              ]}
            >
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
                  {renderInput("epcNo", "EPC Number")}
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
          <div className="mt-8 py-3 text-right">
            <button
              type="submit"
              className="px-5 py-2 border border-gray-300 rounded-full font-medium text-base text-gray-700 hover:bg-gray-100 hover:text-gray-800 active:text-gray-900 active:bg-gray-200 transition-colors duration-200"
            >
              Save
            </button>
          </div>
        </form>
      </div>
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

export default CatalogueAddStaffPage;
