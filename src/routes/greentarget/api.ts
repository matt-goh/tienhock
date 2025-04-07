// Create this file: src/utils/greenTarget/api.ts
import { api } from "../utils/api";
import {
  getCachedData,
  setCachedData,
  invalidateCache,
  CACHE_KEYS,
  CACHE_EXPIRY,
} from "../../utils/greenTarget/cacheUtils";

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
  cancelInvoice: (id: number, reason?: string) =>
    api.put(`/greentarget/api/invoices/${id}/cancel`, { reason }),

  // e-Invoice endpoints
  submitEInvoice: async (invoiceId: number) => {
    try {
      const response = await api.post(
        `/greentarget/api/einvoice/submit/${invoiceId}`
      );
      return response;
    } catch (error) {
      console.error("Error submitting e-Invoice:", error);
      throw error;
    }
  },
  checkEInvoiceStatus: (invoiceId: number) =>
    api.put(`/greentarget/api/einvoice/${invoiceId}/check-einvoice-status`),
  syncEInvoiceCancellation: (invoiceId: number) =>
    api.put(`/greentarget/api/einvoice/${invoiceId}/sync-cancellation`),

  // Payment endpoints
  getPayments: (includeCancelled = false) =>
    api.get(
      `/greentarget/api/payments${
        includeCancelled ? "?include_cancelled=true" : ""
      }`
    ),
  getPaymentsByInvoice: (invoiceId: any, includeCancelled = false) =>
    api.get(
      `/greentarget/api/invoices/${invoiceId}/payments${
        includeCancelled ? "?include_cancelled=true" : ""
      }`
    ),
  cancelPayment: (paymentId: number, reason?: string) =>
    api.put(`/greentarget/api/payments/${paymentId}/cancel`, { reason }),
  createPayment: (data: any) => api.post("/greentarget/api/payments", data),
  updatePayment: (id: any, data: any) =>
    api.put(`/greentarget/api/payments/${id}`, data),

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
