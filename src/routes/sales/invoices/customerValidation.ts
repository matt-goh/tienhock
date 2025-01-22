// src/utils/customerValidation.ts
import toast from 'react-hot-toast';
import { Customer } from '../../../types/types';
import { api } from '../../utils/api';

interface ValidationResponse {
  isValid: boolean;
  message?: string;
  apiResponse?: any;
}

export async function validateCustomerIdentity(customer: Customer): Promise<ValidationResponse> {
  // Check if ID type is assigned
  if (!customer.id_type) {
    toast.error('Please select an ID type');
    return {
      isValid: false,
      message: 'ID type is required'
    };
  }

  // Check if both TIN number and ID number are present
  if (!customer.tin_number || !customer.id_number) {
    toast.error('Both TIN number and ID number are required');
    return {
      isValid: false,
      message: 'TIN number and ID number are required'
    };
  }

  try {
    // Make API call to validate using api.get utility
    const response = await api.get(
      `/api/v1.0/taxpayer/validate/${customer.tin_number}?idType=${customer.id_type}&idValue=${customer.id_number}`
    );
    
    console.log('Validation API Response:', response);
    
    // Since api.get already handles non-200 responses by throwing errors,
    // if we reach here it means validation was successful
    toast.success('Customer identity validated successfully');
    return {
      isValid: true,
      message: 'Validation successful',
      apiResponse: response
    };

  } catch (error: any) {
    console.error('Validation API Error:', error);
    
    // Handle specific error cases based on status code
    const statusCode = error.status || error.statusCode;
    
    switch (statusCode) {
      case 400:
        toast.error('Invalid TIN number or ID format');
        return {
          isValid: false,
          message: 'The provided TIN number or ID format is invalid',
          apiResponse: error
        };

      case 404:
        toast.error('Invalid TIN and ID combination');
        return {
          isValid: false,
          message: 'The provided TIN number and ID combination is not valid',
          apiResponse: error
        };

      default:
        toast.error('Failed to validate customer identity');
        return {
          isValid: false,
          message: 'An unexpected error occurred during validation',
          apiResponse: error
        };
    }
  }
}

// Helper function to check if validation is required
export function isValidationRequired(customer: Customer): boolean {
  return Boolean(customer.id_type && customer.tin_number && customer.id_number);
}