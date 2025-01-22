import React, { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import ConfirmationDialog from "../../components/ConfirmationDialog";
import { Customer, Employee } from "../../types/types";
import BackButton from "../../components/BackButton";
import Button from "../../components/Button";
import { FormInput, FormListbox } from "../../components/FormComponents";
import { api } from "../../routes/utils/api";
import {
  isValidationRequired,
  validateCustomerIdentity,
} from "../../routes/sales/invoices/customerValidation";

interface SelectOption {
  id: string;
  name: string;
}

const CustomerAddPage: React.FC = () => {
  const navigate = useNavigate();

  // Helper function for ID number placeholder
  const getIdNumberPlaceholder = (idType: string) => {
    switch (idType) {
      case "BRN":
        return "201101025173";
      case "NRIC":
        return "981223125953";
      default:
        return "";
    }
  };

  const [formData, setFormData] = useState<Customer>({
    id: "",
    name: "",
    closeness: "Local",
    salesman: "",
    tin_number: "",
    phone_number: "",
    email: "",
    address: "",
    city: "KOTA KINABALU",
    id_number: "",
    id_type: "",
  });

  const initialFormDataRef = useRef<Customer>({ ...formData });
  const [isFormChanged, setIsFormChanged] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showBackConfirmation, setShowBackConfirmation] = useState(false);
  const [salesmen, setSalesmen] = useState<SelectOption[]>([]);

  const closenessOptions = [
    { id: "Local", name: "Local" },
    { id: "Outstation", name: "Outstation" },
  ];

  const idTypeOptions = [
    { id: "BRN", name: "BRN" },
    { id: "NRIC", name: "NRIC" },
    { id: "PASSPORT", name: "PASSPORT" },
    { id: "ARMY", name: "ARMY" },
  ];

  useEffect(() => {
    const hasChanged =
      JSON.stringify(formData) !== JSON.stringify(initialFormDataRef.current);
    setIsFormChanged(hasChanged);
  }, [formData]);

  useEffect(() => {
    fetchSalesmen();
  }, []);

  const fetchSalesmen = useCallback(async () => {
    try {
      const data: Employee[] = await api.get("/api/staffs?salesmenOnly=true");
      const salesmenOptions = data.map((employee) => ({
        id: employee.id,
        name: employee.name || employee.id,
      }));
      setSalesmen(salesmenOptions);
    } catch (error) {
      console.error("Error fetching salesmen:", error);
      toast.error("Failed to fetch salesmen list");
    }
  }, []);

  const handleBackClick = () => {
    if (isFormChanged) {
      setShowBackConfirmation(true);
    } else {
      navigate("/catalogue/customer");
    }
  };

  const handleConfirmBack = () => {
    setShowBackConfirmation(false);
    navigate("/catalogue/customer");
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prevData) => ({
      ...prevData,
      [name]: value,
    }));
  };

  const handleListboxChange = (name: keyof Customer, value: string) => {
    setFormData((prevData) => ({
      ...prevData,
      [name]: value,
    }));
  };

  const validateForm = (): boolean => {
    if (!formData.id || !formData.name) {
      toast.error("ID and Name are required fields.");
      return false;
    }

    if (formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      toast.error("Please enter a valid email address or leave it empty.");
      return false;
    }

    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    setIsSaving(true);

    try {
      // Only perform validation if all required fields are present
      if (isValidationRequired(formData)) {
        const validationResult = await validateCustomerIdentity(formData);

        if (!validationResult.isValid) {
          setIsSaving(false);
          return;
        }
      }

      // Proceed with creating the customer if validation passed
      await api.post("/api/customers", formData);
      toast.success("Customer created successfully!");
      navigate("/catalogue/customer");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "An unexpected error occurred"
      );
    } finally {
      setIsSaving(false);
    }
  };

  const renderInput = (
    name: keyof Customer,
    label: string,
    type: string = "text",
    placeholder?: string
  ) => {
    const value = (() => {
      const val = formData[name];
      if (val === null || val === undefined) return "";
      return val.toString(); // Always convert to string
    })();

    return (
      <FormInput
        name={name}
        label={label}
        value={value}
        onChange={handleInputChange}
        type={type}
        {...(placeholder ? { placeholder } : {})}
      />
    );
  };

  const renderListbox = (
    name: keyof Customer,
    label: string,
    options: SelectOption[]
  ) => {
    const value = formData[name]?.toString() || "";

    return (
      <FormListbox
        name={name}
        label={label}
        value={value}
        onChange={(value) => handleListboxChange(name, value)}
        options={options}
      />
    );
  };

  return (
    <div className="container mx-auto px-4">
      <BackButton onClick={handleBackClick} className="ml-5" />
      <div className="bg-white rounded-lg">
        <div className="pl-6">
          <h1 className="text-xl font-semibold text-default-900">
            Add New Customer
          </h1>
          <p className="mt-1 text-sm text-default-500">
            Enter new customer information here. Click "Save" when you're done.
          </p>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="p-6 space-y-6">
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              {renderInput("id", "ID", "text", "TIENHOCK")}
              {renderInput(
                "name",
                "Name",
                "text",
                "TIEN HOCK FOOD INDUSTRIES S/D"
              )}
            </div>

            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              {renderInput("phone_number", "Phone Number", "tel")}
              {renderInput("email", "Email", "email")}
            </div>

            <div className="grid grid-cols-1 gap-6">
              {renderInput("address", "Address")}
            </div>

            <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
              {renderInput("city", "City")}
              {renderListbox("closeness", "Closeness", closenessOptions)}
              {renderListbox("salesman", "Salesman", salesmen)}
            </div>

            <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
              {renderListbox("id_type", "ID Type", idTypeOptions)}
              {renderInput(
                "id_number",
                "ID Number",
                "text",
                getIdNumberPlaceholder(formData.id_type)
              )}
              {renderInput("tin_number", "TIN Number", "text", "C21636482050")}
            </div>
          </div>

          <div className="mt-6 py-3 px-6 text-right">
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

export default CustomerAddPage;
