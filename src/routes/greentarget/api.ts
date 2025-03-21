// Create this file: src/utils/greenTarget/api.ts

import { api } from "../utils/api";

export const greenTargetApi = {
  // Customer endpoints
  getCustomers: () => api.get("/greentarget/customers"),
  getCustomer: (id: any) => api.get(`/greentarget/customers/${id}`),
  createCustomer: (data: any) => api.post("/greentarget/customers", data),
  updateCustomer: (id: any, data: any) =>
    api.put(`/greentarget/customers/${id}`, data),
  deleteCustomer: (id: any) => api.delete(`/greentarget/customers/${id}`),

  // Dumpster endpoints
  getDumpsters: () => api.get("/greentarget/dumpsters"),
  getDumpster: (id: any) => api.get(`/greentarget/dumpsters/${id}`),
  createDumpster: (data: any) => api.post("/greentarget/dumpsters", data),
  updateDumpster: (id: any, data: any) =>
    api.put(`/greentarget/dumpsters/${id}`, data),
  deleteDumpster: (id: any) => api.delete(`/greentarget/dumpsters/${id}`),

  // Rental endpoints
  getRentals: () => api.get("/greentarget/rentals"),
  getRental: (id: any) => api.get(`/greentarget/rentals/${id}`),
  createRental: (data: any) => api.post("/greentarget/rentals", data),
  updateRental: (id: any, data: any) =>
    api.put(`/greentarget/rentals/${id}`, data),
  deleteRental: (id: any) => api.delete(`/greentarget/rentals/${id}`),
  generateDeliveryOrder: (rentalId: any) =>
    api.get(`/greentarget/rentals/${rentalId}/do`),

  // Invoice endpoints
  getInvoices: () => api.get("/greentarget/invoices"),
  getInvoice: (id: any) => api.get(`/greentarget/invoices/${id}`),
  createInvoice: (data: any) => api.post("/greentarget/invoices", data),
  updateInvoice: (id: any, data: any) =>
    api.put(`/greentarget/invoices/${id}`, data),
  deleteInvoice: (id: any) => api.delete(`/greentarget/invoices/${id}`),

  // Payment endpoints
  getPayments: () => api.get("/greentarget/payments"),
  getPaymentsByInvoice: (invoiceId: any) =>
    api.get(`/greentarget/invoices/${invoiceId}/payments`),
  createPayment: (data: any) => api.post("/greentarget/payments", data),
  updatePayment: (id: any, data: any) =>
    api.put(`/greentarget/payments/${id}`, data),
  deletePayment: (id: any) => api.delete(`/greentarget/payments/${id}`),

  // Location endpoints
  getLocationsByCustomer: (customerId: any) =>
    api.get(`/greentarget/customers/${customerId}/locations`),
  createLocation: (data: any) => api.post("/greentarget/locations", data),
  updateLocation: (id: any, data: any) =>
    api.put(`/greentarget/locations/${id}`, data),
  deleteLocation: (id: any) => api.delete(`/greentarget/locations/${id}`),

  // Report endpoints
  getDebtorsReport: () => api.get("/greentarget/reports/debtors"),
};
