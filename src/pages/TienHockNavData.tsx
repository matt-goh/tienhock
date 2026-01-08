// src/pages/TienHockNavData.tsx
import {
  IconBookmark,
  IconFileInvoice,
  IconListDetails,
  IconUserDollar,
  IconReportMoney,
  IconPackage,
} from "@tabler/icons-react";
import { SidebarItem } from "./pagesRoute";
import { JOB_CONFIGS } from "../configs/payrollJobConfigs";

// Accounting related imports
import DebtorsReportPage from "./Accounting/DebtorsReportPage";
import AccountCodeListPage from "./Accounting/AccountCodeListPage";
import AccountCodeFormPage from "./Accounting/AccountCodeFormPage";
import JournalEntryListPage from "./Accounting/JournalEntryListPage";
import JournalEntryPage from "./Accounting/JournalEntryPage";
import JournalDetailsPage from "./Accounting/JournalDetailsPage";
import VoucherGeneratorPage from "./Accounting/VoucherGeneratorPage";

// Accounting - Location Mappings
import LocationAccountMappingsPage from "./Accounting/LocationAccountMappingsPage";

// Invoice related imports
import InvoiceListPage from "./Invoice/InvoiceListPage";
import InvoiceFormPage from "./Invoice/InvoiceFormPage";
import InvoiceDetailsPage from "./Invoice/InvoiceDetailsPage";
import PaymentPage from "./Payments/PaymentPage";

// Sales related imports
import SalesSummaryPage from "./Sales/SalesSummaryPage";

// Stock related imports
import ProductionEntryPage from "./Stock/ProductionEntryPage";
import StockMovementPage from "./Stock/StockMovementPage";
import StockAdjustmentEntryPage from "./Stock/StockAdjustmentEntryPage";

// Payroll - DailyLog
import DailyLogListPage from "./Payroll/DailyLog/DailyLogListPage";
import DailyLogEntryPage from "./Payroll/DailyLog/DailyLogEntryPage";
import DailyLogDetailsPage from "./Payroll/DailyLog/DailyLogDetailsPage";
import DailyLogEditPage from "./Payroll/DailyLog/DailyLogEditPage";
// Payroll - DailyLog (Salesman-specific)
import DailyLogSalesmanEntryPage from "./Payroll/DailyLog/DailyLogSalesmanEntryPage";
import DailyLogSalesmanEditPage from "./Payroll/DailyLog/DailyLogSalesmanEditPage";

// Payroll - MonthlyLog
import MonthlyLogListPage from "./Payroll/MonthlyLog/MonthlyLogListPage";
import MonthlyLogEntryPage from "./Payroll/MonthlyLog/MonthlyLogEntryPage";
import MonthlyLogDetailsPage from "./Payroll/MonthlyLog/MonthlyLogDetailsPage";
import MonthlyLogEditPage from "./Payroll/MonthlyLog/MonthlyLogEditPage";

// Payroll - Leave
import CutiManagementPage from "./Payroll/Leave/CutiManagementPage";

// Payroll - Statutory
import ContributionRatesPage from "./Payroll/Statutory/ContributionRatesPage";
import ECarumanPage from "./Payroll/Statutory/ECarumanPage";

// Payroll - AddOn
import CommissionPage from "./Payroll/AddOn/CommissionPage";
import BonusPage from "./Payroll/AddOn/BonusPage";
import PinjamListPage from "./Payroll/AddOn/PinjamListPage";
import MidMonthPayrollPage from "./Payroll/AddOn/MidMonthPayrollPage";

// Payroll - Root
import PayrollPage from "./Payroll/PayrollPage";
import PayrollDetailsPage from "./Payroll/PayrollDetailsPage";
import SalaryReportPage from "./Payroll/SalaryReportPage";

// Catalogue related imports
// Staff
import StaffPage from "./Catalogue/StaffPage";
import StaffAddPage from "./Catalogue/StaffAddPage";
import StaffFormPage from "./Catalogue/StaffFormPage";
import StaffRecords from "./Catalogue/StaffRecords";

// Customer
import CustomerPage from "./Catalogue/CustomerPage";
import CustomerAddPage from "./Catalogue/CustomerAddPage";
import CustomerFormPage from "./Catalogue/CustomerFormPage";

// Other catalogues
import PayCodePage from "./Catalogue/PayCodePage";
import ProductPage from "./Catalogue/ProductPage";
import JobPage from "./Catalogue/JobPage";
import JobCategoryPage from "./Catalogue/JobCategoryPage";
import TaxPage from "./Catalogue/TaxPage";
import BasicPage from "./Catalogue/BasicPage";
import LocationPage from "./Catalogue/LocationPage";

