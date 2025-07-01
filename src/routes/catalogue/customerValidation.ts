// src/utils/customerValidation.ts
import toast from "react-hot-toast";
import { Customer } from "../../types/types";
import { api } from "../utils/api";

interface ValidationResponse {
  isValid: boolean;
  message?: string;
  hasPhoneWarning?: boolean;
}

export async function validateCustomerIdentity(
  customer: Customer
): Promise<ValidationResponse> {
  // Check if ID type is assigned
  if (!customer.id_type || customer.id_type === "Select") {
    toast.error("Please select an ID type");
    return {
      isValid: false,
      message: "ID type is required",
    };
  }

  // Check if both TIN number and ID number are present
  if (!customer.tin_number || !customer.id_number) {
    toast.error("Both TIN number and ID number are required");
    return {
      isValid: false,
      message: "TIN number and ID number are required",
    };
  }

  // Check phone number and show warning if missing
  let hasPhoneWarning = false;
  if (!customer.phone_number || customer.phone_number.trim() === "") {
    toast(" Phone number is needed for e-Invoice compliance", {
      icon: "⚠️",
      style: {
        borderLeft: "4px solid #f59e0b",
        backgroundColor: "#fef3c7",
      },
      duration: 4000,
    });
    hasPhoneWarning = true;
  }

  try {
    const response = await api.get(
      `/api/customer-validation/validate/${customer.tin_number}?idType=${customer.id_type}&idValue=${customer.id_number}`
    );

    if (response.success) {
      const successMessage = hasPhoneWarning
        ? "Customer e-Invoice IDs validated successfully (phone number needed)"
        : "Customer e-Invoice IDs validated successfully";

      toast.success(successMessage);
      return {
        isValid: true,
        message: "Validation successful",
        hasPhoneWarning,
      };
    }

    // If we get here, something went wrong but didn't throw an error
    toast.error(response.message || "Validation failed");
    return {
      isValid: false,
      message: response.message || "Validation failed",
      hasPhoneWarning,
    };
  } catch (error: any) {
    console.error("Validation API Error:", error);

    // The error should now contain the custom message from the backend
    toast.error(error.message || "Failed to validate customer identity");
    return {
      isValid: false,
      message:
        error.message || "An unexpected error occurred during validation",
      hasPhoneWarning,
    };
  }
}
