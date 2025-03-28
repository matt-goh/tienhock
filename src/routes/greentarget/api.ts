// Create this file: src/utils/greenTarget/api.ts
import { api } from "../utils/api";
import {
  getCachedData,
  setCachedData,
  invalidateCache,
  CACHE_KEYS,
  CACHE_EXPIRY,
} from "../../utils/greenTarget/cacheUtils";
import {
  MYINVOIS_API_BASE_URL,
  MYINVOIS_GT_CLIENT_ID,
  MYINVOIS_GT_CLIENT_SECRET,
} from "../../configs/config.js";

export const greenTargetApi = {
  // Customer endpoints
  getCustomers: async () => {
    // Try to get from cache first
    const cachedCustomers = getCachedData<any[]>(CACHE_KEYS.CUSTOMERS);
    if (cachedCustomers) {
      return cachedCustomers;
    }

    // If not in cache or expired, fetch from API
    const data = await api.get("/greentarget/api/customers");

    // Store in cache
    setCachedData(CACHE_KEYS.CUSTOMERS, data, CACHE_EXPIRY.CUSTOMERS);

    return data;
  },
  getCustomer: (id: any) => api.get(`/greentarget/api/customers/${id}`),
  createCustomer: async (data: any) => {
    const response = await api.post("/greentarget/api/customers", data);
    // Invalidate customers cache
    invalidateCache(CACHE_KEYS.CUSTOMERS);
    return response;
  },
  updateCustomer: async (id: any, data: any) => {
    const response = await api.put(`/greentarget/api/customers/${id}`, data);
    // Invalidate customers cache
    invalidateCache(CACHE_KEYS.CUSTOMERS);
    return response;
  },
  deleteCustomer: async (id: any) => {
    const response = await api.delete(`/greentarget/api/customers/${id}`);
    // Invalidate customers cache
    invalidateCache(CACHE_KEYS.CUSTOMERS);
    return response;
  },

  // Dumpster endpoints
  getDumpsters: () => api.get("/greentarget/api/dumpsters"),
  getDumpster: (id: any) => api.get(`/greentarget/api/dumpsters/${id}`),
  createDumpster: (data: any) => api.post("/greentarget/api/dumpsters", data),
  updateDumpster: (id: any, data: any) =>
    api.put(`/greentarget/api/dumpsters/${id}`, data),
  deleteDumpster: (id: any) => api.delete(`/greentarget/api/dumpsters/${id}`),

  // Rental endpoints
  getRentals: () => api.get("/greentarget/api/rentals"),
  getRental: (id: any) => api.get(`/greentarget/api/rentals/${id}`),
  createRental: (data: any) => api.post("/greentarget/api/rentals", data),
  updateRental: (id: any, data: any) =>
    api.put(`/greentarget/api/rentals/${id}`, data),
  deleteRental: (rentalId: number) =>
    api.delete(`/greentarget/api/rentals/${rentalId}`),
  generateDeliveryOrder: (rentalId: any) =>
    api.get(`/greentarget/api/rentals/${rentalId}/do`),

  // Invoice endpoints
  getInvoices: () => api.get("/greentarget/api/invoices"),
  getInvoice: (id: any) => api.get(`/greentarget/api/invoices/${id}`),
  createInvoice: (data: any) => api.post("/greentarget/api/invoices", data),
  updateInvoice: (id: any, data: any) =>
    api.put(`/greentarget/api/invoices/${id}`, data),
  deleteInvoice: (id: any) => api.delete(`/greentarget/api/invoices/${id}`),

  // e-Invoice endpoints
  submitEInvoice: async (invoiceId: number) => {
    try {
      const response = await api.post(
        `/greentarget/api/einvoice/submit/${invoiceId}`,
        {
          clientConfig: {
            MYINVOIS_API_BASE_URL,
            MYINVOIS_GT_CLIENT_ID,
            MYINVOIS_GT_CLIENT_SECRET,
          },
        }
      );
      return response;
    } catch (error) {
      console.error("Error submitting e-Invoice:", error);
      throw error;
    }
  },

  getEInvoiceStatus: (uuid: string) =>
    api.get(`/greentarget/api/einvoice/status/${uuid}`),

  checkEInvoiceForInvoice: (invoiceId: number) =>
    api.get(`/greentarget/api/einvoice/check/${invoiceId}`),

  // Payment endpoints
  getPayments: () => api.get("/greentarget/api/payments"),
  getPaymentsByInvoice: (invoiceId: any) =>
    api.get(`/greentarget/api/invoices/${invoiceId}/payments`),
  createPayment: (data: any) => api.post("/greentarget/api/payments", data),
  updatePayment: (id: any, data: any) =>
    api.put(`/greentarget/api/payments/${id}`, data),
  deletePayment: (paymentId: number) =>
    api.delete(`/greentarget/api/payments/${paymentId}`),

  // Location endpoints
  getLocationsByCustomer: (customerId: any) =>
    api.get(`/greentarget/api/customers/${customerId}/locations`),
  createLocation: async (data: any) => {
    const response = await api.post("/greentarget/api/locations", data);
    // Invalidate customers cache since locations are related
    invalidateCache(CACHE_KEYS.CUSTOMERS);
    return response;
  },
  updateLocation: async (id: any, data: any) => {
    const response = await api.put(`/greentarget/api/locations/${id}`, data);
    // Invalidate customers cache
    invalidateCache(CACHE_KEYS.CUSTOMERS);
    return response;
  },
  deleteLocation: async (id: any) => {
    const response = await api.delete(`/greentarget/api/locations/${id}`);
    // Invalidate customers cache
    invalidateCache(CACHE_KEYS.CUSTOMERS);
    return response;
  },

  // Debtors endpoints
  getDebtorsReport: () => api.get("/greentarget/api/payments/debtors"),
};
