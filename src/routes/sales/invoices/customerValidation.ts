// src/utils/customerValidation.ts
import toast from "react-hot-toast";
import { Customer } from "../../../types/types";
import { api } from "../../utils/api";

interface ValidationResponse {
  isValid: boolean;
  message?: string;
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

  try {
    const response = await api.get(
      `/api/customer-validation/validate/${customer.tin_number}?idType=${customer.id_type}&idValue=${customer.id_number}`
    );

    if (response.success) {
      toast.success("Customer identity validated successfully");
      return {
        isValid: true,
        message: "Validation successful",
      };
    }

    // If we get here, something went wrong but didn't throw an error
    toast.error(response.message || "Validation failed");
    return {
      isValid: false,
      message: response.message || "Validation failed",
    };
  } catch (error: any) {
    console.error("Validation API Error:", error);

    // The error should now contain the custom message from the backend
    toast.error(error.message || "Failed to validate customer identity");
    return {
      isValid: false,
      message:
        error.message || "An unexpected error occurred during validation",
    };
  }
}