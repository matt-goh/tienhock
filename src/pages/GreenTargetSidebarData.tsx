import {
  IconDeviceDesktopAnalytics,
  IconFileInvoice,
  IconReportAnalytics,
  IconTrash,
  IconTruck,
  IconUsers,
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

export const GreenTargetSidebarData: SidebarItem[] = [
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
        name: "New Rental",
        path: "/rentals/new",
        component: GreenTargetRentalFormPage,
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
        name: "New Invoice",
        path: "/invoices/new",
        component: GreenTargetInvoiceFormPage,
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
    name: "Reports",
    icon: IconReportAnalytics,
    path: "/debtors", // Make reports go directly to debtors for now
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
      },
      {
        name: "Edit Dumpster",
        path: "/dumpsters/:id",
        component: GreenTargetDumpsterFormPage,
      },
    ],
  },
];
