import {
  IconDeviceDesktopAnalytics,
  IconFileInvoice,
  IconReportMoney,
  IconTrash,
  IconTruck,
  IconUsers,
  IconReceipt,
} from "@tabler/icons-react";
import { SidebarItem } from "./pagesRoute";

import GreenTargetCustomerListPage from "./GreenTarget/Customers/CustomerListPage";
import GreenTargetCustomerFormPage from "./GreenTarget/Customers/CustomerFormPage";
import GreenTargetDumpsterListPage from "./GreenTarget/Dumpsters/DumpsterListPage";
import GreenTargetDumpsterFormPage from "./GreenTarget/Dumpsters/DumpsterFormPage";
import GreenTargetRentalListPage from "./GreenTarget/Rentals/RentalListPage";
import GreenTargetRentalFormPage from "./GreenTarget/Rentals/RentalFormPage";
import GreenTargetRentalDetailsPage from "./GreenTarget/Rentals/RentalDetailsPage";
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
import GTDailyLoriHabukEntryPage from "./GreenTarget/Payroll/GTDailyLoriHabukEntryPage";
import GTSalaryReportPage from "./GreenTarget/Payroll/GTSalaryReportPage";
import GTCutiReportPage from "./GreenTarget/Payroll/GTCutiReportPage";
import GTECarumanPage from "./GreenTarget/Payroll/GTECarumanPage";
import GTPayRatesPage from "./GreenTarget/Payroll/GTPayRatesPage";
import GTAdjustmentDocsListPage from "./GreenTarget/AdjustmentDocs/GTAdjustmentDocsListPage";
import GTAdjustmentDocsFormPage from "./GreenTarget/AdjustmentDocs/GTAdjustmentDocsFormPage";
import GTAdjustmentDocsDetailsPage from "./GreenTarget/AdjustmentDocs/GTAdjustmentDocsDetailsPage";
import GTJournalEntryListPage from "./GreenTarget/Accounting/GTJournalEntryListPage";
import GTJournalDetailsPage from "./GreenTarget/Accounting/GTJournalDetailsPage";
import GTJournalEntryPage from "./GreenTarget/Accounting/GTJournalEntryPage";
import GTAccountLedgerPage from "./GreenTarget/Accounting/GTAccountLedgerPage";
import GTTrialBalancePage from "./GreenTarget/Accounting/GTTrialBalancePage";
import GTIncomeStatementPage from "./GreenTarget/Accounting/GTIncomeStatementPage";
import GTBalanceSheetPage from "./GreenTarget/Accounting/GTBalanceSheetPage";
import GTAccountCodeListPage from "./GreenTarget/Accounting/GTAccountCodeListPage";
import GTAccountCodeFormPage from "./GreenTarget/Accounting/GTAccountCodeFormPage";
import GTOpeningBalancesPage from "./GreenTarget/Accounting/GTOpeningBalancesPage";
import GTVoucherGeneratorPage from "./GreenTarget/Accounting/GTVoucherGeneratorPage";
import GTDebtorSubSchedulePage from "./GreenTarget/Accounting/GTDebtorSubSchedulePage";

