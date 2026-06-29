import {
  IconDeviceDesktopAnalytics,
  IconFileInvoice,
  IconReportAnalytics,
  IconTrash,
  IconTruck,
  IconUsers,
  IconCash,
  IconReceipt,
  IconFileText,
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
import GTPayrollDetailsPage from "./GreenTarget/Payroll/GTPayrollDetailsPage";
import PayrollRulesPage from "./GreenTarget/Payroll/PayrollRulesPage";
import GTMidMonthPayrollPage from "./GreenTarget/Payroll/GTMidMonthPayrollPage";
import GTPinjamListPage from "./GreenTarget/Payroll/GTPinjamListPage";
import GTBonusPage from "./GreenTarget/Payroll/GTBonusPage";
import GTOthersAdvancePage from "./GreenTarget/Payroll/GTOthersAdvancePage";
import GTOthersKerjaLuarOtPage from "./GreenTarget/Payroll/GTOthersKerjaLuarOtPage";
import GTAdjustmentDocsListPage from "./GreenTarget/AdjustmentDocs/GTAdjustmentDocsListPage";
import GTAdjustmentDocsFormPage from "./GreenTarget/AdjustmentDocs/GTAdjustmentDocsFormPage";
import GTAdjustmentDocsDetailsPage from "./GreenTarget/AdjustmentDocs/GTAdjustmentDocsDetailsPage";

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
    name: "Documents",
    icon: IconFileText,
    path: "/adjustment-docs",
    component: GTAdjustmentDocsListPage,
    subItems: [
      {
        name: "Create Adjustment Document",
        path: "/adjustment-docs/new",
        component: GTAdjustmentDocsFormPage,
        showInPopover: true,
      },
      {
        name: "Adjustment Document Details",
        path: "/adjustment-docs/:id",
        component: GTAdjustmentDocsDetailsPage,
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
    subItems: [
      {
        name: "Monthly Payroll",
        path: "/payroll",
        component: GTPayrollPage,
        subItems: [
          {
            name: "Payroll Details",
            path: "/payroll/details/:id",
            component: GTPayrollDetailsPage,
          },
        ],
      },
      {
        name: "Office",
        path: "/payroll/office-log",
        component: GTMonthlyLogEntryPage,
      },
      {
        name: "Bonus",
        path: "/payroll/bonus",
        component: GTBonusPage,
      },
      {
        name: "Others (Advance)",
        path: "/payroll/others-advance",
        component: GTOthersAdvancePage,
      },
      {
        name: "Others (Kerja Luar OT)",
        path: "/payroll/others",
        component: GTOthersKerjaLuarOtPage,
      },
      {
        name: "Mid-month Payroll",
        path: "/payroll/mid-month",
        component: GTMidMonthPayrollPage,
      },
      {
        name: "Pinjam",
        path: "/payroll/pinjam",
        component: GTPinjamListPage,
      },
      {
        name: "Payroll Settings",
        path: "/payroll/settings",
        component: PayrollRulesPage,
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
