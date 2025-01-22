import React, { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import toast from "react-hot-toast";
import ConfirmationDialog from "../../components/ConfirmationDialog";
import { Customer, Employee } from "../../types/types";
import BackButton from "../../components/BackButton";
import Button from "../../components/Button";
import {
  FormInput,
  FormInputWithStatus,
  FormListbox,
} from "../../components/FormComponents";
import { api } from "../../routes/utils/api";
import LoadingSpinner from "../../components/LoadingSpinner";
import {
  isValidationRequired,
  validateCustomerIdentity,
} from "../../routes/sales/invoices/customerValidation";

interface SelectOption {
  id: string;
  name: string;
}

const CustomerFormPage: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isEditMode = !!id;

  // Add this helper function at the component level
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

  // Form state
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

  // UI state
  const initialFormDataRef = useRef<Customer>({ ...formData });
  const [isFormChanged, setIsFormChanged] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showBackConfirmation, setShowBackConfirmation] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [loading, setLoading] = useState(isEditMode);
  const [error, setError] = useState<string | null>(null);

  // Options
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

  // Form change detection
  useEffect(() => {
    const hasChanged =
      JSON.stringify(formData) !== JSON.stringify(initialFormDataRef.current);
    setIsFormChanged(hasChanged);
  }, [formData]);

  // Initial data fetching
  useEffect(() => {
    if (isEditMode) {
      fetchCustomerDetails();
    }
    fetchSalesmen();
  }, []);

  // Data fetching functions
  const fetchCustomerDetails = async () => {
    try {
      setLoading(true);
      const data = await api.get(`/api/customers/${id}`);
      const formattedData = {
        ...data,
        tin_number: data.tin_number || "",
      };
      setFormData(formattedData);
      initialFormDataRef.current = formattedData;
      setError(null);
    } catch (err) {
      setError("Failed to fetch customer details. Please try again later.");
      console.error("Error fetching customer details:", err);
    } finally {
      setLoading(false);
    }
  };

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

  // Event handlers
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

  const handleDeleteClick = () => {
    setIsDeleteDialogOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (id) {
      try {
        await api.delete(`/api/customers/${id}`);
        setIsDeleteDialogOpen(false);
        toast.success("Customer deleted successfully");
        navigate("/catalogue/customer");
      } catch (err) {
        console.error("Error deleting customer:", err);
        toast.error("Failed to delete customer. Please try again.");
      }
    }
  };

  // Form validation and submission
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

      // Proceed with saving the customer data
      if (isEditMode) {
        if (id !== formData.id) {
          await api.put(`/api/customers/${id}`, {
            ...formData,
            newId: formData.id,
          });
        } else {
          await api.put(`/api/customers/${id}`, formData);
        }
      } else {
        await api.post("/api/customers", formData);
      }

      toast.success(
        `Customer ${isEditMode ? "updated" : "created"} successfully!`
      );
      navigate("/catalogue/customer");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "An unexpected error occurred"
      );
    } finally {
      setIsSaving(false);
    }
  };

  // Render helpers
  const renderInput = (
    name: keyof Customer,
    label: string,
    type: string = "text",
    placeholder?: string
  ) => {
    const value = (() => {
      const val = formData[name];
      if (val === null || val === undefined) return "";
      return val.toString();
    })();

    // Determine if this field should show verification status
    const showStatus = name === "id_number" || name === "tin_number";

    return showStatus ? (
      <FormInputWithStatus
        name={name}
        label={label}
        value={value}
        onChange={handleInputChange}
        type={type}
        placeholder={placeholder}
        showStatus={true}
        isVerified={Boolean(
          formData.id_type && formData.id_number && formData.tin_number
        )}
      />
    ) : (
      <FormInput
        name={name}
        label={label}
        value={value}
        onChange={handleInputChange}
        type={type}
        placeholder={placeholder}
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
            {isEditMode ? "Edit Customer" : "Add New Customer"}
          </h1>
          <p className="mt-1 text-sm text-default-500">
            {isEditMode
              ? 'Edit customer information here. Click "Save" when you\'re done.'
              : 'Enter new customer information here. Click "Save" when you\'re done.'}
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

          <div className="mt-6 py-3 px-6 space-x-3 text-right">
            {isEditMode && (
              <Button
                type="button"
                color="rose"
                variant="outline"
                onClick={handleDeleteClick}
              >
                Delete
              </Button>
            )}
            <Button
              type="submit"
              variant="boldOutline"
              disabled={isSaving || !isFormChanged}
              size="lg"
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
        title="Delete Customer"
        message={`Are you sure you want to remove ${formData.name} from the customer list? This action cannot be undone.`}
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

export default CustomerFormPage;