// Function to generate payroll subitems for each job type
const generatePayrollSubItems = (): SidebarItem[] => {
  const payrollSubItems: SidebarItem[] = [];

  // Add Monthly Payrolls
  payrollSubItems.push({
    name: "Payrolls",
    path: "/payroll/monthly-payrolls",
    component: PayrollPage,
    subItems: [
      {
        name: "Employee Payroll Details",
        path: "/payroll/employee-payroll/:id",
        component: PayrollDetailsPage,
      },
    ],
  });

  payrollSubItems.push({
    name: "Salary Report",
    path: "/payroll/salary-report",
    component: SalaryReportPage,
  });

  payrollSubItems.push({
    name: "e-Caruman",
    path: "/payroll/e-caruman",
    component: ECarumanPage,
  });

  // Add each production type dynamically
  Object.values(JOB_CONFIGS).forEach((jobConfig) => {
    const jobTypeLower = jobConfig.id.toLowerCase().replace("_", "-");
    const isMonthly = jobConfig.entryMode === "monthly";

    if (isMonthly) {
      // Monthly job routes (MAINTENANCE, OFFICE, TUKANG_SAPU)
      payrollSubItems.push({
        name: jobConfig.name,
        path: `/payroll/${jobTypeLower}-monthly`,
        component: (props: any) => (
          <MonthlyLogListPage jobType={jobConfig.id} {...props} />
        ),
        subItems: [
          {
            name: `New ${jobConfig.name} Entry`,
            path: `/payroll/${jobTypeLower}-monthly-entry`,
            component: (props: any) => (
              <MonthlyLogEntryPage jobType={jobConfig.id} {...props} />
            ),
            showInPopover: true,
          },
          {
            name: "View Log",
            path: `/payroll/${jobTypeLower}-monthly/:id`,
            component: (props: any) => (
              <MonthlyLogDetailsPage jobType={jobConfig.id} {...props} />
            ),
          },
          {
            name: "Edit Log",
            path: `/payroll/${jobTypeLower}-monthly/:id/edit`,
            component: (props: any) => (
              <MonthlyLogEditPage jobType={jobConfig.id} {...props} />
            ),
          },
        ],
      });
    } else if (jobConfig.id === "SALESMAN") {
      // SALESMAN-specific routes using dedicated pages
      payrollSubItems.push({
        name: jobConfig.name,
        path: `/payroll/${jobTypeLower}-production`,
        component: (props: any) => (
          <DailyLogListPage jobType={jobConfig.id} {...props} />
        ),
        subItems: [
          {
            name: `New ${jobConfig.name} Entry`,
            path: `/payroll/${jobTypeLower}-entry`,
            component: (props: any) => (
              <DailyLogSalesmanEntryPage {...props} />
            ),
            showInPopover: true,
          },
          {
            name: "View Log",
            path: `/payroll/${jobTypeLower}-production/:id`,
            component: (props: any) => (
              <DailyLogDetailsPage jobType={jobConfig.id} {...props} />
            ),
          },
          {
            name: "Edit Log",
            path: `/payroll/${jobTypeLower}-production/:id/edit`,
            component: (props: any) => (
              <DailyLogSalesmanEditPage {...props} />
            ),
          },
        ],
      });
    } else {
      // Daily job routes (MEE, BIHUN, BOILER)
      payrollSubItems.push({
        name: jobConfig.name,
        path: `/payroll/${jobTypeLower}-production`,
        component: (props: any) => (
          <DailyLogListPage jobType={jobConfig.id} {...props} />
        ),
        subItems: [
          {
            name: `New ${jobConfig.name} Entry`,
            path: `/payroll/${jobTypeLower}-entry`,
            component: (props: any) => (
              <DailyLogEntryPage jobType={jobConfig.id} {...props} />
            ),
            showInPopover: true,
          },
          {
            name: "View Log",
            path: `/payroll/${jobTypeLower}-production/:id`,
            component: (props: any) => (
              <DailyLogDetailsPage jobType={jobConfig.id} {...props} />
            ),
          },
          {
            name: "Edit Log",
            path: `/payroll/${jobTypeLower}-production/:id/edit`,
            component: (props: any) => (
              <DailyLogEditPage jobType={jobConfig.id} {...props} />
            ),
          },
        ],
      });
    }
  });

  payrollSubItems.push({
    name: "Mid-month Pay",
    path: "/payroll/mid-month-payrolls",
    component: MidMonthPayrollPage,
  });

  payrollSubItems.push({
    name: "Commission",
    path: "/payroll/commission",
    component: CommissionPage,
  });

  payrollSubItems.push({
    name: "Bonus",
    path: "/payroll/bonus",
    component: BonusPage,
  });

  payrollSubItems.push({
    name: "Pinjam",
    path: "/payroll/pinjam",
    component: PinjamListPage,
  });

  return payrollSubItems;
};

