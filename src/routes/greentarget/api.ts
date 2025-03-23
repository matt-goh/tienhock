// Create this file: src/utils/greenTarget/api.ts

import { api } from "../utils/api";

export const greenTargetApi = {
  // Customer endpoints
  getCustomers: () => api.get("/greentarget/api/customers"),
  getCustomer: (id: any) => api.get(`/greentarget/api/customers/${id}`),
  createCustomer: (data: any) => api.post("/greentarget/api/customers", data),
  updateCustomer: (id: any, data: any) =>
    api.put(`/greentarget/api/customers/${id}`, data),
  deleteCustomer: (id: any) => api.delete(`/greentarget/api/customers/${id}`),

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
  deleteRental: (id: any) => api.delete(`/greentarget/api/rentals/${id}`),
  generateDeliveryOrder: (rentalId: any) =>
    api.get(`/greentarget/api/rentals/${rentalId}/do`),

  // Invoice endpoints
  getInvoices: () => api.get("/greentarget/api/invoices"),
  getInvoice: (id: any) => api.get(`/greentarget/api/invoices/${id}`),
  createInvoice: (data: any) => api.post("/greentarget/api/invoices", data),
  updateInvoice: (id: any, data: any) =>
    api.put(`/greentarget/api/invoices/${id}`, data),
  deleteInvoice: (id: any) => api.delete(`/greentarget/api/invoices/${id}`),

  // Payment endpoints
  getPayments: () => api.get("/greentarget/api/payments"),
  getPaymentsByInvoice: (invoiceId: any) =>
    api.get(`/greentarget/api/invoices/${invoiceId}/payments`),
  createPayment: (data: any) => api.post("/greentarget/api/payments", data),
  updatePayment: (id: any, data: any) =>
    api.put(`/greentarget/api/payments/${id}`, data),
  deletePayment: (id: any) => api.delete(`/greentarget/api/payments/${id}`),

  // Location endpoints
  getLocationsByCustomer: (customerId: any) =>
    api.get(`/greentarget/api/customers/${customerId}/locations`),
  createLocation: (data: any) => api.post("/greentarget/api/locations", data),
  updateLocation: (id: any, data: any) =>
    api.put(`/greentarget/api/locations/${id}`, data),
  deleteLocation: (id: any) => api.delete(`/greentarget/api/locations/${id}`),

  // Debtors endpoints
  getDebtorsReport: () => api.get("/greentarget/api/payments/debtors"),
};
