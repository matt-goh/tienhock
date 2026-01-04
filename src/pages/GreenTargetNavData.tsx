import {
  IconDeviceDesktopAnalytics,
  IconFileInvoice,
  IconReportAnalytics,
  IconTrash,
  IconTruck,
  IconUsers,
  IconCash,
  IconReceipt,
} from "@tabler/icons-react";
import { SidebarItem } from "./pagesRoute";

import GreenTargetCustomerListPage from "./GreenTarget/Customers/CustomerListPage";
import GreenTargetCustomerFormPage from "./GreenTarget/Customers/CustomerFormPage";
import GreenTargetDumpsterListPage from "./GreenTarget/Dumpsters/DumpsterListPage";
import GreenTargetDumpsterFormPage from "./GreenTarget/Dumpsters/DumpsterFormPage";
import GreenTargetRentalListPage from "./GreenTarget/Rentals/RentalListPage";
import GreenTargetRentalFormPage from "./GreenTarget/Rentals/RentalFormPage";
import GreenTargetDeliveryOrderPage from "./GreenTarget/Rentals/DeliveryOrderPage";
import GreenTargetInvoiceListPage from "./GreenTarget/Invoices/InvoiceListPage";
import GreenTargetInvoiceFormPage from "./GreenTarget/Invoices/InvoiceFormPage";
import GreenTargetInvoiceDetailsPage from "./GreenTarget/Invoices/InvoiceDetailsPage";
import GreenTargetDebtorsReportPage from "./GreenTarget/DebtorsReportPage";
import GreenTargetDashboardPage from "./GreenTarget/GreenTargetDashboardPage";
import GreenTargetPaymentPage from "./GreenTarget/Payments/GreenTargetPaymentPage";
import GTPayrollPage from "./GreenTarget/Payroll/GTPayrollPage";
import GTMonthlyLogEntryPage from "./GreenTarget/Payroll/GTMonthlyLogEntryPage";
import DriverTripEntryPage from "./GreenTarget/Payroll/DriverTripEntryPage";
import GTPayrollDetailsPage from "./GreenTarget/Payroll/GTPayrollDetailsPage";

export const GreenTargetNavData: SidebarItem[] = [
  {
    name: "Dashboard",
    icon: IconDeviceDesktopAnalytics, // Make sure to import this icon
    path: "/dashboard",
    component: GreenTargetDashboardPage,
  },
  {
    name: "Rentals",
    icon: IconTruck,
    path: "/rentals",
    component: GreenTargetRentalListPage,
    subItems: [
      {
        name: "Create Rental",
        path: "/rentals/new",
        component: GreenTargetRentalFormPage,
        showInPopover: true,
      },
      {
        name: "Edit Rental",
        path: "/rentals/:id",
        component: GreenTargetRentalFormPage,
      },
      {
        name: "Delivery Order",
        path: "/rentals/:id/delivery-order",
        component: GreenTargetDeliveryOrderPage,
      },
    ],
  },
  {
    name: "Invoices",
    icon: IconFileInvoice,
    path: "/invoices",
    component: GreenTargetInvoiceListPage,
    subItems: [
      {
        name: "Create Invoice",
        path: "/invoices/new",
        component: GreenTargetInvoiceFormPage,
        showInPopover: true,
      },
      {
        name: "Edit Invoice",
        path: "/invoices/:id/edit",
        component: GreenTargetInvoiceFormPage,
      },
      {
        name: "Invoice Details",
        path: "/invoices/:id",
        component: GreenTargetInvoiceDetailsPage,
      },
    ],
  },
  {
    name: "Payments",
    icon: IconCash,
    path: "/payments",
    component: GreenTargetPaymentPage,
  },
  {
    name: "Payroll",
    icon: IconReceipt,
    path: "/payroll",
    component: GTPayrollPage,
    subItems: [
      {
        name: "OFFICE Work Log",
        path: "/payroll/office-log",
        component: GTMonthlyLogEntryPage,
        showInPopover: true,
      },
      {
        name: "Driver Trips",
        path: "/payroll/driver-trips",
        component: DriverTripEntryPage,
        showInPopover: true,
      },
      {
        name: "Payroll Details",
        path: "/payroll/details/:id",
        component: GTPayrollDetailsPage,
      },
    ],
  },
  {
    name: "Debtors",
    icon: IconReportAnalytics,
    path: "/debtors",
    component: GreenTargetDebtorsReportPage,
  },
  {
    name: "Customers",
    icon: IconUsers,
    path: "/customers",
    component: GreenTargetCustomerListPage,
    subItems: [
      {
        name: "Add Customer",
        path: "/customers/new",
        component: GreenTargetCustomerFormPage,
        showInPopover: true,
      },
      {
        name: "Edit Customer",
        path: "/customers/:id",
        component: GreenTargetCustomerFormPage,
      },
    ],
  },
  {
    name: "Dumpsters",
    icon: IconTrash,
    path: "/dumpsters",
    component: GreenTargetDumpsterListPage,
    subItems: [
      {
        name: "Add Dumpster",
        path: "/dumpsters/new",
        component: GreenTargetDumpsterFormPage,
        showInPopover: true,
      },
      {
        name: "Edit Dumpster",
        path: "/dumpsters/:id",
        component: GreenTargetDumpsterFormPage,
      },
    ],
  },
];