// Top-level order mirrors the other two companies (Tien Hock / Jelly Polly):
// Accounting -> Payroll -> Sales -> operational/catalogue menus.
export const GreenTargetNavData: SidebarItem[] = [
  {
    name: "Dashboard",
    icon: IconDeviceDesktopAnalytics, // Make sure to import this icon
    path: "/dashboard",
    component: GreenTargetDashboardPage,
  },
  {
    name: "Accounting",
    icon: IconReportMoney,
    subItems: [
      {
        name: "Journal Entries",
        path: "/accounting/journal-entries",
        component: GTJournalEntryListPage,
        group: "Generation",
        subItems: [
          {
            name: "New Entry",
            path: "/accounting/journal-entries/new",
            component: GTJournalEntryPage,
            showInPopover: true,
          },
          {
            name: "Journal Details",
            path: "/accounting/journal-entries/:id",
            component: GTJournalDetailsPage,
          },
          {
            name: "Edit Entry",
            path: "/accounting/journal-entries/:id/edit",
            component: GTJournalEntryPage,
          },
        ],
      },
      {
        name: "Voucher Generator",
        path: "/accounting/voucher-generator",
        component: GTVoucherGeneratorPage,
        group: "Generation",
      },
      {
        name: "Account Ledger",
        path: "/accounting/reports/account-ledger",
        component: GTAccountLedgerPage,
        group: "Reports",
      },
      {
        name: "Debtors",
        path: "/debtors",
        component: GreenTargetDebtorsReportPage,
        group: "Reports",
        subItems: [
          {
            name: "CD/SD Child Schedule",
            path: "/debtors/cd-sd",
            component: GTDebtorSubSchedulePage,
          },
        ],
      },
      {
        name: "Trial Balance",
        path: "/accounting/reports/trial-balance",
        component: GTTrialBalancePage,
        group: "Reports",
      },
      {
        name: "Income Statement",
        path: "/accounting/reports/income-statement",
        component: GTIncomeStatementPage,
        group: "Reports",
      },
      {
        name: "Balance Sheet",
        path: "/accounting/reports/balance-sheet",
        component: GTBalanceSheetPage,
        group: "Reports",
      },
      {
        name: "Chart of Accounts",
        path: "/accounting/account-codes",
        component: GTAccountCodeListPage,
        group: "Setup",
        subItems: [
          {
            name: "New Account",
            path: "/accounting/account-codes/new",
            component: GTAccountCodeFormPage,
            showInPopover: true,
          },
          {
            name: "Edit Account",
            path: "/accounting/account-codes/:code",
            component: GTAccountCodeFormPage,
          },
        ],
      },
      {
        name: "Opening Balances",
        path: "/accounting/opening-balances",
        component: GTOpeningBalancesPage,
        group: "Setup",
      },
    ],
  },
  {
    name: "Payroll",
    icon: IconReceipt,
    subItems: [
      {
        name: "Payrolls",
        path: "/payroll",
        component: GTPayrollPage,
        group: "Payroll",
        subItems: [
          {
            name: "Payroll Details",
            path: "/payroll/details/:id",
            component: GTPayrollDetailsPage,
          },
        ],
      },
      {
        name: "Salary Report",
        path: "/payroll/salary-report",
        component: GTSalaryReportPage,
        group: "Payroll",
      },
      {
        name: "Cuti Report",
        path: "/payroll/cuti-report",
        component: GTCutiReportPage,
        group: "Payroll",
      },
      {
        name: "E-Caruman",
        path: "/payroll/e-caruman",
        component: GTECarumanPage,
        group: "Payroll",
      },
      {
        name: "Office",
        path: "/payroll/office-log",
        component: GTMonthlyLogEntryPage,
        group: "Work Logs",
      },
      {
        name: "Daily Lori Habuk",
        path: "/payroll/daily-lori-habuk",
        component: GTDailyLoriHabukEntryPage,
        group: "Work Logs",
      },
      {
        name: "Bonus",
        path: "/payroll/bonus",
        component: GTBonusPage,
        group: "Add-Ons",
      },
      {
        name: "Others (Advance)",
        path: "/payroll/others-advance",
        component: GTOthersAdvancePage,
        group: "Add-Ons",
      },
      {
        name: "Others (Kerja Luar OT)",
        path: "/payroll/others",
        component: GTOthersKerjaLuarOtPage,
        group: "Add-Ons",
      },
      {
        name: "Mid-month Payroll",
        path: "/payroll/mid-month",
        component: GTMidMonthPayrollPage,
        group: "Add-Ons",
      },
      {
        name: "Pinjam",
        path: "/payroll/pinjam",
        component: GTPinjamListPage,
        group: "Add-Ons",
      },
      {
        name: "Employee Pay Rates",
        path: "/payroll/pay-rates",
        component: GTPayRatesPage,
        group: "Payroll",
      },
      {
        name: "Payroll Settings",
        path: "/payroll/settings",
        component: PayrollRulesPage,
        group: "Payroll",
      },
    ],
  },
  {
    name: "Sales",
    icon: IconFileInvoice,
    subItems: [
      {
        name: "Invoices",
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
        path: "/payments",
        component: GreenTargetPaymentPage,
      },
      {
        name: "Documents",
        path: "/adjustment-docs",
        component: GTAdjustmentDocsListPage,
        subItems: [
          {
            name: "Create Adjustment Document",
            path: "/adjustment-docs/new",
            component: GTAdjustmentDocsFormPage,
          },
          {
            name: "New Credit Note",
            path: "/adjustment-docs/new?type=credit",
            showInPopover: true,
          },
          {
            name: "New Debit Note",
            path: "/adjustment-docs/new?type=debit",
            showInPopover: true,
          },
          {
            name: "New Refund Note",
            path: "/adjustment-docs/new?type=refund",
            showInPopover: true,
          },
          {
            name: "Adjustment Document Details",
            path: "/adjustment-docs/:id",
            component: GTAdjustmentDocsDetailsPage,
          },
        ],
      },
    ],
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
        name: "Rental Details",
        path: "/rentals/:id",
        component: GreenTargetRentalDetailsPage,
      },
      {
        name: "Edit Rental",
        path: "/rentals/:id/edit",
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
