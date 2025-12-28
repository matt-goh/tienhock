// src/pages/TienHockSidebarData.tsx
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

// Payroll related imports
import DailyLogListPage from "./Payroll/DailyLogListPage";
import DailyLogEntryPage from "./Payroll/DailyLogEntryPage";
import DailyLogDetailsPage from "./Payroll/DailyLogDetailsPage";
import DailyLogEditPage from "./Payroll/DailyLogEditPage";
import MonthlyLogListPage from "./Payroll/MonthlyLogListPage";
import MonthlyLogEntryPage from "./Payroll/MonthlyLogEntryPage";
import MonthlyLogDetailsPage from "./Payroll/MonthlyLogDetailsPage";
import MonthlyLogEditPage from "./Payroll/MonthlyLogEditPage";
import CutiManagementPage from "./Payroll/CutiManagementPage";
import ContributionRatesPage from "./Payroll/ContributionRatesPage";
import MonthlyPayrollDetailsPage from "./Payroll/MonthlyPayrollDetailsPage";
import PayrollProcessingPage from "./Payroll/PayrollProcessingPage";
import EmployeePayrollDetailsPage from "./Payroll/EmployeePayrollDetailsPage";
import MidMonthPayrollPage from "./Payroll/MidMonthPayrollPage";
import IncentivesPage from "./Payroll/IncentivesPage";
import PinjamListPage from "./Payroll/PinjamListPage";
import SalaryReportPage from "./Payroll/SalaryReportPage";
import ECarumanPage from "./Payroll/ECarumanPage";

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

// Function to generate payroll subitems for each job type
const generatePayrollSubItems = (): SidebarItem[] => {
  const payrollSubItems: SidebarItem[] = [];

  // Add Monthly Payrolls
  payrollSubItems.push({
    name: "Monthly Payrolls",
    path: "/payroll/monthly-payrolls",
    component: MonthlyPayrollDetailsPage,
    subItems: [
      {
        name: "Process Payroll",
        path: "/payroll/monthly-payrolls/:id/process",
        component: PayrollProcessingPage,
      },
      {
        name: "Employee Payroll Details",
        path: "/payroll/employee-payroll/:id",
        component: EmployeePayrollDetailsPage,
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
    } else {
      // Daily job routes (MEE, BIHUN, BOILER, SALESMAN)
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
    name: "Incentives",
    path: "/payroll/incentives",
    component: IncentivesPage,
  });

  payrollSubItems.push({
    name: "Pinjam",
    path: "/payroll/pinjam",
    component: PinjamListPage,
  });

  return payrollSubItems;
};

export const TienHockSidebarData: SidebarItem[] = [
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
            name: "Edit Entry",
            path: "/accounting/journal-entries/:id",
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
        name: "Sales Summary",
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
        component: () => (
          <BasicPage
            title="Location Catalogue"
            apiEndpoint="locations"
            tableKey="catalogueLocation"
          />
        ),
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