export const TienHockNavData: SidebarItem[] = [
  {
    name: "Bookmarks",
    icon: IconBookmark,
    subItems: [],
    defaultOpen: true,
  },
  {
    name: "Accounting",
    icon: IconReportMoney,
    subItems: [
      {
        name: "Journal Entries",
        path: "/accounting/journal-entries",
        component: JournalEntryListPage,
        subItems: [
          {
            name: "New Entry",
            path: "/accounting/journal-entries/new",
            component: JournalEntryPage,
            showInPopover: true,
          },
          {
            name: "View Entry",
            path: "/accounting/journal-entries/:id",
            component: JournalDetailsPage,
          },
          {
            name: "Edit Entry",
            path: "/accounting/journal-entries/:id/edit",
            component: JournalEntryPage,
          },
        ],
      },
      {
        name: "Chart of Accounts",
        path: "/accounting/account-codes",
        component: AccountCodeListPage,
        subItems: [
          {
            name: "New Account",
            path: "/accounting/account-codes/new",
            component: AccountCodeFormPage,
            showInPopover: true,
          },
          {
            name: "Edit Account",
            path: "/accounting/account-codes/:code",
            component: AccountCodeFormPage,
          },
        ],
      },
      {
        name: "Debtors",
        path: "/sales/debtors",
        component: DebtorsReportPage,
      },
      {
        name: "Voucher Generator",
        path: "/accounting/voucher-generator",
        component: VoucherGeneratorPage,
      },
      {
        name: "Account Mappings",
        path: "/accounting/location-account-mappings",
        component: LocationAccountMappingsPage,
      },
    ],
  },
  {
    name: "Payroll",
    icon: IconUserDollar,
    subItems: generatePayrollSubItems(),
  },
  {
    name: "Sales",
    icon: IconFileInvoice,
    subItems: [
      {
        name: "Invoice",
        path: "/sales/invoice",
        component: InvoiceListPage,
        subItems: [
          // Route for creating a new invoice
          {
            name: "Create New Invoice",
            path: "/sales/invoice/new",
            component: InvoiceFormPage,
            showInPopover: true,
          },
          // Route for viewing an existing invoice
          {
            name: "Invoice Details",
            path: "/sales/invoice/:id",
            component: InvoiceDetailsPage,
          },
        ],
      },
      {
        name: "Summary",
        path: "/sales/summary",
        component: SalesSummaryPage,
      },
      {
        name: "Payments",
        path: "/sales/payments",
        component: PaymentPage,
      },
    ],
  },
  {
    name: "Stock",
    icon: IconPackage,
    subItems: [
      {
        name: "Stock Movement",
        path: "/stock/movement",
        component: StockMovementPage,
      },
      {
        name: "Production Entry",
        path: "/stock/production",
        component: ProductionEntryPage,
      },
      {
        name: "Stock Adjustments",
        path: "/stock/adjustments",
        component: StockAdjustmentEntryPage,
      },
    ],
  },
  {
    name: "Catalogue",
    icon: IconListDetails,
    subItems: [
      {
        name: "Staff",
        path: "/catalogue/staff",
        component: StaffPage,
        subItems: [
          {
            name: "New Staff",
            path: "/catalogue/staff/new",
            component: StaffAddPage,
            showInPopover: true,
          },
          {
            name: "Staff Records",
            path: "/catalogue/staff/records",
            component: StaffRecords,
          },
          {
            name: "Staff Edit",
            path: "/catalogue/staff/:id",
            component: StaffFormPage,
          },
        ],
      },
      {
        name: "Customer",
        path: "/catalogue/customer",
        component: CustomerPage,
        subItems: [
          {
            name: "New Customer",
            path: "/catalogue/customer/new",
            component: CustomerAddPage,
            showInPopover: true,
          },
          {
            name: "Staff Edit",
            path: "/catalogue/customer/:id",
            component: CustomerFormPage,
          },
        ],
      },
      {
        name: "Product",
        path: "/catalogue/product",
        component: ProductPage,
      },
      {
        name: "Job",
        path: "/catalogue/job",
        component: JobPage,
      },
      {
        name: "Pay Codes",
        path: "/catalogue/pay-codes",
        component: PayCodePage,
      },
      {
        name: "Cuti Management",
        path: "/catalogue/cuti-management",
        component: CutiManagementPage,
      },
      {
        name: "Contribution Rates",
        path: "/catalogue/contribution-rates",
        component: ContributionRatesPage,
      },
      {
        name: "Job Category",
        path: "/catalogue/job_category",
        component: JobCategoryPage,
      },
      {
        name: "Section",
        path: "/catalogue/section",
        component: () => (
          <BasicPage
            title="Section Catalogue"
            apiEndpoint="sections"
            tableKey="catalogueSection"
          />
        ),
      },
      {
        name: "Location",
        path: "/catalogue/location",
        component: LocationPage,
      },
      {
        name: "Bank",
        path: "/catalogue/bank",
        component: () => (
          <BasicPage
            title="Bank Catalogue"
            apiEndpoint="banks"
            tableKey="catalogueBank"
          />
        ),
      },
      {
        name: "Tax",
        path: "/catalogue/tax",
        component: TaxPage,
      },
      {
        name: "Nationality",
        path: "/catalogue/nationality",
        component: () => (
          <BasicPage
            title="Nationality Catalogue"
            apiEndpoint="nationalities"
            tableKey="catalogueNationality"
          />
        ),
      },
      {
        name: "Race",
        path: "/catalogue/race",
        component: () => (
          <BasicPage
            title="Race Catalogue"
            apiEndpoint="races"
            tableKey="catalogueRace"
          />
        ),
      },
      {
        name: "Agama",
        path: "/catalogue/agama",
        component: () => (
          <BasicPage
            title="Agama Catalogue"
            apiEndpoint="agama"
            tableKey="catalogueAgama"
          />
        ),
      },
    ],
  },
];
