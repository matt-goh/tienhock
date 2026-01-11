// src/utils/greenTarget/api.ts
import { api } from "../utils/api";
import {
  getCachedData,
  setCachedData,
  invalidateCache,
  CACHE_KEYS,
  CACHE_EXPIRY,
} from "../../utils/greenTarget/cacheUtils";

export const greenTargetApi = {
  // Generic request method
  request: (method: "GET" | "POST" | "PUT" | "DELETE", url: string, data?: any) => {
    switch (method) {
      case "GET":
        return api.get(url);
      case "POST":
        return api.post(url, data);
      case "PUT":
        return api.put(url, data);
      case "DELETE":
        return api.delete(url);
      default:
        throw new Error(`Unsupported method: ${method}`);
    }
  },

  // Dashboard endpoints
  getDashboardMetrics: () => api.get("/greentarget/api/dashboard"),
  getDashboardActivities: (limit: number = 10) =>
    api.get(`/greentarget/api/dashboard/activities?limit=${limit}`),

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
  getInvoices: (
    filters: {
      customer_id?: string | number;
      start_date?: string;
      end_date?: string;
      status?: string;
    } = {}
  ) => {
    // Build query string from filters
    const queryParams = new URLSearchParams();

    if (filters.customer_id) {
      queryParams.append("customer_id", filters.customer_id.toString());
    }

    if (filters.start_date) {
      queryParams.append("start_date", filters.start_date);
    }

    if (filters.end_date) {
      queryParams.append("end_date", filters.end_date);
    }

    if (filters.status) {
      queryParams.append("status", filters.status);
    }

    const queryString = queryParams.toString();
    return api.get(
      `/greentarget/api/invoices${queryString ? `?${queryString}` : ""}`
    );
  },
  getInvoice: (id: any) => api.get(`/greentarget/api/invoices/${id}`),
  getBatchInvoices: (ids: number[]) => {
    if (!ids || ids.length === 0) return Promise.resolve([]);
    return api.get(`/greentarget/api/invoices/batch?ids=${ids.join(",")}`);
  },
  createInvoice: (data: any) => api.post("/greentarget/api/invoices", data),
  updateInvoice: (id: any, data: any) =>
    api.put(`/greentarget/api/invoices/${id}`, data),
  cancelInvoice: (id: number, reason?: string) =>
    api.put(`/greentarget/api/invoices/${id}/cancel`, { reason }),
  deleteInvoice: (id: number) => api.delete(`/greentarget/api/invoices/${id}`),
  checkInvoiceNumber: (invoiceNumber: string, excludeId?: number) =>
    api.get(
      `/greentarget/api/invoices/check-number/${encodeURIComponent(
        invoiceNumber
      )}${excludeId ? `?exclude_id=${excludeId}` : ""}`
    ),

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
  getPayments: (
    options: {
      invoice_id?: string | number;
      includeCancelled?: boolean;
      customer_id?: string | number;
      startDate?: string;
      endDate?: string;
      paymentMethod?: string;
      status?: string;
      search?: string;
    } = {}
  ) => {
    const queryParams = new URLSearchParams();

    if (options.invoice_id) {
      queryParams.append("invoice_id", options.invoice_id.toString());
    }

    if (options.includeCancelled) {
      queryParams.append("include_cancelled", "true");
    }

    if (options.customer_id) {
      queryParams.append("customer_id", options.customer_id.toString());
    }

    if (options.startDate) {
      queryParams.append("startDate", options.startDate);
    }

    if (options.endDate) {
      queryParams.append("endDate", options.endDate);
    }

    if (options.paymentMethod) {
      queryParams.append("paymentMethod", options.paymentMethod);
    }

    if (options.status) {
      queryParams.append("status", options.status);
    }

    if (options.search) {
      queryParams.append("search", options.search);
    }

    const queryString = queryParams.toString();
    return api.get(
      `/greentarget/api/payments${queryString ? `?${queryString}` : ""}`
    );
  },
  getPaymentsByInvoice: (invoiceId: any, includeCancelled = false) =>
    api.get(
      `/greentarget/api/invoices/${invoiceId}/payments${
        includeCancelled ? "?include_cancelled=true" : ""
      }`
    ),
  checkInternalPaymentRef: (ref: string, excludePaymentId: number) =>
    api.get(
      `/greentarget/api/payments/check-internal-ref/${encodeURIComponent(
        ref
      )}?exclude_payment_id=${excludePaymentId}`
    ),
  cancelPayment: (paymentId: number, reason?: string) =>
    api.put(`/greentarget/api/payments/${paymentId}/cancel`, { reason }),
  confirmPayment: (paymentId: number) =>
    api.put(`/greentarget/api/payments/${paymentId}/confirm`),
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

  // Pickup destinations endpoints
  getPickupDestinations: (includeInactive = false) =>
    api.get(
      `/greentarget/api/pickup-destinations${
        includeInactive ? "?include_inactive=true" : ""
      }`
    ),
  createPickupDestination: (data: {
    code: string;
    name: string;
    is_default?: boolean;
    sort_order?: number;
  }) => api.post("/greentarget/api/pickup-destinations", data),
  updatePickupDestination: (
    id: number,
    data: {
      code?: string;
      name?: string;
      is_default?: boolean;
      sort_order?: number;
      is_active?: boolean;
    }
  ) => api.put(`/greentarget/api/pickup-destinations/${id}`, data),
  deletePickupDestination: (id: number, permanent = false) =>
    api.delete(
      `/greentarget/api/pickup-destinations/${id}${
        permanent ? "?permanent=true" : ""
      }`
    ),

  // Payroll rules endpoints
  getPayrollRules: (ruleType?: "PLACEMENT" | "PICKUP", includeInactive = false) => {
    const params = new URLSearchParams();
    if (ruleType) params.append("rule_type", ruleType);
    if (includeInactive) params.append("include_inactive", "true");
    const queryString = params.toString();
    return api.get(
      `/greentarget/api/payroll-rules${queryString ? `?${queryString}` : ""}`
    );
  },
  createPayrollRule: (data: {
    rule_type: "PLACEMENT" | "PICKUP";
    condition_field: string;
    condition_operator: string;
    condition_value?: string;
    secondary_condition_field?: string;
    secondary_condition_operator?: string;
    secondary_condition_value?: string;
    pay_code_id: string;
    priority?: number;
    description?: string;
  }) => api.post("/greentarget/api/payroll-rules", data),
  updatePayrollRule: (id: number, data: any) =>
    api.put(`/greentarget/api/payroll-rules/${id}`, data),
  deletePayrollRule: (id: number) =>
    api.delete(`/greentarget/api/payroll-rules/${id}`),
  evaluatePayrollRule: (
    ruleType: "PLACEMENT" | "PICKUP",
    invoiceAmount?: number,
    destination?: string
  ) => {
    const params = new URLSearchParams();
    if (invoiceAmount !== undefined)
      params.append("invoice_amount", invoiceAmount.toString());
    if (destination) params.append("destination", destination);
    return api.get(
      `/greentarget/api/payroll-rules/evaluate/${ruleType}?${params.toString()}`
    );
  },
  getAddonPaycodes: () => api.get("/greentarget/api/payroll-rules/addon-paycodes/list"),
  getPayrollSettings: () => api.get("/greentarget/api/payroll-rules/settings/all"),
  updatePayrollSetting: (key: string, value: string) =>
    api.put(`/greentarget/api/payroll-rules/settings/${key}`, { value }),

  // Rental addons endpoints
  getRentalAddons: (rentalId: number) =>
    api.get(`/greentarget/api/rental-addons/rentals/${rentalId}/addons`),
  createRentalAddon: (
    rentalId: number,
    data: {
      pay_code_id: string;
      quantity?: number;
      amount?: number;
      notes?: string;
      created_by?: string;
    }
  ) => api.post(`/greentarget/api/rental-addons/rentals/${rentalId}/addons`, data),
  updateRentalAddon: (
    id: number,
    data: { quantity?: number; amount?: number; notes?: string }
  ) => api.put(`/greentarget/api/rental-addons/${id}`, data),
  deleteRentalAddon: (id: number) =>
    api.delete(`/greentarget/api/rental-addons/${id}`),
  getBatchRentalAddons: (rentalIds: number[]) =>
    api.post("/greentarget/api/rental-addons/batch", { rental_ids: rentalIds }),
};
